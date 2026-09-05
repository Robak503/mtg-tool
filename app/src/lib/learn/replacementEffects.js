/**
 * replacementEffects.js — counter & token DOUBLING replacement effects (Wave 3, brief #6).
 *
 * THE WAVE-3 PREREQUISITE + the brief's #1 false-positive risk. Doublers replace a counter-placement or
 * token-creation event with a larger one (CR 616). This is a LEAF module (mirrors cardEffects.js): pure
 * functions over `state`, importing NOTHING from the engine — so gameState.js / resolvers.js / tokens.js /
 * amass.js can all import it without a cycle. Detection is by ANCHORED oracle-clause matchers (not card
 * name), so a functional reprint with the same clause is covered, and an unrelated card is not.
 *
 * The two replaced event families:
 *   - COUNTER additions: "twice that many" (multiplicative x2 — Doubling Season, Branching Evolution,
 *     Corpsejack, Primal Vigor, Vorinclex) or "that many plus one" (additive +1 — Hardened Scales). The
 *     controller of the affected permanent orders multiple replacements (CR 616.1e) → the sim plays to win:
 *     ALL additives first, THEN ALL multiplicatives (base 1 + Hardened Scales + Primal Vigor = (1+1)*2 = 4).
 *     Two x2 stack to x4. A "+1/+1" doubler only affects +1/+1 counters; a generic "counters" doubler (Doubling
 *     Season / Vorinclex) affects any counter kind. Vorinclex ALSO halves (floor) counters on an opponent's
 *     permanent.
 *   - TOKEN creation: "twice that many ... tokens" (Doubling Season, Parallel Lives, Anointed Procession,
 *     Primal Vigor, Mondrak) → tokenMultiplier = 2^k.
 *
 * SCOPE: most doublers are "you control" (apply only to a recipient the doubler's controller controls);
 * Primal Vigor is GLOBAL (every player); Vorinclex doubles its controller's and halves opponents'. We never
 * double an opponent's counters/tokens for a "you" doubler (the forbidden FP). FFA pods → any two distinct
 * players are opponents.
 *
 * RECURSION: the multiplier is computed ONCE and applied to the count/amount at the put/create event — never
 * a post-event "add more" (that would double-fire ETB/dies and break CR 616 once-per-event semantics), and a
 * doubler-created token is just minted (no re-entry into the multiply path).
 */

function oracleOf(card) {
  return String(card?.oracle ?? card?.oracle_text ?? card?.text ?? "").toLowerCase();
}

