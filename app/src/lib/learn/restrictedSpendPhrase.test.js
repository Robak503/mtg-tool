/**
 * restrictedSpendPhrase.test.js — QUARTET PHASE 4 slice 1 (2026-08-15): the CONJUNCTIVE spend-
 * restriction phrase. "Spend this mana only to cast Dragon creature spells." (Rivaz of the Claw's
 * {T}; the Dragons-deck restricted-source class.)
 *
 * ⭐ TWO SMALL WIDENINGS on the SHIPPED source-restriction machinery (probed before building — the
 * planner has honored source restrictions via spendContext for a while; the vocabulary was the gap):
 *   · "dragon" joins SPEND_CAST_TYPE_WORDS (a real type-line word, word-bounded like every sibling);
 *   · a MULTI-WORD phrase becomes a CONJUNCTIVE entry ("dragon creature" — the spell must match EVERY
 *     word; an ANY-match would model a restriction strictly LOOSER than printed, the forbidden FP
 *     direction the Helga anti-lossy guard exists for). AND within an entry, OR across entries;
 *     single-word entries byte-identical.
 *
 * Mutation-checked (2026-08-15, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the conjunctive test degraded to ANY-match → an ELF spell pays with Dragon-only mana (the
 *     looser-than-printed FP the witness pins).
 *   · "dragon" removed from the vocabulary → the whole restriction refuses again (the parse nulls).
 */
import { describe, expect, it } from "vitest";

import { parseSpendRestriction, spendRestrictionAllows, planPayment } from "./manaModel.js";

const RIVAZ_LINE = "{T}: Add two mana in any combination of colors. Spend this mana only to cast Dragon creature spells.";

describe("the conjunctive phrase parses and binds", () => {
  it("⭐ 'Dragon creature spells' → ONE conjunctive entry; Dragons pass, an Elf and a bare Sorcery refuse", () => {
    const r = parseSpendRestriction(RIVAZ_LINE);
    expect(r).toEqual({ castTypes: ["dragon creature"] });
    const row = {
      dragon: spendRestrictionAllows(r, { type: "Creature — Dragon" }),
      elf: spendRestrictionAllows(r, { type: "Creature — Elf" }),
      sorcery: spendRestrictionAllows(r, { type: "Sorcery" }),
    };
    console.log("  WITNESS restrictedPhrase", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dragon: true, elf: false, sorcery: false });
  });

  it("⛔ the Helga anti-lossy guard HOLDS: a qualified restriction still refuses the whole card", () => {
    expect(parseSpendRestriction("Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.")).toBeNull();
  });

  it("⛔ a phrase with one stranger word refuses (never a silently-narrowed entry)", () => {
    expect(parseSpendRestriction("Spend this mana only to cast toaster creature spells.")).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — the planner spends restricted mana ONLY on a matching cast", () => {
  const pool = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  const restriction = parseSpendRestriction(RIVAZ_LINE);
  const rivazSource = { permanentId: "riv", colors: ["B", "R"], amount: 2, restriction };
  const cost = { generic: 1, W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 };

  it("⭐⭐ a Dragon creature cast: the restricted source pays; an Elf cast: it can NOT", () => {
    const dragonPlan = planPayment(pool, [rivazSource], cost, { castCard: { type: "Creature — Dragon" } });
    const elfPlan = planPayment(pool, [rivazSource], cost, { castCard: { type: "Creature — Elf" } });
    const row = { dragonPays: dragonPlan !== null, elfPays: elfPlan !== null };
    console.log("  WITNESS restrictedPayment", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dragonPays: true, elfPays: false });
  });

  it("⛔ SEEN-TO-FAIL control: an UNRESTRICTED source pays the Elf cast fine (the refusal above is the restriction, not the harness)", () => {
    const plain = { permanentId: "plain", colors: ["B", "R"], amount: 2 };
    expect(planPayment(pool, [plain], cost, { castCard: { type: "Creature — Elf" } })).not.toBeNull();
  });
});
