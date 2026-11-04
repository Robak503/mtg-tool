/**
 * terastodon.test.js — TERASTODON (the play-weighted program, EDHREC #1421) is PARKED (pw29's review, F1), and the destroy event's
 * graveyard report it needs is kept:
 *
 *   "When this creature enters, you may destroy up to three target noncreature permanents. For each permanent put into a graveyard
 *    this way, its controller creates a 3/3 green Elephant creature token."
 *
 * Why parked: a person may announce zero to three of ANY legal noncreature permanents (CR 601.2c, 115.1), but the subset list is cut at
 * 64 rows (targeting.targetSubsets) before most three-target sets — on a real board (eight lands a seat) no three-target row is offered
 * at all. A pick-one-target-at-a-time question is the lane. So the grammar reads no "destroy up to three target noncreature permanents".
 *
 * What stays (the lane's resolver half, inert for every printed card today): spellEffects.destroyEvent — applyDestroyEffect's one event,
 * returning `intoGraveyard`, the destroyed permanents whose leave record says graveyard (indestructible keeps one on the battlefield, Rest
 * in Peace and Leyline of the Void exile one instead; a token is put there, CR 111.7, 704.5d; an Aura destroyed beside its host counts by
 * its own record), and removal.applyRemovalWithRider's `onlyIfToGraveyard` rider, which makes the token only for those. applyDestroyEffect
 * returns destroyEvent's state, byte for byte.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import * as SE from "./spellEffects.js";
import { applyRemovalWithRider } from "./effects/atoms/removal.js";

beforeEach(() => _resetIdsForTests());

const TERASTODON = {"name":"Terastodon","type":"Creature — Elephant","mana":"{6}{G}{G}","oracle":"When this creature enters, you may destroy up to three target noncreature permanents. For each permanent put into a graveyard this way, its controller creates a 3/3 green Elephant creature token.","layout":"normal","cmc":8,"power":"9","toughness":"9","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #1421
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const RELIC = {"name":"Darksteel Relic","type":"Artifact","mana":"{0}","oracle":"Indestructible (Effects that say \"destroy\" don't destroy this artifact.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #8171
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2307
const LEYLINE = {"name":"Leyline of the Void","type":"Enchantment","mana":"{2}{B}{B}","oracle":"If this card is in your opening hand, you may begin the game with it on the battlefield.\nIf a card would be put into an opponent's graveyard from anywhere, exile it instead.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #3497
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #212
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", mana: "", oracle: "{T}, Sacrifice this token: Add one mana of any color.", layout: "token", cmc: 0, power: null, toughness: null, loyalty: null, keywords: [], colors: [], colorIdentity: [], token: true };

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
function board(boards) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], exile: [], hand: [], library: [] };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], players };
}
const targetsOf = (...ids) => ids.map((id) => ({ id, type: "permanent" }));
/** The destroy event over `ids`: its graveyard report, sorted. */
const reportFor = (s, ...ids) => {
  expect(typeof SE.destroyEvent, "spellEffects has no destroyEvent").toBe("function");
  return [...SE.destroyEvent(s, { controller: "user", targets: targetsOf(...ids) }).intoGraveyard].sort();
};
const RIDER_ATOM = { op: "destroy", targetType: "noncreaturePermanent", minTargets: 0, maxTargets: 3,
  controllerRider: { kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "elephant", onlyIfToGraveyard: true } };
const elephants = (s, seat) => s.players[seat].battlefield.filter((p) => /Elephant/.test(p.card?.name || "")).length;

describe("Terastodon is parked (pw29's review, F1)", () => {
  it("⭐ not credited: its enters trigger's clause reads LOW (no \"destroy up to three target noncreature permanents\"), so the card is body-only", () => {
    expect(isNativeTier(classifyCard(TERASTODON))).toBe(false);
    const d = detectTriggers(TERASTODON).find((x) => x.event === "etb");
    expect({ routes: !!d && triggerRoutesNatively(d), conf: programConfidence(parseEffectProgram({ type: "Instant", oracle: d.effectClause })) }).toEqual({ routes: false, conf: "low" });
  });
});

describe("the destroy event's graveyard report (spellEffects.destroyEvent) — the lane's resolver half", () => {
  it("⭐ a destroyed artifact and a destroyed token are put into the graveyard; an indestructible one is not destroyed", () => {
    const s = board({ ai: [on("ai", "sol", SOL), on("ai", "treasure", TREASURE), on("ai", "relic", RELIC)] });
    expect(reportFor(s, "sol", "treasure", "relic")).toEqual(["sol", "treasure"]);
  });
  it("⭐ Rest in Peace exiles both instead — nothing is put into a graveyard; Leyline of the Void exiles only its controller's opponent's card", () => {
    expect(reportFor(board({ user: [on("user", "rip", RIP)], ai: [on("ai", "sol", SOL), on("ai", "treasure", TREASURE)] }), "sol", "treasure")).toEqual([]);
    expect(reportFor(board({ user: [on("user", "usol", SOL)], ai: [on("ai", "leyline", LEYLINE), on("ai", "stone", MIND_STONE)] }), "usol", "stone")).toEqual(["stone"]);
  });
  it("⭐ a land and the Aura on it, both destroyed: both are reported (the Aura by its own record); the land alone — the Aura falls off (CR 704.5m) and is not reported", () => {
    const b = () => board({ user: [on("user", "uforest", FOREST, { attachments: ["growth"] }), on("user", "growth", WILD_GROWTH, { attachedTo: "uforest" })] });
    expect(reportFor(b(), "uforest", "growth")).toEqual(["growth", "uforest"]);
    expect(reportFor(b(), "uforest")).toEqual(["uforest"]);
  });
  it("⭐ applyDestroyEffect is destroyEvent's state, byte for byte", () => {
    const s = board({ user: [on("user", "rip", RIP)], ai: [on("ai", "sol", SOL), on("ai", "relic", RELIC), on("ai", "stone", MIND_STONE)] });
    const opts = { controller: "user", targets: targetsOf("sol", "relic", "stone") };
    expect(typeof SE.destroyEvent, "spellEffects has no destroyEvent").toBe("function");
    expect(JSON.stringify(SE.applyDestroyEffect(s, opts))).toBe(JSON.stringify(SE.destroyEvent(s, opts).state));
  });
  it("⭐ the onlyIfToGraveyard rider: a token only for each permanent the destroy put into a graveyard (the Relic stays, the Treasure and Sol Ring go — two Elephants for the AI)", () => {
    const s = board({ ai: [on("ai", "sol", SOL), on("ai", "treasure", TREASURE), on("ai", "relic", RELIC)] });
    const done = applyRemovalWithRider(s, RIDER_ATOM, { controller: "user", targets: targetsOf("sol", "treasure", "relic"), cardName: "Terastodon" });
    expect({ ai: elephants(done, "ai"), relic: done.players.ai.battlefield.some((p) => p.id === "relic") }).toEqual({ ai: 2, relic: true });
  });
  it("⭐ under Rest in Peace the rider makes none", () => {
    const s = board({ user: [on("user", "rip", RIP)], ai: [on("ai", "sol", SOL), on("ai", "treasure", TREASURE)] });
    const done = applyRemovalWithRider(s, RIDER_ATOM, { controller: "user", targets: targetsOf("sol", "treasure"), cardName: "Terastodon" });
    expect(elephants(done, "ai")).toBe(0);
  });
});
