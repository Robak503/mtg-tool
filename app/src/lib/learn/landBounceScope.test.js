/**
 * landBounceScope.test.js — LB-1: "return a LAND you control to its owner's hand" (the self-bounce scope).
 * Tazeem Raptor, Sutina Speaker of the Tajuru, Wayward Guide-Beast, Noggle Bridgebreaker, Zell Dincht.
 *
 * ⭐ A NOUN AND A FILTER FLAG, NOT MACHINERY. `oneYouControlWorst`, `worstOwnBounceTarget` and the optional
 * "you may" wrapper all existed; the noun alternation admitted `permanent|creature` and not `land`, so the
 * whole family parked. The `landOnly` filter mirrors the `creatureOnly` that was already there.
 *
 * ⭐ THE RANK ALREADY DID THE RIGHT THING: it prefers a TAPPED LAND, which is the correct line for this
 * family — you return the land you have already used this turn.
 *
 * ⛔ NO IMPLICIT excludeSource. "a land you control" includes the source; CR 109.5 would require the printed
 * word "another" and these cards do not print it. Modelling that permission away would be a CREED violation
 * in the refusing direction. The rank's first-in-order tie-break means an earlier tapped land wins anyway,
 * so a self-bounce only happens when it is the only tapped land — a real line, not a bug.
 *
 * ⭐⭐ SIXTEEN CARDS IN PLAY, FIVE VISIBLE TO THE METRIC. `classifyCard` short-circuits every Land to the
 * `land` tier, so the 11 Karoo bounce-lands (Selesnya Sanctuary, Azorius Chancery, Simic Growth Chamber…)
 * are counted the same before and after — but their ETB bounce genuinely works now. Verified end to end:
 * playing the Karoo and passing priority moves the old land off the battlefield and into hand, leaving a
 * creature on the same board untouched.
 * ⚠️⚠️ I PUBLISHED THE OPPOSITE OF THAT FIRST, and the retraction is the lesson worth keeping. An earlier
 * probe read `s.stack` IMMEDIATELY after the land drop, found it empty, and concluded land ETB triggers
 * never fire — with a matched creature control that appeared to confirm it. Both readings were taken one
 * step too early: `applyPlayLand` puts the trigger in `pendingTriggers`, which flushes on the next
 * PRIORITY PASS. Flush first and both the bounce and a plain land-ETB draw work perfectly.
 * ⛔ THE RULE: a matched control does not rescue a harness that stops one step early — it makes the wrong
 * answer look rigorous, because both sides measure the same premature moment. Before believing a NEGATIVE,
 * assert the POSITIVE control produced its actual effect, not merely that something appeared on the stack.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · `land` removed from the noun alternation -> all five park.
 *   · `landOnly` dropped from the `atomTargets` DISPATCH -> all five STILL classify native while every real
 *     card silently loses the flag: a board whose only tapped permanent is a creature returns the CREATURE
 *     to hand for a card that says "land". Invisible to the tier.
 * ⚠️⚠️ THAT SECOND MUTATION SURVIVED THE FIRST TIME, AND THE TEST WAS THE THING AT FAULT. The pool rows
 * originally called `worstOwnBounceTarget` DIRECTLY, which exercises the FILTER and says nothing about the
 * WIRING — so dropping the flag from the dispatch line left this suite green while the behaviour broke for
 * every card. Rewritten to go through `atomTargets`, the seam the parser actually feeds, with the direct
 * helper kept as a control so a future failure separates filter from wiring. **A pin that constructs the
 * argument itself is testing the callee, not the call.**
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargets, worstOwnBounceTarget } from "./effects/atoms/shared.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TAZEEM_RAPTOR = { id: "c-tr", name: "Tazeem Raptor", type: "Creature — Bird", mana: "{4}{U}", power: "3", toughness: "3",
  oracle: "Flying\nWhen this creature enters, you may return a land you control to its owner's hand." };
const WAYWARD_GUIDE_BEAST = { id: "c-wgb", name: "Wayward Guide-Beast", type: "Creature — Beast", mana: "{1}{R}", power: "4", toughness: "3",
  oracle: "Trample\nWhenever this creature attacks, return a land you control to its owner's hand.\nYou may play an additional land on each of your turns." };

describe("the carriers", () => {
  it("⭐ the land noun no longer parks the self-bounce", () => {
    for (const c of [TAZEEM_RAPTOR, WAYWARD_GUIDE_BEAST]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐⭐ all three shapes carry landOnly — and the incumbents are BYTE-IDENTICAL", () => {
    const H = "to its owner's hand";
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      forced: p(`return a land you control ${H}`),
      mayOptional: p(`you may return a land you control ${H}`),
      upToOneTarget: p(`return up to one target land you control ${H}`),
      // ⛔ REGRESSION GUARD — three incumbent forms already ran through these two matchers.
      permanent: p(`return a permanent you control ${H}`),
      creature: p(`return a creature you control ${H}`),
      another: p(`return another permanent you control ${H}`),
    };
    console.log("  WITNESS landBounceParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.forced).toEqual([{ op: "bounce", scope: "oneYouControlWorst", landOnly: true }]);
    expect(row.mayOptional).toEqual([{ op: "bounce", scope: "oneYouControlWorst", landOnly: true, optional: true }]);
    expect(row.upToOneTarget).toEqual([{ op: "bounce", scope: "oneYouControlWorst", optional: true, landOnly: true }]);
    expect(row.permanent).toEqual([{ op: "bounce", scope: "oneYouControlWorst" }]);
    expect(row.creature).toEqual([{ op: "bounce", scope: "oneYouControlWorst", creatureOnly: true }]);
    expect(row.another).toEqual([{ op: "bounce", scope: "oneYouControlWorst", excludeSource: true }]);
  });
});

describe("⭐⭐ LAW 6 — the chosen permanent, with the creature named as excluded", () => {
  it("⭐⭐ landOnly returns a LAND — and returns NOTHING rather than a creature when no land is out", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type, tapped) => ({
      ...createPermanent({ id, controller: "user", summoningSick: false,
        card: { id: `c-${id}`, name: id, type, oracle: "", ...(type.includes("Creature") ? { power: 2, toughness: 2 } : {}) } }),
      tapped,
    });
    const board = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      mk("UNTAPPED_LAND", "Land — Forest", false),
      mk("TAPPED_LAND", "Land — Island", true),
      mk("TAPPED_CREATURE", "Creature — Bear", true),
      mk("UNTAPPED_ARTIFACT", "Artifact", false),
    ] } } };
    // ⛔ THE SECOND BOARD IS THE ASSERTION THAT MATTERS. Without a land, a landOnly bounce must return an
    // EMPTY pick — never fall through to the creature, which is what the flag being ignored would do.
    const noLand = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("TAPPED_CREATURE", "Creature — Bear", true)] } } };
    // ⛔⛔ THROUGH `atomTargets`, NOT `worstOwnBounceTarget` DIRECTLY — and a survived mutation is why.
    // The first version of this test called the helper straight, which tests the FILTER and says nothing
    // about the WIRING: dropping `landOnly` from the atomTargets dispatch line left this suite green while
    // every real card silently lost the flag. Going through the atom is what makes the pin cover the seam
    // the parser actually feeds.
    const pick = (state, atom) => atomTargets(state, { scope: "oneYouControlWorst", ...atom }, { controller: "user" }).map((t) => t.id);
    const row = {
      landOnly: pick(board, { landOnly: true }),
      landOnlyNoLandOnBoard: pick(noLand, { landOnly: true }),
      creatureOnly: pick(board, { creatureOnly: true }),
      unfiltered: pick(board, {}),
      // The helper called directly, as the control that isolates filter-vs-wiring if this ever goes red.
      helperDirect: worstOwnBounceTarget(board, "user", { landOnly: true }).map((t) => t.id),
    };
    console.log("  WITNESS landBouncePick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      landOnly: ["TAPPED_LAND"],       // ⭐ the already-used land — the correct line for this family
      landOnlyNoLandOnBoard: [],       // ⛔ NOT the creature
      creatureOnly: ["TAPPED_CREATURE"],
      unfiltered: ["TAPPED_LAND"],
      helperDirect: ["TAPPED_LAND"],
    });
  });
});

describe("⭐⭐ THE KAROO, END TO END — the claim I retracted, now pinned", () => {
  it("⭐⭐ playing Selesnya Sanctuary returns a LAND to hand and leaves the creature alone", () => {
    // ⛔ THIS TEST EXISTS BECAUSE I PUBLISHED THE OPPOSITE. Nothing here is exotic — the only thing the
    // original probe got wrong was looking before the flush. Pinning the whole path means the retracted
    // claim ("land ETB triggers never fire") can never be re-derived from a premature read.
    const KAROO = { id: "c-ss", name: "Selesnya Sanctuary", type: "Land",
      oracle: "This land enters tapped.\nWhen this land enters, return a land you control to its owner's hand.\n{T}: Add {G}{W}." };
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type, tapped) => ({ ...createPermanent({ id, controller: "user", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, oracle: "" } }), tapped });
    let s = { ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players, user: { ...base.players.user, hand: [KAROO],
        battlefield: [mk("OLD_LAND", "Land — Plains", true), mk("MY_BEAR", "Creature — Bear", true)] } } };
    const play = filterActions(legalActionsForPlayer(s, "user"), "play-land").find((a) => a.cardId === "c-ss");
    expect(play, "the Karoo must be playable").toBeTruthy();
    s = dispatchAction(s, play);
    // ⭐ THE WHOLE LESSON IN ONE ASSERTION: the stack is EMPTY here and the trigger is PENDING. Reading the
    // stack at this moment is what produced the false finding.
    expect(s.stack || []).toHaveLength(0);
    expect((s.pendingTriggers || []).map((t) => t.event)).toContain("etb");
    for (let i = 0; i < 8; i++) {
      const pass = filterActions(legalActionsForPlayer(s, s.priorityHolder), "pass-priority")[0];
      if (pass) s = dispatchAction(s, pass);
      if (s.stack?.length) s = resolveTopOfStack(s);
      if (!s.stack?.length && !(s.pendingTriggers || []).length && i > 2) break;
    }
    const row = {
      oldLandOnBattlefield: !!findPermanent(s, "OLD_LAND"),
      oldLandInHand: s.players.user.hand.some((c) => c.name === "OLD_LAND"),
      bearUntouched: !!findPermanent(s, "MY_BEAR"),
    };
    console.log("  WITNESS karooResolved", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ oldLandOnBattlefield: false, oldLandInHand: true, bearUntouched: true });
  });
});
