/**
 * WAVE 2b — counter-grammar extensions on the P3.1 hard-counter atom + the soft-counter machinery:
 *
 *   1. CNT-MV-EXACT  — "Counter target spell with mana value N" (Mental Misstep N=1, Spell Snare N=2).
 *      EXACT mana-value equality (NOT "or less"/"or greater"); the inequality variants stay LOW → Arbiter.
 *   2. CNT-ACP       — "Counter target artifact, creature, or planeswalker spell" (Strix Serenade's lead;
 *      it carries the Swan-Song "Its controller creates a Bird" rider). 3-way front-face type union.
 *   3. SOFT-CNT-X    — "Counter target spell unless its controller pays {X}" (Clash of Wills). The {X} is the
 *      counterspell's own cast X (ctx.xValue), routed through the same pay-or-be-countered pending choice.
 *   4. CNT-EXILE-INSTEAD — "Counter target <filter> spell. If that spell is countered this way, exile it
 *      instead of putting it into its owner's graveyard." (Deny Existence). Countered spell → exile not GY.
 *
 * Verified against real oracle text (oracle-index.json): Mental Misstep, Spell Snare, Strix Serenade,
 * Clash of Wills, Deny Existence. Each new shape parses HIGH (so it actually fires post-WAVE-1b); each
 * landmine variant stays LOW → Arbiter (CREED — never a confidently-wrong counter).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "../../gameState.js";
import { resolveAtom } from "../effectAtoms.js";
import { resolveSoftCounterChoice } from "../runProgram.js";
import { parseEffectClause, programConfidence } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { enumerateTargets } from "../../spellEffects.js";
import { RESOLVER_KEYS } from "../../resolvers.js";

beforeEach(() => _resetIdsForTests());

const programOf = (txt) => parseEffectClause(txt, "Instant");
const atomsOf = (txt) => programOf(txt)?.atoms;
const isHigh = (txt) => programConfidence(programOf(txt)) === "high";

// A spell on the stack with a real type + mana value (cmc), like spellEffects/softCounter test harness.
const spellOnStack = (id, name, type, controller, cmc = 0) => ({
  id, kind: "spell", controller, targets: [], cost: null,
  source: { id: `card-${id}`, name, type, cmc, oracle: "" },
  payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} },
});
const island = (id, controller) => createPermanent({ id, card: { id: `c${id}`, name: "Island", type: "Land", oracle: "{T}: Add {U}." }, controller });

function stateWithStack(spells, { aiLands = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < aiLands; i++) bf.push(island(`AL${i}`, "ai"));
  return { ...s, stack: spells, players: { ...s.players, ai: { ...s.players.ai, battlefield: bf } } };
}

// ──────────────────────────────────────────────────────────────────────────────
describe("CNT-MV-EXACT — parser", () => {
  it("parses Mental Misstep (MV 1) / Spell Snare (MV 2) to a counter atom with exactMv", () => {
    expect(atomsOf("Counter target spell with mana value 1.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", exactMv: 1 }]);
    expect(atomsOf("Counter target spell with mana value 2.")).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", exactMv: 2 }]);
    expect(isHigh("Counter target spell with mana value 1.")).toBe(true);
  });

  it("CREED: 'or less' / 'or greater' inequalities stay LOW → Arbiter", () => {
    expect(isHigh("Counter target spell with mana value 4 or greater.")).toBe(false); // Disdainful Stroke
    expect(isHigh("Counter target spell with mana value 4 or less.")).toBe(false);    // Thoughtbind
    expect(isHigh("Counter target spell with mana value 1 or less.")).toBe(false);    // Minor Misstep
  });
});

describe("CNT-MV-EXACT — enumeration + resolution (EXACT equality)", () => {
  const ATOM = { op: "counter", spellFilter: "any", targetType: "spell", exactMv: 1 };
  const enumerate = (state) => enumerateTargets(state, "ai", ATOM);
  const resolveOn = (state, id) => resolveAtom(state, ATOM, { controller: "ai", targets: [{ type: "spell", id }], cardName: "Mental Misstep" });

  it("offers ONLY the MV-1 spell, not the MV-2 spell, at enumeration", () => {
    const st = stateWithStack([spellOnStack("s1", "Ponder", "Sorcery", "user", 1), spellOnStack("s2", "Divination", "Sorcery", "user", 2)]);
    expect(enumerate(st).map((t) => t.id)).toEqual(["s1"]);
  });

  it("counters an MV-1 spell", () => {
    const st = resolveOn(stateWithStack([spellOnStack("s1", "Ponder", "Sorcery", "user", 1)]), "s1");
    expect(st.stack).toHaveLength(0);
    expect(st.players.user.graveyard.map((c) => c.name)).toEqual(["Ponder"]);
  });

  it("CREED: an MV-2 spell is NOT countered (resolution-time re-check fizzles)", () => {
    const st = resolveOn(stateWithStack([spellOnStack("s2", "Divination", "Sorcery", "user", 2)]), "s2");
    expect(st.stack.map((o) => o.id)).toEqual(["s2"]);           // still on the stack
    expect(st.players.user.graveyard).toHaveLength(0);
    expect(st.log.some((l) => l.effect === "counter-fizzle")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("CNT-ACP — artifact/creature/planeswalker 3-way union", () => {
  it("parses the bare union to a counter atom; Strix Serenade's rider parses HIGH", () => {
    expect(atomsOf("Counter target artifact, creature, or planeswalker spell.")).toEqual([{ op: "counter", spellFilter: "artifactCreaturePlaneswalker", targetType: "spell" }]);
    // Strix Serenade — the lead union + "Its controller creates a 2/2 blue Bird … with flying" rider.
    expect(isHigh("Counter target artifact, creature, or planeswalker spell. Its controller creates a 2/2 blue Bird creature token with flying.")).toBe(true);
  });

  const ATOM = { op: "counter", spellFilter: "artifactCreaturePlaneswalker", targetType: "spell" };
  const enumerate = (state) => enumerateTargets(state, "ai", ATOM);
  const resolveOn = (state, id) => resolveAtom(state, ATOM, { controller: "ai", targets: [{ type: "spell", id }], cardName: "Strix Serenade" });

  it("counters an artifact / creature / planeswalker spell but NOT an instant", () => {
    const st = stateWithStack([
      spellOnStack("a1", "Sol Ring", "Artifact", "user", 1),
      spellOnStack("c1", "Grizzly Bears", "Creature — Bear", "user", 2),
      spellOnStack("pw", "Jace Beleren", "Planeswalker — Jace", "user", 3),
      spellOnStack("i1", "Lightning Bolt", "Instant", "user", 1),
    ]);
    expect(enumerate(st).map((t) => t.id).sort()).toEqual(["a1", "c1", "pw"]); // the instant is not offered

    const afterArtifact = resolveOn(st, "a1");
    expect(afterArtifact.stack.find((o) => o.id === "a1")).toBeUndefined();
    // The instant can never be countered by this filter even if (illegally) targeted.
    const afterInstant = resolveOn(st, "i1");
    expect(afterInstant.stack.find((o) => o.id === "i1")).toBeTruthy();
    expect(afterInstant.log.some((l) => l.effect === "counter-fizzle")).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("SOFT-CNT-X — {X} soft counter (Clash of Wills)", () => {
  it("parses to a counter atom with unlessPayX + countX (the X-spell cast gate)", () => {
    const program = programOf("Counter target spell unless its controller pays {X}.");
    expect(program.atoms).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", unlessPayX: true, countX: true }]);
    expect(programConfidence(program)).toBe("high");
    expect(program.xSpell).toBe(true); // so legalChoices enumerates affordable X + threads ctx.xValue
  });

  const ATOM = { op: "counter", spellFilter: "any", targetType: "spell", unlessPayX: true, countX: true };
  // The counterspell was cast for X=3 → ctx.xValue=3 → the AI's spell must pay {3} or be countered.
  const resolveAtX = (state, x) => resolveAtom(state, ATOM, { controller: "user", targets: [{ type: "spell", id: "s1" }], cardName: "Clash of Wills", xValue: x });

  it("sets the soft-counter pending choice with amount = the chosen X (=3), not 0", () => {
    const st = resolveAtX(stateWithStack([spellOnStack("s1", "Divination", "Sorcery", "ai", 2)], { aiLands: 3 }), 3);
    expect(st.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "ai", amount: 3, spellId: "s1" });
    expect(st.stack.map((o) => o.id)).toEqual(["s1"]); // not yet countered
  });

  it("X=3: the controller pays {3} (3 lands) → the spell survives", () => {
    const flagged = resolveAtX(stateWithStack([spellOnStack("s1", "Divination", "Sorcery", "ai", 2)], { aiLands: 3 }), 3);
    const settled = resolveSoftCounterChoice(flagged, true);
    expect(settled.stack.map((o) => o.id)).toEqual(["s1"]);                       // survived
    expect(settled.players.ai.battlefield.filter((p) => p.tapped)).toHaveLength(3); // paid {3}
    expect(settled.players.ai.graveyard).toHaveLength(0);
  });

  it("CREED X=3: the controller can't afford {3} (only 2 lands) → the spell is countered", () => {
    const flagged = resolveAtX(stateWithStack([spellOnStack("s1", "Divination", "Sorcery", "ai", 2)], { aiLands: 2 }), 3);
    const settled = resolveSoftCounterChoice(flagged, true);
    expect(settled.stack).toHaveLength(0);
    expect(settled.players.ai.graveyard.map((c) => c.name)).toEqual(["Divination"]);
  });

  it("CREED: X=0 (cast without paying) demands {0} → trivially 'paid', spell survives (no fabricated counter)", () => {
    const flagged = resolveAtX(stateWithStack([spellOnStack("s1", "Divination", "Sorcery", "ai", 2)], { aiLands: 0 }), 0);
    expect(flagged.pendingChoice).toMatchObject({ amount: 0 });
    const settled = resolveSoftCounterChoice(flagged, true);
    expect(settled.stack.map((o) => o.id)).toEqual(["s1"]); // {0} is trivially payable → survives
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("CNT-EXILE-INSTEAD — countered spell goes to exile, not the graveyard", () => {
  it("parses Deny Existence (creature lead) to a counter atom with exileInstead", () => {
    const program = programOf("Counter target creature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.");
    expect(program.atoms).toEqual([{ op: "counter", spellFilter: "creature", targetType: "spell", exileInstead: true }]);
    expect(programConfidence(program)).toBe("high");
  });

  it("CREED: an unmodeled lead filter (creature OR enchantment / non-Faerie) stays LOW → Arbiter", () => {
    expect(isHigh("Counter target creature or enchantment spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.")).toBe(false); // Deny the Divine
    expect(isHigh("Counter target non-Faerie spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard.")).toBe(false);              // Faerie Trickery
  });

  it("sends the countered spell to EXILE not the graveyard", () => {
    const ATOM = { op: "counter", spellFilter: "creature", targetType: "spell", exileInstead: true };
    const st = stateWithStack([spellOnStack("c1", "Grizzly Bears", "Creature — Bear", "user", 2)]);
    const after = resolveAtom(st, ATOM, { controller: "ai", targets: [{ type: "spell", id: "c1" }], cardName: "Deny Existence" });
    expect(after.stack).toHaveLength(0);
    expect(after.players.user.graveyard).toHaveLength(0);                       // NOT the graveyard
    expect(after.players.user.exile.map((c) => c.name)).toEqual(["Grizzly Bears"]); // exiled instead
    expect(after.log.some((l) => l.effect === "counter" && l.exiled === true)).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("coverage — the new counter shapes are native-spell", () => {
  it("Mental Misstep / Spell Snare / Strix Serenade / Clash of Wills / Deny Existence classify native-spell", () => {
    expect(classifyCard({ name: "Mental Misstep", type: "Instant", oracle: "Counter target spell with mana value 1." })).toBe("native-spell");
    expect(classifyCard({ name: "Spell Snare", type: "Instant", oracle: "Counter target spell with mana value 2." })).toBe("native-spell");
    expect(classifyCard({ name: "Strix Serenade", type: "Instant", oracle: "Counter target artifact, creature, or planeswalker spell. Its controller creates a 2/2 blue Bird creature token with flying." })).toBe("native-spell");
    expect(classifyCard({ name: "Clash of Wills", type: "Instant", oracle: "Counter target spell unless its controller pays {X}." })).toBe("native-spell");
    expect(classifyCard({ name: "Deny Existence", type: "Instant", oracle: "Counter target creature spell. If that spell is countered this way, exile it instead of putting it into its owner's graveyard." })).toBe("native-spell");
  });
});
