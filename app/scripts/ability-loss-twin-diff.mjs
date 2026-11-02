/**
 * ability-loss-twin-diff.mjs — THE WHOLE-CORPUS TWIN COMPARISONS of the ability-loss program (docs/orchestration/ABILITY-LOSS-PROGRAM.md
 * §5.3; the S0b review's four differentials, kept as a tool).
 *
 * Every bundled card that can be a permanent and has rules text is put on a board twice, each time having lost all its abilities (a
 * fixed-mode `loseAllAbilities` stored through layers.addContinuousEffect, CR 613.1f): once as the printed card, once as its no-text twin
 * (the same characteristics and faces, every rules text blanked, no keywords; a "*" stat the lost characteristic-defining ability
 * defined carries the number it reads once lost — twinOf, the S1 review's F1). Both are under one NEUTRAL name, so a name-keyed table
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
 * --effect=s2 (the ability-loss S2 — "loses all other card types"): every bundled PERMANENT card but an Aura (text or none — a creature
 * card, and a noncreature card an effect can make a creature: a Vehicle crewed, a land or an artifact animated, an enchantment
 * creature's sort; an Aura never — an Aura that is also a creature can't enchant anything and is put into its owner's graveyard, CR
 * 303.4d, so an S2 Aura's "Enchant creature" never reaches one) instead takes the S2 Aura
 * forms' whole effect, stored part by part — setCardTypes [Creature] (layer 4, CR 205.1a), every creature type replaced by Frog (layer
 * 4), blue (layer 5, CR 105.3), the loss (layer 6, CR 613.1f), base 1/1 (7b, CR 613.4b) — and its twin is the creature that effect makes
 * it, PRINTED: the same supertypes, "Creature — Frog", blue, 1/1, no text, no faces, the same mana cost and colour identity (CR 903.4a),
 * under the same effect. The default twin shares the printed card's type line, colours and P/T, so a reader that reads the PRINTED card
 * types (an "artifact" or a "land" read off the type line), subtypes, colours or P/T instead of the derived ones agrees with it by
 * construction; this twin disagrees exactly there. In this mode the probe is never put on the supporting Bears (the twin is no
 * Equipment), so a printed Equipment creature (Lion Sash) is compared unattached; and the user holds the type readers TYPE_READERS names
 * (Shatter, Terror, Stone Rain, Disenchant, Doom Blade, Frogmite, Broken Wings) and controls Tempered Steel, Quirion Ranger and Atog. A
 * fifth scenario, readers (the default in this mode — the S2 review's F7), reads the board counts and pools straight off the probe: its
 * domain and party alone (layers.domainCount / partyCount — CR 305.6, 700.8), whether each widened clone scope offers it
 * (cloneCopy.cloneCandidates — Copy Enchantment, Clever Impersonator, Mirrormade, Sculpting Steel, Phyrexian Metamorph), Sphere of
 * Safety's tax with the probe on its controller's side (attackTax.attackTaxDetail — CR 508.1h), the sacrifice pools it fills
 * (removal.sacrificePoolMatchNow) and its row in the board snapshot (boardSnapshot — type line, lands or permanents).
 *
 * usage (cwd = app; MTG_APP_ROOT = a data root holding data/scryfall-bulk — read only):
 *   node scripts/ability-loss-twin-diff.mjs [--effect=loss|s2] [--scenarios=cycle,cast,combat,actions(,readers)] [--workers=8] [--limit=N] [--names=A|B] [--out=diff.json]
 * Prints per scenario the cards compared and the cards that differ; --out writes every difference (the digest keys that differ, and
 * both values) for the reasons to be read off. Heavy (the whole corpus — run it through the gate queue).
 */
