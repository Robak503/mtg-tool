/**
 * pilotLoader.js — server-side loading of Omnath's persona pilot modules for the in-EXE Sim Center (the
 * pilot-seam PANEL half; the CLI half is app/scripts/self-play.mjs --pilot). Personas are .mjs files dropped
 * into the writable pilotsDir() (%APPDATA%/com.colton.mtg-tool/pilots/) — so Omnath can author + iterate WITHOUT
 * a rebuild. The /api/pilots route lists them; /api/self-play dynamic-imports the SELECTED one server-side and
 * builds the seat→pilot map (closures can't cross JSON, so the map MUST be built here, not in the browser).
 *
 * CONTRACT (same as scripts/pilots/example-pilot.mjs): a module exports EITHER buildPilots(seats,{mode}) →
 * { [seat]:{decide,playbook,temperament} }, OR a bare decide (+ optional decideMulligan/playbook/temperament)
 * applied to every seat. A persona's decide({state,legalActions,seat,pilot}) MUST reason over the PASSED state
 * only — a module here CANNOT import app internals (the AppData path won't resolve them), so personas are
 * self-contained (out-of-set / undefined return defers to the default autopilot; never an illegal move).
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";

import { pilotsDir } from "./paths.js";
import { engineSeatsForMode } from "../learn/selfPlayRunner.js";

// A bare .mjs filename only — no path separators, no "..", so a selected name can never escape pilotsDir().
const SAFE_PILOT_FILE = /^[A-Za-z0-9._-]+\.mjs$/;

/** List the available persona filenames in pilotsDir() (sorted). [] if the dir is absent — never throws. */
export async function listPilots() {
  try {
    const files = await fs.readdir(pilotsDir());
    return files.filter((f) => SAFE_PILOT_FILE.test(f)).sort();
  } catch {
    return [];
  }
}

/**
 * Build the seat→pilot map for a batch by dynamic-importing the selected persona file from pilotsDir(). Returns
 * {} for a null/empty selection (⇒ default autopilot). Throws on an invalid filename or a module that exports
 * neither shape (the route surfaces the message). Path-guarded to a bare .mjs filename.
 */
export async function buildPilotsForBatch(file, mode) {
  if (!file) return {};
  if (!SAFE_PILOT_FILE.test(file)) throw new Error(`invalid pilot filename: ${file}`);
  const seats = engineSeatsForMode(mode);
  const abs = path.join(pilotsDir(), file);
  const mod = await import(pathToFileURL(abs).href);
  if (typeof mod.buildPilots === "function") {
    return mod.buildPilots(seats, { mode }) || {};
  }
  if (typeof mod.decide === "function") {
    const p = {
      decide: mod.decide,
      decideMulligan: typeof mod.decideMulligan === "function" ? mod.decideMulligan : undefined,
      playbook: mod.playbook ?? null,
      temperament: mod.temperament ?? null,
    };
    return Object.fromEntries(seats.map((s) => [s, p]));
  }
  throw new Error(`pilot module ${file} exports neither buildPilots(seats,{mode}) nor a decide function`);
}
