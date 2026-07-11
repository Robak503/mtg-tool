/**
 * bloodchiefAscension.test.js — Bloodchief Ascension (SHELF S7, riding the GY-EVENT subsystem).
 *
 * Trigger 1: "At the beginning of each end step, if an opponent lost 2 or more life this turn, you may put
 *   a quest counter on this enchantment." — the lifeLostThisTurn ledger (stamped at the loseLife chokepoint,
 *   reset all-seats at untap) + the OPPONENT-LOST-LIFE intervening-if + the optional named self-counter.
 * Trigger 2: "Whenever a card is put into an opponent's graveyard from anywhere, if this enchantment has
 *   three or more quest counters on it, you may have that player lose 2 life. If you do, you gain 2 life."
 *   — the gyEnter event + the SOURCE-COUNTER-THRESHOLD live intervening-if + the gy-owner-drain composite
 *   atom ("that player" → the sentinel "the graveyard's owner", gyEnter-gated; optional yes/no covers the
 *   whole drain so the reflexive gain is both-or-neither).
 * CREED FP = a quest counter with no qualifying life loss, a drain below three counters, a drain aimed at
 * the wrong player, or a drain on the controller's own graveyard filling — all pinned here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, loseLife, millCards, resetCreatureDeathsAllPlayers,
} from "./gameState.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const BCA_ORACLE =
  "At the beginning of each end step, if an opponent lost 2 or more life this turn, you may put a quest counter on this enchantment. (Damage causes loss of life.)\nWhenever a card is put into an opponent's graveyard from anywhere, if this enchantment has three or more quest counters on it, you may have that player lose 2 life. If you do, you gain 2 life.";
const bcaCard = (id = "bca-card") => ({ id, name: "Bloodchief Ascension", type: "Enchantment", mana: "{B}", oracle: BCA_ORACLE });
const creatureCard = (id) => ({ id, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBca(state, counters = {}) {
  const bca = { ...createPermanent({ id: "bca", card: bcaCard(), controller: "user" }), counters };
  return { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [bca] } } };
}
function withLibrary(state, pid, cards) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], library: cards } } };
}
function resolveAll(state, { optionalYes = true } = {}) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while (((s.stack || []).length || s.pendingChoice) && guard++ < 40) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, optionalYes); continue; }
    if (s.pendingChoice) break; // an unexpected pause — surface via assertions
    s = resolveTopOfStack(s);
  }
  return s;
}

describe("detection + routing + classify", () => {
  it("both triggers detect with their intervening-ifs and route natively; the card classifies native-trigger", () => {
    const ds = detectTriggers(bcaCard());
    expect(ds.map((d) => d.event).sort()).toEqual(["endStep", "gyEnter"]);
    expect(ds.find((d) => d.event === "endStep").interveningIf).toBe("an opponent lost 2 or more life this turn");
    expect(ds.find((d) => d.event === "gyEnter")).toMatchObject({ gyCardType: null, gyOwnerScope: "opponent", interveningIf: "this enchantment has three or more quest counters on it" });
    for (const d of ds) expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(bcaCard())).toBe("native-trigger");
    expect(interveningIfParseable("an opponent lost 2 or more life this turn")).toBe(true);
    expect(interveningIfParseable("this enchantment has three or more quest counters on it")).toBe(true);
  });
});

describe("the lifeLostThisTurn ledger", () => {
  it("loseLife stamps the tally; the all-seats untap reset clears it", () => {
    let s = baseState();
    s = loseLife(s, { playerId: "ai1", amount: 3 });
    s = loseLife(s, { playerId: "ai1", amount: 1 });
    expect(s.players.ai1.lifeLostThisTurn).toBe(4);
    expect(s.players.ai2.lifeLostThisTurn ?? 0).toBe(0);
    s = resetCreatureDeathsAllPlayers(s);
    expect(s.players.ai1.lifeLostThisTurn).toBe(0);
  });

  it("the OPPONENT-LOST-LIFE condition reads the ledger against the controller's opponents", () => {
    let s = baseState();
    expect(evaluateInterveningIf(s, "an opponent lost 2 or more life this turn", "user")).toBe(false);
    s = loseLife(s, { playerId: "ai2", amount: 2 });
    expect(evaluateInterveningIf(s, "an opponent lost 2 or more life this turn", "user")).toBe(true);
    // the CONTROLLER's own loss never satisfies "an opponent lost"
    let s2 = loseLife(baseState(), { playerId: "user", amount: 5 });
    expect(evaluateInterveningIf(s2, "an opponent lost 2 or more life this turn", "user")).toBe(false);
  });
});

describe("the SOURCE-COUNTER-THRESHOLD condition", () => {
  it("reads the source permanent's live counters; a missing source can't confirm (null)", () => {
    const c = "this enchantment has three or more quest counters on it";
    let s = withBca(baseState(), { quest: 3 });
    expect(evaluateInterveningIf(s, c, "user", { sourcePermanentId: "bca" })).toBe(true);
    let s2 = withBca(baseState(), { quest: 2 });
    expect(evaluateInterveningIf(s2, c, "user", { sourcePermanentId: "bca" })).toBe(false);
    expect(evaluateInterveningIf(s2, c, "user", { sourcePermanentId: "gone" })).toBe(null);
    expect(evaluateInterveningIf(s2, c, "user", null)).toBe(null);
  });
});

describe("engine — trigger 1 (the end-step quest counter)", () => {
  it("an opponent down 2+ this turn → the end-step trigger resolves an optional quest counter", () => {
    let s = withBca(baseState());
    s = loseLife(s, { playerId: "ai1", amount: 2 });
    s = checkStepTriggers(s, "endStep");
    expect((s.pendingTriggers || []).length).toBe(1);
    const after = resolveAll(s);
    expect(after.players.user.battlefield[0].counters?.quest || 0).toBe(1);
  });

  it("no qualifying life loss → the flush drops the trigger (CR 603.4) — no counter ever", () => {
    let s = withBca(baseState());
    s = checkStepTriggers(s, "endStep");
    const after = resolveAll(s);
    expect(after.players.user.battlefield[0].counters?.quest || 0).toBe(0);
  });

  it("declining the optional leaves the counters unchanged", () => {
    let s = withBca(baseState());
    s = loseLife(s, { playerId: "ai1", amount: 2 });
    s = checkStepTriggers(s, "endStep");
    const after = resolveAll(s, { optionalYes: false });
    expect(after.players.user.battlefield[0].counters?.quest || 0).toBe(0);
  });
});

describe("engine — trigger 2 (the graveyard drain, CREED core)", () => {
  it("at 3+ quest counters, a card entering an opponent's graveyard drains THAT player for 2 and gains you 2", () => {
    let s = withBca(baseState(), { quest: 3 });
    s = withLibrary(s, "ai2", [creatureCard("m1")]);
    const before = { ai2: s.players.ai2.life, user: s.players.user.life, ai1: s.players.ai1.life };
    const after = resolveAll(millCards(s, { playerId: "ai2", count: 1 }));
    expect(after.players.ai2.life).toBe(before.ai2 - 2); // the graveyard's OWNER, not any other opponent
    expect(after.players.ai1.life).toBe(before.ai1);
    expect(after.players.user.life).toBe(before.user + 2); // the reflexive gain rides the same yes
  });

  it("below three quest counters the flush drops it — no drain", () => {
    let s = withBca(baseState(), { quest: 2 });
    s = withLibrary(s, "ai2", [creatureCard("m1")]);
    const before = s.players.ai2.life;
    const after = resolveAll(millCards(s, { playerId: "ai2", count: 1 }));
    expect(after.players.ai2.life).toBe(before);
  });

  it("a card entering the CONTROLLER's own graveyard never fires (gyOwnerScope opponent)", () => {
    let s = withBca(baseState(), { quest: 3 });
    s = withLibrary(s, "user", [creatureCard("m1")]);
    const lives = Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, p.life]));
    const after = resolveAll(millCards(s, { playerId: "user", count: 1 }));
    for (const [pid, p] of Object.entries(after.players)) expect(p.life).toBe(lives[pid]);
  });

  it("declining the drain changes no life totals", () => {
    let s = withBca(baseState(), { quest: 3 });
    s = withLibrary(s, "ai2", [creatureCard("m1")]);
    const before = { ai2: s.players.ai2.life, user: s.players.user.life };
    const after = resolveAll(millCards(s, { playerId: "ai2", count: 1 }), { optionalYes: false });
    expect(after.players.ai2.life).toBe(before.ai2);
    expect(after.players.user.life).toBe(before.user);
  });
});

// ── SHELF S7 audit catch (found via this slice's flip-diff): counter-cost mana honesty ────────────────
// A compound "{T}, Remove a <type> counter …" / "{T}, Tap an untapped creature …" mana line rode its {T}
// half through manaCostModelable and minted PHANTOM standing mana every turn (the consumable half never
// spent, never required). Pinned dead here; the Treasure compound ("{T}, Sacrifice this artifact") and
// plain dorks/filters stay fully modeled. classifyCard mirrors via stripCounterCostManaLines.
describe("counter-cost mana honesty (the phantom-mana class)", () => {
  it("a remove-counter-gated mana line is NOT a standing source (Sphere of the Suns class)", () => {
    expect(manaProduction({ name: "Sphere of the Suns", type: "Artifact", oracle: "{T}, Remove a charge counter from Sphere of the Suns: Add one mana of any color.\nSphere of the Suns enters the battlefield tapped and with three charge counters on it." })).toBe(null);
    expect(manaProduction({ name: "Springleaf Drum", type: "Artifact", oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." })).toBe(null);
    expect(classifyCard({ name: "Sphere of the Suns", type: "Artifact", mana: "{2}", oracle: "{T}, Remove a charge counter from Sphere of the Suns: Add one mana of any color.\nSphere of the Suns enters the battlefield tapped and with three charge counters on it." })).toBe("body-only");
  });
  it("the Treasure compound and plain dorks/filters keep producing", () => {
    expect(manaProduction({ name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." })).toMatchObject({ sacrifices: true, requiresTap: true });
    expect(manaProduction({ name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." })).toMatchObject({ colors: ["G"] });
    expect(manaProduction({ name: "Prismite", type: "Creature — Merfolk", oracle: "{2}: Add one mana of any color." })).toMatchObject({ amount: 1 });
  });
});
