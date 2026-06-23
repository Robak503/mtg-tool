/**
 * ETB-TARGETED — the 12 triggered-ability cards whose sole blocker was atomTargetIntent returning
 * "ambiguous" for bounce / tuck / discard(target player) / draw(target player) / regenerate.
 *
 * The intent fix:
 *   bounce/tuck, non-own targetType  → "enemy"  (Man-o'-War, Aether Adept, Vedalken Dismisser …)
 *   discard, targetType "player"     → "enemy"  (Rottenheart Ghoul, Kemuri-Onna)
 *   draw, targetType "player"        → "own"    (Saltwater Stalwart — controller draws)
 *   regenerate                       → "own"    (Horizon Seed — protect own creature)
 *
 * CREED: all 12 pass permanentTriggersCovered with the real oracle text from Scryfall.
 */
import { describe, it, expect } from "vitest";
import { atomTargetIntent, programTriggerTargetsResolvable } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — build a minimal card object matching coverage.js's publicCard shape
// ─────────────────────────────────────────────────────────────────────────────
const C = (name, oracle, type = "Creature") => ({ name, oracle, type, keywords: [], mana: "" });

// ─────────────────────────────────────────────────────────────────────────────
// atomTargetIntent — new intents for bounce/tuck/discard/draw/regen
// ─────────────────────────────────────────────────────────────────────────────
describe("ETB-TARGETED — atomTargetIntent intent classification", () => {
  it("bounce: non-own targetType → enemy (ETB-removal family)", () => {
    expect(atomTargetIntent({ op: "bounce", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "bounce", targetType: "artifact" })).toBe("enemy");
    expect(atomTargetIntent({ op: "bounce", targetType: "land" })).toBe("enemy");
    expect(atomTargetIntent({ op: "bounce", targetType: "permanent" })).toBe("enemy");
  });
  it("bounce: own targetType (YouControl) → own", () => {
    expect(atomTargetIntent({ op: "bounce", targetType: "creatureYouControl" })).toBe("own");
    expect(atomTargetIntent({ op: "bounce", targetType: "permanentYouControl" })).toBe("own");
  });
  it("tuck: non-own targetType → enemy (Vedalken Dismisser)", () => {
    expect(atomTargetIntent({ op: "tuck", targetType: "creature" })).toBe("enemy");
    expect(atomTargetIntent({ op: "tuck", targetType: "permanent" })).toBe("enemy");
  });
  it("discard(target player) → enemy (Rottenheart Ghoul, Kemuri-Onna)", () => {
    expect(atomTargetIntent({ op: "discard", who: "target", targetType: "player" })).toBe("enemy");
    expect(atomTargetIntent({ op: "discard", who: "target", targetType: "opponent" })).toBe("enemy");
  });
  it("draw(target player) → own (Saltwater Stalwart: controller draws)", () => {
    expect(atomTargetIntent({ op: "draw", who: "target", targetType: "player" })).toBe("own");
  });
  it("regenerate → own (Horizon Seed: protect own creature)", () => {
    expect(atomTargetIntent({ op: "regenerate", targetType: "creature" })).toBe("own");
  });
  it("CREED: non-targeted versions unchanged (no targetType → null)", () => {
    // non-targeted discard / draw stay non-targeting
    expect(atomTargetIntent({ op: "discard", who: "eachOpponent", targetType: null })).toBe(null);
    expect(atomTargetIntent({ op: "discard", who: "controller", targetType: null })).toBe(null);
    expect(atomTargetIntent({ op: "draw", amount: 1, targetType: null })).toBe(null);
    // self-bounce (no targetType) → null
    expect(atomTargetIntent({ op: "bounce", target: "self" })).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// programTriggerTargetsResolvable — bounce/tuck/discard/draw/regen now route
// ─────────────────────────────────────────────────────────────────────────────
describe("ETB-TARGETED — programTriggerTargetsResolvable gates", () => {
  it("bounce program is now resolvable (was blocked before)", () => {
    expect(programTriggerTargetsResolvable({
      confidence: "high", structure: "sequence",
      atoms: [{ op: "bounce", targetType: "creature" }],
    })).toBe(true);
  });
  it("tuck program is now resolvable", () => {
    expect(programTriggerTargetsResolvable({
      confidence: "high", structure: "sequence",
      atoms: [{ op: "tuck", targetType: "creature", where: "top" }],
    })).toBe(true);
  });
  it("discard(target player) program is now resolvable", () => {
    expect(programTriggerTargetsResolvable({
      confidence: "high", structure: "sequence",
      atoms: [{ op: "discard", amount: 1, who: "target", targetType: "player" }],
    })).toBe(true);
  });
  it("draw(target player) program is now resolvable", () => {
    expect(programTriggerTargetsResolvable({
      confidence: "high", structure: "sequence",
      atoms: [{ op: "draw", amount: 1, who: "target", targetType: "player" }],
    })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Coverage flips — the 12 confirmed body-only cards now become native-trigger
// ─────────────────────────────────────────────────────────────────────────────
describe("ETB-TARGETED — coverage flips: 12 body-only → native-trigger", () => {
  describe("ETB-BOUNCE family", () => {
    it("Man-o'-War — ETB bounce creature → native-trigger", () => {
      expect(classifyCard(C("Man-o'-War",
        "When this creature enters, return target creature to its owner's hand."))).toMatch(/^native/);
    });
    it("Aether Adept — ETB bounce creature → native-trigger", () => {
      expect(classifyCard(C("Aether Adept",
        "When this creature enters, return target creature to its owner's hand."))).toMatch(/^native/);
    });
    it("Voidwielder — ETB optional bounce creature → native-trigger", () => {
      expect(classifyCard(C("Voidwielder",
        "When this creature enters, you may return target creature to its owner's hand."))).toMatch(/^native/);
    });
    it("Separatist Voidmage — ETB optional bounce creature → native-trigger", () => {
      expect(classifyCard(C("Separatist Voidmage",
        "When this creature enters, you may return target creature to its owner's hand."))).toMatch(/^native/);
    });
    it("Dispersal Technician — ETB optional bounce artifact → native-trigger", () => {
      expect(classifyCard(C("Dispersal Technician",
        "When this creature enters, you may return target artifact to its owner's hand."))).toMatch(/^native/);
    });
    it("Glowing Anemone — ETB optional bounce land → native-trigger", () => {
      expect(classifyCard(C("Glowing Anemone",
        "When this creature enters, you may return target land to its owner's hand."))).toMatch(/^native/);
    });
    it("Kiri-Onna — ETB bounce + cast self-bounce → native-trigger", () => {
      expect(classifyCard(C("Kiri-Onna",
        "When this creature enters, return target creature to its owner's hand.\nWhenever you cast a Spirit or Arcane spell, you may return this creature to its owner's hand.",
        "Creature — Spirit"))).toMatch(/^native/);
    });
  });

  describe("ETB-TUCK", () => {
    it("Vedalken Dismisser — ETB tuck creature → native-trigger", () => {
      expect(classifyCard(C("Vedalken Dismisser",
        "When this creature enters, put target creature on top of its owner's library."))).toMatch(/^native/);
    });
  });

  describe("dies/ETB-DISCARD family", () => {
    it("Rottenheart Ghoul — dies, target player discards → native-trigger", () => {
      expect(classifyCard(C("Rottenheart Ghoul",
        "When this creature dies, target player discards a card."))).toMatch(/^native/);
    });
    it("Kemuri-Onna — ETB discard + cast self-bounce → native-trigger", () => {
      expect(classifyCard(C("Kemuri-Onna",
        "When this creature enters, target player discards a card.\nWhenever you cast a Spirit or Arcane spell, you may return this creature to its owner's hand.",
        "Creature — Spirit"))).toMatch(/^native/);
    });
  });

  describe("combatDamage-DRAW (own-side)", () => {
    it("Saltwater Stalwart — combat damage to opponent → target player draws → native-trigger", () => {
      expect(classifyCard(C("Saltwater Stalwart",
        "Whenever this creature deals damage to an opponent, target player draws a card.",
        "Creature — Merfolk Warrior"))).toMatch(/^native/);
    });
  });

  describe("cast-REGENERATE (own-side)", () => {
    it("Horizon Seed — cast Spirit/Arcane → regenerate target creature → native-trigger", () => {
      expect(classifyCard(C("Horizon Seed",
        "Whenever you cast a Spirit or Arcane spell, regenerate target creature.",
        "Creature — Spirit"))).toMatch(/^native/);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREED guards — non-qualifying cards stay body-only
// ─────────────────────────────────────────────────────────────────────────────
describe("ETB-TARGETED — CREED: non-qualifying cards stay non-native", () => {
  it("a multi-trigger card where the second trigger is unmodeled stays body-only (count mismatch)", () => {
    // shaped=2 (two When/Whenever sentences), but the upkeep-sacrifice trigger's effect doesn't route natively
    // → allTriggerSentencesModeled fails → body-only (safe false-negative, no over-claim)
    expect(classifyCard(C("Test Multi",
      "When this creature enters, return target creature to its owner's hand.\nAt the beginning of your upkeep, draw seven cards."))).not.toMatch(/^native-trigger/);
  });
  it("an ETB bounce with 'you control' filter is own-side (not a coverage miss — intent correct)", () => {
    expect(atomTargetIntent({ op: "bounce", targetType: "creatureYouControl" })).toBe("own");
  });
});
