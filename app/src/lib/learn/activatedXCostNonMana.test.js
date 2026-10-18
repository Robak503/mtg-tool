/**
 * activatedXCostNonMana.test.js — the {X} activation lane pays the WHOLE cost (2026-10-17).
 *
 * An activated ability's cost is paid in full before it goes on the stack (CR 602.2b applies 601.2b–i to activations; CR 601.2h —
 * partial payments are not allowed, unpayable costs can't be paid; CR 118.3 — no resources, no payment). The value of an {X} in
 * an activation cost is chosen as the ability is activated (CR 107.3a); choosing X changes the mana owed, never the rest of the cost.
 *
 * Before this slice the {X} lane in legalChoices built its own actions and carried only the costs it knew (life, energy, the
 * self-sacrifice / self-exile / counter items, the discards): a "Sacrifice another creature" or "Sacrifice a Clue" rode as
 * `sacCreatureId: null`, so Fiend Artisan was offered with no other creature on the battlefield and activated without a victim,
 * and Alquist Proft, Master Sleuth drew X and gained X without a Clue. The tap-others, counted-sacrifice, return-a-land and
 * unattach costs were dropped the same way, and the exile-from-graveyard cost refused the whole ability. The lane now rides the
 * non-X lane's victim enumeration, per-victim affordability and action, one action per (victim, X).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17). The "probe" cards are NOT real cards: no bundled card
 * prints a tap-others, counted-sacrifice, return-a-land, exile-from-graveyard or unattach cost beside an {X} with a modeled effect
 * (the corpus scan in the RUN-LEDGER entry), so each of those shapes is pinned on a minimal probe text.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { NAMED_TOKENS } from "./effects/atoms/tokens.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const FIEND_ARTISAN = {"name":"Fiend Artisan","type":"Creature — Nightmare","mana":"{B/G}{B/G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["B","G"],"oracle":"This creature gets +1/+1 for each creature card in your graveyard.\n{X}{B/G}, {T}, Sacrifice another creature: Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle. Activate only as a sorcery."};
const ALQUIST = {"name":"Alquist Proft, Master Sleuth","type":"Legendary Creature — Human Detective","mana":"{1}{W}{U}","cmc":3,"power":"3","toughness":"3","keywords":["Investigate","Vigilance"],"colors":["U","W"],"oracle":"Vigilance\nWhen Alquist Proft enters, investigate. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")\n{X}{W}{U}{U}, {T}, Sacrifice a Clue: You draw X cards and gain X life."};
const ORACLE_OF_NECTARS = {"name":"Oracle of Nectars","type":"Creature — Elf Cleric","mana":"{2}{G/W}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["G","W"],"oracle":"{X}, {T}: You gain X life."};
const VISCERA_SEER = {"name":"Viscera Seer","type":"Creature — Vampire Wizard","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Scry"],"colors":["B"],"oracle":"Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)"};
const CACKLING_WITCH = {"name":"Cackling Witch","type":"Creature — Human Spellshaper","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"{X}{B}, {T}, Discard a card: Target creature gets +X/+0 until end of turn."};
const PHYREXIAN_ALTAR = {"name":"Phyrexian Altar","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Sacrifice a creature: Add one mana of any color."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const BELOVED_CHAPLAIN = {"name":"Beloved Chaplain","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"colors":["W"],"oracle":"Protection from creatures"};
const SPAWN = {"name":"Eldrazi Spawn","type":"Token Creature — Eldrazi Spawn","mana":"","cmc":0,"power":"0","toughness":"1","keywords":[],"colors":[],"oracle":"Sacrifice this creature: Add {C}.","token":true};
const PRODIGAL_PYROMANCER ={"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
// The engine's own Clue (investigate creates exactly this token).
const CLUE = { ...NAMED_TOKENS.clue, token: true };

// ── probe texts (NOT real cards — see the header) ──
const probe = (name, type, oracle) => ({ name, type, mana: "{3}", cmc: 3, keywords: [], colors: [], oracle });
const TAP_PROBE = probe("Probe Tapping Engine", "Artifact", "{X}, Tap an untapped creature you control: You gain X life.");
const SAC_TWO_PROBE = probe("Probe Twin Altar", "Artifact", "{X}, Sacrifice two creatures: You gain X life.");
const RETURN_PROBE = probe("Probe Tide Engine", "Artifact", "{X}, Return a land you control to its owner's hand: You gain X life.");
const EXILE_GY_PROBE = probe("Probe Crypt Engine", "Artifact", "{X}, Exile a card from your graveyard: You gain X life.");
const UNATTACH_PROBE = { ...probe("Probe Knight", "Creature — Human Knight", "{X}, Unattach an Equipment from Probe Knight: You gain X life."), power: "2", toughness: "2" };
const LIFE_PROBE = probe("Probe Blood Engine", "Artifact", "{X}, Pay 2 life: You gain X life.");
const COUNTER_PROBE = probe("Probe Charge Engine", "Artifact", "{X}, Remove a charge counter from this artifact: You gain X life.");
const EQUIPMENT = { name: "Probe Blade", type: "Artifact — Equipment", mana: "{1}", cmc: 1, keywords: [], colors: [], oracle: "Equip {1}" };

const P = (id, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...over });

function table(battlefield, { hand = [], graveyard = [], library = [], life = 20 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield, hand, graveyard, library, life };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [] };
}
const offers = (s, permId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const onField = (s, id) => s.players.user.battlefield.some((p) => p.id === id);
const inGraveyard = (s, name) => s.players.user.graveyard.some((c) => c.name === name);
const pairs = (acts, key) => acts.map((a) => `${a.xValue}:${a[key]}`).sort();

describe("the parse — the {X} lane's abilities carry their non-mana costs (unchanged)", () => {
  it("Fiend Artisan and Alquist Proft parse their sacrifice beside the {X}, modeled, and classify native", () => {
    const fiend = parseActivatedAbilities(FIEND_ARTISAN).find((a) => a.costX);
    expect(fiend).toMatchObject({ costX: true, tapSelf: true, sacOther: { type: "creature", another: true }, modeled: true });
    const alquist = parseActivatedAbilities(ALQUIST).find((a) => a.costX);
    expect(alquist).toMatchObject({ costX: true, tapSelf: true, sacOther: { type: "permanent", subtype: "clue", another: false }, modeled: true });
    expect(classifyCard(FIEND_ARTISAN)).toMatch(/^native-/);
    expect(classifyCard(ALQUIST)).toMatch(/^native-/);
  });
});

describe("witness — Fiend Artisan's \"Sacrifice another creature\"", () => {
  it("⭐ not offered with no other creature (it can't sacrifice itself — \"another\")", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("s1", SWAMP), P("s2", SWAMP), P("s3", SWAMP)]);
    expect(offers(s, "fa")).toEqual([]);
  });

  it("⭐ every offered activation names one other creature as its victim — one action per (victim, X)", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("bear", BEARS), P("giant", HILL_GIANT), P("s1", SWAMP), P("s2", SWAMP), P("s3", SWAMP)]);
    const acts = offers(s, "fa");
    expect(pairs(acts, "sacCreatureId")).toEqual(["1:bear", "1:giant", "2:bear", "2:giant"]);
    expect(acts.every((a) => a.sacCreatureId !== "fa")).toBe(true);
    expect(acts.find((a) => a.xValue === 2 && a.sacCreatureId === "bear")).toMatchObject({ sacCreatureName: "Grizzly Bears", cost: expect.objectContaining({ generic: 2 }) });
  });

  it("⭐ activating sacrifices exactly the chosen creature before the ability is on the stack, and threads the chosen X", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("bear", BEARS), P("giant", HILL_GIANT), P("s1", SWAMP), P("s2", SWAMP), P("s3", SWAMP)]);
    const act = offers(s, "fa").find((a) => a.xValue === 1 && a.sacCreatureId === "bear");
    expect(act).toBeTruthy();
    const after = dispatchAction(s, act);
    expect(onField(after, "bear")).toBe(false);
    expect(inGraveyard(after, "Grizzly Bears")).toBe(true);
    expect(onField(after, "giant")).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "fa").tapped).toBe(true);
    expect(after.stack.at(-1).payload.params.xValue).toBe(1);
  });

  it("⭐ the victim is no Altar's too (one victim per cost): Phyrexian Altar + the only other creature + one Swamp can't pay X = 1", () => {
    // {1}{B/G}: the Swamp pays {B/G}; the {1} would need the Altar, whose only creatures are the Artisan's victim and the Artisan
    // itself, whose {T} is part of the same cost.
    const s = table([P("fa", FIEND_ARTISAN), P("alt", PHYREXIAN_ALTAR), P("bear", BEARS), P("s1", SWAMP)]);
    expect(offers(s, "fa")).toEqual([]);
  });

  it("⭐ a one-shot mana creature can't be cracked AND sacrificed (Eldrazi Spawn as the only victim, one Swamp: X = 1 is out of reach)", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("spawn", SPAWN), P("s1", SWAMP)]);
    expect(offers(s, "fa")).toEqual([]);
  });

  it("⭐ per X, a one-shot victim's own mana never pays: sacrificing the Bears reaches X = 2 (the Spawn cracks), sacrificing the Spawn only X = 1", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("spawn", SPAWN), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)]);
    expect(pairs(offers(s, "fa"), "sacCreatureId")).toEqual(["1:bear", "1:spawn", "2:bear"]);
  });

  it("⭐ a repeatable mana creature may tap for mana and then be the victim (Llanowar Elves + one Swamp pay X = 1)", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("elf", ELVES), P("s1", SWAMP)]);
    const acts = offers(s, "fa");
    expect(pairs(acts, "sacCreatureId")).toEqual(["1:elf"]);
    const after = dispatchAction(s, acts[0]);
    expect(onField(after, "elf")).toBe(false);
    expect(inGraveyard(after, "Llanowar Elves")).toBe(true);
    expect(after.stack.at(-1).payload.params.xValue).toBe(1);
  });

  it("⭐ with a second creature the Altar eats the other one: X = 1 pays, each sacrifice its own creature", () => {
    const s = table([P("fa", FIEND_ARTISAN), P("alt", PHYREXIAN_ALTAR), P("bear", BEARS), P("giant", HILL_GIANT), P("s1", SWAMP)]);
    const acts = offers(s, "fa");
    expect(pairs(acts, "sacCreatureId")).toEqual(["1:bear", "1:giant"]);
    const after = dispatchAction(s, acts.find((a) => a.sacCreatureId === "bear"));
    expect(onField(after, "bear")).toBe(false);
    expect(onField(after, "giant")).toBe(false); // the Altar's {1}
    expect(onField(after, "fa")).toBe(true);
    expect(after.stack.at(-1).payload.params.xValue).toBe(1);
  });
});

describe("witness — Alquist Proft's \"Sacrifice a Clue\"", () => {
  const lands = () => [P("i1", ISLAND), P("i2", ISLAND), P("p1", PLAINS), P("p2", PLAINS)];

  it("⭐ not offered without a Clue", () => {
    const s = table([P("aq", ALQUIST), ...lands()]);
    expect(offers(s, "aq")).toEqual([]);
  });

  it("⭐ with a Clue: offered naming it; activating sacrifices it; resolving draws X and gains X", () => {
    const library = [{ id: "l1", name: "Top Card", type: "Instant" }, { id: "l2", name: "Second Card", type: "Instant" }];
    const s = table([P("aq", ALQUIST), P("clue", CLUE), ...lands()], { library });
    const acts = offers(s, "aq");
    expect(pairs(acts, "sacCreatureId")).toEqual(["1:clue"]);
    let after = dispatchAction(s, acts[0]);
    expect(onField(after, "clue")).toBe(false);
    after = resolveTopOfStack(after);
    expect(after.players.user.hand.map((c) => c.name)).toEqual(["Top Card"]);
    expect(after.players.user.life).toBe(21);
  });
});

describe("witness — the other non-mana costs ride the {X} lane (probe texts)", () => {
  it("⭐ \"Tap an untapped creature you control\": not offered with none; each offer names the creature it taps, which pays no mana", () => {
    expect(offers(table([P("pr", TAP_PROBE), P("f1", FOREST), P("f2", FOREST)]), "pr")).toEqual([]);
    const s = table([P("pr", TAP_PROBE), P("elf", ELVES), P("f1", FOREST)]);
    const acts = offers(s, "pr");
    expect(pairs(acts, "tapCreatureId")).toEqual(["1:elf"]); // the Elves pay the tap, so only the Forest pays X
    const after = dispatchAction(s, acts[0]);
    expect(after.players.user.battlefield.find((p) => p.id === "elf").tapped).toBe(true);
  });

  it("⭐ \"Sacrifice two creatures\": not offered with one; the two ride the action and are sacrificed", () => {
    expect(offers(table([P("pr", SAC_TWO_PROBE), P("bear", BEARS), P("f1", FOREST)]), "pr")).toEqual([]);
    const s = table([P("pr", SAC_TWO_PROBE), P("bear", BEARS), P("giant", HILL_GIANT), P("f1", FOREST)]);
    const acts = offers(s, "pr");
    expect(acts.map((a) => [a.xValue, [...(a.sacCountIds || [])].sort()])).toEqual([[1, ["bear", "giant"]]]);
    const after = dispatchAction(s, acts[0]);
    expect(onField(after, "bear") || onField(after, "giant")).toBe(false);
  });

  it("⭐ \"Return a land you control to its owner's hand\": each offer names the land it returns, which pays no mana", () => {
    const s = table([P("pr", RETURN_PROBE), P("f1", FOREST), P("f2", FOREST), P("f3", FOREST)]);
    const acts = offers(s, "pr");
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => ["f1", "f2", "f3"].includes(a.returnLandId))).toBe(true);
    expect(Math.max(...acts.map((a) => a.xValue))).toBe(2); // three Forests, one returned: X = 3 is out of reach
    const act = acts.find((a) => a.xValue === 2 && a.returnLandId === "f1");
    const after = dispatchAction(s, act);
    expect(after.players.user.hand.map((c) => c.name)).toEqual(["Forest"]);
  });

  it("⭐ \"Exile a card from your graveyard\": offered with the card it exiles; not offered with an empty graveyard", () => {
    expect(offers(table([P("pr", EXILE_GY_PROBE), P("f1", FOREST)]), "pr")).toEqual([]);
    const s = table([P("pr", EXILE_GY_PROBE), P("f1", FOREST)], { graveyard: [{ id: "g1", name: "Dead Card", type: "Instant" }] });
    const acts = offers(s, "pr");
    expect(acts.map((a) => [a.xValue, a.exileGyIds])).toEqual([[1, ["g1"]]]);
    const after = dispatchAction(s, acts[0]);
    expect(after.players.user.graveyard).toEqual([]);
  });

  it("⭐ \"Unattach an Equipment from <self>\": not offered unequipped; offered naming the Equipment it unattaches", () => {
    expect(offers(table([P("kn", UNATTACH_PROBE), P("f1", FOREST)]), "kn")).toEqual([]);
    const s = table([P("kn", UNATTACH_PROBE, { attachments: ["eq"] }), P("eq", EQUIPMENT, { attachedTo: "kn" }), P("f1", FOREST)]);
    const acts = offers(s, "kn");
    expect(pairs(acts, "unattachEquipmentId")).toEqual(["1:eq"]);
  });
});

describe("witness — the {X} lane's targets know their source, as the printed-cost lane's do", () => {
  it("⭐ Cackling Witch (a creature) never targets Beloved Chaplain (protection from creatures, CR 702.16b)", () => {
    const s = table([P("cw", CACKLING_WITCH), P("chap", BELOVED_CHAPLAIN), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)],
      { hand: [{ id: "h1", name: "Spare Card", type: "Instant" }] });
    const acts = offers(s, "cw");
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.flatMap((a) => a.targets.map((t) => t.id)).includes("chap")).toBe(false);
  });
});

describe("controls — unchanged on both trees", () => {
  it("the printed-cost lane's targets (Prodigal Pyromancer, a creature) never include Beloved Chaplain", () => {
    const s = table([P("pp", PRODIGAL_PYROMANCER), P("chap", BELOVED_CHAPLAIN), P("bear", BEARS)]);
    const acts = offers(s, "pp");
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.flatMap((a) => a.targets.map((t) => t.id)).includes("chap")).toBe(false);
  });

  it("a plain {X} ability (Oracle of Nectars): one action per affordable X, no cost victim, resolves for X", () => {
    const s = table([P("on", ORACLE_OF_NECTARS), P("f1", FOREST), P("f2", FOREST), P("f3", FOREST)]);
    const acts = offers(s, "on");
    expect(acts.map((a) => a.xValue)).toEqual([1, 2, 3]);
    for (const a of acts) expect(a).toMatchObject({ sacCreatureId: null, sacCreatureName: null, sacCountIds: null, abilityText: `X=${a.xValue}: You gain X life.` });
    const after = resolveTopOfStack(dispatchAction(s, acts[2]));
    expect(after.players.user.life).toBe(23);
  });

  it("the non-X sacrifice lane (Viscera Seer): one action per legal victim, the chosen one sacrificed", () => {
    const s = table([P("vs", VISCERA_SEER), P("bear", BEARS)], { library: [{ id: "l1", name: "Top Card", type: "Instant" }] });
    const acts = offers(s, "vs");
    expect(acts.map((a) => a.sacCreatureId).sort()).toEqual(["bear", "vs"]);
    const after = dispatchAction(s, acts.find((a) => a.sacCreatureId === "bear"));
    expect(onField(after, "bear")).toBe(false);
    expect(onField(after, "vs")).toBe(true);
  });

  it("the {X} lane's discard (Cackling Witch): not offered with an empty hand", () => {
    const s = table([P("cw", CACKLING_WITCH), P("bear", BEARS), P("s1", SWAMP), P("s2", SWAMP)]);
    expect(offers(s, "cw")).toEqual([]);
  });

  it("the {X} lane's life and counter costs: gated on the resources, carried on the action", () => {
    expect(offers(table([P("pr", LIFE_PROBE), P("f1", FOREST)], { life: 1 }), "pr")).toEqual([]);
    expect(offers(table([P("pr", LIFE_PROBE), P("f1", FOREST)]), "pr").map((a) => [a.xValue, a.payLife])).toEqual([[1, 2]]);
    expect(offers(table([P("pr", COUNTER_PROBE), P("f1", FOREST)]), "pr")).toEqual([]);
    expect(offers(table([P("pr", COUNTER_PROBE, { counters: { charge: 1 } }), P("f1", FOREST)]), "pr").map((a) => [a.xValue, a.removeCounter])).toEqual([[1, { type: "charge", count: 1 }]]);
  });
});
