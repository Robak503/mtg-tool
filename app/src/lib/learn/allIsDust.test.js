/**
 * allIsDust.test.js — ALL IS DUST (the play-weighted program, EDHREC #988):
 *
 *   "Each player sacrifices all permanents they control that are one or more colors."
 *
 * One atom (effects/atoms/removal.applySacrificeAllColored): every permanent of every player whose colours as it is NOW are one or
 * more (layers.permanentColors, after layer 5 — CR 105.2, 613.1e) is sacrificed, all of them as one event (its ruling: "All
 * permanents with one or more colors are sacrificed at the same time"). Its rulings witnessed: lands are colourless unless an effect
 * says otherwise (a Forest stays, Dryad Arbor — a green land — goes); a sacrifice is no destruction, so indestructible doesn't save a
 * permanent (CR 701.21a). The default AI holds it like every symmetric wipe — unless it controls no coloured permanent and an
 * opponent does (opponentAI.coloredSacrificeOneSided).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const DUST = {"name":"All Is Dust","type":"Kindred Sorcery — Eldrazi","mana":"{7}","oracle":"Each player sacrifices all permanents they control that are one or more colors.","layout":"normal","cmc":7,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #988
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const AVACYN = {"name":"Avacyn, Angel of Hope","type":"Legendary Creature — Angel","mana":"{5}{W}{W}{W}","oracle":"Flying, vigilance, indestructible\nOther permanents you control have indestructible.","layout":"normal","cmc":8,"power":"8","toughness":"8","loyalty":null,"keywords":["Flying","Indestructible","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #763
const MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","layout":"normal","cmc":3,"power":"0","toughness":"1","loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #6697
const ARBOR = {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")","layout":"normal","cmc":0,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #769
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #32
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","oracle":"Enchant creature\nEnchanted creature can't attack or block.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #5236
const WISPS = {"name":"Cerulean Wisps","type":"Instant","mana":"{U}","oracle":"Target creature becomes blue until end of turn. Untap that creature.\nDraw a card.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #4524
const CRUSHER = {"name":"Ulamog's Crusher","type":"Creature — Eldrazi","mana":"{8}","oracle":"Annihilator 2 (Whenever this creature attacks, defending player sacrifices two permanents of their choice.)\nThis creature attacks each combat if able.","layout":"normal","cmc":8,"power":"8","toughness":"8","loyalty":null,"keywords":["Annihilator"],"colors":[],"colorIdentity":[]}; // EDHREC #3456

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const POOL = { W: 0, U: 2, B: 0, R: 0, G: 0, C: 7 };
/** `caster`'s precombat main with All Is Dust (and `hand`) in hand and a floating pool; `boards` per seat. */
function table({ caster = "user", boards = {}, hand = [], pod = false } = {}) {
  const g = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...g.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], battlefield: boards[pid] || [], graveyard: [], library: [{ ...FOREST, id: `lib-${pid}` }],
      hand: pid === caster ? [{ ...DUST, id: "h-dust" }, ...hand] : [], manaPool: pid === caster ? { ...POOL } : { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, players };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
function castDust(s, seat = "user") {
  const a = legalActionsForPlayer(s, seat).find((x) => x.kind === "cast-spell" && x.cardId === "h-dust");
  expect(a, "All Is Dust is not offered").toBeTruthy();
  return settle(dispatchAction(s, a));
}
const names = (cards) => (cards || []).map((c) => c.card?.name ?? c.name).sort();

describe("the card", () => {
  it("⭐ native: one atom over every player's coloured permanents", () => {
    expect({ tier: classifyCard(DUST), atoms: parseEffectProgram(DUST)?.atoms }).toEqual({ tier: "native-spell", atoms: [{ op: "sacrifice-all-colored", targetType: null }] });
  });
});

