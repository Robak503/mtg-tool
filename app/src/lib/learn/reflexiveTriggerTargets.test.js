/**
 * reflexiveTriggerTargets.test.js — a reflexive trigger chooses its targets when IT is put on the stack (CR 603.12, 603.3d).
 *
 *   "<primary>. When you do, <effect naming a target>."
 *
 * The "When you do" sentence is a reflexive triggered ability: it triggers during the resolution of the ability (or spell) that
 * created it, when the action happens, and it is put on the stack the next time a player would receive priority — its targets
 * are chosen then, against the game AFTER the action. The engine folds a mandatory-primary reflexive into the parent's program;
 * until 2026-10-17 the fold's target was chosen with the PARENT's, before the action happened:
 *
 *  · Smoke Bomb (EDHREC #4790) never did anything: "All creatures have shroud" still applied when its upkeep trigger went on
 *    the stack, so the trigger was removed for lack of a target (CR 603.3d) and the artifact was never sacrificed. By the bundled
 *    ruling the target is chosen after the sacrifice, when the shroud is gone.
 *  · Primal Witchstalker and Yathan Roadwatcher ("mill four cards. When you do, return target … card from your graveyard") were
 *    removed whole when the graveyard held no target BEFORE the mill — no mill, no return — and the milled cards could never be
 *    the target.
 *  · Dream Eater lost its surveil when an opponent had no nonland permanent; Faebloom Trick could not be cast without an
 *    opposing creature (the spell itself has no target — the bundled ruling).
 *
 * Now a reflexive atom that names a chosen target carries `reflexiveTrigger`: the parent's target choice skips it, and when the
 * parent's resolution reaches it (its gate open — the self-sacrifice happened), it becomes its own pending triggered ability,
 * put on the stack at the next flush with its own target choice (removed if none is legal). A reflexive with no target, an
 * optional-primary reflexive ("you may …. When you do, …") and one the trigger chooser can't place on a side stay as they were.
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkStepTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveTutorChoice, resolveOptionalChoice, resolveSacrificeChoice } from "./effects/runProgram.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const C = (id, name, type, mana, oracle, extra = {}) => ({ id, name, type, mana, cmc: 0, colors: [], keywords: [], oracle, ...extra });
const SMOKE_BOMB = C("c-sb", "Smoke Bomb", "Artifact", "{3}", "Flash\nAll creatures have shroud. (They can't be the targets of spells or abilities.)\nAt the beginning of your upkeep, sacrifice this artifact. When you do, target creature you control can't be blocked this turn.", { cmc: 3, keywords: ["Flash"] });
const WITCHSTALKER = C("witch", "Primal Witchstalker", "Creature — Wolf", "{1}{B}{G}", "Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, mill four cards. When you do, return target land card from your graveyard to the battlefield tapped. (To mill four cards, put the top four cards of your library into your graveyard.)", { cmc: 3, power: "3", toughness: "3", keywords: ["Menace"] });
const YATHAN = C("yathan", "Yathan Roadwatcher", "Creature — Human Scout", "{1}{W}{B}{G}", "When this creature enters, if you cast it, mill four cards. When you do, return target creature card with mana value 3 or less from your graveyard to the battlefield.", { cmc: 4, power: "3", toughness: "3" });
const DREAM_EATER = C("dream", "Dream Eater", "Creature — Nightmare Sphinx", "{4}{U}{U}", "Flash\nFlying\nWhen this creature enters, surveil 4. When you do, you may return target nonland permanent an opponent controls to its owner's hand. (To surveil 4, look at the top four cards of your library, then put any number of them into your graveyard and the rest on top of your library in any order.)", { cmc: 6, power: "4", toughness: "3", keywords: ["Flash", "Flying"] });
const FAEBLOOM = C("fae", "Faebloom Trick", "Instant", "{2}{U}", "Create two 1/1 blue Faerie creature tokens with flying. When you do, tap target creature an opponent controls.", { cmc: 3 });
const RED_HULK = C("hulk", "Red Hulk", "Legendary Creature — Gamma Berserker Villain", "{4}{R}{R}", "Reach, trample\nEnrage — Whenever Red Hulk is dealt damage, put a +1/+1 counter on him. When you do, he deals damage equal to the number of +1/+1 counters on him to any other target.", { cmc: 6, power: "6", toughness: "6", keywords: ["Reach", "Trample"] });
const SHOCK = C("shock", "Shock", "Instant", "{R}", "Shock deals 2 damage to any target.", { cmc: 1 });
const FIREBLADE = C("fire", "Fireblade Artist", "Creature — Human Shaman", "{B}{R}", "Haste\nAt the beginning of your upkeep, you may sacrifice a creature. When you do, this creature deals 2 damage to target opponent or planeswalker.", { cmc: 2, power: "2", toughness: "2", keywords: ["Haste"] });
const RIVETEERS = C("L", "Riveteers Overlook", "Land", "", "When this land enters, sacrifice it. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life.");
const EARTH_RUMBLE = C("rumble", "Earth Rumble", "Sorcery", "{3}{G}", "Earthbend 2. When you do, up to one target creature you control fights target creature an opponent controls. (To earthbend 2, target land you control becomes a 0/0 creature with haste that's still a land. Put two +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped. Creatures that fight each deal damage equal to their power to the other.)", { cmc: 4 });
const BEAR = (id) => C(id, "Grizzly Bears", "Creature — Bear", "{1}{G}", "", { cmc: 2, power: "2", toughness: "2" });
const BASIC = (id, sub) => C(id, sub, `Basic Land — ${sub}`, "", `({T}: Add {${{ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" }[sub]}}.)`);

const pool = (o) => ({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });
const perm = (id, controller, card) => createPermanent({ id, controller, summoningSick: false, card });
function board({ user = {}, ai = {}, step = "main", phase = "precombat-main" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, activePlayer: "user", priorityHolder: "user", phase, step, turn: 3,
    players: { ...s0.players, user: { ...s0.players.user, life: 40, ...user }, ai: { ...s0.players.ai, life: 40, ...ai } },
  };
}
const resolveAll = (s, n = 8) => { let g = 0; while ((s.stack || []).length && !s.pendingChoice && g++ < n) s = resolveTopOfStack(s); return s; };
const cast = (s, cardId, pick = () => true) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId && pick(x));
  return a ? dispatchAction(s, a) : null;
};
const logged = (s, kind, source) => (s.log || []).filter((e) => e.kind === kind && (source == null || e.source === source));
const names = (zone) => zone.map((c) => c.card?.name ?? c.name).sort();
const crash = (s) => (s.log || []).find((e) => e.kind === "stack-resolve-error" || e.kind === "spell-unresolved");

/** Smoke Bomb + the given creatures on the user's side, at the user's upkeep with its trigger flushed. */
function smokeBombUpkeep(creatures = [perm("BEAR", "user", BEAR("c-bear"))]) {
  let s = board({ user: { battlefield: [perm("BOMB", "user", SMOKE_BOMB), ...creatures] }, step: "upkeep", phase: "beginning" });
  s = checkStepTriggers(s, "upkeep");
  return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
}

