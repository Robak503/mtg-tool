/**
 * PendingChoicePanels.test.jsx — SSR render verification for the WI-7 pending-choice panels (the seven
 * kinds wired 2026-07-18) plus CleanupDiscardPanel.
 *
 * WHY THIS EXISTS, beyond the string-match guard in cleanupDiscardUiWiring.test.js: that guard proves a
 * branch and a hook method EXIST, not that a panel actually renders something the player can act on. The
 * MulliganReps fanned-hand bug (same day) rendered structurally-present-but-blank cards and no assertion
 * about wiring would have caught it — only rendering it did. So each panel is rendered here and asserted
 * to show its real affordances: the prompt, the candidate names, and the buttons.
 *
 * vitest env is "node" and the project bans jsdom/RTL (see SimCenter.test.jsx), so these use
 * react-dom/server renderToStaticMarkup — the pure initial render, which is what the player first sees.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DigLandPanel,
  DistributeCountersPanel,
  OptionalDrawDiscardPanel,
  OptionalDiscardPaymentPanel,
  SacUnlessPayPanel,
  TaxedPaymentPanel,
  EdictModePanel,
  CleanupDiscardPanel,
} from "./LearnView.jsx";

const MANA_2 = { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };

/** Strip tags so assertions read against visible text, not markup. */
function text(markup) {
  return markup.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, "'").replace(/\s+/g, " ").trim();
}
function render(el) {
  return text(renderToStaticMarkup(el));
}

