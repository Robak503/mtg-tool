/**
 * channelLands.test.js — LANDS-TIER slice 5 (2026-09-03): CHANNEL (CR 702.33) on the NEO legendary lands —
 * "Channel — {cost}, Discard this card: <effect>. This ability costs {1} less to activate for each legendary
 * creature you control." Otawara, Soaring City is Cap America's carrier; 38 corpus cards print Channel.
 *
 * THREE things stood between Otawara and `land`, none of them the Channel machinery itself:
 *   1. the "Channel — " keyword prefix on the line (the from-hand discard-ability lane's parser anchored on
 *      a bare brace cost) — CR 702.33a makes the prefix the SAME ability, so the line reads as one;
 *   2. the four-type bounce union "target artifact, creature, enchantment, or planeswalker" (the bounce
 *      parser knew "nonland permanent" — which would ALSO admit a Battle, an over-claim — but not this
 *      exact union);
 *   3. the dynamic rider "costs {1} less to activate for each legendary creature you control", which is
 *      re-derived from the LIVE board at both the offer and the payment (an action's frozen cost is never
 *      trusted for the amount — CR 601.2f fixes the cost at activation).
 *
 * HONEST SIBLINGS: Sokenzan ("They gain haste until end of turn" — a token-pronoun follow-up), Takenuma and
 * Boseiju carry effects the program parser rates LOW, so they stay land-partial on their EFFECT, exactly as
 * before — the prefix and the rider alone move nothing they should not.
 *
 * Channel may be activated any time its controller has priority (CR 702.33a); the from-hand lane offers it
 * only in the controller's own main phase — a deliberate, documented under-offer (FN-safe), the window every
 * other from-hand ability here uses.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseDiscardCostAbility } from "./effects/abilities.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

const OTAWARA = { id: "c-otawara", name: "Otawara, Soaring City", type: "Legendary Land",
  oracle: "{T}: Add {U}.\nChannel — {3}{U}, Discard this card: Return target artifact, creature, enchantment, or planeswalker to its owner's hand. This ability costs {1} less to activate for each legendary creature you control." };
const SOKENZAN = { id: "c-sokenzan", name: "Sokenzan, Crucible of Defiance", type: "Legendary Land",
  oracle: "{T}: Add {R}.\nChannel — {3}{R}, Discard this card: Create two 1/1 colorless Spirit creature tokens. They gain haste until end of turn. This ability costs {1} less to activate for each legendary creature you control." };
// A plain (non-Channel, non-rider) hand ability must parse exactly as before this slice.
const ULTIMO = { id: "cu", name: "Ultimo, Civilization's End", type: "Creature — Phyrexian Praetor", mana: "{6}{B}{B}", power: 6, toughness: 6,
  oracle: "Flying\n{2}{B}, Discard this card: Each opponent sacrifices a creature of their choice." };

describe("the parser — Channel prefix and the legendary-creature rider", () => {
  it("reads the Channel line: cost, effect text without the rider, and the rider as a reduction", () => {
    const ab = parseDiscardCostAbility(OTAWARA);
    expect(ab).toBeTruthy();
    expect(ab.cost).toBe("{3}{U}");
    expect(ab.effectText).toBe("Return target artifact, creature, enchantment, or planeswalker to its owner's hand.");
    expect(ab.channel).toBe(true);
    expect(ab.reduction).toEqual({ perLegendaryCreature: 1 });
  });

  it("a plain hand ability is unchanged: no channel flag, no reduction", () => {
    const ab = parseDiscardCostAbility(ULTIMO);
    expect(ab).toMatchObject({ cost: "{2}{B}", effectText: "Each opponent sacrifices a creature of their choice." });
    expect(ab.channel).toBe(false);
    expect(ab.reduction).toBeNull();
  });

  it("⛔ a rider it cannot read stays in the effect text (the effect then parks — never a silent discount)", () => {
    const ab = parseDiscardCostAbility({ ...OTAWARA, oracle: OTAWARA.oracle.replace("for each legendary creature you control", "for each Spirit you control") });
    expect(ab.reduction).toBeNull();
    expect(ab.effectText).toContain("costs {1} less");
  });
});

const enemyPerm = (id, name, type) => createPermanent({ id, controller: "ai1", summoningSick: false, card: { id: "card-" + id, name, type, oracle: "", power: 2, toughness: 2 } });
function board({ hand, legendaries = 0, enemy = [enemyPerm("eC", "Grizzly Bears", "Creature — Bear")] }) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  // Two PLAIN creatures and a legendary NON-creature always sit on the controller's board: the rider counts
  // legendary CREATURES only, and a reducer that counted creatures (or legendaries) would price these in.
  const bf = [
    createPermanent({ id: "plain0", controller: "user", summoningSick: false, card: { id: "card-plain0", name: "Plain Bear 0", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } }),
    createPermanent({ id: "plain1", controller: "user", summoningSick: false, card: { id: "card-plain1", name: "Plain Bear 1", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } }),
    createPermanent({ id: "legart", controller: "user", summoningSick: false, card: { id: "card-legart", name: "Legendary Rock", type: "Legendary Artifact", oracle: "" } }),
  ];
  for (let i = 0; i < legendaries; i++) {
    bf.push(createPermanent({ id: `leg${i}`, controller: "user", summoningSick: false,
      card: { id: `card-leg${i}`, name: `Legend ${i}`, type: "Legendary Creature — Human", power: 2, toughness: 2, oracle: "" } }));
  }
  return {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      ai1: { ...s0.players.ai1, battlefield: enemy },
      user: { ...s0.players.user, hand: [{ ...hand, id: "SUBJ" }], battlefield: bf, manaPool: { W: 0, U: 5, B: 0, R: 5, G: 0, C: 5 }, life: 40 },
    },
  };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "discard-ability" && a.cardId === "SUBJ");
const poolTotal = (s) => { const p = s.players.user.manaPool; return p.W + p.U + p.B + p.R + p.G + p.C; };

describe("the rider — re-derived from the live board at offer AND payment", () => {
  it("Otawara costs {3}{U} with no legendary creature, {2}{U} with one, {U} with three, never below {U}", () => {
    const g = (n) => offers(board({ hand: OTAWARA, legendaries: n }))[0]?.cost?.generic;
    expect(g(0)).toBe(3);
    expect(g(1)).toBe(2);
    expect(g(3)).toBe(0);
    expect(g(5)).toBe(0);
  });

  it("⭐ paying: with two legendary creatures the pool drops by exactly {1}{U}, the land is discarded, the bounce resolves", () => {
    const s = board({ hand: OTAWARA, legendaries: 2 });
    const act = offers(s).find((a) => a.targets?.[0]?.id === "eC");
    expect(act.cost.generic).toBe(1);
    const paid = dispatchAction(s, act);
    expect(poolTotal(paid)).toBe(15 - 2); // {1}{U}
    expect(paid.players.user.graveyard.some((c) => c.id === "SUBJ")).toBe(true);
    const resolved = resolveTopOfStack(paid);
    expect(resolved.players.ai1.battlefield.some((p) => p.id === "eC")).toBe(false);
    expect(resolved.players.ai1.hand.some((c) => c.name === "Grizzly Bears")).toBe(true);
  });

  it("⛔ the amount is NOT taken from the action: a stale cheaper cost on the action still pays the board's price", () => {
    const s = board({ hand: OTAWARA, legendaries: 0 });
    const act = offers(s).find((a) => a.targets?.[0]?.id === "eC");
    const stale = { ...act, cost: { ...act.cost, generic: 0 } };
    const paid = dispatchAction(s, stale);
    expect(poolTotal(paid)).toBe(15 - 4); // {3}{U} — the live board's price, not the action's
  });
});

describe("the bounce union — exactly artifact / creature / enchantment / planeswalker", () => {
  it("Otawara is offered against each of the four (any controller), and never against a land or a battle", () => {
    const enemy = [
      enemyPerm("eA", "Mind Stone", "Artifact"), enemyPerm("eC", "Grizzly Bears", "Creature — Bear"),
      enemyPerm("eE", "Pacifism", "Enchantment — Aura"), enemyPerm("eP", "Jace", "Legendary Planeswalker — Jace"),
      enemyPerm("eL", "Island", "Basic Land — Island"), enemyPerm("eB", "Invasion of Zendikar", "Battle — Siege"),
    ];
    const acts = offers(board({ hand: OTAWARA, legendaries: 1, enemy }));
    const targeted = new Set(acts.map((a) => a.targets?.[0]?.id));
    for (const id of ["eA", "eC", "eE", "eP", "leg0"]) expect(targeted).toContain(id); // own legendary creature is a legal target too
    expect(targeted).not.toContain("eL");
    expect(targeted).not.toContain("eB");
  });
});

describe("classification", () => {
  it("Otawara is `land`; a Channel land with an unreadable rider stays land-partial", () => {
    expect(classifyCard(OTAWARA)).toBe("land");
    expect(classifyCard({ ...OTAWARA, oracle: OTAWARA.oracle.replace("for each legendary creature you control", "for each Spirit you control") })).toBe("land-partial");
  });

  it("CREED — Sokenzan stays land-partial on its EFFECT ('They gain haste' is unmodeled), prefix and rider notwithstanding", () => {
    expect(parseDiscardCostAbility(SOKENZAN)?.channel).toBe(true); // the line reads …
    expect(classifyCard(SOKENZAN)).toBe("land-partial");          // … and the unmodeled effect still parks it
  });
});
