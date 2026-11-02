/**
 * ability-loss-twin-diff.mjs — THE WHOLE-CORPUS TWIN COMPARISONS of the ability-loss program (docs/orchestration/ABILITY-LOSS-PROGRAM.md
 * §5.3; the S0b review's four differentials, kept as a tool).
 *
 * Every bundled card that can be a permanent and has rules text is put on a board twice, each time having lost all its abilities (a
 * fixed-mode `loseAllAbilities` stored through layers.addContinuousEffect, CR 613.1f): once as the printed card, once as its no-text twin
 * (the same characteristics and faces, every rules text blanked, no keywords). Both are under one NEUTRAL name, so a name-keyed table
 * cannot hide a leak. A permanent that lost all its abilities must play exactly like the twin, so every difference is a reader still
 * reading the printed card — or a by-design class (the summary names the known ones). Four scenarios:
 *   cycle   — the user's permanents tapped, then passed priority (gameEngine.passPriority; nextStep where no player has priority) through the opponent's turn and the user's next
 *             untap, upkeep and draw: every step's turn-based actions and triggers;
 *   cast    — Lightning Bolt at the permanent (or the creature an Aura / Equipment is on), Lightning Bolt at its controller, and an X=2
 *             creature spell, each through legalActionsForPlayer → dispatchAction and resolved;
 *   combat  — it attacking and blocking: canBlockAttacker over a blocker panel, the declare-blockers offers with zero and one blocker
 *             declared, resolveCombatDamage unblocked and blocked (creatures, and the creature an Aura / Equipment is on);
 *   actions — the whole main-phase legalActionsForPlayer and manaSources of its controller.
 *
 * usage (cwd = app; MTG_APP_ROOT = a data root holding data/scryfall-bulk — read only):
 *   node scripts/ability-loss-twin-diff.mjs [--scenarios=cycle,cast,combat,actions] [--workers=8] [--limit=N] [--names=A|B] [--out=diff.json]
 * Prints per scenario the cards compared and the cards that differ; --out writes every difference (the digest keys that differ, and
 * both values) for the reasons to be read off. Heavy (the whole corpus — run it through the gate queue).
 */
import { fork } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const SCENARIOS = String(argv.scenarios || "cycle,cast,combat,actions").split(",");
const WORKERS = Math.max(1, Number(argv.workers || 1));
const SELF = fileURLToPath(import.meta.url);

if (argv.shard == null && WORKERS > 1) {
  // the parent: fork the shards, merge their results
  const parts = await Promise.all(Array.from({ length: WORKERS }, (_, i) => new Promise((resolve, reject) => {
    const tmp = `${argv.out || "ability-loss-twin-diff"}.shard${i}.json`;
    const child = fork(SELF, [...process.argv.slice(2).filter((a) => !/^--(workers|out)=/.test(a)), `--shard=${i}/${WORKERS}`, `--out=${tmp}`], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
    child.on("exit", (code) => {
      if (code !== 0) { reject(new Error(`shard ${i} exited ${code}`)); return; }
      const r = JSON.parse(fs.readFileSync(tmp, "utf8"));
      fs.unlinkSync(tmp);
      resolve(r);
    });
  })));
  const merged = { scenarios: {}, differences: [] };
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.scenarios)) {
      const m = (merged.scenarios[k] ??= { compared: 0, differ: 0, errors: 0 });
      m.compared += v.compared; m.differ += v.differ; m.errors += v.errors;
    }
    merged.differences.push(...p.differences);
  }
  merged.differences.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.name.localeCompare(b.name));
  report(merged);
  if (argv.out) fs.writeFileSync(argv.out, JSON.stringify(merged, null, 1));
  process.exit(0);
}

function report(r) {
  for (const [k, v] of Object.entries(r.scenarios)) console.log(`${k}: ${v.compared} compared, ${v.differ} differ, ${v.errors} errors`);
  for (const d of r.differences) console.log(`  ${d.scenario}  ${d.name}  [${d.keys.join(", ")}]${d.error ? `  ERROR ${d.error}` : ""}`);
}

