/**
 * castCostChoices.test.js — a cost choice is not a separate cast (CR 601.2b, 601.2h) — 2026-11-01.
 *
 * A pitch card for Force of Will's alternative cost (or the creature Flare of Denial sacrifices, the creature a Mercadian
 * spell taps) is a choice made while the spell is cast, not a different spell. legalChoices offered one cast per target for
 * EVERY such payment — targets × payments — and a late self-play game with ~94 spells on the stack and a 2,116-card hand
 * (see the Spirit Guide witnesses below) asked for 4,827,648 Force of Will casts and died out of memory. Now each target
 * gets ONE alternative-cost cast carrying the house payment (the one the AI's dominance filter pays: the lowest mana value,
 * id tiebreak) and, when there is more than one, every payment on `altCostChoices` — the AI ranks that short list. Outside the
 * engine every legal play is still listed (costChoiceSurfaces.test.js), so a person picks the card exactly as before.
 *
 * Elvish Spirit Guide (CR 601.2a): the card being cast is on the stack before its costs are paid, so its own "Exile this
 * card from your hand: Add {G}" can't pay for it. The offer and the payment both let it — and the dispatcher's splice of
 * a card that had already left the hand rebuilt the hand as (hand minus its last card) + (the whole hand): every recast
 * doubled it (seed 3277877396, Kinnan with Tidespout Tyrant returning the Guide each cast).
 *
 * Norn's Annex (CR 107.4f, 508.1h): an attack tax of {W/P} per attacker priced over a 75-permanent Squirrel board built
 * every k-subset of the Phyrexian symbols before trying one (seed 1462897988, out of memory).
 *
 * Real oracle text (bundled Scryfall snapshot).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions, parseManaCost } from "./legalChoices.js";
import { dispatchAction, DispatcherError } from "./actionDispatcher.js";
import { applyAction, isLegalAction } from "./gameApi.js";
import { resolveChoice } from "./decisionGate.js";
import { canAfford } from "./manaModel.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { castChooserView } from "../../components/mtg/LearnBoard.jsx";
import { legalActions } from "./gameApi.js";

beforeEach(() => _resetIdsForTests());

const FORCE_OF_WILL = { id: "fow", name: "Force of Will", type: "Instant", mana: "{3}{U}{U}", colors: ["U"], cmc: 5,
  oracle: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell." };
const FLARE_OF_DENIAL = { id: "fod", name: "Flare of Denial", type: "Instant", mana: "{1}{U}{U}", colors: ["U"], cmc: 3,
  oracle: "You may sacrifice a nontoken blue creature rather than pay this spell's mana cost.\nCounter target spell." };
const ESG = { name: "Elvish Spirit Guide", type: "Creature — Elf Spirit", mana: "{2}{G}", mana_cost: "{2}{G}", cmc: 3, power: 2, toughness: 2, keywords: [], colors: ["G"], oracle: "Exile this card from your hand: Add {G}." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], oracle: "{T}: Add {C}{C}." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const blue = (id, name, cmc) => ({ id, name, type: "Instant", mana: "", colors: ["U"], cmc, oracle: "Draw a card." });
const BLUE_BEAR = (id) => ({ id, card: { id, name: "Blue Bear", type: "Creature — Bear", mana: "{1}{U}", colors: ["U"], cmc: 2, power: 2, toughness: 2, oracle: "" }, summoningSick: false, tapped: false });

function spellOnStack(id, name) {
  return { id, kind: "spell", controller: "ai", targets: [], cost: { generic: 2, U: 1 },
    source: { id: `card-${id}`, name, type: "Sorcery", oracle: "" }, payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: {} } };
}

/** The user holds priority in a response window on the AI's turn. */
function responseState({ hand = [], battlefield = [], stack = [], life = 20 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, stack,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, life } },
  };
}

/** The user's own main phase, empty stack. */
function mainState({ hand = [], battlefield = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, exile: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } },
  };
}

const casts = (state) => filterActions(legalActionsForPlayer(state, "user"), "cast-spell");
const altsOf = (actions, cardId) => actions.filter((a) => a.cardId === cardId && a.altCost);

/** The cast a person makes: the offered cast at that target, paying with `pitch` (built from either tree's shape). */
function personsPitch(offered, pitch) {
  const { altCostChoices: _drop, ...rest } = offered;
  return { ...rest, altCost: { kind: "payLifeExilePitch", payLife: 1, exilePitchId: pitch.id, exilePitchName: pitch.name }, altName: `pay 1 life, exile ${pitch.name} from hand` };
}

// Six spells on the stack, five blue cards beside Force of Will — the cheapest not first in hand.
const STACK = Array.from({ length: 6 }, (_, i) => spellOnStack(`s${i}`, `Spell ${i}`));
const PITCHES = [blue("b3", "Three Drop", 3), blue("b1z", "Cheap Z", 1), blue("b2", "Two Drop", 2), blue("b1a", "Cheap A", 1), blue("b4", "Four Drop", 4)];

