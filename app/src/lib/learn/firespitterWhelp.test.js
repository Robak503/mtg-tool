/**
 * firespitterWhelp.test.js — the DISJUNCTIVE cast filter (Veyran Cantrips shelf, 2026-10-17).
 *
 *   Firespitter Whelp: "Whenever you cast a noncreature or Dragon spell, this creature deals 1 damage to each opponent."
 *
 * THE SEAM: triggers.castSpellFilter read one filter word or an all-subtype list ("Aura, Equipment, or Vehicle"). A list
 * that mixes a quality with a subtype ("noncreature or Dragon") read as nothing, so the trigger was never detected and the
 * card parked. The list form "A or B" / "A, B, or C" now reads as `{ kind: "anyOf", filters }` when EVERY item is itself a
 * single cast filter the engine already enforces (a card type, noncreature, a colour, colorless, multicolored, historic, a
 * subtype); spellMatchesFilter matches a spell that satisfies ANY item (CR 205.2 — a spell's types; CR 702.73a — a
 * changeling spell is every creature type, so it is a Dragon spell). Any unknown item leaves the whole phrase unread.
 *
 * And a CREED fix found on the same function: "an instant spell" read as "instant or sorcery", so Lunar Mystic ("Whenever
 * you cast an instant spell, you may pay {1}. If you do, draw a card.") offered its draw on a SORCERY. "instant" and
 * "sorcery" are their own filters now.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, generated in-session 2026-10-17 — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkCastTriggers, detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FIRESPITTER_WHELP = {"name":"Firespitter Whelp","type":"Creature — Dragon","mana":"{2}{R}","cmc":3,"keywords":["Flying"],"colors":["R"],"power":"2","toughness":"2","oracle":"Flying\nWhenever you cast a noncreature or Dragon spell, this creature deals 1 damage to each opponent."};
const LUNAR_MYSTIC = {"name":"Lunar Mystic","type":"Creature — Human Wizard","mana":"{2}{U}{U}","cmc":4,"keywords":[],"colors":["U"],"power":"2","toughness":"2","oracle":"Whenever you cast an instant spell, you may pay {1}. If you do, draw a card."};
const THINK_TWICE = {"name":"Think Twice","type":"Instant","mana":"{1}{U}","cmc":2,"keywords":["Flashback"],"colors":["U"],"oracle":"Draw a card.\nFlashback {2}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const SHIVAN_DRAGON = {"name":"Shivan Dragon","type":"Creature — Dragon","mana":"{4}{R}{R}","cmc":6,"keywords":["Flying"],"colors":["R"],"power":"5","toughness":"5","oracle":"Flying\n{R}: This creature gets +1/+0 until end of turn."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"power":"2","toughness":"2","oracle":""};
const CHANGELING_OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","cmc":1,"keywords":["Changeling"],"colors":["B"],"power":"1","toughness":"1","oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked."};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

const library = (n) => Array.from({ length: n }, (_, i) => ({ ...ISLAND, id: `lib-${i}` }));

function board(watcher, hand) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: "watcher", card: { ...watcher, id: "watcher-card" }, controller: "user", summoningSick: false });
  return {
    ...s, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [perm], hand, library: library(10), manaPool: { W: 0, U: 10, B: 10, R: 10, G: 10, C: 0 } },
    },
  };
}

/** Cast `cardId` from hand through the real dispatcher, flush the cast triggers, resolve the whole stack. */
function castAndSettle(s0, cardId) {
  const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(act, `cast action for ${cardId}`).toBeTruthy();
  let s = flushTriggers(dispatchAction(s0, act), {});
  let guard = 0;
  while (s.stack.length && !s.pendingChoice && guard++ < 10) s = resolveTopOfStack(s);
  return s;
}
const oppLife = (s) => ["ai1", "ai2", "ai3"].map((id) => s.players[id].life);
const castFires = (watcher, spellCard) => {
  const s = board(watcher, []);
  return (checkCastTriggers(s, { spellCard, casterId: "user" }).pendingTriggers || []).length;
};

