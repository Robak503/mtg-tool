/**
 * untilYourNextTurn.test.js — an effect that lasts "until your next turn" ends AS that turn begins, not at its cleanup.
 *
 *   CR 701.35a — "Until the next turn of the controller of that spell or ability, that permanent can't attack or block and its
 *                activated abilities can't be activated." (detain)
 *   CR 701.15a — "Until the next turn of the controller of that spell or ability, that creature is goaded." (goad)
 *   CR 611.2a  — a continuous effect from a resolved spell or ability lasts as long as it says.
 *   CR 800.4m  — a player who leaves the game: their effects that last until their next turn "will last until that turn would
 *                have begun. They neither expire immediately nor last indefinitely." (Azorius Arrester's and Martial Law's own
 *                rulings repeat it.)
 *
 * THE GAP. The stored `untilOwnersNextTurn` duration (goad, detain, Kardur, Doomscourge's rule, Savage Order's grant) was swept
 * at the CLEANUP of its controller's next turn, so it held through that whole turn: a detained creature could not block the
 * detainer's attackers, its activated abilities stayed locked, a goaded creature stayed goaded and Savage Order's Dinosaur stayed
 * indestructible on the controller's own next turn. An effect whose controller had left the game was never swept at all.
 * THE FIX. The duration is swept as a turn begins (gameEngine.runStepActions' untap step — the moment the Teferi shield, the
 * name-cast locks and the stored damage replacements already end): it ends as its controller's next turn begins. A player who
 * leaves hands their effects to the seat after them (playerLeavesGame), so each ends as the turn they would have taken begins.
 *
 * Every turn here is walked through the engine's own step driver (nextStep: the untap, draw, combat and cleanup actions of
 * every seat in turn), never a hand-set turn counter. Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, playerProtectedFromEverything } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { expireContinuousEffects, goaderControllersOf, permanentHasKeyword, permanentPower } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { removePlayerFromGame } from "./playerLeavesGame.js";
import { parseEffectProgram } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { applyDamageReplacementUntilNextTurn, damageReplacementUntilNextTurnClauseParser } from "./effects/atoms/misc.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ────────────────────────────────────────────────────────────────────────────
const ARRESTER = { id: "c-aa", name: "Azorius Arrester", type: "Creature — Human Soldier", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, power: "2", toughness: "1", keywords: ["Detain"],
  oracle: "When this creature enters, detain target creature an opponent controls. (Until your next turn, that creature can't attack or block and its activated abilities can't be activated.)" };
const DECORUM = { id: "c-dd", name: "Disrupt Decorum", type: "Sorcery", mana: "{2}{R}{R}", mana_cost: "{2}{R}{R}", cmc: 4, keywords: ["Goad"],
  oracle: "Goad all creatures you don't control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)" };
const KARDUR = { id: "c-kd", name: "Kardur, Doomscourge", type: "Legendary Creature — Demon Berserker", mana: "{2}{B}{R}", mana_cost: "{2}{B}{R}", cmc: 4, power: "4", toughness: "3", keywords: [],
  oracle: "When Kardur enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life." };
const SAVAGE_ORDER = { id: "c-so", name: "Savage Order", type: "Sorcery", mana: "{2}{G}{G}", mana_cost: "{2}{G}{G}", cmc: 4, keywords: [],
  oracle: "As an additional cost to cast this spell, sacrifice a creature with power 4 or greater.\nSearch your library for a Dinosaur creature card, put it onto the battlefield, then shuffle. It gains indestructible until your next turn." };
const DREADMAW = { id: "c-cd", name: "Colossal Dreadmaw", type: "Creature — Dinosaur", mana: "{4}{G}{G}", mana_cost: "{4}{G}{G}", cmc: 6, power: "6", toughness: "6", keywords: ["Trample"],
  oracle: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)" };
const GIANT_GROWTH = { id: "c-gg", name: "Giant Growth", type: "Instant", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], oracle: "Target creature gets +3/+3 until end of turn." };
const LIGHT_UP = { id: "c-lu", name: "Light Up the Stage", type: "Sorcery", mana: "{2}{R}", mana_cost: "{2}{R}", cmc: 3, keywords: ["Spectacle"],
  oracle: "Spectacle {R} (You may cast this spell for its spectacle cost rather than its mana cost if an opponent lost life this turn.)\nExile the top two cards of your library. Until the end of your next turn, you may play those cards." };
const TEFERIS_PROTECTION = { id: "c-tp", name: "Teferi's Protection", type: "Instant", mana: "{2}{W}", mana_cost: "{2}{W}", cmc: 3, keywords: [],
  oracle: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection." };
const LIGHTNING_STAGGER = "until your next turn, if a source would deal damage to that player or a permanent that player controls, it deals double that damage instead"; // Lightning, Army of One's Stagger, its effect sentence
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {W}.)" };

const SEATS = ["user", "ai1", "ai2", "ai3"];
const POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const bears = (id, controller) => createPermanent({ id, card: { ...GRIZZLY_BEARS, id: `card-${id}` }, controller, summoningSick: false });

/** A four-seat pod in the user's precombat main on turn 5: each seat's library holds Plains (the draw steps draw from it). */
function pod({ battlefield = {}, hand = [], pool = {}, library = null } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of SEATS) {
    const lib = Array.from({ length: 12 }, (_, i) => ({ ...PLAINS, id: `lib-${seat}-${i}` }));
    players[seat] = { ...g.players[seat], battlefield: battlefield[seat] || [], hand: [], library: seat === "user" && library ? library : lib, life: 40 };
  }
  players.user = { ...players.user, hand, manaPool: { ...POOL, ...pool } };
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}

