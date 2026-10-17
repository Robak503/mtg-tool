/**
 * aiEntersTriggerHold.test.js — the AI reads a permanent's own enters trigger before it casts it, the forced trigger target
 * prefers a harm its target survives, and an untap-lock Aura is a curse (2026-10-17).
 *
 * Since 2026-10-16 a MANDATORY triggered ability whose only legal targets are on the wrong side still takes one (CR 603.3d —
 * gameEngine.pickForcedTriggerCandidate). That is the rule, and it exposed three AI decisions:
 *
 *   1. THE CAST-TIME HOLD. opponentAI.pickCastAction never read a permanent's own enters trigger, so it cast Man-o'-War
 *      ("return target creature to its owner's hand") with no opposing creature and bounced its own creature or itself, and
 *      flashed Mystic Snake ("counter target spell") over its own spell. Now the cast picker previews the trigger the
 *      permanent would put on the stack as it enters (gameEngine.entersTriggerRemovesOwn: the board with the permanent on it,
 *      its enters triggers fired as checkEnterTriggers fires them, each routed and targeted exactly as the flush would —
 *      buildTriggerStack + chooseTriggerTargets) and HOLDS the card when that trigger would be forced to remove one of the
 *      AI's own permanents or spells: destroy, exile, bounce, a counter, or damage / -X/-X / -1/-1 counters it does not
 *      survive. A trigger with a correct-side target, no legal target at all (it is removed, CR 603.3d), or an optional one
 *      (declined, CR 603.5) changes nothing; neither does a forced harm its target survives.
 *   2. THE FORCED PICK prefers a harm its target is whole from by cleanup: a creature that survives the damage or the
 *      until-end-of-turn -X/-X (both end in the cleanup step, CR 514.2; lethal is CR 704.5g / 704.5f, any deathtouch damage
 *      CR 702.2b) ranks before any permanent the harm removes, and tapping a permanent that is already tapped costs nothing
 *      (only untapped permanents can be tapped, CR 701.26a). It used to take the lowest mana value whatever happened to it.
 *   3. UNTAP-LOCK AURAS. auraEntry.auraCastIntent had no reading for "Enchanted creature/permanent doesn't untap during its
 *      controller's untap step" (a lock the untap step enforces, CR 502.3), so the AI held Ice Over, Coma Veil and
 *      Claustrophobia. An Aura whose every line is its Enchant line, Flash, that lock and "When this Aura enters, tap
 *      enchanted creature/permanent." is now ENEMY — cast on the opponent's best creature (the Pacifism lane).
 *
 * Legal actions never change: every pick below is one of the actions legalActionsForPlayer offers. Every game runs through
 * the real engine (legalActionsForPlayer + pickAction for the AI's choice; dispatchAction + resolveTopOfStack for what the
 * trigger does). Real oracle fixtures (bundled Scryfall oracle-index, probed 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import * as engine from "./gameEngine.js";
const { resolveTopOfStack } = engine;
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { auraCastIntent, auraEntryIntent } from "./auraEntry.js";
import { permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (bundled Scryfall oracle-index, 2026-10-17) ──────────────
const MANOWAR = {"name":"Man-o'-War","type":"Creature — Jellyfish","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"When this creature enters, return target creature to its owner's hand.","power":"2","toughness":"2"};
const SNAKE = {"name":"Mystic Snake","type":"Creature — Snake","mana":"{1}{G}{U}{U}","cmc":4,"keywords":["Flash"],"colors":["G","U"],"oracle":"Flash\nWhen this creature enters, counter target spell.","power":"2","toughness":"2"};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"","power":"2","toughness":"2"};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"","power":"3","toughness":"3"};
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"keywords":[],"colors":["G"],"oracle":"","power":"6","toughness":"4"};
const FIRE_IMP = {"name":"Fire Imp","type":"Creature — Imp","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"When this creature enters, it deals 2 damage to target creature.","power":"2","toughness":"1"};
const FTK = {"name":"Flametongue Kavu","type":"Creature — Kavu","mana":"{3}{R}","cmc":4,"keywords":[],"colors":["R"],"oracle":"When this creature enters, it deals 4 damage to target creature.","power":"4","toughness":"2"};
const DISRUPTOR = {"name":"Network Disruptor","type":"Artifact Creature — Moonfolk Rogue","mana":"{U}","cmc":1,"keywords":["Flying"],"colors":["U"],"oracle":"Flying\nWhen this creature enters, tap target permanent.","power":"1","toughness":"1"};
const BONEFLINGER = {"name":"Farbog Boneflinger","type":"Creature — Zombie","mana":"{4}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"When this creature enters, target creature gets -2/-2 until end of turn.","power":"2","toughness":"2"};
const ARCHETYPE = {"name":"Archetype of Finality","type":"Enchantment Creature — Gorgon","mana":"{4}{B}{B}","cmc":6,"keywords":[],"colors":["B"],"oracle":"Creatures you control have deathtouch.\nCreatures your opponents control lose deathtouch and can't have or gain deathtouch.","power":"2","toughness":"3"};
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"keywords":[],"colors":["G"],"oracle":"When this creature enters, draw a card.","power":"1","toughness":"1"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const ICE_OVER = {"name":"Ice Over","type":"Enchantment — Aura","mana":"{1}{U}","cmc":2,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step."};
const COMA_VEIL = {"name":"Coma Veil","type":"Enchantment — Aura","mana":"{4}{U}","cmc":5,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step."};
const CLAUSTROPHOBIA = {"name":"Claustrophobia","type":"Enchantment — Aura","mana":"{1}{U}{U}","cmc":3,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step."};
const DEHYDRATION = {"name":"Dehydration","type":"Enchantment — Aura","mana":"{3}{U}","cmc":4,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature (Target a creature as you cast this. This card enters attached to that creature.)\nEnchanted creature doesn't untap during its controller's untap step."};
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
const LEADEN_FISTS = {"name":"Leaden Fists","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"keywords":["Enchant","Flash"],"colors":["U"],"oracle":"Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature\nEnchanted creature gets +3/+3 and doesn't untap during its controller's untap step."};
const ETERNITY_SNARE = {"name":"Eternity Snare","type":"Enchantment — Aura","mana":"{5}{U}","cmc":6,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature doesn't untap during its controller's untap step."};

const other = (who) => (who === "ai" ? "user" : "ai");
const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** Turn 6, the active seat's precombat main with an empty stack; `mine` / `theirs` are the active seat's and its opponent's. */
function board(who, { hand = [], mana = {}, mine = [], theirs = [], library = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id, o) => ({ ...g.players[id], ...o });
  return {
    ...g, turn: 6, activePlayer: who, priorityHolder: who, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: {
      ...g.players,
      [who]: seat(who, { hand: hand.map(([cid, c]) => ({ ...c, id: cid })), battlefield: mine, manaPool: { ...g.players[who].manaPool, ...mana }, library: library.map((c, i) => ({ ...c, id: `${who}-lib${i}` })) }),
      [other(who)]: seat(other(who), { battlefield: theirs, library: library.map((c, i) => ({ ...c, id: `${other(who)}-lib${i}` })) }),
    },
  };
}
function cast(s, who, id) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: who }, who).find((x) => x.kind === "cast-spell" && x.cardId === id);
  if (!a) throw new Error(`no cast of ${id} for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
function settle(s) {
  let n = s;
  for (let guard = 0; (n.stack.length || n.pendingTriggers.length) && !n.pendingChoice; guard++) {
    if (guard > 20) throw new Error("the stack did not settle");
    n = resolveTopOfStack(n);
  }
  const crash = n.log.find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const castAndSettle = (s, who, id) => settle(cast(s, who, id));
const names = (zone) => zone.map((c) => c.card?.name ?? c.name);
const forcedLog = (s) => s.log.filter((e) => e.kind === "trigger-target-forced").map((e) => e.targets);
/** What the AI does with `cardId` from this state: "cast", "held", or the cast's target. Every pick is one of the offered actions. */
function aiPick(s, cardId, seat = "ai") {
  const offered = legalActionsForPlayer({ ...s, priorityHolder: seat }, seat);
  if (!offered.some((a) => a.kind === "cast-spell" && a.cardId === cardId)) throw new Error(`${cardId} is not offered — the board does not test the pick`);
  const pick = pickAction({ ...s, priorityHolder: seat }, seat, offered, { archetype: "midrange" });
  if (!offered.includes(pick)) throw new Error("the pick is not one of the offered actions");
  if (pick?.kind !== "cast-spell" || pick.cardId !== cardId) return "held";
  const t = pick.targets?.[0];
  return t ? `${t.name} (${t.controller})` : "cast";
}

describe("1 · the cast-time hold — the AI reads the enters trigger of the permanent it is about to cast", () => {
  it("⭐ Man-o'-War with no opposing creature is held — beside the AI's own Grizzly Bears it would bounce them, alone it would bounce itself", () => {
    const besideBears = board("ai", { hand: [["mow", MANOWAR]], mana: { U: 3 }, mine: [perm("bears", BEARS, "ai")] });
    const alone = board("ai", { hand: [["mow", MANOWAR]], mana: { U: 3 } });
    expect({ besideBears: aiPick(besideBears, "mow"), alone: aiPick(alone, "mow") }).toEqual({ besideBears: "held", alone: "held" });
  });

  it("control: with an opponent's Hill Giant on the battlefield Man-o'-War is cast (and bounces the Giant)", () => {
    const s = board("ai", { hand: [["mow", MANOWAR]], mana: { U: 3 }, mine: [perm("bears", BEARS, "ai")], theirs: [perm("giant", GIANT, "user")] });
    const after = castAndSettle(s, "ai", "mow");
    expect({ pick: aiPick(s, "mow"), userHand: names(after.players.user.hand), ai: names(after.players.ai.battlefield).sort() })
      .toEqual({ pick: "cast", userHand: ["Hill Giant"], ai: ["Grizzly Bears", "Man-o'-War"] });
  });

  it("control: a creature whose enters trigger targets nothing (Elvish Visionary) and one with none (Grizzly Bears) are cast on an empty board", () => {
    const vis = board("ai", { hand: [["vis", VISIONARY]], mana: { G: 2 }, library: [FOREST, FOREST] });
    const bears = board("ai", { hand: [["b", BEARS]], mana: { G: 2 } });
    expect({ visionary: aiPick(vis, "vis"), bears: aiPick(bears, "b") }).toEqual({ visionary: "cast", bears: "cast" });
  });

  it("⭐ Mystic Snake is not flashed in with only the AI's own Divination on the stack (it would counter it)", () => {
    const s = cast(board("ai", { hand: [["div", DIVINATION], ["snake", SNAKE]], mana: { U: 7, G: 3 }, library: [ISLAND, ISLAND, ISLAND] }), "ai", "div");
    expect({ stack: s.stack.map((o) => [o.source?.name, o.controller]), holder: s.priorityHolder, pick: aiPick(s, "snake") })
      .toEqual({ stack: [["Divination", "ai"]], holder: "ai", pick: "held" });
  });

  it("control: over the opponent's Divination the AI flashes Mystic Snake in, and the Snake counters it", () => {
    let s = board("user", { hand: [["div", DIVINATION]], mana: { U: 3 }, library: [ISLAND, ISLAND, ISLAND] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...SNAKE, id: "snake" }], manaPool: { ...s.players.ai.manaPool, U: 3, G: 1 } } } };
    s = cast(s, "user", "div");
    const pick = aiPick(s, "snake");
    const after = settle(cast(s, "ai", "snake"));
    expect({ pick, userGraveyard: names(after.players.user.graveyard), drew: after.players.user.hand.length, forced: forcedLog(after) })
      .toEqual({ pick: "cast", userGraveyard: ["Divination"], drew: 0, forced: [] });
  });

  it("⭐ Flametongue Kavu with only the AI's own Grizzly Bears to hit is held — its 4 damage would kill them", () => {
    const s = board("ai", { hand: [["ftk", FTK]], mana: { R: 4 }, mine: [perm("bears", BEARS, "ai")] });
    expect(aiPick(s, "ftk")).toBe("held");
  });

  it("a forced harm the target survives does not hold the cast: Farbog Boneflinger beside the AI's own Bears and Craw Wurm is cast, and the Wurm takes the -2/-2", () => {
    const s = board("ai", { hand: [["bone", BONEFLINGER]], mana: { B: 5 }, mine: [perm("bears", BEARS, "ai"), perm("wurm", WURM, "ai")] });
    const after = castAndSettle(s, "ai", "bone");
    expect({ pick: aiPick(s, "bone"), battlefield: names(after.players.ai.battlefield).sort(), wurmToughness: permanentToughness(after, "wurm"), forced: forcedLog(after) })
      .toEqual({ pick: "cast", battlefield: ["Craw Wurm", "Farbog Boneflinger", "Grizzly Bears"], wurmToughness: 2, forced: [["wurm"]] });
  });

  it("the preview names what the trigger would remove (the AI's Bears for Man-o'-War), and nothing when a correct-side target exists", () => {
    const own = board("ai", { mine: [perm("bears", BEARS, "ai")] });
    const theirs = board("ai", { mine: [perm("bears", BEARS, "ai")], theirs: [perm("giant", GIANT, "user")] });
    expect(typeof engine.entersTriggerRemovesOwn).toBe("function");
    const row = engine.entersTriggerRemovesOwn(own, "ai", { ...MANOWAR, id: "mow" });
    expect({ own: row && { op: row.op, target: row.target.id }, theirs: engine.entersTriggerRemovesOwn(theirs, "ai", { ...MANOWAR, id: "mow" }) })
      .toEqual({ own: { op: "bounce", target: "bears" }, theirs: null });
  });

  it("the preview leaves the game untouched: the same state object, no pending trigger, no log line", () => {
    const s = board("ai", { mine: [perm("bears", BEARS, "ai")] });
    const before = JSON.stringify(s);
    expect(typeof engine.entersTriggerRemovesOwn).toBe("function");
    engine.entersTriggerRemovesOwn(s, "ai", { ...MANOWAR, id: "mow" });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("2 · the forced pick prefers a harm its target survives (CR 514.2, 701.26a) — both seats", () => {
  for (const who of ["ai", "user"]) {
    it(`⭐ Fire Imp beside its controller's Grizzly Bears and Craw Wurm deals its 2 damage to the Wurm, which survives — not to the Bears (mana value 2), which would die — ${who} seat`, () => {
      const s = castAndSettle(board(who, { hand: [["imp", FIRE_IMP]], mana: { R: 3 }, mine: [perm("bears", BEARS, who), perm("wurm", WURM, who)] }), who, "imp");
      expect({ battlefield: names(s.players[who].battlefield).sort(), graveyard: names(s.players[who].graveyard), wurmDamage: findPermanent(s, "wurm").permanent.damageMarked, forced: forcedLog(s) })
        .toEqual({ battlefield: ["Craw Wurm", "Fire Imp", "Grizzly Bears"], graveyard: [], wurmDamage: 2, forced: [["wurm"]] });
    });
  }

  it("⭐ Farbog Boneflinger's -2/-2 until end of turn goes on the Craw Wurm (4 toughness), not the Bears", () => {
    const s = castAndSettle(board("user", { hand: [["bone", BONEFLINGER]], mana: { B: 5 }, mine: [perm("bears", BEARS, "user"), perm("wurm", WURM, "user")] }), "user", "bone");
    expect({ graveyard: names(s.players.user.graveyard), wurmToughness: permanentToughness(s, "wurm"), forced: forcedLog(s) })
      .toEqual({ graveyard: [], wurmToughness: 2, forced: [["wurm"]] });
  });

  it("⭐ Network Disruptor with no opposing permanent taps its controller's Forest that is already tapped — the untapped one stays untapped", () => {
    const s = castAndSettle(board("user", { hand: [["nd", DISRUPTOR]], mana: { U: 1 }, mine: [perm("f-open", FOREST, "user"), perm("f-used", FOREST, "user", { tapped: true })] }), "user", "nd");
    expect({ open: findPermanent(s, "f-open").permanent.tapped, used: findPermanent(s, "f-used").permanent.tapped, forced: forcedLog(s) })
      .toEqual({ open: false, used: true, forced: [["f-used"]] });
  });

  it("control: when nothing survives the least valuable still takes it — Flametongue Kavu's 4 damage kills the Bears (2), not the Wurm (6, toughness 4)", () => {
    const s = castAndSettle(board("user", { hand: [["ftk", FTK]], mana: { R: 4 }, mine: [perm("bears", BEARS, "user"), perm("wurm", WURM, "user")] }), "user", "ftk");
    expect({ graveyard: names(s.players.user.graveyard), forced: forcedLog(s) }).toEqual({ graveyard: ["Grizzly Bears"], forced: [["bears"]] });
  });

  it("control: from a deathtouch source no hit is survived (CR 702.2b) — beside Archetype of Finality (creatures you control have deathtouch) Fire Imp's 2 damage kills the Bears, the least valuable, not the 4-toughness Wurm", () => {
    const s0 = board("user", { hand: [["imp", FIRE_IMP]], mana: { R: 3 }, mine: [perm("bears", BEARS, "user"), perm("wurm", WURM, "user"), perm("arch", ARCHETYPE, "user")] });
    const s = castAndSettle(s0, "user", "imp");
    expect({ graveyard: names(s.players.user.graveyard), wurmAlive: !!findPermanent(s, "wurm"), forced: forcedLog(s) }).toEqual({ graveyard: ["Grizzly Bears"], wurmAlive: true, forced: [["bears"]] });
  });

  it("control: a Wurm with 3 damage already marked does not survive 2 more — Fire Imp hits the Bears (mana value 2) again", () => {
    const s = castAndSettle(board("user", { hand: [["imp", FIRE_IMP]], mana: { R: 3 }, mine: [perm("bears", BEARS, "user"), perm("wurm", WURM, "user", { damageMarked: 3 })] }), "user", "imp");
    expect({ graveyard: names(s.players.user.graveyard), forced: forcedLog(s) }).toEqual({ graveyard: ["Grizzly Bears"], forced: [["bears"]] });
  });
});

