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
  it("P3.1 / SOFT-CNT: bare + fixed-{N} 'unless pays' counters are native-spell; a variable/rider counter bounces to arbiter-spell", () => {
    expect(classifyCard(C("Instant", "Counter target spell.", { name: "Counterspell" }))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Counter target noncreature spell.", { name: "Negate" }))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Counter target spell unless its controller pays {3}.", { name: "Mana Leak" }))).toBe("native-spell");      // SOFT-CNT — fixed {N} now modeled
    expect(classifyCard(C("Instant", "Counter target spell unless its controller pays {X}.", { name: "Clash of Wills" }))).toBe("arbiter-spell"); // variable {X} stays Arbiter
  });
  it("a 'search → hand → shuffle' tutor is native-spell (filtered OR unfiltered via the picker); battlefield bounces", () => {
    expect(classifyCard(C("Sorcery", "Search your library for a creature card, reveal it, put it into your hand, then shuffle.", { name: "Eladamri's Call" }))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.", { name: "Lay of the Land" }))).toBe("native-spell");
    // The unfiltered tutor is native too now (the player picks any card via the picker).
    expect(classifyCard(C("Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", { name: "Demonic Tutor" }))).toBe("native-spell");
    // A battlefield/top destination (deferred) still routes to the Arbiter.
    expect(classifyCard(C("Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", { name: "Rampant Growth" }))).toBe("arbiter-spell");
  });
  it("a permanent with abilities is body-only (body works, ability doesn't yet)", () => {
    // P2.8 + the flush-time target chooser: a body whose ONLY ability is a now-firing
    // trigger is native — INCLUDING a targeted trigger (the chooser binds its target at
    // flush time, CR 603.3c).
    expect(classifyCard(C("Creature — Wizard", "When this creature enters the battlefield, draw a card."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Soldier", "When this creature enters, create a 1/1 white Soldier creature token."))).toBe("native-trigger");
    expect(classifyCard(C("Creature — Wizard", "When this creature enters the battlefield, destroy target creature."))).toBe("native-trigger");
    // P3.2: an ETB tutor (Trophy Mage shape) routes its search through the flush → native.
    expect(classifyCard(C("Creature — Wizard", "When this creature enters, search your library for an artifact card, reveal it, put it into your hand, then shuffle."))).toBe("native-trigger");
    // Still body-only: an UNMODELED static (a conditional anthem the parser refuses to
    // fabricate), unmodeled activated, a MODAL trigger (the engine won't silently pick a
    // mode), or an intervening-if trigger (condition unevaluated).
    expect(classifyCard(C("Enchantment", "Creatures you control get +2/+2 as long as you control a Forest."))).toBe("body-only");
    expect(classifyCard(C("Creature — Knight", "When this enters, draw a card. {2}, {T}: Draw a card."))).toBe("body-only"); // extra activated text
    expect(classifyCard(C("Creature — Wizard", "When this enters, choose one — draw a card; or you gain 3 life."))).toBe("body-only"); // modal → fallback
    // Intervening-if (CR 603.4) is NOT routed by the engine, so it must NOT count native.
    expect(classifyCard(C("Creature — Cleric", "When this creature enters, if you control another creature, draw a card."))).toBe("body-only");
    // α1: an AMBIGUOUS targeted trigger (bounce — could aim at a friendly OR an enemy) is NOT routed
    // by the engine (the enemy/own chooser can't prove a correct side), so the metric must NOT
    // over-claim it as native — it stays in the gap. (Counter / removal / damage triggers, which ARE
    // intent-resolvable, now route natively — see the flushTargetChooser + targetedRemoval tests.)
    expect(classifyCard(C("Creature — Sprite", "When this creature enters, return target creature to its owner's hand."))).toBe("body-only");
  });
  it("a permanent whose only text is modeled activated abilities is native-activated (P2.9)", () => {
    // {T} pinger, mana-cost draw, tapper, and a keyword + modeled ability — all native.
    expect(classifyCard(C("Creature — Wizard", "{T}: This creature deals 1 damage to any target."))).toBe("native-activated");
    expect(classifyCard(C("Artifact", "{4}, {T}: Draw a card."))).toBe("native-activated");
    expect(classifyCard(C("Creature — Wall", "Defender\n{1}{W}, {T}: Tap target creature."))).toBe("native-activated");
    // P3.2: a modeled activated tutor (Journeyer's Kite / Captain Sisay shape) is native.
    expect(classifyCard(C("Artifact", "{3}, {T}: Search your library for a basic land card, reveal it, put it into your hand, then shuffle."))).toBe("native-activated");
    // γ1: a NO-CHOICE self-sacrifice / pay-life activated cost is modeled → native.
    expect(classifyCard(C("Creature — Wizard", "{1}, Sacrifice this creature: Draw a card."))).toBe("native-activated");
    expect(classifyCard(C("Creature — Cleric", "{T}, Pay 2 life: Draw a card."))).toBe("native-activated");
    // γ1b: a "Sacrifice a/another <type>" outlet is now modeled too (legalChoices picks the victim).
    expect(classifyCard(C("Creature — Wizard", "{1}, Sacrifice a creature: Draw a card."))).toBe("native-activated");
    expect(classifyCard(C("Artifact", "Sacrifice another creature: Draw a card."))).toBe("native-activated");
    // Still body-only: a MULTI-sacrifice cost (count > 1 — deferred), an UNFILTERED tutor (the choice
    // is the point), or an activated ability sitting next to an UNMODELED trigger (composite → safe).
    expect(classifyCard(C("Creature — Wizard", "{1}, Sacrifice two creatures: Draw a card."))).toBe("body-only");
    expect(classifyCard(C("Artifact", "{2}, {T}: Search your library for a card, then shuffle."))).toBe("body-only");
    expect(classifyCard(C("Creature — Human", "{T}: This creature deals 1 damage to any target.\nWhenever this creature deals damage, you may untap it."))).toBe("body-only");
  });
  it("a permanent whose only text is a modeled static anthem is native-static (P2.10)", () => {
    // Pure anthem enchantment + a vanilla-body lord (body + layer anthem) are fully native.
    expect(classifyCard(C("Enchantment", "Creatures you control get +1/+1."))).toBe("native-static");
    expect(classifyCard(C("Creature — Soldier", "Other creatures you control get +1/+1."))).toBe("native-static");
    expect(classifyCard(C("Creature — Sliver", "Flying\nOther Sliver creatures you control get +1/+1 and have flying."))).toBe("native-static");
    // Still body-only: an anthem next to an UNMODELED trigger (composite → conservative),
    // or a conditional/variable anthem the parser refuses to fabricate. (Scry IS modeled now —
    // #9 — so the unmodeled example uses an impulse-exile effect we don't model.)
    expect(classifyCard(C("Creature — Cat", "Other creatures you control get +1/+1.\nWhenever this creature attacks, exile the top card of your library."))).toBe("body-only");
    expect(classifyCard(C("Creature — Sliver", "Other Slivers get +1/+1 for each other Sliver."))).toBe("body-only");
  });
  it("a multi-ability permanent whose pieces are EACH modeled is native-mixed (composite)", () => {
    // static anthem + activated ability (Imperious Perfect); upkeep trigger + pinger (Staff
    // of Nin); static lord + ETB token (Captain of the Watch). None pass a single-mechanism
    // predicate (each sees the others as residue), but the engine plays all the pieces.
    expect(classifyCard(C("Creature — Elf", "Other Elves you control get +1/+1.\n{G}, {T}: Create a 1/1 green Elf Warrior creature token."))).toBe("native-mixed");
    expect(classifyCard(C("Artifact", "At the beginning of your upkeep, draw a card.\n{T}: This artifact deals 1 damage to any target."))).toBe("native-mixed");
    expect(classifyCard(C("Creature — Soldier", "Vigilance\nOther Soldier creatures you control get +1/+1 and have vigilance.\nWhen this creature enters, create three 1/1 white Soldier creature tokens."))).toBe("native-mixed");
  });

  it("does NOT over-claim a card with an UNMODELED trigger beside a modeled one (count guard)", () => {
    // The residue strips ALL When/Whenever sentences — but detectTriggers only recognizes
    // some events. A modeled ETB next to an UNDETECTED trigger (a lifegain event we don't
    // recognize, a "Whenever you cast …" self-untap) must stay body-only, not be silently
    // credited. This also pins the latent over-claim the composite work surfaced. (A you-control
    // dies drain like Elas il-Kor IS modeled now via the controller-scope work — #8b — so the
    // undetected example here uses a still-unrecognized trigger event.)
    expect(classifyCard(C("Creature — Cleric", "When this creature enters, draw a card.\nWhenever you gain life, each opponent loses 1 life."))).toBe("body-only");
    expect(classifyCard(C("Creature — Wizard", "{T}: This creature deals 1 damage to any target.\nWhenever you cast an instant or sorcery spell, untap this creature."))).toBe("body-only");
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
  it("hasManaAbility IGNORES 'Add … mana' that lives only in reminder text (CR 207.2)", () => {
    // Token-MAKER: the only "Add … mana" is the reminder describing the Treasure it creates — the
    // permanent itself has NO mana ability (Mahadi / Brazen Freebooter were mis-classified native-mana).
    expect(hasManaAbility("When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")")).toBe(false);
    // "Add one [lore counter]" inside a Saga's read-ahead reminder is NOT mana.
    expect(hasManaAbility("Read ahead (Choose a chapter and start with that many lore counters. Add one after your draw step.)")).toBe(false);
    // A REAL tap-for-mana (main text) still counts, even with unrelated reminder text alongside.
    expect(hasManaAbility("{T}: Add {G}. (This is reminder text.)")).toBe(true);
  });
  it("a token-MAKER is NOT classified native-mana (its real ETB/trigger is what must be modeled)", () => {
    // The permanent has no mana ability of its own; on a base without the token-effect modeled it is
    // body-only (and with the trigger modeled it becomes native-trigger) — never native-mana.
    expect(classifyCard(C("Creature — Human Pirate", "When this creature enters, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")", { name: "Brazen Freebooter" }))).not.toBe("native-mana");
    // A real dual land whose mana ability is printed AS reminder text stays native via the `land` tier.
    expect(classifyCard(C("Land — Plains Island", "({T}: Add {W} or {U}.)", { name: "Tundra" }))).toBe("land");
  });
});

describe("coverageSummary", () => {
  // A tiny fixed "deck" spanning every tier; locks the metric so coverage never
  // silently regresses. As P2.8+ land, the ETB/anthem fixtures move to native and
  // these expectations get TIGHTENED deliberately (never loosened).
  const DECK = [
    C("Basic Land — Island", "", { qty: 9 }),
    C("Artifact", "{T}: Add {C}.", { qty: 2 }),                  // native-mana
    C("Creature — Bear", "", { qty: 2 }),                         // native-body
    C("Instant", "Deal 3 damage to any target.", { qty: 1 }),     // native-spell
    C("Instant", "Counter target spell.", { qty: 1 }),            // native-spell (P3.1)
    C("Creature — Wizard", "When this enters, draw a card.", { qty: 2 }), // native-trigger (P2.8)
    C("Enchantment", "Creatures you control get +1/+1.", { qty: 1 }),     // native-static (P2.10)
    C("Enchantment", "Creatures you control get +2/+2 as long as you control a Forest.", { qty: 1 }), // body-only (conditional static — unmodeled)
    C("Sorcery", "Target player mills four cards.", { qty: 1 }), // arbiter-spell (mill — unmodeled)
  ];
  it("counts tiers weighted by qty and computes native %", () => {
    const s = coverageSummary(DECK);
    expect(s.total).toBe(20);
    expect(s.tiers.land).toBe(9);
    expect(s.tiers["native-mana"]).toBe(2);
    expect(s.tiers["native-body"]).toBe(2);
    expect(s.tiers["native-spell"]).toBe(2); // Deal 3 damage + Counterspell (P3.1)
    expect(s.tiers["native-trigger"]).toBe(2);
    expect(s.tiers["native-static"]).toBe(1);
    expect(s.tiers["body-only"]).toBe(1);
    expect(s.tiers["arbiter-spell"]).toBe(1);
    expect(s.native).toBe(18); // 9 + 2 + 2 + 2 + 2 + 1
    expect(s.pct).toBe(90);    // 18/20
  });
  it("every native tier is in NATIVE_TIERS and gap tiers are not", () => {
    expect([...NATIVE_TIERS].sort()).toEqual(["land", "native-activated", "native-aura", "native-body", "native-clone", "native-equipment", "native-mana", "native-mixed", "native-planeswalker", "native-spell", "native-static", "native-trigger"]);
  });
  it("buckets the gap by mechanism (ETB value is no longer in the gap)", () => {
    const s = coverageSummary(DECK);
    expect(s.gap["ETB trigger"]).toBeUndefined(); // the ETB draw is native now
    expect(s.gap["Static anthem/buff"]).toBe(1);  // the CONDITIONAL anthem stays in the gap
    expect(Object.values(s.gap).reduce((a, b) => a + b, 0)).toBe(2); // conditional anthem + mill
  });
});
