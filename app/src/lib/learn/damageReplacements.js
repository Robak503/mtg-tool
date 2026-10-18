/**
 * damageReplacements.js — the reusable DAMAGE-REPLACEMENT consult (CR 614, the
 * "deals double/triple/+N instead" replacement family — Wolverine, Furnace of
 * Rath, City on Fire, Torbran, Gisela, …).
 *
 * THE SEAM (and the original deferral's real reason). Damage and life PAYMENT
 * both flow through `loseLife`. A naive "double the damage" HOOK on that sink
 * would also double life *payments* — a false positive on already-correct game
 * actions (paying Phyrexian mana, "pay N life", Sylvan Library). So this is NOT
 * a hook on `loseLife`. It is a CONSULT placed at every point where a damage
 * AMOUNT is finalized, BEFORE it is handed to loseLife / markCombatDamage /
 * addPoison / adjustLoyalty. A life payment never constructs a damage-event, so
 * it is structurally immune. (A LIFE-LOSS replacement — Bloodletter of Aclazotz — is
 * the other kind and does live in loseLife: gameState.loseLife.)
 *
 * STORAGE MODEL (MUST-FIX 1 — synthesized-on-read). A "double all damage" static
 * ability of a permanent (CR 604.1) exists exactly while that permanent
 * is on the battlefield: no registration event, no duration, and it must VANISH
 * the instant the permanent leaves. So `isDamageReplacement` SCANS the
 * battlefield for permanents whose CARD carries the parsed doubler — the same
 * synthesized-on-read path anthems/lords use (layers.collectContinuousEffects),
 * never a stored `continuousEffect`, never an ETB/LTB removal hook. The doubler
 * appears and disappears with the permanent for free. (A replacement created by a RESOLVED ability — Lightning, Army of One's
 * Stagger, CR 611.2a — is the one stored kind: `state.damageReplacementEffects`, read beside the statics, ended by
 * gameState.expireDamageReplacementEffects.)
 *
 * THE OP IS A MULTIPLIER/ADDEND, NOT A BOOLEAN. `{op:"multiply",factor:2}`, `{op:"add",addend:2}` (Torbran),
 * `{op:"preventHalfUp"}` (Gisela), `{op:"preventAllBut",floor:1}` (Temple Altisaur).
 *
 * 616.1 ORDERING. Two or more applicable replacement and prevention effects are applied in the order the AFFECTED player
 * — the player dealt the damage, or the controller of the permanent dealt it — chooses (CR 616.1, 616.1e, 616.1f). The
 * chooser here takes the order that leaves the LEAST damage (chooseOrder): a player shields themselves and their own
 * permanents. A fully prevented event leaves nothing for the rest (616.1f — "taking into account only replacement or
 * prevention effects that would now be applicable"): Torbran's ruling, "If all of the damage is prevented, Torbran's effect
 * no longer applies".
 *
 * 614.5 ONCE-PER-EVENT. A replacement applies at most once per event. The
 * applied-set is created FRESH per consult invocation (MUST-FIX 4), so a
 * double-striker — whose two combat-damage sub-steps are two separate consult
 * calls — correctly doubles in EACH step (never ×(step count) inside one call).
 *
 * Leaf module: imports only the layer/board readers and two zero-import leaves (no gameState mutation, no cycle). Pure —
 * `applyDamageReplacements` returns `{ amount, prevented }` and never mutates `state`.
 */
import { permIsEveryCreatureType, permanentIsCreature, permanentColors, permanentTypes, permanentPower } from "./layers.js"; // + permanentIsCreature (the type-line audit — a creature source is one NOW) // P·39 — the subtype filters' every-creature-type read (layers' closure never reaches this file — no cycle) // + the source's colours and types NOW and a replacement's own power (Torbran, Mechanized Warfare, Hawkeye)
import { faceUpView } from "./faceUp.js"; // THE FACE THAT IS UP (CR 712.8d) — a double-faced permanent's statics are its front face's (a zero-import leaf)
import { classTopView, classLiveCard, hasClassLevelBar } from "./classLevels.js"; // CLASS (CR 716.2a) — a level section is an ability only at that level (a zero-import leaf)
import { ABILITY_WORD_LABEL_RE } from "./effects/textNormalize.js"; // CR 207.2c ability-word labels — the single shared list (a zero-import leaf)