// ─── the engine, read through its public readers ─────────────────────────────────────────────────────────────────────────────────
await import("../src/lib/learn/resolvers.js"); // the integrator doors (enterPermanent, addContinuousEffect) the atoms use
const G = await import("../src/lib/learn/gameState.js");
const L = await import("../src/lib/learn/layers.js");
const LC = await import("../src/lib/learn/legalChoices.js");
const M = await import("../src/lib/learn/manaModel.js");
const CE = await import("../src/lib/learn/combatEvasion.js");
const CR = await import("../src/lib/learn/combatResolution.js");
const AD = await import("../src/lib/learn/actionDispatcher.js");
const GE = await import("../src/lib/learn/gameEngine.js");
const { allCards, publicCard } = await import("../src/lib/server/cardIndex.js");
const { mergeCardData } = await import("../src/lib/server/learnDeckEnrich.js");

const NEUTRAL = "Probe Permanent";
const ID = "probe";
const SUP = "sup";
const byName = new Map();
const PERMANENT_RE = /\b(Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/;
const NOT_A_CARD_RE = /\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction)\b/;
for (const raw of allCards()) {
  const pc = mergeCardData({ name: raw.name }, publicCard(raw, [], {}));
  if (!byName.has(pc.name)) byName.set(pc.name, { ...pc, card_faces: publicCard(raw, [], {}).card_faces });
}
const card = (n) => { const c = byName.get(n); if (!c) throw new Error(`no bundled card ${n}`); return c; };
const textOf = (c) => [c.oracle || "", ...(c.card_faces || []).map((f) => f.oracle_text || f.oracle || "")].join("\n").trim();
const frontType = (c) => String(c.type || c.type_line || "").split(" // ")[0];
const isCreature = (c) => /\bCreature\b/.test(frontType(c));
const isAttachment = (c) => /\b(Aura|Equipment)\b/.test(frontType(c));

/** The no-text twin: the same characteristics and faces, every rules text blanked, no keywords, the neutral name. */
function twinOf(c) {
  return { ...c, name: NEUTRAL, oracle: "", oracle_text: "", keywords: [], ...(Array.isArray(c.card_faces) ? { card_faces: c.card_faces.map((f) => ({ ...f, oracle_text: "", oracle: "" })) } : {}) };
}
const renamed = (c) => ({ ...c, name: NEUTRAL });

/** The board (the readers test's): the probe under the user (on its own Grizzly Bears when an Aura or Equipment), basic lands, a deep
 *  pool, a hand of Lightning Bolt and Endless One (ten permanents: Ascend can reach the city's blessing); the opponent's blocker panel; every permanent untapped and not summoning sick. */
