/**
 * namedTokenSacTrigger.test.js — "Whenever you sacrifice a Blood TOKEN, you gain 1 life." (Gluttonous Guest).
 *
 * The mechanic was already built: `sacSubtype` matches the sacrificed permanent's TYPE LINE word-bounded,
 * and a Blood token's line is "Token Artifact — Blood", so Captain Lannery Storm's "sacrifice a Treasure"
 * has worked for a long time. Only the PARSE was rejecting the printed trailing word — the arm was `$`
 * anchored, and its own comment named "a creature token" as a casualty of that anchor.
 *
 * The same NON_SUBTYPE_ETB_WORDS guard still runs, which is what keeps "a CREATURE token" refused: creature
 * is a card TYPE handled by a different matcher with a different predicate, and admitting it here would
 * duplicate that matcher with the wrong one.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";
import { detectTriggers } from "./triggers.js";

beforeEach(() => _resetIdsForTests());

const vamp = (o) => ({ name: "C", type: "Creature — Vampire", mana: "{2}{B}", oracle: o });
const descriptorsOf = (o) => (detectTriggers(vamp(o)) || []).map((t) => t.descriptor ?? t);

describe("named-token sacrifice trigger", () => {
  it("flips Gluttonous Guest", () => {
    // Oracle from the bundled snapshot, reminder text included as printed.
    expect(classifyCard({
      name: "Gluttonous Guest", type: "Creature — Vampire", mana: "{2}{B}",
      oracle: 'When this creature enters, create a Blood token. (It\'s an artifact with "{1}, {T}, Discard a card, Sacrifice this token: Draw a card.")\nWhenever you sacrifice a Blood token, you gain 1 life.',
    })).toBe("native-trigger");
  });

  it("parses the trailing 'token' to the SAME descriptor as the bare spelling", () => {
    const withToken = descriptorsOf("Whenever you sacrifice a Blood token, you gain 1 life.");
    const bare = descriptorsOf("Whenever you sacrifice a Blood, you gain 1 life.");
    expect(withToken).toHaveLength(1);
    expect(withToken[0].event).toBe("sacrifice");
    expect(withToken[0].sacSubtype).toBe("Blood");
    // Same subject, two printed spellings — they must not drift apart.
    expect(bare[0]?.sacSubtype).toBe("Blood");
  });

  it("leaves the already-working spellings untouched", () => {
    expect(classifyCard(vamp("Whenever you sacrifice a Treasure, you gain 1 life."))).toBe("native-trigger");
    expect(classifyCard(vamp("Whenever you sacrifice a creature, you gain 1 life."))).toBe("native-trigger");
    expect(classifyCard(vamp("Whenever you sacrifice an artifact, you gain 1 life."))).toBe("native-trigger");
  });

  it("⛔ 'a CREATURE token' is still refused — the card-TYPE guard must survive the widening", () => {
    // creature/permanent/artifact are card TYPES with their own matcher and their own predicate. If the
    // suffix widening let them through here they would be re-handled as a type-line SUBTYPE scan, which
    // would never match "Creature" the way the type matcher does. This is the assertion that keeps the
    // two matchers from overlapping.
    expect(classifyCard(vamp("Whenever you sacrifice a creature token, you gain 1 life."))).toBe("body-only");
    expect(classifyCard(vamp("Whenever you sacrifice a permanent token, you gain 1 life."))).toBe("body-only");
  });
});
