/**
 * attackRequirements.test.js — ATTACK REQUIREMENTS, ONE CHECK FOR EVERY SEAT (CR 508.1c, 508.1d, 701.15b–d).
 *
 * CR 508.1d: the attacking player obeys the maximum possible number of requirements without disobeying a restriction,
 * and is not required to pay a cost to obey one. Goad (CR 701.15b) is two requirements: the creature "attacks each combat
 * if able" and "attacks a player other than the controller of the [goading] permanent, spell, or ability if able";
 * each goader adds its own pair (CR 701.15c), the same goader again adds none (CR 701.15d). Kardur, Doomscourge lays
 * the same two requirements on a group (not goad).
 *
 * The bundled rulings (Shiny Impetus, Disrupt Decorum, Agitator Ant, Kardur, Doomscourge) spell out what follows:
 *   · goaded once: it attacks a PLAYER other than the goader if able — a planeswalker is not a player;
 *   · "If the creature can't attack any of those players but could otherwise attack, it must attack a planeswalker an
 *     opponent controls, a battle an opponent controls, or a player who goaded it.";
 *   · goaded by several: it attacks an opponent who has not goaded it; goaded by EACH opponent, "the creature must attack
 *     an opponent (rather than a planeswalker or battle), but you choose which opponent it attacks.";
 *   · "If there's a cost associated with having a creature attack a player, its controller isn't forced to pay that cost,
 *     so it doesn't have to attack that player."
 *
 * Before this file the requirements lived only in the AI's attack planner, and only partly: its goad filter kept a
 * non-goader's planeswalker, so the walker-kill focus sent a goaded creature at a planeswalker; and a person's attack
 * declaration was not checked at all — the offer let a goaded creature attack its goader and let the declaration close
 * with a must-attack creature at home. Now attackRequirements.js is the one check: legalChoices offers only the
 * declarations that obey the requirements (for every seat), and the AI planner reads the same functions.
 *
 * Real oracle fixtures (bundled Scryfall, cardIndex.publicCard, 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { pickAttackPlan } from "./opponentAI.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { isLegalAction } from "./gameApi.js";
import { makeDecision } from "./decisionGate.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SHINY = {"name":"Shiny Impetus","type":"Enchantment — Aura","mana":"{2}{R}","cmc":3,"keywords":["Goad","Treasure","Enchant"],"colors":["R"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // #1389
const KARDUR = {"name":"Kardur, Doomscourge","type":"Legendary Creature — Demon Berserker","mana":"{2}{B}{R}","cmc":4,"power":"4","toughness":"3","keywords":[],"colors":["B","R"],"oracle":"When Kardur enters, until your next turn, creatures your opponents control attack each combat if able and attack a player other than you if able.\nWhenever an attacking creature dies, each opponent loses 1 life and you gain 1 life."}; // #987
const CYCLOPS = {"name":"Bloodrock Cyclops","type":"Creature — Cyclops","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"This creature attacks each combat if able."}; // #31053
const PROPAGANDA = {"name":"Propaganda","type":"Enchantment","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // #112
const ARBITER = {"name":"Silent Arbiter","type":"Artifact Creature — Construct","mana":"{4}","cmc":4,"power":"1","toughness":"5","keywords":[],"colors":[],"oracle":"No more than one creature can attack each combat.\nNo more than one creature can block each combat."}; // #1159
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // #3557
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const walker = (id, controller, loyalty) => P(id, JACE, controller, { counters: { loyalty } });

/** A game in `seat`'s declare attackers step; `boards` maps seat → permanents. `goads` = [[goaderSeat, creatureId], …]
 *  puts a Shiny Impetus controlled by the goader on that creature (each Aura on its own controller's battlefield). */
