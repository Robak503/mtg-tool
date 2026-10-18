/**
 * opponentScopedDamage.test.js — the OPPONENT-SCOPED and SOURCE-FILTERED damage replacements (CR 614.1a, 615.1a, 616.1;
 * the play-weighted program, phase 2):
 *
 *   · Solphim, Mayhem Dominus (EDHREC #896)  — a source you control, NONCOMBAT damage, to an opponent or a permanent an opponent
 *                                              controls: double. Its second line — "{1}{R/P}{R/P}, Discard two cards: Put an
 *                                              indestructible counter on Solphim." — is witnessed too (the card is credited only
 *                                              when both lines play).
 *   · Torbran, Thane of Red Fell (#1004)     — a RED source you control (its colour as it is now; a source off the battlefield as it
 *                                              last existed, CR 609.7c), to the opponent's side: plus 2.
 *   · Gisela, Blade of Goldnight (#1134)     — any source, to the opponent's side: double; to you or a permanent you control:
 *                                              prevent half, rounded up.
 *   · Twinflame Tyrant (#780, already credited) — its scope is the opponent's side; it doubled its controller's damage to its own
 *                                              creatures and to its controller (the false positive closed here).
 *   · the twins the same readers unlock: Mechanized Warfare (red OR artifact source, plus 1), Thor, Asgard's Avenger (ANOTHER
 *     source), Tomik, Izzet Sparkmage (noncombat, plus 1), Hawkeye, Young Avenger (plus its power), Goldnight Castigator ("to this
 *     creature"), Inquisitor's Flail (the equipped creature's combat damage, and combat damage dealt to it by another creature);
 *     Anthem of Rakdos' Hellbent condition (it doubled with cards in hand — a false positive closed).
 *   · the ORDER (CR 616.1, 616.1f): the affected player — the player dealt damage, or the controller of the permanent dealt damage
 *     — chooses the order; the engine's chooser takes the order that leaves the least damage, and a fully prevented event leaves
 *     nothing for an addend (Torbran's ruling: "If all of the damage is prevented, Torbran's effect no longer applies").
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-17). Casts and activations run for real (legal action → dispatch).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect, applyDestroyEffect } from "./spellEffects.js";
import { addContinuousEffect } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Fixtures (bundled oracle) ───────────────────────────────────────────────────────────────────────────────────────────────
const SOLPHIM = { name: "Solphim, Mayhem Dominus", type: "Legendary Creature — Phyrexian Horror", mana: "{2}{R}{R}", colors: ["R"], power: "5", toughness: "4", keywords: ["Double"],
  oracle: "If a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, it deals double that damage to that player or permanent instead.\n{1}{R/P}{R/P}, Discard two cards: Put an indestructible counter on Solphim. ({R/P} can be paid with either {R} or 2 life.)" };
const TORBRAN = { name: "Torbran, Thane of Red Fell", type: "Legendary Creature — Dwarf Noble", mana: "{1}{R}{R}{R}", colors: ["R"], power: "2", toughness: "4", keywords: [],
  oracle: "If a red source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead." };
const GISELA = { name: "Gisela, Blade of Goldnight", type: "Legendary Creature — Angel", mana: "{4}{R}{W}{W}", colors: ["R", "W"], power: "5", toughness: "5", keywords: ["Flying", "First strike", "Double"],
  oracle: "Flying, first strike\nIf a source would deal damage to an opponent or a permanent an opponent controls, that source deals double that damage to that player or permanent instead.\nIf a source would deal damage to you or a permanent you control, prevent half that damage, rounded up." };
const TWINFLAME = { name: "Twinflame Tyrant", type: "Creature — Dragon", mana: "{3}{R}{R}", colors: ["R"], power: "3", toughness: "5", keywords: ["Flying", "Double"],
  oracle: "Flying\nIf a source you control would deal damage to an opponent or a permanent an opponent controls, it deals double that damage instead." };
const MECH_WARFARE = { name: "Mechanized Warfare", type: "Enchantment", mana: "{1}{R}{R}", colors: ["R"], keywords: [],
  oracle: "If a red or artifact source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead." };
const THOR = { name: "Thor, Asgard's Avenger", type: "Legendary Creature — God Warrior Hero", mana: "{2}{R}{R}", colors: ["R"], power: "4", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nIf another source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead." };
const TOMIK = { name: "Tomik, Izzet Sparkmage", type: "Legendary Creature — Human Wizard", mana: "{1}{R}", colors: ["R"], power: "1", toughness: "2", keywords: ["Prowess"],
  oracle: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nIf a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, it deals that much damage plus 1 instead." };
const HAWKEYE = { name: "Hawkeye, Young Avenger", type: "Legendary Creature — Human Archer Hero", mana: "{3}{R}", colors: ["R"], power: "2", toughness: "4", keywords: ["Reach"],
  oracle: "Reach\nIf a source you control would deal noncombat damage to an opponent or a permanent an opponent controls, instead it deals that much damage plus X, where X is Hawkeye's power." };
const CASTIGATOR = { name: "Goldnight Castigator", type: "Creature — Angel", mana: "{2}{R}{R}", colors: ["R"], power: "4", toughness: "9", keywords: ["Flying", "Haste", "Double"],
  oracle: "Flying, haste\nIf a source would deal damage to you, it deals double that damage to you instead.\nIf a source would deal damage to this creature, it deals double that damage to this creature instead." };
const FLAIL = { name: "Inquisitor's Flail", type: "Artifact — Equipment", mana: "{2}", colors: [], keywords: ["Equip", "Double"],
  oracle: "If equipped creature would deal combat damage, it deals double that damage instead.\nIf another creature would deal combat damage to equipped creature, it deals double that damage to equipped creature instead.\nEquip {2}" };
const ANTHEM_RAKDOS = { name: "Anthem of Rakdos", type: "Enchantment", mana: "{2}{B}{R}{R}", colors: ["B", "R"], keywords: ["Double", "Hellbent"],
  oracle: "Whenever a creature you control attacks, it gets +2/+0 until end of turn and this enchantment deals 1 damage to you.\nHellbent — As long as you have no cards in hand, if a source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." };
const FIERY = { name: "Fiery Emancipation", type: "Enchantment", mana: "{3}{R}{R}{R}", colors: ["R"], keywords: ["Triple"],
  oracle: "If a source you control would deal damage to a permanent or player, it deals triple that damage to that permanent or player instead." };
const FURNACE = { name: "Furnace of Rath", type: "Enchantment", mana: "{1}{R}{R}{R}", colors: ["R"], keywords: ["Double"],
  oracle: "If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." };
const DICTATE = { name: "Dictate of the Twin Gods", type: "Enchantment", mana: "{3}{R}{R}", colors: ["R"], keywords: ["Flash", "Double"],
  oracle: "Flash\nIf a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead." };
const ALTISAUR = { name: "Temple Altisaur", type: "Creature — Dinosaur", mana: "{4}{W}", colors: ["W"], power: "3", toughness: "4", keywords: [],
  oracle: "If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage." };
const PYROMANCER = { name: "Prodigal Pyromancer", type: "Creature — Human Wizard", mana: "{2}{R}", colors: ["R"], power: "1", toughness: "1", keywords: [],
  oracle: "{T}: This creature deals 1 damage to any target." };
const MOGG_FANATIC = { name: "Mogg Fanatic", type: "Creature — Goblin", mana: "{R}", colors: ["R"], power: "1", toughness: "1", keywords: [],
  oracle: "Sacrifice this creature: It deals 1 damage to any target." };
const TORCHRUNNER = { name: "Mudbutton Torchrunner", type: "Creature — Goblin Warrior", mana: "{2}{R}", colors: ["R"], power: "1", toughness: "1", keywords: [],
  oracle: "When this creature dies, it deals 3 damage to any target." };
const PERILOUS_MYR = { name: "Perilous Myr", type: "Artifact Creature — Phyrexian Myr", mana: "{2}", colors: [], power: "1", toughness: "1", keywords: [],
  oracle: "When this creature dies, it deals 2 damage to any target." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", colors: ["R"], keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };
const RAGING_GOBLIN = { name: "Raging Goblin", type: "Creature — Goblin Berserker", mana: "{R}", colors: ["R"], power: "1", toughness: "1", keywords: ["Haste"],
  oracle: "Haste (This creature can attack and {T} as soon as it comes under your control.)" };
const HILL_GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", colors: ["R"], power: "3", toughness: "3", keywords: [], oracle: "" };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const JACE = { name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", colors: ["U"], keywords: ["Mill"], loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };
const DINO = { name: "Ancient Brontodon", type: "Creature — Dinosaur", mana: "{6}{G}{G}", colors: ["G"], power: "9", toughness: "9", keywords: [], oracle: "" };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** A board on `active`'s turn, main phase. */
function board({ user = [], ai = [], userHand = [], active = "user", pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, hand: userHand, manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
/** A combat on `attackingPlayer`'s turn: each attacker attacks the other player; `blocks` = [[blockerId, attackerId]]. */
function combat(b, attackerIds, { attackingPlayer = "user", blocks = [] } = {}) {
  const defender = attackingPlayer === "user" ? "ai" : "user";
  return { ...b, activePlayer: attackingPlayer, combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer, defender })),
    blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, blockingPlayer: defender, attackerId })) } };
}
const findP = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id);
const marked = (s, id) => findP(s, id)?.damageMarked ?? null;
const lost = (before, after, pid) => before.players[pid].life - after.players[pid].life;
/** `src` (a permanent on the board) deals `n` noncombat damage to one target — an ability's damage (applyDamageEffect, CR 120.2b). */
const ping = (s, src, n, target) => applyDamageEffect(s, { controller: src.controller, amount: n, targets: [target], source: src });
const toPlayer = (id) => ({ type: "player", id });
const toCreature = (id) => ({ type: "creature", id });
/** Run the stack and every trigger to empty (AI-chosen trigger targets). */
function settle(s) {
  let next = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 20 && (next.stack || []).length; i++) next = flushTriggers(resolveTopOfStack(next), { chooseTargets: chooseTriggerTargets });
  return next;
}

