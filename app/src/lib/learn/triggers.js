/**
 * triggers.js — triggered-ability detection + resolution (Phase-7 PR-5).
 *
 * Leaf module: imports ONLY gameState reads, so gameEngine/combat can import it
 * without a cycle (resolvers.js imports applyTriggerEffect from here in PR-6, so
 * this file must never import resolvers.js back). Detects triggered abilities
 * from a card's oracle text (the When/Whenever/At grammar, CR 603.1), matches
 * them to game events, and applies a small, FAIL-SAFE Phase-1 effect vocabulary
 * (gain/lose life, draw, damage-to-each-opponent). Anything it doesn't recognize
 * yields effect:null → the engine resolves it through the no-op/Arbiter path,
 * never a fabricated effect (CLAUDE.md §1.2).
 *
 * PR-5 ships detection + matching + application, all unit-tested, but NOTHING is
 * enqueued in a real game yet — the ETB/dies/step/attack hooks that call
 * triggersForEvent + enqueueTrigger land in PR-6..8.
 */

import {
  loseLife,
  gainLife,
  drawCards,
  opponentsOf,
  findPermanent,
  logEvent,
} from "./gameState.js";

const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
function parseCount(word) {
  if (word == null) return 1;
  const w = String(word).toLowerCase();
  return NUM_WORDS[w] ?? (parseInt(w, 10) || 1);
}
function oracleOf(card) {
  return String(card?.oracle || card?.oracle_text || "");
}
function typeStr(card) {
  return String(card?.type || card?.type_line || "");
}
function isCreaturePerm(perm) {
  return /Creature/.test(typeStr(perm?.card));
}

// ─── Detection ────────────────────────────────────────────────────────────────

/**
 * Is `sentence` a FOLLOW-UP that belongs to the trigger just matched (vs a separate ability)? A
 * triggered ability's WHOLE effect lives on ONE oracle line — "each opponent loses 2 life. You gain
 * 2 life and draw a card." (Shroudstomper), "create a 0/0 token. Put a +1/+1 counter on it."
 * (Recon Craft Theta), "mill a card. If a land card was milled this way, you gain 2 life." (Loafing
 * Giant) — while DISTINCT abilities are newline-delimited. So on the SAME line, every sentence after
 * the trigger's first IS part of its effect; the caller walks only up to the first newline. The
 * sole same-line sentences that are NOT this trigger's effect are a SECOND trigger (When/Whenever/At)
 * or an activated ability (`{cost}: …`), which we exclude here. Appending the whole effect lets the
 * all-or-nothing parser see it all: a modeled follow-up resolves too; an unmodeled one drops the
 * WHOLE program to low → Arbiter. Never a partial (CR-faithful: a trigger does all of its effect or,
 * when we can't model it, none of it — routed to the Arbiter).
 */
function isFollowupSentence(sentence) {
  const t = String(sentence).trim().toLowerCase();
  if (!t) return false;
  if (/^(when|whenever|at)\b/.test(t)) return false; // a SECOND trigger, not this one's effect
  if (t.includes(":")) return false;                  // an activated ability
  return true;                                         // any other same-line sentence continues the effect
}

/**
 * Split "<condition>, <effect>" (the text after the leading keyword, sans the
 * trailing period) into its parts, peeling off an "if <cond>," intervening
 * clause (CR 603.4) when present.
 */
function splitTriggerSentence(inner) {
  const firstComma = inner.indexOf(",");
  if (firstComma === -1) return null;
  const condition = inner.slice(0, firstComma).trim();
  let rest = inner.slice(firstComma + 1).trim();
  let interveningIf = null;
  if (/^if\b/i.test(rest)) {
    const nextComma = rest.indexOf(",");
    if (nextComma !== -1) {
      interveningIf = rest.slice(0, nextComma).replace(/^if\s+/i, "").trim();
      rest = rest.slice(nextComma + 1).trim();
    }
  }
  return { condition, effectClause: rest, interveningIf };
}

/** The subject phrase before an event verb ("a creature", "another creature you control"). */
function subjectBefore(condition, verb) {
  return String(condition).split(new RegExp(`\\b${verb}\\b`))[0].trim();
}

/**
 * Map an etb/dies subject phrase to a creature-scope `scopeMatches` ENFORCES, or null. Only the
 * shapes the matcher can faithfully restrict are modeled — bare ("a creature" / "another
 * creature") + the controller restriction ("you control" / "an opponent controls" / "you don't
 * control"). A subject carrying anything else (a keyword/type/power filter, "named", "token",
 * "nontoken") returns null → the trigger is left UNDETECTED → safe no-op (never an over-fire on a
 * restriction we can't check, CLAUDE.md §1.2). "another … an opponent controls" === the opponent
 * scope (an opponent's creature is never the source, so "another" is redundant there).
 */
