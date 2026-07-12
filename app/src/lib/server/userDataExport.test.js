/**
 * Tests for userDataExport.js (K1) — the pure backup-bundle assembler.
 */

import { describe, expect, it } from "vitest";

import { buildUserDataBundle, summarizeUserData } from "./userDataExport.js";

const SECTIONS = {
  decks: { version: 1, decks: [{ id: "d1" }, { id: "d2" }] },
  chats: { version: 2, sessions: [{ id: "s1" }] },
  collection: { version: 1, cards: [{ name: "Sol Ring" }, { name: "Mana Crypt" }, { name: "Arcane Signet" }] },
  watchlist: { cards: [{ scryfallId: "x" }] },
  priceAlerts: { alerts: [{ scryfallId: "x", target: 5 }, { scryfallId: "y", target: 9 }] },
  agentNotes: { foo: "bar" },
  colorTags: [{ id: "t1" }, { id: "t2" }, { id: "t3" }], // C5-P1.1 — a bare array of tag defs
  feedback: [{ id: "f1" }, { id: "f2" }],
  games: [{ id: "g1" }],
};

describe("summarizeUserData", () => {
  it("counts each section defensively (object-with-array or bare array)", () => {
    expect(summarizeUserData(SECTIONS)).toEqual({
      decks: 2,
      chatSessions: 1,
      collectionCards: 3,
      grails: 1,
      priceAlerts: 2,
      colorTags: 3,
      feedback: 2,
      games: 1,
    });
  });

  it("returns zeros for empty input", () => {
    expect(summarizeUserData({})).toEqual({
      decks: 0, chatSessions: 0, collectionCards: 0, grails: 0, priceAlerts: 0, colorTags: 0, feedback: 0, games: 0,
    });
  });
});

describe("buildUserDataBundle", () => {
  it("wraps all sections with metadata + summary", () => {
    const bundle = buildUserDataBundle(SECTIONS, "2026-05-31T00:00:00.000Z");
    expect(bundle.kind).toBe("mtg-tool-backup");
    expect(bundle.version).toBe(1);
    expect(bundle.exportedAt).toBe("2026-05-31T00:00:00.000Z");
    expect(bundle.summary.decks).toBe(2);
    expect(bundle.sections.collection.cards).toHaveLength(3);
    expect(bundle.sections.feedback).toHaveLength(2);
    // C5-P1.1: the color-tag defs ride the bundle so a restore brings back the rows' referenced tags.
    expect(bundle.sections.colorTags).toHaveLength(3);
    expect(bundle.summary.colorTags).toBe(3);
  });

  it("normalizes missing sections to null / empty arrays", () => {
    const bundle = buildUserDataBundle({});
    expect(bundle.sections.decks).toBeNull();
    expect(bundle.sections.collection).toBeNull();
    expect(bundle.sections.colorTags).toBeNull(); // C5-P1.1 — absent when the profile never saved tags
    expect(bundle.sections.feedback).toEqual([]);
    expect(bundle.sections.games).toEqual([]);
  });

  it("never includes anything beyond the known user-content sections", () => {
    const bundle = buildUserDataBundle({ ...SECTIONS, secretApiKey: "sk-ant-leak" });
    expect(bundle.sections.secretApiKey).toBeUndefined();
    expect(JSON.stringify(bundle)).not.toContain("sk-ant-leak");
  });
});
