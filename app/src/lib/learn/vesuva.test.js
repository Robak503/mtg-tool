/**
 * vesuva.test.js — VESUVA (the play-weighted program, EDHREC #923):
 *
 *   "You may have this land enter tapped as a copy of any land on the battlefield."
 *
 * An "enter as a copy" ability is a replacement effect (CR 614.1c), so the copy is made as the land enters: it enters tapped as the
 * copied land (CR 707.2 — its copiable values only), with that land's enters triggers and "as this land enters" abilities (the bundled
 * rulings); a land itself copying something is copied as that copy (CR 707.3); declined, it enters untapped as itself, a land with no
 * abilities (the ruling). landEntryCopy.js reads it; the land drop offers one play per land it may copy beside the plain play
 * (legalChoices.actionsPlayLand), the dispatcher enters the copy (actionDispatcher.applyPlayLand), the default AI ranks a copy as the
 * land it becomes, entering tapped (opponentAI.pickLandAction), and a put onto the battlefield by an effect takes the house pick — the
 * colour its player needs (zones.enterCardFromZone, the Cursed Mirror precedent). Real land drops, real cast and search for the put
 * road. Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { pickAction } from "./opponentAI.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { actionLabel } from "./actionLabel.js";

beforeEach(() => _resetIdsForTests());

const VESUVA = {"name":"Vesuva","type":"Land","mana":"","oracle":"You may have this land enter tapped as a copy of any land on the battlefield.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #923
const MYCOSPAWN = {"name":"Sowing Mycospawn","type":"Creature — Eldrazi Fungus","mana":"{3}{G}","oracle":"Devoid (This card has no color.)\nKicker {1}{C} (You may pay an additional {1}{C} as you cast this spell.)\nWhen you cast this spell, search your library for a land card, put it onto the battlefield, then shuffle.\nWhen you cast this spell, if it was kicked, exile target land.","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Devoid","Kicker"],"colors":[],"colorIdentity":["G"]}; // EDHREC #2076
const FOUNTAIN = {"name":"Radiant Fountain","type":"Land","mana":"","oracle":"When this land enters, you gain 2 life.\n{T}: Add {C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1551
const CHAMBER = {"name":"Simic Growth Chamber","type":"Land","mana":"","oracle":"This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{U}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G","U"]}; // EDHREC #316
const POOL = {"name":"Breeding Pool","type":"Land — Forest Island","mana":"","oracle":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G","U"]}; // EDHREC #59
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]};
const COBRA = {"name":"Lotus Cobra","type":"Creature — Snake","mana":"{1}{G}","oracle":"Landfall — Whenever a land you control enters, add one mana of any color.","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Landfall"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #328
const LOTUS_VALE = {"name":"Lotus Vale","type":"Land","mana":"","oracle":"If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add three mana of any one color.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #6865
const SCORCHED_RUINS = {"name":"Scorched Ruins","type":"Land","mana":"","oracle":"If this land would enter, sacrifice two untapped lands instead. If you do, put this land onto the battlefield. If you don't, put it into its owner's graveyard.\n{T}: Add {C}{C}{C}{C}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #6417
const GLACIAL_CHASM = {"name":"Glacial Chasm","type":"Land","mana":"","oracle":"Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this land enters, sacrifice a land.\nCreatures you control can't attack.\nPrevent all damage that would be dealt to you.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Cumulative upkeep"],"colors":[],"colorIdentity":[]}; // EDHREC #2234
const DARK_DEPTHS = {"name":"Dark Depths","type":"Legendary Snow Land","mana":"","oracle":"Dark Depths enters with ten ice counters on it.\n{3}: Remove an ice counter from Dark Depths.\nWhen Dark Depths has no ice counters on it, sacrifice it. If you do, create Marit Lage, a legendary 20/20 black Avatar creature token with flying and indestructible.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1471
const CRADLE = {"name":"Gaea's Cradle","type":"Legendary Land","mana":"","oracle":"{T}: Add {G} for each creature you control.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #445
const CORAL_ATOLL = {"name":"Coral Atoll","type":"Land","mana":"","oracle":"This land enters tapped.\nWhen this land enters, sacrifice it unless you return an untapped Island you control to its owner's hand.\n{T}: Add {C}{U}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #5818
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const COUNTERSPELL = { name: "Counterspell", type: "Instant", mana: "{U}{U}", cmc: 2, oracle: "Counter target spell.", colors: ["U"], keywords: [], colorIdentity: ["U"] };

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
function table({ seat = "user", mine = [], theirs = [], hand = [{ ...VESUVA, id: "h-vesuva" }], library = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const players = { ...g.players, [seat]: { ...g.players[seat], battlefield: mine, hand, library, landsPlayedThisTurn: 0 }, [opp]: { ...g.players[opp], battlefield: theirs, hand: [], library: [] } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const plays = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "play-land" && a.cardId === "h-vesuva");
const entered = (s, seat = "user") => s.players[seat].battlefield.find((p) => p.card?.id === "h-vesuva");
const playCopy = (s, ofName, seat = "user") => {
  const a = plays(s, seat).find((x) => x.copyOfName === ofName);
  expect(a, `no play of Vesuva as a copy of ${ofName}`).toBeTruthy();
  return dispatchAction(s, a);
};

describe("the card", () => {
  it("⭐ a covered land", () => {
    expect(classifyCard(VESUVA)).toBe("land");
  });
});

describe("the land drop", () => {
  it("⭐ one play per land it may copy, any player's, one per copied name, beside the plain play — and each labelled", () => {
    const s = table({ mine: [on("user", "f1", FOREST), on("user", "f2", FOREST)], theirs: [on("ai", "pool", POOL), on("ai", "fountain", FOUNTAIN)] });
    const ps = plays(s);
    expect(ps.map((a) => a.copyOfName ?? "(itself)").sort()).toEqual(["(itself)", "Breeding Pool", "Forest", "Radiant Fountain"]);
    expect(actionLabel(ps.find((a) => a.copyOfName === "Breeding Pool"))).toBe("Play Vesuva as a copy of Breeding Pool (tapped)");
  });
  it("⭐ as a copy of the opponent's Breeding Pool: it enters TAPPED as Breeding Pool — no life paid (it is tapped either way) — and taps for {G} or {U} later; Vesuva itself goes to the graveyard when it leaves", () => {
    const s = playCopy(table({ mine: [on("user", "f1", FOREST)], theirs: [on("ai", "pool", POOL)] }), "Breeding Pool");
    const v = entered(s);
    expect({ name: v.card.name, type: v.card.type, tapped: v.tapped, printed: v.printedCard?.name, life: s.players.user.life, pending: s.pendingChoice ?? null, drops: s.players.user.landsPlayedThisTurn })
      .toEqual({ name: "Breeding Pool", type: "Land — Forest Island", tapped: true, printed: "Vesuva", life: 40, pending: null, drops: 1 });
    const untapped = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === v.id ? { ...p, tapped: false } : p)) } } };
    expect(manaSources(untapped, "user").filter((src) => src.permanentId === v.id).flatMap((src) => src.colors || []).sort()).toEqual(["G", "U"]);
    const gone = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: v.id });
    expect(gone.players.user.graveyard.map((c) => c.name)).toEqual(["Vesuva"]);
  });
  it("⭐ a copy's enters trigger triggers (the ruling): as Radiant Fountain, you gain 2 life", () => {
    let s = playCopy(table({ theirs: [on("ai", "fountain", FOUNTAIN)] }), "Radiant Fountain");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (s.stack.length) s = resolveTopOfStack(s);
    expect({ life: s.players.user.life, name: entered(s).card.name, tapped: entered(s).tapped }).toEqual({ life: 42, name: "Radiant Fountain", tapped: true });
  });
  it("⭐ as Simic Growth Chamber: the copy's own enters trigger returns a land you control to your hand", () => {
    let s = playCopy(table({ mine: [on("user", "f1", FOREST)], theirs: [on("ai", "chamber", CHAMBER)] }), "Simic Growth Chamber");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.user.hand.some((c) => c.name === "Forest" || c.name === "Vesuva")).toBe(true);
  });
  it("landfall sees the copy enter (Lotus Cobra triggers)", () => {
    const s = playCopy(table({ mine: [on("user", "cobra", COBRA)], theirs: [on("ai", "pool", POOL)] }), "Breeding Pool");
    expect((s.pendingTriggers || []).some((t) => t.source?.name === "Lotus Cobra")).toBe(true);
  });
  it("⭐ a land that is itself a copy is copied as that copy (CR 707.3): a second Vesuva copying the first Vesuva — a Forest — is a Forest", () => {
    const first = on("user", "v1", VESUVA);
    const asForest = { ...first, card: { ...FOREST, id: "c-v1" }, printedCard: { ...VESUVA, id: "c-v1" } };
    const s = table({ mine: [asForest] });
    expect(plays(s).map((a) => a.copyOfName ?? null)).toEqual([null, "Forest"]);
    expect(entered(playCopy(s, "Forest")).card.name).toBe("Forest");
  });
  it("⭐ declined: it enters untapped as itself and makes no mana (the ruling)", () => {
    const s0 = table({ theirs: [on("ai", "pool", POOL)] });
    const s = dispatchAction(s0, plays(s0).find((a) => a.copyOfPermanentId == null));
    expect({ name: entered(s).card.name, tapped: entered(s).tapped, mana: manaSources(s, "user").filter((src) => src.permanentId === entered(s).id).length }).toEqual({ name: "Vesuva", tapped: false, mana: 0 });
  });
  it("⛔ only a land the engine reads whole is offered (CR 707.5 — the copy plays the copied land's text): never Lotus Vale, Scorched Ruins (their \"if this land would enter\" replacement is unread), Glacial Chasm or Dark Depths; Breeding Pool, Radiant Fountain and Simic Growth Chamber still are", () => {
    const s = table({ theirs: [on("ai", "vale", LOTUS_VALE), on("ai", "ruins", SCORCHED_RUINS), on("ai", "chasm", GLACIAL_CHASM), on("ai", "depths", DARK_DEPTHS), on("ai", "pool", POOL), on("ai", "fountain", FOUNTAIN), on("ai", "chamber", CHAMBER)] });
    expect(plays(s).map((a) => a.copyOfName ?? "(itself)").sort()).toEqual(["(itself)", "Breeding Pool", "Radiant Fountain", "Simic Growth Chamber"]);
  });
  it("⛔ the dispatcher refuses a copy of a land that is no candidate (a hand-built action naming Lotus Vale)", () => {
    const s0 = table({ theirs: [on("ai", "vale", LOTUS_VALE)] });
    const plain = plays(s0).find((a) => a.copyOfPermanentId == null);
    expect(() => dispatchAction(s0, { ...plain, copyOfPermanentId: "vale", copyOfName: "Lotus Vale" })).toThrow(/to copy/);
  });
  it("⛔ the copy is refused if the land is gone by the time the play is made", () => {
    const s0 = table({ theirs: [on("ai", "pool", POOL)] });
    const a = plays(s0).find((x) => x.copyOfName === "Breeding Pool");
    const gone = moveCardToZone(s0, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "pool" });
    expect(() => dispatchAction(gone, a)).toThrow(/to copy/);
  });
});

describe("the put road (an effect puts it onto the battlefield)", () => {
  /** Resolve the stack until the search's choice (the creature spell itself stays below). */
  const toSearch = (s0) => { let s = s0; for (let g = 0; g < 6 && !s.pendingChoice && s.stack.some((o) => o.kind !== "spell"); g++) s = resolveTopOfStack(s); return s; };
  it("⭐ Sowing Mycospawn's search finds Vesuva: the house copies the land of the colour its hand needs — Breeding Pool for blue pips — tapped", () => {
    const s0 = table({ mine: [on("user", "f1", FOREST), on("user", "f2", FOREST), on("user", "f3", FOREST), on("user", "f4", FOREST)], theirs: [on("ai", "pool", POOL), on("ai", "fountain", FOUNTAIN)],
      hand: [{ ...MYCOSPAWN, id: "h-myco" }, { ...COUNTERSPELL, id: "h-cs" }], library: [{ ...VESUVA, id: "h-vesuva" }] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-myco" && !a.kicked);
    let s = flushTriggers(dispatchAction(s0, cast), { chooseTargets: chooseTriggerTargets });
    s = toSearch(s); // the cast triggers: the kicked-only one does nothing, the other searches
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, "h-vesuva");
    const v = entered(s);
    expect({ name: v.card.name, tapped: v.tapped, printed: v.printedCard?.name, log: (s.log || []).some((e) => e.kind === "land-copy-choice" && e.copiedName === "Breeding Pool") })
      .toEqual({ name: "Breeding Pool", tapped: true, printed: "Vesuva", log: true });
  });
  /** Sowing Mycospawn cast from a fed pool (no land tapped), its search resolved to Vesuva: what Vesuva entered as, and the house's log. */
  const putVesuva = (opts) => {
    const s0 = table({ ...opts, hand: [{ ...MYCOSPAWN, id: "h-myco" }], library: [{ ...VESUVA, id: "h-vesuva" }] });
    const fed = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 3 } } } };
    const cast = legalActionsForPlayer(fed, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-myco" && !a.kicked);
    expect(cast, "Sowing Mycospawn is not offered").toBeTruthy();
    let s = toSearch(flushTriggers(dispatchAction(fed, cast), { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, "h-vesuva");
    const v = entered(s);
    return { name: v?.card?.name ?? null, tapped: v?.tapped ?? null, copied: (s.log || []).filter((e) => e.kind === "land-copy-choice").map((e) => e.copiedName ?? null) };
  };
  it("⛔ the house never copies its player's own legendary land (the legend rule would leave only one — CR 704.5j): its own Gaea's Cradle the only land, Vesuva enters as itself", () => {
    expect(putVesuva({ mine: [on("user", "cradle", CRADLE)] })).toEqual({ name: "Vesuva", tapped: false, copied: [null] });
  });
  it("an opponent's Gaea's Cradle is a copy the house takes (the legend rule is each player's own)", () => {
    expect(putVesuva({ theirs: [on("ai", "cradle", CRADLE)] })).toEqual({ name: "Gaea's Cradle", tapped: true, copied: ["Gaea's Cradle"] });
  });
  it("⛔ the house never copies a land it would lose as it enters: Coral Atoll with no untapped Island of its player's — Vesuva as itself; with one, the Atoll", () => {
    expect(putVesuva({ theirs: [on("ai", "atoll", CORAL_ATOLL)] })).toEqual({ name: "Vesuva", tapped: false, copied: [null] });
    expect(putVesuva({ mine: [on("user", "isl", ISLAND)], theirs: [on("ai", "atoll", CORAL_ATOLL)] })).toEqual({ name: "Coral Atoll", tapped: true, copied: ["Coral Atoll"] });
  });
  it("with no land on the battlefield to copy it enters as itself, untapped", () => {
    const s0 = table({ hand: [{ ...MYCOSPAWN, id: "h-myco" }], library: [{ ...VESUVA, id: "h-vesuva" }] });
    const fed = { ...s0, players: { ...s0.players, user: { ...s0.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 3 } } } };
    const cast = legalActionsForPlayer(fed, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-myco" && !a.kicked);
    let s = toSearch(flushTriggers(dispatchAction(fed, cast), { chooseTargets: chooseTriggerTargets }));
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    s = resolveTutorChoice(s, "h-vesuva");
    expect({ name: entered(s).card.name, tapped: entered(s).tapped }).toEqual({ name: "Vesuva", tapped: false });
  });
});

