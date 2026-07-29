/**
 * classifierRuntimeParity.test.js — the classifier and the runtime must read the SAME oracle.
 *
 * ⚠️ THE BUG CLASS. coverage.js transforms a card's oracle before deciding (it strips cost-only keywords,
 * plot, cascade…). Every such transform the RUNTIME does not also apply is a divergence: the metric counts a
 * card native while the engine routes it to the Arbiter — or, worse, the reverse.
 *
 * Found by asking one question corpus-wide: for every card classified `native-spell`, does the program the
 * RUNTIME parses (parseEffectProgram over stripCostOnlyKeywordLines, exactly what actionDispatcher and
 * legalChoices feed it) come back HIGH? Eight said no.
 *   • PLOT (Plan the Heist, Rise of the Varmints) — coverage stripped the "Plot {cost}" line, the runtime
 *     did not, and the leftover line dragged the body LOW.
 *   • CASCADE (Violent Outburst, Demonic Dread, Deny Reality, Captured Sunlight, Forceful Denial, Natural
 *     Reclamation) — the keyword line belongs to the TRIGGER subsystem, not the spell's effect program.
 *
 * ⭐ BOTH FIXED IN THE SHARED HELPER so the two sides cannot drift apart again — the same conclusion as the
 * clone find (368cb402) and the triggerRouting mirror (9b6441c0). When two readers must agree, make them
 * read one source instead of promising to stay in step.
 *
 * ⛔ AND ONE GUARD THE FIRST ATTEMPT NEEDED. Reusing coverage's cascade matcher (which also matches the
 * reminder sentence) was WRONG here: coverage applies it inside a branch already gated on the card HAVING
 * cascade, whereas this helper runs on every card. It stripped a real ability off cards that GRANT cascade
 * and credited 9 of them native. The tier diff caught it — the fix was supposed to move ZERO cards.
 */
import { describe, expect, it } from "vitest";

import "./coverage.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";

// Exactly what actionDispatcher / legalChoices hand the parser for a cast spell.
const runtimeConfidence = (card) =>
  programConfidence(parseEffectProgram({ ...card, oracle: stripCostOnlyKeywordLines(card.oracle) }));

const CASCADE_REMINDER = "(When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order.)";
const PLOT_REMINDER = "(You may pay {2}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)";

describe("⭐ PLOT — the classifier's strip is now the runtime's too", () => {
  const PLAN_THE_HEIST = { name: "Plan the Heist", type: "Sorcery", mana: "{2}{U}", oracle: `Surveil 3 if you have no cards in hand. Then draw three cards.\nPlot {2}{U} ${PLOT_REMINDER}` };

  it("classifies native AND parses high at runtime", () => {
    expect(classifyCard(PLAN_THE_HEIST)).toBe("native-spell");
    expect(runtimeConfidence(PLAN_THE_HEIST)).toBe("high");
  });

  it("⛔ CREED — a 'becomes plotted' TRIGGER card keeps its line (plot is not cost-only there)", () => {
    // Longhorn Sharpshooter / Aloe Alchemist have real plot semantics beyond the cost keyword; stripping
    // would hide an unmodeled trigger. The text check reproduces coverage's parsePlotCost gate exactly —
    // measured 34/34 agreement across every corpus card matching the anchor.
    const o = "Reach\nWhen this card becomes plotted, it deals 2 damage to any target.\nPlot {3}{R} (reminder)";
    expect(stripCostOnlyKeywordLines(o)).toMatch(/Plot \{3\}\{R\}/);
  });
});

describe("⭐ CASCADE — the keyword line belongs to the trigger, not the spell body", () => {
  const VIOLENT_OUTBURST = { name: "Violent Outburst", type: "Instant", mana: "{2}{R}", oracle: `Cascade ${CASCADE_REMINDER}\nTarget creature gets +1/+1 and gains trample until end of turn.` };

  it("classifies native AND parses high at runtime", () => {
    expect(classifyCard(VIOLENT_OUTBURST)).toBe("native-spell");
    expect(runtimeConfidence(VIOLENT_OUTBURST)).toBe("high");
  });

  it("the bare keyword line is removed", () => {
    expect(stripCostOnlyKeywordLines(`Cascade ${CASCADE_REMINDER}\nDraw a card.`)).toBe("Draw a card.");
  });

  it("⛔ CREED — a card that GRANTS cascade keeps its ability (the over-strip the tier diff caught)", () => {
    // Bloodbraid Marauder / Maelstrom Nexus. The reminder sentence appears INSIDE a real granting ability;
    // matching on it stripped that ability and credited 9 cards native with it silently gone.
    const marauder = `This creature can't block.\nDelirium — This spell has cascade as long as there are four or more card types among cards in your graveyard. ${CASCADE_REMINDER}`;
    expect(stripCostOnlyKeywordLines(marauder)).toMatch(/Delirium — This spell has cascade/);
    const nexus = `The first spell you cast each turn has cascade. ${CASCADE_REMINDER}`;
    expect(stripCostOnlyKeywordLines(nexus)).toMatch(/first spell you cast each turn has cascade/);
  });
});

// ⚠️ THE CORPUS-WIDE INVARIANT LIVES IN scripts/probe-classifier-runtime-parity.mjs, NOT HERE.
// It needs the bundled oracle index, which the hermetic suite does not have — asserting it in a test made
// this file die with "Local Oracle repository missing" in a fresh worktree, and it would have failed CI for
// a reason unrelated to the thing under test. The per-card pins above are hermetic; the corpus sweep is a
// local-only probe, matching this repo's probe convention.