// ─── Twinflame Tyrant — the false positive ───────────────────────────────────────────────────────────────────────────────────
describe("⚠️ Twinflame Tyrant: only the OPPONENT'S side is doubled (it doubled its controller's damage to its own things)", () => {
  const b = () => board({ user: [perm("tt", TWINFLAME, "user"), perm("pp", PYROMANCER, "user"), perm("mb", BEARS, "user")], ai: [perm("ab", DINO, "ai")] });
  it("⭐ your source dealing damage to YOUR OWN creature deals it once", () => {
    const s = b();
    expect(marked(ping(s, findP(s, "pp"), 1, toCreature("mb")), "mb")).toBe(1);
  });
  it("⭐ your source dealing damage to YOU deals it once", () => {
    const s = b();
    expect(lost(s, ping(s, findP(s, "pp"), 1, toPlayer("user")), "user")).toBe(1);
  });
  it("control: to the opponent and to the opponent's creature, doubled", () => {
    const s = b();
    expect({ opp: lost(s, ping(s, findP(s, "pp"), 1, toPlayer("ai")), "ai"), oppCreature: marked(ping(s, findP(s, "pp"), 1, toCreature("ab")), "ab") }).toEqual({ opp: 2, oppCreature: 2 });
  });
});

// ─── Solphim ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Solphim, Mayhem Dominus — NONCOMBAT damage from your sources to the opponent's side is doubled", () => {
  const b = (extra = {}) => board({ user: [perm("sol", SOLPHIM, "user"), perm("pp", PYROMANCER, "user"), perm("mb", BEARS, "user"), perm("rg", RAGING_GOBLIN, "user")],
    ai: [perm("ab", DINO, "ai"), perm("jace", JACE, "ai", { counters: { loyalty: 5 } }), perm("ap", PYROMANCER, "ai")], ...extra });
  it("⭐ to an opponent: doubled", () => {
    const s = b();
    expect(lost(s, ping(s, findP(s, "pp"), 1, toPlayer("ai")), "ai")).toBe(2);
  });
  it("⭐ to a creature an opponent controls: doubled", () => {
    const s = b();
    expect(marked(ping(s, findP(s, "pp"), 1, toCreature("ab")), "ab")).toBe(2);
  });
  it("⭐ to a planeswalker an opponent controls: doubled (two loyalty)", () => {
    const s = b();
    const after = applyDamageEffect(s, { controller: "user", amount: 1, targets: [{ type: "planeswalker", id: "jace" }], source: findP(s, "pp") });
    expect(findP(after, "jace").counters.loyalty).toBe(3);
  });
  it("control: COMBAT damage to the opponent is not doubled", () => {
    const s = combat(b(), ["rg"]);
    expect(lost(s, resolveCombatDamage(s), "ai")).toBe(1);
  });
  it("control: noncombat damage to your own creature, and an opponent's source hitting you, are not doubled", () => {
    const s = b();
    expect({ ownCreature: marked(ping(s, findP(s, "pp"), 1, toCreature("mb")), "mb"), oppSourceToMe: lost(s, ping(s, findP(s, "ap"), 1, toPlayer("user")), "user") })
      .toEqual({ ownCreature: 1, oppSourceToMe: 1 });
  });
  it("⭐ the second line: {1}{R/P}{R/P}, Discard two cards — offered, pays exactly two cards, and the counter makes Solphim indestructible", () => {
    const hand = [{ ...ELVES, id: "h1" }, { ...BEARS, id: "h2" }, { ...HILL_GIANT, id: "h3" }];
    const s = board({ user: [perm("sol", SOLPHIM, "user")], userHand: hand, pool: { R: 3 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sol");
    expect(act).toBeTruthy();
    const after = settle(dispatchAction(s, act));
    const row = {
      handLeft: after.players.user.hand.length,
      graveyard: after.players.user.graveyard.length,
      counter: findP(after, "sol").counters?.indestructible ?? 0,
      survivesDestroy: !!findP(applyDestroyEffect(after, { controller: "ai", targets: [{ type: "creature", id: "sol" }] }), "sol"),
    };
    console.log(`WITNESS solphim-activation ${JSON.stringify(row)}`);
    expect(row).toEqual({ handLeft: 1, graveyard: 2, counter: 1, survivesDestroy: true });
  });
  it("control: with one card in hand the ability is not offered", () => {
    const s = board({ user: [perm("sol", SOLPHIM, "user")], userHand: [{ ...ELVES, id: "h1" }], pool: { R: 3 } });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "activate-ability" && a.permanentId === "sol")).toBe(false);
  });
});

