/**
 * leaverWouldBeTurn.test.js — "until your next turn" when its controller leaves the game, the extra turns around that moment,
 * and the player a goad names.
 *
 *   CR 800.4m — "When a player leaves the game, any continuous effects with durations that last until that player's next turn or
 *                until a specific point in that turn will last until that turn would have begun. They neither expire immediately
 *                nor last indefinitely." (Azorius Arrester's, Martial Law's and Marisi's own rulings repeat it.)
 *   CR 800.4k — "If a player who has left the game would begin a turn, that turn doesn't begin."
 *   CR 500.7  — extra turns are added directly after the specified turn; the most recently created one is taken first.
 *   CR 701.15b — a goaded creature attacks "a player other than the controller of the permanent, spell, or ability that caused it to
 *                be goaded" (Jeering Homunculus's ruling: "the controller of the spell or ability that goaded it").
 *
 * THE GAPS (b5650658). The leaver's goad, detain, Kardur's rule and Savage Order's grant were handed to the next seat and ended as
 * that seat's next turn began — any turn of theirs, an extra one included, so an extra turn taken before the leaver's would-be turn
 * ended them early, and a leaver whose next turn was an extra turn already queued for them kept theirs a full round too long.
 * Reflector Mage's name lock never ended once its caster had left; Lightning, Army of One's damage replacement stopped applying the
 * moment its controller left and was dropped as the next turn began. When the active player left, the next seat's turn began at
 * once whatever extra turns were queued, and kept the departed player's extra-turn marks, so the rotation could hand a seat two
 * turns in a row; a departed rotation anchor sent the rotation on from the active player. A goad from a permanent's triggered or
 * activated ability named that permanent's current controller as the goader, not the ability's.
 * THE FIX. The turn order remembers every seat (`seatOrder`, from the first departure), and the turn transition names each departed
 * player whose turn would have begun and didn't (`turnsNotBegun` — the rotation passing their seat, or an extra turn queued for them
 * popped untaken); each "until your next turn" store ends a departed player's effects at that moment. The active player's departure
 * goes through the same transition as any end of turn. A resolved goad names the controller it recorded.
 *
 * Every turn is walked through the engine's own step driver (nextStep — the untap, draw, combat and cleanup actions of every seat),
 * never a hand-set turn counter; every spell is cast through the legal actions and resolved on the stack (the mana it needs is put in
 * its caster's pool first). Two things are staged: Lightning's Stagger is its effect sentence through the real parser and resolver
 * (its combat-damage trigger's resolution), and the Aura of the static-goad control starts attached. A player leaves through
 * removePlayerFromGame, the elimination's own entry point. Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, nameCastLocked } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { goaderControllersOf, permanentHasKeyword } from "./layers.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";
import { applyDamageReplacementUntilNextTurn, damageReplacementUntilNextTurnClauseParser } from "./effects/atoms/misc.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ────────────────────────────────────────────────────────────────────────────
const ARRESTER = { name: "Azorius Arrester", type: "Creature — Human Soldier", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, power: "2", toughness: "1", keywords: ["Detain"],
  oracle: "When this creature enters, detain target creature an opponent controls. (Until your next turn, that creature can't attack or block and its activated abilities can't be activated.)" };
const REFLECTOR_MAGE = { name: "Reflector Mage", type: "Creature — Human Wizard", mana: "{1}{W}{U}", mana_cost: "{1}{W}{U}", cmc: 3, power: "2", toughness: "3", keywords: [],
  oracle: "When this creature enters, return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn." };
const TIME_WARP = { name: "Time Warp", type: "Sorcery", mana: "{3}{U}{U}", mana_cost: "{3}{U}{U}", cmc: 5, keywords: [], oracle: "Target player takes an extra turn after this one." };
const LIGHTNING_BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const JEERING_HOMUNCULUS = { name: "Jeering Homunculus", type: "Creature — Homunculus", mana: "{1}{U}", mana_cost: "{1}{U}", cmc: 2, power: "0", toughness: "4", keywords: ["Goad"],
  oracle: "When this creature enters, you may goad target creature. (Until your next turn, that creature attacks each combat if able and attacks a player other than you if able.)" };
const ACT_OF_TREASON = { name: "Act of Treason", type: "Sorcery", mana: "{2}{R}", mana_cost: "{2}{R}", cmc: 3, keywords: [],
  oracle: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)" };
const COERCIVE_IMPETUS = { name: "Coercive Impetus", type: "Enchantment — Aura", mana: "{2}{B}", mana_cost: "{2}{B}", cmc: 3, keywords: ["Goad", "Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you draw a card and lose 1 life." };
const LIGHTNING_STAGGER = "until your next turn, if a source would deal damage to that player or a permanent that player controls, it deals double that damage instead"; // Lightning, Army of One's Stagger, its effect sentence
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {W}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };

const SEATS = ["user", "ai1", "ai2", "ai3"];
const POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const bears = (id, controller) => createPermanent({ id, card: { ...GRIZZLY_BEARS, id: `card-${id}` }, controller, summoningSick: false });
const forest = (id, controller) => createPermanent({ id, card: { ...FOREST, id: `card-${id}` }, controller, summoningSick: false });

/** A four-seat pod (user → ai1 → ai2 → ai3) in the user's precombat main on turn 5; each library holds Plains for the draws. */
function pod({ battlefield = {}, hands = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of SEATS) {
    const library = Array.from({ length: 14 }, (_, i) => ({ ...PLAINS, id: `lib-${seat}-${i}` }));
    players[seat] = { ...g.players[seat], battlefield: battlefield[seat] || [], hand: hands[seat] || [], library, life: 40, manaPool: { ...POOL } };
  }
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}

