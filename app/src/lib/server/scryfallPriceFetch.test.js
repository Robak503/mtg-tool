/**
 * scryfallPriceFetch — batching + normalization over an injected poster
 * (no network). The real node:https poster is only used in production.
 */

import { describe, it, expect } from "vitest";
import { fetchScryfallPrices } from "./scryfallPriceFetch.js";

const noSleep = async () => {};

describe("fetchScryfallPrices", () => {
  it("batches >75 ids into 75-max calls and normalizes Scryfall price keys", async () => {
    const ids = Array.from({ length: 160 }, (_, i) => `id-${i}`);
    const calls = [];
    const post = async (body) => {
      calls.push(body.identifiers.length);
      return {
        data: body.identifiers.map(({ id }) => ({
          id,
          prices: { usd: "1.00", usd_foil: "2.00", usd_etched: null },
        })),
      };
    };
    const map = await fetchScryfallPrices(ids, { post, sleep: noSleep });
    expect(calls).toEqual([75, 75, 10]);
    expect(map.size).toBe(160);
    expect(map.get("id-0")).toEqual({ usd: "1.00", usdFoil: "2.00", usdEtched: null });
  });

  it("dedupes ids and drops cards with no price at all", async () => {
    const post = async (body) => ({
      data: body.identifiers.map(({ id }) => ({
        id,
        prices: id === "b"
          ? { usd: null, usd_foil: null, usd_etched: null }
          : { usd: "3.00" },
      })),
    });
    const map = await fetchScryfallPrices(["a", "a", "b"], { post, sleep: noSleep });
    expect(map.get("a")).toEqual({ usd: "3.00", usdFoil: null, usdEtched: null });
    expect(map.has("b")).toBe(false); // all-null → skipped
  });

  it("returns empty without calling the network for no ids", async () => {
    let called = false;
    const map = await fetchScryfallPrices([], { post: async () => { called = true; return { data: [] }; }, sleep: noSleep });
    expect(map.size).toBe(0);
    expect(called).toBe(false);
  });
});
