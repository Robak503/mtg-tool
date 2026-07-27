/**
 * optionalModeKeywords.test.js — delve / myriad / replicate / fuse (census slice 48).
 *
 * Four keywords credited on ONE rationale, the same one convoke / improvise / kicker / offspring already
 * run on: each is an OPTION the engine never takes, and declining it leaves a real, complete, legal play.
 * The engine hard-casts through the printed mode, so an untaken option cannot change what resolves.
 *
 *   delve     (CR 702.66a)  — "Each card you exile from your graveyard while casting this spell pays for
 *                             {1}." A pure cost REDUCTION. Not delving = paying full cost.
 *   replicate (CR 702.55a)  — an optional additional cost; paid zero times, the spell is copied zero times,
 *                             which is exactly the printed spell.
 *   fuse      (CR 702.102a) — "You may cast one or both halves of this card from your hand." The engine
 *                             already casts either half; fuse only adds the BOTH mode.
 *   myriad    (CR 702.115a) — "…YOU MAY create a token that's a copy of this creature attacking that
 *                             player. Exile those tokens at end of combat." Declining is a legal attack,
 *                             and the tokens would be exiled at end of combat regardless.
 *
 * WHAT SEPARATES THESE FROM A KEYWORD THAT MUST NOT BE CREDITED THIS WAY: the option has to be one the
 * player may simply decline with no consequence to the rest of the card. A keyword whose UNPAID state still
 * changes the board (or whose reminder hides a mandatory rider) is a different animal and belongs in a lane
 * that models it. The suspend precedent is the standing example — it looked like this family and was
 * refused, because its carriers have no mana cost and so cannot be hard-cast at all.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const CREATURE = { type: "Creature — Zombie", mana: "{6}{B}", power: 5, toughness: 5, keywords: [] };
const SPELL = { type: "Sorcery", mana: "{3}{U}", keywords: [] };

describe("each keyword is credited, and the CARD BODY is what decides", () => {
  it("delve on a creature (Gurmag Angler shape)", () => {
    expect(classifyCard({ ...CREATURE, name: "Gurmag Angler", oracle: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)" })).toMatch(/^native/);
  });

  it("delve on a spell", () => {
    expect(classifyCard({ ...SPELL, name: "Treasure Cruise", oracle: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)\nDraw three cards." })).toMatch(/^native/);
  });

  it("myriad on a creature", () => {
    expect(classifyCard({ ...CREATURE, name: "Broodbirth Viper", type: "Creature — Serpent", oracle: "Myriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token that's a copy of this creature that's attacking that player. Exile those tokens at end of combat.)" })).toMatch(/^native/);
  });

  it("replicate on a spell (Train of Thought — verified to depend on the strip)", () => {
    // Deliberately this card and not a damage spell. An earlier draft used a Pyromatics shape that
    // classified native EVEN WITH the replicate strip removed — i.e. the assertion was hollow, passing for
    // an unrelated reason. Caught by mutating the strip out and watching the test still pass. This shape
    // genuinely fails without it.
    expect(classifyCard({ ...SPELL, name: "Train of Thought", oracle: "Replicate {1}{U} (When you cast this spell, copy it for each time you paid its replicate cost.)\nDraw a card." })).toMatch(/^native/);
  });

  it("fuse on a split half", () => {
    expect(classifyCard({ ...SPELL, name: "Fused", oracle: "Fuse (You may cast one or both halves of this card from your hand.)\nDraw a card." })).toMatch(/^native/);
  });
});

describe("CREED — crediting the keyword never force-flips the rest of the card", () => {
  it("an unmodeled sibling clause still parks it, for every one of the four", () => {
    const glorb = "\nEach opponent glorbulates.";
    expect(classifyCard({ ...CREATURE, name: "A", oracle: "Delve (Each card you exile from your graveyard while casting this spell pays for {1}.)" + glorb })).not.toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "B", oracle: "Myriad (Whenever this creature attacks, for each opponent other than defending player, you may create a token that's a copy of this creature that's attacking that player. Exile those tokens at end of combat.)" + glorb })).not.toMatch(/^native/);
    expect(classifyCard({ ...SPELL, name: "C", oracle: "Replicate {1}{R} (When you cast this spell, copy it for each time you paid its replicate cost.)" + glorb })).not.toMatch(/^native/);
    expect(classifyCard({ ...SPELL, name: "D", oracle: "Fuse (You may cast one or both halves of this card from your hand.)" + glorb })).not.toMatch(/^native/);
  });

  it("the ANCHOR is the bare keyword line — a sentence merely mentioning it is not a credit", () => {
    // "…pays for {1}" prose without the keyword line must not be swallowed; the card keeps its residue.
    expect(classifyCard({ ...SPELL, name: "E", oracle: "Exile cards from your graveyard to reduce this spell's cost. Glorbulate." })).not.toMatch(/^native/);
  });

  it("OUTLAST is refused — an ACTIVATED ABILITY is not an untaken option", () => {
    // The line that keeps this family honest. Outlast ({cost}, {T}: put a +1/+1 counter on this creature.
    // Activate only as a sorcery) reads like another cost-shaped keyword, but it is a real ability the
    // player USES, not an option declining costs nothing. Crediting it would claim a card plays natively
    // while the engine never offers the ability at all. It stays parked until something models it.
    expect(classifyCard({ ...CREATURE, name: "Abzan Battle Priest", type: "Creature — Human Cleric", oracle: "Outlast {W} ({W}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.)" })).not.toMatch(/^native/);
  });

  // NOT A COUNTER-EXAMPLE, and worth writing down so nobody re-derives it: suspend on a SPELL is already
  // credited, and has been since long before this slice (CAST_KEYWORD_LINE carries "suspend N—"). The
  // suspend refusal on record is the PERMANENT-side zone-option one, where its no-mana-cost carriers cannot
  // be hard-cast at all. Two different lanes, one keyword; an earlier draft of this file asserted the wrong
  // one and the test caught it.
});
