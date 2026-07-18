/**
 * /api/golden-hands — the Academy "Mulligan Reps" panel's server half.
 *
 * Deals guardrailed opening hands from the ACTIVE profile's decks and appends Colton's keep/ship
 * judgments to an append-only per-host jsonl in the writable data dir. Those rows are the teacher
 * signal for the future pilot mulligan agent; Omnath's `omnath-golden-hands-ingest` scheduled task
 * reads this file READ-ONLY and merges it into the vault golden-hands corpus.
 *
 * Build order: memory/orders/academy-mulligan-panel-runbook.md (frozen 2026-07-17).
 *
 * THE SEAM: the exe NEVER touches git or the vault. It writes local rows and — on Submit — rings
 * the bell by running Omnath's scheduled task. Fully local, zero external calls, works offline.
 *
 * Actions (POST):
 *   { action: "decks" }                  -> { decks:[{id,name,size}], allTime }
 *   { action: "deal", deckId? }          -> { dealId, deck, seed, lands, cards:[{name,mana_cost,type_line,oracle_text}], redeals }
 *   { action: "judge", judgment }        -> { ok, allTime }   (server stamps id/ts/host/profileName)
 *   { action: "sync" }                   -> { ok, synced, message }
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

import { dataPath, profilePath } from "../../../lib/server/paths.js";
import { listProfiles } from "../../../lib/server/profiles.js";
import { lookupCard } from "../../../lib/server/cardIndex.js";

/** Omnath's ingest+sync task (FROZEN name — the runbook's contract; his P2 registers it). */
const INGEST_TASK = "omnath-golden-hands-ingest";

/** CR-free dealer guardrail (Colton 2026-07-17): only 2–5 land hands are worth a rep. */
const MIN_LANDS = 2;
const MAX_LANDS = 5;
/** A deck that can never satisfy the band (0-land / all-land) must not spin the server. */
const MAX_REDEALS = 60;

/** mulberry32 — the engine's PRNG family, so a hand is reproducible from its seed. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hostname, filename-safe — per-host files keep two writers append-only and merge-free. */
function hostSlug() {
  return (os.hostname() || "unknown").replace(/[^A-Za-z0-9_-]/g, "-");
}