function escapeReLit(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// SELF-scope recipient (Mowu, Loyal Companion — "…would be put on Mowu, that many plus one …"): the counter-
// placement replacement's recipient is the SOURCE permanent ITSELF — referenced by its own (short) name, or by
// "this creature"/"this permanent"/"itself". SINGLE SOURCE OF TRUTH shared by doublerProfile (scope detection)
// and isModeledDoublerSentence (residue strip) so the two never drift. `shortName` is the lowercased pre-comma
// card name; absent → only the name-free self pronouns match (FN-safe — a self-name card just under-models).
function isSelfRecipient(s, shortName) {
  if (/\b(?:put on|on) (?:this creature|this permanent|itself)\b/.test(s)) return true;
  if (!shortName) return false;
  return new RegExp(`\\b(?:put on|on) ${escapeReLit(shortName)}\\b`).test(s);
}

// A doubler's RECIPIENT must be GENERIC (the noun right after the determiner is creature/permanent/artifact/…),
// never a subtype list. A "you"-scoped doubler whose recipient is a subtype ("an Army, Goblin, or Orc you
// control" — Mauhúr) would otherwise over-apply to EVERY permanent the controller has, since the runtime layer
// only tracks the controller, not the recipient's subtype — a forbidden over-fire. Requiring a generic recipient
// drops the counter profile for such cards (FN-safe: the runtime never over-fires, and the card stays non-native).
const RECIPIENT_GENERIC = /\bon (?:a|an|each|any|that|another)\s+(?:(?:nontoken|target|other)\s+)*(?:creature|permanent|artifact|planeswalker|enchantment|land|battle|player|spacecraft|planet)\b/;

/**
 * Classify a single permanent's card into its doubler profile, or null. Parses by sentence so a card with
 * BOTH a counter clause and a token clause (Doubling Season / Primal Vigor / Vorinclex) is captured fully.
 * Returns { counter: {op, factor, kind, scope}|null, halvesOpponents: bool, token: {factor, scope}|null,
 *   tokenAdd: {filter, additive, scope}|null }.
 *   - counter.op: "multiply" (factor 2) | "additive" (factor is the +N, e.g. 1)
 *   - counter.kind: "+1/+1" (only +1/+1 counters) | "any" (any counter type)
 *   - token: MULTIPLICATIVE doubler (×2^k over all token kinds — Doubling Season / Mondrak)
 *   - tokenAdd: ADDITIVE, kind-FILTERED bonus (+N of a specific token — Xorn = +1 Treasure)
 *   - scope: "you" | "global"
 */
export function doublerProfile(card) {
  const o = oracleOf(card);
  if (!o) return null;
  const shortName = String(card?.name ?? "").split(",")[0].trim().toLowerCase(); // SELF-recipient (Mowu) detection
  // CLASS doublers are LEVEL-gated (Innkeeper's Talent: the doubling is its Level-3 ability). The runtime layer
  // can't track Class levels, so an always-on doubler would over-apply from Level 1 — a forbidden FP. Skip the
  // whole card (FN-safe: under-model the rare Class doubler rather than mis-resolve every counter while it's
  // under-leveled).
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (/\bclass\b/.test(type)) return null;
  let counter = null;
  let token = null;
  let tokenAdd = null;
  let tokenExtra = null;
  let tokenOneOfEach = null; // ACADEMY MANUFACTOR (SHELF-85 · Bumble F4, 2026-09-05): "If you would create a Clue, Food, or Treasure token, instead create one of each."
  let mill = null;
  let life = null;
  let halvesOpponents = false;
  let playerCounterAdd = null;
  for (const raw of o.split(".")) {
    const s = raw.trim();
    if (!s) continue;
    // Temporal/date-gated clause (Hosting Season Secret Lair "While it's October …") — the layer can't evaluate
    // the calendar gate, so applying the doubler unconditionally is an FP. Skip the sentence (FN-safe).
    if (/while it'?s /.test(s)) continue;
    // Counter-placement clause — both PASSIVE ("[+1/+1] counters would be put on …", Branching Evolution /
    // Hardened Scales / Primal Vigor / Corpsejack) and ACTIVE ("[you] would put one or more counters on …",
    // Doubling Season / Vorinclex).
    const counterPut = /counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s);
    // Token-creation clause — ACTIVE ("[would] create one or more tokens", Doubling Season / Parallel Lives /
    // Anointed Procession) and PASSIVE ("one or more tokens would be created", Primal Vigor / Mondrak).
    const tokenCreate = /(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s);
    // LIFE-GAIN REPLACEMENT (CR 614.1) — "If you would gain life, you gain twice that much life instead"
    // (Rhox Faithmender / Boon Reflection / The Wind Crystal) and its ADDITIVE arm "…that much life plus N
    // instead" (Angel of Vitality / Heron of Hope / Honor Troll / Knight of Dawn's Light). The last missing
    // member of this module's family: counters, tokens, mill and mana each already have a multiplier and an
    // additive; life gain had neither.
    // SCOPE is intrinsic to the template and is the reason no scope field is needed — every printed card
    // reads "If YOU would gain life", so the effect belongs to its controller and applies only to THEIR
    // gains. "an opponent would gain life" prints on no card in the bundle; if one is ever printed it falls
    // through unmatched rather than being treated as a you-scope effect (CREED: FN over a wrong scope).
    // NOT ^-anchored, unlike the mill arm below: doublerProfile splits the oracle on ".", so a preceding
    // keyword line with no period of its own ("Flying\nIf you would gain life…") or a reminder-text tail
    // (") \nIf you would…" on Rhox Faithmender) rides at the head of the same fragment. Anchoring cost 5 of
    // the 7 real cards. The phrase is its own template and matches nothing else in the corpus.
    const lifeM = /if you would gain life, you gain (?:(twice) that much life|that much life plus (\d+)) instead/.exec(
      s.toLowerCase().replace(/[\u2019]/g, "'"),
    );
    if (lifeM) {
      life = lifeM[1] ? { factor: 2 } : { additive: parseInt(lifeM[2], 10) };
      continue;
    }
    if (counterPut) {
      // Vorinclex's opponent clause HALVES (round down) counters put on an opponent's permanent/player.
      if (/(an opponent would put|an opponent controls)/.test(s) && /half that many/.test(s)) {
        halvesOpponents = true;
      } else {
        const kind = /\+1\/\+1 counters?/.test(s) ? "+1/+1" : "any";
        // SCOPE — must be EXPLICIT, never a blind "else global":
        //  • you-scope: "you control" / "you would put" / "your team controls" (Pir — this engine has NO
        //    teammates in 1v1/FFA, so "your team" == you; without this Pir's +1 leaked onto opponents).
        //  • global: ONLY a genuinely generic recipient ("on a/each/any creature|permanent|planeswalker|
        //    player|spacecraft|planet", e.g. Primal Vigor "put on a creature").
        //  • self-scope: a SELF-NAME recipient ("would be put on Mowu") / "this creature" / "this permanent".
        //    The replacement affects ONLY the source permanent itself — the SAFEST scope (it can never touch
        //    another permanent or a player). applyCounterDoubling gates it on recipientPermId === the doubler's
        //    own permId (the exact inverse of excludeSource), so a null-recipient caller merely under-applies.
        //  • neither → a subtype-restricted ("Army, Goblin, or Orc you control" — Mauhúr) / other unmodeled
        //    form. Leave scope null → no counter profile (FN-safe: never over-applied).
        let scope = null;
        // "you" scope requires a GENERIC recipient (RECIPIENT_GENERIC) — a subtype-restricted recipient
        // ("Army, Goblin, or Orc you control") would over-fire onto every permanent you control.
        if (RECIPIENT_GENERIC.test(s) && (/you control/.test(s) || /you would put/.test(s) || /your team controls?/.test(s))) scope = "you";
        else if (/\b(?:put on|on) (?:a|an|each|any|that) (?:creature|permanent|planeswalker|player|spacecraft|planet)\b/.test(s)) scope = "global";
        // SELF-scope (Mowu) — checked LAST so a generic you/global recipient is never mis-read as self; only a
        // genuine self-name / self-pronoun recipient (nothing else matched) lands here.
        else if (isSelfRecipient(s, shortName)) scope = "self";
        // SELF-EXCLUSION (CR 109.5) — "ANOTHER/OTHER creature you control" (Benevolent Hydra) means the
        // replacement never applies to counters placed on the SOURCE permanent itself. Captured so
        // applyCounterDoubling can skip this profile when the recipient IS its own source (a self-exclusion the
        // recipient-controller scope alone can't express). "another"/"other" appears in the recipient phrase
        // ("put on another creature you control"); anchored to the recipient noun so an unrelated "another"
        // elsewhere never trips it. Only the you-scope form carries it (a global "another" is not a real card).
        const excludeSource = scope === "you" && /\bon (?:an?other|other) (?:nontoken )?(?:creature|permanent)\b/.test(s);
        if (scope) {
          if (/twice that many/.test(s)) counter = { op: "multiply", factor: 2, kind, scope, ...(excludeSource && { excludeSource: true }) };
          else if (/that many plus (one|1)/.test(s)) counter = { op: "additive", factor: 1, kind, scope, ...(excludeSource && { excludeSource: true }) };
          // RECIPIENT-TYPE UNION (Winding Constrictor — "…put on an ARTIFACT OR CREATURE you control"): the
          // replacement applies ONLY to counters landing on those types. Stamped so applyCounterDoubling
          // type-gates via the recipient permanent (before this, the profile applied to EVERY permanent you
          // control — a live over-apply on lands/planeswalkers). Single-noun generic recipients stay untyped
          // (Doubling Season's "a permanent" is genuinely universal).
          if (counter && /\bon an artifact or creature you control\b/.test(s)) counter.recipientTypes = ["Artifact", "Creature"];
        }
      }
    }
    if (tokenCreate && /twice that many/.test(s)) {
      token = { factor: 2, scope: /under your control|you control/.test(s) ? "you" : "global" };
    }
    // ── TOKEN-ADDITIVE (Xorn, CR 614) — a NARROWER token-count replacement: "If you would create one or more
    // <Kind> tokens, instead create those tokens plus an additional <Kind> token." Not a ×2 multiply — a FIXED
    // +1 of a SPECIFIC token kind (Xorn = Treasure). Distinct field from `token` (the multiplicative doubler) so
    // tokenMultiplier stays byte-identical. Anchored to the exact "create one or more <Kind> … plus an additional
    // <Kind>" template. Only Treasure is minted as a MODELED named token (NAMED_TOKENS), so we admit ONLY the
    // Treasure filter — any other kind (a hypothetical "additional Clue") would still route through
    // applyCreateNamedToken and could be added later, but is left unmodeled here (FN-safe: no over-mint). The
    // "you" scope is intrinsic to the template ("If YOU would create …"); a minted Treasure is never itself a
    // Xorn, so this cannot recurse. If the two <Kind>s in the clause disagree, no profile (defensive).
    const addM = s.match(/if you would create one or more (treasure) tokens?,? instead create those tokens plus an additional (treasure) token/);
    if (addM && addM[1] === addM[2]) {
      tokenAdd = { filter: addM[1], additive: 1, scope: "you" };
    }
    // ── TOKEN-EXTRA-KIND (SG-10, 2026-09-03 — Peregrin Took, CR 614.1): the PASSIVE, kind-UNFILTERED cousin of
    // Xorn — "If one or more tokens would be created under your control, those tokens plus an additional Food
    // token are created instead." ANY token-creation event under the controller adds ONE token of a DIFFERENT,
    // named kind (Food — a MODELED named token). Applied once per event at the token-enter chokepoint
    // (tokens.fireTokenEnterTriggers via tokenExtraKinds); the minted Food is part of the same event and never
    // re-enters the replacement (CR 614.5). Exact template; the "you" scope is intrinsic ("under YOUR control").
    const extraM = s.match(/^if one or more tokens would be created under your control, those tokens plus an additional (food) token are created instead$/);
    if (extraM) {
      tokenExtra = { kind: extraM[1], scope: "you" };
    }
    // ONE-OF-EACH (Academy Manufactor, CR 614.1 — the printed ruling: EACH Clue/Food/Treasure token that would be created
    // becomes one of each; two Manufactors apply in turn, so one Food → 3 of each). Applied at the mint chokepoint
    // (tokens.fireTokenEnterTriggers via tokenOneOfEachPasses), once per creation event per Manufactor the creator controls.
    if (/^if you would create a clue, food, or treasure token, instead create one of each$/.test(s)) {
      tokenOneOfEach = { kinds: ["clue", "food", "treasure"], scope: "you" };
    }
    // ── MILL-DOUBLER (Bruvac the Grandiloquent, SHELF M2 — CR 614/616): "If an opponent would mill one or
    // more cards, they mill twice that many cards instead." OPPONENT-scoped from the doubler's controller —
    // millMultiplier applies it when the MILLED player is an opponent of the profile owner's. Anchored to the
    // exact template ("that many plus one" / a you-scoped mill replacement are different cards → unmodeled).
    if (/^if an opponent would mill one or more cards, they mill twice that many cards instead$/.test(s)) {
      mill = { factor: 2, scope: "opponent" };
    }
    // ── PLAYER-COUNTER ADDITIVE (Winding Constrictor clause 2, CR 122.6 counters a PLAYER gets — energy /
    // experience / poison / rad): "If you would get one or more counters, you get that many plus one of
    // each of those kinds of counters instead." A fixed +1 per counter-kind-event on the profile OWNER's
    // own gets ("you"), applied at the four player-counter adder chokepoints (gameState) via
    // playerCounterAdditive. Anchored to the exact printed template.
    if (/^if you would get one or more counters, you get that many plus one of each of those kinds of counters instead$/.test(s)) {
      playerCounterAdd = { additive: 1 };
    }
  }
  if (!counter && !token && !tokenAdd && !tokenExtra && !tokenOneOfEach && !mill && !life && !halvesOpponents && !playerCounterAdd) return null;
  return { counter, token, tokenAdd, tokenExtra, tokenOneOfEach, mill, life, halvesOpponents, playerCounterAdd };
}

/**
 * COVERAGE (metric): is this card a PURE doubler — a replacement-static Enchantment whose ENTIRE text is
 * doubling clauses (Doubling Season, Parallel Lives, Anointed Procession, Branching Evolution, Primal Vigor)?
 * Those flip native-static (the runtime doubling fully models them). A doubler on a CREATURE / PLANESWALKER /
 * with an ACTIVATED ability (Mondrak, Vorinclex, Corpsejack) has an unmodeled body and stays NON-NATIVE
 * (CREED whole-card) — excluded here. Conservative: requires an Enchantment-only type AND every non-reminder
 * sentence to be a doubling clause (any other ability → not pure → body-only).
 */
export function isPureDoubler(card) {
  if (!doublerProfile(card)) return false;
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (!/\benchantment\b/.test(type)) return false;
  if (/\bcreature\b|\bplaneswalker\b|\bartifact\b/.test(type)) return false;
  const o = oracleOf(card).replace(/\([^)]*\)/g, " "); // strip reminder text
  for (const raw of o.split(".")) {
    const s = raw.trim();
    if (!s) continue;
    const counterClause = (/counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s)) &&
      (/twice that many/.test(s) || /that many plus (one|1)/.test(s) || /half that many/.test(s));
    const tokenClause = (/(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s)) &&
      /twice that many/.test(s);
    const millClause = /^if an opponent would mill one or more cards, they mill twice that many cards instead$/.test(s); // Bruvac shape (M2)
    if (!counterClause && !tokenClause && !millClause) return false; // an unmodeled non-doubling sentence → not a pure doubler
  }
  return true;
}