// ─── The replacement parser (verified oracle scope, never from memory) ─────────────────────────────────────────────────────
// Each entry: { op, scope }. The scope is taken LITERALLY from the printed sentence (MUST-FIX 2):
//   side                 "source" — the SOURCE is filtered (self / controller "you" / the host of this Equipment);
//                        "target" — the RECIPIENT is filtered (the controller as a player; Fiendish Duo's opponent; Temple
//                                   Altisaur's other Dinosaur you control); "any" — the source is any source.
//   source filters       self · controller:"you" · hostOfSelf · enteredThisTurn · sourceIsCreature · sourceHasCounter ·
//                        sourceSubtype · sourceColors (Torbran — a red source) · sourceColorsOrArtifact (Mechanized Warfare) ·
//                        excludeSelfSource (Thor — "another source") · sourceCreatureOther (Inquisitor's Flail — "another
//                        creature", not the equipped one)
//   recipient filters    targetSide:"opponent" ("an opponent or a permanent an opponent controls" — a planeswalker or a battle
//                        counts) · targetSide:"you" ("you or a permanent you control") · targetSide:"opponentPlayer" /
//                        "youPlayer" (the player alone) · targetPlayerOnly ("a player") · targetSelf ("this creature") ·
//                        targetHost ("equipped creature") · affectedOpponent · targetSubtype + excludeSelf
//   damage filters       combatOnly · noncombatOnly ("noncombat damage" — CR 120.2b, damage dealt as an effect)
//   condition            "hellbent" — "As long as you have no cards in hand, …" (Anthem of Rakdos)
// The entries are read from the permanent's CARD (its face that is up; a Class at its level) so they are synthesized-on-read
// (they vanish when the card leaves).

const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const COLOR_WORDS = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
// THE "IF … WOULD DEAL … DAMAGE" SENTENCE: the source, the damage kind, the recipient, then the result. The capitalised word in
// "a Giant source you control" / "another Dinosaur you control" is a subtype (case-sensitive: the colour words are lower case).
const IF_DAMAGE_RE = new RegExp(
  "^if (another source you control|a source you control|a source|an? (white|blue|black|red|green)( or artifact)? source you control"
  + "|a creature you control with a \\+1/\\+1 counter on it|a creature you control that entered this turn|a creature you control"
  + "|an? ([A-Z][a-z]+) source you control|this creature|equipped creature|another creature)"
  + " would deal (combat |noncombat )?damage"
  + "(?: to (an opponent or a permanent an opponent controls|a permanent or player|an opponent|you or a permanent you control|you"
  + "|this creature|a player|equipped creature|another ([A-Z][a-z]+) you control))?"
  + ", (.+)$",
);
// The restatement a "deals double that damage to …" result may carry, by recipient: it names the same recipient again.
const ECHO_FOR = {
  "": ["that permanent or player"],
  "a permanent or player": ["that permanent or player"],
  "an opponent or a permanent an opponent controls": ["that player or permanent"],
  "an opponent": ["that player"],
  "a player": ["that player"],
  you: ["you"],
  "this creature": ["this creature"],
  "equipped creature": ["equipped creature"],
};

const _parseMemo = new WeakMap();

/**
 * The static lines of a card that can carry a replacement sentence: its face that is up (a double-faced card's front), a
 * Class's text at its level (a raw Class reads its top section only — classTopView), a leveler's lines above its first LEVEL
 * band (the bands are abilities only at their level), no Room (its door state is not read here: a locked door's text is no
 * ability). ⚠️ STATIC LINES ONLY (shelf D11, 2026-09-30): a replacement sentence is a static ability of the permanent only on
 * its own line. As the EFFECT of an activated ability ("{3}{R}, {T}: If a source you control would deal damage to an opponent
 * this turn, it deals double that damage to that player instead." — Goblin Goliath) or of a trigger, it is a one-shot that
 * applies when it resolves, for its stated duration — never merely because the permanent is on the battlefield. Reminder text
 * is ignored for the colon check — a keyword's reminder may hold one.
 */
