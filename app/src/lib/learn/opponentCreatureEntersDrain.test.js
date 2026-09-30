/**
 * opponentCreatureEntersDrain.test.js — "Whenever a creature an opponent controls enters, you may have that player lose 1
 * life." (Blood Seeker, Suture Priest — the 09-06 plan's stage ③, census row ⑲, 2026-09-30).
 *
 * The trigger was already detected (an ETB watcher scoped creatureOpponentControls); its payoff never parsed, because "that
 * player" — the entering creature's controller — had no referent. detectTriggers now rewrites it, gated to this one event and
 * scope, to the "triggering permanent's controller" sentinel the its-controller payoffs already use (bound in
 * makePendingTrigger's context), and a life arm reads the causative "have … lose N life". The "you may" stays a real choice.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each run through checkEnterTriggers → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SEEKER = { name: "Blood Seeker", type: "Creature — Vampire Shaman", mana: "{1}{B}", power: 1, toughness: 1,
  oracle: "Whenever a creature an opponent controls enters, you may have that player lose 1 life." };
const PRIEST = { name: "Suture Priest", type: "Creature — Phyrexian Cleric", mana: "{1}{W}", power: 1, toughness: 1,
  oracle: "Whenever another creature you control enters, you may gain 1 life.\nWhenever a creature an opponent controls enters, you may have that player lose 1 life." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };

const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });
function game({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
// `entering` enters under its controller's battlefield (already placed); the enter triggers fire and resolve. A pending
// "you may" of the user's is answered with `accept`.
function enter(s0, entering, accept = true) {
  let s = flushTriggers(checkEnterTriggers(s0, entering), { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 8; i++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, accept); continue; }
    if (!(s.stack || []).length) break;
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  return s;
}
const lives = (s0, s) => ({ user: s.players.user.life - s0.players.user.life, ai: s.players.ai.life - s0.players.ai.life });

describe("classification", () => {
  it("Blood Seeker and Suture Priest → native-trigger", () => {
    expect([classifyCard(SEEKER), classifyCard(PRIEST)]).toEqual(["native-trigger", "native-trigger"]);
  });
});

describe("RUNTIME — the entering creature's controller loses the life", () => {
  it("VACUITY CONTROL — the user's OWN Bears entering under the user's Blood Seeker: no trigger, no life moves", () => {
    const bears = perm(BEARS, "b", "user");
    const s0 = game({ user: [perm(SEEKER, "seek", "user"), bears] });
    expect(lives(s0, enter(s0, bears))).toEqual({ user: 0, ai: 0 });
  });

  it("⭐ the AI's Bears enter: the user takes the drain and the AI loses 1", () => {
    const bears = perm(BEARS, "b", "ai");
    const s0 = game({ user: [perm(SEEKER, "seek", "user")], ai: [bears] });
    const out = lives(s0, enter(s0, bears));
    expect(out).toEqual({ user: 0, ai: -1 });
    console.log(`WITNESS seekerDrain ${JSON.stringify(out)}`);
  });

  it("⭐ the \"you may\" is real: declining it leaves the AI's life alone", () => {
    const bears = perm(BEARS, "b", "ai");
    const s0 = game({ user: [perm(SEEKER, "seek", "user")], ai: [bears] });
    expect(lives(s0, enter(s0, bears, false))).toEqual({ user: 0, ai: 0 });
  });

  it("⭐ Suture Priest has both halves: the user's creature gains the user 1, the AI's creature costs the AI 1", () => {
    const mine = perm(BEARS, "b1", "user");
    const s0 = game({ user: [perm(PRIEST, "pr", "user"), mine] });
    expect(lives(s0, enter(s0, mine))).toEqual({ user: 1, ai: 0 });
    const theirs = perm(BEARS, "b2", "ai");
    const s1 = game({ user: [perm(PRIEST, "pr", "user")], ai: [theirs] });
    expect(lives(s1, enter(s1, theirs))).toEqual({ user: 0, ai: -1 });
  });

  it("⭐ the other way round: the AI's Blood Seeker, and the USER's Bears entering, cost the user 1", () => {
    const bears = perm(BEARS, "b", "user");
    const s0 = game({ user: [bears], ai: [perm(SEEKER, "seek", "ai")] });
    expect(lives(s0, enter(s0, bears))).toEqual({ user: -1, ai: 0 });
  });
});
