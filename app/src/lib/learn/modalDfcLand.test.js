/**
 * modalDfcLand.test.js — SHELF-85 runbook vein V1, slice 1 (2026-09-04): MODAL DOUBLE-FACED CARDS with a LAND back
 * (CR 712.8) on the LAND DROP. Every land face is its own play-land action carrying the projected `faceCard`; the
 * permanent ENTERS AS THAT FACE (name, type, oracle, mana) with the combined card kept as `printedCard`, so leaving the
 * battlefield restores the real card. A "Land // Land" (the ten Pathways) is native `land` iff both faces are covered on
 * their own; a "<spell> // Land" keeps land-partial until slice 2 makes the front castable. Scryfall's `layout` is the
 * gate — a TRANSFORM card with a land back (Ojer Axonil) is never a modal DFC and is no longer offered as a land drop at
 * all (a pre-existing over-offer this slice closed). Real oracle fixtures (bundled Scryfall snapshot, 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { mdfcLandFaces, parseModalDfc } from "./modalDfc.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { resolveOptionalLifePaymentChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, moveCardToZone } from "./gameState.js";
import { enrichDeckCard } from "../server/learnDeckEnrich.js";

beforeEach(() => _resetIdsForTests());

const PATHWAY = { id: "h-bark", name: "Barkchannel Pathway // Tidechannel Pathway", type: "Land // Land", mana: "", cmc: 0, keywords: [], layout: "modal_dfc",
  oracle: "Barkchannel Pathway - Land \n{T}: Add {G}.\n//\nTidechannel Pathway - Land \n{T}: Add {U}." };
const SINK = { id: "h-sink", name: "Sink into Stupor // Soporific Springs", type: "Instant // Land", mana: "{1}{U}{U}", mana_cost: "{1}{U}{U}", cmc: 3, keywords: [], layout: "modal_dfc",
  oracle: "Sink into Stupor - Instant {1}{U}{U}\nReturn target spell or nonland permanent an opponent controls to its owner's hand.\n//\nSoporific Springs - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {U}." };
const OJER = { id: "h-ojer", name: "Ojer Axonil, Deepest Might // Temple of Power", type: "Legendary Creature — God // Land", mana: "{2}{R}{R}", mana_cost: "{2}{R}{R}", cmc: 4, power: 4, toughness: 4, keywords: ["Trample"], layout: "transform",
  oracle: "Ojer Axonil, Deepest Might - Legendary Creature — God {2}{R}{R}\nTrample\nIf a red source you control would deal an amount of noncombat damage less than Ojer Axonil's power to an opponent, that source deals damage equal to Ojer Axonil's power instead.\nWhen Ojer Axonil dies, return it to the battlefield tapped and transformed under its owner's control.\n//\nTemple of Power - Land \n(Transforms from Ojer Axonil, Deepest Might.)\n{T}: Add {R}.\n{2}{R}, {T}: Transform Temple of Power. Activate only if an opponent lost life this turn and only as a sorcery." };
const DELVER = { id: "h-delver", name: "Delver of Secrets // Insectile Aberration", type: "Creature — Human Wizard // Creature — Human Insect", mana: "{U}", cmc: 1, power: 1, toughness: 1, keywords: [], layout: "transform",
  oracle: "Delver of Secrets - Creature — Human Wizard {U}\nAt the beginning of your upkeep, look at the top card of your library. You may reveal that card. If an instant or sorcery card is revealed this way, transform Delver of Secrets.\n//\nInsectile Aberration - Creature — Human Insect \nFlying" };

describe("the shape module", () => {
  it("⭐ a modal DFC with a land back parses into two faces; the land faces are the drop's choices", () => {
    const p = parseModalDfc(PATHWAY);
    expect(p.front).toMatchObject({ name: "Barkchannel Pathway", type: "Land", oracle: "{T}: Add {G}.", mana: "" });
    expect(p.back).toMatchObject({ name: "Tidechannel Pathway", type: "Land", oracle: "{T}: Add {U}.", mana: "" });
    expect(mdfcLandFaces(PATHWAY).map((f) => f.name)).toEqual(["Barkchannel Pathway", "Tidechannel Pathway"]);
    expect(mdfcLandFaces(SINK).map((f) => f.name)).toEqual(["Soporific Springs"]);
    expect(mdfcLandFaces(SINK)[0]).toMatchObject({ id: "h-sink", type: "Land", faceIndex: 1, mdfcOf: SINK.name });
  });
  it("⛔ the layout gate: a transform card with a land back is NOT a modal DFC; a modal card without a layout is refused", () => {
    expect(parseModalDfc(OJER)).toBeNull();
    expect(parseModalDfc(DELVER)).toBeNull();
    expect(parseModalDfc({ ...PATHWAY, layout: "" })).toBeNull();
    expect(parseModalDfc({ ...PATHWAY, layout: "transform" })).toBeNull();
  });
  it("the tiers: a Pathway is native land; a spell//land with a native front is native-spell (GRADUATED KN-6a, 2026-09-05: Sink into Stupor's front is modeled); a transform god is no land at all", () => {
    expect(classifyCard(PATHWAY)).toBe("land");
    expect(classifyCard(SINK)).toBe("native-spell"); // GRADUATED (POD-SIM THREE · KN-6a, 2026-09-05): the front's opponent-nonland union bounce is modeled — sinkIntoStupor.test.js
    expect(classifyCard(OJER)).not.toMatch(/^land/);
    expect(classifyCard(DELVER)).toBe("body-only");
    // a Land // Land whose back is NOT covered is not credited (the runtime would play a face it cannot honour)
    const unc = { ...PATHWAY, oracle: "Barkchannel Pathway - Land \n{T}: Add {G}.\n//\nTidechannel Pathway - Land \n{T}: Add {U}.\n{2}, {T}: Untap target creature and it phases out until your next upkeep." };
    expect(classifyCard(unc)).toBe("land-partial");
  });
});

const FELL = { id: "h-fell", name: "Fell the Profane // Fell Mire", type: "Instant // Land", mana: "{2}{B}{B}", mana_cost: "{2}{B}{B}", cmc: 4, keywords: [], layout: "modal_dfc",
  oracle: "Fell the Profane - Instant {2}{B}{B}\nDestroy target creature or planeswalker.\n//\nFell Mire - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}." };

describe("slice 2 — the SPELL front is cast as a face (CR 712.8)", () => {
  it("⭐ the tiers: a native front over a covered back is native-spell (Sink into Stupor GRADUATED KN-6a); an uncovered back parks the whole card", () => {
    expect(classifyCard(FELL)).toBe("native-spell");
    expect(classifyCard(SINK)).toBe("native-spell"); // GRADUATED (POD-SIM THREE · KN-6a, 2026-09-05): the front's opponent-nonland union bounce is modeled — sinkIntoStupor.test.js
    const uncoveredBack = { ...FELL, oracle: FELL.oracle.replace("{T}: Add {B}.", "{T}: Add {B}.\n{2}, {T}: Untap target creature and it phases out until your next upkeep.") };
    expect(classifyCard(uncoveredBack)).toBe("land-partial");
  });
  it("⭐ Fell the Profane offers exactly ONE cast (the front face, never the combined card) beside its land drop; casting it destroys the target and the whole card goes to the graveyard", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: { id: "card-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "ai" });
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players, user: { ...s0.players.user, hand: [FELL], battlefield: [], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 2 } }, ai: { ...s0.players.ai, battlefield: [bear] } } };
    const acts = legalActionsForPlayer(s, "user");
    const casts = acts.filter((a) => a.kind === "cast-spell" && a.cardId === "h-fell");
    expect(casts).toHaveLength(1);
    expect(casts[0].faceCard?.name).toBe("Fell the Profane");
    expect((casts[0].targets || []).map((t) => t.id)).toEqual(["bear"]);
    expect(acts.filter((a) => a.kind === "play-land").map((a) => a.name)).toEqual(["Fell Mire"]);
    s = resolveTopOfStack(dispatchAction(s, casts[0]));
    expect(findPermanent(s, "bear")).toBeNull();
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual([FELL.name]);
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.manaPool).toMatchObject({ B: 0, C: 0 });
  });
  it("GRADUATED (KN-6a, 2026-09-05): the front (Sink into Stupor) IS offered as a cast aimed at an opponent's nonland permanent, and its land back still drops; with nothing to target the front is not offered", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const ogre = { id: "ogre", card: { id: "c-ogre", name: "Ogre", type: "Creature — Ogre", power: 4, toughness: 4, oracle: "" }, controller: "ai", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
    const mk = (aiBf) => ({ ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players, user: { ...s0.players.user, hand: [SINK], battlefield: [], manaPool: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 3 } }, ai: { ...s0.players.ai, battlefield: aiBf } } });
    const acts = legalActionsForPlayer(mk([ogre]), "user");
    const casts = acts.filter((a) => a.kind === "cast-spell");
    expect(casts).toHaveLength(1);
    expect(casts[0].faceCard?.name).toBe("Sink into Stupor");
    expect(casts[0].targets.map((t) => t.id)).toEqual(["ogre"]);
    expect(acts.filter((a) => a.kind === "play-land").map((a) => a.name)).toEqual(["Soporific Springs"]);
    expect(legalActionsForPlayer(mk([]), "user").filter((a) => a.kind === "cast-spell")).toHaveLength(0); // no legal target → not offered (never a targetless cast)
  });
});

const WITCH = { id: "h-witch", name: "Witch Enchanter // Witch-Blessed Meadow", type: "Creature — Human Warlock // Land", mana: "{3}{W}", mana_cost: "{3}{W}", cmc: 4, power: "2", toughness: "2", keywords: [], layout: "modal_dfc",
  oracle: "Witch Enchanter - Creature — Human Warlock {3}{W}\nWhen this creature enters, destroy target artifact or enchantment an opponent controls.\n//\nWitch-Blessed Meadow - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {W}." };

describe("slice 3 — a PERMANENT front is cast as a face and carries the real card as printedCard", () => {
  it("⭐ the tiers: a native creature front over a covered back takes the front's tier; an uncovered back parks it", () => {
    expect(classifyCard(WITCH)).toBe("native-trigger");
    const uncoveredBack = { ...WITCH, oracle: WITCH.oracle.replace("{T}: Add {W}.", "{T}: Add {W}.\n{2}, {T}: Untap target creature and it phases out until your next upkeep.") };
    expect(classifyCard(uncoveredBack)).toBe("land-partial");
    // a Land // Land has no spell front: no cast action, only its two land drops
    expect(mdfcLandFaces(PATHWAY)).toHaveLength(2);
  });
  it("⭐ Witch Enchanter casts as its creature face: it enters AS the face with the whole card as printedCard, its ETB destroys the relic, and dying restores the whole card to the graveyard", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const relic = createPermanent({ id: "relic", card: { id: "card-relic", name: "Idle Relic", type: "Artifact", mana: "{1}", cmc: 1, keywords: [], oracle: "" }, controller: "ai" });
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players, user: { ...s0.players.user, hand: [WITCH, PATHWAY], battlefield: [], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 3 } }, ai: { ...s0.players.ai, battlefield: [relic] } } };
    const acts = legalActionsForPlayer(s, "user");
    expect(acts.filter((a) => a.kind === "cast-spell").map((a) => a.faceCard?.name)).toEqual(["Witch Enchanter"]); // never the Pathway's land front
    expect(acts.filter((a) => a.kind === "play-land").map((a) => a.name).sort()).toEqual(["Barkchannel Pathway", "Tidechannel Pathway", "Witch-Blessed Meadow"]);
    const cast = acts.find((a) => a.kind === "cast-spell");
    s = resolveTopOfStack(dispatchAction(s, cast));
    if (!s.stack.length) s = flushTriggers(s);
    expect(s.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield[0];
    expect(perm.card).toMatchObject({ id: "h-witch", name: "Witch Enchanter", type: "Creature — Human Warlock" });
    expect(perm.printedCard?.name).toBe(WITCH.name);
    expect(findPermanent(s, "relic")).toBeNull();
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Idle Relic"]);
    const dead = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
    expect(dead.players.user.graveyard.map((c) => [c.id, c.name])).toEqual([["h-witch", WITCH.name]]);
  });
});

describe("the game's deck enrichment carries the gate", () => {
  it("⭐ an already-shaped saved-deck card (no layout) is backfilled with the index's layout; a card that has one is untouched", () => {
    const lookup = (name) => (/Pathway/.test(name) ? { name, type: "Land // Land", oracle: PATHWAY.oracle, mana: "", layout: "modal_dfc" } : null);
    const shaped = { id: "d1", name: PATHWAY.name, type: "Land // Land", oracle: PATHWAY.oracle, mana: "" };
    const out = enrichDeckCard(shaped, lookup);
    expect(out.layout).toBe("modal_dfc");
    expect(out.type).toBe("Land // Land"); // nothing else overwritten
    expect(enrichDeckCard({ ...shaped, layout: "" }, lookup).layout).toBe(""); // an explicit layout is respected
    // a blank deck entry gets the full merge, layout included
    expect(enrichDeckCard({ id: "d2", name: PATHWAY.name }, lookup)).toMatchObject({ type: "Land // Land", layout: "modal_dfc" });
    // and the classifier + the land drop read the enriched card
    expect(classifyCard(out)).toBe("land");
    expect(mdfcLandFaces(out).map((f) => f.name)).toEqual(["Barkchannel Pathway", "Tidechannel Pathway"]);
  });
});

describe("runtime — the land drop chooses a face", () => {
  function hand(cards, life = 40) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [],
      players: { ...s0.players, user: { ...s0.players.user, hand: cards, battlefield: [], life, landsPlayedThisTurn: 0 } } };
  }
  const drops = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land").map((a) => [a.name, a.faceCard?.name ?? null]);
  it("⭐ a Pathway offers BOTH faces, a spell//land offers its land back only, and the transform god is not offered as a land", () => {
    expect(drops(hand([PATHWAY, SINK, OJER]))).toEqual([["Barkchannel Pathway", "Barkchannel Pathway"], ["Tidechannel Pathway", "Tidechannel Pathway"], ["Soporific Springs", "Soporific Springs"]]);
  });
  it("⭐ playing the BACK face enters that face (name, type, mana U), and leaving the battlefield restores the whole card", () => {
    let s = hand([PATHWAY]);
    const back = legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.name === "Tidechannel Pathway");
    s = dispatchAction(s, back);
    const perm = s.players.user.battlefield[0];
    expect(perm.card).toMatchObject({ id: "h-bark", name: "Tidechannel Pathway", type: "Land" });
    expect(perm.printedCard?.name).toBe(PATHWAY.name);
    expect(perm.tapped).toBe(false);
    expect(s.players.user.landsPlayedThisTurn).toBe(1);
    expect(manaSources({ ...s, turn: 7 }, "user").map((x) => x.colors)).toEqual([["U"]]);
    const bounced = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: perm.id });
    expect(bounced.players.user.hand.map((c) => c.name)).toEqual([PATHWAY.name]);
    expect(findPermanent(bounced, perm.id)).toBeNull();
  });
  it("playing the FRONT face enters Barkchannel and taps for G", () => {
    let s = hand([PATHWAY]);
    const front = legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.name === "Barkchannel Pathway");
    s = dispatchAction(s, front);
    expect(s.players.user.battlefield[0].card.name).toBe("Barkchannel Pathway");
    expect(manaSources({ ...s, turn: 7 }, "user").map((x) => x.colors)).toEqual([["G"]]);
  });
  it("the spell//land's back face enters with ITS shock clause: the pay-3-life choice is raised, declining taps it", () => {
    let s = hand([SINK]);
    const springs = legalActionsForPlayer(s, "user").find((a) => a.kind === "play-land" && a.name === "Soporific Springs");
    s = dispatchAction(s, springs);
    expect(s.players.user.battlefield[0].card.name).toBe("Soporific Springs");
    expect(s.pendingChoice?.kind).toBeTruthy();
    expect(s.pendingChoice.sourceName).toBe("Soporific Springs");
    const declined = resolveOptionalLifePaymentChoice(s, false);
    expect(declined.players.user.battlefield[0].tapped).toBe(true);
    expect(declined.players.user.life).toBe(40);
  });
});
