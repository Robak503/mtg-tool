/**
 * reflectionsOfLittjara.test.js — REFLECTIONS OF LITTJARA (the play-weighted program, EDHREC #689):
 *
 *   "As this enchantment enters, choose a creature type.
 *    Whenever you cast a spell of the chosen type, copy that spell. (A copy of a permanent spell becomes a token.)"
 *
 * The chosen type and the chosen-type cast trigger already read; "copy that spell" had no atom. effects/atoms/stack.js
 * applyCopyCastSpell copies the cast that triggered it — its targets, X and kicker (CR 707.10), keeping its targets (CR 707.10c applies
 * only when an effect says so) — above the spell (the bundled ruling: the ability and its copy resolve first); a permanent spell's copy
 * resolves as a token (CR 707.10f, 608.3f; the ruling: it isn't "created"). A spell countered in response is still copied, from its
 * last known information (CR 608.2h — the snapshot the cast trigger carries). The bundled rulings witnessed: a Kindred spell of the
 * chosen type is copied; the chosen type must be a creature type. Twin: Double Down ("an outlaw spell").
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REFLECTIONS = {"name":"Reflections of Littjara","type":"Enchantment","mana":"{4}{U}","oracle":"As this enchantment enters, choose a creature type.\nWhenever you cast a spell of the chosen type, copy that spell. (A copy of a permanent spell becomes a token.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #689
const DOUBLE_DOWN = {"name":"Double Down","type":"Enchantment","mana":"{3}{U}","oracle":"Whenever you cast an outlaw spell, copy that spell. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws. Copies of permanent spells become tokens.)","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6165
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const OUTCAST = {"name":"Changeling Outcast","type":"Creature — Shapeshifter","mana":"{B}","oracle":"Changeling (This card is every creature type.)\nThis creature can't block and can't be blocked.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Changeling"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #681
const CRIB_SWAP = {"name":"Crib Swap","type":"Kindred Instant — Shapeshifter","mana":"{2}{W}","oracle":"Changeling (This card is every creature type.)\nExile target creature. Its controller creates a 1/1 colorless Shapeshifter creature token with changeling.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Changeling"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #2456
const LIGNIFY = {"name":"Lignify","type":"Kindred Enchantment — Treefolk Aura","mana":"{1}{G}","oracle":"Enchant creature\nEnchanted creature is a Treefolk with base power and toughness 0/4 and loses all abilities.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #2322
const BALLISTA = {"name":"Walking Ballista","type":"Artifact Creature — Construct","mana":"{X}{X}","oracle":"This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.","layout":"normal","cmc":0,"power":"0","toughness":"0","loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #425
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","oracle":"Counter target spell.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #16
const BLACKGUARD = {"name":"Bane Alley Blackguard","type":"Creature — Human Rogue","mana":"{1}{B}","oracle":"","layout":"normal","cmc":2,"power":"1","toughness":"3","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #29007
const FORUM = {"name":"Guildmages' Forum","type":"Land","mana":"","oracle":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color. If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1 counter on it.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #9685
const WATCHWOLF = {"name":"Watchwolf","type":"Creature — Wolf","mana":"{G}{W}","oracle":"","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["G","W"],"colorIdentity":["G","W"]}; // EDHREC #13001
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]}; // EDHREC #—
const TARFIRE = {"name":"Tarfire","type":"Kindred Instant — Goblin","mana":"{R}","oracle":"Tarfire deals 2 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #16089
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const lib = (seat, card = PLAINS) => Array.from({ length: 5 }, (_, i) => ({ ...card, id: `L-${seat}-${i}` }));
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
/** `seat`'s main phase: Reflections (chosen type `type`) on the battlefield unless `reflections: false`; mana floated for the casts. */
function table({ seat = "user", type = "Bear", reflections = true, ward = REFLECTIONS, hand = [], bf = [], oppBf = [], oppHand = [], library = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const mine = [...(reflections ? [on(seat, "refl", ward, { chosenType: type })] : []), ...bf];
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: mine, hand, graveyard: [], library: library || lib(seat), manaPool: { ...POOL } },
    [opp]: { ...g.players[opp], battlefield: oppBf, hand: oppHand, graveyard: [], library: lib(opp), manaPool: { ...POOL } } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, stack: [], pendingTriggers: [] };
}
function settle(s, max = 40) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < max) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
const castOf = (s, seat, cardId, pred = () => true) => legalActionsForPlayer(s, seat).find((a) => a.kind === "cast-spell" && a.cardId === cardId && pred(a));
/** Cast and put its triggers on the stack (nothing resolves yet). */
function cast(s, seat, cardId, pred) {
  const a = castOf(s, seat, cardId, pred);
  expect(a, `no cast of ${cardId}`).toBeTruthy();
  return flushTriggers(dispatchAction(s, a), { chooseTargets: chooseTriggerTargets });
}
const onBf = (s, seat, name) => s.players[seat].battlefield.filter((p) => p.card?.name === name);
const copies = (s) => (s.log || []).filter((e) => e.effect === "copy-cast-spell");

