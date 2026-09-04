/**
 * plazaOfHeroes.test.js — SHELF-85 runbook Phase 2 · S17 (2026-09-04): Plaza of Heroes (Shorikai) + Kotori's grant half.
 *
 *   "{T}: Add {C}.
 *    {T}: Add one mana of any color. Spend this mana only to cast a legendary spell.
 *    {T}: Add one mana of any color among legendary permanents you control.
 *    {3}, {T}, Exile this land: Target legendary creature gains hexproof and indestructible until end of turn."
 *
 * Three small pieces: "legendary" joined the restricted-spend type words; the "any color among legendary permanents
 * you control" line — which the free any-colour arm used to LAUNDER into an unrestricted source — now narrows to the
 * live colours of the controller's legendary permanents (none → not offered); the keyword-grant lane gained the
 * legendary-restricted form (and the artifact-creature-you-control form Kotori needs), with the splitter's keep-whole
 * widened so "hexproof and indestructible" survives. The extras builder now treats a restricted line as its own record.
 *
 * Twins audited whole-card: Shizo / Shinka / Daily Bugle Building (the legendary grant), Untaidake (the legendary spend
 * word — its only mana line, offered with its life cost), Great Hall of the Citadel (the spend word; its {1},{T} costed
 * line is the pre-existing never-offered class — a runtime under-offer, noted).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { manaSources, parseSpendRestriction } from "./manaModel.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PLAZA = { id: "c-poh", name: "Plaza of Heroes", type: "Land", keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a legendary spell.\n{T}: Add one mana of any color among legendary permanents you control.\n{3}, {T}, Exile this land: Target legendary creature gains hexproof and indestructible until end of turn." };
const KOTORI_GRANT = "Target artifact creature you control gains lifelink and vigilance until end of turn.";
const twin = (name, type, oracle) => ({ id: "c-" + name, name, type, keywords: [], oracle });
const TWINS = [
  twin("Shizo, Death's Storehouse", "Legendary Land", "{T}: Add {B}.\n{B}, {T}: Target legendary creature gains fear until end of turn. (It can't be blocked except by artifact creatures and/or black creatures.)"),
  twin("Shinka, the Bloodsoaked Keep", "Legendary Land", "{T}: Add {R}.\n{R}, {T}: Target legendary creature gains first strike until end of turn."),
  twin("Untaidake, the Cloud Keeper", "Legendary Land", "Untaidake enters tapped.\n{T}, Pay 2 life: Add {C}{C}. Spend this mana only to cast legendary spells."),
];
const LEG = (id, ctrl, colors) => createPermanent({ id, card: { id: "card-" + id, name: "Legend " + id, type: "Legendary Creature — Human", colors, power: 3, toughness: 3, oracle: "" }, controller: ctrl });
const plains = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: "user" });
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("the legendary spend word; the legendary grant (pair kept whole); Kotori's artifact-creature grant", () => {
    expect(parseSpendRestriction("{T}: Add one mana of any color. Spend this mana only to cast a legendary spell.")).toEqual({ castTypes: ["legendary"] });
    const g = parseEffectClause("Target legendary creature gains hexproof and indestructible until end of turn.", "Land");
    expect(programConfidence(g)).toBe("high");
    expect(g.atoms).toEqual([{ op: "pump", targetType: "creature", restrictions: [{ kind: "supertype", value: "Legendary" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["hexproof", "indestructible"] }]);
    expect(parseEffectClause(KOTORI_GRANT, "Creature").atoms).toEqual([{ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }, { kind: "cardType", type: "artifact" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["Lifelink", "Vigilance"] }]);
  });
});

describe("runtime — the three mana lines and the grant", () => {
  it("with a W/U legend: three sources — {C}, the legendary-only any colour, and W/U among legendary permanents", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "POH", card: PLAZA, controller: "user" }), LEG("L1", "user", ["W", "U"])] } } };
    const src = manaSources(s, "user").filter((x) => x.permanentId === "POH").map((x) => ({ colors: x.colors.slice().sort(), restriction: x.restriction || null }));
    expect(src).toContainEqual({ colors: ["C"], restriction: null });
    expect(src).toContainEqual({ colors: ["B", "G", "R", "U", "W"], restriction: { castTypes: ["legendary"] } });
    expect(src).toContainEqual({ colors: ["U", "W"], restriction: null });
    expect(src).toHaveLength(3);
  });
  it("with NO legendary permanent the among-line is not offered — never a free any colour", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "POH", card: PLAZA, controller: "user" })] } } };
    const src = manaSources(s, "user").filter((x) => x.permanentId === "POH");
    expect(src.some((x) => !x.restriction && x.colors.length > 1)).toBe(false);
    expect(src.some((x) => x.colors.join() === "C")).toBe(true);
  });
  it("the exile-self grant targets only LEGENDARY creatures, any controller, and the Plaza leaves", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
      players: { ...s.players,
        user: { ...s.players.user, battlefield: [createPermanent({ id: "POH", card: PLAZA, controller: "user" }), LEG("L1", "user", ["W"]), createPermanent({ id: "BEAR", card: { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" }), plains("P1"), plains("P2"), plains("P3")] },
        ai: { ...s.players.ai, battlefield: [LEG("L2", "ai", ["B"])] } } };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "POH" && a.targets?.length);
    expect(acts.map((a) => a.targets[0].id).sort()).toEqual(["L1", "L2"]);
    s = dispatchAction(s, acts.find((a) => a.targets[0].id === "L1"));
    s = resolveAll(s);
    expect(permanentHasKeyword(s, "L1", "Hexproof")).toBe(true);
    expect(permanentHasKeyword(s, "L1", "Indestructible")).toBe(true);
    expect(s.players.user.battlefield.some((p) => p.id === "POH")).toBe(false); // exiled as the cost
    expect(s.players.user.exile.some((c) => c.id === "c-poh")).toBe(true);
  });
});

describe("classifier", () => {
  it("Plaza of Heroes and the three honest twins are full lands", () => {
    expect(classifyCard(PLAZA)).toBe("land");
    for (const t of TWINS) expect(classifyCard(t)).toBe("land");
  });
});