/** Walk the engine's own step driver until `seat`'s `step` of turn `turn`. */
function walkTo(state, seat, step, turn) {
  let s = state;
  for (let i = 0; i < 400; i++) {
    if (s.activePlayer === seat && s.step === step && s.turn === turn) return s;
    if (s.pendingChoice) throw new Error(`walkTo: a pending choice (${s.pendingChoice.kind}) at ${s.activePlayer} ${s.step} turn ${s.turn}`);
    s = nextStep(s);
  }
  throw new Error(`walkTo: ${seat} ${step} turn ${turn} not reached`);
}

/** Walk the engine's own step driver until `step` of turn `turn`, whoever's turn it is. */
function walkToTurn(state, turn, step) {
  let s = state;
  for (let i = 0; i < 400; i++) {
    if (s.step === step && s.turn === turn) return s;
    if (s.pendingChoice) throw new Error(`walkToTurn: a pending choice (${s.pendingChoice.kind}) at ${s.activePlayer} ${s.step} turn ${s.turn}`);
    s = nextStep(s);
  }
  throw new Error(`walkToTurn: ${step} of turn ${turn} not reached`);
}

/** The seat that is active at each of the next turns' untap steps, from `state` on (the engine's own step driver). */
function turnSequence(state, n) {
  let s = state;
  const out = [];
  for (let i = 0; i < 600 && out.length < n; i++) {
    const before = s.turn;
    s = nextStep(s);
    if (s.turn !== before) out.push(`${s.turn}:${s.activePlayer}${s.extraTurnOf ? "(extra)" : ""}`);
  }
  return out;
}

/** `seat` casts `name` from its hand (holding priority, `pool` put in its mana pool first) — the first offered cast, or the one aimed
 *  at `target` — and the spell and every trigger it causes resolve (`triggerTarget` picks the enters trigger's target). */
