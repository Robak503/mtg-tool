/**
 * eiganjoCastle.test.js — Eiganjo Castle (shelf decks D39, 2026-09-30: Light-Paws Voltron).
 *
 *   "{T}: Add {W}.
 *    {W}, {T}: Prevent the next 2 damage that would be dealt to target legendary creature this turn."
 *
 * The chosen-creature prevention shield (CR 615.7) already existed for "target creature" and "target artifact creature";
 * this adds the supertype-narrowed sibling (legendary, CR 205.4a) on the same restriction the enumerator enforces.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CASTLE = { name: "Eiganjo Castle", type: "Legendary Land", mana: "", keywords: [],
  oracle: "{T}: Add {W}.\n{W}, {T}: Prevent the next 2 damage that would be dealt to target legendary creature this turn." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: "2", toughness: "2", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };

const P = (id, c, controller = "user") => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [P("CASTLE", CASTLE), P("ISA", ISAMARU), P("BEAR", BEARS)], hand: [{ ...BOLT, id: "bolt" }], manaPool: { ...g.players.user.manaPool, W: 1, R: 1 } },
      ai: { ...g.players.ai, battlefield: [P("AISA", ISAMARU, "ai")] } } };
}
const shieldOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "CASTLE" && a.targets?.length);
const settle = (s) => { let n = s, g = 0; while (n.stack.length && g++ < 10) n = resolveTopOfStack(n); return n; };
const damageOn = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.damageMarked ?? null;

describe("the card", () => {
  it("reads as a native land; the shield is the creature prevention atom narrowed to legendary", () => {
    expect({ tier: classifyCard(CASTLE), atoms: parseEffectClause("Prevent the next 2 damage that would be dealt to target legendary creature this turn.", "Land").atoms })
      .toEqual({ tier: "land", atoms: [{ op: "prevent-next-damage", amount: 2, targetType: "creature", restrictions: [{ kind: "supertype", value: "legendary" }] }] });
  });

  it("fence (synthetic): a supertype the arm does not read parks", () => {
    expect(parseEffectClause("Prevent the next 2 damage that would be dealt to target snow creature this turn.", "Land")?.confidence ?? "low").toBe("low");
  });
});

describe("in play", () => {
  it("is offered on legendary creatures only — both players' — never the Grizzly Bears", () => {
    expect(shieldOffers(table()).map((a) => a.targets[0].id).sort()).toEqual(["AISA", "ISA"]);
  });

  it("the shield turns a Lightning Bolt on Isamaru into 1 damage, and the 2/2 lives (WITNESS)", () => {
    let s = settle(dispatchAction(table(), shieldOffers(table()).find((a) => a.targets[0].id === "ISA")));
    const bolt = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ISA");
    s = settle(dispatchAction(s, bolt));
    const witness = { castleTapped: s.players.user.battlefield.find((p) => p.id === "CASTLE")?.tapped, isamaruAlive: s.players.user.battlefield.some((p) => p.id === "ISA"), damage: damageOn(s, "ISA") };
    console.log(`WITNESS eiganjoCastle ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ castleTapped: true, isamaruAlive: true, damage: 1 });
  });

  it("without the shield the same Bolt kills Isamaru (the control)", () => {
    let s = table();
    const bolt = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "bolt" && a.targets?.[0]?.id === "ISA");
    s = settle(dispatchAction(s, bolt));
    expect(s.players.user.battlefield.some((p) => p.id === "ISA")).toBe(false);
  });
});
