/**
 * noncreatureArtifactTarget.test.js — the NONCREATURE qualifier on artifact / enchantment targets.
 *
 * "Destroy target NONCREATURE artifact" (Crush, Overwhelming Surge, Haywire Mite, Joven, Guerrilla Gorilla).
 *
 * 48 corpus cards use this wording and NONE classified native. The qualifier is a genuine NARROWING — it
 * excludes artifact/enchantment CREATURES — so approximating it as the bare type would let the engine destroy
 * an artifact creature the printed card cannot touch: an over-delivery, the forbidden direction. That is why
 * these shapes correctly refused rather than being approximated, and why adding them is FP-CLOSING work
 * rather than a widening.
 *
 * ⭐ THE ENUMERATOR SIDE IS LAYER-AWARE, and that is tested here on real machinery rather than asserted. A
 * permanent can be a creature ONLY BY LAYERS — an ARTIFACT LAND under a mass land-animation (Nature's Revolt)
 * is an Artifact whose live type line includes Creature. The printed type line alone would still offer it.
 *
 * Honest scope note: the engine models mass LAND animation but not mass ARTIFACT animation (measured — "All
 * artifacts are 2/2 creatures" does not animate). The artifact-land case above is therefore the reachable
 * scenario that exercises the layer branch today; a future artifact animator is covered by the same check.
 */
import { beforeEach, describe, expect, it } from "vitest";

import "./coverage.js"; // registers the static-ability validators used by the layer walk
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { permanentIsCreature } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NONCREATURE_ARTIFACT = "destroy target noncreature artifact";
const BARE_ARTIFACT = "destroy target artifact";

describe("parsing", () => {
  const tt = (clause) => parseEffectClause(clause, "Instant", { hasX: false }).atoms[0]?.targetType;

  it("the qualifier is consumed WHOLE, not partially matched as the bare type", () => {
    // A left-to-right alternation that let "artifact" win would silently drop "noncreature" and widen the
    // target set — the exact over-delivery this slice exists to prevent.
    expect(tt(NONCREATURE_ARTIFACT)).toBe("noncreatureArtifact");
    expect(tt("destroy target noncreature enchantment")).toBe("noncreatureEnchantment");
    expect(tt("destroy target noncreature artifact or noncreature enchantment")).toBe("noncreatureArtifactOrEnchantment");
  });

  it("the BARE forms are untouched", () => {
    expect(tt(BARE_ARTIFACT)).toBe("artifact");
    expect(tt("destroy target enchantment")).toBe("enchantment");
    expect(tt("destroy target artifact or enchantment")).toBe("artifactOrEnchantment");
  });

  it("the five cards whose ONLY blocker was this qualifier now classify native", () => {
    // REAL bundled oracle text, verbatim — never written from memory (CLAUDE.md 1.2).
    expect(classifyCard({ name: "Crush", type: "Instant", mana: "{R}", oracle: "Destroy target noncreature artifact." })).toBe("native-spell");
    expect(classifyCard({ name: "Joven", type: "Legendary Creature — Human Rogue", mana: "{3}{R}{R}", oracle: "{R}{R}{R}, {T}: Destroy target noncreature artifact." })).toBe("native-activated");
    expect(classifyCard({ name: "Overwhelming Surge", type: "Instant", mana: "{2}{R}", oracle: "Choose one or both —\n• Overwhelming Surge deals 3 damage to target creature.\n• Destroy target noncreature artifact." })).toBe("native-spell");
    // The UNION form, and an EXILE rather than a destroy — both exercised by Haywire Mite.
    expect(classifyCard({ name: "Haywire Mite", type: "Artifact Creature — Insect", mana: "{1}", oracle: "When this creature dies, you gain 2 life.\n{G}, Sacrifice this creature: Exile target noncreature artifact or noncreature enchantment." })).toBe("native-mixed");
    expect(classifyCard({ name: "Guerrilla Gorilla", type: "Creature — Ape Soldier Hero", mana: "{1}{G}", oracle: "Reach\nSacrifice this creature: Destroy target noncreature artifact or noncreature enchantment. Activate only as a sorcery." })).toBe("native-activated");
  });
});

describe("⭐ CREED — an artifact CREATURE is never offered", () => {
  const prog = () => parseEffectClause(NONCREATURE_ARTIFACT, "Instant", { hasX: false });
  const bare = () => parseEffectClause(BARE_ARTIFACT, "Instant", { hasX: false });
  const ROCK = { id: "r", name: "Sol Ring", type: "Artifact", oracle: "" };
  const SERVO = { id: "r", name: "Servo", type: "Artifact Creature — Servo", power: 1, toughness: 1, oracle: "" };
  const CITADEL = { id: "r", name: "Darksteel Citadel", type: "Artifact Land", oracle: "" };
  const REVOLT = { id: "g", name: "Natures Revolt", type: "Enchantment", oracle: "All lands are 2/2 creatures that are still lands." };

  function board(target, granter = null) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = granter ? [createPermanent({ id: "g", card: granter, controller: "user" })] : [];
    return { ...s, players: { ...s.players,
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "r", card: target, controller: "ai" })] },
      user: { ...s.players.user, battlefield: mine },
    } };
  }
  const offers = (program, st) => (expandCastChoices(st, "user", program) || []).length;

  it("a plain artifact IS offered (control — the arm must still work)", () => {
    expect(offers(prog(), board(ROCK))).toBe(1);
  });

  it("⭐ a PRINTED artifact creature is NOT offered — while the BARE form still sees it", () => {
    expect(offers(prog(), board(SERVO))).toBe(0);
    // The bare-form half is the control: without it, a broken enumerator returning nothing would pass above.
    expect(offers(bare(), board(SERVO))).toBe(1);
  });

  it("⭐ LAYER-AWARE — an artifact land ANIMATED by a mass land-animation is NOT offered", () => {
    // Un-animated it is a legal target; the ONLY difference is the live layer read.
    expect(permanentIsCreature(board(CITADEL), "r")).toBe(false);
    expect(offers(prog(), board(CITADEL))).toBe(1);

    expect(permanentIsCreature(board(CITADEL, REVOLT), "r")).toBe(true);
    expect(offers(prog(), board(CITADEL, REVOLT))).toBe(0);
  });
});
