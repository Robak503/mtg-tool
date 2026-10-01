/**
 * thespianStageCopy.test.js — "becomes a copy of …, except it has this ability", and the copy that lasts (shelf decks D29,
 * 2026-09-30: Teval's Thespian's Stage). "{2}, {T}: This land becomes a copy of target land, except it has this ability."
 *
 * The become-copy seam read only "… until end of turn". With no stated duration the copy lasts (CR 611.2a), and "except it
 * has this ability" keeps the source's printed line on the copy (the retainOwnAbilities rider Sakashima uses), so it can
 * copy again. The seam's noun map also flattened its qualifiers ("another", "nonlegendary", "attacking") into a bare target
 * class — each is now the restriction the shared satisfier enforces.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic atom that pins the no-line refusal.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyBecomeCopy } from "./effects/atoms/becomeCopy.js";
import { deriveCharacteristics } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STAGE = { name: "Thespian's Stage", type: "Land", mana: "", keywords: [], oracle: "{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability." };
const MIZZIUM = { name: "Mizzium Transreliquat", type: "Artifact", mana: "{3}", keywords: [], oracle: "{3}: This artifact becomes a copy of target artifact until end of turn.\n{1}{U}{R}: This artifact becomes a copy of target artifact, except it has this ability." };
const CHARLATAN = { name: "Shameless Charlatan", type: "Legendary Enchantment — Background", mana: "{1}{U}", keywords: [], oracle: "Commander creatures you own have \"{2}{U}: This creature becomes a copy of another target creature.\"" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "({T}: Add {U}.)" };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };

function table({ user = [], ai = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [GIANT, GIANT, GIANT, GIANT, GIANT].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, library: lib, manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const copyActs = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId && a.targets?.length);
const activate = (s, permId, target) => settle(dispatchAction(s, copyActs(s, permId).find((a) => a.targets[0].id === target)));
const nameOf = (s, id) => deriveCharacteristics(s, id).copiableValues?.name ?? null;
const oracleOf = (s, id) => String(deriveCharacteristics(s, id).copiableValues?.oracle ?? "");
/** On to the next turn the way the driver steps it (enter, then the step's actions). */
function nextTurn(s) { let n = s, g = 0; const t = s.turn; while (n.turn === t && g++ < 40) n = runStepActions(advanceStep(n)); return n; }
/** Two turns on (past the opponent's) to YOUR main phase — the untap step gives no one priority, so nothing is offered there. */
function yourNextMain(s) { let n = nextTurn(nextTurn(s)), g = 0; while (n.step !== "main" && g++ < 20) n = runStepActions(advanceStep(n)); return n; }

describe("the cards", () => {
  it("the Stage, Mizzium Transreliquat and Shameless Charlatan read native; the lasting copy carries the this-ability marker", () => {
    expect({
      stage: parseEffectClause("This land becomes a copy of target land, except it has this ability.", "Instant", { sourceScoped: true }).atoms,
      tiers: [classifyCard(STAGE), classifyCard(MIZZIUM), classifyCard(CHARLATAN)],
    }).toEqual({
      stage: [{ op: "become-copy", targetType: "land", riders: [{ kind: "hasThisAbility" }], optional: false, lasting: true }],
      tiers: ["land", "native-activated", "native-static"],
    });
  });
  it("every qualifier of the noun is now a restriction, not flattened away (Tilonalli's Skinshifter's noun)", () => {
    const atom = parseEffectClause("it becomes a copy of another target nonlegendary attacking creature until end of turn", "Instant", { sourceScoped: true }).atoms[0];
    // SYNTHETIC: a qualifier rides only on the creature noun it is printed with — "target attacking land" is no printed noun.
    const attackingLand = parseEffectClause("it becomes a copy of target attacking land until end of turn", "Instant", { sourceScoped: true }).atoms;
    expect({ targetType: atom.targetType, restrictions: atom.restrictions, lasting: !!atom.lasting, attackingLand })
      .toEqual({ targetType: "creature", restrictions: [{ kind: "notSource" }, { kind: "supertype", value: "legendary", negate: true }, { kind: "combat", value: "attacking" }], lasting: false, attackingLand: [] });
  });
  it("SYNTHETIC: a this-ability copy whose source prints no such line refuses — never a copy that silently lost the ability", () => {
    const s = table({ user: [P("bear", GIANT), P("forest", FOREST)] });
    const after = applyBecomeCopy(s, { op: "become-copy", targetType: "land", riders: [{ kind: "hasThisAbility" }], lasting: true }, { controller: "user", sourceId: "bear", targets: [{ type: "permanent", id: "forest" }] });
    expect({ copies: (after.continuousEffects || []).filter((e) => e.layer === 1).length, reason: after.log.at(-1)?.reason }).toEqual({ copies: 0, reason: "no printed ability to keep" });
  });
});

