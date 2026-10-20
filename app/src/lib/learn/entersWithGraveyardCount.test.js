/**
 * "THIS CREATURE ENTERS WITH A +1/+1 COUNTER ON IT FOR EACH <creature | creature type> CARD IN YOUR GRAVEYARD" — the metric
 * enters-with replacement (CR 614.1c, 122.6) counting its controller's graveyard as the permanent enters:
 *   · Diregraf Colossus (EDHREC #2118) — "… for each Zombie card in your graveyard." A Zombie card is a card with that creature type
 *     — a changeling card is every creature type in every zone (CR 702.73a).
 *   · Golgari Grave-Troll (#2784), Golgari Raiders (#21984) — "… for each creature card in your graveyard."
 * The count is read as the creature enters, from the graveyard as it is before the entry (CR 614.12): a spell entering from the stack
 * is in no graveyard, and the bundled rulings — Grave-Troll: "If you return Golgari Grave-Troll from your graveyard directly to the
 * battlefield, its first ability counts itself."; Diregraf Colossus: "If Diregraf Colossus enters the battlefield from your graveyard,
 * its first ability will count itself among the Zombie cards in your graveyard."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests, creaturePower, creatureToughness } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { entersWithMetricCounters } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const DIREGRAF_COLOSSUS = {"name":"Diregraf Colossus","type":"Creature — Zombie Giant","mana":"{2}{B}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"This creature enters with a +1/+1 counter on it for each Zombie card in your graveyard.\nWhenever you cast a Zombie spell, create a tapped 2/2 black Zombie creature token."}; // body-only on 55eb7d63
const GOLGARI_GRAVE_TROLL = {"name":"Golgari Grave-Troll","type":"Creature — Troll Skeleton","mana":"{4}{G}","cmc":5,"power":"0","toughness":"0","keywords":["Dredge","Regenerate","Mill"],"colors":["G"],"oracle":"This creature enters with a +1/+1 counter on it for each creature card in your graveyard.\n{1}, Remove a +1/+1 counter from this creature: Regenerate this creature.\nDredge 6 (If you would draw a card, you may mill six cards instead. If you do, return this card from your graveyard to your hand.)"}; // body-only on 55eb7d63
const GOLGARI_RAIDERS = {"name":"Golgari Raiders","type":"Creature — Elf Warrior","mana":"{3}{G}","cmc":4,"power":"0","toughness":"0","keywords":["Haste","Undergrowth"],"colors":["G"],"oracle":"Haste\nUndergrowth — This creature enters with a +1/+1 counter on it for each creature card in your graveyard."}; // body-only on 55eb7d63
const GRAVECRAWLER = {"name":"Gravecrawler","type":"Creature — Zombie","mana":"{B}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie."};
const CHANGELING_OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const ZOMBIFY = {"name":"Zombify","type":"Sorcery","mana":"{3}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Return target creature card from your graveyard to the battlefield."};

const G = (id, card) => ({ ...card, id });
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
function board({ hand = [], graveyard = [], mana = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand, graveyard, battlefield: [], library: [0, 1, 2].map((i) => G(`lib${i}`, GRIZZLY_BEARS)), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } } } };
}
/** Cast the hand card `cardId` (the first offered cast with `pick`) and resolve everything. */
function cast(s, cardId, pick = () => true) {
  const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId).find(pick);
  expect(act, `a cast of ${cardId} is offered`).toBeTruthy();
  return settle(dispatchAction(s, act));
}
const entered = (s, name) => {
  const p = s.players.user.battlefield.find((x) => x.card?.name === name);
  return p ? { counters: p.counters?.["+1/+1"] ?? 0, pt: `${creaturePower(p, s)}/${creatureToughness(p, s)}` } : null;
};

describe("the reader", () => {
  it("⭐ the three play their whole text", () => {
    expect({ colossus: classifyCard(DIREGRAF_COLOSSUS), troll: classifyCard(GOLGARI_GRAVE_TROLL), raiders: classifyCard(GOLGARI_RAIDERS) })
      .toEqual({ colossus: "native-trigger", troll: "native-activated", raiders: "native-body" });
  });
  it("⭐ the descriptor: one counter per graveyard card of the kind; an opponent's or every graveyard stays unread", () => {
    const read = (oracle) => entersWithMetricCounters({ name: "x", type: "Creature — Zombie", oracle });
    expect({
      zombie: read("This creature enters with a +1/+1 counter on it for each Zombie card in your graveyard."),
      creature: read("This creature enters with a +1/+1 counter on it for each creature card in your graveyard."),
      anyGraveyard: read("This creature enters with a +1/+1 counter on it for each creature card in all graveyards."),
      notAType: read("This creature enters with a +1/+1 counter on it for each Swampy card in your graveyard."),
    }).toEqual({
      zombie: { fixed: 0, perUnit: 1, metric: { kind: "cardsInGraveyard", subtype: "Zombie" } },
      creature: { fixed: 0, perUnit: 1, metric: { kind: "cardsInGraveyard", cardType: "creature" } },
      anyGraveyard: null,
      notAType: null,
    });
  });
});