// ─── Torbran ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Torbran, Thane of Red Fell — a RED source you control: plus 2 to the opponent's side", () => {
  it("⭐ a red creature's combat damage to an opponent: plus 2; control: a green creature's is unchanged", () => {
    const red = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("rg", RAGING_GOBLIN, "user")] }), ["rg"]);
    const green = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("el", ELVES, "user")] }), ["el"]);
    expect({ red: lost(red, resolveCombatDamage(red), "ai"), green: lost(green, resolveCombatDamage(green), "ai") }).toEqual({ red: 3, green: 1 });
  });
  it("⭐ a red creature blocked by an opponent's creature: the blocker is dealt plus 2", () => {
    const s = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("hg", HILL_GIANT, "user")], ai: [perm("ad", DINO, "ai")] }), ["hg"], { blocks: [["ad", "hg"]] });
    // The 9/9 blocker is dealt 3 + 2; the Giant is dealt the blocker's 9 (an opponent's green source — unchanged) and dies.
    const after = resolveCombatDamage(s);
    expect({ blockerMarked: marked(after, "ad"), giantGone: !findP(after, "hg") }).toEqual({ blockerMarked: 5, giantGone: true });
  });
  it("control: an OPPONENT's red creature attacking you is unchanged; your red source hitting you is unchanged", () => {
    const s = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("pp", PYROMANCER, "user")], ai: [perm("arg", RAGING_GOBLIN, "ai")] }), ["arg"], { attackingPlayer: "ai" });
    const b = board({ user: [perm("tor", TORBRAN, "user"), perm("pp", PYROMANCER, "user")] });
    expect({ oppAttack: lost(s, resolveCombatDamage(s), "user"), selfPing: lost(b, ping(b, findP(b, "pp"), 1, toPlayer("user")), "user") }).toEqual({ oppAttack: 1, selfPing: 1 });
  });
  it("⭐ a red SPELL you control (Lightning Bolt cast for real): 5 to the opponent", () => {
    const s = board({ user: [perm("tor", TORBRAN, "user")], userHand: [{ ...BOLT, id: "bolt" }], pool: { R: 1 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ai");
    expect(lost(s, settle(dispatchAction(s, act)), "ai")).toBe(5);
  });
  it("⭐ the colour is read as it is NOW: a green creature made red gets plus 2, a red creature made green does not", () => {
    const recolour = (s, id, colors) => addContinuousEffect(s, { layer: 5, op: { layerOp: "setColor", colors }, affects: { mode: "fixed", permanentIds: [id] }, duration: { kind: "endOfTurn", turn: s.turn }, source: { kind: "resolution", permanentId: null, cardName: "test" } }).state;
    const madeRed = combat(recolour(board({ user: [perm("tor", TORBRAN, "user"), perm("el", ELVES, "user")] }), "el", ["R"]), ["el"]);
    const madeGreen = combat(recolour(board({ user: [perm("tor", TORBRAN, "user"), perm("rg", RAGING_GOBLIN, "user")] }), "rg", ["G"]), ["rg"]);
    expect({ madeRed: lost(madeRed, resolveCombatDamage(madeRed), "ai"), madeGreen: lost(madeGreen, resolveCombatDamage(madeGreen), "ai") }).toEqual({ madeRed: 3, madeGreen: 1 });
  });
  it("⭐ a source that LEFT the battlefield, as it last existed: Mogg Fanatic sacrificed for its cost deals 3", () => {
    const s = board({ user: [perm("tor", TORBRAN, "user"), perm("mf", MOGG_FANATIC, "user")] });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "mf" && a.targets?.[0]?.id === "ai");
    expect(lost(s, settle(dispatchAction(s, act)), "ai")).toBe(3);
  });
  it("⭐ … and Mudbutton Torchrunner's dies trigger deals 5 to the opponent", () => {
    const s = board({ user: [perm("tor", TORBRAN, "user"), perm("mt", TORCHRUNNER, "user")] });
    const killed = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "mt" }] });
    expect(lost(s, settle(killed), "ai")).toBe(5);
  });
  it("⭐ to a planeswalker an opponent controls: plus 2", () => {
    const s = board({ user: [perm("tor", TORBRAN, "user"), perm("pp", PYROMANCER, "user")], ai: [perm("jace", JACE, "ai", { counters: { loyalty: 5 } })] });
    const after = applyDamageEffect(s, { controller: "user", amount: 1, targets: [{ type: "planeswalker", id: "jace" }], source: findP(s, "pp") });
    expect(findP(after, "jace").counters.loyalty).toBe(2);
  });
});

