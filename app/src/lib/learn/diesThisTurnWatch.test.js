/**
 * diesThisTurnWatch.test.js — "When that creature dies this turn, …" (shelf decks D25, 2026-09-30: Halfshell heroes'
 * Together Forever). The delayed trigger a resolving spell or ability creates on the creature its previous clause targeted
 * (CR 603.7): a watch keyed on that permanent, fired from the death chokepoint when it dies this turn, lapsing with the
 * turn. "Return that card to its owner's hand" finds the card in the graveyard it went to (CR 400.7e); a token never comes
 * back (CR 111.8). The sentence never begins an ability, so it is no longer read as a printed self-dies trigger.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the parser's fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAttackTriggers, checkDiesTriggers, detectTriggers } from "./triggers.js";
import { fireDiesWatches } from "./effects/atoms/delayedTrigger.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TOGETHER = { name: "Together Forever", type: "Enchantment", mana: "{W}{W}", keywords: ["Support"],
  oracle: "When this enchantment enters, support 2. (Put a +1/+1 counter on each of up to two target creatures.)\n{1}: Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand." };
const DEFIANCE = { name: "Blessed Defiance", type: "Instant", mana: "{W}", keywords: [], colors: ["W"], oracle: "Target creature you control gets +2/+0 and gains lifelink until end of turn. When that creature dies this turn, create a 1/1 white Spirit creature token with flying." };
const MARK = { name: "Make Your Mark", type: "Instant", mana: "{R/W}", keywords: [], colors: ["R", "W"], oracle: "Target creature gets +1/+0 until end of turn. When that creature dies this turn, create a 3/2 red and white Spirit creature token." };
const OUTBURST = { name: "Otherworldly Outburst", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Target creature gets +1/+0 until end of turn. When that creature dies this turn, create a 3/2 colorless Eldrazi Horror creature token." };
const MALICE = { name: "Scarblade's Malice", type: "Instant", mana: "{B}", keywords: [], colors: ["B"], oracle: "Target creature you control gains deathtouch and lifelink until end of turn. When that creature dies this turn, create a 2/2 black and green Elf creature token." };
const RAGE = { name: "Felonious Rage", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Target creature you control gets +2/+0 and gains haste until end of turn. When that creature dies this turn, create a 2/2 white and blue Detective creature token." };
const JAVELINEER = { name: "Grim Javelineer", type: "Creature — Human Warrior", mana: "{2}{B}", power: "3", toughness: "2", keywords: ["Surveil"], oracle: "Whenever you attack, target attacking creature gets +1/+0 until end of turn. When that creature dies this turn, surveil 1. (Look at the top card of your library. You may put that card into your graveyard.)" };
const SANDALS = { name: "Sandals of Abdallah", type: "Artifact", mana: "{4}", keywords: [], oracle: "{2}, {T}: Target creature gains islandwalk until end of turn. When that creature dies this turn, destroy this artifact. (A creature with islandwalk can't be blocked as long as defending player controls an Island.)" };
const WOUND = { name: "Virulent Wound", type: "Instant", mana: "{B}", keywords: [], oracle: "Put a -1/-1 counter on target creature. When that creature dies this turn, its controller gets a poison counter." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const NINJA_TOKEN = { name: "Ninja", type: "Token Creature — Ninja", mana: "", power: "1", toughness: "1", keywords: [], oracle: "", token: true };

function table({ user = [], ai = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: lib, manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const P = (id, c, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no action"); return dispatchAction(s, a); }
/** Resolve the stack, putting any triggers that fire onto it, until a choice or quiet. */
const settle = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  // The engine logs a crashing resolver as a stack-resolve-error rather than throwing — fail loudly instead of passing over one.
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
const cast = (s, id, target) => settle(act(s, (a) => a.kind === "cast-spell" && a.cardId === id && a.targets?.[0]?.id === target));
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.token).map((p) => `${p.card.power}/${p.card.toughness}`);
const watches = (s) => (s.delayedTriggers || []).filter((r) => r.watchDies).length;
const inHand = (s, cardId) => s.players.user.hand.some((c) => c.id === cardId);
const onField = (s, id) => Object.values(s.players).some((p) => p.battlefield.some((x) => x.id === id));

