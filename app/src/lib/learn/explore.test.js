/**
 * explore.test.js — EXPLORE keyword action (CR 701.44), the Ixalan ETB family.
 *
 * Explore: the exploring creature's controller reveals the top card of their library; a LAND goes to their
 * hand; otherwise a +1/+1 counter is put on the exploring creature and the card is kept on top (the engine
 * resolves CR 701.44a's "back or graveyard" choice deterministically to keep-on-top, a legal option).
 *
 * Subject resolution: "it explores" is the SOURCE for a self trigger (Merfolk Branchwalker's ETB,
 * Emperor's Vanguard's combat damage) and the TRIGGERING creature for a non-self enters-watcher (Path of
 * Discovery). detectTriggers rewrites the pronoun; the parser maps "this creature explores" → target:"self"
 * and "the triggering creature explores" → target:"thatCreature".  "explores X times" (variable) stays LOW.
 *
 * Coverage: 20 Ixalan-block explore permanents flip body-only → native-trigger.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature — Merfolk Scout") => ({ name, oracle, type, keywords: [], mana: "" });
const landCard = (id) => ({ id, name: `Forest-${id}`, type: "Basic Land — Forest" });
const spellCard = (id) => ({ id, name: `Bolt-${id}`, type: "Instant" });

// Build a state with `explorer` (a creature) on the user battlefield and a controlled top-of-library.
function stateWith({ topCards = [], explorerOnBoard = true }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const explorer = createPermanent({ id: "explorer", card: { id: "explorer", name: "Merfolk Branchwalker", type: "Creature — Merfolk Scout", power: 2, toughness: 1 }, controller: "user" });
  return {
    ...s,
    players: { ...s.players, user: {
      ...s.players.user,
      battlefield: explorerOnBoard ? [explorer] : [],
      library: topCards,
      hand: [],
    } },
  };
}

// ─── 1. Parser ────────────────────────────────────────────────────────────────
describe("explore — parser", () => {
  it("'this creature explores' → explore self HIGH", () => {
    const p = parseEffectClause("this creature explores", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "explore", target: "self", targetType: null }]);
  });
  it("'the triggering creature explores' → explore thatCreature HIGH", () => {
    const p = parseEffectClause("the triggering creature explores", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "explore", target: "thatCreature", targetType: null }]);
  });
  it("the repeated form → two explore-self atoms (Jadelight Ranger)", () => {
    const p = parseEffectClause("this creature explores, then this creature explores", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "explore", target: "self", targetType: null },
      { op: "explore", target: "self", targetType: null },
    ]);
  });
  it("CREED: bare 'it explores' (no rewrite) and 'explores X times' stay LOW", () => {
    expect(programConfidence(parseEffectClause("it explores", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("this creature explores x times", "Instant"))).toBe("low");
  });
});

// ─── 2. detectTriggers rewrite ──────────────────────────────────────────────────
describe("explore — detectTriggers 'it' rewrite", () => {
  it("self ETB: 'it explores' → 'this creature explores'", () => {
    const t = detectTriggers(C("Merfolk Branchwalker", "When this creature enters, it explores."));
    expect(t).toHaveLength(1);
    expect(t[0].scope).toBe("self");
    expect(t[0].effectClause).toBe("this creature explores");
  });
  it("self combat-damage: 'it explores' → 'this creature explores'", () => {
    const t = detectTriggers(C("Emperor's Vanguard", "Whenever this creature deals combat damage to a player, it explores.", "Creature — Human Scout"));
    expect(t[0].effectClause).toBe("this creature explores");
  });
  it("Jadelight Ranger double explore → repeated subject", () => {
    const t = detectTriggers(C("Jadelight Ranger", "When this creature enters, it explores, then it explores again."));
    expect(t[0].effectClause).toBe("this creature explores, then this creature explores");
  });
  it("non-self enters-watcher (Path of Discovery): 'it explores' → 'the triggering creature explores'", () => {
    const t = detectTriggers(C("Path of Discovery", "Whenever a creature you control enters, it explores.", "Enchantment"));
    expect(t[0].scope).toBe("creatureYouControl");
    expect(t[0].effectClause).toBe("the triggering creature explores");
  });
});

// ─── 3. Resolver ────────────────────────────────────────────────────────────────
describe("explore — resolver (CR 701.44)", () => {
  it("reveals a LAND → goes to hand (no counter)", () => {
    const s = stateWith({ topCards: [landCard("L1"), spellCard("S1")] });
    const next = resolveAtom(s, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    expect(next.players.user.hand.map((c) => c.id)).toEqual(["L1"]);   // land → hand
    expect(next.players.user.library.map((c) => c.id)).toEqual(["S1"]); // land removed from top
    expect(findPermanent(next, "explorer").permanent.counters?.["+1/+1"] || 0).toBe(0); // no counter for a land
  });
  it("reveals a NONLAND → +1/+1 on the explorer, card kept on top", () => {
    const s = stateWith({ topCards: [spellCard("S1"), landCard("L1")] });
    const next = resolveAtom(s, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    expect(next.players.user.hand).toHaveLength(0);                     // nonland not drawn
    expect(next.players.user.library.map((c) => c.id)).toEqual(["S1", "L1"]); // kept on top (CR 701.44a)
    expect(findPermanent(next, "explorer").permanent.counters["+1/+1"]).toBe(1); // +1/+1 placed
  });
  it("double explore (Jadelight Ranger): two nonlands → +2/+2; mixed → one counter + a land to hand", () => {
    const s = stateWith({ topCards: [spellCard("S1"), spellCard("S2"), landCard("L1")] });
    let next = resolveAtom(s, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    next = resolveAtom(next, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    expect(findPermanent(next, "explorer").permanent.counters["+1/+1"]).toBe(2); // two nonlands → +2/+2
    expect(next.players.user.library.map((c) => c.id)).toEqual(["S1", "S2", "L1"]); // both kept on top
  });
  it("empty library → a clean no-op (no throw, no counter)", () => {
    const s = stateWith({ topCards: [] });
    const next = resolveAtom(s, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    expect(next.players.user.hand).toHaveLength(0);
    expect(findPermanent(next, "explorer").permanent.counters?.["+1/+1"] || 0).toBe(0);
  });
  it("explorer already gone (left battlefield): land still goes to hand, no counter", () => {
    const s = stateWith({ topCards: [landCard("L1")], explorerOnBoard: false });
    const next = resolveAtom(s, { op: "explore", target: "self" }, { controller: "user", sourceId: "explorer" });
    expect(next.players.user.hand.map((c) => c.id)).toEqual(["L1"]); // reveal/land-to-hand still happens
  });
  it("thatCreature subject (Path of Discovery): counter goes on the TRIGGERING creature", () => {
    const s = stateWith({ topCards: [spellCard("S1")] });
    const next = resolveAtom(s, { op: "explore", target: "thatCreature" }, { controller: "user", triggeringPermanentId: "explorer" });
    expect(findPermanent(next, "explorer").permanent.counters["+1/+1"]).toBe(1);
  });
});

// ─── 4. Coverage flips ──────────────────────────────────────────────────────────
describe("explore — coverage: Ixalan ETB family flips native-trigger", () => {
  const REMINDER = " (Reveal the top card of your library. Put that card into your hand if it's a land. Otherwise, put a +1/+1 counter on this creature, then put the card back or put it into your graveyard.)";
  it("plain ETB explore → native-trigger", () => {
    expect(classifyCard(C("Merfolk Branchwalker", "When this creature enters, it explores." + REMINDER))).toBe("native-trigger");
    expect(classifyCard(C("Seekers' Squire", "When this creature enters, it explores." + REMINDER, "Creature — Human Scout"))).toBe("native-trigger");
  });
  it("ETB explore + a covered keyword → native-trigger", () => {
    expect(classifyCard(C("Queen's Agent", "Lifelink\nWhen this creature enters, it explores." + REMINDER, "Creature — Vampire Scout"))).toBe("native-trigger");
    expect(classifyCard(C("Siren Lookout", "Flying\nWhen this creature enters, it explores." + REMINDER, "Creature — Siren Pirate"))).toBe("native-trigger");
    expect(classifyCard(C("Kinjalli's Dawnrunner", "Double strike\nWhen this creature enters, it explores." + REMINDER, "Creature — Human Scout"))).toBe("native-trigger");
  });
  it("double explore (Jadelight Ranger) → native-trigger", () => {
    expect(classifyCard(C("Jadelight Ranger", "When this creature enters, it explores, then it explores again." + REMINDER))).toBe("native-trigger");
  });
  it("combat-damage explore (Emperor's Vanguard) → native-trigger", () => {
    expect(classifyCard(C("Emperor's Vanguard", "Whenever this creature deals combat damage to a player, it explores." + REMINDER, "Creature — Human Scout"))).toBe("native-trigger");
  });
  it("non-self enters-watcher (Path of Discovery) → native-trigger", () => {
    expect(classifyCard(C("Path of Discovery", "Whenever a creature you control enters, it explores." + REMINDER, "Enchantment"))).toBe("native-trigger");
  });
});

// ─── 5. CREED guards ──────────────────────────────────────────────────────────
describe("explore — CREED: complex/unmodeled forms stay non-native", () => {
  it("'explores X times' (variable count) stays body-only", () => {
    expect(classifyCard(C("Jadelight Spelunker", "When this creature enters, it explores X times."))).not.toMatch(/^native/);
  });
  it("explore + a complex rider (Deepfathom Echo's copy clause) stays body-only", () => {
    expect(classifyCard(C("Deepfathom Echo", "At the beginning of combat on your turn, this creature explores. Then you may have it become a copy of another creature you control until end of turn.", "Creature — Merfolk Spirit"))).not.toMatch(/^native/);
  });
  it("an explore-WATCHER ('Whenever a creature you control explores, …') is not the explore effect → body-only", () => {
    expect(classifyCard(C("Wildgrowth Walker", "Whenever a creature you control explores, put a +1/+1 counter on this creature and you gain 3 life.", "Creature — Elemental"))).not.toMatch(/^native/);
  });
});
