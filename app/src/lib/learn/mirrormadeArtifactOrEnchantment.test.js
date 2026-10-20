/**
 * "AS A COPY OF ANY ARTIFACT OR ENCHANTMENT ON THE BATTLEFIELD" — Mirrormade (EDHREC #1149): "You may have this enchantment enter
 * as a copy of any artifact or enchantment on the battlefield." The copy takes the copied permanent's copiable values (CR 707.2) as
 * it enters; the pool is the union of the two clone pools that already ship — an artifact as Sculpting Steel reads it (the types it
 * has now), an enchantment as Copy Enchantment reads it (never a Saga; an Aura only with an Enchant line the engine lists). Any
 * player's permanent, Mirrormade's own controller's included. "You may": declining, it enters as itself, an enchantment with no
 * abilities.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { parseCloneSpec, cloneCandidates } from "./cloneCopy.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const MIRRORMADE = {"name":"Mirrormade","type":"Enchantment","mana":"{1}{U}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"You may have this enchantment enter as a copy of any artifact or enchantment on the battlefield."}; // body-only on 0a65c51c
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}", cmc: 3, colors: ["W"], keywords: [], oracle: "Creatures you control get +1/+1." };
const SAGA = { name: "History of Benalia", type: "Enchantment — Saga", mana: "{1}{W}{W}", cmc: 3, colors: ["W"], keywords: [], oracle: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", colors: ["G"], keywords: [], oracle: "" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, hand: [{ ...MIRRORMADE, id: "h-mm" }], battlefield: [perm("bears", BEARS), perm("i1", ISLAND), perm("i2", ISLAND), perm("i3", ISLAND)] },
      ai: { ...s.players.ai, battlefield: [perm("sol", SOL_RING, "ai"), perm("anthem", ANTHEM, "ai"), perm("saga", SAGA, "ai"), perm("ai-bears", BEARS, "ai")] } } };
}
function castToChoice() {
  const s0 = board();
  const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-mm");
  expect(cast, "Mirrormade is offered as a cast").toBeDefined();
  return resolveTopOfStack(dispatchAction(s0, cast));
}
const mirror = (s) => s.players.user.battlefield.find((p) => p.printedCard?.name === "Mirrormade" || p.card?.name === "Mirrormade") || null;

describe("the reader", () => {
  it("⭐ Mirrormade plays its whole text", () => {
    expect({ tier: classifyCard(MIRRORMADE), scope: parseCloneSpec(MIRRORMADE)?.scope }).toEqual({ tier: "native-clone", scope: "anyArtifactOrEnchantment" });
  });
  it("⭐ the pool: every artifact and enchantment, any controller — never a creature that is neither, never a Saga or a land", () => {
    const s = board();
    expect(cloneCandidates(s, "user", "anyArtifactOrEnchantment").map((c) => c.id).sort()).toEqual(["anthem", "sol"]);
  });
});

describe("Mirrormade on the board", () => {
  it("⭐ cast, it asks what to copy from the artifacts and enchantments; copying the Sol Ring it taps for {C}{C}", () => {
    let s = castToChoice();
    expect({ kind: s.pendingChoice?.kind, offered: (s.pendingChoice?.candidates || []).map((c) => c.id).sort() }).toEqual({ kind: "clone-search", offered: ["anthem", "sol"] });
    s = finalizeStackResolution(resolveCloneChoice(s, "sol"));
    const m = mirror(s);
    expect({ name: m?.card?.name, printed: m?.printedCard?.name, mana: manaProduction(m?.card) }).toMatchObject({ name: "Sol Ring", printed: "Mirrormade", mana: { colors: ["C"], amount: 2 } });
  });
  it("⭐ copying the opponent's Glorious Anthem: the caster's Bears are 3/3, the opponent's still 3/3 from their own Anthem", () => {
    const s = finalizeStackResolution(resolveCloneChoice(castToChoice(), "anthem"));
    expect({ name: mirror(s)?.card?.name, bears: permanentPower(s, "bears"), aiBears: permanentPower(s, "ai-bears") }).toEqual({ name: "Glorious Anthem", bears: 3, aiBears: 3 });
  });
  it("declined, it enters as itself and does nothing", () => {
    const s = finalizeStackResolution(resolveCloneChoice(castToChoice(), null));
    expect({ name: mirror(s)?.card?.name, bears: permanentPower(s, "bears") }).toEqual({ name: "Mirrormade", bears: 2 });
  });
});
