/**
 * kashiTribeTapLock.test.js — SELF combat-damage-to-a-creature TAP-AND-LOCK (CR 510.2 / 302.6): "Whenever
 * this creature deals combat damage to a creature, tap that creature and it doesn't untap during its
 * controller's next untap step." The Kamigawa Snake Warriors — Kashi-Tribe Warriors, Kashi-Tribe Reaver,
 * Orochi Ranger, Matsu-Tribe Birdstalker — plus Frostwalk Bastion, which prints it on a LAND.
 *
 * ⭐ BUILT ENGINE, NO IGNITION. The `combatDamageToCreature` event, the `selfDealerToCreature` scope, the fire
 * site that threads the DAMAGED creature as the triggering permanent, and the tap+noUntapNext atom all
 * shipped for Voracious Cobra. The sibling detector is anchored to the DESTROY effect, so a second payoff
 * shape on the same event/scope/fire site simply had no way in. This adds that shape and nothing else.
 *
 * ⛔⛔ AND THE LAST MILE WAS A CLAUSE SPLIT, NOT ANY OF THAT. With the detector, the rewrite and the atom
 * matcher all verified correct in isolation, every carrier still parked: splitClauses shattered the sentinel
 * on its internal " and " into "tap the triggering creature" + an unbindable "it doesn't untap…", and the
 * program dropped to LOW. **Three green components and a card that still does nothing.** The keep-whole guard
 * is the load-bearing line, and it is pinned first below. Its chosen-target sibling records the identical
 * failure — the same trap, the second time.
 *
 * ⓘ "this land" is admitted as a self subject here, unlike the destroy twin: Frostwalk Bastion animates
 * itself and deals combat damage as a land, so refusing the subject would leave its printed trigger dead at
 * runtime. It reads native through the land tier either way, so this buys correctness, not coverage.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * keep-whole guard removed -> the program drops to LOW and all four carriers park; `tapLockThatCreature`
 * dropped from the descriptor pass-through -> the rewrite never fires, same park; the atom's noUntapNext
 * removed -> the runtime witness shows the damaged creature untapping normally.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { checkCombatDamageToCreatureTriggers, detectTriggers } from "./triggers.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, untapAll } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Whenever this creature deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step.";
const SENTINEL = "tap the triggering creature and it doesn't untap during its controller's next untap step";
const WARRIORS = { id: "c-ktw", name: "Kashi-Tribe Warriors", type: "Creature — Snake Warrior", mana: "{3}{G}{G}", power: "3", toughness: "3", oracle: LINE };
const REAVER = { id: "c-ktr", name: "Kashi-Tribe Reaver", type: "Creature — Snake Warrior", mana: "{3}{G}", power: "3", toughness: "3",
  oracle: `${LINE}\n{1}{G}: Regenerate this creature.` };
const VICTIM = { id: "c-v", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

describe("⛔⛔ THE KEEP-WHOLE GUARD — pinned FIRST because it was the last mile", () => {
  it("the sentinel survives the top-level ' and ' split as ONE clause", () => {
    expect(splitClauses(SENTINEL)).toEqual([SENTINEL]);
  });

  it("…and therefore parses HIGH to one tap-with-lockdown atom on the triggering creature", () => {
    const p = parseEffectClause(SENTINEL, "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "tap", target: "thatCreature", noUntapNext: true }]);
  });

  it("⛔ the lockOnly SIBLING is NOT this — that one must not tap", () => {
    const lockOnly = parseEffectClause("the triggering creature doesn't untap during its controller's next untap step", "Creature");
    expect(lockOnly.atoms).toEqual([{ op: "tap", target: "thatCreature", noUntapNext: true, lockOnly: true }]);
  });
});

describe("detect + classify", () => {
  it("⭐ ONE descriptor on the SHIPPED event/scope, carrying the new payoff flag", () => {
    const ds = detectTriggers(WARRIORS).filter((t) => t.event === "combatDamageToCreature");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ scope: "selfDealerToCreature", tapLockThatCreature: true, effectClause: SENTINEL });
  });

  it("⭐ the carriers flip, including the one behind a regenerate ability", () => {
    expect(classifyCard(WARRIORS)).toBe("native-trigger");
    expect(classifyCard(REAVER)).toBe("native-mixed");
    expect(classifyCard({ id: "c-or", name: "Orochi Ranger", type: "Creature — Snake Warrior Ranger", mana: "{1}{G}", power: "1", toughness: "1", oracle: LINE })).toBe("native-trigger");
  });

  it("⭐ the LAND subject is admitted (Frostwalk Bastion animates itself and connects)", () => {
    const ds = detectTriggers({ id: "c-fb", name: "Frostwalk Bastion", type: "Snow Land",
      oracle: "Whenever this land deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step." });
    expect(ds.filter((t) => t.tapLockThatCreature)).toHaveLength(1);
  });

  it("⛔ the DESTROY twin is untouched, and a you-control watcher still refuses", () => {
    const cobra = detectTriggers({ name: "Voracious Cobra", type: "Creature — Snake", power: "2", toughness: "2",
      oracle: "Deathtouch\nWhenever this creature deals combat damage to a creature, destroy that creature." });
    expect(cobra.filter((t) => t.destroyThatCreature)).toHaveLength(1);
    expect(cobra.filter((t) => t.tapLockThatCreature)).toHaveLength(0);
    const youControl = detectTriggers({ name: "Probe", type: "Creature — Snake", power: "2", toughness: "2",
      oracle: "Whenever a creature you control deals combat damage to a creature, tap that creature and it doesn't untap during its controller's next untap step." });
    expect(youControl.filter((t) => t.tapLockThatCreature)).toHaveLength(0);
  });
});

describe("⭐ LAW 6 — it fires on real combat damage and locks the DAMAGED creature", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const warrior = createPermanent({ id: "ktw", card: WARRIORS, controller: "user", summoningSick: false });
    const victim = createPermanent({ id: "vic", card: VICTIM, controller: "ai1", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [warrior] }, ai1: { ...s.players.ai1, battlefield: [victim] } } };
  }

  it("⭐⭐ the damaged creature is tapped AND locked; it stays down one untap step, then untaps", () => {
    const fired = checkCombatDamageToCreatureTriggers(board(), [{ dealerId: "ktw", dealerController: "user", damagedCreatureId: "vic" }]);
    const trigs = (fired.pendingTriggers || []).filter((t) => t.event === "combatDamageToCreature");
    const atom = parseEffectClause(SENTINEL, "Creature").atoms[0];
    let s = applyTapEffect(fired, atom, { triggeringPermanentId: trigs[0].context.triggeringPermanentId, sourceId: "ktw" }, true);
    const rows = [{ when: "after resolve", tapped: !!findPermanent(s, "vic").permanent.tapped, flagged: !!findPermanent(s, "vic").permanent.doesNotUntapNext }];
    s = untapAll(s, { playerId: "ai1" });
    rows.push({ when: "untap step 1", tapped: !!findPermanent(s, "vic").permanent.tapped, flagged: !!findPermanent(s, "vic").permanent.doesNotUntapNext });
    s = untapAll(s, { playerId: "ai1" });
    rows.push({ when: "untap step 2", tapped: !!findPermanent(s, "vic").permanent.tapped, flagged: !!findPermanent(s, "vic").permanent.doesNotUntapNext });
    console.log("  WITNESS kashiTapLock", JSON.stringify({ triggers: trigs.length, referent: trigs[0].context.triggeringPermanentId, rows }));
    expect(trigs).toHaveLength(1);
    expect(trigs[0].context.triggeringPermanentId).toBe("vic"); // ⛔ the DAMAGED creature, never the dealer
    expect(rows).toEqual([
      { when: "after resolve", tapped: true, flagged: true },   // ⭐ this one DOES tap — unlike the lockOnly sibling
      { when: "untap step 1", tapped: true, flagged: false },   // held, and consumed itself
      { when: "untap step 2", tapped: false, flagged: false },  // one-shot, never a permanent freeze
    ]);
  });

  it("⛔ the dealer itself is never the referent, so it is never locked by its own trigger", () => {
    const fired = checkCombatDamageToCreatureTriggers(board(), [{ dealerId: "ktw", dealerController: "user", damagedCreatureId: "vic" }]);
    const trigs = (fired.pendingTriggers || []).filter((t) => t.event === "combatDamageToCreature");
    const atom = parseEffectClause(SENTINEL, "Creature").atoms[0];
    const s = applyTapEffect(fired, atom, { triggeringPermanentId: trigs[0].context.triggeringPermanentId, sourceId: "ktw" }, true);
    expect(findPermanent(s, "ktw").permanent.doesNotUntapNext).toBeUndefined();
    expect(findPermanent(s, "ktw").permanent.tapped).toBeFalsy();
  });

  it("⛔ an unrelated dealer fires nothing (the identity gate on the self scope)", () => {
    const fired = checkCombatDamageToCreatureTriggers(board(), [{ dealerId: "vic", dealerController: "ai1", damagedCreatureId: "ktw" }]);
    expect((fired.pendingTriggers || []).filter((t) => t.event === "combatDamageToCreature")).toHaveLength(0);
  });
});