// ─── Gisela ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("Gisela, Blade of Goldnight — double to the opponent's side (any source), half prevented on yours", () => {
  it("⭐ an OPPONENT's own source dealing damage to that opponent's creature is doubled (the ruling: any source)", () => {
    const s = board({ user: [perm("gis", GISELA, "user")], ai: [perm("ap", PYROMANCER, "ai"), perm("ab", DINO, "ai")] });
    expect(marked(ping(s, findP(s, "ap"), 1, toCreature("ab")), "ab")).toBe(2);
  });
  it("⭐ your creature's combat damage to the opponent is doubled", () => {
    const s = combat(board({ user: [perm("gis", GISELA, "user"), perm("rg", RAGING_GOBLIN, "user")] }), ["rg"]);
    expect(lost(s, resolveCombatDamage(s), "ai")).toBe(2);
  });
  it("⭐ to you: half prevented, rounded up — 3 combat damage deals 1, a 1-point ping deals 0", () => {
    const s = combat(board({ user: [perm("gis", GISELA, "user")], ai: [perm("ahg", HILL_GIANT, "ai"), perm("ap", PYROMANCER, "ai")] }), ["ahg"], { attackingPlayer: "ai" });
    expect({ combat3: lost(s, resolveCombatDamage(s), "user"), ping1: lost(s, ping(s, findP(s, "ap"), 1, toPlayer("user")), "user") }).toEqual({ combat3: 1, ping1: 0 });
  });
  it("⭐ to a permanent you control: 4 damage deals 2", () => {
    const s = board({ user: [perm("gis", GISELA, "user"), perm("dino", DINO, "user")], ai: [perm("ap", PYROMANCER, "ai")] });
    expect(marked(ping(s, findP(s, "ap"), 4, toCreature("dino")), "dino")).toBe(2);
  });
});