function creatureSubjectScope(subj) {
  switch (subj) {
    case "a creature": return "eachCreature";
    case "another creature": return "eachOtherCreature";
    case "a creature you control": return "creatureYouControl";
    case "another creature you control": return "otherCreatureYouControl";
    case "a creature an opponent controls":
    case "another creature an opponent controls":
    case "a creature you don't control": return "creatureOpponentControls";
    default: return null;
  }
}

/**
 * Classify a trigger condition into { event, scope, whose } or null. selfRef is
 * "this <permanent>" or the card's own name. The CR 603.6d static guard makes
 * "enters tapped / enters with / as ~ enters" NOT an etb trigger.
 */
function classifyCondition(condRaw, cardName) {
  const c = condRaw.toLowerCase().trim();
  const nameL = String(cardName || "").toLowerCase();
  const selfRef = /\bthis\b/.test(c) || (nameL && c.includes(nameL));

  // ===== COMPOUND self-event guard (CREED, CLAUDE.md §1.2) ===== A condition that names TWO trigger
  // events — "enters or leaves the battlefield" (Brandywine Farmer), "enters or dies" (Vinereap Mentor),
  // "enters or attacks" (Grave Titan — makes its Zombies on ETB only, never on attack), "enters or is put
  // into a graveyard" (Ichor Wellspring / Servo Schematic — the artifact-recursion family), or an embedded
  // second when-clause "dies and when you discard this card" (Bartered Cow) — would be TRUNCATED by the
  // single-event branches below to just the FIRST verb, silently DROPPING the other half (the trigger
  // would fire on only one of the two events — a confident WRONG partial). Until compound trigger events
  // are modeled, leave it UNDETECTED: the trigger-sentence count then mismatches in
  // allTriggerSentencesModeled and the whole card routes to the Arbiter (a SAFE false-negative), mirroring
  // the attacks-or-blocks / becomes-blocked guards below. FIX-TRIG-COMPOUND (Rod QA #1): the original tally
  // counted only enters/dies/leaves, so "enters or attacks" (Grave Titan) and "enters or is put into a
  // graveyard" slipped through (eventVerbs==1) — attacks/blocks/put-into-graveyard are now counted too. A
  // single-event "attacks"/"blocks"/etc. stays at eventVerbs==1 and resolves normally below.
  const eventVerbs = [/\benters\b/, /\bdies\b/, /leaves the battlefield/, /\battacks\b/, /\bblocks\b/, /put into a graveyard/]
    .filter((re) => re.test(c)).length;
  if (eventVerbs >= 2) return null;
  if (/\b(?:and|or)\s+when(?:ever)?\b/i.test(c)) return null; // an embedded second trigger clause
  // ===== COMPOUND-SUBJECT guard (CREED, CLAUDE.md §1.2; Rod QA #1 FIX-TRIG-CONDITION, the "or another"
  // sub-case) ===== A single-event condition that names a SECOND subject after the self — "this creature
  // OR ANOTHER creature you control dies/enters" (Butcher of Malakir, Zulaport Cutthroat, Cruel Celebrant)
  // — is read as a BARE SELF trigger by the selfRef branches below (selfRef matches "this"), silently
  // DROPPING the "or another creature you control" half so the ability fires ONLY on the source's own
  // event — a confident WRONG partial. Leave it UNDETECTED → the whole card routes to the Arbiter (a SAFE
  // false-negative), mirroring the compound-event guard above. Exposed by the ED-2 each-player/each-opponent
  // edict slice (the sacrifice EFFECT became modeled, flipping these toward native). The BROADER
  // FIX-TRIG-CONDITION sub-case (scope-inexpressible restrictions) remains Rod/Erin's lane.
  if (selfRef && /\bor another\b/.test(c)) return null;

  // ===== FIX-TRIG-CONDITION (Rod QA #1, CREED CLAUDE.md §1.2) ===== Reject conditions whose SUBJECT or
  // RESTRICTION the scope system can't faithfully represent — the single-event branches below would map
  // them to a bare self / controller scope and silently DROP the restriction or a second subject, then
  // over- or under-fire (a confident WRONG partial). All route to the Arbiter (safe false-negative):
  //  - an alternate 2nd subject — "this/<name> OR ANOTHER creature you control dies/enters" (Zulaport
  //    Cutthroat, Cruel Celebrant, Rotlung Reanimator, Headless Rider, the Rally tribe) — only the leading
  //    subject is modeled, so the "or another …" half would be dropped (drains/recurs only on self-death).
  //  - "dealt damage by <…>" (Sengir Vampire / Sengir Bats / Vampiric Dragon / Blood Cultist) — a
  //    restriction the broad selfRef misreads as a bare self-dies (fires when the SOURCE dies, never works).
  //  - a scope-inexpressible restriction: "with <…>" (Tenured Inkcaster "with a +1/+1 counter on it"),
  //    "while <…>" (Seasoned Warrenguard), "the player with <…>" (Preacher of the Schism), "named <…>",
  //    "during <…>" (Mongrel Pack "dies during combat"). The modeled clean forms (this/<name>/a-creature-
  //    you-control + bare enters/dies/attacks/blocks, upkeep/end/draw step, cast-a-spell) carry NONE of
  //    these tokens, so this is purely additive (confirmed collateral-free by the corpus A/B sweep).
  if (/\bor another\b/.test(c)) return null;
  if (/\bdealt damage by\b/.test(c)) return null;
  if (/\bthe player with\b/.test(c)) return null;
  if (/\b(?:with|while|during|named)\b/.test(c)) return null;

  // The subject is mapped ONLY to a scope scopeMatches can ENFORCE (bare, or the controller
  // restriction); any other restriction (keyword/type/power/named/token) → null → UNDETECTED, so
  // we never over-fire on a restriction we can't check (CLAUDE.md §1.2). `subjectBefore` is the
  // exact text before the event verb.
  if (/\benters\b/.test(c) && !/\benters (the battlefield )?(tapped|with|as)\b/.test(c)) {
    if (selfRef) return { event: "etb", scope: "self", whose: "any" };
    const scope = creatureSubjectScope(subjectBefore(c, "enters"));
    if (scope) return { event: "etb", scope, whose: "any" };
  }
  if (/\bdies\b/.test(c)) {
    if (selfRef) return { event: "dies", scope: "self", whose: "any" };
    const scope = creatureSubjectScope(subjectBefore(c, "dies"));
    if (scope) return { event: "dies", scope, whose: "any" };
  }
  // "Leaves the battlefield" (LTB) is intentionally NOT detected: the engine fires only etb / dies /
  // step / attacks events (triggersForEvent has no "ltb" caller), so an ltb trigger detected here would
  // be classified native yet NEVER fire — a false positive (the whole ability silently does nothing,
  // e.g. City Pigeon / Featherbrained Filcher's "When this leaves the battlefield, create a Food token").
  // Leave it UNDETECTED → the card routes to the Arbiter (safe) until the engine fires LTB on every
  // zone-change (dies + exile + bounce). NOTE: the self-sac fail-safe (abilities.sacrificeDropsTrigger)
  // independently detects "leaves the battlefield" to keep self-sac costs safe — that path is unaffected.

  if (/beginning of (your|each) (upkeep|end step|draw step)/.test(c)) {
    const whose = /\beach\b/.test(c) ? "any" : "yours";
    const event = /end step/.test(c) ? "endStep" : /draw step/.test(c) ? "draw" : "upkeep";
    return { event, scope: "you", whose };
  }
  // ===== EACH-PLAYER (compound-combat-trigger guard) ===== A condition that names BOTH "attacks" and
  // "blocks" ("Whenever this creature attacks or blocks …" — Howling Golem, Burning Sun Cavalry) is a
  // COMPOUND combat event. The single-verb branches below model only ONE event, so detecting it as just
  // "attacks" would silently DROP the "blocks" half — the trigger would fire on attack only, a confident
  // WRONG partial (CLAUDE.md §1.2). Until compound combat events are modeled, leave it UNDETECTED: the
  // card's trigger-sentence count then mismatches in allTriggerSentencesModeled and the whole card routes
  // to the Arbiter (a SAFE false-negative). Exposed by the each-player draw slice (Howling Golem's
  // "each player draws a card" became modeled); the guard also retires the pre-existing Burning Sun
  // Cavalry false-positive. (The "blocks or becomes blocked" compound is a separate, unexposed case.)
  if (/\battacks\b/.test(c) && /\bblocks\b/.test(c)) return null;
  if (/\battacks\b/.test(c)) {
    if (selfRef) return { event: "attacks", scope: "self", whose: "any" };
    if (/a creature you control/.test(c)) return { event: "attacks", scope: "creatureYouControl", whose: "any" };
  }
  // ===== BLOCKS compound / restricted-block guard (CREED, CLAUDE.md §1.2) ===== The only modeled block
  // trigger is the BARE self-block ("Whenever this creature blocks, …"). A COMPOUND condition that also
  // names "becomes blocked" (Serra Inquisitors / Raging Gorilla / Assembled Alphas — "blocks or becomes
  // blocked by one or more X creatures") names a SECOND event; a RESTRICTED block ("blocks a creature
  // with flying" — Snarespinner / Skystinger; "blocks … by one or more <type/color> creatures") carries
  // a restriction the engine can't enforce. The bare-blocks branch below would DROP both and fire the
  // (modeled) self-pump on ANY plain block — a confident WRONG partial. Leave any non-bare self-block
  // UNDETECTED → Arbiter, mirroring the attacks-or-blocks guard. A self-pump on a plain block stays native.
  if (/\bbecomes blocked\b/.test(c)) return null;
  if (/\bblocks\b/.test(c) && selfRef && !/\bblocks\s*$/.test(c.trim())) return null;
  if (/\bblocks\b/.test(c) && selfRef) return { event: "blocks", scope: "self", whose: "any" };

  // Combat-damage-to-a-player (CR 510.2 — combat damage dealt). "Whenever <self> deals combat damage to a player" (self) /
  // "Whenever a creature you control deals combat damage to a player" (creatureYouControl). BARE form
  // only — END-anchored on "a player" so a qualified variant ("…to a player or planeswalker", "…to a
  // creature", "one or more creatures you control deal…", or any trailing rider) stays UNDETECTED →
  // Arbiter (a SAFE false-negative). combatResolution fires it off the real per-attacker player-damage.
  if (/\bdeals combat damage to a player$/.test(c)) {
    if (selfRef) return { event: "combatDamageToPlayer", scope: "self", whose: "any" };
    if (/a creature you control/.test(c)) return { event: "combatDamageToPlayer", scope: "creatureYouControl", whose: "any" };
  }

  // Cast-spell triggers (CR 603.2, the spell-cast event). The WHOLE condition must reduce
  // to "(you|an opponent|a player|each player) cast(s) a[n] <filter> spell" — ANCHORED, so a
  // trailing rider ("… spell that targets …", "… spell from your graveyard", "… spell during
  // your turn", "… your first/second spell each turn") leaves residue and is NOT detected
  // (→ Arbiter), never an over-fire. `whose` = which caster; `spellFilter` = which types —
  // only the modeled filters (any / instant-or-sorcery / creature / noncreature) classify; a
  // color/subtype/historic/timing filter returns null → undetected. ("an?" greedily takes the
  // "n" of "an" but stops at the space of a bare "a".)
  const castM = c.match(/^(you|an opponent|a player|each player) casts?\s+(?:an?|your|its|their)?\s*([a-z- ]*?)\s*spell$/);
  if (castM) {
    const whose = /you/.test(castM[1]) ? "you" : /opponent/.test(castM[1]) ? "opponent" : "any";
    const spellFilter = castSpellFilter(castM[2].trim());
    if (spellFilter) return { event: "cast", scope: "castWatcher", whose, spellFilter };
  }
  return null;
}

