/**
 * entersCountersStripAnchor.test.js — the enters-with-counters residue strips could eat BACKWARDS across
 * a newline and swallow the line before them. A second instance of the newline-crossing FP class, found
 * by sweeping the file for it rather than by tripping over a card.
 *
 * THE HAZARD. The three strips lead with `[^.]*`, and in JS `[^.]` MATCHES A NEWLINE (only `.` excludes
 * it). So the pattern could start on a PREVIOUS line and consume through the newline into the
 * enters-with-counters sentence, deleting both. It stays harmless whenever the previous line ends in a
 * period — `[^.]` cannot cross that — which is why ordinary oracle prose never exposed it.
 * **KEYWORD LINES DO NOT END IN A PERIOD.** That is the hole:
 *     "Champion a Goblin"  +  "This creature enters with two +1/+1 counters on it."
 * Champion is unmodeled (the line alone correctly parks the card), and before this fix the pair
 * classified native-body — the engine would have played a champion creature without its exile-and-return
 * cost, which is materially stronger than the printed card.
 *
 * ⚠️ THIS FLIPS ZERO CARDS TODAY — no corpus card currently pairs an unmodeled no-period keyword line
 * with an enters-with-counters line (whole-corpus diff: 0 gained / 0 lost). It is banked as a LATENT FP,
 * the same shape as the "If you do" newline bug fixed in the commit before it: that one also flipped
 * nothing on its own, right up until an unrelated and perfectly good slice removed the residue that had
 * been accidentally shielding Time Vault. **A latent FP is still an FP; it ships the day something else
 * uncovers it.** Fixed to `[^.\n]*` at all three sites.
 *
 * Mutation-checked (2026-08-04, verified applied): `[^.\n]*` reverted to `[^.]*` -> the champion pin goes
 * red, while the plain enters-with-counters pin stays green (the legitimate strip is untouched).
 *
 * Synthetic fixtures, deliberately: the point is the SHAPE, and no printed card carries it yet.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ETB_COUNTERS = "This creature enters with two +1/+1 counters on it.";
const ETB_X = "This creature enters with X +1/+1 counters on it.";
const creature = (oracle, over = {}) => ({ id: "c-p", name: "Probe", type: "Creature — Eldrazi", mana: "{7}", power: "5", toughness: "5", oracle, ...over });

describe("the strip must not eat the line before it", () => {
  // ⭐⭐ FIXTURE SWAPPED TWICE NOW, GUARD JOB UNCHANGED — and the pattern is worth naming. These three pins
  // are about the STRIP'S ANCHOR: an unmodeled NO-PERIOD keyword line sitting before the counters sentence
  // must not be eaten by it. The fixture needs a keyword that is UNMODELED, which is precisely the property
  // this project exists to destroy, so **it will rot again**. It was "Champion a Goblin" until champion was
  // modeled (CR 702.71a); then "Sunburst" until sunburst was modeled (CR 702.43a, 2026-08-05); now
  // "Double team", verified unmodeled both alone and welded at the time of writing.
  // ⛔ WHEN THIS GOES RED, THE GUARD IS ALMOST CERTAINLY FINE — re-probe for a keyword that still parks
  // alone, swap it in, and record the flip below rather than weakening the assertion.
  it("⛔ an unmodeled NO-PERIOD keyword line before the counters sentence still parks the card", () => {
    // Double team is unmodeled; crediting this card would play it without its conjure-a-duplicate half.
    expect(classifyCard(creature(`Double team\n${ETB_COUNTERS}`))).toBe("body-only");
  });

  it("⛔ the X-counters strip has the same anchor and the same guard", () => {
    expect(classifyCard(creature(`Double team\n${ETB_X}`, { mana: "{X}{G}", power: "0", toughness: "0" }))).toBe("body-only");
  });

  it("the keyword line alone parks (so the pin above is really about the WELD, not about the keyword)", () => {
    expect(classifyCard(creature("Double team"))).toBe("body-only");
  });

  it("ⓘ sunburst, the previous fixture, is now MODELED and welds cleanly — recorded, not deleted", () => {
    // CR 702.43a. The colour count is threaded from the payment plan; see sunburst.test.js.
    expect(classifyCard(creature("Sunburst"))).toBe("native-body");
  });

  it("ⓘ champion, the former fixture, is now MODELED and welds cleanly — recorded, not deleted", () => {
    expect(classifyCard(creature("Champion a Goblin"))).toBe("native-body");
  });

  it("the counters sentence ALONE is still credited — the legitimate strip is untouched", () => {
    expect(classifyCard(creature(ETB_COUNTERS))).toBe("native-body");
  });

  it("a MODELED no-period keyword line before it still composes (no over-correction)", () => {
    // Flying is covered, so the card is native either way — this pins that the fix did not break the
    // ordinary case of a keyword line sitting above an enters-with-counters line.
    expect(classifyCard(creature(`Flying\n${ETB_COUNTERS}`))).toBe("native-body");
  });

  it("a sentence ending in a period before it was ALWAYS safe (the period blocks [^.]) — pinned as the contrast", () => {
    expect(classifyCard(creature(`Whenever a player consults an oracle, interpret its riddle however you like.\n${ETB_COUNTERS}`))).toBe("body-only");
  });
});