function staticSentences(cardIn) {
  let card = faceUpView(cardIn);
  if (/\bRoom\b/.test(String(card?.type ?? card?.type_line ?? ""))) return [];
  if (hasClassLevelBar(card)) card = classTopView(card);
  const lines = [];
  for (const ln of String(card?.oracle ?? card?.oracle_text ?? "").split("\n")) {
    if (/^LEVEL \d/.test(ln.trim())) break; // a leveler's bands (CR 711.2) — never read as always-on text
    if (/:\s/.test(ln.replace(/\([^)]*\)/g, "")) || /^\s*(?:when|whenever|at)\b/i.test(ln)) continue;
    lines.push(ln);
  }
  const out = [];
  for (const ln of lines) {
    for (const raw of ln.replace(/\([^)]*\)/g, " ").split(/(?<=\.)\s+/)) {
      const s = raw.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

/**
 * Read ONE sentence as a damage replacement, or null. `card` names the self ("Double all damage Wolverine would deal", "X is
 * Hawkeye's power").
 */
function readDamageSentence(sentence, card) {
  let s = sentence.replace(/\.\s*$/, "").trim();
  // A LABEL WITH NO RULES MEANING: an ability word (CR 207.2c — the shared list, effects/textNormalize.ABILITY_WORD_LABEL_RE:
  // "Hellbent — ", "Revolt — ", whose condition each carrier writes out after it) or Wolverine's flavor word (CR 207.2d —
  // "Unrivaled Lethality — "). Any other label stays and the sentence reads nothing: "Max speed —" IS a condition (CR 702.178a),
  // as is a Case's "Solved —"; a Saga's chapter numeral labels a triggered ability.
  s = s.replace(ABILITY_WORD_LABEL_RE, "").replace(/^unrivaled lethality\s*[—–]\s*/i, "");
  let condition = null;
  const hellbent = s.match(/^as long as you have no cards in hand, (.+)$/i);
  if (hellbent) { condition = "hellbent"; s = hellbent[1]; }
  const name = String(card?.name ?? "");
  const shortName = name.split(",")[0].trim(); // "Wolverine, Best There Is" → "Wolverine"
  const selfWords = [name, shortName].filter(Boolean).map(escapeRe).join("|");
  const withCond = (entry) => (entry && condition ? { ...entry, scope: { ...entry.scope, condition } } : entry);

  // ── "Double all damage <who> would deal." ──
  if (shortName && new RegExp(`^double all damage (?:that )?(?:${selfWords}|this creature|this permanent|it) would deal$`, "i").test(s)) {
    return withCond({ op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true } });
  }
  // ANY-COUNTER creatures you control (Raphael, the Muscle): any kind of counter, read live off the source at damage time.
  if (/^double all damage that creatures you control with counters on them would deal$/i.test(s)) {
    return withCond({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true, sourceHasCounter: "any" } });
  }
  // CREATURE SOURCES you control (Absorbing Man and Titania) — the Gratuitous Violence scope in "double all damage" words.
  if (/^double all damage that creature sources you control would deal$/i.test(s)) {
    return withCond({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true } });
  }
  // THE HOST (Mjölnir, Hammer of Thor): the source must be the permanent this Equipment is attached to — read live.
  if (/^double all damage equipped creature would deal$/i.test(s)) {
    return withCond({ op: { op: "multiply", factor: 2 }, scope: { side: "source", hostOfSelf: true } });
  }

  // ── "If <source> would deal [combat|noncombat] damage [to <recipient>], <result>." ──
  const m = (s[0] ? s[0].toLowerCase() + s.slice(1) : s).match(IF_DAMAGE_RE);
  if (!m) return null;
  const [, src, colorWord, orArtifact, sourceSub, kind, recipient = "", targetSub, result] = m;
  // The result.
  let op;
  let r;
  if ((r = result.match(/^(?:it|that source) deals (double|triple) that damage(?: to (.+?))? instead$/))) {
    if (r[2] && !(ECHO_FOR[recipient] || []).includes(r[2])) return null;
    op = { op: "multiply", factor: r[1] === "double" ? 2 : 3 };
  } else if (/^it deals twice that much damage instead$/.test(result)) {
    op = { op: "multiply", factor: 2 };
  } else if ((r = result.match(/^it deals that much damage plus (\d+|one|two|three) instead$/))) {
    op = { op: "add", addend: NUMBER_WORDS[r[1]] ?? parseInt(r[1], 10) };
  } else if ((r = result.match(/^instead it deals that much damage plus X, where X is (.+)'s power$/)) && shortName && new RegExp(`^(?:${selfWords})$`).test(r[1])) {
    op = { op: "add", addendSelfPower: true };
  } else if (/^prevent half that damage, rounded up$/.test(result)) {
    op = { op: "preventHalfUp" };
  } else if ((r = result.match(/^prevent all but (\d+|one) of that damage$/))) {
    op = { op: "preventAllBut", floor: r[1] === "one" ? 1 : parseInt(r[1], 10) };
  } else return null;

  // The source.
  let scope;
  if (src === "a source") scope = { side: "any" };
  else if (src === "a source you control") scope = { side: "source", controller: "you" };
  else if (src === "another source you control") scope = { side: "source", controller: "you", excludeSelfSource: true };
  else if (colorWord) scope = { side: "source", controller: "you", [orArtifact ? "sourceColorsOrArtifact" : "sourceColors"]: [COLOR_WORDS[colorWord]] };
  else if (src === "a creature you control") scope = { side: "source", controller: "you", sourceIsCreature: true };
  else if (src === "a creature you control with a +1/+1 counter on it") scope = { side: "source", controller: "you", sourceIsCreature: true, sourceHasCounter: "+1/+1" };
  else if (src === "a creature you control that entered this turn") scope = { side: "source", controller: "you", enteredThisTurn: true };
  else if (sourceSub) scope = { side: "source", controller: "you", sourceSubtype: sourceSub.toLowerCase() };
  else if (src === "this creature") scope = { side: "source", self: true };
  else if (src === "equipped creature") scope = { side: "source", hostOfSelf: true };
  else if (src === "another creature") scope = { side: "any", sourceCreatureOther: true };
  else return null;

  // The recipient.
  if (recipient === "an opponent or a permanent an opponent controls") scope.targetSide = "opponent";
  else if (recipient === "you or a permanent you control") scope.targetSide = "you";
  else if (recipient === "an opponent") {
    // Fiendish Duo's shape (any source → an opponent, players only); with a source filter, the same gate as a recipient filter.
    if (scope.side === "any" && Object.keys(scope).length === 1) scope = { side: "target", affectedOpponent: true };
    else scope.targetSide = "opponentPlayer";
  } else if (recipient === "you") {
    if (scope.side === "any" && Object.keys(scope).length === 1) scope = { side: "target" };
    else scope.targetSide = "youPlayer";
  } else if (recipient === "this creature") scope.targetSelf = true;
  else if (recipient === "a player") scope.targetPlayerOnly = true;
  else if (recipient === "equipped creature") scope.targetHost = true;
  else if (targetSub) {
    // TEMPLE ALTISAUR — the SUBTYPE-SCOPED partial prevention: another <Subtype> you control (CR 109.5 "another").
    if (!(scope.side === "any" && Object.keys(scope).length === 1)) return null;
    scope = { side: "target", targetSubtype: targetSub.toLowerCase(), excludeSelf: true };
  }
  if (kind === "combat ") scope.combatOnly = true;
  if (kind === "noncombat ") scope.noncombatOnly = true;
  return withCond({ op, scope });
}

/** The replacement sentences a card carries, each with its entry: [{ sentence, entry }]. Memoized per card object. */
function damageReplacementSentences(card) {
  if (!card || typeof card !== "object") return [];
  const hit = _parseMemo.get(card);
  if (hit) return hit;
  const out = [];
  for (const sentence of staticSentences(card)) {
    const entry = readDamageSentence(sentence, card);
    if (entry) out.push({ sentence, entry });
  }
  _parseMemo.set(card, out);
  return out;
}

/**
 * Parse the damage-replacement clauses a single CARD carries, if any. Returns [] for the overwhelming majority of cards (the
 * gate stays byte-identical).
 */
export function parseDamageReplacements(card) {
  return damageReplacementSentences(card).map((x) => x.entry);
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip the damage-replacement SENTENCE(S) this card carries — exactly the sentences parseDamageReplacements read, ability-word
 * label and all — so a coverage classifier can confirm the rest of the card is keyword-only. Returns the oracle with those
 * sentences blanked; a no-op for the overwhelming majority of cards (no replacement clause).
 *
 * CREED: this strips ONLY a sentence parseDamageReplacements read (so the runtime models it), and the caller still validates
 * the REMAINDER — a card with any other unmodeled clause keeps that residue and stays body-only. A sentence the strip can't
 * find in `oracle` (reminder text inside it) stays, and the caller's re-parse of the stripped card refuses it (a safe miss).
 * Used by coverage.classifyDamageReplacementBody (Twinflame Tyrant et al.).
 */
export function stripDamageReplacementClauses(oracle, card) {
  let t = String(oracle ?? "");
  if (!t) return t;
  for (const { sentence } of damageReplacementSentences(card)) t = t.split(sentence).join(" ");
  return t;
}

// ─── Synthesized-on-read scan ──────────────────────────────────────────────────

/** The card a permanent's replacements are read from: a modeled Class at its own level (classLevels.classLiveCard). */
const liveCard = (perm) => classLiveCard(perm) ?? perm?.card;

/**
 * Does this permanent (its card) carry a damage-replacement static ability?
 * Synthesized-on-read from the card oracle — no stored entry, no removal hook.
 */
export function isDamageReplacement(permanent) {
  return parseDamageReplacements(liveCard(permanent)).length > 0;
}

/**
 * Every active damage-replacement entry on the battlefield, each tagged with the
 * permanent that grants it (for the source-side `self` filter) and its index on that card (614.5 — one application per
 * entry). Pure scan; the entries vanish the instant a permanent leaves (it's re-scanned per call).
 */
export function collectDamageReplacements(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      parseDamageReplacements(liveCard(perm)).forEach((entry, index) => {
        out.push({ ...entry, permanentId: perm.id, permanentController: pid, entryIndex: index });
      });
    }
  }
  // THE STORED ONES (CR 611.2a — a replacement created by a resolved ability, lasting as long as it says: Lightning, Army of One's
  // Stagger, effects/atoms/misc.applyDamageReplacementUntilNextTurn). Each is its own entry (its id for the 614.5 key); its
  // controller is the ability's. Expiry is gameState.expireDamageReplacementEffects'.
  for (const e of state?.damageReplacementEffects || []) {
    if (!state.players?.[e.controller]) continue;
    out.push({ op: e.op, scope: e.scope, permanentId: `effect:${e.id}`, permanentController: e.controller, entryIndex: 0 });
  }
  return out;
}

