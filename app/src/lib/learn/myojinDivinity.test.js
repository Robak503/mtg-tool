/**
 * myojinDivinity.test.js — "~ enters with a divinity counter on it if you cast it from your hand." (the 09-06 plan's stage
 * ③ · 47, 2026-09-30 — Myojin of Life's Web, Myojin of Infinite Rage).
 *
 * An enters-with-counter replacement (CR 614.1c + 122.6a) gated on HOW the permanent got there: only the spell cast from
 * its owner's hand brings the counter. The cast resolvers stamp `castFromZone` on the entering permanent
 * (resolvers.enterPermanent) — the same per-permanent fact the "When ~ enters, if you cast it from your hand" riders read
 * — so a Myojin reanimated, put onto the battlefield, or cast from the command zone enters bare. The counter's readers were
 * modeled already ("has indestructible as long as it has a divinity counter on it"; "Remove a divinity counter from ~: …");
 * the enter line was the whole park. `divinity` joins the inert enter-counter kinds (CR 122.1 — it does nothing by itself;
 * only those printed readers consume it). Neon Dynasty's "… an indestructible counter …" rides the same reader.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30) unless marked SYNTHETIC.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { permanentHasKeyword } from "./layers.js";
import { entersWithCastFromHandCounters } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RAGE = { id: "rage", name: "Myojin of Infinite Rage", type: "Legendary Creature — Spirit", mana: "{7}{R}{R}{R}", mana_cost: "{7}{R}{R}{R}", cmc: 10, colors: ["R"], power: "7", toughness: "4", keywords: [],
  oracle: "Myojin of Infinite Rage enters with a divinity counter on it if you cast it from your hand.\nMyojin of Infinite Rage has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Infinite Rage: Destroy all lands." };
const LIFES_WEB = { name: "Myojin of Life's Web", type: "Legendary Creature — Spirit", mana: "{6}{G}{G}{G}", cmc: 9, colors: ["G"], power: "8", toughness: "8", keywords: [],
  oracle: "Myojin of Life's Web enters with a divinity counter on it if you cast it from your hand.\nMyojin of Life's Web has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Life's Web: Put any number of creature cards from your hand onto the battlefield." };
const NIGHTS_REACH = { name: "Myojin of Night's Reach", type: "Legendary Creature — Spirit", mana: "{5}{B}{B}{B}", cmc: 8, colors: ["B"], power: "5", toughness: "2", keywords: [],
  oracle: "Myojin of Night's Reach enters with a divinity counter on it if you cast it from your hand.\nMyojin of Night's Reach has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Night's Reach: Each opponent discards their hand." };
const TOWERING_MIGHT = { id: "might", name: "Myojin of Towering Might", type: "Legendary Creature — Spirit", mana: "{5}{G}{G}{G}", mana_cost: "{5}{G}{G}{G}", cmc: 8, colors: ["G"], power: "8", toughness: "8", keywords: [],
  oracle: "Myojin of Towering Might enters with an indestructible counter on it if you cast it from your hand.\nRemove an indestructible counter from Myojin of Towering Might: Distribute eight +1/+1 counters among any number of target creatures you control. They gain trample until end of turn." };
const PATCHED_PLAYTHING = { name: "Patched Plaything", type: "Artifact Creature — Toy", mana: "{2}{W}", cmc: 3, colors: ["W"], power: "4", toughness: "3", keywords: ["Double strike"],
  oracle: "Double strike\nThis creature enters with two -1/-1 counters on it if you cast it from your hand." };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };

// The user in their main phase with `card` in hand, `pool` floating, lands on both sides.
function board(card, pool) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const land = (id, c, ctl) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: ctl, summoningSick: false });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: [card], battlefield: [land("uF", FOREST, "user")], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, battlefield: [land("aS", SWAMP, "ai")] } } };
}
const castAndResolve = (s0, cardId) => {
  let s = dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId));
  for (let i = 0; i < 6 && (s.stack || []).length && !s.pendingChoice; i++) s = flushTriggers(resolveTopOfStack(s));
  return s;
};
const myojinOf = (s, name) => s.players.user.battlefield.find((p) => p.card?.name === name);

describe("the carriers and the reader", () => {
  it("⭐ Myojin of Life's Web and Myojin of Infinite Rage read native; the reader returns the one divinity counter", () => {
    expect([LIFES_WEB, RAGE].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
    expect(entersWithCastFromHandCounters(RAGE)).toEqual({ type: "divinity", n: 1 });
  });
  it("still parked: Night's Reach (its discard line), Patched Plaything (-1/-1 counters are not this reader's kind)", () => {
    expect([NIGHTS_REACH, PATCHED_PLAYTHING].map((c) => isNativeTier(classifyCard(c)))).toEqual([false, false]);
    expect(entersWithCastFromHandCounters(PATCHED_PLAYTHING)).toBeNull();
  });
  it("an unhonest kind is never credited (SYNTHETIC fixture — a finality counter's dies-exile is unmodeled)", () => {
    const TEST_IDOL = { name: "Test Idol", type: "Creature — Spirit", mana: "{3}", cmc: 3, colors: [], power: "3", toughness: "3", keywords: [],
      oracle: "This creature enters with a finality counter on it if you cast it from your hand." };
    expect(isNativeTier(classifyCard(TEST_IDOL))).toBe(false);
  });
});

describe("⭐ the real cast from hand", () => {
  it("⭐ cast from hand, Myojin of Infinite Rage enters with a divinity counter and is indestructible", () => {
    const out = castAndResolve(board(RAGE, { R: 3, C: 7 }), "rage");
    const m = myojinOf(out, "Myojin of Infinite Rage");
    const row = { divinity: m?.counters?.divinity ?? 0, indestructible: !!m && permanentHasKeyword(out, m.id, "indestructible") };
    console.log(`WITNESS myojinCastFromHand ${JSON.stringify(row)}`);
    expect(row).toEqual({ divinity: 1, indestructible: true });
  });
  it("⭐ its real activation spends the counter: indestructible is gone and every land is destroyed", () => {
    const s = castAndResolve(board(RAGE, { R: 3, C: 7 }), "rage");
    const m = myojinOf(s, "Myojin of Infinite Rage");
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === m.id);
    let out = dispatchAction(s, act);
    for (let i = 0; i < 6 && (out.stack || []).length && !out.pendingChoice; i++) out = flushTriggers(resolveTopOfStack(out));
    const after = myojinOf(out, "Myojin of Infinite Rage");
    const lands = [...out.players.user.battlefield, ...out.players.ai.battlefield].filter((p) => /Land/.test(p.card?.type || "")).length;
    expect({ divinity: after?.counters?.divinity ?? 0, indestructible: permanentHasKeyword(out, after.id, "indestructible"), lands }).toEqual({ divinity: 0, indestructible: false, lands: 0 });
  });
  it("⭐ Neon Dynasty's indestructible-counter form rides the same reader — Myojin of Towering Might cast from hand", () => {
    const out = castAndResolve(board(TOWERING_MIGHT, { G: 3, C: 5 }), "might");
    const m = myojinOf(out, "Myojin of Towering Might");
    expect({ counter: m?.counters?.indestructible ?? 0, indestructible: !!m && permanentHasKeyword(out, m.id, "indestructible") }).toEqual({ counter: 1, indestructible: true });
  });
});

describe("⭐ any other way in, it enters bare", () => {
  const enterVia = (opts) => {
    const s = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), { ...RAGE, id: "rage2" }, "user", opts);
    const m = myojinOf(s, "Myojin of Infinite Rage");
    return { divinity: m?.counters?.divinity ?? 0, indestructible: permanentHasKeyword(s, m.id, "indestructible") };
  };
  it("put onto the battlefield (reanimated / cheated in — no cast at all): no counter, not indestructible", () => {
    expect(enterVia({})).toEqual({ divinity: 0, indestructible: false });
  });
  it("cast from the COMMAND zone or a graveyard: no counter", () => {
    expect({ command: enterVia({ wasCast: true, castFromZone: "command" }), graveyard: enterVia({ wasCast: true, castFromZone: "graveyard" }) })
      .toEqual({ command: { divinity: 0, indestructible: false }, graveyard: { divinity: 0, indestructible: false } });
  });
});
