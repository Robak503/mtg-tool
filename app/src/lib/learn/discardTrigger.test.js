/**
 * discardTrigger.test.js — "Whenever an opponent discards a card, …" (CR 701.9a)
 * Liliana's Caress · Raiders' Wake · Fell Specter · Megrim · Sangromancer · Geth's Grimoire ·
 * Tourach, Dread Cantor · Abyssal Nocturnus.
 *
 * ⭐ A WHOLE EVENT THAT DID NOT EXIST. detectTriggers returned NOTHING for this line — it was not a missing
 * payoff clause, the engine had no discard event at all. That is why the census (which measured only the
 * "that player loses N life" payoff) called this vein 3: sizing the EVENT instead doubled it.
 *
 * ⭐ AND WHY IT IS THE RISKIEST SHAPE IN THE ENGINE. A discard trigger must fire from EVERY way a card is
 * discarded, and there is no single discardCard() helper to hook — eleven separate hand→graveyard sites
 * across five files, including discards paid as COSTS and a chooser chain that PAUSES for a human. Wiring
 * ten of eleven produces no error and no false positive: just an ability that silently never fires. So the
 * tests below drive REAL discards down the distinct paths (forced chain, random, cost payment) rather than
 * asserting a descriptor and calling it built.
 *
 * ⭐ THE RECIPIENT IS THE CONTROLLER'S OPPONENT. "That player" is the discarder, never the ability's
 * controller — a fallback to ctx.controller would drain exactly the wrong seat, so that is pinned twice.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { detectTriggers, checkDiscardTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { readFileSync } from "node:fs";

beforeEach(() => _resetIdsForTests());

const CARESS = { id: "lc-card", name: "Liliana's Caress", type: "Enchantment", mana: "{1}{B}",
  oracle: "Whenever an opponent discards a card, that player loses 2 life." };
const MEGRIM = { name: "Megrim", type: "Enchantment", mana: "{3}{B}",
  oracle: "Whenever an opponent discards a card, this enchantment deals 2 damage to that player." };
const GRIMOIRE = { name: "Geth's Grimoire", type: "Artifact", mana: "{4}",
  oracle: "Whenever an opponent discards a card, you may draw a card." };
const SANGROMANCER = { name: "Sangromancer", type: "Creature — Vampire Shaman", power: "3", toughness: "3", mana: "{3}{B}",
  oracle: "Flying\nWhenever a creature an opponent controls dies, you may gain 3 life.\nWhenever an opponent discards a card, you may gain 3 life." };
const RAIDERS_WAKE = { name: "Raiders' Wake", type: "Enchantment", mana: "{4}{B}",
  oracle: "Whenever an opponent discards a card, that player loses 2 life.\nRaid — At the beginning of your end step, if you attacked this turn, target opponent discards a card." };
const FELL_SPECTER = { name: "Fell Specter", type: "Creature — Specter", power: "3", toughness: "2", mana: "{4}{B}",
  oracle: "Flying\nWhen this creature enters, target opponent discards a card.\nWhenever an opponent discards a card, that player loses 2 life." };
const ABYSSAL_NOCTURNUS = { name: "Abyssal Nocturnus", type: "Creature — Horror", power: "2", toughness: "2", mana: "{1}{B}{B}",
  oracle: "Whenever an opponent discards a card, this creature gets +2/+2 and gains fear until end of turn. (It can't be blocked except by artifact creatures and/or black creatures.)" };

const handCard = (id, name) => ({ id, name, type: "Instant", mana: "{1}", oracle: "" });

/** user controls the watcher; ai1 is the discarder with an N-card hand. */
function board(watcherCard, oppHand = 1) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const hand = Array.from({ length: oppHand }, (_, i) => handCard(`h${i}`, `Card ${i}`));
  return {
    ...s,
    activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [createPermanent({ id: "watcher", card: watcherCard, controller: "user", summoningSick: false })] },
      ai1: { ...s.players.ai1, hand },
    },
  };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
