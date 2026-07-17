/**
 * FILTERED REANIMATE-MV — NON-CREATURE TYPES (BLITZ GY-2, CR 608) — "Return target <X> card with mana value N
 * or less from your graveyard to the battlefield" where <X> is a NON-creature permanent filter (Sun Titan,
 * Shepherd of the Cosmos — "permanent"; the artifact / union variants). The reanimate (to-battlefield) analog
 * of GY-1's return-to-hand MV filter: PW-1 modeled CREATURE-only ({cardType:"creature", mvMax}); GY-2
 * generalizes <X> through the SAME parseGraveyardFilter GY-1 uses → {typeFilter, mvMax}, riding the ONE
 * cardMatchesGraveyardFilter chokepoint (cast / activate / trigger-flush chooser can't drift), PERMANENT-
 * COMPATIBLE only (a card entering the battlefield must be a permanent — CR 110.4a). CREED: false-negative
 * safe, false-positive forbidden — an instant/sorcery/bare-"any" filter (non-permanent), a subtype / color /
 * negation / intersection ("Rebel permanent", "nonland permanent", "creature or Spacecraft"), a dynamic
 * ("lesser mana value") cap, or any rider ("tapped", "with a finality counter") keeps the WHOLE clause LOW →
 * Arbiter. Mirrors gyReturnHandFiltered.test.js house style.
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

describe("parser — reanimate MV/type filter: non-creature types HIGH; creature unchanged; non-permanent/subtype/rider → Arbiter", () => {
  const atoms = (oracle) => parseEffectProgram({ type: SORCERY, oracle }).atoms;
  const conf = (oracle) => programConfidence(parseEffectProgram({ type: SORCERY, oracle }));

  it("a NON-creature permanent type + MV → a STRUCTURED {typeFilter, mvMax} reanimate", () => {
    expect(atoms("Return target permanent card with mana value 2 or less from your graveyard to the battlefield."))
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter: "permanent", mvMax: 2 } }]);
    expect(atoms("Return target artifact card with mana value 3 or less from your graveyard to the battlefield."))
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter: "artifact", mvMax: 3 } }]);
    // " or "-union of permanent-compatible types (Recommission-class filter, sans its riders)
    expect(atoms("Return target artifact or creature card with mana value 3 or less from your graveyard to the battlefield."))
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter: "artifact|creature", mvMax: 3 } }]);
  });

  it("CREATURE keeps the PW-1 {cardType:'creature', mvMax} shape (byte-identical, LOST=0)", () => {
    expect(atoms("Return target creature card with mana value 2 or less from your graveyard to the battlefield."))
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { cardType: "creature", mvMax: 2 } }]);
  });

  it("'to your hand' with an MV cap is the GY-1 return-to-hand atom, NOT reanimate (unchanged)", () => {
    expect(atoms("Return target permanent card with mana value 3 or less from your graveyard to your hand."))
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { typeFilter: "permanent", mvMax: 3 } }]);
  });

  it("CREED — a non-permanent / subtype / negation / dynamic / rider filter keeps the WHOLE clause LOW (Arbiter)", () => {
    // NON-PERMANENT — an instant/sorcery card can't be put onto the battlefield (CR 110.4a); a bare "card" (→ "any") too
    expect(conf("Return target instant card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low");
    expect(conf("Return target sorcery card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low");
    expect(conf("Return target card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low");
    // SUBTYPE / NEGATION / un-modeled union
    expect(conf("Return target Rebel permanent card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low");    // subtype+type (Ramosian Revivalist)
    expect(conf("Return target nonland permanent card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low"); // negation (Sun-Blessed Healer)
    expect(conf("Return target creature or Spacecraft card with mana value 2 or less from your graveyard to the battlefield.")).toBe("low"); // unmodeled union member
    // DYNAMIC cap / RIDER
    expect(conf("Return target creature card with lesser mana value from your graveyard to the battlefield.")).toBe("low");             // dynamic cap (Orah/Havi/Riveteers)
    expect(conf("Return target permanent card with mana value 3 or less from your graveyard to the battlefield tapped.")).toBe("low");   // "tapped" rider (Annie Flash)
    expect(conf("Return target creature card with mana value 3 or less from your graveyard to the battlefield with a finality counter on it.")).toBe("low"); // rider (Battle of Hoover Dam)
  });
});

describe("coverage — the whole-card permanent-reanimate carriers flip native; every rider parks (CREED)", () => {
  it("Sun Titan + Shepherd of the Cosmos flip native-trigger (permanent-MV reanimate through the shared chokepoint)", () => {
    // Sun Titan — Vigilance + "enters or attacks" optional permanent-MV reanimate; the ONLY gap was the 'permanent' filter
    expect(classifyCard({ type: "Creature — Giant", name: "Sun Titan",
      oracle: "Vigilance\nWhenever this creature enters or attacks, you may return target permanent card with mana value 3 or less from your graveyard to the battlefield." })).toBe("native-trigger");
    // Shepherd of the Cosmos — Flying + ETB permanent-MV reanimate + Foretell (keyword reminder)
    expect(classifyCard({ type: "Creature — Angel Warrior", name: "Shepherd of the Cosmos",
      oracle: "Flying\nWhen this creature enters, return target permanent card with mana value 2 or less from your graveyard to the battlefield.\nForetell {3}{W} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" })).toBe("native-trigger");
  });

  it("CREED — an unmodeled surround (Encore / conditional anthem / grant+sac / subtype filter / intervening-if) stays NON-native", () => {
    // Angel of Indemnity — permanent-MV reanimate BUT an unmodeled Encore keyword
    expect(classifyCard({ type: "Creature — Angel Warrior", name: "Angel of Indemnity",
      oracle: "Flying, lifelink\nWhen this creature enters, return target permanent card with mana value 4 or less from your graveyard to the battlefield.\nEncore {6}{W}{W} ({6}{W}{W}, Exile this card from your graveyard: For each opponent, create a token copy that attacks that opponent this turn if able. They gain haste. Sacrifice them at the beginning of the next end step. Activate only as a sorcery.)" })).not.toMatch(/^native-|^land$/);
    // Hero of the Dunes — artifact-or-creature reanimate BUT an unmodeled MV-conditional anthem
    expect(classifyCard({ type: "Creature — Human Soldier", name: "Hero of the Dunes",
      oracle: "When this creature enters, return target artifact or creature card with mana value 3 or less from your graveyard to the battlefield.\nCreatures you control with mana value 3 or less get +1/+0." })).not.toMatch(/^native-|^land$/);
    // Kami of Industry — artifact reanimate BUT a "gains haste / sacrifice it" rider
    expect(classifyCard({ type: "Creature — Spirit", name: "Kami of Industry",
      oracle: "When this creature enters, return target artifact card with mana value 3 or less from your graveyard to the battlefield. It gains haste. Sacrifice it at the beginning of the next end step." })).not.toMatch(/^native-|^land$/);
    // Ramosian Revivalist — "Rebel permanent" subtype filter → parseGraveyardFilter null → parks (FN-safe)
    expect(classifyCard({ type: "Creature — Human Rebel", name: "Ramosian Revivalist",
      oracle: "{7}, {T}: Return target Rebel permanent card with mana value 5 or less from your graveyard to the battlefield." })).not.toMatch(/^native-|^land$/);
    // Renegade Rallier — permanent reanimate BUT a Revolt intervening-if
    expect(classifyCard({ type: "Creature — Human Warrior", name: "Renegade Rallier",
      oracle: "Revolt — When this creature enters, if a permanent left the battlefield under your control this turn, return target permanent card with mana value 2 or less from your graveyard to the battlefield." })).not.toMatch(/^native-|^land$/);
  });
});

describe("enumeration — permanent/artifact MV filtered, own-graveyard only, tokens & non-permanents excluded", () => {
  const gy = () => [
    gyCard("p2", "Bear2", "Creature — Bear", 2),
    gyCard("p3", "Bear3", "Creature — Bear", 3),
    gyCard("a1", "Sol Ring", "Artifact", 1),
    gyCard("a3", "Big Artifact", "Artifact", 3),
    gyCard("e2", "Aura", "Enchantment", 2),
    gyCard("l0", "Forest", "Land", 0),
    gyCard("i1", "Lightning Bolt", "Instant", 1),     // a non-permanent card — never reanimatable
    { id: "tok", name: "Token", type: "Creature — Bear", cmc: 1, token: true },
  ];
  const enu = (s, cardFilter) => enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter }).map((t) => t.id).sort();

  it("permanent MV<=2 offers every in-cap permanent card; the instant, the over-MV cards, the token, and the opponent's are excluded", () => {
    const s = boardState({ userGy: gy(), aiGy: [gyCard("ap2", "Enemy Bear", "Creature — Bear", 2)] });
    // p2 (creature 2), a1 (artifact 1), e2 (enchantment 2), l0 (land 0) — permanents MV<=2; i1 is an instant (not a permanent); p3/a3 over-MV; tok not a card; ap2 opponent
    expect(enu(s, { typeFilter: "permanent", mvMax: 2 })).toEqual(["a1", "e2", "l0", "p2"].sort());
  });

  it("artifact MV<=1 offers only the low-MV artifact; the creature cardType path (PW-1) is unchanged", () => {
    const s = boardState({ userGy: gy() });
    expect(enu(s, { typeFilter: "artifact", mvMax: 1 })).toEqual(["a1"]);                 // a3 over-MV
    expect(enu(s, { cardType: "creature", mvMax: 2 })).toEqual(["p2"]);                    // p3 over-MV; PW-1 shape still works
    expect(enu(s, { typeFilter: "artifact|creature", mvMax: 3 })).toEqual(["a1", "a3", "p2", "p3"].sort()); // union, in-cap only
  });
});

describe("resolution — the chosen filtered permanent moves graveyard -> battlefield", () => {
  const REVIVE = { id: "c-rev", name: "Filtered Revival", type: SORCERY, mana: "{W}",
    oracle: "Return target permanent card with mana value 2 or less from your graveyard to the battlefield." };

  it("reanimates the in-cap permanent; the over-MV permanent is never a legal target and stays in the graveyard", () => {
    let s = boardState({
      userGy: [gyCard("a1", "Sol Ring", "Artifact", 1), gyCard("a3", "Big Artifact", "Artifact", 3)],
      hand: [REVIVE],
    });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-rev");
    // only the MV<=2 permanent is offered as a target (CR 601.2c)
    expect(casts.flatMap((a) => (a.targets || []).map((t) => t.id))).toEqual(["a1"]);
    s = resolveTopOfStack(dispatchAction(s, casts[0]));
    expect(s.players.user.battlefield.some((p) => p.card?.id === "a1")).toBe(true);        // entered the battlefield
    expect(s.players.user.graveyard.some((c) => c.id === "a3")).toBe(true);                // the over-MV card stays
    expect(s.players.user.graveyard.some((c) => c.id === "a1")).toBe(false);               // left the graveyard
  });

  it("no legal cast when the graveyard holds no in-range permanent card (FN guard, CR 601.2c)", () => {
    // a3 is over-MV; i1 is an instant (not a permanent — can't be reanimated) → uncastable
    const s = boardState({ userGy: [gyCard("a3", "Big Artifact", "Artifact", 3), gyCard("i1", "Lightning Bolt", "Instant", 1)], hand: [REVIVE] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-rev");
    expect(casts).toHaveLength(0);
  });
});
