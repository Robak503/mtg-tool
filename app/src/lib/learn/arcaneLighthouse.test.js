/**
 * arcaneLighthouse.test.js — ARCANE LIGHTHOUSE (the play-weighted program, EDHREC #1039):
 *
 *   "{T}: Add {C}.
 *    {1}, {T}: Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud."
 *
 * The opponent-scoped group keyword loss (effects/atoms/combat.applyLoseKeywordsGroup — Shadowspear's), its set fixed as the ability
 * resolves (CR 611.2c), with "can't have": the layer-6 removal carries `cantHave`, and a "can't" beats every grant whatever its
 * timestamp (CR 613.1f, 101.2), so neither a static grant (Swiftfoot Boots) nor a later spell (Heroic Intervention) gives the
 * creatures hexproof this turn, and the "hexproof from" shields go too (CR 702.11e — Veil of Summer's, before or after). Every
 * bundled ruling witnessed: statics resume once the turn ends; a later grant isn't applied (its other halves are); creatures that
 * enter later aren't affected. A shield that isn't hexproof (Canopy Cover's "can't be the target of …") stays.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LIGHTHOUSE = {"name":"Arcane Lighthouse","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{1}, {T}: Until end of turn, creatures your opponents control lose hexproof and shroud and can't have hexproof or shroud.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1039
const BOGLE = {"name":"Slippery Bogle","type":"Creature — Beast","mana":"{G/U}","oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Hexproof"],"colors":["G","U"],"colorIdentity":["G","U"]}; // EDHREC #11514
const WALL = {"name":"Wall of Denial","type":"Creature — Wall","mana":"{1}{W}{U}","oracle":"Defender, flying\nShroud (This creature can't be the target of spells or abilities.)","layout":"normal","cmc":3,"power":"0","toughness":"8","loyalty":null,"keywords":["Flying","Shroud","Defender"],"colors":["U","W"],"colorIdentity":["U","W"]}; // EDHREC #4343
const BOOTS = {"name":"Swiftfoot Boots","type":"Artifact — Equipment","mana":"{2}","oracle":"Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #12
const INTERVENTION = {"name":"Heroic Intervention","type":"Instant","mana":"{1}{G}","oracle":"Permanents you control gain hexproof and indestructible until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #30
const VEIL = {"name":"Veil of Summer","type":"Instant","mana":"{G}","oracle":"Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #525
const CANOPY = {"name":"Canopy Cover","type":"Enchantment — Aura","mana":"{1}{G}","oracle":"Enchant creature\nEnchanted creature can't be blocked except by creatures with flying or reach.\nEnchanted creature can't be the target of spells or abilities your opponents control.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #4334
const SCOUT = {"name":"Gladecover Scout","type":"Creature — Elf Scout","mana":"{G}","oracle":"Hexproof (This creature can't be the target of spells or abilities your opponents control.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Hexproof"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #14099
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const DOOM = {"name":"Doom Blade","type":"Instant","mana":"{1}{B}","oracle":"Destroy target nonblack creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #2206

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** The person's precombat main: Arcane Lighthouse untapped, {1}{R}{B} floating, Lightning Bolt and Doom Blade in hand; the AI's board. */
function table({ aiBoard = [], aiHand = [], userBoard = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: [on("user", "lh", LIGHTHOUSE), ...userBoard], hand: [{ ...BOLT, id: "h-bolt" }, { ...DOOM, id: "h-doom" }], graveyard: [], library: [],
        manaPool: { W: 0, U: 0, B: 1, R: 1, G: 0, C: 1 } },
      ai: { ...g.players.ai, battlefield: aiBoard, hand: aiHand, graveyard: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 3, C: 0 } },
    } };
  return s;
}
const attach = (s, equipId, targetId) => attachPermanent(s, { equipId, targetId });
const targetsOf = (s, cardId, seat = "user") => [...new Set(legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.cardId === cardId)
  .flatMap((a) => (a.targets || []).filter((t) => t.type !== "player").map((t) => t.id)))].sort();
const lighthouseOffer = (s, seat = "user") => legalActionsForPlayer(s, seat).find((a) => a.kind === "activate-ability" && a.permanentId === "lh" && !a.isManaAbility);
function light(s, seat = "user") {
  const a = lighthouseOffer(s, seat);
  expect(a, "the Lighthouse's ability is not offered").toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, a));
}
/** The AI casts `cardId` (no targets) with priority, and it resolves. */
function aiCasts(s, cardId) {
  const p = { ...s, priorityHolder: "ai" };
  const a = legalActionsForPlayer(p, "ai").find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  expect(a, `${cardId} is not offered to the AI`).toBeTruthy();
  return { ...resolveTopOfStack(dispatchAction(p, a)), priorityHolder: "user" };
}

describe("the card", () => {
  it("⭐ native: every line plays", () => {
    expect(classifyCard(LIGHTHOUSE)).toBe("land");
  });
});

