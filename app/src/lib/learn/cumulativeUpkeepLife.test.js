/**
 * cumulativeUpkeepLife.test.js — "Cumulative upkeep—Pay N life." (the 09-06 plan's stage ③ · 45, 2026-09-30 — Gallowbraid,
 * Morinfen).
 *
 * The em-dash, life-cost form of cumulative upkeep (CR 702.24a): at the beginning of your upkeep put an age counter on it,
 * then pay N life for each age counter or sacrifice it. It rides the mana form's machinery — detectTriggers synthesizes the
 * upkeep trigger off the printed keyword LINE (triggers.CUMULATIVE_UPKEEP_LIFE_RE), matchCumulativeUpkeep maps the sentinel
 * to the atom's life cost, the atom scales it by the age counters, and the shared pay-or-sacrifice choice settles it the
 * way ward's life cost is settled: payable only when the life total covers it (CR 119.4), through loseLife. The AI pays
 * only while the payment leaves it at 10 life or more (opponentAI's floor for a life-paid alternative cost).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { resolveSacUnlessPayChoice, autoPickSacUnlessPay } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard, isNativeTier, permanentTriggersCovered } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REMINDER = " (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)";
const GALLOWBRAID = { name: "Gallowbraid", type: "Legendary Creature — Phyrexian Horror", mana: "{3}{B}{B}", colors: ["B"], cmc: 5, power: "5", toughness: "5",
  keywords: ["Trample", "Cumulative upkeep"], oracle: `Trample\nCumulative upkeep—Pay 1 life.${REMINDER}` };
const MORINFEN = { name: "Morinfen", type: "Legendary Creature — Phyrexian Horror", mana: "{3}{B}{B}", colors: ["B"], cmc: 5, power: "5", toughness: "4",
  keywords: ["Cumulative upkeep", "Flying"], oracle: `Flying\nCumulative upkeep—Pay 1 life.${REMINDER}` };
const DECOMPOSITION = { name: "Decomposition", type: "Enchantment — Aura", mana: "{1}{G}", colors: ["G"], cmc: 2, keywords: ["Enchant"],
  oracle: "Enchant black creature\nEnchanted creature has \"Cumulative upkeep—Pay 1 life.\" (At the beginning of its controller's upkeep, that player puts an age counter on it, then sacrifices it unless they pay its upkeep cost for each age counter on it.)\nWhen enchanted creature dies, its controller loses 2 life." };
const INFERNAL_DARKNESS = { name: "Infernal Darkness", type: "Enchantment", mana: "{2}{B}{B}", colors: ["B"], cmc: 4, keywords: ["Cumulative upkeep"],
  oracle: `Cumulative upkeep—Pay {B} and 1 life.${REMINDER}\nIf a land is tapped for mana, it produces {B} instead of any other type.` };

// The user's Gallowbraid (with `age` counters already on it) at the start of the user's turn, at `life`.
function board({ life = 40, age = 0 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const gb = createPermanent({ id: "GB", card: { ...GALLOWBRAID, id: "c-GB" }, controller: "user", summoningSick: false });
  if (age) gb.counters = { ...(gb.counters || {}), age };
  const library = Array.from({ length: 5 }, (_, i) => ({ id: `l${i}`, name: `Card ${i}`, type: "Sorcery", oracle: "" }));
  return { ...g, turn: 3, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, life, battlefield: [gb], library } } };
}
// Into the upkeep the way the game loop goes (advanceStep, then the step's actions), then settle to the pay-or-sacrifice pause.
function toUpkeepChoice(s0) {
  let s = s0;
  for (let i = 0; i < 6 && s.step !== "upkeep"; i++) s = runStepActions(advanceStep(s));
  s = flushTriggers(s);
  for (let i = 0; i < 8 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s));
  return s;
}
const gallowbraid = (s) => s.players.user.battlefield.find((p) => p.id === "GB");

describe("the carriers", () => {
  it("⭐ Gallowbraid and Morinfen read native; the synthesized upkeep trigger carries the life sentinel", () => {
    expect([GALLOWBRAID, MORINFEN].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
    const t = detectTriggers(GALLOWBRAID).filter((d) => d.sourceText?.startsWith("Cumulative upkeep"));
    expect(t.map((d) => ({ event: d.event, whose: d.whose, clause: d.effectClause }))).toEqual([{ event: "upkeep", whose: "yours", clause: "cumulative upkeep pay 1 life" }]);
  });
  it("the sentinel parses HIGH to the atom's life cost; a mixed cost (\"Pay {B} and 1 life\") does not", () => {
    const p = parseEffectClause("cumulative upkeep pay 1 life", "Creature", { hasX: false });
    expect({ conf: programConfidence(p), cost: p?.atoms?.[0]?.cost }).toEqual({ conf: "high", cost: { kind: "life", life: 1 } });
    expect(parseEffectClause("cumulative upkeep pay {B} and 1 life", "Enchantment", { hasX: false })?.atoms?.[0]?.op).not.toBe("cumulative-upkeep");
  });
  it("a QUOTED grant is not the Aura's own keyword — Decomposition synthesizes no upkeep trigger and stays parked; Infernal Darkness too", () => {
    expect(detectTriggers(DECOMPOSITION).some((d) => /cumulative upkeep/i.test(d.effectClause || ""))).toBe(false);
    expect([DECOMPOSITION, INFERNAL_DARKNESS].map((c) => isNativeTier(classifyCard(c)))).toEqual([false, false]);
  });
  it("the trigger-sentence count includes the synthesized trigger, so a card with the keyword AND a trigger sentence still reconciles", () => {
    // SYNTHETIC fixture — no printed card pairs the life form with an otherwise-modeled trigger today (Dystopia's and Glacial
    // Chasm's other lines park them); this pins shaped === detected for the first one that does.
    const TEST_HORROR = { name: "Test Horror", type: "Creature — Horror", mana: "{2}{B}", colors: ["B"], cmc: 3, power: "3", toughness: "3",
      keywords: ["Cumulative upkeep"], oracle: `Cumulative upkeep—Pay 1 life.${REMINDER}\nWhen this creature enters, draw a card.` };
    expect(permanentTriggersCovered(TEST_HORROR)).toBe(true);
  });
});

describe("⭐ the real upkeep: an age counter, then N life per counter or the sacrifice", () => {
  it("⭐ two upkeeps paid: 1 life, then 2 (the cost escalates with the counters); Gallowbraid stays", () => {
    const first = toUpkeepChoice(board());
    const cost1 = first.pendingChoice?.cost;
    const paid1 = resolveSacUnlessPayChoice(first, true);
    const second = toUpkeepChoice({ ...paid1, step: "untap", phase: "beginning", stack: [], pendingTriggers: [] });
    const cost2 = second.pendingChoice?.cost;
    const paid2 = resolveSacUnlessPayChoice(second, true);
    const row = { cost1, lifeAfter1: paid1.players.user.life, cost2, lifeAfter2: paid2.players.user.life, age: gallowbraid(paid2)?.counters?.age, stays: !!gallowbraid(paid2) };
    console.log(`WITNESS cumulativeUpkeepLife ${JSON.stringify(row)}`);
    expect(row).toEqual({ cost1: { kind: "life", life: 1 }, lifeAfter1: 39, cost2: { kind: "life", life: 2 }, lifeAfter2: 37, age: 2, stays: true });
  });
  it("declined: Gallowbraid is sacrificed and no life is paid", () => {
    const out = resolveSacUnlessPayChoice(toUpkeepChoice(board()), false);
    expect({ onField: !!gallowbraid(out), inGrave: out.players.user.graveyard.some((c) => c.name === "Gallowbraid"), life: out.players.user.life })
      .toEqual({ onField: false, inGrave: true, life: 40 });
  });
  it("⭐ CR 119.4 — at 1 life owing 2 (a counter already on it) the payment can't be made: sacrificed, life untouched", () => {
    const choice = toUpkeepChoice(board({ life: 1, age: 1 }));
    const out = resolveSacUnlessPayChoice(choice, true);
    expect({ owed: choice.pendingChoice?.cost?.life, onField: !!gallowbraid(out), life: out.players.user.life }).toEqual({ owed: 2, onField: false, life: 1 });
  });
  it("exactly enough life pays (CR 119.4 — a total equal to the payment may pay it)", () => {
    const out = resolveSacUnlessPayChoice(toUpkeepChoice(board({ life: 2, age: 1 })), true);
    expect({ onField: !!gallowbraid(out), life: out.players.user.life }).toEqual({ onField: true, life: 0 });
  });
});

describe("the AI's pick — pay only while it leaves 10 life", () => {
  const pick = (life, age) => { const s = toUpkeepChoice(board({ life, age })); return autoPickSacUnlessPay(s, s.pendingChoice); };
  it("⭐ pays 1 at 40; refuses 2 at 11 (9 left); pays 2 at 12 (exactly 10 left)", () => {
    expect({ at40: pick(40, 0), at11: pick(11, 1), at12: pick(12, 1) }).toEqual({ at40: true, at11: false, at12: true });
  });
});