/**
 * COMBAT-DAMAGE-UNPREVENTABLE (SG-11, 2026-09-03 — Frenzied Baloth, CR 615.12): "Combat damage can't be
 * prevented." A board-wide static (any controller — the sentence names no player): while ANY battlefield
 * permanent prints it, every combat-damage prevention effect (a fog latch, a creature's printed or attached
 * prevent wall, a counter shield, a prevent / prevent-all-but replacement op) does nothing to COMBAT damage.
 * Noncombat prevention is untouched. Read off the exact sentence, own line.
 */
export function combatDamageUnpreventable(state) {
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      const o = String(perm?.card?.oracle || perm?.card?.oracle_text || "");
      if (/(?:^|\n)\s*combat damage can't be prevented\.?\s*(?:\n|$)/i.test(o)) return true;
    }
  }
  return false;
}

/**
 * Fast gate: is there ANY damage-replacement on the board? Call sites gate the
 * whole consult on this so a no-doubler board runs the byte-identical path it
 * does today (the CREED negative-test guarantee).
 */
export function boardHasDamageReplacement(state) {
  if ((state?.damageReplacementEffects || []).length) return true; // a stored replacement (Lightning's Stagger)
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      if (isDamageReplacement(perm)) return true;
    }
  }
  return false;
}

