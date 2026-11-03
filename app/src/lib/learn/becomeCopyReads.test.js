/**
 * BECOME-COPY READS — what a permanent that BECAME a copy (a layer-1 copy effect: Mizzium Transreliquat, Shifting Woodland, Thespian's
 * Stage, Impossible Man) reads as the copy, and CR 704.5p. The play-weighted pw21 slice and its blind review (F1, F2):
 *
 *   · The Mycosynth Gardens (EDHREC #853) is PARKED (land-partial). Its copy would be read only by the activated, mana and type
 *     readers; the copied artifact's statics (Howling Mine, Coat of Arms), triggers (Solemn Simulacrum's dies), "doesn't untap"
 *     (Grim Monolith), Equipment grant (Swiftfoot Boots) and legendary name (Mox Amber beside a Mox Amber: no legend rule) are
 *     still read off the printed land. The copy-read-everywhere slice owns those readers.
 *   · Kept (CR 707.2, 613.1a): a become-copy's activated abilities are the copy's, not its printed ones — EXCEPT its Equip /
 *     Reconfigure (the review's F2): the bonus an Equipment grants is read off the attachment's printed card, so a copy of an
 *     Equipment is offered no equip until that read takes the copy too. Its card types are the copy's for the routed type readers.
 *     A copy of a copy copies what that copy is (CR 707.3).
 *   · CR 704.5p: "If a battle or creature is attached to an object or player, it becomes unattached and remains on the battlefield.
 *     Similarly, if any nonbattle, noncreature permanent that's neither an Aura, an Equipment, nor a Fortification is attached to an
 *     object or player, it becomes unattached and remains on the battlefield." Brass Squire attaches a permanent that is an
 *     Equipment only as a copy; when the copy ends, or it becomes a creature, it falls off.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { deriveCharacteristics, permanentHasKeyword, permanentIsCreature, permanentTypes } from "./layers.js";
import { manaSources } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const GARDENS = {"name":"The Mycosynth Gardens","type":"Land — Sphere","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{X}, {T}: This land becomes a copy of target nontoken artifact you control with mana value X."};
const STAGE = {"name":"Thespian's Stage","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability."};
const WOODLAND = {"name":"Shifting Woodland","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":["Delirium"],"colors":[],"oracle":"This land enters tapped unless you control a Forest.\n{T}: Add {G}.\nDelirium — {2}{G}{G}: This land becomes a copy of target permanent card in your graveyard until end of turn. Activate only if there are four or more card types among cards in your graveyard."};
const TRANSRELIQUAT = {"name":"Mizzium Transreliquat","type":"Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{3}: This artifact becomes a copy of target artifact until end of turn.\n{1}{U}{R}: This artifact becomes a copy of target artifact, except it has this ability."};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const SIGNET = {"name":"Azorius Signet","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{1}, {T}: Add {W}{U}."};
const MANA_CRYPT = {"name":"Mana Crypt","type":"Artifact","mana":"{0}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"At the beginning of your upkeep, flip a coin. If you lose the flip, this artifact deals 3 damage to you.\n{T}: Add {C}{C}."};
const BOOTS = {"name":"Swiftfoot Boots","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has hexproof and haste. (It can't be the target of spells or abilities your opponents control. It can attack and {T} no matter when it came under your control.)\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)"};
const GREAVES = {"name":"Lightning Greaves","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has haste and shroud. (It can't be the target of spells or abilities.)\nEquip {0}"};
const SQUIRE = {"name":"Brass Squire","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":[],"oracle":"{T}: Attach target Equipment you control to target creature you control."};
const SOLEMN = {"name":"Solemn Simulacrum","type":"Artifact Creature — Golem","mana":"{4}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":[],"oracle":"When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card."};
const BLADES = {"name":"Lizard Blades","type":"Artifact Creature — Equipment Lizard","mana":"{1}{R}","cmc":2,"power":"1","toughness":"1","keywords":["Double strike","Reconfigure"],"colors":["R"],"oracle":"Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)"};
const ZURAN = {"name":"Zuran Orb","type":"Artifact","mana":"{0}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"Sacrifice a land: You gain 2 life."};
const TITANIA = {"name":"Titania, Protector of Argoth","type":"Legendary Creature — Elemental","mana":"{3}{G}{G}","cmc":5,"power":"5","toughness":"3","keywords":[],"colors":["G"],"oracle":"When Titania enters, return target land card from your graveyard to the battlefield.\nWhenever a land you control is put into a graveyard from the battlefield, create a 5/3 green Elemental creature token."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const IMPOSSIBLE = {"name":"Impossible Man","type":"Legendary Creature — Alien Shapeshifter","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying\n{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man."};
const WIZARD_CLASS = {"name":"Wizard Class","type":"Enchantment — Class","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"(Gain the next level as a sorcery to add its ability.)\nYou have no maximum hand size.\n{2}{U}: Level 2\nWhen this Class becomes level 2, draw two cards.\n{4}{U}: Level 3\nWhenever you draw a card, put a +1/+1 counter on target creature you control."};
const STUDENT = {"name":"Student of Warfare","type":"Creature — Human Knight","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":["First strike","Level Up","Double strike"],"colors":["W"],"oracle":"Level up {W} ({W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-6\n3/3\nFirst strike\nLEVEL 7+\n4/4\nDouble strike"};
const DEATHCLAW = {"name":"Alpha Deathclaw","type":"Creature — Lizard Mutant","mana":"{4}{B}{G}","cmc":6,"power":"6","toughness":"6","keywords":["Trample","Menace","Monstrosity"],"colors":["B","G"],"oracle":"Menace, trample\nWhen this creature enters or becomes monstrous, destroy target permanent.\n{5}{B}{G}: Monstrosity 4. (If this creature isn't monstrous, put four +1/+1 counters on it and it becomes monstrous.)"};
const SORCERER = {"name":"Prodigal Sorcerer","type":"Creature — Human Wizard Sorcerer","mana":"{2}{U}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: This creature deals 1 damage to any target."};
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function table({ battlefield = [], graveyard = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield, graveyard, manaPool: { ...EMPTY, ...pool }, library: [1, 2, 3, 4, 5].map((i) => ({ ...BEARS, id: `lib${i}` })) },
      ai: { ...g.players.ai, library: [1, 2, 3, 4, 5].map((i) => ({ ...BEARS, id: `ai-lib${i}` })) } } };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
}
function nextTurn(s) { let n = s, g = 0; const t = s.turn; while (n.turn === t && g++ < 40) n = runStepActions(advanceStep(n)); return n; }
const acts = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === id);
const targetIds = (a) => (a.targets || []).map((t) => t.id);
const refill = (s, pool) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...EMPTY, ...pool } } } });
const without = (s, id) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== id) } } });
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const nameOf = (s, id) => deriveCharacteristics(s, id)?.copiableValues?.name ?? null;
function activate(s, permId, index, targetId) {
  const a = acts(s, permId).find((x) => x.abilityIndex === index && targetIds(x).includes(targetId));
  expect(a, `${permId} ability ${index} at ${targetId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** Brass Squire's "{T}: Attach target Equipment you control to target creature you control." — `equipId` onto `hostId`. */
