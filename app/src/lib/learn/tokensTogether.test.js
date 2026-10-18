/**
 * tokensTogether.test.js — the play-weighted program, #1062 Wurmcoil Engine and #2198 Triplicate Titan, and the cards that
 * print the same sentence: ONE "create" naming two or three DIFFERENT token kinds.
 *
 *   Wurmcoil Engine:  "When this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch
 *                      and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink."
 *   Triplicate Titan: "When this creature dies, create a 3/3 colorless Golem artifact creature token with flying, a 3/3
 *                      colorless Golem artifact creature token with vigilance, and a 3/3 colorless Golem artifact creature
 *                      token with trample."
 *
 * Each token kind alone was read already (the fixed-count create arm with its keyword rider); the list was not, so every card
 * parked on it. The list now reads as ONE atom (create-tokens-together) holding each kind's own create-token reading — any kind
 * the single arm can't read keeps the whole sentence unread. The tokens are created together (the bundled Wurmcoil ruling:
 * "The two creature tokens enter at the same time."): one creation event, so a "those tokens plus an additional Food token"
 * replacement (Peregrin Took) adds ONE Food, and a token doubler doubles each kind (CR 111.2 — the creator owns and controls
 * them).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The deaths run through the engine's own entry points: Murder is the offered cast, dispatched; passPriority resolves
 * it and the dies trigger.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { permanentHasKeyword, permanentColors } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const WURMCOIL = {"name":"Wurmcoil Engine","type":"Artifact Creature — Phyrexian Wurm","mana":"{6}","cmc":6,"power":"6","toughness":"6","keywords":["Lifelink","Deathtouch"],"colors":[],"oracle":"Deathtouch, lifelink\nWhen this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch and a 3/3 colorless Phyrexian Wurm artifact creature token with lifelink."}; // body-only #1062
const TITAN = {"name":"Triplicate Titan","type":"Artifact Creature — Golem","mana":"{9}","cmc":9,"power":"9","toughness":"9","keywords":["Flying","Vigilance","Trample"],"colors":[],"oracle":"Flying, vigilance, trample\nWhen this creature dies, create a 3/3 colorless Golem artifact creature token with flying, a 3/3 colorless Golem artifact creature token with vigilance, and a 3/3 colorless Golem artifact creature token with trample."}; // body-only #2198
const LARVA = {"name":"Wurmcoil Larva","type":"Artifact Creature — Phyrexian Wurm","mana":"{3}{B}{B}","cmc":5,"power":"3","toughness":"3","keywords":["Lifelink","Deathtouch"],"colors":["B"],"oracle":"Deathtouch, lifelink\nWhen this creature dies, create a 1/2 black Phyrexian Wurm artifact creature token with deathtouch and a 2/1 black Phyrexian Wurm artifact creature token with lifelink."}; // body-only #12640
const FRIENDSHIP = {"name":"Forbidden Friendship","type":"Sorcery","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Create a 1/1 red Dinosaur creature token with haste and a 1/1 white Human Soldier creature token."}; // arbiter-spell #11507
const MASCOT = {"name":"Mascot Exhibition","type":"Sorcery — Lesson","mana":"{7}","cmc":7,"keywords":[],"colors":[],"oracle":"Create a 2/1 white and black Inkling creature token with flying, a 3/2 red and white Spirit creature token, and a 4/4 blue and red Elemental creature token."}; // arbiter-spell #13456
const MENACE = {"name":"Bestial Menace","type":"Sorcery","mana":"{3}{G}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"Create a 1/1 green Snake creature token, a 2/2 green Wolf creature token, and a 3/3 green Elephant creature token."}; // arbiter-spell #18796
const TROSTANI = {"name":"Trostani's Summoner","type":"Creature — Elf Shaman","mana":"{5}{G}{W}","cmc":7,"power":"1","toughness":"1","keywords":[],"colors":["G","W"],"oracle":"When this creature enters, create a 2/2 white Knight creature token with vigilance, a 3/3 green Centaur creature token, and a 4/4 green Rhino creature token with trample."}; // body-only #17499
const SOMBERWALD = {"name":"Somberwald Beastmaster","type":"Creature — Human Ranger","mana":"{6}{G}","cmc":7,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, create a 2/2 green Wolf creature token, a 3/3 green Beast creature token, and a 4/4 green Beast creature token.\nCreature tokens you control have deathtouch. (Any amount of damage they deal to a creature is enough to destroy it.)"}; // body-only #13391
const SPECIMEN = {"name":"Specimen Collector","type":"Creature — Vedalken Wizard","mana":"{4}{U}","cmc":5,"power":"2","toughness":"1","keywords":[],"colors":["U"],"oracle":"When this creature enters, create a 1/1 green Squirrel creature token and a 0/3 blue Crab creature token.\nWhen this creature dies, create a token that's a copy of target token you control."}; // body-only #22967
const LIVESTOCK = {"name":"Liberated Livestock","type":"Creature — Cat Bird Ox","mana":"{5}{W}","cmc":6,"power":"4","toughness":"6","keywords":[],"colors":["W"],"oracle":"When this creature dies, create a 1/1 white Cat creature token with lifelink, a 1/1 white Bird creature token with flying, and a 2/4 white Ox creature token. For each of those tokens, you may put an Aura card from your hand and/or graveyard onto the battlefield attached to it."}; // body-only #18166
const KILLER = {"name":"A Killer Among Us","type":"Enchantment","mana":"{4}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"When this enchantment enters, create a 1/1 white Human creature token, a 1/1 blue Merfolk creature token, and a 1/1 red Goblin creature token. Then secretly choose Human, Merfolk, or Goblin.\nSacrifice this enchantment, Reveal the creature type you chose: If target attacking creature token is the chosen type, put three +1/+1 counters on it and it gains deathtouch until end of turn."}; // body-only #23377
const TOOK = {"name":"Peregrin Took","type":"Legendary Creature — Halfling Citizen","mana":"{2}{G}","cmc":3,"power":"2","toughness":"3","keywords":["Food"],"colors":["G"],"oracle":"If one or more tokens would be created under your control, those tokens plus an additional Food token are created instead. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nSacrifice three Foods: Draw a card."}; // native-mixed #791
const LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."}; // native-static #408
const WARDEN = {"name":"Soul Warden","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"Whenever another creature enters, you gain 1 life."}; // native-trigger #474
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell #861
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = (card, n, tag) => Array.from({ length: n }, (_, i) => P(`${tag}${i}`, card, "user"));
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** A two-seat game (user, ai), the user active in its precombat main with priority. */
function table({ board = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: library(pid), life: 20 };
  players.user = { ...players.user, battlefield: board, hand };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
function cast(s, cardId, targetId = null) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId
    && (targetId == null || (x.targets || []).some((t) => t.id === targetId)));
  if (!a) throw new Error(`no cast offered for ${cardId}`);
  return resolveStack(dispatchAction(s, a));
}
const tokensOf = (s, pid = "user") => s.players[pid].battlefield.filter((p) => p.card?.token);
const kws = (s, p, list) => list.filter((k) => permanentHasKeyword(s, p.id, k));
const summary = (s, p) => ({ name: p.card.name, type: p.card.type, pt: `${p.card.power}/${p.card.toughness}`, colors: [...permanentColors(s, p.id)].sort() });
const createClause = (card) => card.oracle.split("\n").find((l) => /create a /i.test(l)).replace(/^.*?, (?=create )/i, "").replace(/\.$/, "");