/**
 * Is sentence `s` (already lowercased) a doubler clause the runtime MODELS? SINGLE SOURCE OF TRUTH shared with
 * the coverage residue-strip so "what we strip from the card for the whole-card check" can never drift from
 * "what the runtime actually applies". Mirrors doublerProfile's clause logic: the your-side counter multiply/
 * additive (generic recipient + you/global scope), the Vorinclex opponent-counter HALVE, and the token-creation
 * doubler. A token-HALVE (Halving Season "an opponent would create … half that many … tokens") is NOT modeled
 * (tokenMultiplier has no halving) → returns false → the clause is NOT stripped → the card stays non-native.
 * `shortName` (lowercased pre-comma card name, threaded by stripModeledDoublerClauses) enables the SELF-scope
 * clause (Mowu) to be recognized/stripped; absent → only the name-free self pronouns are matched.
 */
export function isModeledDoublerSentence(s, shortName = null) {
  const counterPut = /counters? would be put on/.test(s) || /would put (?:one or more )?counters? on/.test(s);
  if (counterPut) {
    if (/(an opponent would put|an opponent controls)/.test(s) && /half that many/.test(s)) return true; // opponent counter-halve
    if (/twice that many/.test(s) || /that many plus (one|1)/.test(s)) {
      const youScope = RECIPIENT_GENERIC.test(s) && (/you control/.test(s) || /you would put/.test(s) || /your team controls?/.test(s));
      const globalScope = /\b(?:put on|on) (?:a|an|each|any|that) (?:creature|permanent|planeswalker|player|spacecraft|planet)\b/.test(s);
      // SELF-scope (Mowu) — the source-permanent recipient; mirrors doublerProfile's isSelfRecipient exactly.
      return youScope || globalScope || isSelfRecipient(s, shortName);
    }
  }
  if ((/(?:create|creates) one or more tokens?/.test(s) || /one or more tokens? would be created/.test(s)) && /twice that many/.test(s)) return true;
  // TOKEN-ADDITIVE (Xorn) — the exact Treasure "+1 additional" replacement the runtime applies (tokenAdditive).
  // Only the Treasure filter is modeled (Treasure is the only MODELED named token an additive can mint); a
  // hypothetical "additional Clue" is NOT matched here → its clause survives as residue → card stays non-native.
  if (/if you would create one or more treasure tokens?,? instead create those tokens plus an additional treasure token/.test(s)) return true;
  // TOKEN-EXTRA-KIND (SG-10, Peregrin Took) — the exact passive "+1 additional Food" replacement the runtime applies
  // (tokenExtraKinds at the token-enter chokepoint). Food only — the one modeled named kind this template prints.
  if (/^if one or more tokens would be created under your control, those tokens plus an additional food token are created instead\.?$/.test(s)) return true;
  if (/^if you would create a clue, food, or treasure token, instead create one of each\.?$/.test(s)) return true; // Academy Manufactor (F4)
  // MILL-DOUBLER (Bruvac, SHELF M2) — the exact opponent-mill doubling the runtime applies (millMultiplier).
  if (/^if an opponent would mill one or more cards, they mill twice that many cards instead\.?$/.test(s)) return true;
  // LIFE-GAIN REPLACEMENT — the exact two templates applyLifeGainReplacement honours, and nothing wider.
  // A different multiplier word ("three times"), an opponent scope, or a non-numeric bonus stays residue and
  // keeps its card off the native tier, which is the point of matching the runtime exactly rather than loosely.
  if (/^if you would gain life, you gain (?:twice that much life|that much life plus \d+) instead\.?$/.test(s)) return true;
  // PLAYER-COUNTER ADDITIVE (Winding Constrictor clause 2) — the exact owner-scoped "+1 of each kind you
  // get" the runtime applies (playerCounterAdditive at the four gameState adder chokepoints).
  if (/^if you would get one or more counters, you get that many plus one of each of those kinds of counters instead\.?$/.test(s)) return true;
  return false;
}