function squireAttach(s, equipId, hostId) {
  const a = acts(s, "squire").find((x) => targetIds(x).join("+") === `${equipId}+${hostId}`);
  expect(a, `Brass Squire attaching ${equipId} to ${hostId}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}
/** Shifting Woodland's delirium copy of the card `cardId` in your graveyard (four card types there: artifact, creature, instant, sorcery). */
function woodlandCopies(card) {
  const s = table({ battlefield: [P("wood", WOODLAND), P("squire", SQUIRE), P("bear", BEARS), P("orb", ZURAN), P("forest", FOREST), P("titania", TITANIA)],
    graveyard: [{ ...card, id: "g-copied" }, { ...BEARS, id: "g-bears" }, { ...BOLT, id: "g-bolt" }, { ...DIVINATION, id: "g-div" }], pool: { G: 2, C: 2 } });
  const a = acts(s, "wood").find((x) => targetIds(x).includes("g-copied"));
  expect(a, `Shifting Woodland's copy of ${card.name}`).toBeTruthy();
  return settle(dispatchAction(s, a));
}

describe("The Mycosynth Gardens — parked (the pw21 review's F1)", () => {
  it("⭐ its copy line stays unparsed: land-partial, and its {X} copy ability is offered at no X", () => {
    const s = table({ battlefield: [P("gardens", GARDENS), P("crypt", MANA_CRYPT), P("ring", SOL_RING)], pool: { C: 5 } });
    expect({ tier: classifyCard(GARDENS), copyOffers: acts(s, "gardens").filter((a) => a.abilityIndex === 2).length }).toEqual({ tier: "land-partial", copyOffers: 0 });
  });
  it("CONTROL — Thespian's Stage is a modeled land", () => {
    expect(classifyCard(STAGE)).toBe("land");
  });
});

describe("a become-copy's activated abilities are the copy's (CR 707.2, 613.1a)", () => {
  it("⭐ a Mizzium Transreliquat that became a Sol Ring offers none of its own copy lines — Sol Ring's {C}{C} only", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("ring", SOL_RING), P("stone", MIND_STONE)], pool: { C: 3 } }), "relic", 0, "ring");
    s = refill(s, { C: 5, U: 1, R: 1 });
    expect({ name: nameOf(s, "relic"), activations: acts(s, "relic").length, mana: manaSources(s, "user").filter((m) => m.permanentId === "relic").map((m) => ({ colors: m.colors, amount: m.amount })) })
      .toEqual({ name: "Sol Ring", activations: 0, mana: [{ colors: ["C"], amount: 2 }] });
  });
  it("⭐ …the lasting {1}{U}{R} copy keeps only the line it says it has: one copy line offered, not two", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("ring", SOL_RING), P("stone", MIND_STONE)], pool: { C: 1, U: 1, R: 1 } }), "relic", 1, "ring");
    s = refill(s, { C: 5, U: 1, R: 1 });
    const offered = acts(s, "relic");
    expect({ name: nameOf(s, "relic"), lines: new Set(offered.map((a) => a.abilityIndex)).size, targetsStone: offered.some((a) => targetIds(a).includes("stone")) }).toEqual({ name: "Sol Ring", lines: 1, targetsStone: true });
  });
  it("⭐ a Transreliquat that became an Azorius Signet pays the Signet's cost: its {W}{U} line costs {1} (it was free — manaModel's own-line reads take the copy)", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("signet", SIGNET)], pool: { C: 3 } }), "relic", 0, "signet");
    s = refill(s, {});
    const line = manaSources(s, "user").filter((m) => m.permanentId === "relic").map((m) => ({ colors: m.colors, amount: m.amount, generic: m.activationCost?.generic ?? 0 }));
    expect({ name: nameOf(s, "relic"), line }).toEqual({ name: "Azorius Signet", line: [{ colors: ["W", "U"], amount: 2, generic: 1 }] });
  });
  it("⭐ a Transreliquat that became a Mind Stone has its draw line: sacrificed, it draws a card", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("stone", MIND_STONE)], pool: { C: 3 } }), "relic", 0, "stone");
    s = refill(s, { C: 1 });
    const draw = acts(s, "relic").find((a) => targetIds(a).length === 0);
    expect(draw, "the copy's untargeted draw line").toBeTruthy();
    const hand = s.players.user.hand.length;
    s = settle(dispatchAction(s, draw));
    expect({ relicGone: !perm(s, "relic"), drew: s.players.user.hand.length - hand }).toEqual({ relicGone: true, drew: 1 });
  });
});

