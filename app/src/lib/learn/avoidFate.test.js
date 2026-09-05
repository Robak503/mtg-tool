/**
 * avoidFate.test.js — POD-SIM THREE · Killer Turts KT-9a (2026-09-05): Avoid Fate.
 *
 * "Counter target instant or Aura spell that targets a permanent you control." The targets-what predicate ("a permanent
 * you control" over a spell's RECORDED targets) already existed; the miss was the spell-TYPE prefix. The typed arm adds a
 * new `instantOrAura` filter value both evaluators (the enumerator's and the resolver's) know. A sorcery aimed at your
 * permanent, or an instant aimed at the opponent's, is never a target (CREED).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AVOID = { id: "avf", name: "Avoid Fate", type: "Instant", mana: "{G}", keywords: [], oracle: "Counter target instant or Aura spell that targets a permanent you control." };

function board() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller });
  const spell = (id, type, targets) => createStackObject({ id, kind: "spell", controller: "ai", source: { id: `c-${id}`, name: id, type, oracle: "" }, targets });
  return {
    ...g, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, hand: [AVOID], battlefield: [mk("mine", "user")], manaPool: { ...g.players.user.manaPool, G: 1 } },
      ai: { ...g.players.ai, battlefield: [mk("theirs", "ai")] } },
    stack: [
      spell("instMine", "Instant", [{ type: "creature", id: "mine", controller: "user" }]),
      spell("auraMine", "Enchantment — Aura", [{ type: "creature", id: "mine", controller: "user" }]),
      spell("sorcMine", "Sorcery", [{ type: "creature", id: "mine", controller: "user" }]),
      spell("instTheirs", "Instant", [{ type: "creature", id: "theirs", controller: "ai" }]),
    ],
  };
}
const offered = (s) => expandCastChoices(s, "user", parseEffectProgram(AVOID), [], {}).flatMap((c) => (c.targets || []).map((t) => t.id)).sort();

describe("parser + classifier", () => {
  it("the typed arm: instantOrAura + the permanent-you-control predicate; native-spell", () => {
    expect(parseEffectProgram(AVOID).atoms).toEqual([{ op: "counter", spellFilter: "instantOrAura", targetType: "spell", targetsFilter: { permanent: { types: null, youControl: true } } }]);
    expect(classifyCard(AVOID)).toBe("native-spell");
  });
});

describe("runtime — the enumerator offers exactly the instant and the Aura aimed at YOUR permanent", () => {
  it("instMine and auraMine only; the sorcery and the instant aimed at theirs are never targets", () => {
    expect(offered(board())).toEqual(["auraMine", "instMine"]);
  });

  it("through the real cast: the countered instant lands in its owner's graveyard", () => {
    let s = board();
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((c) => c.cardId === "avf" && (c.targets || []).some((t) => t.id === "instMine"));
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.stack.map((o) => o.id)).toEqual(["auraMine", "sorcMine", "instTheirs"]);
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["instMine"]);
  });
});
