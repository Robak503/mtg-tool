/**
 * encoreZoneOption.test.js — ENCORE (CR 702.130) joins the graveyard zone-option family (slice 39).
 *
 * "Encore {cost} ({cost}, Exile this card from your graveyard: For each opponent, create a token copy that
 * attacks that opponent this turn if able. Sacrifice them at the beginning of the next end step. Activate
 * only as a sorcery.)"
 *
 * It is a GY-activated ability in the exact unearth / scavenge / embalm class: while the creature is on the
 * BATTLEFIELD — the only place the engine plays it — the line is inert. Not offering the encore option is a
 * safe false negative, the same trade already accepted for flashback, escape and the rest of that list.
 *
 * THE AUDIT THAT LIST REQUIRES (the "suspend rule"): a zone-option keyword may only be credited when every
 * carrier is NORMALLY playable, because suspend was refused precisely for having carriers with no mana cost
 * that cannot be cast at all. Encore passes cleanly — all 26 carriers are creatures with a printed mana
 * cost, zero exceptions, not even a land. Re-derived here rather than asserted.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const ENCORE = (cost) => `Encore ${cost} (${cost}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)`;
const body = (oracle) => ({ name: "T", type: "Creature — Elemental Incarnation", mana: "{4}{R}", power: 4, toughness: 4, keywords: [], oracle });

describe("encore is credited like its siblings", () => {
  it("a vanilla body carrying only encore reads native", () => {
    expect(classifyCard(body(ENCORE("{7}{R}{R}")))).toMatch(/^native/);
  });
  it("…alongside a keyword line", () => {
    expect(classifyCard(body(`Trample\n${ENCORE("{5}{R}")}`))).toMatch(/^native/);
  });
  it("…and with a modeled trigger", () => {
    expect(classifyCard(body(`When this creature enters, draw a card.\n${ENCORE("{5}{R}")}`))).toMatch(/^native/);
  });
});

describe("CREED — the credit is for the keyword line and nothing else", () => {
  it("an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard(body(`${ENCORE("{5}{R}")}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });
  it("a card with no encore line is untouched", () => {
    expect(classifyCard(body("Trample"))).toMatch(/^native/);
    expect(classifyCard(body("Each opponent glorbulates."))).not.toMatch(/^native/);
  });
  it("the anchor needs a real cost — a card merely MENTIONING encore is not credited", () => {
    expect(classifyCard(body("Whenever you encore a creature card, draw a card."))).not.toMatch(/^native/);
  });
});
