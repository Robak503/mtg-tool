/**
 * changeTargetPanel.test.jsx — the change-the-target pause (shelf D14, Misdirection and kin) renders one button per candidate and
 * no decline (the change is mandatory, CR 115.7a); players read by seat, permanents and spells by name with whose they are. The
 * hook posts the picked id with the kind echo the server checks (WI-5).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChangeTargetPanel, changeTargetLabel } from "./learnDecisionPanels.jsx";
import { changeTargetChoicePayload } from "../../hooks/useLearnSession.js";

const render = (decision) => renderToStaticMarkup(createElement(ChangeTargetPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

describe("ChangeTargetPanel", () => {
  const decision = {
    kind: "change-target", controller: "user", spellName: "Lightning Bolt", sourceName: "Misdirection",
    from: { id: "giant", name: "Hill Giant", type: "creature", controller: "user" },
    candidates: [
      { type: "player", id: "user", name: "user" },
      { type: "player", id: "ai1", name: "ai1" },
      { type: "creature", id: "bear", name: "Grizzly Bears", controller: "ai1" },
      { type: "creature", id: "mybear", name: "Grizzly Bears", controller: "user" },
    ],
  };
  it("names the spell, where it points now, and every candidate — and offers no decline", () => {
    const html = render(decision);
    expect(html).toContain("Change the target of Lightning Bolt — Misdirection");
    expect(html).toContain("It targets Hill Giant (yours).");
    for (const label of ["You", "Opponent 1", "Grizzly Bears (Opponent 1)", "Grizzly Bears (yours)"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/<button/g)).toHaveLength(4);
    expect(html).not.toMatch(/Decline|Keep it/);
  });
  it("labels read by seat for players and by name plus whose for everything else", () => {
    expect(decision.candidates.map(changeTargetLabel)).toEqual(["You", "Opponent 1", "Grizzly Bears (Opponent 1)", "Grizzly Bears (yours)"]);
    expect(changeTargetLabel({ type: "spell", id: "s1", name: "Counterspell", controller: "ai" })).toBe("Counterspell (Opponent)");
  });
  it("the hook posts the picked id with the kind echo", () => {
    expect({ picked: changeTargetChoicePayload("bear"), junk: changeTargetChoicePayload(undefined) })
      .toEqual({ picked: { kind: "change-target", targetId: "bear" }, junk: { kind: "change-target", targetId: null } });
  });
});
