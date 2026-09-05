/**
 * DEAFENING SILENCE — the noncreature variant of the one-spell-per-turn cast limit. SHELF-85 · Light-Paws L5, 2026-09-05.
 * "Each player can't cast more than one noncreature spell each turn."
 *
 * Rule of Law's marker + gate existed (castLimit, spellsCastThisTurn); the noncreature subset counter existed too (Esper
 * Sentinel's noncreatureSpellsCastThisTurn). What was missing: the marker's `noncreatureOnly` reading and a gate that limits
 * NONCREATURE casts while leaving creature spells offered — one post-filter over every cast-family action (they all emit kind
 * "cast-spell"), reading the FACE being cast when the action carries one (an adventure's sorcery half is noncreature even
 * though the card's front is a creature), else the card resolved by id; an unresolvable card is withheld (fail closed).
 *
 * Mutation-checked: see the run ledger (docs-sk104).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, noncreatureCastsPerTurnLimitOf, castsPerTurnLimitOf } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DS = { id: "c-ds", name: "Deafening Silence", type: "Enchantment", mana: "{W}", keywords: [], oracle: "Each player can't cast more than one noncreature spell each turn." };
const RL = { id: "c-rl", name: "Rule of Law", type: "Enchantment", mana: "{2}{W}", keywords: [], oracle: "Each player can't cast more than one spell each turn." };

describe("the parser", () => {
  it("Deafening Silence emits the cast-limit marker with noncreatureOnly and both readers agree; Rule of Law is byte-identical; both native-static", () => {
    const row = { ds: parseStaticAbilities(DS), dsReader: [noncreatureCastsPerTurnLimitOf(DS), castsPerTurnLimitOf(DS)], rl: parseStaticAbilities(RL), rlReader: [noncreatureCastsPerTurnLimitOf(RL), castsPerTurnLimitOf(RL)], dsTier: classifyCard(DS), rlTier: classifyCard(RL) };
    console.log("  WITNESS deafeningSilence", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ds).toEqual([{ castLimit: 1, noncreatureOnly: true }]);
    expect(row.dsReader).toEqual([1, null]);
    expect(row.rl).toEqual([{ castLimit: 1 }]);
    expect(row.rlReader).toEqual([null, 1]);
    expect(row.dsTier).toBe("native-static");
    expect(row.rlTier).toBe("native-static");
  });
});

const BEAR = { id: "c-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const PEEK = { id: "c-peek", name: "Peek", type: "Instant", mana: "{G}", keywords: [], oracle: "Draw a card." };
const STUDY = { id: "c-study", name: "Study", type: "Sorcery", mana: "{1}{G}", keywords: [], oracle: "Draw two cards." };
// An adventurer (the adventure.test.js shape): the creature half from hand is a creature spell; the adventure half is a
// sorcery (CR 715.3). Curious Pair's Treats to Share ("Create a Food token") is a modelled effect.
const CURIOUS = { id: "cur1", name: "Curious Pair // Treats to Share", type: "Creature — Human Peasant // Sorcery — Adventure", mana: "{1}{G} // {G}", power: "1", toughness: "1", keywords: [],
  oracle: "Curious Pair - Creature — Human Peasant {1}{G}\n//\nTreats to Share - Sorcery — Adventure {G}\nCreate a Food token. (Then exile this card. You may cast the creature later from exile.)" };
const forest = (i) => createPermanent({ id: `f${i}`, card: { id: `c-f${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });

function board({ statics = [], hand, lands = 7, noncreatureCast = 0 }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: Array.from({ length: lands }, (_, i) => forest(i + 1)), library: Array.from({ length: 8 }, (_, i) => ({ ...PEEK, id: `c-lib${i}`, name: `Library Card ${i}` })), noncreatureSpellsCastThisTurn: noncreatureCast, spellsCastThisTurn: noncreatureCast },
      ai: { ...s0.players.ai, battlefield: statics.map((c, i) => createPermanent({ id: `st${i}`, card: c, controller: "ai" })) } } };
}
const castsOf = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell").map((x) => `${x.cardId}${x.adventureCast ? ":adv" : ""}`).sort();

describe("RUNTIME — the offer under the static", () => {
  it("fresh turn: every spell offered; after ONE noncreature spell is really cast and resolved, only the creature stays offered; the same board without the static keeps offering the sorcery", () => {
    const s = board({ statics: [DS], hand: [BEAR, PEEK, STUDY] });
    const fresh = castsOf(s);
    const peek = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-peek");
    const after = resolveTopOfStack(dispatchAction(s, peek));
    const free = board({ statics: [], hand: [BEAR, STUDY], noncreatureCast: 1 });
    const row = { fresh, count: after.players.user.noncreatureSpellsCastThisTurn, after: castsOf(after), free: castsOf(free) };
    console.log("  WITNESS deafeningSilenceOffer", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fresh: ["c-bear", "c-peek", "c-study"], count: 1, after: ["c-bear"], free: ["c-bear", "c-study"] });
  });

  it("the FACE is what is judged: after a noncreature cast, the adventurer's CREATURE half stays offered and its sorcery (adventure) half is withheld; Rule of Law withholds everything", () => {
    const ds = board({ statics: [DS], hand: [CURIOUS], noncreatureCast: 1 });
    const fresh = board({ statics: [DS], hand: [CURIOUS] });
    const rl = board({ statics: [RL], hand: [BEAR, STUDY], noncreatureCast: 1 });
    const row = { fresh: castsOf(fresh), limited: castsOf(ds), ruleOfLaw: castsOf(rl) };
    console.log("  WITNESS deafeningSilenceFace", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ fresh: ["cur1", "cur1:adv"], limited: ["cur1"], ruleOfLaw: [] });
  });
});
