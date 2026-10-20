/**
 * kardurDoomscourge.test.js — the play-weighted program, #987 Kardur, Doomscourge.
 *
 *   "When Kardur enters, until your next turn, creatures your opponents control attack each combat if able and attack a player
 *    other than you if able.
 *    Whenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."
 *
 * Two missing readers. (1) The enters effect is goad's two requirements (CR 701.15b's wording) laid on a whole group as a RULE:
 * it modifies no characteristic, so it applies to creatures that come under an opponent's control after it resolves too (CR
 * 611.2c; the bundled ruling: "Kardur's first ability affects all creatures your opponents control, including any that enter the
 * battlefield after the ability resolves"). Stored as two layer-6 grants — `mustAttack` and the `goaded` "not at you" half the
 * attack planner already reads — over a dynamic selector (creatures your opponents control), the effect's controller recorded on
 * its source (so "you" stays the player who controlled the ability, and the group is read against that player even after Kardur
 * leaves), lasting until that player's next turn (the goad duration). (2) "an attacking creature dies" — any player's creature
 * that was attacking as it died (the death look-back records it, CR 603.10a; the ruling: "Kardur's last ability will trigger no
 * matter who controlled the attacking creature and no matter who it was attacking").
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The enters trigger fires through checkEnterTriggers and resolves through the stack; the attack is planned by the
 * default AI (pickAttackPlan over the offered declare-attacker actions); deaths go through the lethal-damage check.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkEnterTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAttackPlan } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { goaderControllersOf, permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const KARDUR = {"name":"Kardur, Doomscourge","type":"Legendary Creature — Demon Berserker","mana":"{2}{B}{R}","cmc":4,"power":"4","toughness":"3","keywords":[],"colors":["B","R"],"oracle":"When Kardur enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."}; // body-only #987
const SHINY = {"name":"Shiny Impetus","type":"Enchantment — Aura","mana":"{2}{R}","cmc":3,"keywords":["Goad","Treasure","Enchant"],"colors":["R"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // native-trigger #1389
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WALL = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BIG = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body
const ETB = "until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able";

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
function resolveTriggers(s) {
  s = flushTriggers(s);
  let g = 0;
  while (s.stack.length && g++ < 50) s = flushTriggers(resolveTopOfStack(s));
  return s;
}
/** A four-seat game; Kardur under the user's control enters (its trigger resolved). `boards` adds permanents per seat. */
function podAfterKardur(boards = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: [], graveyard: [], library: [], life: 40 };
  const kardur = P("kardur", KARDUR, "user");
  players.user = { ...players.user, battlefield: [...players.user.battlefield, kardur] };
  let s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
  return resolveTriggers(checkEnterTriggers(s, kardur));
}
const onAi1Combat = (s) => ({ ...s, turn: s.turn + 1, activePlayer: "ai1", priorityHolder: "ai1", phase: "combat", step: "declare-attackers" });
const planFor = (s, pid = "ai1") => pickAttackPlan(s, pid, legalActionsForPlayer(s, pid).filter((a) => a.kind === "declare-attacker"));
// Each of ai1's opponents holds a 6/4: a lone 2/2 has no good attack, so only a requirement sends it in.
const walls = { user: [P("w-user", BIG, "user")], ai2: [P("w-ai2", BIG, "ai2")], ai3: [P("w-ai3", BIG, "ai3")] };

describe("PARSE + CLASSIFICATION", () => {
  it("the enters effect → ONE atom: the attack rule over creatures your opponents control until your next turn", () => {
    const p = parseEffectClause(ETB, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "opponents-attack-others", targetType: null }]);
  });

  it("\"an attacking creature dies\" → a dies watcher over any attacking creature; both triggers route natively and Kardur classifies native", () => {
    const ds = detectTriggers(KARDUR);
    expect(ds.find((d) => d.event === "dies")).toMatchObject({ event: "dies", scope: "attackingCreature" });
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect(isNativeTier(classifyCard(KARDUR))).toBe(true);
  });

  it("CREED — the requirement without its \"other than you\" half, a different duration, or an attacking creature YOU control stays unread", () => {
    for (const clause of [
      "until your next turn, creatures your opponents control attack each combat if able",
      "until end of turn, creatures your opponents control attack each combat if able and attack a player other than you if able",
    ]) expect([clause, programConfidence(parseEffectClause(clause, "Instant", { sourceScoped: true }))]).toEqual([clause, "low"]);
    const mine = detectTriggers({ ...KARDUR, name: "Test", oracle: "Whenever an attacking creature you control dies, each opponent loses 1 life and you gain 1 life." });
    expect(mine.some((d) => d.scope === "attackingCreature")).toBe(false);
  });
});

