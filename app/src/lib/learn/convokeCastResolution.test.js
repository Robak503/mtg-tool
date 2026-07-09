/**
 * convokeCastResolution.test.js — the classifier↔runtime parse reconciliation for cost-only keywords
 * (Convoke/Affinity), Omnath breakage #4. The CLASSIFIER (coverage.spellIsNative) strips cost-only keyword lines
 * before parsing a spell's effect, so it credited Convoke/Affinity spells (Harmonized Crescendo, 257× at runtime)
 * NATIVE. But the RUNTIME cast path (actionDispatcher) parsed the FULL oracle — the bare "Convoke" line drags it
 * LOW → pendingArbiter — so a classifier-native card routed to the Arbiter at runtime (a data-trust mismatch).
 * Fix: actionDispatcher strips cost-only keyword lines before parseEffectProgram too, so the runtime resolves the
 * (already-modeled) body natively — matching the classifier. This test locks that the stripped body parses HIGH
 * and resolves WITHOUT routing to the Arbiter.
 */
import { describe, it, expect } from "vitest";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { createGameState } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";

// A Convoke spell with a fully-modeled body (draw two). The bare "Convoke" line is what dragged the runtime parse LOW.
const convokeSpell = { name: "Test Convoke", type: "Instant", oracle: "Convoke (Your creatures can help cast this spell.)\nDraw two cards." };
const stripped = () => ({ ...convokeSpell, oracle: stripCostOnlyKeywordLines(convokeSpell.oracle) });

describe("Convoke/Affinity cast-effect parse reconciliation (Omnath #4)", () => {
  it("the cost-only-stripped body parses HIGH (what the classifier — and now the cast path — parse)", () => {
    const p = parseEffectProgram(stripped());
    expect(p).toBeTruthy();
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toContain("draw");
  });
  it("resolving the cost-only-stripped program resolves NATIVELY — no spell-unresolved / pendingArbiter", () => {
    const program = parseEffectProgram(stripped());
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      players: { ...s.players, user: { ...s.players.user, library: [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }], hand: [] } },
      stack: [{ id: "stk", kind: "spell", source: convokeSpell, controller: "user", targets: [], cost: null, payload: { resolver: "effect-program", params: { program, controller: "user", targets: [] } } }],
    };
    s = resolveTopOfStack(s);
    expect((s.log || []).some((e) => e.kind === "spell-unresolved")).toBe(false); // did NOT route to the Arbiter
    expect(s.pendingArbiter).toBeFalsy();
    expect(s.players.user.hand).toHaveLength(2); // the modeled body actually resolved (drew two)
  });
  it("stripCostOnlyKeywordLines is a NO-OP for a spell without a cost-only keyword (no collateral change)", () => {
    const plain = "Draw two cards.";
    expect(stripCostOnlyKeywordLines(plain)).toBe(plain);
  });
});
