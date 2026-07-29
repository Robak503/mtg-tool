/**
 * extraCombatAtom.test.js — EXTRA COMBAT PHASES (CR 500.8), wave increment 2: the atom and its parse arms.
 *
 * Increment 1 built the engine mechanism and tested it from a hand-set queue. This closes the chain: the
 * printed clause parses to an atom, the atom queues a run, and the queued run produces a real second
 * combat. Testing the halves separately is what let the stun slice's matcher widening do nothing for a
 * whole round — so the join gets its own assertion here.
 *
 * ⛔ THE "AFTER THIS MAIN PHASE" FORM PARKS DELIBERATELY. Aggravated Assault #699, Relentless Assault
 * #1543, Seize the Day and Full Throttle insert after a MAIN phase — a different insertion point from
 * end-of-combat. Firing this queue for them would grant a combat at a moment the card never promised.
 * Increment 3 gives each queue entry its own insertion point; until then it is a safe FN, and the 27 cards
 * this arm reaches are the after-combat group (Aurelia #820, Karlach #1039, Genji Glove #1229, Great Train
 * Heist #1118, Lightning Runner, Tifa).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { advanceStep } from "./gameEngine.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const opsOf = (oracle) => (parseEffectProgram({ type: "Sorcery", name: "X", oracle })?.atoms || []).map((a) => a.op);

describe("parsing — both printed word orders", () => {
  it("⭐ the two after-this-phase spellings both reach the atom", () => {
    expect(opsOf("After this phase, there is an additional combat phase.")).toEqual(["extra-combat"]);
    expect(opsOf("There is an additional combat phase after this phase.")).toEqual(["extra-combat"]);
  });

  it("⭐ the optional additional-MAIN tail is accepted and needs no modelling", () => {
    // CR 505.1a: every main phase after the first IS a postcombat main, and the normal forward transition
    // already lands there once the queue drains. The printed promise is kept by doing nothing.
    expect(opsOf("There is an additional combat phase after this phase, followed by an additional main phase."))
      .toEqual(["extra-combat"]);
  });

  it("⛔ the AFTER-THIS-MAIN-PHASE form parks — a different insertion point", () => {
    expect(opsOf("After this main phase, there is an additional combat phase followed by an additional main phase."))
      .not.toContain("extra-combat");
  });

  it("⛔ and so does a COUNTED grant (Full Throttle's two)", () => {
    expect(opsOf("After this main phase, there are two additional combat phases.")).not.toContain("extra-combat");
  });
});

describe("⭐ THE JOIN — atom → queue → a real second combat", () => {
  const atEndOfCombat = (extraPhases) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", phase: "combat", step: "end-of-combat", priorityHolder: null, consecutivePasses: 0, ...(extraPhases ? { extraPhases } : {}) };
  };
  const atom = parseEffectProgram({ type: "Sorcery", name: "X", oracle: "After this phase, there is an additional combat phase." }).atoms[0];

  it("⭐ resolving the atom queues exactly one run", () => {
    const out = resolveAtom(atEndOfCombat(null), atom, { controller: "user", cardName: "Aurelia", targets: [] });
    expect(out.extraPhases).toEqual([{ kind: "combat" }]);
  });

  it("⭐ and that queued run actually sends the turn back into combat", () => {
    // The join. Increment 1 proved the splice from a hand-set queue; this proves the atom feeds it.
    let s = resolveAtom(atEndOfCombat(null), atom, { controller: "user", cardName: "Aurelia", targets: [] });
    s = advanceStep(s);
    expect(s.phase).toBe("combat");
    expect(s.step).toBe("beginning-of-combat");
  });

  it("⛔ and the turn still TERMINATES — one grant, one extra combat", () => {
    let s = resolveAtom(atEndOfCombat(null), atom, { controller: "user", cardName: "Aurelia", targets: [] });
    s = advanceStep(s);
    let guard = 0;
    while (s.step !== "end-of-combat" && guard++ < 20) s = advanceStep(s);
    expect(advanceStep(s).phase).toBe("postcombat-main"); // no third combat
  });

  it("CONTROL — without resolving the atom there is no extra combat", () => {
    expect(advanceStep(atEndOfCombat(null)).phase).toBe("postcombat-main");
  });
});

describe("tier", () => {
  it("⭐ Aurelia, the Warleader flips (rank 820)", () => {
    expect(classifyCard({ name: "Aurelia, the Warleader", type: "Legendary Creature — Angel", mana: "{2}{R}{R}{W}{W}", power: "3", toughness: "4",
      oracle: "Flying, vigilance, haste\nWhenever Aurelia attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase." }))
      .toBe("native-trigger");
  });

  it("⛔ Aggravated Assault stays PARKED — the after-main insertion point is increment 3", () => {
    expect(classifyCard({ name: "Aggravated Assault", type: "Enchantment", mana: "{2}{R}",
      oracle: "{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase." }))
      .not.toMatch(/^native/);
  });
});