describe("…except a copy's Equip (the pw21 review's F2)", () => {
  for (const eq of [BOOTS, GREAVES]) {
    it(`⭐ a Transreliquat that became a ${eq.name} is offered no equip — the bonus would be read off its printed card`, () => {
      let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("eq", eq), { ...P("bear", BEARS), summoningSick: true }], pool: { C: 3 } }), "relic", 0, "eq");
      s = refill(without(s, "eq"), { C: 5 });
      expect({ name: nameOf(s, "relic"), equipOffers: acts(s, "relic").filter((a) => targetIds(a).includes("bear")).length }).toEqual({ name: eq.name, equipOffers: 0 });
    });
  }
  it("CONTROL — a real Swiftfoot Boots equips the summoning-sick Bear, which has hexproof and haste", () => {
    const s0 = table({ battlefield: [P("boots", BOOTS), { ...P("bear", BEARS), summoningSick: true }], pool: { C: 1 } });
    const equip = acts(s0, "boots").find((a) => targetIds(a).includes("bear"));
    expect(equip, "the Boots' equip").toBeTruthy();
    const s = settle(dispatchAction(s0, equip));
    expect({ hexproof: permanentHasKeyword(s, "bear", "hexproof"), haste: permanentHasKeyword(s, "bear", "haste") }).toEqual({ hexproof: true, haste: true });
  });
});