describe("cast from the hand", () => {
  it("⭐ Diregraf Colossus: two Zombie cards and a changeling card count (3); the Bears, the Bolt and the Swamp do not", () => {
    const s = cast(board({ hand: [G("h-col", DIREGRAF_COLOSSUS)], mana: { B: 1, C: 2 },
      graveyard: [G("gy-z1", GRAVECRAWLER), G("gy-z2", GRAVECRAWLER), G("gy-ch", CHANGELING_OUTCAST), G("gy-bears", GRIZZLY_BEARS), G("gy-bolt", LIGHTNING_BOLT), G("gy-sw", SWAMP)] }), "h-col");
    expect(entered(s, "Diregraf Colossus")).toEqual({ counters: 3, pt: "5/5" });
  });

  it("⭐ Golgari Grave-Troll: every creature card counts (3), never an instant or a land", () => {
    const s = cast(board({ hand: [G("h-troll", GOLGARI_GRAVE_TROLL)], mana: { G: 1, C: 4 },
      graveyard: [G("gy-z1", GRAVECRAWLER), G("gy-ch", CHANGELING_OUTCAST), G("gy-bears", GRIZZLY_BEARS), G("gy-bolt", LIGHTNING_BOLT), G("gy-sw", SWAMP)] }), "h-troll");
    expect(entered(s, "Golgari Grave-Troll")).toEqual({ counters: 3, pt: "3/3" });
  });

  it("⭐ an empty graveyard: Grave-Troll enters with none and dies a 0/0 (CR 704.5f)", () => {
    const s = cast(board({ hand: [G("h-troll", GOLGARI_GRAVE_TROLL)], mana: { G: 1, C: 4 } }), "h-troll");
    expect({ onBattlefield: entered(s, "Golgari Grave-Troll"), graveyard: s.players.user.graveyard.map((c) => c.name) }).toEqual({ onBattlefield: null, graveyard: ["Golgari Grave-Troll"] });
  });

  it("⭐ Golgari Raiders (undergrowth): two creature cards, two counters", () => {
    const s = cast(board({ hand: [G("h-raid", GOLGARI_RAIDERS)], mana: { G: 1, C: 3 }, graveyard: [G("gy-bears", GRIZZLY_BEARS), G("gy-z1", GRAVECRAWLER), G("gy-bolt", LIGHTNING_BOLT)] }), "h-raid");
    expect(entered(s, "Golgari Raiders")).toEqual({ counters: 2, pt: "2/2" });
  });
});

describe("the rulings — returned from the graveyard, it counts itself", () => {
  it("⭐ Zombify on Golgari Grave-Troll beside one other creature card: two counters", () => {
    const s = cast(board({ hand: [G("h-zom", ZOMBIFY)], mana: { B: 1, C: 3 }, graveyard: [G("gy-troll", GOLGARI_GRAVE_TROLL), G("gy-bears", GRIZZLY_BEARS), G("gy-bolt", LIGHTNING_BOLT)] }),
      "h-zom", (a) => (a.targets || []).some((t) => t.id === "gy-troll"));
    expect(entered(s, "Golgari Grave-Troll")).toEqual({ counters: 2, pt: "2/2" });
  });

  it("⭐ Zombify on Diregraf Colossus beside a Gravecrawler: two counters", () => {
    const s = cast(board({ hand: [G("h-zom", ZOMBIFY)], mana: { B: 1, C: 3 }, graveyard: [G("gy-col", DIREGRAF_COLOSSUS), G("gy-z1", GRAVECRAWLER)] }),
      "h-zom", (a) => (a.targets || []).some((t) => t.id === "gy-col"));
    expect(entered(s, "Diregraf Colossus")).toEqual({ counters: 2, pt: "4/4" });
  });
});
