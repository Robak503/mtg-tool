/**
 * massWipeManaValue.test.js — MANA-VALUE-FILTERED CREATURE WIPE (CR 202.3).
 *
 * The direct sibling of the shipped POWER-filtered wipe ("destroy all creatures with power 4 or greater" —
 * Elspeth). "destroy all creatures" was already HIGH and the threshold machinery already existed; only the
 * mana-value qualifier was missing, which is why Austere Command (EDHREC #169) sat on the Arbiter. That is
 * the pattern this whole stretch runs on: the engine knew the EFFECT, not the PHRASING.
 *
 * MANA VALUE IS NOT LAYER-AWARE, and that is deliberate. Power is read through creaturePower (CR 613.3 —
 * counters and anthems counted) because layers change it. Mana value comes from the printed mana cost and no
 * layer alters it (CR 202.3b), so a pumped 1-drop is still mana value 1 and Austere Command's "3 or less"
 * still kills it. Reading a "current" mana value would be the wrong rule, not a stricter one.
 *
 * A TOKEN HAS MANA VALUE 0 (CR 111.5) — it has no mana cost at all. So the `?? 0` default on the index's
 * `cmc` field is the CORRECT reading rather than a conservative one: Austere Command genuinely wipes a board
 * of Soldier tokens on its "3 or less" mode. The token test below pins that, because a `?? 0` that happened
 * to be right for the wrong reason would silently become wrong if the default ever changed.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { massCreatureTargets } from "./effects/atoms/shared.js";

const creature = (id, name, cmc, controller = "user") => ({
  id, controller,
  card: { id: `c-${id}`, name, type: "Creature — Bear", oracle: "", power: 2, toughness: 2, ...(cmc === null ? {} : { cmc }) },
});

/** Creatures at mana value 0 (a token, no cmc field), 1, 3, 4 and 7. */
function board() {
  return {
    players: {
      user: {
        battlefield: [
          creature("tok", "Soldier Token", null),   // no cmc at all — a token, MV 0 by CR 111.5
          creature("one", "One Drop", 1),
          creature("three", "Three Drop", 3),
        ],
      },
      ai1: {
        battlefield: [
          creature("four", "Four Drop", 4, "ai1"),
          creature("seven", "Seven Drop", 7, "ai1"),
        ],
      },
    },
  };
}

const hit = (opts) => massCreatureTargets(board(), opts).map((t) => t.id).sort();

describe("parse — the mana-value qualifier", () => {
  it("'3 or less' becomes an mvCmp <= wipe (Austere Command / Ritual of Soot)", () => {
    const p = parseEffectClause("destroy all creatures with mana value 3 or less");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "eachCreature", mvCmp: "<=", mvVal: 3 }]);
  });

  it("'4 or greater' becomes an mvCmp >= wipe (Austere Command's other mode)", () => {
    expect(parseEffectClause("destroy all creatures with mana value 4 or greater").atoms)
      .toEqual([{ op: "destroy", targetType: "eachCreature", mvCmp: ">=", mvVal: 4 }]);
  });

  it("REGRESSION PIN — the unqualified wipe is byte-identical (no mv fields)", () => {
    expect(parseEffectClause("destroy all creatures").atoms)
      .toEqual([{ op: "destroy", targetType: "eachCreature" }]);
  });

  it("CREED — a STRICT 'greater than' is not the printed template and stays low", () => {
    expect(parseEffectClause("destroy all creatures with mana value greater than 3")?.atoms?.[0]?.mvCmp).toBeUndefined();
  });
});

describe("selection — which creatures the wipe actually takes", () => {
  it("'3 or less' takes MV 0/1/3 and spares MV 4/7", () => {
    expect(hit({ mvCmp: "<=", mvVal: 3 })).toEqual(["one", "three", "tok"]);
  });

  it("THE LOAD-BEARING ONE — 'or greater' spares everything under the bound", () => {
    // A wipe that over-takes is the forbidden direction: it destroys permanents the card never touches.
    expect(hit({ mvCmp: ">=", mvVal: 4 })).toEqual(["four", "seven"]);
  });

  it("a TOKEN counts as mana value 0 (CR 111.5) — inside 'or less', outside 'or greater'", () => {
    expect(hit({ mvCmp: "<=", mvVal: 0 })).toEqual(["tok"]);
    expect(hit({ mvCmp: ">=", mvVal: 1 })).not.toContain("tok");
  });

  it("the bound is INCLUSIVE on both sides (CR 202.3 'or less' / 'or greater')", () => {
    expect(hit({ mvCmp: "<=", mvVal: 1 })).toEqual(["one", "tok"]);   // MV 1 included
    expect(hit({ mvCmp: ">=", mvVal: 7 })).toEqual(["seven"]);        // MV 7 included
  });

  it("no mv filter still takes every creature on every battlefield (unchanged)", () => {
    expect(hit({})).toEqual(["four", "one", "seven", "three", "tok"]);
  });
});

describe("classification — the staple this unblocks", () => {
  it("Austere Command's shape flips (all four modes now parse)", () => {
    expect(classifyCard({
      name: "Austere Command", type: "Sorcery", mana: "{4}{W}{W}", keywords: [],
      oracle: "Choose two —\n• Destroy all artifacts.\n• Destroy all enchantments.\n• Destroy all creatures with mana value 3 or less.\n• Destroy all creatures with mana value 4 or greater.",
    })).toMatch(/^native/);
  });
});
