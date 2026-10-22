/**
 * THE DEVOTION CDA — "<this creature>'s toughness | power is equal to your devotion to <colour>."
 *
 *   Daxos, Blessed by the Sun (EDHREC #1758) — "Daxos's toughness is equal to your devotion to white. / Whenever another creature you
 *   control enters or dies, you gain 1 life." Renata, Called to the Hunt — power, devotion to green.
 *
 * A characteristic-defining ability (CR 604.3) that sets one stat in layer 7a (CR 613.4a); the other keeps its printed value.
 * Devotion (CR 700.5): the mana symbols of that colour among the mana costs of the permanents its controller controls — the
 * creature's own cost included, a hybrid symbol counting toward each of its colours, an opponent's permanents never. Read on every
 * P/T computation, so it follows the board both ways.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

const DAXOS = {"name":"Daxos, Blessed by the Sun","type":"Legendary Enchantment Creature — Demigod","mana":"{W}{W}","cmc":2,"power":"2","toughness":"*","keywords":[],"colors":["W"],"oracle":"Daxos's toughness is equal to your devotion to white. (Each {W} in the mana costs of permanents you control counts toward your devotion to white.)\nWhenever another creature you control enters or dies, you gain 1 life."};
const RENATA = {"name":"Renata, Called to the Hunt","type":"Legendary Enchantment Creature — Demigod","mana":"{2}{G}{G}","cmc":4,"power":"*","toughness":"3","keywords":[],"colors":["G"],"oracle":"Renata's power is equal to your devotion to green. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nEach other creature you control enters with an additional +1/+1 counter on it."};
const TYMARET = {"name":"Tymaret, Chosen from Death","type":"Legendary Enchantment Creature — Demigod","mana":"{B}{B}","cmc":2,"power":"2","toughness":"*","keywords":[],"colors":["B"],"oracle":"Tymaret's toughness is equal to your devotion to black. (Each {B} in the mana costs of permanents you control counts toward your devotion to black.)\n{1}{B}: Exile up to two target cards from graveyards. You gain 1 life for each creature card exiled this way."};
const SERRA_ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","cmc":5,"power":"4","toughness":"4","keywords":["Flying","Vigilance"],"colors":["W"],"oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)"};
const KITCHEN_FINKS = {"name":"Kitchen Finks","type":"Creature — Ouphe","mana":"{1}{G/W}{G/W}","cmc":3,"power":"3","toughness":"2","keywords":["Persist"],"colors":["G","W"],"oracle":"When this creature enters, you gain 2 life.\nPersist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)"};
const SAVANNAH_LIONS = {"name":"Savannah Lions","type":"Creature — Cat","mana":"{W}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["W"],"oracle":""};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board({ user = [], ai1 = [] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: user }, ai1: { ...s0.players.ai1, battlefield: ai1 } } };
}
const pt = (s, id) => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;

describe("the reader", () => {
  it("⭐ the cards play their whole text", () => {
    expect({ daxos: classifyCard(DAXOS), renata: classifyCard(RENATA) }).toEqual({ daxos: "native-mixed", renata: "native-static" });
  });
  it("CONTROL — a devotion CDA beside text the engine can't read keeps the card parked (Tymaret)", () => {
    expect(classifyCard(TYMARET)).toBe("body-only");
  });
});

describe("the board", () => {
  it("⭐ Daxos alone: its own {W}{W} — a 2/2", () => {
    expect(pt(board({ user: [P("dx", DAXOS, "user")] }), "dx")).toBe("2/2");
  });

  it("⭐ every white symbol among its controller's permanents, a hybrid symbol included; an opponent's never; power stays printed", () => {
    const s = board({ user: [P("dx", DAXOS, "user"), P("angel", SERRA_ANGEL, "user"), P("finks", KITCHEN_FINKS, "user")], ai1: [P("lions", SAVANNAH_LIONS, "ai1"), P("angel2", SERRA_ANGEL, "ai1")] });
    expect(pt(s, "dx")).toBe("2/6"); // {W}{W} + {W}{W} + {G/W}{G/W}
  });

  it("⭐ it follows the board both ways: the Angel leaves, the toughness falls back", () => {
    const s1 = board({ user: [P("dx", DAXOS, "user"), P("angel", SERRA_ANGEL, "user")] });
    const before = pt(s1, "dx");
    const s2 = moveCardToZone(s1, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "angel" });
    expect({ before, after: pt(s2, "dx") }).toEqual({ before: "2/4", after: "2/2" });
  });

  it("⭐ Renata: power = devotion to green (its own {G}{G} plus the Elves' {G}); its other line puts the extra counter on another creature entering", () => {
    let s = board({ user: [P("ren", RENATA, "user"), P("elf", LLANOWAR_ELVES, "user")] });
    const before = pt(s, "ren");
    s = enterPermanent(s, { ...SAVANNAH_LIONS, id: "c-lions" }, "user");
    const lions = s.players.user.battlefield.find((p) => p.card?.id === "c-lions");
    expect({ before, lionsCounters: lions?.counters?.["+1/+1"] || 0, lions: pt(s, lions.id) }).toEqual({ before: "3/3", lionsCounters: 1, lions: "3/2" });
  });
});