// ─── Filters (source-side AND target-side — MUST-FIX 2) ─────────────────────────

/** The battlefield permanent with this id and its controller, or null. */
function onBattlefield(state, id) {
  if (id == null) return null;
  for (const pid of Object.keys(state?.players || {})) {
    const p = (state.players[pid].battlefield || []).find((x) => x.id === id);
    if (p) return { perm: p, controller: pid };
  }
  return null;
}

/**
 * THE SOURCE'S QUALITIES for a source filter — its colours and card types. A static ability's source filter applies to a
 * source permanent with the quality and to a source not on the battlefield with it (CR 609.7c): a permanent is read as it is
 * NOW (the layers — a creature turned red is red); a source that is not on the battlefield — a spell, a permanent that has
 * left — through the record the damage event carries (`event.sourceLki`: the spell's colours and types, or the permanent's
 * last known information, CR 113.7a). Neither → null, and a colour- or type-filtered replacement doesn't apply (a safe miss).
 */
function sourceQualities(state, event) {
  const here = onBattlefield(state, event?.sourceId);
  if (here) return { colors: [...permanentColors(state, here.perm.id)], types: [...permanentTypes(state, here.perm.id).types] };
  const lk = event?.sourceLki;
  return lk ? { colors: lk.colors || [], types: lk.types || [] } : null;
}

/**
 * THE RECIPIENT'S SIDE: "opponent" when the recipient is an opponent of the replacement's controller or a permanent an opponent
 * controls (a creature, a planeswalker or a battle — CR 120.1), "you" when it is that controller or a permanent they control,
 * null when the recipient can't be found (gone — nothing is dealt to it anyway).
 */
function recipientSide(state, event, controller) {
  if (event?.targetKind === "player") return event.targetId == null ? null : (event.targetId === controller ? "you" : "opponent");
  const here = onBattlefield(state, event?.targetId);
  return here ? (here.controller === controller ? "you" : "opponent") : null;
}

/**
 * The gates every entry may carry beside its side: the recipient (targetSide / targetSelf / targetHost / targetPlayerOnly), the
 * damage kind (combatOnly / noncombatOnly), the source's qualities (sourceColors / sourceColorsOrArtifact), "another" source
 * (excludeSelfSource / sourceCreatureOther) and the condition (hellbent). Each is read when the damage would be dealt.
 */
