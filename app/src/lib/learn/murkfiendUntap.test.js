/**
 * MURKFIEND-UNTAP — Murkfiend Liege:
 *   "Other green creatures you control get +1/+1.
 *    Other blue creatures you control get +1/+1.
 *    Untap all green and/or blue creatures you control during each other player's untap step."
 *
 * Two color anthems (green/blue +1/+1 — the general static path) PLUS the same "during each other player's
 * untap step" phase static Seedborn Muse carries, but FILTERED to green/blue CREATURES. The general trigger
 * compiler can't route the untap (no untap-others atom / phase event), so a dedicated untap-step hook
 * (gameEngine.runStepActions → case "untap" → applyMurkfiendUntap) plays it — reading the SAME layer-aware
 * effective color/type the anthems use. Pins: (1) the card classifies native-static + CREED near-misses
 * stay non-native; (2) the hook untaps ONLY a non-active watcher-controller's green/blue creatures (not
 * lands, artifacts, other-color creatures, or the active player's board); (3) end-to-end through the real
 * engine, a Murkfiend controller's tapped blue creature untaps during the OPPONENT's untap step.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { isMurkfiendUntap, applyMurkfiendUntap } from "./murkfiendUntap.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { nextStep } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const MURKFIEND = {
  name: "Murkfiend Liege",
  type: "Creature — Horror",
  mana: "{2}{G/U}{G/U}{G/U}",
  oracle:
    "Other green creatures you control get +1/+1.\n" +
    "Other blue creatures you control get +1/+1.\n" +
    "Untap all green and/or blue creatures you control during each other player's untap step.",
};

describe("MURKFIEND-UNTAP — classification (CREED whole-card)", () => {
  it("Murkfiend Liege classifies native-static (both anthems + the untap static modeled)", () => {
    expect(classifyCard(MURKFIEND)).toBe("native-static");
  });

  it("isMurkfiendUntap is mechanism-keyed — matches the exact green/blue templating, rejects other subjects", () => {
    expect(isMurkfiendUntap(MURKFIEND)).toBe(true);
    // Seedborn's "all permanents" is a DIFFERENT subject → not ours.
    expect(isMurkfiendUntap({ oracle: "Untap all permanents you control during each other player's untap step." })).toBe(false);
    // Prophet of Kruphix's "creatures and lands" is a different subject → not ours.
    expect(isMurkfiendUntap({ oracle: "Untap all creatures and lands you control during each other player's untap step." })).toBe(false);
    // The same subject WITHOUT the during-each-other-player timing is not this static either.
    expect(isMurkfiendUntap({ oracle: "Untap all green and/or blue creatures you control." })).toBe(false);
  });

  it("CREED near-miss: Balefire Liege (anthems + cast TRIGGERS, no untap static) stays body-only", () => {
    // Two color anthems but the "Whenever you cast a red/white spell" triggers are unmodeled residue AND there
    // is no untap static → must NOT flip through this tier.
    expect(classifyCard({
      name: "Balefire Liege",
      type: "Creature — Spirit Horror",
      oracle:
        "Other red creatures you control get +1/+1.\n" +
        "Other white creatures you control get +1/+1.\n" +
        "Whenever you cast a red spell, this creature deals 3 damage to target player or planeswalker.\n" +
        "Whenever you cast a white spell, you gain 3 life.",
    })).toBe("body-only");
  });

  it("CREED near-miss: Prophet of Kruphix (different untap filter + flash-permission rider) stays body-only", () => {
    // Its untap is "creatures AND lands" (not green/blue creatures) and it has an unmodeled flash-cast static →
    // neither the Murkfiend nor the Seedborn hook claims it; the flash rider keeps it non-native (safe FN).
    expect(classifyCard({
      name: "Prophet of Kruphix",
      type: "Creature — Human Wizard",
      oracle:
        "Untap all creatures and lands you control during each other player's untap step.\n" +
        "You may cast creature spells as though they had flash.",
    })).not.toBe("native-static");
  });

  it("anti-FP: a second (unmodeled) ability alongside the Murkfiend statics keeps it body-only", () => {
    expect(classifyCard({
      name: "Murkfiend Plus",
      type: "Creature — Horror",
      oracle:
        "Other green creatures you control get +1/+1.\n" +
        "Untap all green and/or blue creatures you control during each other player's untap step.\n" +
        "Whenever you cast a spell, draw a card.",
    })).toBe("body-only");
  });

  it("anti-FP: the static on an instant/sorcery is never claimed by this tier", () => {
    expect(classifyCard({ name: "Not A Permanent", type: "Sorcery", oracle: "Untap all green and/or blue creatures you control during each other player's untap step." })).not.toBe("native-static");
  });
});

describe("MURKFIEND-UNTAP — runtime hook (applyMurkfiendUntap)", () => {
  function twoSeat({ active }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    // user's board: a tapped BLUE creature (untap), a tapped GREEN creature (untap), a tapped RED creature
    // (NOT untapped — wrong color), a tapped Island land (NOT untapped — not a creature), and the Liege.
    const blueBear = createPermanent({ id: "b1", card: { id: "b1", name: "Man-o'-War", type: "Creature — Jellyfish", colors: ["U"] }, controller: "user", tapped: true });
    const greenBear = createPermanent({ id: "g1", card: { id: "g1", name: "Grizzly Bears", type: "Creature — Bear", colors: ["G"] }, controller: "user", tapped: true });
    const redBear = createPermanent({ id: "r1", card: { id: "r1", name: "Goblin", type: "Creature — Goblin", colors: ["R"] }, controller: "user", tapped: true });
    const island = createPermanent({ id: "i1", card: { id: "i1", name: "Island", type: "Basic Land — Island" }, controller: "user", tapped: true });
    const liege = createPermanent({ id: "ml", card: { id: "ml", ...MURKFIEND, colors: ["G", "U"] }, controller: "user", tapped: true });
    const aiLand = createPermanent({ id: "a1", card: { id: "a1", name: "Swamp", type: "Basic Land — Swamp" }, controller: "ai", tapped: true });
    return {
      ...base,
      activePlayer: active,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [blueBear, greenBear, redBear, island, liege] },
        ai: { ...base.players.ai, battlefield: [aiLand] },
      },
    };
  }

  it("during the OPPONENT's untap step, ONLY the controller's green/blue creatures untap", () => {
    const after = applyMurkfiendUntap(twoSeat({ active: "ai" }), "ai");
    const bf = after.players.user.battlefield;
    expect(bf.find((p) => p.id === "b1").tapped).toBe(false); // blue creature untapped
    expect(bf.find((p) => p.id === "g1").tapped).toBe(false); // green creature untapped
    expect(bf.find((p) => p.id === "ml").tapped).toBe(false); // the Liege itself is green+blue → untapped
    // NOT untapped: wrong color, and a non-creature land.
    expect(bf.find((p) => p.id === "r1").tapped).toBe(true);  // red creature — wrong color
    expect(bf.find((p) => p.id === "i1").tapped).toBe(true);  // Island — not a creature
    // the active player's own permanents are untouched by this hook (normal untapAll handles them).
    expect(after.players.ai.battlefield.find((p) => p.id === "a1").tapped).toBe(true);
  });

  it("the Murkfiend controller's OWN untap step is a no-op for the hook (active player skipped)", () => {
    const s = twoSeat({ active: "user" });
    expect(applyMurkfiendUntap(s, "user")).toBe(s); // byte-identical — active player handled by normal untapAll
  });

  it("ADDITIVE: a board with no Murkfiend-style watcher is byte-identical", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const blueBear = createPermanent({ id: "b1", card: { id: "b1", name: "Man-o'-War", type: "Creature — Jellyfish", colors: ["U"] }, controller: "user", tapped: true });
    const s = { ...base, activePlayer: "ai", players: { ...base.players, user: { ...base.players.user, battlefield: [blueBear] } } };
    expect(applyMurkfiendUntap(s, "ai")).toBe(s);
  });

  it("does NOT clear summoning sickness on the Murkfiend untap (CR 302.6 — tied to the controller's own turn)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const sickMerfolk = createPermanent({ id: "d1", card: { id: "d1", name: "Merfolk Looter", type: "Creature — Merfolk", colors: ["U"], oracle: "{T}: Draw a card, then discard a card." }, controller: "user", tapped: true });
    sickMerfolk.summoningSick = true;
    const liege = createPermanent({ id: "ml", card: { id: "ml", ...MURKFIEND, colors: ["G", "U"] }, controller: "user", tapped: true });
    const s = { ...base, activePlayer: "ai", players: { ...base.players, user: { ...base.players.user, battlefield: [sickMerfolk, liege] } } };
    const after = applyMurkfiendUntap(s, "ai");
    expect(after.players.user.battlefield.find((p) => p.id === "d1").tapped).toBe(false); // untapped
    expect(after.players.user.battlefield.find((p) => p.id === "d1").summoningSick).toBe(true); // still sick
  });
});

describe("MURKFIEND-UNTAP — end-to-end through the real engine", () => {
  it("a Murkfiend controller's tapped blue creature untaps during the opponent's untap step", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const blueBear = createPermanent({ id: "b1", card: { id: "b1", name: "Man-o'-War", type: "Creature — Jellyfish", colors: ["U"] }, controller: "user", tapped: true });
    const island = createPermanent({ id: "i1", card: { id: "i1", name: "Island", type: "Basic Land — Island" }, controller: "user", tapped: true });
    const liege = createPermanent({ id: "ml", card: { id: "ml", ...MURKFIEND, colors: ["G", "U"] }, controller: "user", tapped: true });
    let s = {
      ...base,
      turn: 1, activePlayer: "user", phase: "ending", step: "cleanup", priorityHolder: null, consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [blueBear, island, liege] },
        ai: { ...base.players.ai, battlefield: [] },
      },
    };
    // Advance to the next turn's untap (AI's). nextStep rolls cleanup → (next turn) untap and runs its actions.
    s = nextStep(s);
    expect(s.activePlayer).toBe("ai");
    expect(s.step).toBe("untap");
    // During AI's untap step, the user's Murkfiend untapped the user's tapped blue creature — but NOT the Island.
    expect(s.players.user.battlefield.find((p) => p.id === "b1").tapped).toBe(false); // blue creature untapped
    expect(s.players.user.battlefield.find((p) => p.id === "i1").tapped).toBe(true);  // Island stays tapped
  });
});
