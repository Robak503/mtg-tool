/**
 * discardAbilityStaticLane.test.js — a "<mana>, Discard this card: <effect>" hand ability was stripped
 * for ONE residue lane and not the others, so a card pairing it with a modeled STATIC parked while each
 * half alone was native (Waker of Waves, from the census two-flip list).
 *
 * THE SHAPE, and it is the third instance of one pattern this session: an ability played from a NON-
 * BATTLEFIELD zone is modeled by its own lane, so every battlefield-oriented gate reads its line as
 * residue. Seen already with the graveyard self-recursion (Auras) and the no-maximum-hand-size static.
 * Here `stripDiscardCostAbilityLine` existed and was correct — it just lived inside `isKeywordOnly`, so
 * the native-BODY lane saw a clean card and `staticAbilitiesCoverCard`, which walks the raw clauses, did
 * not. Waker of Waves is the tell: opponent anthem alone -> native-static, discard ability alone ->
 * native-body, the two together -> body-only.
 *
 * FIXED AS ONE SHARED SOURCE, not a second call site: the strip moved to a classifyCard PRE-STRIP beside
 * the Leyline / Suspend / no-max-hand pre-strips, so every lane below sees one text.
 *
 * ⛔ THE GATE IS THE RUNTIME'S OWN. It strips only when `discardCostAbilityModeled` says the engine really
 * offers the ability — the same predicate `legalChoices.actionsDiscardAbilityFromHand` enumerates on
 * (line parses · effect program HIGH · needs NO chosen target). A TARGETED discard ability is refused by
 * the engine, so it is not stripped and still parks its card. That is pinned below, because it is the
 * whole reason this strip cannot over-claim.
 *
 * Mutation-checked (2026-08-03, verified applied): the pre-strip disabled -> the Waker pin goes red;
 * the strip's `discardCostAbilityModeled` gate forced to always-strip -> the targeted-ability parks go
 * red (Steel Wrecking Ball / Trumpeting Carnosaur would be credited for an ability the engine refuses).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseDiscardCostAbility } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANTHEM = "Creatures your opponents control get -1/-0.";
const DISCARD_ABILITY = "{1}{U}, Discard this card: Look at the top two cards of your library. Put one of them into your hand and the other into your graveyard.";
const WAKER_OF_WAVES = { id: "c-ww", name: "Waker of Waves", type: "Creature — Whale", mana: "{5}{U}", power: "6", toughness: "5",
  oracle: `${ANTHEM}\n${DISCARD_ABILITY}` };

describe("recognition", () => {
  it("Waker of Waves flips to native-static", () => {
    expect(classifyCard(WAKER_OF_WAVES)).toBe("native-static");
  });

  it("each half was ALREADY native alone — this was pure composition", () => {
    expect(classifyCard({ ...WAKER_OF_WAVES, id: "c-a", oracle: ANTHEM })).toBe("native-static");
    expect(classifyCard({ ...WAKER_OF_WAVES, id: "c-d", oracle: DISCARD_ABILITY })).toBe("native-body");
  });

  it("⭐ a TARGETED discard ability is stripped too (GRADUATED 2026-08-14 — the lane expands targets now)", () => {
    // Was the blanket-refusal pin. legalChoices.actionsDiscardAbilityFromHand now expands a chosen-target
    // program per legal combo (expandCastChoices — Trumpeting Carnosaur, Steel Wrecking Ball), so the
    // strip credits it in lockstep. Zero-legal-targets stays a runtime gate (witnessed in
    // discardCostHandAbility.test.js), exactly as on the cast path.
    const targeted = { ...WAKER_OF_WAVES, id: "c-t", name: "Targeted Whale",
      oracle: `${ANTHEM}\n{1}{U}, Discard this card: Destroy target creature.` };
    expect(classifyCard(targeted)).toBe("native-static"); // the ANTHEM line names the tier once the discard line strips
  });

  it("⛔ an UNMODELED second clause still parks the card (nothing else is loosened)", () => {
    expect(classifyCard({ ...WAKER_OF_WAVES, id: "c-u", name: "Odd Whale",
      oracle: `Whenever a player consults an oracle, interpret its riddle however you like.\n${DISCARD_ABILITY}` })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the ability the strip credits is genuinely offered from HAND", () => {
  function handBoard(card, pool) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [card], library: [
        { id: "l1", name: "Top1", type: "Instant", oracle: "" }, { id: "l2", name: "Top2", type: "Instant", oracle: "" },
      ], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
  }

  it("Waker of Waves' discard ability is offered from hand with the mana available", () => {
    expect(parseDiscardCostAbility(WAKER_OF_WAVES)).toMatchObject({ cost: "{1}{U}" });
    const s = handBoard(WAKER_OF_WAVES, { U: 2 });
    const act = filterActions(legalActionsForPlayer(s, "user"), "discard-ability").find((a) => a.cardId === "c-ww");
    expect(act).toBeTruthy();
  });

  it("⛔ and NOT offered without the mana (CR 601.2h — an unpayable cost is never offered)", () => {
    const s = handBoard(WAKER_OF_WAVES, { U: 0 });
    expect(filterActions(legalActionsForPlayer(s, "user"), "discard-ability").find((a) => a.cardId === "c-ww")).toBeUndefined();
  });

  it("⛔ the TARGETED variant is never offered — the engine's refusal the strip gate mirrors", () => {
    const targeted = { ...WAKER_OF_WAVES, id: "c-t2", name: "Targeted Whale",
      oracle: `${ANTHEM}\n{1}{U}, Discard this card: Destroy target creature.` };
    const s = handBoard(targeted, { U: 2 });
    expect(filterActions(legalActionsForPlayer(s, "user"), "discard-ability").find((a) => a.cardId === "c-t2")).toBeUndefined();
  });
});
