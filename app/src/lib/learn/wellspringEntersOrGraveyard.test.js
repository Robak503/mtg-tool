/**
 * wellspringEntersOrGraveyard.test.js — the play-weighted program: Ichor Wellspring (#963), Prized Statue (#2323), Mycosynth
 * Wellspring (#2444), with Servo Schematic, Nimblewright Schematic and Mephitic Draught.
 *
 *   "When this artifact enters or is put into a graveyard from the battlefield, <effect>."
 *
 * One triggered ability with two trigger events (CR 603.2b — an ability can trigger on either of two events). The event-
 * disjunction split (triggers.splitCompoundTriggerSentences) rewrites it to one sentence per event, each with the whole
 * effect: "When this artifact enters, <effect>" (the self etb) and "When this artifact is put into a graveyard from the
 * battlefield, <effect>" (the self-PiG `ltb` event, fired by checkLeavesTriggers for a GRAVEYARD exit only — CR 700.4: an
 * exile or a bounce is not "put into a graveyard"). The two events are disjoint, so the split never fires twice for one
 * event. Before this slice the sentence was not split: it fell to the compound-event guard and the whole card parked.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Every runtime case runs through the engine's own entry points: the cast is the offered legal action, dispatched;
 * passPriority flushes the triggers and resolves the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, compoundTriggerCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { sacrificePermanentForCost } from "./costSacrifice.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ICHOR = {"name":"Ichor Wellspring","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, draw a card."}; // body-only #963
const STATUE = {"name":"Prized Statue","type":"Artifact","mana":"{2}","cmc":2,"keywords":["Treasure"],"colors":[],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // body-only #2323
const MYCOSYNTH = {"name":"Mycosynth Wellspring","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle."}; // body-only #2444
const SERVO = {"name":"Servo Schematic","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, create a 1/1 colorless Servo artifact creature token."}; // body-only #5351
const NIMBLEWRIGHT = {"name":"Nimblewright Schematic","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, create a 1/1 colorless Construct artifact creature token."}; // body-only #6320
const DRAUGHT = {"name":"Mephitic Draught","type":"Artifact","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"When this artifact enters or is put into a graveyard from the battlefield, you draw a card and you lose 1 life."}; // body-only #8376
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Destroy target artifact."}; // native-spell
const REVOKE = {"name":"Revoke Existence","type":"Sorcery","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Exile target artifact or enchantment."}; // native-spell
const BOOMERANG = {"name":"Boomerang","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Return target permanent to its owner's hand."}; // native-spell
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land

const FAMILY = [ICHOR, STATUE, MYCOSYNTH, SERVO, NIMBLEWRIGHT, DRAUGHT];

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const lands = (card, n, prefix) => Array.from({ length: n }, (_, i) => P(`${prefix}${i}`, card, "user"));
const library = (pid) => Array.from({ length: 10 }, (_, i) => ({ id: `${pid}-lib-${i}`, ...ISLAND }));

/** A two-seat game, the user active in its precombat main with priority; `board` and `hand` are the user's. */
function table({ board = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: library(pid) };
  players.user = { ...players.user, battlefield: board, hand };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const act = (s, pred) => {
  const a = legalActionsForPlayer(s, "user").find(pred);
  if (!a) throw new Error("no matching action for user");
  return dispatchAction(s, a);
};
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
const castAt = (s, cardId, targetId = null) => act(s, (a) => a.kind === "cast-spell" && a.cardId === cardId
  && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
const onBattlefield = (s, name) => s.players.user.battlefield.filter((p) => p.card?.name === name);
const handSize = (s) => s.players.user.hand.length;
const librarySize = (s) => s.players.user.library.length;

describe("classification — the enters-or-graveyard sentence splits into its two events", () => {
  it("Ichor Wellspring: an etb half and a self-PiG (ltb) half, each with the whole effect; one compound connective", () => {
    const ds = detectTriggers(ICHOR);
    expect(ds.map((d) => `${d.event}/${d.scope}`).sort()).toEqual(["etb/self", "ltb/self"]);
    for (const d of ds) {
      expect(d.effectClause).toBe("draw a card");
      expect(triggerRoutesNatively(d)).toBe(true);
    }
    expect(compoundTriggerCount(ICHOR.oracle)).toBe(1);
  });

  it("all six carriers classify native", () => {
    expect(FAMILY.map((c) => [c.name, isNativeTier(classifyCard(c))])).toEqual(FAMILY.map((c) => [c.name, true]));
  });

  it("the name-led self subject splits the same way", () => {
    const named = { ...ICHOR, oracle: "When Ichor Wellspring enters or is put into a graveyard from the battlefield, draw a card." };
    expect(detectTriggers(named).map((d) => d.event).sort()).toEqual(["etb", "ltb"]);
  });

  it("control — \"enters or leaves the battlefield\" still splits to etb + leavesSelf (any zone), untouched", () => {
    const farmer = { name: "Brandywine Farmer", type: "Creature — Halfling Peasant", power: "1", toughness: "1", keywords: [], colors: ["G"],
      oracle: "When this creature enters or leaves the battlefield, create a Food token." };
    expect(detectTriggers(farmer).map((d) => d.event).sort()).toEqual(["etb", "leavesSelf"]);
  });

  it("CREED — the sentence inside a QUOTED grant is the recipients', never a trigger of the granter", () => {
    const granter = { name: "Probe Granter", type: "Artifact", keywords: [], colors: [],
      oracle: "Artifacts you control have \"When this artifact enters or is put into a graveyard from the battlefield, draw a card.\"" };
    expect(detectTriggers(granter)).toHaveLength(0);
    expect(compoundTriggerCount(granter.oracle)).toBe(0);
  });
});

describe("RUNTIME — the enters half and the graveyard half each fire, and only on their own events", () => {
  it("⭐ Ichor Wellspring: cast → draw a card; destroyed by Shatter → its controller draws again", () => {
    let s = table({ board: lands(MOUNTAIN, 4, "m"), hand: [{ ...ICHOR, id: "ichor" }, { ...SHATTER, id: "shatter" }] });
    const lib0 = librarySize(s);
    s = resolveStack(castAt(s, "ichor"));
    expect(onBattlefield(s, "Ichor Wellspring")).toHaveLength(1);
    expect({ hand: handSize(s), drawn: lib0 - librarySize(s) }).toEqual({ hand: 2, drawn: 1 });
    const ichorId = onBattlefield(s, "Ichor Wellspring")[0].id;
    s = resolveStack(castAt(s, "shatter", ichorId));
    expect(onBattlefield(s, "Ichor Wellspring")).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name).sort()).toEqual(["Ichor Wellspring", "Shatter"]);
    expect({ hand: handSize(s), drawn: lib0 - librarySize(s) }).toEqual({ hand: 2, drawn: 2 });
  });

  it("sacrificed (the cost sacrifice every activated cost uses) → draws a card", () => {
    let s = table({ board: [P("ichor", ICHOR, "user")] });
    const lib0 = librarySize(s);
    s = sacrificePermanentForCost(s, "user", s.players.user.battlefield[0]);
    s = resolveStack(s);
    expect(lib0 - librarySize(s)).toBe(1);
  });

  it("exiled (Revoke Existence) → NO draw: an exile is not \"put into a graveyard\" (CR 700.4)", () => {
    let s = table({ board: [P("ichor", ICHOR, "user"), ...lands(PLAINS, 2, "p")], hand: [{ ...REVOKE, id: "revoke" }] });
    const lib0 = librarySize(s);
    s = resolveStack(castAt(s, "revoke", "ichor"));
    expect(s.players.user.exile.map((c) => c.name)).toContain("Ichor Wellspring");
    expect(lib0 - librarySize(s)).toBe(0);
  });

  it("returned to hand (Boomerang) → NO draw", () => {
    let s = table({ board: [P("ichor", ICHOR, "user"), ...lands(ISLAND, 2, "i")], hand: [{ ...BOOMERANG, id: "boomerang" }] });
    const lib0 = librarySize(s);
    s = resolveStack(castAt(s, "boomerang", "ichor"));
    expect(s.players.user.hand.map((c) => c.name)).toContain("Ichor Wellspring");
    expect(lib0 - librarySize(s)).toBe(0);
  });

  it("Prized Statue: destroyed → a Treasure token for its controller", () => {
    let s = table({ board: [P("statue", STATUE, "user"), ...lands(MOUNTAIN, 2, "m")], hand: [{ ...SHATTER, id: "shatter" }] });
    s = resolveStack(castAt(s, "shatter", "statue"));
    expect(onBattlefield(s, "Prized Statue")).toHaveLength(0);
    expect(onBattlefield(s, "Treasure")).toHaveLength(1);
  });

  it("Mephitic Draught: cast → its controller draws a card and loses 1 life", () => {
    let s = table({ board: [P("s0", SWAMP, "user"), P("s1", SWAMP, "user")], hand: [{ ...DRAUGHT, id: "draught" }] });
    const before = { lib: librarySize(s), life: s.players.user.life };
    s = resolveStack(castAt(s, "draught"));
    expect({ drawn: before.lib - librarySize(s), lost: before.life - s.players.user.life }).toEqual({ drawn: 1, lost: 1 });
  });

  it("Mycosynth Wellspring: cast → its enters half asks the optional search (the engine's \"you may\" pause)", () => {
    let s = table({ board: [P("s0", SWAMP, "user"), P("s1", SWAMP, "user")], hand: [{ ...MYCOSYNTH, id: "myco" }] });
    s = castAt(s, "myco");
    let g = 0;
    while ((s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice && g++ < 50) s = passPriority(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
  });

  it("Servo Schematic: cast → one Servo; destroyed → a second Servo", () => {
    let s = table({ board: lands(MOUNTAIN, 4, "m"), hand: [{ ...SERVO, id: "servo" }, { ...SHATTER, id: "shatter" }] });
    s = resolveStack(castAt(s, "servo"));
    expect(onBattlefield(s, "Servo")).toHaveLength(1);
    const id = onBattlefield(s, "Servo Schematic")[0].id;
    s = resolveStack(castAt(s, "shatter", id));
    expect(onBattlefield(s, "Servo")).toHaveLength(2);
  });
});
