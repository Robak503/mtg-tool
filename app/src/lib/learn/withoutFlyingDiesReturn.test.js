/**
 * LUMINOUS BROODMOTH (EDHREC #1165) — "Flying / Whenever a creature you control without flying dies, return it to the battlefield
 * under its owner's control with a flying counter on it."
 *
 * Two readers. The dies watcher with a keyword exclusion on the DEAD creature: "without flying" is read from the creature as it
 * last existed on the battlefield (CR 603.10a — a leaves-the-battlefield ability looks back; the death look-back records whether it
 * had flying, printed or granted, layer-aware). And the return of "it" — the card that died (CR 608.2c), from the graveyard that
 * holds it, onto its OWNER's battlefield (CR 108.3), entering with the flying counter (an "enters with" replacement, CR 614.1c,
 * 122.6; the counter grants flying, CR 122.1b). The bundled rulings: a token without flying that dies triggers it but doesn't
 * return (CR 111.7); dying at the same time as a creature without flying, it still triggers for that creature; a Broodmoth that
 * lost flying triggers for itself.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const BROODMOTH = {"name":"Luminous Broodmoth","type":"Creature — Insect","mana":"{2}{W}{W}","cmc":4,"power":"3","toughness":"4","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nWhenever a creature you control without flying dies, return it to the battlefield under its owner's control with a flying counter on it."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const WIND_DRAKE = {"name":"Wind Drake","type":"Creature — Drake","mana":"{2}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying"};
const LEVITATION = {"name":"Levitation","type":"Enchantment","mana":"{2}{U}{U}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Creatures you control have flying."};
const SOLDIER_TOKEN = { name: "Soldier", type: "Token Creature — Soldier", power: "1", toughness: "1", keywords: [], colors: ["W"], oracle: "", token: true };

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function table({ user = [], ai = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: Array.from({ length: 5 }, (_, i) => ({ ...BEARS, id: `${pid}-lib${i}` })), life: 20 };
  players.user = { ...players.user, battlefield: user };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function settle(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 60 && (s.stack || []).length && !s.pendingChoice; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
/** Lethal damage on each of `ids`, the state-based check, the dies triggers, and everything resolved. */
function kill(s, ids) {
  s = { ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, battlefield: p.battlefield.map((x) => (ids.includes(x.id) ? { ...x, damageMarked: 99 } : x)) }])) };
  const r = destroyLethalCreatures(s);
  return settle(checkDiesTriggers(r.state, r.dead));
}
const onBattlefield = (s, pid, name) => (s.players[pid].battlefield || []).filter((p) => p.card?.name === name);

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(BROODMOTH))).toBe(true);
  });
  it("⭐ the watcher: a creature you control dies, its flying read from the look-back", () => {
    const d = detectTriggers(BROODMOTH).find((x) => x.event === "dies");
    expect(d && { scope: d.scope, withoutKeyword: d.withoutKeyword, routes: triggerRoutesNatively(d) }).toEqual({ scope: "creatureYouControl", withoutKeyword: "flying", routes: true });
  });
});

describe("the game", () => {
  it("⭐ its controller's Bears dies: it comes back, a new object with a flying counter, and flies", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("bears", BEARS, "user")] }), ["bears"]);
    const back = onBattlefield(s, "user", "Grizzly Bears");
    expect(back).toHaveLength(1);
    expect({ counter: back[0].counters?.flying, flies: permanentHasKeyword(s, back[0].id, "Flying"), gy: s.players.user.graveyard.length }).toEqual({ counter: 1, flies: true, gy: 0 });
  });
  it("⭐ it comes back once: the returned Bears has flying, so its next death stays in the graveyard", () => {
    let s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("bears", BEARS, "user")] }), ["bears"]);
    const back = onBattlefield(s, "user", "Grizzly Bears");
    expect(back).toHaveLength(1);
    s = kill(s, [back[0].id]);
    expect({ back: onBattlefield(s, "user", "Grizzly Bears").length, gy: s.players.user.graveyard.map((c) => c.name) }).toEqual({ back: 0, gy: ["Grizzly Bears"] });
  });
  it("CONTROL — a creature WITH flying (Wind Drake) and the Broodmoth itself stay dead", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("drake", WIND_DRAKE, "user")] }), ["drake", "moth"]);
    expect(s.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Luminous Broodmoth", "Wind Drake"]);
  });
  it("⭐ flying as it last existed counts: under Levitation the Bears had flying and stays dead", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("lev", LEVITATION, "user"), P("bears", BEARS, "user")] }), ["bears"]);
    expect(onBattlefield(s, "user", "Grizzly Bears")).toHaveLength(0);
  });
  it("CONTROL — an opponent's Bears dying is no creature its controller controls", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user")], ai: [P("abears", BEARS, "ai")] }), ["abears"]);
    expect({ user: onBattlefield(s, "user", "Grizzly Bears").length, ai: onBattlefield(s, "ai", "Grizzly Bears").length }).toEqual({ user: 0, ai: 0 });
  });
  it("⭐ its ruling — dying together with a creature without flying, it still triggers for that creature", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("bears", BEARS, "user")] }), ["moth", "bears"]);
    expect({ bears: onBattlefield(s, "user", "Grizzly Bears").length, moth: onBattlefield(s, "user", "Luminous Broodmoth").length }).toEqual({ bears: 1, moth: 0 });
  });
  it("⭐ its ruling — a token without flying triggers it, but a token never returns", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("tok", SOLDIER_TOKEN, "user")] }), ["tok"]);
    expect(onBattlefield(s, "user", "Soldier")).toHaveLength(0);
  });
  it("⭐ \"under its owner's control\": a Bears its controller stole comes back to its owner", () => {
    const stolen = { ...P("sbears", { ...BEARS, owner: "ai" }, "user"), owner: "ai" };
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), stolen] }), ["sbears"]);
    expect({ user: onBattlefield(s, "user", "Grizzly Bears").length, ai: onBattlefield(s, "ai", "Grizzly Bears").length }).toEqual({ user: 0, ai: 1 });
  });
});

// ── "WITH a flying counter on it" is an ENTERS-WITH counter (the integrator's review, 2026-11-01; CR 614.1c, 122.6): the creature
// has flying AS it enters, so an enters watcher that reads flying sees it. Dragon Tempest — "Whenever a creature you control with
// flying enters, it gains haste until end of turn." — fires for the returned Bears; a counter added after the entry would not.
describe("the flying counter is on it as it enters", () => {
  const DRAGON_TEMPEST = {"name":"Dragon Tempest","type":"Enchantment","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Whenever a creature you control with flying enters, it gains haste until end of turn.\nWhenever a Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control."};
  it("⭐ the returned Bears enters with flying: Dragon Tempest gives it haste", () => {
    const s = kill(table({ user: [P("moth", BROODMOTH, "user"), P("tempest", DRAGON_TEMPEST, "user"), P("bears", BEARS, "user")] }), ["bears"]);
    const back = onBattlefield(s, "user", "Grizzly Bears");
    expect(back).toHaveLength(1);
    expect({ flying: permanentHasKeyword(s, back[0].id, "Flying"), haste: permanentHasKeyword(s, back[0].id, "Haste") }).toEqual({ flying: true, haste: true });
  });
});
