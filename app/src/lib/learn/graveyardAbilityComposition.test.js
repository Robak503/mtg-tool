/**
 * graveyardAbilityComposition.test.js — a graveyard ability may share a card with a battlefield one
 * (census slice 56).
 *
 * THE BUG. A graveyard ability — "…: Return this card from your graveyard …" (GY-1) or "…, Exile this card
 * from your graveyard: …" (GY-2) — is genuinely modeled, but by its OWN lane, so `parseActivatedAbilities`
 * reports it unmodeled. permanentFullyCovered's "every activated ability must be modeled" guard therefore
 * sank the whole card to body-only. That is why a graveyard ability composed fine with KEYWORDS (which never
 * reach that guard) and not with a trigger or a battlefield activated ability. Magma Phoenix, Teacher's Pest,
 * the Soul cycle and Valiant Veteran all parked for that reason and nothing else.
 *
 * HOW THE DIAGNOSIS WAS REACHED IS WORTH KEEPING, because the first version of it was WRONG. The census's
 * "two-flip" bucket looked like proof that trigger + activated never composes. It does — `native-mixed`
 * already existed and both lanes genuinely ran; a runtime probe showed that in a minute. Acting on the first
 * reading would have meant rewriting a working tier resolver to chase a bug that wasn't there. The real
 * boundary was only visible once each combination was measured separately.
 *
 * WHY THIS COMPOSITION IS SAFE — and it is the safest in the file, not the riskiest. The two abilities
 * function in DIFFERENT ZONES and can never both apply to the same object at the same time: the battlefield
 * ability while it is a permanent, the graveyard ability while it is a card in the graveyard. There is no
 * interaction to get wrong. All three halves were proven on a driven board before the guard was touched, and
 * the third is the one that matters most.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, runStepActions, resolveTopOfStack } from "./gameEngine.js";

const CR = { type: "Creature — Skeleton Pest", mana: "{B}{G}", power: 1, toughness: 1, keywords: [] };
const TRIG = "Whenever this creature attacks, you gain 1 life.";
const ACT_BF = "{1}: This creature gets +1/+0 until end of turn.";
const ACT_GY = "{B}{G}: Return this card from your graveyard to the battlefield tapped.";

const tier = (oracle, name = "Probe") => classifyCard({ ...CR, name, oracle });

function lands(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(createPermanent({ id: `l${i}`, card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false }));
  }
  return out;
}

describe("the composition boundary, measured in every direction", () => {
  it("each ability alone is already native", () => {
    expect(tier(TRIG)).toBe("native-trigger");
    expect(tier(ACT_BF)).toBe("native-activated");
    expect(tier(ACT_GY)).toBe("native-activated");
  });

  it("trigger + BATTLEFIELD-activated composed even before this slice", () => {
    // The control that disproved the first diagnosis. If this had been body-only, the bug really would have
    // been "triggers and activated abilities never compose" — it never was.
    expect(tier(`${TRIG}\n${ACT_BF}`)).toBe("native-mixed");
  });

  it("THE FIX — trigger + GRAVEYARD-activated now composes", () => {
    expect(tier(`${TRIG}\n${ACT_GY}`)).toBe("native-mixed");
  });

  it("…and battlefield-activated + GRAVEYARD-activated too", () => {
    expect(tier(`${ACT_BF}\n${ACT_GY}`)).toBe("native-mixed");
  });

  it("keyword + graveyard ability was never affected — it never reached the guard", () => {
    expect(tier(`Menace\n${ACT_GY}`)).toBe("native-activated");
  });
});

describe("RUNTIME — both halves really run, each in its own zone", () => {
  const CARD = { id: "tp", name: "Teacher's Pest", ...CR, oracle: `${TRIG}\n${ACT_GY}` };

  it("the BATTLEFIELD trigger fires while it is a permanent", () => {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const p = createPermanent({ id: "tp", card: CARD, controller: "user", summoningSick: false });
    let st = { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: [p, ...lands(4)], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } } };
    const before = st.players.user.life;
    st = dispatchAction(st, legalActionsForPlayer(st, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "tp"));
    st = runStepActions(advanceStep(st));
    let g = 0; while (st.stack.length && g++ < 10) st = resolveTopOfStack(st);
    expect(st.players.user.life - before).toBe(1);
  });

  it("the GRAVEYARD ability is offered while it is a card in the graveyard", () => {
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: lands(6), graveyard: [{ ...CARD }], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } } };
    expect(legalActionsForPlayer(st, "user").filter((a) => a.cardId === "tp").length).toBeGreaterThan(0);
  });

  it("THE SAFETY PROPERTY — the graveyard ability is NOT offered while it is on the battlefield", () => {
    // This is what makes the composition safe rather than merely convenient: the two abilities can never
    // both apply at once. If this ever fails, the credit above stops being honest.
    _resetIdsForTests();
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const p = createPermanent({ id: "tp", card: CARD, controller: "user", summoningSick: false });
    const st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: [p, ...lands(6)], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } } };
    expect(legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "tp" && a.kind === "activate-ability")).toHaveLength(0);
  });
});

describe("CREED — the relaxation is narrow", () => {
  it("an unmodeled BATTLEFIELD activated ability still parks the card", () => {
    // Only GRAVEYARD abilities are exempted from the modeled-guard. An ordinary unmodeled activated
    // ability must still sink the card, or this slice would have quietly disabled the guard entirely.
    expect(tier(`${TRIG}\n{2}: Each opponent glorbulates.`)).not.toMatch(/^native/);
  });

  it("an unmodeled sibling CLAUSE still parks the card", () => {
    expect(tier(`${TRIG}\n${ACT_GY}\nEach opponent glorbulates.`)).not.toMatch(/^native/);
  });
});
