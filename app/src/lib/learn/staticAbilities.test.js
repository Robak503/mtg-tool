/**
 * staticAbilities.test.js — the bounded oracle → static-effect parser (PR-9).
 * Focus: the recognized anthem/lord/grant grammar AND the anti-fabrication
 * guards (a miss is safe; reminder/conditional text must NOT grant anything).
 */

import { describe, it, expect } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createGameState } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

function card(name, oracle, type = "Creature") {
  return { name, type, oracle, power: 0, toughness: 0 };
}
function perm(name, id, controller, { power = 1, toughness = 1, type = "Creature", oracle = "" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null, timestamp: 0 };
}
function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}

describe("parseStaticAbilities — P/T anthems", () => {
  it("'Creatures you control get +1/+1.'", () => {
    const d = parseStaticAbilities(card("Glorious Anthem", "Creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(7);
    expect(d[0].sublayer).toBe("7c");
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector.controllerScope).toBe("you");
  });

  it("'Other Sliver creatures you control get +1/+1.' (excludeSelf)", () => {
    const d = parseStaticAbilities(card("Muscle Sliver", "Other Sliver creatures you control get +1/+1.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
    expect(d[0].affects.selector.excludeSelf).toBe(true);
  });

  it("'Other Slivers you control get +1/+1.' (plural subtype, no 'creatures')", () => {
    const d = parseStaticAbilities(card("Sliver Lord", "Other Slivers you control get +1/+1.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
  });

  it("color anthem: 'White creatures you control get +1/+1.'", () => {
    const d = parseStaticAbilities(card("Honor of the Pure", "White creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.colors).toEqual(["W"]);
  });

  it("handles +2/+0 style boosts", () => {
    const d = parseStaticAbilities(card("Weird Anthem", "Creatures you control get +2/+0.", "Enchantment"));
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 2, toughness: 0 });
  });
});

describe("parseStaticAbilities — keyword grants", () => {
  it("'Creatures you control have flying.'", () => {
    const d = parseStaticAbilities(card("Levitation", "Creatures you control have flying.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].layer).toBe(6);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Flying" });
  });

  it("'Other Sliver creatures you control have flying.'", () => {
    const d = parseStaticAbilities(card("Galerider Sliver", "Other Sliver creatures you control have flying.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Flying" });
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
  });

  it("grants multiple keywords in one 'have' clause", () => {
    const d = parseStaticAbilities(card("Big Lord", "Creatures you control have flying and vigilance.", "Enchantment"));
    const kws = d.map(e => e.op.keyword).sort();
    expect(kws).toEqual(["Flying", "Vigilance"]);
  });
});

// ── STATIC ABILITY-WORD LABEL strip (CR 207.2c) ─────────────────────────────────────────────────────
// An ability word is italic flavor with NO rules meaning; the static line after it is the real ability.
// parseClause strips an ENUMERATED set of static ability-word labels (metalcraft/threshold/delirium +
// "unlock ability", the FF set's word on Sphere Grid) so the bare static matches. Enumerated, NOT an
// open-ended "<Word> —" strip — a blanket strip would mis-normalize the 337 real ability words that carry
// intervening-if conditions. Sphere Grid's ruling refers to "Sphere Grid's last ability"; the static is
// unconditional (the label is pure flavor, not a functional gate), so the strip is CREED-safe.
describe("parseStaticAbilities — Unlock Ability ability-word label (Sphere Grid)", () => {
  it("strips 'Unlock Ability —' so the static grant parses identically to the label-less line", () => {
    const labelled = parseStaticAbilities(card("Sphere Grid", "Unlock Ability — Creatures you control with +1/+1 counters on them have reach and trample.", "Enchantment"));
    const bare = parseStaticAbilities(card("X", "Creatures you control with +1/+1 counters on them have reach and trample.", "Enchantment"));
    expect(labelled).toEqual(bare);
    const kws = labelled.map(e => e.op.keyword).sort();
    expect(kws).toEqual(["Reach", "Trample"]);
    // the grant is gated on a +1/+1 counter (the trigger's payoff), not a blanket team buff
    expect(labelled[0].affects.selector.requiresCounter).toBe("+1/+1");
  });

  it("Sphere Grid (full card) classifies native-mixed — combat-damage trigger + the unlocked static both modeled", () => {
    const sphereGrid = "Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on that creature.\nUnlock Ability — Creatures you control with +1/+1 counters on them have reach and trample.";
    expect(classifyCard({ name: "Sphere Grid", type: "Enchantment", oracle: sphereGrid })).toBe("native-mixed");
  });

  it("CREED: a NON-ability-word label on a static stays body-only (the strip is enumerated, not blanket)", () => {
    // An arbitrary "<Word> —" prefix is NOT an ability word; it must NOT be stripped, so the static never matches.
    expect(parseStaticAbilities(card("X", "Foo Bar — Creatures you control have reach and trample.", "Enchantment"))).toHaveLength(0);
    expect(classifyCard({ name: "X", type: "Enchantment", oracle: "Foo Bar — Creatures you control have reach and trample." })).not.toBe("native-static");
  });
});

// ── STATIC-ANTHEM keyword-grant ALL-OR-NOTHING FP FIX ───────────────────────────────────────────────
// The keyword pass used to DROP a non-grantable segment and still emit the grantable ones — a partial flip
// is a FORBIDDEN false positive. Now: if the "have <tail>" carries ANY non-grantable segment, the WHOLE
// clause stays body-only (no keyword AND no P/T descriptor — the P2.10 combined clause leaks otherwise).
describe("parseStaticAbilities — keyword-grant all-or-nothing (FP fix)", () => {
  // STATIC-ANTHEM PROTECTION-GRANT: a "have <tail>" mixing grantable keywords with a PROTECTION-FROM-COLOR
  // span is now MODELED (the protection reuses the enforced layer-6 addProtection op — see
  // anthemProtection.test.js for the runtime enforcement). The former all-or-nothing FN ("protection drops
  // the whole clause") is gone for the COLOR case; a NON-color/dynamic protection or any OTHER non-grantable
  // segment (afflict, ward, "attack each combat if able") still drops the whole clause.
  it("Akroma's Memorial: '… have flying, …, and protection from black and from red' → 5 keyword grants + 1 addProtection(B,R)", () => {
    const oracle = "Creatures you control have flying, first strike, vigilance, trample, haste, and protection from black and from red.";
    const c = card("Akroma's Memorial", oracle, "Legendary Artifact");
    const d = parseStaticAbilities(c);
    expect(d.filter((e) => e.op.layerOp === "addKeyword").map((e) => e.op.keyword).sort())
      .toEqual(["First strike", "Flying", "Haste", "Trample", "Vigilance"]);
    const prot = d.find((e) => e.op.layerOp === "addProtection");
    expect(prot.op.colors).toEqual(["B", "R"]);
    expect(prot.affects.selector).toEqual({ controllerScope: "you", cardTypes: ["Creature"] });
    expect(classifyCard(c)).toBe("native-static"); // a CLEAN flip — every segment of the whole card is modeled
  });

  it("a NON-color anthem protection quality STILL drops the whole clause (model both or neither)", () => {
    // Sword-of-Wealth-and-Power phrasing on an anthem: "protection from instants and from sorceries" is unmodeled.
    const c = card("X", "Creatures you control have flying and protection from instants and from sorceries.", "Enchantment");
    expect(parseStaticAbilities(c)).toHaveLength(0);
    expect(classifyCard(c)).not.toBe("native-static");
  });

  it("Avatar of Slaughter: 'All creatures have double strike and attack each combat if able' → ZERO descriptors", () => {
    const c = card("Avatar of Slaughter", "All creatures have double strike and attack each combat if able.", "Creature — Avatar");
    expect(parseStaticAbilities(c)).toHaveLength(0);
    expect(classifyCard(c)).not.toBe("native-static");
  });

  it("Hellraiser Goblin: 'Creatures you control have haste and attack each combat if able' → ZERO descriptors", () => {
    const c = card("Hellraiser Goblin", "Creatures you control have haste and attack each combat if able.", "Creature — Goblin Berserker");
    expect(parseStaticAbilities(c)).toHaveLength(0);
    expect(classifyCard(c)).not.toBe("native-static");
  });

  it("Giant Ankheg: 'Other creatures you control have trample and ward {2}' → ZERO descriptors (ward not grantable)", () => {
    const c = card("Giant Ankheg", "Other creatures you control have trample and ward {2}.", "Creature — Insect");
    expect(parseStaticAbilities(c)).toHaveLength(0);
  });

  it("combined P2.10 clause is guarded WHOLE on a LOSSY tail: '… get +1/+1 and have flying and ward {2}' → NO P/T leak, NO keyword leak", () => {
    // ward {2} is not grantable → the whole clause (P/T + keyword) drops. (The protection-from-COLOR variant
    // is now MODELED — see the clean case below — so this uses a genuinely-unmodeled tail segment.)
    const c = card("Lossy Lord", "Creatures you control get +1/+1 and have flying and ward {2}.", "Enchantment");
    expect(parseStaticAbilities(c)).toHaveLength(0); // neither the +1/+1 nor the flying survives
  });

  it("combined P2.10 clause with a CLEAN protection tail: '… get +1/+1 and have flying and protection from red' → P/T + keyword + addProtection", () => {
    const c = card("Sun Lord", "Creatures you control get +1/+1 and have flying and protection from red.", "Enchantment");
    const d = parseStaticAbilities(c);
    expect(d.find((e) => e.op.layerOp === "ptModify").op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d.find((e) => e.op.layerOp === "addKeyword").op.keyword).toBe("Flying");
    expect(d.find((e) => e.op.layerOp === "addProtection").op.colors).toEqual(["R"]);
  });

  // REGRESSION — clean tails (every segment grantable) must STILL parse natively.
  it("Cloudshredder-style 'have flying and haste' still grants both keywords", () => {
    const d = parseStaticAbilities(card("Cloudshredder Sliver", "Sliver creatures you control have flying and haste.", "Creature — Sliver"));
    expect(d.map(e => e.op.keyword).sort()).toEqual(["Flying", "Haste"]);
  });

  it("Galerider-style 'have flying' still grants the one keyword", () => {
    const d = parseStaticAbilities(card("Galerider Sliver", "Sliver creatures you control have flying.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].op.keyword).toBe("Flying");
  });

  it("clean combined '… get +1/+1 and have first strike' still emits BOTH descriptors (Field Marshal)", () => {
    const d = parseStaticAbilities(card("Field Marshal", "Other Soldier creatures get +1/+1 and have first strike.", "Creature — Soldier"));
    expect(d.find(e => e.op.layerOp === "ptModify")).toBeTruthy();
    expect(d.find(e => e.op.layerOp === "addKeyword").op.keyword).toBe("First strike");
  });

  it("a pure P/T anthem with NO 'have' tail is unaffected (Muscle/Sinew — 'All Sliver creatures get +1/+1')", () => {
    const d = parseStaticAbilities(card("Sinew Sliver", "All Sliver creatures get +1/+1.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector.subtypes).toEqual(["Sliver"]);
  });
});

describe("parseStaticAbilities — NO-DETERMINER tribal anthem ('<Subtype> creatures you control …')", () => {
  it("keyword grant: 'Sliver creatures you control have flying.' (no 'all/other/each')", () => {
    const d = parseStaticAbilities(card("Galerider Sliver", "Sliver creatures you control have flying.", "Creature — Sliver"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Flying" });
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], subtypes: ["Sliver"] });
    expect(d[0].affects.selector.excludeSelf).toBeUndefined(); // includes itself (CR — no "other")
  });
  it("two keywords: 'Sliver creatures you control have flying and haste.'", () => {
    const d = parseStaticAbilities(card("Cloudshredder Sliver", "Sliver creatures you control have flying and haste.", "Creature — Sliver"));
    expect(d.map(e => e.op.keyword).sort()).toEqual(["Flying", "Haste"]);
  });
  it("P/T form: 'Dragon creatures you control get +1/+1.'", () => {
    const d = parseStaticAbilities(card("Dragon Lord", "Dragon creatures you control get +1/+1.", "Creature — Dragon"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector.subtypes).toEqual(["Dragon"]);
  });

  // CREED FP guard — a board-STATE/quality qualifier is NOT a subtype: it must grant to nobody, not
  // flip the card native while selecting an empty set.
  it("does NOT treat a state qualifier as a subtype ('Attacking creatures you control get +1/+0')", () => {
    expect(parseStaticAbilities(card("Lovisa-like", "Attacking creatures you control get +1/+0.", "Creature"))).toHaveLength(0);
  });
  it("does NOT grant for tapped / nontoken / colorless qualifiers", () => {
    expect(parseStaticAbilities(card("A", "Tapped creatures you control have vigilance.", "Enchantment"))).toHaveLength(0);
    expect(parseStaticAbilities(card("B", "Nontoken creatures you control have riot.", "Enchantment"))).toHaveLength(0);
    expect(parseStaticAbilities(card("C", "Colorless creatures you control get +1/+1.", "Enchantment"))).toHaveLength(0);
  });
  // CARD-TYPE words read on the LEFT of the em-dash → a card-TYPE filter, NOT a subtype. The modeled card
  // types (Artifact/Enchantment/Land) now emit a cardTypes:["Creature", X] selector (AND-semantics in
  // matchesSelector) — they select exactly the permanents that are BOTH a Creature and an X, never zero. A
  // word that is NEITHER a subtype NOR a modeled card type ("Commander") still selects nobody, so it stays
  // unmodeled (a SAFE false-negative — flipping it native would be a CREED FP).
  it("models a CARD-TYPE anthem as a cardTypes selector ('Artifact creatures you control get +2/+2' — Tempered Steel)", () => {
    const d = parseStaticAbilities(card("Tempered Steel", "Artifact creatures you control get +2/+2.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.cardTypes).toEqual(["Creature", "Artifact"]);
    expect(d[0].affects.selector.subtypes).toBeUndefined();
  });
  it("does NOT model a non-card-type, non-subtype qualifier ('Commander creatures …' — Bastion Protector)", () => {
    expect(parseStaticAbilities(card("Bastion Protector", "Commander creatures you control get +2/+2 and have indestructible.", "Creature — Human Soldier"))).toHaveLength(0);
  });
});

describe("determiner anthem hardening — colors enforce, non-subtype words don't fabricate", () => {
  it("'Other red creatures you control get +1/+1.' → COLOR selector (Liege cycle), not subtype 'Red'", () => {
    const d = parseStaticAbilities(card("Boartusk Liege", "Other red creatures you control get +1/+1.", "Creature — Boar Knight"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector.colors).toEqual(["R"]);
    expect(d[0].affects.selector.subtypes).toBeUndefined();
    expect(d[0].affects.selector.excludeSelf).toBe(true);
  });
  it("'Other tapped/nontoken/colorless creatures …' → NO grant (not a subtype, CREED)", () => {
    expect(parseStaticAbilities(card("Adept Watershaper", "Other tapped creatures you control have indestructible.", "Creature"))).toHaveLength(0);
    expect(parseStaticAbilities(card("Thraben Watcher", "Other nontoken creatures you control get +1/+1.", "Creature"))).toHaveLength(0);
    expect(parseStaticAbilities(card("Tide Drifter", "Other colorless creatures you control get +0/+1.", "Creature"))).toHaveLength(0);
  });
  it("irregular plural subtypes normalize to the real type ('Other Elves' → Elf, 'Allies' → Ally)", () => {
    const elf = parseStaticAbilities(card("Elf Lord", "Other Elves you control get +1/+1.", "Creature — Elf"));
    expect(elf[0].affects.selector.subtypes).toEqual(["Elf"]);
    const ally = parseStaticAbilities(card("Ally Lord", "Other Allies you control get +1/+1.", "Creature — Ally"));
    expect(ally[0].affects.selector.subtypes).toEqual(["Ally"]);
  });
  it("end-to-end: Boartusk Liege buffs only red creatures I control", () => {
    const liege = perm("Boartusk Liege", "lg", "user", { type: "Creature — Boar Knight", power: 4, toughness: 4, oracle: "Other red creatures you control get +1/+1." });
    const gob = perm("Goblin", "gob", "user", { type: "Creature — Goblin", oracle: "" });
    gob.card.mana = "{R}";
    const drake = perm("Drake", "drk", "user", { type: "Creature — Drake", power: 2, toughness: 2 });
    drake.card.mana = "{U}";
    const s = stateWith([liege, gob, drake]);
    expect(permanentPower(s, "gob")).toBe(2); // 1 + 1 (red)
    expect(permanentPower(s, "drk")).toBe(2); // unaffected (blue)
  });
});

describe("static coverage — reminder text (CR 207.2) doesn't block a fully-modeled anthem", () => {
  it("a reminder-bearing tribal grant still parses + classifies native-static", () => {
    const oracle = "Sliver creatures you control have double strike. (They deal both first-strike and regular combat damage.)";
    const c = card("Bonescythe Sliver", oracle, "Creature — Sliver");
    expect(parseStaticAbilities(c).map(e => e.op.keyword)).toEqual(["Double strike"]);
    expect(classifyCard({ ...c, type: "Creature — Sliver" })).toBe("native-static");
  });
  it("a real functional rider (not a reminder) still keeps the card body-only", () => {
    // A group-granted TRIGGERED body whose EFFECT does not route natively (reanimate-on-death) is genuine
    // residue, not a parenthetical reminder → the validator emits nothing → not covered. (Tempered Sliver's
    // combat-damage→+1/+1-counter body DOES route now — see groupTriggeredGrant.test.js.)
    const c = card("Reanimator Sliver", 'Sliver creatures you control have "When this creature dies, return it to the battlefield under your control."', "Creature — Sliver");
    expect(classifyCard({ ...c, type: "Creature — Sliver" })).not.toBe("native-static");
  });
});

describe("end-to-end — no-determiner tribal grant applies layer-aware", () => {
  it("Galerider grants flying to other Slivers you control, not non-Slivers or opponents", () => {
    const gal = perm("Galerider Sliver", "gal", "user", { type: "Creature — Sliver", oracle: "Sliver creatures you control have flying." });
    const muscle = perm("Muscle Sliver", "mus", "user", { type: "Creature — Sliver" });
    const bear = perm("Grizzly Bears", "bear", "user", { type: "Creature — Bear" });
    const foe = perm("Foe Sliver", "foe", "ai", { type: "Creature — Sliver" });
    const s = stateWith([gal, muscle, bear], [foe]);
    expect(permanentHasKeyword(s, "mus", "Flying")).toBe(true);   // other Sliver I control
    expect(permanentHasKeyword(s, "gal", "Flying")).toBe(true);   // itself (no "other")
    expect(permanentHasKeyword(s, "bear", "Flying")).toBe(false); // my non-Sliver
    expect(permanentHasKeyword(s, "foe", "Flying")).toBe(false);  // opponent's Sliver ("you control")
  });
});

describe("parseStaticAbilities — P2.10 widened anthems", () => {
  it("'Other creatures you control get +1/+1.' (generic excludeSelf lord — Benalish Marshal)", () => {
    const d = parseStaticAbilities(card("Benalish Marshal", "Other creatures you control get +1/+1.", "Creature — Human Soldier"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", excludeSelf: true });
    expect(d[0].affects.selector.subtypes).toBeUndefined();
  });

  it("'Each creature you control gets +1/+1.' (determiner 'each', includes self)", () => {
    const d = parseStaticAbilities(card("Each Lord", "Each creature you control gets +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector).toMatchObject({ controllerScope: "you", excludeSelf: false });
  });

  it("'All creatures have haste.' (symmetric global — Mass Hysteria)", () => {
    const d = parseStaticAbilities(card("Mass Hysteria", "All creatures have haste.", "Enchantment"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Haste" });
    expect(d[0].affects.selector.controllerScope).toBe("each");
  });

  it("'All creatures get -1/-1.' (symmetric debuff — Night of Souls' Betrayal)", () => {
    const d = parseStaticAbilities(card("Night of Souls' Betrayal", "All creatures get -1/-1.", "Enchantment"));
    expect(d[0].op).toEqual({ layerOp: "ptModify", power: -1, toughness: -1 });
    expect(d[0].affects.selector.controllerScope).toBe("each");
  });

  it("'Other creatures you control have trample.' (generic keyword grant, excludeSelf)", () => {
    const d = parseStaticAbilities(card("Trampler", "Other creatures you control have trample.", "Creature — Beast"));
    expect(d).toHaveLength(1);
    expect(d[0].op).toEqual({ layerOp: "addKeyword", keyword: "Trample" });
    expect(d[0].affects.selector.excludeSelf).toBe(true);
  });

  it("multi-grant: '… get +1/+1 and have vigilance' emits BOTH the buff and the keyword", () => {
    const d = parseStaticAbilities(card("Captain", "Creatures you control get +1/+1 and have vigilance.", "Enchantment"));
    expect(d).toHaveLength(2);
    expect(d.find(e => e.op.layerOp === "ptModify").op).toEqual({ layerOp: "ptModify", power: 1, toughness: 1 });
    expect(d.find(e => e.op.layerOp === "addKeyword").op).toEqual({ layerOp: "addKeyword", keyword: "Vigilance" });
  });

  it("multi-grant on a tribal lord: 'Other Soldier creatures get +1/+1 and have first strike' (Field Marshal)", () => {
    const d = parseStaticAbilities(card("Field Marshal", "Other Soldier creatures get +1/+1 and have first strike.", "Creature — Soldier"));
    const pt = d.find(e => e.op.layerOp === "ptModify");
    const kw = d.find(e => e.op.layerOp === "addKeyword");
    expect(pt.affects.selector.subtypes).toEqual(["Soldier"]);
    expect(pt.affects.selector.excludeSelf).toBe(true);
    expect(kw.op.keyword).toBe("First strike");
  });
});

describe("anti-fabrication guards (CLAUDE.md §1.2)", () => {
  it("does NOT grant flying from 'can't be blocked by creatures with flying'", () => {
    const d = parseStaticAbilities(card("Sneaky", "Sneaky can't be blocked by creatures with flying."));
    expect(d).toEqual([]);
  });

  it("does NOT treat an activated 'gains trample' line as a static grant", () => {
    const d = parseStaticAbilities(card("Pumper", "{G}: Target creature gains trample until end of turn."));
    expect(d).toEqual([]);
  });

  it("ignores unknown / non-grantable keyword words", () => {
    const d = parseStaticAbilities(card("Weird", "Creatures you control have foobar."));
    expect(d).toEqual([]);
  });

  it("a vanilla creature yields no static abilities", () => {
    expect(parseStaticAbilities(card("Grizzly Bears", "", "Creature — Bear"))).toEqual([]);
  });

  it("reminder text in parens does not double-grant", () => {
    const d = parseStaticAbilities(card("Anthem", "Creatures you control get +1/+1.", "Enchantment"));
    expect(d).toHaveLength(1);
  });

  // ── Variable / conditional magnitude must be a clean MISS, never a flat buff ──
  it("models a 'for each <subtype> on the battlefield' lord as a DYNAMIC count, NOT a fabricated flat buff (Sliver Legion)", () => {
    // Sliver Legion: "All Sliver creatures get +1/+1 for each other Sliver on the battlefield." Now modeled
    // as a layer-7c ptModifyDynamicCount whose magnitude scales with the live board (subtypeOnBattlefield,
    // excludeSelf) — a FLAT +1/+1 would be the WRONG magnitude (a forbidden false grant). The anti-fabrication
    // intent holds: a fixed ptModify is NEVER emitted; the magnitude is always the live count.
    const descs = parseStaticAbilities(card("Sliver Legion", "All Sliver creatures get +1/+1 for each other Sliver on the battlefield.", "Legendary Creature — Sliver"));
    expect(descs).toHaveLength(1);
    expect(descs[0].op.layerOp).toBe("ptModifyDynamicCount");
    expect(descs[0].op.countSpec).toEqual({ kind: "subtypeOnBattlefield", subtype: "Sliver", excludeSelf: true });
    expect(descs.some((d) => d.op?.layerOp === "ptModify")).toBe(false);   // no fabricated FLAT buff
  });

  it("does NOT fabricate a buff from a 'for each <counter> on this' lord (unmodeled count source → Arbiter)", () => {
    // A counter-on-source count whose counter-placement isn't modeled would read 0 → a hollow do-nothing
    // flip; it stays unmodeled. The anti-fabrication guard, re-pointed at a still-unmodeled count source.
    expect(parseStaticAbilities(card("Joraga Warcaller", "Other Elf creatures you control get +1/+1 for each +1/+1 counter on this creature.", "Creature — Elf Warrior"))).toEqual([]);
  });

  it("does NOT fabricate an unconditional buff from an 'as long as' anthem", () => {
    expect(parseStaticAbilities(card("Conditional", "Other creatures you control get +2/+2 as long as you control a Forest.", "Enchantment"))).toEqual([]);
  });

  // ── Triggered / activated / ETB abilities are NOT static continuous effects ──
  it("does NOT treat a triggered anthem ('Whenever ~ attacks, ... get +1/+1 until end of turn') as static", () => {
    expect(parseStaticAbilities(card("Warleader", "Whenever this creature attacks, other creatures you control get +1/+1 until end of turn.", "Creature — Cat"))).toEqual([]);
  });

  it("does NOT treat an activated anthem ('{G}: Creatures you control get +1/+1 ...') as static", () => {
    expect(parseStaticAbilities(card("Overrunner", "{G}: Creatures you control get +1/+1 until end of turn.", "Enchantment"))).toEqual([]);
  });

  it("does NOT treat an ETB anthem ('When this enters, ... get +2/+2 until end of turn') as static", () => {
    expect(parseStaticAbilities(card("Flash Pump", "When this creature enters, creatures you control get +2/+2 until end of turn.", "Creature — Elemental"))).toEqual([]);
  });

  it("does NOT treat a triggered keyword grant ('Whenever ~ attacks, ... have flying') as static", () => {
    expect(parseStaticAbilities(card("Skyleader", "Whenever this creature attacks, creatures you control have flying until end of turn.", "Creature — Bird"))).toEqual([]);
  });

  it("does NOT treat an activated keyword grant ('{T}: Creatures you control have haste') as static", () => {
    expect(parseStaticAbilities(card("Hastemaker", "{T}: Creatures you control have haste until end of turn.", "Artifact"))).toEqual([]);
  });

  // ── Level-gated cards (CR: ability active only at the right level) — a buff line on a
  // leveler / Class is NOT an always-on static. The whole card parses to NOTHING. ──
  it("does NOT fabricate a static anthem from a LEVELER's level-band buff", () => {
    const leveler = card("Transcendent Master", "Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 1-5\n6/6\nLifelink\nLEVEL 6+\n9/9\nCreatures you control get +1/+1.", "Creature — Human Monk");
    expect(parseStaticAbilities(leveler)).toEqual([]);
  });

  it("does NOT fabricate a static anthem from a CLASS's level ability", () => {
    const klass = card("Ninja Teen", "Whenever a creature you control leaves the battlefield, each opponent loses 1 life.\n{1}{B}: Level 2\nCreatures you control get +1/+0 and have menace.", "Enchantment — Class");
    expect(parseStaticAbilities(klass)).toEqual([]);
  });
});

describe("end-to-end through the layer engine", () => {
  it("Honor of the Pure pumps a white creature, not a black one (CR 613.5)", () => {
    const honor = perm("Honor of the Pure", "h1", "user", { type: "Enchantment", oracle: "White creatures you control get +1/+1." });
    const whiteGuy = { ...perm("Soldier", "w1", "user", { power: 2, toughness: 2 }), card: { name: "Soldier", type: "Creature", power: 2, toughness: 2, mana: "{W}{W}" } };
    const blackGuy = { ...perm("Zombie", "z1", "user", { power: 2, toughness: 2 }), card: { name: "Zombie", type: "Creature", power: 2, toughness: 2, mana: "{B}{B}" } };
    const state = stateWith([honor, whiteGuy, blackGuy]);
    expect(permanentPower(state, "w1")).toBe(3);
    expect(permanentToughness(state, "w1")).toBe(3);
    expect(permanentPower(state, "z1")).toBe(2);
  });

  it("Sliver lord grants flying to other Slivers, queryable via permanentHasKeyword", () => {
    const gale = perm("Galerider Sliver", "g1", "user", { type: "Creature — Sliver", oracle: "Other Sliver creatures you control have flying." });
    const other = perm("Muscle Sliver", "o1", "user", { type: "Creature — Sliver", power: 1, toughness: 1 });
    const bear = perm("Bear", "b1", "user", { type: "Creature — Bear", power: 2, toughness: 2 });
    const state = stateWith([gale, other, bear]);
    expect(permanentHasKeyword(state, "o1", "Flying")).toBe(true);
    expect(permanentHasKeyword(state, "b1", "Flying")).toBe(false);
    // "other" — the lord itself doesn't get its own grant.
    expect(permanentHasKeyword(state, "g1", "Flying")).toBe(false);
  });

  it("P2.10: 'Other creatures you control get +1/+1' pumps another creature but not itself", () => {
    const marshal = perm("Benalish Marshal", "m1", "user", { type: "Creature — Soldier", power: 2, toughness: 2, oracle: "Other creatures you control get +1/+1." });
    const ally = perm("Ally", "a1", "user", { type: "Creature — Soldier", power: 2, toughness: 2 });
    const state = stateWith([marshal, ally]);
    expect(permanentPower(state, "a1")).toBe(3);   // other creature buffed
    expect(permanentPower(state, "m1")).toBe(2);   // the lord excludes itself
  });
});
