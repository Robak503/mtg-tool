/**
 * /api/mulligan-lab — the opening-hand trainer (wave P8).
 *
 * POST { deckId, seed? } → deal a seeded 7-card opening hand from the deck's
 * mainboard (land-ness from the local oracle index) and return the hand + the
 * engine's own keep/ship verdict (the same land-count logic decideMulliganForAI
 * uses at mull 0: keep on 2–5 lands, ship otherwise). The client compares the
 * user's call to the engine's. Fully local; degrades to lands-unknown if the
 * oracle index isn't synced.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { profilePath } from "../../../lib/server/paths.js";
import { lookupCard } from "../../../lib/server/cardIndex.js";

// mulberry32 — the same deterministic PRNG family the engine's seeded shuffle
// uses, inlined so a hand is reproducible from its seed.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isLandName(name) {
  try {
    const card = lookupCard(name);
    if (!card) return null; // unknown — index not synced / odd name
    return /\bLand\b/i.test(card.type_line || card.card_faces?.[0]?.type_line || "");
  } catch {
    return null;
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const deckId = typeof body?.deckId === "string" ? body.deckId : null;
  if (!deckId) return Response.json({ error: "deckId is required." }, { status: 400 });
  const seed = Number.isFinite(body?.seed) ? (body.seed >>> 0) : ((Date.parse(new Date().toISOString()) & 0xffffffff) >>> 0);

  let decks;
  try {
    const parsed = JSON.parse(await fs.readFile(profilePath("decks.local.json"), "utf8"));
    decks = Array.isArray(parsed) ? parsed : (parsed.decks || []);
  } catch {
    return Response.json({ error: "No decks saved for this profile." }, { status: 404 });
  }
  const deck = decks.find((d) => (d.id || d.name) === deckId);
  if (!deck) return Response.json({ error: "Deck not found." }, { status: 404 });

  // Expand the mainboard to a library (skip Tokens / Sideboard).
  const library = [];
  for (const c of deck.cards || []) {
    if (c.section === "Tokens" || c.section === "Sideboard") continue;
    for (let i = 0; i < (c.qty || 0); i++) library.push(c.name);
  }
  if (library.length < 7) return Response.json({ error: "Deck has fewer than 7 mainboard cards." }, { status: 400 });

  // Seeded Fisher–Yates, then take the top 7.
  const rng = mulberry32(seed);
  for (let i = library.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [library[i], library[j]] = [library[j], library[i]];
  }
  const hand = library.slice(0, 7).map((name) => ({ name, isLand: isLandName(name) }));
  const knownLands = hand.filter((c) => c.isLand === true).length;
  const landsUnknown = hand.some((c) => c.isLand === null);

  // The engine's mull-0 heuristic (mirrors decideMulliganForAI: keep on 2–5).
  const engineVerdict = knownLands >= 2 && knownLands <= 5 ? "keep" : "ship";

  return Response.json({ deckName: deck.name, seed, hand, lands: knownLands, landsUnknown, engineVerdict });
}
