/**
 * fiendHunterOptionalDetain.test.js — the OPTIONAL two-trigger detain printing: "When this creature enters, you may exile
 * another target creature. / When this creature leaves the battlefield, return the exiled card to the battlefield under its
 * owner's control." (Fiend Hunter, Leonin Relic-Warder — the 09-06 plan's stage ③, census row ㉑, 2026-09-30).
 *
 * triggers.foldTwoTriggerDetain folds the older two-trigger printing onto the one-sentence "until this creature leaves the
 * battlefield" frame (CR 610.3), whose link and return were already modeled — but it refused a "you may" exile, calling it a
 * different effect. The bundled rulings name how the two printings differ (the source leaving before its enters-trigger
 * resolves: Oblivion Ring 2007-10-01, Leonin Relic-Warder 2011-06-01, Fiend Hunter 2018-12-07), and that holds for the
 * mandatory carriers the fold already claims; none of it turns on the "you may". So the pair folds, and the "you may" rides
 * into the folded sentence: accepted, the card is exiled and linked; declined, nothing is exiled and nothing returns.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each run through the trigger flush → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkLeavesTriggers, detectTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIEND_HUNTER = { id: "fh", name: "Fiend Hunter", type: "Creature — Human Cleric", mana: "{1}{W}{W}", power: "1", toughness: "3",
  oracle: "When this creature enters, you may exile another target creature.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control." };
const RELIC_WARDER = { id: "lrw", name: "Leonin Relic-Warder", type: "Creature — Cat Cleric", mana: "{W}{W}", power: "1", toughness: "1",
  oracle: "When this creature enters, you may exile target artifact or enchantment.\nWhen this creature leaves the battlefield, return the exiled card to the battlefield under its owner's control." };
const BEARS = { id: "gbc", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const MIND_STONE = { id: "msc", name: "Mind Stone", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };

function board(aiCards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const ai = aiCards.map((card, i) => createPermanent({ id: `ai${i}`, card, controller: "ai", summoningSick: false }));
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, ai: { ...s.players.ai, battlefield: ai } } };
}
// Flush the pending triggers and resolve the stack; the user's "you may" is answered with `accept`.
function settle(s0, accept) {
  let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 12; i++) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, accept); continue; }
    if (!(s.stack || []).length) break;
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  return s;
}
const mine = (s, name) => s.players.user.battlefield.find((p) => p.card.name === name);
const names = (zone) => (zone || []).map((c) => c.card?.name ?? c.name);

describe("classification", () => {
  it("Fiend Hunter and Leonin Relic-Warder → native-trigger, as ONE folded trigger (no second return)", () => {
    expect([classifyCard(FIEND_HUNTER), classifyCard(RELIC_WARDER)]).toEqual(["native-trigger", "native-trigger"]);
    for (const card of [FIEND_HUNTER, RELIC_WARDER]) {
      const t = detectTriggers(card);
      expect(t).toHaveLength(1);
      expect(t[0].event).toBe("etb");
    }
  });
});

describe("RUNTIME — the \"you may\" is a real choice, and the exile is linked", () => {
  it("⭐ accepted: the AI's Bears are exiled and linked; Fiend Hunter dies and the Bears come back to the AI", () => {
    let s = settle(enterPermanent(board([BEARS]), FIEND_HUNTER, "user", {}), true);
    expect(names(s.players.ai.battlefield)).toEqual([]);
    expect(names(s.players.ai.exile)).toEqual(["Grizzly Bears"]);
    const fh = mine(s, "Fiend Hunter");
    expect(fh.detainedExile).toEqual([{ cardId: "gbc", ownerId: "ai" }]);
    s = settle(checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: fh.id })), true);
    const out = { aiBattlefield: names(s.players.ai.battlefield), aiExile: names(s.players.ai.exile) };
    expect(out).toEqual({ aiBattlefield: ["Grizzly Bears"], aiExile: [] });
    console.log(`WITNESS fiendHunterLoop ${JSON.stringify(out)}`);
  });

  it("⭐ declined: nothing is exiled, nothing is linked, and Fiend Hunter leaving returns nothing", () => {
    let s = settle(enterPermanent(board([BEARS]), FIEND_HUNTER, "user", {}), false);
    expect(names(s.players.ai.battlefield)).toEqual(["Grizzly Bears"]);
    expect(names(s.players.ai.exile)).toEqual([]);
    const fh = mine(s, "Fiend Hunter");
    expect(fh.detainedExile || []).toEqual([]);
    s = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: fh.id }));
    expect((s.pendingTriggers || []).some((t) => t.descriptor?.event === "detainReturn")).toBe(false);
    s = settle(s, true);
    expect(names(s.players.ai.battlefield)).toEqual(["Grizzly Bears"]);
  });

  it("⭐ Leonin Relic-Warder exiles the AI's Mind Stone; bounced to hand (any exit), it hands the Mind Stone back", () => {
    let s = settle(enterPermanent(board([MIND_STONE]), RELIC_WARDER, "user", {}), true);
    expect(names(s.players.ai.exile)).toEqual(["Mind Stone"]);
    const warder = mine(s, "Leonin Relic-Warder");
    s = settle(checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: warder.id })), true);
    expect(names(s.players.ai.battlefield)).toEqual(["Mind Stone"]);
    expect(names(s.players.user.hand)).toContain("Leonin Relic-Warder");
  });
});