describe("the parse — one cast descriptor, a disjunction of two enforced filters", () => {
  it("Firespitter Whelp: noncreature OR the Dragon subtype", () => {
    const d = detectTriggers(FIRESPITTER_WHELP).filter((t) => t.event === "cast");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ whose: "you", spellFilter: { kind: "anyOf", filters: ["noncreature", "subtype:Dragon"] }, effectClause: "this creature deals 1 damage to each opponent" });
  });

  it("⛔ an unknown item leaves the whole phrase unread (a two-word item, a non-filter word)", () => {
    const probe = (phrase) => detectTriggers({ name: "Probe", type: "Enchantment", oracle: `Whenever you cast a ${phrase} spell, draw a card.` }).filter((t) => t.event === "cast");
    expect(probe("noncreature or nonland")).toHaveLength(0);          // "nonland" is no cast filter
    expect(probe("multicolored instant or sorcery")).toHaveLength(0); // a conjunction, not a list of single filters
    expect(probe("first instant or sorcery")).toHaveLength(0);
  });

  it("\"an instant spell\" is the instant filter alone; \"instant or sorcery\" is unchanged", () => {
    expect(detectTriggers(LUNAR_MYSTIC).find((t) => t.event === "cast").spellFilter).toBe("instant");
    const both = detectTriggers({ name: "Probe", type: "Enchantment", oracle: "Whenever you cast an instant or sorcery spell, draw a card." }).find((t) => t.event === "cast");
    expect(both.spellFilter).toBe("instantSorcery");
  });
});

describe("the filter on real casts (checkCastTriggers)", () => {
  it("⭐ fires on a noncreature spell, a Dragon creature spell and a changeling creature spell; not on a Bear", () => {
    expect({
      instant: castFires(FIRESPITTER_WHELP, THINK_TWICE),
      sorcery: castFires(FIRESPITTER_WHELP, DIVINATION),
      dragon: castFires(FIRESPITTER_WHELP, SHIVAN_DRAGON),
      changeling: castFires(FIRESPITTER_WHELP, CHANGELING_OUTCAST),
      bear: castFires(FIRESPITTER_WHELP, GRIZZLY_BEARS),
    }).toEqual({ instant: 1, sorcery: 1, dragon: 1, changeling: 1, bear: 0 });
  });

  it("⭐ Lunar Mystic's trigger fires on an instant and NOT on a sorcery", () => {
    expect({ instant: castFires(LUNAR_MYSTIC, THINK_TWICE), sorcery: castFires(LUNAR_MYSTIC, DIVINATION) }).toEqual({ instant: 1, sorcery: 0 });
  });
});

describe("runtime — the trigger resolves on the real stack", () => {
  it("⭐ casting Divination: each opponent takes 1 (40 → 39), the caster takes none; the spell still resolves (draw two)", () => {
    const s = castAndSettle(board(FIRESPITTER_WHELP, [{ ...DIVINATION, id: "div" }]), "div");
    expect(oppLife(s)).toEqual([39, 39, 39]);
    expect(s.players.user.life).toBe(40);
    expect(s.players.user.hand).toHaveLength(2);
  });

  it("⭐ casting Shivan Dragon (a Dragon creature spell): each opponent takes 1", () => {
    const s = castAndSettle(board(FIRESPITTER_WHELP, [{ ...SHIVAN_DRAGON, id: "shivan" }]), "shivan");
    expect(oppLife(s)).toEqual([39, 39, 39]);
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Shivan Dragon")).toBe(true);
  });

  it("control: casting Grizzly Bears (a non-Dragon creature spell) deals nothing", () => {
    const s = castAndSettle(board(FIRESPITTER_WHELP, [{ ...GRIZZLY_BEARS, id: "bears" }]), "bears");
    expect(oppLife(s)).toEqual([40, 40, 40]);
  });
});

