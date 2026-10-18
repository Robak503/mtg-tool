/**
 * sbaAfterResolution.test.js — state-based actions are checked when a player would receive priority (CR 704.3, 117.5), never in
 * the middle of a resolution: "state-based actions pay no attention to what happens during the resolution of a spell or ability"
 * (CR 704.4). An instant or sorcery's last step puts it into its owner's graveyard (CR 608.2n), so the lethal-damage and toughness
 * checks (CR 704.5g, 704.5f) see the board after the card has gone there and after every later step of the same resolution.
 *
 * Found by the printed-"*"-toughness entry (found-not-fixed (1)): the damage and -X/-X effects ran the lethal check inside the resolution
 * (spellEffects.applyDamageEffect, effects/atoms/combat.js), before the card moved, so a 2/3 Tarmogoyf died to Lightning Bolt.
 * Tarmogoyf's bundled ruling: "If an instant or sorcery spell deals damage to Tarmogoyf or lowers its toughness, that spell is put
 * into its owner's graveyard before state-based actions are performed. If that card is the first of its type to enter a
 * graveyard, it will raise Tarmogoyf's toughness before the game checks to see if Tarmogoyf dies."
 *
 * Every case is a real cast through the dispatcher and the stack (resolveTopOfStack — the resolution and the state-based check
 * before the next priority). Real oracle fixtures (bundled Scryfall, probed 2026-10-18).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAllStateBasedActions } from "./sba.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], colors: [], oracle, ...extra });
const TARMOGOYF = card("Tarmogoyf", "Creature — Lhurgoyf", "{1}{G}", 2, "Tarmogoyf's power is equal to the number of card types among cards in all graveyards and its toughness is equal to that number plus 1.", { power: "*", toughness: "1+*", colors: ["G"] });
const COGNIVORE = card("Cognivore", "Creature — Lhurgoyf", "{6}{U}{U}", 8, "Flying\nCognivore's power and toughness are each equal to the number of instant cards in all graveyards.", { power: "*", toughness: "*", colors: ["U"], keywords: ["Flying"] });
const CRAWLER = card("Psychosis Crawler", "Artifact Creature — Phyrexian Horror", "{5}", 5, "Psychosis Crawler's power and toughness are each equal to the number of cards in your hand.\nWhenever you draw a card, each opponent loses 1 life.", { power: "*", toughness: "*" });
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const ELEMENTAL = card("Earth Elemental", "Creature — Elemental", "{3}{R}{R}", 5, "", { power: "4", toughness: "5", colors: ["R"] });
const RATS = card("Typhoid Rats", "Creature — Rat", "{B}", 1, "Deathtouch (Any amount of damage this deals to a creature is enough to destroy it.)", { power: "1", toughness: "1", colors: ["B"], keywords: ["Deathtouch"] });
const BLOOD_ARTIST = card("Blood Artist", "Creature — Vampire", "{1}{B}", 2, "Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.", { power: "0", toughness: "1", colors: ["B"] });
const DOOMED_TRAVELER = card("Doomed Traveler", "Creature — Human Soldier", "{W}", 1, "When this creature dies, create a 1/1 white Spirit creature token with flying.", { power: "1", toughness: "1", colors: ["W"] });
const BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const SHOCK = card("Shock", "Instant", "{R}", 1, "Shock deals 2 damage to any target.", { colors: ["R"] });
const FLAME_SLASH = card("Flame Slash", "Sorcery", "{R}", 1, "Flame Slash deals 4 damage to target creature.", { colors: ["R"] });
const LAST_GASP = card("Last Gasp", "Instant", "{1}{B}", 2, "Target creature gets -3/-3 until end of turn.", { colors: ["B"] });
const DISFIGURE = card("Disfigure", "Instant", "{B}", 1, "Target creature gets -2/-2 until end of turn.", { colors: ["B"] });
const EMBER_SHOT = card("Ember Shot", "Instant", "{6}{R}", 7, "Ember Shot deals 3 damage to any target.\nDraw a card.", { colors: ["R"] });
const PYROCLASM = card("Pyroclasm", "Sorcery", "{1}{R}", 2, "Pyroclasm deals 2 damage to each creature.", { colors: ["R"] });
const PREY_UPON = card("Prey Upon", "Sorcery", "{G}", 1, "Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)", { colors: ["G"], keywords: ["Fight"] });
const RABID_BITE = card("Rabid Bite", "Sorcery", "{1}{G}", 2, "Target creature you control deals damage equal to its power to target creature you don't control.", { colors: ["G"] });
const ISLAND = card("Island", "Basic Land — Island", "", 0, "({T}: Add {U}.)");
const MARAUDING_RAPTOR = card("Marauding Raptor", "Creature — Dinosaur", "{1}{R}", 2, "Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn.", { power: "2", toughness: "3", colors: ["R"] });
const HUNTING_VELOCIRAPTOR = card("Hunting Velociraptor", "Creature — Dinosaur", "{2}{R}", 3, "First strike\nDinosaur spells you cast have prowl {2}{R}. (You may cast a spell for its prowl cost if you dealt combat damage to a player this turn with a creature with any of its creature types.)", { power: "3", toughness: "2", colors: ["R"], keywords: ["First strike"] });
const SWIFT_DEMISE = card("Swift Demise", "Instant", "{2}{B}", 3, "Swift Demise deals 1 damage to target creature. Then destroy each creature you don't control that was dealt damage this turn.", { colors: ["B"] });
const GOBLIN_RAIDERS = card("Mons's Goblin Raiders", "Creature — Goblin", "{R}", 1, "", { power: "1", toughness: "1", colors: ["R"] });
const JACE = card("Jace Beleren", "Legendary Planeswalker — Jace", "{1}{U}{U}", 3, "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.", { loyalty: "3", colors: ["U"], keywords: ["Mill"] });

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const gyCard = (id, c) => ({ ...c, id });
const onBattlefield = (s, id) => Object.values(s.players).some((p) => p.battlefield.some((x) => x.id === id));
const findPerm = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((x) => x.id === id);

/**
 * The user, in their main phase with `mana` floating, casts `spell` at exactly the creatures `targetIds` (any order);
 * the stack resolves. `userBf` / `aiBf` / `userGy` / `aiGy` set the board; `hand` adds cards behind the spell; `library` the draws.
 */
