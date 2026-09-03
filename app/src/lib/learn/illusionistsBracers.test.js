/**
 * illusionistsBracers.test.js — CAP-BRACERS (2026-09-03): ILLUSIONIST'S BRACERS — "Whenever an ability of equipped
 * creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy."
 * The ability-activated trigger event (fired at the dispatcher's activated-ability push, flushed ABOVE the ability
 * — CR 603.3b), the "isn't a mana ability" intervening-if (a mana ability never uses the stack, so every stack
 * activation stamps a definite false), and the copy atom (the same stack object under a fresh id, isCopy — CR
 * 707.10; the "may choose new targets" honoured as a decline). Plus the sibling "whenever you activate an ability
 * of an artifact or creature that isn't a mana ability" (Crackdown Construct) through the same checker.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03): Illusionist's Bracers, Crackdown
 * Construct. The pinger is a SYNTHETIC fixture (named as such) — one targeted tap ability to copy.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, creaturePower, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { detectTriggers, checkAbilityActivatedTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable, spellConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BRACERS = { id: "c-brc", name: "Illusionist's Bracers", type: "Artifact — Equipment", mana: "{2}", keywords: [], oracle: "Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {3}" };
const CONSTRUCT = { id: "c-cdc", name: "Crackdown Construct", type: "Artifact Creature — Construct", mana: "{4}", power: 2, toughness: 2, keywords: [], oracle: "Whenever you activate an ability of an artifact or creature that isn't a mana ability, this creature gets +1/+1 until end of turn." };
const PINGER = { id: "c-png", name: "Synthetic Pinger", type: "Creature — Human Wizard", mana: "{2}{R}", power: 1, toughness: 1, keywords: [], oracle: "{T}: This creature deals 1 damage to any target." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const RINGS = { id: "c-rng", name: "Rings of Brighthearth", type: "Artifact", mana: "{3}", keywords: [], oracle: "Whenever you activate an ability, if it isn't a mana ability, you may pay {2}. If you do, copy that ability. You may choose new targets for the copy." };

function board({ equipped = true, construct = false, rings = false, pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const pinger = { ...createPermanent({ id: "pinger", card: PINGER, controller: "user", summoningSick: false }), attachments: equipped ? ["bracers"] : [] };
  const bracers = { ...createPermanent({ id: "bracers", card: BRACERS, controller: "user" }), attachedTo: equipped ? "pinger" : null };
  const bf = [pinger, bracers];
  if (construct) bf.push(createPermanent({ id: "construct", card: CONSTRUCT, controller: "user", summoningSick: false }));
  if (rings) bf.push(createPermanent({ id: "rings", card: RINGS, controller: "user" }));
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [], graveyard: [], battlefield: bf, manaPool: pool },
      ai: { ...s0.players.ai, life: 20, hand: [], graveyard: [], battlefield: [createPermanent({ id: "bear", card: BEAR, controller: "ai", summoningSick: false })] },
    },
  };
}
/** The pinger's tap ability aimed at the ai player. */
function pingAt(s, seat = "user") {
  const acts = legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "pinger");
  const atPlayer = acts.find((a) => (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
  expect(atPlayer, "the pinger offers a tap at the ai player").toBeTruthy();
  return dispatchAction(s, atPlayer);
}
const resolveAll = (s) => { let t = s; for (let i = 0; i < 6 && t.stack.length; i++) t = resolveTopOfStack(t); return t; };

describe("the parse + the tiers", () => {
  it("the trigger is detected with the equipped-creature linkage and the not-a-mana-ability intervening-if", () => {
    const d = detectTriggers(BRACERS).find((x) => x.event === "abilityActivated");
    expect(d).toMatchObject({ event: "abilityActivated", scope: "equippedCreature", whose: "any" });
    expect(String(d.interveningIf || "").toLowerCase()).toContain("it isn't a mana ability");
    expect(d.optional).toBe(false); // "You may choose new targets for the copy" is the retargeting's may, not the copy's (CR 707.10c)
    const c = detectTriggers(CONSTRUCT).find((x) => x.event === "abilityActivated");
    expect(c).toMatchObject({ event: "abilityActivated", scope: "you", whose: "you", activatedTypeFilter: "artifact or creature" });
  });
  it("the payoff collapses to the copy atom; the condition is readable only with a definite activation context", () => {
    const p = parseEffectClause("copy that ability. You may choose new targets for the copy.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "copy-activated-ability", targetType: null }]);
    expect(parseEffectClause("copy it. You may choose new targets for the copy.", "Instant").atoms[0].op).toBe("copy-activated-ability");
    expect(interveningIfParseable("it isn't a mana ability")).toBe(true);
    expect(spellConditionParseable("it isn't a mana ability")).toBe(false); // a spell has no activation to read
    const s = board();
    expect(evaluateInterveningIf(s, "it isn't a mana ability", "user", { activatedIsManaAbility: false })).toBe(true);
    expect(evaluateInterveningIf(s, "it isn't a mana ability", "user", { activatedIsManaAbility: true })).toBe(false);
    expect(evaluateInterveningIf(s, "it isn't a mana ability", "user", {})).toBeNull();
  });
  it("both cards are native", () => {
    expect(classifyCard(BRACERS)).toMatch(/^native/);
    expect(classifyCard(CONSTRUCT)).toMatch(/^native/);
  });
});

describe("runtime — through the dispatcher", () => {
  it("⭐ the equipped pinger's tap is copied: the trigger sits above the ability, the copy resolves first, two pings land", () => {
    const s = board();
    const activated = pingAt(s);
    // The ability is on the stack with the Bracers trigger ABOVE it (flushed by the dispatcher).
    expect(activated.stack.map((o) => o.kind)).toEqual(["activated-ability", "triggered-ability"]);
    const afterTrigger = resolveTopOfStack(activated);
    expect(afterTrigger.stack.map((o) => o.kind)).toEqual(["activated-ability", "activated-ability"]);
    expect(afterTrigger.stack[1].isCopy).toBe(true);
    expect(afterTrigger.stack[1].controller).toBe("user");
    expect(afterTrigger.stack[1].targets).toEqual(afterTrigger.stack[0].targets);
    expect(afterTrigger.stack[1].id).not.toBe(afterTrigger.stack[0].id);
    const out = resolveAll(afterTrigger);
    expect(out.players.ai.life).toBe(18);
    expect(out.stack).toEqual([]);
    // The copy is not a card: nothing landed in a graveyard or exile.
    expect(out.players.user.graveyard).toEqual([]);
  });

  it("control — unattached Bracers copy nothing: one ping", () => {
    const out = resolveAll(pingAt(board({ equipped: false })));
    expect(out.players.ai.life).toBe(19);
  });

  it("the checker fires only for the host's own abilities and only for a threaded permanent", () => {
    const s = board();
    const other = s.players.ai.battlefield[0];
    expect(checkAbilityActivatedTriggers(s, { permanent: other, activatorId: "ai", stackObjectId: "stk-x" }).pendingTriggers || []).toEqual([]);
    expect(checkAbilityActivatedTriggers(s, { permanent: null, activatorId: "user", stackObjectId: "stk-x" })).toBe(s);
    const fired = checkAbilityActivatedTriggers(s, { permanent: s.players.user.battlefield[0], activatorId: "user", stackObjectId: "stk-x" }).pendingTriggers;
    expect(fired.length).toBe(1);
    expect(fired[0].context).toMatchObject({ activatedStackObjectId: "stk-x", activatedIsManaAbility: false, activatorId: "user" });
  });

  it("a copy whose original already left the stack is a logged no-op", () => {
    const s = board();
    const activated = pingAt(s);
    // Drop the ability out from under the trigger.
    const orphaned = { ...activated, stack: activated.stack.filter((o) => o.kind === "triggered-ability") };
    const out = resolveTopOfStack(orphaned);
    expect(out.stack).toEqual([]);
    expect(out.log.some((e) => e.effect === "copy-activated-ability-fizzle")).toBe(true);
  });

  it("⭐ Crackdown Construct: the user's creature activation pumps it; unequipped, the copy is absent", () => {
    const s = board({ equipped: false, construct: true });
    const out = resolveAll(pingAt(s));
    const construct = out.players.user.battlefield.find((p) => p.id === "construct");
    expect(creaturePower(construct, out)).toBe(3); // 2 base, +1 from its own trigger
    expect(out.players.ai.life).toBe(19);
    // The ai activating nothing of the user's: the Construct is quiet when the AI's creature acts (whose:"you").
    const foreign = checkAbilityActivatedTriggers(s, { permanent: s.players.ai.battlefield[0], activatorId: "ai", stackObjectId: "stk-y" });
    expect(foreign.pendingTriggers || []).toEqual([]);
    // And quiet for a LAND's ability (the "artifact or creature" filter).
    const land = { ...createPermanent({ id: "land-x", card: { id: "c-lx", name: "Synthetic Land", type: "Land", mana: "", oracle: "" }, controller: "user" }) };
    expect(checkAbilityActivatedTriggers(s, { permanent: land, activatorId: "user", stackObjectId: "stk-z" }).pendingTriggers || []).toEqual([]);
  });

  it("⭐ Rings of Brighthearth (the pay-then-copy sibling): paying {2} copies the ability and spends the mana; declining copies nothing", () => {
    const s = board({ equipped: false, rings: true, pool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 } });
    const activated = pingAt(s);
    expect(activated.stack.map((o) => o.kind)).toEqual(["activated-ability", "triggered-ability"]);
    const paused = resolveTopOfStack(activated);
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user" });
    // Pay: the copy lands above the original and the two red mana are gone.
    const paid = resolveOptionalManaPaymentChoice(paused, true);
    expect(paid.pendingChoice ?? null).toBeNull();
    expect(paid.stack.map((o) => o.kind)).toEqual(["activated-ability", "activated-ability"]);
    expect(paid.stack[1].isCopy).toBe(true);
    expect(paid.players.user.manaPool.R).toBe(0);
    expect(resolveAll(paid).players.ai.life).toBe(18);
    // Decline: one ping, mana untouched.
    const declined = resolveOptionalManaPaymentChoice(paused, false);
    expect(declined.stack.map((o) => o.kind)).toEqual(["activated-ability"]);
    expect(declined.players.user.manaPool.R).toBe(2);
    expect(resolveAll(declined).players.ai.life).toBe(19);
    expect(classifyCard(RINGS)).toMatch(/^native/);
  });
});
