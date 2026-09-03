/**
 * SELF-LTB-RETURN-TO-HAND (Wave 4) — a permanent's own "leaves the battlefield" trigger returns an object
 * (already in a graveyard) to its OWNER's hand. Two live training-deck shapes:
 *   (A) AURA self-PiG-return — Rancor: "When this Aura is put into a graveyard from the battlefield, return
 *       it to its owner's hand." (a NEW "ltb" event, emitted by gameState.detachPermanentFromAll →
 *       triggers.checkLeavesTriggers).
 *   (B) EQUIPMENT equipped-creature-dies-return — Sword of the Realms (Halvar back face): "Whenever equipped
 *       creature dies, return it to its owner's hand." (rides the existing dies pipeline, equippedCreature scope).
 *
 * Pins, in order: detection (the two shapes classify; the bare/rider variants don't) · parser routing (the
 * kind-tagged marker → a HIGH non-targeted self-return atom) · the engine (CREED core: the object lands in the
 * OWNER's hand, the equipment stays unattached on the battlefield) · CR 111.7 token guard · CR 608.2b
 * no-op-when-gone · coverage (Rancor → native-aura, Sword shape → native-equipment) · CREED false-positive
 * guards (a different effect, a live self-bounce, a non-Aura PiG, a delayed return all stay non-native).
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  _resetIdsForTests, createGameState, createPermanent, attachPermanent, destroyLethalCreatures, moveCardToZone,
} from "./gameState.js";
import { detectTriggers, checkDiesTriggers, checkLeavesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applySelfReturn } from "./effects/atoms/selfReturn.js";

beforeEach(() => _resetIdsForTests());

const RANCOR_ORACLE =
  "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.";
const SWORD_ORACLE =
  "Equipped creature gets +2/+0 and has vigilance.\nWhenever equipped creature dies, return it to its owner's hand.\nEquip {1}{W}";

const rancorCard = (id = "rancor-card") => ({ id, name: "Rancor", type: "Enchantment — Aura", oracle: RANCOR_ORACLE });
const swordCard = (id = "sw-card") => ({ id, name: "Sword of the Realms", type: "Artifact — Equipment", oracle: SWORD_ORACLE });

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function markLethal(state, pid, permId) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid],
    battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

describe("detection", () => {
  it("Rancor's PiG clause → an 'ltb' self trigger tagged selfReturnKind:self, effect rewritten to the marker", () => {
    const [d] = detectTriggers(rancorCard()).filter((t) => t.event === "ltb");
    expect(d).toMatchObject({ event: "ltb", scope: "self", selfReturnKind: "self" });
    expect(d.effectClause).toBe("[self-return:self] return it to its owner's hand");
  });

  it("Sword's clause → a 'dies' equippedCreature trigger tagged selfReturnKind:attached", () => {
    const [d] = detectTriggers(swordCard()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "equippedCreature", selfReturnKind: "attached" });
    expect(d.effectClause).toBe("[self-return:attached] return it to its owner's hand");
  });

  it("the marker clause parses HIGH, non-targeted → a self-return atom", () => {
    for (const txt of ["[self-return:self] return it to its owner's hand", "[self-return:attached] return it to its owner's hand"]) {
      const p = parseEffectClause(txt, "Instant");
      expect(programConfidence(p)).toBe("high");
      expect(programNeedsChosenTarget(p)).toBe(false);
      expect(p.atoms).toEqual([{ op: "self-return" }]);
    }
  });
});

describe("engine (CREED core)", () => {
  it("(A) Rancor's host dies → Rancor goes from the graveyard back to its owner's HAND", () => {
    let s = baseState();
    const host = createPermanent({ id: "host", card: { id: "host-c", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const ranc = createPermanent({ id: "ranc", card: rancorCard(), controller: "user" });
    s = withBattlefield(s, "user", [host, ranc]);
    s = attachPermanent(s, { equipId: "ranc", targetId: "host" });
    s = markLethal(s, "user", "host");

    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    // exactly ONE PiG trigger (no double-fire from the orphan + own-leave paths)
    expect((s.pendingTriggers || []).filter((t) => t.event === "ltb")).toHaveLength(1);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Rancor"); // in the graveyard pre-resolution

    s = resolveAll(s);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Rancor"]); // returned to OWNER's hand
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Rancor");
  });

  it("(B) Sword's equipped creature dies → the CREATURE returns to its owner's hand; the Sword stays on the battlefield, unattached", () => {
    let s = baseState();
    const sword = createPermanent({ id: "sw", card: swordCard(), controller: "user" });
    const knight = createPermanent({ id: "guy", card: { id: "guy-c", name: "Knight", type: "Creature — Knight", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    s = withBattlefield(s, "user", [sword, knight]);
    s = attachPermanent(s, { equipId: "sw", targetId: "guy" });
    s = markLethal(s, "user", "guy");

    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead[0].attachments).toEqual(["sw"]); // look-back carried the former attachment
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect((s.pendingTriggers || []).filter((t) => t.source?.name === "Sword of the Realms")).toHaveLength(1);

    s = resolveAll(s);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Knight"]); // the dead creature → owner's hand
    const sw = s.players.user.battlefield.find((p) => p.id === "sw");
    expect(sw).toBeTruthy();          // the equipment did NOT leave the battlefield
    expect(sw.attachedTo).toBeNull(); // and is now unattached (CR 704.5n/q)
  });

  it("returns to the DEAD creature's OWNER, not the equipment's controller (CR 400.3 owner proxy)", () => {
    // An opponent's creature equipped (hypothetically) with the user's Sword: the creature returns to the
    // OPPONENT's hand. (ATTACH forbids cross-control in practice; this pins the owner-proxy via the look-back.)
    let s = baseState();
    const dead = { id: "perm-x", controller: "ai1", name: "Goblin", card: { id: "gob-c", name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, attachments: ["sw"] };
    const sword = createPermanent({ id: "sw", card: swordCard(), controller: "user" });
    s = withBattlefield(s, "user", [sword]);
    s = checkDiesTriggers(s, [dead]);
    s = resolveAll({ ...s, players: { ...s.players, ai1: { ...s.players.ai1, graveyard: [dead.card] } } });
    expect(s.players.ai1.hand.map((c) => c.name)).toEqual(["Goblin"]);
    expect(s.players.user.hand).toEqual([]);
  });
});

describe("atom fail-safes", () => {
  it("CR 111.7 — a TOKEN never returns to a hand (it ceases to exist)", () => {
    let s = baseState();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ id: "tok", name: "Soldier", token: true, type: "Creature" }] } } };
    const after = applySelfReturn(s, { op: "self-return" }, { triggeringController: "user", triggeringCardId: "tok", triggeringCardIsToken: true });
    expect(after.players.user.hand).toEqual([]);
    expect(after.players.user.graveyard.map((c) => c.name)).toEqual(["Soldier"]); // dropped, never placed in hand
  });

  it("CR 608.2b — the object already left the graveyard → a logged no-op (no fabricated card in hand)", () => {
    const s = baseState();
    const after = applySelfReturn(s, { op: "self-return" }, { triggeringController: "user", triggeringCardId: "gone" });
    expect(after.players.user.hand).toEqual([]);
  });
});

// SELF-DIES-RETURN (frontier round 4, the Phoenix shape) — "When this creature dies, return it to its owner's
// hand." The creature DIED, so "it" (CR 608.2c) is the dead creature in its owner's graveyard — the SAME
// graveyard→hand self-return the Aura-PiG / equipped-creature cases perform. Gated to the dies EVENT so a LIVE
// self-bounce (Zephyr Spirit "When this creature blocks, return it…") is never mis-routed here.
const PHOENIX_ORACLE = "Flying\nWhen this creature dies, return it to its owner's hand.";
const phoenixCard = (id = "phx-card") => ({ id, name: "Shivan Phoenix", type: "Creature — Phoenix", oracle: PHOENIX_ORACLE });

describe("SELF-DIES-RETURN (Phoenix shape)", () => {
  it("'When this creature dies, return it…' → a dies self trigger, effect rewritten to the [self-return:self] marker", () => {
    const [d] = detectTriggers(phoenixCard()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self" });
    expect(d.effectClause).toBe("[self-return:self] return it to its owner's hand");
  });

  it("engine (CREED core) — the dead Phoenix goes from the graveyard back to its owner's HAND, exactly once", () => {
    let s = baseState();
    const phx = createPermanent({ id: "phx", card: { ...phoenixCard(), power: 6, toughness: 6 }, controller: "user", summoningSick: false });
    s = withBattlefield(s, "user", [phx]);
    s = markLethal(s, "user", "phx");

    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Shivan Phoenix"); // in GY pre-resolution

    s = resolveAll(s);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Shivan Phoenix"]);            // returned to OWNER's hand
    expect(s.players.user.graveyard.map((c) => c.name)).not.toContain("Shivan Phoenix");   // not left in / duplicated
    expect(s.players.user.battlefield.find((p) => p.id === "phx")).toBeFalsy();            // not back on the battlefield
  });

  it("coverage — the Phoenix shape classifies native-trigger", () => {
    expect(classifyCard(phoenixCard())).toBe("native-trigger");
    // a no-keyword variant (Mortus Strider) too
    expect(classifyCard({ name: "Mortus Strider", type: "Creature — Spirit", oracle: "When this creature dies, return it to its owner's hand." })).toBe("native-trigger");
  });

  it("CREED anti-FP — a LIVE self-bounce on a NON-dies event (Zephyr Spirit 'blocks') is NOT rewritten and stays body-only", () => {
    const [d] = detectTriggers({ name: "Zephyr Spirit", type: "Creature — Spirit", oracle: "When this creature blocks, return it to its owner's hand." });
    expect(d.event).toBe("blocks");
    expect(d.effectClause).toBe("return it to its owner's hand");   // NOT the [self-return:self] marker
    expect(classifyCard({ name: "Zephyr Spirit", type: "Creature — Spirit", oracle: "When this creature blocks, return it to its owner's hand." })).toBe("body-only");
  });

  it("CREED anti-FP — a RIDER on the dies-return ('…then draw a card') leaves residue → body-only", () => {
    expect(classifyCard({ name: "Rider Phoenix", type: "Creature — Phoenix", oracle: "When this creature dies, return it to its owner's hand, then draw a card." })).toBe("body-only");
  });
});

describe("coverage", () => {
  it("Rancor classifies native-aura (the PiG clause is now modeled, not residue)", () => {
    expect(classifyCard({ name: "Rancor", type: "Enchantment — Aura", oracle: RANCOR_ORACLE })).toBe("native-aura");
  });
  it("a Sword-of-the-Realms-shaped equipment classifies native-equipment", () => {
    expect(classifyCard({ name: "Sword of the Realms", type: "Artifact — Equipment", oracle: SWORD_ORACLE })).toBe("native-equipment");
  });
});

describe("CREED false-positive guards", () => {
  it("'equipped creature dies, draw a card/two cards' — GRADUATED 2026-09-03 (SG-2): a general equipped-creature-dies detector takes every effect BUT the return-it form; an unmodeled effect still parks", () => {
    expect(classifyCard({ name: "Skullclamp", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/-1.\nWhenever equipped creature dies, draw two cards.\nEquip {1}" })).toBe("native-equipment");
    expect(classifyCard({ name: "Transmogrant's Crown", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nWhenever equipped creature dies, draw a card.\nEquip {1}" })).toBe("native-equipment");
    // ⛔ The CREED half lives on: the trigger is detected, but an effect nothing models keeps the card parked.
    expect(classifyCard({ name: "Probe Clamp", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nWhenever equipped creature dies, each opponent glorbulates.\nEquip {1}" })).toBe("body-only");
  });

  it("a LIVE self-bounce (Zephyr Spirit: 'When this creature blocks, return it…') is NOT rewritten to a graveyard self-return", () => {
    const [d] = detectTriggers({ name: "Zephyr Spirit", type: "Creature — Spirit", oracle: "When this creature blocks, return it to its owner's hand." });
    expect(d.selfReturnKind).toBeUndefined();                          // never tagged
    expect(d.effectClause).toBe("return it to its owner's hand");      // left bare (stays its existing handling)
  });

  it("a non-Aura self-PiG ('this artifact is put into a graveyard…') is NOT detected as an Aura return", () => {
    const ds = detectTriggers({ name: "Spine of Ish Sah", type: "Artifact", oracle: "When Spine of Ish Sah enters, destroy target permanent.\nWhen Spine of Ish Sah is put into a graveyard from the battlefield, return it to its owner's hand." });
    expect(ds.some((d) => d.selfReturnKind === "self")).toBe(false);
  });

  it("a DELAYED return ('…at the beginning of the next end step') does NOT flip (the rider leaves residue)", () => {
    const ds = detectTriggers({ name: "Resurrection Orb", type: "Artifact — Equipment", oracle: "Whenever equipped creature dies, return that card to the battlefield under its owner's control at the beginning of the next end step.\nEquip {3}" });
    expect(ds.some((d) => d.selfReturnKind)).toBe(false);
  });

  it("a plain creature dying alone fires NO ltb trigger, and the leave queue is cleared", () => {
    let s = baseState();
    const lone = createPermanent({ id: "lone", card: { id: "lone-c", name: "Lone Bear", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    s = markLethal(withBattlefield(s, "user", [lone]), "user", "lone");
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    expect((s.pendingTriggers || []).filter((t) => t.event === "ltb")).toHaveLength(0);
    expect(s.pendingLeaveEvents || []).toHaveLength(0); // drained + cleared (never leaks)
  });

  it("checkLeavesTriggers is idempotent — a second drain on an empty queue is a no-op", () => {
    const s = baseState();
    expect(checkLeavesTriggers(s)).toBe(s);
  });

  it("a non-graveyard exit (bounce) records toGraveyard:false → no PiG fires for the Aura", () => {
    // Rancor on a host; bounce the host to hand (the Aura is 704.5n'd to the graveyard — that IS a PiG, so it
    // DOES fire). Instead bounce the AURA itself directly (battlefield → hand): toGraveyard:false → no PiG.
    let s = baseState();
    const ranc = createPermanent({ id: "ranc", card: rancorCard(), controller: "user" });
    s = withBattlefield(s, "user", [ranc]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "ranc" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "ltb")).toHaveLength(0); // bounce ≠ PiG
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Rancor"]); // already in hand from the bounce
  });
});
