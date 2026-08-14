/**
 * powerUpCluster.test.js — THE POWER-UP CLUSTER (2026-08-14): Hulk Gamma Goliath, She-Hulk Jade
 * Defender, Abomination Terrifying Titan (+ 14 more riders, flip-diff +17/0/0, every oracle audited).
 *
 * ⭐ THE LATCH ALREADY SHIPPED (activationLimitScope:"game" — exhaustKeyword.test.js pins offered-once/
 * never-re-armed end-to-end; power-up rides the same ledger). THIS slice built the pieces that kept the
 * bodies LOW:
 *   · "up to one target" on the singular destroy/exile arm (minTargets:0/maxTargets:1 — the subset path).
 *   · SELF-NAME + sentence-leading He/She normalization on activated effectClauses (selfNormalizeOracle,
 *     the static path's own grammar) — "Put a +1/+1 counter on She-Hulk", "He fights …", "Regenerate Eron".
 *   · the sourceAnchored fight exception: "THIS CREATURE fights" can only bind the source (CR 109.5), so
 *     the compound-program gate admits it; the anaphoric "It fights" spell form stays refused.
 *   · the POWER-UP-ONLY cost reducer (Gamma Goliath's static): powerUpOnly + excludeSelf on the
 *     Training-Grounds marker family, gated on the ability's `powerUp` stamp at the offer site.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the powerUpOnly reducer arm dropped → Goliath parks (the static line becomes residue).
 *   · excludeSelf dropped from the offer gate → Goliath's OWN power-up discounts (the "other" violation).
 *   · the sourceAnchored exception dropped → Abomination parks (the fight compound refuses again).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14 — full texts).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GOLIATH = { id: "c-gol", name: "Hulk, Gamma Goliath", type: "Legendary Creature — Gamma Berserker Hero", mana: "{4}{R}{G}",
  keywords: [], power: "7", toughness: "6",
  oracle: "Reach, trample\nPower-up abilities of other creatures you control cost {3} less to activate.\nPower-up — {6}{R}{G}: Put five +1/+1 counters on Hulk. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" };
const SHE_HULK = { id: "c-she", name: "She-Hulk, Jade Defender", type: "Legendary Creature — Gamma Hero", mana: "{2}{G}{G}",
  keywords: [], power: "4", toughness: "4",
  oracle: "Reach, trample\nPower-up — {4}{G}{G}: Destroy up to one target artifact or enchantment. Put a +1/+1 counter on She-Hulk. (Activate each power-up ability only once. Reduce the cost by her mana cost if she entered this turn.)" };
const ABOMINATION = { id: "c-abo", name: "Abomination, Terrifying Titan", type: "Legendary Creature — Gamma Villain", mana: "{3}{R}{G}",
  keywords: [], power: "6", toughness: "5",
  oracle: "Trample\nPower-up — {5}{R/G}{R/G}: Put a +1/+1 counter on Abomination. He fights up to one target creature an opponent controls. (Activate each power-up ability only once. Reduce the cost by his mana cost if he entered this turn.)" };

describe("the cluster flips, the bodies normalize", () => {
  it("⭐ all three carriers flip; the abilities carry the game-scoped limit + the powerUp stamp", () => {
    expect(classifyCard(GOLIATH)).toBe("native-mixed");
    expect(classifyCard(SHE_HULK)).toBe("native-activated");
    expect(classifyCard(ABOMINATION)).toBe("native-activated");
    const ab = parseActivatedAbilities(SHE_HULK)[0];
    expect(ab).toMatchObject({ activationLimit: 1, activationLimitScope: "game", powerUp: true });
    expect(ab.effectClause).toBe("Destroy up to one target artifact or enchantment. Put a +1/+1 counter on this creature.");
  });

  it("⭐ Abomination's compound: the fight is sourceAnchored, riding beside the self counter", () => {
    const ab = parseActivatedAbilities(ABOMINATION)[0];
    const p = parseEffectClause(ab.effectClause, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["add-counter", "fight"]);
    expect(p.atoms[1]).toMatchObject({ sourceAnchored: true, optionalTarget: true });
  });

  it("⛔ CREED: a bare ANAPHORIC 'it fights' compound stays refused (the gate's remaining load)", () => {
    // NB Epic Confrontation's pump+fight itself parses HIGH — as the dedicated fight-pair atom (the
    // pumped-fighter spell form, fightPair.test.js), which binds both roles explicitly. The misplaced-
    // fight gate's remaining load is the compound the pair arm does NOT catch: an "it" whose referent
    // the sequential interpreter cannot bind. That must stay LOW — never a source-bound guess.
    const p = parseEffectClause("draw a card. it fights target creature you don't control", "Sorcery");
    expect(p.confidence).toBe("low");
  });
});

describe("⭐⭐ LAW 6 — the Goliath discount: OTHER power-ups only, floored, never his own", () => {
  function board({ pool = { W: 0, U: 0, B: 0, R: 3, G: 3, C: 6 } } = {}) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const gol = createPermanent({ id: "gol", card: GOLIATH, controller: "user", summoningSick: false });
    const she = createPermanent({ id: "she", card: SHE_HULK, controller: "user", summoningSick: false });
    return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...g.players, user: { ...g.players.user, battlefield: [gol, she], manaPool: pool } } };
  }
  const offer = (s, pid) => (legalActionsForPlayer(s, "user") || []).find((a) => a.kind === "activate-ability" && a.permanentId === pid);

  it("⭐⭐ She-Hulk's {4}{G}{G} is offered as {1}{G}{G} beside Goliath; Goliath's own {6}{R}{G} is NOT discounted", () => {
    const s = board();
    const she = offer(s, "she");
    const gol = offer(s, "gol");
    const row = { sheGeneric: she?.cost?.generic, golGeneric: gol?.cost?.generic };
    console.log("  WITNESS powerUpDiscount", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sheGeneric: 1, golGeneric: 6 }); // {3} shaved off the OTHER creature only
  });

  it("an affordability proof: {1}{G}{G} is offered on a pool the PRINTED cost could not pay", () => {
    // 1 generic + GG = 3 mana total. The printed {4}{G}{G} needs 6. Pool: exactly {C}{G}{G} → only the
    // discounted cost is payable, and the offer EXISTS — the discount is real at the gate, not cosmetic.
    const s = board({ pool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 1 } });
    expect(offer(s, "she")).toBeTruthy();
    expect(offer(s, "gol")).toBeFalsy(); // {6}{R}{G} unpayable on 3 mana — no phantom offer
  });
});
