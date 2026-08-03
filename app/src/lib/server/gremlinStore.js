/**
 * gremlinStore.js — durable per-profile state for Tibalt's gremlin mode (NEXT-QUEUE A1).
 *
 * One file per profile at profilePath("gremlin.json"), the colorTagStore pattern: the enabled
 * flag, the policy blob tibaltGremlin.js mutates (that module is pure and never does I/O — this
 * is its caller-side persistence), and the fire log. The log is the tuning surface Omnath's
 * REACTION LOG consumes ({ trigger, deck, findingKey, jab, reaction }); we only emit it.
 *
 * Default is DISABLED — the gremlin is opt-in per profile, and a guest profile never gets an
 * uninvited jab (COMMS [O2], the profile gate).
 */

import fs from "node:fs/promises";

import { profilePath } from "./paths.js";
import { emptyGremlinState } from "../tibaltGremlin.js";

const MAX_LOG = 200;

// The desktop app spawns one Node server per launch, so the server process lifetime IS the app
// session. Persisting firedThisSession raw would make the one-per-session cap a one-per-EVER cap;
// the boot marker resets it whenever the record was written by a previous launch.
const BOOT_MARKER = Date.now();

function file() {
  return profilePath("gremlin.json");
}

function cleanState(input) {
  const base = emptyGremlinState();
  if (!input || typeof input !== "object") return base;
  return {
    firedThisSession: Number(input.firedThisSession) || 0,
    lastFireAt: Number(input.lastFireAt) || 0,
    recentFires: Array.isArray(input.recentFires) ? input.recentFires.filter((t) => Number.isFinite(t)) : [],
    suppressed: (input.suppressed && typeof input.suppressed === "object") ? input.suppressed : {},
    consecutiveIgnores: Number(input.consecutiveIgnores) || 0,
  };
}

/** The active profile's gremlin record; a fresh disabled record when nothing is saved yet. */
export async function readGremlin() {
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8"));
    const state = cleanState(parsed?.state);
    if (parsed?.sessionMarker !== BOOT_MARKER) state.firedThisSession = 0;
    return {
      enabled: parsed?.enabled === true,
      state,
      log: Array.isArray(parsed?.log) ? parsed.log.slice(-MAX_LOG) : [],
    };
  } catch {
    return { enabled: false, state: emptyGremlinState(), log: [] };
  }
}

/** Persist the whole record for the active profile (atomic tmp+rename). */
export async function writeGremlin(record) {
  const clean = {
    enabled: record?.enabled === true,
    state: cleanState(record?.state),
    log: Array.isArray(record?.log) ? record.log.slice(-MAX_LOG) : [],
    sessionMarker: BOOT_MARKER,
  };
  const f = file();
  const tmp = `${f}.tmp`;
  await fs.mkdir(profilePath(), { recursive: true }).catch(() => {});
  await fs.writeFile(tmp, JSON.stringify(clean));
  await fs.rename(tmp, f);
  return clean;
}
