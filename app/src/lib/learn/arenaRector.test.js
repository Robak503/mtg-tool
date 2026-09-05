/**
 * ARENA RECTOR — the optional-exile-self payment's "IF you do" wording, and the planeswalker fetch onto the battlefield.
 * SHELF-85 · Atraxa A3, 2026-09-05.
 * "When this creature dies, you may exile it. If you do, search your library for a planeswalker card, put it onto the
 * battlefield, then shuffle."
 *
 * Two arms, one card. (1) The optional-exile-self lane (Undead Butler, "you may exile it. When you do, …") reads the
 * conditional wording too — the cost is the same real graveyard → exile move at settle, and the payoff runs only on
 * that move (CR 603.7 / CR 117.12). Greenwarden of Murasa rides along (its payoff already parsed). (2) The battlefield
 * tutor's admission list gains a GUARANTEED-PLANESWALKER arm beside land / creature / bare permanent: enterCardFromZone
 * already stamps a walker's entry loyalty from any zone, so the list was the only gate. Enchantments stay OUT — an Aura
 * entering un-cast must choose what it enchants (CR 303.4f) and the battlefield path has no such choice; Academy Rector
 * keeps parking, on purpose (the CREED).
 *
 * Mutation-checked: see the run ledger (docs-sk97).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalExileSelfChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RECTOR = { id: "ar-c", name: "Arena Rector", type: "Creature — Human Cleric", power: "1", toughness: "2", mana: "{3}{W}", keywords: [],
  oracle: "When this creature dies, you may exile it. If you do, search your library for a planeswalker card, put it onto the battlefield, then shuffle." };
const GREENWARDEN = { id: "gw-c", name: "Greenwarden of Murasa", type: "Creature — Elemental", power: "5", toughness: "5", mana: "{4}{G}{G}", keywords: [],
  oracle: "When this creature enters, you may return target card from your graveyard to your hand.\nWhen this creature dies, you may exile it. If you do, return target card from your graveyard to your hand." };
const ACADEMY = { id: "ac-c", name: "Academy Rector", type: "Creature — Human Cleric", power: "1", toughness: "2", mana: "{3}{W}", keywords: [],
  oracle: "When this creature dies, you may exile it. If you do, search your library for an enchantment card, put that card onto the battlefield, then shuffle." };

describe("parse + classify", () => {
  it("Rector's dies effect parses to ONE pausing wrapper with the planeswalker battlefield tutor nested; Greenwarden's to the graveyard return; both cards native", () => {
    const p = parseEffectClause("you may exile it. If you do, search your library for a planeswalker card, put it onto the battlefield, then shuffle", "Creature");
    const g = parseEffectClause("you may exile it. If you do, return target card from your graveyard to your hand", "Creature");
    const row = { conf: programConfidence(p), gConf: programConfidence(g), rector: classifyCard(RECTOR), greenwarden: classifyCard(GREENWARDEN) };
    console.log("  WITNESS arenaRector", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "optional-exile-self-payment", targetType: null,
      effectAtoms: [{ op: "tutor", filter: { groups: [["planeswalker"]] }, filterLabel: "planeswalker card", destination: "battlefield", entersTapped: false, targetType: null }] });
    expect(row.gConf).toBe("high");
    expect(g.atoms[0]).toMatchObject({ op: "optional-exile-self-payment", targetType: "graveyardCard",
      effectAtoms: [{ op: "return-from-graveyard", targetType: "graveyardCard", excludeTriggeringCard: true }] });
    expect(row.rector).toBe("native-trigger");
    expect(row.greenwarden).toBe("native-trigger");
  });

  it("seen-to-fail: a chained second conditional nulls; the ENCHANTMENT battlefield fetch stays low (an Aura would land unattached); Academy Rector parks", () => {
    const row = {
      chained: programConfidence(parseEffectClause("you may exile it. If you do, draw a card. If you do, draw a card", "Creature")),
      enchantment: programConfidence(parseEffectClause("search your library for an enchantment card, put that card onto the battlefield, then shuffle", "Creature")),
      academy: classifyCard(ACADEMY),
    };
    console.log("  WITNESS arenaRectorRefusals", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.chained).toBe("low");
    expect(row.enchantment).toBe("low");
    expect(row.academy).not.toMatch(/^native/);
  });
});

const WALKER = { id: "g-walker", name: "Gideon Jura", type: "Legendary Planeswalker — Gideon", mana: "{3}{W}{W}", loyalty: "6", keywords: [],
  oracle: "+2: During target opponent's next turn, creatures that player controls attack Gideon Jura if able." };
const BEAR = { id: "g-bear", name: "Library Bear", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };

/** Kill the Rector through the real lethal pipeline and flush its dies trigger to the pause. */
function dieAndPause() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const rector = createPermanent({ id: "ar", card: RECTOR, controller: "user" });
  let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [{ ...rector, damageMarked: 99 }], library: [BEAR, WALKER] } } };
  const lethal = destroyLethalCreatures(s);
  s = checkDiesTriggers(lethal.state, lethal.dead);
  s = flushTriggers(s, {});
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
}