// ─── The order (CR 616.1) ────────────────────────────────────────────────────────────────────────────────────────────────────
describe("⭐ two or more replacements: the affected player chooses the order (CR 616.1) — the least damage", () => {
  it("⭐ Torbran + Fiery Emancipation, 2 combat damage to the opponent: triple then plus 2 = 8 (not 12)", () => {
    const s = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("fe", FIERY, "user"), perm("rg", RAGING_GOBLIN, "user", { card: { ...RAGING_GOBLIN, id: "c-rg", power: "2" } })] }), ["rg"]);
    expect(lost(s, resolveCombatDamage(s), "ai")).toBe(8);
  });
  it("⭐ your Gisela + Furnace of Rath, 3 damage to you: half prevented first, then doubled = 2 (not 3)", () => {
    const s = board({ user: [perm("gis", GISELA, "user"), perm("fur", FURNACE, "user")], ai: [perm("ap", PYROMANCER, "ai")] });
    expect(lost(s, ping(s, findP(s, "ap"), 3, toPlayer("user")), "user")).toBe(2);
  });
  it("⭐ your Torbran against the opponent's Gisela, 3 damage: plus 2 first, then half prevented = 2 (not 3)", () => {
    const s = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("hg", HILL_GIANT, "user")], ai: [perm("gis", GISELA, "ai")] }), ["hg"]);
    expect(lost(s, resolveCombatDamage(s), "ai")).toBe(2);
  });
  it("⭐ … and 1 damage: half prevented first leaves none, so Torbran no longer applies = 0", () => {
    const s = combat(board({ user: [perm("tor", TORBRAN, "user"), perm("rg", RAGING_GOBLIN, "user")], ai: [perm("gis", GISELA, "ai")] }), ["rg"]);
    expect(lost(s, resolveCombatDamage(s), "ai")).toBe(0);
  });
  it("⭐ Temple Altisaur listed before Furnace of Rath: 3 to another Dinosaur — doubled first, then all but 1 prevented = 1", () => {
    const s = board({ user: [perm("alt", ALTISAUR, "user"), perm("dino", DINO, "user"), perm("fur", FURNACE, "user")], ai: [perm("ap", PYROMANCER, "ai")] });
    expect(marked(ping(s, findP(s, "ap"), 3, toCreature("dino")), "dino")).toBe(1);
  });
  it("control: two doublers (Furnace of Rath + Dictate of the Twin Gods) — four times, either order", () => {
    const s = board({ user: [perm("fur", FURNACE, "user"), perm("dic", DICTATE, "user"), perm("pp", PYROMANCER, "user")] });
    expect(lost(s, ping(s, findP(s, "pp"), 1, toPlayer("ai")), "ai")).toBe(4);
  });
});

