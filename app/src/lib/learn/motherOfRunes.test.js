/**
 * motherOfRunes.test.js — PROTECTION-FROM-THE-COLOR-OF-YOUR-CHOICE (vein #3: Mother of Runes / Giver of
 * Runes — Otharri + Light-Paws + Shalai; CR 702.16).
 *
 * The fixed-color grant arm deliberately parked "of your choice"; it is now a real resolution-time pick:
 * choicePolicy.autoPickProtectionColor — the most-represented color among OPPONENTS' nonland permanents
 * (the autoPickCreatureType convention: board-shaped, deterministic WUBRG tiebreak, never payoff-tuned).
 * Giver's "another … from colorless or …" adds C to the candidate set and rides excludeSource. TEN cards
 * flipped (+10/0/0): the two runes, three sac/mana activateds (Benevolent Bodyguard, Moonlit Strider,
 * Armored Guardian), and five spell forms (Gods Willing, Shelter, Blessed Breath, Center Soul, Emerge
 * Unscathed — the rebound pair rides the ADJUDICATED stripReboundLine: the mandatory exile is modeled,
 * the free recast a declined upside, FN-safe). Skrelv's toxic/hexproof compound stays parked (CREED).
 *
 * Mutation-checked (via Edit): the of-your-choice arm → the tier pins die; the colorChoice branch in
 * applyGrantProtection → the granted-color pin dies; the OPPONENT scoping in the policy (flipping to
 * count the controller's own board is the wrong-read mutation) → the policy pins die.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyGrantProtection } from "./effects/atoms/combat.js";
import { autoPickProtectionColor } from "./choicePolicy.js";
import { permanentProtectionColors } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const cr = (id, controller, colors, type = "Creature — Bear") =>
  createPermanent({ id, controller, card: { id: `c-${id}`, name: id, type, power: 2, toughness: 2, colors } });
function st(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}

describe("vein #3 — parse + the flips", () => {
  it("MUST STAY HIGH: both of-your-choice forms; the three carriers classify; Skrelv stays parked", () => {
    const m = parseEffectClause("target creature you control gains protection from the color of your choice until end of turn", "Instant", { sourceScoped: true });
    expect(programConfidence(m)).toBe("high");
    expect(m.atoms[0]).toMatchObject({ op: "grant-protection", targetType: "creatureYouControl", colorChoice: true });
    const g = parseEffectClause("another target creature you control gains protection from colorless or from the color of your choice until end of turn", "Instant", { sourceScoped: true });
    expect(g.atoms[0]).toMatchObject({ op: "grant-protection", excludeSource: true, colorChoice: true, orColorless: true });
    expect(classifyCard({ name: "Mother of Runes", type: "Creature — Human Cleric", power: 1, toughness: 1, oracle: "{T}: Target creature you control gains protection from the color of your choice until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Shelter", type: "Instant", oracle: "Target creature you control gains protection from the color of your choice until end of turn.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Skrelv, Defector Mite", type: "Legendary Creature — Phyrexian Mite", power: 1, toughness: 1, oracle: "Toxic 1\nSkrelv can't block.\n{W/P}, {T}: Choose a color. Another target creature you control gains toxic 1 and hexproof from that color until end of turn. It can't be blocked by creatures of that color this turn." })).toBe("body-only");
  });
});

describe("vein #3 — the color policy (opponents' board, deterministic)", () => {
  it("picks the most-represented color among OPPONENTS' nonland permanents; WUBRG tiebreak; W on empty", () => {
    // The controller's OWN board is color-DOMINANT (3 green) — the honest opponents-only read still picks
    // black; a wrong-read that tallies the controller's board would pick green. This asymmetry is what
    // makes the opponent-scoping mutation visible (the first draft's 1-green control couldn't flip it).
    const s = st([cr("g1", "user", ["G"]), cr("g2", "user", ["G"]), cr("g3", "user", ["G"])], [cr("b1", "ai", ["B"]), cr("b2", "ai", ["B"]), cr("r1", "ai", ["R"])]);
    expect(autoPickProtectionColor(s, "user")).toBe("B");           // own green (3) NEVER counts (mutation-check line)
    expect(autoPickProtectionColor(st([], []), "user")).toBe("W");  // the deterministic empty fallback
    const tie = st([], [cr("u1", "ai", ["U"]), cr("r1", "ai", ["R"])]);
    expect(autoPickProtectionColor(tie, "user")).toBe("U");         // WUBRG order breaks the tie
  });
  it("orColorless: opponents' colorless permanents can win the pick (Giver)", () => {
    const s = st([], [cr("e1", "ai", []), cr("e2", "ai", []), cr("r1", "ai", ["R"])]);
    expect(autoPickProtectionColor(s, "user", { orColorless: true })).toBe("C");
    expect(autoPickProtectionColor(s, "user")).toBe("R");           // without the flag, colorless never joins
  });
});

describe("vein #3 — the grant resolves with the picked color (CR 702.16, layer-aware)", () => {
  it("the protected creature carries protection from the policy's color until end of turn", () => {
    const s = st([cr("mine", "user", ["W"])], [cr("b1", "ai", ["B"]), cr("b2", "ai", ["B"])]);
    const after = applyGrantProtection(s, { op: "grant-protection", targetType: "creatureYouControl", colorChoice: true }, { controller: "user", sourceId: null, targets: [{ type: "creature", id: "mine" }] });
    expect(permanentProtectionColors(after, "mine")).toContain("B"); // the granted color (mutation-check line)
  });
});
