/**
 * quoteAwareTriggerScan.test.js — the QUOTE-AWARE trigger-sentence scanner (Codex fix #4 / TK-1).
 *
 * The old extraction everywhere was `(?:^|[\n.;]\s*)(When|Whenever|At)\b\s+[^.]+\.` — and `[^.]+`
 * stops at the FIRST period, even inside a quoted granted ability, truncating the sentence mid-quote
 * (the WAKE-REPORT's Pest/Devil-maker class). scanTriggerSentences walks quote + paren depth: the
 * sentence ends at the first depth-0 period; stripTriggerSentences removes whole sentences the same
 * way. ONE scanner feeds detectTriggers' extraction, coverage's shaped-sentence count, and every
 * residue chain — the shaped === detected invariant survives only because there is exactly one
 * definition of "a trigger sentence".
 *
 * ⛔ THE CONSUMED-PERIOD RULE IS LOAD-BEARING: the old regex ATE the sentence's final period, so a
 * reflexive follow-up ("roll a d20. When you do, …" — CR 603.7) directly after a trigger sentence
 * was never counted as its own shaped sentence (detectTriggers folds it into the effectClause). The
 * first draft of this scanner re-armed the boundary off that period and PARKED 17 cards on
 * shaped!==detected arithmetic — caught by the corpus fingerprint diff, pinned below.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, pulled 2026-08-30 — never from memory).
 */

import { describe, expect, it } from "vitest";
import { scanTriggerSentences, stripTriggerSentences, detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { manaProduction, stripNonSelfQuotedGrants } from "./manaModel.js";

describe("scanTriggerSentences — quote-aware extraction", () => {
  it("⭐ a quoted granted ability's internal period no longer truncates the sentence (Queen Brahne)", () => {
    const o = 'Whenever Queen Brahne attacks, create a 0/1 black Wizard creature token with "Whenever you cast a noncreature spell, this token deals 1 damage to each opponent."';
    const hits = scanTriggerSentences(o);
    expect(hits).toHaveLength(1); // ONE sentence — the quoted "Whenever…" inside is neither an anchor nor a terminator
    expect(hits[0].inner).toContain("deals 1 damage to each opponent"); // the full quoted grant survived
  });

  it("⛔ a reflexive 'When you do' after a consumed period is NOT its own shaped sentence (Ancient Bronze Dragon)", () => {
    const o = "Flying\nWhenever this creature deals combat damage to a player, roll a d20. When you do, put X +1/+1 counters on each of up to two target creatures, where X is the result.";
    const hits = scanTriggerSentences(o);
    expect(hits).toHaveLength(1); // the reflexive folds into the trigger's effect, exactly as the old regex behaved
    expect(hits[0].word).toBe("Whenever");
  });

  it("a NEW boundary (newline) between sentences still anchors the second trigger", () => {
    const o = "When this creature enters, draw a card.\nWhen this creature dies, you gain 2 life.";
    expect(scanTriggerSentences(o).map((h) => h.word)).toEqual(["When", "When"]);
  });

  it("an unterminated candidate (no depth-0 period) is not a sentence, as before", () => {
    expect(scanTriggerSentences('When this creature attacks, it gains "vigilance')).toHaveLength(0);
  });

  it("stripTriggerSentences removes the WHOLE quoted sentence (no orphaned quote-tail residue)", () => {
    const o = 'First strike\nWhenever this attacks, create a 1/1 red Devil creature token with "When this creature dies, it deals 1 damage to any target."\nEquip {2}';
    const stripped = stripTriggerSentences(o, " ");
    expect(stripped).not.toContain("Devil");
    expect(stripped).not.toContain("deals 1 damage"); // the quote-tail no longer haunts the residue
    expect(stripped).toContain("First strike");
    expect(stripped).toContain("Equip {2}");
  });
});

describe("corpus fingerprint pins — every changed card, by name (the Law-5 audit)", () => {
  it("⭐ Llanowar Reborn GAINS land: graft's reminder no longer fabricates a phantom shaped sentence", () => {
    // The reminder's "(… Whenever a creature enters, you may move …)" period previously anchored a
    // phantom sentence inside the parens; parens are depth now, so shaped === detected again and the
    // land's every line (bare enters-tapped + mana + the modeled Graft keyword) is vouched.
    const card = { name: "Llanowar Reborn", type: "Land", oracle: "This land enters tapped.\n{T}: Add {G}.\nGraft 1 (This land enters with a +1/+1 counter on it. Whenever a creature enters, you may move a +1/+1 counter from this land onto it.)" };
    expect(classifyCard(card)).toBe("land");
  });

  it("Goldvein Pick stays NATIVE (the equipment early-out now reaches it — a lateral tier move)", () => {
    const card = { name: "Goldvein Pick", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1.\nWhenever equipped creature deals combat damage to a player, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" };
    expect(classifyCard(card)).toMatch(/^native/);
  });

  it("⛔ Alpine Moon's DELIBERATE loss — the quoted grant to opponents' lands was a phantom mana source", () => {
    // "…lose all abilities and gain \"{T}: Add {C}.\"" — the has/have-only strip missed the gains-form,
    // so Alpine Moon ITSELF credited {C} production it never has. The widened strip kills the phantom
    // at the runtime source (manaProduction) and the metric follows.
    const card = { name: "Alpine Moon", type: "Enchantment", mana: "{R}", oracle: "As this enchantment enters, choose a nonbasic land name.\nLands your opponents control with the chosen name lose all abilities and gain \"{T}: Add {C}.\"" };
    expect(manaProduction(card)).toBeNull();
    expect(classifyCard(card)).not.toBe("native-mana");
  });

  it("⛔ Topsoil Turner — a gains-grant to cards IN YOUR HAND never credits the battlefield granter", () => {
    // The granter IS a Treefolk, but the granted set lives in the hand — the zone guard strips it
    // even though the type line matches (the self-includer check must not see nonbattlefield grants).
    const card = { name: "Topsoil Turner", type: "Creature — Treefolk Druid", power: "2", toughness: "4", oracle: "Reach\nWhen this creature enters, each Forest and Treefolk card in your hand perpetually gains \"{T}: Add {G}{G}.\"" };
    expect(manaProduction(card)).toBeNull();
    expect(stripNonSelfQuotedGrants(card.oracle, card.type)).not.toContain("Add {G}{G}");
    expect(classifyCard(card)).toBe("body-only"); // the trigger is undetected → honestly parked
  });

  it("the 17 near-losses stay native: a reflexive-tail card still classifies (Undead Butler)", () => {
    const card = { name: "Undead Butler", type: "Creature — Zombie", power: "1", toughness: "2", oracle: "When this creature enters, mill three cards. (Put the top three cards of your library into your graveyard.)\nWhen this creature dies, you may exile it. When you do, return target creature card from your graveyard to your hand." };
    expect(detectTriggers(card)).toHaveLength(2);
    expect(classifyCard(card)).toMatch(/^native/);
  });
});
