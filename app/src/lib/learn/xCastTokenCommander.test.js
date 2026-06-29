/**
 * xCastTokenCommander.test.js — Zaxara, the Exemplary flips to NATIVE (coverage) and her X-cast Hydra
 * actually enters as a real X/X via the real cast dispatch; plus a pin that Koma, Cosmos Serpent is now native.
 *
 * ZAXARA (BUILT → native-mixed): the classifier (coverage.classifyXCastTokenCommander, an additive-seam
 *   single-card flip mirroring classifyWolverine) credits the card the runtime already plays. Her three
 *   abilities, all modeled:
 *     • Deathtouch — an ENFORCED COVERED_KEYWORD.
 *     • "{T}: Add two mana of any one color." — the native-mana runtime. (The amount under-production —
 *       "two" → 1 mana — is a CORPUS-WIDE manaModel.js gap that already credits Black Lotus / Goldspan
 *       Dragon / Jeweled Lotus / Gilded Lotus as native-mana; Zaxara is held to the same bar, not a
 *       stricter one. Flagged for the manaModel owner; out of the effects/coverage layer's scope.)
 *     • "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then
 *       put X +1/+1 counters on it." — the dedicated runtime hook (actionDispatcher → applyXCastTokenTriggers,
 *       xCastToken.js) threads the cast's chosen X so the 0/0 enters as a real X/X (the generic cast-trigger
 *       flush carries no xValue, so this can't ride the normal path).
 *
 * KOMA (NOW NATIVE → native-mixed): the four subsystems the park used to wait on all shipped — subtype
 *   sac-costs, modal-activated routing, a "tap target permanent" atom, and the "activated abilities can't be
 *   activated this turn" continuous restriction. Koma's full per-ability runtime coverage lives in koma.test.js;
 *   this file keeps a lightweight native-classification pin (the inverse of the old park pin).
 *
 * Real oracle text (verified vs the bundled Scryfall oracle_cards.json), verbatim.
 */
import { describe, it, expect } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

const ZAXARA = {
  name: "Zaxara, the Exemplary",
  type: "Legendary Creature — Nightmare Hydra",
  mana: "{1}{B}{G}{U}",
  power: 3,
  toughness: 3,
  oracle:
    "Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
};

const KOMA = {
  name: "Koma, Cosmos Serpent",
  type: "Legendary Creature — Serpent",
  mana: "{3}{G}{G}{U}{U}",
  power: 6,
  toughness: 6,
  oracle:
    "This spell can't be countered.\nAt the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.\nSacrifice another Serpent: Choose one —\n• Tap target permanent. Its activated abilities can't be activated this turn.\n• Koma gains indestructible until end of turn.",
};

describe("X-CAST-TOKEN COMMANDER — Zaxara classifies native (coverage)", () => {
  it("Zaxara, the Exemplary → native-mixed (Deathtouch + mana ability + X-cast Hydra trigger)", () => {
    const tier = classifyCard(ZAXARA);
    expect(tier).toBe("native-mixed");
    expect(isNativeTier(tier)).toBe(true);
  });
});

