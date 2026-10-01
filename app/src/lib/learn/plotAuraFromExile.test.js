/**
 * plotAuraFromExile.test.js — the PLOT line parked a PERMANENT whose every other clause is modeled
 * (Demonic Ruckus), and the credit is only honest because the plot flow was driven end to end for an
 * Aura first.
 *
 * THE DRIFT, fourth instance of one pattern this session: a NON-BATTLEFIELD-ZONE ability reads as
 * residue to a battlefield-oriented gate. The plot line is already stripped on the SPELL path
 * (parseEffectProgram) and inside the clone view — but a PERMANENT that is not a clone meets neither,
 * because the Aura block returns long before both. Demonic Ruckus's bonus plus its modeled LTB trigger
 * is native-trigger on its own; adding "Plot {R}" parked the whole card.
 *
 * ⭐ WHY STRIPPING IS HONEST — the SUSPEND test, applied unchanged. Plot is an ALTERNATIVE way to cast a
 * card that has a real printed mana cost, so the hard cast resolves byte-identically and not offering
 * plot would be a safe false negative. Contrast the no-mana-cost suspend cards (Lotus Bloom, Ancestral
 * Vision), which can ONLY be played through their keyword and therefore keep their line. parsePlotCost
 * returns null for a plot-TRIGGER or plot-GRANTING card, so only a clean modeled cost is removed.
 *
 * ⛔ AND WHY IT NEEDED A RUNTIME DRIVE, not just a tier diff: stripping the line makes the ENGINE offer
 * plot, because plotPlayable gates on isNativeTier(classifyCard). A card that could be plotted into
 * exile and then never cast from there would be a DEAD END — strictly worse than parking it. So the flow
 * is driven below: plot offered -> hand to exile -> on a later turn the free cast returns as a real AURA
 * spell with a legal host. (Same lesson as the qualified-subject slice: a classification diff cannot see
 * a card the action layer refuses to play.)
 *
 * Mutation-checked (2026-08-03, each verified applied): the permanent-only type guard removed -> nothing
 * moves (instants/sorceries are already stripped upstream by parseEffectProgram, so that guard is
 * REDUNDANT-but-honest and is recorded as such rather than pinned); the pre-strip disabled -> the
 * classification pin AND both runtime pins go red.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DEMONIC_RUCKUS = { id: "c-dr", name: "Demonic Ruckus", type: "Enchantment — Aura", mana: "{1}{R}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has menace and trample.\nWhen this Aura is put into a graveyard from the battlefield, draw a card.\nPlot {R} (You may pay {R} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)" };

describe("recognition", () => {
  it("Demonic Ruckus flips to native-trigger", () => {
    expect(classifyCard(DEMONIC_RUCKUS)).toBe("native-trigger");
  });

  it("the plot line was the ONLY blocker — the rest was already native", () => {
    const noPlot = { ...DEMONIC_RUCKUS, id: "c-np", oracle: DEMONIC_RUCKUS.oracle.split("\n").slice(0, 3).join("\n") };
    expect(classifyCard(noPlot)).toBe("native-trigger");
  });

  it("⛔ an UNMODELED clause beside the plot line still parks the card", () => {
    expect(classifyCard({ ...DEMONIC_RUCKUS, id: "c-u", name: "Odd Ruckus",
      oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has menace and trample.\nWhenever a player consults an oracle, interpret its riddle however you like.\nPlot {R}" })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the plot flow completes for an AURA, exile to battlefield", () => {
  function board(turn = 1) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "c-b", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear], hand: [DEMONIC_RUCKUS],
        manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } } } };
  }

  it("plot is offered, and paying it moves the card hand -> exile", () => {
    let s = board();
    const plot = filterActions(legalActionsForPlayer(s, "user"), "plot").find((a) => a.cardId === "c-dr");
    expect(plot).toBeTruthy();
    s = dispatchAction(s, plot);
    expect(s.players.user.exile.map((c) => c.name)).toContain("Demonic Ruckus");
    expect(s.players.user.hand).toHaveLength(0);
  });

  it("⭐ and on a LATER turn it comes back as a real AURA spell with a legal host (not a dead end)", () => {
    let s = board(1);
    s = dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "plot").find((a) => a.cardId === "c-dr"));
    s = { ...s, turn: 2, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } } } };
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-dr");
    expect(cast).toBeTruthy();
    expect(cast.isAuraSpell).toBe(true);            // an Aura spell, not a bare permanent push
    expect(cast.freeCast).toBe(true);               // cast without paying its mana cost (CR 702.170d)
    expect(cast.targets?.[0]?.name).toBe("Bear");   // with a legal host
  });

  it("⛔ it is NOT castable from exile on the SAME turn it was plotted (CR 702.170d)", () => {
    let s = board(1);
    s = dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "plot").find((a) => a.cardId === "c-dr"));
    expect(filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-dr")).toBeUndefined();
  });
});