describe("…nor a copy's level up, Class level-up, Monstrosity or Adapt (the pw21 recheck's R1 — the payoff is read off the printed card)", () => {
  /** Impossible Man ({2}{U}: a copy of another target permanent until end of turn) becomes `card`; the pool refilled with `pool`. */
  function impossibleAs(card, pool, extra = []) {
    let s = activate(table({ battlefield: [P("imp", IMPOSSIBLE), P("model", card), ...extra], pool: { U: 1, C: 2 } }), "imp", 0, "model");
    expect(permanentTypes(s, "imp").types, `Impossible Man became a ${card.name}`).toEqual(permanentTypes(s, "model").types);
    return refill(without(s, "model"), pool);
  }
  it("⭐ a Shifting Woodland that became a Wizard Class is offered no Level 2", () => {
    const s = refill(woodlandCopies(WIZARD_CLASS), { U: 1, C: 4 });
    expect({ name: nameOf(s, "wood"), offers: acts(s, "wood").length }).toEqual({ name: "Wizard Class", offers: 0 });
  });
  it("CONTROL — a real Wizard Class levels to 2 for {2}{U} and draws two", () => {
    const s0 = table({ battlefield: [P("wclass", WIZARD_CLASS)], pool: { U: 1, C: 2 } });
    const level2 = acts(s0, "wclass")[0];
    expect(level2, "the Level 2 bar").toBeTruthy();
    const hand = s0.players.user.hand.length;
    const s = settle(dispatchAction(s0, level2));
    expect(s.players.user.hand.length - hand).toBe(2);
  });
  it("⭐ an Impossible Man that became a Student of Warfare is offered no level up", () => {
    const s = impossibleAs(STUDENT, { W: 2 });
    expect(acts(s, "imp").length).toBe(0);
  });
  it("CONTROL — a real Student of Warfare leveled up twice is a 3/3 with first strike", () => {
    let s = table({ battlefield: [P("student", STUDENT)], pool: { W: 2 } });
    for (let i = 0; i < 2; i++) {
      const up = acts(s, "student")[0];
      expect(up, `level up #${i + 1}`).toBeTruthy();
      s = settle(dispatchAction(s, up));
    }
    const d = deriveCharacteristics(s, "student");
    expect({ pt: [d.power, d.toughness], firstStrike: permanentHasKeyword(s, "student", "first strike") }).toEqual({ pt: [3, 3], firstStrike: true });
  });
  it("⭐ an Impossible Man that became an Alpha Deathclaw is offered no Monstrosity", () => {
    const s = impossibleAs(DEATHCLAW, { B: 1, G: 1, C: 5 });
    expect(acts(s, "imp").length).toBe(0);
  });
  it("CONTROL — a real Alpha Deathclaw's Monstrosity 4 makes it a 10/10 and its \"becomes monstrous\" trigger destroys a permanent", () => {
    const g = table({ battlefield: [P("claw", DEATHCLAW)], pool: { B: 1, G: 1, C: 5 } });
    const s0 = { ...g, players: { ...g.players, ai: { ...g.players.ai, battlefield: [P("their-bears", BEARS, "ai")] } } };
    const monstrosity = acts(s0, "claw")[0];
    expect(monstrosity, "Monstrosity 4").toBeTruthy();
    const s = settle(dispatchAction(s0, monstrosity));
    const d = deriveCharacteristics(s, "claw");
    expect({ pt: [d.power, d.toughness], bearsGone: !s.players.ai.battlefield.some((p) => p.id === "their-bears") }).toEqual({ pt: [10, 10], bearsGone: true });
  });
  it("CONTROL — an Impossible Man that became a Prodigal Sorcerer still pings", () => {
    const s = impossibleAs(SORCERER, {});
    expect(acts(s, "imp").length > 0).toBe(true);
  });
});

