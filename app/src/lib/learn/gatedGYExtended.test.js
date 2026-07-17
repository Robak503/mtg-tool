/**
 * GATED-GY-EXTENDED — menace/fear now grantable + typed GY gates (permanent, instant/sorcery)
 * + Descend N ability-label strip.
 *
 * Three change buckets:
 *   1. keywords.js: menace + fear added to GRANTABLE_STATIC_KEYWORDS / GRANTABLE_COMBAT_KEYWORDS.
 *   2. layers.js: countGraveyardSpec now filters by cardType ("Permanent", "instantOrSorcery").
 *   3. staticAbilityParser.js: parseGraveyardGate adds typed gate forms; parseClause label-strip
 *      extended to "Descend N —".
 */

import { describe, it, expect } from "vitest";
import { GRANTABLE_STATIC_KEYWORDS, GRANTABLE_COMBAT_KEYWORDS } from "./keywords.js";
import { parseStaticAbilities, staticAbilitiesCoverCard } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { createGameState } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

// ─── helpers ─────────────────────────────────────────────────────────────────
const card = (name, oracle, type = "Creature — Test") => ({
  name, type, oracle, mana: "{2}{G}", cmc: 3, keywords: [],
});

function statics(name, oracle, type) {
  return parseStaticAbilities(card(name, oracle, type));
}
function covers(name, oracle, type) {
  return staticAbilitiesCoverCard(card(name, oracle, type), () => false);
}
function tier(name, oracle, type) {
  return classifyCard(card(name, oracle, type));
}

// ─── 1. GRANTABLE keywords ────────────────────────────────────────────────────
describe("GATED-GY-EXTENDED — grantable keywords", () => {
  it("menace is in GRANTABLE_STATIC_KEYWORDS", () => {
    expect(GRANTABLE_STATIC_KEYWORDS.has("menace")).toBe(true);
  });
  it("menace is in GRANTABLE_COMBAT_KEYWORDS", () => {
    expect(GRANTABLE_COMBAT_KEYWORDS.has("menace")).toBe(true);
  });
  it("fear is in GRANTABLE_STATIC_KEYWORDS", () => {
    expect(GRANTABLE_STATIC_KEYWORDS.has("fear")).toBe(true);
  });
  it("fear is in GRANTABLE_COMBAT_KEYWORDS", () => {
    expect(GRANTABLE_COMBAT_KEYWORDS.has("fear")).toBe(true);
  });
  // Regression: the non-grantable set is now empty — all COMBAT_KEYWORDS grant
  it("indestructible is still in GRANTABLE_STATIC_KEYWORDS", () => {
    expect(GRANTABLE_STATIC_KEYWORDS.has("indestructible")).toBe(true);
  });
});

// ─── 2. Delirium menace (Hound of the Farbogs) ───────────────────────────────
describe("GATED-GY-EXTENDED — delirium menace grant", () => {
  const HOUND = "Delirium — This creature has menace as long as there are four or more card types among cards in your graveyard.";
  const THRABEN = "Delirium — This creature gets +1/+1 and has menace as long as there are four or more card types among cards in your graveyard.";

  it("Hound of the Farbogs — parseStaticAbilities yields addKeyword(Menace) gated on cardTypesInGraveyard ≥ 4", () => {
    const out = statics("Hound of the Farbogs", HOUND);
    expect(out).toHaveLength(1);
    expect(out[0].layer).toBe(6);
    expect(out[0].op.layerOp).toBe("addKeyword");
    expect(out[0].op.keyword.toLowerCase()).toBe("menace");
    expect(out[0].op.gate.countSpec.kind).toBe("cardTypesInGraveyard");
    expect(out[0].op.gate.atLeast).toBe(4);
  });

  it("Hound of the Farbogs — staticAbilitiesCoverCard returns true", () => {
    expect(covers("Hound of the Farbogs", HOUND)).toBe(true);
  });

  it("Hound of the Farbogs — classifyCard returns native-static", () => {
    expect(tier("Hound of the Farbogs", HOUND)).toBe("native-static");
  });

  it("Thraben Foulbloods — parseStaticAbilities yields ptModifyGated + addKeyword(Menace)", () => {
    const out = statics("Thraben Foulbloods", THRABEN);
    expect(out).toHaveLength(2);
    const pt = out.find((d) => d.op?.layerOp === "ptModifyGated");
    const kw = out.find((d) => d.op?.layerOp === "addKeyword");
    expect(pt?.op.power).toBe(1);
    expect(pt?.op.toughness).toBe(1);
    expect(kw?.op.keyword.toLowerCase()).toBe("menace");
    expect(pt?.op.gate).toEqual(kw?.op.gate); // same gate object
  });

  it("Thraben Foulbloods — classifyCard returns native-static", () => {
    expect(tier("Thraben Foulbloods", THRABEN)).toBe("native-static");
  });
});