// ─── The twins ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the twins the same readers unlock", () => {
  it("⭐ Mechanized Warfare: a red source plus 1, an ARTIFACT source plus 1; control: a green nonartifact creature unchanged", () => {
    const run = (card, id) => { const s = combat(board({ user: [perm("mw", MECH_WARFARE, "user"), perm(id, card, "user")] }), [id]); return lost(s, resolveCombatDamage(s), "ai"); };
    expect({ red: run(RAGING_GOBLIN, "rg"), artifact: run(PERILOUS_MYR, "myr"), green: run(ELVES, "el") }).toEqual({ red: 2, artifact: 2, green: 1 });
  });
  it("⭐ Mechanized Warfare: Perilous Myr's dies trigger — an artifact source as it last existed — deals 3", () => {
    const s = board({ user: [perm("mw", MECH_WARFARE, "user"), perm("myr", PERILOUS_MYR, "user")] });
    expect(lost(s, settle(applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "myr" }] })), "ai")).toBe(3);
  });
  it("⭐ Thor: ANOTHER source you control plus 1; control: Thor's own combat damage unchanged", () => {
    const other = combat(board({ user: [perm("thor", THOR, "user"), perm("rg", RAGING_GOBLIN, "user")] }), ["rg"]);
    const self = combat(board({ user: [perm("thor", THOR, "user")] }), ["thor"]);
    expect({ other: lost(other, resolveCombatDamage(other), "ai"), self: lost(self, resolveCombatDamage(self), "ai") }).toEqual({ other: 2, self: 4 });
  });
  it("⭐ Tomik: noncombat plus 1; control: combat unchanged", () => {
    const b = board({ user: [perm("tom", TOMIK, "user"), perm("pp", PYROMANCER, "user"), perm("rg", RAGING_GOBLIN, "user")] });
    const c = combat(b, ["rg"]);
    expect({ noncombat: lost(b, ping(b, findP(b, "pp"), 1, toPlayer("ai")), "ai"), combat: lost(c, resolveCombatDamage(c), "ai") }).toEqual({ noncombat: 2, combat: 1 });
  });
  it("⭐ Hawkeye: noncombat plus Hawkeye's power, read when the damage is dealt (2, then 3 with a +1/+1 counter)", () => {
    const b = (extra) => board({ user: [perm("hk", HAWKEYE, "user", extra), perm("pp", PYROMANCER, "user")] });
    const s1 = b({}); const s2 = b({ counters: { "+1/+1": 1 } });
    expect({ power2: lost(s1, ping(s1, findP(s1, "pp"), 1, toPlayer("ai")), "ai"), power3: lost(s2, ping(s2, findP(s2, "pp"), 1, toPlayer("ai")), "ai") }).toEqual({ power2: 3, power3: 4 });
  });
  it("⭐ Goldnight Castigator: damage to THIS creature doubled; control: damage to you doubled (already modeled)", () => {
    const s = board({ user: [perm("gc", CASTIGATOR, "user")], ai: [perm("ap", PYROMANCER, "ai")] });
    expect({ toIt: marked(ping(s, findP(s, "ap"), 1, toCreature("gc")), "gc"), toYou: lost(s, ping(s, findP(s, "ap"), 1, toPlayer("user")), "user") }).toEqual({ toIt: 2, toYou: 2 });
  });
  it("⭐ Inquisitor's Flail: the equipped creature's combat damage doubled; another creature's combat damage to it doubled", () => {
    const eq = { attachments: ["fl"] };
    const attack = combat(board({ user: [perm("dino", DINO, "user", eq), perm("fl", FLAIL, "user", { attachedTo: "dino" })] }), ["dino"]);
    const blocked = combat(board({ user: [perm("dino", DINO, "user", eq), perm("fl", FLAIL, "user", { attachedTo: "dino" })], ai: [perm("ab", BEARS, "ai")] }), ["dino"], { blocks: [["ab", "dino"]] });
    const after = resolveCombatDamage(blocked);
    expect({ unblocked: lost(attack, resolveCombatDamage(attack), "ai"), dealtByBear: marked(after, "dino") }).toEqual({ unblocked: 18, dealtByBear: 4 });
  });
  it("control: Inquisitor's Flail — the equipped creature's NONCOMBAT damage is unchanged", () => {
    const s = board({ user: [perm("pp", PYROMANCER, "user", { attachments: ["fl"] }), perm("fl", FLAIL, "user", { attachedTo: "pp" })] });
    expect(lost(s, ping(s, findP(s, "pp"), 1, toPlayer("ai")), "ai")).toBe(1);
  });
  it("⚠️ Anthem of Rakdos: with a card in hand nothing is doubled (Hellbent); with an empty hand, doubled", () => {
    const run = (hand) => { const s = board({ user: [perm("ar", ANTHEM_RAKDOS, "user"), perm("pp", PYROMANCER, "user")], userHand: hand }); return lost(s, ping(s, findP(s, "pp"), 1, toPlayer("ai")), "ai"); };
    expect({ cardInHand: run([{ ...ELVES, id: "h1" }]), emptyHand: run([]) }).toEqual({ cardInHand: 1, emptyHand: 2 });
  });
});

