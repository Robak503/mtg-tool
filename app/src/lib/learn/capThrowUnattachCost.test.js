/**
 * capThrowUnattachCost.test.js — SHELF CAP14: Captain America, First Avenger's "Throw" ability.
 *
 *   "Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that
 *    Equipment's mana value divided as you choose among one, two, or three targets."
 *
 * Three pieces meet here, and the middle one is the novel seam:
 *   1. an ELLIPSIS-carrying CR 207.2c flavor label ("Throw ... —") stripping off an activated line
 *   2. γ1i — an "Unattach an Equipment from <self>" activation COST (CR 701.3c): a CHOICE cost whose
 *      victim the player picks, paid by the dispatcher before the ability goes on the stack (CR 601.2h)
 *   3. ⭐ a COST-PAID REFERENT — the chosen Equipment's MANA VALUE becomes the ability's damage. No other
 *      modeled cost feeds the effect it paid for; the value is captured AT PAYMENT TIME and threaded
 *      through `params.context` so it survives the divide-damage PAUSE and resume.
 *
 * Only reachable because CAP13 made the printed target bound enforceable: with a DYNAMIC amount the old
 * `amount > maxTargets → refuse` rule could never clear this card (the tier decision is static; the amount
 * is unknown until resolution).
 *
 * ⛔ THE FAILURE MODES PINNED BELOW. An unequipped Cap must not be offered Throw at all (a cost that
 * cannot be paid is not an option). The unattached Equipment must STAY on the battlefield — unattaching is
 * not a battlefield exit (CR 701.3d), so routing through the leave chokepoint would fabricate an LTB event.
 * And a MISSING referent must deal ZERO, never a fabricated or defaulted amount.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-08-30).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, attachPermanent, unattachEquipment } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseActivatedAbilities, parseAbilityCost } from "./effects/abilities.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyDivideDamage } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const CAP = {
  id: "c-cap", name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero",
  mana: "{2}{R}{W}", power: 3, toughness: 3,
  oracle: "Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America.",
};
const BIG_BLADE = { id: "c-bb", name: "Big Blade", type: "Artifact — Equipment", mana_cost: "{5}", cmc: 5,
  oracle: "Equipped creature gets +2/+0.\nEquip {2}" };
const SMALL_BLADE = { id: "c-sb", name: "Small Blade", type: "Artifact — Equipment", mana_cost: "{1}", cmc: 1,
  oracle: "Equipped creature gets +1/+0.\nEquip {1}" };

describe("parse — the label, the cost item, and the dynamic amount", () => {
  it("the ellipsis-carrying flavor label strips, so the {3} is seen and the cost parses", () => {
    const [throwAb] = parseActivatedAbilities(CAP);
    expect(throwAb.manaPips).toBe("{3}");
    expect(throwAb.unattachEquipment).toEqual({ from: "self" });
    expect(throwAb.modeled).toBe(true);
  });

  it("the cost item is SELF-NAME anchored (legendary SHORT name + the 'this creature' forms)", () => {
    const card = { name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero" };
    for (const form of ["Captain America", "this creature", "this permanent", "it"]) {
      expect(parseAbilityCost(`{3}, Unattach an Equipment from ${form}`, card)?.unattachEquipment).toEqual({ from: "self" });
    }
    // ⚠️ The COMMA-bearing FULL name cannot appear, and that is a property of the caller, not a gap here:
    // parseAbilityCost splits cost items on ",", so "… from Captain America, First Avenger" would arrive as
    // two items. The printed convention is the short form anyway — the same caveat execRemoveCounterFrom-
    // SelfName documents for its own self-name costs. Pinned so nobody "fixes" the anchor for a form the
    // parser can never be handed.
    expect(parseAbilityCost("{3}, Unattach an Equipment from Captain America, First Avenger", card)?.unattachEquipment ?? null).toBe(null);
  });

  it("⛔ a cost naming ANOTHER object, a count, or an Aura does NOT parse (fail closed)", () => {
    const card = { name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero" };
    // Unattaching the wrong permanent as a cost is a real board change no coverage tier can see, so the
    // anchor is whole-tail: anything it does not recognise parks the ability.
    for (const bad of [
      "{3}, Unattach an Equipment from target creature",
      "{3}, Unattach two Equipment from Captain America",
      "{3}, Unattach an Aura from Captain America",
      "{3}, Unattach an Equipment from Iron Man",
    ]) {
      expect(parseAbilityCost(bad, card)?.unattachEquipment ?? null).toBe(null);
    }
  });

  it("the effect parses to a divide-damage atom sized by a COST-PAID referent, bound at three", () => {
    const p = parseEffectClause("this creature deals damage equal to that equipment's mana value divided as you choose among one, two, or three targets", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "divide-damage", amountFrom: "unattachedEquipmentMv", group: "anyTarget", maxTargets: 3 }]);
  });

  it("Captain America, First Avenger classifies native", () => {
    expect(classifyCard(CAP)).toBe("native-mixed");
  });
});

describe("the atom — a MISSING referent deals ZERO, never a fabricated amount", () => {
  it("no ctx value → no pending division and no damage", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const out = applyDivideDamage(s, { op: "divide-damage", amountFrom: "unattachedEquipmentMv", group: "anyTarget", maxTargets: 3 }, { controller: "user" });
    expect(out.pendingChoice).toBeFalsy();
  });

  it("a referent of 0 (a zero-mana-value Equipment) likewise does nothing", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const out = applyDivideDamage(s, { op: "divide-damage", amountFrom: "unattachedEquipmentMv", group: "anyTarget", maxTargets: 3 }, { controller: "user", unattachedEquipmentMv: 0 });
    expect(out.pendingChoice).toBeFalsy();
  });
});

// ─── Runtime ────────────────────────────────────────────────────────────────────────────────────────

/** Cap on the battlefield, optionally wearing the given Equipment cards, with a chump blocker opposite. */
function board(equipCards = []) {
  const cap = createPermanent({ id: "cap", card: CAP, controller: "user", summoningSick: false });
  const equips = equipCards.map((c, i) => createPermanent({ id: `eq${i}`, card: c, controller: "user", summoningSick: false }));
  const foe = createPermanent({ id: "foe", card: { id: "f1", name: "Chump", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
  const s = createGameState({ userDeck: [], aiDeck: [] });
  let out = {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [cap, ...equips], manaPool: { ...s.players.user.manaPool, C: 20 } },
      ai: { ...s.players.ai, battlefield: [foe], life: 40 },
    },
  };
  for (const e of equips) out = attachPermanent(out, { equipId: e.id, targetId: "cap" });
  return out;
}
const throwActions = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.unattachEquipmentId);

