/**
 * railwayBrawler.test.js — POWER-SCALED triggering-creature counters (Railway Brawler — SHELF S7).
 *
 * "Whenever another creature you control enters, put X +1/+1 counters on it, where X is its power."
 * Seams: the otherCreatureYouControl scope joins NONSELF_TRIGGERING_SCOPES; the where-X-is-its-power form
 * rewrites to the counterClauses sentinel (target:"thatCreature" + countFor triggeringCreaturePower — the
 * ENTERING creature's LIVE power read at resolution, CR 608.2h, before these counters land).
 * CREED FP = wrong magnitude / wrong recipient / firing on self or an opponent's creature.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const BRAWLER_ORACLE =
  "Reach, trample\nWhenever another creature you control enters, put X +1/+1 counters on it, where X is its power.\nPlot {3}{G} (You may pay {3}{G} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)";
const brawlerCard = (id = "rb-card") => ({
  id, name: "Railway Brawler", type: "Creature — Rhino Warrior", power: "5", toughness: "5", mana: "{3}{G}{G}", oracle: BRAWLER_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
const creature = (id, controller, pt) =>
  createPermanent({ id, card: { name: id, type: "Creature — Beast", power: String(pt[0]), toughness: String(pt[1]), oracle: "" }, controller });

describe("detection + routing + classify", () => {
  it("the where-X-is-its-power form rewrites to the sentinel and routes natively; Brawler → native-trigger", () => {
    const [d] = detectTriggers(brawlerCard()).filter((t) => t.event === "etb");
    expect(d.scope).toBe("otherCreatureYouControl");
    expect(d.effectClause).toBe("put x +1/+1 counters on the triggering creature, where x is its power");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(classifyCard(brawlerCard())).toBe("native-trigger");
  });
});

describe("engine (CREED core — exact magnitude + recipient)", () => {
  it("an entering 3/3 gets exactly THREE +1/+1 counters; a 0-power enterer gets none", () => {
    let s = baseState();
    const brawler = createPermanent({ id: "rb", card: brawlerCard(), controller: "user" });
    const big = creature("big", "user", [3, 3]);
    s = withBattlefield(s, "user", [brawler, big]);
    s = checkEnterTriggers(s, big);
    s = resolveAll(s);
    expect(s.players.user.battlefield.find((p) => p.id === "big").counters["+1/+1"]).toBe(3);

    const zero = creature("zero", "user", [0, 4]);
    let s2 = withBattlefield(s, "user", [...s.players.user.battlefield, zero]);
    s2 = resolveAll(checkEnterTriggers(s2, zero));
    expect(s2.players.user.battlefield.find((p) => p.id === "zero").counters?.["+1/+1"]).toBeUndefined();
  });

  it("an OPPONENT's entering creature never fires it", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "rb", card: brawlerCard(), controller: "user" })]);
    const opp = creature("oc", "ai1", [4, 4]);
    s = withBattlefield(s, "ai1", [opp]);
    s = resolveAll(checkEnterTriggers(s, opp));
    expect(s.players.ai1.battlefield.find((p) => p.id === "oc").counters?.["+1/+1"]).toBeUndefined();
  });
});
