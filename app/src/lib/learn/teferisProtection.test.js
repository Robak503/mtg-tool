/**
 * teferisProtection.test.js — CAP (2026-09-03): TEFERI'S PROTECTION, fully native.
 * "Until your next turn, your life total can't change and you gain protection from everything. All permanents
 * you control phase out. (…) Exile Teferi's Protection."
 *
 * Three subsystems, one card: a PLAYER shield (life lock — CR 119.6 — and protection from everything —
 * CR 702.16b: untargetable by anything another player controls, all damage prevented), PHASING as a splice
 * (CR 702.26: the controller's permanents leave the battlefield for `phasedOut` untouched and return before
 * that player untaps, without entering), and the spell's self-exile through the program's selfExile stamp.
 * Both the shield and the phase-out end at the controller's next untap step.
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03). The burn cards are SYNTHETIC
 * fixtures (named as such) — they exist only to aim damage at the shielded player.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, loseLife, gainLife, playerProtectedFromEverything, playerLifeLocked, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TEFERI = { id: "h-tp", name: "Teferi's Protection", type: "Instant", mana: "{2}{W}", mana_cost: "{2}{W}", cmc: 3, keywords: [], oracle: "Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out. (While they're phased out, they're treated as though they don't exist. They phase in before you untap during your untap step.)\nExile Teferi's Protection." };
const ZAP = { id: "h-zap", name: "Synthetic Zap", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Synthetic Zap deals 3 damage to any target." };
const SWEEP = { id: "h-sweep", name: "Synthetic Sweep", type: "Sorcery", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: [], oracle: "Synthetic Sweep deals 2 damage to each opponent." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const LAND = { id: "c-land", name: "Plains", type: "Basic Land — Plains", mana: "", keywords: [], oracle: "({T}: Add {W}.)" };
const AURA = { id: "c-aura", name: "Synthetic Aura", type: "Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant creature" };
const BRUTE = { id: "c-brute", name: "Synthetic Brute", type: "Creature — Ogre", mana: "{2}{R}", power: 4, toughness: 4, keywords: [], oracle: "" };
const filler = (id) => ({ id, name: "Card " + id, type: "Instant", mana: "{U}", oracle: "" });

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const brute = createPermanent({ id: "brute", card: BRUTE, controller: "ai", summoningSick: false });
  const aura = createPermanent({ id: "aura", card: AURA, controller: "user" });
  return {
    ...s0, turn: 6, phase: "postcombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand: [TEFERI], graveyard: [], exile: [], library: [filler("u1"), filler("u2")], manaPool: { W: 3, U: 0, B: 0, R: 0, G: 0, C: 0 },
        battlefield: [createPermanent({ id: "bear", card: BEAR, controller: "user", summoningSick: false }), { ...createPermanent({ id: "land", card: LAND, controller: "user" }), tapped: true }, { ...aura, attachedTo: "brute" }] },
      ai: { ...s0.players.ai, life: 20, hand: [ZAP, SWEEP], graveyard: [], exile: [], library: [filler("a1")], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 },
        battlefield: [{ ...brute, attachments: ["aura"] }] },
    },
  };
}
const castOf = (s, seat, cardId) => legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
/** Cast Teferi's Protection with the user's floating {W}{W}{W} and resolve it. */
function protect(s) {
  const acts = castOf(s, "user", "h-tp");
  expect(acts.length).toBeGreaterThan(0);
  return resolveTopOfStack(flushTriggers(dispatchAction(s, acts[0])));
}
const mentionsUser = (a) => (a.targets || []).some((t) => t.type === "player" && t.id === "user");