describe("the resolution", () => {
  const boards = () => ({
    user: [on("user", "bears", BEARS), on("user", "stone", STONE), on("user", "forest", FOREST), on("user", "arbor", ARBOR), on("user", "myr", MYR, { attachments: ["pac"] })],
    ai: [on("ai", "avacyn", AVACYN), on("ai", "crusher", CRUSHER), on("ai", "pac", PACIFISM, { attachedTo: "myr" })],
  });
  it("⭐ every coloured permanent of each player is sacrificed — Grizzly Bears, Dryad Arbor (a green land), indestructible Avacyn, the Pacifism on a colourless Myr — and the colourless stay", () => {
    const s = castDust(table({ boards: boards() }));
    expect({ user: names(s.players.user.battlefield), ai: names(s.players.ai.battlefield), userGy: names(s.players.user.graveyard), aiGy: names(s.players.ai.graveyard),
      myrFree: s.players.user.battlefield.find((p) => p.id === "myr")?.attachments?.length ?? 0 })
      .toEqual({ user: ["Darksteel Myr", "Forest", "Mind Stone"], ai: ["Ulamog's Crusher"], userGy: ["All Is Dust", "Dryad Arbor", "Grizzly Bears"], aiGy: ["Avacyn, Angel of Hope", "Pacifism"], myrFree: 0 });
  });
  it("⭐ at the same time: one sacrifice event names all four, across both players", () => {
    const s = castDust(table({ boards: boards() }));
    const together = (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "sacrifice-together");
    expect({ events: together.length, victims: [...(together[0]?.sacrificed || [])].sort(), single: (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "sacrifice").length })
      .toEqual({ events: 1, victims: ["arbor", "avacyn", "bears", "pac"], single: 0 });
  });
  it("⭐ the colour as it is now: Darksteel Myr turned blue by Cerulean Wisps goes (CR 613.1e); the same Myr untouched stays (above)", () => {
    let s = table({ boards: { user: [on("user", "myr", MYR)], ai: [] }, hand: [{ ...WISPS, id: "h-wisps" }] });
    const w = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-wisps" && (x.targets || []).some((t) => t.id === "myr"));
    expect(w, "Cerulean Wisps at the Myr").toBeTruthy();
    s = settle(dispatchAction(s, w));
    s = castDust(s);
    expect({ bf: names(s.players.user.battlefield), gy: names(s.players.user.graveyard).filter((n) => n !== "Cerulean Wisps") }).toEqual({ bf: [], gy: ["All Is Dust", "Darksteel Myr"] });
  });
  it("⭐ each player, in a pod: every seat loses its coloured permanents, the caster's included", () => {
    const s = castDust(table({ pod: true, boards: { user: [on("user", "u1", BEARS), on("user", "u2", STONE)], ai1: [on("ai1", "a1", BEARS)], ai2: [on("ai2", "a2", AVACYN), on("ai2", "a3", FOREST)], ai3: [on("ai3", "a4", CRUSHER)] } }));
    expect(["user", "ai1", "ai2", "ai3"].map((pid) => names(s.players[pid].battlefield))).toEqual([["Mind Stone"], [], ["Forest"], ["Ulamog's Crusher"]]);
  });
  it("⛔ no coloured permanent anywhere: nothing is sacrificed", () => {
    const s = castDust(table({ boards: { user: [on("user", "stone", STONE)], ai: [on("ai", "crusher", CRUSHER)] } }));
    expect({ user: names(s.players.user.battlefield), ai: names(s.players.ai.battlefield) }).toEqual({ user: ["Mind Stone"], ai: ["Ulamog's Crusher"] });
  });
});

describe("the default AI holding All Is Dust", () => {
  const aiPick = (boards) => {
    const s = table({ caster: "ai", boards });
    return pickAction(s, "ai", legalActionsForPlayer(s, "ai"))?.cardId ?? null;
  };
  it("⭐ its own board colourless, an opponent's coloured: it casts it", () => {
    expect(aiPick({ ai: [on("ai", "crusher", CRUSHER), on("ai", "stone", STONE)], user: [on("user", "avacyn", AVACYN)] })).toBe("h-dust");
  });
  it("⛔ with a coloured permanent of its own it holds it (a symmetric wipe)", () => {
    expect(aiPick({ ai: [on("ai", "crusher", CRUSHER), on("ai", "bears", BEARS)], user: [on("user", "avacyn", AVACYN)] })).not.toBe("h-dust");
  });
  it("⛔ with no coloured permanent among its opponents it holds it (it would do nothing)", () => {
    expect(aiPick({ ai: [on("ai", "crusher", CRUSHER)], user: [on("user", "stone", STONE)] })).not.toBe("h-dust");
  });
});