describe("⭐ Thespian's Stage in play", () => {
  it("⭐ it becomes a Forest that keeps its copy ability — next turn still a Forest, and it can become an Island", () => {
    const s0 = table({ user: [P("stage", STAGE), P("forest", FOREST), P("island", ISLAND)], mana: { C: 2 } });
    const offered = copyActs(s0, "stage").map((a) => a.targets[0].id).sort();
    const s = activate(s0, "stage", "forest");
    const later = yourNextMain(s);
    const again = activate({ ...later, activePlayer: "user", priorityHolder: "user", players: { ...later.players, user: { ...later.players.user, manaPool: { ...later.players.user.manaPool, C: 2 } } } }, "stage", "island");
    const row = { offered, now: nameOf(s, "stage"), keeps: /except it has this ability/.test(oracleOf(s, "stage")), lostPrintedC: !/Add \{C\}/.test(oracleOf(s, "stage")),
      nextTurn: nameOf(later, "stage"), offeredLater: copyActs({ ...later, players: { ...later.players, user: { ...later.players.user, manaPool: { ...later.players.user.manaPool, C: 2 } } } }, "stage").length > 0, again: nameOf(again, "stage") };
    console.log(`WITNESS thespianStage ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["forest", "island", "stage"], now: "Forest", keeps: true, lostPrintedC: true, nextTurn: "Forest", offeredLater: true, again: "Island" });
  });
});

describe("⭐ Mizzium Transreliquat and Shameless Charlatan in play", () => {
  it("Mizzium: the {3} copy ends at cleanup; the {1}{U}{R} copy lasts and keeps only that ability", () => {
    const s0 = table({ user: [P("mizz", MIZZIUM), P("stone", MIND_STONE)], mana: { C: 3, U: 1, R: 1 } });
    const acts = copyActs(s0, "mizz");
    const temp = settle(dispatchAction(s0, acts.find((a) => a.abilityIndex === acts[0].abilityIndex && a.targets[0].id === "stone")));
    const lasting = settle(dispatchAction(s0, acts.filter((a) => a.targets[0].id === "stone").at(-1)));
    const tempNext = nextTurn(temp);
    const lastingNext = nextTurn(lasting);
    expect({
      tempNow: nameOf(temp, "mizz"), tempAfter: nameOf(tempNext, "mizz"),
      lastingAfter: nameOf(lastingNext, "mizz"), keepsUR: /\{1\}\{U\}\{R\}/.test(oracleOf(lastingNext, "mizz")), lostThree: !/^\{3\}:/m.test(oracleOf(lastingNext, "mizz")),
    }).toEqual({ tempNow: "Mind Stone", tempAfter: null, lastingAfter: "Mind Stone", keepsUR: true, lostThree: true });
  });
  it("Shameless Charlatan: your commander may copy ANOTHER creature (never itself); the copy lasts and it is still a commander with the ability", () => {
    const s0 = table({ user: [P("charlatan", CHARLATAN), P("cmdr", { ...ISAMARU, isCommander: true }), P("giant", GIANT)], mana: { C: 2, U: 1 } });
    const offered = copyActs(s0, "cmdr").map((a) => a.targets[0].id).sort();
    const s = activate(s0, "cmdr", "giant");
    const later = yourNextMain(s);
    const refill = { ...later, activePlayer: "user", priorityHolder: "user", players: { ...later.players, user: { ...later.players.user, manaPool: { ...later.players.user.manaPool, C: 2, U: 1 } } } };
    expect({ offered, now: nameOf(s, "cmdr"), later: nameOf(later, "cmdr"), stillHasIt: copyActs(refill, "cmdr").length > 0 })
      .toEqual({ offered: ["giant"], now: "Hill Giant", later: "Hill Giant", stillHasIt: true });
  });
});