/**
 * Strip every MODELED doubler sentence from `oracle`, IN PLACE, for the coverage whole-card residue check.
 * Removes ONLY the doubler sentence(s), preserving every other character/structure — crucially the reminder-text
 * parentheticals (a split-and-rejoin reflow mangles "(… . … .)" and breaks downstream reminder-stripping, which
 * over-permits the residue check — e.g. Solid Ground's earthbend reminder). Each `…sentence.` is tested by
 * isModeledDoublerSentence; a match is excised (its leading separator kept), everything else passes through
 * untouched. Only removes what the runtime applies — an unmodeled doubler-shaped clause (token-halve) survives
 * as residue, keeping its card off the native tier (CREED). `card` (optional) threads the pre-comma short name
 * so a SELF-scope clause (Mowu — "put on Mowu") is recognized and stripped, exactly as the runtime applies it.
 */
export function stripModeledDoublerClauses(oracle, card = null) {
  const shortName = card?.name ? String(card.name).split(",")[0].trim().toLowerCase() : null;
  return String(oracle || "").replace(
    /(^|[\n.]\s*)([^.\n]*\.)/g,
    (m, sep, sentence) => (isModeledDoublerSentence(sentence.trim().toLowerCase(), shortName) ? sep : m),
  );
}

/** Every (ownerId, permId, profile) doubler permanent across ALL battlefields. permId lets a self-excluding
 *  "another creature you control" counter-replacement (CR 109.5) skip the recipient when it IS the source. */
