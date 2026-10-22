/**
 * protectionColorPanel.test.jsx — the protection-color pause (CR 608.2d — the colour of "protection from the color of your choice" is
 * announced as the grant resolves) renders one button per colour on offer, names the creature it protects and the card it comes
 * from, and marks the suggestion in plain words: the colour of the threat it protects from, or the board read. The wire view keeps
 * what the panel reads and nothing of the engine's (the paused grant, its resume); the hook posts the colour with the kind echo the
 * server checks (WI-5); the game log names the colour chosen.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ProtectionColorPanel, protectionColorReason } from "./learnDecisionPanels.jsx";
import { protectionColorChoicePayload } from "../../hooks/useLearnSession.js";
import { decisionViewForWire } from "../../lib/learn/decisionWire.js";
import { logActionText } from "../../lib/learn/actionLabel.js";

const render = (decision) => renderToStaticMarkup(createElement(ProtectionColorPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

const decision = {
  kind: "protection-color", controller: "user", sourceName: "Mother of Runes", cardName: "Grizzly Bears", suggestedId: "R",
  candidates: [
    { id: "W", name: "White" }, { id: "U", name: "Blue" }, { id: "B", name: "Black" },
    { id: "R", name: "Red", threats: ["Lightning Bolt"], suggested: "threat" }, { id: "G", name: "Green" },
  ],
  step: { atom: { op: "grant-protection", targetType: "creatureYouControl", colorChoice: true }, ctx: { controller: "user", targets: [{ type: "creature", id: "gb" }] } },
  resume: { program: { atoms: [] }, nextAtomIndex: 1 },
};

describe("ProtectionColorPanel", () => {
  it("names the source and the creature, offers each colour once in WUBRG order, and marks the threat's colour Suggested with what it protects from", () => {
    const html = render(decision);
    expect(html).toContain("Choose a color — Mother of Runes");
    expect(html).toContain("Grizzly Bears gains protection from the color you choose until end of turn");
    const order = ["White", "Blue", "Black", "Red", "Protects it from Lightning Bolt", "Suggested", "Green"];
    let at = -1;
    for (const text of order) {
      const next = html.indexOf(text, at + 1);
      expect(next, text).toBeGreaterThan(at);
      at = next;
    }
    expect(html.match(/<button/g)).toHaveLength(5);
    expect(html.match(/>Suggested</g)).toHaveLength(1);
  });

  it("Giver of Runes' colorless is a sixth button; with no threat the board read is the suggestion, said so", () => {
    const giver = {
      ...decision, sourceName: "Giver of Runes",
      candidates: [{ id: "W", name: "White" }, { id: "U", name: "Blue" }, { id: "B", name: "Black", suggested: "board" }, { id: "R", name: "Red" }, { id: "G", name: "Green" }, { id: "C", name: "Colorless" }],
    };
    const html = render(giver);
    expect(html.match(/<button/g)).toHaveLength(6);
    expect(html).toContain("Colorless");
    expect(html).toContain("The most common color among your opponents’ permanents");
  });

  it("the reason line: one threat, two threats, the board read, nothing", () => {
    expect([
      protectionColorReason({ threats: ["Lightning Bolt"], suggested: "threat" }),
      protectionColorReason({ threats: ["Lightning Bolt", "Pyroclasm"] }),
      protectionColorReason({ threats: ["Terminate", "Lightning Bolt", "Pyroclasm"] }),
      protectionColorReason({ suggested: "board" }),
      protectionColorReason({}),
    ]).toEqual(["Protects it from Lightning Bolt", "Protects it from Lightning Bolt and Pyroclasm", "Protects it from Terminate, Lightning Bolt and Pyroclasm", "The most common color among your opponents’ permanents", ""]);
  });

  it("the wire keeps what the panel reads (the colours, the names) and nothing of the engine's (the paused grant, its resume, the pick)", () => {
    expect(decisionViewForWire(decision)).toEqual({ kind: "protection-color", controller: "user", sourceName: "Mother of Runes", cardName: "Grizzly Bears", candidates: decision.candidates });
  });

  it("the game log names the colour chosen and the card it came from", () => {
    expect([
      logActionText({ kind: "protection-color-choice", color: "R", sourceName: "Mother of Runes" }),
      logActionText({ kind: "protection-color-choice", color: "C", sourceName: "Giver of Runes" }),
      logActionText({ kind: "protection-color-choice", color: "U", sourceName: null }),
    ]).toEqual(["Choose protection from red (Mother of Runes)", "Choose protection from colorless (Giver of Runes)", "Choose protection from blue"]);
  });

  it("the hook posts the colour with the kind echo; anything but one colour letter posts null", () => {
    expect([
      protectionColorChoicePayload("R"),
      protectionColorChoicePayload("C"),
      protectionColorChoicePayload("red"),
      protectionColorChoicePayload(["R"]),
      protectionColorChoicePayload(undefined),
    ]).toEqual([
      { kind: "protection-color", color: "R" },
      { kind: "protection-color", color: "C" },
      { kind: "protection-color", color: null },
      { kind: "protection-color", color: null },
      { kind: "protection-color", color: null },
    ]);
  });
});
