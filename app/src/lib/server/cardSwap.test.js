/**
 * cardSwap.test.js — the A/B bench swap engine (Crucible dream feature, 2026-07-14).
 *
 * buildSwappedDeck produces a legal variant of a runner deck: the added card must be Commander-legal
 * (banlist), inside the deck's colors, and not already run; the swap is POSITIONAL (same slot → same
 * shuffle prefix under one seed). CREED: a banned or off-color card can never enter the bench.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// Raw oracle-index cards use Scryfall field names (type_line / mana_cost / oracle_text) — publicCard
// maps those into the enriched runner shape (type / mana / oracle).
const ORACLE_FIXTURE = {
  cards: [
    { name: "Sol Ring", type_line: "Artifact", mana_cost: "{1}", oracle_text: "{T}: Add {C}{C}.", cmc: 1, color_identity: [], legalities: { commander: "legal" } },
    { name: "Mana Crypt", type_line: "Artifact", mana_cost: "{0}", oracle_text: "{T}: Add {C}{C}.", cmc: 0, color_identity: [], legalities: { commander: "banned" } },
    { name: "Counterspell", type_line: "Instant", mana_cost: "{U}{U}", oracle_text: "Counter target spell.", cmc: 2, color_identity: ["U"], legalities: { commander: "legal" } },
    { name: "Llanowar Elves", type_line: "Creature — Elf Druid", mana_cost: "{G}", oracle_text: "{T}: Add {G}.", cmc: 1, color_identity: ["G"], legalities: { commander: "legal" } },
    { name: "Grizzly Bears", type_line: "Creature — Bear", mana_cost: "{1}{G}", oracle_text: "", cmc: 2, color_identity: ["G"], legalities: { commander: "legal" } },
    { name: "General Green", type_line: "Legendary Creature — Elf", mana_cost: "{2}{G}{G}", oracle_text: "", cmc: 4, color_identity: ["G"], legalities: { commander: "legal" } },
    { name: "Forest", type_line: "Basic Land — Forest", oracle_text: "", color_identity: [], legalities: { commander: "legal" } },
  ],
};

const deck = () => ({
  id: "d1",
  name: "Green Deck",
  commanders: [{ name: "General Green" }],
  cards: [{ name: "Forest" }, { name: "Grizzly Bears" }, { name: "Llanowar Elves" }],
});

let tmpDir, originalCwd;
async function loadSwap() { vi.resetModules(); return import("./cardSwap.js"); }

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cardswap-test-"));
  await fs.mkdir(path.join(tmpDir, "data", "scryfall-bulk"), { recursive: true });
  await fs.writeFile(path.join(tmpDir, "data", "scryfall-bulk", "oracle-index.json"), JSON.stringify(ORACLE_FIXTURE), "utf8");
  originalCwd = process.cwd();
  process.chdir(tmpDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("buildSwappedDeck", () => {
  it("a legal, in-color swap succeeds and is POSITIONAL (new card in the removed card's exact slot)", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Grizzly Bears", add: "Sol Ring" });
    expect(res.ok).toBe(true);
    expect(res.removed).toBe("Grizzly Bears");
    expect(res.added).toBe("Sol Ring");
    // Grizzly Bears was index 1 → Sol Ring takes index 1; the other cards are untouched.
    expect(res.deck.cards.map((c) => c.name)).toEqual(["Forest", "Sol Ring", "Llanowar Elves"]);
    // …and it's enriched (real engine shape, not a blank card).
    expect(res.deck.cards[1].type).toBe("Artifact");
  });

  it("BANLIST: a banned card (Mana Crypt) is blocked", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Grizzly Bears", add: "Mana Crypt" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("banned");
  });

  it("COLOR IDENTITY: an off-color card (blue into a green deck) is blocked", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Grizzly Bears", add: "Counterspell" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("color-identity");
  });

  it("SINGLETON: a card already in the deck is blocked", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Grizzly Bears", add: "Llanowar Elves" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("duplicate");
  });

  it("the removed card must actually be in the deck", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Island", add: "Sol Ring" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("not-in-deck");
  });

  it("an unknown add card is blocked", async () => {
    const { buildSwappedDeck } = await loadSwap();
    const res = buildSwappedDeck(deck(), { remove: "Grizzly Bears", add: "Notarealcardxyz" });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("unknown");
  });
});
