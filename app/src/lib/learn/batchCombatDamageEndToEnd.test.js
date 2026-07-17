/**
 * batchCombatDamageEndToEnd.test.js — the BATCH combat-damage trigger family (CR 509 batch / 510.4),
 * driven END-TO-END through the REAL combat pipeline (resolveCombatDamage → the combat-damage-player
 * event → checkBatchCombatDamageTriggers → flushTriggers → the payoff resolver). Two seams the family
 * files pin only via DIRECT checkBatchCombatDamageTriggers calls are pinned here through actual combat:
 *
 *   1. NEGATED-SUBTYPE batch (BLITZ BC-1 — Keeper of Fables, "one or more non-Human creatures you control
 *      deal combat damage to a player, draw a card"). The subject filter is a creature type NOT to match,
 *      gated to the closed CR_CREATURE_TYPES vocabulary (a supertype/card-type negation — "non-legendary",
 *      "non-artifact" — never mints a vacuously-true filter) and changeling-aware at the dealer gate (a
 *      changeling IS every creature type, CR 702.73a, so "non-Human" EXCLUDES it).
 *
 *   2. Quartzwood Crasher's scaled token ("create an X/X … token with trample, where X is the amount of
 *      damage those creatures dealt to that player") read off REAL trample assignment — the token scales on
 *      the combat damage that actually reached the PLAYER (the trample EXCESS), never the raw power, and a
 *      trample dealer whose damage is fully absorbed by a blocker (combat damage to a CREATURE, none to the
 *      player) does NOT fire the batch at all.
 *
 * CREED: false-negative SAFE, false-positive FORBIDDEN. A wrong token size, or a fire on a non-matching
 * dealer / on creature-only damage, is the forbidden over-fire.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── shared harness (mirrors combatDamageTrigger.test.js so the batch family tests share a shape) ──
function st(userBf, aiBf = [], attackers = [], blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
  };
}
function resolveAll(s) { let cur = s, g = 0; while ((cur.stack || []).length && g++ < 25) cur = resolveTopOfStack(cur); return cur; }
const withLibrary = (s, cards) => ({ ...s, players: { ...s.players, user: { ...s.players.user, library: cards } } });
const drewCard = (s, id) => s.players.user.hand.some((c) => c.id === id);
const perm = (id, card, over = {}) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false, ...over });
const wall = (id, toughness = 6) => createPermanent({ id, card: { id: `c-${id}`, name: "Wall", type: "Creature — Wall", power: 0, toughness, oracle: "" }, controller: "ai", summoningSick: false });
const attack = (permanentId) => ({ permanentId, attackingPlayer: "user", defender: "ai" });
const block = (blockerId, attackerId) => ({ blockerId, blockingPlayer: "ai", attackerId });
const mintedTokens = (s) => s.players.user.battlefield.filter((p) => p.card?.token);

// ===========================================================================================
// PART A — NEGATED-SUBTYPE batch (Keeper of Fables): "one or more non-Human creatures … , draw a card"
// ===========================================================================================
describe("NEGATED-SUBTYPE batch — Keeper of Fables (BLITZ BC-1)", () => {
  // Probed from the bundled oracle (cardIndex lookupCard), never memory.
  const KEEPER_ORACLE = "Whenever one or more non-Human creatures you control deal combat damage to a player, draw a card.";
  const KEEPER = { name: "Keeper of Fables", type: "Creature — Cat", mana: "{3}{G}{G}", power: "4", toughness: "5", oracle: KEEPER_ORACLE };

  describe("detection + classification", () => {
    it("Keeper's real oracle → a combatDamageBatch descriptor with batchNotSubtype:'human', routing natively", () => {
      const d = detectTriggers(KEEPER);
      expect(d).toHaveLength(1);
      expect(d[0]).toMatchObject({ event: "combatDamageBatch", scope: "you", batchNotSubtype: "human" });
      expect(d[0].perDefender).toBeFalsy();          // a plain "draw a card" payoff — no per-defender total needed
      expect(!!triggerRoutesNatively(d[0])).toBe(true);
      expect(classifyCard(KEEPER)).toBe("native-trigger");
    });

    it("CREED closed-vocab guard: a supertype / card-type negation never mints a (vacuous) filter → body-only", () => {
      // permanentTypes' subtypes never carry a supertype/card-type, so negating one would match EVERY
      // creature — the forbidden over-fire. Gating to CR_CREATURE_TYPES keeps each of these UNDETECTED.
      const mk = (subject) => ({ name: "T", type: "Creature — Beast", oracle: `Whenever one or more ${subject} you control deal combat damage to a player, draw a card.` });
      for (const subject of ["non-legendary creatures", "non-artifact creatures", "non-token creatures", "nonland creatures", "non-enchantment creatures"]) {
        expect(detectTriggers(mk(subject))).toHaveLength(0);
        expect(classifyCard(mk(subject))).toBe("body-only");
      }
    });

    it("a REAL creature type after 'non-' is admitted (non-Elf, non-Zombie) — the filter generalizes correctly", () => {
      const mk = (subject) => ({ name: "T", type: "Creature — Beast", oracle: `Whenever one or more ${subject} you control deal combat damage to a player, draw a card.` });
      expect(detectTriggers(mk("non-Elf creatures"))[0]).toMatchObject({ event: "combatDamageBatch", batchNotSubtype: "elf" });
      expect(detectTriggers(mk("non-Zombie creatures"))[0]).toMatchObject({ event: "combatDamageBatch", batchNotSubtype: "zombie" });
    });
  });

  describe("runtime through resolveCombatDamage", () => {
    const keeperPerm = (id) => perm(id, { name: "Keeper of Fables", type: "Creature — Cat", power: 4, toughness: 5, oracle: KEEPER_ORACLE });

    it("a NON-Human dealer connecting → the batch fires once and draws (single-creature connect)", () => {
      const beast = perm("bs", { name: "Beast", type: "Creature — Beast", power: 3, toughness: 3, oracle: "" });
      let s = st([keeperPerm("kf"), beast], [], [attack("bs")], []);
      s = withLibrary(s, [{ id: "L1", name: "Drawn", type: "Instant", oracle: "" }]);
      s = resolveCombatDamage(s);
      expect(s.players.ai.life).toBe(37);            // 3 combat damage reached the player → condition met
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(drewCard(s, "L1")).toBe(true);
    });

    it("CREED anti-FP: only a HUMAN dealer connects → the 'non-Human' batch does NOT fire (no draw)", () => {
      const human = perm("hu", { name: "Soldier", type: "Creature — Human Soldier", power: 3, toughness: 3, oracle: "" });
      let s = st([keeperPerm("kf"), human], [], [attack("hu")], []);
      s = withLibrary(s, [{ id: "L2", name: "Nope", type: "Instant", oracle: "" }]);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(drewCard(s, "L2")).toBe(false);         // a Human dealt the damage → the non-Human batch stays silent
    });

    it("CREED changeling gate: a changeling dealer is EVERY type (CR 702.73a) → IS a Human → does NOT fire", () => {
      const changeling = perm("ch", { name: "Mistform", type: "Creature — Shapeshifter", power: 3, toughness: 3, oracle: "Changeling (This card is every creature type.)" });
      let s = st([keeperPerm("kf"), changeling], [], [attack("ch")], []);
      s = withLibrary(s, [{ id: "L3", name: "Nope", type: "Instant", oracle: "" }]);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      expect(drewCard(s, "L3")).toBe(false);         // a changeling is a Human too → excluded from "non-Human"
    });

    it("a non-Human AND a Human both connect → fires exactly once (batch, and the non-Human satisfies the filter)", () => {
      const beast = perm("bs", { name: "Beast", type: "Creature — Beast", power: 2, toughness: 2, oracle: "" });
      const human = perm("hu", { name: "Soldier", type: "Creature — Human Soldier", power: 2, toughness: 2, oracle: "" });
      let s = st([keeperPerm("kf"), beast, human], [], [attack("bs"), attack("hu")], []);
      s = withLibrary(s, [{ id: "A", type: "Instant", oracle: "" }, { id: "B", type: "Instant", oracle: "" }]);
      s = resolveCombatDamage(s);
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
      // exactly ONE card drawn (a batch fires once per damaged player, not once per matching dealer)
      expect(s.players.user.hand.filter((c) => c.id === "A" || c.id === "B")).toHaveLength(1);
    });
  });
});

// ===========================================================================================
// PART B — Quartzwood Crasher's scaled token, read off REAL trample assignment
// ===========================================================================================
describe("WITH-KEYWORD scaled token — Quartzwood Crasher end-to-end (resolveCombatDamage)", () => {
  const QW_ORACLE = "Trample\nWhenever one or more creatures you control with trample deal combat damage to a player, create an X/X green Dinosaur Beast creature token with trample, where X is the amount of damage those creatures dealt to that player.";
  const quartzwood = (id) => perm(id, { name: "Quartzwood Crasher", type: "Creature — Dinosaur Beast", power: 6, toughness: 6, oracle: QW_ORACLE });
  const trampler = (id, power, toughness = 3) => perm(id, { name: id, type: "Creature — Beast", power, toughness, oracle: "Trample" });

  it("a single trampler connecting for its full power → an X/X token sized to that damage", () => {
    let s = st([quartzwood("qw"), trampler("t1", 5)], [], [attack("t1")], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(35);              // 5 to the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const toks = mintedTokens(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.power).toBe(5);
    expect(toks[0].card.toughness).toBe(5);
  });

  it("trample OVER a blocker: the token reads the EXCESS that reached the player, not the raw power", () => {
    // a 6-power trampler into a 0/2 wall assigns 2 (lethal) to the wall, spills 4 to the player → token 4/4.
    let s = st([quartzwood("qw"), trampler("t1", 6)], [wall("w", 2)], [attack("t1")], [block("w", "t1")]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(36);              // only the 4-point trample excess reached the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const toks = mintedTokens(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.power).toBe(4);              // NOT 6 — the amount dealt to the PLAYER
  });

  it("combat damage to a CREATURE only (fully absorbed, no trample spill) → the batch does NOT fire", () => {
    // a 2-power trampler fully absorbed by a 0/4 wall spills nothing → no combat-damage-player event → no token.
    let s = st([quartzwood("qw"), trampler("t1", 2)], [wall("w", 4)], [attack("t1")], [block("w", "t1")]);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(40);              // nothing reached the player
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(mintedTokens(s)).toHaveLength(0);         // damage to a creature never fires the to-a-player batch
  });

  it("two tramplers hitting the SAME player → ONE token summing both (once per damaged player, correct total)", () => {
    let s = st([quartzwood("qw"), trampler("t1", 4), trampler("t2", 3)], [], [attack("t1"), attack("t2")], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(33);              // 4 + 3
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    const toks = mintedTokens(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.power).toBe(7);              // pooled per (controller, defender): 4 + 3
  });
});
