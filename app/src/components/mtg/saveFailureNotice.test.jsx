/**
 * saveFailureNotice.test.jsx — what a player sees when the server could not keep their Academy game on disk
 * (2026-10-21): a small dismissible notice under the table strip, never a modal and never a blocked move.
 * The hook's pure `nextSaveNotice` decides when it shows; SaveFailureNotice renders it (SSR — the project bans
 * jsdom/RTL, see SimCenter.test.jsx).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveFailureNotice, SAVE_FAILURE_TEXT } from "./LearnView.jsx";
import { nextSaveNotice } from "../../hooks/useLearnSession.js";

const AUTOSAVE = { kind: "autosave", detail: "EEXIST: file already exists, mkdir 'data/learn-sessions'" };
const noop = () => {};

describe("SaveFailureNotice", () => {
  it("an autosave failure says the game may not survive a restart, with a dismiss button", () => {
    const html = renderToStaticMarkup(createElement(SaveFailureNotice, { failure: AUTOSAVE, onDismiss: noop }));
    expect(html).toContain("Autosave failed — your game may not survive a restart.");
    expect(html).toContain('aria-label="Dismiss the save notice"');
    expect(html).toContain('role="status"');
    expect(html).toContain("EEXIST"); // the detail rides along as the tooltip
  });

  it("a game-record failure says the record won't appear in the Crucible", () => {
    const html = renderToStaticMarkup(createElement(SaveFailureNotice, { failure: { kind: "game-record", detail: "EPERM" }, onDismiss: noop }));
    expect(SAVE_FAILURE_TEXT["game-record"]).toContain("record wasn't saved");
    expect(html).toContain("it won&#x27;t appear in your Crucible records."); // SSR escapes the apostrophes
  });

  it("renders nothing without a failure", () => {
    expect(renderToStaticMarkup(createElement(SaveFailureNotice, { failure: null, onDismiss: noop }))).toBe("");
  });
});

describe("nextSaveNotice — when the notice shows", () => {
  const kept = { decision: {} };
  const failed = { decision: {}, saveFailure: AUTOSAVE };

  it("a response that reports a failure shows it", () => {
    expect(nextSaveNotice({ saveFailure: null, saveFailureDismissed: false }, failed)).toEqual({ saveFailure: AUTOSAVE, saveFailureDismissed: false });
  });

  it("a response without one means the game was kept: the notice clears", () => {
    expect(nextSaveNotice({ saveFailure: AUTOSAVE, saveFailureDismissed: false }, kept)).toEqual({ saveFailure: null, saveFailureDismissed: false });
  });

  it("dismissed stays dismissed while the saves keep failing (no nagging every move)", () => {
    expect(nextSaveNotice({ saveFailure: AUTOSAVE, saveFailureDismissed: true }, failed)).toEqual({ saveFailure: AUTOSAVE, saveFailureDismissed: true });
  });

  it("a good save re-arms it: the next failure shows again", () => {
    const afterGood = nextSaveNotice({ saveFailure: AUTOSAVE, saveFailureDismissed: true }, kept);
    expect(nextSaveNotice(afterGood, failed)).toEqual({ saveFailure: AUTOSAVE, saveFailureDismissed: false });
  });
});
