/**
 * TRIGGER TOKEN-GRANT (TK-1, 2026-07-18) — a trigger that creates a token and then grants it an ability
 * in a following sentence: `create <token>. It has "<ability>."` / `They have "<ability>."`
 *
 * THE BUG THIS CLOSES WAS A LIVE FALSE POSITIVE, not a park. detectTriggers' effect regex stops at the
 * first period, and its same-line follow-up loop (isFollowupSentence) rejected any sentence containing a
 * colon as "an activated ability" — but the colon here sits INSIDE the quoted grant. So the grant was
 * dropped, the truncated lead ("create a 1/1 colorless Eldrazi Scion creature token") parsed HIGH, and
 * the engine minted a VANILLA token: Incubator Drone's Scion and Dread Drone's Spawn could never be
 * sacrificed for mana, and the AI never ramped off them while the card claimed to be natively modeled.
 *
 * Measured over the corpus (46 cards in the touched class): 22 enriched (the Eldrazi Scion/Spawn family
 * now binds its mana ability), 0 gained, and exactly 1 "LOST" — Deathpact Angel, which is the CREED
 * trade working as designed (see its case below), not a regression.
 */
import { describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";

function card(name, oracle_text, type_line = "Creature — Eldrazi Drone") {
  return { name, oracle_text, oracle: oracle_text, type_line, type: type_line };
}

/** The trigger's effect clause as the parser will actually see it. */
function effectOf(c) {
  const trigs = detectTriggers(c);
  return trigs.length ? (trigs[0].effectClause || "") : "";
}
function programOf(c) {
  const p = parseEffectClause(effectOf(c), c.type_line);
  return { program: p, confidence: p ? programConfidence(p) : "none" };
}

describe('the "It has \\"…\\"" grant survives into the trigger effect', () => {
  const drone = card(
    "Incubator Drone",
    'When this creature enters, create a 1/1 colorless Eldrazi Scion creature token. It has "Sacrifice this token: Add {C}."',
  );

  it("keeps the grant sentence instead of truncating at the first period", () => {
    expect(effectOf(drone)).toContain("Sacrifice this token: Add {C}");
  });

  it("binds the ability onto the created token (tokenOracle), not a vanilla body", () => {
    const { program, confidence } = programOf(drone);
    expect(confidence).toBe("high");
    const token = (program.atoms || []).find((a) => a.op === "create-token");
    expect(token).toBeTruthy();
    expect(token.tokenOracle).toBe("Sacrifice this token: Add {C}");
  });
});

describe('the plural "They have \\"…\\"" form works the same way', () => {
  const dread = card(
    "Dread Drone",
    'When this creature enters, create two 0/1 colorless Eldrazi Spawn creature tokens. They have "Sacrifice this token: Add {C}."',
  );

  it("binds the ability across the multi-token create", () => {
    const { program, confidence } = programOf(dread);
    expect(confidence).toBe("high");
    const token = (program.atoms || []).find((a) => a.op === "create-token");
    expect(token.tokenOracle).toBe("Sacrifice this token: Add {C}");
  });
});

describe("CREED — an UNMODELABLE grant now parks honestly instead of minting a vanilla token", () => {
  // Deathpact Angel's token carries a full reanimation ability. The parser cannot model that, so the
  // WHOLE program must drop LOW → Arbiter. Pre-fix, the grant was dropped and the truncated lead parsed
  // HIGH — the engine minted a plain 1/1 Cleric and silently discarded the card's entire point. This is
  // the one "LOST" in the flip-diff, and it is a false-positive→safe-park conversion: exactly the trade
  // the CREED mandates (false negative SAFE, false positive FORBIDDEN).
  const angel = card(
    "Deathpact Angel",
    'When this creature dies, create a 1/1 white and black Cleric creature token. It has "{3}{W}{B}{B}, {T}, Sacrifice this token: Return a card named Deathpact Angel from your graveyard to the battlefield."',
    "Creature — Angel",
  );

  it("sees the whole grant", () => {
    expect(effectOf(angel)).toContain("Return a card named Deathpact Angel");
  });

  it("drops the program LOW rather than claiming a token it cannot build", () => {
    expect(programOf(angel).confidence).toBe("low");
  });
});

describe("the follow-up gate stays narrow — a real activated ability still ends the effect", () => {
  it("does not swallow a card-level activated ability on the same line", () => {
    // A genuine activated ability is never led by "it has"/"they have", so the colon guard still stops here.
    const c = card(
      "Test Activated",
      "When this creature enters, draw a card. {T}: Add {G}.",
      "Creature — Elf",
    );
    expect(effectOf(c)).not.toContain("Add {G}");
  });

  it("still folds a plain continuation sentence (no regression to the normal path)", () => {
    const c = card(
      "Test Continuation",
      "When this creature enters, draw a card. You gain 2 life.",
      "Creature — Elf",
    );
    expect(effectOf(c)).toContain("You gain 2 life");
  });
});
