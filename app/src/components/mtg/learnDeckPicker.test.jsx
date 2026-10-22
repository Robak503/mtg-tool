/**
 * learnDeckPicker.test.jsx — the Academy's deck pickers can pick every saved deck (2026-10-21).
 *
 * Each picker option was `<option key={d.id} value={d.id}>`. A deck saved without an id rendered as an
 * option with no value, so the browser used its TEXT (the deck name) as the value; the Start gate then
 * looked the deck up by id — `savedDecks.find((d) => d.id === userDeckId)` — found nothing, and Start
 * stayed disabled. The owner could not start a game with 6 of his 8 decks, as his deck or as an opponent.
 *
 * Two layers are pinned here:
 *   1. the library the app SERVES (GET /api/decks over a library of the owner's shape) gives every deck
 *      an option whose value is its id, and that value finds the deck — so Start can be enabled;
 *   2. the picker itself never values an option by a deck's name again: a deck without a usable id (or a
 *      repeat of an id already listed) is listed but disabled, and every option has a unique key.
 *
 * SSR via react-dom/server (the project bans jsdom/RTL — see SimCenter.test.jsx); the route runs in a
 * temp tree exactly like route.test.js.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import * as LV from "./LearnView.jsx";

const LearnView = LV.default;

function unescape(s) {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Every <select> in the markup → its options, each with the value a BROWSER would submit. */
function pickers(html) {
  const selects = [...html.matchAll(/<select[^>]*>([\s\S]*?)<\/select>/g)];
  return selects.map(([, inner]) =>
    [...inner.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/g)].map(([, attrs, text]) => {
      const valueAttr = attrs.match(/\svalue="([^"]*)"/);
      const label = unescape(text);
      return {
        label,
        hasValue: Boolean(valueAttr),
        // An option with no value attribute submits its text — the deck NAME (the bug).
        value: valueAttr ? unescape(valueAttr[1]) : label,
        disabled: /\sdisabled=""/.test(attrs),
      };
    }),
  );
}

function render(savedDecks) {
  return renderToStaticMarkup(createElement(LearnView, { savedDecks, fontFamily: "serif" }));
}

const cards = (commander) => [
  { name: commander, qty: 1, section: "Commander", oracleId: "o-cmd", resolved: true },
  { name: "Forest", qty: 40, section: "Mainboard", oracleId: "o-forest", resolved: true },
];
const withId = (id, name) => ({ id, name, format: "commander", cards: cards(`${name} Commander`), memory: { owner: "Colton" }, source: "archidekt:1" });
const noId = (name) => ({ name, format: "commander", source: "archidekt:2", cards: cards(`${name} Commander`), memory: { owner: "Colton", notes: "" } });
// The owner's shape (names invented): 2 decks with an id, 6 saved without one; one name with an apostrophe.
const OWNER_SHAPE = [
  withId("deck_mana_ramp_aaaa1111", "Mana Ramp"),
  noId("Treasure Aristocrats"),
  noId("cdh"),
  noId("Hive Mind"),
  noId("Zed's X Spells"),
  noId("Cantrip Storm"),
  noId("Turtle Attack"),
  withId("deck_squirrels_bbbb2222", "Squirrel Army"),
];

describe("the library the app serves → every deck can be picked", () => {
  let tmpDir;
  let originalCwd;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "learn-picker-test-"));
    await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    vi.resetModules();
  });
  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  async function servedLibrary() {
    const route = await import("../../app/api/decks/route.js");
    await route.GET(); // migrate: the active profile exists
    const reg = JSON.parse(await fs.readFile(path.join(tmpDir, "data", "profiles.json"), "utf8"));
    const file = path.join(tmpDir, "data", "profiles", reg.activeProfileId, "decks.local.json");
    await fs.writeFile(file, JSON.stringify({ version: 1, decks: OWNER_SHAPE }, null, 2), "utf8");
    const resp = await route.GET();
    expect(resp.status).toBe(200);
    return (await resp.json()).decks;
  }

  it("each saved deck is one option in each picker, valued by its id, and that value finds the deck (the Start gate's lookup)", async () => {
    const decks = await servedLibrary();
    const selects = pickers(render(decks));
    expect(selects).toHaveLength(2); // standard mode: your deck + one opponent
    for (const options of selects) {
      expect(options[0]).toMatchObject({ label: "(pick a saved deck)", value: "" });
      const deckOptions = options.slice(1);
      expect(deckOptions.map((o) => o.label)).toEqual(OWNER_SHAPE.map((d) => d.name));
      for (const [i, o] of deckOptions.entries()) {
        expect(o.hasValue, `"${o.label}" carries a value`).toBe(true);
        expect(o.disabled, `"${o.label}" is pickable`).toBe(false);
        expect(o.value).toBe(String(decks[i].id));
        // The Start gate looks the picked value up by id (LearnView: savedDecks.find(d => d.id === value)).
        expect(decks.find((d) => d.id === o.value)?.name).toBe(o.label);
      }
      expect(new Set(deckOptions.map((o) => o.value)).size).toBe(OWNER_SHAPE.length);
    }
  });

  it("Start can be enabled for every pairing of the served decks, as your deck and as an opponent", async () => {
    const decks = await servedLibrary();
    expect(typeof LV.learnStartPicks, "LearnView exports the Start gate's pick logic").toBe("function");
    const [yours, theirs] = pickers(render(decks)).map((options) => options.slice(1));
    for (const mine of yours) {
      for (const opp of theirs) {
        const picks = LV.learnStartPicks({ savedDecks: decks, userDeckId: mine.value, oppIds: [opp.value], oppCount: 1 });
        expect(picks.ready, `${mine.label} vs ${opp.label}`).toBe(true);
        expect(picks.userDeck.name).toBe(mine.label);
        expect(picks.oppDecks.map((d) => d.name)).toEqual([opp.label]);
      }
    }
  });
});

