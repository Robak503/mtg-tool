/**
 * landEntersTapped.test.js — LANDS-TIER slice 1 (2026-09-02): "This land enters tapped unless <condition>"
 * (CR 614.1c). 107 corpus lands print it; 83 flip to `land` on this slice, 24 stay partial for honest
 * reasons (a second unmodeled ability, or the reveal-lands whose gate names a choice this reader can't see).
 *
 * ONE VOCABULARY, TWO CONSUMERS. The runtime evaluates the printed condition through evaluateInterveningIf
 * at BOTH enter sites (the play-land path and resolvers.enterPermanent); the classifier admits the printed
 * line only when interveningIfParseable says that SAME evaluator can read it. entersTappedUnlessCondition is
 * the single function both go through, so the metric can never credit a gate the engine does not run.
 *
 * ⭐ THE "OTHER" EXCLUSION IS THE LOAD-BEARING DETAIL. On the play-land path the entering land is already
 * on the battlefield when the gate is read, so "two or more OTHER lands" must not count it — that is the
 * difference between a fast land entering untapped on turn three and on turn two. The entering id is
 * threaded as context.sourcePermanentId and the new "other" evaluator arm excludes it, FAILING CLOSED
 * (null) when no id is threaded — a count that might include the object itself is the over-count FP.
 *
 * Evaluator extensions this slice added (each carrier-backed by the census): "N or fewer/less", "other",
 * the legendary/basic supertype prefixes, "you have N or more opponents", "a player has N or less life",
 * "your opponents control N or more <filter>".
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-02).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { entersTappedUnlessCondition, conditionalEntersTapped } from "./landEntersTapped.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle, extra = {}) => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type: "Land", oracle, ...extra });
const SPECTATOR = L("Spectator Seating", "This land enters tapped unless you have two or more opponents.\n{T}: Add {R} or {W}.");
const SEACHROME = L("Seachrome Coast", "This land enters tapped unless you control two or fewer other lands.\n{T}: Add {W} or {U}.");
const DESERTED_BEACH = L("Deserted Beach", "This land enters tapped unless you control two or more other lands.\n{T}: Add {W} or {U}.");
const RIVENDELL = L("Rivendell", "Rivendell enters tapped unless you control a legendary creature.\n{T}: Add {U}.\n{T}: Scry 1. Activate only if you control a legendary creature.");
const SODDEN = L("Sodden Verdure", "This land enters tapped unless you control two or more basic lands.\n{T}: Add {G} or {U}.");
const CAMPGROUND = L("Abandoned Campground", "This land enters tapped unless a player has 13 or less life.\n{T}: Add {W} or {U}.");
const GLACIAL = L("Glacial Fortress", "This land enters tapped unless you control a Plains or an Island.\n{T}: Add {W} or {U}.");
const EIGHT = L("Probe Eight", "This land enters tapped unless your opponents control eight or more lands.\n{T}: Add {C}.");
const TEMPLE_DQ = L("Temple of the Dragon Queen", "As this land enters, you may reveal a Dragon card from your hand. This land enters tapped unless you revealed a Dragon card this way or you control a Dragon.\n{T}: Add one mana of any color.");
const MINES = L("Mines of Moria", "Mines of Moria enters tapped unless you control a legendary creature.\n{T}: Add {R}.\n{3}{R}, {T}, Exile three cards from your graveyard: Create two Treasure tokens.");

const basic = (id, name) => createPermanent({ id, card: { id: "cb-" + id, name, type: "Basic Land — " + name, oracle: "" }, controller: "user", summoningSick: false });
const creature = (id, name, type = "Creature — Bear") => createPermanent({ id, card: { id: "cc-" + id, name, type, power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });

/** Play `card` from hand onto `bf` via the real play-land action; returns the entered permanent's tapped flag. */
function playLand(state, card, bf = []) {
  const st = {
    ...state, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...state.players, user: { ...state.players.user, hand: [{ ...card, id: "L" }], battlefield: bf, landsPlayedThisTurn: 0 } },
  };
  const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
  const p = out.players.user.battlefield.find((x) => x.card?.name === card.name);
  if (!p) throw new Error("land did not enter");
  return p.tapped;
}
const twoSeat = () => createGameState({ userDeck: [], aiDeck: [] });
const fourSeat = () => createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });

