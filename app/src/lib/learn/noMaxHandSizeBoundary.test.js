/**
 * noMaxHandSizeBoundary.test.js — the "You have no maximum hand size." strip ate the PRECEDING
 * sentence's period, and a modeled line four lanes deep silently parked every mid-oracle carrier.
 *
 * THE BUG. NO_MAX_HAND_METRIC_RE leads with `(?:^|[\n.;])` — a DELIMITER, not part of the sentence
 * being removed — and the whole match was replaced with a single space. For a card printing the line
 * FIRST (Reliquary Tower, Spellbook, Thought Vessel) the match anchors at `^`, there is no boundary to
 * eat, and everything worked. For a card printing it in the MIDDLE, the previous sentence's period was
 * consumed and its two neighbours were glued into one pseudo-sentence:
 *     "…equal to the number of cards in your hand.\nYou have no maximum hand size.\nWhen Tishana enters…"
 *   → "…equal to the number of cards in your hand When Tishana enters…"     (parses as nothing)
 * The runbook names this exactly — "a fold that eats its own sentence boundary" — along with why it
 * hides: the diagnostic is a card whose tier does NOT change, which no fingerprint diff can show.
 *
 * WHY IT SURVIVED. Every carrier that would have exposed it was already parked, and for a reason that
 * looked entirely different: the native-STATIC and composite lanes never called the strip at all, so
 * Tishana and Body of Knowledge read as ordinary unmodeled residue. Two independent defects on one
 * card, each masking the other.
 *
 * THE FIX, both halves:
 *   1. the strip re-emits the delimiter it matched on (a match at `^` captures nothing → "");
 *   2. the strip moved to a classifyCard PRE-STRIP, beside the Leyline and Suspend pre-strips, so all
 *      lanes see one text. THREE residue lanes judge this sentence independently and only two ever
 *      stripped it — the runbook's fix for a judgement implemented twice is one shared source, not a
 *      patch on whichever copy bit.
 *
 * ⭐ THE LINE IS GENUINELY ENFORCED — measured on a CREATURE carrier before any of this shipped, since
 * the runtime path had only ever been exercised by lands and artifacts: 10 cards in hand → 0 required
 * cleanup discards, and 3 on the identical board without the line. Pinned below.
 *
 * Mutation-checked (2026-08-03, each verified applied before its result was read) — and the battery is
 * written up as it actually behaved, because the first mutation taught something:
 *   • delimiter re-emit reverted to a bare " ", regex kept -> only 1 red (the semicolon pin). NOT the
 *     full revert it looked like: tightening `\s*` to `[ \t]*` after the delimiter ALSO fixes the
 *     newline case on its own, so the fix has two independently load-bearing halves and this mutation
 *     reverts one. Naming that beats claiming a clean kill;
 *   • BOTH reverted (original regex + original replacement) -> 3 red: the mid-oracle boundary pin, the
 *     semicolon pin, and the two card pins. That is the true revert;
 *   • the classifyCard pre-strip disabled, boundary fix kept -> 1 red (the card pins) — the lanes
 *     disagree again, exactly the drift this half exists to remove.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-03).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, stripModeledNoMaxHandSize } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { cleanupDiscardExcess } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const TISHANA = { id: "c-t", name: "Tishana, Voice of Thunder", type: "Legendary Creature — Merfolk Shaman", mana: "{5}{G}{U}", power: "*", toughness: "*",
  oracle: "Tishana's power and toughness are each equal to the number of cards in your hand.\nYou have no maximum hand size.\nWhen Tishana enters, draw a card for each creature you control." };
const BODY_OF_KNOWLEDGE = { id: "c-bk", name: "Body of Knowledge", type: "Creature — Avatar", mana: "{4}{U}{U}", power: "*", toughness: "*",
  oracle: "Body of Knowledge's power and toughness are each equal to the number of cards in your hand.\nYou have no maximum hand size.\nWhenever this creature is dealt damage, draw that many cards." };

describe("the strip preserves the sentence boundary it matched on", () => {
  it("⭐ a MID-oracle line keeps the previous sentence's period (the bug)", () => {
    const out = stripModeledNoMaxHandSize("A's power and toughness are each equal to the number of cards in your hand.\nYou have no maximum hand size.\nWhen A enters, draw a card.");
    expect(out).toContain("cards in your hand.");          // ⛔ the period survived
    expect(out).not.toMatch(/hand\s+When/);                 // ⛔ and the neighbours were not glued
    expect(out).toContain("When A enters, draw a card.");
    expect(out).not.toMatch(/no maximum hand size/i);       // the modeled line itself is gone
  });

  it("a LEADING line still strips clean (the shape that always worked — no regression)", () => {
    expect(stripModeledNoMaxHandSize("You have no maximum hand size.\n{T}: Add {C}.")).toBe("{T}: Add {C}.");
  });

  it("a semicolon/period delimiter is given back too, not swallowed", () => {
    const out = stripModeledNoMaxHandSize("Flying. You have no maximum hand size. Trample.");
    expect(out).toMatch(/Flying\./);
    expect(out).toMatch(/Trample\./);
    expect(out).not.toMatch(/no maximum hand size/i);
  });

  it("⛔ a card that MODIFIES the maximum is untouched (Cursed Rack stays residue)", () => {
    const t = "Your maximum hand size is four.";
    expect(stripModeledNoMaxHandSize(t)).toBe(t);
  });
});

describe("recognition — the mid-oracle carriers flip; the near-misses are unchanged", () => {
  it("Tishana and Body of Knowledge classify native-mixed", () => {
    expect(classifyCard(TISHANA)).toBe("native-mixed");
    expect(classifyCard(BODY_OF_KNOWLEDGE)).toBe("native-mixed");
  });
  it("the leading-position carriers are unchanged (no regression in the lanes that already worked)", () => {
    expect(classifyCard({ id: "c-rt", name: "Reliquary Tower", type: "Land", oracle: "You have no maximum hand size.\n{T}: Add {C}." })).toBe("land");
    expect(classifyCard({ id: "c-tv", name: "Thought Vessel", type: "Artifact", mana: "{2}", oracle: "You have no maximum hand size.\n{T}: Add {C}." })).toBe("native-mana");
    expect(classifyCard({ id: "c-sb", name: "Spellbook", type: "Artifact", mana: "{0}", oracle: "You have no maximum hand size." })).toBe("native-body");
  });
  it("⛔ Cursed Rack (MODIFIES the maximum) still parks — the engine never applies that number", () => {
    expect(classifyCard({ id: "c-cr", name: "Cursed Rack", type: "Artifact", mana: "{4}",
      oracle: "As this artifact enters, choose a player.\nThat player's maximum hand size is four." })).toBe("body-only");
  });
  it("⛔ an UNMODELED third line still parks the whole card (the strip credits nothing else)", () => {
    expect(classifyCard({ ...TISHANA, id: "c-x", name: "Probe Tishana",
      oracle: "Probe Tishana's power and toughness are each equal to the number of cards in your hand.\nYou have no maximum hand size.\nWhen Probe Tishana enters, interpret the omens however you like." })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — both modeled halves actually work on a CREATURE carrier", () => {
  function board({ withLine, handSize }) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const oracle = withLine ? TISHANA.oracle : TISHANA.oracle.replace("You have no maximum hand size.\n", "");
    const perm = createPermanent({ id: "tish", card: { ...TISHANA, oracle }, controller: "user", summoningSick: false });
    const hand = Array.from({ length: handSize }, (_, i) => ({ id: `h${i}`, name: `C${i}`, type: "Instant", oracle: "" }));
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm], hand } } };
  }

  it("the P/T characteristic-defining ability reads the live hand (10 cards -> 10/10)", () => {
    const s = board({ withLine: true, handSize: 10 });
    expect(permanentPower(s, "tish")).toBe(10);
    expect(permanentToughness(s, "tish")).toBe(10);
    const smaller = board({ withLine: true, handSize: 3 });
    expect(permanentPower(smaller, "tish")).toBe(3);       // it tracks, it isn't a frozen number
  });

  it("⭐ the no-maximum-hand-size line is ENFORCED — 0 required discards, vs 3 without it", () => {
    expect(cleanupDiscardExcess(board({ withLine: true, handSize: 10 }), "user")).toBe(0);
    expect(cleanupDiscardExcess(board({ withLine: false, handSize: 10 }), "user")).toBe(3);
  });
});
