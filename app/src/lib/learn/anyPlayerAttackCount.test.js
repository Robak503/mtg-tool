/**
 * anyPlayerAttackCount.test.js — "Whenever A PLAYER attacks with N or more creatures" (SHELF-TAIL SH5 —
 * Aurelia, the Law Above; CR 508.1). The SYMMETRIC twin of "you attack with N or more creatures" (Military
 * Intelligence, already native): it fires for EVERY watcher whenever ANY player declares ≥N attackers, so
 * scope:"anyAttack" gets its own all-players pass in checkAttackTriggers (the once-per-combat "you attack"
 * pass excludes it, so a self-attack fires it exactly once). Aurelia's 5+ effect ("deals 3 damage to each of
 * YOUR opponents and you gain 3 life") also needed the SH5 clause-level "each of your opponents" ≡ "each
 * opponent" normalization. Flip +1/0/0.
 *
 * Mutation-checked (via Edit): the all-players pass scopeFilter / the detection arm → Aurelia stops firing
 * on an OPPONENT'S attack (the whole point — a "you attack"-only read would miss it); the minAttackers gate
 * is the battalion pin reused (below-threshold → no fire).
 */
import { beforeEach, describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AURELIA = "Flying, vigilance, haste\nWhenever a player attacks with three or more creatures, you draw a card.\nWhenever a player attacks with five or more creatures, Aurelia deals 3 damage to each of your opponents and you gain 3 life.";
const aureliaCard = { id: "c-aur", name: "Aurelia, the Law Above", type: "Legendary Creature — Angel", power: 4, toughness: 4, mana: "{2}{R}{W}", oracle: AURELIA };

/** Aurelia sits on USER's battlefield; `count` attackers are declared by `attackingPlayer`. Returns how many
 *  of Aurelia's triggers fired. */
function aureliaFires(attackingPlayer, count) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const aurelia = { id: "aur", card: aureliaCard, controller: "user", tapped: false, summoningSick: false, counters: {}, attachments: [], attachedTo: null };
  const s = { ...b, activePlayer: attackingPlayer, phase: "combat", step: "declare-attackers",
    players: { ...b.players, user: { ...b.players.user, battlefield: [aurelia] } },
    combat: { attackers: Array.from({ length: count }, (_, i) => ({ permanentId: `atk${i}`, attackingPlayer, defender: attackingPlayer === "user" ? "ai" : "user" })) } };
  return (checkAttackTriggers(s).pendingTriggers || []).filter((t) => t.source?.permanentId === "aur").length;
}

describe("SH5 — detection + classify", () => {
  it("'a player attacks with N' → anyAttack scope; 'you attack with N' unchanged (scope you)", () => {
    expect(detectTriggers({ name: "X", type: "Enchantment", oracle: "Whenever a player attacks with three or more creatures, you draw a card." })[0])
      .toMatchObject({ event: "youAttack", scope: "anyAttack", minAttackers: 3 });
    expect(detectTriggers({ name: "Y", type: "Enchantment", oracle: "Whenever you attack with three or more creatures, you draw a card." })[0])
      .toMatchObject({ event: "youAttack", scope: "you", minAttackers: 3 });
  });
  it("the 'each of your opponents' effect normalizes and parses; Aurelia is native-trigger", () => {
    expect(programConfidence(parseEffectClause("this creature deals 3 damage to each of your opponents and you gain 3 life", "Instant", { sourceScoped: true }))).toBe("high");
    expect(classifyCard(aureliaCard)).toBe("native-trigger");
  });
});

describe("SH5 — the any-player firing gate on a real declared batch", () => {
  it("THE PIN — fires on an OPPONENT'S 3-attacker declaration (any player, not just you)", () => {
    expect(aureliaFires("ai", 3)).toBe(1); // only the 3+ trigger
  });
  it("fires on the CONTROLLER'S own 3-attacker declaration too — exactly once (no double from the two passes)", () => {
    expect(aureliaFires("user", 3)).toBe(1);
  });
  it("both triggers fire at 5+ (opponent); neither fires below 3", () => {
    expect(aureliaFires("ai", 5)).toBe(2); // 3+ and 5+
    expect(aureliaFires("ai", 2)).toBe(0);
  });
  it("REGRESSION — a scope:'you' attack-count card does NOT fire on an OPPONENT'S attack", () => {
    const b = createGameState({ userDeck: [], aiDeck: [] });
    const mil = { id: "mil", card: { id: "c-mil", name: "Mil", type: "Enchantment", oracle: "Whenever you attack with three or more creatures, you draw a card." }, controller: "user", counters: {}, attachments: [] };
    const s = { ...b, activePlayer: "ai", phase: "combat", step: "declare-attackers",
      players: { ...b.players, user: { ...b.players.user, battlefield: [mil] } },
      combat: { attackers: Array.from({ length: 3 }, (_, i) => ({ permanentId: `a${i}`, attackingPlayer: "ai", defender: "user" })) } };
    expect((checkAttackTriggers(s).pendingTriggers || []).filter((t) => t.source?.permanentId === "mil").length).toBe(0);
  });
});
