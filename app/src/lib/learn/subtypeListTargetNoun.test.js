/**
 * A TARGET NOUN THAT LISTS THREE OR MORE CREATURE TYPES (the play-weighted slice, 2026-10-18) — "target Insect, Rat, Spider, or
 * Squirrel". The subtype target noun (parser.js, SHELF-85 Phase 3) read one creature type or two joined by "or"; a list of three or
 * more parsed nothing, and the most-played carriers are two lands:
 *
 *   Swarmyard (EDHREC #1032)          — "{T}: Regenerate target Insect, Rat, Spider, or Squirrel."
 *   Accursed Duneyard (#2434)         — "{2}, {T}: Regenerate target Shade, Skeleton, Specter, Spirit, Vampire, Wraith, or Zombie."
 *   Animal Sanctuary (#3797)          — "{2}, {T}: Put a +1/+1 counter on target Bird, Cat, Dog, Goat, Ox, or Snake."
 *
 * CR 205.3d's reading (a creature-type noun names the creatures of that type) and CR 205.3m's closed list: every word must be a
 * creature type, so "target artifact, creature, or planeswalker" (lower case, card types) never takes this path, and the restriction
 * the target enumerator and the resolver share (creatureRestrictions kind "subtype", the `subtypes` union) admits a creature that has
 * ANY listed type. Regeneration (CR 701.19a): "The next time [permanent] would be destroyed this turn, instead …".
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (generated from the bundled Scryfall data) ──────────────
const SWARMYARD = {"name":"Swarmyard","type":"Land","mana":"","cmc":0,"keywords":["Heal","Regenerate"],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Regenerate target Insect, Rat, Spider, or Squirrel. (The next time it would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)"}; // land-partial on f71c2a49
const ACCURSED_DUNEYARD = {"name":"Accursed Duneyard","type":"Land","mana":"","cmc":0,"keywords":["Heal","Regenerate"],"colors":[],"oracle":"{T}: Add {C}.\n{2}, {T}: Regenerate target Shade, Skeleton, Specter, Spirit, Vampire, Wraith, or Zombie. (The next time it would be destroyed this turn, instead tap it, remove it from combat, and heal all damage on it.)"}; // land-partial on f71c2a49
const ANIMAL_SANCTUARY = {"name":"Animal Sanctuary","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{2}, {T}: Put a +1/+1 counter on target Bird, Cat, Dog, Goat, Ox, or Snake."}; // land-partial on f71c2a49
const MUDFLAT_VILLAGE = {"name":"Mudflat Village","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{T}: Add {B}. Spend this mana only to cast a creature spell.\n{1}{B}, {T}, Sacrifice this land: Return target Bat, Lizard, Rat, or Squirrel card from your graveyard to your hand."}; // land-partial on f71c2a49
const ORCISH_HEALER = {"name":"Orcish Healer","type":"Creature — Orc Cleric","mana":"{R}{R}","cmc":2,"power":"1","toughness":"1","keywords":["Regenerate"],"colors":["R"],"oracle":"{R}{R}, {T}: Target creature can't be regenerated this turn.\n{B}{B}{R}, {T}: Regenerate target black or green creature.\n{R}{G}{G}, {T}: Regenerate target black or green creature."}; // body-only on f71c2a49
const BLACK_POPLAR_SHAMAN = {"name":"Black Poplar Shaman","type":"Creature — Treefolk Shaman","mana":"{2}{B}","cmc":3,"power":"1","toughness":"3","keywords":["Regenerate"],"colors":["B"],"oracle":"{2}{B}: Regenerate target Treefolk."}; // native-activated on f71c2a49
const TYPHOID_RATS = {"name":"Typhoid Rats","type":"Creature — Rat","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Deathtouch"],"colors":["B"],"oracle":"Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)"}; // native-body on f71c2a49
const SCATHE_ZOMBIES = {"name":"Scathe Zombies","type":"Creature — Zombie","mana":"{2}{B}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":""}; // native-body on f71c2a49
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const STORM_CROW = {"name":"Storm Crow","type":"Creature — Bird","mana":"{1}{U}","cmc":2,"power":"1","toughness":"2","keywords":["Flying"],"colors":["U"],"oracle":"Flying (This creature can't be blocked except by creatures with flying or reach.)"}; // native-body on f71c2a49
const SAVANNAH_LIONS = {"name":"Savannah Lions","type":"Creature — Cat","mana":"{W}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["W"],"oracle":""}; // native-body on f71c2a49
const CORSAIRS_OF_UMBAR = {"name":"Corsairs of Umbar","type":"Creature — Human Pirate","mana":"{3}{U}","cmc":4,"power":"3","toughness":"3","keywords":["Amass"],"colors":["U"],"oracle":"{2}{U}: Target Goblin, Orc, or Pirate can't be blocked this turn.\nWhenever this creature deals combat damage to a player, amass Orcs 3. (Put three +1/+1 counters on an Army you control. It's also an Orc. If you don't control an Army, create a 0/0 black Orc Army creature token first.)"}; // body-only on f71c2a49
const GOBLIN_PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // native-body on f71c2a49

// ─── harness ──────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
function board({ user = [], ai = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
/** The ids the user's non-mana activations of `permId` may target. */
const targetsOffered = (s, permId) => [...new Set(legalActionsForPlayer(s, "user")
  .filter((a) => a.kind === "activate-ability" && a.permanentId === permId)
  .flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
function activate(s, permId, targetId) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === permId && (a.targets || []).some((t) => t.id === targetId));
  expect(act).toBeTruthy();
  return resolveTopOfStack(dispatchAction(s, act));
}

