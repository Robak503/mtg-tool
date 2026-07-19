/**
 * LearnViewRenderFingerprint.test.jsx — THE SEAM GATE for decomposing LearnView.jsx.
 *
 * The parser decomposition (6 slices, 4,680 -> 2,032 lines) was only safe because
 * program-fingerprint.mjs could prove each slice byte-identical across the whole corpus. A component
 * refactor has no such proof by default — which is precisely why this file grew to ~2,500 lines
 * unchallenged: nobody could move a panel and demonstrate nothing changed.
 *
 * This is the equivalent instrument. It renders EVERY presentational component to static markup with
 * fixed props and snapshots the result. Move a panel to another module and the snapshot must not
 * budge; if it does, the move changed rendered output and the slice is wrong.
 *
 * Fixed, boring props on purpose — determinism is the whole point. SSR via react-dom/server because
 * the project bans jsdom/RTL (see SimCenter.test.jsx).
 *
 * NOTE: this asserts rendered OUTPUT, not behavior. Interaction (state, submit gating) is covered by
 * PendingChoicePanels.test.jsx and the pendingChoice wiring tests; the playability sweep covers whether
 * a game can actually be finished.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import * as LV from "./LearnView.jsx";

const noop = () => {};
const MANA_2 = { kind: "mana", mana: { generic: 2, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } };
const CARDS2 = [{ id: "x-1", name: "Island" }, { id: "x-2", name: "Mountain" }];
const CARDS3 = [...CARDS2, { id: "x-3", name: "Forest" }];

/** component name -> the props it renders with. */
const CASES = {
  DigLandPanel: { decision: { kind: "dig-land-to-battlefield", candidates: CARDS2, entersTapped: true, sourceName: "S" } },
  DistributeCountersPanel: { decision: { kind: "distribute-counters", amount: 3, counterType: "+1/+1", maxTargets: 3, perTargetCap: 1, candidates: CARDS2, sourceName: "S" } },
  OptionalDrawDiscardPanel: { decision: { kind: "optional-draw-discard", sourceName: "S" } },
  OptionalDiscardPaymentPanel: { decision: { kind: "optional-discard-payment", available: true, sourceName: "S" } },
  SacUnlessPayPanel: { decision: { kind: "sac-unless-pay", cost: MANA_2, sourceName: "S" } },
  TaxedPaymentPanel: { decision: { kind: "taxed-payment", cost: MANA_2, beneficiary: "ai", declinePayoff: "draw", sourceName: "S" } },
  EdictModePanel: { decision: { kind: "edict-mode", modes: ["life", "sacrifice"], sac: CARDS2, disc: [], sourceName: "S" } },
  CleanupDiscardPanel: { decision: { kind: "cleanup-discard", candidates: CARDS3, count: 2 } },
  HandDiscardPanel: { decision: { kind: "hand-discard", candidates: CARDS2, victim: "ai", sourceName: "S" } },
  ImpulseDigPanel: { decision: { kind: "impulse-dig", candidates: CARDS2, sourceName: "S" } },
  LookTopTakePanel: { decision: { kind: "look-top-take", candidates: CARDS2, sourceName: "S" } },
  DivideDamagePanel: { decision: { kind: "divide-damage", amount: 3, candidates: CARDS2, sourceName: "S" } },
  SoftCounterPanel: { decision: { kind: "soft-counter", cost: MANA_2, sourceName: "S" } },
  OptionalManaPaymentPanel: { decision: { kind: "optional-mana-payment", cost: MANA_2, affordable: true, sourceName: "S" } },
  OptionalSacPanel: { decision: { kind: "optional-sac-payment", subtype: "Food", available: true, sourceName: "S" } },
  SacrificeChoicePanel: { decision: { kind: "sacrifice-choice", candidates: CARDS2, sourceName: "S" } },
  DiscardChoicePanel: { decision: { kind: "discard", candidates: CARDS2, count: 1, sourceName: "S" } },
  OptionalChoicePanel: { decision: { kind: "optional-effect", prompt: "Do the thing?", sourceName: "S" } },
  CommanderReturnPanel: { decision: { kind: "commander-return", cardName: "Commander", sourceName: "S" } },
  CloneCopyPanel: { decision: { kind: "clone-search", candidates: CARDS2, sourceName: "S" } },
  ScrySurveilPanel: { decision: { kind: "scry-surveil", candidates: CARDS2, count: 2, sourceName: "S" } },
  TutorSearchPanel: { decision: { kind: "tutor-search", candidates: CARDS2, sourceName: "S" } },
  UnresolvedPanel: { decision: { kind: "unresolved", reason: "why", cardName: "C" } },
  ChoiceBanner: { icon: "X", title: "T", children: "body" },
  YesNoChoice: { yesLabel: "Yes", noLabel: "No" },
  CardPickGrid: { candidates: CARDS2, selected: null, onSelect: noop },
};

/**
 * Pure style/label helpers — fingerprinted as JSON rather than markup.
 *
 * NO optional chaining here, deliberately. The first version called `LV.containerStyle?.()`, and since
 * those helpers were module-private at the time it quietly returned `undefined` and snapshotted THAT as
 * the baseline — a gate that proved nothing, which only surfaced when extracting them made the values
 * real. Calling them directly means an unexported helper now throws instead of freezing a hole.
 */
const HELPER_ARGS = {
  tutorSheetStyle: [], containerStyle: ["Inter"], headerStyle: [], labelStyle: [],
  sectionLabelStyle: [], selectStyle: ["Inter"], unresolvedSheetStyle: [],
  floatErrorStyle: [], errorBoxStyle: [], wardCostLabel: [{ cost: MANA_2 }],
};
const HELPERS = Object.fromEntries(
  Object.entries(HELPER_ARGS).map(([name, args]) => [name, () => LV[name](...args)]),
);

function render(name) {
  const Comp = LV[name];
  if (typeof Comp !== "function") return `NOT-EXPORTED:${name}`;
  const props = { onChoose: noop, onContinue: noop, onSelect: noop, ...CASES[name] };
  // createElement, NOT Comp(props): these are real components with hooks, so they must be
  // rendered by React rather than invoked as plain functions.
  return renderToStaticMarkup(createElement(Comp, props)).replace(/\s+/g, " ").trim();
}

describe("LearnView render fingerprint — markup must not change when a panel moves", () => {
  for (const name of Object.keys(CASES).sort()) {
    it(`${name} renders identically`, () => {
      expect(render(name)).toMatchSnapshot();
    });
  }
});

describe("LearnView helper fingerprint — style/label output must not change when helpers move", () => {
  for (const name of Object.keys(HELPERS).sort()) {
    it(`${name}() returns identically`, () => {
      expect(HELPERS[name]()).toMatchSnapshot();
    });
  }
});

describe("the fingerprint itself stays honest", () => {
  it("every case actually rendered — a NOT-EXPORTED entry silently proves nothing", () => {
    const missing = Object.keys(CASES).filter((n) => typeof LV[n] !== "function");
    expect(missing).toEqual([]);
  });

  it("no case rendered empty (an empty snapshot would freeze a blank panel as 'correct')", () => {
    const empty = Object.keys(CASES).filter((n) => render(n).length < 20);
    expect(empty).toEqual([]);
  });

  it("every helper is exported and returns a real value — the hole that made the first baseline useless", () => {
    const bad = Object.keys(HELPER_ARGS).filter((n) => typeof LV[n] !== "function" || HELPERS[n]() === undefined);
    expect(bad).toEqual([]);
  });
});
