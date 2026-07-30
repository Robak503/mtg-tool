/**
 * Tests for cast-spell triggers (CR 603.2) — "Whenever you/an opponent/a player casts a
 * [instant/sorcery/creature/noncreature] spell, …". Detection (anchored, no over-fire from
 * riders), whose/filter matching, and end-to-end firing from actionDispatcher.applyCastSpell.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const castDescriptors = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle }).filter((d) => d.event === "cast");

describe("cast-trigger detection", () => {
  it("detects whose (you / opponent / any) and the modeled spell filters", () => {
    expect(castDescriptors("Whenever you cast an instant or sorcery spell, draw a card.")[0]).toMatchObject({ whose: "you", spellFilter: "instantSorcery" });
    expect(castDescriptors("Whenever you cast a noncreature spell, you gain 1 life.")[0]).toMatchObject({ whose: "you", spellFilter: "noncreature" });
    expect(castDescriptors("Whenever you cast a creature spell, draw a card.")[0]).toMatchObject({ whose: "you", spellFilter: "creature" });
    expect(castDescriptors("Whenever an opponent casts a spell, you draw a card.")[0]).toMatchObject({ whose: "opponent", spellFilter: "any" });
    expect(castDescriptors("Whenever a player casts a spell, draw a card.")[0]).toMatchObject({ whose: "any", spellFilter: "any" });
  });

  it("does NOT detect an unmodeled filter (color / kicked / permanent / legendary — denylisted non-subtypes)", () => {
    // CAST-SUBTYPE denylist: these words are NOT type-line subtypes, so a subtype match would never fire →
    // staying undetected avoids a never-firing native (CREED). Caught by the corpus flip-diff.
    // ⭐ COLOUR GRADUATED 2026-07-30 and moved to castColorFilter.test.js. This annotation was the criterion:
    // the objection was to a SUBTYPE SCAN that could never fire, not to the filter itself. Colour is now read
    // as a whole-object quality via colorsOf — the same treatment `multicolored` and `historic` already had.
    // `kicked` / `permanent` / `legendary` below are untouched: they have no such reader and still stay out.
    expect(castDescriptors("Whenever you cast a kicked spell, scry 2.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a permanent spell, draw a card.")).toHaveLength(0);
    // "legendary" alone is NOT a modeled quality filter (only "historic" = legendary ∨ artifact ∨ Saga is —
    // see TR-3 below); a bare "cast a legendary spell" stays undetected → Arbiter.
    expect(castDescriptors("Whenever you cast a legendary spell, draw a card.")).toHaveLength(0);
    // Un-set defined term: "an alliterative spell" (Treacherous Trapezist) is a name-property, not a
    // type-line subtype → must NOT detect (subtype:Alliterative would never fire = a do-nothing native FP).
    expect(castDescriptors("Whenever you cast an alliterative spell, scry 2.")).toHaveLength(0);
  });

  it("DOES detect the historic / multicolored QUALITY filters (BLITZ TR-3, CR 700.6 / 105.2b)", () => {
    // Historic (legendary ∨ artifact ∨ Saga) and multicolored (≥2 colors) are whole-object QUALITIES, not
    // subtypes — carved out of the denylist as exact filters spellMatchesFilter enforces on the cast spell.
    expect(castDescriptors("Whenever you cast a historic spell, draw a card.")[0]).toMatchObject({ whose: "you", spellFilter: "historic" });
    expect(castDescriptors("Whenever you cast a multicolored spell, draw a card.")[0]).toMatchObject({ whose: "you", spellFilter: "multicolored" });
  });

  it("CAST-SUBTYPE: detects a real creature/spell SUBTYPE filter (Elf / Knight / Adventure → subtype:Name)", () => {
    expect(castDescriptors("Whenever you cast an Elf spell, you may create a 1/1 green Elf Warrior creature token.")[0])
      .toMatchObject({ whose: "you", spellFilter: "subtype:Elf" });
    expect(castDescriptors("Whenever you cast a Knight spell, create a 1/1 white Human creature token.")[0])
      .toMatchObject({ spellFilter: "subtype:Knight" });
    expect(castDescriptors("Whenever you cast an Adventure spell, draw a card.")[0])
      .toMatchObject({ spellFilter: "subtype:Adventure" });
    // "a player casts a Giant spell" — whose:any subtype
    expect(castDescriptors("Whenever a player casts a Giant spell, put a +1/+1 counter on this creature.")[0])
      .toMatchObject({ whose: "any", spellFilter: "subtype:Giant" });
  });

  it("does NOT detect a cast trigger with an unmodeled RIDER (anchored — no over-fire)", () => {
    expect(castDescriptors("Whenever you cast a spell that targets a creature you control, draw a card.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast your second spell each turn, draw a card.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a creature spell with power 4 or greater, draw a card.")).toHaveLength(0);
    expect(castDescriptors("Whenever you cast a spell from your graveyard, draw a card.")).toHaveLength(0);
  });
});

describe("checkCastTriggers — whose + filter matching", () => {
  function creature(name, oracle) {
    return { id: `card-${name}`, name, type: "Creature — Wizard", power: 1, toughness: 1, oracle };
  }
  function stateWith(userBf, aiBf = []) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: userBf },
        ai: { ...s.players.ai, battlefield: aiBf },
      },
    };
  }
  const archer = createPermanent({ id: "perm-a", card: creature("Firebrand Archer", "Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent."), controller: "user", summoningSick: false });

  it("a 'you' watcher fires only on its controller's cast, and only on a matching spell type", () => {
    const s = stateWith([archer]);
    // user casts a noncreature spell → fires
    expect((checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "user" }).pendingTriggers || [])).toHaveLength(1);
    // user casts a CREATURE spell → noncreature filter rejects
    expect((checkCastTriggers(s, { spellCard: { name: "Bear", type: "Creature" }, casterId: "user" }).pendingTriggers || [])).toHaveLength(0);
    // the OPPONENT casts → a "you" watcher doesn't fire
    expect((checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "ai" }).pendingTriggers || [])).toHaveLength(0);
  });

  it("an 'opponent' watcher fires on an opponent's cast, not its controller's", () => {
    const remora = createPermanent({ id: "perm-r", card: creature("Watcher", "Whenever an opponent casts a spell, you draw a card."), controller: "user", summoningSick: false });
    const s = stateWith([remora]);
    expect((checkCastTriggers(s, { spellCard: { name: "X", type: "Instant" }, casterId: "ai" }).pendingTriggers || [])).toHaveLength(1);
    expect((checkCastTriggers(s, { spellCard: { name: "X", type: "Instant" }, casterId: "user" }).pendingTriggers || [])).toHaveLength(0);
  });
});

describe("end-to-end firing through applyCastSpell", () => {
  it("casting a noncreature spell fires Firebrand Archer's cast trigger onto the stack, damaging the opponent", () => {
    const archer = createPermanent({ id: "perm-a", card: { id: "c-archer", name: "Firebrand Archer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "Whenever you cast a noncreature spell, this creature deals 1 damage to each opponent." }, controller: "user", summoningSick: false });
    const bolt = { id: "c-bolt", name: "Zap", type: "Instant", mana: "{R}", oracle: "Zap deals 1 damage to any target." };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [archer], hand: [bolt], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } },
      },
    };
    const oppBefore = s.players.ai.life;

    // Cast the instant. The cast trigger goes on the stack ABOVE it.
    const afterCast = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "c-bolt", name: "Zap", cost: { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0, hybrid: [], phyrexian: [] }, targets: [{ type: "player", id: "ai" }] });
    const trig = afterCast.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program"); // routes the "deals 1 to each opponent"

    // Resolve the cast trigger (top of stack) — opponent takes 1.
    const afterTrigger = resolveTopOfStack(afterCast);
    expect(afterTrigger.players.ai.life).toBe(oppBefore - 1);
    // The spell itself is still on the stack below the (now-resolved) trigger.
    expect(afterTrigger.stack.some((o) => o.kind === "spell")).toBe(true);
  });
});

// CAST-SUBTYPE — "Whenever you cast a <Subtype> spell, <effect>" (tribal cast payoffs). spellMatchesFilter
// matches the cast spell's type line word-bounded against the subtype. Corpus flip-diff: +5 native (Elvish
// Handservant, Jarvis, Lys Alana Huntmaster, Storyteller Pixie, Worthy Knight), 0 regressions; colors /
// kicked / loud / permanent are denylisted (would never fire → no false positive).
describe("CAST-SUBTYPE — subtype filter matching + classification", () => {
  function creature(name, oracle, type = "Creature — Elf Warrior") {
    return { id: `card-${name}`, name, type, power: 1, toughness: 1, oracle };
  }
  function stateWith(bf) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
  }
  const lys = createPermanent({ id: "lys", card: creature("Lys Alana Huntmaster", "Whenever you cast an Elf spell, you may create a 1/1 green Elf Warrior creature token."), controller: "user", summoningSick: false });

  it("the cast-subtype watcher fires only on a spell whose type line carries the subtype", () => {
    const s = stateWith([lys]);
    expect((checkCastTriggers(s, { spellCard: { name: "Llanowar Elves", type: "Creature — Elf Druid" }, casterId: "user" }).pendingTriggers || [])).toHaveLength(1); // Elf → fires
    expect((checkCastTriggers(s, { spellCard: { name: "Grizzly Bears", type: "Creature — Bear" }, casterId: "user" }).pendingTriggers || [])).toHaveLength(0);   // non-Elf → no fire
    expect((checkCastTriggers(s, { spellCard: { name: "Elvish Mystic", type: "Creature — Elf Druid" }, casterId: "ai" }).pendingTriggers || [])).toHaveLength(0); // opponent's Elf → "you" watcher silent
  });

  it("a clean Elf-cast payoff classifies native-trigger; a KICKED cast-trigger stays body-only (CREED)", () => {
    expect(classifyCard({ type: "Creature — Elf Warrior", name: "Lys Alana Huntmaster", oracle: "Whenever you cast an Elf spell, you may create a 1/1 green Elf Warrior creature token." })).toBe("native-trigger");
    // ⭐ The COLOUR case graduated 2026-07-30 — a colour is a quality read from colorsOf, not a subtype scan.
    expect(classifyCard({ type: "Creature — Wizard", name: "ColorWard", oracle: "Whenever you cast a red spell, you gain 1 life." })).toMatch(/^native/);
    expect(classifyCard({ type: "Creature — Merfolk Wizard", name: "Falconer", oracle: "Flying\nWhenever you cast a kicked spell, scry 2." })).toBe("body-only");
  });
});

// ANYCAST-SELF-COUNTER — "Whenever a player casts a spell, put a +1/+1 counter on this creature." The
// whose:any castWatcher (fires on EVERY player's cast) + the modeled self-counter atom. Managorger Hydra
// is the archetype; this locks its whole-card flow (detect → classify → real counter placement) so a
// future parser change can't silently regress the flip while the tier still reads native. The CREED guard
// pins the near-misses that MUST stay parked: an optional "may" + unmodeled second ability (Forgotten
// Ancient), and an unmodeled cast-trigger effect on the same watcher shape.
describe("ANYCAST-SELF-COUNTER — Managorger Hydra whole-card flip + CREED near-miss", () => {
  const managorger = "Trample\nWhenever a player casts a spell, put a +1/+1 counter on this creature.";

  it("detects the whose:any castWatcher with the self-counter effect", () => {
    const d = castDescriptors(managorger)[0];
    expect(d).toMatchObject({ event: "cast", scope: "castWatcher", whose: "any", spellFilter: "any", optional: false });
    expect(d.effectClause).toBe("put a +1/+1 counter on this creature");
  });

  it("classifies native-trigger (Trample is a modeled keyword; the whole card is faithful)", () => {
    expect(classifyCard({ type: "Creature — Hydra", name: "Managorger Hydra", power: 1, toughness: 1, oracle: managorger })).toBe("native-trigger");
  });

  it("end-to-end: any player's cast fires the trigger and a +1/+1 counter lands on the Hydra", () => {
    const hydra = createPermanent({ id: "perm-h", card: { id: "c-hydra", name: "Managorger Hydra", type: "Creature — Hydra", power: 2, toughness: 2, oracle: managorger }, controller: "user", summoningSick: false });
    const bolt = { id: "c-bolt", name: "Zap", type: "Instant", mana: "{R}", oracle: "Zap deals 1 damage to any target." };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s.players, user: { ...s.players.user, battlefield: [hydra], hand: [bolt], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };

    const afterCast = dispatchAction(s, { kind: "cast-spell", playerId: "user", cardId: "c-bolt", name: "Zap", cost: { generic: 0, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0, hybrid: [], phyrexian: [] }, targets: [{ type: "player", id: "ai" }] });
    const trig = afterCast.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");

    const after = resolveTopOfStack(afterCast);
    const h = after.players.user.battlefield.find((p) => p.card.name === "Managorger Hydra");
    expect(h.counters?.["+1/+1"]).toBe(1);
  });

  it("CREED — optional 'may' + an unmodeled second ability, and an unmodeled cast effect, both stay parked", () => {
    // Forgotten Ancient: optional "you may" self-counter PLUS an unmodeled upkeep counter-move ability → whole card not faithful.
    expect(classifyCard({ type: "Creature — Elemental", name: "Forgotten Ancient", power: 0, toughness: 3, oracle: "Whenever a player casts a spell, you may put a +1/+1 counter on this creature.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto other creatures." })).toBe("body-only");
    // Same whose:any watcher but an unmodeled effect (mill + scry) → must not falsely claim native.
    expect(classifyCard({ type: "Creature — Hydra", name: "FakeGorger", power: 1, toughness: 1, oracle: "Trample\nWhenever a player casts a spell, that player mills three cards and you scry that many." })).toBe("body-only");
  });
});
