/**
 * tirelessProvisioner.test.js — Tireless Provisioner (the play-weighted program, P·9, 2026-10-01: EDHREC rank #182) and
 * Ant-Man's Army, the corpus's two carriers of "create a Food token or a Treasure token".
 *
 * The controller makes one of the two (CR 608.2d). The parser builds the clause as a choose-one of the two single-token modes
 * (each half parsed by the parser itself and required to be exactly one create-named-token atom), so the existing mode
 * machinery offers and resolves it. A trigger's mode is picked as it goes on the stack — earlier than the printed choice, so
 * never an advantage. Mode order is the house pick for the auto-chooser: Treasure leads when it is one of the two.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic fence clauses.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PROVISIONER = { name: "Tireless Provisioner", type: "Creature — Elf Scout", mana: "{2}{G}", cmc: 3, colors: ["G"], power: "3", toughness: "2", keywords: ["Treasure", "Food", "Landfall"],
  oracle: "Landfall — Whenever a land you control enters, create a Food token or a Treasure token. (Food is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\" Treasure is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" };
const ARMY = { name: "Ant-Man's Army", type: "Creature — Insect", mana: "{2}{G}", cmc: 3, colors: ["G"], power: "3", toughness: "2", keywords: ["Treasure", "Food"],
  oracle: "When this creature enters, create a Food token or a Treasure token. (A Food token is an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\" A Treasure token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };

const modesOf = (clause) => {
  const p = parseEffectClause(clause, "Creature");
  return p?.confidence === "high" && p.structure === "modal" ? p.modal.modes.map((m) => m.atoms.map((a) => a.token).join("+")) : p?.confidence ?? "low";
};
/** Resolve the stack and pending triggers; stop at a pending choice. */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return finalizeStackResolution(n);
}

describe("the cards", () => {
  it("the clause is a choose-one of two single-token modes, Treasure first; both carriers are native-trigger", () => {
    expect({ clause: modesOf("create a Food token or a Treasure token"), provisioner: classifyCard(PROVISIONER), army: classifyCard(ARMY) })
      .toEqual({ clause: ["treasure", "food"], provisioner: "native-trigger", army: "native-trigger" });
  });

  it("fences (synthetic): a non-named token, a count, the same token twice stay low; without a Treasure the printed order stands", () => {
    expect([
      modesOf("create a Food token or a Shark token"),
      modesOf("create a Food token or two Treasure tokens"),
      modesOf("create a Food token or a Food token"),
      modesOf("create a Clue token or a Food token"),
    ]).toEqual(["low", "low", "low", ["clue", "food"]]);
  });
});

describe("in play", () => {
  it("landfall: playing a Forest with Tireless Provisioner out makes a Treasure (WITNESS)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s0 = { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, landsPlayedThisTurn: 0, hand: [{ ...FOREST, id: "forest" }],
        battlefield: [createPermanent({ id: "prov", card: { id: "c-prov", ...PROVISIONER }, controller: "user", summoningSick: false })] } } };
    const play = legalActionsForPlayer(s0, "user").find((a) => a.kind === "play-land" && a.cardId === "forest");
    const s = settle(dispatchAction(s0, play));
    const tokens = s.players.user.battlefield.filter((p) => p.card?.token).map((p) => p.card.name).sort();
    console.log(`WITNESS tirelessProvisioner ${JSON.stringify(tokens)}`);
    expect(tokens).toEqual(["Treasure"]);
  });
});
