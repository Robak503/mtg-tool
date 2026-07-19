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
  it("masthead + the bench + Karn's rail render; ONE green start button, count in the bench header", () => {
    const raw = renderToStaticMarkup(createElement(FoundryHome, { savedDecks: [], onOpenDeck: noop, onImport: noop, fontFamily: "Inter" }));
    const out = text(createElement(FoundryHome, { savedDecks: [], onOpenDeck: noop, onImport: noop, fontFamily: "Inter" }));
    expect(out).toContain("THE FOUNDRY");
    expect(out).toContain("The bench");
    expect(out).toContain("0 decks");                       // the count lives IN the bench header now
    expect(out).toContain("KARN");
    expect(out).toContain("Tibalt");                        // the roast is a standing offer
    expect(out).toContain("The bench is empty");            // honest empty state
    expect(out).not.toContain("Start something");           // the tile row is CUT (Colton)
    // ONE make-a-deck button — the green one (btn-primary), no duplicates:
    expect(raw.match(/Start a new deck/g)).toHaveLength(1);
    expect(raw).toMatch(/btn-primary[^>]*>＋ Start a new deck|＋ Start a new deck/);
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

// AgentsHome was CUT (Colton, 2026-07-19): the area is OMNATH'S CHAT ZONE now —
// the registry gate below pins the rename + chat default instead.
describe("the area registry — Omnath's zone", () => {
  it("the agents slot reads Omnath, opens straight into chat, and keeps its internal id", async () => {
    const { AREAS } = await import("./areas.jsx");
    const omnath = AREAS.find((a) => a.id === "agents");
    expect(omnath.title).toBe("Omnath");
    expect(omnath.defaultView).toBe("chat");        // no front-door page — the room IS the chat
    const { AGENTS } = await import("../../lib/agents.js");
    expect(AGENTS.omnath.name).toBe("Omnath");
    expect(AGENTS.omnath.title).toBe("Hearth & Roil");
    expect(AGENTS.omnath.prompt).toMatch(/HEARTH/);  // both registers chartered
    expect(AGENTS.omnath.prompt).toMatch(/ROIL/);
    expect(AGENTS.omnath.prompt).toMatch(/[Nn]ever invent card text/);
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