import { fork } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const EFFECT = String(argv.effect || "loss");
const SCENARIOS = String(argv.scenarios || (EFFECT === "s2" ? "cycle,cast,combat,actions,readers" : "cycle,cast,combat,actions")).split(",");
if (!["loss", "s2"].includes(EFFECT)) { console.error(`ability-loss-twin-diff: unknown --effect=${EFFECT} (loss | s2)`); process.exit(2); }
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
  const merged = { scenarios: {}, differences: [], starTwins: [], bystanderFails: [], ...(EFFECT === "s2" ? { corpus: { creature: 0, noncreature: 0 } } : {}) };
  for (const p of parts) {
    for (const [k, v] of Object.entries(p.scenarios)) {
      const m = (merged.scenarios[k] ??= { compared: 0, differ: 0, errors: 0 });
      m.compared += v.compared; m.differ += v.differ; m.errors += v.errors;
    }
    merged.differences.push(...p.differences);
    merged.starTwins.push(...(p.starTwins || []));
    merged.bystanderFails.push(...(p.bystanderFails || []));
    if (merged.corpus && p.corpus) { merged.corpus.creature += p.corpus.creature; merged.corpus.noncreature += p.corpus.noncreature; }
  }
  merged.starTwins.sort();
  merged.differences.sort((a, b) => a.scenario.localeCompare(b.scenario) || a.name.localeCompare(b.name));
  report(merged);
  if (argv.out) fs.writeFileSync(argv.out, JSON.stringify(merged, null, 1));
  process.exit(0);
}

