/**
 * tevalMillPayoffs.test.js — Teval's two mill payoffs (shelf decks D27, 2026-09-30: Teval, the Balanced Scale Test).
 *
 * Overlord of the Balemurk — "Whenever this permanent enters or attacks, mill four cards, then you may return a non-Avatar
 * creature card or a planeswalker card from your graveyard to your hand." Grapple with the Past's mill-then-return already
 * parsed; the filter is a union of card phrases with a negated subtype ({ anyOf: [{ creature, notSubtype avatar },
 * { planeswalker }] }).
 * Colossal Grave-Reaver — "Whenever one or more creature cards are put into your graveyard from your library, put one of
 * them onto the battlefield." Sidisi's batch event already fired; "them" is every creature card of the batch
 * (ctx.gyBatchCardIds), the ones still in the graveyard are the choice, and only that event supplies the referent.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30; cmc from each mana cost), except the synthetic spell and
 * clause that pin the referent fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveMilledPickChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const OVERLORD = { name: "Overlord of the Balemurk", type: "Enchantment Creature — Avatar Horror", mana: "{3}{B}{B}", cmc: 5, power: "5", toughness: "5", keywords: ["Impending", "Mill"],
  oracle: "Impending 5—{1}{B} (If you cast this spell for its impending cost, it enters with five time counters and isn't a creature until the last is removed. At the beginning of your end step, remove a time counter from it.)\nWhenever this permanent enters or attacks, mill four cards, then you may return a non-Avatar creature card or a planeswalker card from your graveyard to your hand." };
const REAVER = { name: "Colossal Grave-Reaver", type: "Creature — Dragon", mana: "{6}{B}{G}", cmc: 8, power: "7", toughness: "6", keywords: ["Flying", "Mill"],
  oracle: "Flying\nWhenever this creature enters or attacks, mill three cards.\nWhenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield." };
const AJANI = { name: "Ajani Goldmane", type: "Legendary Planeswalker — Ajani", mana: "{2}{W}{W}", cmc: 4, keywords: [],
  oracle: "+1: You gain 2 life.\n−1: Put a +1/+1 counter on each creature you control. Those creatures gain vigilance until end of turn.\n−6: Create a white Avatar creature token. It has \"This token's power and toughness are each equal to your life total.\"" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, power: "3", toughness: "3", keywords: [], oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, keywords: [], oracle: "({T}: Add {G}.)" };

/** `me` enters on the user's battlefield over a rigged library (top first); its enters trigger fires. */
function enters(card, library) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const me = createPermanent({ id: "me", card: { ...card, id: "c-me" }, controller: "user", summoningSick: false });
  const lib = [...library, FOREST, FOREST, FOREST].map((c, i) => ({ ...c, id: c.id || `lib${i}` }));
  const s = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [me], library: lib } } };
  return settle(checkEnterTriggers(s, me));
}
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const names = (zone) => zone.map((c) => c.card?.name || c.name).sort();

describe("the cards", () => {
  it("both read native: Overlord's return filter is the union with the negated subtype; Grave-Reaver's batch trigger puts one of them", () => {
    const ov = detectTriggers(OVERLORD).find((d) => d.event === "etb");
    const gr = detectTriggers(REAVER).find((d) => d.event === "gyEnterBatch");
    expect({
      ovAtoms: parseEffectClause(ov.effectClause, "Instant", { sourceScoped: true }).atoms,
      grAtoms: parseEffectClause(gr.effectClause, "Instant", { sourceScoped: true }).atoms,
      tiers: [classifyCard(OVERLORD), classifyCard(REAVER)],
    }).toEqual({
      ovAtoms: [{ op: "mill", amount: 4, who: "controller", targetType: null },
        { op: "return-from-graveyard-pick", cardFilter: { anyOf: [{ cardType: "creature", notSubtype: "avatar" }, { cardType: "planeswalker" }] }, targetType: null, optional: true }],
      grAtoms: [{ op: "gy-batch-to-battlefield", targetType: null }],
      tiers: ["native-trigger", "native-trigger"],
    });
  });
  it("the union without a negation keeps the plain token; a negated word outside the creature types stays LOW (SYNTHETIC)", () => {
    const atoms = (t) => parseEffectClause(t, "Instant").atoms;
    expect({
      plain: atoms("you may return a creature card or a planeswalker card from your graveyard to your hand"),
      unknownSubtype: atoms("you may return a non-gizmo creature card or a planeswalker card from your graveyard to your hand"),
      planeswalkerTypeNegated: atoms("you may return a non-ajani planeswalker card or a creature card from your graveyard to your hand"),
      unknownCardType: atoms("you may return a gizmo card or a planeswalker card from your graveyard to your hand"), // would match nothing — a native claim that does nothing
    }).toEqual({ plain: [{ op: "return-from-graveyard-pick", cardFilter: "creature|planeswalker", targetType: null, optional: true }], unknownSubtype: [], planeswalkerTypeNegated: [], unknownCardType: [] });
  });
});

