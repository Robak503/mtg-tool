/**
 * ninjutsuCloneCompose.test.js — NINJUTSU (CR 702.49) reaching the two residue paths that never called it.
 * Sakashima's Student · Silver-Fur Master · A-Silver-Fur Master.
 *
 * ⭐ HANDLED-OVER-THERE IS NOT HANDLED-HERE. `isKeywordOnly` has credited the bare "Ninjutsu {cost}" line
 * since the KW-NINJUTSU gate shipped, and Sakashima's Student parked at body-only anyway — because
 * `parseCloneSpec` requires the WHOLE oracle to be the copy clause and nothing stripped the keyword line
 * before it looked. A keyword is not "handled" until every residue path that can park a card calls it.
 *
 * ⭐⛔ AND THE FIRST SIZING OF THIS SLICE WAS WRONG BY 200%. A line-drop probe anchored on
 * /^ninjutsu\b/ reported THREE cards flipping on the keyword line alone. Two of them were Silver-Fur
 * Master, whose SECOND line also begins with the word "Ninjutsu" — the probe was deleting a real static
 * ability along with the keyword and crediting the card for text it had removed. The true count for the
 * keyword line is ONE. The cost-reducer needed its own separate, explicit judgement (below), which is
 * exactly what the ledger's phrase-swap sizing rule exists to force.
 *
 * ⛔ THE COST-REDUCER IS A BENIGN MARKER, NOT A REDUCER. "Ninjutsu abilities you activate cost {1} less to
 * activate" can only ever discount a ninjutsu activation, and the engine has no ninjutsu lane at all — so
 * the clause is vacuous on the IDENTICAL premise that credits the keyword line itself. Emitting a real
 * activatedCostReduction descriptor would fabricate a runtime hook for an ability that does not exist.
 * The two credits are coupled: if ninjutsu is ever offered, both must be revisited together.
 */
import { describe, expect, it } from "vitest";
import { classifyCard, isKeywordOnly } from "./coverage.js";

// Real printed oracles + costs, read out of the bundled index (matched on name AND type line).
const SAKASHIMAS_STUDENT = {
  name: "Sakashima's Student", type: "Creature — Human Ninja", power: "0", toughness: "0", mana: "{2}{U}{U}",
  oracle: "Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types.",
};
const SILVER_FUR_MASTER = {
  name: "Silver-Fur Master", type: "Creature — Rat Ninja", power: "2", toughness: "2", mana: "{U}{B}",
  oracle: "Ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nNinjutsu abilities you activate cost {1} less to activate.\nOther Ninja and Rogue creatures you control get +1/+1.",
};
// The Alchemy rebalance — identical text, HYBRID {U/B} in the cost line. Included because a brace-cost
// anchor that only tolerated pure-colour pips would silently drop it.
const A_SILVER_FUR_MASTER = {
  ...SILVER_FUR_MASTER, name: "A-Silver-Fur Master",
  oracle: "Ninjutsu {U/B} ({U/B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nNinjutsu abilities you activate cost {1} less to activate.\nOther Ninja and Rogue creatures you control get +1/+1.",
};

describe("⭐ the ninjutsu cost line no longer blocks the CLONE path", () => {
  it("Sakashima's Student flips — the clone half already parsed, the keyword line was in front of it", () => {
    expect(classifyCard(SAKASHIMAS_STUDENT)).toBe("native-clone");
  });

  it("the 'Library ninjutsu' / 'Commander ninjutsu' prefixes strip too", () => {
    const lib = { ...SAKASHIMAS_STUDENT, name: "Fake Shinobi",
      oracle: "Library ninjutsu {2}{U} ({2}{U}, Shuffle an unblocked attacker you control into its owner's library: Put this card onto the battlefield from your library tapped and attacking. Activate only while searching your library.)\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types." };
    expect(classifyCard(lib)).toBe("native-clone");
  });

  it("⛔ still all-or-nothing — a clone with a genuinely unmodeled line parks", () => {
    const residue = { ...SAKASHIMAS_STUDENT, name: "Fake Student",
      oracle: "Ninjutsu {1}{U}\nWhenever a player consults an oracle, interpret its riddle however you like.\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
});

describe("⭐ the ninjutsu COST-REDUCER is recognised as the no-op it is", () => {
  it("Silver-Fur Master and its Alchemy rebalance flip", () => {
    expect(classifyCard(SILVER_FUR_MASTER)).toBe("native-static");
    expect(classifyCard(A_SILVER_FUR_MASTER)).toBe("native-static");
  });

  it("⛔ the reducer is NOT a keyword-only line — it is a real static, credited on its own reasoning", () => {
    expect(isKeywordOnly("ninjutsu abilities you activate cost {1} less to activate")).toBe(false);
  });

  it("⛔ the reducer anchor is exact — a rider past 'to activate' parks the card", () => {
    const wider = { ...SILVER_FUR_MASTER, name: "Fake Master",
      oracle: "Ninjutsu {U}{B}\nNinjutsu abilities you activate cost {1} less to activate and can't be responded to.\nOther Ninja and Rogue creatures you control get +1/+1." };
    expect(classifyCard(wider)).not.toMatch(/^native/);
  });
});

describe("⛔ the two REAL ninjutsu-referencing abilities in the index stay parked", () => {
  // Satoru GRANTS ninjutsu to other cards — a real unmodeled ability, and its line does not begin with
  // the keyword, so neither anchor can reach it.
  it("Satoru Umezawa's grant is not mistaken for a cost line", () => {
    const SATORU = { name: "Satoru Umezawa", type: "Legendary Creature — Human Ninja", power: "3", toughness: "3", mana: "{1}{U}{B}",
      oracle: "Whenever you activate a ninjutsu ability, look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. This ability triggers only once each turn.\nEach creature card in your hand has ninjutsu {2}{U}{B}." };
    expect(classifyCard(SATORU)).not.toMatch(/^native/);
  });

  // ⭐ Monet, Sensei of the Sewers prints "Fixed commander ninjutsu {3}{B}{G} (…)" — a THIRD prefix the
  // anchor deliberately does not know. The real card parks for its own reasons (its ETB reads "If Monet was
  // ninjutsu'd"), so asserting on Monet directly proves nothing: it parks whether the anchor holds or not.
  // ⭐⛔ THAT ASSERTION WAS WRITTEN FIRST AND CAUGHT BY ITS OWN MUTATION — loosening the anchor to
  // /^(?:[a-z]+ )?(?:commander |library )?ninjutsu …/ left all 8 tests green. The guard has to put Monet's
  // LINE in front of a body that WOULD flip, so a loosened anchor shows up as a wrong credit.
  it("a 'Fixed commander ninjutsu' line is residue — only the two known prefixes strip", () => {
    const unknownPrefix = { ...SAKASHIMAS_STUDENT, name: "Fake Sensei",
      oracle: "Fixed commander ninjutsu {3}{B}{G} (It's commander ninjutsu, except the command tax applies, like it should have originally.)\nYou may have this creature enter as a copy of any creature on the battlefield, except it's a Ninja in addition to its other creature types." };
    expect(classifyCard(unknownPrefix)).not.toMatch(/^native/);
  });
});
