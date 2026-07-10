/**
 * replay-probe.mjs — replay ONE recorded grind game to decision N and dump the fork
 * (M1.2, Omnath's blunder-probe harness handoff: missed-lethal / suicide-attack /
 * wrath-own-board analyzers consume this; the P7 scrubber is its future UI).
 *
 *   MTG_APP_ROOT=<root> node scripts/replay-probe.mjs --index 4711 --decision 120
 *       [--store <grind root override, e.g. an epoch archive>] [--pilot omnath.mjs]
 *       [--out fork.json]
 *
 * Emits ONE JSON fork object: the deciding seat + turn, the FULL offered action set
 * (compact-serialized), what was chosen, the cast chooser's ranking for that decision
 * (castScores/scoreGap — from the replayed row), the seat's feature vector, and a
 * board snapshot (per-seat life/battlefield + the decider's hand). The replay runs to
 * completion (deterministic), so the fork also carries the game's final result for
 * outcome-conditioning.
 *
 * INDEXING (honest contract): --decision N counts IN-GAME decisions (the order rows are
 * recorded, EXCLUDING the pre-game mulligan rows — offset by the header's mulligan rows
 * if you're mapping from a stored row index; mulligan rows carry turn 0).
 *
 * EXACTNESS: same caveats as repro-grind-game.mjs — (seed, decks, mode, pilots,
 * engineVersion) determine the game; pilotV≥3 personas are seed-derived, so pass the
 * SAME --pilot as the record for byte-exactness. An engine change since the record
 * replays the SCENARIO, not the bytes.
 */

import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};

const { loadAllProfileDecks, toRunnerDeck } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/server/selfPlayDecks.js")).href);
const { runSelfPlayGame, engineSeatsForMode } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/selfPlayRunner.js")).href);
const { grindRoot } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/learn/gameLogStore.js")).href);

const decisionN = Number(opt("decision"));
if (!Number.isInteger(decisionN) || decisionN < 0) {
  console.error("usage: --index <n> --decision <N> [--store <grind root>] [--pilot <file.mjs>] [--out <path>]");
  process.exit(2);
}

// ── resolve the header (index → shard headers.jsonl; --store overrides for archives) ──
const root = opt("store") || grindRoot();
const index = Number(opt("index"));
if (!Number.isInteger(index)) { console.error("--index <n> is required"); process.exit(2); }
const shard = `shard-${String(Math.floor(index / 1000)).padStart(4, "0")}`;
let header = null;
for (const line of fs.readFileSync(path.join(root, shard, "headers.jsonl"), "utf8").split("\n")) {
  if (!line.trim()) continue;
  const h = JSON.parse(line);
  if (h.index === index) { header = h; break; }
}
if (!header) { console.error(`index ${index} not found in ${shard}/headers.jsonl under ${root}`); process.exit(2); }
if (!Array.isArray(header.decks) || !header.decks.length) { console.error("header has no decks[] — cannot rebuild the pod"); process.exit(2); }

// ── rebuild the pod in seat order (the repro-grind-game recipe) ──
const all = await loadAllProfileDecks();
const bySeat = new Map(header.decks.map((d) => [d.seat, d]));
const seats = engineSeatsForMode(header.mode || "commander");
const pod = seats.map((seat) => {
  const want = bySeat.get(seat);
  if (!want) throw new Error(`header.decks missing seat ${seat}`);
  const deck = all.find((x) => x.id === want.id) || all.find((x) => x.name === want.name);
  if (!deck) throw new Error(`deck ${want.id || want.name} not on the shelf — restore it first`);
  return toRunnerDeck(deck);
});

// ── pilots (match the record for exactness; seed-derived personas need the game seed) ──
let pilots = {};
if (opt("pilot")) {
  const { loadPilotBuilder } = await import(pathToFileURL(path.join(process.cwd(), "src/lib/server/pilotLoader.js")).href);
  const build = await loadPilotBuilder(opt("pilot"), header.mode || "commander");
  if (build) pilots = build(pod, header.seed, { flags: [] }) || {};
}