describe("the offer — Throw needs something to throw", () => {
  it("⭐ an UNEQUIPPED Cap is offered nothing: the cost cannot be paid", () => {
    expect(throwActions(board([])).length).toBe(0);
  });

  it("equipped, exactly one action per attached Equipment — they are NOT fungible", () => {
    // Each Equipment's mana value becomes the damage, so choosing between them is a real decision and
    // both must be offered (contrast the discard cost, which collapses identically-named cards).
    const acts = throwActions(board([BIG_BLADE, SMALL_BLADE]));
    expect(acts.length).toBe(2);
    expect(acts.map((a) => a.unattachEquipmentName).sort()).toEqual(["Big Blade", "Small Blade"]);
    expect(acts.every((a) => a.cmc === 3)).toBe(true); // the {3} mana half is unchanged by the choice
  });
});

describe("paying the cost", () => {
  it("⭐ the Equipment is UNATTACHED but STAYS on the battlefield (CR 701.3d — not a zone change)", () => {
    const s = board([BIG_BLADE]);
    const act = throwActions(s)[0];
    const out = dispatchAction(s, act);
    const eq = out.players.user.battlefield.find((p) => p.id === "eq0");
    const cap = out.players.user.battlefield.find((p) => p.id === "cap");
    expect(eq).toBeDefined();                                   // still in play
    expect(eq.attachedTo).toBe(null);                           // …just unattached
    expect(cap.attachments).toEqual([]);                        // …and the host's link is cleared too
    expect(out.players.user.graveyard.some((c) => c.name === "Big Blade")).toBe(false); // never left the battlefield
  });

  it("the unattached Equipment stops buffing — the layer engine reads the cleared link", () => {
    const s = board([BIG_BLADE]);                               // Big Blade grants +2/+0
    expect(permanentPower(s, "cap")).toBe(5);                   // 3 base + 2
    const out = dispatchAction(s, throwActions(s)[0]);
    expect(permanentPower(out, "cap")).toBe(3);                 // bonus gone with the attachment
  });

  it("the cost is paid BEFORE the ability goes on the stack (CR 601.2h)", () => {
    const s = board([BIG_BLADE]);
    const out = dispatchAction(s, throwActions(s)[0]);
    expect(out.players.user.battlefield.find((p) => p.id === "eq0").attachedTo).toBe(null);
    expect((out.stack || []).map((o) => o.kind)).toEqual(["activated-ability"]);
  });
});

describe("⭐ the damage is sized by the Equipment that was ACTUALLY unattached", () => {
  const resolveThrow = (s, equipName) => {
    const act = throwActions(s).find((a) => a.unattachEquipmentName === equipName);
    return resolveTopOfStack(dispatchAction(s, act));
  };

  it("throwing the 5-drop divides FIVE damage; the 1-drop divides ONE", () => {
    expect(resolveThrow(board([BIG_BLADE, SMALL_BLADE]), "Big Blade").pendingChoice)
      .toMatchObject({ kind: "divide-damage", controller: "user", amount: 5, maxTargets: 3 });
    expect(resolveThrow(board([BIG_BLADE, SMALL_BLADE]), "Small Blade").pendingChoice)
      .toMatchObject({ kind: "divide-damage", controller: "user", amount: 1, maxTargets: 3 });
  });

  it("the printed target BOUND rides through to the division (CAP13's enforcement)", () => {
    const pc = resolveThrow(board([BIG_BLADE]), "Big Blade").pendingChoice;
    expect(pc.maxTargets).toBe(3);
    expect(pc.candidates.length).toBeGreaterThan(0);
  });
});

describe("the unattach helper is not a battlefield exit", () => {
  it("unattachEquipment clears both links and records NO leave event", () => {
    const s = board([BIG_BLADE]);
    const out = unattachEquipment(s, "eq0");
    expect(out.players.user.battlefield.find((p) => p.id === "eq0").attachedTo).toBe(null);
    expect(out.players.user.battlefield.find((p) => p.id === "cap").attachments).toEqual([]);
    expect((out.pendingLeaveEvents || []).length).toBe(0);      // nothing left the battlefield
  });

  it("it is a no-op on a non-Equipment and on an already-unattached Equipment", () => {
    const s = board([BIG_BLADE]);
    expect(unattachEquipment(s, "cap")).toBe(s);                // Cap is a creature, not an Equipment
    const once = unattachEquipment(s, "eq0");
    expect(unattachEquipment(once, "eq0")).toBe(once);          // already unattached → unchanged
  });
});
