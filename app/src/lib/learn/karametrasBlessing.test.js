/**
 * KARAMETRA'S BLESSING — the enchanted-or-enchantment-creature keyword rider. SHELF-85 · Light-Paws L5, 2026-09-05.
 * "Target creature gets +2/+2 until end of turn. If it's an enchanted creature or enchantment creature, it also gains
 * hexproof and indestructible until end of turn."
 *
 * The bound type-conditional pump existed (Blacksmith's Skill: "If it's an artifact creature, it gets +2/+2"); this rider is
 * a keyword grant under an OR condition — the target has an Aura attached (hasAuraAttached, the Winds of Rath predicate)
 * OR carries both Enchantment and Creature after layer 4. Read at resolution (CR 608.2) on the previous atom's target.
 *
 * Mutation-checked: see the run ledger (docs-sk106).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KB = { id: "c-kb", name: "Karametra's Blessing", type: "Instant", mana: "{G}", keywords: [],
  oracle: "Target creature gets +2/+2 until end of turn. If it's an enchanted creature or enchantment creature, it also gains hexproof and indestructible until end of turn." };

describe("the parser", () => {
  it("the whole card reads to the pump plus the bound conditional keyword rider; native-spell", () => {
    const p = parseEffectProgram(KB);
    const row = { conf: programConfidence(p), atoms: p.atoms, tier: classifyCard(KB) };
    console.log("  WITNESS karametrasBlessing", JSON.stringify({ conf: row.conf, ops: row.atoms.map((a) => a.op), tier: row.tier })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atoms[0]).toMatchObject({ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 2 } });
    expect(row.atoms[1]).toEqual({ op: "pump", ptDelta: { p: 0, t: 0 }, grantKeywords: ["hexproof", "indestructible"], bindPreviousTargets: true, ifBoundEnchantedOrEnchantmentCreature: true });
    expect(row.tier).toBe("native-spell");
  });
});

const forest = (i) => createPermanent({ id: `f${i}`, card: { id: `c-f${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
function castOn(targetPerm, extra = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, hand: [KB], battlefield: [forest(1), targetPerm, ...extra] } } };
  const act = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-kb" && x.targets?.[0]?.id === targetPerm.id);
  expect(act).toBeTruthy();
  const out = resolveTopOfStack(dispatchAction(s, act));
  return { power: permanentPower(out, targetPerm.id), toughness: permanentToughness(out, targetPerm.id), hexproof: !!permanentHasKeyword(out, targetPerm.id, "Hexproof"), indestructible: !!permanentHasKeyword(out, targetPerm.id, "Indestructible") };
}
const bear = (id, type = "Creature — Bear") => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type, mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });

describe("RUNTIME — the pump lands on every target; the keywords only where the condition holds", () => {
  it("a creature wearing an Aura: +2/+2 AND hexproof + indestructible", () => {
    const host = { ...bear("host"), attachments: ["aura"] };
    const aura = { ...createPermanent({ id: "aura", card: { id: "c-aura", name: "Plain Aura", type: "Enchantment — Aura", mana: "{G}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +1/+1." }, controller: "user" }), attachedTo: "host" };
    const row = castOn(host, [aura]);
    console.log("  WITNESS karametrasBlessingAura", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ power: 5, toughness: 5, hexproof: true, indestructible: true });
  });
  it("an enchantment creature: +2/+2 AND the keywords", () => {
    const row = castOn(bear("ench", "Enchantment Creature — Nymph"));
    console.log("  WITNESS karametrasBlessingEnch", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ power: 4, toughness: 4, hexproof: true, indestructible: true });
  });
  it("a plain creature: +2/+2 only — no keywords", () => {
    const row = castOn(bear("plain"));
    console.log("  WITNESS karametrasBlessingPlain", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ power: 4, toughness: 4, hexproof: false, indestructible: false });
  });
});
