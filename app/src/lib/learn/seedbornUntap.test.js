/**
 * SEEDBORN-UNTAP — Seedborn Muse: "Untap all permanents you control during each other player's untap
 * step." A dedicated untap-step hook (gameEngine.runStepActions → case "untap" → applySeedbornUntap) the
 * general trigger compiler can't reach (no "during each other player's untap step" event, no untap-others
 * atom). Pins: (1) the card classifies native-static + the anti-FP riders stay body-only; (2) the hook
 * untaps a non-active watcher-controller's permanents (and ONLY theirs); (3) end-to-end through the real
 * engine, a Seedborn controller's tapped land untaps during the OPPONENT's untap step.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { isSeedbornUntap, applySeedbornUntap } from "./seedbornUntap.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { nextStep } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const SEEDBORN = {
  name: "Seedborn Muse",
  type: "Creature — Spirit",
  mana: "{3}{G}{G}",
  oracle: "Untap all permanents you control during each other player's untap step.",
};

describe("SEEDBORN-UNTAP — classification (CREED whole-card)", () => {
  it("Seedborn Muse classifies native-static (the one untap static is modeled)", () => {
    expect(classifyCard(SEEDBORN)).toBe("native-static");
  });

  it("isSeedbornUntap is mechanism-keyed — matches the exact templating, rejects a partial subject", () => {
    expect(isSeedbornUntap(SEEDBORN)).toBe(true);
    // "all CREATURES you control" (not "all permanents") is a DIFFERENT, unmodeled subject → not ours.
    expect(isSeedbornUntap({ oracle: "Untap all creatures you control during each other player's untap step." })).toBe(false);
    // a normal "untap all permanents you control" with no during-each-other timing is not this static either.
    expect(isSeedbornUntap({ oracle: "Untap all permanents you control." })).toBe(false);
  });

  it("anti-FP: an anthem rider (Murkfiend Liege) keeps the card body-only — never a partial flip", () => {
    // Murkfiend Liege's untap is "green and/or blue creatures" (not "all permanents"), AND it has two anthems.
    expect(classifyCard({
      name: "Murkfiend Liege",
      type: "Creature — Horror",
      oracle: "Other green creatures you control get +1/+1.\nOther blue creatures you control get +1/+1.\nUntap all green and/or blue creatures you control during each other player's untap step.",
    })).toBe("body-only");
  });

  it("anti-FP: a second (unmodeled) ability alongside the untap static keeps it body-only", () => {
    // Hypothetical Seedborn-with-a-rider: the untap static is modeled, but the cast trigger is residue → Arbiter.
    expect(classifyCard({
      name: "Seedborn Plus",
      type: "Creature — Spirit",
      oracle: "Untap all permanents you control during each other player's untap step.\nWhenever you cast a spell, you draw two cards then discard two cards.",
    })).toBe("body-only");
  });

  it("anti-FP: the static on an instant/sorcery is never claimed by this tier", () => {
    expect(classifyCard({ name: "Not A Permanent", type: "Sorcery", oracle: "Untap all permanents you control during each other player's untap step." })).not.toBe("native-static");
  });
});

describe("SEEDBORN-UNTAP — runtime hook (applySeedbornUntap)", () => {
  function twoSeat({ active }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const tappedForest = createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest" }, controller: "user", tapped: true });
    const seedborn = createPermanent({ id: "sm", card: { id: "sm", ...SEEDBORN }, controller: "user", tapped: true });
    const aiLand = createPermanent({ id: "a1", card: { id: "a1", name: "Island", type: "Basic Land — Island" }, controller: "ai", tapped: true });
    return {
      ...base,
      activePlayer: active,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [tappedForest, seedborn] },
        ai: { ...base.players.ai, battlefield: [aiLand] },
      },
    };
  }

  it("during the OPPONENT's untap step, the Seedborn controller untaps all THEIR permanents", () => {
    const after = applySeedbornUntap(twoSeat({ active: "ai" }), "ai");
    expect(after.players.user.battlefield.find((p) => p.id === "f1").tapped).toBe(false);
    expect(after.players.user.battlefield.find((p) => p.id === "sm").tapped).toBe(false);
    // the active player's own permanents are NOT touched by this hook (the normal untapAll handles them).
    expect(after.players.ai.battlefield.find((p) => p.id === "a1").tapped).toBe(true);
  });

  it("the Seedborn controller's OWN untap step is a no-op for the hook (active player skipped)", () => {
    const s = twoSeat({ active: "user" });
    expect(applySeedbornUntap(s, "user")).toBe(s); // byte-identical — active player handled by normal untapAll
  });

  it("ADDITIVE: a board with no Seedborn-style watcher is byte-identical", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const tappedForest = createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest" }, controller: "user", tapped: true });
    const s = { ...base, activePlayer: "ai", players: { ...base.players, user: { ...base.players.user, battlefield: [tappedForest] } } };
    expect(applySeedbornUntap(s, "ai")).toBe(s);
  });

  it("does NOT clear summoning sickness on the Seedborn untap (CR 302.6 — tied to the controller's own turn)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const sickDork = createPermanent({ id: "d1", card: { id: "d1", name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." }, controller: "user", tapped: true });
    sickDork.summoningSick = true;
    const seedborn = createPermanent({ id: "sm", card: { id: "sm", ...SEEDBORN }, controller: "user", tapped: true });
    const s = { ...base, activePlayer: "ai", players: { ...base.players, user: { ...base.players.user, battlefield: [sickDork, seedborn] } } };
    const after = applySeedbornUntap(s, "ai");
    expect(after.players.user.battlefield.find((p) => p.id === "d1").tapped).toBe(false); // untapped
    expect(after.players.user.battlefield.find((p) => p.id === "d1").summoningSick).toBe(true); // still sick
  });
});

describe("SEEDBORN-UNTAP — end-to-end through the real engine", () => {
  it("a Seedborn controller's tapped land untaps during the opponent's untap step", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const tappedForest = createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest" }, controller: "user", tapped: true });
    const seedborn = createPermanent({ id: "sm", card: { id: "sm", ...SEEDBORN }, controller: "user", tapped: true });
    // Set up so the NEXT step transition lands AI in its untap step: AI active, at end (cleanup) of... simplest:
    // place AI in its turn's end step so nextStep rolls to user? Instead drive from user's cleanup → AI untap.
    let s = {
      ...base,
      turn: 1, activePlayer: "user", phase: "ending", step: "cleanup", priorityHolder: null, consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [tappedForest, seedborn] },
        ai: { ...base.players.ai, battlefield: [] },
      },
    };
    // Advance to the next turn's untap (AI's). nextStep rolls cleanup → (next turn) untap and runs its actions.
    s = nextStep(s);
    expect(s.activePlayer).toBe("ai");
    expect(s.step).toBe("untap");
    // During AI's untap step, the user's Seedborn untapped the user's tapped Forest.
    expect(s.players.user.battlefield.find((p) => p.id === "f1").tapped).toBe(false);
  });
});
