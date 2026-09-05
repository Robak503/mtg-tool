/**
 * MUTATIONAL ADVANTAGE — the counters-scoped PERMANENT grant, the group all-damage shield on "those permanents", proliferate.
 * SHELF-85 · Atraxa A3, 2026-09-05.
 * "Permanents you control with counters on them gain hexproof and indestructible until end of turn. Prevent all damage
 * that would be dealt to those permanents this turn. Proliferate."
 *
 * One composite matcher, three atoms. The grant is Baxter's counter-filtered group grant on the PERMANENT scope (Heroic
 * Intervention's scope with the "any counter" filter). The shield is the existing all-damage prevention shield with a
 * `group` selector: applyPreventNextDamage enumerates the counter-bearing permanents you control at resolution and writes
 * an entry per creature ("creature") and per non-creature planeswalker ("planeswalker") — the only permanents damage can
 * reach (CR 120.1); an artifact with a charge counter gets no vacuous entry. Proliferate is its own deterministic atom.
 *
 * Mutation-checked: see the run ledger (docs-sk98).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, consumePreventionShields, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MA = { id: "c-ma", name: "Mutational Advantage", type: "Instant", mana: "{1}{G}{U}", keywords: [],
  oracle: "Permanents you control with counters on them gain hexproof and indestructible until end of turn. Prevent all damage that would be dealt to those permanents this turn. Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)" };

describe("the parser", () => {
  it("the whole card reads to grant (permanent scope, any-counter filter) + group all-damage shield + proliferate; the single-sentence grant alone stays low; native-spell", () => {
    const whole = parseEffectProgram(MA);
    const single = parseEffectClause("Permanents you control with counters on them gain hexproof and indestructible until end of turn.", "Instant");
    const row = { conf: programConfidence(whole), ops: whole.atoms.map((a) => a.op), single: programConfidence(single), tier: classifyCard(MA) };
    console.log("  WITNESS mutationalAdvantage", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(whole.atoms[0]).toMatchObject({ op: "grant-keywords-group", scope: "permanentsYouControl", grantKeywords: ["Hexproof", "Indestructible"], requiresCounter: "any" });
    expect(whole.atoms[1]).toMatchObject({ op: "prevent-next-damage", group: { scope: "permanentsYouControl", requiresCounter: "any" } });
    expect(whole.atoms[1].amount).toBeGreaterThan(1000);
    expect(whole.atoms[2]).toMatchObject({ op: "proliferate" });
    expect(row.single).toBe("low");
    expect(row.tier).toBe("native-spell");
  });
});

const perm = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, keywords: [], oracle: "", ...card }, controller, summoningSick: false }), ...over });
const land = (id, name) => createPermanent({ id, card: { id: `c-${id}`, name, type: `Basic Land — ${name}`, oracle: "" }, controller: "user" });

function castAndResolve() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [MA], battlefield: [
        land("l1", "Forest"), land("l2", "Island"), land("l3", "Forest"),
        perm("cnt", { name: "Counted Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2 }, "user", { counters: { "+1/+1": 1 } }),
        perm("plain", { name: "Plain Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2 }, "user"),
        perm("walker", { name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3" }, "user", { counters: { loyalty: 3 } }),
        perm("rock", { name: "Charged Rock", type: "Artifact", mana: "{2}" }, "user", { counters: { charge: 1 } }),
      ] },
      ai: { ...s0.players.ai, battlefield: [perm("theirs", { name: "Their Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2 }, "ai", { counters: { "+1/+1": 1 } })] } } };
  const casts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-ma");
  expect(casts).toHaveLength(1);
  return resolveTopOfStack(dispatchAction(s, casts[0]));
}

const counters = (state, pid, id) => (state.players[pid].battlefield.find((p) => p.id === id) || {}).counters || {};

describe("RUNTIME — cast and resolve on a mixed board", () => {
  it("the countered creature and the walker gain hexproof + indestructible and are shielded; the counterless creature and the opponent's countered creature get neither; the rock gets no vacuous shield; proliferate adds to your countered permanents", () => {
    const out = castAndResolve();
    const shields = (out.preventionShields || []).map((e) => `${e.targetKind}:${e.targetId}`).sort();
    const row = {
      cntHexproof: !!permanentHasKeyword(out, "cnt", "Hexproof"), cntIndestructible: !!permanentHasKeyword(out, "cnt", "Indestructible"),
      walkerHexproof: !!permanentHasKeyword(out, "walker", "Hexproof"),
      plainHexproof: !!permanentHasKeyword(out, "plain", "Hexproof"), theirsHexproof: !!permanentHasKeyword(out, "theirs", "Hexproof"),
      shields,
      cntPlus: counters(out, "user", "cnt")["+1/+1"], walkerLoyalty: counters(out, "user", "walker").loyalty, rockCharge: counters(out, "user", "rock").charge,
      plainCounters: Object.keys(counters(out, "user", "plain")).length, theirsPlus: counters(out, "ai", "theirs")["+1/+1"],
      pending: out.pendingChoice?.kind ?? null,
    };
    console.log("  WITNESS mutationalAdvantageRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      cntHexproof: true, cntIndestructible: true, walkerHexproof: true, plainHexproof: false, theirsHexproof: false,
      shields: ["creature:cnt", "planeswalker:walker"],
      cntPlus: 2, walkerLoyalty: 4, rockCharge: 2, plainCounters: 0, theirsPlus: 1,
      pending: null,
    });
  });

  it("the shields are consumed by the real damage consumer: all damage to the countered creature and the walker is prevented, none of the damage to the counterless creature", () => {
    const out = castAndResolve();
    const row = {
      cnt: consumePreventionShields(out, { targetKind: "creature", targetId: "cnt", amount: 7 }).amount,
      walker: consumePreventionShields(out, { targetKind: "planeswalker", targetId: "walker", amount: 7 }).amount,
      plain: consumePreventionShields(out, { targetKind: "creature", targetId: "plain", amount: 7 }).amount,
    };
    console.log("  WITNESS mutationalAdvantageShields", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ cnt: 0, walker: 0, plain: 7 });
  });
});
