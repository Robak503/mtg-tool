/**
 * attackingCreatureCostReduction.test.js — "This spell costs {1} less to cast for each attacking creature." (Ancient Stone Idol,
 * Static Snare) and "… for each attacking creature you control." (Embercleave) — the 09-06 plan's stage ③, census row ㉒,
 * 2026-09-30.
 *
 * The per-each self cost reduction (Karador's frame) had no attacking-creature count, so the sentence parked all three. It is
 * read in the per-each arm itself, not in parseSelfCountSource, which the P/T lane shares; countForSpec "attackingCreatures"
 * counts the combat's live attackers (a dead or removed-from-combat attacker is no longer attacking, CR 506.4), and
 * `youControl` keeps the caster's own. legalChoices prices the cast off it when the action is offered.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each cast offered by legalActionsForPlayer and paid for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { selfCostReductionMetric } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const IDOL = { id: "c-idol", name: "Ancient Stone Idol", type: "Artifact Creature — Golem", mana: "{10}", cmc: 10, power: "12", toughness: "12",
  keywords: ["Trample", "Flash"],
  oracle: "Flash\nThis spell costs {1} less to cast for each attacking creature.\nTrample\nWhen this creature dies, create a 6/12 colorless Construct artifact creature token with trample." };
const SNARE = { id: "c-snare", name: "Static Snare", type: "Enchantment", mana: "{4}{W}", cmc: 5, keywords: ["Flash"],
  oracle: "Flash\nThis spell costs {1} less to cast for each attacking creature.\nWhen this enchantment enters, exile target artifact or creature an opponent controls until this enchantment leaves the battlefield." };
const EMBERCLEAVE = { id: "c-ember", name: "Embercleave", type: "Legendary Artifact — Equipment", mana: "{4}{R}{R}", cmc: 6, keywords: ["Equip", "Flash"],
  oracle: "Flash\nThis spell costs {1} less to cast for each attacking creature you control.\nWhen Embercleave enters, attach it to target creature you control.\nEquipped creature gets +1/+1 and has double strike and trample.\nEquip {3}" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
// `attacker` attacks the other seat with `n` Grizzly Bears (declared); `holder` has priority in the declare-blockers step with
// `pool` floating and `hand` in hand. `extra` adds combat entries for creatures that are not on the battlefield.
function combat({ attacker = "ai", n = 3, holder = "user", pool = {}, hand = [], removed = 0, extra = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const defender = attacker === "ai" ? "user" : "ai";
  const bears = Array.from({ length: n }, (_, i) => createPermanent({ id: `atk${i}`, card: { ...BEARS, id: `bear${i}` }, controller: attacker, summoningSick: false }))
    .map((p, i) => (i < removed ? { ...p, removedFromCombat: true } : p));
  const attackers = [...bears.map((b) => ({ permanentId: b.id, attackingPlayer: attacker, defender })),
    ...extra.map((id) => ({ permanentId: id, attackingPlayer: attacker, defender }))];
  return { ...s, turn: 4, phase: "combat", step: "declare-blockers", activePlayer: attacker, priorityHolder: holder, consecutivePasses: 0,
    stack: [], pendingTriggers: [], combat: { attackers, blockers: [] },
    players: { ...s.players,
      [attacker]: { ...s.players[attacker], battlefield: bears },
      [holder]: { ...s.players[holder], hand, manaPool: { ...EMPTY, ...pool }, ...(holder === attacker ? { battlefield: bears } : {}) } } };
}
const castOf = (s, name, pid = "user") => legalActionsForPlayer(s, pid).find((a) => a.kind === "cast-spell" && a.name === name);
function castAndResolve(s0, action) {
  let s = flushTriggers(resolveTopOfStack(dispatchAction(s0, action)), { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 6 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}

describe("parse + classification", () => {
  it("the per-each arm reads the attacking count (the caster's own for Embercleave); all three flip native", () => {
    expect(selfCostReductionMetric(IDOL)).toEqual({ kind: "perEachCount", per: 1, countSpec: { kind: "attackingCreatures" } });
    expect(selfCostReductionMetric(EMBERCLEAVE)).toEqual({ kind: "perEachCount", per: 1, countSpec: { kind: "attackingCreatures", youControl: true } });
    for (const card of [IDOL, SNARE, EMBERCLEAVE]) expect(classifyCard(card)).toMatch(/^native-/);
  });
});

describe("RUNTIME — the discount is the combat's attackers, paid for real", () => {
  it("VACUITY CONTROL — no combat: seven floating mana cannot cast a {10} Ancient Stone Idol", () => {
    const s0 = combat({ n: 0, pool: { C: 7 }, hand: [IDOL] });
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", combat: null };
    expect(castOf(s, "Ancient Stone Idol")).toBeUndefined();
  });

  it("⭐ the AI attacks with three: the Idol costs {7}, is paid with exactly seven, and lands", () => {
    const s0 = combat({ n: 3, pool: { C: 7 }, hand: [IDOL] });
    const cast = castOf(s0, "Ancient Stone Idol");
    expect(cast).toBeDefined();
    const s = castAndResolve(s0, cast);
    const out = { onBattlefield: s.players.user.battlefield.some((p) => p.card.name === "Ancient Stone Idol"), floatingLeft: s.players.user.manaPool.C };
    expect(out).toEqual({ onBattlefield: true, floatingLeft: 0 });
    console.log(`WITNESS idolWithThreeAttackers ${JSON.stringify(out)}`);
  });

  it("two attackers leave it at {8}: seven floating is not enough", () => {
    expect(castOf(combat({ n: 2, pool: { C: 7 }, hand: [IDOL] }), "Ancient Stone Idol")).toBeUndefined();
  });

  it("an attacker removed from combat, or one no longer on the battlefield, is not attacking (CR 506.4)", () => {
    expect(castOf(combat({ n: 3, removed: 1, pool: { C: 7 }, hand: [IDOL] }), "Ancient Stone Idol")).toBeUndefined();
    expect(castOf(combat({ n: 2, extra: ["gone"], pool: { C: 7 }, hand: [IDOL] }), "Ancient Stone Idol")).toBeUndefined();
  });

  it("⭐ Static Snare against four attackers costs {W}: cast for one white, it exiles an attacking Bear", () => {
    const s0 = combat({ n: 4, pool: { W: 1 }, hand: [SNARE] });
    const cast = castOf(s0, "Static Snare");
    expect(cast).toBeDefined();
    const s = castAndResolve(s0, cast);
    expect(s.players.user.battlefield.map((p) => p.card.name)).toContain("Static Snare");
    expect(s.players.ai.battlefield).toHaveLength(3);
    expect((s.players.ai.exile || []).map((c) => c.name)).toEqual(["Grizzly Bears"]);
  });

  it("⭐ Embercleave counts only the caster's attackers: {1}{R}{R} in the user's own attack, full price in the AI's", () => {
    const own = combat({ attacker: "user", holder: "user", n: 3, pool: { R: 2, C: 1 }, hand: [EMBERCLEAVE] });
    const cast = castOf(own, "Embercleave");
    expect(cast).toBeDefined();
    const s = castAndResolve(own, cast);
    expect(s.players.user.battlefield.map((p) => p.card.name)).toContain("Embercleave");
    expect(s.players.user.manaPool).toEqual(EMPTY);
    expect(castOf(combat({ attacker: "ai", holder: "user", n: 3, pool: { R: 2, C: 1 }, hand: [EMBERCLEAVE] }), "Embercleave")).toBeUndefined();
  });
});