function report(r) {
  console.log(`effect: ${EFFECT}`);
  for (const [k, v] of Object.entries(r.scenarios)) console.log(`${k}: ${v.compared} compared, ${v.differ} differ, ${v.errors} errors`);
  console.log(`twins carrying a lost "*" number (F1): ${(r.starTwins || []).length}`);
  if (EFFECT === "s2") console.log(`boards where an unaffected Treasure, Food or Forest read wrong (the bystanders): ${(r.bystanderFails || []).length}${(r.bystanderFails || []).length ? ` — ${r.bystanderFails.slice(0, 5).join(", ")} …` : ""}`);
  if (r.corpus) console.log(`corpus: ${r.corpus.creature} creature cards, ${r.corpus.noncreature} noncreature permanent cards`);
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
const CC = await import("../src/lib/learn/cloneCopy.js");
const ATX = await import("../src/lib/learn/attackTax.js");
const RM = await import("../src/lib/learn/effects/atoms/removal.js");
const BSN = await import("../src/lib/learn/boardSnapshot.js");
const TK = await import("../src/lib/learn/effects/atoms/tokens.js");
const { allCards, publicCard } = await import("../src/lib/server/cardIndex.js");
const { mergeCardData } = await import("../src/lib/server/learnDeckEnrich.js");

const NEUTRAL = "Probe Permanent";
const ID = "probe";
const SUP = "sup";
const byName = new Map();
const PERMANENT_RE = /\b(Creature|Artifact|Enchantment|Land|Planeswalker|Battle)\b/;
const NOT_A_CARD_RE = /\b(Token|Emblem|Scheme|Plane|Phenomenon|Vanguard|Dungeon|Conspiracy|Sticker|Attraction)\b/;
// A name's first bundled record can be a TOKEN of the same name (52 names: Ornithopter, Tarmogoyf, Spirit …), and NOT_A_CARD_RE then drops
// the name. In --effect=s2 the card wins over the token, so those cards are compared; the loss mode keeps the first record, so its
// corpus stays the one its baseline (the base commit's own tool) compared.
const isTokenRecord = (raw) => /\bToken\b/.test(String(raw.type_line || raw.type || ""));
const tokenFirst = new Set(); // the names whose kept record is a token
for (const raw of allCards()) {
  const pc = mergeCardData({ name: raw.name }, publicCard(raw, [], {}));
  if (byName.has(pc.name) && !(EFFECT === "s2" && tokenFirst.has(pc.name) && !isTokenRecord(raw))) continue;
  byName.set(pc.name, { ...pc, card_faces: publicCard(raw, [], {}).card_faces });
  if (isTokenRecord(raw)) tokenFirst.add(pc.name); else tokenFirst.delete(pc.name);
}
const card = (n) => { const c = byName.get(n); if (!c) throw new Error(`no bundled card ${n}`); return c; };
const textOf = (c) => [c.oracle || "", ...(c.card_faces || []).map((f) => f.oracle_text || f.oracle || "")].join("\n").trim();
const frontType = (c) => String(c.type || c.type_line || "").split(" // ")[0];
const isCreature = (c) => /\bCreature\b/.test(frontType(c));
const isAttachment = (c) => /\b(Aura|Equipment)\b/.test(frontType(c));
const isAura = (c) => /\bAura\b/.test(frontType(c));

/**
 * A "*" STAT A LOST ABILITY DEFINED (the ability-loss S1 review's F1): a printed "*" that the card's characteristic-defining ability
 * defines (CR 208.2a, 604.3) is gone with that ability once the card has lost all its abilities, and the engine reads it as 0 with the
 * printed number kept ("*" 0, "1+*" 1 — layers.applyLayer7). The twin has no text to define it, so it carries that number; a "*" no such
 * ability defines (an "As this creature enters" choice, CR 208.2b) stays "*" on both. Without this, every such card differs from its
 * twin by construction (the twin's "*" is an unread stand-in the lost card no longer has) and its other readers go uncompared.
 */
const STAR_CDA_RE = L.STAR_CDA_PATTERNS; // the engine's own two patterns (layers.starCdaStats), so the twin and the engine cannot drift
function lostStarStat(c, stat) {
  const v = String(c[stat] ?? "").replace(/\s+/g, "");
  if (!v.includes("*") || !/^[+-]?(?:\d+|\*)(?:[+-](?:\d+|\*))*$/.test(v) || !STAR_CDA_RE[stat].test(String(c.oracle ?? c.oracle_text ?? ""))) return c[stat];
  return String([...v.matchAll(/([+-]?)(\d+|\*)/g)].reduce((n, m) => n + (m[2] === "*" ? 0 : (m[1] === "-" ? -1 : 1) * parseInt(m[2], 10)), 0));
}

/** The no-text twin: the same characteristics and faces, every rules text blanked, no keywords, the neutral name (a "*" its lost CDA defined: its number). */
function twinOf(c) {
  const lostStars = Object.fromEntries(["power", "toughness"].map((st) => [st, lostStarStat(c, st)]).filter(([st, v]) => v !== c[st]));
  return { ...c, name: NEUTRAL, oracle: "", oracle_text: "", keywords: [], ...lostStars,
    ...(Array.isArray(c.card_faces) ? { card_faces: c.card_faces.map((f) => ({ ...f, oracle_text: "", oracle: "" })) } : {}) };
}
/** A card whose twin carries a lost "*" number (the F1 class, counted in the summary). */
const twinStarCarrier = (c) => ["power", "toughness"].some((st) => lostStarStat(c, st) !== c[st]);
const renamed = (c) => ({ ...c, name: NEUTRAL });

/** The board (the readers test's): the probe under the user (on its own Grizzly Bears when an Aura or Equipment), basic lands, a deep
 *  pool, a hand of Lightning Bolt and Endless One (ten permanents: Ascend can reach the city's blessing); the opponent's blocker panel; every permanent untapped and not summoning sick. */
function board(pc, { attach = true, typeReaders = false } = {}) {
  const s0 = G.createGameState({ userDeck: [], aiDeck: [] });
  let ts = 1;
  const perm = (id, c, controller, extra = {}) => ({ ...G.createPermanent({ id, card: { ...c, id: `card-${id}` }, controller, summoningSick: false }), timestamp: ts++, enteredOnTurn: 1, ...extra });
  const probeExtra = pc.loyalty != null && Number.isFinite(Number(pc.loyalty)) ? { counters: { loyalty: Number(pc.loyalty) } } : {};
  const user = [perm(SUP, card("Grizzly Bears"), "user"), perm(ID, pc, "user", probeExtra)];
  if (attach && isAttachment(pc)) { user[1].attachedTo = SUP; user[0].attachments = [ID]; }
  for (const n of ["Forest", "Forest", "Forest", "Plains", "Plains", "Island", "Swamp", "Mountain"]) user.push(perm(`u-${user.length}`, card(n), "user"));
  if (typeReaders) for (const n of TYPE_READER_PERMANENTS) user.push(perm(`u-${n.replace(/\W+/g, "").toLowerCase()}`, card(n), "user"));
  const ai = [perm("aiBear", card("Grizzly Bears"), "ai"), perm("aiFlyer", card("Ornithopter"), "ai"), perm("aiSpider", card("Giant Spider"), "ai"),
    perm("aiWall", card("Wall of Wood"), "ai"), perm("aiShadow", card("Dauthi Slayer"), "ai"), perm("a-5", card("Plains"), "ai"), perm("a-6", card("Island"), "ai")];
  const pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
  return {
    ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", timestampCounter: ts,
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: [{ ...card("Lightning Bolt"), id: "hand-bolt" }, { ...card("Endless One"), id: "hand-x" }, ...(typeReaders ? TYPE_READERS.map((n, i) => ({ ...card(n), id: `hand-t${i}` })) : [])], manaPool: { ...s0.players.user.manaPool, ...pool },
        library: ["Forest", "Plains", "Grizzly Bears", "Island", "Swamp"].map((n, i) => ({ ...card(n), id: `lib-${i}` })) },
      ai: { ...s0.players.ai, battlefield: ai, hand: [{ ...card("Grizzly Bears"), id: "ai-hand-0" }], library: ["Island", "Plains", "Forest"].map((n, i) => ({ ...card(n), id: `ai-lib-${i}` })) },
    },
  };
}
const lose = (s) => L.addContinuousEffect(s, { layer: 6, op: { layerOp: "loseAllAbilities" }, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state;
// --effect=s2: the S2 Aura forms' effect (abilityLossShapes.js, stage S2) stored on the probe — Frogify's "loses all abilities and is a
// blue Frog creature with base power and toughness 1/1" — and the twin printed as the creature it makes.
const S2_PARTS = [
  { layer: 4, op: { layerOp: "setCardTypes", types: ["Creature"] } }, { layer: 4, op: { layerOp: "replaceCreatureTypes", subtypes: ["Frog"] } },
  { layer: 5, op: { layerOp: "setColor", colors: ["U"] } }, { layer: 6, op: { layerOp: "loseAllAbilities" } },
  { layer: 7, sublayer: "7b", op: { layerOp: "ptSet", power: 1, toughness: 1 } },
];
const s2 = (s) => S2_PARTS.reduce((st, part) => L.addContinuousEffect(st, { ...part, affects: { mode: "fixed", permanentIds: [ID] }, duration: { kind: "permanent" }, source: { kind: "resolution", permanentId: null, controller: "ai" } }).state, s);
// the readers of a permanent's card types and colours an S2 effect changes, put in the user's hand (their target lists are part of the
// actions digest) and on the user's battlefield (Tempered Steel's "Artifact creatures you control get +2/+2"): "target artifact",
// "target nonartifact, nonblack creature", "target land", "target artifact or enchantment", "target nonblack creature", affinity for
// artifacts (Frogmite's cost), "target artifact, enchantment, or creature with flying" (Broken Wings — the S2 review's F1).
const TYPE_READERS = ["Shatter", "Terror", "Stone Rain", "Disenchant", "Doom Blade", "Frogmite", "Broken Wings"];
// …and on the battlefield: Tempered Steel ("Artifact creatures you control get +2/+2."), Quirion Ranger ("Return a Forest you control to its
// owner's hand: Untap target creature." — its cost pool), Atog ("Sacrifice an artifact: …" — its cost pool).
const TYPE_READER_PERMANENTS = ["Tempered Steel", "Quirion Ranger", "Atog"];
const SUPERTYPE_WORDS = new Set(["Basic", "Legendary", "Ongoing", "Snow", "World"]);
/** The S2 twin: the creature the S2 effect makes `c`, printed (its supertypes, "Creature — Frog", blue, 1/1, no text, no faces). */
function s2TwinOf(c) {
  const sup = frontType(c).split(/\s+[—-]\s+/)[0].split(/\s+/).filter((w) => SUPERTYPE_WORDS.has(w));
  const type = [...sup, "Creature"].join(" ") + " — Frog";
  const { card_faces: _faces, ...rest } = c;
  return { ...rest, name: NEUTRAL, type, type_line: type, colors: ["U"], power: "1", toughness: "1", oracle: "", oracle_text: "", keywords: [], layout: "normal" };
}
// --effect=s2 over an engine that reads printed types (the base) differs on thousands of cards, each with two whole action lists, and
// the merged --out string outgrew V8's limit (hold 6): in this mode a pair of values either of which is over 4 KB is kept as each one's
// sha256 and length, with 600 characters around the first character where they differ (equal values stay equal; the loss mode unchanged).
const kept = (a, b) => {
  const ja = JSON.stringify(a) ?? "undefined", jb = JSON.stringify(b) ?? "undefined";
  if (EFFECT !== "s2" || (ja.length <= 4096 && jb.length <= 4096)) return [a, b];
  let i = 0;
  while (i < ja.length && i < jb.length && ja[i] === jb[i]) i += 1;
  const stub = (j) => ({ sha256: crypto.createHash("sha256").update(j).digest("hex"), length: j.length, at: i, excerpt: j.slice(Math.max(0, i - 300), i + 300) });
  return [stub(ja), stub(jb)];
};
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
// --effect=s2: the probe fights when it is a creature NOW (every S2 probe is — the effect sets its card type to Creature; a printed
// Forest under it is a Frog creature), never on the Bears (the probe is unattached in this mode); the loss twin, as before.
const subjectOf = (s) => { const p = permOf(s, ID); if (EFFECT === "s2") return L.permanentIsCreature(s, ID) ? ID : null; return isCreature(p.card) ? ID : isAttachment(p.card) ? SUP : null; };

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
  // THE BOARD COUNTS AND POOLS, read straight off the probe (the S2 review's F7): its domain and party with it alone on its controller's
  // side, the widened clone scopes, Sphere of Safety's tax with the probe beside it, the sacrifice pools and the board snapshot's row.
  readers(s) {
    const alone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id === ID) } } };
    const sphere = { ...G.createPermanent({ id: "u-sphere", card: { ...card("Sphere of Safety"), id: "card-u-sphere" }, controller: "user", summoningSick: false }), timestamp: 0, enteredOnTurn: 1 };
    const withSphere = { ...alone, players: { ...alone.players, user: { ...alone.players.user, battlefield: [sphere, ...alone.players.user.battlefield] } } };
    const row = (BSN.boardSnapshot(s).players.find((p) => p.id === "user") || {});
    const at = (r) => (r || []).find((x) => x.id === ID);
    const probe = permOf(s, ID);
    // THE BYSTANDERS (the S2 recheck's R3): an unaffected Treasure and Food token beside the probe and the board's own Forest, each read
    // by the pools it must fill — on an S2 board both sides of the comparison share them, so a wrong read shows in `bystanderFails`.
    const bystanders = [["u-tr", "treasure"], ["u-fd", "food"]].map(([id, k]) => ({ ...G.createPermanent({ id, card: { ...TK.NAMED_TOKENS[k], token: true, id: `card-${id}` }, controller: "user", summoningSick: false }), timestamp: 0, enteredOnTurn: 1 }));
    const withTokens = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...bystanders] } } };
    const forest = withTokens.players.user.battlefield.find((p) => p.card?.name === "Forest");
    const bystander = [RM.sacrificePoolMatchNow("token:treasure", withTokens, bystanders[0]), RM.sacrificePoolMatchNow("token:food", withTokens, bystanders[1]),
      RM.sacrificePoolMatchNow("artifact", withTokens, bystanders[0]), RM.sacrificePoolMatchNow("land", withTokens, forest), L.permanentHasTypeWord(withTokens, forest.id, "Forest")];
    return {
      bystander,
      domain: L.domainCount(alone, "user"), party: L.partyCount(alone, "user"),
      clone: CLONE_SCOPES.map((sc) => CC.cloneCandidates(s, "user", sc).some((c) => c.id === ID)),
      sphereTax: ATX.attackTaxDetail(withSphere, "user").generic,
      sacPools: SAC_POOLS.map((w) => RM.sacrificePoolMatchNow(w, s, probe)),
      snapshot: at(row.lands) ? ["lands", at(row.lands).type] : ["permanents", at(row.permanents)?.type ?? null],
    };
  },
};
const CLONE_SCOPES = ["anyEnchantment", "anyNonlandPermanent", "anyArtifactOrEnchantment", "anyArtifact", "anyEquipment", "anyArtifactOrCreature"];
const SAC_POOLS = ["permanent", "land", "artifact", "enchantment", "artifactOrEnchantment", "nonbasicLand", "planeswalker", "token:treasure", "token:food", "token:clue"];