/** Walk the engine's own step driver until `seat`'s `step` of turn `turn`. */
function walkTo(state, seat, step, turn) {
  let s = state;
  for (let i = 0; i < 300; i++) {
    if (s.activePlayer === seat && s.step === step && s.turn === turn) return s;
    if (s.pendingChoice) throw new Error(`walkTo: a pending choice (${s.pendingChoice.kind}) at ${s.activePlayer} ${s.step} turn ${s.turn}`);
    s = nextStep(s);
  }
  throw new Error(`walkTo: ${seat} ${step} turn ${turn} not reached`);
}

/** Cast `cardId` from the user's hand (the first offered cast, or the one `pick` selects) and resolve it and its enters trigger. */
function castAndResolve(state, cardId, { pick = () => true, triggerTarget = null } = {}) {
  const cast = legalActionsForPlayer(state, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && pick(a));
  expect(cast, `cast ${cardId}`).toBeTruthy();
  let s = resolveTopOfStack(dispatchAction(state, cast));
  const chooseTargets = (cands) => (triggerTarget ? cands.findIndex((c) => c.targets?.[0]?.id === triggerTarget) : 0);
  s = flushTriggers(s, { chooseTargets });
  for (let i = 0; i < 5 && s.stack.length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets });
  expect(s.stack).toHaveLength(0);
  return s;
}

/** `attacker` (controlled by the active player) is declared at `defender` in the current declare attackers step; the engine moves on to declare blockers. */
function attackInto(state, attacker, defender) {
  const declare = legalActionsForPlayer(state, state.activePlayer).find((a) => a.kind === "declare-attacker" && a.permanentId === attacker && a.defenderId === defender);
  expect(declare, `declare ${attacker} → ${defender}`).toBeTruthy();
  const s = nextStep(dispatchAction(state, declare));
  expect(s.step).toBe("declare-blockers");
  return s;
}
const blockOffered = (s, blocker, attacker, seat) =>
  legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).some((a) => a.kind === "declare-blocker" && a.permanentId === blocker && a.attackerId === attacker);
