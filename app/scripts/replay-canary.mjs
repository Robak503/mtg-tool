/**
 * replay-canary.mjs — EPOCH-2 item 6: the per-epoch determinism tripwire the 100GB
 * prune-and-regenerate lifecycle ASSUMES but never verified. Samples stored games, replays
 * each from its header (seed + decks-in-seat-order + mode + persona), and compares the
 * replayed rows byte-for-byte against the stored raws. Also runs the manifest DEDUPE guard:
 * no two headers may share (seed, deck-ids-in-order, pool).
 *
 *   MTG_APP_ROOT=<root> node scripts/replay-canary.mjs [--sample=20] [--pilot=omnath.mjs]
 *
 * PASS = every sampled game's replayed rows hash-match the stored rows AND no duplicate
 * (seed,decks,pool) pairs exist. A MISMATCH means replay determinism broke somewhere —
 * STOP pruning until it's root-caused (pruned games would be unrecoverable).
 * Scope caveat (honest): replay uses the CURRENT engine — after an intentional behavior
 * change (a re-anchor), pre-change games won't match; run the canary against games recorded
 * on the current engineVersion only (it filters to that automatically).
 */

import { pathToFileURL } from "node:url";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));

const u = (rel) => pathToFileURL(path.join(process.cwd(), rel)).href;
const { grindRoot, readGameFile, loadGrindManifest } = await import(u("src/lib/learn/gameLogStore.js"));
const { loadAllProfileDecks, toRunnerDeck } = await import(u("src/lib/server/selfPlayDecks.js"));
const { loadPilotBuilder } = await import(u("src/lib/server/pilotLoader.js"));
const { runSelfPlayGame, engineSeatsForMode } = await import(u("src/lib/learn/selfPlayRunner.js"));

// The engine BUILD stamp (git describe) — the canary replays only games THIS build recorded; package.json's
// never-bumped version made every build look alike. See src/lib/learn/engineBuild.js.
const { engineBuild } = await import(u("src/lib/learn/engineBuild.js"));
const engineVersion = engineBuild();
const sampleN = Number(argv.sample) || 20;

// ── collect current-engine headers + the dedupe guard over ALL headers ──
const manifest = await loadGrindManifest();
const headers = [];
const seen = new Map(); // dedupe key -> first index
const dupes = [];
for (const s of manifest.shards) {
  let text;
  try { text = fs.readFileSync(path.join(grindRoot(), s.shard, "headers.jsonl"), "utf8"); } catch { continue; }
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let h; try { h = JSON.parse(line); } catch { continue; }
    const key = `${h.seed}|${(h.decks || []).map((d) => d.id).join(",")}|${h.pool ?? "?"}`;
    if (h.decks?.length) {
      if (seen.has(key)) dupes.push({ key, first: seen.get(key), dupe: h.index });
      else seen.set(key, h.index);
    }
    if (h.engineVersion === engineVersion && Array.isArray(h.decks) && h.decks.length) headers.push(h);
  }
}
console.log(`dedupe guard: ${dupes.length} duplicate (seed,decks,pool) pairs${dupes.length ? " — " + JSON.stringify(dupes.slice(0, 3)) : ""}`);

if (!headers.length) {
  console.log(`no games recorded on the current engine (${engineVersion}) yet — canary has nothing to replay (OK on a fresh epoch).`);
  process.exit(dupes.length ? 1 : 0);
}

// Deterministic sample spread across the range (no RNG — reproducible canary).
const step = Math.max(1, Math.floor(headers.length / sampleN));
const sample = headers.filter((_, i) => i % step === 0).slice(0, sampleN);

const all = (await loadAllProfileDecks()).map(toRunnerDeck);
const pilotFile = argv.pilot || "omnath.mjs";
const build = await loadPilotBuilder(pilotFile, "commander").catch(() => null);