describe("CR 704.5p — attached, and no Aura, Equipment or Fortification, or a creature: it becomes unattached", () => {
  it("⭐ a Transreliquat that was a Lightning Greaves when Brass Squire attached it falls off when the copy ends at cleanup — and stays on the battlefield", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("greaves", GREAVES), P("squire", SQUIRE), P("bear", BEARS)], pool: { C: 3 } }), "relic", 0, "greaves");
    s = squireAttach(without(s, "greaves"), "relic", "bear");
    expect(perm(s, "relic").attachedTo).toBe("bear");
    const later = nextTurn(s);
    expect({ name: nameOf(later, "relic"), onBattlefield: !!perm(later, "relic"), attachedTo: perm(later, "relic")?.attachedTo ?? null, hostLists: (perm(later, "bear").attachments || []).includes("relic") })
      .toEqual({ name: null, onBattlefield: true, attachedTo: null, hostLists: false });
  });
  it("⭐ …and one that becomes a creature falls off at once: the lasting {1}{U}{R} copy of the Greaves, attached, then copies Solemn Simulacrum (CR 301.5c)", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("greaves", GREAVES), P("squire", SQUIRE), P("bear", BEARS), P("solemn", SOLEMN)], pool: { C: 1, U: 1, R: 1 } }), "relic", 1, "greaves");
    s = refill(squireAttach(without(s, "greaves"), "relic", "bear"), { C: 1, U: 1, R: 1 });
    expect(perm(s, "relic").attachedTo).toBe("bear");
    const again = acts(s, "relic").find((a) => targetIds(a).includes("solemn"));
    expect(again, "the kept copy line at Solemn Simulacrum").toBeTruthy();
    s = settle(dispatchAction(s, again));
    expect({ name: nameOf(s, "relic"), creature: permanentIsCreature(s, "relic"), onBattlefield: !!perm(s, "relic"), attachedTo: perm(s, "relic")?.attachedTo ?? null, hostLists: (perm(s, "bear").attachments || []).includes("relic") })
      .toEqual({ name: "Solemn Simulacrum", creature: true, onBattlefield: true, attachedTo: null, hostLists: false });
  });
  it("⭐ the review's Woodland: a Shifting Woodland that became a Lightning Greaves (a card in your graveyard), attached by Brass Squire, is a land again next turn and unattached", () => {
    let s = squireAttach(woodlandCopies(GREAVES), "wood", "bear");
    expect(perm(s, "wood").attachedTo).toBe("bear");
    const later = nextTurn(s);
    expect({ types: permanentTypes(later, "wood").types, attachedTo: perm(later, "wood")?.attachedTo ?? null, hostLists: (perm(later, "bear").attachments || []).includes("wood") })
      .toEqual({ types: ["Land"], attachedTo: null, hostLists: false });
  });
  it("CONTROL — a real Lightning Greaves Brass Squire attached stays on its creature into the next turn", () => {
    const s = squireAttach(table({ battlefield: [P("greaves", GREAVES), P("squire", SQUIRE), P("bear", BEARS)] }), "greaves", "bear");
    expect(perm(nextTurn(s), "greaves").attachedTo).toBe("bear");
  });
  it("CONTROL — an attached reconfigure Lizard Blades is no creature (CR 702.151b) and stays attached", () => {
    const s0 = table({ battlefield: [P("blades", BLADES), P("bear", BEARS)], pool: { C: 2 } });
    const reconfigure = acts(s0, "blades").find((a) => targetIds(a).includes("bear"));
    expect(reconfigure, "Lizard Blades' reconfigure onto the Bear").toBeTruthy();
    const s = settle(dispatchAction(s0, reconfigure));
    const later = nextTurn(s);
    expect({ creature: permanentIsCreature(s, "blades"), attachedTo: perm(s, "blades").attachedTo, later: perm(later, "blades").attachedTo, doubleStrike: permanentHasKeyword(s, "bear", "double strike") })
      .toEqual({ creature: false, attachedTo: "bear", later: "bear", doubleStrike: true });
  });
});

