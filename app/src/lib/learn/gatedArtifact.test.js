/**
 * GATED-ARTIFACT — three related patterns that extend the existing gated-static machinery:
 *
 * 1. METALCRAFT LABEL STRIP: "Metalcraft — " is a flavor ability-word label (CR 207.2c) stripped
 *    at the top of parseClause so the existing GATED-SELFBUFF / GATED-KEYWORD matchers handle the
 *    body without modification (+10 pure P/T or keyword Metalcraft cards).
 *
 * 2. COMBINED CONTROL GATE: "gets +P/+T and has <kw> as long as you control <quant> <type>" —
 *    a suffix AND prefix form, routed through emitGatedEffect (which already handles the combined
 *    P/T+keyword shape for the GATED-GY path). parseControlGateSource rejects multi-word types
 *    ("multicolored permanent", "red or white") → safe false-negative. (+16 combined-gate cards)
 *
 * 3. EQUIPPED GATE: "as long as this creature is equipped, it gets/has …" — a new { kind:"isEquipped" }
 *    gate type. gateMet (layers.js) scans the battlefield for an Equipment whose attachedTo matches
 *    the permanent's id. emitGatedEffect drops any non-grantable keyword → LOW. (+8 cards)
 *
 * Total: +31 cards (6498 → 6529 native).
 * CREED: a non-grantable keyword (shadow) drops the whole clause → stays LOW; multi-word gate types
 * rejected → Battle Brawler stays LOW; a death-trigger rider → Fireblade Charger stays LOW.
 * NOTE (rebase onto master b37e86d): menace is now GRANTABLE + enforced at combat (CR 509.1c,
 * GATED-GY-EXT #343), so a gated MENACE grant now flips native — the former "menace stays LOW" guards
 * are updated to native here, mirroring the #354 precedent. (hexproof/shroud also became grantable via
 * STATIC-HEXPROOF-SHROUD; shadow now carries the non-grantable guard — still un-enforced evasion.)
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── Helpers ──────────────────────────────────────────────────────────────────

const cr = (oracle, type = "Creature — Beast", p = 2, t = 2) => ({ name: "Test", type, power: p, toughness: t, oracle });

function withBoard(selfCard, artifacts = 0, equipAttached = false) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const self = createPermanent({ id: "self", card: selfCard, controller: "user" });
  const extraPerms = [];
  for (let i = 0; i < artifacts; i++) {
    extraPerms.push(createPermanent({ id: `art${i}`, card: { name: `Artifact${i}`, type: "Artifact", oracle: "" }, controller: "user" }));
  }
  if (equipAttached) {
    // createPermanent initializes attachedTo: null — spread to set it after construction.
    // Use a no-P/T Equipment so the only P/T change on "self" comes from the isEquipped gate.
    const eq = { ...createPermanent({ id: "eq1", card: { name: "Blankstone Buckler", type: "Artifact — Equipment", oracle: "Equip {2}" }, controller: "user" }), attachedTo: "self" };
    extraPerms.push(eq);
  }
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [self, ...extraPerms] } } };
}

// ── 1. METALCRAFT LABEL STRIP ─────────────────────────────────────────────────

describe("GATED-ARTIFACT — Metalcraft label strip (coverage flips)", () => {
  it("pure P/T Metalcraft flips native", () => {
    expect(classifyCard({ name: "Ghalma's Warden", type: "Creature — Beast", power: 3, toughness: 3, oracle: "Metalcraft — This creature gets +2/+2 as long as you control three or more artifacts." })).toMatch(/^native/);
  });
  it("pure keyword Metalcraft (double strike) flips native", () => {
    expect(classifyCard({ name: "Auriok Edgewright", type: "Creature — Human Soldier", power: 2, toughness: 2, oracle: "Metalcraft — This creature has double strike as long as you control three or more artifacts." })).toMatch(/^native/);
  });
  it("combined P/T + keyword Metalcraft flips native", () => {
    expect(classifyCard({ name: "Auriok Sunchaser", type: "Creature — Human Soldier", power: 1, toughness: 1, oracle: "Metalcraft — As long as you control three or more artifacts, this creature gets +2/+2 and has flying." })).toMatch(/^native/);
  });
  it("Metalcraft P/T prefix form flips native", () => {
    expect(classifyCard({ name: "Spiraling Duelist", type: "Creature — Human Barbarian", power: 2, toughness: 2, oracle: "Metalcraft — This creature has double strike as long as you control three or more artifacts." })).toMatch(/^native/);
  });
  it("FP-GUARD: an INSTANT carrying the Metalcraft label is NOT flipped native by the strip (Galvanic Blast)", () => {
    // The Metalcraft strip lives in the STATIC (permanent) parser. An instant/sorcery returns at the
    // spell branch BEFORE the static classifiers, so the strip can never credit it native-static. Galvanic
    // Blast's metalcraft "deals 4 instead" is an unmodeled conditional → the spell routes to the Arbiter.
    const tier = classifyCard({ name: "Galvanic Blast", type: "Instant", oracle: "Galvanic Blast deals 2 damage to any target.\nMetalcraft — Galvanic Blast deals 4 damage instead if you control three or more artifacts." });
    expect(tier).not.toBe("native-static");
    expect(tier).not.toBe("native-body");
    expect(tier).toBe("arbiter-spell");
  });
});

// ── 2. COMBINED CONTROL GATE ──────────────────────────────────────────────────

describe("GATED-ARTIFACT — combined P/T + keyword control gate (coverage flips)", () => {
  it("1-artifact combined (gets P/T and has flying) flips native", () => {
    expect(classifyCard({ name: "Aerial Engineer", type: "Creature — Human Artificer", power: 2, toughness: 3, oracle: "As long as you control an artifact, this creature gets +2/+0 and has flying." })).toMatch(/^native/);
  });
  it("1-artifact combined (gets P/T and has haste) flips native", () => {
    expect(classifyCard({ name: "Goblin Tomb Raider", type: "Creature — Goblin Rogue", power: 1, toughness: 1, oracle: "As long as you control an artifact, this creature gets +1/+0 and has haste." })).toMatch(/^native/);
  });
  it("1-artifact combined (gets P/T and has deathtouch) flips native", () => {
    expect(classifyCard({ name: "Dhund Operative", type: "Creature — Human Rogue", power: 2, toughness: 1, oracle: "As long as you control an artifact, this creature gets +1/+0 and has deathtouch." })).toMatch(/^native/);
  });
  it("creature-subtype combined (Beast gate, gets P/T and has trample) flips native", () => {
    expect(classifyCard({ name: "Skirk Outrider", type: "Creature — Goblin Berserker", power: 1, toughness: 1, oracle: "As long as you control a Beast, this creature gets +2/+2 and has trample." })).toMatch(/^native/);
  });
  it("creature-subtype combined (Bird gate, gets P/T and has flying) flips native", () => {
    expect(classifyCard({ name: "Cloudreach Cavalry", type: "Creature — Human Soldier", power: 2, toughness: 2, oracle: "As long as you control a Bird, this creature gets +2/+2 and has flying." })).toMatch(/^native/);
  });
  it("enchantment gate combined (gets P/T and has lifelink) flips native", () => {
    expect(classifyCard({ name: "Blood-Cursed Knight", type: "Creature — Vampire Knight", power: 3, toughness: 2, oracle: "As long as you control an enchantment, this creature gets +1/+1 and has lifelink." })).toMatch(/^native/);
  });
});

describe("GATED-ARTIFACT — CREED: combined gate false-negative guards", () => {
  it("multi-word gate type (red or white) stays body-only — parseControlGateSource rejects", () => {
    expect(classifyCard({ name: "Battle Brawler", type: "Creature — Orc Warrior", power: 2, toughness: 2, oracle: "As long as you control a red or white permanent, this creature gets +1/+0 and has first strike." })).toBe("body-only");
  });
  it("multi-word gate type (multicolored permanent) stays body-only", () => {
    expect(classifyCard({ name: "Grixis Grimblade", type: "Creature — Vedalken Warrior", power: 2, toughness: 2, oracle: "As long as you control another multicolored permanent, this creature gets +1/+1 and has deathtouch." })).toBe("body-only");
  });
  it("combined gate with menace now flips native (menace grantable + enforced, GATED-GY-EXT #343)", () => {
    expect(classifyCard(cr("As long as you control an artifact, this creature gets +2/+0 and has menace."))).toMatch(/^native/);
  });
  it("combined gate with a NON-grantable keyword (shadow) stays body-only — emitGatedEffect drops whole clause", () => {
    expect(classifyCard(cr("As long as you control an artifact, this creature gets +2/+0 and has shadow."))).toBe("body-only");
  });
});

describe("GATED-ARTIFACT — parser: combined gate produces correct descriptors", () => {
  it("suffix form: 'gets P/T and has kw as long as you control' → ptModifyGated + addKeyword", () => {
    const d = parseStaticAbilities(cr("As long as you control an artifact, this creature gets +2/+0 and has flying."));
    expect(d).toHaveLength(2);
    expect(d[0].op.layerOp).toBe("ptModifyGated");
    expect(d[0].op.power).toBe(2);
    expect(d[0].op.toughness).toBe(0);
    expect(d[1].op.layerOp).toBe("addKeyword");
    expect(d[1].op.keyword).toBe("Flying");
    expect(d[0].op.gate).toEqual(d[1].op.gate);
  });
  it("prefix form: 'as long as you control, it gets P/T and has kw' → same descriptors", () => {
    const d = parseStaticAbilities(cr("This creature gets +1/+0 and has deathtouch as long as you control an artifact."));
    expect(d).toHaveLength(2);
    expect(d[0].op.layerOp).toBe("ptModifyGated");
    expect(d[1].op.layerOp).toBe("addKeyword");
    expect(d[1].op.keyword).toBe("Deathtouch");
  });
});

describe("GATED-ARTIFACT — engine: combined 1-artifact gate (Aerial Engineer)", () => {
  const oracle = "As long as you control an artifact, this creature gets +2/+0 and has flying.";
  it("no artifacts → gate CLOSED (base P/T, no flying)", () => {
    const s = withBoard(cr(oracle, "Creature — Human Artificer", 2, 3), 0);
    expect(permanentPower(s, "self")).toBe(2);
    expect(permanentToughness(s, "self")).toBe(3);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(false);
  });
  it("one artifact → gate OPEN (+2/+0 and flying)", () => {
    const s = withBoard(cr(oracle, "Creature — Human Artificer", 2, 3), 1);
    expect(permanentPower(s, "self")).toBe(4);
    expect(permanentToughness(s, "self")).toBe(3);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(true);
  });
});

// ── 3. EQUIPPED GATE ──────────────────────────────────────────────────────────

describe("GATED-ARTIFACT — equipped gate (coverage flips)", () => {
  it("equipped + P/T + flying flips native", () => {
    expect(classifyCard({ name: "Skyhunter Cub", type: "Creature — Cat", power: 1, toughness: 1, oracle: "As long as this creature is equipped, it gets +1/+1 and has flying." })).toMatch(/^native/);
  });
  it("equipped + pure P/T flips native", () => {
    expect(classifyCard({ name: "Dwarfhold Champion", type: "Creature — Dwarf Warrior", power: 2, toughness: 1, oracle: "As long as this creature is equipped, it gets +0/+2." })).toMatch(/^native/);
  });
  it("equipped + pure keyword (double strike) flips native", () => {
    expect(classifyCard({ name: "Kor Duelist", type: "Creature — Kor Soldier", power: 1, toughness: 1, oracle: "As long as this creature is equipped, it has double strike." })).toMatch(/^native/);
  });
  it("equipped + multiple keywords (first strike + lifelink) flips native", () => {
    expect(classifyCard({ name: "Sunspear Shikari", type: "Creature — Cat Soldier", power: 2, toughness: 2, oracle: "As long as this creature is equipped, it has first strike and lifelink." })).toMatch(/^native/);
  });
  it("equipped + P/T + vigilance flips native", () => {
    expect(classifyCard({ name: "Leonin Den-Guard", type: "Creature — Cat Soldier", power: 1, toughness: 3, oracle: "As long as this creature is equipped, it gets +1/+1 and has vigilance." })).toMatch(/^native/);
  });
});

describe("GATED-ARTIFACT — CREED: equipped gate false-negative guards", () => {
  it("equipped + menace now flips native (menace grantable + enforced, GATED-GY-EXT #343)", () => {
    expect(classifyCard({ name: "Armory Veteran", type: "Creature — Dwarf Warrior", power: 3, toughness: 3, oracle: "As long as this creature is equipped, it has menace." })).toMatch(/^native/);
  });
  it("equipped + P/T + menace now flips native (menace grantable + enforced)", () => {
    expect(classifyCard({ name: "Armed Assailant", type: "Creature — Human Warrior", power: 2, toughness: 2, oracle: "Deathtouch\nAs long as this creature is equipped, it gets +2/+0 and has menace." })).toMatch(/^native/);
  });
  it("equipped + a NON-grantable keyword (shadow) stays body-only — shadow not in GRANTABLE_STATIC_KEYWORDS", () => {
    expect(classifyCard({ name: "Test Equipped Shadow", type: "Creature — Dwarf Warrior", power: 3, toughness: 3, oracle: "As long as this creature is equipped, it has shadow." })).toBe("body-only");
  });
  it("equipped + death trigger stays body-only — death trigger unmodeled", () => {
    expect(classifyCard({ name: "Fireblade Charger", type: "Creature — Goblin Warrior", power: 2, toughness: 1, oracle: "As long as this creature is equipped, it has haste.\nWhen this creature dies, it deals damage equal to its power to any target." })).toBe("body-only");
  });
});

describe("GATED-ARTIFACT — parser: equipped gate produces correct descriptor shape", () => {
  it("equipped P/T+keyword → ptModifyGated + addKeyword both carrying { kind:'isEquipped' }", () => {
    const d = parseStaticAbilities(cr("As long as this creature is equipped, it gets +1/+1 and has flying.", "Creature — Cat", 1, 1));
    expect(d).toHaveLength(2);
    expect(d[0].op.layerOp).toBe("ptModifyGated");
    expect(d[0].op.power).toBe(1);
    expect(d[0].op.toughness).toBe(1);
    expect(d[0].op.gate).toEqual({ kind: "isEquipped" });
    expect(d[1].op.layerOp).toBe("addKeyword");
    expect(d[1].op.keyword).toBe("Flying");
    expect(d[1].op.gate).toEqual({ kind: "isEquipped" });
  });
  it("equipped keyword-only → single addKeyword with isEquipped gate", () => {
    const d = parseStaticAbilities(cr("As long as this creature is equipped, it has double strike.", "Creature — Kor Soldier", 1, 1));
    expect(d).toHaveLength(1);
    expect(d[0].op.layerOp).toBe("addKeyword");
    expect(d[0].op.keyword).toBe("Double strike");
    expect(d[0].op.gate).toEqual({ kind: "isEquipped" });
  });
});

describe("GATED-ARTIFACT — engine: equipped gate turns on when Equipment is attached", () => {
  const oracle = "As long as this creature is equipped, it gets +1/+1 and has flying.";
  it("no equipment on battlefield → gate CLOSED (base stats, no flying)", () => {
    const s = withBoard(cr(oracle, "Creature — Cat", 1, 1), 0, false);
    expect(permanentPower(s, "self")).toBe(1);
    expect(permanentToughness(s, "self")).toBe(1);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(false);
  });
  it("Equipment attached to this creature → gate OPEN (+1/+1 and flying)", () => {
    const s = withBoard(cr(oracle, "Creature — Cat", 1, 1), 0, true);
    expect(permanentPower(s, "self")).toBe(2);
    expect(permanentToughness(s, "self")).toBe(2);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(true);
  });
  it("non-Equipment artifact present (not attached) → gate still CLOSED", () => {
    const s = withBoard(cr(oracle, "Creature — Cat", 1, 1), 1, false);
    expect(permanentPower(s, "self")).toBe(1);
    expect(permanentHasKeyword(s, "self", "flying")).toBe(false);
  });
});
