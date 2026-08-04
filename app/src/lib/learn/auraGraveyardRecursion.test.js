/**
 * auraGraveyardRecursion.test.js — AU-GY: an Aura with a modeled creature bonus PLUS the GRAVEYARD
 * self-recursion ability (Bestial Bloodline, Talons of Wildwood, Vineweft). Off the fresh census
 * signature "{2}{R}: Return this card from your graveyard to your hand" — 6 native carriers / 3 sole
 * blockers, so the ability is plainly built and its blockers are a defect report.
 *
 * WHY THEY PARKED. The graveyard ability is modeled by its OWN lane (GY-1), which offers it FROM THE
 * GRAVEYARD — so `parseActivatedAbilities` reports it unmodeled, because it is not a battlefield
 * activation at all, and isNativeAura's residue walk then rejected the line. Every clause on the card is
 * played by the engine; no lane put the two together. permanentFullyCovered already composes exactly this
 * for non-Auras (census slice 56) — Auras never reach it, because the aura block returns first.
 *
 * COMPOSED, NOT LOOSENED (the EQ-2 discipline used throughout this file's neighbours): the remainder must
 * satisfy isNativeAura on its own, and the stripped line must be a modeled graveyard ability on its own.
 *
 * TIER CHOICE IS LOAD-BEARING, not cosmetic: native-activated, so grantAuraCastHostType's lane offers the
 * CAST. isNativeAura is FALSE on the full residue-carrying card, so tiering it native-aura would credit an
 * Aura the engine would never offer to cast — pinned below, because that is the false positive the choice
 * exists to prevent.
 *
 * ⭐ RUNTIME MEASURED ON AN AURA before the tier moved — the GY-1 lane was built for creatures
 * (Reassembling Skeleton / Sanitarium Skeleton), and "it should work the same" is not evidence. It does:
 * offered off the graveyard, onto the stack, resolves, card moves graveyard -> hand.
 *
 * ⚠️ PROBE NOTE: the first runtime probe read as a silent no-op because it asserted right after
 * dispatchAction. The ability uses the STACK — assert after resolveTopOfStack, or any activated ability
 * looks dead. (The wrong-assertion-layer trap, in its activated-ability form.)
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read):
 *   • the isNativeAura remainder revalidation forced true -> 1 red (the unmodeled-bonus park). That is
 *     the load-bearing half;
 *   • the `gyLines.length &&` requirement dropped -> GREEN, and it is redundant rather than untested:
 *     with no graveyard line the remainder IS the full card, and `isNativeAura(card)` was already
 *     checked-and-false one lane above, so the branch cannot fire. Kept because it states the lane's
 *     precondition where a reader will look for it, but it guards nothing today — said out loud rather
 *     than left to imply coverage it does not provide.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, grantAuraCastHostType } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BESTIAL_BLOODLINE = { id: "c-bb", name: "Bestial Bloodline", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2.\n{4}{G}: Return this card from your graveyard to your hand." };
const VINEWEFT = { id: "c-vw", name: "Vineweft", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1.\n{4}{G}: Return this card from your graveyard to your hand." };
const TALONS = { id: "c-tw", name: "Talons of Wildwood", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has trample.\n{2}{G}: Return this card from your graveyard to your hand." };

describe("AU-GY — recognition", () => {
  it("the three carriers flip to native-activated", () => {
    expect(classifyCard(BESTIAL_BLOODLINE)).toBe("native-activated");
    expect(classifyCard(VINEWEFT)).toBe("native-activated");
    expect(classifyCard(TALONS)).toBe("native-activated");
  });

  it("⭐ the tier is what makes the CAST reachable — grantAuraCastHostType offers all three", () => {
    // If these were tiered native-aura, legalChoices' isNativeAura branch would not fire (isNativeAura is
    // FALSE on the full card) and nothing else would offer the cast: a card credited native that can
    // never be played. That FP is what this assertion guards.
    for (const c of [BESTIAL_BLOODLINE, VINEWEFT, TALONS]) {
      expect(grantAuraCastHostType(c), c.name).toMatchObject({ host: "creature" });
    }
  });

  it("the pure halves are untouched (nothing stolen from the lanes above)", () => {
    expect(classifyCard({ ...VINEWEFT, id: "c-p", oracle: "Enchant creature\nEnchanted creature gets +1/+1." })).toBe("native-aura");
  });

  it("⛔ an UNMODELED bonus beside the same graveyard ability still parks", () => {
    expect(classifyCard({ id: "c-x1", name: "Odd Weft", type: "Enchantment — Aura", mana: "{G}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1 as long as you have interpreted the omens.\n{4}{G}: Return this card from your graveyard to your hand." })).toBe("body-only");
  });

  it("⛔ an Aura with NO graveyard ability and a residue line still parks (the lane needs its own half)", () => {
    expect(classifyCard({ id: "c-x2", name: "Plain Weft", type: "Enchantment — Aura", mana: "{G}",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhenever a player consults an oracle, interpret its riddle however you like." })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the graveyard ability works for an AURA, not just the creatures GY-1 was built for", () => {
  function graveyardBoard(card, pool) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, graveyard: [card], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
  }

  it("Bestial Bloodline: offered from the graveyard, resolves, and actually moves graveyard -> hand", () => {
    let s = graveyardBoard(BESTIAL_BLOODLINE, { G: 5 });
    const act = filterActions(legalActionsForPlayer(s, "user"), "activate-gy-recursion").find((a) => a.cardId === "c-bb");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect((s.stack || []).map((o) => o.kind)).toContain("activated-ability");   // it uses the STACK
    s = resolveTopOfStack(s);
    expect(s.players.user.hand.map((c) => c.name)).toContain("Bestial Bloodline");
    expect(s.players.user.graveyard).toHaveLength(0);
  });

  it("⛔ not offered without the mana (CR 601.2h — an unpayable cost is never offered)", () => {
    const s = graveyardBoard(BESTIAL_BLOODLINE, { G: 1 });
    expect(filterActions(legalActionsForPlayer(s, "user"), "activate-gy-recursion").find((a) => a.cardId === "c-bb")).toBeUndefined();
  });
});
