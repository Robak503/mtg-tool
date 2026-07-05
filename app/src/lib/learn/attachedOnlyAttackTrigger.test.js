/**
 * attachedOnlyAttackTrigger.test.js — the ATTACHED-ONLY attacks trigger (Reyav, Master Smith) + the
 * "that creature gets/gains" pronoun-referent widening.
 *
 * "Whenever a creature you control that's enchanted or equipped attacks, that creature gains double
 * strike until end of turn." Three pieces, coherently:
 *   - the attacks subject matcher is now ANCHORED (the old non-anchored substring test matched any
 *     "a creature you control <restriction> attacks" and silently DROPPED the restriction — a latent
 *     over-fire the moment such a payload parses); the one checkable restriction ("that's enchanted or
 *     equipped" ⇔ has ≥1 attachment) is modeled explicitly via descriptor.attachedOnly, enforced in
 *     scopeMatches on the triggering attacker;
 *   - the entering/attacking-creature pronoun rewrite now also accepts the spelled-out "that creature
 *     gets/gains …" form (same CR 608.2c referent as "it gets/gains"), on the etb arm and the
 *     attacks/creatureYouControl arm — which is what lets Reyav's payload parse (pump → thatCreature)
 *     and swept Ogre Battledriver / Primal Forcemage / Ardoz along on the etb arm.
 *
 * CREED boundaries pinned: an un-attached attacker does NOT fire Reyav; a bare "that's equipped" (needs
 * an attachment-TYPE check) and an arbitrary restriction stay undetected → Arbiter.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REYAV_ORACLE = "Whenever a creature you control that's enchanted or equipped attacks, that creature gains double strike until end of turn.";
const REYAV = { name: "Reyav, Master Smith", type: "Legendary Creature — Dwarf Artificer", power: 2, toughness: 2, oracle: REYAV_ORACLE };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(userPerms, over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", ...over };
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userPerms } } };
}

describe("ATTACHED-ONLY attacks — detection (coverage)", () => {
  it("Reyav's exact oracle → attacks/creatureYouControl with attachedOnly, routing natively", () => {
    const d = detectTriggers(REYAV);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "creatureYouControl", attachedOnly: true });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(REYAV)).toBe("native-trigger");
  });

  it("CREED: a bare 'that's equipped' (attachment-TYPE check needed) stays undetected", () => {
    const card = { name: "Synth", type: "Creature — Dwarf", oracle: "Whenever a creature you control that's equipped attacks, draw a card." };
    expect(detectTriggers(card)).toHaveLength(0);
    expect(classifyCard(card)).toBe("body-only");
  });

  it("CREED: an arbitrary subject restriction no longer silently drops (anchored matcher)", () => {
    const card = { name: "Synth", type: "Creature — Dwarf", oracle: "Whenever a creature you control with a bounty counter on it attacks, draw a card." };
    expect(detectTriggers(card)).toHaveLength(0);
  });
});

describe("ATTACHED-ONLY attacks — runtime", () => {
  it("an EQUIPPED attacker fires Reyav and gains double strike until end of turn", () => {
    const reyav = permObj(REYAV, "user", "reyav");
    const attacker = permObj({ name: "Knight", type: "Creature — Human Knight", power: 2, toughness: 2, oracle: "" }, "user", "knight", { attachments: ["sword"] });
    const equip = permObj({ name: "Short Sword", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nEquip {1}" }, "user", "sword", { attachedTo: "knight" });
    const s = { ...stateWith([reyav, attacker, equip]), combat: { attackers: [{ permanentId: "knight", attackingPlayer: "user", defender: "ai" }] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentHasKeyword(resolved, "knight", "Double strike")).toBe(true);
  });

  it("an UN-ATTACHED attacker does NOT fire Reyav (the restriction the old matcher dropped)", () => {
    const reyav = permObj(REYAV, "user", "reyav");
    const bare = permObj({ name: "Bare Knight", type: "Creature — Human Knight", power: 2, toughness: 2, oracle: "" }, "user", "bare");
    const s = { ...stateWith([reyav, bare]), combat: { attackers: [{ permanentId: "bare", attackingPlayer: "user", defender: "ai" }] } };
    expect((checkAttackTriggers(s).pendingTriggers || []).length).toBe(0);
  });
});

describe("'that creature gets/gains' referent widening — the etb-arm riders", () => {
  it("Ogre Battledriver: an entering creature gets +2/+0 and haste until end of turn", () => {
    const driver = permObj({ name: "Ogre Battledriver", type: "Creature — Ogre Warrior", power: 3, toughness: 3, oracle: "Whenever another creature you control enters, that creature gets +2/+0 and gains haste until end of turn. (It can attack and {T} this turn.)" }, "user", "driver");
    const newcomer = permObj({ name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "bear");
    let s = stateWith([driver, newcomer], { phase: "main1", step: "main" });
    s = checkEnterTriggers(s, newcomer);
    expect((s.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(s));
    expect(permanentPower(resolved, "bear")).toBe(4);                     // +2/+0 on the ENTERING creature
    expect(permanentHasKeyword(resolved, "bear", "Haste")).toBe(true);
    expect(permanentPower(resolved, "driver")).toBe(3);                   // never the source
  });
});