describe("the reader — which printed lines it admits", () => {
  it("both printed subject shapes read: 'This land …' and the card's own name", () => {
    expect(entersTappedUnlessCondition(SPECTATOR)).toBe("you have two or more opponents");
    expect(entersTappedUnlessCondition(RIVENDELL)).toBe("you control a legendary creature");
  });

  it("⛔ a condition the shared evaluator cannot read yields NO condition (the reveal-lands park)", () => {
    // "you revealed a Dragon card this way or …" names a choice made by a preceding sentence this gate can't
    // see. No condition → the runtime leaves the land UNTAPPED (FN-safe) and the classifier leaves it partial.
    expect(entersTappedUnlessCondition(TEMPLE_DQ)).toBe(null);
    expect(classifyCard(TEMPLE_DQ)).toBe("land-partial");
  });

  it("⛔ THE HOLLOW-CREDIT GATE: a single-line gate the evaluator can't read is REFUSED, not admitted", () => {
    // Mutation M7 (removing the interveningIfParseable gate) SURVIVED the first run of this file: the
    // reveal-land fixture shares its line with a preceding "you may reveal" sentence, so the line anchor
    // rejected it before the gate was ever reached. This fixture is the gate's own carrier — the sentence
    // is alone on its line and syntactically perfect; ONLY the vocabulary check can refuse it. Without the
    // gate the classifier would credit a land whose condition the runtime cannot evaluate: native on
    // paper, entering untapped by guess in play.
    const UNREADABLE = L("Probe Unreadable", "This land enters tapped unless you control a Vehicle with power 5 or greater.\n{T}: Add {C}.");
    expect(entersTappedUnlessCondition(UNREADABLE)).toBe(null);
    expect(classifyCard(UNREADABLE)).toBe("land-partial");
    expect(conditionalEntersTapped(twoSeat(), UNREADABLE, "user")).toBe(false); // and the runtime leaves it untapped
    // Positive control — the identical shape with a READABLE condition is admitted and flips.
    const READABLE = L("Probe Readable", "This land enters tapped unless you control a Vehicle.\n{T}: Add {C}.");
    expect(entersTappedUnlessCondition(READABLE)).toBe("you control a vehicle");
    expect(classifyCard(READABLE)).toBe("land");
  });

  it("every admitted condition returns a BOOLEAN on the parseable probe board (never null)", () => {
    for (const c of [SPECTATOR, SEACHROME, DESERTED_BEACH, RIVENDELL, SODDEN, CAMPGROUND, GLACIAL, EIGHT]) {
      const cond = entersTappedUnlessCondition(c);
      expect(cond).not.toBe(null);
      expect(interveningIfParseable(cond)).toBe(true);
    }
  });
});