/** Local ISO timestamp WITH offset (the corpus exemplars carry offsets, not Z). */
function localIsoNow() {
  const d = new Date();
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

function judgmentsFile() {
  return dataPath("golden-hands", `judgments-${hostSlug()}.jsonl`);
}

/** Rows written so far (all-time counter). Missing file = 0, never an error. */
async function countRows() {
  try {
    const raw = await fs.readFile(judgmentsFile(), "utf8");
    return raw.split("\n").filter((l) => l.trim()).length;
  } catch {
    return 0;
  }
}

async function readDecks() {
  const parsed = JSON.parse(await fs.readFile(profilePath("decks.local.json"), "utf8"));
  const decks = Array.isArray(parsed) ? parsed : (parsed.decks || []);
  return decks.filter((d) => Array.isArray(d?.cards) && d.cards.length > 0);
}

/** Mainboard expanded to a library of names (Tokens/Sideboard excluded). */
function libraryOf(deck) {
  const library = [];
  for (const c of deck.cards || []) {
    if (c.section === "Tokens" || c.section === "Sideboard") continue;
    for (let i = 0; i < (c.qty || 0); i++) library.push(c.name);
  }
  return library;
}

function isLand(card) {
  const tl = card?.type_line || card?.card_faces?.[0]?.type_line || "";
  return /\bLand\b/i.test(tl);
}

/** Deal one seeded 7 from a library; returns the resolved card records. */
function dealSeven(library, seed) {
  const pool = [...library];
  const rng = mulberry32(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 7).map((name) => {
    let card;
    try { card = lookupCard(name); } catch { card = null; }
    return {
      name,
      mana_cost: card?.mana_cost ?? card?.card_faces?.[0]?.mana_cost ?? "",
      type_line: card?.type_line ?? card?.card_faces?.[0]?.type_line ?? "",
      oracle_text: card?.oracle_text ?? card?.card_faces?.[0]?.oracle_text ?? "",
      isLand: card ? isLand(card) : false,
      known: Boolean(card),
    };
  });
}

let dealCounter = 0;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const action = body?.action;

  // ── decks: the picker's options + the all-time counter ────────────────────────────────
  if (action === "decks") {
    let decks;
    try {
      decks = await readDecks();
    } catch {
      return Response.json({ decks: [], allTime: await countRows() });
    }
    return Response.json({
      decks: decks.map((d) => ({ id: d.id || d.name, name: d.name, size: libraryOf(d).length })),
      allTime: await countRows(),
    });
  }

  // ── deal: a guardrailed random hand (silent redeals outside 2–5 lands) ────────────────
  if (action === "deal") {
    let decks;
    try {
      decks = await readDecks();
    } catch {
      return Response.json({ error: "No decks saved for this profile." }, { status: 404 });
    }
    if (decks.length === 0) return Response.json({ error: "No decks saved for this profile." }, { status: 404 });

    const requested = typeof body?.deckId === "string" && body.deckId ? body.deckId : null;
    let deck = requested ? decks.find((d) => (d.id || d.name) === requested) : null;
    if (requested && !deck) return Response.json({ error: "Deck not found." }, { status: 404 });

    // Random default (the runbook's picker default) — a fresh deck each rep when unset.
    if (!deck) deck = decks[Math.floor(Math.random() * decks.length)];

    const library = libraryOf(deck);
    if (library.length < 7) return Response.json({ error: "Deck has fewer than 7 mainboard cards." }, { status: 400 });

    // Silent redeal until the hand lands in the 2–5 band. Capped so an unsatisfiable deck
    // (0-land / all-land) reports honestly instead of spinning — never a hidden failure.
    let seed = 0, cards = [], lands = 0, redeals = 0, satisfied = false;
    for (let attempt = 0; attempt <= MAX_REDEALS; attempt++) {
      seed = (Math.floor(Math.random() * 0xffffffff) >>> 0);
      cards = dealSeven(library, seed);
      lands = cards.filter((c) => c.isLand).length;
      if (lands >= MIN_LANDS && lands <= MAX_LANDS) { satisfied = true; redeals = attempt; break; }
      redeals = attempt + 1;
    }

    // CREED: if the oracle index can't resolve the hand, land-ness is UNKNOWN, not zero. Reporting a
    // confident `lands: 0` would write a fabricated number into a training corpus (and would make the
    // guardrail look like it failed when it simply had nothing to measure). Say so instead.
    const unknownCards = cards.filter((c) => !c.known).map((c) => c.name);
    const landsUnknown = unknownCards.length > 0;

    dealCounter += 1;
    return Response.json({
      dealId: `${Date.now()}-${dealCounter}`,
      deck: deck.name,
      seed: String(seed),
      lands: landsUnknown ? null : lands,
      landsUnknown,
      cards,
      redeals,
      // Honest surface: the band could not be met (unusual deck), so the hand is out of band.
      guardrailExhausted: !satisfied && !landsUnknown,
      unknownCards,
    });
  }

  // ── judge: append one row (server stamps the authoritative identity fields) ────────────
  if (action === "judge") {
    const j = body?.judgment;
    const verdict = j?.colton;
    if (!["keep", "ship", "unplayable"].includes(verdict)) {
      return Response.json({ error: 'judgment.colton must be "keep", "ship" or "unplayable".' }, { status: 400 });
    }
    if (!Array.isArray(j?.cards) || j.cards.length === 0) {
      return Response.json({ error: "judgment.cards (the dealt names) is required." }, { status: 400 });
    }

    let profileName;
    try {
      const reg = listProfiles();
      profileName = reg.profiles.find((p) => p.id === reg.activeProfileId)?.name ?? null;
    } catch { profileName = null; }

    const host = hostSlug();
    const row = {
      id: `exe-${host}-${Date.now()}-${(dealCounter += 1)}`,
      ts: localIsoNow(),
      source: "exe",
      host,
      profileName,
      deck: typeof j.deck === "string" ? j.deck : null,
      seed: j.seed != null ? String(j.seed) : null,
      lands: Number.isFinite(j.lands) ? j.lands : null, // null when the index couldn't resolve the hand — never a fabricated 0
      cards: j.cards.map((c) => (typeof c === "string" ? c : c?.name)).filter(Boolean), // names only
      mullNumber: 0,          // v1 is always the first 7; field pinned so the mull-depth pass won't churn the schema
      colton: verdict,
      tags: [],               // v1: INGEST-DERIVED, never a UI control
      note: typeof j.note === "string" ? j.note : "",
      pilotLabel: null,       // the mulligan agent backfills at ingest; a guessed label would poison agreement stats
      agree: null,
    };

    const file = judgmentsFile();
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
    } catch (error) {
      return Response.json({ error: `Could not save judgment: ${error.message}` }, { status: 500 });
    }
    return Response.json({ ok: true, id: row.id, allTime: await countRows() });
  }

  // ── sync: ring Omnath's bell (his task does the git work; the exe never touches git) ───
  if (action === "sync") {
    const allTime = await countRows();
    const result = await new Promise((resolve) => {
      execFile("schtasks", ["/run", "/tn", INGEST_TASK], { timeout: 15000 }, (error, stdout, stderr) => {
        if (!error) return resolve({ synced: true, message: `Synced ✓ — ${allTime} judgment${allTime === 1 ? "" : "s"} handed to the ingest task.` });
        const text = `${stderr || ""}${stdout || ""}`.trim();
        // The task isn't registered until Omnath's P2 lands — degrade gracefully, never pretend.
        const missing = /cannot find|does not exist|not found|ERROR: The system cannot find/i.test(text);
        resolve({
          synced: false,
          message: missing
            ? `Sync task not installed yet — ${allTime} judgment${allTime === 1 ? "" : "s"} saved locally, will push once it's registered.`
            : `Saved locally (${allTime}) — sync task did not run: ${text.split("\n")[0] || error.message}`,
        });
      });
    });
    return Response.json({ ok: true, allTime, ...result });
  }

  return Response.json({ error: `Unknown action: ${String(action)}` }, { status: 400 });
}
