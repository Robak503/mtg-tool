/**
 * punisherChoice.test.js — the play-weighted program, #1029 Combustible Gearhulk and #1045 Charismatic Conqueror, with Risk Factor.
 *
 *   Combustible Gearhulk:  "When this creature enters, target opponent may have you draw three cards. If the player doesn't, you
 *                           mill three cards, then this creature deals damage to that player equal to the total mana value of those
 *                           cards."
 *   Charismatic Conqueror: "Whenever an artifact or creature an opponent controls enters untapped, they may tap that permanent. If
 *                           they don't, you create a 1/1 white Vampire creature token with lifelink."
 *   Risk Factor:           "Target opponent may have Risk Factor deal 4 damage to them. If that player doesn't, you draw three cards."
 *
 * The punisher: ANOTHER player chooses between two outcomes ("[A player] may [do something]. If [that player] doesn't, [effect]."
 * — CR 118.12). Read as ONE `punisher` atom: the optional-effect pause, asked of the decider (the targeted opponent — the
 * Partner-with `optionalDeciderIsTarget` lane; or the entering permanent's controller — Selvala's `triggeringPermanentController`
 * lane), whose yes runs the `taken` branch and whose no runs the `declined` branch. A decider who can't take it (the Conqueror's
 * permanent already tapped or gone — the bundled ruling) gets the declined branch without being asked.
 *
 * The AI deciding (the default policy — `optionalAutoTakeValue` → punisherPolicy): damage against cards. It takes the damage when
 * that leaves it at the life floor (10) or more — a known amount (Risk Factor's 4), or the Gearhulk's unknown total read
 * pessimistically at 4 per card (12 for three) — and gives the cards otherwise; it always gives the draws when the caster's library
 * (public) holds fewer than that, which loses the caster the game (CR 121.4). The Conqueror's decider taps a permanent that loses
 * nothing by it this turn — a creature that entered on its controller's own turn without haste (it can't attack yet), a
 * noncreature permanent with no {T} ability — and otherwise lets the token be made.
 *
 * The Gearhulk's total is the milled cards' mana values where they went (CR 701.17c — a public zone; a card with {X} counts X as 0,
 * the bundled ruling), and the Gearhulk is the damage's source.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Casts are the offered legal actions; the Conqueror's trigger fires through checkPermanentEntersTriggers; every pause is
 * answered by the engine's own default decision (optionalAutoTakeValue), unless a test forces one.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkPermanentEntersTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { optionalAutoTakeValue, resolveOptionalChoice } from "./effects/runProgram.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, tapPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const COMBUSTIBLE = {"name":"Combustible Gearhulk","type":"Artifact Creature — Construct","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"6","keywords":["First strike","Mill"],"colors":["R"],"oracle":"First strike\nWhen this creature enters, target opponent may have you draw three cards. If the player doesn't, you mill three cards, then this creature deals damage to that player equal to the total mana value of those cards."}; // body-only #1029
const CONQUEROR = {"name":"Charismatic Conqueror","type":"Creature — Vampire Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nWhenever an artifact or creature an opponent controls enters untapped, they may tap that permanent. If they don't, you create a 1/1 white Vampire creature token with lifelink."}; // body-only #1045
const RISK = {"name":"Risk Factor","type":"Instant","mana":"{2}{R}","cmc":3,"keywords":["Jump","Jump-start"],"colors":["R"],"oracle":"Target opponent may have Risk Factor deal 4 damage to them. If that player doesn't, you draw three cards.\nJump-start (You may cast this card from your graveyard by discarding a card in addition to paying its other costs. Then exile this card.)"}; // arbiter-spell #8455
const TERRA = {"name":"Terrapact Intimidator","type":"Creature — Kavu Scout","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":"When this creature enters, target opponent may have you create two Lander tokens. If they don't, put two +1/+1 counters on this creature. (A Lander token is an artifact with \"{2}, {T}, Sacrifice this token: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\")"}; // body-only #16446
const PALANTIR = {"name":"Palantír of Orthanc","type":"Legendary Artifact","mana":"{3}","cmc":3,"keywords":["Mill","Scry"],"colors":[],"oracle":"At the beginning of your end step, put an influence counter on Palantír of Orthanc and scry 2. Then target opponent may have you draw a card. If that player doesn't, you mill X cards, where X is the number of influence counters on Palantír of Orthanc, and that player loses life equal to the total mana value of those cards."}; // body-only #1343
const VEXING = {"name":"Vexing Devil","type":"Creature — Devil","mana":"{R}","cmc":1,"power":"4","toughness":"3","keywords":[],"colors":["R"],"oracle":"When this creature enters, any opponent may have it deal 4 damage to them. If a player does, sacrifice this creature."}; // body-only #11667
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const FIREBALL = {"name":"Fireball","type":"Sorcery","mana":"{X}{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"This spell costs {1} more to cast for each target beyond the first.\nFireball deals X damage divided evenly, rounded down, among any number of targets."}; // arbiter-spell
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HASTY = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"}; // native-body
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"}; // native-equipment
const TORBRAN = {"name":"Torbran, Thane of Red Fell","type":"Legendary Creature — Dwarf Noble","mana":"{1}{R}{R}{R}","cmc":4,"power":"2","toughness":"4","keywords":[],"colors":["R"],"oracle":"If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead."}; // native-static
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."}; // native-mixed
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const mountains = (n) => Array.from({ length: n }, (_, i) => P(`mt${i}`, MOUNTAIN, "user"));
const card = (id, c) => ({ id, ...c });
// The user's library, top first: Lightning Bolt (1), Hill Giant (4), Mountain (0) — the Gearhulk's three; then filler.
const GEARHULK_LIBRARY = () => [card("l1", BOLT), card("l2", GIANT), card("l3", MOUNTAIN), ...Array.from({ length: 7 }, (_, i) => card(`lf${i}`, MOUNTAIN))];

function table({ user = [], ai = [], hand = [], library = GEARHULK_LIBRARY(), aiLife = 20, active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], exile: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand, library };
  players.ai = { ...players.ai, battlefield: ai, life: aiLife, library: Array.from({ length: 10 }, (_, i) => card(`al${i}`, MOUNTAIN)) };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}
/** Resolve; each punisher pause answered by `answer(state, pc)` — the engine's own default decision unless a test forces one. */
const defaultAnswer = (s, pc) => optionalAutoTakeValue(s, pc);
function resolveAll(s, answer = defaultAnswer, asked = []) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length || s.pendingChoice) && g++ < 300) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { asked.push(pc.controller); s = resolveOptionalChoice(s, answer(s, pc)); continue; }
    if (pc) break;
    s = passPriority(s);
  }
  return s;
}
function resolveTriggers(s, answer = defaultAnswer, asked = []) {
  let g = 0;
  s = flushTriggers(s);
  while ((s.stack.length || s.pendingChoice) && g++ < 300) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { asked.push(pc.controller); s = resolveOptionalChoice(s, answer(s, pc)); continue; }
    if (pc) break;
    s = flushTriggers(resolveTopOfStack(s));
  }
  return s;
}
const castCombustible = (opts, answer, asked) => {
  const s = table({ ...opts, user: [...(opts.user || []), ...mountains(6)], hand: [card("gear", COMBUSTIBLE)] });
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "gear");
  return resolveAll(dispatchAction(s, a), answer, asked);
};
const castRisk = (opts, answer, asked) => {
  let s = table({ ...opts, user: [...(opts.user || []), ...mountains(3)], hand: [card("risk", RISK)] });
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "risk" && (x.targets || []).some((t) => t.id === "ai"));
  if (!a) return null;
  return resolveAll(dispatchAction(s, a), answer, asked);
};
const COMBUSTIBLE_ETB = "target opponent may have you draw three cards. If the player doesn't, you mill three cards, then this creature deals damage to that player equal to the total mana value of those cards";

