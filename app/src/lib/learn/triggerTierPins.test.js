/**
 * TRIGGER-TIER CREED PINS (C4, 2026-07-23) — corpus pins for `permanentTriggersCovered` /
 * the native-trigger / native-mixed residue gate.
 *
 * `classifyCard` credits native-trigger (or native-mixed, when a modeled body rides along) only
 * when EVERY When/Whenever/At-shaped sentence on the card is (a) detected by `detectTriggers` AND
 * (b) routes natively, and what's left after stripping those sentences is keyword-only. This is
 * the single most complex residue chain in `coverage.js` — landfall ability-word labels, the
 * once-per-turn and can't-be-regenerated riders, reflexive "if you do"/"when you do" tails,
 * quote-aware splitting (a quoted granted ability must not be shredded by its own internal
 * period), and entering-pronoun pump tails all have their own documented historical fixes inline
 * in `permanentTriggersCovered`'s neighborhood. That density is exactly why this tier had ZERO
 * dedicated pins before this file (only ad-hoc examples in `coverage.test.js`) — a residue-gate
 * refactor here could silently over-claim a whole class with nothing going red.
 *
 * Pattern mirrors `manaTierPins.test.js`: real corpus cards, oracle text copied verbatim (live-
 * verified against the bundled oracle index via `lookupCard`/`publicCard` + `classifyCard` before
 * being hardcoded here — never typed from memory, per CLAUDE.md §1.2), chosen so each MUST_STAY_HIGH
 * case names the specific fix it locks in, and each MUST_NOT_OVER-CLAIM case is a NEAR-TWIN of a
 * pinned native card with one specific, named unmodeled wrinkle — so a regression that blurs the
 * two together fails loudly instead of quietly.
 *
 * Fixtures are hardcoded card shapes — deterministic and index-free, per coverage.test.js's
 * convention (CI has no Scryfall bulk data).
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";

const C = (name, type, oracle) => ({ name, type, oracle, mana: "" });

describe("MUST_STAY_HIGH — trigger residue chain credits the whole card", () => {
  const CASES = [
    ["Solemn Simulacrum", "Artifact Creature — Golem",
      "When this creature enters, you may search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.\nWhen this creature dies, you may draw a card.",
      "clean baseline: two own triggers (ETB + dies), nothing else"],
    ["Eternal Witness", "Creature — Human Shaman",
      "When this creature enters, you may return target card from your graveyard to your hand.",
      "clean baseline: a single own ETB trigger"],
    ["Farfinder", "Creature — Fox",
      "Vigilance\nWhen this creature enters, you may search your library for a basic land card, reveal it, put it into your hand, then shuffle.",
      "keyword + a single own ETB trigger (the Ranger-Captain near-twin below adds ONE more ability and flips body-only)"],
    ["Aesi, Tyrant of Gyre Strait", "Legendary Creature — Serpent",
      "You may play an additional land on each of your turns.\nLandfall — Whenever a land you control enters, you may draw a card.",
      "LANDFALL ABILITY-WORD LABEL: \"Landfall — Whenever\" sits mid-line, not at ^ — the label-strip fix lets the trigger-sentence regex still match it; extra-land static rides along as native-mixed"],
    ["Bristly Bill, Spine Sower", "Legendary Creature — Plant Druid",
      "Landfall — Whenever a land you control enters, put a +1/+1 counter on target creature.\n{3}{G}{G}: Double the number of +1/+1 counters on each creature you control.",
      "same landfall-label fix, paired with a modeled activated ability (native-mixed)"],
    ["Toxin Sliver", "Creature — Sliver",
      "Whenever a Sliver deals combat damage to a creature, destroy that creature. It can't be regenerated.",
      "CAN'T-BE-REGENERATED RIDER: the destroy trigger's regen-rider sentence is folded into the parsed destroy atom (CANT_REGEN_TEST), not left as apparent residue"],
    ["Formidable Speaker", "Creature — Elf Druid",
      "When this creature enters, you may discard a card. If you do, search your library for a creature card, reveal it, put it into your hand, then shuffle.\n{1}, {T}: Untap another target permanent.",
      "REFLEXIVE \"if you do\" TAIL: the conditional follow-up is part of the trigger's own effect, not unmodeled residue; a modeled activated ability rides along (native-mixed)"],
    ["Goldspan Dragon", "Creature — Dragon",
      "Flying, haste\nWhenever this creature attacks or becomes the target of a spell, create a Treasure token.\nTreasures you control have \"{T}, Sacrifice this artifact: Add two mana of any one color.\"",
      "QUOTE-AWARE RESIDUE SPLIT: the quoted group-grant's internal period must not shred it into a dangling fragment (native-mixed)"],
    ["Surrak and Goreclaw", "Legendary Creature — Human Bear",
      "Trample\nOther creatures you control have trample.\nWhenever another nontoken creature you control enters, put a +1/+1 counter on it. It gains haste until end of turn.",
      "ENTERING-PRONOUN PUMP TAIL: \"It gains haste until end of turn.\" directly follows the counter clause and is folded into the same trigger effect, not left as residue (native-mixed)"],
    ["Rhystic Study", "Enchantment",
      "Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.",
      "the tax-trigger family baseline — a FIXED {1} tax, unconditional frequency"],
    // GRADUATED from the MUST_NOT_OVER-CLAIM list below. Both of the things this pin named as unmodeled —
    // the "first … each turn" FREQUENCY gate and a tax VARIABLE on the creature's own power — were built
    // (firstSpellEachTurn.test.js, taxedPayment.test.js), so it moves here rather than being deleted: the
    // card is now REQUIRED to flip, and the per-player gate + live tax amount are pinned in those files.
    ["Esper Sentinel", "Artifact Creature — Human Soldier",
      "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.",
      "the tax-trigger family's HARD case — a per-player frequency gate plus a live power-scaled tax"],
  ];

  for (const [name, type, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      const tier = classifyCard(C(name, type, oracle));
      expect(["native-trigger", "native-mixed", "native-aura", "native-equipment"]).toContain(tier);
    });
  }
});

describe("MUST_NOT_OVER-CLAIM — trigger-shaped text with real unmodeled residue stays parked", () => {
  // Every card here has at least one When/Whenever/At-shaped sentence, so ONLY the residue gate
  // (or the fact that it isn't really a trigger at all) keeps it honest. If one of these ever
  // reports a native tier, the runtime is ignoring real unmodeled text while the metric counts it
  // fully modeled — the exact over-claim the whole gate exists to prevent.
  const CASES = [
    ["Ranger-Captain of Eos", "Creature — Human Soldier Ranger",
      "When this creature enters, you may search your library for a creature card with mana value 1 or less, reveal it, put it into your hand, then shuffle.\nSacrifice this creature: Your opponents can't cast noncreature spells this turn.",
      "near-twin of Farfinder's ETB search — but a second sacrifice-activated hoser ability is unmodeled residue, so CREED whole-card-or-nothing parks the ENTIRE card, ETB included"],
    ["Notion Thief", "Creature — Human Rogue",
      "Flash\nIf an opponent would draw a card except the first one they draw in each of their draw steps, instead that player skips that draw and you draw a card.",
      "not a When/Whenever/At trigger at all — a REPLACEMENT effect (\"instead\") redirecting an opponent's draw; a different mechanism the trigger gate correctly doesn't credit"],
    // (Panharmonicon lived here as "a static DOUBLER, not a trigger of its own". The first half is still
    // true and is what this file asserts — the TRIGGER gate must not claim it. But the ENTERS-TRIGGER
    // MULTIPLIER static is modeled now, so it flips through that classifier and can no longer be a
    // body-only case here. Its own coverage + runtime pins live in etbTriggerMultiplier.test.js, and the
    // "not a trigger" claim is kept below as a detectTriggers assertion, which is the precise one.)
    ["Deadeye Navigator", "Creature — Spirit",
      "Soulbond (You may pair this creature with another unpaired creature when either enters. They remain paired for as long as you control both of them.)\nAs long as Deadeye Navigator is paired with another creature, each of those creatures has \"{1}{U}: Exile this creature, then return it to the battlefield under your control.\"",
      "Soulbond pairing + a GRANTED activated ability on the paired creature, not an own trigger — no When/Whenever/At sentence exists on this card at all"],
    ["Mikaeus, the Unhallowed", "Legendary Creature — Zombie Cleric",
      "Intimidate (This creature can't be blocked except by artifact creatures and/or creatures that share a color with it.)\nWhenever a Human deals damage to you, destroy it.\nOther non-Human creatures you control get +1/+1 and have undying. (When a creature with undying dies, if it had no +1/+1 counters on it, return it to the battlefield under its owner's control with a +1/+1 counter on it.)",
      "a real own trigger (Human damage -> destroy) PLUS a group-grant of the unmodeled 'undying' keyword-static combo — the grant's residue parks the whole card"],
  ];

  for (const [name, type, oracle, why] of CASES) {
    it(`${name} — ${why}`, () => {
      expect(classifyCard(C(name, type, oracle))).toBe("body-only");
    });
  }

  it("Panharmonicon is still NOT a trigger — it flips as a STATIC, and the gate must stay out of it", () => {
    // Graduated from the body-only list above when the enters-trigger multiplier landed. The claim this
    // file owns is narrower than the tier and survives intact: the card has no When/Whenever/At sentence,
    // so detectTriggers must find nothing on it however it classifies.
    const panharmonicon = C("Panharmonicon", "Artifact",
      "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.");
    expect(detectTriggers(panharmonicon)).toEqual([]);
    expect(classifyCard(panharmonicon)).toBe("native-static");
  });
});
