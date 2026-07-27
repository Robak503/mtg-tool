/**
 * Card-name detection tests.
 *
 * Regression guard for the grounding bug where a chat about a comma-named
 * commander ("Omnath, Locus of Mana", "Atraxa, Praetors' Voice") attached NO
 * Oracle text, because the old tokenizer split on commas and the rejoined
 * span ("Omnath , Locus of Mana") never matched the catalog key. With no card
 * data in the prompt, the local model fabricated card text. Nearly every
 * legendary commander has a comma, so this hit the single most common case.
 *
 * detectCardNamesFromCatalog is the free-text detector that feeds
 * buildCardContext; these tests pin its behavior on the cases that mattered.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildCardContextForNames,
  buildCatalogMaps,
  detectCardNamesFromCatalog,
  normalizeCardKey,
} from "./scryfall";

const CARDS = [
  "Omnath, Locus of Mana",
  "Atraxa, Praetors' Voice",
  "Krenko, Mob Boss",
  "Sol Ring",
  "Forest",
  "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge",
];

const { exact, normalized } = buildCatalogMaps(CARDS);
const detect = text => detectCardNamesFromCatalog(text, exact, normalized);

describe("normalizeCardKey", () => {
  it("lowercases and collapses punctuation to single spaces", () => {
    expect(normalizeCardKey("Omnath, Locus of Mana")).toBe("omnath locus of mana");
    expect(normalizeCardKey("Atraxa, Praetors' Voice")).toBe("atraxa praetors voice");
    expect(normalizeCardKey("  Sol   Ring!  ")).toBe("sol ring");
  });
});

describe("detectCardNamesFromCatalog", () => {
  it("detects a comma name typed plainly (the original bug)", () => {
    expect(detect("Omnath, Locus of Mana")).toEqual(["Omnath, Locus of Mana"]);
  });

  it("detects a comma name embedded in a sentence", () => {
    expect(detect("how does Omnath, Locus of Mana work with my mana pool")).toEqual([
      "Omnath, Locus of Mana",
    ]);
  });

  it("detects an apostrophe name from prose", () => {
    expect(detect("is Atraxa, Praetors' Voice any good?")).toEqual(["Atraxa, Praetors' Voice"]);
  });

  it("still detects a plain comma-free name", () => {
    expect(detect("tell me about Sol Ring")).toEqual(["Sol Ring"]);
  });

  it("detects a DFC/split card by its front face", () => {
    expect(detect("I cast Tovolar, Dire Overlord on turn three")).toEqual([
      "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge",
    ]);
  });

  it("detects multiple cards in one message", () => {
    expect(detect("does Krenko, Mob Boss work with Sol Ring").sort()).toEqual(
      ["Krenko, Mob Boss", "Sol Ring"].sort(),
    );
  });

  it("does not match ordinary prose", () => {
    expect(detect("what is the best removal spell for this deck")).toEqual([]);
  });

  it("does not guess on an ambiguous bare first name (documented limitation)", () => {
    // "omnath" alone maps to 5+ real cards; we intentionally do not guess —
    // the user should bracket [[Omnath, Locus of Mana]] or type the full name.
    expect(detect("pull the oracle text for omnath")).toEqual([]);
  });

  it("returns nothing when the catalog is empty", () => {
    expect(detectCardNamesFromCatalog("Sol Ring", new Map(), new Map())).toEqual([]);
  });
});

/**
 * Context-budget regression guard (2026-07-24, Wave 3 "Karn's eyes" — CINDY-ROADMAP-v2).
 *
 * Measured live against a real 100-card deck: 2 rulings/card (the old bulk-attachment default)
 * cost ~26.5k chars vs ~19.5k for oracle+mana+type alone — nearly doubling the block for
 * marginal value. useChatSessions.js's deck-oracle attachment now always passes
 * includeRulings:false; these tests pin that the option actually suppresses both the rulings
 * text AND the underlying fetch (a live per-card Scryfall-rulings-fallback call fires for any
 * card with no local rulings when includeRulings is true — a real external-call-volume risk on
 * a 100-card deck this test also guards against by asserting fetch is called exactly once).
 */
describe("buildCardContextForNames — rulings budget", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubCardsFetch({ withRulings }) {
    const fetchMock = vi.fn(async (url, init) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      const rulings = withRulings && body.includeRulings
        ? [{ published_at: "2023-01-01", comment: "A real WOTC clarification about this card." }]
        : [];
      return {
        ok: true,
        json: async () => ({
          cards: {
            "Sol Ring": {
              id: "sol-ring-id",
              name: "Sol Ring",
              mana: "{1}",
              type: "Artifact",
              oracle: "{T}: Add {C}{C}.",
              keywords: [],
              power: null,
              toughness: null,
              loyalty: null,
              source: "local",
              rulingsSource: body.includeRulings ? "local" : "not_requested",
              rulings,
            },
          },
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("includeRulings:false omits WOTC rulings text and makes exactly one network call", async () => {
    const fetchMock = stubCardsFetch({ withRulings: true });
    const context = await buildCardContextForNames(["Sol Ring"], {
      allowLiveFallback: true,
      includeRulings: false,
    });
    expect(context).toContain("Add {C}{C}");
    expect(context).not.toContain("WOTC RULINGS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("includeRulings:true attaches local rulings text (control case — proves the flag isn't a no-op)", async () => {
    stubCardsFetch({ withRulings: true });
    const context = await buildCardContextForNames(["Sol Ring"], {
      allowLiveFallback: true,
      includeRulings: true,
    });
    expect(context).toContain("WOTC RULINGS");
    expect(context).toContain("A real WOTC clarification about this card.");
  });
});