/** Map the words between "cast a[n]" and "spell" to a MODELED spell filter, or null. */
function castSpellFilter(text) {
  const f = String(text).trim();
  if (f === "") return "any";                                  // "casts a spell"
  if (/^(?:instant|sorcery|instant or sorcery)$/.test(f)) return "instantSorcery";
  if (f === "creature") return "creature";
  if (f === "noncreature") return "noncreature";
  return null; // color / subtype / "second" / historic / multicolored / … → unmodeled
}

/**
 * Parse a Phase-1 trigger effect clause into a TriggerEffect, or null when it's
 * outside the bounded vocabulary (→ fail-safe no-op/Arbiter, never fabricated).
 */
function parseTriggerEffect(clauseRaw) {
  const c = clauseRaw.toLowerCase().trim();
  let m = c.match(/\bdraws?\s+(a|an|one|two|three|four|five|\d+)\s+cards?\b/);
  if (m) return { kind: "draw", amount: parseCount(m[1]), who: "controller" };
  m = c.match(/each opponent loses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "eachOpponent" };
  m = c.match(/deals?\s+(\d+)\s+damage to each opponent/);
  if (m) return { kind: "damage", amount: parseInt(m[1], 10), targetType: "eachOpponent" };
  m = c.match(/\bgains?\s+(\d+)\s+life/);
  if (m) return { kind: "gainLife", amount: parseInt(m[1], 10), who: "controller" };
  m = c.match(/\bloses?\s+(\d+)\s+life/);
  if (m) return { kind: "loseLife", amount: parseInt(m[1], 10), who: "controller" };
  return null;
}