const DETAIN_LOCKS = ["cantAttack", "cantBlock", "activatedAbilitiesLocked"];
const locks = (s, id) => DETAIN_LOCKS.filter((kw) => permanentHasKeyword(s, id, kw));

// ── DETAIN ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ detain (CR 701.35a) — the detention ends as the detainer's next turn begins", () => {
  /** The user casts Azorius Arrester on turn 5 and detains ai1's Bears; ai2 has its own Bears to attack ai1 with. */
  const detained = () => castAndResolve(
    pod({ battlefield: { ai1: [bears("bear", "ai1")], ai2: [bears("raider", "ai2")] }, hand: [ARRESTER], pool: { W: 1, C: 1 } }),
    "c-aa", { triggerTarget: "bear" });
  const arresterId = (s) => s.players.user.battlefield.find((p) => p.card?.name === "Azorius Arrester").id;

  it("⭐ through the turns in between it can neither attack nor block — and on the detainer's own next turn it can block", () => {
    let s = detained();
    const arrester = arresterId(s);
    const row = { cast: locks(s, "bear") };
    // ai1's turn 6: the detained Bears is not offered as an attacker.
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.attackOfferedOnItsTurn = legalActionsForPlayer(s, "ai1").some((a) => a.kind === "declare-attacker" && a.permanentId === "bear");
    // ai2's turn 7: ai2's Bears attacks ai1, and the detained Bears may not block it.
    s = walkTo(s, "ai2", "declare-attackers", 7);
    s = attackInto(s, "raider", "ai1");
    row.blockOfferedOnAi2Turn = blockOffered(s, "bear", "raider", "ai1");
    // the very end of ai3's turn 8 — its cleanup — still detained.
    s = walkTo(s, "ai3", "cleanup", 8);
    row.atAi3Cleanup = locks(s, "bear");
    // the user's turn 9 begins: the detention is over before the user untaps.
    s = walkTo(s, "user", "untap", 9);
    row.asUsersTurnBegins = locks(s, "bear");
    // the user's Arrester attacks ai1, and ai1 may block it with the Bears it detained.
    s = walkTo(s, "user", "declare-attackers", 9);
    s = attackInto(s, arrester, "ai1");
    row.blockOfferedOnDetainersTurn = blockOffered(s, "bear", arrester, "ai1");
    row.canBlockAttacker = canBlockAttacker(s, "bear", arrester, "ai1");
    console.log(`WITNESS detain ${JSON.stringify(row)}`);
    expect(row).toEqual({
      cast: DETAIN_LOCKS, attackOfferedOnItsTurn: false, blockOfferedOnAi2Turn: false, atAi3Cleanup: DETAIN_LOCKS,
      asUsersTurnBegins: [], blockOfferedOnDetainersTurn: true, canBlockAttacker: true,
    });
  });
});

// ── GOAD ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ goad (CR 701.15a) — the goad ends as the goader's next turn begins", () => {
  it("⭐ goaded through ai1's turn (offered only at players other than the goader), not goaded once the goader's turn begins", () => {
    let s = castAndResolve(pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hand: [DECORUM], pool: { R: 2, C: 2 } }), "c-dd");
    const row = { goaders: [...goaderControllersOf(s, "bear")], mustAttack: permanentHasKeyword(s, "bear", "mustAttack") };
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.defendersOffered = [...new Set(legalActionsForPlayer(s, "ai1").filter((a) => a.kind === "declare-attacker" && a.permanentId === "bear").map((a) => a.defenderId))].sort();
    s = walkTo(s, "ai3", "cleanup", 8);
    row.atAi3Cleanup = [...goaderControllersOf(s, "bear")];
    s = walkTo(s, "user", "untap", 9);
    row.asGoadersTurnBegins = { goaders: [...goaderControllersOf(s, "bear")], mustAttack: permanentHasKeyword(s, "bear", "mustAttack"), goaded: permanentHasKeyword(s, "bear", "goaded") };
    console.log(`WITNESS goad ${JSON.stringify(row)}`);
    expect(row).toEqual({
      goaders: ["user"], mustAttack: true, defendersOffered: ["ai2", "ai3"], atAi3Cleanup: ["user"],
      asGoadersTurnBegins: { goaders: [], mustAttack: false, goaded: false },
    });
  });

  it("⭐ Kardur, Doomscourge's rule over the opponents' creatures — 'until your next turn' — ends as its controller's next turn begins", () => {
    let s = castAndResolve(pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hand: [KARDUR], pool: { B: 1, R: 1, C: 2 } }), "c-kd");
    const row = { cast: permanentHasKeyword(s, "bear", "mustAttack") };
    s = walkTo(s, "ai3", "end", 8);
    row.ai3End = permanentHasKeyword(s, "bear", "mustAttack");
    s = walkTo(s, "user", "untap", 9);
    row.asKardursTurnBegins = { mustAttack: permanentHasKeyword(s, "bear", "mustAttack"), goaded: permanentHasKeyword(s, "bear", "goaded") };
    console.log(`WITNESS kardur ${JSON.stringify(row)}`);
    expect(row).toEqual({ cast: true, ai3End: true, asKardursTurnBegins: { mustAttack: false, goaded: false } });
  });
});

