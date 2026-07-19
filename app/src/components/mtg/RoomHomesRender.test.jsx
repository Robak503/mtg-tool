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
import FoundryHome from "./FoundryHome.jsx";
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

  it("the showpiece is a CAROUSEL: pager present, trial page first (Colton: trial ▸ hands ▸ weird rules)", () => {
    const raw = renderToStaticMarkup(createElement(AcademyHome, { onPick: noop, fontFamily: "Inter" }));
    const out = text(createElement(AcademyHome, { onPick: noop, fontFamily: "Inter" }));
    expect(out).toContain("Today's trial");                 // page 1 renders in the pre-fetch frame
    expect(raw).toContain('aria-label="Next screen"');      // the pager exists
    expect(raw).toContain('aria-label="Previous screen"');
  });
});

describe("FoundryHome — Karn's zone in the register", () => {
  it("masthead + the bench + Karn's rail render; empty bench invites AND has the start button", () => {
    const raw = renderToStaticMarkup(createElement(FoundryHome, { savedDecks: [], onOpenDeck: noop, onImport: noop, fontFamily: "Inter" }));
    const out = text(createElement(FoundryHome, { savedDecks: [], onOpenDeck: noop, onImport: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE FOUNDRY");
    expect(out).toContain("The bench");
    expect(out).toContain("KARN");
    expect(out).toContain("Tibalt");                        // the roast is a standing offer
    expect(out).toContain("The bench is empty");            // honest empty state
    expect(out).toContain("Start your first deck");         // Colton: a start button IN the bench
    expect(raw).toMatch(/ley-pane/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });

  it("the bench is a WIP LEDGER: name · commander · x/100 locked (commander = lock #1)", () => {
    const decks = [
      { id: "d1", name: "Omnath Stomp", cards: [
        { name: "Omnath, Locus of Mana", qty: 1, section: "Commander" },
        { name: "Forest", qty: 40, section: "Main" },
      ] },
      { id: "d2", name: "Fresh Start", cards: [
        { name: "Vihaan, Goldwaker", qty: 1, section: "Commander" },
      ] },
      { id: "d3", name: "Headless Pile", cards: [
        { name: "Forest", qty: 5, section: "Main" },
      ] },
    ];
    const out = text(createElement(FoundryHome, { savedDecks: decks, onOpenDeck: noop, onImport: noop, fontFamily: "Inter" }));
    expect(out).toContain("Omnath Stomp");
    expect(out).toContain("Omnath, Locus of Mana");
    expect(out).toContain("41/100");                        // locked count off the real rows
    expect(out).toContain("1/100");                         // commander alone = the first lock
    expect(out).toContain("no commander locked");           // headless deck says so — no invented floor
    expect(out).toContain("Start a new deck");              // the bench button, populated state too
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
  it("four zone doors — Crucible · Academy · Foundry · Vault; the Agents door stays gone", () => {
    const raw = renderToStaticMarkup(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    const out = text(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    expect(out).toContain("The Crucible");
    expect(out).toContain("The Academy");
    expect(out).toContain("The Foundry");      // Karn's zone joins the hall
    expect(out).toContain("The Vault");
    expect(out).not.toContain("The Agents");   // Colton's call: the agent box is gone from the landing
    expect(raw).toMatch(/ley-pane/);
    expect(raw).toMatch(/ley-rise/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });

  it("ONE SET OF DOORS: the Keeper is pure concierge — no widget canvas, no second row of room buttons", () => {
    const raw = renderToStaticMarkup(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    const out = text(createElement(LandingScreen, { appVersion: "0.0.0", onEnterArea: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE KEEPER");
    expect(out).toContain("show you to the right door");  // his greeting opens the chat
    expect(out).toContain("Karn");                        // deck lane routed, never answered here
    expect(out).not.toContain("The house today");         // the widget board is GONE (Colton: "2 sets of
    expect(raw).not.toMatch(/ley-glass-strong/);          // buttons for the doors") — no canvas at all
    expect(raw).not.toMatch(/art-crop\?name=/);           // non-Magic persona: NO card art on his avatar
  });
});