describe("Smoke Bomb — the reflexive targets after the sacrifice (the bundled ruling, CR 603.12)", () => {
  it("⭐ the upkeep trigger goes on the stack WITHOUT a target — no target is chosen as it triggers", () => {
    const s = smokeBombUpkeep();
    expect(logged(s, "trigger-removed-no-target", "Smoke Bomb")).toEqual([]);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toMatchObject({ kind: "triggered-ability", targets: [] });
  });

  it("⭐ resolving it sacrifices the artifact and puts the reflexive on the stack as its own ability, targeting the creature", () => {
    const flushed = smokeBombUpkeep();
    expect(flushed.stack).toHaveLength(1);
    const s = resolveTopOfStack(flushed);
    expect(crash(s)).toBeUndefined();
    expect(names(s.players.user.graveyard)).toEqual(["Smoke Bomb"]);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].kind).toBe("triggered-ability");
    expect(s.stack[0].source?.name).toBe("Smoke Bomb");
    expect(s.stack[0].targets.map((t) => t.id)).toEqual(["BEAR"]);
    expect(permanentHasKeyword(s, "BEAR", "unblockable")).toBe(false); // nothing has happened yet — each player may respond
  });

  it("⭐ the reflexive resolves: the creature can't be blocked this turn", () => {
    const s = resolveAll(smokeBombUpkeep());
    expect(crash(s)).toBeUndefined();
    expect(s.stack).toEqual([]);
    expect(permanentHasKeyword(s, "BEAR", "unblockable")).toBe(true);
  });

  it("⭐ with no creature to target the artifact is still sacrificed — only the reflexive is removed (CR 603.3d)", () => {
    const s = resolveAll(smokeBombUpkeep([]));
    expect(names(s.players.user.graveyard)).toEqual(["Smoke Bomb"]);
    expect(s.players.user.battlefield).toEqual([]);
  });

  it("control — with no creature to target, nothing is made unblockable and the removal is logged", () => {
    const s = resolveAll(smokeBombUpkeep([]));
    expect(logged(s, "trigger-removed-no-target", "Smoke Bomb")).toHaveLength(1);
    expect(logged(s, "spell-effect").filter((e) => e.effect === "cant-be-blocked")).toEqual([]);
  });

  it("control — Smoke Bomb gone before its trigger resolves: it isn't sacrificed, so the reflexive never triggers (CR 603.7, 701.21a)", () => {
    let s = smokeBombUpkeep();
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "BOMB" });
    s = resolveAll(s);
    expect(crash(s)).toBeUndefined();
    expect(s.stack).toEqual([]);
    expect(names(s.players.user.hand)).toEqual(["Smoke Bomb"]);
    expect(permanentHasKeyword(s, "BEAR", "unblockable")).toBe(false);
  });

  it("control — Smoke Bomb stays credited native", () => {
    expect(classifyCard(SMOKE_BOMB)).toBe("native-mixed");
  });
});

