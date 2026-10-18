/**
 * sharedSubjectEdict.test.js — the play-weighted program, #1077 Archon of Cruelty, with Scarring Memories and Geth's Verdict.
 *
 *   Archon of Cruelty: "Whenever this creature enters or attacks, target opponent sacrifices a creature or planeswalker of their
 *                       choice, discards a card, and loses 3 life. You draw a card and gain 3 life."
 *   Geth's Verdict:    "Target player sacrifices a creature of their choice and loses 1 life."
 *
 * One targeted player, three (or two) instructions. The splitter cut the shared subject off the later verbs ("discards a card,"
 * and "loses 3 life" had no subject), so both cards parked. splitClauses now writes the later verbs as their own sentences on
 * "the same target player" — the referent sentinel Sign in Blood's loss already uses, bound to the edict's target
 * (bindPreviousTargets, CR 608.2c), so ONE player is targeted (CR 115.1) and acts in the printed order (the bundled Archon
 * ruling: "You and the opponent you target take all the actions in the order listed. Notably, the creature or planeswalker they
 * sacrifice won't be on the battlefield as they discard a card or lose life."). The edict's pool gains "a creature or
 * planeswalker" for a targeted player (the pool Plaguecrafter's each-player edict already reads); the discard sentinel is new.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The casts are the offered legal actions; the attack half fires through checkAttackTriggers; the sacrificer's and the
 * discarder's picks are the engine's own auto-picks.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkEnterTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice, autoPickDiscardCandidate, resolveDiscardChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ARCHON = {"name":"Archon of Cruelty","type":"Creature — Archon","mana":"{6}{B}{B}","cmc":8,"power":"6","toughness":"6","keywords":["Flying"],"colors":["B"],"oracle":"Flying\nWhenever this creature enters or attacks, target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life."}; // body-only #1077
const GETH = {"name":"Geth's Verdict","type":"Instant","mana":"{B}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target player sacrifices a creature of their choice and loses 1 life."}; // arbiter-spell #17633
const SCARRING = {"name":"Scarring Memories","type":"Sorcery — Lesson","mana":"{3}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"You may cast this spell as though it had flash if you control an attacking legendary creature.\nTarget opponent sacrifices a creature of their choice, discards a card, and loses 3 life."}; // arbiter-spell #16482
const DUSK = {"name":"Dusk Mangler","type":"Creature — Horror","mana":"{5}{B}{B}","cmc":7,"power":"5","toughness":"4","keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, sacrifice a creature, discard a card, or pay 4 life.\nWhen this creature enters, each opponent sacrifices a creature of their choice, discards a card, and loses 4 life."}; // body-only #10294
const JUKE = {"name":"Umbral Juke","type":"Instant","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Choose one —\n• Target player sacrifices a creature or planeswalker of their choice.\n• Create a 2/1 white and black Inkling creature token with flying."}; // arbiter-spell #23595
const CRUEL = {"name":"Cruel Edict","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Target opponent sacrifices a creature of their choice."}; // native-spell #19878
const PLAGUE = {"name":"Plaguecrafter","type":"Creature — Human Shaman","mana":"{2}{B}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":["B"],"oracle":"When this creature enters, each player sacrifices a creature or planeswalker of their choice. Each player who can't discards a card."}; // native-trigger #639
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // native-planeswalker
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const swamps = (n) => Array.from({ length: n }, (_, i) => P(`sw${i}`, SWAMP, "user"));
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));
const card = (id, c) => ({ id, ...c });
const EFFECT = "target opponent sacrifices a creature or planeswalker of their choice, discards a card, and loses 3 life. You draw a card and gain 3 life";

function table({ user = [], ai = [], hand = [], aiHand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: library(pid), life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai, hand: aiHand };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
/** Settle a sacrifice or discard pick with the engine's own auto-pick; true when one was settled. */
function settlePick(s) {
  const pc = s.pendingChoice;
  if (pc?.kind === "sacrifice-choice") return resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, pc));
  if (pc?.kind === "discard") return resolveDiscardChoice(s, autoPickDiscardCandidate(s, pc));
  return null;
}
/** Resolve a cast through priority passes, every pick the engine's own auto-pick. */
function resolveAll(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length || s.pendingChoice) && g++ < 300) {
    const settled = settlePick(s);
    if (settled) { s = settled; continue; }
    if (s.pendingChoice) break;
    s = passPriority(s);
  }
  return s;
}
/** Resolve flushed triggers top-down (no step advance), every pick the engine's own auto-pick. */
function resolveTriggers(s) {
  let g = 0;
  while ((s.stack.length || s.pendingChoice) && g++ < 300) {
    const settled = settlePick(s);
    if (settled) { s = settled; continue; }
    if (s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const castArchon = (opts) => {
  const s = table({ ...opts, user: [...(opts.user || []), ...swamps(8)], hand: [card("archon", ARCHON)] });
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "archon");
  return resolveAll(dispatchAction(s, a));
};
const names = (zone) => zone.map((c) => c.card?.name ?? c.name).sort();

describe("PARSE + CLASSIFICATION", () => {
  it("Archon of Cruelty's effect → the edict on the targeted opponent, then the discard and the loss bound to that SAME player, then the controller's draw and gain", () => {
    const p = parseEffectClause(EFFECT, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "sacrifice", targetType: "opponent", what: "creatureOrPlaneswalker" },
      { op: "discard", amount: 1, who: "target", targetType: null, bindPreviousTargets: true },
      { op: "lose-life", amount: 3, who: "target", targetType: null, bindPreviousTargets: true },
      { op: "draw", amount: 1, targetType: null },
      { op: "gain-life", amount: 3, targetType: null },
    ]);
  });

  it("Geth's Verdict → the edict on the targeted player and the loss bound to that player", () => {
    const p = parseEffectClause(GETH.oracle, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "sacrifice", targetType: "player", what: "creature" },
      { op: "lose-life", amount: 1, who: "target", targetType: null, bindPreviousTargets: true },
    ]);
  });

  it("both halves of Archon's trigger route natively; Archon of Cruelty and Geth's Verdict classify native", () => {
    const ds = detectTriggers(ARCHON);
    expect(ds.map((d) => d.event).sort()).toEqual(["attacks", "etb"]);
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect([ARCHON, GETH].map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual([[ARCHON.name, true], [GETH.name, true]]);
  });

  it("control — the single-verb edicts parse and classify as before (Cruel Edict; Plaguecrafter's each-player creature-or-planeswalker batch)", () => {
    expect(parseEffectClause("Target opponent sacrifices a creature of their choice.", "Sorcery").atoms).toEqual([{ op: "sacrifice", targetType: "opponent", what: "creature" }]);
    expect(parseEffectClause("each player sacrifices a creature or planeswalker of their choice", "Instant").atoms).toEqual([{ op: "sacrifice", who: "eachPlayer", what: "creatureOrPlaneswalker", count: 1 }]);
    expect([CRUEL, PLAGUE].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
  });

  it("twin — Scarring Memories (its flash permission was already read) classifies native", () => {
    expect(isNativeTier(classifyCard(SCARRING))).toBe(true);
  });

  it("twin — Umbral Juke's first mode is the targeted creature-or-planeswalker edict alone; the modal spell classifies native", () => {
    expect(parseEffectClause("Target player sacrifices a creature or planeswalker of their choice.", "Instant").atoms).toEqual([{ op: "sacrifice", targetType: "player", what: "creatureOrPlaneswalker" }]);
    expect(isNativeTier(classifyCard(JUKE))).toBe(true);
  });

  it("CREED — the each-opponent form beside an unread additional cost stays parked (Dusk Mangler)", () => {
    expect(isNativeTier(classifyCard(DUSK))).toBe(false);
  });
});

