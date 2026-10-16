/**
 * dfcFaceUpMana.test.js — a card that prints a combined "Front // Back" type line makes the mana of the face that is up, and
 * nothing else (CR 712.8d; CR 712.14 — put onto the battlefield from anywhere but the stack, it enters front face up). The
 * engine never turns a back face up, so a transform card cast from hand, and a modal one put onto the battlefield by an
 * effect, sit there as the whole combined card; manaModel reads that card's front face (faceUpManaCard / faceUpTypeLine).
 *
 * Before, the mana parse decided land-ness on the combined type line and read both faces' text as one card: a back face's Land
 * made the front a land (raw oracle, reminder text and created-token quotes kept), so 88 corpus cards made mana no face that
 * is up prints (census 2026-10-16) — Storm the Vault tapped for {U} per artifact and sacrificed itself, a reanimated Drowner of
 * Truth paid {C} to sacrifice itself for {C}, Tamiyo, Inquisitive Student was a free untapped any-colour source.
 *
 * Every card is driven through the engine's real paths: the cast from hand, Reanimate, the land drop. Fixtures are copied
 * from the bundled Scryfall data (2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer, parseManaCost } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { canAfford, extraManaLineProducts, manaActivationCost, manaProduction, manaSources } from "./manaModel.js";
import { mdfcLandFaces } from "./modalDfc.js";
import { pickAction } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STORM = { id: "h-storm", name: "Storm the Vault // Vault of Catlacan", type: "Legendary Enchantment // Legendary Land", mana: "{2}{U}{R}", cmc: 4, keywords: ["Transform", "Treasure"], layout: "transform",
  oracle: "Storm the Vault - Legendary Enchantment {2}{U}{R}\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nAt the beginning of your end step, if you control five or more artifacts, transform Storm the Vault.\n//\nVault of Catlacan - Legendary Land \n(Transforms from Storm the Vault.)\n{T}: Add one mana of any color.\n{T}: Add {U} for each artifact you control." };
const DROWNER = { id: "h-drowner", name: "Drowner of Truth // Drowned Jungle", type: "Creature — Eldrazi // Land", mana: "{5}{G/U}{G/U}", cmc: 7, power: "7", toughness: "6", keywords: ["Devoid"], layout: "modal_dfc",
  oracle: "Drowner of Truth - Creature — Eldrazi {5}{G/U}{G/U}\nDevoid (This card has no color.)\nWhen you cast this spell, if {C} was spent to cast it, create two 0/1 colorless Eldrazi Spawn creature tokens with \"Sacrifice this token: Add {C}.\"\n//\nDrowned Jungle - Land \nThis land enters tapped.\n{T}: Add {G} or {U}." };
const TAMIYO = { id: "h-tamiyo", name: "Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar", type: "Legendary Creature — Moonfolk Wizard // Legendary Planeswalker — Tamiyo", mana: "{U}", cmc: 1, power: "0", toughness: "3", keywords: ["Flying", "Investigate", "Transform"], layout: "transform",
  oracle: "Tamiyo, Inquisitive Student - Legendary Creature — Moonfolk Wizard {U}\nFlying\nWhenever Tamiyo attacks, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\nWhen you draw your third card in a turn, exile Tamiyo, then return her to the battlefield transformed under her owner's control.\n//\nTamiyo, Seasoned Scholar - Legendary Planeswalker — Tamiyo \n+2: Until your next turn, whenever a creature attacks you or a planeswalker you control, it gets -1/-0 until end of turn.\n−3: Return target instant or sorcery card from your graveyard to your hand. If it's a green card, add one mana of any color.\n−7: Draw cards equal to half the number of cards in your library, rounded up. You get an emblem with \"You have no maximum hand size.\"" };
const GUARDIAN = { id: "h-guardian", name: "Golden Guardian // Gold-Forge Garrison", type: "Artifact Creature — Golem // Land", mana: "{4}", cmc: 4, power: "4", toughness: "4", keywords: ["Transform", "Fight", "Defender"], layout: "transform",
  oracle: "Golden Guardian - Artifact Creature — Golem {4}\nDefender\n{2}: This creature fights another target creature you control. When this creature dies this turn, return it to the battlefield transformed under your control.\n//\nGold-Forge Garrison - Land \n(Transforms from Golden Guardian.)\n{T}: Add two mana of any one color.\n{4}, {T}: Create a 4/4 colorless Golem artifact creature token." };
const ABBEY = { id: "h-abbey", name: "Westvale Abbey // Ormendahl, Profane Prince", type: "Land // Legendary Creature — Demon", mana: "", cmc: 0, keywords: ["Flying", "Lifelink", "Indestructible", "Transform", "Haste"], layout: "transform",
  oracle: "Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste" };
const REANIMATE = { id: "h-reanimate", name: "Reanimate", type: "Sorcery", mana: "{B}", cmc: 1, keywords: [], layout: "normal",
  oracle: "Put target creature card from a graveyard onto the battlefield under your control. You lose life equal to that card's mana value." };
const CORAL = { id: "h-coral", name: "Coral Merfolk", type: "Creature — Merfolk", mana: "{1}{U}", cmc: 2, power: "2", toughness: "1", keywords: [], layout: "normal", oracle: "" };
const URBORG = { id: "h-urborg", name: "Urborg, Tomb of Yawgmoth", type: "Legendary Land", mana: "", cmc: 0, keywords: [], layout: "normal", oracle: "Each land is a Swamp in addition to its other land types." };
const SINK = { id: "h-sink", name: "Sink into Stupor // Soporific Springs", type: "Instant // Land", mana: "{1}{U}{U}", cmc: 3, keywords: [], layout: "modal_dfc",
  oracle: "Sink into Stupor - Instant {1}{U}{U}\nReturn target spell or nonland permanent an opponent controls to its owner's hand.\n//\nSoporific Springs - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}." };
const GUILDGATE = { id: "h-gate", name: "Selesnya Guildgate", type: "Land — Gate", mana: "", cmc: 0, keywords: [], layout: "normal", oracle: "This land enters tapped.\n{T}: Add {G} or {W}." };
const PATHWAY = { id: "h-path", name: "Barkchannel Pathway // Tidechannel Pathway", type: "Land // Land", mana: "", cmc: 0, keywords: [], layout: "modal_dfc",
  oracle: "Barkchannel Pathway - Land \n{T}: Add {G}.\n//\nTidechannel Pathway - Land \n{T}: Add {U}." };

const RELIC = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Idle Relic", type: "Artifact", mana: "{1}", cmc: 1, keywords: [], oracle: "" }, controller: "user" });
const onBoard = (card, id, extra = {}) => ({ ...createPermanent({ id, card, controller: "user" }), summoningSick: false, ...extra });

function board({ hand = [], graveyard = [], battlefield = [], pool = {}, seat = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, stack: [],
    players: { ...s0.players, [seat]: { ...s0.players[seat], hand, graveyard, battlefield, landsPlayedThisTurn: 0, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
}
// Resolve the stack, flushing any triggers, until it is empty.
function settle(s) {
  for (let i = 0; i < 10; i++) {
    if (!s.stack.length) s = flushTriggers(s);
    if (!s.stack.length) return s;
    s = resolveTopOfStack(s);
  }
  return s;
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const sourcesOf = (s, permId) => manaSources(s, "user").filter((x) => x.permanentId === permId);
const emptyPool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

describe("the reading — the face that is up decides a combined card's mana (CR 712.8d)", () => {
  it("⭐ a front face over a land back makes no mana, and none of its back face's text or reminder text reads as its own", () => {
    expect(manaProduction(STORM)).toBeNull();    // was { U, amountSpec: artifacts, sacrifices } — the front's Treasure reminder + the back's "Add {U} for each artifact"
    expect(manaProduction(DROWNER)).toBeNull();  // was { C, sacrifices } — its Spawn tokens' quoted "Sacrifice this token: Add {C}."
    expect(manaActivationCost(DROWNER)).toBeNull(); // was {C} — read out of "if {C} was spent to cast it"
    expect(manaProduction(GUARDIAN)).toBeNull(); // was two of any one colour — the back face's land
    expect(extraManaLineProducts(STORM, manaProduction(STORM))).toEqual([]);
  });
  it("⭐ a back face's mana ability never reads as the front's, land or not: Tamiyo's −3 is not a free any-colour source", () => {
    expect(manaProduction(TAMIYO)).toBeNull(); // was any colour, requiresTap false — usable the turn she lands, on every payment
  });
  it("a land front keeps exactly its own mana, and a modal DFC's land face — the card the land drop enters — keeps its own", () => {
    expect(manaProduction(ABBEY)).toEqual({ colors: ["C"], amount: 1, requiresTap: true });
    expect(manaProduction(mdfcLandFaces(DROWNER)[0])).toEqual({ colors: ["G", "U"], amount: 1, requiresTap: true });
  });
  it("a one-line probe of a combined card (coverage reads a land's lines one at a time) keeps its line, read as the face that is up", () => {
    expect(manaProduction({ ...ABBEY, oracle: "{T}: Add {C}." })).toEqual({ colors: ["C"], amount: 1, requiresTap: true });
  });
});

describe("runtime — the real cast, reanimate and land-drop paths", () => {
  it("⭐ Storm the Vault cast from hand sits on the battlefield as the whole card and is no mana source: two artifacts out, a {1}{U} creature stays uncastable", () => {
    let s = board({ hand: [STORM, CORAL], battlefield: [RELIC("r1"), RELIC("r2")], pool: { U: 1, R: 1, C: 2 } });
    const [cast] = castOf(s, STORM.id);
    expect(cast).toBeTruthy();
    s = settle(dispatchAction(s, cast));
    const vault = s.players.user.battlefield.find((p) => p.card.id === STORM.id);
    expect(vault.card.name).toBe(STORM.name); // the engine's real representation: the combined card, front face up
    expect(s.players.user.manaPool).toEqual(emptyPool);
    expect(sourcesOf(s, vault.id)).toEqual([]);
    expect(castOf(s, CORAL.id)).toEqual([]);
    expect(s.players.user.battlefield.map((p) => p.id)).toContain(vault.id); // nothing sacrificed it
  });
  it("⭐ a Tamiyo, Inquisitive Student Reanimate puts onto the battlefield is no mana source — not the turn she lands, not after", () => {
    let s = board({ hand: [REANIMATE], graveyard: [TAMIYO], pool: { B: 1 } });
    const [cast] = castOf(s, REANIMATE.id);
    expect(cast.targets.map((t) => t.id)).toEqual([TAMIYO.id]);
    s = settle(dispatchAction(s, cast));
    const tamiyo = s.players.user.battlefield.find((p) => p.card.id === TAMIYO.id);
    expect(tamiyo.card.name).toBe(TAMIYO.name);
    expect(sourcesOf(s, tamiyo.id)).toEqual([]); // was any colour with no {T} — a summoning-sick Tamiyo paid on every payment
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, summoningSick: false })) } } };
    expect(sourcesOf(later, tamiyo.id)).toEqual([]);
    expect(canAfford(later.players.user.manaPool, manaSources(later, "user"), parseManaCost("{U}"))).toBe(false);
  });
  it("⭐ Golden Guardian cast from hand never taps for its back face's two mana", () => {
    let s = board({ hand: [GUARDIAN], pool: { C: 4 } });
    const [cast] = castOf(s, GUARDIAN.id);
    s = settle(dispatchAction(s, cast));
    const golem = s.players.user.battlefield.find((p) => p.card.id === GUARDIAN.id);
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, summoningSick: false })) } } };
    expect(sourcesOf(later, golem.id)).toEqual([]);
  });
  it("⭐ a Drowner of Truth Reanimate puts onto the battlefield enters as the whole card (CR 712.14) and is no mana source, sick or not", () => {
    let s = board({ hand: [REANIMATE], graveyard: [DROWNER], pool: { B: 1 } });
    const [cast] = castOf(s, REANIMATE.id);
    expect(cast.targets.map((t) => t.id)).toEqual([DROWNER.id]);
    s = settle(dispatchAction(s, cast));
    const drowner = s.players.user.battlefield.find((p) => p.card.id === DROWNER.id);
    expect(drowner.card.name).toBe(DROWNER.name);
    expect(manaActivationCost(drowner.card)).toBeNull();
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, summoningSick: false })) } } };
    expect(sourcesOf(later, drowner.id)).toEqual([]); // was { C, sacrifices, activationCost: {C} } — pay {C}, sacrifice it, add {C}
  });
  it("its BACK face played as a land is its own single-face card and taps for its own mana: Drowned Jungle makes G or U", () => {
    let s = board({ hand: [DROWNER] });
    const drop = legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.cardId === DROWNER.id);
    expect(drop.faceCard.name).toBe("Drowned Jungle");
    s = dispatchAction(s, drop);
    const jungle = s.players.user.battlefield[0];
    expect(jungle.card).toMatchObject({ name: "Drowned Jungle", type: "Land" });
    expect(jungle.tapped).toBe(true); // "This land enters tapped."
    const untapped = { ...s, turn: 7, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...jungle, tapped: false }] } } };
    expect(sourcesOf(untapped, jungle.id).map((x) => x.colors)).toEqual([["G", "U"]]);
  });
  it("a land front played as a land taps for exactly its own mana: Westvale Abbey makes {C}", () => {
    let s = board({ hand: [ABBEY] });
    const drop = legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.cardId === ABBEY.id);
    s = dispatchAction(s, drop);
    const abbey = s.players.user.battlefield[0];
    expect(abbey.card.name).toBe(ABBEY.name);
    // read on a later turn, so the land's own production is what is pinned, not the entry-turn sickness read
    const later = { ...s, turn: 7, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...abbey, summoningSick: false }] } } };
    expect(sourcesOf(later, abbey.id).map((x) => [x.colors, x.amount])).toEqual([[["C"], 1]]);
  });
  it("⭐ a back face's Land is no land for a granted basic type either: Storm the Vault under Urborg, Tomb of Yawgmoth makes nothing", () => {
    const s = board({ battlefield: [onBoard(URBORG, "urborg"), onBoard(STORM, "vault")] });
    expect(sourcesOf(s, "vault")).toEqual([]);
    expect(sourcesOf(s, "urborg").map((x) => x.colors)).toEqual([["B"]]); // Urborg itself is a land, and a Swamp
  });
});

describe("the AI's land pick reads the face the drop plays", () => {
  const aiBoard = (hand) => board({ hand, seat: "ai" });
  const landPick = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
  it("⭐ a spell // land's land face fills a colour gap: with blue needed, Soporific Springs is played over a Selesnya Guildgate", () => {
    // Both enter tapped, so only the colour gap can decide; "Selesnya Guildgate" sorts first. The hand holds the whole
    // Sink into Stupor, whose mana is its instant front's (none); the drop plays Soporific Springs.
    expect(landPick(aiBoard([SINK, GUILDGATE]))).toMatchObject({ kind: "play-land", name: "Soporific Springs" });
  });
  it("⭐ each face of a Pathway is judged on its own: blue needed, Tidechannel Pathway is played", () => {
    expect(landPick(aiBoard([PATHWAY, CORAL]))).toMatchObject({ kind: "play-land", name: "Tidechannel Pathway" });
  });
});