function game({ pod = true, seat, boards = {}, goads = [], life = 40 }) {
  const s0 = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life };
  return withGoads({ ...s0, players, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers" }, goads);
}

/** Each [goaderSeat, creatureId] puts a Shiny Impetus controlled by the goader on that creature. */
function withGoads(s, goads) {
  const players = { ...s.players };
  goads.forEach(([goader, creatureId], i) => {
    const auraId = `aura-${goader}-${i}`;
    for (const pid of Object.keys(players)) {
      players[pid] = { ...players[pid], battlefield: players[pid].battlefield.map((p) => (p.id === creatureId ? { ...p, attachments: [...(p.attachments || []), auraId] } : p)) };
    }
    players[goader] = { ...players[goader], battlefield: [...players[goader].battlefield, P(auraId, SHINY, goader, { attachedTo: creatureId })] };
  });
  return { ...s, players };
}

/** Kardur under `kardurSeat` enters and its trigger resolves; then it is `seat`'s declare attackers step. */
function afterKardur({ kardurSeat, seat, boards = {} }) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life: 40 };
  const kardur = P("kardur", KARDUR, kardurSeat);
  players[kardurSeat] = { ...players[kardurSeat], battlefield: [...players[kardurSeat].battlefield, kardur] };
  let s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: kardurSeat, priorityHolder: kardurSeat, consecutivePasses: 0 };
  s = flushTriggers(checkEnterTriggers(s, kardur));
  let guard = 0;
  while (s.stack.length && guard++ < 20) s = flushTriggers(resolveTopOfStack(s));
  return { ...s, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers" };
}

const attacks = (s, seat) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker");
/** The offered (defender, planeswalker) pairs for one creature, sorted. */
const pairsFor = (s, seat, id) => attacks(s, seat).filter((a) => a.permanentId === id)
  .map((a) => (a.defenderPlaneswalkerId ? `${a.defenderId}:${a.defenderPlaneswalkerId}` : (a.defenderId ?? "(lone)"))).sort();
const kinds = (s, seat) => [...new Set(legalActionsForPlayer(s, seat).map((a) => a.kind))].sort();
const offersPass = (s, seat) => legalActionsForPlayer(s, seat).some((a) => a.kind === "pass-priority");
const plan = (s, seat) => pickAttackPlan(s, seat, attacks(s, seat));
const target = (a) => (a.defenderPlaneswalkerId ? `${a.defenderId}:${a.defenderPlaneswalkerId}` : a.defenderId);

