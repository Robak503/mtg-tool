/**
 * extraCombatAtom.test.js — EXTRA COMBAT PHASES (CR 500.8), wave increment 2: the atom and its parse arms.
 *
 * Increment 1 built the engine mechanism and tested it from a hand-set queue. This closes the chain: the
 * printed clause parses to an atom, the atom queues a run, and the queued run produces a real second
 * combat. Testing the halves separately is what let the stun slice's matcher widening do nothing for a
 * whole round — so the join gets its own assertion here.
 *
 * ⭐ INCREMENT 3 LANDED (2026-08-12): the after-MAIN form has its OWN arm (insertAfter:"main"), each queue
 * entry carries its insertion point (after:"main" | absent ⇒ end-of-combat), and advanceStep pops each
 * class at ITS boundary. Aggravated Assault, Relentless Assault, Seize the Day, Waves of Aggression and
 * Response // Resurgence flipped (+5/0/0); Karlach still parks on its trigger's compound (untap-attackers
 * + first strike + first-combat gate — a follow-up). The old deliberate-park pins below graduated.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the after-main pop site disabled in advanceStep -> the pop witness dies (no combat after main).
 *   · the end-of-combat CLASS FILTER dropped -> the class-separation row dies: an after-main entry is
 *     consumed at end-of-combat — a combat at a boundary the card never printed (the exact wrongness
 *     the original park guarded against).
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

  it("⭐ GRADUATED (2026-08-12, Increment 3): the AFTER-THIS-MAIN-PHASE form parses with its OWN insertion point", () => {
    // This pin parked the form because the queue entry had no insertion point and would have fired at
    // end-of-combat — a combat the card did not grant. Increment 3 landed exactly as this file's own
    // comment predicted: the atom carries insertAfter:"main", the entry carries after:"main", and
    // advanceStep pops it when a MAIN phase ends (witnessed below). Aggravated Assault, Relentless
    // Assault, Seize the Day, Waves of Aggression, Response // Resurgence flipped on it.
    const p = parseEffectProgram({ type: "Sorcery", name: "X", oracle: "After this main phase, there is an additional combat phase followed by an additional main phase." });
    expect(p.atoms.map((a) => a.op)).toContain("extra-combat");
    expect(p.atoms.find((a) => a.op === "extra-combat").insertAfter).toBe("main");
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

  it("⭐ GRADUATED (2026-08-12): Aggravated Assault flips — Increment 3 landed", () => {
    expect(classifyCard({ name: "Aggravated Assault", type: "Enchantment", mana: "{2}{R}",
      oracle: "{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase." }))
      .toMatch(/^native/);
  });
});

describe("⭐⭐ INCREMENT 3 — the after-MAIN insertion point (2026-08-12)", () => {
  const atMain = (phase, extraPhases) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", phase, step: "main", priorityHolder: null, consecutivePasses: 0, ...(extraPhases ? { extraPhases } : {}) };
  };

  it("⭐⭐ leaving a POSTCOMBAT main with an after-main run queued → a new combat begins", () => {
    const s = advanceStep(atMain("postcombat-main", [{ kind: "combat", after: "main" }]));
    const row = { phase: s.phase, step: s.step, queueLeft: (s.extraPhases || []).length, combat: s.combat };
    console.log("  WITNESS afterMainPop", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ phase: "combat", step: "beginning-of-combat", queueLeft: 0, combat: null });
  });

  it("⭐ the inserted combat DRAINS to a postcombat main — the promised 'additional main phase'", () => {
    let s = advanceStep(atMain("postcombat-main", [{ kind: "combat", after: "main" }]));
    let guard = 0;
    while (s.step !== "end-of-combat" && guard++ < 20) s = advanceStep(s);
    expect(advanceStep(s).phase).toBe("postcombat-main"); // CR 505.1a — and NO second extra combat (popped once)
  });

  it("⛔⛔ CLASS SEPARATION: an after-main entry is NOT consumed at end-of-combat", () => {
    // The wrongness Increment 3's park guarded against: firing at end-of-combat grants a combat the card
    // did not print. The entry must survive the end-of-combat site untouched and wait for a main to end.
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const eoc = { ...s0, activePlayer: "user", phase: "combat", step: "end-of-combat", priorityHolder: null, consecutivePasses: 0, extraPhases: [{ kind: "combat", after: "main" }] };
    const s = advanceStep(eoc);
    const row = { phase: s.phase, queueLeft: (s.extraPhases || []).length };
    console.log("  WITNESS classSeparation", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ phase: "postcombat-main", queueLeft: 1 }); // forward as normal, the entry waits
  });

  it("⛔ NO queue → a main exit advances forward as it always did (byte-stable)", () => {
    const s = advanceStep(atMain("postcombat-main", null));
    expect(s.phase).not.toBe("combat");
  });
});
