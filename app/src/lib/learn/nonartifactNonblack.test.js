/**
 * nonartifactNonblack.test.js — "destroy target nonartifact, nonblack creature" (Shriekmaw, Bone Shredder — census rank 57 of
 * the 09-06 plan's stage ③, 2026-09-30 — and, through the same fix, Terror and Nekrataal).
 *
 * Both restrictions were already modeled one at a time (Doom Blade's colorNeg, "nonartifact creature"'s typeNeg) and the
 * shared grammar parsed the pair cleanly. The fold's isCleanClause refused the COMMA the list left standing between "target"
 * and the noun once both were stripped, so every carrier parked. The fix collapses only that span — and, because a list is
 * now reachable, the colour- and type-negation arms record EVERY negation instead of the first (the strip removed them all,
 * so "nonwhite, nonblack" would otherwise have read as nonwhite alone and offered a black creature).
 *
 * Terror's "It can't be regenerated." and Nekrataal's "That creature can't be regenerated." ride the existing MTG-001 rider
 * (cannotRegenerate on the destroy atom, honoured by applyDestroyEffect — CR 701.19c), which is why they flipped with it; the
 * rider is witnessed here against a regeneration shield, beside Shriekmaw, which prints none.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). ETB triggers run through enterPermanent → flushTriggers
 * (chooseTriggerTargets) → the stack; Terror's targets come from legalActionsForPlayer's cast offers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, addRegenShield, createGameState, createPermanent } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets, parseCreatureTargetRestrictions } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SHRIEKMAW = { id: "shriek", name: "Shriekmaw", type: "Creature — Elemental", mana: "{4}{B}", power: "3", toughness: "2", keywords: ["Evoke", "Fear"], colors: ["B"],
  oracle: "Fear (This creature can't be blocked except by artifact creatures and/or black creatures.)\nWhen this creature enters, destroy target nonartifact, nonblack creature.\nEvoke {1}{B} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)" };
const BONE_SHREDDER = { id: "shred", name: "Bone Shredder", type: "Creature — Phyrexian Minion", mana: "{2}{B}", power: "1", toughness: "1", keywords: ["Echo", "Flying"], colors: ["B"],
  oracle: "Flying\nEcho {2}{B} (At the beginning of your upkeep, if this came under your control since the beginning of your last upkeep, sacrifice it unless you pay its echo cost.)\nWhen this creature enters, destroy target nonartifact, nonblack creature." };
const NEKRATAAL = { id: "nek", name: "Nekrataal", type: "Creature — Human Assassin", mana: "{2}{B}{B}", power: "2", toughness: "1", keywords: ["First strike"], colors: ["B"],
  oracle: "First strike\nWhen this creature enters, destroy target nonartifact, nonblack creature. That creature can't be regenerated." };
const TERROR = { id: "terror", name: "Terror", type: "Instant", mana: "{1}{B}", mana_cost: "{1}{B}", cmc: 2, keywords: [], colors: ["B"],
  oracle: "Destroy target nonartifact, nonblack creature. It can't be regenerated." };
const CORPSE = { name: "Walking Corpse", type: "Creature — Zombie", mana: "{1}{B}", power: "2", toughness: "2", keywords: [], colors: ["B"], oracle: "" };
const THOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", power: "0", toughness: "2", keywords: ["Flying"], colors: [], oracle: "Flying" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
const LIONS = { name: "Savannah Lions", type: "Creature — Cat", mana: "{W}", power: "2", toughness: "1", keywords: [], colors: ["W"], oracle: "" };
const EXPUNGE = { id: "expunge", name: "Expunge", type: "Instant", mana: "{2}{B}", mana_cost: "{2}{B}", cmc: 3, keywords: ["Cycling"], colors: ["B"],
  oracle: "Destroy target nonartifact, nonblack creature. It can't be regenerated.\nCycling {2} ({2}, Discard this card: Draw a card.)" };
const FEAST = { id: "feast", name: "Feast or Famine", type: "Instant", mana: "{3}{B}", mana_cost: "{3}{B}", cmc: 4, keywords: [], colors: ["B"],
  oracle: "Choose one —\n• Create a 2/2 black Zombie creature token.\n• Destroy target nonartifact, nonblack creature. It can't be regenerated." };

const perm = (id, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: "ai", summoningSick: false });
function board(aiCards, { hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, hand, manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 2 } }, ai: { ...s.players.ai, battlefield: aiCards } } };
}
// The creature enters under the user's control; its ETB trigger is flushed (targets auto-chosen) and the stack resolved.
function enterAndSettle(s0, card) {
  let s = flushTriggers(enterPermanent(s0, card, "user"), { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
const aiNames = (s) => s.players.ai.battlefield.map((p) => p.card.name).sort();
const aiGraveyard = (s) => s.players.ai.graveyard.map((c) => c.name ?? c.card?.name).sort();

describe("the parse + the tiers", () => {
  it("⭐ the comma list folds to both restrictions; the six carriers classify native", () => {
    const p = parseEffectClause("destroy target nonartifact, nonblack creature", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].restrictions).toEqual(expect.arrayContaining([{ kind: "colorNeg", color: "B" }, { kind: "typeNeg", type: "artifact" }]));
    expect([SHRIEKMAW, BONE_SHREDDER, NEKRATAAL, TERROR, EXPUNGE, FEAST].map(classifyCard))
      .toEqual(["native-trigger", "native-trigger", "native-trigger", "native-spell", "native-spell", "native-spell"]);
  });

  it("⛔ an unmodeled word in the list still parks; the collapse touches only the qualifier span — a comma after the noun stands", () => {
    expect(programConfidence(parseEffectClause("destroy target nonartifact, legendary creature", "Instant"))).toBe("low");
    expect(parseCreatureTargetRestrictions({ oracle: "destroy target nonartifact, nonblack creature, then draw a card" }).cleanedOracle)
      .toMatch(/^destroy target creature, then draw a card$/);
  });

  it("⭐ every negation in the list is recorded — 'nonwhite, nonblack' is NOT white AND NOT black", () => {
    expect(parseCreatureTargetRestrictions({ oracle: "destroy target nonwhite, nonblack creature" }).restrictions)
      .toEqual([{ kind: "colorNeg", color: "W" }, { kind: "colorNeg", color: "B" }]);
    expect(parseCreatureTargetRestrictions({ oracle: "destroy target nonartifact, nonland creature" }).restrictions)
      .toEqual([{ kind: "typeNeg", type: "artifact" }, { kind: "typeNeg", type: "land" }]);
    const atom = parseEffectClause("destroy target nonwhite, nonblack creature", "Instant").atoms[0];
    const s = board([perm("corpse", CORPSE), perm("lions", LIONS), perm("bears", BEARS)]);
    const pool = enumerateTargets(s, "user", { targetType: "creature", restrictions: atom.restrictions }).map((t) => t.id).sort();
    expect(pool).toEqual(["bears"]);
    console.log(`WITNESS nonwhiteNonblackPool ${JSON.stringify(pool)}`);
  });
});

describe("RUNTIME — the pool is nonartifact AND nonblack", () => {
  it("⭐ Terror is offered on the Bears only — never the black Walking Corpse, never the artifact Ornithopter", () => {
    const s = board([perm("corpse", CORPSE), perm("thopter", THOPTER), perm("bears", BEARS)], { hand: [TERROR] });
    const offered = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "terror").map((a) => a.targets?.[0]?.id).sort();
    expect(offered).toEqual(["bears"]);
  });

  it("⭐ Shriekmaw enters: the Bears die, the Corpse and the Thopter stay", () => {
    const out = enterAndSettle(board([perm("corpse", CORPSE), perm("thopter", THOPTER), perm("bears", BEARS)]), SHRIEKMAW);
    const result = { ai: aiNames(out), graveyard: aiGraveyard(out) };
    expect(result).toEqual({ ai: ["Ornithopter", "Walking Corpse"], graveyard: ["Grizzly Bears"] });
    console.log(`WITNESS shriekmawEtb ${JSON.stringify(result)}`);
  });

  it("with only a black creature and an artifact creature about, Shriekmaw's trigger has no legal target and destroys nothing", () => {
    const out = enterAndSettle(board([perm("corpse", CORPSE), perm("thopter", THOPTER)]), SHRIEKMAW);
    expect({ ai: aiNames(out), graveyard: aiGraveyard(out), shriekmaw: out.players.user.battlefield.some((p) => p.card.name === "Shriekmaw") })
      .toEqual({ ai: ["Ornithopter", "Walking Corpse"], graveyard: [], shriekmaw: true });
  });

  it("Bone Shredder the same", () => {
    const out = enterAndSettle(board([perm("corpse", CORPSE), perm("thopter", THOPTER), perm("bears", BEARS)]), BONE_SHREDDER);
    expect(aiNames(out)).toEqual(["Ornithopter", "Walking Corpse"]);
  });
});

describe("the two that flipped unplanned — Expunge and Feast or Famine print the same clause and rider", () => {
  it("⭐ Expunge is offered on the Bears only, and resolves through a regeneration shield", () => {
    const s = addRegenShield(board([perm("corpse", CORPSE), perm("thopter", THOPTER), perm("bears", BEARS)], { hand: [EXPUNGE] }), "bears");
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "expunge");
    expect(acts.map((a) => a.targets?.[0]?.id).sort()).toEqual(["bears"]);
    const out = resolveTopOfStack(dispatchAction(s, acts[0]));
    const result = { ai: aiNames(out), graveyard: aiGraveyard(out) };
    expect(result).toEqual({ ai: ["Ornithopter", "Walking Corpse"], graveyard: ["Grizzly Bears"] });
    console.log(`WITNESS expungeCast ${JSON.stringify(result)}`);
  });

  it("⭐ Feast or Famine: the destroy mode reaches the Bears only; the Zombie mode needs no target", () => {
    const s = board([perm("corpse", CORPSE), perm("thopter", THOPTER), perm("bears", BEARS)], { hand: [FEAST] });
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "feast");
    const result = { destroyTargets: acts.filter((a) => (a.targets || []).length).map((a) => a.targets[0].id).sort(), zombieMode: acts.some((a) => !(a.targets || []).length) };
    expect(result).toEqual({ destroyTargets: ["bears"], zombieMode: true });
    const out = resolveTopOfStack(dispatchAction(s, acts.find((a) => (a.targets || []).length)));
    expect(aiGraveyard(out)).toEqual(["Grizzly Bears"]);
    console.log(`WITNESS feastOrFamineOffers ${JSON.stringify(result)}`);
  });
});

describe("the rider that flipped Terror and Nekrataal with it — CR 701.19c", () => {
  it("⭐ against a regeneration-shielded Bears: Shriekmaw's destroy is regenerated, Nekrataal's is not", () => {
    const shielded = () => addRegenShield(board([perm("bears", BEARS)]), "bears");
    const afterShriek = enterAndSettle(shielded(), SHRIEKMAW);
    const afterNek = enterAndSettle(shielded(), NEKRATAAL);
    const bears = afterShriek.players.ai.battlefield.find((p) => p.id === "bears");
    const result = { shriekmaw: { alive: !!bears, tapped: !!bears?.tapped, shields: bears?.regenShields ?? null },
      nekrataal: { alive: afterNek.players.ai.battlefield.some((p) => p.id === "bears"), graveyard: aiGraveyard(afterNek) } };
    expect(result).toEqual({ shriekmaw: { alive: true, tapped: true, shields: 0 }, nekrataal: { alive: false, graveyard: ["Grizzly Bears"] } });
    console.log(`WITNESS regenRider ${JSON.stringify(result)}`);
  });
});
