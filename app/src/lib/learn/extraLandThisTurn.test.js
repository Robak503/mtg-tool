/**
 * ONE-SHOT EXTRA-LAND (CR 505.5b / 305.2) — the RESOLVING "you may play [an|up to N] additional land[s] this
 * turn" form (Explore, Summer Bloom, Urban Evolution; + the Scale the Heights composite). Distinct from the
 * STATIC "on each of your turns" form (Exploration/Azusa — see extraLandDrops.test.js): this one RAISES the
 * controller's land-play budget for THIS turn only, then resets next turn.
 *
 * Build:
 *   • parser — a new `play-extra-land-this-turn` atom. The α2 wrapper PEELS the leading "you may" and (like
 *     free-cast) leaves this atom UN-optional — the "may" is realized at the LAND-PLAY step (the player chooses
 *     whether to use the bigger budget; CR 601.3e), not as a resolution yes/no. That's why Explore ("…land this
 *     turn. Draw a card." = optional-then-mandatory grammar) stays HIGH instead of failing optionalsFormSuffix.
 *   • atom — applyPlayExtraLandThisTurn bumps player.extraLandsThisTurn by atom.amount (`?? 1`, never a
 *     fabricated 0). gameState.resetTurnCounters zeroes it each of the player's turns (alongside
 *     landsPlayedThisTurn). legalChoices.landDropAllowance adds it (1 + Σ static-extra + extraLandsThisTurn) —
 *     the SAME single reader both the action gate and the dispatcher gate use (the CREED two-sites invariant).
 *
 * CREED all-or-nothing: only a card whose EVERY clause models flips native — Explore (+draw), Summer Bloom
 * (alone), Urban Evolution (+draw 3), Scale the Heights (+1/+1 counter on up-to-one target / gain 2 / +land /
 * draw — all four modeled). The SYMMETRIC "each player may play …" (grants opponents too — the budget reader
 * is controller-only), the variable "X additional lands" (Nahiri's Lithoforming — no fixed N), and any card
 * with an UNmodeled rider (Enter the Unknown's explore-target, Escape to the Wilds' play-from-exile, Journey
 * of Discovery's entwine, Imoen/Kiora/Hearthhull/Sword-of-Forge-and-Frontier's trigger/loyalty/equip context)
 * stay non-native — a fabricated extra land play is a forbidden false positive.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { landDropAllowance, legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { createGameState, _resetIdsForTests, resetTurnCounters } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall scryfall.oracle.local.json, 2026-06) ────────────────────────
const EXPLORE = { id: "sp-exp", name: "Explore", type: "Sorcery", mana: "{1}{G}", oracle: "You may play an additional land this turn.\nDraw a card." };
const SUMMER_BLOOM = { id: "sp-sb", name: "Summer Bloom", type: "Sorcery", mana: "{1}{G}", oracle: "You may play up to three additional lands this turn." };
const URBAN_EVOLUTION = { id: "sp-ue", name: "Urban Evolution", type: "Sorcery", mana: "{3}{G}{U}", oracle: "Draw three cards. You may play an additional land this turn." };
const SCALE_THE_HEIGHTS = { id: "sp-sth", name: "Scale the Heights", type: "Sorcery", mana: "{2}{G}", oracle: "Put a +1/+1 counter on up to one target creature. You gain 2 life. You may play an additional land this turn.\nDraw a card." };
// Non-native (symmetric / variable-X / unmodeled rider):
const NAHIRIS_LITHOFORMING = { id: "sp-nl", name: "Nahiri's Lithoforming", type: "Sorcery", mana: "{X}{R}", oracle: "Sacrifice X lands. For each land sacrificed this way, draw a card. You may play X additional lands this turn. Lands you control enter tapped this turn." };
// Enter the Unknown flips native-spell as of BLITZ EX-1 (its "target creature you control explores" clause is
// now modeled — the chosen-target explore atom, chosenTargetExplore.test.js).
const ENTER_THE_UNKNOWN = { id: "sp-etu", name: "Enter the Unknown", type: "Sorcery", mana: "{G}", oracle: "Target creature you control explores.\nYou may play an additional land this turn." };
const ESCAPE_TO_THE_WILDS = { id: "sp-etw", name: "Escape to the Wilds", type: "Sorcery", mana: "{3}{R}{G}", oracle: "Exile the top five cards of your library. You may play cards exiled this way until the end of your next turn.\nYou may play an additional land this turn." };

const FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;

function boardState({ battlefield = [], hand = [], library = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield, hand, library, manaPool: { ...EMPTY_POOL } } },
  };
}

// ─── Parser: the peeled + full forms emit the atom; every off-form drops ──────────────────────────
describe("ONE-SHOT EXTRA-LAND — parser", () => {
  it("the PEELED form (post-α2) + a direct 'you may' clause both emit play-extra-land-this-turn", () => {
    // The α2 wrapper peels "you may " before this parser runs, so the canonical match is the peeled form…
    expect(atomsOf("play an additional land this turn")).toEqual([{ op: "play-extra-land-this-turn", amount: 1, targetType: null }]);
    expect(atomsOf("play up to three additional lands this turn")).toEqual([{ op: "play-extra-land-this-turn", amount: 3, targetType: null }]);
    // …and a direct clause-first call (with the "you may") is tolerated too (un-optional — see the whole-card path below).
    expect(atomsOf("you may play an additional land this turn")).toEqual([{ op: "play-extra-land-this-turn", amount: 1, targetType: null }]);
    expect(atomsOf("you may play up to two additional lands this turn")).toEqual([{ op: "play-extra-land-this-turn", amount: 2, targetType: null }]);
  });

  it("Explore parses HIGH as [extra-land, draw] — the atom is UN-optional so the optional-then-mandatory suffix rule holds", () => {
    const p = parseEffectProgram(EXPLORE);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "play-extra-land-this-turn", amount: 1, targetType: null },
      { op: "draw", amount: 1, targetType: null },
    ]);
    // The land atom must NOT carry optional:true — otherwise [optional, mandatory-draw] fails optionalsFormSuffix → LOW.
    expect(p.atoms[0].optional).toBeUndefined();
  });

  it("Summer Bloom (+3, alone) and Urban Evolution (draw 3 + land) parse HIGH", () => {
    expect(parseEffectProgram(SUMMER_BLOOM).atoms).toEqual([{ op: "play-extra-land-this-turn", amount: 3, targetType: null }]);
    const ue = parseEffectProgram(URBAN_EVOLUTION);
    expect(programConfidence(ue)).toBe("high");
    expect(ue.atoms).toEqual([
      { op: "draw", amount: 3, targetType: null },
      { op: "play-extra-land-this-turn", amount: 1, targetType: null },
    ]);
  });

  it("rejects symmetric / variable-X / on-each-turn / graveyard forms (no extra-land-this-turn atom)", () => {
    // SYMMETRIC ("each player …") — grants opponents too; the budget reader is controller-only → unmodeled.
    expect(atomsOf("each player may play an additional land this turn")).toEqual([]);
    // Variable "X additional lands" (Nahiri's Lithoforming) — no fixed N.
    expect(atomsOf("you may play X additional lands this turn")).toEqual([]);
    // The STATIC "on each of your turns" form is the OTHER subsystem (extraLandDrops) — not this one-shot atom.
    expect((atomsOf("you may play an additional land on each of your turns") || []).some((a) => a.op === "play-extra-land-this-turn")).toBe(false);
    // A "from your graveyard" land permission is a different (unmodeled) clause.
    expect(atomsOf("you may play lands from your graveyard")).toEqual([]);
  });
});

// ─── Coverage: every-clause-modeled → native-spell; an unmodeled rider → non-native ───────────────
describe("ONE-SHOT EXTRA-LAND — classifyCard", () => {
  it("Explore, Summer Bloom, Urban Evolution classify native-spell", () => {
    expect(classifyCard(EXPLORE)).toBe("native-spell");
    expect(classifyCard(SUMMER_BLOOM)).toBe("native-spell");
    expect(classifyCard(URBAN_EVOLUTION)).toBe("native-spell");
    // BLITZ EX-1 — Enter the Unknown (chosen-target explore + extra land) is now fully modeled.
    expect(classifyCard(ENTER_THE_UNKNOWN)).toBe("native-spell");
  });

  it("Scale the Heights (counter-on-up-to-one-target + gain 2 + extra-land + draw — ALL modeled) is native-spell", () => {
    // A legitimate ride-along composite: every one of its four clauses models, so the whole card flips. NOT a
    // false positive — the CREED forbids FABRICATED behavior, and this models the entire card.
    expect(classifyCard(SCALE_THE_HEIGHTS)).toBe("native-spell");
  });

  it("CREED: a card with ANY unmodeled rider / symmetric / variable-X clause stays non-native", () => {
    expect(classifyCard(NAHIRIS_LITHOFORMING)).not.toMatch(/^native/); // variable X + sac-X + lands-enter-tapped rider
  });

  it("GRADUATED 2026-08-14: Escape to the Wilds — the play-cards-from-exile rider is MODELED now", () => {
    // Pinned non-native above while the exile-play rider was unmodeled. The extended-window impulse
    // machine (impulseExtendedWindow.test.js, owner+stamp cleanup expiry) plus the "cards exiled this
    // way" referent widening (escapeToTheWilds.test.js — BOTH regex sites) admit the full card.
    expect(classifyCard(ESCAPE_TO_THE_WILDS)).toBe("native-spell");
  });
});

// ─── Atom unit: the budget bump, the `?? 1` floor, the removed-controller no-op ───────────────────
describe("ONE-SHOT EXTRA-LAND — atom resolution", () => {
  it("bumps extraLandsThisTurn by amount (and accumulates across two resolves)", () => {
    let s = boardState();
    expect(s.players.user.extraLandsThisTurn).toBe(0);
    s = resolveAtom(s, { op: "play-extra-land-this-turn", amount: 1, targetType: null }, { controller: "user", targets: [] });
    expect(s.players.user.extraLandsThisTurn).toBe(1);
    s = resolveAtom(s, { op: "play-extra-land-this-turn", amount: 3, targetType: null }, { controller: "user", targets: [] });
    expect(s.players.user.extraLandsThisTurn).toBe(4); // 1 + 3 — a second extra-land effect stacks
  });

  it("amount defaults to 1 via `?? 1` (a missing amount is +1, never a fabricated 0)", () => {
    let s = boardState();
    s = resolveAtom(s, { op: "play-extra-land-this-turn", targetType: null }, { controller: "user", targets: [] });
    expect(s.players.user.extraLandsThisTurn).toBe(1);
  });

  it("a removed/unknown controller is a clean no-op (state unchanged, never a throw)", () => {
    const s = boardState();
    const out = resolveAtom(s, { op: "play-extra-land-this-turn", amount: 1, targetType: null }, { controller: "ghost", targets: [] });
    expect(out).toBe(s); // identity — no mutation
  });
});

// ─── Runtime: cast Explore → budget usable THIS turn → resets NEXT turn ───────────────────────────
describe("ONE-SHOT EXTRA-LAND — runtime allowance (the CREED bar)", () => {
  const landPerm = (id, cid) => ({ id, card: FOREST(cid), controller: "user", tapped: false, summoningSick: false });

  it("base allowance is 1 with no effect resolved", () => {
    const s = boardState({ hand: [FOREST("h1")] });
    expect(landDropAllowance(s, "user")).toBe(1);
  });

  it("cast Explore → +1 budget AND the draw fires; a 2nd land is then legal, a 3rd is not; resets next turn", () => {
    // Two Forests on the battlefield pay {1}{G}; Explore + two Forests in hand; one card in library to draw.
    let s = boardState({
      battlefield: [landPerm("p1", "f1"), landPerm("p2", "f2")],
      hand: [EXPLORE, FOREST("h1"), FOREST("h2")],
      library: [FOREST("lib1")],
    });
    expect(landDropAllowance(s, "user")).toBe(1);

    // Cast Explore and resolve the stack.
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "sp-exp");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    let guard = 0;
    while (s.stack.length && guard++ < 12) s = resolveTopOfStack(s);

    // Budget bumped + the rider draw fired (library emptied into hand).
    expect(s.players.user.extraLandsThisTurn).toBe(1);
    expect(landDropAllowance(s, "user")).toBe(2);
    expect(s.players.user.library.length).toBe(0);
    expect(s.players.user.hand.filter((c) => c.name === "Forest").length).toBe(3); // h1, h2, drawn lib1

    // Land #1 (h1) — legal.
    let plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    s = dispatchAction(s, plays.find((a) => a.cardId === "h1"));
    expect(s.players.user.landsPlayedThisTurn).toBe(1);

    // Land #2 (h2) — legal ONLY because Explore bumped the budget to 2.
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBeGreaterThan(0);
    s = dispatchAction(s, plays.find((a) => a.cardId === "h2"));
    expect(s.players.user.landsPlayedThisTurn).toBe(2);

    // Land #3 — the budget (2) is spent; not offered, and the dispatcher rejects it.
    plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
    expect(plays.length).toBe(0);
    expect(() => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "lib1", name: "Forest" }))
      .toThrow(/Already played a land this turn/);

    // Next turn: resetTurnCounters zeroes BOTH the budget and lands-played → allowance is fresh (1).
    s = resetTurnCounters(s, { playerId: "user" });
    expect(s.players.user.extraLandsThisTurn).toBe(0);
    expect(s.players.user.landsPlayedThisTurn).toBe(0);
    expect(landDropAllowance(s, "user")).toBe(1);
  });

  it("Summer Bloom → +3 budget: four lands become legal in one turn", () => {
    let s = boardState({ hand: [FOREST("h1"), FOREST("h2"), FOREST("h3"), FOREST("h4")] });
    s = resolveAtom(s, { op: "play-extra-land-this-turn", amount: 3, targetType: null }, { controller: "user", targets: [] });
    expect(landDropAllowance(s, "user")).toBe(4); // 1 + 3
    for (const id of ["h1", "h2", "h3", "h4"]) {
      const plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land");
      expect(plays.length).toBeGreaterThan(0);
      s = dispatchAction(s, plays.find((a) => a.cardId === id));
    }
    expect(s.players.user.landsPlayedThisTurn).toBe(4);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land").length).toBe(0); // 5th rejected
  });

  it("CREED: the budget is per-turn — it does NOT leak to a player who never resolved an extra-land effect", () => {
    // The opponent's allowance is unaffected by the user's extraLandsThisTurn (it's a per-player field).
    let s = boardState({ hand: [FOREST("h1")] });
    s = resolveAtom(s, { op: "play-extra-land-this-turn", amount: 2, targetType: null }, { controller: "user", targets: [] });
    expect(landDropAllowance(s, "user")).toBe(3);
    const opp = Object.keys(s.players).find((p) => p !== "user");
    expect(landDropAllowance(s, opp)).toBe(1); // untouched
  });
});