describe("the picker never values an option by a deck's name", () => {
  it("a deck without an id is listed but disabled — never an enabled option without a value", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = render(OWNER_SHAPE); // as if the library had not been given ids
    for (const options of pickers(html)) {
      const deckOptions = options.slice(1);
      expect(deckOptions).toHaveLength(OWNER_SHAPE.length); // every deck is still listed
      for (const o of deckOptions) {
        if (!o.disabled) {
          expect(o.hasValue, `enabled "${o.label}" carries a value`).toBe(true);
          expect(OWNER_SHAPE.some((d) => d.name === o.value && d.id !== o.value), `"${o.label}" is not valued by a deck name`).toBe(false);
        }
      }
      const enabled = deckOptions.filter((o) => !o.disabled).map((o) => o.value);
      expect(enabled).toEqual(["deck_mana_ramp_aaaa1111", "deck_squirrels_bbbb2222"]);
      const disabled = deckOptions.filter((o) => o.disabled);
      expect(disabled).toHaveLength(6);
      for (const o of disabled) expect(o.label).toMatch(/can't be picked/);
    }
    // React's missing / duplicate key warning never fires for the deck options.
    expect(errors.mock.calls.some((c) => /key/i.test(String(c[0])))).toBe(false);
    errors.mockRestore();
  });

  it("a repeated id is listed once as pickable; the repeat is disabled (no duplicate keys, no silent wrong pick)", () => {
    const decks = [withId("dup-1", "First Copy"), withId("dup-1", "Second Copy"), withId("solo-2", "Solo")];
    const [yours] = pickers(render(decks)).map((options) => options.slice(1));
    expect(yours.map((o) => [o.label.split(" (")[0], o.disabled])).toEqual([
      ["First Copy", false],
      ["Second Copy", true],
      ["Solo", false],
    ]);
  });

  it("decks that all have ids render exactly as before: value = id, label = name (control)", () => {
    const decks = [withId("a-1", "Alpha"), withId("b-2", "Beta")];
    for (const options of pickers(render(decks))) {
      expect(options.slice(1)).toEqual([
        { label: "Alpha", hasValue: true, value: "a-1", disabled: false },
        { label: "Beta", hasValue: true, value: "b-2", disabled: false },
      ]);
    }
  });
});

describe("learnStartPicks — the Start gate", () => {
  const decks = [withId("a-1", "Alpha"), noId("Nameless"), withId(7, "Numbered"), withId("dup", "Dup One"), withId("dup", "Dup Two")];

  const learnStartPicks = (args) => {
    expect(typeof LV.learnStartPicks, "LearnView exports the Start gate's pick logic").toBe("function");
    return LV.learnStartPicks(args);
  };

  it("a picked id finds its deck; a deck's NAME never does; nothing picked is not ready", () => {
    const pick = (userDeckId, oppIds, oppCount = 1) => learnStartPicks({ savedDecks: decks, userDeckId, oppIds, oppCount });
    expect(pick("a-1", ["7"]).ready).toBe(true); // a numeric id is matched by its string form (option values are strings)
    expect(pick("a-1", ["7"]).oppDecks[0].name).toBe("Numbered");
    expect(pick("Nameless", ["a-1"]).ready).toBe(false);
    expect(pick("Alpha", ["a-1"]).ready).toBe(false);
    expect(pick("", ["a-1"]).ready).toBe(false);
    expect(pick("a-1", [""]).ready).toBe(false);
    expect(pick("dup", ["a-1"]).userDeck.name).toBe("Dup One"); // the listed (first) one
  });

  it("commander mode needs all three opponents picked", () => {
    const pick = (oppIds) => learnStartPicks({ savedDecks: decks, userDeckId: "a-1", oppIds, oppCount: 3 });
    expect(pick(["7", "dup", ""]).ready).toBe(false);
    expect(pick(["7", "dup", "a-1"]).ready).toBe(true);
  });
});