function extraGates(entry, state) {
  const scope = entry?.scope || {};
  const gates = [];
  const self = entry.permanentId;
  const ctrl = entry.permanentController;
  const hostOf = () => onBattlefield(state, self)?.perm?.attachedTo ?? null;
  if (scope.targetSide === "opponent" || scope.targetSide === "you") gates.push((e) => recipientSide(state, e, ctrl) === scope.targetSide);
  if (scope.targetSide === "opponentPlayer") gates.push((e) => e?.targetKind === "player" && e.targetId != null && e.targetId !== ctrl);
  if (scope.targetSide === "youPlayer") gates.push((e) => e?.targetKind === "player" && e.targetId === ctrl);
  if (scope.targetSelf) gates.push((e) => e?.targetKind !== "player" && e?.targetId === self);
  if (scope.targetHost) gates.push((e) => { const h = hostOf(); return h != null && e?.targetKind !== "player" && e?.targetId === h; });
  if (scope.targetPlayerOnly && !scope.self) gates.push((e) => e?.targetKind === "player");
  if (scope.combatOnly && !scope.self) gates.push((e) => !!e?.isCombat);
  if (scope.noncombatOnly) gates.push((e) => !e?.isCombat);
  if (scope.sourceColors) gates.push((e) => { const q = sourceQualities(state, e); return !!q && scope.sourceColors.some((c) => q.colors.includes(c)); });
  if (scope.sourceColorsOrArtifact) gates.push((e) => { const q = sourceQualities(state, e); return !!q && (scope.sourceColorsOrArtifact.some((c) => q.colors.includes(c)) || q.types.includes("Artifact")); });
  if (scope.excludeSelfSource) gates.push((e) => e?.sourceId == null || e.sourceId !== self);
  if (scope.sourceCreatureOther) gates.push((e) => { const h = hostOf(); return e?.sourceId != null && e.sourceId !== h && !!onBattlefield(state, e.sourceId) && permanentIsCreature(state, e.sourceId); });
  if (scope.condition === "hellbent") gates.push(() => (state?.players?.[ctrl]?.hand || []).length === 0);
  // ONE PLAYER'S SIDE (Lightning's Stagger — "that player or a permanent that player controls"): the stored effect names the player.
  if (scope.recipientPlayerSide != null) {
    gates.push((e) => (e?.targetKind === "player" ? e.targetId === scope.recipientPlayerSide : onBattlefield(state, e?.targetId)?.controller === scope.recipientPlayerSide));
  }
  return gates;
}

/**
 * Build the applicability predicate for one replacement entry. Supports BOTH a
 * source-side scope (matches on the damage SOURCE / its controller) and a
 * target-side scope (matches on the AFFECTED player / target controller), and AND-s the entry's extra gates (extraGates).
 * The predicate takes the damage `event` and returns true iff this replacement applies to it.
 */
export function buildSourceFilter(entry, _state) {
  const base = baseFilter(entry, _state);
  const gates = extraGates(entry, _state);
  if (!gates.length) return base;
  return (event) => base(event) && gates.every((g) => g(event));
}