// ── the probe: wrap EVERY seat's decide so decision N is captured with its full context ──
// A wrapper that returns undefined defers to the default autopilot pick, so wrapping a
// pilot-less seat changes nothing; the wrapped inner pilot's choice passes through intact.
// The counter is GLOBAL across seats — the exact order resolveDecideAction records rows.
const compactAction = (a) => a && {
  kind: a.kind, cardId: a.cardId ?? null, name: a.name ?? null,
  permanentId: a.permanentId ?? a.attackerId ?? a.blockerId ?? null,
  targets: a.targets ?? a.targetId ?? null, cost: a.cost ?? null, choiceKind: a.choiceKind ?? null,
  candidateId: a.candidateId ?? null, value: a.value ?? null, xValue: a.xValue ?? null,
};
const boardSnapshot = (state, seat) => ({
  turn: state.turn, phase: state.phase, step: state.step, stackSize: state.stack?.length ?? 0,
  seats: Object.fromEntries(Object.entries(state.players).map(([pid, p]) => [pid, {
    life: p.life, rad: p.radCounters || 0, handSize: (p.hand || []).length,
    battlefield: (p.battlefield || []).map((perm) => ({
      name: perm.card?.name, tapped: !!perm.tapped,
      power: perm.card?.power ?? null, toughness: perm.card?.toughness ?? null,
      counters: perm.counters && Object.keys(perm.counters).length ? perm.counters : undefined,
    })),
  }])),
  deciderHand: (state.players[seat]?.hand || []).map((c) => c.name),
});

let count = -1;
let fork = null;
const wrapped = {};
for (const seat of seats) {
  const inner = pilots[seat];
  wrapped[seat] = {
    ...(inner || {}),
    decide: (ctx) => {
      count += 1;
      const innerPick = typeof inner?.decide === "function" ? inner.decide(ctx) : undefined;
      if (count === decisionN && !fork) {
        fork = {
          decision: decisionN, seat: ctx.seat, turn: ctx.state.turn,
          offered: (ctx.legalActions || []).map(compactAction),
          pilotChoice: innerPick !== undefined ? compactAction(innerPick) : null, // null = the default autopilot decided
          board: boardSnapshot(ctx.state, ctx.seat),
        };
      }
      return innerPick;
    },
  };
}

const [userDeck, ...opp] = pod;
const game = runSelfPlayGame({
  deckA: userDeck?.cards || [],
  opponentDecks: opp.map((d) => d?.cards || []),
  userCommanders: userDeck?.commanders || [],
  opponentCommanders: opp.map((d) => d?.commanders || []),
  userCompanion: userDeck?.companion || null,
  opponentCompanions: opp.map((d) => d?.companion || null),
  mode: header.mode || "commander",
  seed: header.seed,
  timePressure: true,
  pilots: wrapped,
  recordDecisions: true,
  mulligan: true,
});

// The replayed ROW at N carries the recorder's view (action taken, castScores/scoreGap, features);
// the in-game rows follow the mulligan prefix in decisionTrajectory.rows.
const rows = game.decisionTrajectory?.rows || [];
const mulliganPrefix = rows.filter((r) => r.turn === 0).length;
const row = rows[mulliganPrefix + decisionN] || null;

const out = {
  game: { index, seed: header.seed, mode: header.mode, originalResult: header.result, replayResult: game.result, replayTurns: game.turns },
  totalInGameDecisions: count + 1,
  mulliganRowPrefix: mulliganPrefix,
  fork,
  row: row && { action: row.action, castScores: row.castScores ?? null, scoreGap: row.scoreGap ?? null, rank: row.rank ?? null, legal: row.legal ?? null, forced: row.forced ?? false, features: row.features },
};
if (!fork) out.error = `decision ${decisionN} never occurred (game had ${count + 1} in-game decisions)`;

const json = JSON.stringify(out, null, 2);
if (opt("out")) { fs.writeFileSync(opt("out"), json); console.log(`fork written to ${opt("out")}`); }
else console.log(json);