describe("the card", () => {
  it("⭐ native: the type chosen as it enters and the copy trigger", () => {
    expect(classifyCard(REFLECTIONS)).toBe("native-trigger");
  });
  it("⭐ cast from hand, it chooses a creature type as it enters (its controller's most common one)", () => {
    const g = table({ reflections: false, hand: [{ ...REFLECTIONS, id: "h-refl" }], bf: [on("user", "b0", BEARS), on("user", "b1", BEARS)] });
    const s = settle(dispatchAction(g, castOf(g, "user", "h-refl")));
    expect(onBf(s, "user", "Reflections of Littjara")[0]?.chosenType).toBe("Bear");
  });
});

describe("copy that spell", () => {
  it("⭐ a creature spell of the chosen type: the copy goes on the stack above it and resolves first, as a token; then the Bears", () => {
    const s0 = cast(table({ hand: [{ ...BEARS, id: "h-bears" }] }), "user", "h-bears");
    const trig = s0.stack[s0.stack.length - 1];
    const s1 = resolveTopOfStack(s0);
    const top = s1.stack[s1.stack.length - 1];
    const s2 = resolveTopOfStack(s1);
    const afterCopy = onBf(s2, "user", "Grizzly Bears");
    const s = settle(s2);
    const bears = onBf(s, "user", "Grizzly Bears");
    expect({ trigger: trig?.kind === "trigger" || trig?.kind === "ability" || !!trig?.payload, copyOnTop: { isCopy: !!top?.isCopy, name: top?.source?.name, token: !!top?.source?.token },
      afterCopy: afterCopy.map((p) => !!p.card?.token), bears: bears.length, tokens: bears.filter((p) => p.card?.token).length, graveyard: s.players.user.graveyard.length })
      .toEqual({ trigger: true, copyOnTop: { isCopy: true, name: "Grizzly Bears", token: true }, afterCopy: [true], bears: 2, tokens: 1, graveyard: 0 });
  });
  it("⛔ a spell not of the chosen type (Hill Giant): no copy", () => {
    const s = settle(cast(table({ hand: [{ ...GIANT, id: "h-giant" }] }), "user", "h-giant"));
    expect({ giants: onBf(s, "user", "Hill Giant").length, copies: copies(s).length }).toEqual({ giants: 1, copies: 0 });
  });
  it("⛔ an opponent's spell of the chosen type: no copy", () => {
    const g = table({ oppHand: [{ ...BEARS, id: "o-bears" }] });
    const s = settle(cast({ ...g, activePlayer: "ai", priorityHolder: "ai" }, "ai", "o-bears"));
    expect({ aiBears: onBf(s, "ai", "Grizzly Bears").length, userBears: onBf(s, "user", "Grizzly Bears").length }).toEqual({ aiBears: 1, userBears: 0 });
  });
  it("⭐ a changeling creature spell is every creature type: copied with a Giant chosen", () => {
    const s = settle(cast(table({ type: "Giant", hand: [{ ...OUTCAST, id: "h-out" }] }), "user", "h-out"));
    expect(onBf(s, "user", "Changeling Outcast").map((p) => !!p.card?.token).sort()).toEqual([false, true]);
  });
  it("⭐ a Kindred instant of the chosen type (Tarfire, a Goblin) is copied with its target: the AI takes 2 twice (40 → 36); with no Reflections, once (40 → 38)", () => {
    const at = (reflections) => settle(cast(table({ type: "Goblin", reflections, hand: [{ ...TARFIRE, id: "h-tar" }] }), "user", "h-tar", (a) => (a.targets || []).some((t) => t.id === "ai")));
    const withIt = at(true);
    const without = at(false);
    expect({ withIt: withIt.players.ai.life, copies: copies(withIt).length, without: without.players.ai.life, gy: withIt.players.user.graveyard.map((c) => c.name) })
      .toEqual({ withIt: 36, copies: 1, without: 38, gy: ["Tarfire"] });
  });
  it("⭐ a Kindred instant that is every creature type (Crib Swap, a changeling) is copied with a Bear chosen: the copy exiles the Giant, the original fizzles", () => {
    const s = settle(cast(table({ type: "Bear", hand: [{ ...CRIB_SWAP, id: "h-crib" }], oppBf: [on("ai", "og", GIANT)] }), "user", "h-crib", (a) => (a.targets || []).some((t) => t.id === "og")));
    expect({ copies: copies(s).length, giant: onBf(s, "ai", "Hill Giant").length, exiled: s.players.ai.exile.map((c) => c.name), aiTokens: s.players.ai.battlefield.filter((p) => p.card?.token).length, gy: s.players.user.graveyard.map((c) => c.name) })
      .toEqual({ copies: 1, giant: 0, exiled: ["Hill Giant"], aiTokens: 1, gy: ["Crib Swap"] });
  });
  it("⭐ a mana rider on the spell is not copied (CR 707.2): Watchwolf cast with Guildmages' Forum's mana enters with its +1/+1 counter, the token copy without one", () => {
    const g = table({ type: "Wolf", hand: [{ ...WATCHWOLF, id: "h-wolf" }], bf: [on("user", "gf", FORUM), on("user", "f1", FOREST), on("user", "f2", FOREST)] });
    const dry = { ...g, players: { ...g.players, user: { ...g.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } } } };
    const s = settle(cast(dry, "user", "h-wolf"));
    expect(onBf(s, "user", "Watchwolf").map((p) => [!!p.card?.token, p.counters?.["+1/+1"] || 0]).sort()).toEqual([[false, 1], [true, 0]]);
  });
  it("⭐ an Aura spell of the chosen type (Lignify, a Treefolk) is copied with its target: two Lignifies, one a token, on the same creature", () => {
    const s = settle(cast(table({ type: "Treefolk", hand: [{ ...LIGNIFY, id: "h-lig" }], oppBf: [on("ai", "og", GIANT)] }), "user", "h-lig", (a) => (a.targets || []).some((t) => t.id === "og")));
    const ligs = onBf(s, "user", "Lignify");
    expect({ count: ligs.length, tokens: ligs.filter((p) => p.card?.token).length, attachedTo: [...new Set(ligs.map((p) => p.attachedTo))] }).toEqual({ count: 2, tokens: 1, attachedTo: ["og"] });
  });
  it("⭐ the copy copies X (CR 707.10): Walking Ballista cast with X = 2 — both enter with two +1/+1 counters", () => {
    const s = settle(cast(table({ type: "Construct", hand: [{ ...BALLISTA, id: "h-bal" }] }), "user", "h-bal", (a) => a.xValue === 2));
    expect(onBf(s, "user", "Walking Ballista").map((p) => [!!p.card?.token, p.counters?.["+1/+1"] || 0]).sort()).toEqual([[false, 2], [true, 2]]);
  });
  it("⭐ the spell countered in response to the trigger is still copied (its last known information): the token enters, the card goes to the graveyard", () => {
    const g = table({ hand: [{ ...BEARS, id: "h-bears" }], oppHand: [{ ...COUNTERSPELL, id: "o-cs" }] });
    let s = cast(g, "user", "h-bears");
    const bearsSpell = s.stack.find((o) => o.source?.name === "Grizzly Bears");
    s = { ...s, priorityHolder: "ai" };
    const counter = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "o-cs" && (a.targets || []).some((t) => t.id === bearsSpell?.id));
    s = dispatchAction(s, counter);
    s = resolveTopOfStack(s); // the Counterspell resolves first
    s = settle(s);
    const bears = onBf(s, "user", "Grizzly Bears");
    expect({ bears: bears.map((p) => !!p.card?.token), gy: s.players.user.graveyard.map((c) => c.name), fromLki: copies(s).map((e) => e.fromLastKnown) }).toEqual({ bears: [true], gy: ["Grizzly Bears"], fromLki: [true] });
  });
});

describe("the twin and the default AI", () => {
  it("⭐ Double Down: a Rogue spell (an outlaw) is copied; a Bear spell is not", () => {
    expect(classifyCard(DOUBLE_DOWN)).toBe("native-trigger");
    const g = table({ reflections: false, bf: [on("user", "dd", DOUBLE_DOWN)], hand: [{ ...BLACKGUARD, id: "h-rogue" }, { ...BEARS, id: "h-bears" }] });
    const s = settle(cast(settle(cast(g, "user", "h-rogue")), "user", "h-bears"));
    expect({ rogues: onBf(s, "user", "Bane Alley Blackguard").map((p) => !!p.card?.token).sort(), bears: onBf(s, "user", "Grizzly Bears").length }).toEqual({ rogues: [false, true], bears: 1 });
  });
  it("⭐ an AI seat's Reflections copies its own spell of the chosen type (the trigger asks it nothing)", () => {
    const s = settle(cast(table({ seat: "ai", hand: [{ ...BEARS, id: "h-bears" }] }), "ai", "h-bears"));
    expect(onBf(s, "ai", "Grizzly Bears").map((p) => !!p.card?.token).sort()).toEqual([false, true]);
  });
});