describe("⭐ the AI planner: a goaded creature attacks a PLAYER other than its goader, never the walker it would like to kill", () => {
  // ai1's Bears wear the user's Shiny Impetus (4/4); ai2 holds Jace at 3 loyalty and no blocker — the clean walker kill
  // chooseWalkerToKill focuses whenever the swing can cover the loyalty.
  it("goaded by the user, with ai2's Jace open: it attacks ai2 or ai3 (the planner used to send it at Jace)", () => {
    const s = game({ seat: "ai1", boards: { ai1: [P("bears", BEARS, "ai1")], ai2: [walker("jace", "ai2", 3)] }, goads: [["user", "bears"]] });
    const p = plan(s, "ai1");
    expect(p.map(target)).toHaveLength(1);
    expect(["ai2", "ai3"]).toContain(target(p[0]));
  });

  it("Kardur (the user's) with ai2's Jace open: ai1's Bears attack ai2 or ai3, not Jace", () => {
    const s = afterKardur({ kardurSeat: "user", seat: "ai1", boards: { ai1: [P("bears", BEARS, "ai1")], ai2: [walker("jace", "ai2", 2)] } });
    const p = plan(s, "ai1");
    expect(p.map(target)).toHaveLength(1);
    expect(["ai2", "ai3"]).toContain(target(p[0]));
  });

  it("goaded by EVERY opponent: it attacks an opponent — not a planeswalker (the ruling)", () => {
    const s = game({ seat: "ai1", boards: { ai1: [P("bears", BEARS, "ai1")], ai2: [walker("jace", "ai2", 3)] }, goads: [["user", "bears"], ["ai2", "bears"], ["ai3", "bears"]] });
    const p = plan(s, "ai1");
    expect(p.map(target)).toHaveLength(1);
    expect(["user", "ai2", "ai3"]).toContain(target(p[0]));
  });

  it("handed every (creature, defender) pair — not only the offered ones — the planner still keeps the goaded creature off Jace", () => {
    const s = game({ seat: "ai1", boards: { ai1: [P("bears", BEARS, "ai1")], ai2: [walker("jace", "ai2", 3)] }, goads: [["user", "bears"]] });
    const every = ["user", "ai2", "ai3"].map((defenderId) => ({ kind: "declare-attacker", playerId: "ai1", permanentId: "bears", name: "Grizzly Bears", defenderId }));
    every.splice(2, 0, { kind: "declare-attacker", playerId: "ai1", permanentId: "bears", name: "Grizzly Bears", defenderId: "ai2", defenderPlaneswalkerId: "jace", targetName: "Jace Beleren" });
    const p = pickAttackPlan(s, "ai1", every);
    expect(["ai2", "ai3"]).toContain(target(p[0]));
  });

  it("a goaded creature's power does not count toward a walker kill it can't join: a lone 1/1 is not sent at a 3-loyalty Jace", () => {
    const soldier = { ...BEARS, name: "Soldier", power: "1", toughness: "1" };
    const s = game({ seat: "ai1", boards: { ai1: [P("bears", BEARS, "ai1"), P("soldier", soldier, "ai1")], ai2: [walker("jace", "ai2", 3)] }, goads: [["user", "bears"]] });
    const p = plan(s, "ai1");
    expect(p.map(target).filter((t) => t.includes(":"))).toEqual([]);
  });

  it("control — a creature that is not goaded still takes the walker kill on the same board", () => {
    const s = game({ seat: "ai1", boards: { ai1: [P("giant", { ...GIANT }, "ai1")], ai2: [walker("jace", "ai2", 3)] } });
    expect(plan(s, "ai1").map(target)).toEqual(["ai2:jace"]);
  });

  it("control — two players, goaded by the only opponent: attacking that opponent's planeswalker is allowed (\"if able\")", () => {
    // The goader is the only player it can attack, so no option obeys the second requirement: the goader and the goader's
    // planeswalker obey the same number, and the walker kill may take Jace.
    const s = game({ pod: false, seat: "ai", boards: { ai: [P("bears", BEARS, "ai")], user: [walker("jace", "user", 3)] }, goads: [["user", "bears"]] });
    expect(pairsFor(s, "ai", "bears")).toEqual(["user", "user:jace"]);
    expect(plan(s, "ai").map(target)).toEqual(["user:jace"]);
  });
});