describe("the evaluator extensions", () => {
  it("'N or fewer/less' is a ≤ comparator; 'N or more' stays ≥", () => {
    const s = { ...twoSeat() };
    const with3 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [basic("a", "Forest"), basic("b", "Forest"), basic("c", "Forest")] } } };
    expect(evaluateInterveningIf(with3, "you control two or fewer lands", "user")).toBe(false);
    expect(evaluateInterveningIf(with3, "you control two or more lands", "user")).toBe(true);
    expect(evaluateInterveningIf(with3, "you control three or less lands", "user")).toBe(true);
  });

  it("⭐ 'other' excludes the threaded permanent, and FAILS CLOSED without an id", () => {
    const s = twoSeat();
    const bf = [basic("me", "Forest"), basic("x", "Forest"), basic("y", "Forest")]; // 3 lands, one of them "me"
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
    expect(evaluateInterveningIf(st, "you control two or more other lands", "user", { sourcePermanentId: "me" })).toBe(true);  // x, y
    expect(evaluateInterveningIf(st, "you control three or more other lands", "user", { sourcePermanentId: "me" })).toBe(false); // only 2 others
    expect(evaluateInterveningIf(st, "you control two or more other lands", "user", {})).toBe(null);                          // no id → cannot confirm
  });

  it("legendary / basic supertype prefixes are CONJUNCTIONS (a plain creature is not a legendary one)", () => {
    const s = twoSeat();
    const st = (bf) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } });
    expect(evaluateInterveningIf(st([creature("b", "Bear")]), "you control a legendary creature", "user")).toBe(false);
    expect(evaluateInterveningIf(st([creature("l", "Cap", "Legendary Creature — Human")]), "you control a legendary creature", "user")).toBe(true);
    expect(evaluateInterveningIf(st([basic("p", "Plains"), basic("q", "Island")]), "you control two or more basic lands", "user")).toBe(true);
    const nonbasic = createPermanent({ id: "nb", card: { id: "cnb", name: "Shock", type: "Land — Plains Island", oracle: "" }, controller: "user", summoningSick: false });
    expect(evaluateInterveningIf(st([nonbasic, basic("p", "Plains")]), "you control two or more basic lands", "user")).toBe(false);
  });

  it("'you have N or more opponents' is a live seat count", () => {
    expect(evaluateInterveningIf(twoSeat(), "you have two or more opponents", "user")).toBe(false);
    expect(evaluateInterveningIf(fourSeat(), "you have two or more opponents", "user")).toBe(true);
  });

  it("'a player has N or less life' is existential over EVERY seat, the controller included", () => {
    const s = twoSeat();
    const st = (u, a) => ({ ...s, players: { ...s.players, user: { ...s.players.user, life: u }, ai: { ...s.players.ai, life: a } } });
    expect(evaluateInterveningIf(st(40, 40), "a player has 13 or less life", "user")).toBe(false);
    expect(evaluateInterveningIf(st(40, 13), "a player has 13 or less life", "user")).toBe(true);
    expect(evaluateInterveningIf(st(10, 40), "a player has 13 or less life", "user")).toBe(true);
  });

  it("'your opponents control N or more <filter>' SUMS across opponents", () => {
    const s = fourSeat();
    const opp = (pid, n) => Array.from({ length: n }, (_, i) => createPermanent({ id: pid + i, card: { id: "cl" + pid + i, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: pid, summoningSick: false }));
    const st = { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: opp("ai1", 3) }, ai2: { ...s.players.ai2, battlefield: opp("ai2", 3) }, ai3: { ...s.players.ai3, battlefield: opp("ai3", 2) } } };
    expect(evaluateInterveningIf(st, "your opponents control eight or more lands", "user")).toBe(true);   // 3+3+2
    expect(evaluateInterveningIf(st, "your opponents control nine or more lands", "user")).toBe(false);
  });
});

describe("runtime — the play-land path taps or not on the live board", () => {
  it("Spectator Seating: untapped with three opponents, tapped with one", () => {
    expect(playLand(fourSeat(), SPECTATOR)).toBe(false);
    expect(playLand(twoSeat(), SPECTATOR)).toBe(true);
  });

  it("⭐ a fast land does not count ITSELF: untapped with two other lands, tapped with three", () => {
    expect(playLand(twoSeat(), SEACHROME, [basic("1", "Forest"), basic("2", "Forest")])).toBe(false);
    expect(playLand(twoSeat(), SEACHROME, [basic("1", "Forest"), basic("2", "Forest"), basic("3", "Forest")])).toBe(true);
  });

  it("a slow land is the mirror: tapped with one other land, untapped with two", () => {
    expect(playLand(twoSeat(), DESERTED_BEACH, [basic("1", "Forest")])).toBe(true);
    expect(playLand(twoSeat(), DESERTED_BEACH, [basic("1", "Forest"), basic("2", "Forest")])).toBe(false);
  });

  it("Rivendell: tapped with no legend, untapped once a legendary creature is out", () => {
    expect(playLand(twoSeat(), RIVENDELL, [creature("b", "Bear")])).toBe(true);
    expect(playLand(twoSeat(), RIVENDELL, [creature("l", "Cap", "Legendary Creature — Human")])).toBe(false);
  });

  it("⛔ an unreadable gate leaves the land UNTAPPED (the FN-safe direction) — never tapped by guess", () => {
    expect(playLand(twoSeat(), TEMPLE_DQ)).toBe(false);
  });

  it("negative control — a bare 'enters tapped' land and a plain land are byte-identical to before", () => {
    expect(playLand(twoSeat(), L("Temple", "This land enters tapped.\n{T}: Add {W}."))).toBe(true);
    expect(playLand(twoSeat(), L("Plain", "{T}: Add {W}."))).toBe(false);
  });
});

