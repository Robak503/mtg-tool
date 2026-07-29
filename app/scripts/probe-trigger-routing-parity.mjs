#!/usr/bin/env node
/**
 * probe-trigger-routing-parity.mjs — does the RUNTIME route the triggers the CLASSIFIER counted?
 *
 * ⭐ WHY THIS TIER. `probe-classifier-runtime-parity` covers native-spell / activated / equipment and skips
 * native-trigger — the LARGEST native tier, and the one where both of this run's engine bugs lived (the
 * Aurelia turn-loop and the "for the first time each turn" over-fire).
 *
 * ⭐ WHY IT IS NOT CIRCULAR, which is the whole design problem. The classifier's verdict comes from
 * `triggerRouting.triggerRoutesNatively`, which is a HAND-WRITTEN MIRROR of `gameEngine.buildTriggerStack`'s
 * α1 allowlist — its own comment says "Mirror buildTriggerStack's α1 ALLOWLIST EXACTLY". A probe that called
 * that mirror would prove nothing. This one calls **buildTriggerStack itself** and reads the runtime's own
 * observable answer:
 *
 *     payload.resolver === "manual"   → the runtime handed it to the ARBITER
 *     any other payload               → the runtime resolves it NATIVELY
 *
 * A card the classifier calls `native-trigger` whose descriptor comes back "manual" is a DIVERGENCE: the
 * metric counted a routing the engine will not perform.
 *
 * ⛔⛔ THE GHOST-AVOIDANCE RULE, and the first draft of this probe got it WRONG. A sibling audit over
 * non-land permanents produced four "dead cards" that were all harness artifacts. This probe walked into the
 * same trap: it reported 6 divergences, and Aura Shards was measurably a ghost — with an opponent artifact
 * on the board it routes natively (`effect-program`); with none it returns "manual". The runtime
 * DELIBERATELY CONFLATES several outcomes into that one return:
 *     null / no stack object     → no legal target on THIS board (CR 603.3c)
 *     TRIGGER_CONDITION_NOT_MET  → intervening-if false on THIS board (CR 603.4)
 *     manual (NO_SAFE_TARGET)    → the α1 chooser found no SAFE target on THIS board
 *     manual (unreadable if)     → the intervening-if could not be evaluated in THIS context
 *     manual (α1 refusal)        → ⭐ the only one that is a ROUTING claim
 * The first four are board/context-dependent and are indistinguishable from the fifth in the returned
 * object — they are byte-identical `{ payload: { resolver: "manual" }, targets: [] }`.
 *
 * ⭐ SO THE PROBE ONLY ASKS WHERE THE ANSWER IS SOUND: a descriptor is examined only when its program needs
 * NO chosen target (so NO_SAFE_TARGET is unreachable) and it carries NO intervening-if (so the unreadable-
 * condition path is unreachable). For those, "manual" can only mean the α1 allowlist refused — a real
 * divergence. Everything else is counted as `notSoundlyMeasurable` and reported as such, never as a finding.
 * A probe that cannot separate its signal from its harness must narrow until it can, or say so.
 *
 * ⭐ COVERAGE WITNESS (the hollow-gate law — a green probe that was never seen to fail proves nothing).
 * Making the classifier over-claim (`triggerRoutesNatively` forced to true) makes this probe report **68**
 * divergences at --top=1500; restoring it returns **0**. So the zero is a measurement, not a silence.
 *
 * RESULT at --top=4000, 2026-07-29: 324 soundly measurable, **0 divergent** — the classifier's mirror and
 * the runtime's α1 allowlist agree everywhere this can be checked. 84 descriptors are targeted and/or
 * conditional and sit outside the sound subset; closing that gap needs a per-card board, which is exactly
 * the harness that produced ghosts elsewhere.
 *
 * Read-only / local-only (needs MTG_APP_ROOT → a tree carrying the oracle index). Not in CI.
 */
