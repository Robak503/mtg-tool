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

  it("enlist on a creature (slice 49)", () => {
    expect(classifyCard({ ...CREATURE, name: "Coalition Warbrute", type: "Creature — Orc Warrior", oracle: "Enlist (As this creature attacks, you may tap a nonattacking creature you control without summoning sickness. When you do, add its power to this creature's until end of turn.)" })).toMatch(/^native/);
  });

  it("extort on a creature (slice 49)", () => {
    expect(classifyCard({ ...CREATURE, name: "Syndicate Heavy", type: "Creature — Human Soldier", oracle: "Extort (Whenever you cast a spell, you may pay {W/B}. If you do, each opponent loses 1 life and you gain that much life.)" })).toMatch(/^native/);
  });

  it("provoke on a creature (slice 51)", () => {
    expect(classifyCard({ ...CREATURE, name: "Goblin Grappler", type: "Creature — Goblin Warrior", oracle: "Provoke (Whenever this creature attacks, you may have target creature defending player controls untap and block it if able.)" })).toMatch(/^native/);
  });

  it("assist on a spell (slice 51) — cost help from a player who never offers it", () => {
    expect(classifyCard({ ...SPELL, name: "Bring to Trial", oracle: "Assist (Another player can pay up to {3} of this spell's cost.)\nDraw a card." })).toMatch(/^native/);
  });

  it("casualty on a spell (slice 51)", () => {
    expect(classifyCard({ ...SPELL, name: "A Little Chat", oracle: "Casualty 1 (As you cast this spell, you may sacrifice a creature with power 1 or greater. When you do, copy this spell.)\nDraw a card." })).toMatch(/^native/);
  });

  it("devour on a creature (slice 53) — sacrificing ZERO is the printed creature", () => {
    expect(classifyCard({ ...CREATURE, name: "Gluttonous Slime", type: "Creature — Ooze", oracle: "Devour 1 (As this creature enters, you may sacrifice any number of creatures. It enters with that many +1/+1 counters on it.)" })).toMatch(/^native/);
  });

  it("amplify on a creature (slice 53) — revealing ZERO is the printed creature", () => {
    expect(classifyCard({ ...CREATURE, name: "Zombie Brute", type: "Creature — Zombie", oracle: "Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Zombie card you reveal in your hand.)" })).toMatch(/^native/);
  });

  it("CREED — the digit anchor refuses a dynamic amount for both", () => {
    // Same reasoning as bloodthirst: a non-numeric N is an amount the runtime cannot place, and a
    // startsWith-style credit would mark the card native while nothing put the counters on.
    expect(classifyCard({ ...CREATURE, name: "X", oracle: "Devour X (As this creature enters, you may sacrifice any number of creatures.)" })).not.toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "Y", oracle: "Amplify X (As this creature enters, put a +1/+1 counter on it for each Zombie card you reveal in your hand.)" })).not.toMatch(/^native/);
  });

  it("ripple on a spell (slice 51)", () => {
    expect(classifyCard({ ...SPELL, name: "Surging Might", oracle: "Ripple 4 (When you cast this spell, you may reveal the top four cards of your library. You may cast spells with the same name as this spell from among those cards without paying their mana costs. Put the rest on the bottom of your library.)\nDraw a card." })).toMatch(/^native/);
  });
});

describe("CREED — LEARN is left uncredited on an UNCERTAIN rule reading, not a settled one", () => {
  it("learn stays parked despite 13 carriers", () => {
    // "Learn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or
    // discard a card to draw a card.)"
    //
    // This is a deliberate abstention, and the reason is worth pinning. Every other member of this family
    // was admitted because the printed text makes it plain that declining is legal and complete. For learn
    // I could not establish from the printed line alone that declining BOTH options is legal — and the
    // "outside the game" half has no representation here at all. Crediting a card on a rule reading I am
    // not sure of is the one thing this project forbids outright. 13 cards is a cheap price for that.
    expect(classifyCard({ ...SPELL, name: "Field Trip", oracle: "Search your library for a basic Forest card, put it onto the battlefield tapped, then shuffle.\nLearn. (You may reveal a Lesson card you own from outside the game and put it into your hand, or discard a card to draw a card.)" })).not.toMatch(/^native/);
  });
});

