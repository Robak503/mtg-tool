/**
 * eachPlayerDrawLose.test.js — the play-weighted program (2026-10-18): "each player draws a card and loses 1 life" — one subject,
 * two instructions (Stormfist Crusader, EDHREC #1975: "At the beginning of your upkeep, each player draws a card and loses 1 life.").
 * The draws come first, then the losses (CR 608.2c — printed order; its bundled ruling for Two-Headed Giant: "each team [loses] 1
 * life twice after each player on that team has drawn a card"). Card text is the bundled oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STORMFIST_CRUSADER = {"name":"Stormfist Crusader","type":"Creature — Human Knight","mana":"{B}{R}","cmc":2,"power":"2","toughness":"2","keywords":["Menace"],"colors":["B","R"],"oracle":"Menace\nAt the beginning of your upkeep, each player draws a card and loses 1 life."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const atoms = (text) => { const p = parseEffectClause(text, "Instant"); return programConfidence(p) === "high" ? p.atoms : []; };

describe("the reader", () => {
  it("⭐ \"each player draws a card and loses 1 life\": the draws, then the losses, both for each player; Stormfist Crusader reads native", () => {
    expect({ one: atoms("each player draws a card and loses 1 life"), two: atoms("Each player draws two cards and loses 2 life."), tier: classifyCard(STORMFIST_CRUSADER) }).toEqual({
      one: [{ op: "draw", amount: 1, who: "eachPlayer", targetType: null }, { op: "lose-life", amount: 1, who: "eachPlayer", targetType: null }],
      two: [{ op: "draw", amount: 2, who: "eachPlayer", targetType: null }, { op: "lose-life", amount: 2, who: "eachPlayer", targetType: null }],
      tier: "native-trigger",
    });
  });
  it("CONTROL — a rider on either verb keeps the sentence unread; the targeted form is unchanged", () => {
    expect({
      riderOnLoss: atoms("each player draws a card and loses 1 life for each creature they control"),
      riderOnDraw: atoms("each player draws a card for each opponent and loses 1 life"),
      targeted: atoms("target player draws two cards and loses 2 life"),
    }).toEqual({
      riderOnLoss: [], riderOnDraw: [],
      targeted: [{ op: "draw", amount: 2, who: "target", targetType: "player" }, { op: "lose-life", amount: 2, who: "target", targetType: null, bindPreviousTargets: true }],
    });
  });
});

describe("⭐ in play", () => {
  it("⭐ at its controller's upkeep, each player draws a card and loses 1 life", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const lib = (who) => Array.from({ length: 5 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${who}-lib${i}` }));
    const s0 = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "untap", stack: [], pendingTriggers: [],
      players: { ...g.players,
        user: { ...g.players.user, hand: [], library: lib("u"), battlefield: [createPermanent({ id: "storm", card: { ...STORMFIST_CRUSADER, id: "c-storm" }, controller: "user", summoningSick: false })] },
        ai: { ...g.players.ai, hand: [], library: lib("a"), battlefield: [] } } };
    let s = runStepActions(advanceStep(s0));
    for (let i = 0; i < 20 && (s.stack?.length || s.pendingTriggers?.length); i++) s = s.stack?.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect({ step: s.step, hands: [s.players.user.hand.length, s.players.ai.hand.length], life: [s.players.user.life - s0.players.user.life, s.players.ai.life - s0.players.ai.life] })
      .toEqual({ step: "upkeep", hands: [1, 1], life: [-1, -1] });
  });
});