// ─── the comparison ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const [shardI, shardN] = argv.shard != null ? String(argv.shard).split("/").map(Number) : [0, 1];
const only = argv.names ? new Set(String(argv.names).split("|")) : null;
let names = [...byName.keys()].filter((n) => {
  const c = byName.get(n);
  const t = String(c.type || "");
  if (EFFECT === "s2") return PERMANENT_RE.test(frontType(c)) && !isAura(c) && !NOT_A_CARD_RE.test(t) && (!only || only.has(n));
  return PERMANENT_RE.test(frontType(c)) && !NOT_A_CARD_RE.test(t) && textOf(c) !== "" && (!only || only.has(n));
}).sort();
if (argv.limit) names = names.slice(0, Number(argv.limit));
names = names.filter((_, i) => i % shardN === shardI);

const result = { scenarios: {}, differences: [], starTwins: [], bystanderFails: [], ...(EFFECT === "s2" ? { corpus: { creature: names.filter((n) => isCreature(byName.get(n))).length, noncreature: names.filter((n) => !isCreature(byName.get(n))).length } } : {}) };
for (const sc of SCENARIOS) result.scenarios[sc] = { compared: 0, differ: 0, errors: 0 };
for (const n of names) {
  const c = card(n);
  if (EFFECT === "loss" && twinStarCarrier(c)) result.starTwins.push(n);
  for (const sc of SCENARIOS) {
    const r = result.scenarios[sc];
    let lost, twin, error = null;
    try {
      G._resetIdsForTests?.();
      if (EFFECT === "s2") {
        lost = SCENARIO[sc](s2(board(renamed(c), { attach: false, typeReaders: true })));
        if (sc === "readers" && (lost?.bystander || []).some((v) => !v)) result.bystanderFails.push(n);
        G._resetIdsForTests?.();
        twin = SCENARIO[sc](s2(board(s2TwinOf(c), { attach: false, typeReaders: true })));
      } else {
        lost = SCENARIO[sc](lose(board(renamed(c))));
        G._resetIdsForTests?.();
        twin = SCENARIO[sc](lose(board(twinOf(c))));
      }
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
    const pair = Object.fromEntries(keys.map((k) => [k, kept(lost?.[k], twin?.[k])]));
    result.differences.push({ scenario: sc, name: n, type: c.type, keys, lost: Object.fromEntries(keys.map((k) => [k, pair[k][0]])), twin: Object.fromEntries(keys.map((k) => [k, pair[k][1]])) });
  }
}
if (argv.out) fs.writeFileSync(argv.out, JSON.stringify(result, null, 1));
if (argv.shard == null) report(result);
