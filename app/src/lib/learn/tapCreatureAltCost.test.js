/**
 * tapCreatureAltCost.test.js — the TAP-A-CREATURE alternative cost (the 09-06 plan's stage ②, 2026-09-30):
 * "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost."
 * The Mercadian Masques Plains cycle — five carriers in the bundled oracle. Two flip native (Ramosian Rally,
 * Orim's Cure); Angelic Favor, Lashknife and Sivvi's Valor keep parking on their OTHER lines and are never offered
 * (a LOW program is never offered an alt cost — ALT-6).
 *
 * CREED pins: the Plains condition reads CONTROL on the live board (a tapped Plains still counts); a summoning-sick
 * creature IS a legal payment (CR 302.6 bars only the creature's own {T} abilities and its attacking); a tapped
 * creature never is; the dispatcher taps through tapPermanent (the becomes-tapped event is recorded) and fails fast
 * on a forged payment; the AI never taps its board for these non-interaction spells (human-only — the dominance
 * filter's safe false-negative). Orim's Cure was an UNPLANNED gain, so its RUNTIME is pinned end to end: cast by the
 * tap cost, resolved, and a real 5-damage hit loses 4 to the shield.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, consumePreventionShields } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TAP_LINE = "If you control a Plains, you may tap an untapped creature you control rather than pay this spell's mana cost.";
const RALLY = { id: "rally", name: "Ramosian Rally", type: "Instant", mana: "{3}{W}", colors: ["W"], cmc: 4,
  oracle: `${TAP_LINE}\nCreatures you control get +1/+1 until end of turn.` };
const CURE = { id: "cure", name: "Orim's Cure", type: "Instant", mana: "{1}{W}", colors: ["W"], cmc: 2,
  oracle: `${TAP_LINE}\nPrevent the next 4 damage that would be dealt to any target this turn.` };
const FAVOR = { id: "favor", name: "Angelic Favor", type: "Instant", mana: "{3}{W}", colors: ["W"], cmc: 4,
  oracle: `${TAP_LINE}\nCast this spell only during combat.\nCreate a 4/4 white Angel creature token with flying. Exile it at the beginning of the next end step.` };
const LASHKNIFE = { id: "lash", name: "Lashknife", type: "Enchantment — Aura", mana: "{1}{W}", colors: ["W"], cmc: 2,
  oracle: `${TAP_LINE}\nEnchant creature\nEnchanted creature has first strike.` };
const VALOR = { id: "valor", name: "Sivvi's Valor", type: "Instant", mana: "{2}{W}", colors: ["W"], cmc: 3,
  oracle: `${TAP_LINE}\nAll damage that would be dealt to target creature this turn is dealt to you instead.` };

const PLAINS = { name: "Plains", type: "Basic Land — Plains", oracle: "({T}: Add {W}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], cmc: 2, power: 2, toughness: 2, oracle: "" };
// ENGINE-SHAPED permanents (createPermanent stamps controller + the fields the trigger system reads — a bare object
// literal taps fine but never raises its own becomes-tapped trigger, which the Preacher pin below depends on).
const perm = (card, id, over = {}, controller = "user") =>
  ({ ...createPermanent({ id, card: { id, ...card }, controller, summoningSick: false }), ...over });

// The user holds priority on their own main phase (instants — the timing is immaterial to the cost).
function tapState({ hand = [], battlefield = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, manaPool: { ...s.players.user.manaPool, ...pool } } },
  };
}
const casts = (state, pid = "user") => filterActions(legalActionsForPlayer(state, pid), "cast-spell");
const altsOf = (actions, cardId) => actions.filter((a) => a.cardId === cardId && a.altCost);
const normalsOf = (actions, cardId) => actions.filter((a) => a.cardId === cardId && !a.altCost);
const bf = (state, id) => state.players.user.battlefield.find((p) => p.id === id);

describe("TAP-A-CREATURE — the whole cards classify", () => {
  it("⭐ Ramosian Rally and Orim's Cure are native spells; the other three keep parking on their other lines", () => {
    expect(classifyCard(RALLY)).toBe("native-spell");
    expect(classifyCard(CURE)).toBe("native-spell");
    for (const c of [FAVOR, LASHKNIFE, VALOR]) expect(classifyCard(c), c.name).not.toMatch(/^native/);
  });
});

describe("TAP-A-CREATURE — the offer", () => {
  it("⭐ one alt per UNTAPPED creature — a summoning-sick one included, a tapped one never; no mana spent", () => {
    const s = tapState({
      hand: [RALLY],
      battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1"), perm(BEAR, "b2", { summoningSick: true }), perm(BEAR, "b3", { tapped: true })],
    });
    const all = casts(s);
    const alts = altsOf(all, "rally");
    expect(alts.map((a) => a.altCost)).toEqual([
      { kind: "tapCreature", tapCreatureId: "b1", tapCreatureName: "Grizzly Bears" },
      { kind: "tapCreature", tapCreatureId: "b2", tapCreatureName: "Grizzly Bears" }, // CR 302.6 — summoning sickness is no bar
    ]);
    expect(alts.map((a) => a.altName)).toEqual(["tap Grizzly Bears", "tap Grizzly Bears"]); // the player-facing label
    expect(alts[0].cost).toEqual({ generic: 0 });
    expect(normalsOf(all, "rally").length).toBe(0); // {3}{W} is unaffordable off one Plains
  });

  it("the condition reads CONTROL: a TAPPED Plains still counts", () => {
    const s = tapState({ hand: [RALLY], battlefield: [perm(PLAINS, "p1", { tapped: true }), perm(BEAR, "b1")] });
    expect(altsOf(casts(s), "rally").length).toBe(1);
  });

  it("⛔ no Plains → no alt offer (an Island never satisfies the printed condition)", () => {
    const s = tapState({ hand: [RALLY], battlefield: [perm(ISLAND, "i1"), perm(BEAR, "b1")] });
    expect(altsOf(casts(s), "rally").length).toBe(0);
  });

  it("⛔ every creature already tapped → unpayable → no offer", () => {
    const s = tapState({ hand: [RALLY], battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1", { tapped: true })] });
    expect(casts(s).some((a) => a.cardId === "rally")).toBe(false);
  });

  it("⛔ Angelic Favor, Lashknife and Sivvi's Valor are NEVER offered — a LOW program gets no alt cost (ALT-6)", () => {
    const s = tapState({ hand: [FAVOR, LASHKNIFE, VALOR], battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1"), perm(BEAR, "b2")] });
    const all = casts(s);
    for (const id of ["favor", "lash", "valor"]) expect(altsOf(all, id), id).toEqual([]);
  });
});

describe("TAP-A-CREATURE — dispatch and resolution", () => {
  it("⭐⭐ Ramosian Rally: taps ONLY the chosen creature, spends no mana, and resolves +1/+1", () => {
    const s = tapState({ hand: [RALLY], battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1"), perm(BEAR, "b2")] });
    const alt = altsOf(casts(s), "rally").find((a) => a.altCost.tapCreatureId === "b1");
    const next = dispatchAction(s, alt);
    expect(bf(next, "b1").tapped).toBe(true);
    expect(bf(next, "b2").tapped).toBe(false);
    expect(bf(next, "p1").tapped).toBe(false); // no mana was paid
    expect(next.stack.map((o) => o.source.name)).toEqual(["Ramosian Rally"]);
    const resolved = resolveTopOfStack(next);
    const row = { b1: permanentPower(resolved, "b1"), b2: permanentPower(resolved, "b2") };
    console.log("  WITNESS tapAltRally", JSON.stringify(row)); // vitest 4: --disable-console-intercept
    expect(row).toEqual({ b1: 3, b2: 3 });
  });

  it("⭐⭐ Orim's Cure (the unplanned gain — its runtime, end to end): tap one bear, shield the other; a real 5 loses 4", () => {
    const s = tapState({ hand: [CURE], battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1"), perm(BEAR, "b2")] });
    const alt = altsOf(casts(s), "cure").find((a) => a.altCost.tapCreatureId === "b1" && a.targets?.[0]?.id === "b2");
    expect(alt).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, alt));
    const hit = consumePreventionShields(resolved, { targetKind: "creature", targetId: "b2", amount: 5 });
    const row = { tappedToPay: bf(resolved, "b1").tapped, unpreventedOf5: hit.amount };
    console.log("  WITNESS tapAltCure", JSON.stringify(row));
    expect(row).toEqual({ tappedToPay: true, unpreventedOf5: 1 });
  });

  it("⭐ the payment is a REAL becomes-tapped transition: Wanderbrine Preacher tapped to pay triggers (+2 life)", () => {
    // Real oracle (bundled Scryfall; the same fixture becomesTapped.test.js pins). tapPermanent records the event and the
    // cast's own flushTriggers stacks the Preacher's trigger ABOVE the Rally (CR 603.3b) — a raw `tapped: true` write
    // would tap it silently.
    const PREACHER = { name: "Wanderbrine Preacher", type: "Creature — Merfolk Cleric", mana: "{1}{W}", power: "2", toughness: "1",
      oracle: "Whenever this creature becomes tapped, you gain 2 life." };
    const s = tapState({ hand: [RALLY], battlefield: [perm(PLAINS, "p1"), perm(PREACHER, "wp")] });
    const alt = altsOf(casts(s), "rally").find((a) => a.altCost.tapCreatureId === "wp");
    const next = dispatchAction(s, alt);
    expect(next.stack.map((o) => o.source.name)).toEqual(["Ramosian Rally", "Wanderbrine Preacher"]);
    const lifeBefore = next.players.user.life;
    expect(resolveTopOfStack(next).players.user.life).toBe(lifeBefore + 2);
  });

  it("FAIL-FAST: a forged payment naming an already-tapped creature, or none, throws ALTCOST_UNPAID", () => {
    const s = tapState({ hand: [RALLY], battlefield: [perm(PLAINS, "p1"), perm(BEAR, "b1"), perm(BEAR, "b3", { tapped: true })] });
    const alt = altsOf(casts(s), "rally")[0];
    expect(() => dispatchAction(s, { ...alt, altCost: { kind: "tapCreature", tapCreatureId: "b3" } })).toThrowError(DispatcherError);
    expect(() => dispatchAction(s, { ...alt, altCost: { kind: "tapCreature", tapCreatureId: "b3" } })).toThrowError(/not an untapped creature/);
    expect(() => dispatchAction(s, { ...alt, altCost: { kind: "tapCreature" } })).toThrowError(/creature to tap/);
  });
});

describe("TAP-A-CREATURE — the AI", () => {
  it("⛔ never taps its board to cast these (non-interaction → human-only, the dominance filter's safe false-negative)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
      players: { ...base.players, ai: { ...base.players.ai, hand: [RALLY, CURE], battlefield: [perm(PLAINS, "ap1", {}, "ai"), perm(BEAR, "ab1", {}, "ai")] } },
    };
    const actions = legalActionsForPlayer(s, "ai");
    expect(actions.some((a) => a.altCost?.kind === "tapCreature")).toBe(true); // offered to the seat…
    const pick = pickAction(s, "ai", actions, { archetype: "midrange", policy: null });
    expect(pick?.altCost).toBeUndefined(); // …never taken by the AI
  });
});