describe("the person's Lighthouse", () => {
  it("⭐ Bolt can't reach the Bogle (hexproof), the Wall (shroud) or the booted Bears — after the Lighthouse it reaches all three", () => {
    let s = attach(table({ aiBoard: [on("ai", "bog", BOGLE), on("ai", "wall", WALL), on("ai", "gb", BEARS), on("ai", "boots", BOOTS)] }), "boots", "gb");
    const before = targetsOf(s, "h-bolt");
    s = light(s);
    expect({ before, after: targetsOf(s, "h-bolt"), tapped: s.players.user.battlefield.find((p) => p.id === "lh").tapped, pool: s.players.user.manaPool.C })
      .toEqual({ before: [], after: ["bog", "gb", "wall"], tapped: true, pool: 0 });
  });
  it("⭐ its ruling — a later grant isn't applied: the AI's Heroic Intervention gives indestructible but not hexproof", () => {
    let s = light(table({ aiBoard: [on("ai", "gb", BEARS)], aiHand: [{ ...INTERVENTION, id: "h-int" }] }));
    s = aiCasts(s, "h-int");
    expect({ bolt: targetsOf(s, "h-bolt"), hexproof: permanentHasKeyword(s, "gb", "Hexproof"), indestructible: permanentHasKeyword(s, "gb", "Indestructible") })
      .toEqual({ bolt: ["gb"], hexproof: false, indestructible: true });
  });
  it("control: without the Lighthouse, Heroic Intervention does give hexproof", () => {
    const s = aiCasts(table({ aiBoard: [on("ai", "gb", BEARS)], aiHand: [{ ...INTERVENTION, id: "h-int" }] }), "h-int");
    expect({ bolt: targetsOf(s, "h-bolt"), hexproof: permanentHasKeyword(s, "gb", "Hexproof") }).toEqual({ bolt: [], hexproof: true });
  });
  it("⭐ CR 702.11e — hexproof from goes too: Veil of Summer's hexproof from black, cast before or after, doesn't stop Doom Blade", () => {
    const veiled = (s) => aiCasts(s, "h-veil");
    const base = () => table({ aiBoard: [on("ai", "gb", BEARS)], aiHand: [{ ...VEIL, id: "h-veil" }] });
    const veilFirst = light(veiled(base()));
    const veilAfter = veiled(light(base()));
    const veilOnly = veiled(base());
    expect({ veilFirst: targetsOf(veilFirst, "h-doom"), veilAfter: targetsOf(veilAfter, "h-doom"), veilOnly: targetsOf(veilOnly, "h-doom") })
      .toEqual({ veilFirst: ["gb"], veilAfter: ["gb"], veilOnly: [] });
  });
  it("⭐ a shield that isn't hexproof stays — Canopy Cover's Bears can't be targeted before or after; the Bogle beside it can after", () => {
    let s = attach(table({ aiBoard: [on("ai", "gb", BEARS), on("ai", "cc", CANOPY), on("ai", "bog", BOGLE)] }), "cc", "gb");
    const before = targetsOf(s, "h-bolt");
    s = light(s);
    expect({ before, after: targetsOf(s, "h-bolt") }).toEqual({ before: [], after: ["bog"] });
  });
  it("⭐ its ruling — only creatures your opponents control as it resolves: a hexproof creature entering later keeps hexproof", () => {
    let s = light(table({ aiBoard: [on("ai", "bog", BOGLE)] }));
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, on("ai", "scout", SCOUT)] } } };
    expect(targetsOf(s, "h-bolt")).toEqual(["bog"]);
  });
  it("⭐ its ruling — nor one that comes under an opponent's control later: your Scout, taken by the AI afterwards, keeps hexproof", () => {
    let s = light(table({ userBoard: [on("user", "scout", SCOUT)], aiBoard: [on("ai", "bog", BOGLE)] }));
    const scout = s.players.user.battlefield.find((p) => p.id === "scout");
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "scout") },
      ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, { ...scout, controller: "ai" }] } } };
    expect({ scoutHexproof: permanentHasKeyword(s, "scout", "Hexproof"), bolt: targetsOf(s, "h-bolt") }).toEqual({ scoutHexproof: true, bolt: ["bog"] });
  });
  it("⭐ your own creatures keep theirs: the AI still can't target your Gladecover Scout", () => {
    let s = light(table({ userBoard: [on("user", "scout", SCOUT)], aiBoard: [on("ai", "bog", BOGLE)] }));
    s = { ...s, priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...BOLT, id: "ai-bolt" }], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    expect({ scoutHexproof: permanentHasKeyword(s, "scout", "Hexproof"), aiBolt: targetsOf(s, "ai-bolt", "ai") }).toEqual({ scoutHexproof: true, aiBolt: ["bog"] });
  });
  it("⭐ its ruling — the static resumes once the turn ends: next turn the booted Bears and the Bogle are hexproof again", () => {
    let s = attach(light(table({ aiBoard: [on("ai", "bog", BOGLE), on("ai", "gb", BEARS), on("ai", "boots", BOOTS)] })), "boots", "gb");
    const during = targetsOf(s, "h-bolt");
    s = { ...expireContinuousEffects(s, { atCleanupOfTurn: 5 }), turn: 6 };
    expect({ during, nextTurn: targetsOf(s, "h-bolt") }).toEqual({ during: ["bog", "gb"], nextTurn: [] });
  });
});

describe("the default AI", () => {
  it("holds the ability — with nothing to aim at, and with your hexproof Scout across the table and its Bolt in hand (a hold, not a misplay — found, not fixed)", () => {
    const at = (userBoard) => {
      const g = table();
      const s = { ...g, activePlayer: "ai", priorityHolder: "ai", players: { ...g.players,
        ai: { ...g.players.ai, battlefield: [on("ai", "lh", LIGHTHOUSE)], hand: [{ ...BOLT, id: "ai-bolt" }], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 1 } },
        user: { ...g.players.user, battlefield: userBoard, hand: [] } } };
      const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
      return p?.permanentId === "lh" ? "lighthouse" : p?.kind;
    };
    expect([at([on("user", "gb", BEARS)]), at([on("user", "scout", SCOUT)])]).not.toContain("lighthouse");
  });
});
