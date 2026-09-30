/**
 * podTutor.test.js — "search your library for a <type> card with mana value equal to 1 plus the sacrificed <type>'s mana
 * value, put it onto the battlefield, then shuffle" (shelf D12, 2026-09-30 — the Pod family: Birthing Pod, Prime Speaker
 * Vannifar, Oswald Fiddlebender, Repurposing Bay; the tutor half of Iron Man, Titan of Innovation in Captain America).
 *
 * The value is EXACT, read from the sacrificed permanent's last-known mana value (CR 608.2h). The dispatcher now freezes
 * that value on the activated ability itself (params.context.sacrificedForCost) as its cost is paid: the shared state
 * channel it used to read alone is overwritten by any sacrifice-cost ability activated in response.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const c = (name, type, mana, cmc, oracle = "", extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const BIRTHING_POD = c("Birthing Pod", "Artifact", "{3}{G/P}", 4, "({G/P} can be paid with either {G} or 2 life.)\n{1}{G/P}, {T}, Sacrifice a creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.");
const VANNIFAR = c("Prime Speaker Vannifar", "Legendary Creature — Elf Ooze Wizard", "{2}{G}{U}", 4, "{T}, Sacrifice another creature: Search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.", { power: "2", toughness: "4" });
const OSWALD = c("Oswald Fiddlebender", "Legendary Creature — Gnome Artificer", "{1}{W}", 2, "Magical Tinkering — {W}, {T}, Sacrifice an artifact: Search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put it onto the battlefield, then shuffle. Activate only as a sorcery.", { power: "2", toughness: "2" });
const REPURPOSING_BAY = c("Repurposing Bay", "Artifact", "{2}{U}", 3, "{2}, {T}, Sacrifice another artifact: Search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put that card onto the battlefield, then shuffle. Activate only as a sorcery.");
const ALTAR = c("Altar of Dementia", "Artifact", "{2}", 2, "Sacrifice a creature: Target player mills cards equal to the sacrificed creature's power.", { keywords: ["Mill"] });
const IRON_MAN = c("Iron Man, Titan of Innovation", "Legendary Artifact Creature — Human Hero", "{3}{U}{R}", 5, "Flying, haste\nGenius Industrialist — Whenever Iron Man attacks, create a Treasure token, then you may sacrifice a noncreature artifact. If you do, search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put it onto the battlefield tapped, then shuffle.", { power: "4", toughness: "4", keywords: ["Flying", "Haste"] });
const ELVES = c("Llanowar Elves", "Creature — Elf Druid", "{G}", 1, "{T}: Add {G}.", { power: "1", toughness: "1" });
const BEAR = c("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2" });
const COURSER = c("Centaur Courser", "Creature — Centaur Warrior", "{2}{G}", 3, "", { power: "3", toughness: "3" });
const GIANT = c("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3" });
const MASTODON = c("Siege Mastodon", "Creature — Elephant", "{4}{W}", 5, "", { power: "3", toughness: "5" });
const SOL_RING = c("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");
const BAUBLE = c("Wayfarer's Bauble", "Artifact", "{1}", 1, "{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.");
const MIND_STONE = c("Mind Stone", "Artifact", "{2}", 2, "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.");
const HEDRON = c("Hedron Archive", "Artifact", "{4}", 4, "{T}: Add {C}{C}.\n{2}, {T}, Sacrifice this artifact: Draw two cards.");

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function table({ mine = [], lib = [], mana = {}, theirLib = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: mine, library: lib.map((card, i) => ({ ...card, id: `l${i}` })), manaPool: { ...g.players.user.manaPool, ...mana } },
      ai: { ...g.players.ai, library: theirLib.map((card, i) => ({ ...card, id: `al${i}` })) } } };
}
const activation = (s, permId, victimId, pick = () => true) => legalActionsForPlayer(s, "user")
  .find((a) => a.kind === "activate-ability" && a.permanentId === permId && a.sacCreatureId === victimId && pick(a));
const candidateNames = (s) => (s.pendingChoice?.candidates || []).map((x) => x.name).sort();
const CREATURE_LIB = [ELVES, BEAR, COURSER, GIANT, MASTODON];

describe("⭐ the Pod family fetches exactly one mana value higher", () => {
  it("⭐ Birthing Pod, sacrificing a 2-drop, offers only the 3-drop — and puts it onto the battlefield", () => {
    const s = table({ mine: [perm("pod", BIRTHING_POD), perm("b", BEAR)], lib: CREATURE_LIB, mana: { G: 2 } });
    const paused = resolveTopOfStack(dispatchAction(s, activation(s, "pod", "b")));
    const pick = paused.pendingChoice.candidates.find((x) => x.name === "Centaur Courser");
    const done = resolveTutorChoice(paused, pick.id);
    const row = { candidates: candidateNames(paused), fetched: done.players.user.battlefield.some((p) => p.card.name === "Centaur Courser"), bearGone: !done.players.user.battlefield.some((p) => p.id === "b") };
    console.log(`WITNESS birthingPod ${JSON.stringify(row)}`);
    expect(row).toEqual({ candidates: ["Centaur Courser"], fetched: true, bearGone: true });
  });
  it("Prime Speaker Vannifar sacrifices ANOTHER creature (never itself) and fetches one higher", () => {
    const s = table({ mine: [perm("v", VANNIFAR), perm("e", ELVES)], lib: CREATURE_LIB });
    const offeredVictims = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "v").map((a) => a.sacCreatureId);
    const paused = resolveTopOfStack(dispatchAction(s, activation(s, "v", "e")));
    expect({ offeredVictims, candidates: candidateNames(paused) }).toEqual({ offeredVictims: ["e"], candidates: ["Grizzly Bears"] });
  });
  it("Oswald Fiddlebender and Repurposing Bay: an artifact for an artifact one higher", () => {
    const run = (engine, id, mana) => {
      const s = table({ mine: [perm(id, engine), perm("ring", SOL_RING)], lib: [BAUBLE, MIND_STONE, HEDRON], mana });
      return candidateNames(resolveTopOfStack(dispatchAction(s, activation(s, id, "ring"))));
    };
    expect({ oswald: run(OSWALD, "os", { W: 1 }), bay: run(REPURPOSING_BAY, "bay", { C: 2 }) }).toEqual({ oswald: ["Mind Stone"], bay: ["Mind Stone"] });
  });
});

describe("⚠️ the sacrificed value is frozen on the ability (the shared channel could be overwritten)", () => {
  it("⭐ Birthing Pod sacrificing a Bear, answered by Altar of Dementia sacrificing a Hill Giant: Pod still fetches mana value 3", () => {
    let s = table({ mine: [perm("pod", BIRTHING_POD), perm("altar", ALTAR), perm("b", BEAR), perm("g", GIANT)], lib: CREATURE_LIB, mana: { G: 2 }, theirLib: [ELVES, ELVES, ELVES, ELVES] });
    s = dispatchAction(s, activation(s, "pod", "b"));
    s = dispatchAction(s, activation(s, "altar", "g", (a) => a.targets?.[0]?.id === "ai"));
    s = resolveTopOfStack(s);                   // the Altar mills 3
    const paused = resolveTopOfStack(s);        // the Pod
    const row = { shared: s.sacrificedForCost?.manaValue, candidates: candidateNames(paused), milled: paused.players.ai.graveyard.length };
    console.log(`WITNESS podFrozenSacrifice ${JSON.stringify(row)}`);
    expect(row).toEqual({ shared: 4, candidates: ["Centaur Courser"], milled: 3 });
  });
  it("Altar of Dementia's own count reads its frozen value too", () => {
    let s = table({ mine: [perm("altar", ALTAR), perm("b", BEAR), perm("g", GIANT)], theirLib: Array.from({ length: 6 }, () => ELVES) });
    s = dispatchAction(s, activation(s, "altar", "b", (a) => a.targets?.[0]?.id === "ai"));   // Bear: power 2
    s = dispatchAction(s, activation(s, "altar", "g", (a) => a.targets?.[0]?.id === "ai"));   // Giant: power 3, on top
    const first = resolveTopOfStack(s);         // the Giant's mills 3
    const second = resolveTopOfStack(first);    // the Bear's mills 2 — not 3
    expect({ afterGiant: first.players.ai.graveyard.length, afterBear: second.players.ai.graveyard.length }).toEqual({ afterGiant: 3, afterBear: 5 });
  });
});

describe("the tutor itself", () => {
  it("Iron Man's clause parses — the TAPPED form — and fetches one higher, tapped", () => {
    const atoms = parseEffectClause("search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put it onto the battlefield tapped, then shuffle", "Instant").atoms;
    const s = table({ lib: [BAUBLE, MIND_STONE, HEDRON] });
    const paused = resolveAtom(s, atoms[0], { controller: "user", targets: [], sacrificedForCost: { manaValue: 1, power: 0, toughness: 0 } });
    const done = resolveTutorChoice(paused, paused.pendingChoice.candidates[0].id);
    expect({ atom: [atoms[0].op, atoms[0].entersTapped, atoms[0].filter.mvFromSacrificedPlus], candidates: candidateNames(paused), tapped: done.players.user.battlefield.find((p) => p.card.name === "Mind Stone")?.tapped })
      .toEqual({ atom: ["tutor", true, 1], candidates: ["Mind Stone"], tapped: true });
  });
  it("no sacrificed value anywhere → nothing matches (never an uncapped fetch)", () => {
    const atoms = parseEffectClause("search your library for a creature card with mana value equal to 1 plus the sacrificed creature's mana value, put that card onto the battlefield, then shuffle", "Instant").atoms;
    const out = resolveAtom(table({ lib: CREATURE_LIB }), atoms[0], { controller: "user", targets: [] });
    // The search still happens (a player isn't required to find a card with a stated quality — CR 701.23b), so the choice
    // opens, with nothing to take.
    const settled = out.pendingChoice ? resolveTutorChoice(out, null) : out;
    expect({ candidates: candidateNames(out), onBattlefield: settled.players.user.battlefield.length, libraryIntact: settled.players.user.library.length })
      .toEqual({ candidates: [], onBattlefield: 0, libraryIntact: 5 });
  });
  it("the tiers: the four Pod engines read native; Iron Man waits for its reflexive sacrifice (D13)", () => {
    expect([BIRTHING_POD, VANNIFAR, OSWALD, REPURPOSING_BAY, IRON_MAN].map((x) => classifyCard(x)))
      .toEqual(["native-activated", "native-activated", "native-activated", "native-activated", "body-only"]);
  });
});