let pass = 0, fail = 0, skip = 0;
for (const h of sample) {
  const seats = engineSeatsForMode(h.mode || "commander");
  const bySeat = new Map((h.decks || []).map((d) => [d.seat, d]));
  const pod = [];
  let missing = false;
  for (const seat of seats) {
    const want = bySeat.get(seat);
    const deck = want && (all.find((x) => x.id === want.id) || all.find((x) => x.name === want.name));
    if (!deck) { missing = true; break; }
    pod.push(deck);
  }
  if (missing) { skip += 1; continue; }
  const pilots = build ? (build(pod, h.seed) || {}) : {}; // seed-threaded (deterministic for seed-aware personas)
  const [userDeck, ...opp] = pod;
  const replay = runSelfPlayGame({
    deckA: userDeck?.cards || [], opponentDecks: opp.map((d) => d?.cards || []),
    userCommanders: userDeck?.commanders || [], opponentCommanders: opp.map((d) => d?.commanders || []),
    userCompanion: userDeck?.companion || null, opponentCompanions: opp.map((d) => d?.companion || null),
    mode: h.mode || "commander", seed: h.seed, timePressure: true, pilots, recordDecisions: true, mulligan: true,
  });
  const stored = await readGameFile(h.index).catch(() => null);
  if (!stored) { skip += 1; continue; } // pruned raw — header-only games can't be byte-compared
  const hash = (rows) => crypto.createHash("sha256").update(JSON.stringify(rows || [])).digest("hex");
  const ok = hash(replay.decisionTrajectory?.rows) === hash(stored.rows) && replay.result === h.result;
  if (ok) pass += 1;
  else { fail += 1; console.error(`MISMATCH index=${h.index} seed=${h.seed}: stored ${h.result}/${(stored.rows || []).length} rows vs replay ${replay.result}/${(replay.decisionTrajectory?.rows || []).length} rows`); }
}

// Discriminate ENGINE vs PERSONA nondeterminism on failure: replay one sampled game twice
// with the SAME pilots object — if the two replays match each other but not the store, the
// engine is deterministic and the mismatch is persona ASSIGNMENT (fix: seed-derived
// temperaments in the persona; the seed now arrives in buildPilots opts).
if (fail > 0 && sample.length) {
  const h0 = sample[0];
  const seats0 = engineSeatsForMode(h0.mode || "commander");
  const bySeat0 = new Map((h0.decks || []).map((d) => [d.seat, d]));
  const pod0 = seats0.map((seat) => { const want = bySeat0.get(seat); return want && (all.find((x) => x.id === want.id) || all.find((x) => x.name === want.name)); });
  if (pod0.every(Boolean)) {
    const pilots0 = build ? (build(pod0, h0.seed) || {}) : {};
    const args0 = { deckA: pod0[0]?.cards || [], opponentDecks: pod0.slice(1).map((d) => d?.cards || []), userCommanders: pod0[0]?.commanders || [], opponentCommanders: pod0.slice(1).map((d) => d?.commanders || []), userCompanion: pod0[0]?.companion || null, opponentCompanions: pod0.slice(1).map((d) => d?.companion || null), mode: h0.mode || "commander", seed: h0.seed, timePressure: true, pilots: pilots0, recordDecisions: true, mulligan: true };
    const a = runSelfPlayGame(args0), b = runSelfPlayGame(args0);
    const hh = (rows) => crypto.createHash("sha256").update(JSON.stringify(rows || [])).digest("hex");
    const engineDeterministic = hh(a.decisionTrajectory?.rows) === hh(b.decisionTrajectory?.rows);
    console.log(engineDeterministic
      ? "discrimination: ENGINE deterministic (same pilots -> identical replays) — mismatches are PERSONA-ASSIGNMENT nondeterminism (make temperaments seed-derived)"
      : "discrimination: ENGINE ITSELF nondeterministic with fixed pilots — STOP, root-cause before anything else");
  }
}
console.log(`replay canary (${engineVersion}): ${pass} PASS / ${fail} FAIL / ${skip} skipped of ${sample.length} sampled`);
if (fail || dupes.length) {
  console.error("CANARY RED — do NOT prune; replay determinism (or index uniqueness) is broken.");
  process.exit(1);
}
console.log("CANARY GREEN — pruning is safe for this epoch.");