describe("the parse + the tier", () => {
  it("the body collapses to the one atom; the card is native", () => {
    const p = parseEffectClause("Until your next turn, your life total can't change and you gain protection from everything. All permanents you control phase out.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "teferi-protection", targetType: null }]);
    expect(classifyCard(TEFERI)).toBe("native-spell");
  });
});

describe("runtime — resolving the spell", () => {
  it("⭐ the shield goes up, every permanent phases out (splice, attachments unhooked), and the spell exiles itself", () => {
    const s = board();
    const out = protect(s);
    expect(playerProtectedFromEverything(out, "user")).toBe(true);
    expect(playerLifeLocked(out, "user")).toBe(true);
    expect(out.players.user.battlefield).toEqual([]);
    expect(out.players.user.phasedOut.map((p) => p.id).sort()).toEqual(["aura", "bear", "land"]);
    // The land left TAPPED and keeps that state while phased out (702.26b — it simply doesn't exist).
    expect(out.players.user.phasedOut.find((p) => p.id === "land").tapped).toBe(true);
    // Our aura on THEIR creature phased out with us and is unhooked from its host.
    expect(out.players.ai.battlefield.find((p) => p.id === "brute").attachments).toEqual([]);
    expect(out.players.user.exile.some((c) => c.id === "h-tp")).toBe(true);
    expect(out.players.user.graveyard.some((c) => c.id === "h-tp")).toBe(false);
    expect(out.stack).toEqual([]);
    // Nobody else is shielded.
    expect(playerProtectedFromEverything(out, "ai")).toBe(false);
  });

  it("⭐ the life total can't change: losses and gains both leave it at 20", () => {
    const out = protect(board());
    expect(loseLife(out, { playerId: "user", amount: 7, combatDamage: false }).players.user.life).toBe(20);
    expect(gainLife(out, { playerId: "user", amount: 5 }).players.user.life).toBe(20);
    // The other player's total still moves.
    expect(loseLife(out, { playerId: "ai", amount: 7, combatDamage: false }).players.ai.life).toBe(13);
  });

  it("⭐ protection from everything: the opponent's burn can no longer aim at the player (it could before)", () => {
    const s = board();
    const before = castOf(s, "ai", "h-zap");
    expect(before.some(mentionsUser)).toBe(true);
    const out = protect(s);
    const after = castOf(out, "ai", "h-zap");
    expect(after.length).toBeGreaterThan(0); // the spell still has legal targets (the ai itself)
    expect(after.some(mentionsUser)).toBe(false);
  });

  it("⭐ untargeted damage ('each opponent') is prevented; combat damage is prevented", () => {
    const out = protect(board());
    const sweeps = castOf(out, "ai", "h-sweep");
    expect(sweeps.length).toBe(1);
    const swept = resolveTopOfStack(flushTriggers(dispatchAction(out, sweeps[0])));
    expect(swept.players.user.life).toBe(20);
    expect(swept.log.some((e) => e.kind === "damage-prevented" && e.targetId === "user")).toBe(true);
    // Combat: the 4/4 attacks the shielded player.
    const combat = { ...out, phase: "combat", step: "combat-damage", activePlayer: "ai", combat: { attackers: [{ permanentId: "brute", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
    const hit = resolveCombatDamage(combat);
    expect(hit.players.user.life).toBe(20);
    expect(hit.log.some((e) => e.kind === "combat-damage-prevented" && e.playerId === "user")).toBe(true);
    // Control: without the shield the same swing connects.
    const unshielded = { ...combat, players: { ...combat.players, user: { ...combat.players.user, teferiShield: undefined } } };
    expect(resolveCombatDamage(unshielded).players.user.life).toBe(16);
  });
});

describe("runtime — the controller's next untap step", () => {
  it("⭐ the permanents phase in (same state, re-hooked to a surviving host) and the shield expires — before untapping", () => {
    const out = protect(board());
    const untap = runStepActions({ ...out, activePlayer: "user", phase: "beginning", step: "untap", turn: 7 });
    expect(untap.players.user.phasedOut).toEqual([]);
    expect(untap.players.user.battlefield.map((p) => p.id).sort()).toEqual(["aura", "bear", "land"]);
    // Phased in BEFORE untap → the land that left tapped untaps in this same step.
    expect(untap.players.user.battlefield.find((p) => p.id === "land").tapped).toBe(false);
    expect(untap.players.user.battlefield.find((p) => p.id === "aura").attachedTo).toBe("brute");
    expect(untap.players.ai.battlefield.find((p) => p.id === "brute").attachments).toEqual(["aura"]);
    expect(playerProtectedFromEverything(untap, "user")).toBe(false);
    expect(playerLifeLocked(untap, "user")).toBe(false);
    expect(loseLife(untap, { playerId: "user", amount: 3, combatDamage: false }).players.user.life).toBe(17);
  });

  it("the OTHER player's untap step changes nothing for the shielded player", () => {
    const out = protect(board());
    const untap = runStepActions({ ...out, activePlayer: "ai", phase: "beginning", step: "untap", turn: 7 });
    expect(untap.players.user.phasedOut.length).toBe(3);
    expect(playerProtectedFromEverything(untap, "user")).toBe(true);
  });

  it("a host that is gone: the aura comes back unattached", () => {
    const out = protect(board());
    const gone = { ...out, players: { ...out.players, ai: { ...out.players.ai, battlefield: [] } } };
    const untap = runStepActions({ ...gone, activePlayer: "user", phase: "beginning", step: "untap", turn: 7 });
    expect(untap.players.user.battlefield.find((p) => p.id === "aura").attachedTo).toBeNull();
  });
});