describe("the cards and their parse", () => {
  it("⭐ classify: Swarmyard, Accursed Duneyard and Animal Sanctuary are whole lands; Mudflat Village (a graveyard card, not a creature) and Orcish Healer (colours, not types) stay parked; Black Poplar Shaman (one type) unchanged", () => {
    const row = Object.fromEntries(Object.entries({ SWARMYARD, ACCURSED_DUNEYARD, ANIMAL_SANCTUARY, MUDFLAT_VILLAGE, ORCISH_HEALER, BLACK_POPLAR_SHAMAN }).map(([k, c]) => [k, classifyCard(c)]));
    expect(row).toEqual({ SWARMYARD: "land", ACCURSED_DUNEYARD: "land", ANIMAL_SANCTUARY: "land", MUDFLAT_VILLAGE: "land-partial", ORCISH_HEALER: "body-only", BLACK_POPLAR_SHAMAN: "native-activated" });
  });

  it("the parse: a list of creature types becomes one union restriction on the plain creature target", () => {
    const atom = (clause) => parseEffectClause(clause, "Instant", { sourceScoped: true })?.atoms ?? [];
    expect({ swarm: atom("Regenerate target Insect, Rat, Spider, or Squirrel."), sanctuary: atom("Put a +1/+1 counter on target Bird, Cat, Dog, Goat, Ox, or Snake.") }).toEqual({
      swarm: [{ op: "regenerate", targetType: "creature", restrictions: [{ kind: "subtype", subtype: "insect", subtypes: ["insect", "rat", "spider", "squirrel"] }] }],
      sanctuary: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature", restrictions: [{ kind: "subtype", subtype: "bird", subtypes: ["bird", "cat", "dog", "goat", "ox", "snake"] }] }],
    });
  });

  it("CONTROL — a list with a word that is not a creature type, a list without \"or\", or a card from a graveyard stays unparsed", () => {
    const atom = (clause) => parseEffectClause(clause, "Instant", { sourceScoped: true })?.atoms ?? [];
    expect({
      notAType: atom("Regenerate target Insect, Rat, Swamp, or Squirrel."),
      noOr: atom("Regenerate target Insect, Rat, Spider, Squirrel."),
      graveyardCard: atom("Return target Bat, Lizard, Rat, or Squirrel card from your graveyard to your hand."),
    }).toEqual({ notAType: [], noOr: [], graveyardCard: [] });
  });
});

describe("⭐ Swarmyard and Accursed Duneyard on the battlefield", () => {
  const s0 = () => board({ user: [P("yard", SWARMYARD), P("dune", ACCURSED_DUNEYARD), P("rats", TYPHOID_RATS), P("zombies", SCATHE_ZOMBIES), P("bears", GRIZZLY_BEARS)], ai: [P("arats", TYPHOID_RATS, "ai")], pool: { C: 2 } });

  it("⭐ each offers only its own creature types — the Rats (either side) for Swarmyard, the Zombies for the Duneyard, never the Bears", () => {
    expect({ yard: targetsOffered(s0(), "yard"), dune: targetsOffered(s0(), "dune") }).toEqual({ yard: ["arats", "rats"], dune: ["zombies"] });
  });

  it("⭐ the shield works: the regenerated Rats survive a destroy, tapped (CR 701.19a); an unshielded Bears does not", () => {
    const shielded = activate(s0(), "yard", "rats");
    const after = applyDestroyEffect(shielded, { controller: "ai", targets: [{ type: "creature", id: "rats" }, { type: "creature", id: "bears" }] });
    expect({ shields: findPermanent(shielded, "rats")?.permanent.regenShields ?? 0, rats: findPermanent(after, "rats")?.permanent.tapped ?? null, bears: !!findPermanent(after, "bears") })
      .toEqual({ shields: 1, rats: true, bears: false });
  });
});

describe("⭐ Corsairs of Umbar (#6023) — the same list on a creature's activation", () => {
  it("⭐ classify native-mixed; the activation is offered on a Goblin and on the Corsairs (a Pirate), never the Bears; the Goblin then can't be blocked", () => {
    const s0 = board({ user: [P("corsairs", CORSAIRS_OF_UMBAR), P("piker", GOBLIN_PIKER), P("bears", GRIZZLY_BEARS)], ai: [P("abears", GRIZZLY_BEARS, "ai")], pool: { U: 1, C: 2 } });
    const s = activate(s0, "corsairs", "piker");
    expect({ tier: classifyCard(CORSAIRS_OF_UMBAR), offered: targetsOffered(s0, "corsairs"), piker: canBlockAttacker(s, "abears", "piker", "ai"), bears: canBlockAttacker(s, "abears", "bears", "ai") })
      .toEqual({ tier: "native-mixed", offered: ["corsairs", "piker"], piker: false, bears: true });
  });
});

describe("⭐ Animal Sanctuary on the battlefield", () => {
  it("⭐ a counter on a Bird or a Cat, never on the Bears", () => {
    const s0 = board({ user: [P("sanct", ANIMAL_SANCTUARY), P("crow", STORM_CROW), P("lions", SAVANNAH_LIONS), P("bears", GRIZZLY_BEARS)], pool: { C: 2 } });
    const s = activate(s0, "sanct", "lions");
    expect({ offered: targetsOffered(s0, "sanct"), lions: findPermanent(s, "lions")?.permanent.counters?.["+1/+1"] ?? 0 }).toEqual({ offered: ["crow", "lions"], lions: 1 });
  });
});