function castBy(state, seat, name, { pool = {}, target = null, triggerTarget = null } = {}) {
  const p = state.players[seat];
  let s = { ...state, priorityHolder: seat, consecutivePasses: 0, players: { ...state.players, [seat]: { ...p, manaPool: { ...POOL, ...pool } } } };
  const card = s.players[seat].hand.find((c) => c.name === name);
  expect(card, `${seat} holds ${name}`).toBeTruthy();
  const cast = legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === card.id && (target == null || a.targets?.[0]?.id === target));
  expect(cast, `${seat} casts ${name}${target ? ` at ${target}` : ""}`).toBeTruthy();
  s = resolveTopOfStack(dispatchAction(s, cast));
  const chooseTargets = (cands) => (triggerTarget ? cands.findIndex((c) => c.targets?.[0]?.id === triggerTarget) : 0);
  s = flushTriggers(s, { chooseTargets });
  for (let i = 0; i < 6 && (s.stack.length || s.pendingChoice); i++) {
    // "you may" (Jeering Homunculus): the controller takes the optional effect.
    if (s.pendingChoice?.kind === "optional-effect") { s = flushTriggers(resolveOptionalChoice(s, true), { chooseTargets }); continue; }
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets });
  }
  expect({ stack: s.stack.length, pending: s.pendingChoice?.kind ?? null }).toEqual({ stack: 0, pending: null });
  return { ...s, priorityHolder: s.activePlayer, consecutivePasses: 0 };
}

const DETAIN_LOCKS = ["cantAttack", "cantBlock", "activatedAbilitiesLocked"];
const locks = (s, id) => DETAIN_LOCKS.filter((kw) => permanentHasKeyword(s, id, kw));
const attackOffered = (s, id) => legalActionsForPlayer(s, s.activePlayer).some((a) => a.kind === "declare-attacker" && a.permanentId === id);
/** The user casts Azorius Arrester and detains ai1's Bears ("bear"). */
const detainBear = (s) => castBy(s, "user", "Azorius Arrester", { pool: { W: 1, C: 1 }, triggerTarget: "bear" });

// ── REFLECTOR MAGE (gap 1) ────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ Reflector Mage's name lock — its caster leaves the game (CR 800.4m)", () => {
  /** The user casts Reflector Mage on turn 5 and bounces ai1's Bears; ai1 has two Forests to recast it with. */
  const bounced = () => castBy(
    pod({ battlefield: { ai1: [bears("bear", "ai1"), forest("f1", "ai1"), forest("f2", "ai1")] }, hands: { user: [{ ...REFLECTOR_MAGE, id: "c-rm" }] } }),
    "user", "Reflector Mage", { pool: { W: 1, U: 1, C: 1 }, triggerTarget: "bear" });
  const bearsOffered = (s) => legalActionsForPlayer(s, "ai1").some((a) => a.kind === "cast-spell" && a.cardId === "card-bear");

  it("⭐ the caster leaves in another seat's turn (ai2's turn 7): the lock holds through ai3's turn and ends as ai1's turn 9 begins — the turn the caster would have taken", () => {
    let s = bounced();
    const row = { inHand: s.players.ai1.hand.some((c) => c.id === "card-bear"), locked: nameCastLocked(s, "ai1", "Grizzly Bears") };
    s = removePlayerFromGame(walkTo(s, "ai2", "main", 7), "user");
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup8 = nameCastLocked(s, "ai1", "Grizzly Bears");
    s = walkTo(s, "ai1", "main", 9);
    row.ai1Main9 = { locked: nameCastLocked(s, "ai1", "Grizzly Bears"), castOffered: bearsOffered(s) };
    console.log(`WITNESS reflectorLeaverBystander ${JSON.stringify(row)}`);
    expect(row).toEqual({ inHand: true, locked: true, ai3Cleanup8: true, ai1Main9: { locked: false, castOffered: true } });
  });

  it("⭐ the caster leaves in their own turn (turn 5): ai1's turn 6 begins at once with the lock in place; it ends as ai1's turn 9 begins", () => {
    let s = removePlayerFromGame(bounced(), "user");
    s = walkTo(s, "ai1", "main", 6);
    const row = { ai1Main6: { locked: nameCastLocked(s, "ai1", "Grizzly Bears"), castOffered: bearsOffered(s) } };
    s = walkTo(s, "ai1", "main", 9);
    row.ai1Main9 = { locked: nameCastLocked(s, "ai1", "Grizzly Bears"), castOffered: bearsOffered(s) };
    console.log(`WITNESS reflectorLeaverActive ${JSON.stringify(row)}`);
    expect(row).toEqual({ ai1Main6: { locked: true, castOffered: false }, ai1Main9: { locked: false, castOffered: true } });
  });

  it("control: the caster stays — the lock holds through ai3's turn and ends as the caster's turn 9 begins", () => {
    let s = walkTo(bounced(), "ai3", "cleanup", 8);
    const row = { ai3Cleanup8: nameCastLocked(s, "ai1", "Grizzly Bears") };
    s = walkTo(s, "user", "untap", 9);
    row.asCastersTurnBegins = nameCastLocked(s, "ai1", "Grizzly Bears");
    expect(row).toEqual({ ai3Cleanup8: true, asCastersTurnBegins: false });
  });
});

