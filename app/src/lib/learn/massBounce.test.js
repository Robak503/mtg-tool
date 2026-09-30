/**
 * Mass BOUNCE — "return all creatures to their owners' hands" (Evacuation) and the tribal-protected
 * "… except for <Subtype>s, … and <Subtype>s" (Whelming Wave), modeled via the existing `eachCreature`
 * scope on the bounce atom (the bounce mirror of the eachCreature mass DESTROY/EXILE in mass.test.js).
 * The "except for" exclusion uses an ARRAY subtypeFilter + subtypeNegate (keep every creature carrying
 * NONE of the listed subtypes). Covers: the splitter keeping the "… and <Subtype>s" list whole, the
 * parser (UNFILTERED + the curated multi-subtype exclusion; a non-curated subtype / a payoff rider →
 * low → Arbiter), native-spell coverage, simultaneous resolution returning every creature to its OWN
 * owner's hand, the tribal exclusion sparing the protected creatures, and CREED anti-FP pins.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
// Card cost is {4} (generic only) so the C:6 pool pays it — the EFFECT, not the mana, is under test
// (mirrors mass.test.js's WRATH/DAY harness exactly).
const EVAC = { id: "c-evac", name: "Evacuation", type: SORCERY, mana: "{4}", oracle: "Return all creatures to their owners' hands." };
const WHELM = { id: "c-whelm", name: "Whelming Wave", type: SORCERY, mana: "{4}", oracle: "Return all creatures to their owners' hands except for Krakens, Leviathans, Octopuses, and Serpents." };

const creature = (name, sub = "Beast") => ({ name, type: `Creature — ${sub}`, power: 2, toughness: 2, oracle: "" });

function boardState({ user = [], ai = [], hand = [], pool = { C: 6 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai },
    },
  };
}

const castMass = (s, cardId) => {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  expect(cast.needsTargets).toBeFalsy(); // a mass bounce takes no chosen target
  return resolveTopOfStack(dispatchAction(s, cast));
};

describe("parser — mass bounce is HIGH; payoff / non-curated riders route to Arbiter", () => {
  it("UNFILTERED 'return all creatures to their owners' hands' parses high (eachCreature, no filter)", () => {
    expect(programConfidence(parseEffectProgram(EVAC))).toBe("high");
    expect(parseEffectProgram(EVAC).atoms).toEqual([{ op: "bounce", targetType: "eachCreature" }]);
  });

  it("the tribal-EXCEPT bounce parses high with a multi-subtype NEGATE filter (the '… and Serpents' list kept whole)", () => {
    expect(programConfidence(parseEffectProgram(WHELM))).toBe("high");
    expect(parseEffectProgram(WHELM).atoms).toEqual([
      { op: "bounce", targetType: "eachCreature", subtypeFilter: ["Kraken", "Leviathan", "Octopus", "Serpent"], subtypeNegate: true },
    ]);
  });

  it("CREED: a mass bounce with a PAYOFF rider stays low (the rider is a real, unmodeled clause)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle, name: "X" }))).toBe("low");
    // Faerie Slumber Party — the token payoff is a second clause we don't model.
    low("Return all creatures to their owners' hands. For each opponent who controlled a creature returned this way, you create two 1/1 blue Faerie creature tokens.");
    // Turtles in Time — shuffle-and-draw rider + a self-exile clause.
    low("Return all creatures to their owners' hands. Each player may shuffle their hand and graveyard into their library, then each player who does draws seven cards.");
  });

  it("CREED: a mass bounce whose exclusion lists a NON-CURATED subtype stays low (never a fabricated/mis-scoped sweep)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle, name: "X" }))).toBe("low");
    low("Return all creatures to their owners' hands except for Goblins."); // Goblin isn't in the curated bounce-except allowlist
    low("Return all creatures to their owners' hands except for Krakens and Beasts."); // Beast not curated → whole list parks
  });
});

describe("coverage — clean mass bounce is native-spell; a filtered/rider form is arbiter-spell", () => {
  it("Evacuation + Whelming Wave classify native-spell", () => {
    expect(classifyCard(EVAC)).toBe("native-spell");
    expect(classifyCard(WHELM)).toBe("native-spell");
  });
  it("a NON-curated-subtype exclusion stays arbiter-spell", () => {
    expect(classifyCard({ type: SORCERY, name: "Z", oracle: "Return all creatures to their owners' hands except for Goblins." })).toBe("arbiter-spell");
  });
});

describe("resolution — every creature returns to its OWN owner's hand", () => {
  it("Evacuation clears both battlefields; each creature lands in its controller's hand", () => {
    let s = boardState({
      user: [createPermanent({ id: "u1", card: creature("Ours"), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "a1", card: creature("Theirs"), controller: "ai", summoningSick: false }),
           createPermanent({ id: "a2", card: creature("Other"), controller: "ai", summoningSick: false })],
      hand: [EVAC],
    });
    s = castMass(s, "c-evac");
    expect(s.players.user.battlefield.filter((p) => /Creature/.test(p.card?.type || "")).length).toBe(0);
    expect(s.players.ai.battlefield.filter((p) => /Creature/.test(p.card?.type || "")).length).toBe(0);
    // Each non-token creature returns to its OWN owner's hand (CR — bounce uses the controller as owner proxy).
    expect(s.players.user.hand.some((c) => c.name === "Ours")).toBe(true);
    expect(s.players.ai.hand.map((c) => c.name).sort()).toEqual(["Other", "Theirs"]);
    // Bounce is NOT a death — the only graveyard card is the resolved spell itself (CR 608.2n).
    expect(s.players.user.graveyard.length + s.players.ai.graveyard.length).toBe(1);
  });

  it("Whelming Wave returns every non-sea-monster creature but SPARES Krakens/Leviathans/Octopuses/Serpents", () => {
    let s = boardState({
      user: [
        createPermanent({ id: "kraken", card: creature("Koma", "Kraken Serpent"), controller: "user", summoningSick: false }),
        createPermanent({ id: "bear", card: creature("Bear", "Bear"), controller: "user", summoningSick: false }),
      ],
      ai: [
        createPermanent({ id: "serpent", card: creature("Sea Serpent", "Serpent"), controller: "ai", summoningSick: false }),
        createPermanent({ id: "goblin", card: creature("Goblin", "Goblin"), controller: "ai", summoningSick: false }),
        createPermanent({ id: "octo", card: creature("Octo", "Octopus"), controller: "ai", summoningSick: false }),
      ],
      hand: [WHELM],
    });
    s = castMass(s, "c-whelm");
    // SPARED — the four protected sea-monster types stay on the battlefield.
    expect(findPermanent(s, "kraken")).toBeTruthy();
    expect(findPermanent(s, "serpent")).toBeTruthy();
    expect(findPermanent(s, "octo")).toBeTruthy();
    // BOUNCED — the non-listed creatures left to their owners' hands.
    expect(findPermanent(s, "bear")).toBeNull();
    expect(findPermanent(s, "goblin")).toBeNull();
    expect(s.players.user.hand.some((c) => c.name === "Bear")).toBe(true);
    expect(s.players.ai.hand.some((c) => c.name === "Goblin")).toBe(true);
    // The spared creatures were NOT also copied into hand.
    expect(s.players.user.hand.some((c) => c.name === "Koma")).toBe(false);
    expect(s.players.ai.hand.some((c) => c.name === "Sea Serpent")).toBe(false);
  });

  it("Whelming Wave on a board of ONLY protected creatures is a clean no-op (nothing bounced)", () => {
    let s = boardState({
      user: [createPermanent({ id: "k", card: creature("K", "Kraken"), controller: "user", summoningSick: false })],
      ai: [createPermanent({ id: "l", card: creature("L", "Leviathan"), controller: "ai", summoningSick: false })],
      hand: [WHELM],
    });
    s = castMass(s, "c-whelm");
    expect(findPermanent(s, "k")).toBeTruthy();
    expect(findPermanent(s, "l")).toBeTruthy();
    expect(s.players.user.hand.length + s.players.ai.hand.length).toBe(0);
  });

  it("a mass bounce on an empty board is a clean no-op (no throw)", () => {
    let s = boardState({ hand: [EVAC] });
    s = castMass(s, "c-evac");
    expect(s.players.user.battlefield.length + s.players.ai.battlefield.length).toBe(0);
  });
});
