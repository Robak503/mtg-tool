/**
 * ETB-EQUIP-ATTACH — auto-attaching Equipment ("Living-weapon"-style): "When this Equipment enters,
 * attach it to target creature you control." (Bramble Armor, Scavenged Blade, Maul of the Skyclaves …).
 *
 * Before this, the ETB-attach trigger was unmodeled → the equipment entered and buffed NOTHING (body-only).
 * The fix models "attach it to target creature you control" as a `self-attach` atom that wires the SOURCE
 * Equipment (ctx.sourceId) onto the chosen host via the shared `attachPermanent` helper — the SAME
 * mechanism Equip uses, so the already-modeled equipped-creature bonus (parseAttachedBonus + the layer
 * engine) lights up. The equip mechanic + the bonus already worked; this is the missing trigger. Pins:
 *   1. the parser — the exact clause parses to a self-attach atom (HIGH); a rider stays LOW;
 *   2. the trigger intent — self-attach is "own" (the host is a creature YOU control; never enemy-side);
 *   3. the engine (CREED core) — the ETB trigger attaches the equipment AND the host gains the bonus;
 *   4. coverage — auto-attach equipment is native-equipment; a UEOT-grant rider stays body-only; a
 *      trigger-less equipment is unchanged.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { triggersForEvent } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (txt) => parseEffectClause(txt, "Instant")?.atoms;
const isHigh = (txt) => programConfidence(parseEffectClause(txt, "Instant")) === "high";
const C = (name, oracle) => ({ name, type: "Artifact — Equipment", oracle });

describe("parser — self-attach atom", () => {
  it("parses 'attach it to target creature you control' to a self-attach atom (controller:you)", () => {
    expect(atomsOf("attach it to target creature you control"))
      .toEqual([{ op: "self-attach", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }]);
    expect(isHigh("attach it to target creature you control")).toBe(true);
  });
  it("self-attach is OWN-side intent (so the trigger-flush chooser picks a creature you control)", () => {
    expect(atomTargetIntent({ op: "self-attach", targetType: "creature" })).toBe("own");
  });
  it("CREED: a UEOT-grant rider on the attach clause stays LOW", () => {
    expect(isHigh("attach it to target creature you control. that creature gains first strike until end of turn")).toBe(false);
  });
});

describe("engine (CREED core) — the ETB trigger attaches the equipment and the host gains the bonus", () => {
  it("Bramble Armor's ETB attaches to a creature you control → it gets +2/+2", () => {
    const equipCard = { id: "eq", name: "Bramble Armor", type: "Artifact — Equipment", oracle: "When Bramble Armor enters, attach it to target creature you control.\nEquipped creature gets +2/+2.\nEquip {3}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const equip = createPermanent({ id: "eqp", card: equipCard, controller: "user" });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bear, equip] } } };
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([2, 2]);

    const fired = triggersForEvent(s, { event: "etb", sourcePermanent: s.players.user.battlefield[1], triggeringPermanent: s.players.user.battlefield[1] });
    expect(fired).toHaveLength(1);
    s = resolveTopOfStack(flushTriggers({ ...s, pendingTriggers: fired }));

    expect(s.players.user.battlefield.find((p) => p.id === "eqp").attachedTo).toBe("bear"); // attached
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([4, 4]);     // +2/+2 from the equip bonus
  });
});

describe("coverage — auto-attach equipment is native-equipment", () => {
  it("an ETB-attach equipment with a clean bonus + Equip is native-equipment", () => {
    expect(classifyCard(C("Bramble Armor", "When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +2/+2.\nEquip {3}"))).toBe("native-equipment");
    expect(classifyCard(C("Scavenged Blade", "When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +1/+1.\nEquip {2}"))).toBe("native-equipment");
  });
  it("a trigger-LESS equipment is unchanged (no regression)", () => {
    expect(classifyCard(C("Bonesplitter", "Equipped creature gets +2/+0.\nEquip {1}"))).toBe("native-equipment");
  });
  it("CREED: a UEOT-grant rider (Squire's Lightblade) stays body-only; a NON-routing trigger stays body-only", () => {
    expect(classifyCard(C("Squire's Lightblade", "When this Equipment enters, attach it to target creature you control. That creature gains first strike until end of turn.\nEquipped creature gets +1/+1.\nEquip {2}"))).toBe("body-only");
    // an equipment whose equipped-creature trigger is a MULTI-CLAUSE rider that doesn't fully model
    // doesn't route → stays body-only (WAVE 4: the equippedCreature scope is now DETECTED, so the
    // non-routing gate is the all-or-nothing effect parse, not the old undetected-event accident). The
    // original specimen ("…and you untap all lands you control") became genuinely modeled when the untap
    // anchor learned the second-conjunct "you " subject (swordFeastFamine.test.js pins the flip), so the
    // pin holds against a genuinely unmodeled tail instead.
    expect(classifyCard(C("Sword of Toil", "Whenever equipped creature deals combat damage to a player, that player discards a card and you venture into the dungeon.\nEquipped creature gets +1/+1.\nEquip {2}"))).toBe("body-only");
  });
});
