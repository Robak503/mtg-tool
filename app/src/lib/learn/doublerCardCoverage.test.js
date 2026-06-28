/**
 * doublerCardCoverage.test.js — full-card coverage for counter/token DOUBLER cards (generalizes the
 * pure-doubler native-static seam) + the subtype-recipient over-fire fix in doublerProfile.
 *
 * A card carrying a runtime-modeled doubler (doublerProfile → applyCounterDoubling/tokenMultiplier, consulted
 * at every counter-placement / token-mint regardless of tier) is native when its NON-doubler text is keyword-
 * only/vanilla — the doubler is then the whole card and the runtime already applies it (FIX-MANA-OVERCLAIM in
 * reverse: an honest under-claim corrected). A doubler MIXED with other abilities stays body-only for now
 * (CREED — verified-or-bust), and the Mauhúr-style "Subtype you control" recipient is dropped so the runtime
 * never over-applies it to every permanent.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { doublerProfile, isModeledDoublerSentence, stripModeledDoublerClauses, applyCounterDoubling } from "./replacementEffects.js";

// Real oracle text (verified against the bundled oracle index 2026-06-28).
const C = {
  corpsejack: ["Creature — Fungus", "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead."],
  vorinclex: ["Legendary Creature — Phyrexian Praetor", "Trample, haste\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down."],
  adrix: ["Legendary Creature — Merfolk Wizard", "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nIf one or more tokens would be created under your control, twice that many of those tokens are created instead."],
  // pure doublers — unchanged native-static
  doublingSeason: ["Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."],
  hardenedScales: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."],
  primalVigor: ["Enchantment", "If one or more tokens would be created, twice that many of those tokens are created instead.\nIf one or more +1/+1 counters would be put on a creature, twice that many +1/+1 counters are put on that creature instead."],
  // ── CREED FN-safe NON-flips (a non-doubler ability/clause that isn't modeled → body-only) ──
  mauhur: ["Legendary Creature — Orc Soldier", "Menace\nIf one or more +1/+1 counters would be put on an Army, Goblin, or Orc you control, that many plus one +1/+1 counters are put on it instead."],
  windingConstrictor: ["Creature — Snake", "If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.\nIf you would get one or more counters, you get that many plus one of each of those kinds of counters instead."],
  loadingZone: ["Enchantment", "If one or more counters would be put on a creature, Spacecraft, or Planet you control, twice that many of each of those kinds of counters are put on it instead.\nWarp {G} (You may cast this card from your hand for its warp cost. Exile this enchantment at the beginning of the next end step, then you may cast it from exile on a later turn.)"],
  highScore: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead.\nAt the beginning of your end step, draw a card if you control a creature with the greatest power among creatures on the battlefield."],
  solidGround: ["Enchantment", "When this enchantment enters, earthbend 3. (Target land you control becomes a 0/0 creature with haste that's still a land. Put three +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)\nIf one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on it instead."],
  mondrak: ["Legendary Creature — Phyrexian Horror", "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: Put an indestructible counter on Mondrak."],
  halvingSeason: ["Enchantment", "If an opponent would create one or more tokens, they create half that many of each of those kinds of tokens instead, rounded down.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down."],
};
const card = (k) => ({ name: k, type: C[k][0], oracle: C[k][1] });

describe("doubler full-card coverage — honest flips to native", () => {
  it("flips a doubler on a vanilla/keyword body to native-static", () => {
    expect(classifyCard(card("corpsejack"))).toBe("native-static");   // vanilla 4/4 + ×2 counter doubler
    expect(classifyCard(card("vorinclex"))).toBe("native-static");    // trample,haste + doubler + opp-halve (both modeled)
    expect(classifyCard(card("adrix"))).toBe("native-static");        // Ward {2} + ×2 token doubler
  });
  it("keeps pure doublers native-static (no regression)", () => {
    expect(classifyCard(card("doublingSeason"))).toBe("native-static");
    expect(classifyCard(card("hardenedScales"))).toBe("native-static");
    expect(classifyCard(card("primalVigor"))).toBe("native-static");
  });
  it("flips a doubler MIXED with another fully-modeled ability to native-mixed", () => {
    // Solid Ground = "When this enchantment enters, earthbend 3." + an additive +1/+1 counter doubler.
    // Both resolve: the earthbend ETB fires + animates a land + places counters (verified end-to-end), and
    // the doubler is the runtime replacement. permanentFullyCovered on the doubler-stripped card confirms the
    // remaining earthbend-ETB clause routes natively, so the WHOLE card is modeled → native-mixed.
    expect(classifyCard(card("solidGround"))).toBe("native-mixed");
  });
});

describe("doubler full-card coverage — CREED FN-safe non-flips (body-only)", () => {
  it("does NOT flip a doubler whose OTHER text isn't modeled", () => {
    expect(classifyCard(card("windingConstrictor"))).toBe("body-only"); // 2nd clause = player-counter doubling (unmodeled)
    expect(classifyCard(card("loadingZone"))).toBe("body-only");        // Warp (alt-cast) unmodeled
    expect(classifyCard(card("highScore"))).toBe("body-only");          // end-step intervening-if draw not covered
    expect(classifyCard(card("mondrak"))).toBe("body-only");            // activated indestructible-counter ability
    expect(classifyCard(card("halvingSeason"))).toBe("body-only");      // token-HALVE not modeled (tokenMultiplier has no halve)
  });
  it("excludes a SUBTYPE-restricted recipient (Mauhúr) — no profile, stays body-only", () => {
    expect(doublerProfile(card("mauhur"))).toBeNull();                  // "Army, Goblin, or Orc you control" → not generic
    expect(classifyCard(card("mauhur"))).toBe("body-only");
  });
});

describe("doublerProfile subtype-recipient guard", () => {
  it("keeps a GENERIC you-scoped recipient", () => {
    expect(doublerProfile(card("corpsejack")).counter).toMatchObject({ op: "multiply", factor: 2, kind: "+1/+1", scope: "you" });
    expect(doublerProfile(card("vorinclex")).counter).toMatchObject({ op: "multiply", kind: "any", scope: "you" });
    expect(doublerProfile(card("vorinclex")).halvesOpponents).toBe(true);
  });
  it("drops the counter profile for a subtype-only recipient", () => {
    expect(doublerProfile(card("mauhur"))).toBeNull();
  });
});

describe("isModeledDoublerSentence / stripModeledDoublerClauses", () => {
  it("recognizes the modeled doubler shapes, rejects unmodeled ones", () => {
    expect(isModeledDoublerSentence("if one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead.")).toBe(true);
    expect(isModeledDoublerSentence("if an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down.")).toBe(true);
    expect(isModeledDoublerSentence("if one or more tokens would be created under your control, twice that many of those tokens are created instead.")).toBe(true);
    // unmodeled: subtype recipient, token-halve
    expect(isModeledDoublerSentence("if one or more +1/+1 counters would be put on an army, goblin, or orc you control, that many plus one +1/+1 counters are put on it instead.")).toBe(false);
    expect(isModeledDoublerSentence("if an opponent would create one or more tokens, they create half that many of each of those kinds of tokens instead, rounded down.")).toBe(false);
  });
  it("strips the doubler sentence IN PLACE, preserving reminder-text parentheses", () => {
    const stripped = stripModeledDoublerClauses(C.solidGround[1]);
    expect(stripped).not.toMatch(/twice that many|plus one/i);                 // doubler line gone
    expect(stripped).toContain("earthbend 3");                                 // ability kept
    expect(stripped).toContain("(Target land you control becomes a 0/0 creature"); // reminder paren intact (open)
    expect(stripped).toContain("return it to the battlefield tapped.)");       // reminder paren intact (close)
  });
  it("leaves only keyword text after stripping a pure body doubler", () => {
    expect(stripModeledDoublerClauses(C.corpsejack[1]).trim()).toBe("");
    expect(stripModeledDoublerClauses(C.vorinclex[1]).replace(/\s+/g, " ").trim()).toBe("Trample, haste");
  });
});

describe("runtime over-fire regression (applyCounterDoubling)", () => {
  const state = (k) => ({ players: { p1: { battlefield: [{ id: `t-${k}`, controller: "p1", card: card(k), counters: {} }] } } });
  it("a generic you-doubler still doubles its controller's +1/+1 counters", () => {
    expect(applyCounterDoubling(state("corpsejack"), "p1", "+1/+1", 2)).toBe(4); // ×2
  });
  it("Mauhúr no longer over-applies to every permanent (subtype recipient dropped)", () => {
    expect(applyCounterDoubling(state("mauhur"), "p1", "+1/+1", 2)).toBe(2);     // base, not 3 — over-fire removed
  });
});
