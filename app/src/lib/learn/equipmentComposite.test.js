/**
 * equipmentComposite.test.js — an EQUIPMENT whose bonus + Equip line compose with a natively-routing
 * TRIGGER: Mask of Memory #1002 · Goldvein Pick #2100 · Prying Blade · Skeleton Key.
 *
 * ⭐ NEITHER HALF WAS MISSING. permanentEquipmentCovered already ADMITS a trigger — it just strips the
 * trigger sentence with a naive `[^.]+` that stops at the first period, so any trigger whose effect runs
 * past one sentence leaves the rest as residue and sinks the card:
 *
 *   Mask of Memory   "…you may draw two cards. IF YOU DO, discard a card."      ← reflexive tail
 *   Goldvein Pick    "…create a Treasure token. (It's an artifact with …)"      ← reminder text
 *
 * permanentFullyCovered's residue chain already handles all of those — the reflexive and
 * optional-payment tails, the ability-word label, reminder stripping. It just had no idea what an
 * equipped-creature bonus IS. So each half understood its own piece and the card fell between them.
 *
 * The fix hands the CAREFULLY-stripped remainder to the equipment gate rather than duplicating either
 * chain. Safe by construction: every trigger is proven to route natively before that point, and the
 * equipment gate is itself all-or-nothing over what's left.
 *
 * ⚠️ Found by asking WHY a near-miss row (Goldvein Pick, "equipped creature" one word from "this
 * creature") wasn't flipping, when the equippedCreature SCOPE plainly existed. The answer wasn't the
 * scope at all — it was two tiers that couldn't talk to each other, worth 12 corpus cards. A row that
 * looks like a one-card cross is sometimes a composition gap wearing a costume.
 */
import { describe, expect, it } from "vitest";

import { classifyCard, permanentEquipmentCovered } from "./coverage.js";

// Bundled Scryfall oracle text, reminders included — the reminders are half the point.
const GOLDVEIN_PICK = { name: "Goldvein Pick", type: "Artifact — Equipment", mana: "{2}", keywords: [],
  oracle: "Equipped creature gets +1/+1.\nWhenever equipped creature deals combat damage to a player, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" };
const MASK_OF_MEMORY = { name: "Mask of Memory", type: "Artifact — Equipment", mana: "{2}", keywords: [],
  oracle: "Whenever equipped creature deals combat damage to a player, you may draw two cards. If you do, discard a card.\nEquip {1} ({1}: Attach to target creature you control. Equip only as a sorcery.)" };
const PLAIN_EQUIP = { name: "Plain Blade", type: "Artifact — Equipment", mana: "{2}", keywords: [],
  oracle: "Equipped creature gets +2/+0.\nEquip {2}" };

describe("the composition — each half already understood its own piece", () => {
  it("THE LOAD-BEARING PAIR — both flip; the quote-aware strip made the EQUIPMENT gate self-sufficient for Goldvein (Codex fix #4)", () => {
    // HISTORY: permanentEquipmentCovered used to fail BOTH (its naive first-period trigger strip left
    // the reflexive tail / Treasure reminder behind), and the composite existed to close that gap. The
    // shared quote-aware strip now cleans Goldvein's sentence whole, so the equipment gate takes it
    // directly (native-equipment — a LATERAL move, still native, runtime unchanged). Mask of Memory's
    // "If you do, discard a card." reflexive tail still needs the composite — that half of the
    // diagnosis stands, and both cards still flip native either way.
    expect(permanentEquipmentCovered(GOLDVEIN_PICK)).toBe(true);
    expect(permanentEquipmentCovered(MASK_OF_MEMORY)).toBe(false);
    expect(classifyCard(GOLDVEIN_PICK)).toBe("native-equipment");
    expect(classifyCard(MASK_OF_MEMORY)).toBe("native-mixed");
  });

  it("REGRESSION PIN — a trigger-less Equipment still classifies through its OWN tier", () => {
    // The composite must not shadow the single-mechanism tier; a plain Equipment stays native-equipment.
    expect(permanentEquipmentCovered(PLAIN_EQUIP)).toBe(true);
    expect(classifyCard(PLAIN_EQUIP)).toBe("native-equipment");
  });
});

describe("CREED — the composite is not a bypass", () => {
  it("an Equipment with an UNMODELED trigger still parks", () => {
    // The trigger gate runs before the equipment arm is even consulted; a non-routing trigger fails it.
    expect(classifyCard({ ...PLAIN_EQUIP, name: "Weird Blade",
      oracle: "Equipped creature gets +2/+0.\nWhenever equipped creature deals combat damage to a player, choose a card name at random from outside the game.\nEquip {2}" }))
      .toBe("body-only");
  });

  it("an Equipment with an unmodeled NON-EQUIP activated ability still parks", () => {
    // The equipment gate requires every activated ability to BE an Equip line. The composite only hands it
    // the trigger-stripped text, so that requirement is still the thing doing the work.
    // (My first fixture here used "Equipped creature's activated abilities can't be activated" as the
    // unmodeled clause — it's modeled, and the test failed for the right reason: the fixture was wrong.)
    expect(classifyCard({ ...PLAIN_EQUIP, name: "Odd Blade",
      oracle: "Equipped creature gets +2/+0.\n{3}: Choose a card name at random from outside the game.\nWhenever equipped creature deals combat damage to a player, draw a card.\nEquip {2}" }))
      .toBe("body-only");
  });

  it("a non-Equipment artifact is untouched by the new arm", () => {
    expect(classifyCard({ name: "Odd Rock", type: "Artifact", mana: "{2}", keywords: [],
      oracle: "Whenever this artifact becomes tapped, choose a card name at random from outside the game." }))
      .toBe("body-only");
  });
});