// ─── The cards ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the cards", () => {
  it("⭐ the gained cards read native", () => {
    const row = Object.fromEntries([SOLPHIM, TORBRAN, GISELA, MECH_WARFARE, THOR, TOMIK, HAWKEYE, CASTIGATOR, FLAIL].map((c) => [c.name, classifyCard(c)]));
    console.log(`WITNESS tiers ${JSON.stringify(row)}`);
    expect(row).toEqual({
      "Solphim, Mayhem Dominus": "native-mixed",
      "Torbran, Thane of Red Fell": "native-static",
      "Gisela, Blade of Goldnight": "native-static",
      "Mechanized Warfare": "native-static",
      "Thor, Asgard's Avenger": "native-static",
      "Tomik, Izzet Sparkmage": "native-static",
      "Hawkeye, Young Avenger": "native-static",
      "Goldnight Castigator": "native-static",
      "Inquisitor's Flail": "native-mixed",
    });
  });
  it("control: Twinflame Tyrant stays native (now with its printed scope)", () => {
    expect(classifyCard(TWINFLAME)).toBe("native-static");
  });
  it("near misses stay parked: an opponent-controlled source, a source quality the reader doesn't know, an unread condition", () => {
    const fake = (oracle) => classifyCard({ name: "Fake Furnace", type: "Enchantment", mana: "{2}{R}", colors: ["R"], keywords: [], oracle });
    expect([
      fake("If a red source an opponent controls would deal damage to you or a permanent you control, it deals that much damage plus 2 instead."),
      fake("If a legendary source you control would deal damage to an opponent or a permanent an opponent controls, it deals that much damage plus 2 instead."),
      fake("As long as you control a Goblin, if a source you control would deal damage to an opponent or a permanent an opponent controls, it deals double that damage instead."),
    ]).toEqual(["body-only", "body-only", "body-only"]);
  });
});