function allDoublers(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      const profile = doublerProfile(perm.card);
      if (profile) out.push({ ownerId: pid, permId: perm.id, profile });
    }
  }
  return out;
}

/** A counter doubler applies to a recipient when it is global, or "you" and the owner controls the recipient, or
 *  "self" and the recipient permanent IS the doubler's own source (Mowu — both perm ids must be known). */
function counterDoublerApplies(d, ownerId, recipientId, permId, recipientPermId) {
  if (!d) return false;
  // SELF-scope (Mowu, CR 614) — applies ONLY to counters landing on the doubler's OWN source permanent. Needs
  // both the doubler permanent (permId) and the recipient permanent (recipientPermId); an unknown recipient
  // can't be proven to be the source, so it does NOT apply (FN-safe under-apply, never an over-fire elsewhere).
  if (d.scope === "self") return permId != null && recipientPermId != null && permId === recipientPermId;
  return d.scope === "global" || ownerId === recipientId;
}

// The recipient permanent's PRINTED type line carries one of `types` (word-bounded). A local battlefield
// scan — this module is a LEAF gameState imports, so it cannot import findPermanent (cycle). Printed-line
// read matches doublerProfile's own convention (the parse is printed-text too).
function recipientTypeMatches(state, permId, types) {
  for (const pid of Object.keys(state?.players || {})) {
    const perm = (state.players[pid].battlefield || []).find((p) => p.id === permId);
    if (perm) {
      const t = String(perm.card?.type || perm.card?.type_line || "");
      return types.some((ty) => new RegExp(`\\b${ty}\\b`).test(t));
    }
  }
  return false;
}

