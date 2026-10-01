/**
 * permissionDenied.test.js — SHELF-85 runbook Phase 2 · S11 (2026-09-04): Permission Denied (Shorikai).
 *
 *   "Counter target noncreature spell. Your opponents can't cast noncreature spells this turn."
 *
 * The counter half already parsed. The second sentence is a TURN-STAMPED cast-type lock on every opponent
 * (state.castLocksThisTurn[pid] = { turn, noncreature: true }); the cast loop refuses a non-creature card for a locked
 * seat while the stamp's turn is the current one, and the stamp self-expires with the turn number (the FOG latch's
 * discipline). Ranger-Captain of Eos graduates with it ("Sacrifice: your opponents can't cast noncreature spells this
 * turn" on a body whose ETB tutor was already modeled).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DENIED = { id: "c-pd", name: "Permission Denied", type: "Instant", mana: "{W}{U}", cmc: 2, keywords: [], oracle: "Counter target noncreature spell. Your opponents can't cast noncreature spells this turn." };
const RANGER = { id: "c-rc", name: "Ranger-Captain of Eos", type: "Creature — Human Soldier Ranger", mana: "{1}{W}{W}", cmc: 3, power: 3, toughness: 3, keywords: [],
  oracle: "When this creature enters, you may search your library for a creature card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\nSacrifice this creature: Your opponents can't cast noncreature spells this turn." };
const land = (id, ctrl, name, color) => createPermanent({ id, card: { id: "card-" + id, name, type: "Basic Land — " + name, oracle: `{T}: Add {${color}}.` }, controller: ctrl });
const OPT = { id: "ai-opt", name: "Opt", type: "Instant", mana: "{U}", cmc: 1, oracle: "Scry 1. Draw a card." };
const BEAR = { id: "ai-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" };
const ROCK = { id: "ai-rock", name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, oracle: "{T}: Add {C}." };
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, turn: 6,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [land("P1", "user", "Plains", "W"), land("I1", "user", "Island", "U")], hand: [{ ...DENIED, id: "pd-hand" }], library: [] },
      ai: { ...s.players.ai, battlefield: [land("F1", "ai", "Forest", "G"), land("F2", "ai", "Forest", "G"), land("I2", "ai", "Island", "U")], hand: [OPT, BEAR, ROCK], library: [{ id: "ai-lib", name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }] } } };
}
const castable = (s, pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell").map((a) => a.cardId).sort();

describe("parse", () => {
  it("counter noncreature + the turn-stamped opponents' lock", () => {
    const r = parseEffectClause(DENIED.oracle, "Instant");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "counter", spellFilter: "noncreature", targetType: "spell" }, { op: "opponents-cast-lock-turn", filter: "noncreature", targetType: null }]);
  });
  it("seen-to-fail: a creature-filtered lock parks", () => {
    expect(parseEffectClause("Your opponents can't cast creature spells this turn.", "Instant").atoms).toEqual([]);
  });
  it("GRADUATED — the unfiltered lock is Silence's (P·31, the `all` filter; silence.test.js runs it)", () => {
    expect(parseEffectClause("Your opponents can't cast spells this turn.", "Instant").atoms).toEqual([{ op: "opponents-cast-lock-turn", filter: "all", targetType: null }]);
  });
});

describe("runtime — the AI casts Opt, it is countered, and the AI can cast only creatures for the rest of the turn", () => {
  it("lock this turn, gone next turn", () => {
    let s = board();
    expect(castable(s, "ai")).toEqual(["ai-bear", "ai-opt", "ai-rock"]);
    const opt = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "ai-opt");
    s = dispatchAction(s, opt);
    s = { ...s, priorityHolder: "user" };
    const deny = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "pd-hand");
    expect(deny).toBeTruthy();
    s = dispatchAction(s, deny);
    s = resolveAll(s);
    expect(s.players.ai.graveyard.some((c) => c.id === "ai-opt")).toBe(true); // countered
    expect(s.castLocksThisTurn).toEqual({ ai: { turn: 6, noncreature: true } });
    // The AI, back with priority on its own turn: only the Bear is castable now.
    s = { ...s, priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => ({ ...p, tapped: false })) } } };
    expect(castable(s, "ai")).toEqual(["ai-bear"]);
    // The user is never locked by their own spell.
    expect(s.castLocksThisTurn.user).toBeUndefined();
    // Next turn the stamp is stale: the artifact is castable again.
    const later = { ...s, turn: 7 };
    expect(castable(later, "ai")).toEqual(["ai-bear", "ai-rock"]);
  });
});

describe("classifier", () => {
  it("Permission Denied is a native spell; Ranger-Captain of Eos native-mixed", () => {
    expect(classifyCard(DENIED)).toBe("native-spell");
    expect(classifyCard(RANGER)).toBe("native-mixed");
  });
});
