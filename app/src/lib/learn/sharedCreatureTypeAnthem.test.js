/**
 * COAT OF ARMS (EDHREC #953) — "Each creature gets +1/+1 for each other creature on the battlefield that shares at least one
 * creature type with it. (For example, if two Goblin Warriors and a Goblin Shaman are on the battlefield, each gets +2/+2.)"
 *
 * A layer-7c P/T modification (CR 613.4c) for every creature on the battlefield, its size read per AFFECTED creature, live: the
 * other creatures — any player's — with at least one creature type in common with it (CR 205.3m), a changeling being every creature
 * type (CR 702.73a). The bundled rulings: a creature with two types counts every creature with either of them; one matching type is
 * enough; sharing several gives no more — it counts creatures, not types.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

const COAT = {"name":"Coat of Arms","type":"Artifact","mana":"{5}","cmc":5,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Each creature gets +1/+1 for each other creature on the battlefield that shares at least one creature type with it. (For example, if two Goblin Warriors and a Goblin Shaman are on the battlefield, each gets +2/+2.)"};
const PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""};
const RAGING_GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"};
const OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const STONEFORGE_MASTERWORK = {"name":"Stoneforge Masterwork","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+1 for each other creature you control that shares a creature type with it.\nEquip {2}"};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board({ user = [], ai = [], coat = true } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [...(coat ? [P("coat", COAT, "user")] : []), ...user] },
      ai: { ...s0.players.ai, battlefield: ai } } };
}
const pt = (s, id) => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(COAT))).toBe(true);
  });
  it("CONTROL — Stoneforge Masterwork's \"you control\" count on an Equipment is a different reader and stays parked", () => {
    expect(isNativeTier(classifyCard(STONEFORGE_MASTERWORK))).toBe(false);
  });
});

describe("the game", () => {
  it("⭐ the reminder's example: two Goblin Warriors and a third Goblin each get +2/+2", () => {
    const s = board({ user: [P("p1", PIKER, "user"), P("p2", PIKER, "user")], ai: [P("rg", RAGING_GOBLIN, "ai")] });
    expect([pt(s, "p1"), pt(s, "p2"), pt(s, "rg")]).toEqual(["4/3", "4/3", "3/3"]);
  });
  it("⭐ its ruling — sharing two types gives no more: two Goblin Warriors each get +1/+1, not +2/+2", () => {
    const s = board({ user: [P("p1", PIKER, "user"), P("p2", PIKER, "user")] });
    expect([pt(s, "p1"), pt(s, "p2")]).toEqual(["3/2", "3/2"]);
  });
  it("⭐ a changeling shares a type with every creature that has one; a creature sharing none gets nothing", () => {
    const s = board({ user: [P("p1", PIKER, "user"), P("elf", ELVES, "user"), P("cl", OUTCAST, "user"), P("thop", ORNITHOPTER, "ai")] });
    expect({ piker: pt(s, "p1"), elf: pt(s, "elf"), changeling: pt(s, "cl"), thopter: pt(s, "thop") })
      .toEqual({ piker: "3/2", elf: "2/2", changeling: "4/4", thopter: "1/3" });
  });
  it("CONTROL — without Coat of Arms every creature is its printed size", () => {
    const s = board({ coat: false, user: [P("p1", PIKER, "user"), P("p2", PIKER, "user")], ai: [P("rg", RAGING_GOBLIN, "ai")] });
    expect([pt(s, "p1"), pt(s, "p2"), pt(s, "rg")]).toEqual(["2/1", "2/1", "1/1"]);
  });
});

// ── A TYPE CHANGE (the integrator's review, 2026-11-01): the count reads the creature types each creature has NOW, after layer 4
// (CR 613.1d, 205.1a — "becomes the creature type of your choice" replaces its creature types). Mistform Dreamer's own ability
// resolved with Goblins out: it becomes a Goblin, no longer an Illusion.
describe("the count after a type change", () => {
  const MISTFORM = {"name":"Mistform Dreamer","type":"Creature — Illusion","mana":"{2}{U}","cmc":3,"power":"2","toughness":"1","keywords":["Flying"],"colors":["U"],"oracle":"Flying\n{1}: This creature becomes the creature type of your choice until end of turn."};
  const becomeAtom = parseEffectClause("this creature becomes the creature type of your choice until end of turn", "Creature").atoms[0];
  const become = (s) => resolveAtom(s, becomeAtom, { controller: "user", cardName: "Mistform Dreamer", sourceId: "mf", targets: [] });
  it("⭐ before: an Illusion shares nothing with two Goblin Warriors (2/1; the Warriors +1/+1 each); after it becomes a Goblin, each of the three gets +2/+2", () => {
    const s = board({ user: [P("mf", MISTFORM, "user"), P("p1", PIKER, "user"), P("p2", PIKER, "user")] });
    const t = become(s);
    expect({ before: [pt(s, "mf"), pt(s, "p1")], after: [pt(t, "mf"), pt(t, "p1"), pt(t, "p2")] })
      .toEqual({ before: ["2/1", "3/2"], after: ["4/3", "4/3", "4/3"] });
  });
  it("⭐ \"becomes\" replaces: once a Goblin, it no longer shares the Illusion type with another Illusion", () => {
    const ILLUSION = { ...MISTFORM, name: "Mistform Dreamer" };
    const s = board({ user: [P("mf", MISTFORM, "user"), P("p1", PIKER, "user")], ai: [P("il", ILLUSION, "ai")] });
    const t = become(s);
    expect({ before: [pt(s, "mf"), pt(s, "il")], after: [pt(t, "mf"), pt(t, "il"), pt(t, "p1")] })
      .toEqual({ before: ["3/2", "3/2"], after: ["3/2", "2/1", "3/2"] });
  });
});