/**
 * PLAYER-COUNTER ADDITIVE (Winding Constrictor clause 2): the fixed bonus added when `playerId` GETS one or
 * more counters of a kind (energy/experience/poison/rad — CR 122.6). Summed over the player's OWN
 * battlefield profiles ("If YOU would get…" — owner-scoped only). Applied once per kind-event at the four
 * gameState adder chokepoints. 0 on an effect-free board.
 */
export function playerCounterAdditive(state, playerId) {
  let add = 0;
  for (const { ownerId, profile } of allDoublers(state)) {
    if (profile.playerCounterAdd && ownerId === playerId) add += profile.playerCounterAdd.additive;
  }
  return add;
}

/**
 * The final counter amount put on `recipientControllerId`'s permanent after all doublers, given a base amount
 * and the counter TYPE being added (e.g. "+1/+1", "loyalty", "rad"). CR 616.1e greedy-max ordering: additives
 * first, then multiplicatives; then a Vorinclex opponent-halve (floor) last (the affected player orders to
 * maximize, so doubling-then-halving beats halving-then-doubling). Floors at 0. A "+1/+1"-only doubler is
 * skipped for any non-"+1/+1" counter type.
 *
 * `recipientPermId` (optional) is the permanent RECEIVING the counters. A self-excluding "another creature you
 * control" replacement (CR 109.5 — Benevolent Hydra) is skipped when that recipient IS the replacement's own
 * source permanent. Absent (every legacy caller) → no self-exclusion is possible, so behavior is unchanged.
 */
export function applyCounterDoubling(state, recipientControllerId, counterType, baseAmount, recipientPermId = null) {
  const base = Math.max(0, Number(baseAmount) || 0);
  if (base === 0) return 0;
  let additive = 0;
  let multiplier = 1;
  let halve = false;
  for (const { ownerId, permId, profile } of allDoublers(state)) {
    const c = profile.counter;
    // A "another creature you control" replacement (CR 109.5) never applies to its OWN source permanent — skip
    // it when the recipient IS that source. Only when we KNOW the recipient permanent (recipientPermId set) and
    // the doubler permanent (permId); an unknown recipient can't be proven to be the source, so we DON'T skip
    // (an under-exclusion would be an over-fire — but the runtime add-counter path always threads the recipient
    // permanent id, so this is exact in practice, and the classifier's honesty rests on that path).
    const selfExcluded = c?.excludeSource && recipientPermId != null && permId != null && recipientPermId === permId;
    // RECIPIENT-TYPE gate (Winding Constrictor — "an artifact or creature you control"): a typed profile
    // applies only when the RECIPIENT permanent's printed type line carries one of the types. An unknown
    // recipient (recipientPermId null — no legacy caller reaches a typed profile today) skips the profile
    // (FN-safe under-apply, never an over-fire on a land/planeswalker counter).
    const typeGated = c?.recipientTypes
      && !(recipientPermId != null && recipientTypeMatches(state, recipientPermId, c.recipientTypes));
    if (c && !selfExcluded && !typeGated && (c.kind !== "+1/+1" || counterType === "+1/+1") && counterDoublerApplies(c, ownerId, recipientControllerId, permId, recipientPermId)) {
      if (c.op === "additive") additive += c.factor;
      else multiplier *= c.factor;
    }
    // Vorinclex: halve counters placed on a permanent controlled by an opponent of the Vorinclex controller.
    if (profile.halvesOpponents && ownerId !== recipientControllerId) halve = true;
  }
  let amount = (base + additive) * multiplier;
  if (halve) amount = Math.floor(amount / 2);
  return Math.max(0, amount);
}

/**
 * The token-count multiplier for tokens created under `recipientControllerId`'s control: 2^k over the token
 * doublers that apply (global, or "you" owned by the recipient). Recursion-safe — applied once to the count.
 */
export function tokenMultiplier(state, recipientControllerId) {
  let mult = 1;
  for (const { ownerId, profile } of allDoublers(state)) {
    const t = profile.token;
    if (t && (t.scope === "global" || ownerId === recipientControllerId)) mult *= t.factor;
  }
  return mult;
}

