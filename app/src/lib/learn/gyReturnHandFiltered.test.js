/**
 * FILTERED GRAVEYARD RETURN-TO-HAND (BLITZ GY-1, CR 608) — "Return target <X> card with mana value N or
 * less from your graveyard to your hand". The return-to-hand analog of PW-1's reanimate-MV: the OWN-graveyard
 * return-from-graveyard atom NARROWED by a structured cardFilter {typeFilter, mvMax} (basic type / union /
 * "permanent" / bare "card"→"any") — or the SS-1 {subtype, mvMax} for soulshift's "spirit". BOTH share the ONE
 * cardMatchesGraveyardFilter chokepoint (cast / activate / trigger-flush chooser can't drift), so a wrong-MV /
 * wrong-type card is NEVER offered. CREED: false-negative safe, false-positive forbidden — a subtype / color /
 * negation / intersection filter, a dynamic ("lesser mana value") cap, another zone/destination, or any rider
 * keeps the WHOLE clause LOW → Arbiter. Mirrors gyRecursion.test.js house style.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const gyCard = (id, name, type, cmc) => ({ id, name, type, cmc, oracle: "" });

function boardState({ userGy = [], aiGy = [], hand = [], pool = { C: 6, W: 2, B: 1 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, graveyard: aiGy },
    },
  };
}

describe("parser — return-to-hand MV/type filter is HIGH; subtype/negation/dynamic/zone route to Arbiter", () => {
  const atoms = (oracle) => parseEffectProgram({ type: SORCERY, oracle }).atoms;
  const conf = (oracle) => programConfidence(parseEffectProgram({ type: SORCERY, oracle }));

  it("cardType + MV → a STRUCTURED {typeFilter, mvMax} filter, parsed HIGH", () => {
    expect(atoms("Return target creature card with mana value 2 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter: "creature", mvMax: 2 } }]);
    expect(atoms("Return target artifact card with mana value 1 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter: "artifact", mvMax: 1 } }]);
    expect(atoms("Return target permanent card with mana value 3 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter: "permanent", mvMax: 3 } }]);
    // bare "card" (no type word) → a pure MV filter (typeFilter "any")
    expect(atoms("Return target card with mana value 2 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter: "any", mvMax: 2 } }]);
  });

  it("SS-1 soulshift subtype+MV is untouched — 'spirit' still routes to the {subtype, mvMax} branch", () => {
    expect(atoms("Return target Spirit card with mana value 4 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { subtype: "spirit", mvMax: 4 } }]);
  });

  it("CREED — an unmodeled filter / dynamic cap / other zone keeps the WHOLE clause LOW (Arbiter)", () => {
    expect(conf("Return target Goblin card with mana value 2 or less from your graveyard to your hand.")).toBe("low");           // creature SUBTYPE
    expect(conf("Return target green card with mana value 2 or less from your graveyard to your hand.")).toBe("low");           // color
    expect(conf("Return target nonland permanent card with mana value 2 or less from your graveyard to your hand.")).toBe("low"); // negation
    expect(conf("Return target artifact creature card with mana value 2 or less from your graveyard to your hand.")).toBe("low"); // intersection
    expect(conf("Return target creature or Vehicle card with mana value 2 or less from your graveyard to your hand.")).toBe("low"); // subtype union
    expect(conf("Return target creature card with lesser mana value from your graveyard to your hand.")).toBe("low");           // dynamic cap
    expect(conf("Return up to two target Spirit cards with mana value 4 or less from your graveyard to your hand.")).toBe("low"); // multi-count MV+subtype (unmodeled shape)
  });

  it("'to the battlefield' with an MV cap is the PW-1 reanimate atom, NOT return-to-hand (unchanged)", () => {
    expect(atoms("Return target creature card with mana value 2 or less from your graveyard to the battlefield."))
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax: 2 } }]);
  });
});

describe("coverage — the whole-card flips classify native; every rider parks (CREED)", () => {
  it("clean ETB / activated / modal carriers flip native", () => {
    // Pillardrop Rescuer — Flying + a plain creature-MV ETB return
    expect(classifyCard({ type: "Creature — Spirit Cleric", name: "Pillardrop Rescuer",
      oracle: "Flying\nWhen this creature enters, return target creature card with mana value 3 or less from your graveyard to your hand." })).toBe("native-trigger");
    // Leonin Squire — artifact-MV ETB return
    expect(classifyCard({ type: "Creature — Cat Soldier", name: "Leonin Squire",
      oracle: "When this creature enters, return target artifact card with mana value 1 or less from your graveyard to your hand." })).toBe("native-trigger");
    // Disciple of the Sun — Lifelink + permanent-MV ETB return (the typeFilter:"permanent" path)
    expect(classifyCard({ type: "Creature — Human Cleric", name: "Disciple of the Sun",
      oracle: "Lifelink\nWhen this creature enters, return target permanent card with mana value 3 or less from your graveyard to your hand." })).toBe("native-trigger");
    // Auriok Salvagers — the artifact-MV return as an ACTIVATED ability
    expect(classifyCard({ type: "Creature — Human Soldier", name: "Auriok Salvagers",
      oracle: "{1}{W}: Return target artifact card with mana value 1 or less from your graveyard to your hand." })).toBe("native-activated");
  });

  it("CREED — a to-the-battlefield redirect / intervening-if / subtype-union rider stays NON-native", () => {
    // Doctor Jane Foster — "return that card to the battlefield instead" redirect rider
    expect(classifyCard({ type: "Legendary Creature — Human Doctor", name: "Doctor Jane Foster",
      oracle: "Vigilance\nWhen Doctor Jane Foster enters, return target creature card with mana value 3 or less from your graveyard to your hand. If you gained life this turn, return that card to the battlefield instead." })).not.toMatch(/^native-|^land$/);
    // Shepherd of the Clouds — a "Return that card to the battlefield instead if you control a Mount" rider
    expect(classifyCard({ type: "Creature — Pegasus", name: "Shepherd of the Clouds",
      oracle: "Flying, vigilance\nWhen this creature enters, return target permanent card with mana value 3 or less from your graveyard to your hand. Return that card to the battlefield instead if you control a Mount." })).not.toMatch(/^native-|^land$/);
    // Wayspeaker Bodyguard — a "nonland permanent" negation filter
    expect(classifyCard({ type: "Creature — Orc Monk", name: "Wayspeaker Bodyguard",
      oracle: "When this creature enters, return target nonland permanent card with mana value 2 or less from your graveyard to your hand.\nFlurry — Whenever you cast your second spell each turn, tap target creature an opponent controls." })).not.toMatch(/^native-|^land$/);
    // Imperial Recovery Unit — a "creature or Vehicle" (subtype) union filter
    expect(classifyCard({ type: "Artifact — Vehicle", name: "Imperial Recovery Unit",
      oracle: "Whenever this Vehicle attacks, return target creature or Vehicle card with mana value 2 or less from your graveyard to your hand.\nCrew 2" })).not.toMatch(/^native-|^land$/);
  });
});

describe("enumeration — MV + type filtered, own-graveyard only, tokens excluded", () => {
  const gy = () => [
    gyCard("c2", "Bear2", "Creature — Bear", 2),
    gyCard("c3", "Bear3", "Creature — Bear", 3),
    gyCard("a1", "Sol Ring", "Artifact", 1),
    gyCard("a3", "Big Artifact", "Artifact", 3),
    gyCard("l0", "Forest", "Land", 0),
    gyCard("e2", "Aura", "Enchantment", 2),
    { id: "tok", name: "Token", type: "Creature — Bear", cmc: 1, token: true },
  ];
  const enu = (s, cardFilter) => enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter }).map((t) => t.id).sort();

  it("creature MV<=2 offers ONLY the matching own creature card (over-MV, wrong-type, token, opponent all excluded)", () => {
    const s = boardState({ userGy: gy(), aiGy: [gyCard("ac2", "Enemy Bear", "Creature — Bear", 2)] });
    expect(enu(s, { typeFilter: "creature", mvMax: 2 })).toEqual(["c2"]); // c3 over-MV, a*/l0/e2 wrong-type, tok not a card, ac2 opponent
  });

  it("artifact MV<=1 offers only the low-MV artifact; permanent MV<=3 offers every permanent-type card in range", () => {
    const s = boardState({ userGy: gy() });
    expect(enu(s, { typeFilter: "artifact", mvMax: 1 })).toEqual(["a1"]);                       // a3 over-MV
    expect(enu(s, { typeFilter: "permanent", mvMax: 3 })).toEqual(["a1", "a3", "c2", "c3", "e2", "l0"].sort()); // token excluded
    expect(enu(s, { typeFilter: "any", mvMax: 1 })).toEqual(["a1", "l0"].sort());                // pure MV filter — every card MV<=1
  });

  it("the SS-1 subtype filter and the bare string-token path are unchanged", () => {
    const s = boardState({ userGy: [gyCard("sp2", "Kami", "Creature — Spirit", 2), gyCard("c2", "Bear", "Creature — Bear", 2)] });
    expect(enu(s, { subtype: "spirit", mvMax: 4 })).toEqual(["sp2"]);   // only the Spirit
    expect(enu(s, "creature")).toEqual(["c2", "sp2"].sort());            // string token: MV-agnostic, both creatures
  });
});

