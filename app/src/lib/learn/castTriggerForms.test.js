/**
 * castTriggerForms.test.js — WAVE-3b CAST-TRIGGER-PAYOFF. Extends the cast-trigger machinery beyond the
 * single bare word / single subtype to a TYPED LIST ("A, B, or C"), MANA-VALUE-THRESHOLD, X-SPELL, and the
 * generalized Nth-spell-per-turn (first / third + opponent) forms. Covers detection (anchored — riders stay
 * UNDETECTED), spellMatchesFilter matching, the off-by-one-safe Nth fire (whose you / opponent), and that a
 * simple payoff routes HIGH while a complex one (Rashmi / Zaxara core) stays non-native (a SAFE
 * false-negative — never a fabricated effect).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { permanentTriggersCovered } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const castDescriptors = (oracle) =>
  detectTriggers({ name: "X", type: "Creature", oracle }).filter((d) => d.event === "cast");
const nthDescriptors = (oracle) =>
  detectTriggers({ name: "X", type: "Creature", oracle }).filter((d) => d.event === "castNth");

// ─── Detection — typed-list / mana-value / X / Nth ───────────────────────────────

describe("typed-list cast filter", () => {
  it("detects an 'A, B, or C' type list without truncating it (Sram)", () => {
    expect(castDescriptors("Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card.")[0])
      .toMatchObject({ whose: "you", spellFilter: { kind: "typed", words: ["Aura", "Equipment", "Vehicle"] } });
  });
  it("a denylisted word in the list (color / category) rejects the whole filter", () => {
    expect(castDescriptors("Whenever you cast a red or blue spell, draw a card.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a historic or legendary spell, draw a card.")).toHaveLength(0);
  });
  it("(unchanged) a single subtype still serializes as subtype:Name", () => {
    expect(castDescriptors("Whenever you cast a Dragon spell, draw a card.")[0])
      .toMatchObject({ spellFilter: "subtype:Dragon" });
  });
});

describe("X-spell + mana-value-threshold cast filters", () => {
  it("detects the X-spell form", () => {
    expect(castDescriptors("Whenever you cast a spell with {X} in its mana cost, draw a card.")[0])
      .toMatchObject({ whose: "you", spellFilter: { kind: "hasX" } });
  });
  it("detects the mana-value threshold form (greater / less)", () => {
    expect(castDescriptors("Whenever you cast a spell with mana value 5 or greater, draw a card.")[0])
      .toMatchObject({ spellFilter: { kind: "manaValue", op: "gte", value: 5 } });
    expect(castDescriptors("Whenever an opponent casts a spell with mana value 3 or less, you draw a card.")[0])
      .toMatchObject({ whose: "opponent", spellFilter: { kind: "manaValue", op: "lte", value: 3 } });
  });
  it("a different 'with …' restriction is still rejected (the exemption is narrow)", () => {
    expect(castDescriptors("Whenever you cast a spell with flashback, draw a card.")).toHaveLength(0);
  });
});

describe("Nth-spell-per-turn detection (generalized castSecond)", () => {
  it("detects first / third + you / opponent forms with the right nth", () => {
    expect(nthDescriptors("Whenever you cast your first spell each turn, draw a card.")[0]).toMatchObject({ whose: "you", nth: 1 });
    expect(nthDescriptors("Whenever you cast your third spell each turn, draw a card.")[0]).toMatchObject({ whose: "you", nth: 3 });
    expect(nthDescriptors("Whenever an opponent casts their first spell each turn, you draw a card.")[0]).toMatchObject({ whose: "opponent", nth: 1 });
  });
  it("does NOT detect a TYPED-Nth condition (the type word breaks the bare anchor)", () => {
    expect(nthDescriptors("Whenever an opponent casts their first noncreature spell each turn, draw a card.")).toHaveLength(0);
  });
});

// ─── CREED guards (no over-fire / no false flip) ─────────────────────────────────

describe("CREED guards — riders / unmodeled filters stay UNDETECTED", () => {
  it("'of the chosen type' / 'from your graveyard' / color stay undetected", () => {
    expect(castDescriptors("Whenever you cast a spell of the chosen type, put a charge counter on this artifact.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a Dragon creature spell from your graveyard, it gains haste.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a red spell, draw a card.")).toHaveLength(0);
  });
  it("the bare any / instant-sorcery / noncreature filters are unchanged (no regression)", () => {
    expect(castDescriptors("Whenever you cast a spell, return target permanent to its owner's hand.")[0]).toMatchObject({ whose: "you", spellFilter: "any" });
    expect(castDescriptors("Whenever a player casts a spell, draw a card.")[0]).toMatchObject({ whose: "any", spellFilter: "any" });
    expect(castDescriptors("Whenever you cast a noncreature spell, you gain 1 life.")[0]).toMatchObject({ spellFilter: "noncreature" });
  });
});

// ─── Matching (checkCastTriggers) ────────────────────────────────────────────────

function creature(name, oracle) {
  return { id: `card-${name}`, name, type: "Creature — Wizard", power: 1, toughness: 1, oracle };
}
function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}
const pending = (st) => st.pendingTriggers || [];

describe("checkCastTriggers — new filters match the right spells", () => {
  it("typed-list: fires on an Equipment cast, not on a plain creature", () => {
    const sram = createPermanent({ id: "p-sram", card: creature("Sram", "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card."), controller: "user", summoningSick: false });
    const s = stateWith([sram]);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Sword", type: "Artifact — Equipment" }, casterId: "user" }))).toHaveLength(1);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Bear", type: "Creature" }, casterId: "user" }))).toHaveLength(0);
  });

  it("X-spell: fires only when the cast spell's mana cost has {X}", () => {
    const w = createPermanent({ id: "p-x", card: creature("XWatch", "Whenever you cast a spell with {X} in its mana cost, draw a card."), controller: "user", summoningSick: false });
    const s = stateWith([w]);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Hydra", mana: "{X}{G}", type: "Creature" }, casterId: "user" }))).toHaveLength(1);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Bolt", mana: "{R}", type: "Instant" }, casterId: "user" }))).toHaveLength(0);
  });

  it("mana-value: gte / lte compare the cast spell's cmc", () => {
    const big = createPermanent({ id: "p-mv", card: creature("BigWatch", "Whenever you cast a spell with mana value 5 or greater, draw a card."), controller: "user", summoningSick: false });
    const s = stateWith([big]);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Titan", cmc: 6, type: "Creature" }, casterId: "user" }))).toHaveLength(1);
    expect(pending(checkCastTriggers(s, { spellCard: { name: "Bolt", cmc: 1, type: "Instant" }, casterId: "user" }))).toHaveLength(0);
  });
});

describe("an opponent's first-spell watcher fires on the opponent's cast, not the controller's", () => {
  it("whose:opponent + count gating", () => {
    const md = createPermanent({ id: "p-md", card: creature("Dilation", "Whenever an opponent casts their first spell each turn, you draw a card."), controller: "user", summoningSick: false });
    let s = stateWith([md]);
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, spellsCastThisTurn: 1 }, user: { ...s.players.user, spellsCastThisTurn: 0 } } };
    expect(pending(checkCastTriggers(s, { spellCard: { name: "X", type: "Instant" }, casterId: "ai" }))).toHaveLength(1);
    // the user (the watcher's controller) casting their own first spell does NOT fire an opponent watcher
    let s2 = stateWith([md]);
    s2 = { ...s2, players: { ...s2.players, user: { ...s2.players.user, spellsCastThisTurn: 1 } } };
    expect(pending(checkCastTriggers(s2, { spellCard: { name: "X", type: "Instant" }, casterId: "user" }))).toHaveLength(0);
    // the opponent's SECOND cast (count 2) does NOT re-fire the first-spell trigger (off-by-one)
    let s3 = stateWith([md]);
    s3 = { ...s3, players: { ...s3.players, ai: { ...s3.players.ai, spellsCastThisTurn: 2 } } };
    expect(pending(checkCastTriggers(s3, { spellCard: { name: "X", type: "Instant" }, casterId: "ai" }))).toHaveLength(0);
  });
});

// ─── Nth fire — off-by-one, end-to-end through applyCastSpell ─────────────────────

describe("castNth fires exactly on the Nth cast (off-by-one safe)", () => {
  function firstSpellState() {
    const watcher = createPermanent({
      id: "p-first",
      card: { id: "c-first", name: "FirstWatch", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "Whenever you cast your first spell each turn, you gain 2 life." },
      controller: "user", summoningSick: false,
    });
    const a = { id: "c-a", name: "SpellA", type: "Instant", mana: "{R}", oracle: "SpellA deals 1 damage to any target." };
    const b = { id: "c-b", name: "SpellB", type: "Instant", mana: "{R}", oracle: "SpellB deals 1 damage to any target." };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, battlefield: [watcher], hand: [a, b], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 0 }, spellsCastThisTurn: 0 } },
    };
    return s;
  }
  const cast = (s, id, name) => dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: id, name, cost: { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0, hybrid: [], phyrexian: [] }, targets: [{ type: "player", id: "ai" }] });

  it("the first cast fires the trigger (gain 2 life); the second does NOT", () => {
    let s = firstSpellState();
    const lifeBefore = s.players.user.life;
    let after = cast(s, "c-a", "SpellA");
    expect(after.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
    after = resolveTopOfStack(after); // resolve the gain-2-life trigger
    expect(after.players.user.life).toBe(lifeBefore + 2);
    let cleared = after;
    while (cleared.stack.length) cleared = resolveTopOfStack(cleared);
    const beforeSecond = cleared.players.user.life;
    const after2 = cast(cleared, "c-b", "SpellB");
    expect(after2.stack.some((o) => o.kind === "triggered-ability")).toBe(false);
    expect(after2.players.user.life).toBe(beforeSecond);
  });
});

// ─── Coverage: simple payoff native, complex payoff stays non-native (CREED) ──────

describe("coverage — payoff must parse HIGH to flip native", () => {
  it("a typed-list cast trigger with a 'draw a card' payoff is permanentTriggersCovered (Sram)", () => {
    const sram = { name: "Sram, Senior Edificer", type: "Legendary Creature — Dwarf Advisor", power: 1, toughness: 1, oracle: "Whenever you cast an Aura, Equipment, or Vehicle spell, draw a card." };
    expect(permanentTriggersCovered(sram)).toBe(true);
  });
  it("Rashmi's first-spell reveal/free-cast payoff does NOT parse HIGH → stays non-native (SAFE false-negative)", () => {
    const rashmi = { name: "Rashmi, Eternities Crafter", type: "Legendary Creature — Elf Druid", power: 2, toughness: 3, oracle: "Whenever you cast your first spell each turn, reveal the top card of your library. You may cast it without paying its mana cost if it's a spell with lesser mana value. If you don't cast it, put it into your hand." };
    expect(permanentTriggersCovered(rashmi)).toBe(false);
  });
  it("an X-spell trigger whose token-with-X-counters payoff isn't modeled stays non-native (Zaxara core)", () => {
    const zaxCore = { name: "ZaxCore", type: "Creature — Hydra", power: 0, toughness: 0, oracle: "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it." };
    expect(permanentTriggersCovered(zaxCore)).toBe(false);
  });
});