describe("PARSE + CLASSIFICATION", () => {
  it("Combustible Gearhulk's effect → ONE punisher atom: the targeted opponent decides; yes = you draw three, no = mill three and the total-mana-value damage", () => {
    const p = parseEffectClause(COMBUSTIBLE_ETB, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "punisher", targetType: "opponent", optional: true, optionalDeciderIsTarget: true,
      taken: { kind: "draw", count: 3 }, declined: { kind: "millDamageTotalMv", count: 3 } }]);
  });

  it("Risk Factor's spell → yes = the spell deals 4 damage to the decider, no = you draw three", () => {
    const p = parseEffectProgram(RISK);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "punisher", targetType: "opponent", optional: true, optionalDeciderIsTarget: true,
      taken: { kind: "damageDecider", amount: 4 }, declined: { kind: "draw", count: 3 } }]);
  });

  it("Charismatic Conqueror → a permanent-enters watcher on an opponent's artifact or creature entering untapped; its effect a punisher the entering permanent's controller decides", () => {
    const d = detectTriggers(CONQUEROR).find((x) => x.event === "permanentEnters");
    expect(d).toMatchObject({ event: "permanentEnters", scope: "artifactOrCreatureOpponentControls", enteredUntapped: true });
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "punisher", targetType: null, optional: true,
      optionalDecider: "triggeringPermanentController", taken: { kind: "tapTriggering" },
      declined: { kind: "createToken", token: { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white vampire", targetType: null, keywords: ["Lifelink"] } } }]);
  });

  it("Combustible Gearhulk, Charismatic Conqueror and Risk Factor classify native", () => {
    const d = detectTriggers(COMBUSTIBLE).find((x) => x.event === "etb");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect([COMBUSTIBLE, CONQUEROR, RISK].map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual([[COMBUSTIBLE.name, true], [CONQUEROR.name, true], [RISK.name, true]]);
  });

  it("CREED — punishers whose branches the atom doesn't read stay parked: Terrapact Intimidator (Landers or counters), Palantír's X mill, Vexing Devil's any-opponent damage", () => {
    for (const c of [TERRA, PALANTIR, VEXING]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, false]);
  });

  it("CREED — without \"untapped\", or watching your own permanents, the Conqueror's sentence detects nothing native", () => {
    for (const oracle of [
      "Whenever an artifact or creature an opponent controls enters, they may tap that permanent. If they don't, you create a 1/1 white Vampire creature token with lifelink.",
      "Whenever an artifact or creature you control enters untapped, they may tap that permanent. If they don't, you create a 1/1 white Vampire creature token with lifelink.",
    ]) expect([oracle, isNativeTier(classifyCard({ ...CONQUEROR, name: "Test Conqueror", oracle }))]).toEqual([oracle, false]);
  });
});

