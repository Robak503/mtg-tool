/**
 * example-pilot.mjs — REFERENCE pilot module for the self-play `--pilot=<path>` seam.
 *
 * A "pilot" replaces a seat's default autopilot with persona logic + a { playbook, temperament }
 * identity that the runner stamps onto every persisted decision row (selfPlayRunner.js recordDecision),
 * so self-play trajectory data is no longer persona-blind. THIS reference plays EXACTLY like the default
 * autopilot — it delegates to opponentAI.pickAction — but tags its rows, which proves the injection +
 * tagging end-to-end AND keeps the games byte-identical to a no-pilot run (a clean determinism check).
 * Swap the `decide` body for real persona logic; keep the tags.
 *
 * This is a TEMPLATE. Omnath's real personas live in the external `omnath-tools/pilots/…` modules
 * (not in this repo); point `--pilot=` at one of those. Any module that exports the shapes below works.
 *
 * ── CONTRACT (see selfPlayRunner.js buildPilotRouter / gameApi.js buildPilotRouter) ──────────────────
 *   A pilot object is { decide, decideMulligan?, playbook?, temperament? }.
 *   decide({ state, legalActions, seat, pilot }) -> action
 *     • MUST return one member of `legalActions` (identity ===), OR
 *     • return undefined / an out-of-set value / throw -> the runner SILENTLY falls back to the default
 *       autopilot pick (never an illegal move). A partial persona can `return` only where it has an
 *       opinion and defer everywhere else.
 *   decideMulligan({ state, legalActions:[{kind:"mulligan-keep"},{kind:"mulligan-ship"}], seat, pilot }) -> action
 *   `pilot` handed to both = { playbook, temperament } (this module's own tags).
 *
 * ── TWO EXPORT SHAPES the CLI accepts ────────────────────────────────────────────────────────────────
 *   (A) `buildPilots(seats, { mode })` -> { [seat]: pilotObject }   ← full control: per-seat personas,
 *       temperament match-ups (e.g. an aggressive user vs a controlling ai1). THIS file uses (A).
 *   (B) a bare `decide` (+ optional `decideMulligan`, `playbook`, `temperament`) export -> the CLI
 *       applies that ONE pilot to EVERY seat. (Also exported below so this file works either way.)
 */
import { pickAction } from "../../src/lib/learn/opponentAI.js";

// Replace this body with real persona logic. Returning undefined defers to the default autopilot,
// so play here is identical to a no-pilot run — only the {playbook,temperament} tag is added.
function decide({ state, legalActions, seat }) {
  return pickAction(state, seat, legalActions) ?? undefined;
}

/**
 * Shape (A): assign a tagged pilot to every engine seat. `seats` is engineSeatsForMode(mode) —
 * ["user","ai"] (standard) or ["user","ai1","ai2","ai3"] (commander). For a real persona sweep,
 * return different { playbook, temperament, decide } per seat here.
 */
export function buildPilots(seats /* , { mode } */) {
  const pilots = {};
  for (const seat of seats) {
    pilots[seat] = { playbook: "reference", temperament: "balanced", decide };
  }
  return pilots;
}

// Shape (B): the bare single-pilot exports (used if the CLI is pointed at a module with no buildPilots).
export { decide };
export const playbook = "reference";
export const temperament = "balanced";
