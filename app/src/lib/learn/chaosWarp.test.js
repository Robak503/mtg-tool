/**
 * chaosWarp.test.js — SHELF-85 runbook Phase 2 · H12 (Shalai) / Nekusar N13 (2026-09-04): Chaos Warp.
 *
 * "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a
 * permanent card, they put it onto the battlefield." ONE whole-oracle atom (the second sentence's "they/their" is the
 * OWNER of the first sentence's target — a referent a sentence split would orphan). The resolver reads the owner off the
 * permanent BEFORE it moves (a stolen permanent goes HOME), shuffles the owner's library, reveals the new top card and
 * puts it onto the battlefield under the OWNER's control if it is a permanent card.
 *
 * Determinism: the seeded shuffle makes a mixed library's top card outcome-dependent, so the load-bearing pins use a
 * library that holds ONLY the tucked card (it must come back) and a stolen permanent (it must return to its owner); the
 * mixed-library case pins the consistency of the two outcomes and the log's revealed name.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WARP = { name: "Chaos Warp", type: "Instant", mana: "{2}{R}", keywords: [],
  oracle: "The owner of target permanent shuffles it into their library, then reveals the top card of their library. If it's a permanent card, they put it onto the battlefield." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const ROCK = { id: "c-rock", name: "Plain Rock", type: "Artifact", mana: "{1}", oracle: "" };
const SHOCK = { id: "c-shock", name: "Shock", type: "Instant", mana: "{R}", oracle: "Shock deals 2 damage to any target." };

const base = () => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const withBf = (s, pid, perms) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: [...s.players[pid].battlefield, ...perms] } } });
const withLib = (s, pid, cards) => ({ ...s, players: { ...s.players, [pid]: { ...s.players[pid], library: cards } } });
const warp = (s, targetId) => resolveAtom(s, { op: "owner-tuck-reveal-put", targetType: "permanent" }, { controller: "user", targets: [{ id: targetId, type: "permanent" }] });
const bfCards = (s, pid) => s.players[pid].battlefield.map((p) => p.card?.name);
const lastLog = (s) => [...(s.log || [])].reverse().find((e) => e.effect === "owner-tuck-reveal-put");

describe("classifier + parser", () => {
  it("Chaos Warp classifies native-spell as ONE owner-tuck-reveal-put atom; Oblation's shape stays unparsed (CREED)", () => {
    expect(classifyCard(WARP)).toBe("native-spell");
    expect(parseEffectProgram(WARP).atoms).toEqual([{ op: "owner-tuck-reveal-put", targetType: "permanent" }]);
    const oblation = { ...WARP, name: "Oblation", oracle: "The owner of target nonland permanent shuffles it into their library, then draws two cards." };
    expect(parseEffectProgram(oblation).confidence).not.toBe("high");
  });
});

describe("runtime", () => {
  it("an opponent's artifact with an otherwise EMPTY library: tucked, shuffled, revealed, and it comes straight back under the owner", () => {
    let s = withBf(base(), "ai", [createPermanent({ id: "R", card: ROCK, controller: "ai" })]);
    s = withLib(s, "ai", []);
    s = warp(s, "R");
    expect(bfCards(s, "ai")).toEqual(["Plain Rock"]);
    expect(s.players.ai.battlefield[0].id).not.toBe("R"); // a NEW permanent — it left and re-entered
    expect(s.players.ai.library).toHaveLength(0);
    expect(lastLog(s)?.revealed?.[0]).toMatchObject({ owner: "ai", card: "Plain Rock", entered: true });
  });

  it("a STOLEN creature (yours by control, theirs by ownership) goes home: it leaves your battlefield and re-enters under its OWNER", () => {
    let s = withBf(base(), "user", [{ ...createPermanent({ id: "B", card: BEARS, controller: "user" }), owner: "ai" }]);
    s = withLib(s, "ai", []);
    s = withLib(s, "user", [SHOCK]);
    s = warp(s, "B");
    expect(bfCards(s, "user")).toEqual([]);
    expect(bfCards(s, "ai")).toEqual(["Grizzly Bears"]);
    expect(s.players.user.library).toHaveLength(1); // your library untouched
    expect(lastLog(s)?.revealed?.[0]).toMatchObject({ owner: "ai", entered: true });
  });

  it("a mixed library, driven by the seed: the instant on top stays on top and nothing enters; the creature on top enters — and BOTH outcomes occur (the shuffle is real)", () => {
    const run = (seed) => {
      let s = withBf(base(), "ai", [createPermanent({ id: "B", card: BEARS, controller: "ai" })]);
      s = withLib(s, "ai", [SHOCK]);
      return warp({ ...s, rngSeed: seed }, "B");
    };
    const outcomes = Array.from({ length: 40 }, (_, seed) => run(seed));
    const shockTop = outcomes.find((s) => lastLog(s)?.revealed?.[0]?.card === "Shock");
    const bearsTop = outcomes.find((s) => lastLog(s)?.revealed?.[0]?.card === "Grizzly Bears");
    // an UNSHUFFLED tuck would put the creature on the bottom every time — the instant on top forever, the creature never
    expect(shockTop).toBeTruthy();
    expect(bearsTop).toBeTruthy();
    expect(bfCards(shockTop, "ai")).toEqual([]);
    expect(shockTop.players.ai.library.map((c) => c.name)).toEqual(["Shock", "Grizzly Bears"]);
    expect(lastLog(shockTop).revealed[0]).toMatchObject({ card: "Shock", entered: false });
    expect(bfCards(bearsTop, "ai")).toEqual(["Grizzly Bears"]);
    expect(bearsTop.players.ai.library.map((c) => c.name)).toEqual(["Shock"]);
    expect(lastLog(bearsTop).revealed[0]).toMatchObject({ card: "Grizzly Bears", entered: true });
  });

  it("a vanished target does nothing", () => {
    let s = withLib(base(), "ai", [SHOCK]);
    const before = JSON.stringify(s.players);
    s = warp(s, "nope");
    expect(JSON.stringify(s.players)).toBe(before);
  });
});
