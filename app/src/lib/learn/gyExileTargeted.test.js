/**
 * gyExileTargeted.test.js — CORPUS ④-T (2026-09-03 night): GY-3 — the TARGETED graveyard exile-cost ability. "{2}, Exile
 * this card from your graveyard: Exile target card from a graveyard." (Gravestone Strider) and the Ikoria "+1/+1
 * counter on target creature. Activate only as a sorcery." cycle. GY-2 refused any targeted program ("v1 — GY-3 adds
 * enumeration"); now the shared parse admits it, the graveyard lane expands targets through the same helper the
 * battlefield activated lane uses, and the dispatcher threads them onto the stack object. The card's own id rides
 * as the source so an "another target … card from your graveyard" restriction never offers the card being exiled.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseGraveyardExileAbility } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STRIDER = { id: "c-gs", name: "Gravestone Strider", type: "Artifact Creature — Construct", mana: "{3}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "{1}: Add one mana of any color. Activate only once each turn.\n{2}, Exile this card from your graveyard: Exile target card from a graveyard." };
const HELICA = { id: "c-hg", name: "Helica Glider", type: "Creature — Nightmare Squirrel", mana: "{1}{W}", cmc: 2, power: 2, toughness: 2, keywords: ["Flying"],
  oracle: "Flying\n{3}{W}, Exile this card from your graveyard: Put a +1/+1 counter on target creature. It gains flying until end of turn. Activate only as a sorcery." };
const gyCard = (id, name, type = "Instant") => ({ id, name, type, cmc: 1, keywords: [], oracle: "" });

function board({ userGy = [], aiGy = [], userBf = [], pool = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [], graveyard: userGy, exile: [], battlefield: userBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, graveyard: aiGy, exile: [], battlefield: [] } } };
}
const gyActs = (s, cardId) => filterActions(legalActionsForPlayer(s, "user"), "activate-gy-exile").filter((a) => a.cardId === cardId);

describe("the parse + the tiers", () => {
  it("⭐ the targeted program is admitted and flagged; the untargeted form is unchanged", () => {
    expect(parseGraveyardExileAbility(STRIDER)).toMatchObject({ manaPips: "{2}", targeted: true });
    expect(parseGraveyardExileAbility({ ...STRIDER, oracle: "{2}, Exile this card from your graveyard: Draw a card." })).toMatchObject({ targeted: false });
  });
  it("⭐ Gravestone Strider and Helica Glider are native", () => {
    expect(classifyCard(STRIDER)).toMatch(/^native/);
    expect(classifyCard(HELICA)).toMatch(/^native/);
  });
});

describe("runtime — one activation per legal target, targets ride the stack", () => {
  it("⭐ Strider in our graveyard, {2}: offered on each OTHER graveyard card (never itself); resolving exiles the pick and the Strider", () => {
    const s = board({ userGy: [STRIDER, gyCard("u1", "Our Spell")], aiGy: [gyCard("a1", "Their Spell")], pool: { C: 2 } });
    const acts = gyActs(s, "c-gs");
    expect(acts.map((a) => a.targets[0]?.id).sort()).toEqual(["a1", "u1"]);
    const act = acts.find((a) => a.targets[0].id === "a1");
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(out.players.ai.exile.map((c) => c.name)).toEqual(["Their Spell"]);
    expect(out.players.ai.graveyard.length).toBe(0);
    expect(out.players.user.exile.map((c) => c.name)).toEqual(["Gravestone Strider"]);
    expect(out.players.user.graveyard.map((c) => c.name)).toEqual(["Our Spell"]);
  });
  it("⛔ with NO other graveyard card there is no legal target → not offered", () => {
    expect(gyActs(board({ userGy: [STRIDER], pool: { C: 2 } }), "c-gs").length).toBe(0);
  });
  it("⭐ RENEW (Alchemist's Assistant): credited AND offered from the same parse — the lifelink counter lands on the chosen creature", () => {
    // Found by the flip-diff audit: four Renew cards were credited while the lane returned nothing for them.
    const ALCH = { id: "c-al", name: "Alchemist's Assistant", type: "Creature — Human Warlock", mana: "{2}{B}", cmc: 3, power: 2, toughness: 3, keywords: ["Lifelink"],
      oracle: "Lifelink\nRenew — {1}{B}, Exile this card from your graveyard: Put a lifelink counter on target creature. Activate only as a sorcery." };
    expect(classifyCard(ALCH)).toMatch(/^native/);
    expect(parseGraveyardExileAbility(ALCH)).toMatchObject({ manaPips: "{1}{B}", targeted: true, sorceryOnly: true });
    const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });
    const s = board({ userGy: [ALCH], userBf: [bear], pool: { B: 1, C: 1 } });
    const act = gyActs(s, "c-al").find((a) => a.targets[0]?.id === "bear");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "bear").permanent.counters.lifelink).toBe(1);
    expect(out.players.user.exile.map((c) => c.name)).toEqual(["Alchemist's Assistant"]);
  });
  it("⭐ Helica Glider: the counter lands on the chosen creature and it flies this turn; sorcery-speed only", () => {
    const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });
    const s = board({ userGy: [HELICA], userBf: [bear], pool: { W: 1, C: 3 } });
    const act = gyActs(s, "c-hg").find((a) => a.targets[0]?.id === "bear");
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "bear").permanent.counters["+1/+1"]).toBe(1);
    expect(out.players.user.exile.map((c) => c.name)).toEqual(["Helica Glider"]);
    const offTurn = { ...s, activePlayer: "ai", phase: "precombat-main" };
    expect(gyActs(offTurn, "c-hg").length).toBe(0);
  });
});