describe("RUNTIME — the attack rule", () => {
  it("⭐ after Kardur enters, ai1's lone Grizzly Bears must attack (into 6/4s) and attacks a player other than Kardur's controller", () => {
    const s = onAi1Combat(podAfterKardur({ ...walls, ai1: [P("bears", BEARS, "ai1")] }));
    const seats = planFor(s).map((a) => a.defenderId);
    expect([permanentHasKeyword(s, "bears", "mustAttack"), [...goaderControllersOf(s, "bears")]]).toEqual([true, ["user"]]);
    expect(seats).toHaveLength(1);
    expect(["ai2", "ai3"]).toContain(seats[0]);
  });

  it("control — without Kardur the same Bears holds back", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const players = { ...s0.players };
    const boards = { ...walls, ai1: [P("bears", BEARS, "ai1")] };
    for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: boards[pid] || [], hand: [], graveyard: [], library: [], life: 40 };
    const s = onAi1Combat({ ...s0, players, turn: 4 });
    expect(planFor(s)).toEqual([]);
  });

  it("the rule reaches a creature that comes under an opponent's control later (the ruling — CR 611.2c)", () => {
    let s = podAfterKardur({ ...walls });
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [P("late", BEARS, "ai1")] } } };
    s = onAi1Combat(s);
    expect([permanentHasKeyword(s, "late", "mustAttack"), [...goaderControllersOf(s, "late")]]).toEqual([true, ["user"]]);
  });

  it("Kardur's controller's own creatures are untouched — and stay so after Kardur leaves the battlefield", () => {
    let s = podAfterKardur({ user: [P("mine", WALL, "user")], ai1: [P("bears", BEARS, "ai1")] });
    expect(permanentHasKeyword(s, "mine", "mustAttack")).toBe(false);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "kardur") } } };
    expect([permanentHasKeyword(s, "mine", "mustAttack"), permanentHasKeyword(s, "bears", "mustAttack"), [...goaderControllersOf(s, "bears")]]).toEqual([false, true, ["user"]]);
  });

  it("in a two-player game the only other player is Kardur's controller: the creature must attack, and it attacks them (\"if able\")", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const players = { ...s0.players };
    for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
    const kardur = P("kardur", KARDUR, "user");
    players.user = { ...players.user, battlefield: [kardur, P("w-user", BIG, "user")] };
    players.ai = { ...players.ai, battlefield: [P("bears", BEARS, "ai")] };
    let s = resolveTriggers(checkEnterTriggers({ ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 }, kardur));
    s = { ...s, turn: 5, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers" };
    // a lone opponent: the offered attack names no defender (the dispatcher fills in the only one, CR 506.2)
    expect(planFor(s, "ai").map((x) => [x.permanentId, x.defenderId ?? "user"])).toEqual([["bears", "user"]]);
  });

  it("until Kardur's controller's next turn: gone as that turn begins", () => {
    let s = podAfterKardur({ ai1: [P("bears", BEARS, "ai1")] });
    const later = s.turn + 4;
    s = expireContinuousEffects({ ...s, turn: later, activePlayer: "user" }, { atTurnBegin: { playerId: "user", turn: later } });
    expect(permanentHasKeyword(s, "bears", "mustAttack")).toBe(false);
  });

  it("control — a goad from an Aura reads as before (Shiny Impetus: goaded by its controller)", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bears = P("bears", BEARS, "ai1", { attachments: ["aura"] });
    const aura = P("aura", SHINY, "user", { attachedTo: "bears" });
    const s = { ...s0, players: { ...s0.players, ai1: { ...s0.players.ai1, battlefield: [bears] }, user: { ...s0.players.user, battlefield: [aura] } } };
    expect([permanentHasKeyword(s, "bears", "mustAttack"), [...goaderControllersOf(s, "bears")]]).toEqual([true, ["user"]]);
  });
});

describe("RUNTIME — an attacking creature dies", () => {
  /** Two seats, Kardur on the user's side; `attackers` are in combat; `dying` gets lethal damage marked and the check runs. */
  function deathInCombat({ user = [], ai = [], attackers = [], blockers = [], dying, combat = true }) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const players = { ...s0.players };
    for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
    players.user = { ...players.user, battlefield: [P("kardur", KARDUR, "user"), ...user] };
    players.ai = { ...players.ai, battlefield: ai };
    let s = { ...s0, players, turn: 5, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      ...(combat ? { phase: "combat", step: "combat-damage", combat: { attackers, blockers } } : { phase: "precombat-main", step: "main", combat: { attackers: [], blockers: [] } }) };
    s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (x.id === dying ? { ...x, damageMarked: 99 } : x)) }])) };
    const r = destroyLethalCreatures(s);
    return resolveTriggers(checkDiesTriggers(r.state, r.dead));
  }
  const lives = (s) => [s.players.ai.life, s.players.user.life];

  it("⭐ the opponent's attacking Grizzly Bears dies → the opponent loses 1, Kardur's controller gains 1", () => {
    const s = deathInCombat({ ai: [P("bears", BEARS, "ai")], attackers: [{ permanentId: "bears", attackingPlayer: "ai", defender: "user" }], dying: "bears" });
    expect(lives(s)).toEqual([19, 21]);
  });

  it("any controller (the ruling): the user's own attacking creature dying triggers it too", () => {
    const s = deathInCombat({ user: [P("mine", WALL, "user")], attackers: [{ permanentId: "mine", attackingPlayer: "user", defender: "ai" }], dying: "mine" });
    expect(lives(s)).toEqual([19, 21]);
  });

  it("control — a BLOCKING creature dying does not; nor a creature dying outside combat", () => {
    const blocked = deathInCombat({ user: [P("mine", WALL, "user")], ai: [P("bears", BEARS, "ai")], attackers: [{ permanentId: "bears", attackingPlayer: "ai", defender: "user" }],
      blockers: [{ attackerId: "bears", blockerId: "mine" }], dying: "mine" });
    expect(lives(blocked)).toEqual([20, 20]);
    expect(lives(deathInCombat({ ai: [P("bears", BEARS, "ai")], dying: "bears", combat: false }))).toEqual([20, 20]);
  });
});
