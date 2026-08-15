/**
 * torturedExistence.test.js — the TYPED discard cost (Tortured Existence, Teval shelf, 2026-08-15):
 * "{B}, Discard a creature card: Return target creature card from your graveyard to your hand."
 *
 * γ1h-TYPED: the bare "Discard a card" cost (DC-1, the looter class) gains a basic-card-type filter.
 * The victim pool narrows at the ENUMERATOR (front-face type, CR 712.4a) and the DISPATCHER
 * re-validates the pitch (defense in depth — paying "Discard a creature card" with a land is the
 * under-pay FP, CR 601.2h). A subtype/color/compound filter still nulls the whole cost (FN-safe).
 *
 * Mutation-checked (2026-08-15): the enumerator's front-face filter dropped → the land-is-offered
 * control dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TE = { name: "Tortured Existence", type: "Enchantment", mana: "{B}",
  oracle: "{B}, Discard a creature card: Return target creature card from your graveyard to your hand." };

describe("parse + classify", () => {
  it("⭐ the typed discard cost parses; Tortured Existence classifies native-activated", () => {
    const [a] = parseActivatedAbilities(TE);
    const row = { modeled: a.modeled, filter: a.discardCardFilter, tier: classifyCard(TE) };
    console.log("  WITNESS torturedExistence", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ modeled: true, filter: "creature", tier: "native-activated" });
  });

  it("seen-to-fail: a SUBTYPE / compound discard filter still nulls (the whole ability stays unmodeled)", () => {
    expect(parseActivatedAbilities({ name: "X", type: "Enchantment", oracle: "{B}, Discard a Dragon card: Draw a card." })[0]?.modeled ?? false).toBe(false);
    expect(parseActivatedAbilities({ name: "Y", type: "Enchantment", oracle: "{B}, Discard two creature cards: Draw a card." })[0]?.modeled ?? false).toBe(false);
  });
});

describe("⭐⭐ enumeration + payment — only creature cards pitch, and the dispatcher re-validates", () => {
  function board() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const te = createPermanent({ id: "te", card: { id: "te-c", ...TE }, controller: "user" });
    const swamp = createPermanent({ id: "sw", card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user" });
    return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [te, swamp],
        hand: [
          { id: "h-bear", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", mana: "{1}{G}", oracle: "" },
          { id: "h-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" },
        ],
        graveyard: [{ id: "g-dino", name: "Dead Dino", type: "Creature — Dinosaur", power: "3", toughness: "3", mana: "{2}{G}", oracle: "" }] } } };
  }
  const teActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "te");

  it("⭐⭐ the pitch pool is CREATURE cards only (the Forest is never offered); paying really discards + returns", () => {
    const s = board();
    const acts = teActs(s);
    const pitches = [...new Set(acts.map((a) => a.discardCardId))];
    console.log("  WITNESS tePitches", JSON.stringify(pitches)); // vitest 4 needs --disable-console-intercept
    expect(pitches).toEqual(["h-bear"]);
    const after = dispatchAction(s, acts[0]);
    expect(after.players.user.hand.some((c) => c.id === "h-bear")).toBe(false);      // the pitch paid
    expect(after.players.user.graveyard.some((c) => c.id === "h-bear")).toBe(true);
    expect(after.stack.length).toBe(1);                                              // the ability is on the stack
  });

  it("the dispatcher REFUSES a hand-built action pitching the wrong type (defense in depth, CR 601.2h)", () => {
    const s = board();
    const act = teActs(s)[0];
    expect(() => dispatchAction(s, { ...act, discardCardId: "h-forest", discardCardName: "Forest" }))
      .toThrow(/not a creature card/);
  });

  it("no creature card in hand → the ability is not offered at all", () => {
    const s = board();
    const noCreature = { ...s, players: { ...s.players, user: { ...s.players.user, hand: s.players.user.hand.filter((c) => c.id !== "h-bear") } } };
    expect(teActs(noCreature)).toHaveLength(0);
  });
});