/**
 * The ADDITIVE token bonus (Xorn, CR 614) for tokens of `tokenName` (e.g. "treasure") created under
 * `recipientControllerId`'s control: the sum of every tokenAdd.additive over the applicable additive-token
 * replacements (scope "you" → owned by the recipient; "global" reserved, none printed). The bonus is added ONCE
 * PER CREATION EVENT (Xorn = "plus AN additional Treasure", one extra regardless of the base count), so the
 * caller applies it to the whole batch, not per-token. `tokenName` is compared case-insensitively against the
 * profile's `filter`; a non-matching token kind (a Clue when only a Treasure-additive is out) gets 0. Two Xorns
 * stack additively (+2). Pure; a minted Treasure is never itself an additive source, so this cannot recurse.
 */
/**
 * MILL-COUNT multiplier (Bruvac, SHELF M2 — CR 616): the factor applied to a mill of `milledPlayerId`'s
 * library — 2^k over the opponent-scoped mill doublers whose CONTROLLER counts `milledPlayerId` as an
 * opponent (i.e. any other player's Bruvac doubles YOUR mills). Two Bruvacs stack multiplicatively (×4).
 * Consumed at BOTH mill chokepoints (effects/atoms/library.millOnePlayer + gameState.applyRadiation), so
 * every mill instruction — spell, trigger, or the inherent radiation ability — sees the same replacement.
 * The multiplied count is bounded by the library at the mill site (never a fabricated overdraw). Pure leaf.
 */
export function millMultiplier(state, milledPlayerId) {
  let mult = 1;
  for (const { ownerId, profile } of allDoublers(state)) {
    const m = profile.mill;
    if (m && m.scope === "opponent" && ownerId !== milledPlayerId) mult *= m.factor;
  }
  return mult;
}

/**
 * LIFE-GAIN REPLACEMENT (CR 614.1) — the life `playerId` ACTUALLY gains when an effect would give them
 * `baseAmount`. Applied at gameState.gainLife, which the module's own comment establishes as the single
 * verified life-gain chokepoint ("no direct p.life += elsewhere"), so every path — a "you gain N life"
 * spell, a drain's gain half, lifelink combat damage, the radiation replacement — is covered by one call.
 *
 * ORDER IS `(base + additive) * multiplier`, byte-identical to applyCounterDoubling above and deliberately
 * so. CR 616.1 gives the choice to the AFFECTED PLAYER when several replacements compete, and this order is
 * the one they would pick: with an Angel of Vitality (+1) and a Rhox Faithmender (x2) out, gaining 2 yields
 * (2+1)*2 = 6 rather than 2*2+1 = 5. Following the house convention costs nothing and keeps one rule in the
 * file instead of two.
 *
 * A ZERO gain stays zero and returns early: CR 119.3 treats a 0-amount gain as no life-gain event at all, so
 * an additive must not manufacture life out of an effect that gained none (Angel of Vitality does not turn
 * "gain 0 life" into 1). That early return is what keeps the additive from fabricating a life-gain event.
 * Pure leaf; a gained life point is never itself a replacement source, so this cannot recurse.
 */
export function applyLifeGainReplacement(state, playerId, baseAmount) {
  const base = Math.max(0, Number(baseAmount) || 0);
  if (base === 0) return 0;
  let additive = 0;
  let multiplier = 1;
  for (const { ownerId, profile } of allDoublers(state)) {
    const l = profile.life;
    if (!l || ownerId !== playerId) continue;   // "If YOU would gain life" — controller-scoped, never an opponent's
    if (l.factor) multiplier *= l.factor;
    else additive += l.additive;
  }
  return Math.max(0, (base + additive) * multiplier);
}

/**
 * TOKEN-EXTRA-KIND reader (SG-10 — Peregrin Took): the named token kinds that ONE token-creation event under
 * `creatorId` additionally mints ("those tokens plus an additional Food token"). One entry per Took-like
 * permanent the creator controls ("you" scope — never an opponent's). Consumed by tokens.fireTokenEnterTriggers.
 */
export function tokenExtraKinds(state, creatorId) {
  const out = [];
  for (const { ownerId, profile } of allDoublers(state)) {
    const te = profile.tokenExtra;
    if (te && (te.scope === "global" || ownerId === creatorId)) out.push(te.kind);
  }
  return out;
}

/** ACADEMY MANUFACTOR — how many "one of each" passes apply to tokens created under `creatorId` (one per Manufactor
 *  the creator controls; each pass turns every Clue/Food/Treasure in the batch into one of each — CR 614.1, the
 *  printed ruling that two Manufactors make three of each from one). Returns 0 when none. */
export function tokenOneOfEachPasses(state, creatorId) {
  let n = 0;
  for (const { ownerId, profile } of allDoublers(state)) {
    const oe = profile.tokenOneOfEach;
    if (oe && (oe.scope === "global" || ownerId === creatorId)) n += 1;
  }
  return n;
}