// ── LIGHTNING'S STAGGER (gap 2) ───────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ Lightning, Army of One's Stagger — its controller leaves the game (CR 800.4m)", () => {
  const BOLTS = { ai1: [{ ...LIGHTNING_BOLT, id: "bolt-ai1" }], ai3: [{ ...LIGHTNING_BOLT, id: "bolt-ai3" }] };
  /** ai2's Stagger (its combat-damage trigger, resolved in ai2's turn 7) on the user. */
  const staggered = () => {
    const s = walkTo(pod({ hands: BOLTS }), "ai2", "main", 7);
    return applyDamageReplacementUntilNextTurn(s, damageReplacementUntilNextTurnClauseParser(LIGHTNING_STAGGER), { controller: "ai2", damagedPlayerId: "user", cardName: "Lightning, Army of One" });
  };
  const boltUser = (s, seat) => castBy(s, seat, "Lightning Bolt", { pool: { R: 1 }, target: "user" });

  it("⭐ the controller leaves in the turn after theirs (ai3's turn 8): damage to the player stays doubled through the user's and ai1's turns, and the replacement ends as ai3's turn 11 begins", () => {
    let s = removePlayerFromGame(walkTo(staggered(), "ai3", "main", 8), "ai2");
    const row = { stored: (s.damageReplacementEffects || []).length };
    s = walkTo(s, "ai1", "main", 10);
    const before = s.players.user.life;
    s = boltUser(s, "ai1");
    row.ai1BoltOnTurn10 = before - s.players.user.life;
    s = walkTo(s, "ai1", "cleanup", 10);
    row.ai1Cleanup10 = (s.damageReplacementEffects || []).length;
    s = walkTo(s, "ai3", "main", 11);
    row.ai3Main11 = (s.damageReplacementEffects || []).length;
    const before3 = s.players.user.life;
    s = boltUser(s, "ai3");
    row.ai3BoltOnTurn11 = before3 - s.players.user.life;
    console.log(`WITNESS staggerLeaverBystander ${JSON.stringify(row)}`);
    expect(row).toEqual({ stored: 1, ai1BoltOnTurn10: 6, ai1Cleanup10: 1, ai3Main11: 0, ai3BoltOnTurn11: 3 });
  });

  it("⭐ the controller leaves in their own turn (turn 7): ai3's turn 8 begins at once and the replacement still doubles; it ends as ai3's turn 11 begins", () => {
    let s = removePlayerFromGame(staggered(), "ai2");
    s = walkTo(s, "ai3", "main", 8);
    const before = s.players.user.life;
    s = boltUser(s, "ai3");
    const row = { ai3BoltOnTurn8: before - s.players.user.life };
    s = walkTo(s, "ai1", "cleanup", 10);
    row.ai1Cleanup10 = (s.damageReplacementEffects || []).length;
    s = walkTo(s, "ai3", "untap", 11);
    row.asAi3Turn11Begins = (s.damageReplacementEffects || []).length;
    console.log(`WITNESS staggerLeaverActive ${JSON.stringify(row)}`);
    expect(row).toEqual({ ai3BoltOnTurn8: 6, ai1Cleanup10: 1, asAi3Turn11Begins: 0 });
  });

  it("control: the controller stays — the damage is doubled through the other turns and the replacement ends as ai2's turn 11 begins", () => {
    let s = walkTo(staggered(), "ai1", "main", 10);
    const before = s.players.user.life;
    s = boltUser(s, "ai1");
    const row = { ai1BoltOnTurn10: before - s.players.user.life };
    s = walkTo(s, "ai2", "untap", 11);
    row.asAi2Turn11Begins = (s.damageReplacementEffects || []).length;
    expect(row).toEqual({ ai1BoltOnTurn10: 6, asAi2Turn11Begins: 0 });
  });
});