describe("PARSE — one create naming several token kinds reads as one atom of their readings", () => {
  it("Wurmcoil Engine's dies clause → create-tokens-together: a 3/3 deathtouch Wurm and a 3/3 lifelink Wurm, each its own kind", () => {
    const p = parseEffectClause(createClause(WURMCOIL), "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "create-tokens-together", targetType: null });
    expect(p.atoms[0].specs).toEqual([
      { op: "create-token", count: 1, power: 3, toughness: 3, descriptor: "colorless phyrexian wurm artifact", targetType: null, keywords: ["Deathtouch"] },
      { op: "create-token", count: 1, power: 3, toughness: 3, descriptor: "colorless phyrexian wurm artifact", targetType: null, keywords: ["Lifelink"] },
    ]);
  });

  it("Triplicate Titan's three-kind list (\"A, B, and C\") → three specs, flying / vigilance / trample", () => {
    const p = parseEffectClause(createClause(TITAN), "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].specs.map((x) => [x.descriptor, x.keywords])).toEqual([
      ["colorless golem artifact", ["Flying"]], ["colorless golem artifact", ["Vigilance"]], ["colorless golem artifact", ["Trample"]],
    ]);
  });

  it("control — a single kind still parses as the plain create-token atom it always was", () => {
    const p = parseEffectClause("create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch", "Instant", { sourceScoped: true });
    expect(p.atoms).toEqual([{ op: "create-token", count: 1, power: 3, toughness: 3, descriptor: "colorless phyrexian wurm artifact", targetType: null, keywords: ["Deathtouch"] }]);
  });

  it("CREED — a kind the single arm can't read keeps the whole list unread (a protection rider, a quoted ability)", () => {
    for (const clause of [
      "create a 1/1 white Cat creature token with lifelink and a 2/2 black Zombie creature token with protection from white",
      "create a 1/1 white Cat creature token and a 1/1 colorless Servo artifact creature token with \"This creature can't block.\"",
    ]) expect([clause, programConfidence(parseEffectClause(clause, "Instant", { sourceScoped: true }))]).toEqual([clause, "low"]);
  });
});

