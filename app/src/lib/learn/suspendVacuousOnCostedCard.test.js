/**
 * suspendVacuousOnCostedCard.test.js — suspend is vacuous ONLY when the card has a mana cost (slice 19).
 *
 * Suspend (CR 702.62) is an optional alternative way to START casting a card: "Rather than cast this card
 * from your hand, pay {cost} and exile it with N time counters." For a card WITH a printed mana cost the
 * hard cast resolves byte-identically, so the line is vacuous exactly like flashback / escape / awaken —
 * which textNormalize already strips on the SPELL path. Permanents never pass through that strip, so a
 * creature whose only other text was "Suspend 4—{1}{G}" parked for a line that cannot change how it plays.
 *
 * THE GATE IS THE WHOLE SLICE. A card with NO mana cost can ONLY be played by suspending it — CR 202.1a
 * says it can't be cast at all, which slice 18 enforced in legalChoices after finding the engine casting
 * free Ancestral Visions. Stripping the line there would claim a card the engine can never put on the stack
 * by ANY route. So the strip requires a non-empty printed cost.
 *
 * This is why the earlier blanket refusal of suspend was right for the wrong reason: the family splits, and
 * it splits on the mana cost.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";

const costed = (extra = "") => ({
  name: "Durkwood Baloth", type: "Creature — Beast", mana: "{4}{G}{G}", power: 5, toughness: 5,
  oracle: `Suspend 4—{1}{G} (Rather than cast this card from your hand, pay {1}{G} and exile it with four time counters on it.)${extra}`,
});

describe("WITH a mana cost — the line is vacuous and the card flips", () => {
  it("a vanilla body carrying only suspend is native", () => {
    expect(classifyCard(costed())).toBe("native-body");
  });

  it("a keyworded body too", () => {
    expect(classifyCard({ ...costed("\nFlying"), name: "Errant Ephemeron" })).toBe("native-body");
  });

  it("and a modeled TRIGGER alongside it still classifies by that trigger", () => {
    expect(classifyCard({ ...costed("\nWhen this creature enters, draw a card."), name: "Nantuko Shaman" })).toBe("native-trigger");
  });

  it("an UNMODELED sibling still parks the card — the strip credits nothing else", () => {
    expect(classifyCard({ ...costed("\nWhen this creature enters, each player glorbulates twice."), name: "X" })).not.toMatch(/^native/);
  });
});

describe("WITHOUT a mana cost — suspend is the ONLY way to play the card, so it stays residue", () => {
  const costless = (type, oracle) => ({ name: "Lotus Bloom", type, mana: "", oracle });

  it("Lotus Bloom is NOT credited (an artifact whose only entry is suspend)", () => {
    // Oracle text VERBATIM from the bundled index. An abbreviated reminder is NOT equivalent here: the first
    // cut of this test shortened it and the card read native-mana, which would have looked like a false
    // positive in my own change. Real card text, always.
    expect(classifyCard(costless("Artifact", "Suspend 3—{0} (Rather than cast this card from your hand, pay {0} and exile it with three time counters on it. At the beginning of your upkeep, remove a time counter. When the last is removed, you may cast it without paying its mana cost.)\n{T}, Sacrifice this artifact: Add three mana of any one color."))).not.toMatch(/^native/);
  });

  it("neither is a costless creature carrying nothing but suspend", () => {
    expect(classifyCard({ name: "Costless", type: "Creature — Beast", mana: "", power: 5, toughness: 5,
      oracle: "Suspend 4—{1}{G} (Rather than cast this card from your hand, pay {1}{G}.)" })).not.toMatch(/^native/);
  });

  it("an ABSENT mana field is treated the same as an empty one (fail-closed)", () => {
    expect(classifyCard({ name: "NoField", type: "Creature — Beast", power: 5, toughness: 5,
      oracle: "Suspend 4—{1}{G} (Rather than cast this card from your hand, pay {1}{G}.)" })).not.toMatch(/^native/);
  });
});
