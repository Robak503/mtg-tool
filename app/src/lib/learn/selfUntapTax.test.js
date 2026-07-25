/**
 * selfUntapTax.test.js — BLITZ UP-1: the UPKEEP PAY-OR-UNTAP tax family (the "doesn't untap during your untap
 * step" self-lock whose escape is an upkeep "you may pay {cost}. If you do, untap this creature").
 *
 * The whole card is two modeled pieces that had to be wired together to be honest:
 *   1. The CONTINUOUS static "This creature doesn't untap during your untap step." — NOW modeled in the runtime
 *      (gameState.untapAll → selfPreventsUntap SKIPS the source at the untap step) and treated as covered by the
 *      classifier (coverage.js strips the self-anchored line). Before this slice the runtime untapped the source
 *      for free, so flipping the card native would have been a false positive (the pay-to-untap upkeep would be a
 *      meaningless no-op). Metric mirrors runtime (CREED).
 *   2. The upkeep escape "At the beginning of your upkeep, you may pay {cost}. If you do, untap this creature." —
 *      the pre-existing optional-mana-payment atom (matchOptionalManaPayment), whose "untap this creature" payoff
 *      binds to the SOURCE (target:"self" → ctx.sourceId).
 *
 * The same runtime fix also unblocks the sibling shape "…doesn't untap… / Whenever <event>, untap this creature."
 * (Dwarven Patrol / Famished Paladin / Galvanic Juggernaut / Lurking Roper) — the triggered-untap tax — since the
 * only thing that kept them body-only was the self-lock residue.
 *
 * Real oracle fixtures (bundled Scryfall, 2026-07-17); every carrier below was audited by name in the UP-1
 * flip-diff (8 GAINED — Brass Gnat/Man, Goblin Dirigible/War Wagon, Dwarven Patrol, Famished Paladin, Galvanic
 * Juggernaut, Lurking Roper — LOST=0). Mana Vault / Island Fish Jasconius PARK (extra unmodeled lines — see below).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, untapAll, _resetIdsForTests } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice, autoPickOptionalManaPayment } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── REAL current Oracle wording (verified against the bundled corpus) ──────────────────────────
const BRASS_MAN = { name: "Brass Man", type: "Artifact Creature — Construct", mana: "{1}", power: 1, toughness: 3,
  oracle: "This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {1}. If you do, untap this creature." };
const BRASS_GNAT = { name: "Brass Gnat", type: "Artifact Creature — Insect", mana: "{1}", power: 0, toughness: 1,
  oracle: "Flying\nThis creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {1}. If you do, untap this creature." };
const GOBLIN_WAR_WAGON = { name: "Goblin War Wagon", type: "Artifact Creature — Juggernaut", mana: "{4}", power: 3, toughness: 3,
  oracle: "This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {2}. If you do, untap this creature." };
const GOBLIN_DIRIGIBLE = { name: "Goblin Dirigible", type: "Artifact Creature — Construct", mana: "{4}", power: 3, toughness: 2,
  oracle: "Flying\nThis creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this creature." };
const FAMISHED_PALADIN = { name: "Famished Paladin", type: "Creature — Vampire Knight", mana: "{1}{W}", power: 2, toughness: 2,
  oracle: "This creature doesn't untap during your untap step.\nWhenever you gain life, untap this creature." };
// PARK fixtures (extra unmodeled lines block the whole card, CREED):
const MANA_VAULT = { name: "Mana Vault", type: "Artifact", mana: "{1}",
  oracle: "This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}." };
const ISLAND_FISH = { name: "Island Fish Jasconius", type: "Creature — Fish", mana: "{5}{U}{U}", power: 6, toughness: 8,
  oracle: "This creature doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {U}{U}{U}. If you do, untap this creature.\nThis creature can't attack unless defending player controls an Island.\nWhen you control no Islands, sacrifice this creature." };

// ─── shared runtime harness ─────────────────────────────────────────────────────
const forest = (id) => createPermanent({ id, card: { id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" });
function boardWith(card, { tapped = true, forests = 1 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: { id: "c-src", ...card }, controller: "user" });
  src.tapped = tapped;
  const bf = [src];
  for (let i = 0; i < forests; i++) bf.push(forest(`F${i}`));
  return { ...s, activePlayer: "user", priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
// Fire the your-upkeep step and resolve the stack down to the pay-choice pause (mirrors advanceUntilDecision).
function fireUpkeep(state) {
  let s = checkStepTriggers(state, "upkeep");
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (s.stack?.length && !s.pendingChoice && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}
const srcOf = (s) => findPermanent(s, "src").permanent;

// ─── 1. PARSER — the two modeled pieces ─────────────────────────────────────────
describe("UP-1 parser — the upkeep pay-to-untap escape is one HIGH optional-mana-payment atom", () => {
  it("'you may pay {1}. If you do, untap this creature' → HIGH optional-mana-payment carrying the untap-self payoff", () => {
    const p = parseEffectClause("you may pay {1}. If you do, untap this creature", "Artifact");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "optional-mana-payment", cost: { kind: "mana", mana: { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } },
        effectAtoms: [{ op: "untap", target: "self" }], targetType: null },
    ]);
  });
  it("the bare 'untap this creature' payoff is a modeled untap-self atom; 'untap this artifact' is NOT (why Mana Vault parks)", () => {
    expect(programConfidence(parseEffectClause("untap this creature", "Artifact"))).toBe("high");
    expect(programConfidence(parseEffectClause("untap this artifact", "Artifact"))).toBe("low");
  });
});

// ─── 2. RUNTIME — the untap step honors the self-lock ───────────────────────────
describe("UP-1 runtime — untapAll SKIPS a self 'doesn't untap during your untap step' permanent", () => {
  it("a tapped Brass Man stays tapped through its controller's untap step (self-lock honored)", () => {
    const after = untapAll(boardWith(BRASS_MAN, { tapped: true, forests: 0 }), { playerId: "user" });
    expect(srcOf(after).tapped).toBe(true);               // the lock held — NOT untapped for free
  });
  it("the triggered-untap sibling (Famished Paladin) is locked the same way", () => {
    const after = untapAll(boardWith(FAMISHED_PALADIN, { tapped: true, forests: 0 }), { playerId: "user" });
    expect(srcOf(after).tapped).toBe(true);
  });
  it("a normal tapped permanent (a Forest, no self-lock) DOES untap — the skip is not universal", () => {
    const s = boardWith(BRASS_MAN, { tapped: true, forests: 1 });
    s.players.user.battlefield.find((p) => p.id === "F0").tapped = true;   // tap the Forest too
    const after = untapAll(s, { playerId: "user" });
    expect(after.players.user.battlefield.find((p) => p.id === "F0").tapped).toBe(false); // Forest untaps
    expect(srcOf(after).tapped).toBe(true);                                              // Brass Man stays locked
  });
});

// ─── 3. RUNTIME — the upkeep pay-to-untap escape through checkStepTriggers ───────
describe("UP-1 runtime — the pay-or-untap upkeep trigger fires, pauses, and settles honestly", () => {
  it("fires at your upkeep and PAUSES on an optional-mana-payment choice with the printed cost ({2} for Goblin War Wagon)", () => {
    const paused = fireUpkeep(boardWith(GOBLIN_WAR_WAGON, { tapped: true, forests: 2 }));
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user" });
    expect(paused.pendingChoice.cost.mana.generic).toBe(2);
    expect(srcOf(paused).tapped).toBe(true);              // still tapped — the choice hasn't been made
  });
  it("PAY (affordable): the {1} is paid (a Forest taps) AND the source untaps", () => {
    const paused = fireUpkeep(boardWith(BRASS_MAN, { tapped: true, forests: 1 }));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.pendingChoice).toBeFalsy();
    expect(settled.players.user.battlefield.find((p) => p.id === "F0").tapped).toBe(true); // paid {1}
    expect(srcOf(settled).tapped).toBe(false);            // the escape ran — source untapped
  });
  it("DECLINE: no mana spent (Forest untouched) AND the source stays tapped", () => {
    const paused = fireUpkeep(boardWith(BRASS_MAN, { tapped: true, forests: 1 }));
    const settled = resolveOptionalManaPaymentChoice(paused, false);
    expect(settled.pendingChoice).toBeFalsy();
    expect(settled.players.user.battlefield.find((p) => p.id === "F0").tapped).toBe(false);
    expect(srcOf(settled).tapped).toBe(true);
  });
  it("CREED — pay=true but UNAFFORDABLE fabricates no mana and the source is NOT untapped (never a free untap)", () => {
    const paused = fireUpkeep(boardWith(BRASS_MAN, { tapped: true, forests: 0 }));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(srcOf(settled).tapped).toBe(true);             // could not pay → the untap payoff never ran
  });
});

// ─── 4. AI POLICY — pay-if-able (untapping the tapped source is pure upside) ─────
describe("UP-1 AI policy — autoPickOptionalManaPayment pays iff the cost is affordable", () => {
  it("pays when a Forest covers {1}; declines when broke", () => {
    const afford = fireUpkeep(boardWith(BRASS_MAN, { tapped: true, forests: 1 }));
    const broke = fireUpkeep(boardWith(BRASS_MAN, { tapped: true, forests: 0 }));
    expect(autoPickOptionalManaPayment(afford, afford.pendingChoice)).toBe(true);
    expect(autoPickOptionalManaPayment(broke, broke.pendingChoice)).toBe(false);
  });
});

// ─── 5. COVERAGE — native flips + CREED park pins ───────────────────────────────
describe("UP-1 coverage — the self-untap tax family flips native-trigger; extra-line carriers PARK", () => {
  it("the pay-to-untap creatures flip native-trigger (Brass Man / Brass Gnat / Goblin War Wagon / Goblin Dirigible)", () => {
    expect(classifyCard(BRASS_MAN)).toBe("native-trigger");
    expect(classifyCard(BRASS_GNAT)).toBe("native-trigger");
    expect(classifyCard(GOBLIN_WAR_WAGON)).toBe("native-trigger");
    expect(classifyCard(GOBLIN_DIRIGIBLE)).toBe("native-trigger");
  });
  it("the triggered-untap sibling flips too (Famished Paladin) — same self-lock, a modeled untap-this-creature trigger", () => {
    expect(classifyCard(FAMISHED_PALADIN)).toBe("native-trigger");
  });
  it("CREED PARK — Mana Vault stays body-only (draw-step self-damage trigger + {T}:Add are unmodeled; 'untap this artifact' is LOW anyway)", () => {
    expect(classifyCard(MANA_VAULT)).toBe("body-only");
  });
  it("Island Fish Jasconius FLIPS now — both lines this pin named as blockers are modeled (2026-07-25)", () => {
    // NOTE: the two stated blockers were islandhome ("can't attack unless defending player controls an
    // Island", since built) and "When you control no Islands, sacrifice this creature" — a CR 603.8 STATE
    // TRIGGER, built this slice (stateTrigger.test.js). The self-untap tax this file actually guards is
    // untouched; only its companion lines became modeled, so the park reason is gone rather than waived.
    expect(classifyCard(ISLAND_FISH)).toMatch(/^native/);
  });
  it("CREED — the enters-tapped-AND-no-untap combined sentence does NOT flip (the self-anchor is a standalone line)", () => {
    // coverage.test.js:308 guard: "This creature enters tapped and doesn't untap during your untap step." is ONE
    // conjoined sentence, not the standalone self-lock line the strip matches → stays body-only (SAFE).
    expect(classifyCard({ name: "Perma-Tapped Zombie", type: "Creature — Zombie",
      oracle: "This creature enters tapped and doesn't untap during your untap step." })).not.toBe("native-body");
  });
});

describe("DESK AUDIT — the 'your NEXT untap step' one-shot rider is NOT the continuous lock", () => {
  // 17 corpus permanents print "doesn't untap during your next untap step" INSIDE an activated ability
  // (the Cloudcrest Lake / Vec Townships slow-dual family; Homarid Warrior; Reveka) — a one-shot rider of
  // that activation, not a static. Matching it froze those lands forever after one tap (a live FP the
  // flip-diff never sees). Pinned on the real bundled oracle.
  it("Cloudcrest Lake (real oracle) untaps normally at the untap step", () => {
    const lake = { name: "Cloudcrest Lake", type: "Land",
      oracle: "{T}: Add {C}.\n{T}: Add {W} or {U}. This land doesn't untap during your next untap step." };
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const perm = { ...createPermanent({ id: "lake", card: lake, controller: "user" }), tapped: true };
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm] } } };
    const after = untapAll(s, { playerId: "user" });
    expect(findPermanent(after, "lake").permanent.tapped).toBe(false); // NOT frozen — the rider is one-shot
  });
});
