/**
 * idolOfOblivion.test.js — "you created a token this turn" (the play-weighted program, P·11, 2026-10-01): Idol of Oblivion
 * (EDHREC #196 — "{T}: Draw a card. Activate only if you created a token this turn.") and Bennie Bracks, Zoologist (the
 * end-step intervening-if).
 *
 * The mint chokepoint (tokens.fireTokenEnterTriggers — every token source funnels through it) stamps the creator's per-turn
 * `createdTokenThisTurn` for a REAL token only (a manifested card rides the same chokepoint and is not one, CR 701.34); the
 * untap reset (gameState.resetSpellsCastAllPlayers) clears it; the shared condition reader answers it, so the activation
 * gate and the intervening-if both read the same flag.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, resetSpellsCastAllPlayers } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const IDOL = { name: "Idol of Oblivion", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "{T}: Draw a card. Activate only if you created a token this turn.\n{8}, {T}, Sacrifice this artifact: Create a 10/10 colorless Eldrazi creature token." };
const BENNIE = { name: "Bennie Bracks, Zoologist", type: "Legendary Creature — Elf Druid", mana: "{3}{W}", cmc: 4, colors: ["W"], power: "3", toughness: "2", keywords: ["Convoke"],
  oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nAt the beginning of each end step, if you created a token this turn, draw a card." };
const FILLER = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, hand: [],
      battlefield: [createPermanent({ id: "idol", card: { id: "c-idol", ...IDOL }, controller: "user", summoningSick: false })],
      library: Array.from({ length: 5 }, (_, i) => ({ ...FILLER, id: `lib${i}` })) } } };
}
const treasure = (s) => ATOM_RESOLVERS["create-named-token"](s, { op: "create-named-token", token: "treasure", count: 1, targetType: null }, { controller: "user", cardName: "test" });
const drawOffered = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "idol" && /Draw a card/.test(a.abilityText || ""));

describe("the cards", () => {
  it("Idol of Oblivion is native-activated; Bennie Bracks is native-trigger", () => {
    expect([classifyCard(IDOL), classifyCard(BENNIE)]).toEqual(["native-activated", "native-trigger"]);
  });
});

describe("the flag", () => {
  it("no token yet: the draw is not offered; a Treasure made: it is, and it draws (WITNESS)", () => {
    const before = table();
    const made = treasure(before);
    const act = drawOffered(made);
    let after = dispatchAction(made, act);
    while (after.stack.length && !after.pendingChoice) after = resolveTopOfStack(after);
    const witness = { before: !!drawOffered(before), flag: made.players.user.createdTokenThisTurn, offered: !!act, drew: after.players.user.hand.length };
    console.log(`WITNESS idolOfOblivion ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ before: false, flag: true, offered: true, drew: 1 });
  });

  it("⛔ a manifested card is not a token: manifest dread leaves the flag unset", () => {
    const s = ATOM_RESOLVERS["manifest-dread"](table(), { op: "manifest-dread", targetType: null }, { controller: "user", cardName: "test" });
    expect({ manifested: s.players.user.battlefield.some((p) => p.faceDown), flag: s.players.user.createdTokenThisTurn === true, offered: !!drawOffered(s) })
      .toEqual({ manifested: true, flag: false, offered: false });
  });

  it("the turn's reset clears it — tomorrow needs a new token", () => {
    const reset = resetSpellsCastAllPlayers(treasure(table()));
    expect([reset.players.user.createdTokenThisTurn, !!drawOffered(reset)]).toEqual([false, false]);
  });

  it("Bennie Bracks' condition reads the same flag", () => {
    expect([evaluateInterveningIf(table(), "you created a token this turn", "user"), evaluateInterveningIf(treasure(table()), "you created a token this turn", "user")]).toEqual([false, true]);
  });
});
