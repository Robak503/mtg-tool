/**
 * DISCIPLE OF BOLAS (EDHREC #1515; the play-weighted slice, 2026-10-18) — the mandatory twin of Disciple of Freyalise's reader
 * (discipleOfFreyalise.test.js, removal.matchSacrificeAnotherForPower):
 *   "When this creature enters, sacrifice another creature. You gain X life and draw X cards, where X is that creature's power."
 *
 * Its rulings: "If you control at least one other creature when the ability resolves, you must sacrifice one. If you don't control
 * any other creatures at that time, the ability won't do anything." and "The creature's power as it last existed on the battlefield is
 * the amount of life you gain and the number of cards you draw." So the sacrifice is not optional, and both payoffs need a creature
 * this ability sacrificed — never an older sacrifice's log entry (CR 603.6e for the last-known power; CR 608.2c, in order).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard); the enter trigger runs from the engine's own checkEnterTriggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, logEvent } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveSacrificeChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DISCIPLE_OF_BOLAS = {"name":"Disciple of Bolas","type":"Creature — Human Wizard","mana":"{3}{B}","cmc":4,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"When this creature enters, sacrifice another creature. You gain X life and draw X cards, where X is that creature's power."}; // body-only on f71c2a49
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49

const P = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
function board(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: [], library: Array.from({ length: 10 }, (_, i) => ({ ...GRIZZLY_BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai } } };
}
/** The Disciple enters beside `user`; its trigger goes on the stack and resolves (to a sacrifice choice, if there is one). */
function enters(user, ai = [], prep = (s) => s) {
  const disciple = P("disciple", DISCIPLE_OF_BOLAS);
  const s0 = prep(board(user, ai));
  const entered = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, disciple] } } };
  return { s0, s: resolveTopOfStack(flushTriggers(checkEnterTriggers(entered, disciple), { chooseTargets: chooseTriggerTargets })) };
}
const gains = (s0, s) => ({ life: s.players.user.life - s0.players.user.life, drew: s.players.user.hand.length, onBattlefield: s.players.user.battlefield.map((p) => p.id).sort() });

describe("parse + classify", () => {
  it("⭐ the trigger routes natively; the card classifies native-trigger", () => {
    expect({ routes: detectTriggers(DISCIPLE_OF_BOLAS).map(triggerRoutesNatively), tier: classifyCard(DISCIPLE_OF_BOLAS) }).toEqual({ routes: [true], tier: "native-trigger" });
  });
});

describe("sacrifice another creature — you gain X life and draw X cards", () => {
  it("⭐ the one other creature, a Craw Wurm: sacrificed with no question asked, 6 life and 6 cards", () => {
    const { s0, s } = enters([P("wurm", CRAW_WURM)]);
    expect({ pause: s.pendingChoice?.kind ?? null, ...gains(s0, s) }).toEqual({ pause: null, life: 6, drew: 6, onBattlefield: ["disciple"] });
  });

  it("⭐ two others: you choose which — the Bears gives 2 and 2; the Disciple itself is never a candidate", () => {
    const { s0, s: choosing } = enters([P("wurm", CRAW_WURM), P("bears", GRIZZLY_BEARS)]);
    const candidates = (choosing.pendingChoice?.candidates || []).map((c) => c.id ?? c.permanentId ?? c).sort();
    const s = resolveSacrificeChoice(choosing, "bears");
    expect({ kind: choosing.pendingChoice?.kind, candidates, ...gains(s0, s) }).toEqual({ kind: "sacrifice-choice", candidates: ["bears", "wurm"], life: 2, drew: 2, onBattlefield: ["disciple", "wurm"] });
  });

  it("⭐ X is the last-known power (the ruling): a Bears with two +1/+1 counters gives 4", () => {
    const { s0, s } = enters([P("bears", GRIZZLY_BEARS, "user", { counters: { "+1/+1": 2 } })]);
    expect(gains(s0, s)).toEqual({ life: 4, drew: 4, onBattlefield: ["disciple"] });
  });

  it("⭐ no other creature (the ruling): nothing — not even with an older sacrifice of a 6-power creature in the log, and an opponent's creature is never taken", () => {
    const olderSacrifice = (s) => logEvent(s, { kind: "spell-effect", effect: "sacrifice", controller: "user", sacrificed: "old-wurm", cardName: "Craw Wurm", power: 6 });
    const { s0, s } = enters([], [P("abears", GRIZZLY_BEARS, "ai")], olderSacrifice);
    expect({ ...gains(s0, s), ai: s.players.ai.battlefield.map((p) => p.id) }).toEqual({ life: 0, drew: 0, onBattlefield: ["disciple"], ai: ["abears"] });
  });
});
