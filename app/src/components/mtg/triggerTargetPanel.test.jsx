/**
 * triggerTargetPanel.test.jsx — the trigger-target pause (CR 603.3d — you choose the targets of your own triggered ability as it goes
 * on the stack; CR 603.3c — its mode) renders one button per legal choice: each target by name with whose it is, a player by seat,
 * "No target" for an "up to one" decline, a mode by its text, and "Choose no mode" only for a modal "choose up to one". The wire view
 * keeps what the panel reads; the hook posts the picked id with the kind echo the server checks (WI-5).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TriggerTargetPanel, triggerChoiceLabel } from "./learnDecisionPanels.jsx";
import { triggerTargetChoicePayload } from "../../hooks/useLearnSession.js";
import { decisionViewForWire } from "../../lib/learn/decisionWire.js";

const render = (decision) => renderToStaticMarkup(createElement(TriggerTargetPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

describe("TriggerTargetPanel", () => {
  const sniper = {
    kind: "trigger-target", controller: "user", stackObjectId: "stk-3", sourceName: "Twinshot Sniper",
    abilityText: "When this creature enters, it deals 2 damage to any target",
    candidates: [
      { id: "0", targets: [{ id: "bear", type: "creature", name: "Grizzly Bears", controller: "ai1" }] },
      { id: "1", targets: [{ id: "ubear", type: "creature", name: "Grizzly Bears", controller: "user" }] },
      { id: "2", targets: [{ id: "ai1", type: "player", name: "ai1", controller: "ai1" }] },
      { id: "3", targets: [] },
    ],
  };
  it("names the ability and its source, and lists every legal choice — by name and whose, a player by seat, the decline as No target", () => {
    const html = render(sniper);
    expect(html).toContain("Choose targets for Twinshot Sniper’s triggered ability");
    expect(html).toContain("“When this creature enters, it deals 2 damage to any target”");
    for (const label of ["Grizzly Bears (Opponent 1)", "Grizzly Bears (yours)", "Opponent 1", "No target"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toContain("Choose no mode");
  });
  it("a modal ability reads by mode; \"choose up to one\" adds choosing no mode", () => {
    const html = render({
      kind: "trigger-target", controller: "user", sourceName: "Knight of Autumn", allowNone: true,
      candidates: [
        { id: "0", label: "Put two +1/+1 counters on this creature.", targets: [] },
        { id: "1", label: "Destroy target artifact or enchantment.", targets: [{ id: "sol", type: "permanent", name: "Sol Ring", controller: "ai2" }] },
      ],
    });
    expect(html).toContain("Choose a mode for Knight of Autumn’s triggered ability");
    for (const label of ["Put two +1/+1 counters on this creature.", "Destroy target artifact or enchantment. — Sol Ring (Opponent 2)", "Choose no mode (the ability is removed)"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/<button/g)).toHaveLength(3);
  });
  it("labels: targets joined, a mode first, nothing at all reads No target", () => {
    expect([
      triggerChoiceLabel({ targets: [{ id: "a", type: "creature", name: "Hill Giant", controller: "ai3" }, { id: "user", type: "player" }] }),
      triggerChoiceLabel({ label: "You gain 4 life.", targets: [] }),
      triggerChoiceLabel({ targets: [] }),
    ]).toEqual(["Hill Giant (Opponent 3), You", "You gain 4 life.", "No target"]);
  });
  it("the wire keeps what the panel reads (the candidates, the ability text, allowNone) and nothing of the engine's", () => {
    const wire = decisionViewForWire({ ...sniper, allowNone: true, resume: { program: [] } });
    expect(wire).toEqual({ kind: "trigger-target", controller: "user", sourceName: "Twinshot Sniper", abilityText: sniper.abilityText, candidates: sniper.candidates, allowNone: true });
  });
  it("the hook posts the picked id with the kind echo", () => {
    expect({ picked: triggerTargetChoicePayload("2"), none: triggerTargetChoicePayload("none"), junk: triggerTargetChoicePayload(undefined) })
      .toEqual({ picked: { kind: "trigger-target", candidateId: "2" }, none: { kind: "trigger-target", candidateId: "none" }, junk: { kind: "trigger-target", candidateId: null } });
  });
});
