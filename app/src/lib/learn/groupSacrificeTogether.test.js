/**
 * groupSacrificeTogether.test.js — a GROUP of permanents that one instruction removes leaves as ONE event (2026-10-17).
 *
 * Found by the death-sites slice (probed 10-17): removal.applyMintedLeave — the delayed "Sacrifice it / Exile that token at the
 * beginning of the next end step" bound to the tokens a token copy just made (Kiki-Jiki, Orthion, Stormsplitter) — sacrificed a
 * doubler's extra tokens ONE AT A TIME. Each single sacrifice drains its own leave event and fires its own dies batch, so Vengeful
 * Townsfolk ("Whenever one or more other creatures you control die") triggered once per token instead of once.
 *
 * "Sacrifice them" is one instruction, so one event: CR 603.2c — "An ability triggers only once each time its trigger event occurs.
 * However, it can trigger repeatedly if one event contains multiple occurrences" (its example: one spell destroying all lands is one
 * event, and a per-land watcher triggers once per land). So a "one or more" watcher triggers once and a per-creature watcher (Blood
 * Artist) once per creature, each look-back read before any of them left (CR 603.10a). CR 101.4's example is the same rule for an
 * each-player instruction: "Then all creatures chosen this way are sacrificed simultaneously." Kiki-Jiki's bundled ruling: "If
 * Kiki-Jiki's ability creates multiple tokens due to a replacement effect (such as the one Doubling Season creates), you'll sacrifice
 * each of them."
 *
 * The audit found the same shape at five more sites, fixed here:
 *   ② the exile branch of the same delayed ability (Stormsplitter) moved each token in its own zone move;
 *   ③ a cost that sacrifices N permanents (Tooth and Claw's "Sacrifice two creatures", Bankrupt in Blood's additional
 *     cost, Pulverize's "sacrifice two Mountains") paid each through the single cost sacrifice;
 *   ④ Gush's "return two Islands" drained the leave event after each Island;
 *   ⑤ Cosmic Larva's "unless you sacrifice two lands" and Planar Engineering's forced "Sacrifice two lands" sacrificed each alone.
 * ③–⑤ show only when the lands are creatures (Living Plane) or the victims are creatures.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, oracle-index.json, read in-session 2026-10-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceStep, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { applySacrificeLand } from "./effects/atoms/sacLand.js";

beforeEach(() => _resetIdsForTests());

const KIKI = {"name":"Kiki-Jiki, Mirror Breaker","type":"Legendary Creature — Goblin Shaman","mana":"{2}{R}{R}{R}","cmc":5,"keywords":["Haste"],"colors":["R"],"oracle":"Haste\n{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.","power":"2","toughness":"2"};
const ORTHION = {"name":"Orthion, Hero of Lavabrink","type":"Legendary Creature — Human Soldier","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"{1}{R}, {T}: Create a token that's a copy of another target creature you control. It gains haste. Sacrifice it at the beginning of the next end step. Activate only as a sorcery.\n{6}{R}{R}{R}, {T}: Create five tokens that are copies of another target creature you control. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.","power":"3","toughness":"3"};
const STORMSPLITTER = {"name":"Stormsplitter","type":"Creature — Otter Wizard","mana":"{3}{R}","cmc":4,"keywords":["Haste"],"colors":["R"],"oracle":"Haste\nWhenever you cast an instant or sorcery spell, create a token that's a copy of this creature. Exile that token at the beginning of the next end step.","power":"1","toughness":"4"};
const PARALLEL_LIVES = {"name":"Parallel Lives","type":"Enchantment","mana":"{3}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."};
const DOUBLING_SEASON = {"name":"Doubling Season","type":"Enchantment","mana":"{4}{G}","cmc":5,"keywords":[],"colors":["G"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."};
const ANOINTED_PROCESSION = {"name":"Anointed Procession","type":"Enchantment","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."};
const VENGEFUL_TOWNSFOLK = {"name":"Vengeful Townsfolk","type":"Creature — Human Citizen","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Whenever one or more other creatures you control die, put a +1/+1 counter on this creature.","power":"3","toughness":"3"};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const KORVOLD = {"name":"Korvold, Fae-Cursed King","type":"Legendary Creature — Dragon Noble","mana":"{2}{B}{R}{G}","cmc":5,"keywords":["Flying"],"colors":["B","G","R"],"oracle":"Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.","power":"4","toughness":"4"};
const DOUR_PORT_MAGE = {"name":"Dour Port-Mage","type":"Creature — Frog Wizard","mana":"{1}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Whenever one or more other creatures you control leave the battlefield without dying, draw a card.\n{1}{U}, {T}: Return another target creature you control to its owner's hand.","power":"1","toughness":"3"};
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."};
const TOOTH_AND_CLAW = {"name":"Tooth and Claw","type":"Enchantment","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"Sacrifice two creatures: Create a 3/1 red Beast creature token named Carnivore."};
const BANKRUPT_IN_BLOOD = {"name":"Bankrupt in Blood","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, sacrifice two creatures.\nDraw three cards."};
const PULVERIZE = {"name":"Pulverize","type":"Sorcery","mana":"{4}{R}{R}","cmc":6,"keywords":[],"colors":["R"],"oracle":"You may sacrifice two Mountains rather than pay this spell's mana cost.\nDestroy all artifacts."};
const GUSH = {"name":"Gush","type":"Instant","mana":"{4}{U}","cmc":5,"keywords":[],"colors":["U"],"oracle":"You may return two Islands you control to their owner's hand rather than pay this spell's mana cost.\nDraw two cards."};
const COSMIC_LARVA = {"name":"Cosmic Larva","type":"Creature — Beast","mana":"{1}{R}{R}","cmc":3,"keywords":["Trample"],"colors":["R"],"oracle":"Trample\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice two lands.","power":"7","toughness":"6"};
const LIVING_PLANE = {"name":"Living Plane","type":"World Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"All lands are 1/1 creatures that are still lands."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const MEMNITE = {"name":"Memnite","type":"Artifact Creature — Construct","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"","power":"1","toughness":"1"};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

// [id, card, { ...permanent fields }] → a permanent `controller` controls, on the battlefield since turn 1.
const place = (controller) => ([id, card, extra = {}]) =>
  ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), enteredOnTurn: 1, ...extra });
// A two-player game on turn 6, the user active in the first main phase; `mine` / `theirs` are the two battlefields.
function board({ mine = [], theirs = [], hand = [], mana = {} }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: 8 }, (_, i) => ({ id: `L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }));
  return {
    ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: mine.map(place("user")), hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), graveyard: [], exile: [], library, manaPool: { ...s0.players.user.manaPool, ...mana } },
      ai: { ...s0.players.ai, battlefield: theirs.map(place("ai")), graveyard: [], exile: [] } },
  };
}
const stackTriggers = (s) => (s.stack || []).filter((o) => o.kind === "triggered-ability").map((o) => `${o.controller}:${o.source?.name}`);
const pendingTriggers = (s) => (s.pendingTriggers || []).map((t) => `${t.controller}:${t.source?.name}`);
const countOf = (list, entry) => list.filter((x) => x === entry).length;
const tokensOf = (s) => s.players.user.battlefield.filter((p) => p.card?.token);
const crashOf = (s) => (s.log || []).find((e) => e.kind === "stack-resolve-error");
function act(s, pick) {
  const a = legalActionsForPlayer(s, "user").find(pick);
  expect(a).toBeTruthy();
  return dispatchAction(s, a);
}
/** Resolve whatever is on the stack (the activation, then the token-copy's own triggers). */
function drain(s) {
  let n = s;
  for (let g = 0; n.stack?.length && !n.pendingChoice && g < 20; g++) n = resolveTopOfStack(n);
  expect(crashOf(n)).toBeUndefined();
  return n;
}
/** Step the turn to its end step, where the delayed leave is the one ability on the stack, and resolve it. */
function resolveEndStepLeave(s, sourceName) {
  let n = s;
  for (let h = 0; h < 30 && n.step !== "end"; h++) {
    n = runStepActions(advanceStep(n));
    for (let k = 0; n.stack.length && n.step !== "end" && k < 10; k++) n = resolveTopOfStack(n);
  }
  expect(n.step).toBe("end");
  expect(stackTriggers(n)).toEqual([`user:${sourceName}`]); // the CR 603.7 delayed leave, and nothing else
  n = resolveTopOfStack(n);
  expect(crashOf(n)).toBeUndefined();
  return n;
}

