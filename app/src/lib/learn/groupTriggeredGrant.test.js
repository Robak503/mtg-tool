/**
 * GROUP-TRIGGERED grant (Tempered Sliver wave) — a static that grants every selector-matched permanent a
 * quoted TRIGGERED ability ("Sliver creatures you control have \"Whenever this creature deals combat damage to
 * a player, put a +1/+1 counter on it.\""). The new group-grant kind:"triggered":
 *   staticAbilityParser emit (validator-gated) → layers.grantedTriggeredQuotedFor (selector match) →
 *   triggers.grantedTriggersForGroup (merged into triggersForEvent), gated by
 *   triggerRouting.isModeledGroupTriggeredBody (the SAME triggerRoutesNatively gate the metric uses).
 *
 * Engine-first (THE CREED): the grant must CLASSIFY native AND the granted trigger must FIRE on the recipient.
 * The validator keeps it all-or-nothing: a quoted body whose trigger doesn't route natively emits nothing
 * (the card stays body-only — a safe FN, never a half-modeled flip).
 *
 * Also pins the BONUS Sliver cards this infrastructure flips (Harmonic / Lavabelly / Thorncaster / Fungus),
 * which carry the same "Sliver(s) (creatures) you control have \"<trigger>\"" shape.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { grantedTriggeredQuotedFor } from "./layers.js";
import { isModeledGroupTriggeredBody } from "./triggerRouting.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const sliver = (name, oracle) => ({ name, type: "Creature — Sliver", mana: "{2}{G}", oracle });
function perm(id, controller, type, oracle = "", summoningSick = false) {
  return createPermanent({ id, card: { id: `c-${id}`, name: id, type, oracle, power: 2, toughness: 2 }, controller, summoningSick });
}

describe("GROUP-TRIGGERED grant — recognition + emission", () => {
  it("Tempered Sliver classifies native-static and emits a kind:'triggered' grant", () => {
    const d = parseStaticAbilities(sliver("Tempered Sliver", 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."'));
    expect(d).toHaveLength(1);
    expect(d[0].op.grant).toMatchObject({ kind: "triggered" });
    expect(classifyCard(sliver("Tempered Sliver", 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."'))).toBe("native-static");
  });

  it("the BONUS Sliver group-triggered cards flip native (same shape, all route)", () => {
    expect(classifyCard(sliver("Harmonic Sliver", 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."'))).toBe("native-static");
    expect(classifyCard(sliver("Lavabelly Sliver", 'Sliver creatures you control have "When this creature enters, it deals 1 damage to target player or planeswalker and you gain 1 life."'))).toBe("native-static");
    expect(classifyCard(sliver("Thorncaster Sliver", 'Sliver creatures you control have "Whenever this creature attacks, it deals 1 damage to any target."'))).toBe("native-static");
    expect(classifyCard(sliver("Fungus Sliver", 'All Sliver creatures have "Whenever this creature is dealt damage, put a +1/+1 counter on it."'))).toBe("native-static");
  });

  it("CREED FN boundary — a triggered body whose EFFECT does not route natively emits NOTHING", () => {
    // reanimate-on-death is an unmodeled effect → the validator rejects → no descriptor → body-only.
    expect(parseStaticAbilities(sliver("Reanimator Sliver", 'Sliver creatures you control have "When this creature dies, return it to the battlefield under your control."'))).toEqual([]);
    expect(classifyCard(sliver("Reanimator Sliver", 'Sliver creatures you control have "When this creature dies, return it to the battlefield under your control."'))).toBe("body-only");
    // the validator agrees with the routing gate
    expect(isModeledGroupTriggeredBody("Whenever this creature deals combat damage to a player, put a +1/+1 counter on it.")).toBe(true);
    expect(isModeledGroupTriggeredBody("When this creature dies, return it to the battlefield under your control.")).toBe(false);
  });
});

describe("GROUP-TRIGGERED grant — selector scope + runtime firing", () => {
  it("grantedTriggeredQuotedFor reaches Slivers you control (incl. source), not a non-Sliver or an opponent's Sliver", () => {
    const temp = perm("temp", "user", "Creature — Sliver", 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."');
    const musc = perm("musc", "user", "Creature — Sliver");
    const bear = perm("bear", "user", "Creature — Bear");
    const oppSliver = perm("opp", "ai", "Creature — Sliver");
    const state = { activePlayer: "user", players: { user: { battlefield: [temp, musc, bear] }, ai: { battlefield: [oppSliver] } } };
    expect(grantedTriggeredQuotedFor(state, "musc")).toHaveLength(1);
    expect(grantedTriggeredQuotedFor(state, "temp")).toHaveLength(1);
    expect(grantedTriggeredQuotedFor(state, "bear")).toHaveLength(0);
    expect(grantedTriggeredQuotedFor(state, "opp")).toHaveLength(0); // "you control" scopes to the granter's controller
  });

  it("a granted ETB trigger (Harmonic Sliver) fires + resolves when another Sliver enters", () => {
    const harm = perm("harm", "user", "Creature — Sliver", 'All Slivers have "When this permanent enters, destroy target artifact or enchantment."');
    const entering = perm("musc", "user", "Creature — Sliver", "", true);
    const enemyArt = perm("art", "ai", "Artifact");
    enemyArt.card.type = "Artifact";
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [harm, entering] }, ai: { ...s.players.ai, battlefield: [enemyArt] } } };
    s = checkEnterTriggers(s, entering);
    expect((s.pendingTriggers || []).length).toBe(1);
    let g = 0; s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); while ((s.stack || []).length && g++ < 25) s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.some((p) => p.id === "art")).toBe(false); // the granted ETB destroyed the artifact
  });
});
