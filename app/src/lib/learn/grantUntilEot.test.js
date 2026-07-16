/**
 * grantUntilEot.test.js — BLITZ TG-1: the UNTIL-EOT QUOTED GRANTS (Feign Death / Demonic Gifts /
 * Showstopper / Lightning Volley family). One stored fixed-ids layer-6 addAbility effect (CR 611.2c —
 * the set locks at resolution), riding the EXISTING group-grant collectors for both halves (triggered
 * fire incl. the dead-look-back dies path, activated enumeration) and expiring free at cleanup. The
 * quoted body gates through the SAME modeled-body validators the static group grants use — an
 * unmodeled body (Galuf's power-counters) parks, and the bare "return it to the battlefield" wording
 * stays a dies-only SENTINEL so the FLICKER spell half (Momentary Blink) can never mis-parse.
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { applyGrantUntilEot } from "./effects/atoms/grantUntilEot.js";
import { grantedTriggeredQuotedFor, expireContinuousEffects } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FEIGN_DEATH = { id: "fd", name: "Feign Death", type: "Instant", mana: "{B}",
  oracle: `Until end of turn, target creature gains "When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it."` };
const DEMONIC_GIFTS = { id: "dg", name: "Demonic Gifts", type: "Instant", mana: "{1}{B}",
  oracle: `Until end of turn, target creature gets +2/+0 and gains "When this creature dies, return it to the battlefield under its owner's control."` };
const SHOWSTOPPER = { id: "ss", name: "Showstopper", type: "Instant", mana: "{1}{B}{R}",
  oracle: `Until end of turn, creatures you control gain "When this creature dies, it deals 2 damage to target creature an opponent controls."` };
const LIGHTNING_VOLLEY = { id: "lv", name: "Lightning Volley", type: "Instant", mana: "{3}{R}",
  oracle: `Until end of turn, creatures you control gain "{T}: This creature deals 1 damage to any target."` };
const GALUF = { id: "gf", name: "Galuf's Final Act", type: "Instant", mana: "{1}{B}",
  oracle: `Until end of turn, target creature gets +1/+0 and gains "When this creature dies, put a number of +1/+1 counters equal to its power on up to one target creature."` };
const BLINK = { id: "mb", name: "Momentary Blink", type: "Instant", mana: "{1}{W}",
  oracle: "Exile target creature you control, then return it to the battlefield under its owner's control." };

const BEAR = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };

function stateWithBear() {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bear = createPermanent({ id: "b1", card: { ...BEAR }, controller: "user", summoningSick: false });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
}
function resolveAll(s) { s = flushTriggers(s, {}); let g = 0; while ((s.stack || []).length && g++ < 12) s = resolveTopOfStack(s); return s; }

describe("classify — the vocabulary gate", () => {
  it("modeled bodies flip; unmodeled body and the flicker wording stay Arbiter", () => {
    expect(classifyCard(FEIGN_DEATH)).toBe("native-spell");
    expect(classifyCard(DEMONIC_GIFTS)).toBe("native-spell");
    expect(classifyCard(SHOWSTOPPER)).toBe("native-spell");
    expect(classifyCard(LIGHTNING_VOLLEY)).toBe("native-spell");
    expect(classifyCard(GALUF)).toBe("arbiter-spell");   // power-counters body unmodeled → park
    expect(classifyCard(BLINK)).toBe("arbiter-spell");   // the bare return wording NEVER parses outside a dies sentinel
  });
});

describe("runtime — grant, die, return (the Feign Death loop)", () => {
  it("granted dies-return fires off the DEAD look-back: back tapped with a +1/+1 counter, and the new body is NOT re-granted", () => {
    let s = stateWithBear();
    s = applyGrantUntilEot(s, { op: "grant-until-eot", targetType: "creature", grantKind: "triggered",
      quoted: `When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it.` },
      { controller: "user", targets: [{ type: "creature", id: "b1" }], cardName: "Feign Death" });
    expect(grantedTriggeredQuotedFor(s, "b1").length).toBe(1);
    // Kill it through the REAL death pipeline (lethal marked damage → SBA → dies triggers → flush → resolve).
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => (p.id === "b1" ? { ...p, damageMarked: 99 } : p)) } } };
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.map((d) => d.id)).toContain("b1");
    s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    const back = s.players.user.battlefield.find((p) => p.card?.id === BEAR.id);
    expect(back).toBeTruthy();
    expect(back.tapped).toBe(true);
    expect(back.counters?.["+1/+1"] || 0).toBe(1);
    expect(back.id).not.toBe("b1");                              // a NEW object (CR 400.7)
    expect(grantedTriggeredQuotedFor(s, back.id)).toEqual([]);   // the grant never follows it — no loop
    expect(s.players.user.graveyard.some((c) => c.id === BEAR.id)).toBe(false);
  });
  it("team grant locks the set at resolution (CR 611.2c) and expires at cleanup", () => {
    let s = stateWithBear();
    s = applyGrantUntilEot(s, { op: "grant-until-eot", scope: "youControl", grantKind: "triggered",
      quoted: `When this creature dies, it deals 2 damage to target creature an opponent controls.` },
      { controller: "user", cardName: "Showstopper" });
    expect(grantedTriggeredQuotedFor(s, "b1").length).toBe(1);
    // A creature entering AFTER resolution is never in the fixed set.
    const late = createPermanent({ id: "b2", card: { ...BEAR, id: "bear2" }, controller: "user", summoningSick: true });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, late] } } };
    expect(grantedTriggeredQuotedFor(s, "b2")).toEqual([]);
    // Cleanup wears the grant off.
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect(grantedTriggeredQuotedFor(s, "b1")).toEqual([]);
  });
  it("granted ACTIVATED ability enumerates on the recipient (Lightning Volley's ping)", () => {
    let s = stateWithBear();
    s = applyGrantUntilEot(s, { op: "grant-until-eot", scope: "youControl", grantKind: "activated",
      quoted: `{T}: This creature deals 1 damage to any target.` },
      { controller: "user", cardName: "Lightning Volley" });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.permanentId === "b1");
    expect(acts.some((a) => /deals 1 damage/i.test(a.abilityText || ""))).toBe(true);
  });
  it("target killed in response → nothing stored (CR 608.2b fizzle)", () => {
    let s = stateWithBear();
    const before = (s.continuousEffects || []).length;
    s = applyGrantUntilEot(s, { op: "grant-until-eot", targetType: "creature", grantKind: "triggered",
      quoted: `When this creature dies, return it to the battlefield tapped under its owner's control.` },
      { controller: "user", targets: [{ type: "creature", id: "GONE" }], cardName: "Feign Death" });
    expect((s.continuousEffects || []).length).toBe(before);
  });
});