// ─── 3. Fear grants ──────────────────────────────────────────────────────────
describe("GATED-GY-EXTENDED — fear grants", () => {
  const FEAR_CTRL = "This creature has fear as long as you control a Zombie.";
  const FEAR_THRESH = "Threshold — As long as there are seven or more cards in your graveyard, this creature has fear.";

  it("control-gated fear — parseStaticAbilities yields addKeyword(Fear)", () => {
    const out = statics("Fear Test", FEAR_CTRL);
    expect(out).toHaveLength(1);
    expect(out[0].op.layerOp).toBe("addKeyword");
    expect(out[0].op.keyword.toLowerCase()).toBe("fear");
  });

  it("control-gated fear — classifyCard returns native-static", () => {
    expect(tier("Fear Test", FEAR_CTRL)).toBe("native-static");
  });

  it("threshold-gated fear — classifyCard returns native-static", () => {
    expect(tier("Fear Thresh", FEAR_THRESH)).toBe("native-static");
  });
});

// ─── 4. Descend N label strip + permanent cards gate ─────────────────────────
describe("GATED-GY-EXTENDED — Descend 4 / permanent cards gate", () => {
  const CAPYBARA = "Descend 4 — This creature gets +3/+0 as long as there are four or more permanent cards in your graveyard.";
  const CAVE_WURM = "Descend 4 — This creature gets +2/+0 as long as there are four or more permanent cards in your graveyard.";
  const ECHO = "Descend 4 — As long as there are four or more permanent cards in your graveyard, this creature has flying.";

  it("Basking Capybara — parseStaticAbilities yields ptModifyGated gated on Permanent cards ≥ 4", () => {
    const out = statics("Basking Capybara", CAPYBARA);
    expect(out).toHaveLength(1);
    expect(out[0].op.layerOp).toBe("ptModifyGated");
    expect(out[0].op.power).toBe(3);
    expect(out[0].op.toughness).toBe(0);
    expect(out[0].op.gate.countSpec.kind).toBe("cardsInGraveyard");
    expect(out[0].op.gate.countSpec.cardType).toBe("Permanent");
    expect(out[0].op.gate.atLeast).toBe(4);
  });

  it("Basking Capybara — classifyCard returns native-static", () => {
    expect(tier("Basking Capybara", CAPYBARA)).toBe("native-static");
  });

  it("Frilled Cave-Wurm — classifyCard returns native-static", () => {
    expect(tier("Frilled Cave-Wurm", CAVE_WURM)).toBe("native-static");
  });

  it("Echo of Dusk (lead gate form) — parseStaticAbilities yields addKeyword(Flying) on permanent-cards gate", () => {
    const out = statics("Echo of Dusk", ECHO);
    expect(out).toHaveLength(1);
    expect(out[0].op.layerOp).toBe("addKeyword");
    expect(out[0].op.keyword.toLowerCase()).toBe("flying");
    expect(out[0].op.gate.countSpec.cardType).toBe("Permanent");
  });

  it("Echo of Dusk — classifyCard returns native-static", () => {
    expect(tier("Echo of Dusk", ECHO)).toBe("native-static");
  });
});