describe("a become-copy's card types are the copy's for the routed type readers", () => {
  it("CONTROL (both trees — the sacrifice pool and the mana line already read the copy) — a Shifting Woodland that became a Sol Ring: Zuran Orb's \"Sacrifice a land\" can't take it, the Forest it can; it taps for {C}{C}, no {G}", () => {
    const s = refill(woodlandCopies(SOL_RING), { C: 5 });
    const orbVictims = acts(s, "orb").map((a) => a.sacCreatureId ?? a.sacLandId ?? a.sacId ?? (a.sacCountIds || [])[0] ?? null);
    const mana = manaSources(s, "user").filter((m) => m.permanentId === "wood").map((m) => ({ colors: m.colors, amount: m.amount }));
    expect({ name: nameOf(s, "wood"), types: permanentTypes(s, "wood").types, orbTakesWood: orbVictims.includes("wood"), orbTakesForest: orbVictims.includes("forest"), mana })
      .toEqual({ name: "Sol Ring", types: ["Artifact"], orbTakesWood: false, orbTakesForest: true, mana: [{ colors: ["C"], amount: 2 }] });
  });
  it("⭐ …and it leaves as an artifact: destroyed as a Sol Ring, Titania's \"a land you control is put into a graveyard\" does not trigger (the Forest, a control, does)", () => {
    const elementals = (st) => st.players.user.battlefield.filter((p) => p.card?.token && String(p.card.type || "").includes("Elemental")).length;
    const killed = (st, id) => settle(flushTriggers(applyDestroyEffect({ ...st, priorityHolder: "user" }, { controller: "ai", targets: [{ type: "permanent", id }] })));
    const s = woodlandCopies(SOL_RING);
    expect({ wood: elementals(killed(s, "wood")), forest: elementals(killed(s, "forest")) }).toEqual({ wood: 0, forest: 1 });
  });
});

describe("a copy of a copy (CR 707.3)", () => {
  it("⭐ a Transreliquat copying another Transreliquat that became a Mind Stone becomes a Mind Stone", () => {
    let s = activate(table({ battlefield: [P("relic", TRANSRELIQUAT), P("relic2", TRANSRELIQUAT), P("stone", MIND_STONE)], pool: { C: 3 } }), "relic", 0, "stone");
    s = activate(refill(s, { C: 3 }), "relic2", 0, "relic");
    expect({ first: nameOf(s, "relic"), second: nameOf(s, "relic2") }).toEqual({ first: "Mind Stone", second: "Mind Stone" });
  });
});
