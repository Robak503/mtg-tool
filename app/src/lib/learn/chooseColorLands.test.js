/**
 * chooseColorLands.test.js — LANDS-TIER slice 12 (2026-09-03): lands that CHOOSE A COLOR as they enter —
 * "This land enters tapped. As it enters, choose a color [other than <X>]." + "{T}: Add [{X} or] one mana of
 * the chosen color." — the Thriving cycle (5), the Baldur's Gate Gates (6), Night Market, Uncharted Haven,
 * Crossroads Village, Shimmerdrift Vale, Mirage Mesa, Valgavoth's Lair, Sunken Citadel … ~24 corpus lands.
 *
 * THE STAMP EXISTED (Utopia Sprawl's Aura, CR 614.12b — `chosenColor` on the permanent, auto-picked as the
 * controller's most-needed casting color). Three pieces were missing: a LAND reader for the choose sentence
 * (with the printed "other than <X>" exclusion), the play-land stamp (the tutor site already stamped Auras),
 * and a `chosenColor` LEG in the mana-spec parser, resolved at manaSources against the live permanent — an
 * unstamped permanent yields only its fixed option, never a guessed color.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { choosesColorOnEnter } from "./staticAbilityParser.js";
import { manaProduction, manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const L = (name, oracle, type = "Land") => ({ id: "c-" + name.replace(/\W+/g, "").toLowerCase(), name, type, oracle });
const NIGHT_MARKET = L("Night Market", "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.\nCycling {3} ({3}, Discard this card: Draw a card.)");
const THRIVING_ISLE = L("Thriving Isle", "This land enters tapped. As it enters, choose a color other than blue.\n{T}: Add {U} or one mana of the chosen color.");
const SEA_GATE = L("Sea Gate", "This land enters tapped.\nAs this land enters, choose a color other than blue.\n{T}: Add {U} or one mana of the chosen color.", "Land — Gate");
const UNCHARTED = L("Uncharted Haven", "This land enters tapped. As it enters, choose a color.\n{T}: Add one mana of the chosen color.");

describe("the reader", () => {
  it("reads both printed subjects and the exclusion", () => {
    expect(choosesColorOnEnter(NIGHT_MARKET)).toEqual({ exclude: null });
    expect(choosesColorOnEnter(THRIVING_ISLE)).toEqual({ exclude: "U" });
    expect(choosesColorOnEnter(SEA_GATE)).toEqual({ exclude: "U" });
  });

  it("⛔ the Aura subject (its own lane), a creature-type choice, and a rider are refused", () => {
    // The reader is permanent-type-agnostic on purpose (Coldsteel Heart, Silhana Starfletcher print the same
    // sentence); the one subject it leaves alone is "this Aura", which auraChoosesColorOnEnter owns.
    expect(choosesColorOnEnter(L("Probe Aura", "Enchant land\nAs this Aura enters, choose a color.\nEnchanted land has \"{T}: Add one mana of the chosen color.\"", "Enchantment — Aura"))).toBeNull();
    expect(choosesColorOnEnter(L("Probe Type", "This land enters tapped. As it enters, choose a creature type.\n{T}: Add {C}."))).toBeNull();
    expect(choosesColorOnEnter(L("Probe Rider", "This land enters tapped. As it enters, choose a color for each opponent.\n{T}: Add {C}."))).toBeNull();
  });
});

describe("the mana-spec parser — a chosen-color leg, fixed option kept apart", () => {
  it("'one mana of the chosen color' → chosenColor with no fixed color; '{U} or …' keeps U as the fixed option", () => {
    expect(manaProduction(NIGHT_MARKET)).toMatchObject({ colors: [], amount: 1, chosenColor: true });
    expect(manaProduction(THRIVING_ISLE)).toMatchObject({ colors: ["U"], amount: 1, chosenColor: true });
  });
});

const handOf = (cards) => cards.map((c, i) => ({ id: `h${i}`, ...c }));
const GREEN_SPELL = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", mana_cost: "{1}{G}" };
const BLUE_SPELL = { name: "Opt", type: "Instant", mana: "{U}", mana_cost: "{U}" };

function playLand(card, hand) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const st = {
    ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...card, id: "L" }, ...handOf(hand)], library: [], battlefield: [], landsPlayedThisTurn: 0 } },
  };
  const out = dispatchAction(st, { kind: "play-land", playerId: "user", cardId: "L" });
  return { state: out, perm: out.players.user.battlefield.find((p) => p.card?.name === card.name) };
}
const untap = (state, id) => ({ ...state, players: { ...state.players, user: { ...state.players.user, battlefield: state.players.user.battlefield.map((p) => (p.id === id ? { ...p, tapped: false } : p)) } } });
const colorsOf = (state, id) => (manaSources(state, "user").find((s) => s.permanentId === id)?.colors || []).slice().sort();

describe("play-land path — the choice is stamped from the hand's needs, then the land taps for it", () => {
  it("⭐ Night Market with a green hand: chosenColor G; enters tapped; once untapped it is a G source", () => {
    const { state, perm } = playLand(NIGHT_MARKET, [GREEN_SPELL]);
    expect(perm.tapped).toBe(true);
    expect(perm.chosenColor).toBe("G");
    expect(colorsOf(untap(state, perm.id), perm.id)).toEqual(["G"]);
  });

  it("⛔ Thriving Isle honours 'other than blue': a blue-only hand still picks a non-blue color, and the source offers U plus it", () => {
    const { state, perm } = playLand(THRIVING_ISLE, [BLUE_SPELL]);
    expect(perm.chosenColor).not.toBe("U");
    expect(perm.chosenColor).toMatch(/^[WBRG]$/);
    expect(colorsOf(untap(state, perm.id), perm.id)).toEqual(["U", perm.chosenColor].sort());
  });

  it("⛔ an UNSTAMPED chosen-color land yields nothing (never a guessed color); a fixed option survives alone", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bare = createPermanent({ id: "nm", card: NIGHT_MARKET, controller: "user", summoningSick: false });
    const thriving = createPermanent({ id: "ti", card: THRIVING_ISLE, controller: "user", summoningSick: false });
    const st = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bare, thriving] } } };
    expect(manaSources(st, "user").some((s) => s.permanentId === "nm")).toBe(false);
    expect(colorsOf(st, "ti")).toEqual(["U"]);
  });
});

describe("tutor site — the same stamp, for ANY permanent that prints the choice", () => {
  it("a Night Market put onto the battlefield by an effect is stamped too", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: handOf([GREEN_SPELL]) } } };
    const out = enterPermanent(st, NIGHT_MARKET, "user");
    expect(out.players.user.battlefield.find((p) => p.card.name === "Night Market").chosenColor).toBe("G");
  });

  it("⭐ Coldsteel Heart (an artifact) is stamped and taps for the chosen color; a mana line with NO printed choice is refused", () => {
    const HEART = { id: "c-heart", name: "Coldsteel Heart", type: "Snow Artifact", mana: "{2}", oracle: "This artifact enters tapped.\nAs this artifact enters, choose a color.\n{T}: Add one mana of the chosen color." };
    expect(choosesColorOnEnter(HEART)).toEqual({ exclude: null });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: handOf([GREEN_SPELL]) } } };
    const out = enterPermanent(st, HEART, "user");
    const heart = out.players.user.battlefield.find((p) => p.card.name === "Coldsteel Heart");
    expect(heart.chosenColor).toBe("G");
    expect(colorsOf(untap(out, heart.id), heart.id)).toEqual(["G"]);
    // ⛔ no choice printed → no stamp possible → the parser refuses the line (never an unreachable source)
    expect(manaProduction({ name: "Probe Unchosen", type: "Artifact", oracle: "{T}: Add one mana of the chosen color." })).toBeFalsy();
  });
});

describe("classification", () => {
  it("the choose-a-color lands are `land`; a creature-type chooser is not", () => {
    expect(classifyCard(NIGHT_MARKET)).toBe("land");
    expect(classifyCard(THRIVING_ISLE)).toBe("land");
    expect(classifyCard(SEA_GATE)).toBe("land");
    expect(classifyCard(UNCHARTED)).toBe("land");
    expect(classifyCard(L("Probe Type", "This land enters tapped. As it enters, choose a creature type.\n{T}: Add one mana of the chosen color."))).toBe("land-partial");
  });
});