import { allCards, publicCard } from "../src/lib/server/cardIndex.js";
import { classifyCard } from "../src/lib/learn/coverage.js";
import { detectTriggers } from "../src/lib/learn/triggers.js";
import { parseEffectClause } from "../src/lib/learn/effects/parser.js";
import { programNeedsChosenTarget } from "../src/lib/learn/effects/programQueries.js";
import { flushTriggers, chooseTriggerTargets } from "../src/lib/learn/gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "../src/lib/learn/gameState.js";

const LIMIT = Number(process.argv.find((a) => a.startsWith("--top="))?.slice("--top=".length)) || 4000;

function boardWith(pc) {
  _resetIdsForTests();
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "S", controller: "user", card: pc, summoningSick: false });
  const pal = createPermanent({ id: "P", controller: "user", summoningSick: false, card: { id: "cp", name: "Pal", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } });
  const foe = createPermanent({ id: "E", controller: "ai", summoningSick: false, card: { id: "ce", name: "Foe", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, life: 40, battlefield: [self, pal], hand: [], library: [{ id: "l1", name: "Forest", type: "Basic Land — Forest", oracle: "" }], graveyard: [] },
      ai: { ...s.players.ai, life: 40, battlefield: [foe] },
    },
  };
}

const cs = await allCards();
let checked = 0, boardDependent = 0, threw = 0, notSoundlyMeasurable = 0;
const divergent = [];

for (const c of cs) {
  if (!Number.isInteger(c.edhrec_rank) || c.edhrec_rank > LIMIT) continue;
  const t = c.type_line || c.type || "";
  if (/\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction)\b/.test(t)) continue;
  if (!/\b(Creature|Artifact|Enchantment)\b/.test(t)) continue;   // must be a permanent we can put on a board
  const pc = publicCard(c);
  if (classifyCard(pc) !== "native-trigger") continue;

  const state = boardWith(pc);
  const source = { permanentId: "S", cardId: pc.id, name: pc.name };
  for (const descriptor of detectTriggers(pc)) {
    // SOUNDNESS FILTER (see the header): only a targetless, condition-free descriptor can produce a
    // "manual" that means the α1 allowlist refused. Anything else is unmeasurable here, not a finding.
    const prog = descriptor.effectClause
      ? parseEffectClause(descriptor.effectClause, "Instant", { hasX: !!descriptor.effectHasX, sourceScoped: true })
      : null;
    if (descriptor.interveningIf || !prog || programNeedsChosenTarget(prog)) { notSoundlyMeasurable++; continue; }
    checked++;
    // Drive the PUBLIC flush rather than the private builder: same routing decision, more of the real path,
    // and no source change made purely to let a probe reach in.
    let after;
    try {
      const seeded = { ...state, pendingTriggers: [{ event: descriptor.event, source, controller: "user", descriptor, context: {} }] };
      after = flushTriggers(seeded, { chooseTargets: chooseTriggerTargets });
    } catch { threw++; continue; }
    const obj = (after?.stack || [])[0];
    // No stack object at all = the trigger was DROPPED for a board reason (no legal target, CR 603.3c; or an
    // intervening-if that is false here, CR 603.4). Board-dependent, never a routing claim.
    if (!obj) { boardDependent++; continue; }
    if (obj.payload?.resolver === "manual") {
      divergent.push([c.edhrec_rank, pc.name, descriptor.event, String(descriptor.effectClause || "").slice(0, 62)]);
    }
  }
}

divergent.sort((a, b) => a[0] - b[0]);
console.log(`soundly measurable descriptors: ${checked} · not soundly measurable (targeted / conditional): ${notSoundlyMeasurable} · dropped for board reasons: ${boardDependent} · threw: ${threw}`);
console.log(`\nDIVERGENT — classifier says native-trigger, runtime routes to the ARBITER: ${divergent.length}`);
for (const [r, n, e, clause] of divergent.slice(0, 30)) console.log(String(r).padStart(6), n, "|", e, "|", clause);
if (!divergent.length) console.log("   (parity holds)");
