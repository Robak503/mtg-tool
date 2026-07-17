/**
 * KW-RIOT (BLITZ RT-1, CR 702.136) — "Riot (This creature enters with your choice of a +1/+1 counter or
 * haste.)" is an ENTERS-WITH-CHOICE replacement (CR 702.136a: "You may have this permanent enter with an
 * additional +1/+1 counter on it. If you don't, it gains haste."). Modeled end to end:
 *
 *   - the DETERMINISTIC house auto-pick (resolvers.riotPicksHaste): HASTE when the permanent enters on its
 *     controller's own turn at/before declare-attackers (it could swing this turn), else the +1/+1 counter;
 *   - the COUNTER branch (resolvers.enterPermanent) adds N +1/+1 counters AS it enters (applyCounterDoubling,
 *     CR 616; N = riotKeywordCount for CR 702.136b multi-instance), so its P/T is right from turn 1;
 *   - the HASTE branch grants a layer-6 permanent-duration `addKeyword Haste` scoped to the permanent, so
 *     permanentHasKeyword("Haste") is true and every summoning-sick gate lets it act the turn it enters;
 *   - the coverage strip (classifyCard) removes the printed "Riot …" LINE so a carrier whose OTHER text is
 *     modeled flips native — GATED on riotKeywordCount>0 (structural) so a "…have riot" GRANT is never
 *     stripped/credited (Rhythm of the Wild / Spider-Punk's grant stay body-only — their grant is unmodeled).
 *
 * Card text is the bundled Scryfall oracle (probed), used as fixtures exactly like the sibling keyword tests.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { enterPermanent } from "./resolvers.js";
import { riotKeywordCount } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RIOT = "Riot (This creature enters with your choice of a +1/+1 counter or haste.)";
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];
// A fresh two-seat game; caller sets turn/phase/step/activePlayer for the auto-pick under test.
const gs = (over = {}) => ({ ...createGameState({ userDeck: [], aiDeck: [] }), turn: 3, ...over });
const riotCard = (name, oracle, p = 2, t = 2, extra = {}) =>
  ({ id: `c-${name}`, name, type: "Creature — Goblin Berserker", power: String(p), toughness: String(t), mana: "{R}{G}", oracle, keywords: ["Riot"], ...extra });

describe("KW-RIOT — riotKeywordCount (structural, grant-safe)", () => {
  it("counts a single printed instance", () => {
    expect(riotKeywordCount(riotCard("Zhur-Taa Goblin", RIOT))).toBe(1);
  });
  it("counts multiple printed instances separately (CR 702.136b)", () => {
    expect(riotKeywordCount(riotCard("Double", `Riot (reminder)\nRiot (reminder)`))).toBe(2);
  });
  it("does NOT count a GRANT form (…have riot) or a mid-sentence use", () => {
    expect(riotKeywordCount({ oracle: "Nontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)" })).toBe(0);
    expect(riotKeywordCount({ oracle: "Other Spiders you control have riot." })).toBe(0);
    expect(riotKeywordCount({ oracle: "If that mana is spent on a creature spell, it gains riot." })).toBe(0);
  });
  it("falls back to the keywords array when the oracle carries no line (test shape)", () => {
    expect(riotKeywordCount({ oracle: "", keywords: ["Riot"] })).toBe(1);
  });
});

describe("KW-RIOT — auto-pick policy (deterministic; both branches pinned)", () => {
  it("HASTE on the controller's own precombat main (it could swing this turn)", () => {
    const s = enterPermanent(gs({ activePlayer: "user", phase: "precombat-main", step: "main" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    const perm = enteredPerm(s);
    expect(permanentHasKeyword(s, perm.id, "Haste")).toBe(true);
    expect(perm.counters?.["+1/+1"] || 0).toBe(0);                       // haste chosen → no counter
    expect(permanentPower(s, perm.id)).toBe(2);                          // base P/T unchanged
  });
  it("HASTE during the beginning phase of its own turn (upkeep entry can still attack)", () => {
    const s = enterPermanent(gs({ activePlayer: "user", phase: "beginning", step: "upkeep" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    expect(permanentHasKeyword(s, enteredPerm(s).id, "Haste")).toBe(true);
  });
  it("COUNTER on the controller's POSTcombat main (haste can no longer buy a swing)", () => {
    const s = enterPermanent(gs({ activePlayer: "user", phase: "postcombat-main", step: "main" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    const perm = enteredPerm(s);
    expect(permanentHasKeyword(s, perm.id, "Haste")).toBe(false);
    expect(perm.counters["+1/+1"]).toBe(1);                             // counter chosen
    expect(permanentPower(s, perm.id)).toBe(3);                          // 2/2 → 3/3
    expect(permanentToughness(s, perm.id)).toBe(3);
  });
  it("COUNTER when it enters on an OPPONENT's turn (can't attack this turn)", () => {
    const s = enterPermanent(gs({ activePlayer: "ai", phase: "precombat-main", step: "main" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    const perm = enteredPerm(s);
    expect(permanentHasKeyword(s, perm.id, "Haste")).toBe(false);
    expect(perm.counters["+1/+1"]).toBe(1);
  });
  it("COUNTER once combat's declare-attackers step has passed", () => {
    const s = enterPermanent(gs({ activePlayer: "user", phase: "combat", step: "declare-blockers" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    expect(permanentHasKeyword(s, enteredPerm(s).id, "Haste")).toBe(false);
  });
  it("multiple riot instances add N counters on the counter branch (CR 702.136b)", () => {
    const s = enterPermanent(gs({ activePlayer: "user", phase: "postcombat-main", step: "main" }), riotCard("Double", `Riot (reminder)\nRiot (reminder)`), "user");
    expect(enteredPerm(s).counters["+1/+1"]).toBe(2);
  });
});

describe("KW-RIOT — the HASTE grant enables attacking through the real declare gate", () => {
  it("a summoning-sick riot creature that chose haste is offered as a declare-attacker", () => {
    // Enter it on its own precombat main (haste chosen), then advance to the declare-attackers step
    // WITHOUT untapping — it is still summoning-sick (enteredOnTurn === turn), so only the haste grant
    // can let it attack. Drive the REAL legalActionsForPlayer enumeration.
    let s = enterPermanent(gs({ activePlayer: "user", phase: "precombat-main", step: "main" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    const perm = enteredPerm(s);
    expect(perm.summoningSick).toBe(true);                               // it did enter this turn
    s = { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user" };
    const attacks = filterActions(legalActionsForPlayer(s, "user"), "declare-attacker");
    expect(attacks.some((a) => a.permanentId === perm.id)).toBe(true);
  });
  it("without haste (counter branch) a summoning-sick riot creature is NOT offered as an attacker", () => {
    let s = enterPermanent(gs({ activePlayer: "user", phase: "postcombat-main", step: "main" }), riotCard("Zhur-Taa Goblin", RIOT), "user");
    const perm = enteredPerm(s);
    s = { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user" };
    const attacks = filterActions(legalActionsForPlayer(s, "user"), "declare-attacker");
    expect(attacks.some((a) => a.permanentId === perm.id)).toBe(false);  // summoning-sick, no haste
  });
});

describe("KW-RIOT — coverage: carriers whose OTHER text is modeled flip native", () => {
  it("a vanilla riot creature → native-body", () => {
    expect(classifyCard({ type: "Creature — Goblin Berserker", name: "Zhur-Taa Goblin", mana: "{R}{G}", oracle: RIOT, keywords: ["Riot"] })).toBe("native-body");
  });
  it("riot + Menace → native-body (Ghor-Clan Wrecker)", () => {
    expect(classifyCard({ type: "Creature — Human Warrior", name: "Ghor-Clan Wrecker", mana: "{2}{R}{G}",
      oracle: `${RIOT}\nMenace (This creature can't be blocked except by two or more creatures.)`, keywords: ["Riot", "Menace"] })).toBe("native-body");
  });
  it("riot + Trample → native-body (Wrecking Beast)", () => {
    expect(classifyCard({ type: "Creature — Beast", name: "Wrecking Beast", mana: "{6}{G}{G}", oracle: `${RIOT}\nTrample`, keywords: ["Trample", "Riot"] })).toBe("native-body");
  });
  it("riot + Trample + a self-pump activated ability → native-activated (Frenzied Arynx)", () => {
    expect(classifyCard({ type: "Creature — Cat Beast", name: "Frenzied Arynx", mana: "{4}{R}{G}",
      oracle: `${RIOT}\nTrample\n{4}{R}{G}: This creature gets +3/+0 until end of turn.`, keywords: ["Trample", "Riot"] })).toBe("native-activated");
  });
  it("riot + a modeled attacks trigger → native-trigger (Burning-Tree Vandal)", () => {
    expect(classifyCard({ type: "Creature — Human Rogue", name: "Burning-Tree Vandal", mana: "{1}{R}",
      oracle: `${RIOT}\nWhenever this creature attacks, you may discard a card. If you do, draw a card.`, keywords: ["Riot"] })).toBe("native-trigger");
  });
});

describe("KW-RIOT — coverage: whole-card gating parks carriers with unmodeled residue", () => {
  it("riot + an unmodeled player-and-self hexproof static stays body-only (Gruul Spellbreaker)", () => {
    expect(classifyCard({ type: "Creature — Ogre Warrior", name: "Gruul Spellbreaker", mana: "{R}{G}",
      oracle: `${RIOT}\nTrample\nDuring your turn, you and this creature have hexproof.`, keywords: ["Trample", "Riot"] })).toBe("body-only");
  });
  it("printed riot + a GRANT + rules-modifiers stays body-only (Spider-Punk)", () => {
    expect(classifyCard({ type: "Legendary Creature — Spider Human Hero", name: "Spider-Punk", mana: "{1}{R}{G}",
      oracle: `${RIOT}\nOther Spiders you control have riot.\nSpells and abilities can't be countered.\nDamage can't be prevented.`, keywords: ["Riot"] })).toBe("body-only");
  });
  it("a GRANT-only enchantment (…have riot) is NEVER credited/stripped — stays body-only (Rhythm of the Wild)", () => {
    expect(classifyCard({ type: "Enchantment", name: "Rhythm of the Wild", mana: "{1}{R}{G}",
      oracle: `Creature spells you control can't be countered.\nNontoken creatures you control have riot. (They enter with your choice of a +1/+1 counter or haste.)` })).toBe("body-only");
  });
});
