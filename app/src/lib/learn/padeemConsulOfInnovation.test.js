/**
 * padeemConsulOfInnovation.test.js — SHELF-85 runbook Phase 2 · S17 (2026-09-04): Padeem, Consul of Innovation (Shorikai).
 *
 *   "Artifacts you control have hexproof.
 *    At the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest
 *    mana value, draw a card."
 *
 * Two arms. The static: the anthem lanes are CREATURE-restricted on purpose (a keyword on a noncreature permanent is usually
 * meaningless), but hexproof and shroud bite on any permanent because canBeTargetedBy reads the layered keyword for every
 * permanent — so a whole-line arm emits the grant over the BARE card type, those two keywords only. The trigger: the
 * greatest-power intervening-if one column over, asked of artifacts on every board, with a self-contained mana-value reader.
 *
 * Twin audited whole-card: Leonin Abunas (the same single line). Real oracle fixtures (bundled Scryfall snapshot, 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PADEEM = { id: "c-padeem", name: "Padeem, Consul of Innovation", type: "Legendary Creature — Vedalken Artificer", keywords: [], power: 1, toughness: 4, mana: "{3}{U}",
  oracle: "Artifacts you control have hexproof. (They can't be the targets of spells or abilities your opponents control.)\nAt the beginning of your upkeep, if you control the artifact with the greatest mana value or tied for the greatest mana value, draw a card." };
const ABUNAS = { id: "c-abunas", name: "Leonin Abunas", type: "Creature — Cat Cleric", keywords: [], power: 2, toughness: 5, mana: "{3}{W}", oracle: "Artifacts you control have hexproof. (They can't be the targets of spells or abilities your opponents control.)" };
const TREASURE = { id: "c-treasure", name: "Treasure", type: "Artifact — Treasure", keywords: [], oracle: "{T}, Sacrifice this artifact: Add one mana of any color." };
const SOL = { id: "c-sol", name: "Sol Ring", type: "Artifact", keywords: [], mana: "{1}", oracle: "{T}: Add {C}{C}." };
const ROCK5 = { id: "c-rock5", name: "Big Rock", type: "Artifact", keywords: [], mana: "{5}", oracle: "" };
const ROCK1 = { id: "c-rock1", name: "Small Rock", type: "Artifact", keywords: [], mana: "{1}", oracle: "" };
const COND = "you control the artifact with the greatest mana value or tied for the greatest mana value";
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: "lib" + i, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }));

const board = (userArts, aiArts) => {
  let s = createGameState({ userDeck: lib(5), aiDeck: lib(5) });
  return { ...s, activePlayer: "user", phase: "upkeep", step: "upkeep", priorityHolder: "user", turn: 4,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "P", card: PADEEM, controller: "user" }), ...userArts.map((c, i) => createPermanent({ id: "U" + i, card: c, controller: "user" }))] },
      ai: { ...s.players.ai, battlefield: aiArts.map((c, i) => createPermanent({ id: "A" + i, card: c, controller: "ai" })) } } };
};

describe("parse", () => {
  it("the shield is a bare-Artifact hexproof grant (no Creature gate); shroud rides; any other keyword parks", () => {
    expect(parseStaticAbilities(ABUNAS)).toEqual([{ layer: 6, op: { layerOp: "addKeyword", keyword: "hexproof" }, affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Artifact"] } }, duration: { kind: "permanent" } }]);
    expect(parseStaticAbilities({ ...ABUNAS, oracle: "Enchantments you control have shroud." })[0].affects.selector).toEqual({ controllerScope: "you", cardTypes: ["Enchantment"] });
    // indestructible is NOT admitted here: whatever the older creature-gated lane makes of it, no bare-Artifact grant appears
    // (the destroy paths have not been audited for noncreature reads — CREED).
    const ind = parseStaticAbilities({ ...ABUNAS, oracle: "Artifacts you control have indestructible." });
    expect(ind.some((d) => JSON.stringify(d.affects?.selector) === JSON.stringify({ controllerScope: "you", cardTypes: ["Artifact"] }))).toBe(false);
    expect(interveningIfParseable(COND)).toBe(true);
  });
});

describe("runtime — the shield", () => {
  it("an opponent cannot target a shielded Treasure; the owner can; the opponent's own artifact is open", () => {
    const s = board([TREASURE], [ROCK5]);
    const treasure = s.players.user.battlefield.find((p) => p.id === "U0");
    expect(canBeTargetedBy(s, treasure, "user", "ai")).toBe(false);
    expect(canBeTargetedBy(s, treasure, "user", "user")).toBe(true);
    expect(canBeTargetedBy(s, s.players.ai.battlefield[0], "ai", "user")).toBe(true);
  });
  it("without Padeem the same Treasure is open", () => {
    const s = board([TREASURE], []);
    const stripped = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "P") } } };
    expect(canBeTargetedBy(stripped, stripped.players.user.battlefield[0], "user", "ai")).toBe(true);
  });
});

describe("runtime — the greatest artifact", () => {
  it("the condition reads every board: Sol Ring (1) loses to an opposing 5-drop; a tie counts; no artifacts → false", () => {
    expect(evaluateInterveningIf(board([SOL], [ROCK5]), COND, "user")).toBe(false);
    expect(evaluateInterveningIf(board([ROCK5], [ROCK5]), COND, "user")).toBe(true);
    expect(evaluateInterveningIf(board([ROCK5], [SOL]), COND, "user")).toBe(true);
    expect(evaluateInterveningIf(board([TREASURE], []), COND, "user")).toBe(true); // a lone Treasure (mana value 0) is the greatest
    expect(evaluateInterveningIf(board([], []), COND, "user")).toBe(false);
    expect(evaluateInterveningIf(board([ROCK1], [ROCK5]), COND, "ai")).toBe(true);
  });
  it("end to end: the upkeep trigger draws only when the controller holds the greatest artifact", () => {
    for (const [arts, opp, draws] of [[[ROCK5], [SOL], 1], [[SOL], [ROCK5], 0]]) {
      let s = board(arts, opp);
      const before = s.players.user.hand.length;
      const fired = checkStepTriggers(s, "upkeep");
      expect((fired.pendingTriggers || []).some((t) => t.source?.name === "Padeem, Consul of Innovation")).toBe(true);
      s = flushTriggers(fired);
      while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
      expect(s.players.user.hand.length - before).toBe(draws);
    }
  });
});

describe("classifier", () => {
  it("Padeem is native-mixed; Leonin Abunas native-static; Aeronaut Admiral stays parked", () => {
    expect(classifyCard(PADEEM)).toBe("native-mixed");
    expect(classifyCard(ABUNAS)).toBe("native-static");
    expect(classifyCard({ id: "c-aa", name: "Aeronaut Admiral", type: "Creature — Human Pilot", keywords: ["Flying"], power: 3, toughness: 1, oracle: "Flying\nVehicles you control have flying." })).toBe("body-only");
  });
});
