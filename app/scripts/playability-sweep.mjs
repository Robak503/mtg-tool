/**
 * playability-sweep.mjs — CAN A HUMAN FINISH A GAME?
 *
 * The 1.0 breakpoint is (a) the decks are playable + (b) the layout. This measures (a) honestly.
 *
 * Drives the REAL human path — createLearnSession at beginner/intermediate, where advanceUntilDecision
 * PAUSES for a person instead of auto-piloting — and answers every decision the way the UI would, using
 * the exact payload shapes useLearnSession posts. Then it reports, per game, whether the game REACHED A
 * CONCLUSION or wedged, and on a wedge exactly which decision kind stopped it and on what turn.
 *
 * This is deliberately NOT self-play: at Expert the driver answers everything itself, which is why ~40k
 * green games/night said nothing about whether a human could finish one.
 *
 * Usage: MTG_APP_ROOT=<real app tree> node scripts/playability-sweep.mjs [games] [difficulty] [standard|commander]
 */
process.env.MTG_APP_ROOT ||= "C:/Projects/mtg-tool/app";

const { createLearnSession, advanceUntilDecision, applyChoice, applyPendingChoice } =
  await import("../src/lib/learn/learnSession.js");
const { allCards, publicCard } = await import("../src/lib/server/cardIndex.js");

// REAL cards, weighted to what actually gets played — a realistic deck is ~14% non-native
// (Arbiter/body-only), which is the mix that exercises the pendingChoice + arbiter paths a
// synthetic Forest/Bears deck never touches.
const POOL = allCards()
  .filter((c) => typeof c.oracle_text === "string" && Number.isInteger(c.edhrec_rank)
    && !/\b(Token|Emblem|Scheme|Plane|Vanguard|Dungeon|Conspiracy)\b/.test(c.type_line || ""))
  .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
  .slice(0, 1200)
  .map(publicCard);

function realDeck(prefix, rng) {
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ ...forest(`${prefix}-f${i}`) });
  for (let i = 0; i < 76; i++) {
    const c = POOL[Math.floor(rng() * POOL.length)];
    out.push({ ...c, id: `${prefix}-r${i}` });
  }
  return out;
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const GAMES = Number(process.argv[2] || 20);
const DIFFICULTY = process.argv[3] || "beginner";
const MODE = process.argv[4] || "standard";
const MAX_STEPS = 6000;

/** Decision kinds that mean the run is in trouble rather than progressing. */
const TROUBLE = new Set(["engine-stuck", "dispatch-error", "pending-choice-unhandled"]);

function forest(i) { return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "", cmc: 0, keywords: [] }; }


/** Answer any decision the way the UI would. Returns the next {session, decision} or null if unanswerable. */
function answer(session, decision) {
  const kind = decision?.kind;

  // pendingChoice-family: answered through applyPendingChoice with the hook's payload shape.
  if (Array.isArray(decision?.candidates) && decision.candidates.length > 0) {
    return applyPendingChoice(session, { kind, cardId: decision.candidates[0].id });
  }
  if (kind === "distribute-counters" || kind === "divide-damage") {
    const c = decision.candidates || [];
    if (!c.length) return null;
    return applyPendingChoice(session, { kind, distribution: [{ id: c[0].id, amount: decision.amount || 1 }] });
  }
  if (kind === "edict-mode") {
    const modes = decision.modes || [];
    return applyPendingChoice(session, { kind, mode: modes[0] || "life", permId: (decision.sac || [])[0]?.id ?? null, cardId: (decision.disc || [])[0]?.id ?? null });
  }
  if (kind === "optional-draw-discard") return applyPendingChoice(session, { kind, draw: false });
  if (kind === "optional-discard-payment") return applyPendingChoice(session, { kind, discard: false });
  if (kind === "sac-unless-pay" || kind === "taxed-payment") return applyPendingChoice(session, { kind, pay: false });
  if (kind === "optional-mana-payment") return applyPendingChoice(session, { kind, pay: false });
  if (kind === "optional-sac-payment") return applyPendingChoice(session, { kind, sac: false });
  if (kind === "optional-effect") return applyPendingChoice(session, { kind, take: false });
  if (kind === "commander-return") return applyPendingChoice(session, { kind, return: true });
  if (kind === "scry-surveil") return applyPendingChoice(session, { kind, keepTop: [], toBottom: [] });

  // priority-action family: pick a legal option, preferring progress over passing.
  const opts = decision?.options || decision?.actions || [];
  if (opts.length > 0) {
    const idx = opts.length > 1 ? 0 : 0;
    return applyChoice(session, opts[idx]);
  }
  return null;
}

