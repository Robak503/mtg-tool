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

const { createLearnSession, advanceUntilDecision, applyChoice, applyPendingChoice, continueFromArbiter } =
  await import("../src/lib/learn/learnSession.js");
const { allCards, publicCard } = await import("../src/lib/server/cardIndex.js");

// REAL cards, weighted to what actually gets played — a realistic deck is ~14% non-native
// (Arbiter/body-only), which is the mix that exercises the pendingChoice + arbiter paths a
// synthetic Forest/Bears deck never touches.
const POOL_ALL = allCards()
  .filter((c) => typeof c.oracle_text === "string")
  .map(publicCard);
const POOL = allCards()
  .filter((c) => typeof c.oracle_text === "string" && Number.isInteger(c.edhrec_rank)
    && !/\b(Token|Emblem|Scheme|Plane|Vanguard|Dungeon|Conspiracy)\b/.test(c.type_line || ""))
  .sort((a, b) => a.edhrec_rank - b.edhrec_rank)
  .slice(0, 1200)
  .map(publicCard);


// ─── TARGETED MODE ────────────────────────────────────────────────────────────────────────────
// Random top-played decks complete 100% of games but never surface the RARE pendingChoice kinds —
// each needs a specific card in play. These are real corpus cards verified to produce the atom that
// raises each kind, so a targeted deck proves those prompts both FIRE and are ANSWERABLE in a live
// game (unit + render tests prove the contract; only this proves the game keeps going).
const TARGET_CARDS = [
  // dig-land-to-battlefield
  "Elvish Rejuvenator", "Ignis Scientia",
  // distribute-counters
  "Armament Corps", "Armament Dragon", "Case of the Trampled Garden", "The Wise Mothman",
  // optional-draw-discard
  "Academy Wall", "Smuggler's Copter", "Marauding Looter", "Skeleton Key",
  // optional-discard-payment
  "Keldon Raider", "Vaultbreaker", "Bitter Reunion", "Viashino Racketeer",
  // sac-unless-pay
  "Justice", "Phantasmal Forces", "Sunken City", "Haazda Shield Mate",
  // taxed-payment (payer = the OPPONENT who casts; needs opponents casting spells)
  "Rhystic Study", "Mystic Remora", "Smothering Tithe",
  // edict-mode
  "Torment of Hailfire",
];

function basicsOf(prefix) {
  const kinds = [["Forest","G"],["Island","U"],["Swamp","B"],["Mountain","R"],["Plains","W"]];
  const out = [];
  for (let i = 0; i < 40; i++) {
    const [name, sym] = kinds[i % kinds.length];
    out.push({ id: `${prefix}-L${i}`, name, type: `Basic Land — ${name}`, oracle: `{T}: Add {${sym}}.`, mana: "", cmc: 0, keywords: [] });
  }
  return out;
}

function targetedDeck(prefix, rng) {
  const byName = new Map(POOL_ALL.map((c) => [c.name, c]));
  const out = basicsOf(prefix);
  const found = TARGET_CARDS.map((n) => byName.get(n)).filter(Boolean);
  // 3 copies each so they reliably show up, then top up with played cards.
  let i = 0;
  for (const c of found) for (let k = 0; k < 3; k++) out.push({ ...c, id: `${prefix}-t${i++}` });
  while (out.length < 100) { const c = POOL[Math.floor(rng() * POOL.length)]; out.push({ ...c, id: `${prefix}-r${i++}` }); }
  return out;
}

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
const TARGETED = (process.argv[5] || "") === "targeted";
const MAX_STEPS = 6000;

/** Decision kinds that mean the run is in trouble rather than progressing. */
const TROUBLE = new Set(["engine-stuck", "dispatch-error", "pending-choice-unhandled"]);