describe("⭐ Overlord of the Balemurk in play", () => {
  it("⭐ it enters, mills four (a Bear, another Overlord, Ajani, a Forest): yes → the choice is Ajani or the Bear — never the Avatar, never the land", () => {
    const s = enters(OVERLORD, [{ ...BEAR, id: "bear" }, { ...OVERLORD, id: "ov2" }, { ...AJANI, id: "ajani" }, { ...FOREST, id: "forest" }]);
    const asked = s.pendingChoice?.kind;
    const picking = resolveOptionalChoice(s, true);
    const offered = (picking.pendingChoice?.candidates || []).map((c) => c.name);
    const after = resolveMilledPickChoice(picking, "ajani");
    const row = { asked, milled: names(s.players.user.graveyard), offered, hand: names(after.players.user.hand) };
    console.log(`WITNESS overlordBalemurk ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: "optional-effect", milled: ["Ajani Goldmane", "Forest", "Grizzly Bears", "Overlord of the Balemurk"], offered: ["Ajani Goldmane", "Grizzly Bears"], hand: ["Ajani Goldmane"] });
  });
  it("declined, nothing comes back; with only the Avatar and a land milled, there is nothing to return", () => {
    const declined = resolveOptionalChoice(enters(OVERLORD, [{ ...BEAR, id: "bear" }, { ...FOREST, id: "f1" }, { ...FOREST, id: "f2" }, { ...FOREST, id: "f3" }]), false);
    const s = enters(OVERLORD, [{ ...OVERLORD, id: "ov2" }, { ...FOREST, id: "f1" }, { ...FOREST, id: "f2" }, { ...FOREST, id: "f3" }]);
    const empty = s.pendingChoice ? resolveOptionalChoice(s, true) : s;
    expect({ declinedHand: declined.players.user.hand.length, emptyHand: empty.players.user.hand.length, emptyPick: empty.pendingChoice?.kind ?? null })
      .toEqual({ declinedHand: 0, emptyHand: 0, emptyPick: null });
  });
});

describe("⭐ Colossal Grave-Reaver in play", () => {
  it("⭐ it enters and mills a Hill Giant, a Bear and a Forest: the batch trigger offers the two creatures (Giant first); the pick enters", () => {
    const s = enters(REAVER, [{ ...GIANT, id: "giant" }, { ...BEAR, id: "bear" }, { ...FOREST, id: "forest" }]);
    const offered = (s.pendingChoice?.candidates || []).map((c) => c.name);
    const after = settle(resolveMilledPickChoice(s, null));
    const row = { kind: s.pendingChoice?.kind, toZone: s.pendingChoice?.toZone, offered, onField: names(after.players.user.battlefield), graveyard: names(after.players.user.graveyard) };
    console.log(`WITNESS graveReaver ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "milled-pick", toZone: "battlefield", offered: ["Hill Giant", "Grizzly Bears"], onField: ["Colossal Grave-Reaver", "Hill Giant"], graveyard: ["Forest", "Grizzly Bears"] });
  });
  it("one creature card milled: it enters with no question; none milled: the trigger never fires", () => {
    const one = enters(REAVER, [{ ...FOREST, id: "f1" }, { ...BEAR, id: "bear" }, { ...FOREST, id: "f2" }]);
    const none = enters(REAVER, [{ ...FOREST, id: "f1" }, { ...FOREST, id: "f2" }, { ...FOREST, id: "f3" }]);
    expect({ onePause: one.pendingChoice?.kind ?? null, oneField: names(one.players.user.battlefield), noneField: names(none.players.user.battlefield), noneLog: none.log.some((e) => e.effect === "gy-batch-to-battlefield") })
      .toEqual({ onePause: null, oneField: ["Colossal Grave-Reaver", "Grizzly Bears"], noneField: ["Colossal Grave-Reaver"], noneLog: false });
  });
  it("SYNTHETIC: a milled creature card gone from the graveyard before the trigger resolves is no longer a candidate", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const me = createPermanent({ id: "me", card: { ...REAVER, id: "c-me" }, controller: "user", summoningSick: false });
    const lib = [{ ...GIANT, id: "giant" }, { ...BEAR, id: "bear" }, { ...FOREST, id: "f1" }, FOREST, FOREST].map((c, i) => ({ ...c, id: c.id || `lib${i}` }));
    let s = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [me], library: lib } } };
    s = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, me), { chooseTargets: chooseTriggerTargets })); // the mill resolves; the batch trigger is pending
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: s.players.user.graveyard.filter((c) => c.id !== "giant"), exile: [...(s.players.user.exile || []), { ...GIANT, id: "giant" }] } } };
    const after = settle(s);
    expect({ pause: after.pendingChoice?.kind ?? null, onField: names(after.players.user.battlefield) }).toEqual({ pause: null, onField: ["Colossal Grave-Reaver", "Grizzly Bears"] });
  });
  it("the referent is the graveyard-enter batch's alone: refused on another event, and a spell carrying it is not native (SYNTHETIC)", () => {
    const p = parseEffectClause("put one of them onto the battlefield", "Instant", { sourceScoped: true });
    const spell = { name: "Synthetic Spell", type: "Sorcery", mana: "{2}{B}", keywords: [], oracle: "Put one of them onto the battlefield." };
    expect({ batch: combatDamageReferentSatisfied(p, "gyEnterBatch"), etb: combatDamageReferentSatisfied(p, "etb"), spell: classifyCard(spell) })
      .toEqual({ batch: true, etb: false, spell: expect.not.stringMatching(/^native/) });
  });
});