const results = [];
const kindCounts = {};
for (let g = 0; g < GAMES; g++) {
  let session, decision;
  try {
    const rng = mulberry32(9000 + g);
    session = MODE === "commander"
      ? createLearnSession({ userDeck: realDeck(`u${g}`, rng), opponentDecks: [realDeck(`a${g}`, rng), realDeck(`b${g}`, rng), realDeck(`c${g}`, rng)], difficulty: DIFFICULTY, mode: "commander", seed: 1000 + g })
      : createLearnSession({ userDeck: realDeck(`u${g}`, rng), opponentDeck: realDeck(`a${g}`, rng), difficulty: DIFFICULTY, seed: 1000 + g });
    ({ session, decision } = advanceUntilDecision(session));
  } catch (e) {
    results.push({ g, outcome: "throw-on-start", detail: e.message, turn: 0, steps: 0 });
    continue;
  }

  let steps = 0, outcome = null, detail = "", lastKinds = [];
  while (steps < MAX_STEPS) {
    const kind = decision?.kind;
    kindCounts[kind] = (kindCounts[kind] || 0) + 1;
    lastKinds.push(kind);
    if (lastKinds.length > 6) lastKinds.shift();

    if (kind === "game-over") { outcome = "COMPLETED"; detail = decision.reason || ""; break; }
    if (TROUBLE.has(kind)) { outcome = `WEDGE:${kind}`; detail = String(decision.reason || "").slice(0, 90); break; }

    let next;
    try { next = answer(session, decision); }
    catch (e) { outcome = "WEDGE:throw"; detail = `${kind}: ${e.message}`.slice(0, 90); break; }
    if (!next) { outcome = "WEDGE:unanswerable"; detail = `${kind} (no options/candidates)`; break; }

    session = next.session; decision = next.decision; steps++;
  }
  if (!outcome) { outcome = "WEDGE:step-cap"; detail = `no conclusion in ${MAX_STEPS} steps (recent: ${lastKinds.join(">")})`; }
  results.push({ g, outcome, detail, turn: session?.state?.turn ?? -1, steps });
}

console.log("\n--- decision kinds actually EXERCISED (validity check) ---");
for (const [k, n] of Object.entries(kindCounts).sort((a,b)=>b[1]-a[1])) console.log(`  ${String(n).padStart(7)}  ${k}`);
const done = results.filter(r => r.outcome === "COMPLETED");
console.log(`\n=== PLAYABILITY SWEEP — ${DIFFICULTY}, ${GAMES} games (the HUMAN path) ===`);
console.log(`COMPLETED: ${done.length}/${GAMES}  (${Math.round(done.length / GAMES * 100)}%)`);
if (done.length) {
  const t = done.map(r => r.turn).sort((a, b) => a - b);
  console.log(`  finished on turn: min ${t[0]} / median ${t[Math.floor(t.length / 2)]} / max ${t[t.length - 1]}`);
}
const bad = results.filter(r => r.outcome !== "COMPLETED");
if (bad.length) {
  const by = {};
  for (const r of bad) (by[r.outcome] ||= []).push(r);
  console.log(`\nWEDGES: ${bad.length}`);
  for (const [k, v] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${k} -> ${v.length}`);
    for (const r of v.slice(0, 3)) console.log(`      game ${r.g} turn ${r.turn} step ${r.steps}: ${r.detail}`);
  }
} else {
  console.log("\nNo wedges. Every game reached a conclusion.");
}