const _detectCache = new WeakMap();

/**
 * TRIG-PUMP-1 (the trigger-effect compiler pilot) — a SELF-scope trigger states the pump on its OWN
 * source with the pronoun "it": "Whenever this creature attacks, IT gets +2/+0 until end of turn"
 * (Brazen Wolves), "…, IT gains trample until end of turn" (the combat-buff family). The modeled
 * self-pump atom keys off the literal subject "this creature" (target:"self" → ctx.sourceId in the
 * parser), so the effectClause "it gets/gains … until end of turn" must be normalized "it" →
 * "this creature" for the parser to model it. This regex is the CREED guard on WHEN to do that: it
 * matches ONLY the WHOLE-clause self-pump shapes the parser accepts (pure ±P/±T, ±P/±T + keyword
 * grant, or keyword-grant only — anchored start-to-end). A rider/compound ("it gets +2/+0 until end
 * of turn. Draw a card") leaves residue past `until end of turn$` → no match → no rewrite → stays
 * LOW → Arbiter (a SAFE false-negative). It mirrors parser.js's three self-pump matchers exactly;
 * the parser still re-gates the keyword set (an unmodeled keyword → LOW), so this only GIVES the
 * parser the chance to model it — it never asserts coverage on its own.
 */
const SELF_PUMP_IT_RE = /^it (?:gets [+-]\d+\/[+-]\d+(?: and gains .+)?|gains .+) until end of turn$/i;

