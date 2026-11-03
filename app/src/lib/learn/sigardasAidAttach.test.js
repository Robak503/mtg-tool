/**
 * SIGARDA'S AID (EDHREC #831, native-mixed) — "You may cast Aura and Equipment spells as though they had flash. / Whenever an Equipment
 * you control enters, you may attach it to target creature you control."
 *
 * On an Equipment-enters watcher "it" is the entering Equipment (CR 608.2c) — Hammer of Nazahn's "attach that Equipment", the same
 * referent. Found by the pw21 A/B and its recheck (R2): the clause fell through to the self-attach atom's SOURCE, so the enchantment
 * attached itself to the creature and the Equipment stayed where it was (CR 704.5p then took the Aid off again). triggers.js's
 * equipment-enters rewrite now reads "attach it" as the triggering Equipment too.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { optionalAutoTakeValue, resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const AID = {"name":"Sigarda's Aid","type":"Enchantment","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["W"],"oracle":"You may cast Aura and Equipment spells as though they had flash.\nWhenever an Equipment you control enters, you may attach it to target creature you control."};
const HAMMER = {"name":"Hammer of Nazahn","type":"Legendary Artifact — Equipment","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Whenever Hammer of Nazahn or another Equipment you control enters, you may attach that Equipment to target creature you control.\nEquipped creature gets +2/+0 and has indestructible.\nEquip {4}"};
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
/** The AI's main phase: `battlefield` its permanents, Bonesplitter in its hand, {1} floating. */
function aiTurn(battlefield) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...g.players.ai, battlefield, hand: [{ ...BONESPLITTER, id: "splitter" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 1 }, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
function castBonesplitter(s) {
  const cast = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "splitter");
  expect(cast, "Bonesplitter's cast").toBeTruthy();
  let n = flushTriggers(dispatchAction(s, cast), { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 30 && (n.stack.length || n.pendingTriggers?.length || n.pendingChoice?.kind === "optional-effect"); g++) {
    // the AI answers its own "you may" (the default AI's optional take — the A/B's `optional … taken: true`)
    if (n.pendingChoice?.kind === "optional-effect") { n = flushTriggers(resolveOptionalChoice(n, optionalAutoTakeValue(n, n.pendingChoice)), { chooseTargets: chooseTriggerTargets }); continue; }
    if (n.pendingChoice) break;
    n = n.stack.length ? flushTriggers(resolveTopOfStack(n), { chooseTargets: chooseTriggerTargets }) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  }
  return n;
}
const attachedTo = (s, cardName) => s.players.ai.battlefield.find((p) => p.card?.name === cardName)?.attachedTo ?? null;

describe("Sigarda's Aid", () => {
  it("is a modeled card (both trees)", () => {
    expect(classifyCard(AID)).toBe("native-mixed");
  });
  it("⭐ the AI casts Bonesplitter beside Sigarda's Aid: Bonesplitter is attached to the Bears, and the Aid stays where it is", () => {
    const s = castBonesplitter(aiTurn([P("aid", AID, "ai"), P("bears", BEARS, "ai")]));
    expect({ bonesplitter: attachedTo(s, "Bonesplitter"), aid: attachedTo(s, "Sigarda's Aid"), bearsAttachments: s.players.ai.battlefield.find((p) => p.id === "bears").attachments || [] })
      .toEqual({ bonesplitter: "bears", aid: null, bearsAttachments: [s.players.ai.battlefield.find((p) => p.card?.name === "Bonesplitter").id] });
  });
  it("CONTROL — with no Sigarda's Aid, Bonesplitter enters unattached", () => {
    const s = castBonesplitter(aiTurn([P("bears", BEARS, "ai")]));
    expect(attachedTo(s, "Bonesplitter")).toBeNull();
  });
  it("CONTROL — Hammer of Nazahn's \"attach that Equipment\" still attaches the entering Bonesplitter (both trees)", () => {
    const s = castBonesplitter(aiTurn([P("hammer", HAMMER, "ai"), P("bears", BEARS, "ai")]));
    expect({ bonesplitter: attachedTo(s, "Bonesplitter"), hammer: attachedTo(s, "Hammer of Nazahn") }).toEqual({ bonesplitter: "bears", hammer: null });
  });
});