describe("the parse — which reflexive atoms choose their own target", () => {
  it("⭐ a mandatory primary's targeted reflexive is marked (Smoke Bomb, Faebloom Trick, Primal Witchstalker)", () => {
    const sb = parseEffectClause("sacrifice this artifact. When you do, target creature you control can't be blocked this turn", "Instant", { sourceScoped: true });
    expect(programConfidence(sb)).toBe("high");
    expect(sb.atoms.map((a) => [a.op, a.ifSacrificed === true, a.reflexiveTrigger === true])).toEqual([["sacrifice", false, false], ["cant-be-blocked", true, true]]);
    const fae = parseEffectClause(FAEBLOOM.oracle, "Instant");
    expect(fae.atoms.map((a) => [a.op, a.reflexiveTrigger === true])).toEqual([["create-token", false], ["tap", true]]);
    const witch = parseEffectClause("mill four cards. When you do, return target land card from your graveyard to the battlefield tapped", "Instant", { sourceScoped: true });
    expect(witch.atoms.map((a) => [a.op, a.reflexiveTrigger === true])).toEqual([["mill", false], ["reanimate", true]]);
  });

  it("⭐ the parent's target choice skips the reflexive atom (one cast / one stack entry, no target)", () => {
    const fae = parseEffectClause(FAEBLOOM.oracle, "Instant");
    const s = board({ ai: { battlefield: [perm("OB", "ai", BEAR("c-ob"))] } });
    expect(expandCastChoices(s, "user", fae, [], null)).toEqual([{ targets: [] }]);
  });

  it("control — a reflexive with no target stays folded inline (the SNC fetch lands)", () => {
    const p = parseEffectClause("sacrifice this permanent. When you do, search your library for a basic Swamp, Mountain, or Forest card, put it onto the battlefield tapped, then shuffle and you gain 1 life", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.some((a) => a.reflexiveTrigger)).toBe(false);
  });

  it("control — an optional primary's reflexive keeps its flush-time target (Fireblade Artist)", () => {
    const p = parseEffectClause("you may sacrifice a creature. When you do, this creature deals 2 damage to target opponent or planeswalker", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.some((a) => a.reflexiveTrigger)).toBe(false);
    expect(p.atoms.filter((a) => a.reflexiveGate).map((a) => a.op)).toEqual(["deal-damage"]);
  });

  it("control — a reflexive the trigger chooser can't place on a side keeps its cast-time target (Earth Rumble's fight)", () => {
    const p = parseEffectClause(EARTH_RUMBLE.oracle, "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.some((a) => a.reflexiveTrigger)).toBe(false);
  });
});

describe("mill, then target the graveyard — the milled cards are targets (Primal Witchstalker, Yathan Roadwatcher)", () => {
  const LIB = () => [BEAR("l1"), BASIC("l2", "Forest"), BEAR("l3"), BEAR("l4"), BEAR("l5")];

  it("⭐ Primal Witchstalker with an empty graveyard mills four, then returns the milled Forest tapped", () => {
    let s = board({ user: { hand: [WITCHSTALKER], library: LIB(), graveyard: [], manaPool: pool({ B: 1, G: 1, C: 1 }) } });
    s = resolveAll(cast(s, "witch"));
    expect(crash(s)).toBeUndefined();
    expect(names(s.players.user.graveyard)).toEqual(["Grizzly Bears", "Grizzly Bears", "Grizzly Bears"]);
    const forest = s.players.user.battlefield.find((p) => p.card.name === "Forest");
    expect(forest?.tapped).toBe(true);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["l5"]);
  });

  it("⭐ Yathan Roadwatcher (cast) with an empty graveyard mills four, then returns the milled Grizzly Bears", () => {
    let s = board({ user: { hand: [YATHAN], library: [BASIC("l1", "Forest"), BEAR("l2"), BASIC("l3", "Forest"), BASIC("l4", "Forest"), BASIC("l5", "Forest")], graveyard: [], manaPool: pool({ W: 1, B: 1, G: 1, C: 1 }) } });
    s = resolveAll(cast(s, "yathan"));
    expect(crash(s)).toBeUndefined();
    expect(names(s.players.user.battlefield)).toEqual(["Grizzly Bears", "Yathan Roadwatcher"]);
    expect(names(s.players.user.graveyard)).toEqual(["Forest", "Forest", "Forest"]);
  });

  it("⭐ nothing to return still mills: the mill happens, the reflexive alone is removed", () => {
    let s = board({ user: { hand: [WITCHSTALKER], library: [BEAR("l1"), BEAR("l2"), BEAR("l3"), BEAR("l4"), BEAR("l5")], graveyard: [], manaPool: pool({ B: 1, G: 1, C: 1 }) } });
    s = resolveAll(cast(s, "witch"));
    expect(s.players.user.graveyard).toHaveLength(4);
  });

  it("control — nothing to return: no land enters and the removal is logged", () => {
    let s = board({ user: { hand: [WITCHSTALKER], library: [BEAR("l1"), BEAR("l2"), BEAR("l3"), BEAR("l4"), BEAR("l5")], graveyard: [], manaPool: pool({ B: 1, G: 1, C: 1 }) } });
    s = resolveAll(cast(s, "witch"));
    expect(names(s.players.user.battlefield)).toEqual(["Primal Witchstalker"]);
    expect(logged(s, "trigger-removed-no-target", "Primal Witchstalker")).toHaveLength(1);
  });
});

