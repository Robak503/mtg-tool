/**
 * commanderPairingKeywords.test.js — the COMMAND-ZONE PAIRING family is inert during a game (CR 702.124,
 * 702.139–702.141), and one member of it is emphatically NOT.
 *
 * Bare "Partner" was already credited. Its siblings were not, on a comment that claimed they "carry extra
 * unmodeled text". The corpus disagrees — every one of the 47 pairing lines in the index carries only a
 * reminder, and reminders are stripped before this check:
 *
 *     Partner—Friends forever  (You can have two commanders if both have this ability.)   ×7
 *     Partner—Character select (…same…)  ×5   ·  Partner—Survivors ×4  ·  Partner—Father & son ×2
 *     Choose a Background      (You can have a Background as a second commander.)         ×31
 *     Doctor's companion       (You can have two commanders if the other is the Doctor.)  ×27
 *
 * None changes anything during play, and the engine never reads them to decide seating: `commanderCards`
 * arrives from the DECK DEFINITION and createPlayerState seats whatever it is handed. So no clause is being
 * dropped — which is exactly why crediting them cannot become a claimed-native no-op.
 *
 * ⛔ "PARTNER WITH <name>" WAS THE EXCEPTION AND WAS REFUSED — ✅ INVERTED 2026-08-01, because the reason
 * expired rather than because the pin was wrong. Its reminder is "(When this creature enters, target player
 * may put <name> into their hand from their library…)" — a real linked ETB tutor (CR 702.124j) — and the
 * refusal stood for exactly as long as the engine did not model it. That ETB is now BUILT (partnerWithName
 * synthesizes the trigger; the named tutor searches the TARGETED player's library — see partnerWith.test.js),
 * so crediting it no longer drops an effect, and 16 corpus cards flip.
 *
 * ⭐ THE FAMILY STILL SPLITS, AND ON THE SAME LINE — the split is just no longer visible as a refusal, which
 * is why it is re-pinned below rather than deleted. The inert siblings are credited because they do NOTHING
 * once the game starts (vacuity); partner-with is credited because its ability is IMPLEMENTED. Those are
 * different warrants and must never be collapsed: the inert forms are credited by the keyword list, while
 * partner-with is credited by stripPartnerWithLine, which is gated on the ability actually being synthesized.
 *
 * ⛔ THE SUCCESSOR REFUSAL IS "PARTNER WITH ITSELF" (Mothers Yamazaki) — it names no other card, is not
 * modeled, and must stay refused. It is also the sharpest available guard on the bare-partner alternation:
 * if that regex were ever loosened to swallow "partner with …", the itself-form would start reading
 * keyword-only by vacuity, which is precisely the drop this file exists to prevent.
 */
import { describe, expect, it } from "vitest";

import { isKeywordOnly, classifyCard } from "./coverage.js";

const legend = (oracle) => ({ name: "X", type: "Legendary Creature — Human Soldier", mana: "{2}{W}", power: 2, toughness: 2, oracle });

describe("the inert pairing keywords are keyword-only", () => {
  for (const kw of [
    "Partner",
    "Partner—Friends forever",
    "Partner—Character select",
    "Partner—Survivors",
    "Partner—Father & son",   // the "&" is why the label class is not just [a-z' ]
    "Friends forever",
    "Choose a Background",
    "Doctor's companion",
  ]) {
    it(`"${kw}"`, () => {
      expect(isKeywordOnly(kw, "X")).toBe(true);
    });
  }

  it("a card whose only extra line is a pairing keyword classifies native", () => {
    expect(classifyCard(legend("Flying\nPartner—Character select"))).toMatch(/^native/);
  });
});

describe("✅ INVERTED — \"Partner with <name>\" carries a real ETB tutor, and the tutor is now BUILT", () => {
  it("it now reads keyword-only — because its line is STRIPPED once the ability is synthesized", () => {
    // Not because the keyword list grew. stripPartnerWithLine removes the line only when partnerWithName
    // returns a name, so "reads keyword-only" here is downstream of "the ETB exists", never a bare credit.
    expect(isKeywordOnly("Partner with Ley Weaver", "X")).toBe(true);
  });

  it("and the card now classifies native", () => {
    expect(classifyCard(legend("Flying\nPartner with Ley Weaver"))).toMatch(/^native/);
  });

  it("⛔ but \"Partner with itself\" is still refused — it names no other card and is not modeled", () => {
    // The successor to the refusal this block used to carry (Mothers Yamazaki). Crediting it would hand the
    // tutor a search for a card literally named "itself": zero candidates forever, tier reading native.
    expect(isKeywordOnly("Partner with itself", "X")).toBe(false);
    expect(classifyCard(legend("Flying\nPartner with itself"))).not.toMatch(/^native/);
  });

  // NOTE — the old block's third case ("the em-dash form must never be loosened into matching it") is
  // covered by the itself-case above and is not restated with a synthetic string. The property it protected
  // is that the bare-partner alternation never swallows the with-form by vacuity; the itself-form is the only
  // real corpus shape that can detect that, since every OTHER with-form is now legitimately credited via the
  // strip. A made-up name would only test the name parser, not the alternation.
});

describe("⭐ CREED — the label alternation does not swallow real text", () => {
  it("a pairing-shaped line with an actual ability after it is not keyword-only", () => {
    expect(isKeywordOnly("Partner—Character select. Whenever this creature attacks, draw a card", "X")).toBe(false);
  });

  it("an unrelated em-dash keyword is unaffected", () => {
    expect(isKeywordOnly("Glorbulate—Pay 2 life", "X")).toBe(false);
  });
});