describe("the cards", () => {
  it("Together Forever: \"Choose target creature with a counter on it\" + the watch; no phantom self-dies trigger; reads native", () => {
    const p = parseEffectClause("Choose target creature with a counter on it. When that creature dies this turn, return that card to its owner's hand.", "Instant");
    expect({ events: detectTriggers(TOGETHER).map((d) => d.event), atoms: p.atoms, tier: classifyCard(TOGETHER) }).toEqual({
      events: ["etb"],
      atoms: [
        { op: "choose-target", targetType: "creature", restrictions: [{ kind: "hasCounter", counterType: null }] },
        { op: "watch-dies-this-turn", bindPreviousTargets: true, targetType: null, payoffKind: "diedCardToHand" },
      ],
      tier: "native-mixed",
    });
  });
  it("the five spells and Grim Javelineer read native; the watch rides the Javelineer trigger's own effect", () => {
    const tiers = Object.fromEntries([DEFIANCE, MARK, OUTBURST, MALICE, RAGE, JAVELINEER].map((c) => [c.name, classifyCard(c)]));
    expect({ tiers, javelineer: detectTriggers(JAVELINEER).map((d) => d.effectClause) }).toEqual({
      tiers: { "Blessed Defiance": "native-spell", "Make Your Mark": "native-spell", "Otherworldly Outburst": "native-spell", "Scarblade's Malice": "native-spell", "Felonious Rage": "native-spell", "Grim Javelineer": "native-trigger" },
      javelineer: ["target attacking creature gets +1/+0 until end of turn. When that creature dies this turn, surveil 1"],
    });
  });
});

describe("⛔ the fences", () => {
  it("a payoff that names an object stays unclaimed: Sandals of Abdallah (\"destroy this artifact\") and Virulent Wound (\"its controller\")", () => {
    expect({ sandals: classifyCard(SANDALS), sandalsTriggers: detectTriggers(SANDALS).length, wound: classifyCard(WOUND) })
      .toEqual({ sandals: expect.not.stringMatching(/^native/), sandalsTriggers: 0, wound: expect.not.stringMatching(/^native/) });
  });
  it("SYNTHETIC clauses: a choice nothing refers to, a watch with no antecedent, a payoff with its own target, one unmodeled, one naming the dead creature — all LOW", () => {
    const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
    expect({
      control: conf("Target creature gets +1/+0 until end of turn. When that creature dies this turn, draw a card."),
      bareChoice: conf("Choose target creature."),
      noAntecedent: conf("When that creature dies this turn, draw a card."),
      targetedPayoff: conf("Target creature gets +1/+0 until end of turn. When that creature dies this turn, destroy target artifact."),
      unmodeledPayoff: conf("Target creature gets +1/+0 until end of turn. When that creature dies this turn, you win a prize."),
      // "a copy of it" parses HIGH alone (the triggering-creature copy) — but a fired watch has no triggering creature
      // to copy, so only the referent fence stops a native claim that would create nothing.
      referentPayoff: conf("Target creature gets +1/+0 until end of turn. When that creature dies this turn, create a token that's a copy of it."),
    }).toEqual({ control: "high", bareChoice: "low", noAntecedent: "low", targetedPayoff: "low", unmodeledPayoff: "low", referentPayoff: "low" });
  });
});

