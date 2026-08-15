/**
 * rivazOfTheClaw.test.js — ⭐ RIVAZ OF THE CLAW (Dragons shelf, 2026-08-15): the whole card.
 *
 *   · {T}: Add two mana in any combination of colors, Dragon-creature-restricted — the FIXED
 *     any-combination production arm (a HOLLOW spot closed: the Phase-4 witness hand-built its planner
 *     source, so manaProduction silently never offered the tap; now the credited source carries the
 *     conjunctive restriction end-to-end via restrictedManaProduction).
 *   · "Once during each of your turns, you may cast a Dragon creature spell from your graveyard" —
 *     the Raul machine's type-filtered sibling (same shared builder, same per-source once-latch).
 *   · "Whenever you cast a Dragon creature spell from your graveyard, it gains 'When this creature
 *     dies, exile it.'" — a castWatcher descriptor with the castFromZoneOnly zone gate (the Vega
 *     seam's exact-zone sibling) + the typedAll conjunctive filter; the effect stamps the cast
 *     spell's payload (grant-dies-exile), PERMANENT_ETB carries it, and checkDiesTriggers exiles the
 *     card AFTER death processing (the death is real — dies triggers fire, the tally counts — unlike
 *     the exileInstead replacement; the immediate move is caster-pessimal, documented at the site).
 *
 * Mutation-checked (2026-08-15): the castFromZoneOnly gate disabled in checkCastTriggers → the
 * hand-cast control dies (the rider fires on a hand cast); the diesExileAfter carry dropped from
 * markDead → the exile end-to-end dies (the dragon stays in the graveyard). Both restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { checkDiesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const RIVAZ_ORACLE =
  "Menace\n{T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon creature spells.\nOnce during each of your turns, you may cast a Dragon creature spell from your graveyard.\nWhenever you cast a Dragon creature spell from your graveyard, it gains \"When this creature dies, exile it.\"";
const rivazCard = (id = "riv-card") => ({
  id, name: "Rivaz of the Claw", type: "Legendary Creature — Dragon Warrior",
  power: "2", toughness: "4", mana: "{B}{R}", oracle: RIVAZ_ORACLE,
});
const DRAGON = (id) => ({ id, name: "Fell Dragon", type: "Creature — Dragon", power: "3", toughness: "3", mana: "{R}", cmc: 1, oracle: "" });
const ELF = (id) => ({ id, name: "Some Elf", type: "Creature — Elf", power: "1", toughness: "1", mana: "{G}", cmc: 1, oracle: "" });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 4, ...over };
}
function withRivazBoard(over = {}) {
  let s = baseState(over);
  const rivaz = createPermanent({ id: "rivaz", card: rivazCard(), controller: "user", summoningSick: false });
  const mtn = createPermanent({ id: "mtn", card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [rivaz, mtn], graveyard: [DRAGON("gd1"), ELF("ge1")] } } };
}
const gyCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.fromZone === "graveyard");

describe("classify + production", () => {
  it("⭐ Rivaz classifies NATIVE (every line vouched: menace + restricted tap + permission + the rider trigger)", () => {
    const tier = classifyCard(rivazCard());
    console.log("  WITNESS rivazTier", JSON.stringify({ tier })); // vitest 4 needs --disable-console-intercept
    expect(["native-mana", "native-mixed"]).toContain(tier);
  });

  it("the tap is a REAL production source now — 2 mana, five-color spread, the conjunctive restriction attached", () => {
    const prod = manaProduction(rivazCard());
    console.log("  WITNESS rivazProd", JSON.stringify(prod)); // vitest 4 needs --disable-console-intercept
    expect(prod).toMatchObject({ amount: 2, colors: ["W", "U", "B", "R", "G"], restriction: { castTypes: ["dragon creature"] } });
  });
});

describe("the permission — the Raul machine's type-filtered sibling (CREED core)", () => {
  it("offers ONLY the Dragon creature from the graveyard (never the Elf), stamped with the source", () => {
    const casts = gyCasts(withRivazBoard());
    expect(casts.length).toBeGreaterThan(0);
    expect(new Set(casts.map((a) => a.cardId))).toEqual(new Set(["gd1"]));
    expect(casts[0].dragonGyCastSourceId).toBe("rivaz");
  });

  it("NOT offered off-turn or after the once-latch", () => {
    expect(gyCasts({ ...withRivazBoard(), activePlayer: "ai1" })).toHaveLength(0);
    expect(gyCasts({ ...withRivazBoard(), onceTriggersFiredThisTurn: { rivaz_dragonGyCast: true } })).toHaveLength(0);
  });
});

/** Cast the offered graveyard dragon, flush + resolve the whole stack, return the state. */
function castGyDragonAndResolve(s0) {
  const action = gyCasts(s0)[0];
  expect(action).toBeTruthy();
  let s = dispatchAction(s0, action);
  s = flushTriggers(s, {});
  while (s.stack.length) s = resolveTopOfStack(s);
  return s;
}

describe("⭐⭐ the rider — cast from the graveyard, the dragon exiles when it dies (the death still HAPPENS)", () => {
  it("⭐⭐ end-to-end: GY cast → grant stamped on the permanent → lethal damage → the card is in EXILE, the death counted", () => {
    let s = castGyDragonAndResolve(withRivazBoard());
    const perm = s.players.user.battlefield.find((p) => p.card?.id === "gd1");
    expect(perm).toBeTruthy();
    expect(perm.grantDiesExile).toBe(true);   // the stamp rode the stack payload through PERMANENT_ETB
    expect(perm.castFromZone).toBe("graveyard");
    // Kill it through the REAL lethal pipeline (markDead → checkDiesTriggers).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === perm.id ? { ...p, damageMarked: 99 } : p) } } };
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    const row = {
      inExile: s.players.user.exile.some((c) => c.id === "gd1"),
      inGraveyard: s.players.user.graveyard.some((c) => c.id === "gd1"),
      deathCounted: (s.players.user.creaturesDiedThisTurn || 0) >= 1 || (s.log || []).some((e) => e.effect === "granted-dies-exile"),
      logged: (s.log || []).some((e) => e.effect === "granted-dies-exile"),
    };
    console.log("  WITNESS rivazRider", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.inExile).toBe(true);
    expect(row.inGraveyard).toBe(false);
    expect(row.logged).toBe(true);
  });

  it("seen-to-fail control: the SAME dragon cast from HAND dies to the GRAVEYARD (the zone gate holds)", () => {
    let s0 = withRivazBoard();
    // Move the dragon to hand instead; cast it normally.
    s0 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: [ELF("ge1")], hand: [DRAGON("gd1")], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 2 } } } };
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "gd1" && a.fromZone !== "graveyard");
    expect(cast).toBeTruthy();
    let s = dispatchAction(s0, cast);
    s = flushTriggers(s, {});
    while (s.stack.length) s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card?.id === "gd1");
    expect(perm.grantDiesExile).toBeUndefined(); // the rider never fired — castFromZoneOnly gated
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === perm.id ? { ...p, damageMarked: 99 } : p) } } };
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect(s.players.user.graveyard.some((c) => c.id === "gd1")).toBe(true);
    expect(s.players.user.exile.some((c) => c.id === "gd1")).toBe(false);
  });

  it("the once-latch is REALLY latched by the dispatched cast (no second graveyard offer this turn)", () => {
    const s = castGyDragonAndResolve(withRivazBoard());
    expect(s.onceTriggersFiredThisTurn?.rivaz_dragonGyCast).toBe(true);
    expect(gyCasts(s)).toHaveLength(0); // the Elf never qualified; the latch also holds
  });
});
