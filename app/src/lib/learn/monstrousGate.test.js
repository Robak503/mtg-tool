/**
 * monstrousGate.test.js — "As long as this creature is MONSTROUS, it has <keyword>" (CR 701.32d):
 * Fleecemane Lion, Chillerpillar, Sinuous Vermin, Skittering Crustacean, and four more carriers.
 *
 * ⭐ PURE IGNITION, AND FOUND BY CENSUSING GATES RATHER THAN EFFECTS. Every one of these cards already had
 * its monstrosity ACTIVATION modelled — `perm.monstrous` is a real latch that effects/atoms/counters.js
 * applyMonstrosity sets — and the granted keywords were all ordinary grantable ones. The only missing piece
 * was the GATE VOCABULARY: parseAsLongAsGate knew "is untapped" and not its sibling "is monstrous", so the
 * whole clause failed to parse and the card parked. Two lines, one in the parser and one in gateMet, both
 * sitting directly beside the untapped read they mirror.
 *
 * ⓘ HOW THIS VEIN WAS FOUND, because it generalises. The rider census (which paid twice already) had gone
 * to singletons, so the next cut tallied the GATE CONDITIONS themselves, native-vs-parked. That immediately
 * separated conditions the engine understands from ones it doesn't, and "this creature is monstrous"
 * came back 8 parked / 0 native — an effect side that was fully modelled behind a condition that wasn't.
 * The same census lists several more with zero natives; they are named in the run ledger.
 *
 * ⓘ Monstrosity is a ONE-WAY latch (CR 701.32b — once monstrous, monstrous forever), so the gate needs no
 * history and no timestamp. It is a live boolean read, re-evaluated like every other gate, which is why
 * the drive below can show the keyword switching on mid-game with nothing else changing.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the
 * gateMet arm forced to false -> the Lion stays hexproof-less after going monstrous and the runtime pin
 * goes red; the parser arm removed -> the carriers park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { applyMonstrosity } from "./effects/atoms/counters.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FLEECEMANE_LION = { id: "c-fl", name: "Fleecemane Lion", type: "Creature — Cat", mana: "{G}{W}",
  power: "3", toughness: "3",
  oracle: "{3}{G}{W}: Monstrosity 1. (If this creature isn't monstrous, put a +1/+1 counter on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has hexproof and indestructible." };
const SINUOUS_VERMIN = { id: "c-sv", name: "Sinuous Vermin", type: "Creature — Rat Horror", mana: "{2}{B}",
  power: "2", toughness: "2",
  oracle: "{3}{B}{B}: Monstrosity 3. (If this creature isn't monstrous, put three +1/+1 counters on it and it becomes monstrous.)\nAs long as this creature is monstrous, it has menace. (It can't be blocked except by two or more creatures.)" };

describe("the gate parses and the carriers flip", () => {
  it("⭐ both granted keywords carry the monstrous gate", () => {
    expect((parseStaticAbilities(FLEECEMANE_LION) || []).map((e) => `${e.op?.keyword}|${e.op?.gate?.kind}`))
      .toEqual(["hexproof|monstrous", "indestructible|monstrous"]);
    expect(classifyCard(FLEECEMANE_LION)).toBe("native-mixed");
    expect(classifyCard(SINUOUS_VERMIN)).toBe("native-mixed");
  });
});

describe("⭐ LAW 6 — driven through the real monstrosity activation", () => {
  function board(card) {
    const perm = createPermanent({ id: "sub", card, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [perm] } } };
  }

  it("⭐ before monstrosity the Lion is a plain 3/3; after, it is 4/4 WITH hexproof and indestructible", () => {
    let s = board(FLEECEMANE_LION);
    const read = () => ({
      monstrous: !!s.players.user.battlefield[0].monstrous,
      power: permanentPower(s, "sub"),
      hexproof: permanentHasKeyword(s, "sub", "hexproof"),
      indestructible: permanentHasKeyword(s, "sub", "indestructible"),
    });
    const before = read();
    // The REAL atom, not a hand-set flag — this is what the activated ability runs.
    s = applyMonstrosity(s, { amount: 1 }, { sourceId: "sub", controller: "user" });
    const after = read();
    console.log("  WITNESS", JSON.stringify({ before, after })); // printed so a broken harness can't read clean
    expect(before).toEqual({ monstrous: false, power: 3, hexproof: false, indestructible: false });
    expect(after).toEqual({ monstrous: true, power: 4, hexproof: true, indestructible: true });
  });

  it("⛔ the gate reads the LATCH, not the counters — a +1/+1 counter alone grants nothing", () => {
    // Adapt, bolster, a lord's counter … all put +1/+1 counters on without making a creature monstrous.
    // If the gate had been modelled as "has a counter" it would fire here, which is why it reads the flag.
    let s = board(FLEECEMANE_LION);
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: [{ ...s.players.user.battlefield[0], counters: { "+1/+1": 3 } }] } } };
    const row = { power: permanentPower(s, "sub"), monstrous: !!s.players.user.battlefield[0].monstrous, hexproof: permanentHasKeyword(s, "sub", "hexproof") };
    console.log("  WITNESS", JSON.stringify(row));
    expect(row).toEqual({ power: 6, monstrous: false, hexproof: false });
  });
});