describe("Dream Eater and Faebloom Trick — the primary needs no target", () => {
  it("⭐ Dream Eater surveils even when no opponent has a nonland permanent", () => {
    let s = board({ user: { hand: [DREAM_EATER], library: [BEAR("l1"), BEAR("l2"), BEAR("l3"), BEAR("l4"), BEAR("l5")], manaPool: pool({ U: 2, C: 4 }) }, ai: { battlefield: [] } });
    s = resolveAll(cast(s, "dream"));
    expect(crash(s)).toBeUndefined();
    expect(s.pendingChoice).toMatchObject({ kind: "scry-surveil", controller: "user" });
  });

  it("⭐ Faebloom Trick can be cast with no opposing creature: two Faeries, the reflexive removed for lack of a target", () => {
    let s = board({ user: { hand: [FAEBLOOM], manaPool: pool({ U: 1, C: 2 }) }, ai: { battlefield: [] } });
    s = cast(s, "fae");
    expect(s).not.toBeNull();
    s = resolveAll(s);
    expect(crash(s)).toBeUndefined();
    expect(s.players.user.battlefield.filter((p) => p.card.name === "Faerie")).toHaveLength(2);
  });

  it("⭐ with an opposing creature: the spell is cast without a target, the reflexive taps it after the Faeries arrive", () => {
    let s = board({ user: { hand: [FAEBLOOM], manaPool: pool({ U: 1, C: 2 }) }, ai: { battlefield: [perm("OB", "ai", BEAR("c-ob"))] } });
    s = cast(s, "fae");
    expect(s.stack[0]).toMatchObject({ kind: "spell", targets: [] });
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.filter((p) => p.card.name === "Faerie")).toHaveLength(2);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toMatchObject({ kind: "triggered-ability", source: { name: "Faebloom Trick" } });
    expect(s.stack[0].targets.map((t) => t.id)).toEqual(["OB"]);
    s = resolveAll(s);
    expect(s.players.ai.battlefield.find((p) => p.id === "OB").tapped).toBe(true);
  });

  it("control — the Faeries and the tapped creature (the end state the fold also reached)", () => {
    let s = board({ user: { hand: [FAEBLOOM], manaPool: pool({ U: 1, C: 2 }) }, ai: { battlefield: [perm("OB", "ai", BEAR("c-ob"))] } });
    s = resolveAll(cast(s, "fae"));
    expect(s.players.user.battlefield.filter((p) => p.card.name === "Faerie")).toHaveLength(2);
    expect(s.players.ai.battlefield.find((p) => p.id === "OB").tapped).toBe(true);
  });
});