// ─── 5. Instant / sorcery cards gate ─────────────────────────────────────────
describe("GATED-GY-EXTENDED — instant and/or sorcery cards gate", () => {
  const GHITU = "As long as there are two or more instant and/or sorcery cards in your graveyard, this creature gets +1/+0 and has haste.";
  const WOLVERINE = "This creature has double strike as long as there are three or more instant and/or sorcery cards in your graveyard.";

  it("Ghitu Lavarunner — parseStaticAbilities yields ptModifyGated + addKeyword(Haste) on instantOrSorcery gate", () => {
    const out = statics("Ghitu Lavarunner", GHITU);
    expect(out).toHaveLength(2);
    const pt = out.find((d) => d.op?.layerOp === "ptModifyGated");
    const kw = out.find((d) => d.op?.layerOp === "addKeyword");
    expect(pt?.op.power).toBe(1);
    expect(pt?.op.toughness).toBe(0);
    expect(kw?.op.keyword.toLowerCase()).toBe("haste");
    expect(pt?.op.gate.countSpec.kind).toBe("cardsInGraveyard");
    expect(pt?.op.gate.countSpec.cardType).toBe("instantOrSorcery");
    expect(pt?.op.gate.atLeast).toBe(2);
  });

  it("Ghitu Lavarunner — classifyCard returns native-static", () => {
    expect(tier("Ghitu Lavarunner", GHITU)).toBe("native-static");
  });

  it("Spelleater Wolverine — parseStaticAbilities yields addKeyword(Double strike) on instantOrSorcery ≥ 3", () => {
    const out = statics("Spelleater Wolverine", WOLVERINE);
    expect(out).toHaveLength(1);
    expect(out[0].op.layerOp).toBe("addKeyword");
    expect(out[0].op.keyword.toLowerCase()).toBe("double strike");
    expect(out[0].op.gate.countSpec.cardType).toBe("instantOrSorcery");
    expect(out[0].op.gate.atLeast).toBe(3);
  });

  it("Spelleater Wolverine — classifyCard returns native-static", () => {
    expect(tier("Spelleater Wolverine", WOLVERINE)).toBe("native-static");
  });
});

// ─── 6. FP regressions — complex cases MUST stay body-only ───────────────────
describe("GATED-GY-EXTENDED — FP regressions", () => {
  it("quoted trigger in gated effect stays body-only (Cephalid Sage)", () => {
    const SAGE = "Threshold — As long as there are seven or more cards in your graveyard, this creature has \"When this creature enters, draw three cards, then discard two cards.\"";
    expect(tier("Cephalid Sage", SAGE)).toBe("body-only");
  });

  it("opponent-GY gate flips native (park LIFTED by BLITZ CA-2's opponentGraveyardAtLeast evaluator)", () => {
    const NIMANA = "As long as an opponent has eight or more cards in their graveyard, this creature gets +1/+0 and has menace.";
    expect(tier("Nimana Skitter-Sneak", NIMANA)).toMatch(/^native/);
  });

  it("OR-condition gate stays body-only (Sidewinder Naga)", () => {
    const NAGA = "As long as you control a Desert or there is a Desert card in your graveyard, this creature gets +1/+1 and has first strike.";
    expect(tier("Sidewinder Naga", NAGA)).toBe("body-only");
  });

  it("intervening-if ETB with delirium stays body-only (Omnivorous Flytrap)", () => {
    const FLYTRAP = "Delirium — Whenever this creature enters or attacks, if there are four or more card types among cards in your graveyard, put a +1/+1 counter on this creature.";
    expect(tier("Omnivorous Flytrap", FLYTRAP)).toBe("body-only");
  });

  it("hand-count gate flips native (park LIFTED by BLITZ CA-2's cardsInHand atLeast band)", () => {
    const AKKI = "As long as you have seven or more cards in hand, this creature gets +2/+1 and has first strike.";
    expect(tier("Akki Underling", AKKI)).toMatch(/^native/);
  });

  it("composite AND gate stays body-only (Bloodfire Enforcers)", () => {
    const BLOODFIRE = "This creature has first strike and trample as long as an instant card and a sorcery card are in your graveyard.";
    expect(tier("Bloodfire Enforcers", BLOODFIRE)).toBe("body-only");
  });
});

