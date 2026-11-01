/**
 * POLLYWOG PRODIGY (EDHREC #1203) — "Evolve (…) / Whenever an opponent casts a noncreature spell with mana value less than this
 * creature's power, draw a card."
 *
 * The opponent's cast event with a noncreature filter and a mana-value bound read off the WATCHER: the cast spell's mana value on
 * the stack (CR 202.3 — X is the announced number) against the creature's power as the spell is cast (the trigger event, CR 603.2;
 * no intervening "if", so nothing is re-checked on resolution). The bundled rulings: the ability resolves before the spell, even if
 * the spell is countered; once it has triggered, lowering the power or removing the creature doesn't stop it.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkCastTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const POLLYWOG = {"name":"Pollywog Prodigy","type":"Creature — Frog Wizard","mana":"{1}{U}","cmc":2,"power":"1","toughness":"3","keywords":["Evolve"],"colors":["U"],"oracle":"Evolve (Whenever a creature you control enters, if that creature has greater power or toughness than this creature, put a +1/+1 counter on this creature.)\nWhenever an opponent casts a noncreature spell with mana value less than this creature's power, draw a card."};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1.\nDraw a card."};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":[],"oracle":""};
const MOX_AMBER = {"name":"Mox Amber","type":"Legendary Artifact","mana":"{0}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add one mana of any color among legendary creatures and planeswalkers you control."};
const BLAZE = {"name":"Blaze","type":"Sorcery","mana":"{X}{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Blaze deals X damage to any target."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const lib = (pid) => Array.from({ length: 8 }, (_, i) => ({ ...BEARS, id: `L-${pid}-${i}` }));
/** The user's Pollywog with `counters` +1/+1 counters (power 1 + counters); `casterId` casts `spell` (X = `x`). Returns the user's draws. */
function castBy(casterId, spell, { counters = 0, x = 0 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const frog = createPermanent({ id: "frog", card: { ...POLLYWOG, id: "c-frog" }, controller: "user", summoningSick: false });
  const withCounters = counters ? { ...frog, counters: { ...(frog.counters || {}), "+1/+1": counters } } : frog;
  const players = { ...s0.players,
    user: { ...s0.players.user, battlefield: [withCounters], hand: [], library: lib("user") },
    ai: { ...s0.players.ai, battlefield: [], hand: [], library: lib("ai") } };
  let s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: casterId, priorityHolder: casterId, stack: [], pendingTriggers: [] };
  s = checkCastTriggers(s, { spellCard: { ...spell, id: `cast-${spell.name}` }, casterId, xValue: x });
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let g = 0; g < 10 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s.players.user.hand.length;
}

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(isNativeTier(classifyCard(POLLYWOG))).toBe(true);
  });
  it("⭐ the watcher: an opponent's noncreature spell, its mana value against the creature's power", () => {
    const d = detectTriggers(POLLYWOG).find((x) => x.event === "cast");
    expect(d && { whose: d.whose, routes: triggerRoutesNatively(d) }).toEqual({ whose: "opponent", routes: true });
  });
});

describe("the game", () => {
  it("⭐ power 2 (one counter): an opponent's Opt (mana value 1) draws a card", () => {
    expect(castBy("ai", OPT, { counters: 1 })).toBe(1);
  });
  it("⭐ the bound is strict: power 1 and an opponent's Opt (mana value 1) draws nothing; power 4 and Divination (3) draws one", () => {
    expect({ equal: castBy("ai", OPT), below: castBy("ai", DIVINATION, { counters: 3 }) }).toEqual({ equal: 0, below: 1 });
  });
  it("⭐ mana value 0 under power 1: an opponent's Mox Amber draws a card", () => {
    expect(castBy("ai", MOX_AMBER)).toBe(1);
  });
  it("⭐ X counts on the stack (CR 202.3): power 3 and Blaze with X = 1 (mana value 2) draws; with X = 2 (mana value 3), nothing", () => {
    expect({ x1: castBy("ai", BLAZE, { counters: 2, x: 1 }), x2: castBy("ai", BLAZE, { counters: 2, x: 2 }) }).toEqual({ x1: 1, x2: 0 });
  });
  it("CONTROL — a creature spell (Ornithopter, Memnite) never triggers it, and its controller's own Opt doesn't either", () => {
    expect({ thopter: castBy("ai", ORNITHOPTER, { counters: 3 }), memnite: castBy("ai", MEMNITE, { counters: 3 }), own: castBy("user", OPT, { counters: 3 }) })
      .toEqual({ thopter: 0, memnite: 0, own: 0 });
  });
});
