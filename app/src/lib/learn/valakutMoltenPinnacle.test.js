/**
 * valakutMoltenPinnacle.test.js — VALAKUT, THE MOLTEN PINNACLE (the play-weighted program, EDHREC #1320), with its twin ROILING
 * CANOPY (#20221):
 *
 *   "Whenever a Mountain you control enters, if you control at least five other Mountains, you may have this land deal 3 damage
 *    to any target."
 *
 * "Other" is the Mountain that entered — the bundled rulings: "at the time a Mountain enters under your control, you control five
 * or more Mountains other than that new one", "each ability takes into consideration the other Mountains that entered at the
 * same time", and if a Mountain leaves before the ability resolves, the count drops only if it wasn't the one that caused the
 * trigger. An intervening "if" (CR 603.4), checked as it triggers and again as it resolves. The target is chosen as the ability
 * is put on the stack (CR 603.3d), the "may" decided as it resolves (CR 603.5 — "You target a permanent or player when the
 * ability triggers. You decide whether to have Valakut deal damage … as the ability resolves"). Valakut is the damage's source
 * (CR 120.3). Witnessed through real game states, for the person and for the default AI.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, raiseTriggerTargetChoice, resolveTopOfStack, settleTriggerTargetChoice } from "./gameEngine.js";
import { optionalAutoTakeValue, resolveOptionalChoice } from "./effects/runProgram.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VALAKUT = {"name":"Valakut, the Molten Pinnacle","type":"Land","mana":"","oracle":"This land enters tapped.\nWhenever a Mountain you control enters, if you control at least five other Mountains, you may have this land deal 3 damage to any target.\n{T}: Add {R}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #1320
const CANOPY = {"name":"Roiling Canopy","type":"Land","mana":"","oracle":"This land enters tapped.\nWhenever a Forest you control enters, if you control at least five other Forests, target creature you control gets +3/+3 until end of turn.\n{T}: Add {G}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #20221
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ORB = {"name":"Zuran Orb","type":"Artifact","mana":"{0}","oracle":"Sacrifice a land: You gain 2 life.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #907
const EXPLOSIVE = {"name":"Explosive Vegetation","type":"Sorcery","mana":"{3}{G}","oracle":"Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1241
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const OMEN = {"name":"Prismatic Omen","type":"Enchantment","mana":"{1}{G}","oracle":"Lands you control are every basic land type in addition to their other types.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #3477
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));

/** Heads-up, `seat`'s precombat main with no land played: `seat` holds `board` (Valakut and Mountains) and `hand`; the other seat `foes`. */
function table({ seat = "user", board = [], hand = [], foes = [], library = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    const mine = pid === seat;
    players[pid] = { ...pl, graveyard: [], landsPlayedThisTurn: 0, battlefield: mine ? board : foes, hand: mine ? hand.map((c, i) => ({ ...c, id: `h${i}` })) : [],
      library: mine ? library.map((c, i) => ({ ...c, id: `l${i}` })) : [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(mine ? pool : {}) } };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const play = (s, cardId = "h0", seat = "user") => {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "play-land" && x.cardId === cardId);
  expect(a, `the land ${cardId} is not offered`).toBeTruthy();
  return flushTriggers(dispatchAction(s, a), { chooseTargets: chooseTriggerTargets });
};
/** Resolve the stack; each optional question is answered by `answer(pc)` (true/false). Records the questions asked. */
function settle(s, answer = () => true) {
  let n = s;
  const asked = [];
  for (let g = 0; g < 80; g++) {
    if (n.pendingChoice?.kind === "optional-effect") { asked.push(n.pendingChoice.controller); n = resolveOptionalChoice(n, answer(n.pendingChoice, n)); continue; }
    if (n.pendingChoice) break;
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    if (n.stack?.length) { if (n.stack.some((o) => o.awaitingTargets)) break; n = resolveTopOfStack(n); continue; }
    const fin = finalizeStackResolution(n);
    if (fin !== n && (fin.pendingTriggers?.length || fin.stack?.length || fin.pendingChoice)) { n = fin; continue; }
    n = fin;
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return { s: n, asked };
}
/** The person's target question for their waiting Valakut ability: the offered target ids, and the state after picking `pick`. */
function target(n, pick) {
  const asked = raiseTriggerTargetChoice(n);
  expect(asked.pendingChoice?.kind, "the person is not asked for Valakut's target").toBe("trigger-target");
  const rows = asked.pendingChoice.candidates.map((c) => c.targets.map((t) => t.id).join("+")).sort();
  const row = asked.pendingChoice.candidates.find((c) => c.targets.map((t) => t.id).join("+") === pick);
  expect(row, `no row ${pick}`).toBeTruthy();
  return { rows, s: settleTriggerTargetChoice(asked, row.id) };
}
const valakuts = (s) => (s.stack || []).filter((o) => o.source?.name === "Valakut, the Molten Pinnacle").length;
const alive = (s, id) => Object.values(s.players).some((p) => p.battlefield.some((x) => x.id === id));
const SIX = () => [on("user", "vk", VALAKUT), ...many("user", "m", MOUNTAIN, 5)];

describe("the card", () => {
  it("⭐ covered: every line plays", () => {
    expect(classifyCard(VALAKUT)).toBe("land");
  });
  it("⭐ the twin: Roiling Canopy", () => {
    expect(classifyCard(CANOPY)).toBe("land");
  });
  it("⭐ the twin plays: the sixth Forest beside Roiling Canopy and five others — the person's Bears get +3/+3 until end of turn", () => {
    const n = play(table({ board: [on("user", "canopy", CANOPY), ...many("user", "f", FOREST, 5), on("user", "bears", BEARS)], hand: [FOREST] }));
    // The Bears are its one legal target ("target creature you control"), so the person is asked nothing.
    const { s } = settle(raiseTriggerTargetChoice(n).pendingChoice ? target(n, "bears").s : n, () => true);
    expect(creaturePower(s.players.user.battlefield.find((p) => p.id === "bears"), s)).toBe(5);
  });
  it("control (the twin): four other Forests — nothing", () => {
    const n = play(table({ board: [on("user", "canopy", CANOPY), ...many("user", "f", FOREST, 4), on("user", "bears", BEARS)], hand: [FOREST] }));
    const { s } = settle(n, () => true);
    expect(creaturePower(s.players.user.battlefield.find((p) => p.id === "bears"), s)).toBe(2);
  });
});

describe("the person's Valakut", () => {
  it("⭐ the sixth Mountain: asked the target (any target), then whether — yes: 3 damage kills the Hill Giant", () => {
    const n = play(table({ board: SIX(), hand: [MOUNTAIN], foes: [on("ai", "giant", GIANT)] }));
    const { rows, s: chosen } = target(n, "giant");
    const { s, asked } = settle(chosen, () => true);
    expect({ rows, asked, giant: alive(s, "giant"), yard: s.players.ai.graveyard.map((c) => c.name) })
      .toEqual({ rows: ["ai", "giant", "user"], asked: ["user"], giant: false, yard: ["Hill Giant"] });
  });
  it("⭐ the AI player targeted: 3 damage — 40 to 37", () => {
    const { s } = settle(target(play(table({ board: SIX(), hand: [MOUNTAIN] })), "ai").s, () => true);
    expect(s.players.ai.life).toBe(37);
  });
  it("⭐ declined as it resolves: no damage", () => {
    const { s, asked } = settle(target(play(table({ board: SIX(), hand: [MOUNTAIN], foes: [on("ai", "giant", GIANT)] })), "giant").s, () => false);
    expect({ asked, giant: alive(s, "giant"), life: s.players.ai.life }).toEqual({ asked: ["user"], giant: true, life: 40 });
  });
  it("⭐ the triggering Mountain sacrificed in response (Zuran Orb): the count isn't affected — 3 damage", () => {
    const n = target(play(table({ board: [...SIX(), on("user", "orb", ORB)], hand: [MOUNTAIN] })), "ai").s;
    const newMountain = n.players.user.battlefield.find((p) => p.card?.id === "h0");
    const sac = legalActionsForPlayer(n, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "orb" && JSON.stringify(a).includes(newMountain.id));
    expect(sac, "Zuran Orb sacrificing the new Mountain is not offered").toBeTruthy();
    const { s } = settle(dispatchAction(n, sac), () => true);
    expect({ life: s.players.ai.life, user: s.players.user.life }).toEqual({ life: 37, user: 42 });
  });
  it("⭐ Prismatic Omen: every land is a Mountain — a Forest entering beside Valakut and four Forests triggers it", () => {
    const n = play(table({ board: [on("user", "vk", VALAKUT), ...many("user", "f", FOREST, 4), on("user", "omen", OMEN)], hand: [FOREST] }));
    const { s } = settle(target(n, "ai").s, () => true);
    expect(s.players.ai.life).toBe(37);
  });
});

describe("controls", () => {
  it("control: four other Mountains (five with the new one) — nothing triggers", () => {
    const n = play(table({ board: [on("user", "vk", VALAKUT), ...many("user", "m", MOUNTAIN, 4)], hand: [MOUNTAIN] }));
    const { s, asked } = settle(n, () => true);
    expect({ targetAsked: raiseTriggerTargetChoice(n).pendingChoice?.kind ?? null, asked, life: s.players.ai.life }).toEqual({ targetAsked: null, asked: [], life: 40 });
  });
  it("control: another Mountain sacrificed in response (Zuran Orb) — four others as it resolves: nothing happens, not even the question", () => {
    const played = play(table({ board: [...SIX(), on("user", "orb", ORB)], hand: [MOUNTAIN] }));
    const n = raiseTriggerTargetChoice(played).pendingChoice ? target(played, "ai").s : played; // the base asks nothing (no native trigger)
    const sac = legalActionsForPlayer(n, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "orb" && JSON.stringify(a).includes("\"m0\""));
    expect(sac, "Zuran Orb sacrificing m0 is not offered").toBeTruthy();
    const { s, asked } = settle(dispatchAction(n, sac), () => true);
    expect({ asked, life: s.players.ai.life }).toEqual({ asked: [], life: 40 });
  });
  it("control: a Forest entering (no Prismatic Omen) is not a Mountain", () => {
    const n = play(table({ board: SIX(), hand: [FOREST] }));
    expect(valakuts(n)).toBe(0);
  });
  it("control: Valakut entering itself is not a Mountain", () => {
    const n = play(table({ board: many("user", "m", MOUNTAIN, 6), hand: [VALAKUT] }));
    expect(valakuts(n)).toBe(0);
  });
  it("control: an opponent's Mountain entering is not one you control", () => {
    const n = play(table({ seat: "ai", board: [on("ai", "am", MOUNTAIN)], hand: [MOUNTAIN], foes: SIX() }), "h0", "ai");
    expect(valakuts(n)).toBe(0);
  });
});

describe("the default AI's Valakut", () => {
  it("⭐ the sixth Mountain: the AI aims at the person's side and takes the damage — never its own", () => {
    const board = [on("ai", "vk", VALAKUT), ...many("ai", "am", MOUNTAIN, 5)];
    const n = play(table({ seat: "ai", board, hand: [MOUNTAIN], foes: [on("user", "ubears", BEARS)] }), "h0", "ai");
    const aimed = n.stack.find((o) => o.source?.name === "Valakut, the Molten Pinnacle")?.targets?.map((t) => t.id);
    const { s, asked } = settle(n, (pc, st) => optionalAutoTakeValue(st, pc));
    const hit = !alive(s, "ubears") || s.players.user.life === 37;
    expect({ asked, aimedAtPerson: ["user", "ubears"].includes(aimed?.[0]), hit, aiLife: s.players.ai.life }).toEqual({ asked: ["ai"], aimedAtPerson: true, hit: true, aiLife: 40 });
  });
  it("⭐ two Mountains at once (Explosive Vegetation) beside four: each sees the other — two triggers, 6 damage", () => {
    const board = [on("ai", "vk", VALAKUT), ...many("ai", "am", MOUNTAIN, 4), ...many("ai", "fo", FOREST, 4)];
    let n = table({ seat: "ai", board, hand: [EXPLOSIVE], library: [MOUNTAIN, MOUNTAIN, MOUNTAIN] });
    const cast = legalActionsForPlayer(n, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "h0");
    expect(cast, "Explosive Vegetation is not offered").toBeTruthy();
    n = resolveTopOfStack(dispatchAction(n, cast));
    for (let g = 0; g < 4 && n.pendingChoice?.kind === "tutor-search"; g++) n = resolveTutorChoice(n, autoPickTutorCandidate(n, n.pendingChoice));
    n = flushTriggers(finalizeStackResolution(n), { chooseTargets: chooseTriggerTargets });
    const triggers = valakuts(n);
    const { s } = settle(n, (pc, st) => optionalAutoTakeValue(st, pc));
    expect({ triggers, mountains: s.players.ai.battlefield.filter((p) => p.card?.name === "Mountain").length, user: s.players.user.life }).toEqual({ triggers: 2, mountains: 6, user: 34 });
  });
});
