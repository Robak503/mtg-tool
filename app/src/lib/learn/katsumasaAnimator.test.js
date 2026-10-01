/**
 * katsumasaAnimator.test.js — Katsumasa, the Animator (shelf decks D33, 2026-09-30: Shorikai Vehicles 89 → 90).
 *
 *   "{2}{U}: Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying.
 *    If it's not a Vehicle, it has base power and toughness 1/1 until end of turn.
 *    At the beginning of your upkeep, put a +1/+1 counter on each of up to three target noncreature artifacts."
 *
 * The animate's two sentences size ONE target, so splitClauses folds them into one clause and the animate atom carries
 * ptUnlessVehicle: at resolution a Vehicle keeps its printed power and toughness (CR 301.7b) and anything else is set to
 * base 1/1 (layer 7b, CR 613.4b). The upkeep counters ride the multi-count add-counter atom over the layer-aware
 * noncreatureArtifact pool; a counter on a noncreature artifact waits there and counts the moment the artifact is a
 * creature (CR 122.1a), which is exactly what Katsumasa's own animate does to it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { expireContinuousEffects, permanentHasKeyword, permanentIsCreature, permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ANIMATE = "Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying. If it's not a Vehicle, it has base power and toughness 1/1 until end of turn.";
const COUNTERS = "Put a +1/+1 counter on each of up to three target noncreature artifacts.";
const KATSUMASA = { name: "Katsumasa, the Animator", type: "Legendary Creature — Moonfolk Artificer", mana: "{2}{U}{U}", power: "3", toughness: "3", keywords: ["Flying"],
  oracle: `Flying\n{2}{U}: ${ANIMATE}\nAt the beginning of your upkeep, put a +1/+1 counter on each of up to three target noncreature artifacts.` };
const SOL = { name: "Sol Ring", type: "Artifact", mana: "{1}", power: null, toughness: null, keywords: [], oracle: "{T}: Add {C}{C}." };
const MIND = { name: "Mind Stone", type: "Artifact", mana: "{2}", power: null, toughness: null, keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const SIGNET = { name: "Arcane Signet", type: "Artifact", mana: "{2}", power: null, toughness: null, keywords: [], oracle: "{T}: Add one mana of any color in your commander's color identity." };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const EXPRESS = { name: "Untethered Express", type: "Artifact — Vehicle", mana: "{4}", power: "4", toughness: "4", keywords: ["Crew", "Trample"],
  oracle: "Trample\nWhenever this Vehicle attacks, put a +1/+1 counter on it.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };

const P = (id, c, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function table({ user = [], ai = [], mana = {}, step = "main" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const phase = step === "upkeep" ? "upkeep" : "precombat-main";
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase, step, stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [P("K", KATSUMASA), ...user], manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const animateOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "K" && a.targets?.length);
const animate = (s, id) => {
  const act = animateOffers(s).find((a) => a.targets[0].id === id);
  if (!act) throw new Error(`no animate offer aimed at ${id}`);
  return settle(dispatchAction(s, act));
};
const upkeep = (s) => settle(checkStepTriggers(s, "upkeep"));
const plus = (s, id) => {
  for (const pid of ["user", "ai"]) { const p = s.players[pid].battlefield.find((x) => x.id === id); if (p) return p.counters?.["+1/+1"] || 0; }
  throw new Error(`no permanent ${id}`);
};
const size = (s, id) => [permanentPower(s, id), permanentToughness(s, id)];

describe("the card", () => {
  it("reads native-mixed; the two animate sentences fold into one atom; the upkeep line is the multi-count counter atom", () => {
    expect({
      tier: classifyCard(KATSUMASA),
      animate: parseEffectClause(ANIMATE, "Creature").atoms,
      counters: parseEffectClause(COUNTERS, "Creature").atoms,
    }).toEqual({
      tier: "native-mixed",
      animate: [{ op: "animate", targetType: "noncreatureArtifact", restrictions: [{ kind: "controller", who: "you" }], power: 1, toughness: 1, ptUnlessVehicle: true,
        subtypes: [], cardTypes: ["Artifact"], grantKeywords: ["Flying"], duration: "endOfTurn" }],
      counters: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "noncreatureArtifact", maxTargets: 3, minTargets: 0 }],
    });
  });

  it("fences (synthetic): no size, an ungrantable keyword, another second sentence, or an unread qualifier all park", () => {
    const low = (text) => parseEffectClause(text, "Creature")?.confidence ?? "low";
    expect({
      // without the rider a non-Vehicle would have no power or toughness at all — never modeled as a size
      noRider: low("Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying."),
      ungrantable: low("Until end of turn, target noncreature artifact you control becomes an artifact creature and gains blorp. If it's not a Vehicle, it has base power and toughness 1/1 until end of turn."),
      otherSentence: low("Until end of turn, target noncreature artifact you control becomes an artifact creature and gains flying. Draw a card."),
      ownOnly: low("Put a +1/+1 counter on each of up to three target noncreature artifacts you control."),
      minus: low("Put a -1/-1 counter on each of up to three target noncreature artifacts."),
    }).toEqual({ noRider: "low", ungrantable: "low", otherSentence: "low", ownOnly: "low", minus: "low" });
  });
});

describe("the animate in play", () => {
  it("is offered on your own noncreature artifacts only — never an artifact creature, never the opponent's", () => {
    const s = table({ user: [P("SOL", SOL), P("EXP", EXPRESS), P("ORN", ORNITHOPTER)], ai: [P("ASOL", SOL, "ai")], mana: { U: 3 } });
    expect(animateOffers(s).map((a) => a.targets[0].id).sort()).toEqual(["EXP", "SOL"]);
  });

  it("a non-Vehicle artifact becomes a 1/1 flying artifact creature, and is an artifact again after the turn", () => {
    const s = animate(table({ user: [P("SOL", SOL)], mana: { U: 3 } }), "SOL");
    expect({ creature: permanentIsCreature(s, "SOL"), size: size(s, "SOL"), flying: permanentHasKeyword(s, "SOL", "Flying") }).toEqual({ creature: true, size: [1, 1], flying: true });
    const later = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect({ creature: permanentIsCreature(later, "SOL"), flying: permanentHasKeyword(later, "SOL", "Flying") }).toEqual({ creature: false, flying: false });
  });

  it("a Vehicle keeps its printed power and toughness (CR 301.7b) and gains flying", () => {
    const s = animate(table({ user: [P("EXP", EXPRESS)], mana: { U: 3 } }), "EXP");
    expect({ creature: permanentIsCreature(s, "EXP"), size: size(s, "EXP"), flying: permanentHasKeyword(s, "EXP", "Flying"), trample: permanentHasKeyword(s, "EXP", "Trample") })
      .toEqual({ creature: true, size: [4, 4], flying: true, trample: true });
  });
});

describe("the upkeep counters", () => {
  it("land on three of your four noncreature artifacts — never on an artifact creature or the opponent's artifact", () => {
    const mine = ["SOL", "MIND", "SIGNET", "EXP"];
    // Ornithopter sits FIRST: the auto-pick takes the earliest maximal subset, so a pool that wrongly admitted an artifact
    // creature would pick it here rather than hide it at the back.
    const s = upkeep(table({ step: "upkeep", user: [P("ORN", ORNITHOPTER), P("SOL", SOL), P("MIND", MIND), P("SIGNET", SIGNET), P("EXP", EXPRESS)], ai: [P("ASOL", SOL, "ai")] }));
    expect({
      onMine: mine.map((id) => plus(s, id)).sort(),
      elsewhere: ["ORN", "ASOL", "K"].map((id) => plus(s, id)),
      stillArtifacts: mine.map((id) => permanentIsCreature(s, id)),
    }).toEqual({ onMine: [0, 1, 1, 1], elsewhere: [0, 0, 0], stillArtifacts: [false, false, false, false] });
  });

  it("with no noncreature artifact of yours the trigger picks nothing — the opponent's artifacts are never fed", () => {
    const fired = checkStepTriggers(table({ step: "upkeep", ai: [P("ASOL", SOL, "ai"), P("AEXP", EXPRESS, "ai")] }), "upkeep");
    expect((fired.pendingTriggers || []).filter((t) => t.source?.name === KATSUMASA.name)).toHaveLength(1); // it fires; it just feeds no one
    const s = settle(fired);
    expect([plus(s, "ASOL"), plus(s, "AEXP")]).toEqual([0, 0]);
  });

  it("a counter waits on Sol Ring and counts once Katsumasa animates it: a 2/2 flyer", () => {
    let s = upkeep(table({ step: "upkeep", user: [P("SOL", SOL)], ai: [P("ASOL", SOL, "ai")] }));
    const waiting = { counters: plus(s, "SOL"), creature: permanentIsCreature(s, "SOL") };
    s = animate({ ...s, phase: "precombat-main", step: "main", players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, U: 3 } } } }, "SOL");
    const witness = { waiting, opponentCounters: plus(s, "ASOL"), creature: permanentIsCreature(s, "SOL"), size: size(s, "SOL"), flying: permanentHasKeyword(s, "SOL", "Flying") };
    console.log(`WITNESS katsumasa ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ waiting: { counters: 1, creature: false }, opponentCounters: 0, creature: true, size: [2, 2], flying: true });
  });
});