function baseFilter(entry, _state) {
  const scope = entry?.scope || {};
  // SYMMETRIC-ALL (CM-1 — Furnace of Rath / Dictate): no source restriction — every damage event qualifies (a recipient gate
  // in extraGates may narrow it: Gisela). Checked first so the un-scoped shape can't fall through to the source-side branches.
  if (scope.side === "any") {
    return () => true;
  }
  if (scope.side === "target") {
    // TARGET-SUBTYPE (Temple Altisaur): the AFFECTED CREATURE must carry the subtype (live front-face
    // read), be controlled by the replacement's controller ("you control"), and — CR 109.5 "another" —
    // not be this permanent itself. A target off the battlefield can't be verified → no match (FN-safe).
    if (scope.targetSubtype) {
      return (event) => {
        if (event?.targetKind !== "creature" || event.targetId == null) return false;
        if (scope.excludeSelf && event.targetId === entry.permanentId) return false;
        for (const pid of Object.keys(_state?.players || {})) {
          const tgt = (_state.players[pid].battlefield || []).find((p) => p.id === event.targetId);
          if (tgt) {
            if (pid !== entry.permanentController) return false;
            const type = String(tgt.card?.type_line ?? tgt.card?.type ?? "").toLowerCase();
            // P·39 — every creature type (a changeling, Mirror Entity's activation, an animated Mutavault) is a Dinosaur too.
            return new RegExp(`\\b${scope.targetSubtype}\\b`).test(type)
              || permIsEveryCreatureType(_state, tgt.id);
          }
        }
        return false;
      };
    }
    // TO AN OPPONENT (Fiendish Duo, shelf D11): a player other than the replacement's controller is being dealt to.
    // Players only — "to an opponent" names no permanent.
    if (scope.affectedOpponent) {
      return (event) => event?.targetKind === "player" && event.targetId != null && event.targetId !== entry.permanentController;
    }
    // Affected-player scoped: the replacement's controller is the player being dealt to.
    return (event) => event?.targetKind === "player"
      && event?.targetId === entry.permanentController;
  }
  // Source-side (default).
  // THE HOST (shelf D11 — Mjölnir's "equipped creature"): the source must be the permanent this Equipment is attached to,
  // read live off the Equipment (a pure battlefield scan, like the branches below).
  if (scope.hostOfSelf) {
    return (event) => {
      if (event?.sourceId == null) return false;
      for (const pid of Object.keys(_state?.players || {})) {
        const self = (_state.players[pid].battlefield || []).find((p) => p.id === entry.permanentId);
        if (self) return self.attachedTo != null && self.attachedTo === event.sourceId;
      }
      return false;
    };
  }
  if (scope.self) {
    // This-permanent-only (Wolverine / Charging Tuskodon): the damage source must BE this permanent. CM-1 adds
    // two OPTIONAL gates — combatOnly (event.isCombat) and targetPlayerOnly (targetKind==="player") — so a self
    // doubler scoped to "combat damage to a player" (Charging Tuskodon) doesn't double its damage to blockers or
    // any noncombat damage. Wolverine (neither flag set) is byte-identical: both gates are skipped.
    return (event) => {
      if (event?.sourceId == null || event.sourceId !== entry.permanentId) return false;
      if (scope.combatOnly && !event.isCombat) return false;
      if (scope.targetPlayerOnly && event.targetKind !== "player") return false;
      return true;
    };
  }
  if (scope.controller === "you") {
    // Controller-wide: any source the entry's controller controls. When the entry is gated to creatures that
    // ENTERED THIS TURN (Neriv), additionally require the live SOURCE permanent to have entered on the current
    // turn — re-read from state (an inline battlefield scan, mirroring collectDamageReplacements; keeps this a
    // pure leaf with no gameState import). A source whose enteredOnTurn !== state.turn (or that can't be found —
    // e.g. an already-left source) is NOT doubled, so the replacement can never over-fire on a stale creature.
    if (scope.enteredThisTurn) {
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        const turn = _state?.turn;
        let src = null;
        for (const pid of Object.keys(_state?.players || {})) {
          src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) break;
        }
        return !!src && src.enteredOnTurn === turn;
      };
    }
    if (scope.sourceIsCreature) {
      // CM-1 (Gratuitous Violence): controller-wide, but the live SOURCE permanent must be a CREATURE — re-read
      // from state (an inline battlefield scan, mirroring the enteredThisTurn branch; keeps this a pure leaf with
      // no gameState import). A noncreature source you control (a burn spell, an artifact pinger) is NOT doubled;
      // a source not on the battlefield (a spell — never a permanent) can't be found → not doubled. In combat
      // every source IS a creature, so this doubles all your creatures' combat damage.
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        let src = null;
        for (const pid of Object.keys(_state?.players || {})) {
          src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) break;
        }
        if (!src) return false;
        // A creature source NOW (the type-line audit, CR 613.1d): Gratuitous Violence doesn't double a Purphoros below its devotion.
        if (!permanentIsCreature(_state, src.id)) return false;
        // Uncivil Unrest's +1/+1 gate; "any" (Raphael, shelf D11) = at least one counter of any kind.
        if (scope.sourceHasCounter === "any" && !Object.values(src.counters || {}).some((n) => Number(n) > 0)) return false;
        if (scope.sourceHasCounter && scope.sourceHasCounter !== "any" && !((src.counters?.[scope.sourceHasCounter] || 0) > 0)) return false;
        return true;
      };
    }
    if (scope.sourceSubtype) {
      // SUBTYPE SOURCES you control (Calamity Bearer, shelf D11): the live source permanent carries the subtype
      // (word-bounded type-line read, like Temple Altisaur's target-side check). A source off the battlefield — a spell —
      // can't be read, so it isn't doubled.
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        for (const pid of Object.keys(_state?.players || {})) {
          const src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) return new RegExp(`\\b${scope.sourceSubtype}\\b`).test(String(src.card?.type_line ?? src.card?.type ?? "").toLowerCase())
            || permIsEveryCreatureType(_state, src.id); // P·39 — a Giant too
        }
        return false;
      };
    }
    return (event) => event?.sourceController != null
      && event.sourceController === entry.permanentController;
  }
  return () => false;
}

// ─── The 616-ordered consult ────────────────────────────────────────────────────

/**
 * Apply the op of one replacement entry to a running amount. Multiplier/addend —
 * NEVER a boolean. Unknown ops are a no-op (safe false-negative). `addendSelfPower` (Hawkeye — "plus X, where X is Hawkeye's
 * power") reads the replacement's own permanent's power as the damage would be dealt.
 */