describe("⭐ the offer (every seat — a person included): only declarations that obey the most requirements", () => {
  const POD = (extra = {}) => ({ user: [P("bears", BEARS, "user"), P("giant", GIANT, "user")], ai2: [walker("jace", "ai2", 3)], ...extra });

  it("the user's Bears goaded by ai1: offered only at ai2 and ai3 (not at ai1, not at Jace)", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai2", "ai3"]);
  });

  it("control — the user's Hill Giant on the same board is offered every target", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"]] });
    expect(pairsFor(s, "user", "giant")).toEqual(["ai1", "ai2", "ai2:jace", "ai3"]);
  });

  it("Kardur under ai1: the user's Bears are offered only at ai2 and ai3", () => {
    const s = afterKardur({ kardurSeat: "ai1", seat: "user", boards: POD() });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai2", "ai3"]);
  });

  it("goaded by ai1 and ai2: offered only at ai3 — the one opponent that has not goaded it (CR 701.15c)", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"], ["ai2", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai3"]);
  });

  it("goaded by every opponent: offered at each opponent, never at a planeswalker", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"], ["ai2", "bears"], ["ai3", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai1", "ai2", "ai3"]);
  });

  it("goaded twice by ai1 and once each by ai2 and ai3: the second goad adds no requirement (CR 701.15d) — offered at each opponent", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"], ["ai1", "bears"], ["ai2", "bears"], ["ai3", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai1", "ai2", "ai3"]);
  });

  it("Kardur's rule (ai1's) beside goads by ai1, ai2 and ai3: Kardur's is a requirement of its own — offered only at ai2 and ai3", () => {
    // Attacking ai1 obeys the two goads by ai2 and ai3; attacking ai2 obeys Kardur's, ai1's goad and ai3's goad — three.
    const s = withGoads(afterKardur({ kardurSeat: "ai1", seat: "user", boards: POD() }), [["ai1", "bears"], ["ai2", "bears"], ["ai3", "bears"]]);
    expect(pairsFor(s, "user", "bears")).toEqual(["ai2", "ai3"]);
  });

  it("control — two players, goaded by the only opponent: the opponent and its planeswalker are both offered", () => {
    const s = game({ pod: false, seat: "user", boards: { user: [P("bears", BEARS, "user")], ai: [walker("jace", "ai", 3)] }, goads: [["ai", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai", "ai:jace"]);
  });

  it("control — the other players behind Propaganda and nothing to pay with: the goader is offered (not forced to pay)", () => {
    const s = game({ seat: "user", boards: POD({ ai2: [walker("jace", "ai2", 3), P("prop2", PROPAGANDA, "ai2")], ai3: [P("prop3", PROPAGANDA, "ai3")] }), goads: [["ai1", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai1"]);
  });

  it("control — the same with two Mountains: paying to attack ai2 stays a legal choice beside the free attack at ai1", () => {
    const lands = [P("m1", MOUNTAIN, "user"), P("m2", MOUNTAIN, "user")];
    const s = game({ seat: "user", boards: POD({ user: [P("bears", BEARS, "user"), ...lands], ai2: [walker("jace", "ai2", 3), P("prop2", PROPAGANDA, "ai2")], ai3: [P("prop3", PROPAGANDA, "ai3")] }), goads: [["ai1", "bears"]] });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai1", "ai2", "ai2:jace", "ai3"]);
  });

  it("the play API refuses the goaded Bears' attack at the goader, and takes the attack at ai2", () => {
    const s = game({ seat: "user", boards: POD(), goads: [["ai1", "bears"]] });
    const at = (defenderId) => attacksAt(s, defenderId);
    expect([isLegalAction(s, at("ai1")), isLegalAction(s, at("ai2"))]).toEqual([false, true]);
  });

  it("intermediate difficulty's automatic attack takes a legal target for the goaded Bears", () => {
    const s = game({ seat: "user", boards: { user: [P("bears", BEARS, "user")] }, goads: [["ai1", "bears"]] });
    const d = makeDecision(s, "user", legalActionsForPlayer(s, "user"), { difficulty: "intermediate" });
    expect(d.action?.kind).toBe("declare-attacker");
    expect(["ai2", "ai3"]).toContain(d.action.defenderId);
  });
});

/** The goaded Bears' attack action at a defender, built the way the offer builds it (so the base offer can match it). */
function attacksAt(s, defenderId) {
  return { kind: "declare-attacker", playerId: "user", permanentId: "bears", name: "Grizzly Bears", defenderId };
}

describe("⭐ the declaration can't close while a creature that must attack is still at home (CR 508.1d)", () => {
  const twoSeat = (userBoard, aiBoard = []) => game({ pod: false, seat: "user", boards: { user: userBoard, ai: aiBoard }, life: 20 });

  it("Bloodrock Cyclops untapped: only the declaration is offered — no pass — until it is declared; then the pass returns", () => {
    const s = twoSeat([P("cyclops", CYCLOPS, "user")]);
    expect(kinds(s, "user")).toEqual(["declare-attacker"]);
    const after = dispatchAction(s, attacks(s, "user")[0]);
    expect(offersPass(after, "user")).toBe(true);
  });

  it("a goaded creature in a pod: no pass until it is declared", () => {
    const s = game({ seat: "user", boards: { user: [P("bears", BEARS, "user")] }, goads: [["ai1", "bears"]] });
    expect(offersPass(s, "user")).toBe(false);
  });

  it("Kardur's rule (ai1's) on the user's Bears: no pass until they are declared", () => {
    const s = afterKardur({ kardurSeat: "ai1", seat: "user", boards: { user: [P("bears", BEARS, "user")] } });
    expect(offersPass(s, "user")).toBe(false);
  });

  it("control — a creature with no requirement: the pass is offered", () => {
    expect(offersPass(twoSeat([P("bears", BEARS, "user")]), "user")).toBe(true);
  });

  it("control — a summoning-sick Cyclops can't attack, so it owes nothing: the pass is offered", () => {
    expect(offersPass(twoSeat([P("cyclops", CYCLOPS, "user", { summoningSick: true })]), "user")).toBe(true);
  });

  it("control — the only attack costs {2} (Propaganda): the Cyclops may attack by paying, and need not — the pass is offered", () => {
    const s = twoSeat([P("cyclops", CYCLOPS, "user"), P("m1", MOUNTAIN, "user"), P("m2", MOUNTAIN, "user")], [P("prop", PROPAGANDA, "ai")]);
    expect(pairsFor(s, "user", "cyclops")).toEqual(["(lone)"]);
    expect(offersPass(s, "user")).toBe(true);
  });

  it("Silent Arbiter (no more than one creature can attack): the one attack must be the Cyclops's — the Bears are not offered", () => {
    // The CR 508.1d example: with "attacks if able" beside a creature with no abilities under a one-attacker limit,
    // the only legal declaration is the creature that attacks if able.
    const s = twoSeat([P("bears", BEARS, "user"), P("cyclops", CYCLOPS, "user")], [P("arb", ARBITER, "ai")]);
    expect(attacks(s, "user").map((a) => a.permanentId)).toEqual(["cyclops"]);
    expect(offersPass(s, "user")).toBe(false);
    const after = dispatchAction(s, attacks(s, "user")[0]);
    expect([attacks(after, "user").length, offersPass(after, "user")]).toEqual([0, true]);
  });

  it("control — Silent Arbiter and two creatures with no requirement: both are offered, and the pass", () => {
    const s = twoSeat([P("bears", BEARS, "user"), P("giant", GIANT, "user")], [P("arb", ARBITER, "ai")]);
    expect([attacks(s, "user").map((a) => a.permanentId).sort(), offersPass(s, "user")]).toEqual([["bears", "giant"], true]);
  });
});

describe("the AI under the same check", () => {
  it("Silent Arbiter: the AI's one attacker is its Cyclops, not the Bears listed first", () => {
    const s = game({ pod: false, seat: "ai", boards: { ai: [P("bears", BEARS, "ai"), P("cyclops", CYCLOPS, "ai")], user: [P("arb", ARBITER, "user", { tapped: true })] }, life: 20 });
    expect(plan(s, "ai").map((a) => a.permanentId)[0]).toBe("cyclops");
  });

  it("Propaganda: a Cyclops whose only attack costs {2} is not forced in — the racer holds it back from a 6/4", () => {
    const s = game({ pod: false, seat: "ai", boards: { ai: [P("cyclops", CYCLOPS, "ai"), P("m1", MOUNTAIN, "ai"), P("m2", MOUNTAIN, "ai")], user: [P("prop", PROPAGANDA, "user"), P("wurm", WURM, "user")] }, life: 20 });
    expect(plan(s, "ai")).toEqual([]);
  });

  it("control — the same Cyclops with no Propaganda is forced in", () => {
    const s = game({ pod: false, seat: "ai", boards: { ai: [P("cyclops", CYCLOPS, "ai"), P("m1", MOUNTAIN, "ai"), P("m2", MOUNTAIN, "ai")], user: [P("wurm", WURM, "user")] }, life: 20 });
    expect(plan(s, "ai").map((a) => a.permanentId)).toEqual(["cyclops"]);
  });
});
