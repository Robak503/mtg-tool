/**
 * optionalSacChosenPanel.test.jsx — the reflexive CHOSEN sacrifice (shelf D13, Iron Man's "a noncreature artifact") renders
 * one button per candidate plus Decline, and each submits the permanent it names; the value-token form keeps its yes/no.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OptionalSacPanel } from "./learnDecisionPanels.jsx";
import { optionalSacChoicePayload } from "../../hooks/useLearnSession.js";

const render = (decision) => renderToStaticMarkup(createElement(OptionalSacPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

describe("OptionalSacPanel — the chosen form", () => {
  it("lists each candidate with its mana value, plus Decline, and reads 'a noncreature artifact'", () => {
    const html = render({ kind: "optional-sac-payment", subtype: "noncreature artifact", available: true, sourceName: "Iron Man, Titan of Innovation",
      candidates: [{ id: "ring", name: "Sol Ring", manaValue: 1, token: false }, { id: "tr", name: "Treasure", manaValue: 0, token: true }] });
    expect(html).toContain("You may sacrifice a noncreature artifact");
    expect(html).toContain("Sacrifice Sol Ring (mana value 1)");
    expect(html).toContain("Sacrifice Treasure (mana value 0)");
    expect(html).toContain("Decline");
    expect(html).not.toContain("Sacrifice a noncreature artifact<");   // the yes/no button is not drawn for this form
  });
  it("the article follows the word: 'an artifact'", () => {
    expect(render({ kind: "optional-sac-payment", subtype: "artifact", available: true, candidates: [] })).toContain("You may sacrifice an artifact");
  });
  it("the hook posts the chosen id to the server; the value-token answers stay booleans", () => {
    expect({
      chosen: optionalSacChoicePayload({ sac: true, victimId: "ring" }),
      yes: optionalSacChoicePayload(true),
      no: optionalSacChoicePayload(false),
    }).toEqual({
      chosen: { kind: "optional-sac-payment", sac: true, victimId: "ring" },
      yes: { kind: "optional-sac-payment", sac: true },
      no: { kind: "optional-sac-payment", sac: false },
    });
  });
  it("the value-token form still shows its yes/no", () => {
    const html = render({ kind: "optional-sac-payment", subtype: "Food", available: true, sourceName: "S" });
    expect(html).toContain("Sacrifice a Food");
    expect(html).toContain("Decline");
  });
});
