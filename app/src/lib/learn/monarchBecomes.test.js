/**
 * monarchBecomes.test.js — the BECOMES-MONARCH trigger event (CR 725) + the edict player-target intent fix.
 *
 * Completing the monarch subsystem: becomeMonarch (the ONE crown chokepoint) now fires a "becomesMonarch"
 * event, so "Whenever you become the monarch, <effect>" watchers the new monarch controls trigger — via
 * both the effect-atom path (ETB crown) and the combat-steal path. checkBecomesMonarchTriggers mirrors
 * checkCounterPlacedTriggers (scoped to the new monarch's own sources; no whose-gate).
 *
 * Custodi Lich ("Whenever you become the monarch, target player sacrifices a creature of their choice")
 * flips native — its edict payoff routes now that a "target player" sacrifice is enemy-intent
 * (atomTargetIntent), aligning it with the already-enemy deal-damage / lose-life player ops. The
 * enemy-aware flush chooser picks an OPPONENT; the controller is never self-edicted (the load-bearing CREED
 * check). Gatekeeper of Malakir (a kicked ETB edict) rides the same intent fix.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { applyMonarchCombatSteal } from "./effects/atoms/monarch.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { atomTargetIntent, parseEffectClause, programTriggerTargetsResolvable } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const drain = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };
const flow = (s) => drain(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const CUSTODI = "When Custodi Lich enters, you become the monarch.\nWhenever you become the monarch, target player sacrifices a creature of their choice.";
const creatures = (p) => p.battlefield.filter((c) => /Creature/.test(c.card.type)).length;

describe("BECOMES-MONARCH event — detection", () => {
  it("Custodi Lich detects both triggers and the becomesMonarch edict routes", () => {
    const card = { name: "Custodi Lich", type: "Creature — Zombie Cleric", power: 2, toughness: 2, oracle: CUSTODI };
    expect(classifyCard(card)).toBe("native-trigger");
    const ts = detectTriggers(card);
    const bm = ts.find((t) => t.event === "becomesMonarch");
    expect(bm).toBeTruthy();
    expect(!!triggerRoutesNatively(bm)).toBe(true);
  });

  it("CREED: a third-person 'an opponent becomes the monarch' form stays unmatched (safe FN)", () => {
    // Knights of the Black Rose / Garland — an intervening-if or control-change payoff; not modeled.
    const card = { name: "Synth", type: "Creature — Human", oracle: "Whenever an opponent becomes the monarch, you draw a card." };
    expect(detectTriggers(card).some((t) => t.event === "becomesMonarch")).toBe(false);
  });
});

describe("BECOMES-MONARCH event — runtime (the crown fires the watcher)", () => {
  function board(extra = {}) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const lich = createPermanent({ id: "lich", card: { name: "Custodi Lich", type: "Creature — Zombie Cleric", power: 2, toughness: 2, oracle: CUSTODI }, controller: "user", summoningSick: false });
    const mine = createPermanent({ id: "mine", card: { name: "MyGuy", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    const opp = createPermanent({ id: "opp", card: { name: "OppGuy", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    const s = { ...base, activePlayer: "user", priorityHolder: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [lich, mine] }, ai: { ...base.players.ai, battlefield: [opp] } }, ...extra };
    return { s, lich };
  }

  it("ETB crown → becomes-monarch edict makes an OPPONENT sacrifice, never the controller", () => {
    const { s, lich } = board();
    const out = flow(checkEnterTriggers(s, lich));
    expect(out.monarchId).toBe("user");                 // crowned
    expect(creatures(out.players.user)).toBe(2);         // Custodi Lich + MyGuy — NEVER self-edicted
    expect(creatures(out.players.ai)).toBe(0);           // the opponent sacrificed
  });

  it("no watcher on the new monarch → the crown still moves, zero triggers (no-op)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const sentinel = createPermanent({ id: "ps", card: { name: "Palace Sentinels", type: "Creature — Human Soldier", power: 2, toughness: 3, oracle: "When Palace Sentinels enters, you become the monarch." }, controller: "user", summoningSick: false });
    let s = { ...base, activePlayer: "user", priorityHolder: "user", players: { ...base.players, user: { ...base.players.user, battlefield: [sentinel] } } };
    s = flow(checkEnterTriggers(s, sentinel));
    expect(s.monarchId).toBe("user");
    expect((s.stack || []).length).toBe(0);
  });

  it("combat-steal path also fires the new monarch's becomes-monarch watcher", () => {
    // user is the monarch with a Custodi Lich; ai steals the crown by combat damage → ai's own
    // becomes-monarch watcher (a second Custodi Lich under ai) fires and edicts user.
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const aiLich = createPermanent({ id: "ailich", card: { name: "Custodi Lich", type: "Creature — Zombie Cleric", power: 2, toughness: 2, oracle: CUSTODI }, controller: "ai", summoningSick: false });
    const userGuy = createPermanent({ id: "ug", card: { name: "UserGuy", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    let s = { ...base, activePlayer: "ai", phase: "combat", step: "combat-damage", monarchId: "user",
      players: { ...base.players, ai: { ...base.players.ai, battlefield: [aiLich] }, user: { ...base.players.user, battlefield: [userGuy] } } };
    // the crown-steal chokepoint (combatResolution calls this on the per-attacker player-damage events)
    s = applyMonarchCombatSteal(s, [{ kind: "combat-damage-player", attackerId: "ailich", attackingPlayer: "ai", defender: "user", amount: 2 }]);
    s = flow(s);
    expect(s.monarchId).toBe("ai");                      // crown stolen
    expect(creatures(s.players.user)).toBe(0);           // ai's becomes-monarch edict hit user
    expect(creatures(s.players.ai)).toBe(1);             // ai's own Lich untouched
  });
});

describe("EDICT player-target intent — enemy (aligns with deal-damage / lose-life)", () => {
  it("a 'target player sacrifices' atom is enemy-intent and trigger-resolvable", () => {
    const p = parseEffectClause("target player sacrifices a creature of their choice", "Instant", { hasX: false });
    expect(atomTargetIntent(p.atoms[0])).toBe("enemy");
    expect(programTriggerTargetsResolvable(p)).toBe(true);
  });

  it("Gatekeeper of Malakir (kicked ETB edict) rides the intent fix → native-trigger", () => {
    const card = { name: "Gatekeeper of Malakir", type: "Creature — Vampire Warrior", power: 2, toughness: 2, oracle: "Kicker {B}\nWhen Gatekeeper of Malakir enters, if it was kicked, target player sacrifices a creature of their choice." };
    expect(classifyCard(card)).toBe("native-trigger");
  });
});
