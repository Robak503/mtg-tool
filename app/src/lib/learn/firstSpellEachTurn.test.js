/**
 * firstSpellEachTurn.test.js — "Whenever an opponent casts their FIRST noncreature spell EACH TURN" (CR 603.2).
 *
 * Esper Sentinel (rank 76), Shadow in the Warp, The Queen of Dale, The Frightful Four. The generic cast
 * matcher is `$`-anchored on "… spell", so "spell each turn" never matched it — these cards produced NO
 * trigger descriptor at all. The bare form ("their first SPELL each turn" — Pain Distributor, Mind's
 * Dilation) was already handled by the castNth arm; only the filtered form was missing.
 *
 * ⛔ THE GATE IS PER PLAYER, NOT PER SOURCE. This is not the source's once-per-turn latch: with three
 * opponents the ability fires up to three times a turn, once for each opponent's own first matching spell.
 * So it rides on the CASTER's per-turn counters, never on a per-permanent flag.
 *
 * ⚠️ AND THE FIRST ATTEMPT SHIPPED AN OVER-FIRE THAT LOOKED CORRECT. The new `firstEachTurn` field was not
 * in the descriptor whitelist in detectTriggers, so it was silently dropped: the built descriptor kept only
 * its `spellFilter` and the trigger fired on EVERY opponent noncreature spell. `detectTriggers(card)` showed
 * an event and a filter and looked entirely healthy. The ledger already records this exact trap from the
 * batchCommander slice — a new descriptor field goes in the whitelist or it does not exist.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { createGameState, recordSpellCast, resetSpellsCastAllPlayers, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ESPER = {
  name: "Esper Sentinel", type: "Artifact Creature — Human Soldier", mana: "{W}", power: "1", toughness: "1",
  oracle: "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
};
const SHADOW = {
  name: "Shadow in the Warp", type: "Enchantment", mana: "{2}{R}",
  oracle: "Whenever an opponent casts their first noncreature spell each turn, this enchantment deals 2 damage to that player.",
};

describe("detection — the gate survives into the built descriptor", () => {
  it("⭐ the filtered form is detected AND carries firstEachTurn", () => {
    const [d] = detectTriggers(ESPER);
    expect(d.event).toBe("cast");
    expect(d.whose).toBe("opponent");
    expect(d.spellFilter).toBe("noncreature");
    expect(d.firstEachTurn).toBe("noncreature"); // ⛔ the whitelist assertion — dropped, this is an over-fire
  });

  it("⛔ a PLAIN cast trigger carries no gate — the field must not leak onto Rhystic Study", () => {
    const [d] = detectTriggers({ name: "Rhystic Study", type: "Enchantment",
      oracle: "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}." });
    expect(d.event).toBe("cast");
    expect(d.firstEachTurn).toBeUndefined();
  });

  it("⛔ 'first MULTICOLORED spell each turn' stays undetected — no counter exists for it", () => {
    // Zenith Chronicler. Admitting it on the bare/noncreature counters would ignore the word
    // "multicolored" and fire on the wrong spell — a safe FN is the only honest option here.
    expect(detectTriggers({ name: "Zenith Chronicler", type: "Creature — Human",
      oracle: "Whenever a player casts their first multicolored spell each turn, each other player draws a card." })).toEqual([]);
  });
});

describe("⭐ the COUNTER the gate reads (per player, per turn)", () => {
  const st = () => createGameState({ userDeck: [], aiDeck: [] });
  const INSTANT = { name: "Bolt", type: "Instant" };
  const CREATURE = { name: "Bear", type: "Creature — Bear" };

  it("a noncreature cast bumps BOTH counters; a creature cast bumps only the all-spells one", () => {
    let s = recordSpellCast(st(), { playerId: "user", spellCard: INSTANT });
    expect(s.players.user.spellsCastThisTurn).toBe(1);
    expect(s.players.user.noncreatureSpellsCastThisTurn).toBe(1);
    s = recordSpellCast(s, { playerId: "user", spellCard: CREATURE });
    expect(s.players.user.spellsCastThisTurn).toBe(2);
    expect(s.players.user.noncreatureSpellsCastThisTurn).toBe(1); // ⭐ still 1 — the next instant is the SECOND
  });

  it("⛔ the counters are PER PLAYER — one seat's casts never advance another's", () => {
    // The CR-correct heart of this slice: each opponent gets their own first spell.
    let s = recordSpellCast(st(), { playerId: "user", spellCard: INSTANT });
    s = recordSpellCast(s, { playerId: "user", spellCard: INSTANT });
    expect(s.players.ai.noncreatureSpellsCastThisTurn).toBe(0);
  });

  it("both reset for EVERY seat at untap", () => {
    let s = recordSpellCast(st(), { playerId: "user", spellCard: INSTANT });
    s = recordSpellCast(s, { playerId: "ai", spellCard: INSTANT });
    s = resetSpellsCastAllPlayers(s);
    for (const id of ["user", "ai"]) {
      expect(s.players[id].spellsCastThisTurn).toBe(0);
      expect(s.players[id].noncreatureSpellsCastThisTurn).toBe(0);
    }
  });

  it("⛔ an UNTHREADED caller leaves the noncreature counter alone — under-fire, never over-fire", () => {
    // A path that doesn't pass spellCard must not guess. The first-noncreature watchers then simply don't
    // fire for that cast, which is the safe direction (the same call castNotFromHand makes for an
    // unthreaded zone).
    const s = recordSpellCast(st(), { playerId: "user" });
    expect(s.players.user.spellsCastThisTurn).toBe(1);
    expect(s.players.user.noncreatureSpellsCastThisTurn).toBe(0);
  });
});

describe("⭐ RUNTIME — the trigger fires on the FIRST matching spell and not the second", () => {
  // ⚠️ THIS SECTION EXISTS BECAUSE A SABOTAGE CHECK SURVIVED WITHOUT IT. Weakening the gate from `n !== 1` to
  // `n < 1` — i.e. fire on EVERY cast, not just the first — left every descriptor and counter assertion
  // above green. Those test the two halves; nothing tested the join, which is the only place the card's
  // actual behaviour lives. An over-fire is the forbidden direction, so this is the slice's load-bearing
  // assertion.
  const sentinel = () => ({
    id: "es", controller: "user", tapped: false, summoningSick: false, counters: {},
    card: { id: "es", ...ESPER },
  });
  const board = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [sentinel()] } } };
  };
  const INSTANT = { name: "Bolt", type: "Instant" };
  const CREATURE = { name: "Bear", type: "Creature — Bear" };
  // Cast `card` as `caster`, exactly as applyCastSpell does: count first, then check.
  const cast = (state, caster, card) => {
    const counted = recordSpellCast(state, { playerId: caster, spellCard: card });
    return checkCastTriggers(counted, { spellCard: card, casterId: caster, targets: [], castFromZone: "hand" });
  };
  const pending = (s) => (s.pendingTriggers || []).length;

  it("⭐ the opponent's FIRST noncreature spell fires it", () => {
    expect(pending(cast(board(), "ai", INSTANT))).toBe(1);
  });

  it("⛔ their SECOND does NOT — the whole point of the gate", () => {
    const after1 = cast(board(), "ai", INSTANT);
    expect(pending(cast(after1, "ai", INSTANT))).toBe(1); // still 1 — no new trigger enqueued
  });

  it("⭐ a CREATURE spell doesn't consume the turn's first-noncreature slot", () => {
    // The creature bumps only the all-spells counter, so the instant after it is still their FIRST
    // noncreature spell and must fire.
    const afterCreature = cast(board(), "ai", CREATURE);
    expect(pending(afterCreature)).toBe(0);
    expect(pending(cast(afterCreature, "ai", INSTANT))).toBe(1);
  });

  it("⛔ the gate is PER PLAYER — a second opponent's first spell fires it again", () => {
    // With `oncePerTurn`-style latching on the SOURCE this would wrongly stay at 1. CR 603.2: each
    // opponent has their own first spell.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    // turnOrder is what opponentsOf reads; a seat absent from it is nobody's opponent, so the extra
    // players have to be declared there too, not only under `players`.
    const four = { ...s, turnOrder: ["user", "ai", "ai2", "ai3"], players: {
      user: { ...s.players.user, battlefield: [sentinel()] },
      ai: { ...s.players.ai }, ai2: { ...s.players.ai }, ai3: { ...s.players.ai },
    } };
    const after1 = cast(four, "ai", INSTANT);
    expect(pending(after1)).toBe(1);
    expect(pending(cast(after1, "ai2", INSTANT))).toBe(2);
  });

  it("⛔ it never fires on the CONTROLLER's own spell (whose: opponent)", () => {
    expect(pending(cast(board(), "user", INSTANT))).toBe(0);
  });

  it("after the turn resets, the next first spell fires again", () => {
    const after1 = cast(board(), "ai", INSTANT);
    expect(pending(cast(resetSpellsCastAllPlayers(after1), "ai", INSTANT))).toBe(2);
  });
});

describe("tier", () => {
  it("⭐ Esper Sentinel flips body-only → native-trigger (both halves landed)", () => {
    expect(classifyCard(ESPER)).toBe("native-trigger");
  });

  it("Shadow in the Warp — detection is not a flip, and the REASON it parks has now moved", () => {
    // ⚠️ THIS PIN'S FIXTURE WAS A REDUCED CARD (the trigger line alone) chosen because its payoff was
    // UNMODELLED — the rotting-fixture class this project keeps re-learning: a fixture whose property is
    // "not modelled yet" expires the moment the grind does its job. TP-1 modelled "that player" on a cast
    // trigger, so the reduced form now FLIPS. Asserted positively rather than deleted, because that flip is
    // the evidence the slice works on this exact wording.
    expect(detectTriggers(SHADOW)[0]?.firstEachTurn).toBe("noncreature");
    expect(classifyCard(SHADOW)).toMatch(/^native/);
    // …and the pin's real claim survives on the WHOLE printed card, which still parks — now on its
    // cost-reduction line rather than on its trigger payoff. Detection is still not a flip; the blocker
    // simply moved, which is what progress looks like from here.
    const SHADOW_REAL = { ...SHADOW, oracle: `The first creature spell you cast each turn costs {2} less to cast.\n${SHADOW.oracle}` };
    expect(classifyCard(SHADOW_REAL)).toBe("body-only");
  });
});