function board(pc) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  let ts = 1;
  const perm = (id, c, controller, extra = {}) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1, ...extra });
  const probeExtra = pc.loyalty != null && Number.isFinite(Number(pc.loyalty)) ? { counters: { loyalty: Number(pc.loyalty) } } : {};
  const user = [perm(SUP, card("Grizzly Bears"), "user"), perm(ID, pc, "user", probeExtra)];
  if (isAttachment(pc)) { user[1].attachedTo = SUP; user[0].attachments = [ID]; }
  for (const n of ["Forest", "Forest", "Forest", "Plains", "Plains", "Island", "Swamp", "Mountain"]) user.push(perm(`u-${user.length}`, card(n), "user"));
  const ai = [perm("aiBear", card("Grizzly Bears"), "ai"), perm("aiFlyer", card("Ornithopter"), "ai"), perm("aiSpider", card("Giant Spider"), "ai"),
    perm("aiWall", card("Wall of Wood"), "ai"), perm("aiShadow", card("Dauthi Slayer"), "ai"), perm("a-5", card("Plains"), "ai"), perm("a-6", card("Island"), "ai")];
  const pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", timestampCounter: ts,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: [{ ...card("Lightning Bolt"), id: "hand-bolt" }, { ...card("Endless One"), id: "hand-x" }], manaPool: { ...s0.players.user.manaPool, ...pool },
        library: ["Forest", "Plains", "Grizzly Bears", "Island", "Swamp"].map((n, i) => ({ ...card(n), id: `lib-${i}` })) },
      ai: { ...s0.players.ai, battlefield: ai, hand: [{ ...card("Grizzly Bears"), id: "ai-hand-0" }], library: ["Island", "Plains", "Forest"].map((n, i) => ({ ...card(n), id: `ai-lib-${i}` })) },
    },
  };
}
const lose = (s) => L.addContinuousEffect(s, { layer: 6, op: { layerOp: "loseAllAbilities" }, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state;
const permOf = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield || []).find((p) => p.id === id);

/** The state as a comparable record: what each player has, every permanent's status, the stack, the waiting triggers, the log's kinds. */
function digest(s) {
  if (!s?.players) return { none: true };
  const players = {};
  for (const [pid, p] of Object.entries(s.players)) {
    players[pid] = {
      life: p.life, poison: p.poison ?? p.poisonCounters ?? 0, hand: (p.hand || []).map((c) => c.id), library: (p.library || []).length,
      graveyard: (p.graveyard || []).map((c) => c.id), exile: (p.exile || []).map((c) => c.id), citysBlessing: !!p.citysBlessing, manaPool: p.manaPool,
      battlefield: (p.battlefield || []).map((x) => [x.id, !!x.tapped, x.counters || {}, x.damageMarked || 0, x.attachedTo || null, x.card?.name === NEUTRAL ? "P" : x.card?.name]),
    };
  }
  return {
    turn: s.turn, step: s.step, monarch: s.monarch ?? null, players, stack: (s.stack || []).map((o) => [o.kind, o.source?.name ?? null]),
    pendingTriggers: (s.pendingTriggers || []).map((t) => [t.source?.permanentId ?? null, t.event ?? null]), pendingChoice: s.pendingChoice?.kind ?? null,
    log: (s.log || []).map((e) => e.kind + (e.effect ? `:${e.effect}` : "")),
  };
}
function settle(s, max = 16) {
  let n = s;
  for (let i = 0; i < max && (n.stack?.length || 0) > 0 && !n.pendingChoice && n.priorityHolder; i++) n = GE.passPriority(n);
  return n;
}
const dispatch = (s, a) => { const r = AD.dispatchAction(s, a); return r?.state ?? r; };
const subjectOf = (s) => { const p = permOf(s, ID); return isCreature(p.card) ? ID : isAttachment(p.card) ? SUP : null; };

const SCENARIO = {
  cycle(s) {
    let n = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } } };
    const end = s.turn + 2;
    const done = (x) => x.turn > end || (x.turn === end && x.phase === "precombat-main");
    // a step with no priority (untap, cleanup — CR 502.4, 514.3) advances by itself (nextStep); every other step ends by passes
    for (let i = 0; i < 900 && !done(n) && !n.pendingChoice && !n.gameOver; i++) n = n.priorityHolder ? GE.passPriority(n) : GE.nextStep(n);
    return digest(n);
  },
  cast(s) {
    const out = {};
    const subj = subjectOf(s) ?? ID;
    const acts = LC.legalActionsForPlayer(s, "user");
    const bolt = (id) => acts.find((a) => a.kind === "cast-spell" && a.cardId === "hand-bolt" && (a.targets || []).some((t) => t.id === id));
    out.boltIt = (() => { const a = bolt(subj); return a ? digest(settle(dispatch(s, a))) : "not offered"; })();
    out.boltYou = (() => { const a = bolt("user"); return a ? digest(settle(dispatch(s, a))) : "not offered"; })();
    out.x2 = (() => { const a = acts.find((x) => x.kind === "cast-spell" && x.cardId === "hand-x" && x.xValue === 2); return a ? digest(settle(dispatch(s, a))) : "not offered"; })();
    return out;
  },
  combat(s) {
    const subj = subjectOf(s);
    if (!subj) return null;
    const p = permOf(s, subj);
    const blockers = ["aiBear", "aiFlyer", "aiSpider", "aiWall", "aiShadow"];
    const attacking = (extra = []) => ({ ...s, priorityHolder: "ai", phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: subj, attackingPlayer: "user", defender: "ai" }], blockers: extra } });
    const offers = (st) => LC.legalActionsForPlayer(st, "ai").filter((a) => a.kind === "declare-blocker").map((a) => [a.permanentId, a.attackerId]);
    const declare = LC.legalActionsForPlayer({ ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } }, "user").filter((a) => a.kind === "declare-attacker").map((a) => [a.permanentId, a.defender ?? a.target ?? null]);
    const unblocked = CR.resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: subj, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    const blocked = CR.resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: subj, attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "aiBear", attackerId: subj }] } });
    const blocking = CR.resolveCombatDamage({ ...s, activePlayer: "ai", phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "aiBear", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: subj, attackerId: "aiBear" }] } });
    return {
      canBeBlockedBy: blockers.map((b) => CE.canBlockAttacker(s, b, subj, "ai")), canBlock: blockers.map((a) => CE.canBlockAttacker(s, subj, a, "user")),
      maxBlocks: CE.maxBlocksFor(s, p, "user"), minBlockers: CE.attackerMinBlockers(s, subj), declare,
      offersNone: offers(attacking()), offersOne: offers(attacking([{ blockerId: "aiBear", attackerId: subj }])),
      unblocked: digest(unblocked), blocked: digest(blocked), blocking: digest(blocking),
    };
  },
  actions(s) {
    return { actions: LC.legalActionsForPlayer(s, "user"), mana: M.manaSources(s, "user") };
  },
};