// ── EXTRA TURNS (gap 3) ───────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ the turn the leaver would have taken, with extra turns in the queue (CR 500.7, 800.4k, 800.4m)", () => {
  const detained = (hands = {}) => detainBear(pod({
    battlefield: { ai1: [bears("bear", "ai1")], ai2: [bears("raider", "ai2")] },
    hands: { user: [{ ...ARRESTER, id: "c-aa" }], ...hands },
  }));

  it("⭐ an extra turn of the next seat comes first (ai2's Time Warp gives ai1 turn 8): the detention holds through it and ai3's turn 9, and ends as ai1's turn 10 begins", () => {
    let s = walkTo(detained({ ai2: [{ ...TIME_WARP, id: "tw" }] }), "ai2", "main", 7);
    s = castBy(s, "ai2", "Time Warp", { pool: { U: 2, C: 3 }, target: "ai1" });
    s = removePlayerFromGame(s, "user");
    const row = { queued: s.extraTurns };
    s = walkTo(s, "ai1", "declare-attackers", 8);
    row.ai1ExtraTurn8 = { extra: s.extraTurnOf, locks: locks(s, "bear"), attackOffered: attackOffered(s, "bear") };
    s = walkTo(s, "ai3", "cleanup", 9);
    row.ai3Cleanup9 = locks(s, "bear");
    s = walkTo(s, "ai1", "untap", 10);
    row.asAi1Turn10Begins = { extra: s.extraTurnOf, locks: locks(s, "bear") };
    console.log(`WITNESS extraTurnOfSuccessor ${JSON.stringify(row)}`);
    expect(row).toEqual({
      queued: [{ player: "ai1" }],
      ai1ExtraTurn8: { extra: "ai1", locks: DETAIN_LOCKS, attackOffered: false },
      ai3Cleanup9: DETAIN_LOCKS,
      asAi1Turn10Begins: { extra: null, locks: [] },
    });
  });

  it("⭐ the leaver's next turn was an extra turn queued for them (ai1's Time Warp on the user): it doesn't begin, and the detention ends as ai2's turn 7 begins — ai1's Bears may block ai2's attacker", () => {
    let s = walkTo(detained({ ai1: [{ ...TIME_WARP, id: "tw" }] }), "ai1", "main", 6);
    s = castBy(s, "ai1", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    s = removePlayerFromGame(s, "user");
    const row = { queued: s.extraTurns, ai1Turn6: locks(s, "bear") };
    s = walkTo(s, "ai1", "cleanup", 6);
    row.ai1Cleanup6 = locks(s, "bear");
    s = walkTo(s, "ai2", "untap", 7);
    row.asAi2Turn7Begins = locks(s, "bear");
    s = walkTo(s, "ai2", "declare-attackers", 7);
    const declare = legalActionsForPlayer(s, "ai2").find((a) => a.kind === "declare-attacker" && a.permanentId === "raider" && a.defenderId === "ai1");
    s = nextStep(dispatchAction(s, declare));
    row.blockOffered = legalActionsForPlayer({ ...s, priorityHolder: "ai1" }, "ai1").some((a) => a.kind === "declare-blocker" && a.permanentId === "bear" && a.attackerId === "raider");
    console.log(`WITNESS leaversQueuedExtraTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ queued: [{ player: "user" }], ai1Turn6: DETAIN_LOCKS, ai1Cleanup6: DETAIN_LOCKS, asAi2Turn7Begins: [], blockOffered: true });
  });

  it("⭐ the leaver's queued extra turn sits above another player's (ai1 gives ai2 one, then the user): it doesn't begin, and the detention ends as ai2's extra turn 7 begins", () => {
    let s = walkTo(detained({ ai1: [{ ...TIME_WARP, id: "tw1" }, { ...TIME_WARP, id: "tw2" }] }), "ai1", "main", 6);
    s = castBy(s, "ai1", "Time Warp", { pool: { U: 2, C: 3 }, target: "ai2" });
    s = castBy(s, "ai1", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    s = removePlayerFromGame(s, "user");
    const row = { queued: s.extraTurns };
    s = walkTo(s, "ai1", "cleanup", 6);
    row.ai1Cleanup6 = locks(s, "bear");
    s = walkToTurn(s, 7, "untap");
    row.turn7Begins = { seat: s.activePlayer, extra: s.extraTurnOf, locks: locks(s, "bear") };
    console.log(`WITNESS leaversQueuedExtraTurnAboveAnother ${JSON.stringify(row)}`);
    expect(row).toEqual({ queued: [{ player: "ai2" }, { player: "user" }], ai1Cleanup6: DETAIN_LOCKS, turn7Begins: { seat: "ai2", extra: "ai2", locks: [] } });
  });

  it("⭐ the active player leaves in an extra turn taken after ai2's turn: the turn order resumes after ai2 (ai3, then ai1), and the detention they made ends as ai1's turn 10 begins", () => {
    // ai2 gives the user an extra turn (turn 8, after ai2's turn 7); in it the user detains ai1's Bears and leaves.
    let s = pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hands: { user: [{ ...ARRESTER, id: "c-aa" }], ai2: [{ ...TIME_WARP, id: "tw" }] } });
    s = castBy(walkTo(s, "ai2", "main", 7), "ai2", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    s = detainBear(walkTo(s, "user", "main", 8));
    const row = { extraTurn8: s.extraTurnOf, detained: locks(s, "bear") };
    s = removePlayerFromGame(s, "user");
    row.next = `${s.turn}:${s.activePlayer}${s.extraTurnOf ? "(extra)" : ""}`;
    row.turn9Begins = locks(s, "bear");
    row.sequence = turnSequence(s, 3);
    s = walkToTurn(s, 9, "cleanup");
    row.cleanup9 = { seat: s.activePlayer, locks: locks(s, "bear") };
    s = walkToTurn(s, 10, "untap");
    row.turn10Begins = { seat: s.activePlayer, locks: locks(s, "bear") };
    console.log(`WITNESS activeLeaverInExtraTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({
      extraTurn8: "user", detained: DETAIN_LOCKS, next: "9:ai3", turn9Begins: DETAIN_LOCKS,
      sequence: ["10:ai1", "11:ai2", "12:ai3"], cleanup9: { seat: "ai3", locks: DETAIN_LOCKS }, turn10Begins: { seat: "ai1", locks: [] },
    });
  });

  it("⭐ the active player leaves in an extra turn taken after the seat before theirs (ai3's Time Warp on the user, turn 9): ai1's turn 10 is a normal turn and ai2's comes next — ai1 never takes two turns in a row", () => {
    let s = pod({ hands: { ai3: [{ ...TIME_WARP, id: "tw" }] } });
    s = castBy(walkTo(s, "ai3", "main", 8), "ai3", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    s = walkTo(s, "user", "main", 9);
    const row = { extraTurn9: s.extraTurnOf };
    s = removePlayerFromGame(s, "user");
    row.next = `${s.turn}:${s.activePlayer}${s.extraTurnOf ? "(extra)" : ""}`;
    row.sequence = turnSequence(s, 3);
    console.log(`WITNESS activeLeaverNoDoubleTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ extraTurn9: "user", next: "10:ai1", sequence: ["11:ai2", "12:ai3", "13:ai1"] });
  });

  it("⭐ the active player leaves with another player's extra turn queued (the user's Time Warp on ai2): ai2's extra turn comes next, then ai1's turn", () => {
    let s = pod({ hands: { user: [{ ...TIME_WARP, id: "tw" }] } });
    s = castBy(s, "user", "Time Warp", { pool: { U: 2, C: 3 }, target: "ai2" });
    s = removePlayerFromGame(s, "user");
    const row = { next: `${s.turn}:${s.activePlayer}${s.extraTurnOf ? "(extra)" : ""}`, queued: s.extraTurns, sequence: turnSequence(s, 3) };
    console.log(`WITNESS activeLeaverOthersExtraTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ next: "6:ai2(extra)", queued: [], sequence: ["7:ai1", "8:ai2", "9:ai3"] });
  });

  it("⭐ the active player leaves with their own extra turn queued (Time Warp on themself): it doesn't begin, and the detention ends as ai1's turn 6 begins — ai1's Bears may attack", () => {
    let s = castBy(detained({ user: [{ ...ARRESTER, id: "c-aa" }, { ...TIME_WARP, id: "tw" }] }), "user", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    const row = { queued: s.extraTurns, detained: locks(s, "bear") };
    s = removePlayerFromGame(s, "user");
    row.next = `${s.turn}:${s.activePlayer}${s.extraTurnOf ? "(extra)" : ""}`;
    row.asAi1Turn6Begins = locks(s, "bear");
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.attackOffered = attackOffered(s, "bear");
    console.log(`WITNESS activeLeaverOwnExtraTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ queued: [{ player: "user" }], detained: DETAIN_LOCKS, next: "6:ai1", asAi1Turn6Begins: [], attackOffered: true });
  });

  it("⭐ the rotation anchor leaves (the user's Time Warp gave ai2 turn 6; the user leaves in it): the turn order resumes after the user's seat — ai1's turn 7", () => {
    let s = castBy(detained({ user: [{ ...ARRESTER, id: "c-aa" }, { ...TIME_WARP, id: "tw" }] }), "user", "Time Warp", { pool: { U: 2, C: 3 }, target: "ai2" });
    s = walkTo(s, "ai2", "main", 6);
    const row = { extraTurn6: s.extraTurnOf };
    s = removePlayerFromGame(s, "user");
    row.sequence = turnSequence(s, 4);
    s = walkToTurn(s, 9, "cleanup");
    row.cleanup9 = { seat: s.activePlayer, locks: locks(s, "bear") };
    s = walkToTurn(s, 10, "untap");
    row.turn10Begins = { seat: s.activePlayer, locks: locks(s, "bear") };
    console.log(`WITNESS departedAnchor ${JSON.stringify(row)}`);
    expect(row).toEqual({ extraTurn6: "ai2", sequence: ["7:ai1", "8:ai2", "9:ai3", "10:ai1"], cleanup9: { seat: "ai3", locks: DETAIN_LOCKS }, turn10Begins: { seat: "ai1", locks: [] } });
  });

  it("control: a second departure keeps the first leaver's seat — the user leaves in ai1's turn 6, ai2 in its own turn 7; the user's detention ends as ai1's turn 9 begins", () => {
    let s = removePlayerFromGame(walkTo(detained(), "ai1", "main", 6), "user");
    s = removePlayerFromGame(walkTo(s, "ai2", "main", 7), "ai2");
    const row = { next: `${s.turn}:${s.activePlayer}`, turn8Begins: locks(s, "bear") };
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup8 = locks(s, "bear");
    s = walkTo(s, "ai1", "untap", 9);
    row.asAi1Turn9Begins = locks(s, "bear");
    expect(row).toEqual({ next: "8:ai3", turn8Begins: DETAIN_LOCKS, ai3Cleanup8: DETAIN_LOCKS, asAi1Turn9Begins: [] });
  });

  it("control: nobody leaves — an extra turn of the detainer's own is their next turn, and the detention ends as it begins", () => {
    let s = castBy(detained({ user: [{ ...ARRESTER, id: "c-aa" }, { ...TIME_WARP, id: "tw" }] }), "user", "Time Warp", { pool: { U: 2, C: 3 }, target: "user" });
    s = walkTo(s, "user", "untap", 6);
    expect({ extra: s.extraTurnOf, locks: locks(s, "bear") }).toEqual({ extra: "user", locks: [] });
  });

  it("control: nobody leaves — ai2's Time Warp on ai1 is taken after ai2's turn and the rotation resumes after ai2", () => {
    let s = walkTo(pod({ hands: { ai2: [{ ...TIME_WARP, id: "tw" }] } }), "ai2", "main", 7);
    s = castBy(s, "ai2", "Time Warp", { pool: { U: 2, C: 3 }, target: "ai1" });
    expect(turnSequence(s, 4)).toEqual(["8:ai1(extra)", "9:ai3", "10:user", "11:ai1"]);
  });
});

// ── GOAD'S GOADER (gap 4) ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ goad — the goader is the controller of the ability that goaded, whoever controls its source later (CR 701.15b)", () => {
  const defendersFor = (s, id) => [...new Set(legalActionsForPlayer(s, s.activePlayer).filter((a) => a.kind === "declare-attacker" && a.permanentId === id).map((a) => a.defenderId))].sort();

  it("⭐ the user's Jeering Homunculus goads ai1's Bears; ai1 takes the Homunculus with Act of Treason — the Bears still must attack a player other than the user", () => {
    let s = pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hands: { user: [{ ...JEERING_HOMUNCULUS, id: "c-jh" }], ai1: [{ ...ACT_OF_TREASON, id: "aot" }] } });
    s = castBy(s, "user", "Jeering Homunculus", { pool: { U: 1, C: 1 }, triggerTarget: "bear" });
    const homunculus = s.players.user.battlefield.find((p) => p.card?.name === "Jeering Homunculus").id;
    const row = { goaders: [...goaderControllersOf(s, "bear")] };
    s = walkTo(s, "ai1", "main", 6);
    s = castBy(s, "ai1", "Act of Treason", { pool: { R: 1, C: 2 }, target: homunculus });
    row.homunculusController = s.players.ai1.battlefield.some((p) => p.id === homunculus) ? "ai1" : "user";
    row.goadersAfterTheft = [...goaderControllersOf(s, "bear")];
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.defenders = defendersFor(s, "bear");
    console.log(`WITNESS goaderAfterTheft ${JSON.stringify(row)}`);
    expect(row).toEqual({ goaders: ["user"], homunculusController: "ai1", goadersAfterTheft: ["user"], defenders: ["ai2", "ai3"] });
  });

  it("control: an Aura's goad (Coercive Impetus — a static ability of the permanent) names the Aura's controller", () => {
    const aura = { ...createPermanent({ id: "imp", card: { ...COERCIVE_IMPETUS, id: "card-imp" }, controller: "ai2", summoningSick: false }), attachedTo: "bear" };
    let s = pod({ battlefield: { ai1: [{ ...bears("bear", "ai1"), attachments: ["imp"] }], ai2: [aura] } });
    const row = { goaders: [...goaderControllersOf(s, "bear")] };
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.defenders = defendersFor(s, "bear");
    expect(row).toEqual({ goaders: ["ai2"], defenders: ["ai3", "user"] });
  });
});