describe("the default AI", () => {
  const aiLand = (s) => pickAction(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "play-land"));
  it("⭐ it plays Vesuva as the copy that makes the colour its hand needs (Island for blue pips), never as itself", () => {
    const s = table({ seat: "ai", mine: [on("ai", "f1", FOREST)], theirs: [on("user", "isl", ISLAND), on("user", "fountain", FOUNTAIN)], hand: [{ ...VESUVA, id: "h-vesuva" }, { ...COUNTERSPELL, id: "h-cs" }] });
    const pick = aiLand(s);
    expect({ card: pick?.cardId, copy: pick?.copyOfName }).toEqual({ card: "h-vesuva", copy: "Island" });
  });
  it("its only land in hand with nothing it needs: still a copy that makes mana (Forest), not the land with no abilities", () => {
    const s = table({ seat: "ai", theirs: [on("user", "f9", FOREST)] });
    expect(aiLand(s)?.copyOfName).toBe("Forest");
  });
  it("⛔ never as a copy of its own Gaea's Cradle (the legend rule would keep only one — the untapped original would go): it copies the opponent's Forest", () => {
    const s = table({ seat: "ai", mine: [on("ai", "cradle", CRADLE), on("ai", "bears", BEARS)], theirs: [on("user", "f9", FOREST)] });
    expect(plays(s, "ai").map((a) => a.copyOfName ?? "(itself)").sort()).toEqual(["(itself)", "Forest", "Gaea's Cradle"]);
    expect(aiLand(s)?.copyOfName).toBe("Forest");
  });
  it("⛔ its own Cradle the only land to copy: it plays Vesuva as itself", () => {
    const s = table({ seat: "ai", mine: [on("ai", "cradle", CRADLE), on("ai", "bears", BEARS)] });
    const pick = aiLand(s);
    expect({ card: pick?.cardId, copy: pick?.copyOfPermanentId ?? null }).toEqual({ card: "h-vesuva", copy: null });
  });
  it("⛔ never a copy it would lose: Coral Atoll with no untapped Island of its own (it would be sacrificed as it enters) — Vesuva as itself", () => {
    const none = table({ seat: "ai", theirs: [on("user", "atoll", CORAL_ATOLL)] });
    expect(plays(none, "ai").map((a) => a.copyOfName ?? "(itself)").sort()).toEqual(["(itself)", "Coral Atoll"]);
    const pick = aiLand(none);
    expect({ card: pick?.cardId, copy: pick?.copyOfPermanentId ?? null }).toEqual({ card: "h-vesuva", copy: null });
  });
  it("⭐ a land pick classifies each land at most once (the copy pool's tier is memoized per card, and the AI lists the candidates once per land drop): fifteen lands, the same pick", async () => {
    const lec = await import("./landEntryCopy.js").catch((e) => ({ loadError: String(e?.message || e) }));
    expect(lec.loadError, "landEntryCopy.js does not load").toBeUndefined();
    let calls = 0;
    lec.registerLandCopyClassifier((card) => { calls++; return classifyCard(card); });
    try {
      const theirs = [ISLAND, POOL, FOUNTAIN, CHAMBER, CRADLE, CORAL_ATOLL, LOTUS_VALE, FOREST, ISLAND, POOL].map((c, i) => on("user", `u${i}`, c));
      const mine = [FOREST, FOREST, FOREST, CRADLE, FOUNTAIN].map((c, i) => on("ai", `a${i}`, c));
      const s = table({ seat: "ai", mine, theirs, hand: [{ ...VESUVA, id: "h-vesuva" }, { ...COUNTERSPELL, id: "h-cs" }] });
      const pick = aiLand(s);
      expect({ card: pick?.cardId, copy: pick?.copyOfName ?? null, calls: calls <= mine.length + theirs.length }).toEqual({ card: "h-vesuva", copy: "Island", calls: true });
    } finally {
      lec.registerLandCopyClassifier((card) => classifyCard(card));
    }
  });
  it("an untapped basic that fills the same need is played over a copy that would enter tapped", () => {
    const s = table({ seat: "ai", theirs: [on("user", "isl", ISLAND)], hand: [{ ...VESUVA, id: "h-vesuva" }, { ...ISLAND, id: "h-isl" }, { ...COUNTERSPELL, id: "h-cs" }] });
    expect(aiLand(s)?.cardId).toBe("h-isl");
  });
});

describe("the other land-drop zones", () => {
  const CRUCIBLE = {"name":"Crucible of Worlds","type":"Artifact","mana":"{3}","oracle":"You may play lands from your graveyard.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #601
  it("⭐ played from the graveyard (Crucible of Worlds): the same copy plays, and the copy enters tapped", () => {
    const s0 = table({ mine: [on("user", "cru", CRUCIBLE)], theirs: [on("ai", "pool", POOL)], hand: [] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, graveyard: [{ ...VESUVA, id: "h-vesuva" }] } } };
    const gy = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.cardId === "h-vesuva");
    expect(gy.map((a) => `${a.fromZone}:${a.copyOfName ?? "(itself)"}`).sort()).toEqual(["graveyard:(itself)", "graveyard:Breeding Pool"]);
    const out = dispatchAction(s, gy.find((a) => a.copyOfName === "Breeding Pool"));
    expect({ name: entered(out).card.name, tapped: entered(out).tapped, gy: out.players.user.graveyard.length }).toEqual({ name: "Breeding Pool", tapped: true, gy: 0 });
  });
});