describe("WITNESS — the cast options grow with the targets, not with targets × pitch cards", () => {
  it("Force of Will with 6 spells on the stack and 5 blue cards: 6 alternative-cost casts, one per target, each naming all 5 pitch cards", () => {
    const s = responseState({ hand: [FORCE_OF_WILL, ...PITCHES], stack: STACK });
    const alts = altsOf(casts(s), "fow");
    expect(alts.length).toBe(6); // was 6 × 5 = 30
    expect(new Set(alts.map((a) => a.targets[0].id)).size).toBe(6);
    for (const a of alts) expect(a.altCostChoices.map((c) => c.altCost.exilePitchId).sort()).toEqual(["b1a", "b1z", "b2", "b3", "b4"]);
  });

  it("the house payment is the one the AI pays: the lowest mana value, id tiebreak", () => {
    const s = responseState({ hand: [FORCE_OF_WILL, ...PITCHES], stack: STACK });
    for (const a of altsOf(casts(s), "fow")) {
      expect(a.altCost).toEqual({ kind: "payLifeExilePitch", payLife: 1, exilePitchId: "b1a", exilePitchName: "Cheap A" });
      expect(a.altName).toBe("pay 1 life, exile Cheap A from hand");
    }
  });

  it("Flare of Denial: one cast per target, the two blue creatures it could sacrifice on its choices", () => {
    const s = responseState({ hand: [FLARE_OF_DENIAL], battlefield: [BLUE_BEAR("bb2"), BLUE_BEAR("bb1")], stack: STACK.slice(0, 3) });
    const alts = altsOf(casts(s), "fod");
    expect(alts.length).toBe(3);
    for (const a of alts) expect(a.altCostChoices.map((c) => c.altCost.sacId).sort()).toEqual(["bb1", "bb2"]);
  });
});

describe("CONTROL — a person still chooses the pitch card (every answer path)", () => {
  const s = () => responseState({ hand: [FORCE_OF_WILL, ...PITCHES], stack: STACK });
  const offeredAt = (state, targetId) => altsOf(casts(state), "fow").find((a) => a.targets[0].id === targetId);

  it("the play-API takes a cast that pitches a card other than the house one, and exiles THAT card", () => {
    const state = s();
    const mine = personsPitch(offeredAt(state, "s3"), PITCHES[4]); // Four Drop, at the fourth spell
    expect(isLegalAction(state, mine)).toBe(true);
    const next = applyAction(state, mine);
    expect(next).not.toBe(state);
    expect(next.players.user.exile.map((c) => c.id)).toEqual(["b4"]);
    expect(next.players.user.hand.map((c) => c.id).sort()).toEqual(["b1a", "b1z", "b2", "b3"]);
    expect(next.stack.at(-1).targets[0].id).toBe("s3");
  });

  it("the Academy's answer (decisionGate.resolveChoice) resolves that cast to the chosen pitch", () => {
    const state = s();
    const matched = resolveChoice(legalActionsForPlayer(state, "user"), personsPitch(offeredAt(state, "s0"), PITCHES[0]));
    expect(matched?.altCost?.exilePitchId).toBe("b3");
    expect(matched.targets[0].id).toBe("s0");
  });

  it("a pitch card that is no choice (Force of Will itself, a card not in hand) is no legal cast", () => {
    const state = s();
    const offered = offeredAt(state, "s0");
    expect(isLegalAction(state, personsPitch(offered, FORCE_OF_WILL))).toBe(false);
    expect(isLegalAction(state, personsPitch(offered, blue("ghost", "Ghost", 1)))).toBe(false);
    expect(resolveChoice(legalActionsForPlayer(state, "user"), personsPitch(offered, blue("ghost", "Ghost", 1)))).toBeNull();
  });

  it("the cast chooser shows one row per pitch card (and the hard cast when payable) for the picked target", () => {
    const state = s();
    const options = legalActions(state, "user");
    // The Academy is handed every legal play (the play-API's list — costChoiceSurfaces.test.js), so the chooser is unchanged.
    const forCard = options.filter((o) => o.kind === "cast-spell" && o.cardId === "fow");
    const view = castChooserView(forCard, new Set(), "s2");
    expect(view.rows.length).toBe(5);
    const labels = view.rows.map((r) => r.label).sort();
    expect(labels).toEqual(["Pay 1 life, exile Cheap A from hand", "Pay 1 life, exile Cheap Z from hand", "Pay 1 life, exile Four Drop from hand", "Pay 1 life, exile Three Drop from hand", "Pay 1 life, exile Two Drop from hand"]);
    expect(view.targetButtons.length).toBe(6);
  });
});