function castAndResolve({ spell, targetIds, mana, userBf = [], aiBf = [], userGy = [], aiGy = [], hand = [], library = [] }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  let s = {
    ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: userBf, graveyard: userGy, hand: [{ ...spell, id: "spell" }, ...hand], library, manaPool: { ...g.players.user.manaPool, ...mana } },
      ai: { ...g.players.ai, battlefield: aiBf, graveyard: aiGy, library: [gyCard("ai-lib1", ISLAND)] },
    },
  };
  const sameTargets = (a) => (a.targets || []).length === targetIds.length && targetIds.every((id) => (a.targets || []).some((t) => t.id === id));
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "spell" && sameTargets(a));
  expect(cast, `${spell.name} is offered at ${targetIds.join(", ")}`).toBeTruthy();
  s = dispatchAction(s, cast);
  for (let i = 0; i < 10 && s.stack.length; i++) s = resolveTopOfStack(s);
  return s;
}

describe("an instant or sorcery is in its owner's graveyard when the state-based actions are checked (CR 608.2n, 704.3, 704.4)", () => {
  it("Lightning Bolt at a 2/3 Tarmogoyf (a creature card and a sorcery card in the graveyards): the Bolt is the first instant — Tarmogoyf is 3/4 with 3 damage and survives (the bundled ruling)", () => {
    const s = castAndResolve({ spell: BOLT, targetIds: ["goyf"], mana: { R: 1 }, aiBf: [perm("goyf", TARMOGOYF, "ai")], userGy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", FLAME_SLASH)] });
    const goyf = findPerm(s, "goyf");
    expect({ alive: !!goyf, damage: goyf?.damageMarked ?? null, toughness: goyf ? permanentToughness(s, "goyf") : null, boltInGraveyard: s.players.user.graveyard.some((c) => c.name === "Lightning Bolt") })
      .toEqual({ alive: true, damage: 3, toughness: 4, boltInGraveyard: true });
    expect(onBattlefield(checkAllStateBasedActions(s), "goyf"), "a later check leaves it there too").toBe(true);
  });

  it("Last Gasp at a 2/3 Tarmogoyf: the ruling's \"lowers its toughness\" — the Gasp is the first instant, so Tarmogoyf is 3/4 -3/-3 = 0/1 and survives", () => {
    const s = castAndResolve({ spell: LAST_GASP, targetIds: ["goyf"], mana: { B: 1, C: 1 }, aiBf: [perm("goyf", TARMOGOYF, "ai")], userGy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", FLAME_SLASH)] });
    expect({ alive: onBattlefield(s, "goyf"), toughness: onBattlefield(s, "goyf") ? permanentToughness(s, "goyf") : null }).toEqual({ alive: true, toughness: 1 });
  });

  it("Shock at a 2/2 Cognivore (two instant cards in the graveyards): the Shock is the third instant — Cognivore is 3/3 with 2 damage and survives", () => {
    const s = castAndResolve({ spell: SHOCK, targetIds: ["cog"], mana: { R: 1 }, aiBf: [perm("cog", COGNIVORE, "ai")], userGy: [gyCard("g1", BOLT)], aiGy: [gyCard("g2", DISFIGURE)] });
    expect({ alive: onBattlefield(s, "cog"), toughness: onBattlefield(s, "cog") ? permanentToughness(s, "cog") : null }).toEqual({ alive: true, toughness: 3 });
  });

  it("the death is checked after the spell reaches the graveyard: Lightning Bolt at Grizzly Bears logs spell-to-graveyard before creature-dies", () => {
    const s = castAndResolve({ spell: BOLT, targetIds: ["bears"], mana: { R: 1 }, aiBf: [perm("bears", BEARS, "ai")] });
    const kinds = s.log.map((e) => e.kind);
    const toGy = kinds.lastIndexOf("spell-to-graveyard");
    const dies = kinds.lastIndexOf("creature-dies");
    expect({ bearsAlive: onBattlefield(s, "bears"), toGy: toGy >= 0, dies: dies >= 0, deathAfterSpell: dies > toGy }).toEqual({ bearsAlive: false, toGy: true, dies: true, deathAfterSpell: true });
  });
});

describe("a later step of the same resolution counts before the check (CR 608.2c, 704.4)", () => {
  it("Ember Shot at its caster's own Psychosis Crawler with three cards left in hand: 3 damage, then \"Draw a card\" makes it 4/4 — it survives", () => {
    const s = castAndResolve({
      spell: EMBER_SHOT, targetIds: ["crawler"], mana: { R: 1, C: 6 },
      userBf: [perm("crawler", CRAWLER, "user")],
      hand: [gyCard("h1", ISLAND), gyCard("h2", ISLAND), gyCard("h3", ISLAND)],
      library: [gyCard("lib1", ISLAND), gyCard("lib2", ISLAND)],
    });
    const crawler = findPerm(s, "crawler");
    expect({ alive: !!crawler, hand: s.players.user.hand.length, damage: crawler?.damageMarked ?? null, toughness: crawler ? permanentToughness(s, "crawler") : null })
      .toEqual({ alive: true, hand: 4, damage: 3, toughness: 4 });
  });

  it("Marauding Raptor's trigger on an entering Hunting Velociraptor (3/2): the Dinosaur is still on the battlefield when \"If a Dinosaur is dealt damage this way\" is read — the Raptor gets +2/+0, then the Velociraptor dies", () => {
    const s = castAndResolve({ spell: HUNTING_VELOCIRAPTOR, targetIds: [], mana: { R: 1, C: 2 }, userBf: [perm("raptor", MARAUDING_RAPTOR, "user")] });
    const velociraptorAlive = s.players.user.battlefield.some((p) => p.card?.name === "Hunting Velociraptor");
    expect({ velociraptorAlive, inGraveyard: s.players.user.graveyard.some((c) => c.name === "Hunting Velociraptor"), raptorPower: permanentPower(s, "raptor") })
      .toEqual({ velociraptorAlive: false, inGraveyard: true, raptorPower: 4 });
  });

  it("Swift Demise at Mons's Goblin Raiders (1/1): the Goblin is still there for \"Then destroy each creature you don't control that was dealt damage this turn\" — the second step destroys it", () => {
    const s = castAndResolve({ spell: SWIFT_DEMISE, targetIds: ["raiders"], mana: { B: 1, C: 2 }, aiBf: [perm("raiders", GOBLIN_RAIDERS, "ai")] });
    const destroyStep = s.log.filter((e) => e.kind === "spell-effect" && e.effect === "destroy").at(-1);
    expect({ alive: onBattlefield(s, "raiders"), destroyedByTheSecondStep: (destroyStep?.targets || []).includes("raiders") }).toEqual({ alive: false, destroyedByTheSecondStep: true });
  });
});

describe("controls: what the check after the resolution still destroys", () => {
  it("Lightning Bolt at a Tarmogoyf already 3/4 (a creature, a sorcery and an instant in the graveyards) leaves it with 3 damage", () => {
    const s = castAndResolve({ spell: BOLT, targetIds: ["goyf"], mana: { R: 1 }, aiBf: [perm("goyf", TARMOGOYF, "ai")], userGy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", FLAME_SLASH), gyCard("g3", SHOCK)] });
    expect(onBattlefield(s, "goyf")).toBe(true);
  });

  it("Flame Slash (a sorcery, already a type in the graveyards) at a 2/3 Tarmogoyf destroys it", () => {
    const s = castAndResolve({ spell: FLAME_SLASH, targetIds: ["goyf"], mana: { R: 1 }, aiBf: [perm("goyf", TARMOGOYF, "ai")], userGy: [gyCard("g1", BEARS)], aiGy: [gyCard("g2", PYROCLASM)] });
    expect({ alive: onBattlefield(s, "goyf"), inGraveyard: s.players.ai.graveyard.some((c) => c.name === "Tarmogoyf") }).toEqual({ alive: false, inGraveyard: true });
  });

  it("Lightning Bolt at Grizzly Bears destroys it, and Blood Artist's dies trigger is put on the stack and resolves", () => {
    const s = castAndResolve({ spell: BOLT, targetIds: ["bears"], mana: { R: 1 }, userBf: [perm("artist", BLOOD_ARTIST, "user")], aiBf: [perm("bears", BEARS, "ai")] });
    expect({ bearsAlive: onBattlefield(s, "bears"), userLife: s.players.user.life, aiLife: s.players.ai.life }).toEqual({ bearsAlive: false, userLife: 41, aiLife: 39 });
  });

  it("Disfigure at Grizzly Bears (0/0) puts it into the graveyard (CR 704.5f)", () => {
    const s = castAndResolve({ spell: DISFIGURE, targetIds: ["bears"], mana: { B: 1 }, aiBf: [perm("bears", BEARS, "ai")] });
    expect({ bearsAlive: onBattlefield(s, "bears"), inGraveyard: s.players.ai.graveyard.some((c) => c.name === "Grizzly Bears") }).toEqual({ bearsAlive: false, inGraveyard: true });
  });

  it("Pyroclasm kills Doomed Traveler, whose dies trigger makes the Spirit", () => {
    const s = castAndResolve({ spell: PYROCLASM, targetIds: [], mana: { R: 1, C: 1 }, aiBf: [perm("trav", DOOMED_TRAVELER, "ai")] });
    expect({ traveler: onBattlefield(s, "trav"), spirit: s.players.ai.battlefield.some((p) => p.card?.name === "Spirit") }).toEqual({ traveler: false, spirit: true });
  });

  it("deathtouch is remembered until the check (CR 704.5h): Typhoid Rats fights Earth Elemental through Prey Upon — both die", () => {
    const s = castAndResolve({ spell: PREY_UPON, targetIds: ["rats", "elemental"], mana: { G: 1 }, userBf: [perm("rats", RATS, "user")], aiBf: [perm("elemental", ELEMENTAL, "ai")] });
    expect({ rats: onBattlefield(s, "rats"), elemental: onBattlefield(s, "elemental") }).toEqual({ rats: false, elemental: false });
  });

  it("deathtouch through a bite (CR 704.5h): Typhoid Rats deals 1 damage to Earth Elemental through Rabid Bite — the Elemental dies, the Rats live", () => {
    const s = castAndResolve({ spell: RABID_BITE, targetIds: ["rats", "elemental"], mana: { G: 1, C: 1 }, userBf: [perm("rats", RATS, "user")], aiBf: [perm("elemental", ELEMENTAL, "ai")] });
    expect({ rats: onBattlefield(s, "rats"), elemental: onBattlefield(s, "elemental") }).toEqual({ rats: true, elemental: false });
  });
});

describe("outside a resolution the check runs at once, and the window leaves nothing on the state", () => {
  it("an effect applied directly (no stack object resolving): 3 damage destroys Grizzly Bears and takes Jace Beleren to 0 loyalty — both gone at once", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s0 = { ...g, players: { ...g.players, ai: { ...g.players.ai, battlefield: [perm("bears", BEARS, "ai"), perm("jace", JACE, "ai", { counters: { loyalty: 3 } })] } } };
    const s1 = applyDamageEffect(s0, { controller: "user", amount: 3, targets: [{ type: "creature", id: "bears" }] });
    const s2 = applyDamageEffect(s1, { controller: "user", amount: 3, targets: [{ type: "planeswalker", id: "jace" }] });
    expect({ bears: onBattlefield(s1, "bears"), jace: onBattlefield(s2, "jace") }).toEqual({ bears: false, jace: false });
  });

  it("Lightning Bolt at Jace Beleren (3 loyalty): the planeswalker is put into its owner's graveyard by the check after the resolution (CR 704.5i)", () => {
    const s = castAndResolve({ spell: BOLT, targetIds: ["jace"], mana: { R: 1 }, aiBf: [perm("jace", JACE, "ai", { counters: { loyalty: 3 } })] });
    expect({ jace: onBattlefield(s, "jace"), inGraveyard: s.players.ai.graveyard.some((c) => c.name === "Jace Beleren") }).toEqual({ jace: false, inGraveyard: true });
  });

  it("the resolution window and the remembered deathtouch are gone once the stack object has resolved (transient — never saved, never at a priority checkpoint)", () => {
    const s = castAndResolve({ spell: PREY_UPON, targetIds: ["rats", "elemental"], mana: { G: 1 }, userBf: [perm("rats", RATS, "user")], aiBf: [perm("elemental", ELEMENTAL, "ai")] });
    expect({ window: "resolutionWindow" in s, deathtouch: "deathtouchedSinceSba" in s }).toEqual({ window: false, deathtouch: false });
  });
});
