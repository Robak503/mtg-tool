/**
 * selfNoUntapComposite.test.js — TWO changes that had to land in one commit, in one order.
 *
 * ① THE FALSE POSITIVE (fixed first, and on its own it flips NOTHING). Two residue chains in this file
 * strip a reflexive "When you do, …" / "If you do, …" tail with a trailing `\s*`. `\s` MATCHES A NEWLINE,
 * so the strip swallowed the line break and WELDED the next oracle line onto the stripped one; the
 * line-based activated-ability filter then dropped the whole welded line, taking a genuinely unmodeled
 * sentence with it. Time Vault is the carrier: its skip-your-turn REPLACEMENT effect — which has no
 * implementation anywhere in the repo — vanished, and the card read native-mixed.
 * **This exact hazard is documented eight lines away**, in stripTriggerEffectTails: "NO `\s` ANYWHERE — it
 * matches a NEWLINE, and this file has already shipped that exact false positive once." The warning was
 * right and these two chains never got the treatment. Both now use horizontal whitespace only.
 * Corpus effect of the fix alone: **0 gained, 0 lost** — the FP was LATENT, because Time Vault was being
 * held at body-only by the very residue that ② removes.
 *
 * ② THE COMPOSITION (+2), which is what made the latent FP dangerous. `stripModeledSelfNoUntap` ran in the
 * native-BODY and native-TRIGGER lanes but not in permanentFullyCovered (the COMPOSITE), which walks raw
 * clauses and has no static descriptor for the line. Elaborate Firecannon is the cleanest tell this
 * project has produced: EVERY PAIR of its three lines is native and only all three together parked.
 *
 * ⛔ THE ORDER IS THE WHOLE POINT. ② alone measured a clean +3/0/0 — and its third row was Time Vault,
 * so shipping it would have put a live FP on a real card. It was built, measured, and REVERTED for that
 * reason; ① landed first; now Time Vault parks on its own unmodeled clause while the other two flip. A
 * tier diff cannot tell those two situations apart, which is why the per-row whole-card audit is the
 * instrument that caught it.
 *
 * Mutation-checked (2026-08-04, each verified applied): the `[ \t]` in the "if you do" strips reverted to
 * `\s` -> the Time Vault park goes red (the FP returns); the no-untap pre-strip disabled -> both flip
 * pins go red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, permanentFullyCovered } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TIME_VAULT = { id: "c-tv", name: "Time Vault", type: "Artifact", mana: "{2}",
  oracle: "This artifact enters tapped.\nThis artifact doesn't untap during your untap step.\nIf you would begin your turn while this artifact is tapped, you may skip that turn instead. If you do, untap this artifact.\n{T}: Take an extra turn after this one." };
const ELABORATE_FIRECANNON = { id: "c-ef", name: "Elaborate Firecannon", type: "Artifact", mana: "{3}",
  oracle: "This artifact doesn't untap during your untap step.\n{4}, {T}: This artifact deals 2 damage to any target.\nAt the beginning of your upkeep, you may discard a card. If you do, untap this artifact." };
const GOBLIN_SHARPSHOOTER = { id: "c-gs", name: "Goblin Sharpshooter", type: "Creature — Goblin", mana: "{2}{R}", power: "1", toughness: "1",
  oracle: "This creature doesn't untap during your untap step.\nWhenever a creature dies, untap this creature.\n{T}: This creature deals 1 damage to any target." };

describe("① the newline-eating strip no longer hides a real unmodeled sentence", () => {
  it("⛔ Time Vault PARKS — its skip-your-turn replacement effect is unmodeled and must be seen", () => {
    // The clause has no implementation anywhere in the repo; crediting the card would make it materially
    // different from the printed one (its entire drawback would be absent).
    expect(classifyCard(TIME_VAULT)).toBe("body-only");
    expect(permanentFullyCovered(TIME_VAULT)).toBe(false);
  });

  it("⛔ and the minimal shape parks too — an 'If you do,' tail must not swallow the line after it", () => {
    expect(classifyCard({ id: "c-min", name: "Vault Probe", type: "Artifact", mana: "{2}",
      oracle: "If you would begin your turn while this artifact is tapped, you may skip that turn instead. If you do, untap this artifact.\n{T}: Take an extra turn after this one." })).toBe("body-only");
  });

  it("⛔ ANY unmodeled sentence followed by an 'If you do,' tail + another line still parks", () => {
    // Generalized past Time Vault: the bug was structural (a newline eaten), not about this one card.
    expect(classifyCard({ id: "c-gen", name: "Weld Probe", type: "Artifact", mana: "{2}",
      oracle: "Interpret the omens however you like. If you do, untap this artifact.\n{T}: Take an extra turn after this one." })).toBe("body-only");
  });

  it("the reflexive tail is STILL stripped when it legitimately should be (no over-correction)", () => {
    // Elaborate Firecannon's upkeep trigger genuinely carries "you may discard a card. If you do, untap
    // this artifact." — a vouched trigger effect. It must still compose, which the ② pins below prove.
    expect(classifyCard(ELABORATE_FIRECANNON)).toBe("native-mixed");
  });
});

describe("② the self-no-untap static composes in the COMPOSITE lane", () => {
  it("Elaborate Firecannon and Goblin Sharpshooter flip to native-mixed", () => {
    expect(classifyCard(ELABORATE_FIRECANNON)).toBe("native-mixed");
    expect(classifyCard(GOBLIN_SHARPSHOOTER)).toBe("native-mixed");
  });

  it("⭐ every PAIR of Elaborate Firecannon's three lines was ALREADY native — a 3-way composition gap", () => {
    const NO_UNTAP = "This artifact doesn't untap during your untap step.";
    const ACT = "{4}, {T}: This artifact deals 2 damage to any target.";
    const UPKEEP = "At the beginning of your upkeep, you may discard a card. If you do, untap this artifact.";
    const mk = (o) => ({ ...ELABORATE_FIRECANNON, id: "c-p", oracle: o });
    expect(classifyCard(mk(`${NO_UNTAP}\n${ACT}`))).toBe("native-activated");
    expect(classifyCard(mk(`${ACT}\n${UPKEEP}`))).toBe("native-mixed");
    expect(classifyCard(mk(`${NO_UNTAP}\n${UPKEEP}`))).toBe("native-trigger");
  });

  it("⛔ a CONDITIONAL no-untap variant is NOT stripped (the end-anchor holds)", () => {
    // "…unless it has a depletion counter on it" is a different static the runtime does not enforce this
    // way; stripping it would credit a card whose behavior the engine gets wrong.
    expect(classifyCard({ id: "c-cond", name: "Depletion Probe", type: "Artifact", mana: "{2}",
      oracle: "This artifact doesn't untap during your untap step if it has a depletion counter on it.\n{4}, {T}: This artifact deals 2 damage to any target." })).toBe("body-only");
  });

  it("⛔ an unmodeled clause beside a no-untap static still parks", () => {
    expect(classifyCard({ id: "c-u", name: "Odd Cannon", type: "Artifact", mana: "{3}",
      oracle: "This artifact doesn't untap during your untap step.\nWhenever a player consults an oracle, interpret its riddle however you like.\n{4}, {T}: This artifact deals 2 damage to any target." })).toBe("body-only");
  });
});