// ── The twins — every other card the disjunctive list flipped (flip-diff 2026-10-17), each audited whole-card: the cast
//    trigger was the only unread line, and its effect was already modeled. ──
const APRIL_O_NEIL_HUMAN_ELEMENT = {"name":"April O'Neil, Human Element","type":"Legendary Creature — Human Detective","mana":"{3}{U}","cmc":4,"keywords":[],"colors":["U"],"power":"2","toughness":"5","oracle":"Whenever a player casts an artifact, instant, or sorcery spell, you create a Mutagen token. (It's an artifact with \"{1}, {T}, Sacrifice this token: Put a +1/+1 counter on target creature. Activate only as a sorcery.\")"};
const SNAKE_PIT = {"name":"Snake Pit","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"Whenever an opponent casts a blue or black spell, you may create a 1/1 green Snake creature token."};
const MOLD_ADDER = {"name":"Mold Adder","type":"Creature — Fungus Snake","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"power":"1","toughness":"1","oracle":"Whenever an opponent casts a blue or black spell, you may put a +1/+1 counter on this creature."};
const GOD_PHARAOH_S_FAITHFUL = {"name":"God-Pharaoh's Faithful","type":"Creature — Human Wizard","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"power":"0","toughness":"4","oracle":"Whenever you cast a blue, black, or red spell, you gain 1 life."};
const UMARA_WIZARD_UMARA_SKYFALLS = {"name":"Umara Wizard // Umara Skyfalls","type":"Creature — Merfolk Wizard // Land","mana":"{4}{U}","cmc":5,"keywords":[],"colors":[],"layout":"modal_dfc","power":"4","toughness":"3","oracle":"Umara Wizard - Creature — Merfolk Wizard {4}{U}\nWhenever you cast an instant, sorcery, or Wizard spell, this creature gains flying until end of turn.\n//\nUmara Skyfalls - Land \nThis land enters tapped.\n{T}: Add {U}."};
const WINDRIDER_WIZARD = {"name":"Windrider Wizard","type":"Creature — Human Wizard","mana":"{2}{U}","cmc":3,"keywords":["Flying"],"colors":["U"],"power":"2","toughness":"2","oracle":"Flying\nWhenever you cast an instant, sorcery, or Wizard spell, you may draw a card. If you do, discard a card."};
const ALELA_ARTFUL_PROVOCATEUR = {"name":"Alela, Artful Provocateur","type":"Legendary Creature — Faerie Warlock","mana":"{1}{W}{U}{B}","cmc":4,"keywords":["Deathtouch","Flying","Lifelink"],"colors":["B","U","W"],"power":"2","toughness":"3","oracle":"Flying, deathtouch, lifelink\nOther creatures you control with flying get +1/+0.\nWhenever you cast an artifact or enchantment spell, create a 1/1 blue Faerie creature token with flying."};
const ROCKSLIDE_SORCERER = {"name":"Rockslide Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"power":"3","toughness":"3","oracle":"Whenever you cast an instant, sorcery, or Wizard spell, this creature deals 1 damage to any target."};
const UMARA_MYSTIC = {"name":"Umara Mystic","type":"Creature — Merfolk Wizard","mana":"{1}{U}{R}","cmc":3,"keywords":["Flying"],"colors":["R","U"],"power":"1","toughness":"3","oracle":"Flying\nWhenever you cast an instant, sorcery, or Wizard spell, this creature gets +2/+0 until end of turn."};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const DURESS = {"name":"Duress","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Target opponent reveals their hand. You choose a noncreature, nonland card from it. That player discards that card."};

const firesFor = (watcher, spellCard, casterId) => {
  const s = board(watcher, []);
  return (checkCastTriggers(s, { spellCard, casterId }).pendingTriggers || []).length;
};

describe("the twins — the same list grammar, each fired on a matching cast and not on another", () => {
  const WIZARD_LIST = { kind: "anyOf", filters: ["instant", "sorcery", "subtype:Wizard"] };
  const cases = [
    { card: APRIL_O_NEIL_HUMAN_ELEMENT, filter: { kind: "anyOf", filters: ["artifact", "instant", "sorcery"] }, yes: [[SOL_RING, "ai2"], [THINK_TWICE, "user"]], no: [[GRIZZLY_BEARS, "ai1"]] },
    { card: SNAKE_PIT, filter: { kind: "anyOf", filters: ["color:U", "color:B"] }, yes: [[THINK_TWICE, "ai1"], [DURESS, "ai3"]], no: [[LIGHTNING_BOLT, "ai1"], [THINK_TWICE, "user"]] },
    { card: MOLD_ADDER, filter: { kind: "anyOf", filters: ["color:U", "color:B"] }, yes: [[DURESS, "ai1"]], no: [[GRIZZLY_BEARS, "ai1"], [DURESS, "user"]] },
    { card: GOD_PHARAOH_S_FAITHFUL, filter: { kind: "anyOf", filters: ["color:U", "color:B", "color:R"] }, yes: [[LIGHTNING_BOLT, "user"], [DURESS, "user"]], no: [[GRIZZLY_BEARS, "user"], [LIGHTNING_BOLT, "ai1"]] },
    { card: UMARA_WIZARD_UMARA_SKYFALLS, filter: WIZARD_LIST, yes: [[DIVINATION, "user"], [GOD_PHARAOH_S_FAITHFUL, "user"]], no: [[GRIZZLY_BEARS, "user"]] },
    { card: WINDRIDER_WIZARD, filter: WIZARD_LIST, yes: [[THINK_TWICE, "user"], [CHANGELING_OUTCAST, "user"]], no: [[SOL_RING, "user"]] },
    { card: ALELA_ARTFUL_PROVOCATEUR, filter: { kind: "anyOf", filters: ["artifact", "enchantment"] }, yes: [[SOL_RING, "user"], [SNAKE_PIT, "user"]], no: [[THINK_TWICE, "user"]] },
    { card: ROCKSLIDE_SORCERER, filter: WIZARD_LIST, yes: [[DIVINATION, "user"]], no: [[SHIVAN_DRAGON, "user"]] },
    { card: UMARA_MYSTIC, filter: WIZARD_LIST, yes: [[LIGHTNING_BOLT, "user"]], no: [[GRIZZLY_BEARS, "user"]] },
  ];
  for (const c of cases) {
    it(`${c.card.name}: native, the list filter, fires on ${c.yes.map(([sp, who]) => `${sp.name}/${who}`).join(", ")}, not on ${c.no.map(([sp, who]) => `${sp.name}/${who}`).join(", ")}`, () => {
      expect(classifyCard(c.card)).toMatch(/^native-/);
      expect(detectTriggers(c.card).find((t) => t.event === "cast")?.spellFilter).toEqual(c.filter);
      for (const [sp, who] of c.yes) expect(firesFor(c.card, sp, who), `${sp.name} by ${who}`).toBe(1);
      for (const [sp, who] of c.no) expect(firesFor(c.card, sp, who), `${sp.name} by ${who}`).toBe(0);
    });
  }

  it("⭐ runtime: an opponent casts Sol Ring under April O'Neil — April's controller creates a Mutagen token", () => {
    const s0 = board(APRIL_O_NEIL_HUMAN_ELEMENT, []);
    let s = flushTriggers(checkCastTriggers(s0, { spellCard: SOL_RING, casterId: "ai1" }), {});
    let guard = 0;
    while (s.stack.length && !s.pendingChoice && guard++ < 5) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Mutagen")).toHaveLength(1);
    expect(s.players.ai1.battlefield.filter((p) => p.card?.name === "Mutagen")).toHaveLength(0);
  });

  it("⭐ runtime: God-Pharaoh's Faithful gains 1 life when its controller casts a red spell", () => {
    const s0 = board(GOD_PHARAOH_S_FAITHFUL, []);
    let s = flushTriggers(checkCastTriggers(s0, { spellCard: LIGHTNING_BOLT, casterId: "user" }), {});
    let guard = 0;
    while (s.stack.length && !s.pendingChoice && guard++ < 5) s = resolveTopOfStack(s);
    expect(s.players.user.life).toBe(41);
  });
});

describe("classification", () => {
  it("Firespitter Whelp is native (flying + the routed cast trigger)", () => {
    expect(classifyCard(FIRESPITTER_WHELP)).toBe("native-trigger");
  });
  it("Lunar Mystic stays native-trigger (the narrower filter is a correction, not a park)", () => {
    expect(classifyCard(LUNAR_MYSTIC)).toBe("native-trigger");
  });
});
