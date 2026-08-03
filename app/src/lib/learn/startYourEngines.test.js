/**
 * startYourEngines.test.js — the KW-ENGINES speed subsystem (Aetherdrift, CR 702.179), end to end.
 *
 * "Start your engines!" = when this permanent enters, its controller's speed becomes 1 if they have
 * none (702.179b). A player with speed has the standing once-per-their-turn increase when an
 * opponent loses life (702.179c; modeled as an immediate state bump at the gameState.loseLife
 * chokepoint — the ability is mandatory, untargeted, and nothing in the engine responds to it, the
 * deliberate simplification named in the loseLife comment). Max speed is 4 (702.179d), and a
 * "Max speed —" ability is live ONLY at 4 — gated in manaModel (mana lines) and legalChoices
 * (graveyard-exile abilities).
 *
 * THE TWO LIVE FPs THIS SLICE CLOSED, both pinned here:
 *   - manaSources offered "Max speed — {T}: Add {R}{R}." UNGATED (free double-red at speed zero,
 *     measured on Endrider Catalyzer);
 *   - parseActivatedAbilities' generic label strip ATE the "Max speed —" prefix, crediting an
 *     ungated view of a gated ability for classification.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, loseLife, resetCreatureDeathsAllPlayers } from "./gameState.js";
import { detectTriggers, checkEnterTriggers, startYourEnginesKeywordCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { manaSources } from "./manaModel.js";
import { parseGraveyardExileAbility } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle shapes (bundled Scryfall, pulled 2026-08-02).
const ENGINES_REMINDER = "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)";
const CATALYZER = { id: "cat-card", name: "Endrider Catalyzer", type: "Creature — Human Warrior", power: "2", toughness: "3", mana: "{2}{R}",
  oracle: "Start your engines!\nMax speed — {T}: Add {R}{R}." };
const GOBLIN_SURVEYOR = { id: "gs-card", name: "Goblin Surveyor", type: "Creature — Goblin Scout", power: "2", toughness: "1", mana: "{R}",
  oracle: `Trample\n${ENGINES_REMINDER}\nMax speed — {3}, Exile this card from your graveyard: Draw a card.` };

function baseState(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const withUser = (state, patch) => ({ ...state, players: { ...state.players, user: { ...state.players.user, ...patch } } });

describe("KW-ENGINES — structural counter + synthesis + routing", () => {
  it("the printed keyword counts 1; a grant or mid-sentence mention counts 0", () => {
    expect(startYourEnginesKeywordCount(CATALYZER.oracle)).toBe(1);
    expect(startYourEnginesKeywordCount(ENGINES_REMINDER)).toBe(1);
    expect(startYourEnginesKeywordCount("Creatures you control have start your engines!")).toBe(0);
    expect(startYourEnginesKeywordCount("When this enters, start your engines!")).toBe(0);
  });
  it("synthesizes ONE self-ETB descriptor that routes natively; the sentinel parses HIGH", () => {
    const ds = detectTriggers(CATALYZER).filter((d) => d.sourceText === "Start your engines!");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "etb", scope: "self" });
    expect(triggerRoutesNatively(ds[0])).toBe(true);
    const p = parseEffectClause(ds[0].effectClause, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "start-engines" }]);
  });
});

describe("KW-ENGINES — ETB runtime (CR 702.179b)", () => {
  function enter(state, perm) {
    let s = checkEnterTriggers(state, perm);
    s = flushTriggers(s, {});
    let g = 0;
    while ((s.stack || []).length && g++ < 10) s = resolveTopOfStack(s);
    return s;
  }
  it("entering with NO speed → controller speed becomes 1", () => {
    const cat = createPermanent({ id: "cat", card: CATALYZER, controller: "user" });
    let s = withUser(baseState(), { battlefield: [cat] });
    s = enter(s, cat);
    expect(s.players.user.speed).toBe(1);
  });
  it("entering with speed 3 → speed STAYS 3 (the keyword never lowers or re-sets)", () => {
    const cat = createPermanent({ id: "cat", card: CATALYZER, controller: "user" });
    let s = withUser(baseState(), { battlefield: [cat], speed: 3 });
    s = enter(s, cat);
    expect(s.players.user.speed).toBe(3);
  });
});

describe("KW-ENGINES — the once-per-your-turn increase (CR 702.179c, the loseLife chokepoint)", () => {
  it("an opponent losing life on YOUR turn bumps your speed ONCE; a second loss does not", () => {
    let s = withUser(baseState(), { speed: 1 });
    s = loseLife(s, { playerId: "ai", amount: 2 });
    expect(s.players.user.speed).toBe(2);
    s = loseLife(s, { playerId: "ai", amount: 2 });
    expect(s.players.user.speed).toBe(2);            // once each turn
  });
  it("your OWN life loss never bumps you; a player with NO speed never bumps; 4 is the cap", () => {
    let s = withUser(baseState(), { speed: 1 });
    s = loseLife(s, { playerId: "user", amount: 2 }); // active player loses own life
    expect(s.players.user.speed).toBe(1);
    let s2 = baseState();                              // speed undefined (no engines yet)
    s2 = loseLife(s2, { playerId: "ai", amount: 2 });
    expect(s2.players.user.speed).toBeUndefined();
    let s3 = withUser(baseState(), { speed: 4 });
    s3 = loseLife(s3, { playerId: "ai", amount: 2 });
    expect(s3.players.user.speed).toBe(4);             // max speed is 4
  });
  it("the turn re-arm: after the untap reset the next opponent loss bumps again — and speed PERSISTS", () => {
    let s = withUser(baseState(), { speed: 1 });
    s = loseLife(s, { playerId: "ai", amount: 1 });   // 1 → 2, armed off
    s = resetCreatureDeathsAllPlayers(s);              // the untap cadence
    expect(s.players.user.speed).toBe(2);              // speed persists across turns
    s = loseLife(s, { playerId: "ai", amount: 1 });
    expect(s.players.user.speed).toBe(3);              // re-armed
  });
});

describe("KW-ENGINES — the Max-speed gate (the two closed FPs)", () => {
  it("⭐ 'Max speed — {T}: Add {R}{R}' is NOT a mana source below speed 4, and IS at 4", () => {
    const perm = { id: "p1", card: CATALYZER, tapped: false, summoningSick: false, controller: "user" };
    const mk = (speed) => ({ activePlayer: "user", players: { user: { battlefield: [perm], manaPool: {}, speed } } });
    expect(manaSources(mk(0), "user")).toEqual([]);
    expect(manaSources(mk(3), "user")).toEqual([]);
    const at4 = manaSources(mk(4), "user");
    expect(at4).toHaveLength(1);
    expect(at4[0]).toMatchObject({ colors: ["R"], amount: 2 });
  });
  it("a card with a PLAIN mana line beside a Max-speed line keeps the plain source ungated", () => {
    const COLUMN = { id: "col-card", name: "Starting Column", type: "Artifact",
      oracle: "Start your engines!\n{T}: Add one mana of any color.\nMax speed — {T}, Sacrifice this artifact: Add three mana of any one color." };
    const perm = { id: "p2", card: COLUMN, tapped: false, summoningSick: false, controller: "user" };
    const src = manaSources({ activePlayer: "user", players: { user: { battlefield: [perm], manaPool: {}, speed: 0 } } }, "user");
    expect(src).toHaveLength(1);
    expect(src[0].colors).toEqual(["W", "U", "B", "R", "G"]);
  });
  it("⭐ the Max-speed GRAVEYARD ability parses gated and is offered ONLY at speed 4", () => {
    const rec = parseGraveyardExileAbility(GOBLIN_SURVEYOR);
    expect(rec).toMatchObject({ manaPips: "{3}", maxSpeed: true });
    const mk = (speed) => withUser(baseState(), { graveyard: [GOBLIN_SURVEYOR], manaPool: { C: 3 }, speed,
      battlefield: [] });
    const below = filterActions(legalActionsForPlayer(mk(2), "user"), "activate-gy-exile");
    expect(below.filter((a) => a.name === "Goblin Surveyor")).toHaveLength(0);
    const at4 = filterActions(legalActionsForPlayer(mk(4), "user"), "activate-gy-exile");
    expect(at4.filter((a) => a.name === "Goblin Surveyor")).toHaveLength(1);
  });
});

describe("KW-ENGINES — classification (the census's 6-sole cluster + the mana carriers)", () => {
  it("the sole-blocked carriers flip; the mana carriers keep native-mana with an HONEST runtime", () => {
    expect(classifyCard(GOBLIN_SURVEYOR)).toBe("native-activated");
    expect(classifyCard(CATALYZER)).toBe("native-mana");
    expect(classifyCard({ name: "Leonin Surveyor", type: "Creature — Cat Scout", power: "2", toughness: "2",
      oracle: `${ENGINES_REMINDER}\nDuring your turn, this creature has first strike.\nMax speed — {3}, Exile this card from your graveyard: Draw a card.` })).toBe("native-mixed");
    expect(classifyCard({ name: "Hour of Victory", type: "Enchantment",
      oracle: "Start your engines!\nWhen this enchantment enters, create a 2/2 black Zombie creature token.\nMax speed — {1}{B}, Sacrifice this enchantment: Search your library for a card, put it into your hand, then shuffle. Activate only as a sorcery." })).toBe("native-mixed");
  });
  it("CREED — a GRANT never synthesizes and never flips the granter", () => {
    expect(classifyCard({ name: "SYNTH Granter", type: "Enchantment",
      oracle: "Creatures you control have start your engines!" })).not.toMatch(/^native/);
  });
});
