/**
 * splitCard.test.js — SPLIT CARDS (CR 709). A split card is one card with two instant/sorcery halves; you
 * cast ONE half from hand and the resolved spell goes to the graveyard.
 *
 * The whole-card contract: native ONLY when BOTH halves' effects are modeled (classifySplit); the runtime
 * offers both halves' casts, each resolving through the normal spell path with the combined card landing in
 * the graveyard (the faceCard dispatch reused from adventure — no new dispatch code). Fuse (cast both at
 * once) and aftermath (second half cast from the graveyard) are PARKED as Arbiter spells.
 *
 * Oracle text is the REAL bundled Scryfall rendering (publicCard's "<name> - <type> {mana}\n<oracle>\n//\n…"
 * shape), quoted verbatim — never authored from memory (CLAUDE.md §1.2).
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseSplitCard, splitFaceCards } from "./splitCard.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// The publicCard combined rendering for each card (verbatim from the bundled oracle index).
const DEAD_GONE = {
  id: "dg1",
  name: "Dead // Gone",
  type: "Instant // Instant",
  mana: "{R} // {2}{R}",
  oracle: "Dead - Instant {R}\nDead deals 2 damage to target creature.\n//\nGone - Instant {2}{R}\nReturn target creature you don't control to its owner's hand.",
};
const FIRE_ICE = {
  id: "fi1",
  name: "Fire // Ice",
  type: "Instant // Instant",
  mana: "{1}{R} // {1}{U}",
  oracle: "Fire - Instant {1}{R}\nFire deals 2 damage divided as you choose among one or two targets.\n//\nIce - Instant {1}{U}\nTap target permanent.\nDraw a card.",
};
// Fuse (Dragon's Maze): "Fuse (You may cast one or both halves…)" — PARKED.
const BREAKING_ENTERING = {
  id: "be1",
  name: "Breaking // Entering",
  type: "Sorcery // Sorcery",
  mana: "{U}{B} // {4}{B}{R}",
  oracle: "Breaking - Sorcery {U}{B}\nTarget player mills eight cards.\n//\nEntering - Sorcery {4}{B}{R}\nPut target creature or planeswalker card from a graveyard onto the battlefield under your control.\nFuse (You may cast one or both halves of this card from your hand.)",
};
// Aftermath (Amonkhet): the second half is cast only from the graveyard — PARKED.
const DUSK_DAWN = {
  id: "dd1",
  name: "Dusk // Dawn",
  type: "Sorcery // Sorcery",
  mana: "{2}{W}{W} // {3}{W}{W}",
  oracle: "Dusk - Sorcery {2}{W}{W}\nDestroy all creatures with power 3 or greater.\n//\nDawn - Sorcery {3}{W}{W}\nAftermath (Cast this spell only from your graveyard. Then exile it.)\nReturn all creature cards with power 2 or less from your graveyard to your hand.",
};

function bear(id, controller) {
  return createPermanent({ id, card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });
}
function mountain(id) {
  return createPermanent({ id, card: { name: "Mountain", type: "Basic Land — Mountain", oracle: "{T}: Add {R}." }, controller: "user", summoningSick: false });
}
function island(id) {
  return createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
}
function st({ hand = [], battlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    phase: "precombat-main",
    step: "main",
    priorityHolder: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, hand, battlefield, library: [{ id: "lib1", name: "Top", type: "Sorcery", oracle: "" }] },
      ai: { ...s.players.ai, battlefield: [bear("aibear", "ai")] },
    },
  };
}

describe("SPLIT — shape module", () => {
  it("parses a plain split into its two halves (same id preserved)", () => {
    const p = parseSplitCard(DEAD_GONE);
    expect(p).toMatchObject({ left: { name: "Dead", mana: "{R}" }, right: { name: "Gone", mana: "{2}{R}" } });
    const [l, r] = splitFaceCards(DEAD_GONE);
    expect(l).toMatchObject({ id: "dg1", name: "Dead", type: "Instant", mana: "{R}" });
    expect(r).toMatchObject({ id: "dg1", name: "Gone", type: "Instant", mana: "{2}{R}" });
  });

  it("AFTERMATH split cards are not parsed as plain splits (parked); FUSE now is", () => {
    // PIN MOVED 2026-07-27 (census slice 54), and only half of it. Fuse was parked as "an unmodeled casting
    // option"; it only ADDS a mode, and both halves stay individually castable from hand exactly as on any
    // other split, so declining the fused mode leaves a real complete cast — the optional-mode family's test.
    //
    // AFTERMATH stays parked, and the contrast is the whole point: its second half casts ONLY from the
    // graveyard (CR 702.127a) while this engine's split lane offers both halves from HAND. Unparking it
    // would not under-offer, it would produce an ILLEGAL cast — the false-positive direction.
    expect(parseSplitCard(DUSK_DAWN)).toBeNull();
    expect(parseSplitCard(BREAKING_ENTERING)).not.toBeNull();
  });

  it("…and unparking fuse does NOT force-flip a card whose half is unmodeled (CREED)", () => {
    // Breaking // Entering parses now, but its "Entering" half (graveyard reanimation to the battlefield)
    // is not modeled, so the card stays on the Arbiter. Parsing the shape and modelling the halves are
    // separate gates, and the second one still has to be earned.
    expect(classifyCard(BREAKING_ENTERING)).toBe("arbiter-spell");
  });
});

describe("SPLIT — classifier (both halves modeled, else Arbiter)", () => {
  it("a split whose BOTH halves are native flips native-spell", () => {
    expect(classifyCard(DEAD_GONE)).toBe("native-spell");
    expect(classifyCard(FIRE_ICE)).toBe("native-spell");
  });

  it("fuse / aftermath stay arbiter-spell (the whole card, no dropped half — CREED)", () => {
    expect(classifyCard(BREAKING_ENTERING)).toBe("arbiter-spell");
    expect(classifyCard(DUSK_DAWN)).toBe("arbiter-spell");
  });

  it("a split with one unmodeled half is arbiter-spell (not a partial native flip)", () => {
    // "Consecrate" (gain life + exile a GY) is native; "Consume" (sacrifice-greatest-power edict) isn't.
    const consecrate = {
      id: "cc1", name: "Consecrate // Consume", type: "Instant // Sorcery", mana: "{1}{B} // {3}{B}{G}",
      oracle: "Consecrate - Instant {1}{B}\nExile target card from a graveyard. You gain 2 life.\n//\nConsume - Sorcery {3}{B}{G}\nTarget player sacrifices a creature with the greatest power among creatures they control. You draw a card and you lose 1 life.",
    };
    expect(classifyCard(consecrate)).toBe("arbiter-spell");
  });
});

describe("SPLIT — runtime (CR 709.4)", () => {
  it("BOTH halves are offered as casts from hand; the combined card is never offered", () => {
    const s = st({ hand: [FIRE_ICE], battlefield: [mountain("m1"), mountain("m2"), island("i1"), island("i2")] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "fi1");
    expect(casts.every((a) => a.faceCard)).toBe(true);
    const names = new Set(casts.map((a) => a.name));
    expect(names.has("Fire")).toBe(true);
    expect(names.has("Ice")).toBe(true);
    expect([...names].some((n) => String(n).includes("//"))).toBe(false); // the combined card is gone
  });

  it("a fuse/aftermath split is NOT offered via the split path (its combined cast routes to the Arbiter)", () => {
    const s = st({ hand: [BREAKING_ENTERING], battlefield: [mountain("m1"), mountain("m2"), mountain("m3"), mountain("m4"), mountain("m5"), mountain("m6"), mountain("m7")] });
    const split = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.faceCard && a.cardId === "be1");
    expect(split).toHaveLength(0);
  });

  it("casting one half resolves its effect and puts the COMBINED card into the graveyard (CR 709.4)", () => {
    // 'Dead' deals 2 damage to target creature → kills the AI bear; the whole 'Dead // Gone' card → graveyard.
    let s = st({ hand: [DEAD_GONE], battlefield: [mountain("m1")] });
    const dead = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.name === "Dead");
    expect(dead).toBeTruthy();
    s = dispatchAction(s, dead);
    expect(s.players.user.hand.some((c) => c.id === "dg1")).toBe(false); // left hand onto the stack
    while (s.stack.length) s = resolveTopOfStack(s);
    // The bear died (2 damage to a 2-toughness creature).
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Bear")).toBe(false);
    // The combined card — NOT the projected "Dead" face — is in the graveyard, and NOT in exile.
    const gy = s.players.user.graveyard.find((c) => c.id === "dg1");
    expect(gy).toBeTruthy();
    expect(gy.name).toBe("Dead // Gone");
    expect(s.players.user.exile.some((c) => c.id === "dg1")).toBe(false);
  });
});