// ─── 7. Engine gate evaluation (layers.countGraveyardSpec) ───────────────────
describe("GATED-GY-EXTENDED — gate evaluation (layers)", () => {
  function makeState(permanentIds, graveyard) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: {
          ...s.players.user,
          battlefield: permanentIds.map((id) => ({ id, card: { name: id, type: "Permanent", oracle: "", mana: "{1}", cmc: 1, keywords: [] }, counters: {}, tapped: false, controller: "user" })),
          graveyard: graveyard,
        },
      },
    };
  }

  it("permanent-cards gate open when ≥4 permanent cards in GY", () => {
    const permCards = [
      { name: "Perm1", type: "Creature — Beast", oracle: "", mana: "{1}", cmc: 1 },
      { name: "Perm2", type: "Enchantment", oracle: "", mana: "{1}", cmc: 1 },
      { name: "Perm3", type: "Artifact", oracle: "", mana: "{1}", cmc: 1 },
      { name: "Perm4", type: "Land", oracle: "", mana: "", cmc: 0 },
    ];
    const state = makeState(["p1"], permCards);
    // Manually verify: collectContinuousEffects uses the graveyard spec
    // We test indirectly via classifyCard + a real gate check
    // Instead test the permanentHasKeyword path with a manufactured effect
    // (Layer-level test via a card that grants itself flying when ≥4 permanents in GY)
    const gatedCard = card("GY Perm Test", "Descend 4 — As long as there are four or more permanent cards in your graveyard, this creature has flying.");
    const perm = { id: "gated-perm", card: gatedCard, counters: {}, tapped: false, controller: "user" };
    const stateWithPerm = {
      ...state,
      players: { ...state.players, user: { ...state.players.user, battlefield: [perm] } },
    };
    expect(permanentHasKeyword(stateWithPerm, "gated-perm", "Flying")).toBe(true);
  });

  it("permanent-cards gate closed when <4 permanent cards in GY", () => {
    const permCards = [
      { name: "Perm1", type: "Creature — Beast", oracle: "", mana: "{1}", cmc: 1 },
      { name: "Perm2", type: "Enchantment", oracle: "", mana: "{1}", cmc: 1 },
    ];
    const state = makeState(["p1"], permCards);
    const gatedCard = card("GY Perm Test", "Descend 4 — As long as there are four or more permanent cards in your graveyard, this creature has flying.");
    const perm = { id: "gated-perm", card: gatedCard, counters: {}, tapped: false, controller: "user" };
    const stateWithPerm = {
      ...state,
      players: { ...state.players, user: { ...state.players.user, battlefield: [perm] } },
    };
    expect(permanentHasKeyword(stateWithPerm, "gated-perm", "Flying")).toBe(false);
  });

  it("instantOrSorcery gate open when ≥2 instant/sorcery in GY", () => {
    const gyCards = [
      { name: "Bolt", type: "Instant", oracle: "", mana: "{R}", cmc: 1 },
      { name: "Growth", type: "Sorcery", oracle: "", mana: "{G}", cmc: 1 },
    ];
    const state = makeState(["p1"], gyCards);
    const gatedCard = card("IS Test", "As long as there are two or more instant and/or sorcery cards in your graveyard, this creature gets +1/+0 and has haste.");
    const perm = { id: "is-perm", card: gatedCard, counters: {}, tapped: false, controller: "user" };
    const stateWithPerm = {
      ...state,
      players: { ...state.players, user: { ...state.players.user, battlefield: [perm] } },
    };
    expect(permanentHasKeyword(stateWithPerm, "is-perm", "Haste")).toBe(true);
  });

  it("instantOrSorcery gate closed when only 1 instant in GY", () => {
    const gyCards = [{ name: "Bolt", type: "Instant", oracle: "", mana: "{R}", cmc: 1 }];
    const state = makeState(["p1"], gyCards);
    const gatedCard = card("IS Test", "As long as there are two or more instant and/or sorcery cards in your graveyard, this creature gets +1/+0 and has haste.");
    const perm = { id: "is-perm", card: gatedCard, counters: {}, tapped: false, controller: "user" };
    const stateWithPerm = {
      ...state,
      players: { ...state.players, user: { ...state.players.user, battlefield: [perm] } },
    };
    expect(permanentHasKeyword(stateWithPerm, "is-perm", "Haste")).toBe(false);
  });

  it("instantOrSorcery gate ignores non-instant/sorcery cards", () => {
    const gyCards = [
      { name: "Forest", type: "Land — Forest", oracle: "", mana: "", cmc: 0 },
      { name: "Bear", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2 },
    ];
    const state = makeState(["p1"], gyCards);
    const gatedCard = card("IS Test", "As long as there are two or more instant and/or sorcery cards in your graveyard, this creature gets +1/+0 and has haste.");
    const perm = { id: "is-perm", card: gatedCard, counters: {}, tapped: false, controller: "user" };
    const stateWithPerm = {
      ...state,
      players: { ...state.players, user: { ...state.players.user, battlefield: [perm] } },
    };
    expect(permanentHasKeyword(stateWithPerm, "is-perm", "Haste")).toBe(false);
  });
});
