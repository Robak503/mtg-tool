/**
 * VIHAAN-TREASURE — the Vihaan, Goldwaker (Mardu Treasure-aristocrats) coverage slice. THREE thin, reusable
 * engine fixes, each riding the already-shipped token + trigger + cost machinery (no new atom):
 *
 *   1. NAMED-TOKEN "you create" STRIP (effects/atoms/tokens.js, createNamedTokenClauseParser) — a leading
 *      redundant "you " subject ("…you create a Treasure token for each artifact that player controls",
 *      Cavern-Hoard Dragon's combat-damage trigger) is stripped so the for-each named-token anchors bind,
 *      mirroring what createTokenClauseParser already does for vanilla creature tokens. CR 111.1 — the token's
 *      controller is ALWAYS the effect's controller, so "you create" ≡ "create" (a strict promotion).
 *
 *   2. SELF-COST-REDUCTION strip in classifyCard (coverage.js) — "This spell costs {X} less to cast, where X
 *      is …" (CR 601.2f) is a CAST-cost modifier the runtime applies regardless of tier (selfCostReductionMetric
 *      → the legalChoices cost path), EXACTLY like the Affinity/Convoke cost-only keywords already stripped. The
 *      modeled sentence is stripped so a permanent whose only other text is modeled (Cavern-Hoard = Flying,
 *      trample, haste + the combat-damage Treasure trigger) reaches the trigger gate on its bare body.
 *
 *   3. FIRST-WORD SELF-REF (triggers.js, classifyCondition) — a LEGENDARY with a space-separated, NO-comma name
 *      ("Smaug the Magnificent", "Beregond of the Guard") self-refers by its FIRST word ("Whenever Smaug
 *      attacks, …"). The comma-only short-name branch couldn't see it, so the self-trigger went UNDETECTED →
 *      Arbiter. Now recognized, gated tightly (legendary, ≥4 chars, not a leading article, word-bounded).
 *
 * CREED: each fix is a PROMOTION (it can only let an already-near-native card parse) and is whole-card —
 * an unmodeled residue (Kellogg's gain-control) keeps the card body-only. (Grim Hireling's Sacrifice-X-Treasures
 * activated is now modeled by the γ1e sac-X subsystem — see sacXActivated.test.js — so the former pin migrated to
 * a native-mixed assertion below.) Anti-FP pins below prove the boundaries hold. Full-corpus flip-diff: 6 cards
 * flip to native (the 2 Vihaan targets + 4 correct collateral), ZERO regressions in either direction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const treasureCount = (s, pid) => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card?.type || "")).length;
const isHigh = (clause) => programConfidence(parseEffectClause(clause, "Instant")) === "high";

// Real bundled oracle text (verified against the engine's card index).
const CAVERN = {
  name: "Cavern-Hoard Dragon", type: "Creature — Dragon", mana: "{7}{R}{R}", power: 7, toughness: 7,
  oracle: "This spell costs {X} less to cast, where X is the greatest number of artifacts an opponent controls.\nFlying, trample, haste\nWhenever this creature deals combat damage to a player, you create a Treasure token for each artifact that player controls.",
};
const SMAUG = {
  name: "Smaug the Magnificent", type: "Legendary Creature — Dragon", mana: "{2}{R}{R}", power: 5, toughness: 5,
  oracle: "Flying, haste\nWhenever Smaug attacks, he deals damage equal to the number of Treasures you control to any target.\nAt the beginning of your upkeep, create a Treasure token.",
};

// ─── FIX 1: NAMED-TOKEN "you create" strip ──────────────────────────────────────────────────────────────
describe("NAMED-TOKEN — a leading 'you create' parses like 'create' (CR 111.1)", () => {
  it("'you create a Treasure token for each artifact that player controls' parses HIGH (was LOW)", () => {
    expect(isHigh("you create a treasure token for each artifact that player controls")).toBe(true);
    // the bare form already parsed — proving this is a pure promotion, not a new shape.
    expect(isHigh("create a treasure token for each artifact that player controls")).toBe(true);
  });
  it("the for-each count is TARGET-scoped (the damaged player), not the controller (CR-correct)", () => {
    const atom = parseEffectClause("you create a treasure token for each artifact that player controls", "Instant").atoms[0];
    expect(atom).toMatchObject({ op: "create-named-token", token: "treasure" });
    expect(atom.countFor).toMatchObject({ cardType: "artifact", who: "target" });
  });
});

// ─── FIX 2 + 1 together: Cavern-Hoard Dragon ────────────────────────────────────────────────────────────
describe("Cavern-Hoard Dragon — classification + runtime (FIX 1 strip + FIX 2 self-cost strip)", () => {
  it("classifies native-trigger with the real bundled oracle", () => {
    expect(classifyCard(CAVERN)).toBe("native-trigger");
  });
  it("the combat-damage trigger is detected (combatDamageToPlayer/self)", () => {
    expect(detectTriggers(CAVERN).map((t) => t.event)).toEqual(["combatDamageToPlayer"]);
  });
  it("RUNTIME — deals combat damage → creates a Treasure for EACH artifact the DAMAGED player controls", () => {
    const dragon = createPermanent({ id: "drg", card: { ...CAVERN, id: "c-drg" }, controller: "user", summoningSick: false });
    const art = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Rock", type: "Artifact", oracle: "" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "drg", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [dragon], life: 40 }, ai: { ...s.players.ai, battlefield: [art("a1"), art("a2"), art("a3")], life: 40 } } };
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(33); // 7 trample damage landed
    s = flush(s);
    expect(treasureCount(s, "user")).toBe(3); // one Treasure per AI artifact (the damaged player)
  });
  it("CREED — a damaged player controlling ZERO artifacts makes ZERO Treasures (no fabricated count)", () => {
    const dragon = createPermanent({ id: "drg", card: { ...CAVERN, id: "c-drg" }, controller: "user", summoningSick: false });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, step: "combat-damage", phase: "combat",
      combat: { attackers: [{ permanentId: "drg", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [dragon], life: 40 }, ai: { ...s.players.ai, battlefield: [], life: 40 } } };
    s = flush(resolveCombatDamage(s));
    expect(treasureCount(s, "user")).toBe(0); // CR 107.3 — a 0 count mints nothing
  });
});

// ─── FIX 3: FIRST-WORD SELF-REF — Smaug ─────────────────────────────────────────────────────────────────
describe("FIRST-WORD SELF-REF — a legendary '<First> the <Epithet>' self-refers by its first word", () => {
  it("'Whenever Smaug attacks, …' is detected as a self-trigger (name = 'Smaug the Magnificent')", () => {
    const tr = detectTriggers(SMAUG);
    expect(tr.map((t) => t.event).sort()).toEqual(["attacks", "upkeep"]);
    expect(tr.find((t) => t.event === "attacks")).toMatchObject({ scope: "self" });
  });
  it("Smaug the Magnificent classifies native-trigger (both triggers modeled)", () => {
    expect(classifyCard(SMAUG)).toBe("native-trigger");
  });
  it("RUNTIME — Smaug attacks with 2 Treasures out → deals 2 damage to the defending player (dynamic count)", () => {
    const smaug = createPermanent({ id: "sm", card: { ...SMAUG, id: "c-sm" }, controller: "user", summoningSick: false });
    const treas = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color.", token: true }, controller: "user" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, step: "declare-attackers", phase: "combat", activePlayer: "user", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "sm", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [smaug, treas("t1"), treas("t2")], life: 40 }, ai: { ...s.players.ai, battlefield: [], life: 40 } } };
    s = checkAttackTriggers(s, [{ permanentId: "sm", attackingPlayer: "user", defender: "ai" }]);
    expect((s.pendingTriggers || []).some((t) => t.event === "attacks")).toBe(true);
    s = flush(s);
    expect(s.players.ai.life).toBe(38); // 2 damage = the number of Treasures controlled
  });
  it("CREED — 'The Ur-Dragon' style (first word is the stopword 'the') is NOT mis-recognized by first-word", () => {
    // The leading "the" must never be treated as a self-name (its self-ref is the full name). A trigger that
    // names ONLY "the" as a subject would never be a real self-trigger — guard holds. (Bare unrelated text.)
    const tr = detectTriggers({ name: "The Ur-Dragon", type: "Legendary Creature — Dragon", oracle: "Whenever the chosen creature attacks, draw a card." });
    // "the chosen creature attacks" is NOT a self-trigger for The Ur-Dragon (it's about another creature) —
    // first-word "the" is a stopword, so no spurious self attacks-trigger is fabricated.
    expect(tr.some((t) => t.event === "attacks" && t.scope === "self")).toBe(false);
  });
});

// ─── COLLATERAL — correct flips from the same fixes (audited against real oracle) ────────────────────────
describe("VIHAAN-TREASURE — collateral native flips are correct (real oracle)", () => {
  it("Beregond of the Guard (first-word self-ref → subtype-ETB) is native-trigger", () => {
    // "Beregond" (from "Beregond of the Guard") is a Human; the union "Beregond or another Human you control
    // enters" = "a Human you control enters" (subtypeYouControl), exactly the Pantlaza carve-out.
    expect(classifyCard({ name: "Beregond of the Guard", type: "Legendary Creature — Human Soldier", mana: "{3}{W}", oracle: "Whenever Beregond or another Human you control enters, creatures you control get +1/+1 and gain vigilance until end of turn." })).toBe("native-trigger");
  });
  it("Monologue Tax (you-create on a cast-Nth trigger) is native-trigger", () => {
    expect(classifyCard({ name: "Monologue Tax", type: "Enchantment", mana: "{2}{W}", oracle: "Whenever an opponent casts their second spell each turn, you create a Treasure token." })).toBe("native-trigger");
  });
  it("Hornswoggle + Flick a Coin (you-create Treasure spells) are native-spell", () => {
    expect(classifyCard({ name: "Hornswoggle", type: "Instant", mana: "{2}{U}", oracle: "Counter target creature spell. You create a Treasure token." })).toBe("native-spell");
    expect(classifyCard({ name: "Flick a Coin", type: "Instant", mana: "{2}{R}", oracle: "Flick a Coin deals 1 damage to any target. You create a Treasure token.\nDraw a card." })).toBe("native-spell");
  });
});

// ─── CREED — the Vihaan cards that must STAY body-only (real unmodeled subsystems) ───────────────────────
describe("VIHAAN-TREASURE — CREED: unmodeled cards stay body-only (no over-claim)", () => {
  it("Grim Hireling is now native-mixed — the γ1e sac-X-Treasures cost + negative X-pump is modeled (see sacXActivated.test.js)", () => {
    expect(classifyCard({ name: "Grim Hireling", type: "Creature — Tiefling Rogue", mana: "{3}{B}", oracle: "Whenever one or more creatures you control deal combat damage to a player, create two Treasure tokens.\n{B}, Sacrifice X Treasures: Target creature gets -X/-X until end of turn. Activate only as a sorcery." })).toBe("native-mixed");
  });
  it("Kellogg, Dangerous Mind stays body-only — 'Sacrifice five Treasures: Gain control …' is unmodeled", () => {
    expect(classifyCard({ name: "Kellogg, Dangerous Mind", type: "Legendary Creature — Human Mercenary", mana: "{1}{B}{R}", oracle: "First strike, haste\nWhenever Kellogg attacks, create a Treasure token.\nSacrifice five Treasures: Gain control of target creature for as long as you control Kellogg. Activate only as a sorcery." })).toBe("body-only");
  });
  it("Professional Face-Breaker stays body-only — 'Sacrifice a Treasure: Exile top, may play' is unmodeled", () => {
    expect(classifyCard({ name: "Professional Face-Breaker", type: "Creature — Human Warrior", mana: "{2}{R}", oracle: "Menace\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nSacrifice a Treasure: Exile the top card of your library. You may play that card this turn." })).toBe("body-only");
  });
  it("Cruel Celebrant is now native — the creature-OR-PLANESWALKER death-drain union is modeled (PW deaths fed to the dies dispatch)", () => {
    expect(classifyCard({ name: "Cruel Celebrant", type: "Creature — Vampire", mana: "{W}{B}", oracle: "Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life." })).toMatch(/^native/);
  });
});