/**
 * All triggered abilities printed on a card, as serializable TriggerDescriptors.
 * Cached by card identity (the regex pass runs once per distinct card object).
 */
export function detectTriggers(card) {
  if (!card || typeof card !== "object") return [];
  if (_detectCache.has(card)) return _detectCache.get(card);
  const oracle = oracleOf(card);
  const out = [];
  if (oracle) {
    // Anchored at start / after a sentence boundary, like keywords.js — so a
    // mid-sentence "when" never false-matches.
    const re = /(?:^|[\n.;]\s*)(When|Whenever|At)\b\s+([^.]+)\./gi;
    let m;
    while ((m = re.exec(oracle)) !== null) {
      const inner = m[2].trim();
      const split = splitTriggerSentence(inner);
      if (!split) continue;
      const cls = classifyCondition(split.condition, card.name);
      if (!cls) continue;
      // Extend the effect with the trigger's remaining SAME-LINE sentences (reminder text stripped)
      // so the parser sees its WHOLE effect. A triggered ability's effect is one oracle line, so we
      // stop at the first newline — that avoids swallowing a separate ability on the next line. An
      // unmodeled follow-up then drops the whole program to low → Arbiter, instead of firing the
      // first effect natively and dropping the rest (a forbidden partial application).
      let effectClause = split.effectClause;
      const sameLine = oracle.slice(re.lastIndex).split("\n")[0].replace(/\([^)]*\)/g, " ");
      for (const sent of sameLine.split(/\.\s+|\.\s*$|;\s+/)) {
        const s = sent.trim();
        if (!s) continue;
        if (!isFollowupSentence(s)) break;
        effectClause += `. ${s}`;
      }
      // TRIG-PUMP-1: for a SELF-scope trigger only, normalize a leading "it" → "this creature" when
      // the WHOLE effect is the self-pump shape (SELF_PUMP_IT_RE), so the parser's self-pump atom
      // (target:"self") models it. Gated on `cls.scope === "self"`: in a NON-self trigger
      // ("Whenever a creature you control attacks, it gets…") the "it" is the OTHER triggering
      // creature, not the source — rewriting there would mis-pump the source, a forbidden false
      // positive. The whole-clause anchor leaves any rider/compound untouched (→ stays LOW → Arbiter).
      if (cls.scope === "self" && SELF_PUMP_IT_RE.test(effectClause)) {
        effectClause = effectClause.replace(/^it /i, "this creature ");
      }
      out.push({
        event: cls.event,
        scope: cls.scope,
        whose: cls.whose,
        spellFilter: cls.spellFilter, // cast triggers only (undefined otherwise)
        optional: /\bmay\b/.test(effectClause.toLowerCase()),
        interveningIf: split.interveningIf,
        effect: parseTriggerEffect(effectClause),
        // Raw effect text so the flush stage (gameEngine, which can import the parser
        // without the triggers→parser→effectAtoms→triggers cycle) can parse it into a
        // full EffectProgram. P2.8 routes the rich-parsed program through the
        // EFFECT_PROGRAM resolver; `effect` stays the small fallback.
        effectClause,
        sourceText: `${m[1]} ${inner}`,
      });
    }
  }
  _detectCache.set(card, out);
  return out;
}

