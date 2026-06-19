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
  // ===== TOKENS ===== T4 FP fix — a card whose only "Add …" is a TOKEN's ability (main-text "It has"/
  // "with") is NOT native-mana: the ability belongs to the token, not the card (the engine must never
  // offer "sacrifice Blisterpod for {C}"). These Eldrazi makers are body-only until their create-token
  // TRIGGER is modeled (trigger compiler), at which point they flip native-trigger WITH the token ability.
  it("a token-maker is NOT native-mana (the token's ability is not the card's own)", () => {
    expect(classifyCard(C("Creature — Eldrazi Drone", "When this creature enters, create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"", { name: "Nest Invader" }))).not.toBe("native-mana");
    expect(classifyCard(C("Creature — Eldrazi Drone", "When this creature dies, create a 1/1 colorless Eldrazi Scion creature token. It has \"Sacrifice this token: Add {C}.\"", { name: "Blisterpod" }))).not.toBe("native-mana");
    // but a self-granting lord (Gemhide IS a Sliver) remains a real mana source (not a create-token clause).
    expect(classifyCard(C("Creature — Sliver", "All Sliver creatures have \"{T}: Add one mana of any color.\"", { name: "Gemhide Sliver" }))).toBe("native-mana");
  });
  // ===== TOKENS ===== T4 — a clean mana-token SPELL (the token's sac-for-{C} ability is modeled) is
  // fully native-spell; the create-token atom carries the token's real ability (Growth Spasm-style).
  it("a clean mana-token spell is native-spell", () => {
    expect(classifyCard(C("Sorcery", "Spawning Breath deals 1 damage to any target. Create a 0/1 colorless Eldrazi Spawn creature token. It has \"Sacrifice this token: Add {C}.\"", { name: "Spawning Breath" }))).toBe("native-spell");
  });

  // ===== FIX-MANA-OVERCLAIM ===== the native-mana tier now passes the same all-or-nothing residue gate
  // the other native tiers use: a mana source counts native-mana only when its NON-mana TRIGGER text is
  // modeled too (every trigger routes natively OR is pure mana production; not level-gated). Without this,
  // any "Add {mana}" claimed the whole card native despite an unmodeled trigger/leveler — a metric
  // over-claim (~240 cards; classifyCard has no runtime consumer, so it's metric-only). MUST_STAY_HIGH:
  it("MUST_STAY_HIGH: a plain mana rock/dork stays native-mana (no trigger residue)", () => {
    expect(classifyCard(C("Artifact", "{T}: Add {C}.", { name: "Sol Ring placeholder" }))).toBe("native-mana");
    expect(classifyCard(C("Creature — Elf Druid", "{T}: Add {G}.", { name: "Llanowar Elves" }))).toBe("native-mana");
  });
  it("MUST_STAY_HIGH: a mana source whose trigger ROUTES natively stays native-mana (Meteorite)", () => {
    // the ETB deal-damage parses HIGH and routes → the whole card is still modeled.
    expect(classifyCard(C("Artifact", "When this artifact enters, it deals 2 damage to any target.\n{T}: Add one mana of any color.", { name: "Meteorite" }))).toBe("native-mana");
  });
  // MUST_DROP_TO_LOW: a mana source with an UNMODELED trigger / level structure is an over-claim → it must
  // fall out of native-mana to body-only (→ Arbiter), exactly like the other all-or-nothing native tiers.
  it("MUST_DROP_TO_LOW: a mana rock with an unmodeled trigger is NOT native-mana (Mana Crypt's coin-flip)", () => {
    expect(classifyCard(C("Artifact", "At the beginning of your upkeep, flip a coin. If you lose the flip, this artifact deals 3 damage to you.\n{T}: Add {C}{C}.", { name: "Mana Crypt" }))).not.toBe("native-mana");
  });
  it("MUST_DROP_TO_LOW: a leveler that grants a mana ability is NOT native-mana (Sorcerer Class)", () => {
    expect(classifyCard(C("Enchantment — Class", "When this Class enters, draw two cards, then discard two cards.\n{U}{R}: Level 2\nCreatures you control have \"{T}: Add {U} or {R}. Spend this mana only to cast an instant or sorcery spell or to gain a Class level.\"\n{3}{U}{R}: Level 3", { name: "Sorcerer Class" }))).not.toBe("native-mana");
  });
  it("MUST_DROP_TO_LOW: a mana dork with an unmodeled ETB restriction is NOT native-mana (Spara's Adjudicators)", () => {
    expect(classifyCard(C("Creature — Bird Soldier", "When this creature enters, target creature an opponent controls can't attack or block until your next turn.\n{T}: Add {G}, {W}, or {U}.", { name: "Spara's Adjudicators" }))).not.toBe("native-mana");
  });
  it("MUST_DROP_TO_LOW: a triggered-mana-only card the engine can't produce is NOT native-mana (Coal Stoker)", () => {
    // no tap ability; the ETB "add {R}{R}{R}" isn't a stack effect (doesn't route) and the mana model only
    // produces tap/sac mana — so the engine yields ZERO mana from it: a true over-claim, correctly dropped.
    expect(classifyCard(C("Creature — Elemental", "When this creature enters, if you cast it from your hand, add {R}{R}{R}.", { name: "Coal Stoker" }))).not.toBe("native-mana");
  });
  it("a vanilla or keyword-only creature is native-body", () => {
    expect(classifyCard(C("Creature — Bear", ""))).toBe("native-body");
    expect(classifyCard(C("Creature — Angel", "Flying, vigilance"))).toBe("native-body");
    expect(classifyCard(C("Creature — Beast", "Trample (reminder)"))).toBe("native-body");
  });
  // VERIFY-COVERED-KW / enforce-don't-drop policy (retired-fp-ledger.md, 2026-06-18): a keyword-only body
  // is native-body. ENFORCED keywords resolve correctly today; the INTERIM-FP keywords (menace, defender,
  // hexproof, shroud, ward, protection, prowess, skulk, intimidate, fear, horsemanship) are KEPT claimed
  // native as a time-boxed trade while their enforcement is built (Cindy's EVADE / TARGET-RESTRICT / PROWESS
  // lanes). Do NOT re-drop them (that was #255, SUPERSEDED) — BUILD the enforcement instead.
  it("MUST_STAY_HIGH: a body whose only text is a covered keyword is native-body (enforced + interim-FP)", () => {
    for (const kw of ["Flying", "Reach", "First strike", "Double strike", "Trample", "Deathtouch",
      "Lifelink", "Vigilance", "Haste", "Indestructible", "Flash",                  // enforced — correct today
      "Menace", "Defender", "Hexproof", "Shroud", "Ward {2}", "Protection from red", // interim-FP — kept native,
      "Prowess", "Skulk", "Intimidate", "Fear", "Horsemanship"]) {                  // pending enforcement
      expect(classifyCard(C("Creature — Bear", kw))).toBe("native-body");
    }
    expect(classifyCard(C("Creature — Bird", "Flying, menace"))).toBe("native-body");
    // Reminder text is stripped first (CR 207.2), so a keyword printed with its reminder still classifies clean.
    expect(classifyCard(C("Creature — Goblin", "Menace (This creature can't be blocked except by two or more creatures.)"))).toBe("native-body");
  });
  // FIX-PW-LAND-ORDER: a Land Planeswalker (Wrenn and One) with unmodeled loyalty must hit the
  // planeswalker gate, NOT the land tier — else it's mis-counted native-`land` despite unmodeled abilities.
  it("FIX-PW-LAND-ORDER: a Land Planeswalker with unmodeled loyalty is NOT native-land", () => {
    const wrenn = C("Land Planeswalker — Wrenn",
      "+1: Wrenn and One gains \"{T}: Add {G}\" until your next turn.\n−1: Create a 1/1 green Squirrel creature token.\n−4: You get an emblem with \"At the beginning of your precombat main phase, add {G} for each creature you control.\"",
      { loyalty: "5", name: "Wrenn and One" });
    const tier = classifyCard(wrenn);
    expect(tier).not.toBe("land");          // no longer masked as native-land
    expect(NATIVE_TIERS.has(tier)).toBe(false); // unmodeled loyalty → routes to the Arbiter (arbiter-pw)
  });
  it("a HIGH instant/sorcery is native-spell", () => {
    expect(classifyCard(C("Instant", "Lightning Bolt deals 3 damage to any target.", { name: "Lightning Bolt" }))).toBe("native-spell");
  });
  // ===== DMG-SCALE ===== (WALT-DMG-SCALE) board-count damage is native-spell; an unmodeled count source
  // (opponent-scoped / subtype / graveyard) routes the whole spell to the Arbiter.
  it("DMG-SCALE: 'damage = number of <permanents you control>' is native-spell; an unmodeled source bounces", () => {
    expect(classifyCard(C("Sorcery", "Spitting Earth deals damage to target creature equal to the number of Mountains you control.", { name: "Spitting Earth" }))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Massive Raid deals damage to any target equal to the number of creatures you control.", { name: "Massive Raid" }))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Goblin War Strike deals damage to target player equal to the number of Goblins you control.", { name: "Goblin War Strike" }))).toBe("native-spell"); // creature subtype now MODELED (WALT-COUNT-SUBTYPE)
    expect(classifyCard(C("Sorcery", "Sudden Impact deals damage to target player equal to the number of cards in that player's hand.", { name: "Sudden Impact" }))).toBe("native-spell"); // the target player's hand now modeled (WALT-COUNT-OPP)
    expect(classifyCard(C("Instant", "Incite deals damage to target creature equal to the number of creatures they control.", { name: "Incite" }))).toBe("arbiter-spell"); // opponent's PERMANENTS still bounce
  });
  it("P3.1 / SOFT-CNT: bare + fixed-{N} 'unless pays' counters are native-spell; a variable/rider counter bounces to arbiter-spell", () => {
    expect(classifyCard(C("Instant", "Counter target spell.", { name: "Counterspell" }))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Counter target noncreature spell.", { name: "Negate" }))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Counter target spell unless its controller pays {3}.", { name: "Mana Leak" }))).toBe("native-spell");      // SOFT-CNT — fixed {N} now modeled
    expect(classifyCard(C("Instant", "Counter target spell unless its controller pays {X}.", { name: "Clash of Wills" }))).toBe("arbiter-spell"); // variable {X} stays Arbiter
  });
  it("a 'search → hand → shuffle' tutor is native-spell; RAMP-1: a single-land 'onto the battlefield' fetch is native too, multi-land/non-land bounce", () => {
    expect(classifyCard(C("Sorcery", "Search your library for a creature card, reveal it, put it into your hand, then shuffle.", { name: "Eladamri's Call" }))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a basic land card, reveal it, put it into your hand, then shuffle.", { name: "Lay of the Land" }))).toBe("native-spell");
    // The unfiltered tutor is native too now (the player picks any card via the picker).
    expect(classifyCard(C("Sorcery", "Search your library for a card, put that card into your hand, then shuffle.", { name: "Demonic Tutor" }))).toBe("native-spell");
    // RAMP-1: a single basic land onto the battlefield is now native (the fetched land enters via the tutor picker).
    expect(classifyCard(C("Sorcery", "Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.", { name: "Rampant Growth" }))).toBe("native-spell");
    // Still Arbiter: a MULTI-land battlefield fetch (Explosive Vegetation) and a non-land cheat-into-play (Natural Order).
    expect(classifyCard(C("Sorcery", "Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.", { name: "Explosive Vegetation" }))).toBe("arbiter-spell");
    expect(classifyCard(C("Sorcery", "Search your library for a green creature card, put it onto the battlefield, then shuffle.", { name: "Natural Order" }))).toBe("arbiter-spell");
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
    // some events. A modeled ETB next to an UNDETECTED trigger (a leaves-the-battlefield event
    // we never fire, a "Whenever you cast …" self-untap) must stay body-only, not be silently
    // credited. This also pins the latent over-claim the composite work surfaced. (Both a
    // you-control dies drain — #8b — AND a lifegain event — TRIG-LIFEGAIN — ARE modeled now, so
    // the undetected example here uses LTB, which is intentionally never fired → still unrecognized.)
    expect(classifyCard(C("Creature — Cleric", "When this creature enters, draw a card.\nWhen this creature leaves the battlefield, each opponent loses 1 life."))).toBe("body-only");
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