describe("Red Hulk — the damage is its own triggered ability, after the counter", () => {
  const hulkShocked = () => {
    let s = board({ user: { hand: [SHOCK], battlefield: [perm("HULK", "user", RED_HULK)], manaPool: pool({ R: 1 }) } });
    s = cast(s, "shock", (a) => (a.targets || []).some((t) => t.id === "HULK"));
    return resolveTopOfStack(s); // Shock resolves; the enrage trigger is flushed onto the stack
  };

  it("⭐ the enrage trigger puts the counter; the damage waits on the stack as the reflexive", () => {
    let s = hulkShocked();
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].source?.name).toBe("Red Hulk");
    s = resolveTopOfStack(s);
    expect(crash(s)).toBeUndefined();
    expect(s.players.user.battlefield.find((p) => p.id === "HULK").counters?.["+1/+1"]).toBe(1);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toMatchObject({ kind: "triggered-ability", source: { name: "Red Hulk" } });
    expect(s.players.ai.life).toBe(40);
  });

  it("control — it ends with one counter and 1 damage to an opponent, never to Red Hulk", () => {
    const s = resolveAll(hulkShocked());
    expect(crash(s)).toBeUndefined();
    expect(s.players.user.battlefield.find((p) => p.id === "HULK").counters?.["+1/+1"]).toBe(1);
    expect(s.players.ai.life).toBe(39);
    expect(s.players.user.life).toBe(40);
  });
});

describe("controls — the reflexives this slice leaves as they were", () => {
  it("control — Riveteers Overlook: sacrificed, then the search (in the same resolution) and the life", () => {
    let s = board({ user: { hand: [RIVETEERS], battlefield: [], library: [BASIC("lib-swamp", "Swamp"), BASIC("lib-plains", "Plains")], landsPlayedThisTurn: 0 } });
    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "L" });
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(names(s.players.user.graveyard)).toEqual(["Riveteers Overlook"]);
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search" });
    s = resolveTutorChoice(s, "lib-swamp");
    expect(names(s.players.user.battlefield)).toEqual(["Swamp"]);
    expect(s.players.user.life).toBe(41);
  });

  it("control — Fireblade Artist: the target is chosen at the flush; taking the sacrifice deals 2 to that opponent", () => {
    let s = board({ user: { battlefield: [perm("FIRE", "user", FIREBLADE), perm("BEAR", "user", BEAR("c-bear"))] }, step: "upkeep", phase: "beginning" });
    s = checkStepTriggers(s, "upkeep");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].targets.map((t) => t.id)).toEqual(["ai"]);
    s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice).toMatchObject({ kind: "sacrifice-choice" });
    s = resolveAll(resolveSacrificeChoice(s, "BEAR"));
    expect(names(s.players.user.graveyard)).toEqual(["Grizzly Bears"]);
    expect(s.players.ai.life).toBe(38);
  });
});
