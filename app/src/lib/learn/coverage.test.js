import { describe, it, expect } from "vitest";
import { classifyCard, coverageSummary, isKeywordOnly, hasManaAbility, NATIVE_TIERS } from "./coverage.js";

// Fixtures are enriched card shapes ({ type, oracle, mana, name }) hardcoded so the
// test is deterministic and needs NO card index (CI has no Scryfall bulk data).
const C = (type, oracle, extra = {}) => ({ type, oracle, mana: "", name: "x", ...extra });

describe("classifyCard — tiers", () => {
  it("a basic land is native", () => {
    expect(classifyCard(C("Basic Land — Forest", ""))).toBe("land");
    expect(classifyCard(C("Land", "{T}: Add {C}."))).toBe("land");
  });
  it("a mana rock/dork is native-mana", () => {
    expect(classifyCard(C("Artifact", "{T}: Add one mana of any color."))).toBe("native-mana");
    expect(classifyCard(C("Creature — Elf Druid", "{T}: Add {G}."))).toBe("native-mana");
  });
  it("a vanilla or keyword-only creature is native-body", () => {
    expect(classifyCard(C("Creature — Bear", ""))).toBe("native-body");
    expect(classifyCard(C("Creature — Angel", "Flying, vigilance"))).toBe("native-body");
    expect(classifyCard(C("Creature — Beast", "Trample (reminder)"))).toBe("native-body");
  });
  it("a HIGH instant/sorcery is native-spell", () => {
    expect(classifyCard(C("Instant", "Lightning Bolt deals 3 damage to any target.", { name: "Lightning Bolt" }))).toBe("native-spell");
  });
  it("a complex spell (tutor/counter) bounces to arbiter-spell", () => {
    expect(classifyCard(C("Instant", "Counter target spell.", { name: "Counterspell" }))).toBe("arbiter-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a creature card, reveal it, put it into your hand, then shuffle.", { name: "tutor" }))).toBe("arbiter-spell");
  });
  it("a permanent with abilities is body-only (body works, ability doesn't yet)", () => {
    // P2.8 + the flush-time target chooser: a body whose ONLY ability is a now-firing
    // trigger is native — INCLUDING a targeted trigger (the chooser binds its target at
    // flush time, CR 603.3c).
    expect(classifyCard(C("Creature — Wizard", "When this creature enters the battlefield, draw a card."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Soldier", "When this creature enters, create a 1/1 white Soldier creature token."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Wizard", "When this creature enters the battlefield, destroy target creature."))).toBe("native-trigger");
    // Still body-only: unmodeled static, unmodeled activated, a MODAL trigger (the engine
    // won't silently pick a mode), or an intervening-if trigger (condition unevaluated).
    expect(classifyCard(C("Enchantment", "Creatures you control get +1/+1."))).toBe("body-only");
    expect(classifyCard(C("Creature — Knight", "When this enters, draw a card. {2}, {T}: Draw a card."))).toBe("body-only"); // extra activated text
    expect(classifyCard(C("Creature — Wizard", "When this enters, choose one — draw a card; or you gain 3 life."))).toBe("body-only"); // modal → fallback
    // Intervening-if (CR 603.4) is NOT routed by the engine, so it must NOT count native.
    expect(classifyCard(C("Creature — Cleric", "When this creature enters, if you control another creature, draw a card."))).toBe("body-only");
  });
  it("a planeswalker is arbiter-pw", () => {
    expect(classifyCard(C("Legendary Planeswalker — Jace", "+1: Draw a card."))).toBe("arbiter-pw");
  });
});

describe("helpers", () => {
  it("isKeywordOnly: vanilla + keyword-only true, ability false", () => {
    expect(isKeywordOnly("")).toBe(true);
    expect(isKeywordOnly("Flying")).toBe(true);
    expect(isKeywordOnly("Flying, first strike, trample")).toBe(true);
    expect(isKeywordOnly("When this enters, draw a card.")).toBe(false);
  });
  it("hasManaAbility detects mana producers", () => {
    expect(hasManaAbility("{T}: Add {G}.")).toBe(true);
    expect(hasManaAbility("{T}: Add two mana of any one color.")).toBe(true);
    expect(hasManaAbility("When this enters, draw a card.")).toBe(false);
  });
});

describe("coverageSummary", () => {
  // A tiny fixed "deck" spanning every tier; locks the metric so coverage never
  // silently regresses. As P2.8+ land, the ETB/anthem fixtures move to native and
  // these expectations get TIGHTENED deliberately (never loosened).
  const DECK = [
    C("Basic Land — Island", "", { qty: 10 }),
    C("Artifact", "{T}: Add {C}.", { qty: 2 }),                  // native-mana
    C("Creature — Bear", "", { qty: 2 }),                         // native-body
    C("Instant", "Deal 3 damage to any target.", { qty: 1 }),     // native-spell
    C("Creature — Wizard", "When this enters, draw a card.", { qty: 2 }), // native-trigger (P2.8)
    C("Enchantment", "Creatures you control get +1/+1.", { qty: 1 }),     // body-only (static — P2.10)
    C("Instant", "Counter target spell.", { qty: 1 }),            // arbiter-spell (P3.1)
  ];
  it("counts tiers weighted by qty and computes native %", () => {
    const s = coverageSummary(DECK);
    expect(s.total).toBe(19);
    expect(s.tiers.land).toBe(10);
    expect(s.tiers["native-mana"]).toBe(2);
    expect(s.tiers["native-body"]).toBe(2);
    expect(s.tiers["native-spell"]).toBe(1);
    expect(s.tiers["native-trigger"]).toBe(2);
    expect(s.tiers["body-only"]).toBe(1);
    expect(s.tiers["arbiter-spell"]).toBe(1);
    expect(s.native).toBe(17); // 10 + 2 + 2 + 1 + 2
    expect(s.pct).toBe(89);    // 17/19
  });
  it("every native tier is in NATIVE_TIERS and gap tiers are not", () => {
    expect([...NATIVE_TIERS].sort()).toEqual(["land", "native-body", "native-mana", "native-spell", "native-trigger"]);
  });
  it("buckets the gap by mechanism (ETB value is no longer in the gap)", () => {
    const s = coverageSummary(DECK);
    expect(s.gap["ETB trigger"]).toBeUndefined(); // the ETB draw is native now
    expect(s.gap["Static anthem/buff"]).toBe(1);
    expect(Object.values(s.gap).reduce((a, b) => a + b, 0)).toBe(2); // anthem + counter
  });
});