/** Convenience: does this card have any trigger for the given event? */
export function hasTriggerFor(card, event) {
  return detectTriggers(card).some(d => d.event === event);
}

// ─── Matching ──────────────────────────────────────────────────────────────────

function scopeMatches(descriptor, sourcePermanent, triggeringPermanent) {
  switch (descriptor.scope) {
    case "self":
      return !triggeringPermanent || triggeringPermanent.id === sourcePermanent.id;
    case "you":
      return true; // step triggers — `whose` gates ownership
    case "eachCreature":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent);
    case "eachOtherCreature":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent);
    case "creatureYouControl":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "otherCreatureYouControl":
      return !!triggeringPermanent && triggeringPermanent.id !== sourcePermanent.id && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller === sourcePermanent.controller;
    case "creatureOpponentControls":
      return !!triggeringPermanent && isCreaturePerm(triggeringPermanent) && triggeringPermanent.controller !== sourcePermanent.controller;
    default:
      return false;
  }
}

function makePendingTrigger(descriptor, sourcePermanent, triggeringPermanent, triggeringContext) {
  const controller = sourcePermanent.controller;
  const context = {
    triggeringPermanentId: triggeringPermanent?.id,
    triggeringCardName: triggeringPermanent?.card?.name,
    triggeringController: triggeringPermanent?.controller,
    ...triggeringContext,
  };
  return {
    event: descriptor.event,
    source: { permanentId: sourcePermanent.id, cardId: sourcePermanent.card?.id, name: sourcePermanent.card?.name },
    controller,
    descriptor,
    context,
    targets: [],
    optional: descriptor.optional,
    // Serializable payload for flushTriggers -> stack. `resolver` MUST equal
    // RESOLVER_KEYS.TRIGGER_EFFECT — written as a literal so triggers.js stays a
    // leaf (resolvers.js imports applyTriggerEffect from here in PR-6).
    payload: {
      resolver: "trigger.effect",
      params: { effect: descriptor.effect, controller, targets: [], context },
    },
  };
}

/**
 * The PendingTriggers that fire for `event` from `sourcePermanent`, given the
 * object that caused the event (`triggeringPermanent`, may === source for
 * self-triggers) and any event extras (e.g. { defenderId }). Pure — returns data,
 * does not enqueue.
 */
export function triggersForEvent(state, { event, sourcePermanent, triggeringPermanent = null, triggeringContext = {} }) {
  if (!sourcePermanent?.card) return [];
  const descriptors = detectTriggers(sourcePermanent.card).filter(d => d.event === event);
  if (!descriptors.length) return [];
  const out = [];
  for (const d of descriptors) {
    if (!scopeMatches(d, sourcePermanent, triggeringPermanent)) continue;
    if (d.whose === "yours" && sourcePermanent.controller !== state.activePlayer) continue;
    out.push(makePendingTrigger(d, sourcePermanent, triggeringPermanent, triggeringContext));
  }
  return out;
}

/**
 * PW-8: an EMBLEM as a trigger SOURCE. An emblem has no battlefield permanent, but its triggered
 * abilities still fire (CR 114.2 — an emblem has the listed ability). Shaped like a permanent so
 * triggersForEvent / detectTriggers / makePendingTrigger treat it uniformly (its `card.oracle` is the
 * emblem's ability text; its `controller` scopes "you control" / "your upkeep").
 */
function emblemAsSource(emblem, controller) {
  return { id: emblem.id, controller, card: { oracle: emblem.oracle, name: "Emblem", type: "Emblem" }, isEmblem: true };
}

/** Every trigger SOURCE a player has: battlefield permanents + emblems (PW-8). */
function triggerSourcesOf(state, pid) {
  const p = state.players[pid];
  if (!p) return [];
  return [...(p.battlefield || []), ...(p.emblems || []).map((e) => emblemAsSource(e, pid))];
}

/**
 * Enqueue dies triggers for a batch of creatures that just died (CR 603.6c).
 * `dead` is destroyLethalCreatures' return — [{ id, controller, name, card }],
 * the look-back snapshot (CR 603.10a), since the permanents are already in the
 * graveyard. For each death we fire its own "when this dies" trigger plus every
 * surviving battlefield watcher ("whenever a creature dies"). Pure — appends to
 * pendingTriggers and returns new state.
 *
 * Phase-1 limitation: simultaneously-dying watchers don't see each other's
 * deaths (a dead Blood Artist won't drain off another creature that died in the
 * same batch). The common case — a death + a surviving drain — is covered.
 */