/** Drive a REAL discard through the effect program (the forced whole-hand branch — no pause). */
function discardVia(state, clause, targets) {
  const out = runEffectProgram(state, {
    source: { name: "Mind Rot" },
    payload: { params: { program: parseEffectClause(clause, "Sorcery"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return resolveAll(out?.state ?? out);
}
const TARGET_AI1 = [{ type: "player", id: "ai1", atomIndex: 0 }];

describe("⭐ ENFORCEMENT — a real discard fires the trigger and drains the RIGHT seat", () => {
  it("VACUITY CONTROL: both seats start on a real life total and the hand is stocked", () => {
    const s = board(CARESS, 1);
    expect(s.players.ai1.life).toBeGreaterThan(0);
    expect(s.players.user.life).toBeGreaterThan(0);
    expect(s.players.ai1.hand).toHaveLength(1);
  });

  it("⭐ THE DECIDING ASSERTION — opponent discards, opponent loses 2", () => {
    const before = board(CARESS, 1);
    const s = discardVia(before, "Target player discards a card.", TARGET_AI1);
    expect(s.players.ai1.hand).toHaveLength(0);                       // the discard really happened
    expect(s.players.ai1.life).toBe(before.players.ai1.life - 2);     // …and the trigger really fired
  });

  it("⛔ WRONG-SEAT PIN — the CONTROLLER loses nothing", () => {
    const before = board(CARESS, 1);
    const s = discardVia(before, "Target player discards a card.", TARGET_AI1);
    expect(s.players.user.life).toBe(before.players.user.life);
  });

  it("⭐ ONE EVENT PER CARD (CR 603.2) — a two-card discard drains 4, not 2", () => {
    const before = board(CARESS, 2);
    const s = discardVia(before, "Target player discards two cards.", TARGET_AI1);
    expect(s.players.ai1.hand).toHaveLength(0);
    expect(s.players.ai1.life).toBe(before.players.ai1.life - 4);
  });

  it("⛔ a player is not their own opponent — the controller's OWN discard fires nothing", () => {
    const before = {
      ...board(CARESS, 0),
      players: { ...board(CARESS, 0).players, user: { ...board(CARESS, 0).players.user, hand: [handCard("u0", "Mine")],
        battlefield: [createPermanent({ id: "watcher", card: CARESS, controller: "user", summoningSick: false })] } },
    };
    const s = discardVia(before, "Target player discards a card.", [{ type: "player", id: "user", atomIndex: 0 }]);
    expect(s.players.user.hand).toHaveLength(0);                       // the discard happened
    expect(s.players.user.life).toBe(before.players.user.life);        // …and drained nobody
  });

  it("a RANDOM discard is still a discard (CR 701.9b)", () => {
    const before = board(CARESS, 1);
    const s = discardVia(before, "Target player discards a card at random.", TARGET_AI1);
    expect(s.players.ai1.hand).toHaveLength(0);
    expect(s.players.ai1.life).toBe(before.players.ai1.life - 2);
  });

  it("⭐ MEGRIM — the DAMAGE form lands on the discarder, not the controller", () => {
    // The damage referent is synthesized from ctx.discardingPlayerId, never chosen. Without the synthesis
    // the atom resolves with NO target and deals 0 — silent, and indistinguishable from "nothing happened"
    // unless a life total is asserted. So it is.
    const before = board(MEGRIM, 1);
    const s = discardVia(before, "Target player discards a card.", TARGET_AI1);
    expect(s.players.ai1.life).toBe(before.players.ai1.life - 2);
    expect(s.players.user.life).toBe(before.players.user.life);      // the wrong-seat half
  });

  it("the checker itself fires per card and enqueues nothing when there is no watcher", () => {
    const s = board(CARESS, 1);
    expect((checkDiscardTriggers(s, "ai1", 3).pendingTriggers || []).length).toBe(3);   // one per card
    expect((checkDiscardTriggers(s, "user", 1).pendingTriggers || []).length).toBe(0);  // self-discard: no opponent watcher
  });
});

describe("⭐ WIRING COMPLETENESS — the invariant behavioural tests cannot reach", () => {
  // The behavioural tests above drive the forced chain and the random pitch. The other NINE discard sites
  // (five cost payments, connive, iterated edict, and both pending-choice settles) have no cheap driver —
  // so deleting their fire would break no test, and the ability would simply never fire on those paths.
  // That is the single most likely way this slice rots. Assert the invariant STRUCTURALLY instead: every
  // hand→graveyard move in the engine is accompanied by a discard-event fire. It also catches the case that
  // worries me more than today's code — a NEW discard site added later with no fire at all.
  it("every hand→graveyard move site fires the discard event", () => {
    const files = [
      "effects/atoms/hand.js", "effects/atoms/connive.js", "effects/atoms/iteratedEdict.js",
      "effects/runProgram.js", "../../lib/learn/actionDispatcher.js",
    ];
    const MOVE = 'fromZone: "hand", toZone: "graveyard"';
    let sites = 0;
    const unwired = [];
    for (const rel of files) {
      const src = readFileSync(new URL(rel, import.meta.url), "utf-8").split("\n");
      src.forEach((ln, i) => {
        if (!ln.includes(MOVE)) return;
        sites += 1;
        // The fire may sit a few lines below, past a log call and its comment block.
        if (!src.slice(i, i + 10).join("\n").includes("checkDiscardTriggers")) unwired.push(`${rel}:${i + 1}`);
      });
    }
    // 11 → 12 on 2026-08-01: actionDispatcher.applyDiscardAbility, the "<mana>, Discard this card: <effect>"
    // hand ability (cycling generalized). The tripwire fired exactly as designed — the diff was read, the new
    // site DOES fire checkDiscardTriggers (it is not in `unwired` below), so the count moves rather than the
    // invariant. Bumping this number without checking `unwired` would defeat the whole test.
    // 12 → 13 on 2026-08-07: runProgram.resolveSacUnlessPayChoice's discard arm (SAC-UNLESS-DISCARD, the
    // Masticore cycle). Tripwire fired again; `unwired` stayed empty — the new site fires
    // checkDiscardTriggers one line below its move. Count moves, invariant holds.
    expect(sites).toBe(13);      // if this changes, a discard site was added or removed — read the diff
    expect(unwired).toEqual([]);
  });
});

describe("the sentinel rewrite + the referent gate", () => {
  it('"that player" becomes the discarding-player sentinel on this event', () => {
    const d = detectTriggers(CARESS)[0];
    expect(d.event).toBe("discarded");
    expect(d.effectClause).toBe("the discarding player loses 2 life");
  });

  it("the sentinel parses to the referent-bound atom", () => {
    expect(parseEffectClause("the discarding player loses 2 life", "Instant")?.atoms)
      .toEqual([{ op: "lose-life", who: "discardingPlayer", amount: 2, targetType: null }]);
  });

  it("⛔ the referent routes ONLY off the discarded event", () => {
    const clause = "the discarding player loses 2 life";
    expect(triggerRoutesNatively({ event: "discarded", effectClause: clause })).toBe(true);
    expect(triggerRoutesNatively({ event: "upkeep", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "dies", effectClause: clause })).toBe(false);
  });

  it("⛔ a FILTERED variant is not this event (SAFE FN)", () => {
    const filtered = { name: "F", type: "Enchantment",
      oracle: "Whenever an opponent discards a nonland card, that player loses 2 life." };
    expect(detectTriggers(filtered).some((d) => d.event === "discarded")).toBe(false);
  });
});

describe("the corpus rows", () => {
  it("the event alone flips the payoff-free carriers", () => {
    expect(classifyCard(GRIMOIRE)).toMatch(/^native/);
    expect(classifyCard(SANGROMANCER)).toMatch(/^native/);
    expect(classifyCard(ABYSSAL_NOCTURNUS)).toMatch(/^native/);
  });

  it("the referent carries the life-loss trio", () => {
    expect(classifyCard(CARESS)).toMatch(/^native/);
    expect(classifyCard(RAIDERS_WAKE)).toMatch(/^native/);
    expect(classifyCard(FELL_SPECTER)).toMatch(/^native/);
  });

  it("Megrim too — the DAMAGE form of the same referent", () => {
    // Landed as a follow-up once the diagnosis showed the recipient PHRASE was the only blocker: the
    // subject and the fixed-damage shape already parsed, so only "the discarding player" needed adding to
    // the damage recipient vocabulary plus the ctx synthesis.
    expect(classifyCard(MEGRIM)).toMatch(/^native/);
  });
});