describe("RUNTIME — Combustible Gearhulk", () => {
  it("⭐ the opponent at 20 life gives the draws (20 − 12 < 10): the user draws Lightning Bolt, Hill Giant and a Mountain; nothing is milled", () => {
    const asked = [];
    const s = castCombustible({ aiLife: 20 }, defaultAnswer, asked);
    expect(asked).toEqual(["ai"]);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Lightning Bolt", "Hill Giant", "Mountain"]);
    expect([s.players.user.graveyard.length, s.players.ai.life]).toEqual([0, 20]);
  });

  it("⭐ the opponent at 40 life takes the damage: the user mills Bolt (1), Giant (4), Mountain (0) and the Gearhulk deals 5", () => {
    const s = castCombustible({ aiLife: 40 });
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Lightning Bolt", "Hill Giant", "Mountain"]);
    expect(s.players.user.hand).toEqual([]);
    expect(s.players.ai.life).toBe(35);
  });

  it("the caster's library holds two cards: the opponent gives the draws even at 40 (the third draw is from an empty library — CR 121.4)", () => {
    const s = castCombustible({ aiLife: 40, library: [card("l1", BOLT), card("l2", GIANT)] });
    expect(s.players.user.library).toEqual([]);
    expect(s.players.user.hand).toHaveLength(2);
    expect(s.players.ai.life).toBe(40);
  });

  it("a card with {X} counts X as 0 (the ruling): Fireball, Hill Giant, Mountain milled → 5 damage", () => {
    const s = castCombustible({ aiLife: 20, library: [card("l1", FIREBALL), card("l2", GIANT), card("l3", MOUNTAIN), card("l4", MOUNTAIN)] }, () => false);
    expect(s.players.ai.life).toBe(15);
  });

  it("the milled cards are counted where they went: under Rest in Peace they are exiled, and the Gearhulk still deals 5", () => {
    const s = castCombustible({ aiLife: 20, user: [P("rip", RIP, "user")] }, () => false);
    expect(s.players.user.exile.map((c) => c.name)).toEqual(["Lightning Bolt", "Hill Giant", "Mountain"]);
    expect(s.players.ai.life).toBe(15);
  });

  it("the Gearhulk (red) is the damage's source: beside Torbran, Thane of Red Fell it deals 5 + 2", () => {
    const s1 = castCombustible({ aiLife: 20, user: [P("torbran", TORBRAN, "user")] }, () => false);
    expect(s1.players.ai.life).toBe(13);
  });
});

