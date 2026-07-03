/**
 * ZAXARA-HYDRAS — the body-only Zaxara X-counter creatures that flip native once the enters-with-counters
 * residue strip is propagated into the downstream trigger/activated/static gates (the etCard fix), so a hydra
 * whose ONLY non-keyword text beyond "enters with X +1/+1 counters" is itself a modeled clause classifies
 * native instead of body-only. The X→counters subsystem (entersWithX.test.js) and the dies-payoff resolution
 * (effects/atoms/diesTriggerPayoffs.test.js) are proven elsewhere; this file pins:
 *   1. the four CREED-clean flips classify native + actually enter at X/X via the real cast→resolve flow;
 *   2. DOUBLE-X (CR 107.3): {X}{X} (Walking Ballista) now pays 2X (parseManaCost.xCount → legalChoices.xResolvedCost)
 *      and flips native — the cast no longer underpays (the old MULTI-X guard is retired; see doubleXCost.test.js);
 *   3. the unmodeled-rider hydras (Hungering / Goose Mother / Nyxborn) stay body-only — the strip never masks
 *      an unmodeled second clause. (Voracious / Mossborn / Kalonian flipped via the counter-doubler levers —
 *      see modalDeckModes / kalonianDouble; Primordial via the self-counter-gated keyword lever; Hydroid via
 *      the self-cast trigger; Benevolent via the "another creature you control" self-exclusion lever — see
 *      benevolentHydra.test.js.)
 * Real oracle text (deck_zaxara, verified vs the local index), verbatim.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";

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

describe("ZAXARA-HYDRAS — SELF-CAST trigger (CR 603.2): Hydroid Krasis flips native (half-X gain/draw modeled)", () => {
  // Real oracle (verified vs the bundled local index), verbatim. The "When you cast this spell" trigger is the
  // SPELL's OWN cast trigger — distinct from the battlefield WATCHERS the rest of the cast pipeline handles. The
  // half-X gain/draw payoff resolves at the cast's X (threaded via context.xValue); Flying/trample + enters-with-X
  // are independently modeled, so the WHOLE card is CREED-clean.
  const HYDROID = {
    name: "Hydroid Krasis", type: "Creature — Jellyfish Hydra Beast", mana: "{X}{G}{U}", power: 0, toughness: 0,
    oracle: "When you cast this spell, you gain half X life and draw half X cards. Round down each time.\nFlying, trample\nThis creature enters with X +1/+1 counters on it.",
  };
  it("classifies native-trigger (self-cast half-X gain/draw + Flying/trample + enters-with-X)", () => {
    expect(classifyCard(HYDROID)).toBe("native-trigger");
  });

  // RUNTIME — cast for X, the self-cast trigger goes on the stack ABOVE the spell (resolves FIRST, CR 603.3b):
  // gain floor(X/2) life + draw floor(X/2) cards, then the creature enters as a real X/X.
  const castForX = (X) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const card = { ...HYDROID, id: "hk" };
    const library = Array.from({ length: 20 }, (_, i) => ({ id: `l${i}`, name: "Forest", type: "Land", oracle: "" }));
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [card], library, manaPool: { ...s.players.user.manaPool, G: 2, U: 2, C: 20 } } },
    };
    const life0 = s.players.user.life;
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hk" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    // The stack carries the spell with the self-cast trigger ON TOP — resolve the trigger first.
    s = resolveTopOfStack(s);
    const lifeGained = s.players.user.life - life0;
    const cardsDrawn = s.players.user.hand.length; // hand was emptied by the cast; now = cards drawn by the trigger
    // Resolve the spell — the creature enters at X/X.
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "hk");
    return { s, perm, lifeGained, cardsDrawn };
  };

  it("X=6 (even): gain 3 life, draw 3 cards, enters a 6/6", () => {
    const { s, perm, lifeGained, cardsDrawn } = castForX(6);
    expect(lifeGained).toBe(3);
    expect(cardsDrawn).toBe(3);
    expect(perm.counters["+1/+1"]).toBe(6);
    expect(permanentPower(s, perm.id)).toBe(6);
    expect(permanentToughness(s, perm.id)).toBe(6);
  });
  it("X=5 (odd, rounds down): gain 2 life, draw 2 cards, enters a 5/5", () => {
    const { s, perm, lifeGained, cardsDrawn } = castForX(5);
    expect(lifeGained).toBe(2); // floor(5/2)
    expect(cardsDrawn).toBe(2);
    expect(permanentPower(s, perm.id)).toBe(5);
  });
  it("X=1 (the floor, rounds down to 0): gain 0 life, draw 0 cards, enters a 1/1", () => {
    const { s, perm, lifeGained, cardsDrawn } = castForX(1);
    expect(lifeGained).toBe(0); // floor(1/2) — never fabricates a 1
    expect(cardsDrawn).toBe(0);
    expect(permanentPower(s, perm.id)).toBe(1);
  });
});

describe("ZAXARA-HYDRAS — HALF-X-CREATE-TOKENS: The Goose Mother flips native (ETB half-X Food + attack sac-Food draw)", () => {
  // The LAST blocker on this Zaxara card — the "create half X Food tokens, rounded up" ETB — is now modeled
  // (HALF-X-CREATE-TOKENS: a half-X create-named-token whose count is the chosen {X} halved, threaded into the
  // ETB trigger via perm.xValue). Its attack reflexive-sac half was already native (REFLEXIVE-SAC-BY-SUBTYPE),
  // so the WHOLE card is CREED-clean. Full parser/runtime coverage lives in halfX.test.js; this pins the flip.
  const GOOSE = {
    name: "The Goose Mother", type: "Legendary Creature — Bird Hydra", mana: "{X}{G}{U}", power: 2, toughness: 2,
    oracle: "Flying\nThe Goose Mother enters with X +1/+1 counters on it.\nWhen The Goose Mother enters, create half X Food tokens, rounded up.\nWhenever The Goose Mother attacks, you may sacrifice a Food. If you do, draw a card.",
  };
  it("classifies native-trigger (half-X-Food ETB + enters-with-X + attack reflexive-sac all modeled)", () => {
    expect(classifyCard(GOOSE)).toBe("native-trigger");
  });

  // RUNTIME — cast for X: the creature enters as a real X/X (enters-with-X counters) AND its ETB mints
  // ceil(X/2) Food tokens (the threaded {X}, halved up).
  const castForX = (X) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const card = { ...GOOSE, id: "gm" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [card], manaPool: { ...s.players.user.manaPool, G: 1, U: 1, C: 20 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "gm" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    s = resolveTopOfStack(s); // the Goose enters; its ETB trigger lands in pendingTriggers
    let guard = 0;
    while (((s.stack || []).length || (s.pendingTriggers || []).length) && guard++ < 30) {
      if ((s.pendingTriggers || []).length) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); continue; }
      if ((s.stack || []).length) { s = resolveTopOfStack(s); continue; }
      break;
    }
    const perm = s.players.user.battlefield.find((p) => p.card.id === "gm");
    const foods = s.players.user.battlefield.filter((p) => p.card?.name === "Food");
    return { s, perm, foods };
  };

  it("X=6 (even): enters a 6/6 AND mints ceil(6/2)=3 Food", () => {
    const { s, perm, foods } = castForX(6);
    expect(perm.counters["+1/+1"]).toBe(6);
    expect(permanentPower(s, perm.id)).toBe(8); // base 2/2 + 6 counters
    expect(foods.length).toBe(3);
  });
  it("X=5 (odd, rounds UP): enters a 5/5 AND mints ceil(5/2)=3 Food", () => {
    const { s, perm, foods } = castForX(5);
    expect(permanentPower(s, perm.id)).toBe(7); // base 2/2 + 5 counters
    expect(foods.length).toBe(3);
  });
});
describe("ZAXARA-HYDRAS — PARKED: hydras with an unmodeled rider stay body-only (the strip never masks it)", () => {
  const parked = {
    // Hungering Hydra FLIPPED native-trigger via the BLOCK-COUNT-CAP evasion static (its "can't be blocked by more
    // than one creature", the menace-inverse, is now enforced in legalChoices.legalBlockerActions) + the ENRAGE
    // self-scaled counter payoff ("put that many +1/+1 counters on it" = ctx.combatDamageAmount) — moved out of
    // PARKED to hungeringHydra.test.js.
    // Benevolent Hydra FLIPPED native-mixed via the "another creature you control" self-exclusion lever (CR
    // 109.5): its counter-replacement's +1 now correctly skips its own source (applyCounterDoubling honors the
    // profile's excludeSource), and its "{T}, remove a +1/+1 counter: put a +1/+1 counter on another target
    // creature you control" activated ability is fully modeled (the effect parses HIGH + the source is excluded
    // from enumeration) — moved out of PARKED to the BUILT section below (see benevolentHydra.test.js for the
    // full end-to-end proof).
    // Primordial Hydra FLIPPED native-mixed via the SELF-COUNTER-GATED KEYWORD lever (its "has trample as long
    // as it has ten or more +1/+1 counters on it" conditional-keyword static is now modeled; the upkeep
    // counter-doubler already routed) — moved out of PARKED to the BUILT section below.
    // Hydroid Krasis FLIPPED native via the SELF-CAST trigger subsystem (its "When you cast this spell" half-X
    // gain/draw is now modeled) — moved out of PARKED to the BUILT section below.
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
