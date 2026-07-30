/**
 * grantedRiot.test.js — RIOT GRANTED BY A BATTLEFIELD SOURCE (CR 702.136a).
 * Rhythm of the Wild (#211, in two decks on the shelf) · Uncivil Unrest.
 *
 * CR 702.136a, read out of cr_current.json: *"Riot is a static ability. 'Riot' means 'You may have this
 * permanent enter with an additional +1/+1 counter on it. If you don't, it gains haste.'"*
 *
 * ⭐⛔ WHY THIS IS NOT A GRANTED KEYWORD, WHICH IS THE WHOLE DESIGN DECISION. Riot is an AS-ENTERS
 * replacement, so it must be known BEFORE the permanent is on the battlefield — and a layer-6 addKeyword only
 * exists AFTER. Adding `riot` to GRANTABLE_STATIC_KEYWORDS would have parked the keyword on a permanent whose
 * entry replacement had already been and gone: the card reads native, the keyword is visible, and the effect
 * never happens. That is precisely the "classifies native, does nothing" class the non-creature-target drift
 * guard was built for one slice ago, so it got refused here rather than discovered later.
 *
 * The runtime is an ENTRY-TIME BATTLEFIELD SCAN (resolvers.grantedRiotCount), mirroring applyCounterDoubling
 * — which reads printed doubler text off the battlefield at the moment counters are placed, for the same
 * reason. Metric and runtime share the SAME anchored clause, so they cannot drift.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle, read out of the bundled index.
const RHYTHM = { name: "Rhythm of the Wild", type: "Enchantment", mana: "{1}{R}{G}",
  oracle: "Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)" };
const SPIDER_PUNK_GRANT = "Other Spiders you control have riot.";

const entered = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];
const plainCreature = (name = "Grizzly Bears") => ({ id: `c-${name}`, name, type: "Creature — Bear", power: "2", toughness: "2", mana: "{1}{G}", oracle: "" });

function boardWith(oracleLines, { activePlayer = "user", phase = "precombat-main", step = "main", controller = "user" } = {}) {
  const s = { ...createGameState({ userDeck: [], aiDeck: [] }), turn: 3, activePlayer, phase, step };
  if (!oracleLines) return s;
  const src = createPermanent({ id: "src", card: { id: "c-src", name: "Grantor", type: "Enchantment", oracle: oracleLines }, controller });
  return { ...s, players: { ...s.players, [controller]: { ...s.players[controller], battlefield: [src] } } };
}

describe("⭐ RUNTIME — a creature entering under Rhythm of the Wild really gets riot", () => {
  it("HASTE branch: on the controller's own precombat main it enters with haste", () => {
    const s = enterPermanent(boardWith(RHYTHM.oracle), plainCreature(), "user");
    const p = entered(s);
    expect(permanentHasKeyword(s, p.id, "haste")).toBe(true);
    expect(p.counters?.["+1/+1"] || 0).toBe(0);
  });

  it("COUNTER branch: on an opponent's turn haste buys nothing, so it enters with the +1/+1 counter", () => {
    const s = enterPermanent(boardWith(RHYTHM.oracle, { activePlayer: "ai" }), plainCreature(), "user");
    const p = entered(s);
    expect(p.counters?.["+1/+1"]).toBe(1);
    expect(permanentHasKeyword(s, p.id, "haste")).toBe(false);
  });

  it("⭐ CREED CONTROL — WITHOUT the grant on the battlefield the same creature gets neither", () => {
    const s = enterPermanent(boardWith(null), plainCreature(), "user");
    const p = entered(s);
    expect(p.counters?.["+1/+1"] || 0).toBe(0);
    expect(permanentHasKeyword(s, p.id, "haste")).toBe(false);
  });

  it("CR 702.136b — two grants work separately (two counters on the opponent's turn)", () => {
    const s0 = boardWith(RHYTHM.oracle, { activePlayer: "ai" });
    const second = createPermanent({ id: "src2", card: { id: "c-src2", name: "Uncivil Unrest", type: "Enchantment", oracle: "Nontoken creatures you control have riot." }, controller: "user" });
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, second] } } };
    expect(entered(enterPermanent(s1, plainCreature(), "user")).counters?.["+1/+1"]).toBe(2);
  });
});

describe("⛔ CREED — the three gates that keep the grant honest", () => {
  it("a TOKEN gets nothing — the printed grant says 'Nontoken'", () => {
    const s = enterPermanent(boardWith(RHYTHM.oracle, { activePlayer: "ai" }), { ...plainCreature("Soldier"), token: true }, "user");
    expect(entered(s).counters?.["+1/+1"] || 0).toBe(0);
  });

  it("a NON-CREATURE permanent gets nothing", () => {
    const s = enterPermanent(boardWith(RHYTHM.oracle, { activePlayer: "ai" }), { id: "c-ring", name: "Sol Ring", type: "Artifact", oracle: "" }, "user");
    expect(entered(s).counters?.["+1/+1"] || 0).toBe(0);
  });

  it("an OPPONENT's Rhythm grants nothing to your creature ('you control')", () => {
    const s0 = boardWith(RHYTHM.oracle, { activePlayer: "ai", controller: "ai" });
    const s = enterPermanent(s0, plainCreature(), "user");
    expect(entered(s).counters?.["+1/+1"] || 0).toBe(0);
  });

  it("⛔ Spider-Punk's SUBTYPE-scoped grant is not modeled and must not fire", () => {
    const s = enterPermanent(boardWith(SPIDER_PUNK_GRANT, { activePlayer: "ai" }), plainCreature("Spider Cub"), "user");
    expect(entered(s).counters?.["+1/+1"] || 0).toBe(0);
  });
});

describe("coverage", () => {
  it("Rhythm of the Wild flips native-static", () => {
    expect(classifyCard(RHYTHM)).toBe("native-static");
  });

  it("⛔ Spider-Punk stays parked — its grant clause is not the modeled one", () => {
    expect(classifyCard({ name: "Spider-Punk", type: "Legendary Creature — Spider Human Hero", power: "3", toughness: "3", mana: "{1}{R}{G}",
      oracle: "Riot\nOther Spiders you control have riot.\nSpells and abilities can't be countered.\nDamage can't be prevented." }))
      .not.toMatch(/^native/);
  });

  it("⛔ an unmodeled companion line still parks the card", () => {
    expect(classifyCard({ ...RHYTHM, name: "Fake Rhythm",
      oracle: RHYTHM.oracle + "\nWhenever a player consults an oracle, interpret its riddle however you like." }))
      .not.toMatch(/^native/);
  });
});