export function tokenAdditive(state, recipientControllerId, tokenName) {
  const kind = String(tokenName || "").toLowerCase();
  if (!kind) return 0;
  let add = 0;
  for (const { ownerId, profile } of allDoublers(state)) {
    const ta = profile.tokenAdd;
    if (ta && ta.filter === kind && (ta.scope === "global" || ownerId === recipientControllerId)) add += ta.additive;
  }
  return add;
}

// ─── MANA-MULTIPLIER — "If you tap a permanent for mana, it produces N times as much" (CR 605.1b/616) ──────
//
// A REPLACEMENT effect on mana PRODUCTION: when the controller TAPS a permanent for mana, the amount of that
// mana is multiplied. Mana Reflection ("twice as much", ×2) and Nyxbloom Ancient ("three times as much", ×3)
// are the only two real cards with this exact template. Detection is by ANCHORED clause (not card name) so a
// functional reprint is covered. A LEAF helper (this whole module imports nothing from the engine), consumed
// by manaModel.manaSources at the tap site.
//
// SCOPE — "If YOU tap a permanent for mana": the effect belongs to the doubler's CONTROLLER and multiplies
// the mana THEY produce by tapping. So manaMultiplier(state, playerId) is the product of every factor over
// the multiplier permanents PLAYER controls — never an opponent's (the forbidden FP). Two stack
// multiplicatively (Mana Reflection + Nyxbloom = ×6), exactly like two token doublers.
//
// TAP-ONLY (CR 605 ruling, Gatherer): the effect replaces mana from "tapping a permanent for mana". A
// sac-for-mana source (Treasure / Gold / Eldrazi Spawn — "Sacrifice this: Add …", NO {T}) is NOT tapped for
// mana, so it is NOT multiplied. manaModel applies this only to a source whose ability requires tapping
// (`requiresTap`), never to a `sacrifices` one-shot. FN-safe: a non-tap source is under-counted (its base
// amount), never over-produced.

/**
 * The mana-multiplier factor a card contributes, or null. Returns `{ factor }`:
 *   "If you tap a permanent for mana, it produces twice as much of that mana instead."  → { factor: 2 }
 *   "… it produces three times as much of that mana instead."                            → { factor: 3 }
 * Anchored to the exact "tap a permanent for mana" + "N times as much" template. "you" scope is intrinsic to
 * the template ("If YOU tap …"), so there's no global/opponent variant to model. Any other multiplier word
 * (none appears on a real card) → null (FN-safe: an unrecognized factor is never fabricated).
 */
const MANA_MULT_WORD = { twice: 2, "two times": 2, "three times": 3, "four times": 4 };
export function manaMultiplierProfile(card) {
  const o = oracleOf(card);
  if (!o) return null;
  // Must be the controller-scoped tap-for-mana replacement: "if you tap a permanent for mana, it produces
  // <N> as much of that mana instead". Capture the multiplier word and map it; an unmapped word → null.
  const m = o.match(/if you tap a permanent for mana, it produces (twice|two times|three times|four times) as much of that mana instead/);
  if (!m) return null;
  const factor = MANA_MULT_WORD[m[1]];
  return factor ? { factor } : null;
}

/**
 * The TAP-for-mana multiplier for mana `controllerId` produces by tapping: the product of every
 * manaMultiplierProfile factor over the permanents `controllerId` controls (×1 with none, ×2 Mana
 * Reflection, ×3 Nyxbloom, ×6 both). Controller-scoped — an opponent's Mana Reflection never multiplies
 * `controllerId`'s mana. Pure; applied ONCE to a source's produced amount at the tap site (manaSources).
 */
export function manaMultiplier(state, controllerId) {
  let mult = 1;
  for (const perm of state?.players?.[controllerId]?.battlefield || []) {
    const p = manaMultiplierProfile(perm.card);
    if (p) mult *= p.factor;
  }
  return mult;
}

/**
 * COVERAGE (whole-card residue): is sentence `s` (already lowercased) the MODELED mana-multiplier clause?
 * SINGLE SOURCE OF TRUTH shared with the coverage residue-strip (mirrors isModeledDoublerSentence) so "what
 * we strip for the whole-card check" can't drift from "what the runtime applies". Only the exact
 * controller-scoped tap-for-mana template the runtime multiplies returns true.
 */
export function isModeledManaMultiplierSentence(s) {
  return /if you tap a permanent for mana, it produces (?:twice|two times|three times|four times) as much of that mana instead/.test(s);
}

/**
 * Strip the MODELED mana-multiplier sentence from `oracle` for the coverage whole-card residue check (mirrors
 * stripModeledDoublerClauses). Removes ONLY that sentence, preserving everything else (incl. reminder-text
 * parentheticals). An unmodeled multiplier-shaped clause survives as residue → keeps its card off the native
 * tier (CREED).
 */
export function stripModeledManaMultiplierClauses(oracle) {
  return String(oracle || "").replace(
    /(^|[\n.]\s*)([^.\n]*\.)/g,
    (m, sep, sentence) => (isModeledManaMultiplierSentence(sentence.trim().toLowerCase()) ? sep : m),
  );
}