describe("resolution — the chosen filtered card moves graveyard -> hand", () => {
  const RECRUITER = { id: "c-rec", name: "Filtered Recruiter", type: SORCERY, mana: "{W}",
    oracle: "Return target creature card with mana value 2 or less from your graveyard to your hand." };

  it("returns the in-range creature; the over-MV creature is never a legal target and stays in the graveyard", () => {
    let s = boardState({
      userGy: [gyCard("c2", "Grizzly Bears", "Creature — Bear", 2), gyCard("c3", "Big Bear", "Creature — Bear", 3)],
      hand: [RECRUITER],
    });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-rec");
    // only the MV<=2 creature is offered as a target (CR 601.2c)
    expect(casts.flatMap((a) => (a.targets || []).map((t) => t.id))).toEqual(["c2"]);
    s = resolveTopOfStack(dispatchAction(s, casts[0]));
    expect(s.players.user.hand.some((c) => c.id === "c2")).toBe(true);              // returned to hand
    expect(s.players.user.graveyard.some((c) => c.id === "c3")).toBe(true);         // the over-MV card stays
    expect(s.players.user.graveyard.some((c) => c.id === "c2")).toBe(false);        // left the graveyard
  });

  it("no legal cast when the graveyard holds no in-range card of the filtered type (FN guard, CR 601.2c)", () => {
    const s = boardState({ userGy: [gyCard("c3", "Big Bear", "Creature — Bear", 3), gyCard("a1", "Sol Ring", "Artifact", 1)], hand: [RECRUITER] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-rec");
    expect(casts).toHaveLength(0); // c3 is over-MV; a1 is the wrong type — uncastable
  });
});
