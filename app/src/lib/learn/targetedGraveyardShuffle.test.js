/**
 * targetedGraveyardShuffle.test.js — "Target player shuffles their graveyard into their library." (the 09-06 plan's stage ③ · 51,
 * 2026-09-30 — Clear the Mind, Reminisce, Learn from the Past, Blessed Respite, Clear, the Mind, Thran Foundry, Cranial Archive).
 *
 * The untargeted "shuffle your graveyard into your library" (Feldon's Cane, Archangel's Light, the Eldrazi titans) already ran
 * through applyShuffleGraveyardIntoLibrary; the targeted form now reuses it on the CHOSEN player's graveyard and library. The
 * cast and activation paths choose the player. As a trigger the side is unprovable — refilling your own library vs clearing
 * an opponent's graveyard — so atomTargetIntent's default "ambiguous" parks any triggered carrier.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REMINISCE = { id: "rem", name: "Reminisce", type: "Sorcery", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: "Target player shuffles their graveyard into their library." };
const CLEAR_THE_MIND = { id: "ctm", name: "Clear the Mind", type: "Sorcery", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: "Target player shuffles their graveyard into their library.\nDraw a card." };
const THRAN_FOUNDRY = { name: "Thran Foundry", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [],
  oracle: "{1}, {T}, Exile this artifact: Target player shuffles their graveyard into their library." };
const CRANIAL_ARCHIVE = { name: "Cranial Archive", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "{2}, Exile this artifact: Target player shuffles their graveyard into their library. Draw a card." };
const LEARN_FROM_THE_PAST = { name: "Learn from the Past", type: "Instant", mana: "{3}{U}", cmc: 4, colors: ["U"], keywords: [],
  oracle: "Target player shuffles their graveyard into their library.\nDraw a card." };
const BLESSED_RESPITE = { name: "Blessed Respite", type: "Instant", mana: "{1}{G}", cmc: 2, colors: ["G"], keywords: [],
  oracle: "Target player shuffles their graveyard into their library. Prevent all combat damage that would be dealt this turn." };

const card = (id) => ({ id, name: `Card ${id}`, type: "Sorcery", mana: "{1}", oracle: "" });
function board({ hand = [], battlefield = [], userGy = [], aiGy = [], userLib = ["l1", "l2"], aiLib = ["m1"], pool = { U: 3, C: 3 } } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield, graveyard: userGy.map(card), library: userLib.map(card), manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, graveyard: aiGy.map(card), library: aiLib.map(card) } } };
}
const castAt = (s, cardId, pid) => dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === pid));
const drain = (s0) => { let s = s0; for (let i = 0; i < 6 && s.stack.length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const zones = (s, pid) => ({ graveyard: s.players[pid].graveyard.length, library: s.players[pid].library.length });

describe("the clause and the carriers", () => {
  it("⭐ the targeted clause is the shuffle atom on a chosen player; as a trigger its side is unprovable", () => {
    const atom = parseEffectClause("Target player shuffles their graveyard into their library.", "Sorcery", { hasX: false }).atoms[0];
    expect({ op: atom.op, targetType: atom.targetType, intent: atomTargetIntent(atom) }).toEqual({ op: "shuffle-graveyard-into-library", targetType: "player", intent: "ambiguous" });
  });
  it("⭐ the spells and the artifacts read native", () => {
    expect([REMINISCE, CLEAR_THE_MIND, LEARN_FROM_THE_PAST, BLESSED_RESPITE, THRAN_FOUNDRY, CRANIAL_ARCHIVE].map((c) => isNativeTier(classifyCard(c))))
      .toEqual([true, true, true, true, true, true]);
  });
});

describe("⭐ the real cast", () => {
  it("⭐ Reminisce is offered at either player; aimed at the opponent, THEIR graveyard goes into THEIR library, the caster's stays", () => {
    const s = board({ hand: [REMINISCE], userGy: ["u1", "u2"], aiGy: ["a1", "a2", "a3"] });
    const offered = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "rem").map((a) => a.targets?.[0]?.id).sort();
    const out = drain(castAt(s, "rem", "ai"));
    const row = { offered, ai: zones(out, "ai"), user: zones(out, "user") };
    console.log(`WITNESS targetedGraveyardShuffle ${JSON.stringify(row)}`);
    // The user's graveyard also holds Reminisce itself once it resolves (3 = u1, u2 + the spell).
    expect(row).toEqual({ offered: ["ai", "user"], ai: { graveyard: 0, library: 4 }, user: { graveyard: 3, library: 2 } });
  });
  it("aimed at the caster, their own graveyard refills their library", () => {
    const out = drain(castAt(board({ hand: [REMINISCE], userGy: ["u1", "u2"], aiGy: ["a1"] }), "rem", "user"));
    expect({ user: zones(out, "user").library, ai: zones(out, "ai") }).toEqual({ user: 4, ai: { graveyard: 1, library: 1 } });
  });
  it("Clear the Mind also draws the caster a card", () => {
    const out = drain(castAt(board({ hand: [CLEAR_THE_MIND], aiGy: ["a1", "a2"] }), "ctm", "ai"));
    expect({ ai: zones(out, "ai"), userHand: out.players.user.hand.length }).toEqual({ ai: { graveyard: 0, library: 3 }, userHand: 1 });
  });
});

describe("no player target left", () => {
  it("⛔ the atom never falls back to the caster's own graveyard", () => {
    const atom = parseEffectClause("Target player shuffles their graveyard into their library.", "Sorcery", { hasX: false }).atoms[0];
    const out = resolveAtom(board({ userGy: ["u1", "u2"] }), atom, { controller: "user", targets: [] });
    expect(zones(out, "user")).toEqual({ graveyard: 2, library: 2 });
  });
});

describe("⭐ the real activation", () => {
  it("⭐ Thran Foundry exiles itself as the cost and shuffles the chosen player's graveyard in", () => {
    const foundry = createPermanent({ id: "tf", card: { ...THRAN_FOUNDRY, id: "c-tf" }, controller: "user", summoningSick: false });
    const s = board({ battlefield: [foundry], aiGy: ["a1", "a2"], pool: { C: 1 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "tf" && a.targets?.[0]?.id === "ai");
    const out = drain(dispatchAction(s, act));
    expect({ foundryGone: !out.players.user.battlefield.some((p) => p.id === "tf"), ai: zones(out, "ai") }).toEqual({ foundryGone: true, ai: { graveyard: 0, library: 3 } });
  });
});