// ─── the comparison ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const [shardI, shardN] = argv.shard != null ? String(argv.shard).split("/").map(Number) : [0, 1];
const only = argv.names ? new Set(String(argv.names).split("|")) : null;
let names = [...byName.keys()].filter((n) => {
  const c = byName.get(n);
  const t = String(c.type || "");
  return PERMANENT_RE.test(frontType(c)) && !NOT_A_CARD_RE.test(t) && textOf(c) !== "" && (!only || only.has(n));
}).sort();
if (argv.limit) names = names.slice(0, Number(argv.limit));
names = names.filter((_, i) => i % shardN === shardI);

const result = { scenarios: {}, differences: [] };
for (const sc of SCENARIOS) result.scenarios[sc] = { compared: 0, differ: 0, errors: 0 };
for (const n of names) {
  const c = card(n);
  for (const sc of SCENARIOS) {
    const r = result.scenarios[sc];
    let lost, twin, error = null;
    try {
      G._resetIdsForTests?.();
      lost = SCENARIO[sc](lose(board(renamed(c))));
      G._resetIdsForTests?.();
      twin = SCENARIO[sc](lose(board(twinOf(c))));
    } catch (e) {
      error = String(e?.message || e).slice(0, 160);
    }
    if (!error && lost === null && twin === null) continue; // the scenario does not apply (combat: no creature to fight)
    r.compared += 1;
    if (error) { r.errors += 1; result.differences.push({ scenario: sc, name: n, keys: [], error }); continue; }
    const a = JSON.stringify(lost), b = JSON.stringify(twin);
    if (a === b) continue;
    r.differ += 1;
    const keys = Object.keys({ ...(lost || {}), ...(twin || {}) }).filter((k) => JSON.stringify(lost?.[k]) !== JSON.stringify(twin?.[k]));
    result.differences.push({ scenario: sc, name: n, type: c.type, keys, lost: Object.fromEntries(keys.map((k) => [k, lost?.[k]])), twin: Object.fromEntries(keys.map((k) => [k, twin?.[k]])) });
  }
}
if (argv.out) fs.writeFileSync(argv.out, JSON.stringify(result, null, 1));
if (argv.shard == null) report(result);
