/**
 * costTax.test.js — STATIC-COST-TAX (CR 601.2f), the INCREASE twin of the cost reducers.
 *
 * "[<filter> ]spells [your opponents cast ]cost {N} more to cast" — the Thalia hatebear family:
 *   - bare (Sphere of Resistance) taxes every spell, every caster;
 *   - negated card type (Thalia "noncreature", Lodestone Golem "nonartifact") taxes spells whose type
 *     line LACKS the type;
 *   - card type / subtype (Feroz's Ban "Creature", Squeeze "Sorcery") taxes by word-bound type-line match;
 *   - "your opponents cast" (Grand Arbiter, God-Pharaoh's Statue) skips the taxer's own controller.
 * Taxes collect from EVERY battlefield (a tax names no "you" — Thalia taxes her own controller too) and
 * apply at the legalChoices pricing chokepoint: generic-only, increases BEFORE decreases, mana value
 * untouched (CR 202.3), both AI and player affordability priced identically.
 *
 * CREED guards pinned: an unmodeled "non<word>" NEVER falls through to a vacuous subtype filter (the
 * Lodestone-class FP, caught live during the build); dynamic ("for each"), targeting-scoped, and
 * color-tax variants stay body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { collectCostTaxers, costTaxForSpell } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const THALIA = () => ({ name: "Thalia, Guardian of Thraben", type: "Legendary Creature — Human Soldier", mana: "{1}{W}", oracle: "First strike\nNoncreature spells cost {1} more to cast.", keywords: ["First strike"] });
const SPHERE = () => ({ name: "Sphere of Resistance", type: "Artifact", mana: "{2}", oracle: "Spells cost {1} more to cast.", keywords: [] });

describe("STATIC-COST-TAX — classification", () => {
  it("the hatebear family flips native", () => {
    expect(classifyCard(THALIA())).toBe("native-static");
    expect(classifyCard(SPHERE())).toBe("native-static");
    expect(classifyCard({ name: "Lodestone Golem", type: "Artifact Creature — Golem", oracle: "Nonartifact spells cost {1} more to cast." })).toBe("native-static");
    expect(classifyCard({ name: "God-Pharaoh's Statue", type: "Legendary Artifact", oracle: "Spells your opponents cast cost {2} more to cast.\nAt the beginning of your end step, each opponent loses 1 life." })).toBe("native-mixed");
  });

  it("CREED: unmodeled variants stay body-only", () => {
    // dynamic amount
    expect(classifyCard({ name: "Synth", type: "Creature — Human", oracle: "Spells cost {1} more to cast for each artifact you control." })).toBe("body-only");
    // targeting-scoped
    expect(classifyCard({ name: "Synth", type: "Creature — Human", oracle: "Spells that target a creature you control cost {2} more to cast." })).toBe("body-only");
    // an unmodeled non-word must NOT mint a vacuous subtype filter (the Lodestone-class FP)
    expect(classifyCard({ name: "Synth", type: "Creature — Human", oracle: "Nonlegendary spells cost {1} more to cast." })).toBe("body-only");
  });
});

describe("STATIC-COST-TAX — pricing math (unit)", () => {
  it("negated / bare / oppOnly semantics", () => {
    const taxers = collectCostTaxers([{ controller: "ai", battlefield: [{ card: THALIA() }] }]);
    expect(costTaxForSpell(taxers, { type: "Sorcery" }, "user")).toBe(1);
    expect(costTaxForSpell(taxers, { type: "Creature — Bear" }, "user")).toBe(0);
    expect(costTaxForSpell(taxers, { type: "Instant" }, "ai")).toBe(1); // Thalia taxes her own controller too
    const opp = collectCostTaxers([{ controller: "ai", battlefield: [{ card: { name: "GPS", type: "Legendary Artifact", oracle: "Spells your opponents cast cost {2} more to cast." } }] }]);
    expect(costTaxForSpell(opp, { type: "Sorcery" }, "user")).toBe(2);
    expect(costTaxForSpell(opp, { type: "Sorcery" }, "ai")).toBe(0); // never its own controller
  });
});

describe("STATIC-COST-TAX — engine cast pricing (legalChoices)", () => {
  function mkState({ hand = [], userBf = [], aiBf = [], mana = {} }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana }, hand, battlefield: userBf },
        ai: { ...base.players.ai, battlefield: aiBf },
      },
    };
  }
  const castActions = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
  const BOLTISH = { id: "sorc1", name: "Test Sorcery", type: "Sorcery", mana: "{1}{R}", oracle: "", keywords: [] };
  const BEAR = { id: "bear1", name: "Test Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "", keywords: [] };

  it("an OPPONENT's Thalia raises my sorcery's generic by {1}; the mana value is unchanged", () => {
    const thalia = createPermanent({ card: THALIA(), controller: "ai" });
    const a = castActions(mkState({ hand: [BOLTISH], aiBf: [thalia], mana: { R: 5 } }), "sorc1")[0];
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(2); // {1}{R} → {2}{R}
    expect(a.cmc).toBe(2);          // CR 202.3 — MV stays printed
  });

  it("my creature spell is NOT taxed by Thalia; without her the sorcery costs its printed {1}", () => {
    const thalia = createPermanent({ card: THALIA(), controller: "ai" });
    expect(castActions(mkState({ hand: [BEAR], aiBf: [thalia], mana: { G: 5 } }), "bear1")[0].cost.generic).toBe(1);
    expect(castActions(mkState({ hand: [BOLTISH], mana: { R: 5 } }), "sorc1")[0].cost.generic).toBe(1);
  });

  it("the tax gates AFFORDABILITY — a spell payable at printed cost but not with the tax is not offered", () => {
    const sphere = createPermanent({ card: SPHERE(), controller: "ai" });
    const exact = mkState({ hand: [BOLTISH], mana: { R: 2 } });                    // exactly {1}{R}
    expect(castActions(exact, "sorc1").length).toBe(1);                            // affordable without the tax
    const taxed = mkState({ hand: [BOLTISH], aiBf: [sphere], mana: { R: 2 } });
    expect(castActions(taxed, "sorc1").length).toBe(0);                            // {2}{R} > 2 mana → not offered
  });

  it("increases apply BEFORE decreases and the generic floors at 0 (CR 601.2f)", () => {
    // Sphere (+1) + two Creature-spell reducers (-2 each) on a {1}{G} creature: 1 + 1 - 4 → floored 0.
    const sphere = createPermanent({ card: { name: "Sphere of Resistance", type: "Artifact", mana: "{2}", oracle: "Spells cost {1} more to cast.", keywords: [] }, controller: "ai" });
    const raptor = () => createPermanent({ card: { name: "Reducer", type: "Creature — Human", mana: "{2}", oracle: "Creature spells you cast cost {2} less to cast.", keywords: [] }, controller: "user" });
    const a = castActions(mkState({ hand: [BEAR], userBf: [raptor(), raptor()], aiBf: [sphere], mana: { G: 5 } }), "bear1")[0];
    expect(a.cost.generic).toBe(0);
  });
});