describe("DigLandPanel", () => {
  const decision = {
    kind: "dig-land-to-battlefield",
    candidates: [{ id: "l-1", name: "Sacred Foundry" }, { id: "l-2", name: "Breeding Pool" }],
    entersTapped: true,
    sourceName: "Test Dig",
  };

  it("renders every candidate by name and an actionable submit", () => {
    const out = render(<DigLandPanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("Sacred Foundry");
    expect(out).toContain("Breeding Pool");
    expect(out).toContain("Put onto the battlefield");
  });

  it("tells the player the land enters tapped (a real decision input)", () => {
    expect(render(<DigLandPanel decision={decision} onChoose={() => {}} />)).toContain("enters tapped");
  });
});

describe("DistributeCountersPanel", () => {
  const decision = {
    kind: "distribute-counters",
    amount: 3, counterType: "+1/+1", maxTargets: 2, perTargetCap: 2,
    candidates: [{ id: "c-1", name: "Grizzly Bears" }, { id: "c-2", name: "Llanowar Elves" }],
    sourceName: "The Earth Crystal",
  };

  it("renders the allocator with candidates, the total, and both limits", () => {
    const out = render(<DistributeCountersPanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("Grizzly Bears");
    expect(out).toContain("Llanowar Elves");
    expect(out).toContain("3");
    expect(out).toContain("up to 2");     // maxTargets
    expect(out).toContain("max 2 each");  // perTargetCap
  });

  it("opens fully unassigned, so the submit names what's left rather than looking ready", () => {
    const out = render(<DistributeCountersPanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("Assign 3 more");
  });
});

describe("OptionalDrawDiscardPanel", () => {
  it("offers both branches explicitly", () => {
    const out = render(<OptionalDrawDiscardPanel decision={{ kind: "optional-draw-discard", sourceName: "Test Loot" }} onChoose={() => {}} />);
    expect(out).toContain("Draw, then discard");
    expect(out).toContain("Decline");
    expect(out).toContain("Test Loot");
  });
});

describe("OptionalDiscardPaymentPanel", () => {
  it("offers pay/decline when a card is available", () => {
    const out = render(<OptionalDiscardPaymentPanel decision={{ kind: "optional-discard-payment", available: true, sourceName: "Test Pitch" }} onChoose={() => {}} />);
    expect(out).toContain("Discard a card");
    expect(out).toContain("Decline");
  });

  it("says so plainly when there is nothing to discard (rather than a dead button)", () => {
    const out = render(<OptionalDiscardPaymentPanel decision={{ kind: "optional-discard-payment", available: false }} onChoose={() => {}} />);
    expect(out).toContain("no card to discard");
  });
});

describe("SacUnlessPayPanel — the inverted-polarity one", () => {
  const decision = { kind: "sac-unless-pay", cost: MANA_2, sourceName: "Test Upkeep" };

  it("names the consequence on the DECLINE button, not a bare 'No'", () => {
    const out = render(<SacUnlessPayPanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("Sacrifice Test Upkeep");
  });

  it("shows the cost and that paying keeps the permanent", () => {
    const out = render(<SacUnlessPayPanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("{2}");
    expect(out).toContain("keep it");
  });

  // NON-MANA cost kinds (2026-08-12) — the discard kind shipped 08-07 with its engine arms but WITHOUT a
  // wardCostLabel arm, so this panel read "Pay {0} (keep it)" for Masticore: a lying label on the human
  // path. These rows pin both non-mana kinds to their printed cost and the numeric-fallback lie to ABSENT.
  it("⛔ a discard cost reads 'Discard a card', never the numeric-fallback 'Pay {0}'", () => {
    const out = render(<SacUnlessPayPanel decision={{ kind: "sac-unless-pay", cost: { kind: "discard", count: 1 }, sourceName: "Masticore" }} onChoose={() => {}} />);
    expect(out).toContain("Discard a card");
    expect(out).not.toContain("Pay {0}");
  });

  it("a sacrifice cost names the victim pool ('Sacrifice two lands')", () => {
    const out = render(<SacUnlessPayPanel decision={{ kind: "sac-unless-pay", cost: { kind: "sacrifice", type: "land", count: 2 }, sourceName: "Cosmic Larva" }} onChoose={() => {}} />);
    expect(out).toContain("Sacrifice two lands");
    expect(out).toContain("Sacrifice Cosmic Larva");
    const single = render(<SacUnlessPayPanel decision={{ kind: "sac-unless-pay", cost: { kind: "sacrifice", type: "enchantment", count: 1 }, sourceName: "Endless Wurm" }} onChoose={() => {}} />);
    expect(single).toContain("Sacrifice an enchantment");
  });
});

describe("TaxedPaymentPanel", () => {
  it("shows the cost and what the opponent gets if you decline", () => {
    const out = render(<TaxedPaymentPanel
      decision={{ kind: "taxed-payment", cost: MANA_2, beneficiary: "ai", declinePayoff: "draw", sourceName: "Rhystic Study" }}
      onChoose={() => {}}
    />);
    expect(out).toContain("Rhystic Study");
    expect(out).toContain("{2}");
    expect(out).toContain("draws a card");
    expect(out).toContain("Decline");
  });
});

describe("EdictModePanel", () => {
  const decision = {
    kind: "edict-mode",
    modes: ["life", "sacrifice"],
    sac: [{ id: "p-1", name: "Grizzly Bears" }],
    disc: [],
    sourceName: "Torment of Hailfire",
  };

  it("renders every offered mode in readable language", () => {
    const out = render(<EdictModePanel decision={decision} onChoose={() => {}} />);
    expect(out).toContain("Lose life");
    expect(out).toContain("Sacrifice a nonland permanent");
  });

  it("holds the target pool back until a mode is picked (initial render shows no target list)", () => {
    // Nothing is selected on first render, so the sac pool must not be showing yet.
    expect(render(<EdictModePanel decision={decision} onChoose={() => {}} />)).not.toContain("Grizzly Bears");
  });
});

describe("CleanupDiscardPanel (the turn-1 fix, same render contract)", () => {
  it("renders the player's own hand and a discard action", () => {
    const out = render(<CleanupDiscardPanel
      decision={{ kind: "cleanup-discard", candidates: [{ id: "h-0", name: "Island" }, { id: "h-1", name: "Mountain" }], count: 1 }}
      onChoose={() => {}}
    />);
    expect(out).toContain("Island");
    expect(out).toContain("Mountain");
    expect(out).toContain("Discard");
  });

  it("names how many are still owed when more than one", () => {
    const out = render(<CleanupDiscardPanel
      decision={{ kind: "cleanup-discard", candidates: [{ id: "h-0", name: "Island" }], count: 2 }}
      onChoose={() => {}}
    />);
    expect(out).toContain("2 cards");
  });
});
