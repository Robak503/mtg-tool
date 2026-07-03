/**
 * TYPE-NEGATED BOARD MAX + TEAM PUMP (Return of the Wildspeaker) — a creature-TYPE-NEGATION filter
 * ("non-Human") on TWO modal effects:
 *   • mode 1 — "Draw cards equal to the greatest power among non-Human creatures you control": the board-MAX
 *     count source EXCLUDES creatures of the negated subtype (greatestPowerYouControl + notSubtype), resolved
 *     AT RESOLUTION (CR 608.2h), layer-aware, changeling-aware (CR 702.73a).
 *   • mode 2 — "Non-Human creatures you control get +3/+3 until end of turn": the youControl TEAM pump scope
 *     keeps only creatures NOT of the negated subtype (subtypeNegate → controllerCreatureTargets), set locked
 *     at resolution (CR 611.2c).
 *
 * CREED — whole-card or PARK. The subtype must be in the curated TARGET_SUBTYPES allowlist, so the filter
 * credits EXACTLY the non-<Subtype> creatures (never a silently mis-scoped max / mis-pumped set). A subtype
 * outside the allowlist ("non-Praetor") fails → low → Arbiter (a SAFE false-negative), and the UNFILTERED
 * "creatures you control" forms are byte-for-byte unchanged. Pins: parser atom shapes, coverage flip,
 * end-to-end resolution of BOTH modes (Human excluded), and the CREED near-miss.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const INSTANT = "Instant";
const RETURN_ORACLE =
  "Choose one —\n• Draw cards equal to the greatest power among non-Human creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.";
const RETURN = { id: "c-return", name: "Return of the Wildspeaker", type: INSTANT, mana: "{4}{G}", oracle: RETURN_ORACLE };

const creature = (name, p, t, subtype = "Beast") => ({ name, type: `Creature — ${subtype}`, power: p, toughness: t, oracle: "" });

// State with the caster's own creatures on the battlefield (mode 1 draws / mode 2 pumps the CASTER's board).
function boardState({ user = [], hand = [], library = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const pool = { ...s.players.user.manaPool, C: 8, G: 4 };
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, hand, library, manaPool: pool, life: 40 },
    },
  };
}
const castsOf = (st, id) => filterActions(legalActionsForPlayer(st, "user"), "cast-spell").filter((c) => c.cardId === id);
const modePick = (st, id, mode) => castsOf(st, id).find((c) => c.chosenMode === mode || (Array.isArray(c.chosenMode) && c.chosenMode[0] === mode));

// ─── 1. parser — both modes carry the type-negation filter, whole card is HIGH modal ───
describe("parser — Return of the Wildspeaker: both non-Human modes parse HIGH", () => {
  it("full modal is HIGH with the two negated-filter mode atoms", () => {
    const p = parseEffectProgram(RETURN);
    expect(programConfidence(p)).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal.modes[0].atoms).toEqual([{ op: "draw", amountCount: { kind: "greatestPowerYouControl", notSubtype: "Human", per: 1 }, targetType: null }]);
    expect(p.modal.modes[1].atoms).toEqual([{ op: "pump", scope: "youControl", subtypeNegate: "Human", ptDelta: { p: 3, t: 3 } }]);
  });

  it("the greatest-TOUGHNESS negated form + the 'and gain KW' negated pump also parse HIGH (shared slice)", () => {
    const draw = parseEffectProgram({ type: INSTANT, oracle: "Draw cards equal to the greatest toughness among non-Elf creatures you control." });
    expect(draw.atoms).toEqual([{ op: "draw", amountCount: { kind: "greatestToughnessYouControl", notSubtype: "Elf", per: 1 }, targetType: null }]);
    const pump = parseEffectProgram({ type: INSTANT, oracle: "Non-Zombie creatures you control get +1/+1 and gain trample until end of turn." });
    expect(pump.atoms).toEqual([{ op: "pump", scope: "youControl", subtypeNegate: "Zombie", ptDelta: { p: 1, t: 1 }, grantKeywords: ["Trample"] }]);
  });
});

// ─── 2. coverage — the card flips native-spell ───
// (The real Scryfall card lookup + classify is verified out-of-band via the classifyCard gate with
// MTG_APP_ROOT set; vitest runs without the oracle repo, so pin the byte-identical synthetic oracle here.)
describe("coverage — Return of the Wildspeaker flips native-spell", () => {
  it("the Return of the Wildspeaker oracle classifies native-spell", () => {
    expect(classifyCard(RETURN)).toBe("native-spell");
  });
});

// ─── 3. countForSpec — the board MAX excludes the negated subtype (and changelings) ───
describe("countForSpec — greatestPowerYouControl with notSubtype excludes that subtype", () => {
  const ctx = { controller: "user", targets: [] };
  const bf = (perms) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
  };
  const c = (id, p, t, subtype) => ({ id, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, card: creature(`T-${id}`, p, t, subtype) });

  it("a 9-power Human is skipped; the max is the greatest NON-Human power", () => {
    const s = bf([c("h", 9, 9, "Human Warrior"), c("b", 4, 4, "Beast"), c("e", 2, 2, "Elf")]);
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl", notSubtype: "Human" })).toBe(4);
    // sanity: the UNFILTERED max still counts the Human (byte-unchanged behavior)
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl" })).toBe(9);
  });

  it("a changeling (CR 702.73a — IS every type, so it IS a Human) is excluded by notSubtype:Human", () => {
    const chg = c("cl", 8, 8, "Shapeshifter");
    chg.card.oracle = "Changeling (This card is every creature type.)";
    const s = bf([chg, c("b", 3, 3, "Beast")]);
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl", notSubtype: "Human" })).toBe(3);
  });

  it("only Humans on board → 0 (a safe floor, never fabricated)", () => {
    const s = bf([c("h", 5, 5, "Human")]);
    expect(countForSpec(s, ctx, { kind: "greatestPowerYouControl", notSubtype: "Human" })).toBe(0);
  });
});

// ─── 4. executor (CREED core) — a chosen mode RESOLVES over the non-Human set only ───
describe("executor — Return of the Wildspeaker resolves each mode over non-Human creatures", () => {
  it("mode 1 (draw): draws the greatest power among non-Humans (a bigger Human is NOT counted)", () => {
    let st = boardState({
      user: [
        createPermanent({ id: "human", card: creature("Big Human", 8, 8, "Human Soldier"), controller: "user", summoningSick: false }),
        createPermanent({ id: "beast", card: creature("Wildbeast", 5, 5, "Beast"), controller: "user", summoningSick: false }),
      ],
      hand: [RETURN],
      library: Array.from({ length: 10 }, (_, i) => ({ id: `L${i}`, name: `L${i}`, type: "Land" })),
    });
    const pick = modePick(st, "c-return", 0);
    expect(pick, "the draw mode was offered").toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    while (st.stack.length) st = resolveTopOfStack(st);
    // greatest power among non-Humans = the 5/5 Beast → draw 5 (the 8-power Human is excluded).
    expect(st.players.user.hand).toHaveLength(5);
  });

  it("mode 2 (pump): +3/+3 hits every non-Human; the Human is untouched", () => {
    let st = boardState({
      user: [
        createPermanent({ id: "human", card: creature("Soldier", 2, 2, "Human Soldier"), controller: "user", summoningSick: false }),
        createPermanent({ id: "beast", card: creature("Beast", 2, 2, "Beast"), controller: "user", summoningSick: false }),
        createPermanent({ id: "elf", card: creature("Elf", 1, 1, "Elf Druid"), controller: "user", summoningSick: false }),
      ],
      hand: [RETURN],
    });
    const pick = modePick(st, "c-return", 1);
    expect(pick, "the pump mode was offered").toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    while (st.stack.length) st = resolveTopOfStack(st);
    expect([permanentPower(st, "beast"), permanentToughness(st, "beast")]).toEqual([5, 5]); // non-Human pumped
    expect([permanentPower(st, "elf"), permanentToughness(st, "elf")]).toEqual([4, 4]);     // non-Human pumped
    expect([permanentPower(st, "human"), permanentToughness(st, "human")]).toEqual([2, 2]); // Human untouched
  });
});

// ─── 5. CREED anti-FP — a non-curated negated subtype stays low; unfiltered forms unchanged ───
describe("CREED anti-FP — an un-allowlisted negated subtype routes to the Arbiter", () => {
  const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: INSTANT, oracle }))).toBe("low");
  it("'non-Praetor' (outside TARGET_SUBTYPES) drops both mode shapes to low", () => {
    low("Draw cards equal to the greatest power among non-Praetor creatures you control.");
    low("Non-Praetor creatures you control get +3/+3 until end of turn.");
  });
  it("the modal with a non-curated negated subtype in either mode stays low → Arbiter (whole-card)", () => {
    low("Choose one —\n• Draw cards equal to the greatest power among non-Praetor creatures you control.\n• Non-Human creatures you control get +3/+3 until end of turn.");
  });
  it("the UNFILTERED greatest-power draw + team pump are byte-for-byte unchanged (still HIGH, no filter field)", () => {
    const draw = parseEffectProgram({ type: INSTANT, oracle: "Draw cards equal to the greatest power among creatures you control." });
    expect(draw.atoms[0].amountCount.notSubtype).toBeUndefined();
    const pump = parseEffectProgram({ type: INSTANT, oracle: "Creatures you control get +3/+3 until end of turn." });
    expect(pump.atoms[0].subtypeNegate).toBeUndefined();
  });
});