describe("UNLEASH — refused by THIS family, then admitted by ENFORCEMENT instead (slices 49 → 50)", () => {
  it("is NOT credited as an untaken option — it is credited because canBlockAttacker enforces it", () => {
    // The pin below moved when slice 50 built the enforcement. It is kept, not deleted, because the REASON
    // is the thing worth pinning: unleash never belonged to this family, and the fact that it is now
    // native must not be mistaken for the family having widened. See unleashKeyword.test.js for the
    // enforcement itself, and note it still parks when a genuinely unmodeled clause is present.
    const withResidue = { ...CREATURE, name: "Rakdos Drake", type: "Creature — Drake", oracle: "Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it has a +1/+1 counter on it.)\nEach opponent glorbulates." };
    expect(classifyCard(withResidue)).not.toMatch(/^native/);
  });

  it("the family's membership test, stated as an assertion", () => {
    // "Unleash (You may have this creature enter with a +1/+1 counter on it. It can't block as long as it
    // has a +1/+1 counter on it.)"
    //
    // The first sentence IS an option in this family's sense. The second is not — it is a real conditional
    // static. Declining the entry counter is faithful only for as long as the creature never gains a +1/+1
    // counter from ANY other source; the moment one arrives (a +1/+1 anthem, a counter effect, its own
    // other text), the printed card can no longer block and a credited card still would.
    //
    // That is the false-positive direction, and it is the exact line separating this family from the rest
    // of the census. The option has to be one you may decline WITH NO CONSEQUENCE to the rest of the card.
    //
    // ⭐⭐ RE-POINTED 2026-07-29 — OUTLAST was the standing example and it GRADUATED, by the other route.
    // The membership test is untouched: outlast is NOT an untaken option, and must never be credited as one.
    // What changed is that it is now credited by ENFORCEMENT instead — expanded into the ability CR 702.107a
    // says it is, offered by legalChoices, and resolvable. The two routes are opposites, and conflating them
    // is exactly what this assertion exists to prevent, so the example moves rather than the rule.
    //
    // ⭐⭐ RE-POINTED AGAIN 2026-07-30 — RECONFIGURE has now graduated by the SAME second route, one day
    // after being installed here as outlast's replacement. That is twice this marker has moved without the
    // rule moving, which is the marker working as designed: the membership test is a permanent statement,
    // and the example is only ever the nearest thing that has not yet been enforced.
    //
    // TRANSFIGURE is the replacement standing example: an activated ability (so it fails the untaken-option
    // test) with no enforcement behind it (so it is not credited either). Verified body-only.
    // ⚠️ Deliberately NOT transmute or scavenge, which read native — those are the documented ZONE-OPTIONS
    // precedent (an ability usable only from hand/graveyard, so it cannot affect the battlefield card's
    // playability). Checked before picking, because a marker aimed at a card that is native for a good
    // reason would fail immediately and teach the next reader the wrong lesson.
    expect(classifyCard({ ...CREATURE, name: "Transfigurer", oracle: "Transfigure {2}{B} ({2}{B}, Sacrifice this creature: Search your library for a creature card with the same mana value as this creature, put it onto the battlefield, then shuffle. Transfigure only as a sorcery.)" })).not.toMatch(/^native/);
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

  it("⭐⭐ RE-POINTED — an ACTIVATED ABILITY is not an untaken option; it is credited only when ENFORCED", () => {
    // The line that keeps this family honest, and its own words named the exit: outlast "stays parked UNTIL
    // SOMETHING MODELS IT". Something does now — it is expanded into the ability CR 702.107a defines, and the
    // engine genuinely offers it (asserted end-to-end in outlastKeyword.test.js, priority window and all).
    // The refusal that mattered is intact: a cost-shaped keyword is NOT credited for being declinable, and
    // the second assertion below is the live example of that.
    expect(classifyCard({ ...CREATURE, name: "Abzan Battle Priest", type: "Creature — Human Cleric", oracle: "Outlast {W} ({W}, {T}: Put a +1/+1 counter on this creature. Activate only as a sorcery.)" })).toMatch(/^native/);
    expect(classifyCard({ ...CREATURE, name: "Championer", type: "Creature — Sliver", oracle: "Champion a Sliver (When this creature enters, sacrifice it unless you exile another Sliver you control.)" })).not.toMatch(/^native/);
  });

  // NOT A COUNTER-EXAMPLE, and worth writing down so nobody re-derives it: suspend on a SPELL is already
  // credited, and has been since long before this slice (CAST_KEYWORD_LINE carries "suspend N—"). The
  // suspend refusal on record is the PERMANENT-side zone-option one, where its no-mana-cost carriers cannot
  // be hard-cast at all. Two different lanes, one keyword; an earlier draft of this file asserted the wrong
  // one and the test caught it.
});
