/**
 * FLASHBACK RIDER GUARD — a hollow closed 2026-09-05 (surfaced by Visions of Dominance's flip in the Study the Classics
 * slice). The cast-keyword line strip removes a Flashback line WHOLE, so ANY trailing sentence on it vanished and the
 * classifier credited the card — a made-up "When you cast this spell, you win the game." rider included. Honest only
 * when the rider modifies the flashback cast itself ("… this way"), because the engine never offers a flashback cast
 * (a safe FN). The guard fences every other trailing sentence so the card parks. Zero printed cards change.
 *
 * Mutation-checked: see the run ledger (docs-sk71).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";

const base = { name: "Probe", type: "Sorcery", mana: "{2}{G}", keywords: ["Flashback"] };
const withLine = (line) => ({ ...base, oracle: `Draw a card.\n${line}` });

describe("the flashback line strip", () => {
  it("a bare Flashback line, one with reminder, and the printed 'this way' riders still strip (native); a non-flashback-scoped trailing sentence is fenced and the card parks", () => {
    const row = {
      bare: classifyCard(withLine("Flashback {3}{G}")),
      reminder: classifyCard(withLine("Flashback {3}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)")),
      visions: classifyCard(withLine("Flashback {8}{G}{G}. This spell costs {X} less to cast this way, where X is the greatest mana value of a commander you own on the battlefield or in the command zone.")),
      lightUp: classifyCard(withLine("Flashback {3}{R}. If you cast this spell this way, X can't be 0.")),
      nonsense: classifyCard(withLine("Flashback {3}{G}. When you cast this spell, you win the game.")),
      trigger: classifyCard(withLine("Flashback {3}{G}. Whenever you cast a spell, draw a card.")),
    };
    console.log("  WITNESS flashbackGuard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.bare).toBe("native-spell");
    expect(row.reminder).toBe("native-spell");
    expect(row.visions).toBe("native-spell");
    expect(row.lightUp).toBe("native-spell");
    expect(row.nonsense).not.toMatch(/^native-/);
    expect(row.trigger).not.toMatch(/^native-/);
  });
});
