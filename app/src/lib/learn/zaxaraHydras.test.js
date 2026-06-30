/**
 * ZAXARA-HYDRAS — the body-only Zaxara X-counter creatures that flip native once the enters-with-counters
 * residue strip is propagated into the downstream trigger/activated/static gates (the etCard fix), so a hydra
 * whose ONLY non-keyword text beyond "enters with X +1/+1 counters" is itself a modeled clause classifies
 * native instead of body-only. The X→counters subsystem (entersWithX.test.js) and the dies-payoff resolution
 * (effects/atoms/diesTriggerPayoffs.test.js) are proven elsewhere; this file pins:
 *   1. the four CREED-clean flips classify native + actually enter at X/X via the real cast→resolve flow;
 *   2. DOUBLE-X (CR 107.3): {X}{X} (Walking Ballista) now pays 2X (parseManaCost.xCount → legalChoices.xResolvedCost)
 *      and flips native — the cast no longer underpays (the old MULTI-X guard is retired; see doubleXCost.test.js);
 *   3. the unmodeled-rider hydras (Hungering / Goose Mother / Benevolent / Primordial / Hydroid /
 *      Nyxborn) stay body-only — the strip never masks an unmodeled second clause. (Voracious / Mossborn /
 *      Kalonian have since flipped via the counter-doubler levers — see modalDeckModes / kalonianDouble.)
 * Real oracle text (deck_zaxara, verified vs the local index), verbatim.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

// ── the four CREED-clean flips (every clause beyond enters-with-X is independently modeled) ──
const MISTCUTTER = {
  name: "Mistcutter Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0,
  oracle: "This spell can't be countered.\nHaste, protection from blue\nThis creature enters with X +1/+1 counters on it.",
};
const GOLDVEIN = {
  name: "Goldvein Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0,
  oracle: "Vigilance, trample, haste\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, create a number of tapped Treasure tokens equal to its power.",
};
const LIFEBLOOD = {
  name: "Lifeblood Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}{G}", power: 0, toughness: 0,
  oracle: "Trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature dies, you gain life and draw cards equal to its power.",
};
const STEELBANE = {
  name: "Steelbane Hydra", type: "Creature — Hydra Turtle", mana: "{X}{G}{G}", power: 0, toughness: 0,
  oracle: "This creature enters with X +1/+1 counters on it.\n{2}{G}, Remove a +1/+1 counter from this creature: Destroy target artifact or enchantment.",
};

describe("ZAXARA-HYDRAS — coverage: the four CREED-clean flips classify native", () => {
  it("Mistcutter Hydra → native-static (can't-be-countered + haste/protection-from-blue + enters-with-X)", () => {
    expect(classifyCard(MISTCUTTER)).toBe("native-static");
  });
  it("Goldvein Hydra → native-trigger (vig/tr/haste + enters-with-X + dies→Treasures=power)", () => {
    expect(classifyCard(GOLDVEIN)).toBe("native-trigger");
  });
  it("Lifeblood Hydra → native-trigger (trample + enters-with-X + dies→gain life & draw=power)", () => {
    expect(classifyCard(LIFEBLOOD)).toBe("native-trigger");
  });
  it("Steelbane Hydra → native-activated (enters-with-X + {2}{G},remove-counter: destroy artifact/enchantment)", () => {
    expect(classifyCard(STEELBANE)).toBe("native-activated");
  });
});

describe("ZAXARA-HYDRAS — runtime: each flip enters at X/X via the real cast→resolve flow", () => {
  const castForX = (card, X) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = { ...card, id: "hyd" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [hydra], manaPool: { ...s.players.user.manaPool, G: 5, U: 2, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hyd" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "hyd");
    return { s, perm };
  };

  it("Mistcutter cast for X=4 enters with 4 +1/+1 counters — a real 4/4", () => {
    const { s, perm } = castForX(MISTCUTTER, 4);
    expect(perm).toBeTruthy();
    expect(perm.counters["+1/+1"]).toBe(4);
    expect(permanentPower(s, perm.id)).toBe(4);
    expect(permanentToughness(s, perm.id)).toBe(4);
  });
  it("Goldvein cast for X=3 enters as a 3/3 (its dies→Treasure payoff is resolution-tested in diesTriggerPayoffs)", () => {
    const { s, perm } = castForX(GOLDVEIN, 3);
    expect(perm.counters["+1/+1"]).toBe(3);
    expect(permanentPower(s, perm.id)).toBe(3);
  });
  it("Lifeblood cast for X=5 enters as a 5/5", () => {
    const { s, perm } = castForX(LIFEBLOOD, 5);
    expect(perm.counters["+1/+1"]).toBe(5);
    expect(permanentToughness(s, perm.id)).toBe(5);
  });
  it("Steelbane cast for X=2 enters as a 2/2 (its activated destroy is resolution-verified)", () => {
    const { s, perm } = castForX(STEELBANE, 2);
    expect(perm.counters["+1/+1"]).toBe(2);
    expect(permanentPower(s, perm.id)).toBe(2);
  });
});

describe("ZAXARA-HYDRAS — Steelbane's activated ability resolves end-to-end (the rider that earns native-activated)", () => {
  it("{2}{G}, remove a +1/+1 counter: destroys a target artifact AND removes the counter", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    // A 3/3 Steelbane already on the battlefield (3 counters) + an enemy artifact to destroy.
    const sb = createPermanent({ id: "sb", card: { ...STEELBANE, id: "sb" }, controller: "user", summoningSick: false });
    sb.counters = { "+1/+1": 3 };
    const art = createPermanent({ id: "perm-art", card: { id: "art", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, controller: "ai" });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [sb], manaPool: { ...s.players.user.manaPool, G: 3, C: 3 } },
        ai: { ...s.players.ai, battlefield: [art] },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "sb" && (a.targets || []).some((t) => t.id === "perm-art"));
    expect(act, "the destroy-artifact ability targeting the Sol Ring is offered").toBeTruthy();
    s = dispatchAction(s, act);
    s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.some((p) => p.card.id === "art")).toBe(false); // artifact destroyed
    expect(s.players.user.battlefield.find((p) => p.card.id === "sb").counters["+1/+1"]).toBe(2); // 3 → 2 (counter removed as a cost)
  });
});

describe("ZAXARA-HYDRAS — DOUBLE-X cost (CR 107.3): a {X}{X} enters-with-X card now pays 2X and flips native", () => {
  // Walking Ballista's {X}{X} cost is now paid CORRECTLY by the shared X-cost machinery (parseManaCost counts
  // the X pips into xCount; legalChoices.xResolvedCost pays cost.generic + xCount*X, i.e. 2X). The X→counters
  // resolver still threads the SINGLE chosen X into the counters (count = X, cost = 2X). Crediting it native is
  // now SOUND — the cast no longer underpays. (Runtime 2X-payment is pinned in doubleXCost.test.js.)
  const BALLISTA = {
    name: "Walking Ballista", type: "Creature Artifact — Construct", mana: "{X}{X}", power: 0, toughness: 0,
    oracle: "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nRemove a +1/+1 counter from this creature: It deals 1 damage to any target.",
  };
  it("Walking Ballista ({X}{X}) is native-activated — every clause modeled AND the 2X cost is paid", () => {
    expect(classifyCard(BALLISTA)).toBe("native-activated");
  });
  it("the single-{X} variant still flips too — the credit no longer keys on the X-pip count", () => {
    const singleX = { ...BALLISTA, mana: "{X}" }; // a hypothetical single-X variant — abilities unchanged
    expect(classifyCard(singleX)).toBe("native-activated");
  });
});

describe("ZAXARA-HYDRAS — PARKED: hydras with an unmodeled rider stay body-only (the strip never masks it)", () => {
  const parked = {
    "Hungering Hydra (can't-be-blocked-by->1 + dealt-damage→counters)": {
      type: "Creature — Hydra", mana: "{X}{G}",
      oracle: "This creature enters with X +1/+1 counters on it.\nThis creature can't be blocked by more than one creature.\nWhenever this creature is dealt damage, put that many +1/+1 counters on it.",
    },
    "The Goose Mother (ETB half-X Food + attack→sac-Food draw)": {
      type: "Legendary Creature — Bird Hydra", mana: "{X}{G}{U}",
      oracle: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card.",
    },
    "Benevolent Hydra ({T},remove-counter: move a counter)": {
      type: "Creature — Hydra", mana: "{X}{G}{G}",
      oracle: "This creature enters with X +1/+1 counters on it.\nIf one or more +1/+1 counters would be put on another creature you control, that many plus one +1/+1 counters are put on it instead.\n{T}, Remove a +1/+1 counter from this creature: Put a +1/+1 counter on another target creature you control.",
    },
    "Primordial Hydra (upkeep→double counters)": {
      type: "Creature — Hydra", mana: "{X}{G}{G}",
      oracle: "This creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature.\nThis creature has trample as long as it has ten or more +1/+1 counters on it.",
    },
    "Hydroid Krasis (cast-trigger half-X life/draw)": {
      type: "Creature — Beast Jellyfish Hydra", mana: "{X}{G}{U}",
      oracle: "When you cast this spell, you gain half X life and draw half X cards. Round down each time.\nFlying, trample\nThis creature enters with X +1/+1 counters on it.",
    },
    "Nyxborn Hydra (Bestow Aura)": {
      type: "Creature Enchantment — Hydra", mana: "{X}{G}",
      oracle: "Bestow {X}{G}{G}\nReach, trample\nThis permanent enters with X +1/+1 counters on it.\nEnchanted creature gets +1/+1 for each +1/+1 counter on this Aura and has reach and trample.",
    },
  };
  for (const [label, card] of Object.entries(parked)) {
    it(`${label} stays body-only`, () => {
      expect(classifyCard({ name: label.split(" (")[0], ...card })).toBe("body-only");
    });
  }
});