describe("CLASSIFICATION", () => {
  it("Wurmcoil Engine's and Triplicate Titan's dies triggers route natively and both cards classify native", () => {
    for (const c of [WURMCOIL, TITAN]) {
      const d = detectTriggers(c).find((x) => x.event === "dies");
      expect([c.name, triggerRoutesNatively(d), isNativeTier(classifyCard(c))]).toEqual([c.name, true, true]);
    }
  });

  it("the twins the same reader unlocks classify native: Wurmcoil Larva, Forbidden Friendship, Mascot Exhibition, Bestial Menace, Trostani's Summoner, Somberwald Beastmaster, Specimen Collector", () => {
    const fam = [LARVA, FRIENDSHIP, MASCOT, MENACE, TROSTANI, SOMBERWALD, SPECIMEN];
    expect(fam.map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual(fam.map((c) => [c.name, true]));
  });

  it("CREED — a list with another sentence the engine doesn't read stays parked (Liberated Livestock's Auras, A Killer Among Us's secret choice)", () => {
    for (const c of [LIVESTOCK, KILLER]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, false]);
  });
});

describe("RUNTIME — the kinds are created together, each with its own abilities", () => {
  const killWith = (board) => {
    const s0 = table({ board: [...board, ...lands(SWAMP, 3, "sw")], hand: [{ ...MURDER, id: "murder" }] });
    return cast(s0, "murder", board[0].id);
  };

  it("⭐ Wurmcoil Engine dies to Murder → two 3/3 colorless Phyrexian Wurm artifact creature tokens, one with deathtouch only, one with lifelink only", () => {
    const s = killWith([P("wurm", WURMCOIL, "user")]);
    expect(s.players.user.battlefield.some((p) => p.id === "wurm")).toBe(false);
    const toks = tokensOf(s);
    expect(toks.map((p) => summary(s, p))).toEqual([
      { name: "Phyrexian Wurm", type: "Token Artifact Creature — Phyrexian Wurm", pt: "3/3", colors: [] },
      { name: "Phyrexian Wurm", type: "Token Artifact Creature — Phyrexian Wurm", pt: "3/3", colors: [] },
    ]);
    expect(toks.map((p) => kws(s, p, ["Deathtouch", "Lifelink"]))).toEqual([["Deathtouch"], ["Lifelink"]]);
  });

  it("one creation event: with Peregrin Took the two Wurms come with ONE additional Food", () => {
    const s = killWith([P("wurm", WURMCOIL, "user"), P("took", TOOK, "user")]);
    const toks = tokensOf(s);
    expect(toks.filter((p) => p.card.name === "Phyrexian Wurm")).toHaveLength(2);
    expect(toks.filter((p) => p.card.name === "Food")).toHaveLength(1);
  });

  it("a token doubler doubles each kind: with Parallel Lives, two deathtouch Wurms and two lifelink Wurms", () => {
    const s = killWith([P("wurm", WURMCOIL, "user"), P("lives", LIVES, "user")]);
    expect(tokensOf(s).map((p) => kws(s, p, ["Deathtouch", "Lifelink"]).join("")).sort()).toEqual(["Deathtouch", "Deathtouch", "Lifelink", "Lifelink"]);
  });

  it("each token enters: Soul Warden sees both Wurms (+2 life)", () => {
    const s = killWith([P("wurm", WURMCOIL, "user"), P("warden", WARDEN, "user")]);
    expect(tokensOf(s)).toHaveLength(2);
    expect(s.players.user.life).toBe(22);
  });

  it("Triplicate Titan dies → three 3/3 colorless Golems: flying, vigilance, trample", () => {
    const s = killWith([P("titan", TITAN, "user")]);
    const toks = tokensOf(s);
    expect(toks.map((p) => summary(s, p).pt)).toEqual(["3/3", "3/3", "3/3"]);
    expect(toks.map((p) => kws(s, p, ["Flying", "Vigilance", "Trample"]))).toEqual([["Flying"], ["Vigilance"], ["Trample"]]);
  });

  it("Wurmcoil Larva dies → a 1/2 black deathtouch Wurm and a 2/1 black lifelink Wurm", () => {
    const s = killWith([P("larva", LARVA, "user")]);
    const toks = tokensOf(s);
    expect(toks.map((p) => [summary(s, p).pt, summary(s, p).colors, kws(s, p, ["Deathtouch", "Lifelink"])])).toEqual([["1/2", ["B"], ["Deathtouch"]], ["2/1", ["B"], ["Lifelink"]]]);
  });

  it("Forbidden Friendship (cast) → a 1/1 red Dinosaur with haste and a 1/1 white Human Soldier", () => {
    const s = cast(table({ board: lands(MOUNTAIN, 2, "mt"), hand: [{ ...FRIENDSHIP, id: "ff" }] }), "ff");
    const toks = tokensOf(s);
    expect(toks.map((p) => summary(s, p))).toEqual([
      { name: "Dinosaur", type: "Token Creature — Dinosaur", pt: "1/1", colors: ["R"] },
      { name: "Human Soldier", type: "Token Creature — Human Soldier", pt: "1/1", colors: ["W"] },
    ]);
    expect(toks.map((p) => kws(s, p, ["Haste"]))).toEqual([["Haste"], []]);
  });

  it("Mascot Exhibition (cast) → the two-colour kinds keep both colours: a W/B 2/1 flying Inkling, an R/W 3/2 Spirit, a U/R 4/4 Elemental", () => {
    const s = cast(table({ board: lands(MOUNTAIN, 7, "mt"), hand: [{ ...MASCOT, id: "mascot" }] }), "mascot");
    const toks = tokensOf(s);
    expect(toks.map((p) => [p.card.name, summary(s, p).pt, summary(s, p).colors, kws(s, p, ["Flying"])])).toEqual([
      ["Inkling", "2/1", ["B", "W"], ["Flying"]], ["Spirit", "3/2", ["R", "W"], []], ["Elemental", "4/4", ["R", "U"], []],
    ]);
  });

  it("Somberwald Beastmaster enters → a 2/2 Wolf, a 3/3 Beast and a 4/4 Beast, each with deathtouch from its own static", () => {
    let s = table({ board: Array.from({ length: 7 }, (_, i) => P(`fo${i}`, { ...ISLAND, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, "user")), hand: [{ ...SOMBERWALD, id: "sbm" }] });
    s = cast(s, "sbm");
    const toks = tokensOf(s);
    expect(toks.map((p) => [p.card.name, summary(s, p).pt, kws(s, p, ["Deathtouch"])])).toEqual([["Wolf", "2/2", ["Deathtouch"]], ["Beast", "3/3", ["Deathtouch"]], ["Beast", "4/4", ["Deathtouch"]]]);
  });

  it("control — a single-kind create through the same death path is unchanged (one token)", () => {
    const LONE = { ...WURMCOIL, name: "Lone Wurm Test", oracle: "When this creature dies, create a 3/3 colorless Phyrexian Wurm artifact creature token with deathtouch." };
    const s = killWith([P("lone", LONE, "user")]);
    expect(tokensOf(s).map((p) => kws(s, p, ["Deathtouch", "Lifelink"]))).toEqual([["Deathtouch"]]);
  });
});
