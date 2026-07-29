/**
 * CONDITIONAL SPELL RIDER (BLITZ CD-1, CR 608.2) — an instant/sorcery (or a trigger/activated effect) whose
 * body carries a LEADING board-condition rider: "<base>. If <board-condition>, <effect>." (Chilling Trap
 * "Target creature gets -4/-0 until end of turn. If you control a Wizard, draw a card."). The base atom(s)
 * ALWAYS run; the gated rider — stamped `condition` by the parser — runs ONLY when the board condition holds
 * as it resolves (CR 608.2, checked in written order).
 *
 * The condition is READ by the SAME intervening-if board evaluator the trigger path uses
 * (interveningIf.evaluateInterveningIf), gated at parse time by spellConditionParseable — the spell-side
 * shape check (a board/player/turn query a resolving spell can read with only its own context; a per-object
 * or unreadable condition stays LOW → Arbiter). So a rider is credited native ONLY when the resolver can
 * actually evaluate its condition — the metric⇄runtime shared gate.
 *
 * SCOPE (this slice): a LEADING "If <cond>, <effect>" whose <effect> is a SINGLE, NON-optional, NON-targeting
 * modeled atom. A multi-instruction gated effect ("… loses 2 life and you gain 2 life"), an "instead"
 * replacement, a targeted/optional gated effect, a back-reference condition ("if that player …"), an
 * unreadable condition ("if you control a modified creature"), or the TRAILING form all stay a single LOW
 * program → arbiter-spell (a SAFE false-negative — never a fabricated / dropped-condition native, CREED).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { spellConditionParseable } from "./interveningIf.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) whose LEADING board-condition rider is a modeled atom ──
const CHILLING_TRAP = { name: "Chilling Trap", type: "Kindred Instant — Wizard", mana: "{1}{U}",
  oracle: "Target creature gets -4/-0 until end of turn. If you control a Wizard, draw a card." };
const PEPPERSMOKE = { name: "Peppersmoke", type: "Kindred Instant — Faerie", mana: "{B}",
  oracle: "Target creature gets -1/-1 until end of turn. If you control a Faerie, draw a card." };
const GIANTS_IRE = { name: "Giant's Ire", type: "Kindred Sorcery — Giant", mana: "{3}{R}",
  oracle: "Giant's Ire deals 4 damage to target player or planeswalker. If you control a Giant, draw a card." };
const TEZZERETS_AMBITION = { name: "Tezzeret's Ambition", type: "Sorcery", mana: "{3}{U}",
  oracle: "Draw three cards. If you control no artifacts, discard a card." };
const ARTIFICERS_EPIPHANY = { name: "Artificer's Epiphany", type: "Instant", mana: "{2}{U}",
  oracle: "Draw two cards. If you control no artifacts, discard a card." };
const SUNSET_REVELRY = { name: "Sunset Revelry", type: "Sorcery", mana: "{1}{W}",
  oracle: "If an opponent has more life than you, you gain 4 life. If an opponent controls more creatures than you, create two 1/1 white Human creature tokens. If an opponent has more cards in hand than you, draw a card." };
const FUNGAL_REBIRTH = { name: "Fungal Rebirth", type: "Instant", mana: "{2}{G}",
  oracle: "Return target permanent card from your graveyard to your hand. If a creature died this turn, create two 1/1 green Saproling creature tokens." };
const UNDERCITYS_EMBRACE = { name: "Undercity's Embrace", type: "Instant", mana: "{2}{B}",
  oracle: "Target opponent sacrifices a creature of their choice. If you control a creature with power 4 or greater, you gain 4 life." };
const STRENGTH_OF_ARMS = { name: "Strength of Arms", type: "Instant", mana: "{1}{W}",
  oracle: "Target creature gets +2/+2 until end of turn. If you control an Equipment, create a 1/1 white Human Soldier creature token." };
const RABBIT_RESPONSE = { name: "Rabbit Response", type: "Instant", mana: "{1}{W}",
  oracle: "Creatures you control get +2/+1 until end of turn. If you control a Rabbit, scry 2. (Look at the top two cards of your library, then put any number of them on the bottom and the rest on top in any order.)" };
const FAILED_FORDING = { name: "Failed Fording", type: "Instant", mana: "{2}{U}",
  oracle: "Return target nonland permanent to its owner's hand. If you control a Desert, surveil 1. (Look at the top card of your library. You may put it into your graveyard.)" };
const HORRIFIC_ASSAULT = { name: "Horrific Assault", type: "Sorcery", mana: "{4}{B}",
  oracle: "Target creature you control deals damage equal to its power to target creature or planeswalker you don't control. If you control an Eldrazi, you gain 3 life." };
const ROOTGRAPPLE = { name: "Rootgrapple", type: "Kindred Instant — Treefolk", mana: "{4}{G}",
  oracle: "Destroy target noncreature permanent. If you control a Treefolk, draw a card." };
const TAKEN_BY_NIGHTMARES = { name: "Taken by Nightmares", type: "Instant", mana: "{4}{B}",
  oracle: "Exile target creature. If you control an enchantment, scry 2." };
const SAGES_DOUSING = { name: "Sage's Dousing", type: "Kindred Instant — Wizard", mana: "{2}{U}",
  oracle: "Counter target spell unless its controller pays {3}. If you control a Wizard, draw a card." };

const ALL_NATIVE = [CHILLING_TRAP, PEPPERSMOKE, GIANTS_IRE, TEZZERETS_AMBITION, ARTIFICERS_EPIPHANY,
  SUNSET_REVELRY, FUNGAL_REBIRTH, UNDERCITYS_EMBRACE, STRENGTH_OF_ARMS, RABBIT_RESPONSE, FAILED_FORDING,
  HORRIFIC_ASSAULT, ROOTGRAPPLE, TAKEN_BY_NIGHTMARES, SAGES_DOUSING];

// ── Parser / coverage — the family classifies native-spell ────────────────────────────────────────────
describe("CONDITIONAL SPELL RIDER coverage — leading board-condition riders classify native-spell", () => {
  for (const c of ALL_NATIVE) {
    it(`${c.name} → native-spell`, () => {
      expect(classifyCard(c)).toBe("native-spell");
      expect(isNativeTier(classifyCard(c))).toBe(true);
    });
  }
  // The shared clause seam also lifts a trigger / activated effect carrying the SAME leading rider.
  it("The First Iroan Games (Saga chapter III gated draw) → native-trigger", () => {
    expect(classifyCard({ name: "The First Iroan Games", type: "Enchantment — Saga", mana: "{2}{R}{G}",
      oracle: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI — Create a 1/1 white Human Soldier creature token.\nII — Put three +1/+1 counters on target creature you control.\nIII — If you control a creature with power 4 or greater, draw two cards.\nIV — Create a Gold token. (It's an artifact with \"Sacrifice this token: Add one mana of any color.\")" }))
      .toBe("native-trigger");
  });
  it("Scroll of Avacyn (activated effect gated gain-life) → native-activated", () => {
    expect(classifyCard({ name: "Scroll of Avacyn", type: "Artifact", mana: "{2}",
      oracle: "{1}, Sacrifice this artifact: Draw a card. If you control an Angel, you gain 5 life." }))
      .toBe("native-activated");
  });
});

describe("CONDITIONAL SPELL RIDER parser — base atoms then a `condition`-stamped rider", () => {
  it("Chilling Trap: pump then a draw gated on 'you control a wizard'", () => {
    const p = parseEffectProgram(CHILLING_TRAP);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["pump", "draw"]);
    expect(p.atoms.map((a) => a.condition ?? null)).toEqual([null, "you control a wizard"]);
    expect(programNeedsChosenTarget(p)).toBe(true); // the base pump needs a target; the rider is targetless
  });
  it("Tezzeret's Ambition: draw then a discard gated on 'you control no artifacts' (base runs always)", () => {
    const p = parseEffectProgram(TEZZERETS_AMBITION);
    expect(p.atoms.map((a) => a.op)).toEqual(["draw", "discard"]);
    expect(p.atoms.map((a) => a.condition ?? null)).toEqual([null, "you control no artifacts"]);
  });
  it("Sunset Revelry: THREE independent conditional atoms, each its own condition, none targeted", () => {
    const p = parseEffectProgram(SUNSET_REVELRY);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["gain-life", "create-token", "draw"]);
    expect(p.atoms.map((a) => a.condition)).toEqual([
      "an opponent has more life than you",
      "an opponent controls more creatures than you",
      "an opponent has more cards in hand than you",
    ]);
    expect(programNeedsChosenTarget(p)).toBe(false);
  });
  it("spellConditionParseable gates the parse: board queries readable, per-object / unreadable rejected", () => {
    expect(spellConditionParseable("you control a wizard")).toBe(true);
    expect(spellConditionParseable("you control no artifacts")).toBe(true);
    expect(spellConditionParseable("an opponent has more cards in hand than you")).toBe(true);
    expect(spellConditionParseable("a creature died this turn")).toBe(true);
    expect(spellConditionParseable("you control another elf")).toBe(false); // needs a triggering permanent
    expect(spellConditionParseable("you control a modified creature")).toBe(false); // no reader for "modified"
    expect(spellConditionParseable("its power is 3 or less")).toBe(false); // not a board condition
  });
});

// ── CREED anti-FP — deferred shapes stay arbiter-spell (never a dropped/fabricated condition) ────────────
describe("CONDITIONAL SPELL RIDER CREED anti-FP — deferred shapes stay arbiter-spell", () => {
  it("a MULTI-INSTRUCTION gated effect stays arbiter-spell (Arterial Flow: '… loses 2 life and you gain 2 life')", () => {
    expect(classifyCard({ name: "Arterial Flow", type: "Sorcery", mana: "{2}{B}{B}", oracle: "Each opponent discards two cards. If you control a Vampire, each opponent loses 2 life and you gain 2 life." })).toBe("arbiter-spell");
  });
  it("⭐ an 'instead' REPLACEMENT is MODELED now — Life Goes On (conditional replacement, CR 608.2)", () => {
    // ⚠️ UPDATED. This pin belongs to the RIDER family ("<base>. If <cond>, <extra>." — an ADDITIVE clause
    // gated on a condition), and it correctly deferred the REPLACEMENT shape, which is a different thing:
    // the alternative REPLACES the base rather than adding to it. That shape now has its own branch atom
    // (`conditional` with ifTrue/ifFalse), so this card is modeled — 4 life normally, 8 instead.
    // The rider pins below are untouched; they still guard the additive form.
    expect(classifyCard({ name: "Life Goes On", type: "Instant", mana: "{G}", oracle: "You gain 4 life. If a creature died this turn, you gain 8 life instead." })).toBe("native-spell");
  });
  it("an UNREADABLE condition ('modified creature', a 6-subtype OR) stays arbiter-spell", () => {
    expect(classifyCard({ name: "Ambitious Assault", type: "Instant", mana: "{2}{R}", oracle: "Creatures you control get +2/+0 until end of turn. If you control a modified creature, draw a card." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Unagi's Spray", type: "Instant", mana: "{1}{U}", oracle: "Target creature gets -4/-0 until end of turn. If you control a Fish, Octopus, Otter, Seal, Serpent, or Whale, draw a card." })).toBe("arbiter-spell");
  });
  it("a back-reference condition / trailing form stays arbiter-spell (Compelling Deterrence 'if you control a Zombie' trails; Might of the Meek 'if you control a Mouse' trails with 'It')", () => {
    expect(classifyCard({ name: "Compelling Deterrence", type: "Instant", mana: "{1}{U}", oracle: "Return target nonland permanent to its owner's hand. Then that player discards a card if you control a Zombie." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Might of the Meek", type: "Instant", mana: "{G}", oracle: "Target creature gains trample until end of turn. It also gets +1/+0 until end of turn if you control a Mouse. Draw a card." })).toBe("arbiter-spell");
  });
  it("a TARGETED / OPTIONAL gated effect stays arbiter-spell (Clear the Stage 'you may return … target creature card')", () => {
    expect(classifyCard({ name: "Clear the Stage", type: "Sorcery", mana: "{1}{B}", oracle: "Target creature gets -3/-3 until end of turn. If you control a creature with power 4 or greater, you may return up to one target creature card from your graveyard to your hand." })).toBe("arbiter-spell");
    expect(classifyCard({ name: "Take Out the Trash", type: "Instant", mana: "{2}{R}", oracle: "Take Out the Trash deals 3 damage to target creature or planeswalker. If you control a Raccoon, you may discard a card. If you do, draw a card." })).toBe("arbiter-spell");
  });
});

// ── Runtime: cast → resolve, BOTH branches through the real cast path ────────────────────────────────────
function mainState() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
}
function setup({ hand = [], mana = {}, lib = [], board = [], oppBoard = [], oppHand = [], userLife = 20, oppLife = 20 } = {}) {
  const s = mainState();
  return { ...s, players: { ...s.players,
    user: { ...s.players.user, hand, library: lib, battlefield: board, life: userLife, manaPool: { ...s.players.user.manaPool, ...mana } },
    ai: { ...s.players.ai, battlefield: oppBoard, hand: oppHand, life: oppLife },
  } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell");
function drainStack(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const bear = (id, controller) => createPermanent({ id, card: { name: "Grizzly Bears", id: "gb" + id, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller });
const wizard = (id) => createPermanent({ id, card: { name: "Fugitive Wizard", id: "fw" + id, type: "Creature — Human Wizard", power: 1, toughness: 1, oracle: "" }, controller: "user" });

describe("CONDITIONAL SPELL RIDER runtime — Chilling Trap draws ONLY when you control a Wizard", () => {
  it("Wizard on board → the base pump resolves AND the conditional draw fires", () => {
    let s = setup({ hand: [{ ...CHILLING_TRAP, id: "c1" }], mana: { U: 1, C: 1 },
      lib: [{ id: "D1", name: "Island", type: "Land", oracle: "" }], board: [wizard("w1")], oppBoard: [bear("v1", "ai")] });
    const cast = casts(s).find((a) => a.cardId === "c1" && a.targetName === "Grizzly Bears");
    expect(cast).toBeTruthy();
    s = drainStack(dispatchAction(s, cast));
    expect(s.players.user.hand.length).toBe(1);     // the conditional draw fired
    expect(s.players.user.library.length).toBe(0);
  });
  it("NO Wizard on board → the base pump resolves but the draw is SKIPPED (CREED — no fabricated draw)", () => {
    let s = setup({ hand: [{ ...CHILLING_TRAP, id: "c1" }], mana: { U: 1, C: 1 },
      lib: [{ id: "D1", name: "Island", type: "Land", oracle: "" }], board: [], oppBoard: [bear("v1", "ai")] });
    const cast = casts(s).find((a) => a.cardId === "c1" && a.targetName === "Grizzly Bears");
    expect(cast).toBeTruthy();
    s = drainStack(dispatchAction(s, cast));
    expect(s.players.user.hand.length).toBe(0);     // the draw was gated out
    expect(s.players.user.library.length).toBe(1);  // library untouched
    expect(s.stack.length).toBe(0);                 // the spell fully resolved (base pump ran)
  });
});

describe("CONDITIONAL SPELL RIDER runtime — Sunset Revelry: each opponent-compare rider fires independently", () => {
  it("opponent ahead on life, creatures, AND cards → gain 4 life, 2 tokens, draw 1", () => {
    let s = setup({ hand: [{ ...SUNSET_REVELRY, id: "c1" }], mana: { W: 1, C: 1 },
      lib: [{ id: "D1", name: "Plains", type: "Land", oracle: "" }],
      board: [], oppBoard: [bear("o1", "ai"), bear("o2", "ai")], oppHand: [{ id: "h1" }, { id: "h2" }],
      userLife: 20, oppLife: 30 });
    const cast = casts(s).find((a) => a.cardId === "c1");
    s = drainStack(dispatchAction(s, cast));
    expect(s.players.user.life).toBe(24);           // "an opponent has more life than you" → gain 4
    expect(s.players.user.battlefield.length).toBe(2); // "more creatures than you" → two 1/1 Human tokens
    expect(s.players.user.hand.length).toBe(1);     // "more cards in hand than you" → draw 1
    expect(s.players.user.library.length).toBe(0);
  });
  it("opponent BEHIND on all three → no gain, no tokens, no draw (all three riders gated out)", () => {
    let s = setup({ hand: [{ ...SUNSET_REVELRY, id: "c1" }], mana: { W: 1, C: 1 },
      lib: [{ id: "D1", name: "Plains", type: "Land", oracle: "" }],
      board: [bear("u1", "user")], oppBoard: [], oppHand: [],
      userLife: 20, oppLife: 10 });
    const cast = casts(s).find((a) => a.cardId === "c1");
    s = drainStack(dispatchAction(s, cast));
    expect(s.players.user.life).toBe(20);           // no opponent has more life → no gain
    expect(s.players.user.battlefield.length).toBe(1); // still just the pre-existing bear → no tokens
    expect(s.players.user.hand.length).toBe(0);     // no draw
    expect(s.players.user.library.length).toBe(1);  // library untouched
  });
});