describe("WITNESS — a Spirit Guide never pays for its own cast (CR 601.2a)", () => {
  it("Elvish Spirit Guide beside a Sol Ring and no green source: not castable (its own {G} is gone with it)", () => {
    const s = mainState({ hand: [{ ...ESG, id: "h-esg" }], battlefield: [createPermanent({ id: "p-sol", card: { id: "p-sol-c", ...SOL_RING }, controller: "user", summoningSick: false })] });
    expect(casts(s).filter((a) => a.cardId === "h-esg")).toEqual([]);
  });

  it("dispatching that cast anyway is refused, never a hand rebuilt from a missing card", () => {
    const hand = [{ ...ESG, id: "h-esg" }, { id: "h-x", name: "Card X", type: "Instant", oracle: "" }, { id: "h-y", name: "Card Y", type: "Instant", oracle: "" }];
    const s = mainState({ hand, battlefield: [createPermanent({ id: "p-sol", card: { id: "p-sol-c", ...SOL_RING }, controller: "user", summoningSick: false })] });
    const action = { kind: "cast-spell", playerId: "user", fromZone: "hand", cardId: "h-esg", name: ESG.name, cost: parseManaCost("{2}{G}"), cmc: 3, effect: null, program: null, targets: [], needsTargets: false };
    let err = null;
    try { dispatchAction(s, action); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DispatcherError);
    // The payment can't use the Guide, so the mana is short. (Before: the Guide was exiled to pay, the splice rebuilt the hand
    // as ["h-x", "h-x", "h-y"], and only the test-time auditor's AUDIT_VIOLATION stopped it — in a real game nothing did.)
    expect(err.code).toBe("MANA_SHORT");
  });

  it("the dispatcher refuses a cast whose card left its zone while the costs were paid — never a zone rebuilt around it", () => {
    // Hand-built (no offer makes it): Force of Will pitching itself, so the alternative cost exiles the very card being cast.
    const s = responseState({ hand: [FORCE_OF_WILL, PITCHES[0], PITCHES[1]], stack: STACK.slice(0, 1) });
    const offered = altsOf(casts(s), "fow")[0];
    const { altCostChoices: _drop, ...rest } = offered;
    const action = { ...rest, altCost: { kind: "payLifeExilePitch", payLife: 1, exilePitchId: "fow", exilePitchName: "Force of Will" } };
    let err = null;
    try { dispatchAction(s, action); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(DispatcherError);
    expect(err.code).toBe("CARD_LEFT_ZONE"); // before: the splice rebuilt the hand (the test-time auditor's AUDIT_VIOLATION)
  });

  it("CONTROL: a cast whose card was never in the zone is refused before anything is paid (CARD_NOT_IN_ZONE)", () => {
    const s = mainState({ hand: [{ id: "h-x", name: "Card X", type: "Instant", oracle: "" }], battlefield: [createPermanent({ id: "p-sol", card: { id: "p-sol-c", ...SOL_RING }, controller: "user", summoningSick: false })] });
    const action = { kind: "cast-spell", playerId: "user", fromZone: "hand", cardId: "h-gone", name: "Gone", cost: parseManaCost("{1}"), cmc: 1, effect: null, program: null, targets: [], needsTargets: false };
    expect(() => dispatchAction(s, action)).toThrowError(/not in hand/);
  });

  it("CONTROL: with a Forest beside it the Guide is cast, paid by the Forest, and the hand keeps every other card once", () => {
    const hand = [{ ...ESG, id: "h-esg" }, { id: "h-x", name: "Card X", type: "Instant", oracle: "" }];
    const s = mainState({ hand, battlefield: [
      createPermanent({ id: "p-sol", card: { id: "p-sol-c", ...SOL_RING }, controller: "user", summoningSick: false }),
      createPermanent({ id: "p-f", card: { id: "p-f-c", ...FOREST }, controller: "user", summoningSick: false }),
    ] });
    const cast = casts(s).find((a) => a.cardId === "h-esg");
    expect(cast).toBeTruthy();
    const next = dispatchAction(s, cast);
    expect(next.players.user.hand.map((c) => c.id)).toEqual(["h-x"]);
    expect(next.players.user.exile.map((c) => c.id)).toEqual([]);
    expect(next.stack.at(-1).source.name).toBe("Elvish Spirit Guide");
  });
});

describe("WITNESS — Phyrexian symbols are tried by how many of each are paid with life, not by every subset", () => {
  const phyrexian = (n, sym = "W/P") => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], phyrexian: Array(n).fill(sym) });
  const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

  it("twenty {W/P} (Norn's Annex over twenty attackers) with no white mana and 50 life: affordable, at once", () => {
    const t = Date.now();
    expect(canAfford(EMPTY, [], phyrexian(20), { life: 50 })).toBe(true);
    expect(Date.now() - t).toBeLessThan(500); // every subset: 2^20 attempts (~2.6 s, ~300 MB); by count: 21
  });

  it("CONTROL: the life floor holds — twenty {W/P} at 40 life can't be paid (CR 119.4, the engine keeps 1 life)", () => {
    expect(canAfford(EMPTY, [], phyrexian(20), { life: 40 })).toBe(false);
    expect(canAfford(EMPTY, [], phyrexian(3), { life: 7 })).toBe(true);
    expect(canAfford(EMPTY, [], phyrexian(3), { life: 6 })).toBe(false);
  });
});