function applyOp(amount, op, state = null, entry = null) {
  if (!op) return { amount, prevented: false };
  if (op.op === "multiply") return { amount: amount * (op.factor ?? 1), prevented: false };
  if (op.op === "add") {
    const addend = op.addendSelfPower ? (onBattlefield(state, entry?.permanentId) ? Math.max(0, Number(permanentPower(state, entry.permanentId)) || 0) : 0) : (op.addend ?? 0);
    return { amount: amount + addend, prevented: false };
  }
  if (op.op === "prevent") return { amount: 0, prevented: true };
  // TEMPLE ALTISAUR — "prevent all but N": a CAP, never a floor-up (an amount already ≤ N is untouched,
  // so a 1-damage ping still deals 1 — the printed behaviour, not a fabricated raise).
  if (op.op === "preventAllBut") return { amount: Math.min(amount, Math.max(0, op.floor ?? 1)), prevented: false };
  // GISELA — "prevent half that damage, rounded up" (CR 107.1a — the card says which way to round): of 3, 2 are prevented.
  if (op.op === "preventHalfUp") return { amount: amount - Math.ceil(amount / 2), prevented: false };
  return { amount, prevented: false };
}

const isPrevention = (op) => op?.op === "prevent" || op?.op === "preventAllBut" || op?.op === "preventHalfUp";

/** Run `entries` in this order on `raw`: a fully prevented event (0 left) ends it — nothing remains to modify (CR 616.1f). */
function runInOrder(state, entries, raw) {
  let amount = raw;
  let prevented = false;
  for (const entry of entries) {
    if (amount <= 0) break;
    const res = applyOp(amount, entry.op, state, entry);
    amount = res.amount;
    if (res.prevented) { prevented = true; break; }
  }
  return { amount: Math.max(0, amount), prevented };
}

/**
 * THE AFFECTED PLAYER'S ORDER (CR 616.1, 616.1e): every applicable effect may be chosen first, and the process repeats until
 * none is left (616.1f). The chooser — the player dealt the damage, or the controller of the permanent dealt it — takes the
 * order that leaves the LEAST damage; among equals, the battlefield (registration) order. Every order is tried for up to six
 * effects (720 orders — more is never printed on one board); beyond that the battlefield order stands.
 */
function chooseOrder(state, entries, raw) {
  if (entries.length < 2 || entries.length > 6) return entries;
  let best = null;
  let bestAmount = Infinity;
  const permute = (rest, chosen) => {
    if (!rest.length) {
      const { amount } = runInOrder(state, chosen, raw);
      if (amount < bestAmount) { bestAmount = amount; best = chosen; }
      return;
    }
    for (let i = 0; i < rest.length; i++) permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...chosen, rest[i]]);
  };
  permute(entries, []);
  return best ?? entries;
}

/**
 * The damage-amount-finalization CONSULT. Given the pre-replacement damage
 * `event`, returns `{ amount, prevented }` — the amount to actually deal (after
 * every applicable replacement, in 616.1 order) and whether it was prevented to
 * a no-op.
 *
 * @param {object} state
 * @param {object} event - { sourceId, sourceController, amount, targetKind:"player"|"creature"|"planeswalker", targetId, isCombat,
 *   sourceLki? } — `sourceLki` ({ colors, types }) is the source's record when it is not on the battlefield (sourceQualities)
 */
export function applyDamageReplacements(state, event) {
  const raw = Math.max(0, Number(event?.amount) || 0);
  if (raw <= 0) return { amount: raw, prevented: false };
  const skipPrevention = !!event?.isCombat && combatDamageUnpreventable(state);
  // 614.5 — a FRESH applied-set PER consult invocation (MUST-FIX 4). Keyed by the entry (its permanent and its index on the
  // card) so each distinct replacement applies at most once within THIS event; a separate combat sub-step is a separate call →
  // a separate set → the doubler fires again (correct double-strike doubling, never ×step-count).
  const applied = new Set();
  const entries = [];
  for (const entry of collectDamageReplacements(state)) {
    const key = `${entry.permanentId}#${entry.entryIndex}`;
    if (applied.has(key)) continue;
    // SG-11 (Frenzied Baloth): a prevention op is inert against COMBAT damage while the board says it can't
    // be prevented (CR 615.12). Multipliers / addends still apply — only prevention is switched off.
    if (skipPrevention && isPrevention(entry.op)) continue;
    if (!buildSourceFilter(entry, state)(event)) continue;
    applied.add(key);
    entries.push(entry);
  }
  return runInOrder(state, chooseOrder(state, entries, raw), raw);
}

/**
 * Convenience for the call sites: returns the (possibly doubled) amount for a
 * damage event, or the raw amount unchanged when the board has no replacement
 * (the byte-identical gate). `prevented` collapses to 0.
 */
export function consultDamageAmount(state, event) {
  if (!boardHasDamageReplacement(state)) return Math.max(0, Number(event?.amount) || 0);
  const { amount, prevented } = applyDamageReplacements(state, event);
  return prevented ? 0 : amount;
}