describe("3 · an untap-lock Aura is a curse — cast on the opponent's best creature", () => {
  const aiMain = ({ aura, mana, mine = [], theirs = [] }) => board("ai", { hand: [["aura1", aura]], mana, mine, theirs });

  it("⭐ Ice Over locks the opponent's Craw Wurm — it used to be held", () => {
    const s = aiMain({ aura: ICE_OVER, mana: { U: 2 }, mine: [perm("a-bears", BEARS, "ai")], theirs: [perm("u-bears", BEARS, "user"), perm("u-wurm", WURM, "user")] });
    expect(aiPick(s, "aura1")).toBe("Craw Wurm (user)");
  });

  it("⭐ Coma Veil too", () => {
    const s = aiMain({ aura: COMA_VEIL, mana: { U: 5 }, mine: [perm("a-wurm", WURM, "ai")], theirs: [perm("u-bears", BEARS, "user"), perm("u-giant", GIANT, "user")] });
    expect(aiPick(s, "aura1")).toBe("Hill Giant (user)");
  });

  it("⭐ Claustrophobia goes on the opponent's Craw Wurm, taps it as it enters, and the Wurm stays tapped through its controller's untap step", () => {
    const s = aiMain({ aura: CLAUSTROPHOBIA, mana: { U: 3 }, mine: [perm("a-bears", BEARS, "ai")], theirs: [perm("u-wurm", WURM, "user")] });
    const pick = aiPick(s, "aura1");
    const offered = legalActionsForPlayer(s, "ai").find((a) => a.cardId === "aura1" && a.targets[0].id === "u-wurm");
    const after = settle(dispatchAction(s, offered));
    expect({ pick, wurmTapped: findPermanent(after, "u-wurm").permanent.tapped, attached: findPermanent(after, "u-wurm").permanent.attachments.length })
      .toEqual({ pick: "Craw Wurm (user)", wurmTapped: true, attached: 1 });
  });

  it("with only the AI's own creatures to enchant, Ice Over is held — never locked on its own Wurm", () => {
    const s = aiMain({ aura: ICE_OVER, mana: { U: 2 }, mine: [perm("a-wurm", WURM, "ai")] });
    expect(aiPick(s, "aura1")).toBe("held");
  });

  it("control: Pacifism still goes on the enemy, and is held with only the AI's own creatures", () => {
    const enemy = aiMain({ aura: PACIFISM, mana: { W: 2 }, mine: [perm("a-wurm", WURM, "ai")], theirs: [perm("u-giant", GIANT, "user")] });
    const ownOnly = aiMain({ aura: PACIFISM, mana: { W: 2 }, mine: [perm("a-wurm", WURM, "ai")] });
    expect({ enemy: aiPick(enemy, "aura1"), ownOnly: aiPick(ownOnly, "aura1") }).toEqual({ enemy: "Hill Giant (user)", ownOnly: "held" });
  });

  it("the reading: the lock alone (with its Enchant line, Flash and the enters tap) is ENEMY for the cast and the non-cast entry; a lock printed with a buff or beside another line is not read", () => {
    const row = (c) => [c.name, auraCastIntent(c)];
    expect([ICE_OVER, COMA_VEIL, CLAUSTROPHOBIA, DEHYDRATION, PACIFISM, LEADEN_FISTS, ETERNITY_SNARE].map(row)).toEqual([
      ["Ice Over", "enemy"], ["Coma Veil", "enemy"], ["Claustrophobia", "enemy"], ["Dehydration", "enemy"], ["Pacifism", "enemy"],
      ["Leaden Fists", null], ["Eternity Snare", null],
    ]);
    expect(auraEntryIntent(CLAUSTROPHOBIA)).toBe("enemy");
  });
});
