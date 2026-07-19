/**
 * RoomHomesRender.test.jsx — SSR render gates for the reworked room front doors
 * (the overnight jewel & machine pass, 2026-07-19).
 *
 * Same doctrine as VaultDashboardRender.test.jsx: components RENDER (SSR — the
 * repo bans jsdom/RTL) and must show their real affordances in the PRE-FETCH
 * frame Colton sees first. Every room asserts:
 *   - the chrome masthead (title + the Halls switcher),
 *   - its rail guide's nameplate (the Room Guides pattern),
 *   - the material kit actually applied (ley-pane in the markup),
 *   - ZERO looping animations in the rendered markup (the pulse ban).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import ProvingHome from "./ProvingHome.jsx";
import AcademyHome from "./AcademyHome.jsx";
import AgentsHome from "./AgentsHome.jsx";
import LandingScreen from "./LandingScreen.jsx";

const noop = () => {};
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, "'").replace(/\s+/g, " ").trim();

describe("ProvingHome — The Crucible in the register", () => {
  it("masthead + tiles + Teferi's rail render in the pre-fetch frame", () => {
    const raw = renderToStaticMarkup(createElement(ProvingHome, { onPick: noop, fontFamily: "Inter" }));
    const out = text(createElement(ProvingHome, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE CRUCIBLE");
    expect(out).toContain("Halls");
    expect(out).toContain("Games recorded");
    expect(out).toContain("Win rate");
    expect(out).toContain("Recent tables");
    expect(out).toContain("TEFERI");            // the rail guide is present
    expect(out).toContain("Sim Center");        // hall doors survive as machined panes
    expect(raw).toMatch(/ley-pane/);            // the material kit actually applied
    expect(raw).not.toMatch(/\binfinite\b/);    // the pulse ban holds
  });

  it("lane discipline is visible in Teferi's empty-chat guidance", () => {
    const out = text(createElement(ProvingHome, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("Karn");   // deck questions route to the bench — the lane law, visible
  });
});

describe("AcademyHome — The Academy in the register", () => {
  it("masthead + corpus tiles + Jace's rail render in the pre-fetch frame", () => {
    const raw = renderToStaticMarkup(createElement(AcademyHome, { onPick: noop, fontFamily: "Inter" }));
    const out = text(createElement(AcademyHome, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE ACADEMY");
    expect(out).toContain("Halls");
    expect(out).toContain("Judge corpus");
    expect(out).toContain("Today's trial");
    expect(out).toContain("JACE");              // the rail guide is present
    expect(out).toContain("Learn to Play");     // hall doors survive as machined panes
    expect(raw).toMatch(/ley-pane/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });

  it("lane discipline is visible in Jace's empty-chat guidance", () => {
    const out = text(createElement(AcademyHome, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("Karn");
    expect(out).toContain("Teferi");
  });
});

describe("AgentsHome — the specialists' hall in the register", () => {
  it("masthead + all three agent doors render (no rail — the room IS the chat)", () => {
    const raw = renderToStaticMarkup(createElement(AgentsHome, { onPickAgent: noop, fontFamily: "Inter" }));
    const out = text(createElement(AgentsHome, { onPickAgent: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE AGENTS");
    expect(out).toContain("Jace");
    expect(out).toContain("Karn");
    expect(out).toContain("Tibalt");
    expect(raw).toMatch(/ley-pane/);
    expect(raw).toMatch(/art-crop\?name=/);     // real card art requested for the faces
    expect(raw).not.toMatch(/\binfinite\b/);
  });
});

describe("LandingScreen — material doors", () => {
  it("all four room doors render machined with one-shot entrances", () => {
    const raw = renderToStaticMarkup(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    const out = text(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    expect(out).toContain("The Agents");
    expect(out).toContain("The Crucible");
    expect(out).toContain("The Academy");
    expect(out).toContain("The Vault");
    expect(raw).toMatch(/ley-pane/);
    expect(raw).toMatch(/ley-rise/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });
});
