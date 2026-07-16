/**
 * engineLogNarrator.js — turn the ENGINE's structured game log (state.log entries) into the
 * play-by-play a human reads: per-turn groups of plain-English lines, deck names instead of seat
 * ids. Built for feature C's "watch the highlight" replay viewer (CrucibleRunModal.ReplayViewer);
 * the Academy's decision log has its own renderer (LearnLogEntry) — this covers the self-play
 * engine's richer event stream.
 *
 * HONEST + quiet: every line is read straight off real event fields; an event kind this narrator
 * doesn't know is SKIPPED (never rendered as "?" or a guessed sentence), and pure noise (step
 * markers, stack bookkeeping, cleanup) is filtered. Consecutive attack/block declarations collapse
 * into one line so a 7-attacker swing reads as a swing, not seven rows.
 */

// Event kinds that are pure bookkeeping — never narrated.
const SKIP = new Set([
  "step", "stack-resolve", "cleanup-discard-pending", "cleanup-discard", "spell-to-graveyard",
  "combat-damage", // the per-player combat-damage-player events carry the readable version
]);

/** How a player-eliminated event's vitals read as a cause (mirrors epochStats' taxonomy). */
function elimCause(e) {
  if (e.commanderLethal) return "commander damage";
  if ((e.poison ?? 0) >= 10) return "poison";
  if (e.decked) return "decked out";
  if (e.lethalByCombat === true) return "combat damage";
  if (e.lethalByCombat === false) return "noncombat damage";
  return "damage";
}

/**
 * Narrate one engine log into per-turn groups: [{ turn, lines: [string] }].
 * `seatNames` maps engine seat ids → display names (e.g. { user: "Omnath, Locus of Mana", … });
 * an unmapped seat renders as its raw id (honest fallback, never blank).
 */
export function narrateEngineLog(log, seatNames = {}) {
  const who = (seat) => seatNames[seat] || seat || "someone";
  const groups = [];
  let cur = null;
  const push = (turn, line) => {
    if (!line) return;
    const t = Number.isFinite(turn) ? turn : null;
    if (!cur || cur.turn !== t) { cur = { turn: t, lines: [] }; groups.push(cur); }
    cur.lines.push(line);
  };
  // Collapse counters for consecutive attack/block declarations (flushed when the run breaks).
  let attackRun = null; // { turn, player, n }
  let blockRun = null;  // { turn, n }
  const flushRuns = () => {
    if (attackRun) { push(attackRun.turn, `⚔ ${who(attackRun.player)} attacks with ${attackRun.n} creature${attackRun.n === 1 ? "" : "s"}`); attackRun = null; }
    if (blockRun) { push(blockRun.turn, `🛡 ${blockRun.n} blocker${blockRun.n === 1 ? "" : "s"} declared`); blockRun = null; }
  };

  for (const e of Array.isArray(log) ? log : []) {
    if (!e || typeof e !== "object" || SKIP.has(e.kind)) continue;
    const k = e.kind;
    if (k === "attack-declared") {
      if (attackRun && attackRun.turn === e.turn && attackRun.player === e.attackingPlayer) attackRun.n += 1;
      else { flushRuns(); attackRun = { turn: e.turn, player: e.attackingPlayer, n: 1 }; }
      continue;
    }
    if (k === "block-declared") {
      if (blockRun && blockRun.turn === e.turn) blockRun.n += 1;
      else { if (attackRun) flushRuns(); blockRun = { turn: e.turn, n: 1 }; }
      continue;
    }
    flushRuns();
    switch (k) {
      case "game-start": push(e.turn, `⚑ ${who(e.startingPlayer)} is on the play`); break;
      case "mulligan-ship": push(e.turn, `${who(e.player)} ships the hand (mulligan ${e.mulligans})`); break;
      case "mulligan-keep": push(e.turn, `${who(e.player)} keeps ${7 - (e.bottomed ?? 0)}${e.mulligans ? ` after ${e.mulligans} mulligan${e.mulligans === 1 ? "" : "s"}` : ""}`); break;
      case "play-land": push(e.turn, `${who(e.playerId)} plays ${e.cardName}`); break;
      case "cast-spell": push(e.turn, `${who(e.playerId)} casts ${e.cardName}`); break;
      case "permanent-enters": push(e.turn, `${e.cardName} enters under ${who(e.controller)}`); break;
      case "activate-ability": push(e.turn, `${who(e.playerId)} activates ${e.cardName}${e.abilityText ? ` — ${e.abilityText}` : ""}`); break;
      case "attach": push(e.turn, `${e.source} attaches to ${e.target}`); break;
      case "spell-effect": if (e.effect) push(e.turn, `${who(e.controller)}'s ${e.effect} effect resolves`); break;
      case "combat-damage-player":
        push(e.turn, `${e.commanderName || who(e.attackingPlayer)} hits ${who(e.defender)} for ${e.amount}${e.commanderName ? " (commander)" : ""}`);
        break;
      case "commander-damage":
        push(e.turn, `${e.commanderName} has dealt ${e.total} commander damage to ${who(e.defender)}`);
        break;
      case "creature-dies": push(e.turn, `${e.cardName} dies${e.cause ? ` (${e.cause})` : ""}`); break;
      case "tutor-search-pending": push(e.turn, `${who(e.controller)} searches with ${e.sourceName}`); break;
      case "scry-pending": push(e.turn, `${who(e.controller)} ${e.mode === "surveil" ? "surveils" : "scries"} ${e.count} (${e.sourceName})`); break;
      case "player-eliminated": push(e.turn, `☠ ${who(e.player)} is eliminated — ${elimCause(e)}`); break;
      default: break; // an unknown kind stays silent — never a "?" line
    }
  }
  flushRuns();
  return groups;
}
