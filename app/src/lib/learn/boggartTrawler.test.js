/**
 * boggartTrawler.test.js — SHELF-85 runbook Phase 2 · T1c (2026-09-05): Boggart Trawler // Boggart Bog (Teval) and
 * Bojuka Bog (Nekusar), plus the twins the flip-diff surfaced on the same atom (Agent of Erebos, Angel of Finality,
 * Elspeth's Nightmare).
 *
 *   Boggart Trawler: "When this creature enters, exile target player's graveyard."   (// Boggart Bog — a pay-3-life land)
 *   Bojuka Bog:      "This land enters tapped. / When this land enters, exile target player's graveyard."
 *
 * The ETB already parsed to the exile-graveyard atom on a chosen PLAYER, but atomTargetIntent had no case for the op —
 * "ambiguous" — so programTriggerTargetsResolvable refused every trigger carrying it and the cards routed to the Arbiter
 * (on the modal DFC the creature front parked the whole card). Intent = enemy: exiling a graveyard is aimed at an
 * opponent, exactly as the destroy / exile family is.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-05).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { atomTargetIntent } from "./effects/programQueries.js";
import { detectTriggers } from "./triggers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TRAWLER_FRONT = { id: "c-bt", name: "Boggart Trawler", type: "Creature — Goblin", mana: "{2}{B}", power: 3, toughness: 2, keywords: [], oracle: "When this creature enters, exile target player's graveyard." };
const TRAWLER = { id: "c-btbb", name: "Boggart Trawler // Boggart Bog", type: "Creature — Goblin // Land", mana: "{2}{B}", power: 3, toughness: 2, keywords: [], layout: "modal_dfc",
  oracle: "Boggart Trawler - Creature — Goblin {2}{B}\nWhen this creature enters, exile target player's graveyard.\n//\nBoggart Bog - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {B}." };
const BOJUKA = { id: "c-bb", name: "Bojuka Bog", type: "Land", keywords: [], oracle: "This land enters tapped.\nWhen this land enters, exile target player's graveyard." };

const card = (id, name) => ({ id, name, type: "Instant", oracle: "" });
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 4,
    players: { ...s.players,
      user: { ...s.players.user, hand: [{ ...BOJUKA, id: "h-bog" }], graveyard: [card("ug1", "Mine 1"), card("ug2", "Mine 2")] },
      ai: { ...s.players.ai, graveyard: [card("ag1", "Theirs 1"), card("ag2", "Theirs 2"), card("ag3", "Theirs 3")] } } };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("the atom's side", () => {
  it("exile-graveyard on a chosen player is enemy-facing", () => {
    expect(atomTargetIntent({ op: "exile-graveyard", who: "targetPlayer", targetType: "player" })).toBe("enemy");
  });
  it("Boggart Trawler's ETB detects with the exile clause", () => {
    expect(detectTriggers(TRAWLER_FRONT).map((d) => [d.event, d.effectClause])).toEqual([["etb", "exile target player's graveyard"]]);
  });
});

describe("end to end — Bojuka Bog's drop exiles the OPPONENT's graveyard, never the controller's", () => {
  it("the flush chooser aims the trigger at the opponent; their graveyard empties, ours stays", () => {
    let s = board();
    s = dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "h-bog", name: "Bojuka Bog" });
    expect(s.players.user.battlefield.find((p) => p.card?.name === "Bojuka Bog").tapped).toBe(true);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    const trig = s.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.targets[0]).toMatchObject({ type: "player", id: "ai" });
    s = resolveAll(s);
    expect(s.players.ai.graveyard).toHaveLength(0);
    expect(s.players.user.graveyard).toHaveLength(2);
    expect(s.players.ai.exile.map((c) => c.id).sort()).toEqual(["ag1", "ag2", "ag3"]);
  });
});

describe("classifier — whole cards", () => {
  it("the Trawler front is native-trigger, the modal DFC native-trigger, Bojuka Bog a land", () => {
    expect(classifyCard(TRAWLER_FRONT)).toBe("native-trigger");
    expect(classifyCard(TRAWLER)).toBe("native-trigger");
    expect(classifyCard(BOJUKA)).toBe("land");
  });
});
