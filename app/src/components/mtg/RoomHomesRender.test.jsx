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

describe("LandingScreen — the front hall: three zones + the Keeper", () => {
  it("exactly three zone doors render — the Agents door is gone (agents live in rails now)", () => {
    const raw = renderToStaticMarkup(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    const out = text(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    expect(out).toContain("The Crucible");
    expect(out).toContain("The Academy");
    expect(out).toContain("The Vault");
    expect(out).not.toContain("The Agents");   // Colton's call: the agent box is gone from the landing
    expect(raw).toMatch(/ley-pane/);
    expect(raw).toMatch(/ley-rise/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });

  it("THE KEEPER minds the hall — non-Magic guide, the house board docked, routing lanes visible", () => {
    const raw = renderToStaticMarkup(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    const out = text(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE KEEPER");
    expect(out).toContain("The house today");       // STATUS board, not a second map of the doors
    expect(out).toContain("Karn");                  // deck lane routed, never answered here
    expect(raw).not.toMatch(/art-crop\?name=/);     // non-Magic persona: NO card art on his avatar
    // REDUNDANCY LAW (Colton): the rail must not repeat the page. The doors carry the
    // taglines; the Keeper's board must NOT re-print them.
    expect(out).not.toContain("Run your decks, rank them");
  });
});
