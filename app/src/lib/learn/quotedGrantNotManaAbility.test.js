/**
 * quotedGrantNotManaAbility.test.js — a QUOTED GRANT belongs to the TOKEN, not to the ability that made it.
 *
 * THE BUG. `effectIsManaAbility` decides whether an activated ability is a MANA ability (CR 605.1a) by
 * looking for "Add …" in its effect text. It was reading the whole clause — including a quoted ability
 * granted to a token the effect creates. So Llanowar Mentor:
 *
 *     {G}, {T}, Discard a card: Create a 1/1 green Elf Druid creature token. It has "{T}: Add {G}."
 *
 * was flagged as the MENTOR'S OWN mana ability. That routes it into the mana model — a lane that cannot
 * drive a token-maker — and, because `program` is only built for non-mana abilities, its effect program was
 * never parsed at all. The card parked holding an effect clause that parses HIGH the instant anything else
 * looks at it. The mana model then reported no production either, so the ability was invisible from both
 * sides.
 *
 * THE DIAGNOSTIC THAT FOUND IT is the same one the previous slice produced: when a card's effect clause
 * parses HIGH standalone but its ability reports `program === null`, the ability was rejected BEFORE the
 * effect was ever parsed. Look at what gated it, not at the effect.
 *
 * THE FIX can only ever RELEASE a wrongly-flagged token-maker: a genuine mana ability never carries a
 * quoted grant, so stripping quoted spans before the test cannot un-flag a real one. Verified corpus-wide —
 * exactly one card gained (Llanowar Mentor), ZERO lost, across all 10,749 native cards.
 */
import { describe, expect, it } from "vitest";

import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

const art = (oracle, over = {}) => ({ name: "X", type: "Artifact", mana: "{6}", keywords: [], oracle, ...over });
const MENTOR = {
  name: "Llanowar Mentor", type: "Creature — Elf Shaman", mana: "{1}{G}", power: "1", toughness: "1", keywords: [],
  oracle: '{G}, {T}, Discard a card: Create a 1/1 green Elf Druid creature token. It has "{T}: Add {G}."',
};

describe("a token-maker whose GRANT mentions Add is not a mana ability", () => {
  it("Llanowar Mentor's ability is NOT flagged isManaEffect", () => {
    const a = parseActivatedAbilities(MENTOR)[0];
    expect(a.isManaEffect).toBe(false);
  });

  it("…so its effect program is actually built, and the ability is modeled", () => {
    const a = parseActivatedAbilities(MENTOR)[0];
    expect(a.program).toBeTruthy();
    expect(a.modeled).toBe(true);
  });

  it("the card classifies native", () => {
    expect(classifyCard(MENTOR)).toMatch(/^native/);
  });

  it("the same shape with an Eldrazi Scion grant", () => {
    expect(classifyCard(art('{4}, {T}: Create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."'))).toMatch(/^native/);
  });
});

describe("REAL mana abilities are untouched — the fix can only release, never un-flag", () => {
  const isMana = (oracle) => parseActivatedAbilities(art(oracle))[0]?.isManaEffect;

  it.each([
    ["{T}: Add {C}.", "single pip"],
    ["{T}: Add one mana of any color.", "any color"],
    ["{2}, {T}: Add {R}{R}.", "two pips with a mana cost"],
    ["{T}: Add {W} or {U}.", "a choice"],
    ["{T}, Sacrifice this artifact: Add one mana of any color.", "sac-for-mana"],
  ])("%s stays a mana ability (%s)", (oracle) => {
    expect(isMana(oracle)).toBe(true);
  });

  it("a mana ability is still routed to the mana model, not the effect lane", () => {
    // isManaEffect true ⇒ no program by design (CR 605.3a — mana abilities don't use the stack).
    const a = parseActivatedAbilities(art("{T}: Add {C}."))[0];
    expect(a.isManaEffect).toBe(true);
    expect(a.program).toBeNull();
  });
});

describe("CREED", () => {
  it("an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...MENTOR, oracle: `${MENTOR.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });

  it("a token whose granted ability is NOT modeled still parks", () => {
    // Serpent Generator's real shape: the grant is a poison-counter trigger, outside the curated gate.
    // Un-flagging isManaEffect must not rescue a token whose ability nothing can drive.
    expect(classifyCard(art('{4}, {T}: Create a 1/1 colorless Snake artifact creature token. It has "Whenever this creature deals damage to a player, that player gets a poison counter."'))).not.toMatch(/^native/);
  });
});
