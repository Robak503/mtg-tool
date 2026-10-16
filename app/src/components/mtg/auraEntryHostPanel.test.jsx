/**
 * auraEntryHostPanel.test.jsx — the aura-entry-host pause (CR 303.4f — your Aura enters the battlefield without being cast and you
 * choose what it enchants) renders one button per legal host and no decline (it enters attached); each host reads by name with
 * whose it is. The hook posts the picked id with the kind echo the server checks (WI-5).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuraEntryHostPanel, auraEntryHostLabel } from "./learnDecisionPanels.jsx";
import { auraEntryHostChoicePayload } from "../../hooks/useLearnSession.js";

const render = (decision) => renderToStaticMarkup(createElement(AuraEntryHostPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

describe("AuraEntryHostPanel", () => {
  const decision = {
    kind: "aura-entry-host", controller: "user", cardName: "Pacifism", sourceName: "Displacer Kitten",
    candidates: [
      { id: "wurm", name: "Craw Wurm", controller: "ai1" },
      { id: "kitten", name: "Displacer Kitten", controller: "user" },
      { id: "fd", name: "Face-down creature", controller: "ai2" },
    ],
  };
  it("names the Aura and what returned it, says nothing is targeted, lists every host — and offers no decline", () => {
    const html = render(decision);
    expect(html).toContain("Choose what Pacifism enchants — Displacer Kitten");
    expect(html).toContain("hexproof doesn’t stop it, protection does");
    for (const label of ["Craw Wurm (Opponent 1)", "Displacer Kitten (yours)", "Face-down creature (Opponent 2)"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/<button/g)).toHaveLength(3);
    expect(html).not.toMatch(/Decline|Skip|Cancel/);
  });
  it("labels read by name plus whose", () => {
    expect(decision.candidates.map(auraEntryHostLabel)).toEqual(["Craw Wurm (Opponent 1)", "Displacer Kitten (yours)", "Face-down creature (Opponent 2)"]);
  });
  it("the hook posts the picked id with the kind echo", () => {
    expect({ picked: auraEntryHostChoicePayload("wurm"), junk: auraEntryHostChoicePayload(undefined) })
      .toEqual({ picked: { kind: "aura-entry-host", hostId: "wurm" }, junk: { kind: "aura-entry-host", hostId: null } });
  });
});
