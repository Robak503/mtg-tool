/**
 * escapeWithCounters.test.js — "This creature escapes with <N> +1/+1 counter(s) on it" (CR 702.143b):
 * Phoenix of Ash, Ox of Agonas, Underworld Charger, Woe Strider, Tizerus Charger, Underworld Rage-Hound,
 * Voracious Typhon, Loathsome Chimera. Twelve carriers, zero native, shapes differing only by COUNT.
 *
 * ⭐ STRIPPED AS VACUOUS, ON THE ESCAPE COST LINE'S OWN ARGUMENT — and RE-VERIFIED rather than inherited.
 * The escape cost line is stripped because escape is a graveyard re-cast window the runtime never offers and
 * every carrier has a real printed mana cost. This rider fires ONLY on an escape-cast, so it is inert by the
 * same mechanism. I checked the precondition independently for all twelve carriers of THIS line: every one
 * has a printed mana cost ({G} through {3}{R}{R}) AND a printed escape line, so each is fully playable by its
 * ordinary cast with the rider dormant. Same reasoning, separate evidence — the vacuity claim is not
 * transitive and was not treated as such.
 *
 * ⛔⛔ SENTENCE-SCOPED, NOT LINE-SCOPED, AND POLUKRANOS IS WHY. Its line reads "Polukranos enters with six
 * +1/+1 counters on it. It escapes with twelve +1/+1 counters on it instead." The FIRST sentence is a real
 * enters-with rider that fires on an ordinary cast. A line strip would delete it and credit the card for an
 * effect the engine would then never perform — the exact failure the partner-with strip's note warns about.
 * The survival of that sentence is pinned below, and it is the load-bearing test in this file.
 *
 * ⓘ Polukranos still parks, on its damage-REPLACEMENT clause ("prevent that damage and remove that many
 * counters") — a different mechanic, and an honest FN. Charred Graverobber, Pharika's Spawn and Chainweb
 * Aracnir likewise park on other lines.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * strip removed -> all eight carriers park again; the strip widened to the whole LINE -> Polukranos loses its
 * "enters with six +1/+1 counters" sentence and reads as though that rider didn't exist.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { _resetIdsForTests } from "./gameState.js";
import { entersWithPlusCounters } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const ESC = (cost, tail) => `Escape—${cost}, Exile three other cards from your graveyard. (You may cast this card from your graveyard for its escape cost.)\n${tail}`;

describe("the rider is inert, so it stops blocking", () => {
  it("⭐ singular, plural and the modal form all flip", () => {
    expect(classifyCard({ name: "Loathsome Chimera", type: "Creature — Chimera", mana: "{2}{G}", power: "4", toughness: "3",
      oracle: ESC("{4}{G}", "This creature escapes with a +1/+1 counter on it.") })).toBe("native-body");
    expect(classifyCard({ name: "Voracious Typhon", type: "Creature — Snake Beast", mana: "{2}{G}{G}", power: "4", toughness: "4",
      oracle: ESC("{5}{G}{G}", "This creature escapes with three +1/+1 counters on it.") })).toBe("native-body");
    // ⭐ The modal wording rides along — it is equally escape-only, so equally inert.
    expect(classifyCard({ name: "Tizerus Charger", type: "Creature — Pegasus", mana: "{2}{B}", power: "3", toughness: "2",
      oracle: ESC("{4}{B}", "This creature escapes with your choice of a +1/+1 counter or a flying counter on it.") })).toBe("native-body");
  });

  it("⭐ and it composes with the rest of a card (Phoenix of Ash keeps its pump ability)", () => {
    expect(classifyCard({ name: "Phoenix of Ash", type: "Creature — Phoenix", mana: "{1}{R}{R}", power: "2", toughness: "2",
      oracle: `Flying, haste\n{2}{R}: This creature gets +2/+0 until end of turn.\n${ESC("{2}{R}{R}", "This creature escapes with a +1/+1 counter on it.")}` })).toBe("native-activated");
  });
});

describe("⛔⛔ THE SENTENCE SCOPE — the load-bearing pin", () => {
  const POLUKRANOS_LINE = "Polukranos enters with six +1/+1 counters on it. It escapes with twelve +1/+1 counters on it instead.";

  it("⛔⛔ Polukranos' REAL enters-with rider SURVIVES the strip", () => {
    const base = { name: "Polukranos, Unchained", type: "Legendary Creature — Zombie Hydra", mana: "{2}{B}{G}", power: "0", toughness: "0" };
    // ⭐ THE DISCRIMINATOR: the escape sentence ALONE leaves nothing behind (native-body — a bare body), while
    // the full line still carries the enters-with half as live text. If the strip ever widens to the whole
    // LINE, the two collapse to the same answer and Polukranos silently stops getting its six counters.
    const escapeOnly = classifyCard({ ...base, oracle: "It escapes with twelve +1/+1 counters on it instead." });
    const fullLine = classifyCard({ ...base, oracle: POLUKRANOS_LINE });
    expect(escapeOnly).toBe("native-body");
    // ④-I (2026-09-03): "six" joined the enters-with vocabulary in BOTH the runtime reader and the classifier's
    // strip, so the full line is native now — and honestly so: the reader places exactly six (pinned here, so
    // the credit can never outrun the placement again).
    expect(fullLine).toBe("native-body");
    expect(entersWithPlusCounters({ ...base, oracle: POLUKRANOS_LINE })).toBe(6);
    // ⭐ THE DISCRIMINATOR, rebuilt: an UNMODELED sibling sentence after the escape sentence. Sentence-scoped,
    // the strip leaves the fight sentence alive and the card parks; widened to the whole LINE, the strip would
    // eat it and credit a card the engine cannot play.
    expect(classifyCard({ ...base, oracle: "It escapes with twelve +1/+1 counters on it instead. Polukranos fights another target creature." })).toBe("body-only");
    // …and BEFORE it (the side the strip's sentence anchor guards — widen that anchor to the line and this credits).
    expect(classifyCard({ ...base, oracle: "Polukranos fights another target creature. It escapes with twelve +1/+1 counters on it instead." })).toBe("body-only");
  });

  it("⛔ the real Polukranos still PARKS on its damage-replacement clause (an honest FN)", () => {
    expect(classifyCard({ name: "Polukranos, Unchained", type: "Legendary Creature — Zombie Hydra", mana: "{2}{B}{G}", power: "0", toughness: "0",
      oracle: `${POLUKRANOS_LINE}\nIf damage would be dealt to Polukranos while it has a +1/+1 counter on it, prevent that damage and remove that many +1/+1 counters from it.\n{1}{B}{G}: Polukranos fights another target creature.\nEscape—{4}{B}{G}, Exile six other cards from your graveyard.` }))
      .not.toMatch(/^native/);
  });

  it("⛔ a non-escape 'enters with counters' sentence is never touched", () => {
    // The anchor requires the literal verb "escapes with"; an ordinary enters-with rider must be untouched,
    // or every counter-carrying creature in the corpus would silently lose its counters.
    expect(classifyCard({ name: "Sedge Scorpion", type: "Creature — Scorpion", mana: "{G}", power: "1", toughness: "1",
      oracle: "Deathtouch\nThis creature enters with two +1/+1 counters on it." })).toMatch(/^native/);
  });
});