/**
 * Fire ETB ("enters the battlefield") triggers for a permanent that just entered (β-3b reanimation,
 * and reusable for any non-cast entry). `enteredPerm` is already ON the battlefield, so iterating every
 * battlefield watcher covers BOTH its own "when this enters" trigger AND others' "whenever a creature
 * enters" — mirrors enterPermanent's inline ETB loop. Pure — appends to pendingTriggers.
 */
export function checkEnterTriggers(state, enteredPerm) {
  if (!enteredPerm) return state;
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event: "etb", sourcePermanent: watcher, triggeringPermanent: enteredPerm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

export function checkDiesTriggers(state, dead) {
  if (!dead || !dead.length) return state;
  let fired = [];
  for (const d of dead) {
    if (!d?.card) continue;
    const lookBack = { id: d.id, controller: d.controller, card: d.card };
    fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: lookBack, triggeringPermanent: lookBack }));
    for (const pid of Object.keys(state.players)) {
      for (const watcher of triggerSourcesOf(state, pid)) {
        fired = fired.concat(triggersForEvent(state, { event: "dies", sourcePermanent: watcher, triggeringPermanent: lookBack }));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue step-boundary triggers (CR 603.2b) for the given event ("upkeep" /
 * "draw" / "endStep"). Scans every battlefield permanent; the descriptor's
 * `whose:"yours"` gate (applied in triggersForEvent) fires "your upkeep" only on
 * the controller's own turn while "each upkeep" fires on every turn. Pure.
 */
export function checkStepTriggers(state, event) {
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const perm of triggerSourcesOf(state, pid)) {
      fired = fired.concat(triggersForEvent(state, { event, sourcePermanent: perm }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue attack triggers (CR 508.3) for the full declared-attacker batch in
 * state.combat.attackers: each attacker's own "whenever this attacks" plus every
 * "whenever a creature you control attacks" watcher the attacking player
 * controls. Context carries the defenderId. Pure.
 */
export function checkAttackTriggers(state) {
  const attackers = state.combat?.attackers || [];
  if (!attackers.length) return state;
  let fired = [];
  for (const a of attackers) {
    const lk = findPermanent(state, a.permanentId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { defenderId: a.defender };
    // self ("this attacks") + the attacker's own "creature you control attacks"
    fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // other watchers the attacking player controls
    for (const watcher of triggerSourcesOf(state, a.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "attacks", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/**
 * Enqueue combat-damage triggers (CR 510.2) for the attackers that dealt combat damage to a PLAYER this
 * step — driven by combatResolution's `playerEvents` (kind "combat-damage-player"), so they fire exactly
 * when real damage landed on a player. Each such attacker fires its own "Whenever this creature deals
 * combat damage to a player" plus every "a creature you control deals combat damage to a player" watcher
 * the attacking player controls. Mirrors checkAttackTriggers; pure. Called BEFORE the lethal-damage SBA
 * (a trading attacker may die to the SBA, but it triggered at the damage event — CR 510.2; abilities
 * that triggered on combat damage are put on the stack after the SBA, CR 510.3a — so we capture them
 * pre-SBA while the source still resolves).
 */
export function checkCombatDamageTriggers(state, playerEvents) {
  const hits = (playerEvents || []).filter((e) => e.kind === "combat-damage-player");
  if (!hits.length) return state;
  let fired = [];
  for (const ev of hits) {
    const lk = findPermanent(state, ev.attackerId);
    if (!lk) continue;
    const attackerPerm = lk.permanent;
    const context = { damagedPlayerId: ev.defender, combatDamageAmount: ev.amount };
    // self ("this creature deals combat damage to a player")
    fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: attackerPerm, triggeringPermanent: attackerPerm, triggeringContext: context }));
    // the attacking player's "a creature you control deals combat damage to a player" watchers
    for (const watcher of triggerSourcesOf(state, ev.attackingPlayer)) {
      if (watcher.id === attackerPerm.id) continue;
      fired = fired.concat(triggersForEvent(state, { event: "combatDamageToPlayer", sourcePermanent: watcher, triggeringPermanent: attackerPerm, triggeringContext: context }));
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

/** Does the cast spell match a cast trigger's modeled spell-type filter? */
function spellMatchesFilter(filter, spellCard) {
  const t = typeStr(spellCard);
  switch (filter) {
    case "any": return true;
    case "instantSorcery": return /Instant|Sorcery/.test(t);
    case "creature": return /Creature/.test(t);
    case "noncreature": return !/Creature/.test(t);
    default: return false;
  }
}

/**
 * Enqueue cast-spell triggers (CR 603.2) when `spellCard` is cast by `casterId`. Scans
 * every battlefield permanent for a "Whenever … casts a … spell" watcher whose `whose`
 * (you / opponent / any caster) and `spellFilter` (the modeled types) match this cast,
 * and enqueues it. The trigger then rides the normal flush → stack path, so it inherits
 * the EffectProgram routing (an unmodeled effect like "untap this" stays a no-op, never
 * fabricated). Context carries the cast spell's name + type for future referential
 * effects. Pure — appends to pendingTriggers and returns new state.
 */
export function checkCastTriggers(state, { spellCard, casterId }) {
  if (!spellCard) return state;
  const context = { castSpellName: spellCard?.name, castSpellType: typeStr(spellCard) };
  let fired = [];
  for (const pid of Object.keys(state.players)) {
    for (const watcher of triggerSourcesOf(state, pid)) {
      const descriptors = detectTriggers(watcher.card).filter(d => d.event === "cast");
      for (const d of descriptors) {
        if (d.whose === "you" && casterId !== watcher.controller) continue;
        if (d.whose === "opponent" && !opponentsOf(state, watcher.controller).includes(casterId)) continue;
        if (!spellMatchesFilter(d.spellFilter, spellCard)) continue;
        fired.push(makePendingTrigger(d, watcher, null, context));
      }
    }
  }
  if (!fired.length) return state;
  return { ...state, pendingTriggers: [...(state.pendingTriggers || []), ...fired] };
}

// ─── Intervening-if (CR 603.4) ──────────────────────────────────────────────────

/**
 * Evaluate a trigger's intervening-if. Phase-1 recognizes a small condition
 * vocabulary; unknown conditions FAIL OPEN (return true) so we never fabricate a
 * "doesn't fire" outcome.
 */
export function checkInterveningIf(state, pendingTrigger) {
  const cond = pendingTrigger?.descriptor?.interveningIf;
  if (!cond) return true;
  const c = String(cond).toLowerCase();
  const player = state.players?.[pendingTrigger.controller];
  let m = c.match(/you have (\d+) or more life/);
  if (m) return (player?.life || 0) >= parseInt(m[1], 10);
  m = c.match(/you have (\d+) or (fewer|less) life/);
  if (m) return (player?.life || 0) <= parseInt(m[1], 10);
  m = c.match(/you control (\d+) or more (\w+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const re = new RegExp(m[2], "i");
    const count = (player?.battlefield || []).filter(p => re.test(typeStr(p.card))).length;
    return count >= n;
  }
  return true; // unknown → fail-open
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Apply a Phase-1 TriggerEffect on resolution. Returns new state. Mirrors
 * spellEffects.resolveSpellEffect's structure (gain/lose life, draw,
 * damage-to-each-opponent). Targeted damage triggers are Phase-2 and resolve as
 * an honest "unresolved" log, never fabricated.
 */
export function applyTriggerEffect(state, { effect, controller, targets = [] }) {
  // `context` (the look-back snapshot) is accepted by callers but unused by the
  // Phase-1 effect vocabulary; targeted/contextual effects in Phase 2 will read it.
  if (!effect) return state; // fail-safe: unrecognized → no-op
  const amt = Math.max(0, effect.amount || 0);
  let next = state;
  switch (effect.kind) {
    case "gainLife":
      if (next.players[controller]) next = gainLife(next, { playerId: controller, amount: amt });
      return logEvent(next, { kind: "trigger-effect", effect: "gainLife", controller, amount: amt });
    case "loseLife":
      if (effect.who === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: amt });
      } else if (next.players[controller]) {
        next = loseLife(next, { playerId: controller, amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect", effect: "loseLife", controller, who: effect.who, amount: amt });
    case "draw":
      if (next.players[controller]) next = drawCards(next, { playerId: controller, count: Math.max(0, effect.amount || 1) });
      return logEvent(next, { kind: "trigger-effect", effect: "draw", controller, amount: effect.amount });
    case "damage":
      if (effect.targetType === "eachOpponent") {
        for (const opp of opponentsOf(next, controller)) if (next.players[opp]) next = loseLife(next, { playerId: opp, amount: amt });
        return logEvent(next, { kind: "trigger-effect", effect: "damage", controller, targetType: "eachOpponent", amount: amt });
      }
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect, targets });
    default:
      return logEvent(next, { kind: "trigger-effect-unresolved", controller, effect });
  }
}