describe("RUNTIME — Risk Factor", () => {
  it("⭐ the opponent at 20 takes the 4 damage (20 − 4 ≥ 10); the user draws nothing", () => {
    const s = castRisk({ aiLife: 20 });
    expect(s?.players.ai.life).toBe(16);
    expect(s?.players.user.hand).toEqual([]);
  });

  it("⭐ the opponent at 12 refuses the damage (12 − 4 < 10): the user draws three", () => {
    const s = castRisk({ aiLife: 12 });
    expect(s?.players.ai.life).toBe(12);
    expect(s?.players.user.hand).toHaveLength(3);
  });
});

describe("RUNTIME — Charismatic Conqueror", () => {
  /** The AI's permanent `perm` enters on `active`'s turn with the user's Conqueror out; resolve with the default decision. */
  function enter(perm, { active = "ai", answer = defaultAnswer, asked = [], before = (s) => s } = {}) {
    let s = table({ user: [P("conq", CONQUEROR, "user")], active });
    s = { ...s, players: { ...s.players, [perm.controller]: { ...s.players[perm.controller], battlefield: [...s.players[perm.controller].battlefield, perm] } } };
    s = before(checkPermanentEntersTriggers(s, perm));
    return resolveTriggers(s, answer, asked);
  }
  const vampires = (s) => s.players.user.battlefield.filter((p) => p.card?.token && p.card.name === "Vampire");
  const tappedOf = (s, id) => s.players.ai.battlefield.find((p) => p.id === id)?.tapped;

  it("⭐ the opponent's Grizzly Bears enters on its own turn: asked, the opponent taps it (it can't attack yet) — no Vampire", () => {
    const asked = [];
    const s = enter(P("bears", BEARS, "ai", { summoningSick: true }), { asked });
    expect(asked).toEqual(["ai"]);
    expect(tappedOf(s, "bears")).toBe(true);
    expect(vampires(s)).toEqual([]);
  });

  it("⭐ a hasty Raging Goblin enters: the opponent keeps it untapped and the user gets a 1/1 white Vampire with lifelink", () => {
    const s = enter(P("gob", HASTY, "ai", { summoningSick: true }));
    expect(tappedOf(s, "gob")).toBe(false);
    const [v] = vampires(s);
    expect([v?.card.power, v?.card.toughness, v?.card.colors]).toEqual([1, 1, ["W"]]);
    expect(permanentHasKeyword(s, v.id, "Lifelink")).toBe(true);
  });

  it("a creature entering on ANOTHER player's turn stays untapped (a blocker): Vampire", () => {
    const s = enter(P("bears", BEARS, "ai", { summoningSick: true }), { active: "user" });
    expect(tappedOf(s, "bears")).toBe(false);
    expect(vampires(s)).toHaveLength(1);
  });

  it("an artifact with a {T} ability (Sol Ring) stays untapped: Vampire; one without (Bonesplitter) is tapped: none", () => {
    const sol = enter(P("sol", SOL, "ai"));
    expect([tappedOf(sol, "sol"), vampires(sol).length]).toEqual([false, 1]);
    const bone = enter(P("bone", BONESPLITTER, "ai"));
    expect([tappedOf(bone, "bone"), vampires(bone).length]).toEqual([true, 0]);
  });

  it("already tapped when the ability resolves: the opponent can't tap it, so the user gets the Vampire — and nobody is asked (the ruling)", () => {
    const asked = [];
    const s = enter(P("bears", BEARS, "ai", { summoningSick: true }), { asked, before: (st) => tapPermanent(st, "bears") });
    expect(asked).toEqual([]);
    expect(vampires(s)).toHaveLength(1);
  });

  it("control — a permanent entering tapped does not trigger it; the user's own creature entering does not either", () => {
    expect(vampires(enter(P("bears", BEARS, "ai", { summoningSick: true, tapped: true })))).toEqual([]);
    expect(vampires(enter(P("mine", BEARS, "user", { summoningSick: true })))).toEqual([]);
  });

  it("a forced decline makes the Vampire; a forced take taps — the branches are the printed ones", () => {
    expect(vampires(enter(P("bears", BEARS, "ai", { summoningSick: true }), { answer: () => false }))).toHaveLength(1);
    const took = enter(P("gob", HASTY, "ai", { summoningSick: true }), { answer: () => true });
    expect([tappedOf(took, "gob"), vampires(took).length]).toEqual([true, 0]);
  });
});
