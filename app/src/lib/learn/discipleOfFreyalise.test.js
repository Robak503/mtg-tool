/**
 * DISCIPLE OF FREYALISE — the play-weighted program, P·36 (EDHREC #483; its back face, Garden of Freyalise, was already a land).
 *   "When this creature enters, you may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that
 *    creature's power."
 *
 * One whole-effect matcher (removal.matchSacrificeAnotherForPower): the controller's optional sacrifice of ANOTHER creature, then
 * two payoffs under the one "if you do" — runProgram now carries the gate across consecutive ifSacrificed atoms — each sized by the
 * sacrificed creature's last-known power (CR 603.6e), read off its sacrifice log (the countForSpec kind sacrificedThisWayPower; the
 * cost channel Fling uses is never written by an effect sacrifice).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); the enter trigger runs from the engine's own checkEnterTriggers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalChoice, resolveSacrificeChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DISCIPLE = { name: "Disciple of Freyalise", type: "Creature — Elf Druid", mana: "{3}{G}{G}{G}", cmc: 6, power: "3", toughness: "3", keywords: [], oracle: "When this creature enters, you may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power." };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, power: "6", toughness: "4", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...over });
function board(others = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: others, hand: [], library: Array.from({ length: 10 }, (_, i) => ({ ...BEARS, id: `ul${i}` })) } } };
}
/** Disciple enters beside `others`; its trigger goes on the stack and resolves to the "you may" pause. */
const enters = (others) => {
  const disciple = P("disciple", DISCIPLE);
  const s0 = board(others);
  const entered = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, disciple] } } };
  return { s0, paused: resolveTopOfStack(flushTriggers(checkEnterTriggers(entered, disciple), { chooseTargets: chooseTriggerTargets })) };
};
const gains = (s0, s) => ({ life: s.players.user.life - s0.players.user.life, drew: s.players.user.hand.length, onBattlefield: s.players.user.battlefield.map((p) => p.id).sort() });

describe("parse + classify", () => {
  it("the trigger routes natively; the front face classifies native-trigger", () => {
    expect(detectTriggers(DISCIPLE).map(triggerRoutesNatively)).toEqual([true]);
    expect(classifyCard(DISCIPLE)).toBe("native-trigger");
  });
});

describe("you may sacrifice another creature — if you do, gain X life and draw X cards", () => {
  it("⭐ the one other creature, a Craw Wurm: sacrificed, and you gain 6 life AND draw 6 (both payoffs under the one \"if you do\")", () => {
    const { s0, paused } = enters([P("wurm", WURM)]);
    const s = resolveOptionalChoice(paused, true);
    const row = { pause: paused.pendingChoice?.kind ?? null, ...gains(s0, s) };
    console.log("  WITNESS disciple", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pause: "optional-effect", life: 6, drew: 6, onBattlefield: ["disciple"] });
  });

  it("two others: you choose which — the Bears (2) gives 2 and 2; the Disciple itself is never a candidate", () => {
    const { s0, paused } = enters([P("wurm", WURM), P("bears", BEARS)]);
    const choosing = resolveOptionalChoice(paused, true);
    const candidates = (choosing.pendingChoice?.candidates || []).map((c) => c.id ?? c.permanentId ?? c).sort();
    const s = resolveSacrificeChoice(choosing, "bears");
    expect({ kind: choosing.pendingChoice?.kind, candidates, ...gains(s0, s) }).toEqual({ kind: "sacrifice-choice", candidates: ["bears", "wurm"], life: 2, drew: 2, onBattlefield: ["disciple", "wurm"] });
  });

  it("X is its LAST-KNOWN power: a Bears with two +1/+1 counters gives 4", () => {
    const { s0, paused } = enters([P("bears", BEARS, { counters: { "+1/+1": 2 } })]);
    expect(gains(s0, resolveOptionalChoice(paused, true))).toEqual({ life: 4, drew: 4, onBattlefield: ["disciple"] });
  });

  it("decline: nothing is sacrificed, nothing gained", () => {
    const { s0, paused } = enters([P("wurm", WURM)]);
    expect(gains(s0, resolveOptionalChoice(paused, false))).toEqual({ life: 0, drew: 0, onBattlefield: ["disciple", "wurm"] });
  });

  it("no other creature: taking the \"may\" sacrifices nothing, so neither payoff happens", () => {
    const { s0, paused } = enters([]);
    const s = paused.pendingChoice ? resolveOptionalChoice(paused, true) : paused;
    expect(gains(s0, s)).toEqual({ life: 0, drew: 0, onBattlefield: ["disciple"] });
  });
});
