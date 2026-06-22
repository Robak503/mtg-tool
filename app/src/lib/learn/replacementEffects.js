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

/**
 * Classify a single permanent's card into its doubler profile, or null. Parses by sentence so a card with
 * BOTH a counter clause and a token clause (Doubling Season / Primal Vigor / Vorinclex) is captured fully.
 * Returns { counter: {op, factor, kind, scope}|null, halvesOpponents: bool, token: {factor, scope}|null }.
 *   - counter.op: "multiply" (factor 2) | "additive" (factor is the +N, e.g. 1)
 *   - counter.kind: "+1/+1" (only +1/+1 counters) | "any" (any counter type)
 *   - scope: "you" | "global"
 */
export function doublerProfile(card) {
  const o = oracleOf(card);
  if (!o) return null;
  // CLASS doublers are LEVEL-gated (Innkeeper's Talent: the doubling is its Level-3 ability). The runtime layer
  // can't track Class levels, so an always-on doubler would over-apply from Level 1 — a forbidden FP. Skip the
  // whole card (FN-safe: under-model the rare Class doubler rather than mis-resolve every counter while it's
  // under-leveled).
  const type = String(card?.type ?? card?.type_line ?? "").toLowerCase();
  if (/\bclass\b/.test(type)) return null;
  let counter = null;
  let token = null;
  let halvesOpponents = false;
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
        //  • neither → a SELF-NAME recipient ("would be put on Mowu") or other restricted form. Modeling that
        //    as global would leak the doubler onto EVERY player (Mowu's +1 hitting all counters) — a forbidden
        //    FP. Leave scope null → no counter profile (FN-safe: a self-only doubler is under-modeled, never
        //    over-applied).
        let scope = null;
        if (/you control/.test(s) || /you would put/.test(s) || /your team controls?/.test(s)) scope = "you";
        else if (/\b(?:put on|on) (?:a|an|each|any|that) (?:creature|permanent|planeswalker|player|spacecraft|planet)\b/.test(s)) scope = "global";
        if (scope) {
          if (/twice that many/.test(s)) counter = { op: "multiply", factor: 2, kind, scope };
          else if (/that many plus (one|1)/.test(s)) counter = { op: "additive", factor: 1, kind, scope };
        }
      }
    }
    if (tokenCreate && /twice that many/.test(s)) {
      token = { factor: 2, scope: /under your control|you control/.test(s) ? "you" : "global" };
    }
  }
  if (!counter && !token && !halvesOpponents) return null;
  return { counter, token, halvesOpponents };
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
    if (!counterClause && !tokenClause) return false; // an unmodeled non-doubling sentence → not a pure doubler
  }
  return true;
}

/** Every (ownerId, profile) doubler permanent across ALL battlefields. */
function allDoublers(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      const profile = doublerProfile(perm.card);
      if (profile) out.push({ ownerId: pid, profile });
    }
  }
  return out;
}

/** A counter doubler applies to a recipient when it is global, or "you" and the owner controls the recipient. */
function counterDoublerApplies(d, ownerId, recipientId) {
  if (!d) return false;
  return d.scope === "global" || ownerId === recipientId;
}

/**
 * The final counter amount put on `recipientControllerId`'s permanent after all doublers, given a base amount
 * and the counter TYPE being added (e.g. "+1/+1", "loyalty", "rad"). CR 616.1e greedy-max ordering: additives
 * first, then multiplicatives; then a Vorinclex opponent-halve (floor) last (the affected player orders to
 * maximize, so doubling-then-halving beats halving-then-doubling). Floors at 0. A "+1/+1"-only doubler is
 * skipped for any non-"+1/+1" counter type.
 */
export function applyCounterDoubling(state, recipientControllerId, counterType, baseAmount) {
  const base = Math.max(0, Number(baseAmount) || 0);
  if (base === 0) return 0;
  let additive = 0;
  let multiplier = 1;
  let halve = false;
  for (const { ownerId, profile } of allDoublers(state)) {
    const c = profile.counter;
    if (c && (c.kind !== "+1/+1" || counterType === "+1/+1") && counterDoublerApplies(c, ownerId, recipientControllerId)) {
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