// ─── The counted discard cost's other carriers (the same cost reader) ───────────────────────────────────────────────────────
describe("⭐ \"Discard two cards\" as an activation cost — the other cards it completes", () => {
  const ZOMBIE_INFESTATION = { name: "Zombie Infestation", type: "Enchantment", mana: "{1}{B}", colors: ["B"], keywords: [],
    oracle: "Discard two cards: Create a 2/2 black Zombie creature token." };
  const LATULLA = { name: "Latulla, Keldon Overseer", type: "Legendary Creature — Human Spellshaper", mana: "{3}{R}{R}", colors: ["R"], power: "3", toughness: "3", keywords: [],
    oracle: "{X}{R}, {T}, Discard two cards: Latulla deals X damage to any target." };
  const hand = () => [{ ...HILL_GIANT, id: "h1" }, { ...ELVES, id: "h2" }, { ...BEARS, id: "h3" }];
  it("⭐ Zombie Infestation: two cards discarded (the least valuable — Llanowar Elves and Grizzly Bears), a 2/2 Zombie created", () => {
    const s = board({ user: [perm("zi", ZOMBIE_INFESTATION, "user")], userHand: hand() });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "zi");
    expect(act).toBeTruthy();
    const after = settle(dispatchAction(s, act));
    const zombies = after.players.user.battlefield.filter((p) => /Zombie/.test(p.card?.type || p.card?.type_line || ""));
    expect({ discarded: after.players.user.graveyard.map((c) => c.name).sort(), handLeft: after.players.user.hand.map((c) => c.name), zombies: zombies.length })
      .toEqual({ discarded: ["Grizzly Bears", "Llanowar Elves"], handLeft: ["Hill Giant"], zombies: 1 });
  });
  it("⭐ Latulla: {X}{R}, {T}, Discard two cards — X = 2 deals 2 to the opponent", () => {
    const s = board({ user: [perm("lat", LATULLA, "user")], userHand: hand(), pool: { R: 3 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "lat" && a.xValue === 2 && a.targets?.[0]?.id === "ai");
    expect(act).toBeTruthy();
    const after = settle(dispatchAction(s, act));
    expect({ lost: lost(s, after, "ai"), handLeft: after.players.user.hand.length, tapped: !!findP(after, "lat").tapped }).toEqual({ lost: 2, handLeft: 1, tapped: true });
  });
  it("control: with one card in hand neither is offered", () => {
    const s = board({ user: [perm("zi", ZOMBIE_INFESTATION, "user"), perm("lat", LATULLA, "user")], userHand: [{ ...ELVES, id: "h1" }], pool: { R: 3 } });
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability").length).toBe(0);
  });
  it("⭐ both read native", () => {
    expect([classifyCard(ZOMBIE_INFESTATION), classifyCard(LATULLA)]).toEqual(["native-activated", "native-activated"]);
  });
  // ⚠️ THE {X} LANE DROPPED A SINGLE DISCARD (found while building the counted cost): Cackling Witch's "{X}{B}, {T}, Discard a card:
  // Target creature gets +X/+0 until end of turn." was offered with an EMPTY hand and activated without the discard.
  const WITCH = { name: "Cackling Witch", type: "Creature — Human Spellshaper", mana: "{1}{B}", colors: ["B"], power: "1", toughness: "1", keywords: [],
    oracle: "{X}{B}, {T}, Discard a card: Target creature gets +X/+0 until end of turn." };
  it("⚠️ Cackling Witch: not offered with an empty hand; with a card in hand, the activation discards it", () => {
    const empty = board({ user: [perm("cw", WITCH, "user")], pool: { B: 3 } });
    const s = board({ user: [perm("cw", WITCH, "user")], userHand: [{ ...ELVES, id: "h1" }], pool: { B: 3 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cw" && a.xValue === 1 && a.targets?.[0]?.id === "cw");
    const after = settle(dispatchAction(s, act));
    expect({ offeredEmpty: legalActionsForPlayer(empty, "user").some((a) => a.kind === "activate-ability"), handLeft: after.players.user.hand.length, graveyard: after.players.user.graveyard.map((c) => c.name) })
      .toEqual({ offeredEmpty: false, handLeft: 0, graveyard: ["Llanowar Elves"] });
  });
});