describe("RUNTIME", () => {
  it("⭐ Archon of Cruelty enters → the opponent sacrifices (its choice), discards (its choice), loses 3; the user draws one and gains 3", () => {
    const s = castArchon({ ai: [P("giant", GIANT, "ai"), P("bears", BEARS, "ai")], aiHand: [card("h1", GIANT), card("h2", BEARS)] });
    expect(names(s.players.ai.battlefield)).toEqual(["Hill Giant"]); // the auto-pick gives up the cheaper Bears
    expect(names(s.players.ai.hand)).toEqual(["Hill Giant"]);
    expect(names(s.players.ai.graveyard)).toEqual(["Grizzly Bears", "Grizzly Bears"]);
    expect([s.players.ai.life, s.players.user.life]).toEqual([17, 23]);
    expect(s.players.user.hand).toHaveLength(1);
  });

  it("the pool is \"creature or planeswalker\": an opponent with only Jace Beleren sacrifices Jace", () => {
    const s = castArchon({ ai: [P("jace", JACE, "ai", { counters: { loyalty: 3 } })], aiHand: [card("h1", GIANT)] });
    expect(s.players.ai.battlefield).toEqual([]);
    expect(names(s.players.ai.graveyard)).toEqual(["Hill Giant", "Jace Beleren"]);
    expect(s.players.ai.life).toBe(17);
  });

  it("in the printed order (the ruling): the sacrifice is logged before the discard, the discard before the loss", () => {
    const s = castArchon({ ai: [P("giant", GIANT, "ai")], aiHand: [card("h1", BEARS)] });
    const at = (pred) => s.log.findIndex(pred);
    const sac = at((e) => e.kind === "spell-effect" && /^sacrifice/.test(e.effect || "") && (e.sacrificed || e.victims));
    const disc = at((e) => e.kind === "spell-effect" && e.effect === "discard" && e.controller === "ai");
    const loss = at((e) => e.kind === "spell-effect" && e.effect === "lose-life" && e.who === "target");
    expect(sac).toBeGreaterThan(-1);
    expect(disc).toBeGreaterThan(sac);
    expect(loss).toBeGreaterThan(disc);
    expect(s.players.ai.life).toBe(17);
  });

  it("the attack half: Archon attacks → the same four instructions", () => {
    let s = table({ user: [P("archon", ARCHON, "user")], ai: [P("bears", BEARS, "ai")], aiHand: [card("h1", GIANT)] });
    s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "archon", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    s = resolveTriggers(flushTriggers(checkAttackTriggers(s)));
    expect(s.players.ai.battlefield).toEqual([]);
    expect(s.players.ai.hand).toEqual([]);
    expect([s.players.ai.life, s.players.user.life, s.players.user.hand.length]).toEqual([17, 23, 1]);
  });

  it("ONE target: in a four-seat game only the opponent the trigger targeted sacrifices, discards and loses life", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const players = { ...s0.players };
    for (const pid of Object.keys(players)) {
      players[pid] = { ...players[pid], battlefield: pid === "user" ? [] : [P(`b-${pid}`, BEARS, pid)], hand: pid === "user" ? [] : [card(`h-${pid}`, GIANT)], graveyard: [], library: library(pid), life: 40 };
    }
    const archon = P("archon", ARCHON, "user");
    players.user = { ...players.user, battlefield: [archon] };
    let s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
    s = resolveTriggers(flushTriggers(checkEnterTriggers(s, archon)));
    const hit = Object.keys(s.players).filter((pid) => pid !== "user" && s.players[pid].life !== 40);
    expect(hit).toHaveLength(1);
    const [t] = hit;
    expect([s.players[t].life, s.players[t].battlefield.length, s.players[t].hand.length]).toEqual([37, 0, 0]);
    for (const pid of Object.keys(s.players).filter((p) => p !== "user" && p !== t)) {
      expect([pid, s.players[pid].battlefield.length, s.players[pid].hand.length]).toEqual([pid, 1, 1]);
    }
  });

  it("twin — Scarring Memories (cast) → the opponent sacrifices a creature, discards a card and loses 3", () => {
    let s = table({ user: swamps(4), ai: [P("giant", GIANT, "ai")], hand: [card("scar", SCARRING)], aiHand: [card("h1", BEARS)] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "scar" && (x.targets || []).some((t) => t.id === "ai"));
    expect(a).toBeDefined();
    s = resolveAll(dispatchAction(s, a));
    expect([s.players.ai.battlefield.length, s.players.ai.hand.length, s.players.ai.life]).toEqual([0, 0, 17]);
  });

  it("Geth's Verdict (cast at the opponent) → it sacrifices a creature and loses 1", () => {
    let s = table({ user: swamps(2), ai: [P("giant", GIANT, "ai")], hand: [card("geth", GETH)] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "geth" && (x.targets || []).some((t) => t.id === "ai"));
    expect(a).toBeDefined();
    s = resolveAll(dispatchAction(s, a));
    expect(s.players.ai.battlefield).toEqual([]);
    expect([s.players.ai.life, s.players.user.life]).toEqual([19, 20]);
  });
});
