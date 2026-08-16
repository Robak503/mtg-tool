/**
 * raphAndMikey.test.js — the DUO plural-verb attack trigger + REVEAL-UNTIL-CREATURE-ATTACKING
 * (Raph & Mikey, Troublemakers, SHELF-TAIL W10 — CR 508.1c).
 *
 * Two arms: ① the duo-name PLURAL verb — "Whenever Raph & Mikey ATTACK" conjugates plural, so the
 * singular \battacks\b self family never saw it; the new arm is gated to the EXACT self-name subject
 * (a watcher plural carries its own subject wording and can never reach it). ② the two-sentence
 * dig+disposition span collapsed pre-split (the matchOpenTheWay convention): reveal until the FIRST
 * creature → enter it TAPPED + JOIN combat.attackers vs the trigger's defender (ctx.defenderId — the
 * applyMobilize convention: never DECLARED, no attack triggers fire for it) → bottom every other
 * revealed card in the deterministic-random order.
 *
 * Mutation-checked (via Edit): the duo arm → the detect/tier pins die; the collapse anchor → the
 * HIGH pin dies; the attacker-join line → the joins-combat pin dies (the enter would silently degrade
 * to a plain tapped entry — the dropped-half FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyRevealUntilCreatureAttacking } from "./effects/atoms/library.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAPH = {
  name: "Raph & Mikey, Troublemakers", type: "Legendary Creature — Turtle Warrior", mana: "{3}{R}{G}", power: 4, toughness: 4,
  oracle: "Trample, haste\nWhenever Raph & Mikey attack, reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield tapped and attacking and the rest on the bottom of your library in a random order.",
};
const CLAUSE = "reveal cards from the top of your library until you reveal a creature card. Put that card onto the battlefield tapped and attacking and the rest on the bottom of your library in a random order";

const cardOf = (name, type) => ({ id: `c-${name}`, name, type });
function st(library = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers",
    combat: { attackers: [], blockers: [] },
    players: { ...s.players, user: { ...s.players.user, library, battlefield: [] } },
  };
}

describe("Raph & Mikey — detect + parse + the flip", () => {
  it("MUST STAY ROUTED: the plural-verb self trigger detects, the span parses HIGH, the card is native-trigger", () => {
    const ds = detectTriggers(RAPH);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "attacks", scope: "self" });
    expect(triggerRoutesNatively(ds[0])).toBe(true);
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].op).toBe("reveal-until-creature-attacking");
    expect(classifyCard(RAPH)).toBe("native-trigger");
  });
  it("CREED near-misses: a watcher plural and a disposition variant stay parked", () => {
    expect(detectTriggers({ name: "W", type: "Creature — Human", oracle: "Whenever creatures you control attack, draw a card." })).toHaveLength(0);
    expect(programConfidence(parseEffectClause(CLAUSE.replace("tapped and attacking", "tapped"), "Instant", { sourceScoped: true }))).toBe("low");
  });
});

describe("Raph & Mikey — the runtime (reveal → enter attacking → bottom)", () => {
  it("the FIRST creature enters tapped AND joins combat vs the defender; the rest bottoms", () => {
    const lib = [cardOf("Bolt", "Instant"), cardOf("Forest", "Basic Land — Forest"), cardOf("Bear", "Creature — Bear"), cardOf("Deep", "Sorcery")];
    const s = st(lib);
    const after = applyRevealUntilCreatureAttacking(s, { op: "reveal-until-creature-attacking" }, { controller: "user", sourceId: "src", defenderId: "ai" });
    const bf = after.players.user.battlefield;
    expect(bf).toHaveLength(1);
    expect(bf[0].card.name).toBe("Bear");
    expect(bf[0].tapped).toBe(true);
    expect(after.combat.attackers).toHaveLength(1);                       // the JOIN (mutation-check line)
    expect(after.combat.attackers[0]).toMatchObject({ permanentId: bf[0].id, attackingPlayer: "user", defender: "ai" });
    expect(after.players.user.library).toHaveLength(3);                   // Bolt + Forest bottomed, Deep untouched on top→
    expect(after.players.user.library.some((c) => c.name === "Bear")).toBe(false);
  });
  it("no creature anywhere → everything revealed bottoms, nothing enters (CR — reveal until you can't)", () => {
    const s = st([cardOf("Bolt", "Instant"), cardOf("Forest", "Basic Land — Forest")]);
    const after = applyRevealUntilCreatureAttacking(s, { op: "reveal-until-creature-attacking" }, { controller: "user", sourceId: "src", defenderId: "ai" });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.combat.attackers).toHaveLength(0);
    expect(after.players.user.library).toHaveLength(2);
  });
  it("a missing defender enters the creature tapped but never fabricates a combat entry (FN-safe)", () => {
    const s = st([cardOf("Bear", "Creature — Bear")]);
    const after = applyRevealUntilCreatureAttacking(s, { op: "reveal-until-creature-attacking" }, { controller: "user", sourceId: "src" });
    expect(after.players.user.battlefield).toHaveLength(1);
    expect(after.combat.attackers).toHaveLength(0);
  });
});
