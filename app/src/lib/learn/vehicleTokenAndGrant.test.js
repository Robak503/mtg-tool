/**
 * vehicleTokenAndGrant.test.js — the Vehicle token and "Vehicles you control have <keyword>" (shelf decks D32, 2026-09-30:
 * Shorikai Vehicles' Mu Yanling, Wind Rider).
 *
 * "create a 3/2 colorless Vehicle artifact token with crew 1" mints an ARTIFACT, not a creature: it has its printed P/T only
 * while crewed into one (CR 301.7a, 702.122a), so the token carries an explicit "Token Artifact — Vehicle" type line and its
 * Crew line as oracle — the crew action reads it like a printed Vehicle. "Vehicles you control have flying" rides the same
 * Artifact + Vehicle selector as Kotori's crew grant, so every Vehicle you control has it, crewed or not; the creature-only
 * tribal selector reached no Vehicle, which is why Aeronaut Admiral was parked as a false positive until now.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { createTokenClauseParser } from "./effects/atoms/tokens.js";
import { permanentHasKeyword, permanentIsCreature, permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MU = { name: "Mu Yanling, Wind Rider", type: "Legendary Creature — Human Wizard Pilot", mana: "{2}{U}{U}", power: "2", toughness: "4", keywords: [],
  oracle: "When Mu Yanling enters, create a 3/2 colorless Vehicle artifact token with crew 1.\nVehicles you control have flying.\nWhenever one or more creatures you control with flying deal combat damage to a player, draw a card." };
const ADMIRAL = { name: "Aeronaut Admiral", type: "Creature — Human Pilot", mana: "{3}{W}", power: "3", toughness: "1", keywords: ["Flying"], oracle: "Flying\nVehicles you control have flying." };
const WISH = { name: "Wish Good Luck", type: "Sorcery", mana: "{R}{G}", keywords: ["Treasure", "Food"], oracle: "Create a Food token.\nCreate a tapped Treasure token.\nCreate a 3/2 colorless Vehicle artifact token with crew 1." };
const EXPRESS = { name: "Untethered Express", type: "Artifact — Vehicle", mana: "{4}", power: "4", toughness: "4", keywords: ["Crew", "Trample"],
  oracle: "Trample\nWhenever this Vehicle attacks, put a +1/+1 counter on it.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };

function table({ user = [], ai = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const vehicleTokens = (s) => s.players.user.battlefield.filter((p) => p.card?.token && /Vehicle/.test(String(p.card?.type)));

describe("the cards", () => {
  it("all three read native; the token is a noncreature Vehicle with its Crew line; the grant rides the Artifact + Vehicle selector", () => {
    const vehicleSelector = { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Artifact"], subtypes: ["Vehicle"] } };
    expect({
      tiers: [classifyCard(MU), classifyCard(ADMIRAL), classifyCard(WISH)],
      token: parseEffectClause("create a 3/2 colorless Vehicle artifact token with crew 1", "Instant").atoms,
      grant: parseStaticAbilities({ name: "X", type: "Creature", oracle: "Vehicles you control have flying." }),
    }).toEqual({
      tiers: ["native-mixed", "native-static", "native-spell"],
      token: [{ op: "create-token", count: 1, power: 3, toughness: 2, descriptor: "colorless vehicle artifact", tokenType: "Token Artifact — Vehicle", name: "Vehicle", tokenOracle: "Crew 1", keywords: [], targetType: null }],
      grant: [{ layer: 6, op: { layerOp: "addKeyword", keyword: "Flying" }, affects: vehicleSelector, duration: { kind: "permanent" } }],
    });
  });
  it("SYNTHETIC fences: the crew grant stays the crew grant; an ungrantable word parks the line; a coloured Vehicle token is not this arm", () => {
    const statics = (o) => parseStaticAbilities({ name: "X", type: "Creature", oracle: o });
    expect({
      crew: statics("Vehicles you control have crew 2.").map((d) => d.op.layerOp),
      gizmo: statics("Vehicles you control have gizmo."),
      redToken: parseEffectClause("create a 3/2 red Vehicle artifact token with crew 1", "Instant").atoms,
      // an attacking rider would be silently dropped by this arm — so it refuses. Asked of the clause parser DIRECTLY: the
      // splitter cuts "tapped and attacking" before a full parse could ever deliver the clause whole.
      attacking: createTokenClauseParser("create two 3/2 colorless vehicle artifact tokens with crew 1 that are tapped and attacking"),
    }).toEqual({ crew: ["crewOverride"], gizmo: [], redToken: [], attacking: null });
  });
});

describe("⭐ in play", () => {
  it("⭐ Mu Yanling enters: a Vehicle token, an artifact and no creature, already flying; crewed by Mu Yanling, it is a 3/2 flying artifact creature", () => {
    const mu = P("mu", MU);
    const s = settle(checkEnterTriggers(table({ user: [mu] }), mu));
    const [veh] = vehicleTokens(s);
    const crew = legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === veh?.id);
    const crewed = crew ? settle(dispatchAction(s, crew)) : s;
    const row = { type: veh?.card?.type, name: veh?.card?.name, creature: !!veh && permanentIsCreature(s, veh.id), flies: !!veh && permanentHasKeyword(s, veh.id, "Flying"),
      crewOffered: crew?.crew ?? null, crewedCreature: !!veh && permanentIsCreature(crewed, veh.id), pt: veh ? [permanentPower(crewed, veh.id), permanentToughness(crewed, veh.id)] : null,
      crewedFlies: !!veh && permanentHasKeyword(crewed, veh.id, "Flying") };
    console.log(`WITNESS muYanling ${JSON.stringify(row)}`);
    expect(row).toEqual({ type: "Token Artifact — Vehicle", name: "Vehicle", creature: false, flies: true, crewOffered: 1, crewedCreature: true, pt: [3, 2], crewedFlies: true });
  });
  it("Aeronaut Admiral: your Untethered Express has flying; the opponent's does not", () => {
    const s = table({ user: [P("admiral", ADMIRAL), P("express", EXPRESS)], ai: [P("aiExpress", EXPRESS, "ai")] });
    expect({ mine: permanentHasKeyword(s, "express", "Flying"), theirs: permanentHasKeyword(s, "aiExpress", "Flying") }).toEqual({ mine: true, theirs: false });
  });
  it("Wish Good Luck: a Food, a tapped Treasure and the 3/2 crew-1 Vehicle token", () => {
    const s0 = table({ hand: [["wish", WISH]], mana: { R: 1, G: 1 } });
    const s = settle(dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "wish")));
    const toks = s.players.user.battlefield.filter((p) => p.card?.token).map((p) => `${p.card.name}${p.tapped ? " (tapped)" : ""}`).sort();
    const [veh] = vehicleTokens(s);
    expect({ toks, vehiclePT: [veh?.card?.power, veh?.card?.toughness], crew: veh?.card?.oracle }).toEqual({ toks: ["Food", "Treasure (tapped)", "Vehicle"], vehiclePT: [3, 2], crew: "Crew 1" });
  });
});
