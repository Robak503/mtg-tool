/**
 * scryfallPriceFetch.js — re-pull LIVE prices from Scryfall for a set of
 * printings, to refresh cards whose stored TCGPlayer price is null.
 *
 * WHY  Scryfall's `prices.usd` is TCGPlayer's computed market price. Our
 *   bundled snapshot captures it at sync time; a card with no market price
 *   then (too few recent sales) may have one computed days later — even
 *   though copies were always listed for sale. This re-pulls the freshest
 *   Scryfall number so a "refresh prices" action can fill those gaps.
 *
 * LOCAL-FIRST  This is user-triggered (a button), bounded to the cards that
 *   actually need it, and the result is written to disk. It is NOT polled —
 *   the same posture as the Scryfall / EDHREC syncs.
 *
 * Uses Scryfall's batch collection endpoint (POST /cards/collection, max 75
 * identifiers per call) so N cards cost ceil(N/75) requests, throttled to
 * respect Scryfall's 50–100ms ask. The network poster is injectable so the
 * batching + normalization are unit-testable without touching the network.
 */

import https from "node:https";

const HOST = "api.scryfall.com";
const PATH = "/cards/collection";
const USER_AGENT = "MTG-Tool/price-refresh (https://github.com/Robak503/mtg-tool)";
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
export const SCRYFALL_BATCH = 75;
const THROTTLE_MS = 100;

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** POST a JSON body to Scryfall via node:https (avoids Next's fetch patching/caching). */
function postScryfall(body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body), "utf8");
    const req = https.request(
      { host: HOST, path: PATH, method: "POST", headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Content-Length": payload.length,
      } },
      (res) => {
        const status = res.statusCode || 0;
        const chunks = [];
        let bytes = 0;
        res.on("data", (c) => {
          bytes += c.length;
          if (bytes > MAX_RESPONSE_BYTES) { req.destroy(new Error("Scryfall response too large")); return; }
          chunks.push(c);
        });
        res.on("end", () => {
          if (status < 200 || status >= 300) {
            const err = new Error(`Scryfall returned HTTP ${status}`);
            err.status = status;
            return reject(err);
          }
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          } catch {
            reject(new Error("Scryfall returned invalid JSON"));
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("Scryfall request timed out")));
    req.end(payload);
  });
}

function normalizePrices(scryfallPrices) {
  if (!scryfallPrices) return null;
  const usd = scryfallPrices.usd ?? null;
  const usdFoil = scryfallPrices.usd_foil ?? null;
  const usdEtched = scryfallPrices.usd_etched ?? null;
  if (usd == null && usdFoil == null && usdEtched == null) return null;
  return { usd, usdFoil, usdEtched };
}

/**
 * Fetch live prices for the given scryfallIds.
 * @param {string[]} scryfallIds
 * @param {{ post?: (body) => Promise<object>, sleep?: (ms) => Promise<void>, throttleMs?: number }} [opts]
 *   `post` is injectable for tests (defaults to the real node:https poster).
 * @returns {Promise<Map<string, {usd,usdFoil,usdEtched}>>} only entries that
 *   resolved to at least one non-null price.
 */
export async function fetchScryfallPrices(scryfallIds, opts = {}) {
  const post = opts.post || postScryfall;
  const sleep = opts.sleep || defaultSleep;
  const throttleMs = opts.throttleMs ?? THROTTLE_MS;

  const ids = [...new Set((scryfallIds || []).filter(Boolean))];
  const out = new Map();
  for (let i = 0; i < ids.length; i += SCRYFALL_BATCH) {
    const batch = ids.slice(i, i + SCRYFALL_BATCH);
    const res = await post({ identifiers: batch.map(id => ({ id })) });
    for (const card of res?.data || []) {
      if (!card?.id) continue;
      const prices = normalizePrices(card.prices);
      if (prices) out.set(card.id, prices);
    }
    if (i + SCRYFALL_BATCH < ids.length) await sleep(throttleMs);
  }
  return out;
}