describe("X-CAST-TOKEN COMMANDER — anti-FP: the classifier is all-or-nothing (CREED)", () => {
  // Drop ANY one of Zaxara's pieces, or add an unmodeled rider, and the flip must withdraw — a partially
  // modeled commander is a forbidden FP that corrupts every game of the deck.
  const cases = {
    // No mana ability → not the full Zaxara shape; the X-cast trigger alone doesn't route → body-only.
    "no mana ability": {
      name: "No-Mana Hydra", type: "Legendary Creature — Hydra", mana: "{B}{G}{U}", power: 3, toughness: 3,
      oracle: "Deathtouch\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
    },
    // A SECOND, unmodeled trigger would be silently dropped → must stay body-only.
    "second unmodeled trigger": {
      name: "Two-Trigger Hydra", type: "Legendary Creature — Hydra", mana: "{1}{B}{G}{U}", power: 3, toughness: 3,
      oracle: "{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.\nWhenever this creature attacks, you draw a card and each opponent mills three.",
    },
    // An extra unmodeled STATIC → must stay body-only.
    "extra unmodeled static": {
      name: "Static Hydra", type: "Legendary Creature — Hydra", mana: "{1}{B}{G}{U}", power: 3, toughness: 3,
      oracle: "{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.\nWard—Pay 3 life and sacrifice a creature and discard two cards.",
    },
    // An extra NON-mana activated ability → must stay body-only (the dropped-ability FP guard).
    "extra non-mana activated": {
      name: "Activated Hydra", type: "Legendary Creature — Hydra", mana: "{1}{B}{G}{U}", power: 3, toughness: 3,
      oracle: "{T}: Add two mana of any one color.\n{3}, {T}: Each opponent loses 3 life and you gain 3 life and you draw a card and mill seven.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
    },
    // A spell (not a permanent) carrying the same words → never claimed by the permanent-tier classifier.
    "instant with the trigger words": {
      name: "Fake X-Cast Instant", type: "Instant", mana: "{B}{G}{U}",
      oracle: "Whenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.",
    },
  };
  for (const [label, card] of Object.entries(cases)) {
    it(`${label} stays non-native`, () => {
      expect(isNativeTier(classifyCard(card))).toBe(false);
    });
  }
});

describe("X-CAST-TOKEN COMMANDER — runtime: Zaxara's X-cast makes a real X/X Hydra", () => {
  // Re-verifies the runtime hook end-to-end through the real cast dispatch (the mechanism itself is also
  // covered in xCastToken.test.js): casting an {X} spell with Zaxara on the battlefield mints a 0/0 green
  // Hydra token that enters with X +1/+1 counters — a real X/X, not a 0/0 that dies to the lethal SBA.
  it("casting an X-spell for X=5 with Zaxara out spawns a 5/5 Hydra token", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const zax = createPermanent({ card: { ...ZAXARA }, controller: "user", summoningSick: false });
    const xSpell = { id: "xsp", name: "Hungering Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0, oracle: "This creature enters with X +1/+1 counters on it." };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [zax], hand: [xSpell], manaPool: { ...s.players.user.manaPool, G: 2, C: 8 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "xsp" && a.xValue === 5);
    expect(cast, "an X=5 cast was offered").toBeTruthy();
    s = dispatchAction(s, cast); // Zaxara's X-cast hook fires on cast (the X-spell is still on the stack)
    const toks = s.players.user.battlefield.filter((p) => p.card.token && /Hydra/.test(p.card.type));
    expect(toks).toHaveLength(1);
    expect(toks[0].counters["+1/+1"]).toBe(5); // the Hydra token is a real 5/5, not a 0/0 that died
    expect(toks[0].card.power).toBe(0);          // base 0/0 + 5 counters = 5/5 (counters carry the body)
  });
  it("a non-X cast makes no Hydra token (the trigger condition is {X} in the printed cost)", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const zax = createPermanent({ card: { ...ZAXARA }, controller: "user", summoningSick: false });
    const plain = { id: "plain", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [zax], hand: [plain], manaPool: { ...s.players.user.manaPool, G: 1, C: 1 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "plain");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    const toks = s.players.user.battlefield.filter((p) => p.card.token && /Hydra/.test(p.card.type));
    expect(toks).toHaveLength(0); // no {X} in the cost → Zaxara's trigger doesn't fire
  });
});

describe("X-CAST-TOKEN COMMANDER — Koma, Cosmos Serpent is now NATIVE", () => {
  // The four subsystems the old park waited on all shipped: subtype sac-cost ("Sacrifice another Serpent"),
  // modal-activated routing ("Choose one — …"), the tap-target-permanent atom, and the "activated abilities
  // can't be activated this turn" continuous restriction. Each ability's runtime is verified end-to-end in
  // koma.test.js; this is the classification pin (the inverse of the old park pin — a regression to body-only
  // would now be the failure).
  it("Koma, Cosmos Serpent → native-mixed (all three abilities modeled)", () => {
    expect(classifyCard(KOMA)).toBe("native-mixed");
    expect(isNativeTier(classifyCard(KOMA))).toBe(true);
  });
});