// ── A PROTECTION-CLASS GRANT ──────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ Savage Order — 'It gains indestructible until your next turn.'", () => {
  it("⭐ indestructible through every opponent's turn, gone as its controller's next turn begins", () => {
    const s0 = pod({ library: [{ ...DREADMAW, id: "DINO" }, ...Array.from({ length: 11 }, (_, i) => ({ ...PLAINS, id: `lib-user-${i}` }))] });
    const atom = parseEffectProgram(SAVAGE_ORDER).atoms[0];
    let s = resolveTutorChoice(ATOM_RESOLVERS.tutor(s0, atom, { controller: "user", targets: [], cardName: "Savage Order" }), "DINO");
    const dino = s.players.user.battlefield.find((p) => p.card?.id === "DINO")?.id;
    const row = { entered: permanentHasKeyword(s, dino, "indestructible") };
    s = walkTo(s, "ai2", "end", 7);
    row.ai2End = permanentHasKeyword(s, dino, "indestructible");
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup = permanentHasKeyword(s, dino, "indestructible");
    s = walkTo(s, "user", "untap", 9);
    row.asOwnersTurnBegins = permanentHasKeyword(s, dino, "indestructible");
    console.log(`WITNESS savageOrder ${JSON.stringify(row)}`);
    expect(row).toEqual({ entered: true, ai2End: true, ai3Cleanup: true, asOwnersTurnBegins: false });
  });
});

