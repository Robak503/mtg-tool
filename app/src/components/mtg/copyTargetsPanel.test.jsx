/**
 * copyTargetsPanel.test.jsx — the copy-targets pause (CR 707.10c, 115.7d — a copy you control is put on the stack, and the effect that made it
 * lets you choose new targets for it; or your Deflecting Swat lets you choose new targets for a spell or ability) renders one question per
 * target: "Keep its target" first, with the target as it stands, then each other legal object by name and whose; a storm copy says which
 * copy of how many, a copy with several targets which target this is. The wire view keeps what the panel reads; the hook posts the picked
 * id with the kind echo the server checks (WI-5).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CopyTargetsPanel, copyTargetsChoiceLabel } from "./learnDecisionPanels.jsx";
import { copyTargetsChoicePayload } from "../../hooks/useLearnSession.js";
import { decisionViewForWire } from "../../lib/learn/decisionWire.js";

const render = (decision) => renderToStaticMarkup(createElement(CopyTargetsPanel, { decision, onChoose: () => {} })).replace(/\s+/g, " ");

describe("CopyTargetsPanel", () => {
  const storm = {
    kind: "copy-targets", controller: "user", stackObjectId: "stk-7", spellName: "Grapeshot", sourceName: "Grapeshot", objectKind: "spell",
    copyNumber: 2, copyCount: 3, slotNumber: 1, slotCount: 1, suggestedId: "3",
    candidates: [
      { id: "0", keep: true, targets: [{ id: "ai1", type: "player", name: "ai1", controller: "ai1" }] },
      { id: "1", targets: [{ id: "elf", type: "creature", name: "Llanowar Elves", controller: "ai2" }] },
      { id: "2", targets: [{ id: "user", type: "player", name: "user", controller: "user" }] },
      { id: "3", targets: [{ id: "ai3", type: "player", name: "ai3", controller: "ai3" }] },
    ],
  };
  it("names the copied spell and which storm copy it is, and lists keep first, then every other legal target by name and whose", () => {
    const html = render(storm);
    expect(html).toContain("Choose targets for the copy of Grapeshot (copy 2 of 3)");
    expect(html).not.toContain("— target ");
    for (const label of ["Keep its target — Opponent 1", "Llanowar Elves (Opponent 2)", "Opponent 3"]) expect(html).toContain(`<strong>${label}</strong>`);
    expect(html.match(/<button/g)).toHaveLength(4);
  });
  it("a copy with two targets is asked one at a time, and names which target this is; a copy of another spell names what copied it", () => {
    const html = render({
      kind: "copy-targets", controller: "user", spellName: "Hull Breach", sourceName: "Twincast", objectKind: "spell", slotNumber: 2, slotCount: 2,
      candidates: [{ id: "0", keep: true, targets: [{ id: "bears", type: "creature", name: "Grizzly Bears", controller: "ai1" }] }, { id: "1", targets: [{ id: "giant", type: "creature", name: "Hill Giant", controller: "ai2" }] }],
    });
    expect(html).toContain("Choose targets for the copy of Hull Breach — target 2 of 2");
    expect(html).toContain("Twincast copied it");
    for (const label of ["Keep its target — Grizzly Bears (Opponent 1)", "Hill Giant (Opponent 2)"]) expect(html).toContain(`<strong>${label}</strong>`);
  });
  it("Deflecting Swat's question is new targets for the spell itself, not a copy", () => {
    const html = render({
      kind: "copy-targets", controller: "user", spellName: "Lightning Bolt", sourceName: "Deflecting Swat", objectKind: "spell", retarget: true, slotNumber: 1, slotCount: 1,
      candidates: [{ id: "0", keep: true, targets: [{ id: "user", type: "player" }] }, { id: "1", targets: [{ id: "ai1", type: "player" }] }],
    });
    expect(html).toContain("Choose new targets for Lightning Bolt");
    expect(html).not.toContain("copy of");
    expect(html).toContain("Deflecting Swat lets you choose new targets for it.");
    for (const label of ["Keep its target — You", "Opponent 1"]) expect(html).toContain(`<strong>${label}</strong>`);
  });
  it("labels: keep reads its target, an empty keep reads plainly, other values their target", () => {
    expect([
      copyTargetsChoiceLabel({ keep: true, targets: [] }),
      copyTargetsChoiceLabel({ keep: true, targets: [{ id: "ai2", type: "player" }] }),
      copyTargetsChoiceLabel({ targets: [{ id: "a", type: "creature", name: "Hill Giant", controller: "ai3" }] }),
    ]).toEqual(["Keep its target", "Keep its target — Opponent 2", "Hill Giant (Opponent 3)"]);
  });
  it("the wire view keeps what the panel reads, and the hook posts the picked id with the kind echo", () => {
    const wire = decisionViewForWire({ ...storm, resume: { program: [] } });
    expect(wire).toEqual({ kind: "copy-targets", controller: "user", sourceName: "Grapeshot", spellName: "Grapeshot", objectKind: "spell", copyNumber: 2, copyCount: 3, slotNumber: 1, slotCount: 1, candidates: storm.candidates });
    expect(decisionViewForWire({ kind: "copy-targets", controller: "user", retarget: true }).retarget).toBe(true);
    expect(copyTargetsChoicePayload("3")).toEqual({ kind: "copy-targets", candidateId: "3" });
    expect(copyTargetsChoicePayload(3)).toEqual({ kind: "copy-targets", candidateId: null });
  });
});
