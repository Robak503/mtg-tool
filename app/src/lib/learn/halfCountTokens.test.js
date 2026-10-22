/**
 * ENDLESS RANKS OF THE DEAD (EDHREC #2437) — "At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is
 * half the number of Zombies you control, rounded down."
 *
 * The counted creature-token arm with half its count, rounded as the card says (CR 107.1a — "If a spell or ability could generate a
 * fractional number, the spell or ability will tell you whether to round up or down."). The count is read as the trigger resolves
 * (CR 608.2h); a Changeling creature is a Zombie (CR 702.73a).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const ENDLESS_RANKS = {"name":"Endless Ranks of the Dead","type":"Enchantment","mana":"{2}{B}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down."};
const GHOULCALLERS_HARVEST = {"name":"Ghoulcaller's Harvest","type":"Sorcery","mana":"{B}{G}","cmc":2,"power":null,"toughness":null,"keywords":["Flashback"],"colors":["B","G"],"oracle":"Create X 2/2 black Zombie creature tokens with decayed, where X is half the number of creature cards in your graveyard, rounded up. (A creature with decayed can't block. When it attacks, sacrifice it at end of combat.)\nFlashback {3}{B}{G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"};
const GRAVEDIGGER = {"name":"Gravedigger","type":"Creature — Zombie","mana":"{3}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"When this creature enters, you may return target creature card from your graveyard to your hand."};
const CHANGELING_OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function upkeep(user, ai1 = []) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [P("ranks", ENDLESS_RANKS), ...user] }, ai1: { ...s0.players.ai1, battlefield: ai1 } } };
  let out = runStepActions(s);
  while (out.stack.length) out = resolveTopOfStack(out);
  return out.players.user.battlefield.filter((p) => p.card?.token).map((p) => `${p.card.name} ${p.card.power}/${p.card.toughness} ${(p.card.colors || []).join("")}`);
}
const zombies = (n) => Array.from({ length: n }, (_, i) => P(`z${i}`, GRAVEDIGGER));

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(ENDLESS_RANKS)).toBe("native-trigger");
  });
  it("⭐ the atom: the Zombie count, halved and rounded down", () => {
    expect(parseEffectClause("create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control, rounded down", "Enchantment")?.atoms)
      .toEqual([{ op: "create-token", power: 2, toughness: 2, descriptor: "black zombie", countFor: { kind: "permanentsYouControl", subtype: "Zombie" }, halve: "floor", targetType: null }]);
  });
  it("CONTROL — a half with no rounding stated stays unread; Ghoulcaller's Harvest (decayed) stays parked", () => {
    expect({
      noRounding: parseEffectClause("create X 2/2 black Zombie creature tokens, where X is half the number of Zombies you control", "Enchantment")?.atoms || [],
      harvest: classifyCard(GHOULCALLERS_HARVEST),
    }).toEqual({ noRounding: [], harvest: "arbiter-spell" });
  });
});

describe("the upkeep", () => {
  it("⭐ five Zombies make two (2.5 rounded down); the new tokens are 2/2 black Zombies", () => {
    expect(upkeep(zombies(5))).toEqual(["Zombie 2/2 B", "Zombie 2/2 B"]);
  });
  it("⭐ one Zombie makes none; a Changeling counts as a Zombie; an opponent's Zombies and a Bears do not count", () => {
    expect({
      one: upkeep(zombies(1)).length,
      withChangeling: upkeep([...zombies(3), P("outcast", CHANGELING_OUTCAST), P("bear", GRIZZLY_BEARS)]).length,
      opponents: upkeep(zombies(1), [P("oz1", GRAVEDIGGER, "ai1"), P("oz2", GRAVEDIGGER, "ai1"), P("oz3", GRAVEDIGGER, "ai1")]).length,
    }).toEqual({ one: 0, withChangeling: 2, opponents: 0 });
  });
});
