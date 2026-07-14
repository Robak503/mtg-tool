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

/** Prettify a bare filename into a display label (fallback when the module declares none). */
function prettyPilotName(file) {
  return file.replace(/\.mjs$/, "").replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * List the SELECTABLE Crucible pilot profiles: each persona module's { file, label, description,
 * pilotType }, read STATICALLY from the file text (a regex over `export const label = "…"`) — never
 * by importing/executing the module, so listing is cheap and can't run persona code or fail on a
 * missing transitive dep. Only modules that DECLARE a `label` are surfaced, so the raw persona-core
 * files (omnath.mjs / omnath-v4.mjs) stay out of the picker — the picker shows the intended
 * Generalist / Specialist / Mix profiles only. [] when the dir is absent.
 */
export async function listPilotProfiles() {
  const files = await listPilots();
  const profiles = [];
  for (const file of files) {
    let text;
    try {
      text = await fs.readFile(path.join(pilotsDir(), file), "utf8");
    } catch {
      continue; // unreadable → skip (never a broken picker entry)
    }
    const label = text.match(/export\s+const\s+label\s*=\s*["'`]([^"'`]+)["'`]/);
    if (!label) continue; // no declared label ⇒ not a Crucible-facing profile ⇒ hidden
    const description = text.match(/export\s+const\s+description\s*=\s*["'`]([^"'`]+)["'`]/);
    const pilotType = text.match(/export\s+const\s+pilotType\s*=\s*["'`]([^"'`]+)["'`]/);
    profiles.push({
      file,
      label: label[1] || prettyPilotName(file),
      description: description ? description[1] : null,
      pilotType: pilotType ? pilotType[1] : null,
    });
  }
  return profiles;
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

/**
 * Load a per-GAME pilot BUILDER — returns `(decks) => { [seat]: pilot }`, so the grind loop can hand the persona
 * the pod's decks each game (seat order) for DECK-NATIVE playbook matching (Omnath's flagged refinement: their
 * buildPilots v2 reads decks[i] to pick each seat's deck-appropriate playbook; v1 ignores it → a temperament
 * spread + default playbook, still varied). A bare-decide persona ignores decks (same pilot every seat). Returns
 * null for no selection (⇒ default autopilot). Path-guarded like buildPilotsForBatch.
 */
// CLI-side pilot path: a bare filename OR one subdirectory level under pilotsDir ("omnath-v4-staged/
// exe-persona.mjs" — the staged-pack layout swap-bench's --candidate advertises). Same character class per
// segment (no "..", no separators inside a segment), so the joined path can never escape pilotsDir(). The
// EXE panel's buildPilotsForBatch keeps the stricter bare-file rule (its list UI only surfaces flat files).
const SAFE_PILOT_PATH = /^[A-Za-z0-9._-]+(?:[/\\][A-Za-z0-9._-]+)?\.mjs$/;

export async function loadPilotBuilder(file, mode) {
  if (!file) return null;
  if (!SAFE_PILOT_PATH.test(file) || file.includes("..")) throw new Error(`invalid pilot filename: ${file}`);
  const seats = engineSeatsForMode(mode);
  const mod = await import(pathToFileURL(path.join(pilotsDir(), file)).href);
  if (typeof mod.buildPilots === "function") {
    // The per-game SEED rides the opts (additive contract, 2026-07-09): a persona that derives
    // its temperament assignment from it makes persona games REPLAY-REGENERABLE from the header
    // (seed+decks+persona) — the property the prune lifecycle requires. Personas may ignore it
    // (current omnath.mjs does — its games stay unprunable until it adopts the seed; the replay
    // canary gates pruning either way).
    // The 3rd-arg OPTIONS BAG (recall-arm plumb, 2026-07-10) spreads into buildPilots' opts — this is the
    // LAST hop of the --pilot-flags/--candidate-flags plumb (grindLoop/grind-worker/swap-bench all call
    // pilotBuilder(pod, seed, { flags })); dropping it here silently no-op'd every flag-gated arm for a
    // buildPilots persona (Omnath's recall-on bench). Additive: a persona that ignores opts is unchanged.
    const wrapped = (decks, seed = null, opts = {}) => mod.buildPilots(seats, { mode, decks, seed, ...opts }) || {};
    // PILOT-V STAMP PASSTHROUGH (Omnath's epoch-4 defect report, 2026-07-10): the grind header reads
    // `pilotV` off the BUILDER FUNCTION it holds — this wrapper — so a persona's `buildPilots.pilotV = N`
    // must be copied through or every pool header stamps pilotV:null and the era loses pilot attribution.
    if (mod.buildPilots.pilotV !== undefined) wrapped.pilotV = mod.buildPilots.pilotV;
    return wrapped;
  }
  if (typeof mod.decide === "function") {
    const p = {
      decide: mod.decide,
      decideMulligan: typeof mod.decideMulligan === "function" ? mod.decideMulligan : undefined,
      playbook: mod.playbook ?? null,
      temperament: mod.temperament ?? null,
    };
    return () => Object.fromEntries(seats.map((s) => [s, p]));
  }
  throw new Error(`pilot module ${file} exports neither buildPilots(seats,{mode}) nor a decide function`);
}

/**
 * Load a ROTATING pilot builder over ALL selectable persona profiles (Generalist/Specialist/Mix) — the
 * ∞ grind's "every persona" mode (Colton 2026-07-12). Each game picks one persona DETERMINISTICALLY by
 * its seed, so the grind's pods hold a spread of pilots for varied training data. Returns null when no
 * labelled personas are present (⇒ the grind falls back to the default autopilot). Reuses loadPilotBuilder
 * per profile, so per-game deck-native playbook selection + the flags plumb still apply.
 */
export async function loadRotatingPilotBuilder(mode) {
  const profiles = await listPilotProfiles();
  const builders = [];
  for (const p of profiles) {
    try {
      const b = await loadPilotBuilder(p.file, mode);
      if (b) builders.push(b);
    } catch { /* a broken persona never breaks the grind */ }
  }
  if (!builders.length) return null;
  const rotating = (decks, seed = 0, opts = {}) => builders[Math.abs(Number(seed) | 0) % builders.length](decks, seed, opts);
  rotating.pilotV = builders[0]?.pilotV; // header pilotV stamp — the profiles share the core's version
  return rotating;
}
