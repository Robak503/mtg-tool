/**
 * triggerScopes.test.js — BLITZ TR-2: the TRIGGER-SCOPE batch (CEN-3 census vein #2).
 *
 * Three trigger forms the census probe-verified as UNDETECTED, wired end-to-end:
 *   1. "At the beginning of EACH PLAYER'S upkeep, <effect>" (CR 603.2b + 503.1a) — fires once at EVERY
 *      upkeep (once per player per turn cycle), controller-independent. "That player" in the effect is the
 *      player whose upkeep it is: detectTriggers rewrites it to the corpus-clean SENTINEL "the upkeep
 *      player"; the who:"upkeepPlayer" atoms read ctx.upkeepPlayerId (threaded by checkStepTriggers =
 *      state.activePlayer at the upkeep-step entry); the triggerRouting referent gate pins those atoms to
 *      the upkeep event (the gyOwner double-gate pattern).
 *   2. "Whenever this creature BLOCKS OR BECOMES BLOCKED, <effect>" (CR 509.1a/509.1h) — the bare compound
 *      self form rides the EXISTING blocksOrBecomesBlocked runtime event (checkBlockTriggers' bushido loop):
 *      once for a declared blocker, once for a blocked attacker, deduped per creature per declaration.
 *   3. "attacks alone" (CR 506.5 / 702.83b) — the sole-attacker event, fired by checkAttackTriggers ONLY
 *      when attackers.length === 1 (the KW-EXALTED structural seam), scopes self + creatureYouControl.
 *
 * CREED pins: each-player upkeep fires on EVERY player's upkeep exactly once (full cycle), a your-upkeep
 * card does NOT fire off-turn, blocks and becomes-blocked each fire at declaration exactly once, a
 * multi-attacker declaration NEVER fires attacksAlone, and the referent gate keeps who:"upkeepPlayer"
 * atoms off every non-upkeep event. FN guards: the compound/filtered/attached/two-subtype forms stay
 * UNDETECTED → Arbiter (whole-card law).
 *
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-17); every flip audited by name in the TR-2
 * flip-diff. CR cites verified against knowledge/mtg-judge/data/cr/cr_current.json.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, creaturePower, findPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkStepTriggers, checkAttackTriggers, checkBlockTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { resolveSacrificeChoice, autoPickSacrificeCandidate } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── REAL current Oracle wordings (verified against the bundled corpus, 2026-07-17) ──
const NECROGEN_MISTS = { name: "Necrogen Mists", type: "Enchantment", mana: "{2}{B}",
  oracle: "At the beginning of each player's upkeep, that player discards a card." };
const WORRY_BEADS = { name: "Worry Beads", type: "Artifact", mana: "{3}",
  oracle: "At the beginning of each player's upkeep, that player mills a card." };
const COPPER_TABLET = { name: "Copper Tablet", type: "Artifact", mana: "{2}",
  oracle: "At the beginning of each player's upkeep, this artifact deals 1 damage to that player." };
const SEIZAN = { name: "Seizan, Perverter of Truth", type: "Legendary Creature — Demon Spirit", mana: "{3}{B}{B}{B}", power: 6, toughness: 5,
  oracle: "At the beginning of each player's upkeep, that player loses 2 life and draws two cards." };
const MOLDER_SLUG = { name: "Molder Slug", type: "Creature — Slug Beast", mana: "{2}{G}{G}", power: 4, toughness: 6,
  oracle: "At the beginning of each player's upkeep, that player sacrifices an artifact of their choice." };
const BOTTOMLESS_PIT = { name: "Bottomless Pit", type: "Enchantment", mana: "{1}{B}{B}",
  oracle: "At the beginning of each player's upkeep, that player discards a card at random." };
const BRAIDS_MINION = { name: "Braids, Cabal Minion", type: "Legendary Creature — Human Minion", mana: "{2}{B}{B}", power: 2, toughness: 2,
  oracle: "At the beginning of each player's upkeep, that player sacrifices an artifact, creature, or land of their choice." };
const DESTRUCTIVE_FLOW = { name: "Destructive Flow", type: "Enchantment", mana: "{B}{R}{G}",
  oracle: "At the beginning of each player's upkeep, that player sacrifices a nonbasic land of their choice." };
const JUZAM = { name: "Juzám Djinn", type: "Creature — Djinn", mana: "{2}{B}{B}", power: 5, toughness: 5,
  oracle: "At the beginning of your upkeep, this creature deals 1 damage to you." };

const CHUB_TOAD = { name: "Chub Toad", type: "Creature — Frog", mana: "{2}{G}", power: 1, toughness: 1,
  oracle: "Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn." };
const ESCAPED_NULL = { name: "Escaped Null", type: "Creature — Zombie", mana: "{4}{W}", power: 3, toughness: 4,
  oracle: "Lifelink\nWhenever this creature blocks or becomes blocked, it gets +5/+0 until end of turn." };
const RAGING_GORILLA = { name: "Raging Gorilla", type: "Creature — Ape", mana: "{2}{R}", power: 3, toughness: 3,
  oracle: "Whenever this creature blocks or becomes blocked, it gets +2/-2 until end of turn." };
const KARN_GOLEM = { name: "Karn, Silver Golem", type: "Legendary Artifact Creature — Golem", mana: "{5}", power: 4, toughness: 4,
  oracle: "Whenever Karn blocks or becomes blocked, it gets -4/+4 until end of turn.\n{1}: Target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value until end of turn." };

const ROGUE_KAVU = { name: "Rogue Kavu", type: "Creature — Kavu", mana: "{1}{R}", power: 1, toughness: 1,
  oracle: "Whenever this creature attacks alone, it gets +2/+0 until end of turn." };
const BATTLEGRACE = { name: "Battlegrace Angel", type: "Creature — Angel", mana: "{3}{W}{W}", power: 4, toughness: 4,
  oracle: "Flying\nExalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nWhenever a creature you control attacks alone, it gains lifelink until end of turn." };
const BLACK_PANTHER = { name: "Black Panther, Claws of Bast", type: "Legendary Creature — Human Noble Hero", mana: "{1}{G}{W}", power: 2, toughness: 3,
  oracle: "Lifelink (Damage dealt by this creature also causes you to gain that much life.)\nWhenever a creature you control attacks alone, put a +1/+1 counter on it." };
const AGENTS_SHIELD = { name: "Agents of S.H.I.E.L.D.", type: "Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 3,
  oracle: "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn." };
const PEGGY_CARTER = { name: "Peggy Carter, Secret Agent", type: "Legendary Creature — Human Soldier", mana: "{1}{W}", power: 2, toughness: 2,
  oracle: "Whenever a creature you control attacks alone, it gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)" };
const NEFAROX = { name: "Nefarox, Overlord of Grixis", type: "Legendary Creature — Demon", mana: "{4}{B}{B}", power: 5, toughness: 5,
  oracle: "Flying\nExalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nWhenever Nefarox attacks alone, defending player sacrifices a creature of their choice." };

// FN-guard fixtures (real oracles that must stay parked)
const WOEBRINGER = { name: "Woebringer Demon", type: "Creature — Demon", mana: "{3}{B}{B}", power: 4, toughness: 4,
  oracle: "Flying\nAt the beginning of each player's upkeep, that player sacrifices a creature of their choice. If the player can't, sacrifice this creature." };
const SULFURIC_VORTEX = { name: "Sulfuric Vortex", type: "Enchantment", mana: "{1}{R}{R}",
  oracle: "At the beginning of each player's upkeep, this enchantment deals 2 damage to that player.\nIf a player would gain life, that player gains no life instead." };
const MA_CHAO = { name: "Ma Chao, Western Warrior", type: "Legendary Creature — Human Soldier Warrior", mana: "{3}{R}", power: 3, toughness: 3,
  oracle: "Horsemanship (This creature can't be blocked except by creatures with horsemanship.)\nWhenever Ma Chao attacks alone, it can't be blocked this combat." };
const SERRA_INQUISITORS = { name: "Serra Inquisitors", type: "Creature — Human Cleric", mana: "{3}{W}{W}", power: 3, toughness: 5,
  oracle: "Whenever this creature blocks or becomes blocked by one or more black creatures, this creature gets +2/+0 until end of turn." };
const DEAD_IRON_SLEDGE = { name: "Dead-Iron Sledge", type: "Artifact — Equipment", mana: "{1}",
  oracle: "Whenever equipped creature blocks or becomes blocked by a creature, destroy both creatures.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" };
const SELFLESS_SAMURAI = { name: "Selfless Samurai", type: "Creature — Human Samurai", mana: "{1}{W}", power: 2, toughness: 1,
  oracle: "Whenever a Samurai or Warrior you control attacks alone, it gains lifelink until end of turn.\nSacrifice this creature: Another target creature you control gains indestructible until end of turn." };

// ── helpers ──────────────────────────────────────────────────────────────────────
const crea = (id, name, controller, power = 2, toughness = 2, oracle = "") =>
  createPermanent({ id, card: { id, name, type: "Creature — Bear", mana: "{2}", cmc: 2, power, toughness, oracle }, controller, summoningSick: false });
const art = (id, name, controller) =>
  createPermanent({ id, card: { id, name, type: "Artifact", mana: "{1}", cmc: 1, oracle: "" }, controller });
const perm = (id, card, controller) => createPermanent({ id, card: { id, ...card }, controller, summoningSick: false });

const lib = (prefix, n) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-l${i}`, name: `${prefix}Card${i}`, type: "Sorcery", mana: "{1}", cmc: 1, oracle: "" }));

function state({ userBf = [], aiBf = [], userHand = [], aiHand = [], userLib = [], aiLib = [], activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "beginning", step: "upkeep", activePlayer, priorityHolder: activePlayer, consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: userBf, hand: userHand, library: userLib, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, hand: aiHand, library: aiLib, life: 40 } } };
}

const settle = (s) => {
  let guard = 0;
  while ((s.pendingChoice || s.stack?.length || s.pendingTriggers?.length) && guard++ < 40) {
    if (s.pendingChoice?.kind === "sacrifice-choice") s = resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, s.pendingChoice));
    else if (s.pendingChoice) break;
    else if (s.stack?.length) s = resolveTopOfStack(s);
    else s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  }
  return s;
};

// ─── 1. Detection + coverage — the audited flips (real oracles) ──────────────────
describe("TR-2 detection — each-player's-upkeep carriers flip native-trigger", () => {
  it("the eight audited upkeep carriers classify native-trigger", () => {
    for (const c of [NECROGEN_MISTS, WORRY_BEADS, COPPER_TABLET, SEIZAN, MOLDER_SLUG, BOTTOMLESS_PIT, BRAIDS_MINION, DESTRUCTIVE_FLOW]) {
      expect(classifyCard(c), c.name).toBe("native-trigger");
    }
  });
  it("the descriptor is whose:'any' + eachPlayersUpkeep, with the sentinel-rewritten effect", () => {
    const ds = detectTriggers(NECROGEN_MISTS);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "upkeep", scope: "you", whose: "any", eachPlayersUpkeep: true,
      effectClause: "the upkeep player discards a card" });
    expect(triggerRoutesNatively(ds[0])).toBe(true);
  });
  it("Seizan's shared-subject conjunction parses to lose-life + draw, both who:'upkeepPlayer', in written order", () => {
    const p = parseEffectClause("the upkeep player loses 2 life and draws two cards", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "lose-life", amount: 2, who: "upkeepPlayer", targetType: null },
      { op: "draw", amount: 2, who: "upkeepPlayer", targetType: null },
    ]);
  });
  it("the edict pools: artifact / artifact-creature-or-land / nonbasic-land parse who:'upkeepPlayer'", () => {
    expect(parseEffectClause("the upkeep player sacrifices an artifact of their choice", "Creature").atoms)
      .toEqual([{ op: "sacrifice", who: "upkeepPlayer", what: "artifact" }]);
    expect(parseEffectClause("the upkeep player sacrifices an artifact, creature, or land of their choice", "Creature").atoms)
      .toEqual([{ op: "sacrifice", who: "upkeepPlayer", what: "artifactCreatureOrLand" }]);
    expect(parseEffectClause("the upkeep player sacrifices a nonbasic land of their choice", "Enchantment").atoms)
      .toEqual([{ op: "sacrifice", who: "upkeepPlayer", what: "nonbasicLand" }]);
  });
  it("FN guards — compound / filtered / replacement-rider carriers stay parked (whole-card law)", () => {
    expect(classifyCard(WOEBRINGER)).toBe("body-only");        // "If the player can't, sacrifice this creature" rider
    expect(classifyCard(SULFURIC_VORTEX)).toBe("body-only");   // lifegain-replacement second line
    // filtered edict victims fail the exact anchor → the effect stays LOW
    expect(programConfidence(parseEffectClause("the upkeep player sacrifices a monocolored creature of their choice", "Creature"))).toBe("low");
    expect(programConfidence(parseEffectClause("the upkeep player sacrifices a non-elf creature of their choice", "Creature"))).toBe("low");
  });
  it("REFERENT GATE — who:'upkeepPlayer' routes ONLY on the upkeep event (the metric mirrors the runtime)", () => {
    const d = (event) => ({ event, scope: "self", whose: "any", effect: null, optional: false,
      effectClause: "the upkeep player discards a card", sourceText: "t" });
    expect(triggerRoutesNatively(d("upkeep"))).toBe(true);
    for (const ev of ["etb", "dies", "attacks", "endStep", "combatDamageToPlayer"]) {
      expect(triggerRoutesNatively(d(ev)), ev).toBe(false);
    }
  });
});

describe("TR-2 detection — blocks-or-becomes-blocked carriers flip; restricted forms stay parked", () => {
  it("the bare self compound classifies native-trigger (Chub Toad / Escaped Null / Raging Gorilla)", () => {
    for (const c of [CHUB_TOAD, ESCAPED_NULL, RAGING_GORILLA]) {
      expect(classifyCard(c), c.name).toBe("native-trigger");
      const d = detectTriggers(c).find((t) => t.event === "blocksOrBecomesBlocked");
      expect(d).toMatchObject({ event: "blocksOrBecomesBlocked", scope: "self", whose: "any" });
      expect(triggerRoutesNatively(d)).toBe(true);
    }
  });
  it("a NAME self-subject detects (Karn, Silver Golem) but the card honestly parks on its activated ability", () => {
    const d = detectTriggers(KARN_GOLEM).find((t) => t.event === "blocksOrBecomesBlocked");
    expect(d).toMatchObject({ event: "blocksOrBecomesBlocked", scope: "self",
      effectClause: "this creature gets -4/+4 until end of turn" });
    expect(classifyCard(KARN_GOLEM)).toBe("body-only"); // the animate activated ability is unmodeled residue
  });
  it("FN guards — filtered ('by one or more black creatures') and attached ('equipped creature') forms stay undetected", () => {
    expect(detectTriggers(SERRA_INQUISITORS).filter((t) => t.event === "blocksOrBecomesBlocked")).toHaveLength(0);
    expect(detectTriggers(DEAD_IRON_SLEDGE).filter((t) => t.event === "blocksOrBecomesBlocked")).toHaveLength(0);
    expect(classifyCard(SERRA_INQUISITORS)).toBe("body-only");
  });
});

describe("TR-2 detection — attacks-alone carriers flip; unexpressible scopes stay parked", () => {
  it("self + creature-you-control forms classify native-trigger (six audited carriers)", () => {
    for (const c of [ROGUE_KAVU, BATTLEGRACE, BLACK_PANTHER, AGENTS_SHIELD, PEGGY_CARTER, NEFAROX]) {
      expect(classifyCard(c), c.name).toBe("native-trigger");
    }
  });
  it("descriptor shapes: self (Rogue Kavu / Nefarox) vs creatureYouControl (Battlegrace / Agents)", () => {
    expect(detectTriggers(ROGUE_KAVU)[0]).toMatchObject({ event: "attacksAlone", scope: "self",
      effectClause: "this creature gets +2/+0 until end of turn" });
    expect(detectTriggers(NEFAROX).find((t) => t.event === "attacksAlone")).toMatchObject({ scope: "self",
      effectClause: "defending player sacrifices a creature of their choice" });
    expect(detectTriggers(BATTLEGRACE).find((t) => t.event === "attacksAlone")).toMatchObject({ scope: "creatureYouControl",
      effectClause: "the triggering creature gains lifelink until end of turn" });
    // "that creature gets …" subject (Agents of S.H.I.E.L.D.) rewrites through THAT_CREATURE_PUMP_RE
    expect(detectTriggers(AGENTS_SHIELD)[0]).toMatchObject({ scope: "creatureYouControl",
      effectClause: "the triggering creature gets +1/+1 until end of turn" });
  });
  it("FN guards — the two-subtype filter stays undetected; an unmodeled payoff parks the card", () => {
    expect(detectTriggers(SELFLESS_SAMURAI).filter((t) => t.event === "attacksAlone")).toHaveLength(0);
    expect(classifyCard(SELFLESS_SAMURAI)).toBe("body-only");
    // Ma Chao detects (self-name subject) but "can't be blocked this combat" is unmodeled → parks
    const mc = detectTriggers(MA_CHAO).find((t) => t.event === "attacksAlone");
    expect(mc).toBeTruthy();
    expect(triggerRoutesNatively(mc)).toBe(false);
    expect(classifyCard(MA_CHAO)).toBe("body-only");
  });
});

// ─── 2. Runtime — each-player upkeep fires on EVERY upkeep exactly once ──────────
describe("TR-2 runtime — a full turn cycle: the trigger fires at BOTH players' upkeeps, once each", () => {
  it("Copper Tablet (user's) pings the upkeep player at each upkeep — user's turn hits user, ai's turn hits ai", () => {
    let s = state({ userBf: [perm("tab", COPPER_TABLET, "user")], activePlayer: "user" });
    const atUser = checkStepTriggers(s, "upkeep");
    const upkeepPendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.eachPlayersUpkeep);
    expect(upkeepPendings(atUser)).toHaveLength(1); // exactly ONCE per upkeep entry
    expect(upkeepPendings(atUser)[0].context.upkeepPlayerId).toBe("user");
    let afterUser = settle(atUser);
    expect(afterUser.players.user.life).toBe(39);
    expect(afterUser.players.ai.life).toBe(40);
    // …the SAME board at the opponent's upkeep: the trigger fires again, hitting the AI (controller-independent)
    let s2 = { ...afterUser, activePlayer: "ai", priorityHolder: "ai" };
    const atAi = checkStepTriggers(s2, "upkeep");
    expect(upkeepPendings(atAi)).toHaveLength(1);
    expect(upkeepPendings(atAi)[0].context.upkeepPlayerId).toBe("ai");
    const afterAi = settle(atAi);
    expect(afterAi.players.user.life).toBe(39); // untouched on the opponent's upkeep
    expect(afterAi.players.ai.life).toBe(39);   // the full cycle: each player pinged exactly once
  });

  it("Seizan (user's) makes the AI lose 2 and draw 2 at the AI's upkeep", () => {
    let s = state({ userBf: [perm("sz", SEIZAN, "user")], aiLib: lib("a", 5), activePlayer: "ai" });
    const fired = checkStepTriggers(s, "upkeep");
    expect((fired.pendingTriggers || []).filter((t) => t.descriptor?.eachPlayersUpkeep)).toHaveLength(1);
    const after = settle(fired);
    expect(after.players.ai.life).toBe(38);
    expect(after.players.ai.hand).toHaveLength(2);
    expect(after.players.user.life).toBe(40); // the controller is untouched on the opponent's upkeep
    expect(after.players.user.hand).toHaveLength(0);
  });

  it("Worry Beads mills the upkeep player; Bottomless Pit random-discards them (seeded, no pause)", () => {
    let s = state({ userBf: [perm("wb", WORRY_BEADS, "user"), perm("bp", BOTTOMLESS_PIT, "user")],
      aiLib: lib("a", 4), aiHand: lib("h", 3), activePlayer: "ai" });
    const after = settle(checkStepTriggers(s, "upkeep"));
    expect(after.players.ai.library).toHaveLength(3);   // milled 1
    expect(after.players.ai.graveyard.length).toBeGreaterThanOrEqual(2); // 1 milled + 1 discarded
    expect(after.players.ai.hand).toHaveLength(2);      // random-discarded 1, no pendingChoice
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.hand).toHaveLength(0);    // the controller is untouched
  });

  it("Molder Slug forces the upkeep player's sole artifact to the graveyard (their choice pool — CR 701.21)", () => {
    let s = state({ userBf: [perm("ms", MOLDER_SLUG, "user")], aiBf: [art("a1", "Mind Stone", "ai")], activePlayer: "ai" });
    const after = settle(checkStepTriggers(s, "upkeep"));
    expect(after.players.ai.battlefield.filter((p) => p.card?.name === "Mind Stone")).toHaveLength(0);
    expect(after.players.ai.graveyard.map((c) => c.name)).toContain("Mind Stone");
    // the CONTROLLER's board is untouched (the edict is the upkeep player's, never the watcher's)
    expect(after.players.user.battlefield).toHaveLength(1);
  });

  it("FP GUARD — a YOUR-upkeep card (Juzám Djinn) does NOT fire on the opponent's upkeep", () => {
    let s = state({ userBf: [perm("jz", JUZAM, "user")], activePlayer: "ai" });
    const offTurn = checkStepTriggers(s, "upkeep");
    expect((offTurn.pendingTriggers || []).filter((t) => t.source?.name === "Juzám Djinn")).toHaveLength(0);
    // …and DOES fire exactly once on its controller's own upkeep
    let s2 = state({ userBf: [perm("jz", JUZAM, "user")], activePlayer: "user" });
    const onTurn = checkStepTriggers(s2, "upkeep");
    expect((onTurn.pendingTriggers || []).filter((t) => t.source?.name === "Juzám Djinn")).toHaveLength(1);
    const after = settle(onTurn);
    expect(after.players.user.life).toBe(39);
    expect(after.players.ai.life).toBe(40);
  });
});

// ─── 3. Runtime — blocks OR becomes blocked: both events, once per event ─────────
describe("TR-2 runtime — blocksOrBecomesBlocked fires for the blocker AND the blocked attacker, once each", () => {
  const bobPendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.event === "blocksOrBecomesBlocked");
  function board() {
    let s = state({ userBf: [perm("toad", CHUB_TOAD, "user")], aiBf: [crea("b1", "Bear One", "ai"), crea("b2", "Bear Two", "ai")] });
    return s;
  }

  it("Chub Toad BLOCKING fires once → +2/+2 lands (CR 509.1a)", () => {
    let s = board();
    s = { ...s, combat: { attackers: [{ permanentId: "b1", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "toad", attackerId: "b1" }] } };
    const fired = checkBlockTriggers(s);
    expect(bobPendings(fired)).toHaveLength(1);
    const after = settle(fired);
    expect(creaturePower(findPermanent(after, "toad").permanent, after)).toBe(3); // 1 + 2
  });

  it("Chub Toad BECOMING BLOCKED fires once — even double-blocked (one event, CR 509.3c)", () => {
    let s = board();
    s = { ...s, combat: { attackers: [{ permanentId: "toad", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "b1", attackerId: "toad" }, { blockerId: "b2", attackerId: "toad" }] } };
    const fired = checkBlockTriggers(s);
    expect(bobPendings(fired)).toHaveLength(1); // deduped: one becomes-blocked event
    const after = settle(fired);
    expect(creaturePower(findPermanent(after, "toad").permanent, after)).toBe(3);
  });

  it("FP GUARD — an UNBLOCKED attack never fires it; a bystander toad never fires either", () => {
    let s = board();
    // no blocks declared at all → checkBlockTriggers is a no-op
    s = { ...s, combat: { attackers: [{ permanentId: "toad", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(bobPendings(checkBlockTriggers(s))).toHaveLength(0);
    // a block between OTHER creatures never touches the toad
    let s2 = state({ userBf: [perm("toad", CHUB_TOAD, "user"), crea("me", "My Bear", "user")], aiBf: [crea("b1", "Bear One", "ai")] });
    s2 = { ...s2, combat: { attackers: [{ permanentId: "b1", attackingPlayer: "ai", defender: "user" }], blockers: [{ blockerId: "me", attackerId: "b1" }] } };
    expect(bobPendings(checkBlockTriggers(s2))).toHaveLength(0);
  });
});

// ─── 4. Runtime — attacks alone: fires iff EXACTLY ONE attacker was declared ─────
describe("TR-2 runtime — attacksAlone fires only on a sole-attacker declaration (CR 506.5)", () => {
  const alonePendings = (st) => (st.pendingTriggers || []).filter((t) => t.descriptor?.event === "attacksAlone");

  it("Rogue Kavu attacking alone pumps itself +2/+0", () => {
    let s = state({ userBf: [perm("rk", ROGUE_KAVU, "user")], aiBf: [] });
    s = { ...s, combat: { attackers: [{ permanentId: "rk", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const fired = checkAttackTriggers(s);
    expect(alonePendings(fired)).toHaveLength(1);
    const after = settle(fired);
    expect(creaturePower(findPermanent(after, "rk").permanent, after)).toBe(3); // 1 + 2
  });

  it("Black Panther (watcher) puts the +1/+1 counter on the SOLE ATTACKER, not on itself", () => {
    let s = state({ userBf: [perm("bp", BLACK_PANTHER, "user"), crea("bear", "Attack Bear", "user")] });
    s = { ...s, combat: { attackers: [{ permanentId: "bear", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const fired = checkAttackTriggers(s);
    expect(alonePendings(fired)).toHaveLength(1);
    expect(alonePendings(fired)[0].context.triggeringPermanentId).toBe("bear");
    const after = settle(fired);
    expect(findPermanent(after, "bear").permanent.counters?.["+1/+1"] || 0).toBe(1);
    expect(findPermanent(after, "bp").permanent.counters?.["+1/+1"] || 0).toBe(0);
  });

  it("Nefarox attacking alone: the DEFENDING player sacrifices their sole creature (CR 508.5 referent)", () => {
    let s = state({ userBf: [perm("nx", NEFAROX, "user")], aiBf: [crea("v", "Victim Bear", "ai")] });
    s = { ...s, combat: { attackers: [{ permanentId: "nx", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const fired = checkAttackTriggers(s);
    expect(alonePendings(fired)).toHaveLength(1);
    const after = settle(fired);
    expect(after.players.ai.battlefield.filter((p) => p.card?.name === "Victim Bear")).toHaveLength(0);
    expect(after.players.ai.graveyard.map((c) => c.name)).toContain("Victim Bear");
    expect(after.players.user.battlefield).toHaveLength(1); // Nefarox stays — never the wrong sacrificer
  });

  it("FP GUARD — TWO declared attackers never fire attacksAlone (and the watcher stays silent)", () => {
    let s = state({ userBf: [perm("bp", BLACK_PANTHER, "user"), crea("b1", "Bear One", "user"), crea("b2", "Bear Two", "user")] });
    s = { ...s, combat: { attackers: [
      { permanentId: "b1", attackingPlayer: "user", defender: "ai" },
      { permanentId: "b2", attackingPlayer: "user", defender: "ai" },
    ], blockers: [] } };
    expect(alonePendings(checkAttackTriggers(s))).toHaveLength(0);
  });

  it("FP GUARD — a bystander SELF-scoped carrier does not fire off another creature's solo attack", () => {
    let s = state({ userBf: [perm("rk", ROGUE_KAVU, "user"), crea("bear", "Attack Bear", "user")] });
    s = { ...s, combat: { attackers: [{ permanentId: "bear", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect(alonePendings(checkAttackTriggers(s))).toHaveLength(0); // Rogue Kavu isn't the sole attacker
  });

  it("GRANTED line (Voltaic Whip) fires through the granted merge when the HOST attacks alone — and only then", () => {
    // Real oracle: Equipped creature gets +2/+0 and has "Whenever this creature attacks alone, you draw a card and lose 1 life."
    const WHIP = { name: "Voltaic Whip", type: "Artifact — Equipment", mana: "{2}",
      oracle: "Equipped creature gets +2/+0 and has \"Whenever this creature attacks alone, you draw a card and lose 1 life.\"\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)" };
    expect(classifyCard(WHIP)).toBe("native-trigger"); // the granted-trigger classifier's tier for a trigger-granting Equipment
    let s = state({ userBf: [crea("host", "Host Bear", "user"), createPermanent({ id: "vw", card: { id: "vw", ...WHIP }, controller: "user" })], userLib: lib("u", 3) });
    // attach the whip to the host (the attached linkage the granted merge reads)
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) =>
      p.id === "vw" ? { ...p, attachedTo: "host" } : p.id === "host" ? { ...p, attachments: ["vw"] } : p) } } };
    const solo = checkAttackTriggers({ ...s, combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(alonePendings(solo)).toHaveLength(1); // the granted self trigger, once
    const after = settle(solo);
    expect(after.players.user.hand).toHaveLength(1);
    expect(after.players.user.life).toBe(39);
    // a DIFFERENT creature attacking alone never fires the host's granted self trigger
    let s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, crea("other", "Other Bear", "user")] } } };
    const other = checkAttackTriggers({ ...s2, combat: { attackers: [{ permanentId: "other", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect(alonePendings(other)).toHaveLength(0);
  });
});
