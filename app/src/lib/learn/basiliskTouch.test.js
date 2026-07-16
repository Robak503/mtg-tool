/**
 * basiliskTouch.test.js — BLITZ DG-1 (the Deathgazer class): "Whenever this creature blocks or becomes
 * blocked by a NONBLACK creature, destroy that creature AT END OF COMBAT." The IE-1 contact family plus
 * two twists: the nonblack gate on the contact partner (fire-time, layer-aware permanentColors) and the
 * CR 511 delay — the trigger's resolution ENQUEUES a turn-stamped entry on state.endOfCombatEffects
 * (destroy-at-end-of-combat atom), and combatResolution drains it at the end-of-combat boundary (after
 * the regular damage sub-step's lethal SBA + dies look-backs) through the SHARED applyDestroyEffect.
 * Stale entries (an earlier turn's leftovers) are DROPPED unfired — a delayed destroy firing in a later
 * combat would be a forbidden FP. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { detectTriggers, checkBlockTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BASILISK_LINE = "Whenever this creature blocks or becomes blocked by a nonblack creature, destroy that creature at end of combat.";
// The real Deathgazer is a 2/2; the fixture is sized 1/1 so the contact partner SURVIVES the damage
// step (the delayed destroy — not damage — must be what kills it), per the lane's sequencing pin.
const DEATHGAZER = { id: "dg", name: "Deathgazer", type: "Creature — Lizard", mana: "{3}{B}", power: "1", toughness: "1", oracle: BASILISK_LINE };
const SENTINEL = "destroy the triggering creature at end of combat";
const ATOM = { op: "destroy-at-end-of-combat", target: "thatCreature" };

// ─── 1. Detect + parse + classify ────────────────────────────────────────────────
describe("DG-1 — detect + sentinel parse + coverage flips", () => {
  it("the printed line synthesizes ONE coverage descriptor with the delayed-destroy sentinel", () => {
    const ds = detectTriggers(DEATHGAZER).filter((t) => t.event === "blocksOrBlockedByCreature");
    expect(ds).toHaveLength(1);
    expect(ds[0].effectClause).toBe(SENTINEL);
  });
  it("the sentinel parses HIGH to the destroy-at-end-of-combat atom; the immediate sentinel is untouched", () => {
    const p = parseEffectClause(SENTINEL, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([ATOM]);
    // the pre-existing IMMEDIATE form still parses to the plain destroy (no shadowing either way)
    expect(parseEffectClause("destroy the triggering creature", "Creature").atoms).toEqual([{ op: "destroy", target: "thatCreature" }]);
  });
  it("whole-card flips: Deathgazer + Dread Specter → native-trigger; Gorgon Recluse PARKS on its madness line", () => {
    expect(classifyCard(DEATHGAZER)).toBe("native-trigger");
    expect(classifyCard({ name: "Dread Specter", type: "Creature — Specter", mana: "{3}{B}", power: "2", toughness: "2", oracle: BASILISK_LINE })).toBe("native-trigger");
    // Gorgon Recluse carries the SAME trigger plus a Madness line — the permanent classify path has no
    // madness handling (a madness-only creature is body-only), so the whole card stays parked (CREED).
    expect(classifyCard({ name: "Gorgon Recluse", type: "Creature — Gorgon", mana: "{3}{B}", power: "2", toughness: "2",
      oracle: BASILISK_LINE + "\nMadness {B}{B} (If you discard this card, discard it into exile. When you do, cast it for its madness cost or put it into your graveyard.)" })).toBe("body-only");
  });
  it("FN guards: the non-Wall / bare / color-pair siblings never synthesize and stay parked", () => {
    const cockatrice = { name: "Cockatrice", type: "Creature — Cockatrice", power: "2", toughness: "4",
      oracle: "Flying\nWhenever this creature blocks or becomes blocked by a non-Wall creature, destroy that creature at end of combat." };
    const tangleAsp = { name: "Tangle Asp", type: "Creature — Snake", power: "1", toughness: "2",
      oracle: "Whenever this creature blocks or becomes blocked by a creature, destroy that creature at end of combat." };
    const abomination = { name: "Abomination", type: "Creature — Horror", power: "2", toughness: "6",
      oracle: "Whenever this creature blocks or becomes blocked by a green or white creature, destroy that creature at end of combat." };
    for (const card of [cockatrice, tangleAsp, abomination]) {
      expect(detectTriggers(card).filter((t) => t.event === "blocksOrBlockedByCreature")).toHaveLength(0);
      expect(classifyCard(card)).not.toMatch(/^native/);
    }
  });
});

// ─── 2. Fire time — the nonblack gate + the referent direction ──────────────────
describe("DG-1 — fire time: nonblack partners only, the PARTNER as the referent", () => {
  function board(partnerCard) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const dg = createPermanent({ id: "dg", card: DEATHGAZER, controller: "user", summoningSick: false });
    const partner = createPermanent({ id: "pt", card: partnerCard, controller: "ai1", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [dg] }, ai1: { ...s.players.ai1, battlefield: [partner] } } };
  }
  const GREEN_BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
  const BLACK_KNIGHT = { name: "Black Knight", type: "Creature — Human Knight", mana: "{B}{B}", power: "2", toughness: "2", oracle: "" };

  it("becomes blocked by a nonblack creature → fires ONCE with the BLOCKER as the triggering permanent", () => {
    const s = board(GREEN_BEAR);
    const fired = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "dg", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "pt", attackerId: "dg" }] } });
    const dgT = (fired.pendingTriggers || []).filter((t) => t.descriptor?.sourceText === "blocks-or-blocked nonblack delayed destroy");
    expect(dgT).toHaveLength(1);
    expect(dgT[0].context.triggeringPermanentId).toBe("pt"); // the PARTNER, never the Deathgazer itself
  });
  it("BLOCKS a nonblack creature (the other direction) → fires with the ATTACKER as the triggering permanent", () => {
    const s = board(GREEN_BEAR);
    const fired = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "pt", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "dg", attackerId: "pt" }] } });
    const dgT = (fired.pendingTriggers || []).filter((t) => t.descriptor?.sourceText === "blocks-or-blocked nonblack delayed destroy");
    expect(dgT).toHaveLength(1);
    expect(dgT[0].context.triggeringPermanentId).toBe("pt");
  });
  it("a BLACK contact partner NEVER fires the trigger (the color gate, layer-aware permanentColors)", () => {
    const s = board(BLACK_KNIGHT);
    const fired = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "dg", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "pt", attackerId: "dg" }] } });
    expect((fired.pendingTriggers || []).filter((t) => t.descriptor?.sourceText === "blocks-or-blocked nonblack delayed destroy")).toHaveLength(0);
  });
});

// ─── 3. The runtime loop — enqueue at resolution, destroy at end of combat ───────
describe("DG-1 — the delayed destroy fires AFTER combat damage, never before", () => {
  function combatBoard() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const dg = createPermanent({ id: "dg", card: DEATHGAZER, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "br", card: { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [dg] }, ai1: { ...s.players.ai1, battlefield: [bear] } },
      combat: { attackers: [{ permanentId: "dg", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "br", attackerId: "dg" }] } };
    return s;
  }
  // The real flush parses the descriptor's effectClause and runs it with the pending trigger's context;
  // mirror that here (the IE-1 harness idiom) so the enqueue rides the genuine parse → resolve path.
  function resolvePendingBasilisk(s) {
    const fired = checkBlockTriggers(s);
    const t = (fired.pendingTriggers || []).find((x) => x.descriptor?.sourceText === "blocks-or-blocked nonblack delayed destroy");
    expect(t).toBeTruthy();
    const program = parseEffectClause(t.descriptor.effectClause, "Creature");
    return runEffectProgram(s, { source: { name: "Deathgazer" }, payload: { params: { program, controller: "user", targets: [], sourceId: "dg", context: t.context } } });
  }

  it("the full loop: 2/2 bear blocks the 1/1 Deathgazer → bear SURVIVES damage, dies at end of combat (source already dead)", () => {
    let s = combatBoard();
    s = resolvePendingBasilisk(s);
    // Enqueued, turn-stamped, bear untouched.
    expect(s.endOfCombatEffects).toHaveLength(1);
    expect(s.endOfCombatEffects[0]).toMatchObject({ op: "destroy", permanentId: "br", turn: s.turn });
    expect(findPermanent(s, "br")).toBeTruthy();
    // First-strike sub-step: nobody has first strike — and the queue MUST survive it (CR 511 is after ALL of 510).
    s = resolveCombatDamage(s, { firstStrikeStep: true });
    expect(s.endOfCombatEffects).toHaveLength(1);
    // Regular damage: bear takes 1 (survives, toughness 2), Deathgazer takes 2 (dies). THEN the drain
    // destroys the bear — the delayed destroy outlives its source (the trigger already resolved).
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "dg")).toBeFalsy();                          // died to combat damage
    expect(findPermanent(s, "br")).toBeFalsy();                          // survived damage, destroyed at end of combat
    expect(s.players.ai1.graveyard.some((c) => c.name === "Grizzly Bears")).toBe(true);
    expect(s.endOfCombatEffects).toHaveLength(0);                        // drained
    expect((s.log || []).some((e) => e.kind === "end-of-combat-destroy" && e.target === "br")).toBe(true);
  });

  it("the shared destroy path: an INDESTRUCTIBLE partner survives the delayed destroy (CR 702.12b)", () => {
    let s = combatBoard();
    const bf = s.players.ai1.battlefield.map((p) => p.id === "br" ? { ...p, card: { ...p.card, name: "Darksteel Sentinel", oracle: "Indestructible" } } : p);
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: bf } } };
    s = resolvePendingBasilisk(s);
    expect(s.endOfCombatEffects).toHaveLength(1);
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "br")).toBeTruthy();                         // indestructible → destroy prevented
    expect(s.endOfCombatEffects).toHaveLength(0);                        // still drained (consumed, not refired)
  });

  it("a fogged combat still destroys at end of combat (CR 615.6 prevents DAMAGE, not the delayed destroy)", () => {
    let s = combatBoard();
    s = resolvePendingBasilisk(s);
    s = { ...s, preventCombatDamageTurn: s.turn };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(findPermanent(s, "dg")).toBeTruthy();                         // no combat damage anywhere
    expect(findPermanent(s, "br")).toBeFalsy();                          // the delayed destroy still fired
    expect(s.endOfCombatEffects).toHaveLength(0);
  });

  it("STALE-QUEUE guard: an earlier turn's entry is DROPPED unfired (never a next-combat kill)", () => {
    let s = combatBoard();
    s = { ...s, endOfCombatEffects: [{ op: "destroy", permanentId: "br", turn: s.turn - 1, sourceCardName: "Deathgazer" }] };
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    // Combat damage ran (bear takes 1, survives; Deathgazer dies) but the stale destroy never fired.
    expect(findPermanent(s, "br")).toBeTruthy();
    expect(s.endOfCombatEffects).toHaveLength(0);                        // dropped, queue emptied
    expect((s.log || []).some((e) => e.kind === "end-of-combat-destroy")).toBe(false);
  });

  it("a partner that already left is a clean skip (nothing to destroy, no throw)", () => {
    let s = combatBoard();
    s = resolvePendingBasilisk(s);
    s = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [] } } }; // bear vanished pre-drain
    s = resolveCombatDamage(s, { firstStrikeStep: false });
    expect(s.endOfCombatEffects).toHaveLength(0);
  });
});
