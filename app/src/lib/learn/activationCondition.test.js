/**
 * activationCondition.test.js — "Activate only if <board condition>." (CR 602.5d).
 *
 * 62 corpus cards carry this rider as their SOLE blocker. Unlike the timing riders, it restricts WHETHER
 * rather than WHEN, and it is a pure NARROWING of a window that already exists — so a wrong answer can only
 * ever under-offer. That is what made it the safe shape to build.
 *
 * THE SLICE IS A SEAM, NOT A VOCABULARY. The engine already had a condition language with a strict
 * metric⇄runtime shared gate (interveningIf.js), used by the trigger lane and the spell lane. Rather than
 * invent a second one for activations, this adds the THIRD probe of the same family —
 * `activationConditionParseable` — and the three differ ONLY in the context each caller can honestly supply:
 *
 *   interveningIfParseable   → a trigger: a triggering object + every per-object flag
 *   spellConditionParseable  → a resolving spell: no object thread at all
 *   activationConditionParseable → an activated ability: the SOURCE PERMANENT, and nothing else
 *
 * That distinction is load-bearing, not cosmetic: "you control another Elf" needs a triggering permanent to
 * exclude, so it is readable for a trigger and NOT for an activation. It stays parked here. The probe is
 * what keeps the coverage claim honest — a condition is stripped from the effect clause only when the offer
 * gate can actually evaluate it, so "native" is never backed by a restriction nothing enforces.
 *
 * All four card fixtures below are REAL oracle text from the bundled index, not paraphrase.
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { activationConditionParseable, evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

// Real cards. Vermin carries TWO abilities — one ungated, one gated — which is what proves the rider is
// scoped to its own ability rather than to the card.
const VERMIN = {
  name: "Infected Vermin", type: "Creature — Rat", mana: "{2}{B}", power: 1, toughness: 1, keywords: [],
  oracle: "{2}{B}: This creature deals 1 damage to each creature and each player.\nThreshold — {3}{B}: This creature deals 3 damage to each creature and each player. Activate only if there are seven or more cards in your graveyard.",
};
const TOME = {
  name: "Fool's Tome", type: "Artifact — Book", mana: "{4}", keywords: [],
  oracle: "{2}, {T}: Draw a card. Activate only if you have no cards in hand.",
};
const ZOMBIE = {
  name: "Caged Zombie", type: "Creature — Zombie", mana: "{2}{B}", power: 2, toughness: 3, keywords: [],
  oracle: "{1}{B}, {T}: Each opponent loses 2 life. Activate only if a creature died this turn.",
};
// The REFUSED case: a board query with no reader, so the rider is never stripped.
//
// GRADUATED TWICE IN ONE NIGHT, which is the lesson worth recording rather than quietly editing away.
// This constant was first "creatures you control have total power 8 or greater" (Dragon-Scarred Bear); the
// FORMIDABLE reader landed a slice later and the assertions below fired, exactly as written. I replaced it
// with the opponent-poison form — and the CORRUPTED reader landed the very next slice and fired them again.
//
// Twice is a pattern, so the pin is now anchored differently. A CONJUNCTION is refused STRUCTURALLY: this
// vocabulary evaluates a single clause by design, and half-evaluating a compound would be a false positive
// rather than a missing reader. That cannot be "fixed" by adding a reader the way the last two were, so the
// assertion guards an architectural boundary instead of a to-do list. The bar it enforces is unchanged
// throughout: a condition the gate cannot read is never stripped.
const REFUSED_COND = "you control three or more artifacts and an opponent has three or more poison counters";

const abilityFor = (oracle) => parseActivatedAbilities({ name: "X", type: "Artifact", oracle })[0];

describe("the probe family — three contexts, one vocabulary", () => {
  it("a board/player/turn query is readable for an activation", () => {
    expect(activationConditionParseable("there are seven or more cards in your graveyard")).toBe(true);
    expect(activationConditionParseable("a creature died this turn")).toBe(true);
    expect(activationConditionParseable("you have no cards in hand")).toBe(true);
  });

  it("THE CONTEXT DISTINCTION IS REAL — a per-TRIGGER shape is readable for a trigger and refused here", () => {
    // "another" needs the triggering permanent to exclude. A trigger can supply it; an activated ability
    // cannot. If this ever returns true, the activation probe is claiming a context it does not have.
    expect(interveningIfParseable("you control another Elf")).toBe(true);
    expect(activationConditionParseable("you control another Elf")).toBe(false);
  });

  it("CREED — an unmodeled board query is refused rather than guessed", () => {
    expect(activationConditionParseable(REFUSED_COND)).toBe(false);
    // ⭐ GRADUATED 2026-07-30 — and this pin's own sentence was the criterion. It said refusing the filtered
    // form "rather than approximating it with the unfiltered one is the whole point". Exactly right, and it is
    // still the point: the reader added this slice does NOT approximate. gameState was already maintaining a
    // separate `noncreatureSpellsCastThisTurn` counter that had no reader, so the filtered form is now read
    // from its OWN tally. Seeker of Insight is one of the 10 cards that flipped.
    expect(activationConditionParseable("you've cast a noncreature spell this turn")).toBe(true);
    // ⛔ THE BOUNDARY, RE-POINTED to a phrase with no counter behind it at all. "From your hand" is a ZONE
    // qualifier and `spellsCastThisTurn` is zone-blind, so approximating it would answer FALSE for a player
    // who cast only from the graveyard — suppressing an ability whose condition is TRUE. That is the shape
    // this pin has always been guarding, now aimed at a case that is genuinely still unreadable.
    expect(activationConditionParseable("you haven't cast a spell from your hand this turn")).toBe(false);
    expect(activationConditionParseable("you control three or more creatures with different powers")).toBe(false);
  });
});

describe("the untyped graveyard count is a NEW reader, and does not swallow the typed one", () => {
  const gy = (n) => ({ players: { p: { graveyard: Array.from({ length: n }, () => ({ type: "Land" })) } } });

  it("counts every card, whatever its type", () => {
    expect(evaluateInterveningIf(gy(7), "there are seven or more cards in your graveyard", "p")).toBe(true);
    expect(evaluateInterveningIf(gy(6), "there are seven or more cards in your graveyard", "p")).toBe(false);
  });

  it("the TYPED form still filters by type — the new anchor did not absorb it", () => {
    // Seven Lands in the graveyard: the untyped seven-or-more is met, the typed CREATURE count is not.
    expect(evaluateInterveningIf(gy(7), "there are two or more creature cards in your graveyard", "p")).toBe(false);
  });
});

describe("parse — the rider is stripped ONLY when the gate can read it", () => {
  it("a readable condition rides the ability and leaves the payload clean", () => {
    const a = abilityFor("{2}, {T}: Draw a card. Activate only if you have no cards in hand.");
    expect(a.condition).toBe("you have no cards in hand");
    expect(a.effectClause).toBe("Draw a card");
  });

  it("an UNREADABLE condition is left in place, which parks the card (false-negative safe)", () => {
    const a = abilityFor(`{1}{G}: Regenerate this creature. Activate only if ${REFUSED_COND}.`);
    expect(a.condition).toBeNull();
    expect(a.effectClause).toContain("Activate only if"); // still dragging the clause LOW, exactly as intended
  });

  it("an ordinary ability carries no condition", () => {
    expect(abilityFor("{1}: Draw a card.").condition).toBeNull();
  });

  it("the rider peels even when it FOLLOWS an end-anchored timing rider on the same line", () => {
    // Both riders are end-anchored, so the condition has to come off first or the limit rider never sees
    // its own tail. This is the assertion that pins that ordering.
    const a = abilityFor("{1}: Draw a card. Activate only once each turn. Activate only if you have no cards in hand.");
    expect(a.condition).toBe("you have no cards in hand");
    expect(a.activationLimit).toBe(1);
    expect(a.effectClause).toBe("Draw a card");
  });

  it("the rider is scoped to its OWN ability, not the card (Infected Vermin has one of each)", () => {
    const abs = parseActivatedAbilities(VERMIN);
    expect(abs).toHaveLength(2);
    expect(abs[0].condition).toBeNull();
    expect(abs[1].condition).toBe("there are seven or more cards in your graveyard");
  });
});

describe("RUNTIME — the offer gate genuinely withholds", () => {
  /** Board with the source permanent + 6 lands, in the controller's main phase. */
  function board(card, { graveyard = [], hand = [] } = {}) {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card, controller: "user", summoningSick: false })];
    for (let i = 0; i < 6; i++) {
      bf.push(createPermanent({ id: `l${i}`, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false }));
    }
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, graveyard, hand, manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const offers = (st) => legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability").length;

  it("Fool's Tome — offered on an empty hand", () => {
    expect(offers(board(TOME, { hand: [] }))).toBeGreaterThan(0);
  });

  it("THE LOAD-BEARING ONE — Fool's Tome is NOT offered with a card in hand", () => {
    // Delete the gate in legalChoices and this fails. If it ever passes wrongly, the engine is activating an
    // ability the printed card forbids — a false positive, which is the one thing the CREED rules out.
    expect(offers(board(TOME, { hand: [{ name: "Swamp", type: "Basic Land — Swamp" }] }))).toBe(0);
  });

  it("Infected Vermin — the UNGATED ability is always offered; the gated one waits for seven cards", () => {
    const empty = board(VERMIN, { graveyard: [] });
    const full = board(VERMIN, { graveyard: Array.from({ length: 7 }, () => ({ name: "Swamp", type: "Basic Land — Swamp" })) });
    expect(offers(empty)).toBe(1);   // only the ungated {2}{B}
    expect(offers(full)).toBe(2);    // threshold met → both
  });

  it("Caged Zombie — gated on a death that has not happened yet", () => {
    expect(offers(board(ZOMBIE))).toBe(0);
  });
});

describe("classification", () => {
  it("the carriers flip", () => {
    expect(classifyCard(TOME)).toMatch(/^native/);
    expect(classifyCard(VERMIN)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...TOME, oracle: `${TOME.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