describe("RUNTIME — pay exiles the Rector and fetches a walker onto the battlefield with its loyalty; decline does nothing; a vanished card never yields the payoff", () => {
  it("PAY: Rector graveyard → exile; the search offers ONLY the planeswalker; the pick enters with loyalty 6 and the library keeps the bear", () => {
    const paused = dieAndPause();
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-exile-self-payment", controller: "user", available: true, cardId: "ar-c" });
    const searching = resolveOptionalExileSelfChoice(paused, true);
    expect(searching.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "user", destination: "battlefield" });
    const offered = (searching.pendingChoice.candidates || []).map((c) => c.id);
    const out = resolveTutorChoice(searching, "g-walker");
    const walker = out.players.user.battlefield.find((p) => p.card?.id === "g-walker" || p.cardId === "g-walker" || p.name === "Gideon Jura");
    const row = {
      rectorExiled: out.players.user.exile.some((c) => c.id === "ar-c"),
      rectorInGy: out.players.user.graveyard.some((c) => c.id === "ar-c"),
      offered,
      walkerOnBattlefield: !!walker,
      loyalty: walker?.counters?.loyalty ?? null,
      libraryLeft: out.players.user.library.map((c) => c.id),
      pending: out.pendingChoice?.kind ?? null,
    };
    console.log("  WITNESS arenaRectorPay", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ rectorExiled: true, rectorInGy: false, offered: ["g-walker"], walkerOnBattlefield: true, loyalty: 6, libraryLeft: ["g-bear"], pending: null });
  });

  it("DECLINE: the Rector stays in the graveyard, no search opens, the library is untouched", () => {
    const paused = dieAndPause();
    const out = resolveOptionalExileSelfChoice(paused, false);
    const row = { rectorInGy: out.players.user.graveyard.some((c) => c.id === "ar-c"), exile: out.players.user.exile.length, pending: out.pendingChoice?.kind ?? null, library: out.players.user.library.map((c) => c.id) };
    console.log("  WITNESS arenaRectorDecline", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ rectorInGy: true, exile: 0, pending: null, library: ["g-bear", "g-walker"] });
  });

  it("the Rector VANISHES during the pause → taking pays nothing and no search ever opens", () => {
    const paused = dieAndPause();
    const drained = { ...paused, players: { ...paused.players, user: { ...paused.players.user, graveyard: paused.players.user.graveyard.filter((c) => c.id !== "ar-c") } } };
    const out = resolveOptionalExileSelfChoice(drained, true);
    expect(out.players.user.exile).toHaveLength(0);
    expect(out.pendingChoice?.kind ?? null).toBe(null);
    expect(out.players.user.library.map((c) => c.id)).toEqual(["g-bear", "g-walker"]);
    expect((out.log || []).some((e) => e.effect === "optional-exile-self" && e.paid === false)).toBe(true);
  });
});
