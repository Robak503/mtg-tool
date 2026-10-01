/**
 * feedTheSwarm.test.js — Feed the Swarm (the play-weighted program, 2026-10-01: EDHREC rank #89).
 *
 *   "Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent's mana value."
 *
 * The destroy already read; the rider is the losing twin of "You gain life equal to its mana value" (Divine Offering):
 * the same capture of the target before it leaves, and the CASTER loses (life loss — CR 119.3 — not damage). Like every
 * rider of its family it resolves even when the destroy fails: an indestructible target (CR 702.12b) keeps its mana value.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FEED = { name: "Feed the Swarm", type: "Sorcery", mana: "{1}{B}", colors: ["B"], keywords: [],
  oracle: "Destroy target creature or enchantment an opponent controls. You lose life equal to that permanent's mana value." };
// `cmc` and `colors` as the card index carries them — the rider's capture reads the printed mana value off `cmc`.
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const MYR = { name: "Darksteel Myr", type: "Artifact Creature — Myr", mana: "{3}", cmc: 3, colors: [], power: "0", toughness: "1", keywords: ["Indestructible"],
  oracle: "Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)" };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function table({ user = [], ai = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, life: 40, battlefield: user, hand: [{ ...FEED, id: "feed" }], manaPool: { ...g.players.user.manaPool, B: 2 } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
/** Cast Feed the Swarm at `targetId` through the real offer and settle; a logged resolver crash fails loudly. */
function feed(s, targetId) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "feed" && a.targets?.[0]?.id === targetId);
  if (!cast) throw new Error(`Feed the Swarm at ${targetId} is not offered`);
  let n = dispatchAction(s, cast), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}

describe("the card", () => {
  it("reads native; the destroy carries the caster's life-loss rider on the target's mana value", () => {
    expect({ tier: classifyCard(FEED), atoms: parseEffectClause(FEED.oracle, "Sorcery").atoms }).toEqual({ tier: "native-spell",
      atoms: [{ op: "destroy", targetType: "creatureOrEnchantment", restrictions: [{ kind: "controller", who: "opponent" }], controllerRider: { kind: "casterLoseLife", metric: "mv" } }] });
  });

  it("fence (synthetic): the gaining form keeps its own referents — \"that permanent's\" stays unread there", () => {
    expect(parseEffectClause("Destroy target artifact. You gain life equal to that permanent's mana value.", "Sorcery")?.confidence ?? "low").toBe("low");
  });
});

describe("in play", () => {
  it("the AI's Grizzly Bears is destroyed and you lose 2 (WITNESS)", () => {
    const s = feed(table({ ai: [perm("BEAR", BEARS, "ai")] }), "BEAR");
    const witness = { bearAlive: !!findPermanent(s, "BEAR"), aiGraveyard: s.players.ai.graveyard.map((c) => c.name), userLife: s.players.user.life };
    console.log(`WITNESS feedTheSwarm ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ bearAlive: false, aiGraveyard: ["Grizzly Bears"], userLife: 38 });
  });

  it("an enchantment counts too: the AI's Pacifism on your Bear goes, and you lose 2", () => {
    const s = feed(table({ user: [perm("MINE", BEARS, "user", { attachments: ["PAC"] })], ai: [perm("PAC", PACIFISM, "ai", { attachedTo: "MINE" })] }), "PAC");
    expect({ pacifism: !!findPermanent(s, "PAC"), userLife: s.players.user.life }).toEqual({ pacifism: false, userLife: 38 });
  });

  it("an indestructible target survives, and you still lose its mana value: Darksteel Myr (power 0, mana value 3)", () => {
    const s = feed(table({ ai: [perm("MYR", MYR, "ai")] }), "MYR");
    expect({ myrAlive: !!findPermanent(s, "MYR"), userLife: s.players.user.life }).toEqual({ myrAlive: true, userLife: 37 });
  });
});
