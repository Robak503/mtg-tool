/**
 * graveyardCastPermission.test.js — "You may cast that card this turn" (shelf decks D30, 2026-09-30: Shorikai Vehicles' Emry,
 * Lurker of the Loch). "{T}: Choose target artifact card in your graveyard. You may cast that card this turn." — and Silas Renn,
 * Seeker Adept's combat-damage twin.
 *
 * The permission is recorded in state.gyCastPermissions by CARD ID, never on the card; any graveyard event for the card ends it
 * (gameState.recordGraveyardEvents — cast, returned, exiled or arriving anew is a new object, CR 400.7). legalChoices offers the
 * cast at full cost through the shared graveyard builder, this turn and to this player only (CR 601.3).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EMRY = { name: "Emry, Lurker of the Loch", type: "Legendary Creature — Merfolk Wizard", mana: "{2}{U}", power: "1", toughness: "2", keywords: ["Affinity", "Mill"],
  oracle: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nWhen Emry enters, mill four cards.\n{T}: Choose target artifact card in your graveyard. You may cast that card this turn. (You still pay its costs. Timing rules still apply.)" };
const SILAS = { name: "Silas Renn, Seeker Adept", type: "Legendary Artifact Creature — Human", mana: "{1}{U}{B}", power: "2", toughness: "2", keywords: ["Partner", "Deathtouch"],
  oracle: "Deathtouch\nWhenever Silas Renn deals combat damage to a player, choose target artifact card in your graveyard. You may cast that card this turn.\nPartner (You can have two commanders if both have partner.)" };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const SEAT = { name: "Seat of the Synod", type: "Artifact Land", mana: "", cmc: 0, keywords: [], oracle: "{T}: Add {U}." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

function table({ user = [], graveyard = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, graveyard: graveyard.map(([id, c]) => ({ ...c, id })), library: lib, manaPool: { ...g.players.user.manaPool, ...mana } } } };
}
const P = (id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false });
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const gyCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && s.players.user.graveyard.some((c) => c.id === a.cardId)).map((a) => a.cardId).sort();
const emryOn = (s, target) => settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "emry" && a.targets?.[0]?.id === target)));
const onField = (s, cardId) => s.players.user.battlefield.some((p) => p.card?.id === cardId);

describe("the cards", () => {
  it("both read native; the two printed forms are one atom; a rider after it, or an unmodeled filter, stays LOW (SYNTHETIC)", () => {
    const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
    expect({
      tiers: [classifyCard(EMRY), classifyCard(SILAS)],
      choose: parseEffectClause("Choose target artifact card in your graveyard. You may cast that card this turn.", "Instant").atoms,
      direct: parseEffectClause("You may cast target enchantment card from your graveyard this turn.", "Instant").atoms,
      rider: conf("You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead."),
      subtype: conf("You may cast target Zombie creature card from your graveyard this turn."),
    }).toEqual({
      tiers: ["native-mixed", "native-trigger"],
      choose: [{ op: "gy-cast-permission", targetType: "graveyardCard", cardFilter: "artifact" }],
      direct: [{ op: "gy-cast-permission", targetType: "graveyardCard", cardFilter: "enchantment" }],
      rider: "low", subtype: "low",
    });
  });
});

describe("⭐ Emry in play", () => {
  const board = () => table({ user: [P("emry", EMRY)], graveyard: [["stone", MIND_STONE], ["thopter", ORNITHOPTER], ["bear", BEAR]], mana: { C: 3 } });

  it("⭐ only artifact cards are offered as the target; the chosen one — and only it — is castable from the graveyard, and it resolves", () => {
    const s0 = board();
    const targets = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "emry").map((a) => a.targets?.[0]?.id).sort();
    const before = gyCasts(s0);
    const s = emryOn(s0, "stone");
    const offered = gyCasts(s);
    const after = settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "stone")));
    const row = { targets, before, offered, onField: onField(after, "stone"), stillInGraveyard: after.players.user.graveyard.some((c) => c.id === "stone") };
    console.log(`WITNESS emry ${JSON.stringify(row)}`);
    expect(row).toEqual({ targets: ["stone", "thopter"], before: [], offered: ["stone"], onField: true, stillInGraveyard: false });
  });
  it("cast, sacrificed, back in the graveyard the same turn: NOT castable again — a new object (CR 400.7)", () => {
    const s = emryOn(board(), "stone");
    const cast = settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "stone")));
    const withMana = { ...cast, players: { ...cast.players, user: { ...cast.players.user, manaPool: { ...cast.players.user.manaPool, C: 3 } } } };
    const sacked = settle(dispatchAction(withMana, legalActionsForPlayer(withMana, "user").find((a) => a.kind === "activate-ability" && a.permanentId !== "emry" && a.sacSelf)));
    expect({ backInGraveyard: sacked.players.user.graveyard.some((c) => c.id === "stone"), castable: gyCasts(sacked).includes("stone") }).toEqual({ backInGraveyard: true, castable: false });
  });
  it("an artifact LAND is a legal target, but a land is never cast — nothing is offered", () => {
    const s0 = table({ user: [P("emry", EMRY)], graveyard: [["seat", SEAT]] });
    const s = emryOn(s0, "seat");
    expect({ permitted: !!s.gyCastPermissions?.seat, offered: gyCasts(s) }).toEqual({ permitted: true, offered: [] });
  });
  it("SYNTHETIC response: the target leaves the graveyard before the ability resolves — no permission, nothing offered", () => {
    const s0 = board();
    let s = dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "emry" && a.targets?.[0]?.id === "stone"));
    const stone = s.players.user.graveyard.find((c) => c.id === "stone");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: s.players.user.graveyard.filter((c) => c.id !== "stone"), exile: [...(s.players.user.exile || []), stone] } } };
    const after = settle(s);
    expect({ permitted: !!after.gyCastPermissions?.stone, offered: gyCasts(after) }).toEqual({ permitted: false, offered: [] });
  });
  it("the permission is this turn's: by the next turn it is gone", () => {
    const s = emryOn(board(), "stone");
    let n = s, g = 0;
    while (n.turn === 6 && g++ < 40) n = runStepActions(advanceStep(n));
    // Mana refilled so the only thing that can withhold the cast is the expired permission (the pool empties between phases).
    const ready = { ...n, activePlayer: "user", priorityHolder: "user", step: "main", phase: "precombat-main", players: { ...n.players, user: { ...n.players.user, manaPool: { ...n.players.user.manaPool, C: 3 } } } };
    expect({ turn: n.turn, offered: gyCasts(ready) }).toEqual({ turn: 7, offered: [] });
  });
});

describe("⭐ Silas Renn in play", () => {
  it("it connects: the trigger chooses an artifact card in YOUR graveyard, and that card is castable this turn", () => {
    const s0 = table({ user: [P("silas", SILAS)], graveyard: [["thopter", ORNITHOPTER], ["bear", BEAR]] });
    const s = settle(checkCombatDamageTriggers({ ...s0, phase: "combat", step: "combat-damage" }, [{ kind: "combat-damage-player", attackerId: "silas", attackingPlayer: "user", defender: "ai", amount: 2 }]));
    const main = { ...s, phase: "postcombat-main", step: "main" };
    expect({ offered: gyCasts(main) }).toEqual({ offered: ["thopter"] });
  });
});