function forest(i) { return { id: `f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "", cmc: 0, keywords: [] }; }


/** Answer any decision the way the UI would. Returns the next {session, decision} or null if unanswerable. */
function answer(session, decision) {
  const kind = decision?.kind;

  if (kind === "distribute-counters" || kind === "divide-damage") {
    // MUST assign the FULL amount — these are mandatory and the engine re-surfaces an under-assignment
    // (correctly: the UI panel gates its submit on remaining === 0 for the same reason). An earlier
    // version of this driver assigned 1 and spun the same decision 29,794 times; that was this
    // script's bug, not the engine's. Spread across candidates honouring maxTargets/perTargetCap.
    const c = decision.candidates || [];
    if (!c.length) { UNANSWERABLE.reason = `${kind}: EMPTY candidates`; return null; }
    // Assign the MAXIMUM the board can take, matching learnSession.applyDistributeChoice + the panel:
    // "each of up to X targets" caps TARGETS, so with fewer creatures than X you place fewer counters.
    const cap = decision.perTargetCap ?? Infinity;
    const maxT = decision.maxTargets ?? c.length;
    const slots = Math.min(c.length, maxT);
    let left = Math.min(decision.amount || 0, slots * cap);
    const dist = [];
    for (const cand of c.slice(0, maxT)) {
      if (left <= 0) break;
      const give = Math.min(cap, left);
      dist.push({ id: cand.id, amount: give });
      left -= give;
    }
    if (left > 0) { UNANSWERABLE.reason = `${kind}: UNSATISFIABLE amount=${decision.amount} maxTargets=${decision.maxTargets} perTargetCap=${decision.perTargetCap} candidates=${c.length}`; return null; } // a REAL soft-lock if it happens
    return applyPendingChoice(session, { kind, distribution: dist });
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
  // SOFT-COUNTER (CR 601.2 "counter unless its controller pays") — a BINARY, like the payment kinds above
  // it, and the reason it needed its own line: it carries no `candidates`, so the generic card-pick
  // fallback never catches it and it fell through to the priority family as a phantom wedge. Declining to
  // pay is the choice a player short on mana actually makes, so it exercises the counter path.
  if (kind === "soft-counter") return applyPendingChoice(session, { kind, pay: false });
  if (kind === "optional-effect") return applyPendingChoice(session, { kind, take: false });
  if (kind === "commander-return") return applyPendingChoice(session, { kind, return: true });
  if (kind === "scry-surveil") return applyPendingChoice(session, { kind, keepTop: [], toBottom: [] });

  // ARBITER ESCAPE HATCH (added 2026-07-27). "unresolved" is NOT a soft-lock: it is the engine telling the
  // user a card's effect isn't modeled, so the Arbiter rules on it and play continues — gameApi routes this
  // kind to continueFromArbiter and IGNORES the answer. The sweep had no handler, so it fell through to the
  // priority family, found no `options`, and scored a WEDGE. That made every game containing one unmodeled
  // card look unfinishable, which is a claim about this script rather than about the engine.
  if (kind === "unresolved") return continueFromArbiter(session, {});

  // GENERIC card-pick fallback — LAST, because several kinds (distribute-counters, edict-mode)
  // also carry `candidates` but need their own payload. Putting this first silently swallowed them
  // and sent {cardId} to a settler expecting {distribution}, which the engine correctly rejected and
  // re-surfaced forever (29,794 iterations of the same decision).
  if (Array.isArray(decision?.candidates) && decision.candidates.length > 0) {
    return applyPendingChoice(session, { kind, cardId: decision.candidates[0].id });
  }

  // priority-action family. Option [0] is ALWAYS pass-priority, so taking it blindly models a
  // player who never plays anything — the user seat then casts nothing and its cards never fire
  // (which is exactly why an earlier version of this sweep saw only opponent-side prompts). Play
  // like a person instead: land first, then something castable, and pass only when there's nothing
  // better. Repeat-activations are avoided by preferring cast/play over activate.
  const opts = decision?.options || decision?.actions || [];
  if (opts.length === 0) return null;
  const pick =
    opts.find((o) => o.kind === "play-land")
    || opts.find((o) => /^cast/.test(String(o.kind || "")))
    || opts.find((o) => o.kind !== "pass-priority" && !/activate/i.test(String(o.kind || "")))
    || opts[0];
  // Remember WHAT we just chose. A dispatcher throw is reported by decision KIND, which for the priority
  // family is always "ask" — useless for finding the card. The first dispatch-error this sweep caught cost a
  // separate repro run purely to learn which spell it was.
  LAST_PICK = pick;
  return applyChoice(session, pick);
}

let LAST_PICK = null;                    // the most recent action taken; named in a throw's detail
const UNANSWERABLE = { reason: "" };
const results = [];
const kindCounts = {};
// REPLAY a single game: `--only=26`. Each game seeds its own rng (mulberry32(9000 + g)) and its own session
// (seed 1000 + g), so game N is reproducible in isolation — which is the whole point of reporting a wedge by
// game number. Without this the only way to re-examine one wedge was to re-run the entire sweep.
const ONLY = (() => {
  const a = process.argv.find((x) => x.startsWith("--only="));
  return a ? Number(a.slice("--only=".length)) : null;
})();
for (let g = 0; g < GAMES; g++) {
  if (ONLY != null && g !== ONLY) continue;
  let session, decision;
  try {
    const rng = mulberry32(9000 + g);
    const mk = TARGETED ? targetedDeck : realDeck;
    session = MODE === "commander"
      ? createLearnSession({ userDeck: mk(`u${g}`, rng), opponentDecks: [mk(`a${g}`, rng), mk(`b${g}`, rng), mk(`c${g}`, rng)], difficulty: DIFFICULTY, mode: "commander", seed: 1000 + g })
      : createLearnSession({ userDeck: mk(`u${g}`, rng), opponentDeck: mk(`a${g}`, rng), difficulty: DIFFICULTY, seed: 1000 + g });
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
    if (TROUBLE.has(kind)) {
      outcome = `WEDGE:${kind}`;
      detail = String(decision.reason || "").slice(0, 90);
      // Under --only, dump the whole decision + the action that led here. A wedge reported by kind and a
      // 90-char reason is enough to COUNT wedges and not enough to FIX one; this is the difference.
      if (ONLY != null) {
        console.log(`
--- WEDGE DETAIL (game ${g}) ---`);
        console.log("last action:", JSON.stringify(LAST_PICK, null, 1)?.slice(0, 1200));
        console.log("decision:", JSON.stringify(decision, null, 1)?.slice(0, 2000));
      }
      break;
    }

    let next;
    try { next = answer(session, decision); }
    catch (e) {
      outcome = "WEDGE:throw";
      const who = LAST_PICK ? `${LAST_PICK.kind || "?"}:${LAST_PICK.cardName || LAST_PICK.name || LAST_PICK.card?.name || "?"}` : kind;
      detail = `${who}: ${e.message}`.slice(0, 140);
      break;
    }
    if (!next) { outcome = "WEDGE:unanswerable"; detail = UNANSWERABLE.reason || `${kind} (no options/candidates)`; break; }

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
