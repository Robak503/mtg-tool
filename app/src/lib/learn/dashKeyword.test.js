/**
 * dashKeyword.test.js — recognize the "Dash {cost}" alt-cast keyword (CR 702.109). Dash lets you cast a creature
 * for its dash cost; it gains haste and returns to its owner's hand at the next end step. It is an OPTIONAL entry
 * the engine does not offer (no dash lane), and every dash card ALSO has a normal mana cost, so — exactly like
 * ninjutsu/morph/sneak — the engine hard-casts it as its printed self and the body resolves correctly; only the
 * optional dash entry (haste + end-step bounce) is unmodeled. Flip-diff: +16, LOST=0 (Mardu/Kolaghan aggro).
 *
 * (Disguise, the same face-down structure as morph, is intentionally NOT recognized yet: it exposes a latent
 * detectTriggers mis-parse of a pure "when turned face up, until end of turn, whenever X" delayed trigger — see
 * the coverage.js note. That's a CREED false positive, deferred until the mis-parse is fixed.)
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

describe("Dash — recognition", () => {
  it("isKeywordOnly credits a bare 'dash {cost}' line (alone or beside covered keywords)", () => {
    expect(isKeywordOnly("Dash {R}")).toBe(true);
    expect(isKeywordOnly("Haste\nDash {2}{R}")).toBe(true);
    expect(isKeywordOnly("Dash {4}{R}{W}")).toBe(true);
    expect(isKeywordOnly("dash abilities you activate cost {1} less")).toBe(false); // a dash-referencing static is not a bare cost line
  });
  it("a dash creature with a modeled body flips native; an unmodeled sibling keeps it body-only (CREED)", () => {
    expect(classifyCard({ name: "Lightning Berserker", type: "Creature — Goblin Berserker", mana: "{R}", power: 1, toughness: 1, oracle: "Dash {R}" })).toMatch(/^native/);
    expect(classifyCard({ name: "Mardu Scout", type: "Creature — Human Scout", mana: "{2}{R}", power: 3, toughness: 2, oracle: "Menace\nDash {R}" })).toMatch(/^native/);
    expect(classifyCard({ name: "T", type: "Creature — Goblin", mana: "{1}{R}", power: 2, toughness: 2, oracle: "Dash {R}\nWhenever this creature attacks, exile the top card of target player's library and you may play it for as long as it remains exiled." })).not.toMatch(/^native/);
  });
});