// ① Kiki-Jiki copies Grizzly Bears; a doubler makes it two tokens; the end step sacrifices "it" — both of them.
function kikiCopiesBears(extra) {
  const s = drain(act(board({ mine: [["kiki", KIKI], ["bear", GRIZZLY_BEARS], ...extra] }),
    (a) => a.kind === "activate-ability" && a.permanentId === "kiki" && a.targets?.[0]?.id === "bear"));
  return { made: tokensOf(s).map((t) => t.id), end: resolveEndStepLeave(s, KIKI.name) };
}
const WATCHERS = [["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]];

describe("① the minted tokens' end-step SACRIFICE is one event (CR 603.2c)", () => {
  for (const [doubler, card] of [["Parallel Lives", PARALLEL_LIVES], ["Doubling Season", DOUBLING_SEASON], ["Anointed Procession", ANOINTED_PROCESSION]]) {
    it(`⭐ Kiki-Jiki under ${doubler}: two tokens sacrificed together — Vengeful Townsfolk ONCE, Blood Artist and Korvold once per token`, () => {
      const { made, end } = kikiCopiesBears([["doubler", card], ...WATCHERS]);
      expect(made).toHaveLength(2);
      expect(made.filter((id) => end.players.user.battlefield.some((p) => p.id === id))).toEqual([]);
      const t = stackTriggers(end);
      expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
      expect(countOf(t, "user:Blood Artist")).toBe(2);
      expect(countOf(t, "user:Korvold, Fae-Cursed King")).toBe(2);
      expect(end.players.user.creaturesDiedThisTurn).toBe(2);
      expect(end.log.filter((e) => e.effect === "sacrifice-together").map((e) => e.sacrificed)).toEqual([made]);
    });
  }

  it("⛔ under Rest in Peace the two tokens are exiled instead: no dies trigger — one leave batch, so Dour Port-Mage draws ONCE; Korvold sees two sacrifices", () => {
    const { made, end } = kikiCopiesBears([["doubler", PARALLEL_LIVES], ["rip", REST_IN_PEACE], ["mage", DOUR_PORT_MAGE], ...WATCHERS]);
    expect(made).toHaveLength(2);
    const t = stackTriggers(end);
    expect(countOf(t, "user:Dour Port-Mage")).toBe(1);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(0);
    expect(countOf(t, "user:Blood Artist")).toBe(0);
    expect(countOf(t, "user:Korvold, Fae-Cursed King")).toBe(2);
    expect(end.players.user.creaturesDiedThisTurn || 0).toBe(0);
  });

  it("CONTROL — no doubler: one token, one of each trigger", () => {
    const { made, end } = kikiCopiesBears(WATCHERS);
    expect(made).toHaveLength(1);
    const t = stackTriggers(end);
    expect([countOf(t, "user:Vengeful Townsfolk"), countOf(t, "user:Blood Artist"), countOf(t, "user:Korvold, Fae-Cursed King")]).toEqual([1, 1, 1]);
    expect(end.players.user.creaturesDiedThisTurn).toBe(1);
  });

  it("⭐ Orthion's \"Sacrifice them\" without a doubler: five copies, Vengeful Townsfolk ONCE, Blood Artist five times", () => {
    let s = board({ mine: [["orthion", ORTHION], ["bear", GRIZZLY_BEARS], ["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST]], mana: { R: 3, C: 6 } });
    s = drain(act(s, (a) => a.kind === "activate-ability" && a.permanentId === "orthion" && a.abilityIndex === 1 && a.targets?.[0]?.id === "bear"));
    expect(tokensOf(s)).toHaveLength(5);
    const end = resolveEndStepLeave(s, ORTHION.name);
    expect(tokensOf(end)).toEqual([]);
    const t = stackTriggers(end);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(5);
  });
});

describe("② the minted tokens' end-step EXILE is one event", () => {
  it("⭐ Stormsplitter under Anointed Procession: two copies, ONE exile naming both — Dour Port-Mage draws once", () => {
    let s = board({ mine: [["storm", STORMSPLITTER], ["doubler", ANOINTED_PROCESSION], ["mage", DOUR_PORT_MAGE]], hand: [LIGHTNING_BOLT], mana: { R: 1 } });
    s = drain(act(s, (a) => a.kind === "cast-spell" && a.cardId === "h0" && a.targets?.[0]?.id === "ai"));
    const made = tokensOf(s).map((t) => t.id);
    expect(made).toHaveLength(2);
    const end = resolveEndStepLeave(s, STORMSPLITTER.name);
    expect(tokensOf(end)).toEqual([]);
    const exiles = end.log.filter((e) => e.kind === "spell-effect" && e.effect === "exile" && (e.targets || []).some((id) => made.includes(id)));
    expect(exiles.map((e) => e.targets)).toEqual([made]);
    expect(countOf(stackTriggers(end), "user:Dour Port-Mage")).toBe(1);
  });
});

describe("③ a cost that sacrifices N permanents is one event", () => {
  const VICTIMS = [["m1", MEMNITE], ["m2", MEMNITE]]; // mana value 0: the least valuable, so the frozen victims

  it("⭐ Tooth and Claw sacrificing two Memnites: Vengeful Townsfolk ONCE, Blood Artist and Korvold twice", () => {
    const s = act(board({ mine: [["claw", TOOTH_AND_CLAW], ...VICTIMS, ...WATCHERS] }), (a) => a.kind === "activate-ability" && a.permanentId === "claw");
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Memnite", "Memnite"]);
    const t = stackTriggers(s);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
    expect(countOf(t, "user:Korvold, Fae-Cursed King")).toBe(2);
    expect(s.stack.some((o) => o.kind === "activated-ability" && o.source?.name === TOOTH_AND_CLAW.name)).toBe(true);
  });

  it("⭐ Bankrupt in Blood's additional cost (two creatures): Vengeful Townsfolk ONCE, Blood Artist twice", () => {
    const s = act(board({ mine: [...VICTIMS, ["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST]], hand: [BANKRUPT_IN_BLOOD], mana: { B: 1, C: 1 } }),
      (a) => a.kind === "cast-spell" && a.cardId === "h0" && !a.altCost);
    expect(s.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Memnite", "Memnite"]);
    const t = stackTriggers(s);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
  });

  it("⭐ Pulverize's \"sacrifice two Mountains\" under Living Plane (the Mountains are 1/1 creatures): Vengeful Townsfolk ONCE", () => {
    const s = act(board({ mine: [["mt1", MOUNTAIN], ["mt2", MOUNTAIN], ["plane", LIVING_PLANE], ["towns", VENGEFUL_TOWNSFOLK]], hand: [PULVERIZE] }),
      (a) => a.kind === "cast-spell" && a.cardId === "h0" && a.altCost?.kind === "sacrificeLands");
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Mountain", "Mountain"]);
    expect(countOf(stackTriggers(s), "user:Vengeful Townsfolk")).toBe(1);
  });

  it("CONTROL — without Vengeful Townsfolk the per-creature watcher is unchanged: Tooth and Claw's two victims, Blood Artist twice", () => {
    const s = act(board({ mine: [["claw", TOOTH_AND_CLAW], ...VICTIMS, ["artist", BLOOD_ARTIST]] }), (a) => a.kind === "activate-ability" && a.permanentId === "claw");
    expect(stackTriggers(s)).toEqual(["user:Blood Artist", "user:Blood Artist"]);
  });
});

describe("④ Gush's \"return two Islands\" is one event", () => {
  it("⭐ under Living Plane the Islands are creatures leaving without dying: Dour Port-Mage draws ONCE", () => {
    const s = act(board({ mine: [["i1", ISLAND], ["i2", ISLAND], ["plane", LIVING_PLANE], ["mage", DOUR_PORT_MAGE]], hand: [GUSH] }),
      (a) => a.kind === "cast-spell" && a.cardId === "h0" && a.altCost?.kind === "returnLandsToHand");
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Island", "Island"]);
    expect(countOf(stackTriggers(s), "user:Dour Port-Mage")).toBe(1);
  });
});

describe("⑤ an effect that sacrifices two lands is one event", () => {
  const LANDS = [["f1", FOREST], ["f2", FOREST], ["plane", LIVING_PLANE], ["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST]];

  it("⭐ Cosmic Larva paid with two Forests under Living Plane: Vengeful Townsfolk ONCE, Blood Artist twice", () => {
    const s0 = board({ mine: [["larva", COSMIC_LARVA], ...LANDS] });
    const paused = { ...s0, phase: "beginning", step: "upkeep", pendingChoice: { kind: "sac-unless-pay", controller: "user", cost: { kind: "sacrifice", type: "land", count: 2 }, sourceId: "larva", sourceName: COSMIC_LARVA.name } };
    const s = resolveSacUnlessPayChoice(paused, true);
    expect(s.players.user.battlefield.some((p) => p.id === "larva")).toBe(true);
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Forest", "Forest"]);
    const t = pendingTriggers(s);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
  });

  it("⭐ Planar Engineering with exactly two lands (no choice) under Living Plane: Vengeful Townsfolk ONCE, Blood Artist twice", () => {
    const s = applySacrificeLand(board({ mine: LANDS }), { op: "sacrifice-land", count: 2 }, { controller: "user", cardName: "Planar Engineering" });
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Forest", "Forest"]);
    const t = pendingTriggers(s);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
  });

  it("CONTROL — Planar Engineering's lands without Living Plane are no creatures: nothing dies, no trigger", () => {
    const s = applySacrificeLand(board({ mine: [["f1", FOREST], ["f2", FOREST], ["towns", VENGEFUL_TOWNSFOLK], ["artist", BLOOD_ARTIST]] }), { op: "sacrifice-land", count: 2 }, { controller: "user", cardName: "Planar Engineering" });
    expect(s.players.user.graveyard.map((c) => c.name)).toEqual(["Forest", "Forest"]);
    expect(pendingTriggers(s)).toEqual([]);
  });
});
