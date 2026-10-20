/**
 * triggerOrderPanel.test.jsx — the trigger-order pause (CR 603.3b — you put your own simultaneous triggered abilities on the stack in
 * the order you choose) renders the abilities as a list in the order they will RESOLVE, the top first, saying so in plain words: each
 * row names its place ("Resolves first" … "Resolves last"), its source, its text, and its targets — or that you choose them after the
 * order — with ▲▼ to move it and one Done. The wire view keeps what the panel reads; the hook posts the order with the kind echo the
 * server checks (WI-5).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TriggerOrderPanel, triggerOrderPlaceLabel, triggerOrderTargetsLabel } from "./learnDecisionPanels.jsx";
import { triggerOrderChoicePayload } from "../../hooks/useLearnSession.js";
import { decisionViewForWire } from "../../lib/learn/decisionWire.js";

const render = (decision) => renderToStaticMarkup(createElement(TriggerOrderPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

const decision = {
  kind: "trigger-order", controller: "user", batch: "stk-7",
  candidates: [
    { id: "stk-8", sourceName: "Ravenous Chupacabra", abilityText: "When this creature enters, destroy target creature an opponent controls", targets: [], targetsNext: true },
    { id: "stk-7", sourceName: "Soul Warden", abilityText: "Whenever another creature enters, you gain 1 life", targets: [] },
    { id: "stk-9", sourceName: "Twinshot Sniper", abilityText: "When this creature enters, it deals 2 damage to any target", targets: [{ id: "ai1", type: "player", name: "ai1", controller: "ai1" }] },
  ],
};

describe("TriggerOrderPanel", () => {
  it("says in plain words which resolves first, and lists the abilities top first as they stand, each with its place, source, text and targets", () => {
    const html = render(decision);
    expect(html).toContain("Order your 3 triggered abilities");
    expect(html).toContain("The top of this list resolves first — it goes on the stack last.");
    const rows = ["Resolves first", "Ravenous Chupacabra", "You choose its targets after the order", "Resolves 2nd", "Soul Warden", "Resolves last", "Twinshot Sniper", "Targets Opponent 1"];
    let at = -1;
    for (const text of rows) {
      const next = html.indexOf(text, at + 1);
      expect(next, text).toBeGreaterThan(at);
      at = next;
    }
    expect(html).toContain("“Whenever another creature enters, you gain 1 life”");
    expect(html.match(/title="Resolve earlier"/g)).toHaveLength(3);
    expect(html.match(/>Done</g)).toHaveLength(1);
  });

  it("the first row can't move up and the last can't move down", () => {
    const html = render(decision);
    const up = [...html.matchAll(/<button[^>]*title="Resolve earlier"[^>]*>/g)].map((m) => /disabled/.test(m[0]));
    const down = [...html.matchAll(/<button[^>]*title="Resolve later"[^>]*>/g)].map((m) => /disabled/.test(m[0]));
    expect({ up, down }).toEqual({ up: [true, false, false], down: [false, false, true] });
  });

  it("labels: places past the third, and targets by name and whose", () => {
    expect([1, 2, 3, 10, 11, 12, 13, 21, 22, 23].map((k) => triggerOrderPlaceLabel(k, 30))).toEqual([
      "Resolves 2nd", "Resolves 3rd", "Resolves 4th", "Resolves 11th", "Resolves 12th", "Resolves 13th", "Resolves 14th", "Resolves 22nd", "Resolves 23rd", "Resolves 24th",
    ]);
    expect([
      triggerOrderTargetsLabel({ targets: [{ id: "g", type: "creature", name: "Hill Giant", controller: "ai2" }, { id: "user", type: "player" }] }),
      triggerOrderTargetsLabel({ targets: [] }),
      triggerOrderTargetsLabel({ targets: [], targetsNext: true }),
    ]).toEqual(["Targets Hill Giant (Opponent 2), You", "", "You choose its targets after the order"]);
  });

  it("the wire keeps what the panel reads (the abilities) and nothing of the engine's (the batch)", () => {
    expect(decisionViewForWire(decision)).toEqual({ kind: "trigger-order", controller: "user", candidates: decision.candidates });
  });

  it("the hook posts the order with the kind echo; anything but a list of ids posts null", () => {
    expect({
      order: triggerOrderChoicePayload(["stk-9", "stk-7", "stk-8"]),
      notAList: triggerOrderChoicePayload("stk-9"),
      junk: triggerOrderChoicePayload(["stk-9", 3]),
    }).toEqual({
      order: { kind: "trigger-order", resolveOrder: ["stk-9", "stk-7", "stk-8"] },
      notAList: { kind: "trigger-order", resolveOrder: null },
      junk: { kind: "trigger-order", resolveOrder: null },
    });
  });
});