describe("⭐ in play — Together Forever", () => {
  const board = () => table({
    user: [P("tf", TOGETHER), P("bearC", BEAR, "user", { counters: { "+1/+1": 1 } }), P("bear", BEAR)],
    ai: [P("aiBearC", BEAR, "ai", { counters: { "+1/+1": 1 } })],
    hand: [["bolt1", BOLT], ["bolt2", BOLT]], mana: { C: 1, R: 2 },
  });
  const activate = (s, target) => settle(act(s, (a) => a.kind === "activate-ability" && a.permanentId === "tf" && a.targets?.[0]?.id === target));

  it("⭐ only creatures with a counter are offered; the chosen Bear, bolted, comes back to its owner's hand", () => {
    const s0 = board();
    const offered = legalActionsForPlayer(s0, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "tf").map((a) => a.targets?.[0]?.id).sort();
    const watched = activate(s0, "bearC");
    const after = cast(watched, "bolt1", "bearC");
    const row = { offered, watches: watches(watched), died: !onField(after, "bearC"), backInHand: inHand(after, "c-bearC"), watchesAfter: watches(after) };
    console.log(`WITNESS togetherForever ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["aiBearC", "bearC"], watches: 1, died: true, backInHand: true, watchesAfter: 0 });
  });
  it("another creature dying does not fire it; the watched one, exiled instead, never died (CR 700.4)", () => {
    const watched = activate(board(), "bearC");
    const other = cast(watched, "bolt1", "bear");
    const bearC = other.players.user.battlefield.find((p) => p.id === "bearC");
    const look = { controller: "user", id: "bearC", name: bearC.card.name, card: bearC.card, counters: { ...bearC.counters } };
    const fires = (flag) => (checkDiesTriggers(other, [{ ...look, [flag]: true }]).pendingTriggers || []).length;
    expect({ otherDied: !onField(other, "bear"), returned: inHand(other, "c-bear") || inHand(other, "c-bearC"), stillWatching: watches(other), exiledFires: fires("exileInstead"), shuffledFires: fires("shuffledInstead") })
      .toEqual({ otherDied: true, returned: false, stillWatching: 1, exiledFires: 0, shuffledFires: 0 });
  });
  it("the watch lapses with the turn (CR 603.7b): gone by the next turn's upkeep", () => {
    let s = activate(board(), "bearC");
    let g = 0;
    while (!(s.turn === 7 && s.step === "upkeep") && g++ < 40) s = runStepActions(advanceStep(s)); // as the driver steps: enter, then run the step's actions
    expect({ turn: s.turn, step: s.step, watches: watches(s) }).toEqual({ turn: 7, step: "upkeep", watches: 0 });
  });
  it("a token with a counter dies: nothing comes back (CR 111.8)", () => {
    const s0 = table({ user: [P("tf", TOGETHER), P("ninja", NINJA_TOKEN, "user", { counters: { "+1/+1": 1 } })], hand: [["bolt1", BOLT]], mana: { C: 1, R: 2 } });
    const after = cast(activate(s0, "ninja"), "bolt1", "ninja");
    expect({ died: !onField(after, "ninja"), handSize: after.players.user.hand.length, watches: watches(after) }).toEqual({ died: true, handSize: 0, watches: 0 });
  });
});

describe("the watch's own rules", () => {
  const rec = (extra) => ({ id: "dly-1-6", controller: "user", watchDies: "bear", effectClause: "draw a card", createdTurn: 6, ...extra });
  const dead = [{ controller: "user", id: "bear", name: "Grizzly Bears", card: { ...BEAR, id: "c-bear" } }];
  it("a watch made on an earlier turn never fires, even before a step sweeps it; one whose controller left the game neither (CR 800.4a)", () => {
    const s = table();
    const fired = (r, turn = 6) => fireDiesWatches({ ...s, turn, delayedTriggers: [r] }, dead).fired.length;
    expect({ live: fired(rec()), stale: fired(rec(), 7), departed: fired(rec({ controller: "ai1" })) }).toEqual({ live: 1, stale: 0, departed: 0 });
  });
  it("SYNTHETIC: a watch made after its creature already died never fires (CR 603.7a) — destroyed first, it watches nothing", () => {
    const ODD = { name: "Synthetic Spell", type: "Instant", mana: "{B}", keywords: [], colors: ["B"], oracle: "Destroy target creature. When that creature dies this turn, draw a card." };
    const after = cast(table({ user: [P("bear", BEAR)], hand: [["odd", ODD]], mana: { B: 1 } }), "odd", "bear");
    expect({ died: !onField(after, "bear"), drew: 5 - after.players.user.library.length, watches: watches(after) }).toEqual({ died: true, drew: 0, watches: 0 });
  });
});

describe("⭐ in play — the spells and Grim Javelineer", () => {
  it("Blessed Defiance, Otherworldly Outburst, Scarblade's Malice, Felonious Rage on your Bear: bolted, it leaves its token", () => {
    const rows = {};
    for (const [card, mana] of [[DEFIANCE, { W: 1 }], [OUTBURST, { R: 1 }], [MALICE, { B: 1 }], [RAGE, { R: 1 }]]) {
      _resetIdsForTests();
      const s0 = table({ user: [P("bear", BEAR)], hand: [["spell", card], ["bolt", BOLT]], mana: { ...mana, R: (mana.R || 0) + 1 } });
      const after = cast(cast(s0, "spell", "bear"), "bolt", "bear");
      rows[card.name] = { died: !onField(after, "bear"), tokens: tokensOf(after, "user") };
    }
    expect(rows).toEqual({
      "Blessed Defiance": { died: true, tokens: ["1/1"] },
      "Otherworldly Outburst": { died: true, tokens: ["3/2"] },
      "Scarblade's Malice": { died: true, tokens: ["2/2"] },
      "Felonious Rage": { died: true, tokens: ["2/2"] },
    });
  });
  it("Make Your Mark on the OPPONENT's Bear: when it dies the 3/2 Spirit is yours — the watch's controller's (CR 603.7d)", () => {
    const s0 = table({ ai: [P("aiBear", BEAR, "ai")], hand: [["mark", MARK], ["bolt", BOLT]], mana: { R: 2 } });
    const after = cast(cast(s0, "mark", "aiBear"), "bolt", "aiBear");
    expect({ died: !onField(after, "aiBear"), mine: tokensOf(after, "user"), theirs: tokensOf(after, "ai") }).toEqual({ died: true, mine: ["3/2"], theirs: [] });
  });
  it("Grim Javelineer: you attack, the attacker it pumps dies this turn — surveil 1", () => {
    let s = { ...table({ user: [P("jav", JAVELINEER), P("bear", BEAR)], hand: [["bolt", BOLT]], mana: { R: 1 } }), phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "bear", attackingPlayer: "user", defender: "ai" }] } };
    s = settle(checkAttackTriggers(s));
    const after = cast(s, "bolt", "bear");
    const pc = after.pendingChoice;
    expect({ watches: watches(s), died: !onField(after, "bear"), asked: pc?.kind, mode: pc?.mode, looked: pc?.cards?.length }).toEqual({ watches: 1, died: true, asked: "scry-surveil", mode: "surveil", looked: 1 });
  });
});
