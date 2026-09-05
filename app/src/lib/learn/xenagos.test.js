/**
 * XENAGOS, GOD OF REVELS — the power-to-both pump. SHELF-85 · Phase 3 (Hulk Smash), 2026-09-05.
 * "At the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of
 * turn, where X is that creature's power."
 *
 * The combat-start trigger, the another-target pump (excludeSource) and the double-P/T mechanism existed; the mechanism
 * never knew "+X/+X where X is the power" — the POWER added to BOTH halves. One arm and a third mode (`doublePt:
 * "powerToBoth"`): the target's layer-aware power at resolution lands as +P/+P beside the granted haste.
 *
 * Mutation-checked: see the run ledger (docs-sk114).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const XENAGOS = { id: "c-xg", name: "Xenagos, God of Revels", type: "Legendary Enchantment Creature — God", mana: "{3}{R}{G}", power: "6", toughness: "5", keywords: ["Indestructible"],
  oracle: "Indestructible\nAs long as your devotion to red and green is less than seven, Xenagos isn't a creature.\nAt the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power." };
const CLAUSE = "another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power";
// A creature-typed carrier of the same sentence — the only shape where "another" can exclude the source itself.
const BEAST = { id: "c-rb", name: "Revel Beast", type: "Creature — Beast", mana: "{2}{G}", power: "2", toughness: "2", keywords: [],
  oracle: "At the beginning of combat on your turn, another target creature you control gains haste and gets +X/+X until end of turn, where X is that creature's power." };

describe("the parser", () => {
  it("the combat-begin trigger's clause reads to the another-target haste + power-to-both pump; Xenagos flips native", () => {
    const p = parseEffectClause(CLAUSE, "Creature");
    const row = { event: detectTriggers(XENAGOS).find((t) => t.event === "combatBegin")?.event ?? null, conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(XENAGOS) };
    console.log("  WITNESS xenagos", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.event).toBe("combatBegin");
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Haste"], doublePt: "powerToBoth" });
    expect(row.tier).toMatch(/^native/);
  });
});

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
const creature = (id, name, p, t, card = {}) => createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", power: p, toughness: t, keywords: [], oracle: "", ...card }, controller: "user", summoningSick: true });
function combatBegin(sourceCard, others, active = "user") {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: sourceCard, controller: "user", summoningSick: false });
  let s = { ...s0, phase: "combat", step: "beginning-of-combat", activePlayer: active, priorityHolder: active,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [src, ...others] } } };
  s = checkStepTriggers(s, "combatBegin");
  const pending = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "src").length;
  return { pending, out: resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets })) };
}
const read = (s, id) => ({ p: permanentPower(s, id), t: permanentToughness(s, id), haste: !!permanentHasKeyword(s, id, "Haste") });

describe("RUNTIME — the trigger, the chooser, the power-to-both pump", () => {
  it("your combat: a 3/1 becomes 6/4 with haste; an opponent's combat: nothing fires", () => {
    const own = combatBegin(XENAGOS, [creature("big", "Bruiser", 3, 1)]);
    const theirs = combatBegin(XENAGOS, [creature("big", "Bruiser", 3, 1)], "ai");
    const row = { pending: own.pending, big: read(own.out, "big"), theirsPending: theirs.pending, theirsBig: read(theirs.out, "big") };
    console.log("  WITNESS xenagosRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: 1, big: { p: 6, t: 4, haste: true }, theirsPending: 0, theirsBig: { p: 3, t: 1, haste: false } });
  });

  it("'another': a creature-typed carrier of the sentence never pumps itself — with a second creature it pumps that one; alone, it pumps nothing", () => {
    const pair = combatBegin(BEAST, [creature("pal", "Pal", 4, 4)]);
    const alone = combatBegin(BEAST, []);
    const row = { srcWithPal: read(pair.out, "src"), pal: read(pair.out, "pal"), srcAlone: read(alone.out, "src") };
    console.log("  WITNESS xenagosAnother", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ srcWithPal: { p: 2, t: 2, haste: false }, pal: { p: 8, t: 8, haste: true }, srcAlone: { p: 2, t: 2, haste: false } });
  });
});