describe("runtime — resolvers.enterPermanent (a tutored / put-onto-the-battlefield land)", () => {
  it("reads the same gate: Spectator Seating enters untapped in a pod, tapped heads-up", () => {
    const four = enterPermanent(fourSeat(), SPECTATOR, "user");
    expect(four.players.user.battlefield.find((p) => p.card.name === SPECTATOR.name).tapped).toBe(false);
    const two = enterPermanent(twoSeat(), SPECTATOR, "user");
    expect(two.players.user.battlefield.find((p) => p.card.name === SPECTATOR.name).tapped).toBe(true);
  });

  it("the helper itself: false when unreadable, false when the condition holds, true when it fails", () => {
    expect(conditionalEntersTapped(twoSeat(), TEMPLE_DQ, "user")).toBe(false);
    expect(conditionalEntersTapped(fourSeat(), SPECTATOR, "user")).toBe(false);
    expect(conditionalEntersTapped(twoSeat(), SPECTATOR, "user")).toBe(true);
  });
});

describe("coverage — flips, and what honestly stays partial", () => {
  it("a land whose only non-mana line is a readable gate flips to `land`", () => {
    for (const c of [SPECTATOR, SEACHROME, DESERTED_BEACH, SODDEN, CAMPGROUND, GLACIAL, EIGHT]) {
      expect(classifyCard(c)).toBe("land");
    }
  });

  it("⛔ a readable gate does NOT carry an unmodeled SECOND ability across (whole-card CREED)", () => {
    // Mines of Moria's gate reads fine. Its "{3}{R}, {T}, Exile three cards …" ability parked when this
    // file was written and flipped on LANDS-4 (the exile-from-graveyard activated cost) — so the real card
    // is now `land`, and the whole-card pin lives on a PROBE whose second ability nothing will ever model.
    expect(entersTappedUnlessCondition(MINES)).toBe("you control a legendary creature");
    expect(classifyCard(MINES)).toBe("land");
    const ALIEN = L("Probe Alien", "Probe Alien enters tapped unless you control a legendary creature.\n{T}: Add {R}.\n{3}{R}, {T}: Each opponent glorbulates.");
    expect(entersTappedUnlessCondition(ALIEN)).toBe("you control a legendary creature");
    expect(classifyCard(ALIEN)).toBe("land-partial");
  });

  it("the one NON-land gain in the flip-diff is legitimate: Platoon Dispenser's 'other creatures' if", () => {
    // Its end-step intervening-if now parses because of the 'other' arm, and the trigger path threads the
    // Dispenser's own id as sourcePermanentId — so it excludes itself exactly as printed.
    const PD = { id: "c-pd", name: "Platoon Dispenser", type: "Artifact Creature — Construct", power: 2, toughness: 3,
      oracle: "At the beginning of your end step, if you control two or more other creatures, draw a card.\n{3}{W}: Create a 1/1 colorless Soldier artifact creature token.\nUnearth {2}{W}{W}" };
    const s = twoSeat();
    const disp = createPermanent({ id: "disp", card: PD, controller: "user", summoningSick: false });
    const st = (n) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [disp, ...Array.from({ length: n }, (_, i) => creature("b" + i, "B" + i))] } } });
    const cond = "you control two or more other creatures";
    expect(evaluateInterveningIf(st(1), cond, "user", { sourcePermanentId: "disp" })).toBe(false);
    expect(evaluateInterveningIf(st(2), cond, "user", { sourcePermanentId: "disp" })).toBe(true);
    expect(evaluateInterveningIf(st(2), cond, "user", {})).toBe(null); // fail closed without the id
  });
});