// ── A PLAYER WHO LEAVES THE GAME (CR 800.4m) ──────────────────────────────────────────────────────────────────────────────
describe("⭐ the detainer leaves the game — the detention lasts until the turn they would have taken would have begun (CR 800.4m)", () => {
  // The seats run user → ai1 → ai2 → ai3. The user detains ai1's Bears on turn 5 and leaves; the user's next turn would have been
  // turn 9, which ai1 takes instead (CR 800.4k), so in all three cases the detention ends as ai1's turn 9 begins — never at once,
  // never for good.
  const detained = () => castAndResolve(
    pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hand: [ARRESTER], pool: { W: 1, C: 1 } }),
    "c-aa", { triggerTarget: "bear" });
  it("⭐ leaving in the turn of the seat before them (ai3's turn 8): still detained for the rest of that turn, free as ai1's turn 9 begins", () => {
    let s = walkTo(detained(), "ai3", "main", 8);
    s = removePlayerFromGame(s, "user");
    const row = { left: !s.players.user, rightAfter: locks(s, "bear") };
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup8 = locks(s, "bear");
    s = walkTo(s, "ai1", "untap", 9);
    row.asAi1Turn9Begins = locks(s, "bear");
    console.log(`WITNESS leaverBeforeTheirSeat ${JSON.stringify(row)}`);
    expect(row).toEqual({ left: true, rightAfter: DETAIN_LOCKS, ai3Cleanup8: DETAIN_LOCKS, asAi1Turn9Begins: [] });
  });

  it("⭐ leaving in another seat's turn (ai1's turn 6): detained through ai2's and ai3's turns, free as ai1's turn 9 begins", () => {
    let s = walkTo(detained(), "ai1", "main", 6);
    s = removePlayerFromGame(s, "user");
    const row = { left: !s.players.user };
    s = walkTo(s, "ai2", "upkeep", 7);
    row.ai2Turn7 = locks(s, "bear");
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup8 = locks(s, "bear");
    s = walkTo(s, "ai1", "untap", 9);
    row.asAi1Turn9Begins = locks(s, "bear");
    console.log(`WITNESS leaverInAnotherTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ left: true, ai2Turn7: DETAIN_LOCKS, ai3Cleanup8: DETAIN_LOCKS, asAi1Turn9Begins: [] });
  });

  it("⭐ leaving in their own turn (turn 5): ai1's turn 6 begins at once and the Bears is still detained; free as ai1's turn 9 begins", () => {
    let s = removePlayerFromGame(detained(), "user");
    const row = { left: !s.players.user, turnNow: `${s.activePlayer} ${s.step} ${s.turn}` };
    s = walkTo(s, "ai1", "declare-attackers", 6);
    row.ai1Turn6 = locks(s, "bear");
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup8 = locks(s, "bear");
    s = walkTo(s, "ai1", "untap", 9);
    row.asAi1Turn9Begins = locks(s, "bear");
    console.log(`WITNESS leaverInOwnTurn ${JSON.stringify(row)}`);
    expect(row).toEqual({ left: true, turnNow: "ai1 untap 6", ai1Turn6: DETAIN_LOCKS, ai3Cleanup8: DETAIN_LOCKS, asAi1Turn9Begins: [] });
  });
});

describe("⭐ the sweep itself (layers.expireContinuousEffects)", () => {
  const goadBy = (owner, turn) => ({ layer: 6, op: { layerOp: "addKeyword", keyword: "mustAttack" }, affects: { mode: "fixed", permanentIds: ["bear"] }, duration: { kind: "untilOwnersNextTurn", owner, turn }, source: { kind: "resolution", permanentId: null, controller: owner } });
  const board = (effect) => {
    const s = pod({ battlefield: { ai1: [bears("bear", "ai1")] } });
    return { ...s, continuousEffects: [{ ...effect, id: "ceff-1", timestamp: 0, isCDA: false, sublayer: null }] };
  };
  it("⭐ an effect whose owner is gone with no hand-over (a state saved before it) ends as the next turn begins — never for good", () => {
    const s0 = board(goadBy("ai2", 5));
    const { ai2: _gone, ...players } = s0.players;
    const s = { ...s0, players, turnOrder: ["user", "ai1", "ai3"], turn: 6, activePlayer: "ai1" };
    expect(permanentHasKeyword(s, "bear", "mustAttack")).toBe(true);
    expect(permanentHasKeyword(expireContinuousEffects(s, { atTurnBegin: { playerId: "ai1", turn: 6 } }), "bear", "mustAttack")).toBe(false);
  });
  it("a cleanup never ends it — not the casting turn's, not its owner's next one", () => {
    const s = board(goadBy("user", 5));
    expect(permanentHasKeyword(expireContinuousEffects(s, { atCleanupOfTurn: 5 }), "bear", "mustAttack")).toBe(true);
    expect(permanentHasKeyword(expireContinuousEffects({ ...s, turn: 9, activePlayer: "user" }, { atCleanupOfTurn: 9 }), "bear", "mustAttack")).toBe(true);
  });
});

// ── CONTROLS (the same on both trees) ─────────────────────────────────────────────────────────────────────────────────────
describe("controls — the durations this change leaves alone", () => {
  it("control: 'until end of turn' (Giant Growth) lasts through the end step and ends in that turn's cleanup (CR 514.2)", () => {
    let s = castAndResolve(pod({ battlefield: { user: [bears("mine", "user")] }, hand: [GIANT_GROWTH], pool: { G: 1 } }), "c-gg", { pick: (a) => a.targets?.[0]?.id === "mine" });
    const row = { cast: permanentPower(s, "mine") };
    s = walkTo(s, "user", "end", 5);
    row.endStep = permanentPower(s, "mine");
    s = walkTo(s, "ai1", "untap", 6);
    row.nextTurn = permanentPower(s, "mine");
    expect(row).toEqual({ cast: 5, endStep: 5, nextTurn: 2 });
  });

  it("control: 'until the END of your next turn' (Light Up the Stage) lasts through that turn and lapses in its cleanup", () => {
    let s = castAndResolve(pod({ hand: [LIGHT_UP], pool: { R: 1, C: 2 } }), "c-lu");
    const exiled = s.players.user.exile.filter((c) => c._impulse).map((c) => c.id);
    const row = { exiled: exiled.length };
    s = walkTo(s, "user", "main", 9);
    row.playableOnNextTurn = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.fromZone === "exile" && exiled.includes(a.cardId)).length;
    s = walkTo(s, "user", "end", 9);
    row.stampedAtNextTurnsEnd = s.players.user.exile.filter((c) => c._impulse).length;
    s = walkTo(s, "ai1", "untap", 10);
    row.stampedAfter = s.players.user.exile.filter((c) => c._impulse).length;
    expect(row).toEqual({ exiled: 2, playableOnNextTurn: 2, stampedAtNextTurnsEnd: 2, stampedAfter: 0 });
  });

  it("control: Teferi's Protection — protection from everything holds through the opponents' turns, ends as the controller's next turn begins", () => {
    let s = castAndResolve(pod({ hand: [TEFERIS_PROTECTION], pool: { W: 1, C: 2 } }), "c-tp");
    const row = { cast: playerProtectedFromEverything(s, "user") };
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup = playerProtectedFromEverything(s, "user");
    s = walkTo(s, "user", "untap", 9);
    row.asTurnBegins = playerProtectedFromEverything(s, "user");
    expect(row).toEqual({ cast: true, ai3Cleanup: true, asTurnBegins: false });
  });

  it("control: a stored damage replacement whose controller left in the turn before their seat ends as the next turn begins", () => {
    // Lightning, Army of One's Stagger, controlled by ai2 and laid on the user; ai2 leaves in ai1's turn 6 — its next turn would
    // have been turn 7, which ai3 takes.
    const atom = damageReplacementUntilNextTurnClauseParser(LIGHTNING_STAGGER);
    let s = walkTo(pod(), "ai1", "main", 6);
    s = applyDamageReplacementUntilNextTurn(s, atom, { controller: "ai2", damagedPlayerId: "user", cardName: "Lightning, Army of One" });
    s = removePlayerFromGame(s, "ai2");
    const row = { stored: (s.damageReplacementEffects || []).length };
    s = walkTo(s, "ai1", "cleanup", 6);
    row.ai1Cleanup = (s.damageReplacementEffects || []).length;
    s = walkTo(s, "ai3", "untap", 7);
    row.asAi3Turn7Begins = (s.damageReplacementEffects || []).length;
    expect(row).toEqual({ stored: 1, ai1Cleanup: 1, asAi3Turn7Begins: 0 });
  });

  it("control: findPermanent still sees the detained creature after its detention ends (nothing was moved)", () => {
    const s = castAndResolve(pod({ battlefield: { ai1: [bears("bear", "ai1")] }, hand: [ARRESTER], pool: { W: 1, C: 1 } }), "c-aa", { triggerTarget: "bear" });
    expect(findPermanent(walkTo(s, "user", "untap", 9), "bear")?.controller).toBe("ai1");
  });
});
