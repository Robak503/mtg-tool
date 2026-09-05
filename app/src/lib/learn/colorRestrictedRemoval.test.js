/**
 * colorRestrictedRemoval.test.js — COLOR-POS (CR 105.2): "destroy/exile target <COLOR> <noun>".
 *
 * The positive mirror of the shipped `colorNeg` restriction ("nonblack creature" — Doom Blade). Before this
 * slice the restriction parser knew how to REMOVE a colour but not to REQUIRE one, and removal.js's target
 * noun list was an exact anchored match — so "Destroy target blue permanent" left an unstripped colour word,
 * failed the cleanliness check, and parked the card. Red Elemental Blast (EDHREC #433) was blocked by exactly
 * that one mode; its sibling mode ("Counter target blue spell") already carried a colorFilter.
 *
 * WHY IT CANNOT WIDEN A TARGET SET. A restriction is additive — it only ever REMOVES candidates from the
 * enumerated pool. The optional colour group is absent on every previously-matching phrase, so those atoms are
 * byte-identical (pinned below). The reachable failure mode is therefore an under-offer (a safe FN), never the
 * forbidden wrongly-legal target.
 *
 * LAYER-AWARE ON PURPOSE (CR 613, layer 5). The check reads permanentColors() — derived characteristics — not
 * the printed card. A permanent turned blue IS a legal "target blue permanent"; a printed-blue permanent turned
 * white is NOT. Reading the printed colours (as colorNeg still does) would offer that white permanent to Red
 * Elemental Blast — an illegal target. The last two tests below are what prove that rather than assert it.
 *
 * +18 corpus, every flip audited: the four Paladins (Northern/Southern/Eastern/Western), Red/Blue/Null
 * Elemental Blast, Glare of Heresy, Dark Betrayal, Execute, Slay, Exorcist, Spinal Villain, Lawbringer,
 * Lightbringer, Daraja Griffin, Devout Lightcaster, Phyrexian Bloodstock.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";

const perm = (id, name, type, colors, controller = "ai1") => ({
  id, controller, card: { id: `c-${id}`, name, type, oracle: "", colors },
});

/** A battlefield with one permanent of each colour shape. */
function board() {
  return {
    players: {
      user: { battlefield: [], graveyard: [] },
      ai1: {
        graveyard: [],
        battlefield: [
          perm("blueRock", "Blue Rock", "Artifact", ["U"]),
          perm("redRock", "Red Rock", "Artifact", ["R"]),
          perm("gold", "Gold Thing", "Artifact", ["U", "R"]),
          perm("colorless", "Colorless Rock", "Artifact", []),
        ],
      },
    },
  };
}

const names = (spec) => enumerateTargets(board(), "user", spec, [], {}).map((t) => t.name).sort();

describe("parse — the colour adjective becomes a restriction", () => {
  it("'destroy target blue permanent' carries a color restriction (Red Elemental Blast's blocking mode)", () => {
    const p = parseEffectClause("destroy target blue permanent");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "permanent", restrictions: [{ kind: "color", color: "U" }] }]);
  });

  it("'exile target white permanent' works on the exile verb too (Glare of Heresy)", () => {
    const p = parseEffectClause("exile target white permanent");
    expect(p.atoms).toEqual([{ op: "exile", targetType: "permanent", restrictions: [{ kind: "color", color: "W" }] }]);
  });

  it("'destroy target multicolored permanent' becomes the multicolored kind (Null Elemental Blast)", () => {
    const p = parseEffectClause("destroy target multicolored permanent");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "permanent", restrictions: [{ kind: "multicolored" }] }]);
  });

  it("REGRESSION PIN — a colourless phrase is byte-identical to before (empty restrictions)", () => {
    expect(parseEffectClause("destroy target permanent").atoms)
      .toEqual([{ op: "destroy", targetType: "permanent", restrictions: [] }]);
  });

  it("REGRESSION PIN — a controller scope still lands in the same slot after the group renumber", () => {
    expect(parseEffectClause("destroy target artifact an opponent controls").atoms)
      .toEqual([{ op: "destroy", targetType: "artifact", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
});

describe("enumeration — only the named colour is offered", () => {
  it("a blue restriction offers the blue permanents and the blue-containing gold one", () => {
    expect(names({ targetType: "permanent", restrictions: [{ kind: "color", color: "U" }] }))
      .toEqual(["Blue Rock", "Gold Thing"]);
  });

  it("THE LOAD-BEARING ONE — a RED permanent is never offered to a blue restriction", () => {
    // The forbidden direction (CREED): offering a wrong-colour target would make Red Elemental Blast a
    // materially different card. An under-offer is safe; this is the failure that never may happen.
    expect(names({ targetType: "permanent", restrictions: [{ kind: "color", color: "U" }] }))
      .not.toContain("Red Rock");
  });

  it("a COLORLESS permanent satisfies no positive colour (CR 105.2c)", () => {
    for (const color of ["W", "U", "B", "R", "G"]) {
      expect(names({ targetType: "permanent", restrictions: [{ kind: "color", color }] })).not.toContain("Colorless Rock");
    }
  });

  it("multicolored requires TWO OR MORE colours (CR 105.3) — mono and colourless both excluded", () => {
    expect(names({ targetType: "permanent", restrictions: [{ kind: "multicolored" }] })).toEqual(["Gold Thing"]);
  });

  it("no restriction still offers everything (the unrestricted pool is unchanged)", () => {
    expect(names({ targetType: "permanent", restrictions: [] }))
      .toEqual(["Blue Rock", "Colorless Rock", "Gold Thing", "Red Rock"]);
  });
});

describe("classification — the staples this unblocks", () => {
  const spell = (name, oracle) => ({ name, type: "Instant", mana: "{R}", keywords: [], oracle });

  it("Red Elemental Blast's shape flips (its other mode already carried a colorFilter)", () => {
    expect(classifyCard(spell("Red Elemental Blast", "Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent.")))
      .toMatch(/^native/);
  });

  it("Null Elemental Blast's multicolored shape flips", () => {
    expect(classifyCard(spell("Null Elemental Blast", "Choose one —\n• Counter target multicolored spell.\n• Destroy target multicolored permanent.")))
      .toMatch(/^native/);
  });

  it("GRADUATED 2026-09-05 (POD-SIM KT-2) — the 'if it's blue' conditional form is read as its RESTRICTED twin; the colour SURVIVES on both modes", () => {
    // The original pin (2026-08): Pyroblast/Hydroblast word the colour as a post-hoc condition on an unrestricted
    // target (CR 608.2b — the target is legal regardless; the EFFECT checks colour on resolution), so the colour-
    // restricted slice must not sweep it in on surface similarity. KT-2 claims it DELIBERATELY: the modal mode text is
    // rewritten to the restricted twin (Red Elemental Blast's printed wording) — an honest UNDER-offer (the sim never
    // aims it at a non-blue object, never the winning play). The pin's real worry — a colour lost on the way, i.e. an
    // unrestricted counter/destroy credited — is what this graduated pin now guards.
    const prog = parseEffectProgram(spell("Pyroblast", "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue."));
    expect(prog.confidence).toBe("high");
    expect(prog.modal.modes[0].atoms[0]).toMatchObject({ op: "counter", colorFilter: { color: "U" } });
    expect(prog.modal.modes[1].atoms[0]).toMatchObject({ op: "destroy", restrictions: [{ kind: "color", color: "U" }] });
    expect(classifyCard(spell("Pyroblast", "Choose one —\n• Counter target spell if it's blue.\n• Destroy target permanent if it's blue.")))
      .toMatch(/^native/);
  });
});
