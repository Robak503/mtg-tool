/**
 * Indestructible (CR 702.12) in the native learn engine — the parity gap surfaced by the
 * adversarial review of the targeted-permanent-removal slice. Two SBAs and the destroy effect
 * must honor it, and a GRANTED instance must behave exactly like a printed one:
 *   - applyDestroyEffect (CR 702.12b) — an indestructible permanent can't be destroyed.
 *   - destroyLethalCreatures (CR 704.5g) — lethal/deathtouch damage doesn't destroy it,
 *     BUT 0-or-less toughness (CR 704.5f) still puts it in the graveyard (not "destroy").
 *
 * isIndestructible reads the layer engine (layers.permanentHasKeyword), so the grant can come from
 * a self-static (Darksteel Forge), an anthem, an Equipment, or an Aura — not just a printed keyword.
 * The combat-trick path is intentionally NOT broadened here (a "gains indestructible until end of
 * turn" instant still routes to the Arbiter — see combatTrick.test.js / effects/parser.test.js).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createGameState,
  createPermanent,
  _resetIdsForTests,
  findPermanent,
  markCombatDamage,
  destroyLethalCreatures,
  isIndestructible,
  attachPermanent,
} from "./gameState.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { permanentHasKeyword } from "./layers.js";
import { parseStaticAbilities, parseEquipmentBonus, parseAuraBonus, isNativeAura } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// Real cards (oracle text verbatim) + clearly-synthetic fixtures for the rule edges.
const DARKSTEEL_FORGE = { id: "c-forge", name: "Darksteel Forge", type: "Legendary Artifact", mana: "{9}", oracle: "Artifacts you control are indestructible." };
const DARKSTEEL_PLATE = { id: "c-plate", name: "Darksteel Plate", type: "Artifact — Equipment", mana: "{2}", oracle: "Equipped creature has indestructible.\nEquip {2}" };
const DARKSTEEL_MYR = { id: "c-myr", name: "Darksteel Myr", type: "Artifact Creature — Myr", power: 0, toughness: 3, oracle: "Indestructible" };
const bearCard = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
// Synthetic FIXTURES (valid templating; exercise a mechanism, not a specific card's behavior).
const ANTHEM_INDEST = { id: "c-anthem", name: "Indestructible Anthem", type: "Enchantment", oracle: "Creatures you control have indestructible." };
const AURA_INDEST = { id: "c-auraind", name: "Shielding Aura", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature has indestructible." };
const ZERO_TOUGH_INDEST = { id: "c-zero", name: "Hollow Idol", type: "Artifact Creature — Construct", power: 0, toughness: 0, oracle: "Indestructible" };

const perm = (card, controller, id = card.id) => createPermanent({ id, card, controller });
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
const lastDestroyLog = (s) => [...s.log].reverse().find((e) => e.effect === "destroy");

// ─── Grant parsing — indestructible is grantable on the STATIC path ──────────────

describe("static parser — indestructible is grantable (self / anthem / equipment / aura)", () => {
  it("'<type>s you control are indestructible' grants a layer-6 keyword to that type", () => {
    // Darksteel Forge: "are indestructible" + an Artifact-type subject — the templating the
    // creature-only anthem selector can't express. Grants to itself (you control + Artifact).
    expect(parseStaticAbilities(DARKSTEEL_FORGE)).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "indestructible" },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Artifact"], excludeSelf: false } },
        duration: { kind: "permanent" } },
    ]);
  });
  it("'Other permanents you control have indestructible' → any permanent, excludes self (Avacyn)", () => {
    expect(parseStaticAbilities({ oracle: "Other permanents you control have indestructible." })).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "indestructible" },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: [], excludeSelf: true } },
        duration: { kind: "permanent" } },
    ]);
  });
  it("'Creatures you control have indestructible' grants via the creature anthem path", () => {
    expect(parseStaticAbilities(ANTHEM_INDEST)).toEqual([
      { layer: 6, op: { layerOp: "addKeyword", keyword: "indestructible" },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"] } },
        duration: { kind: "permanent" } },
    ]);
  });
  it("Equipment / Aura 'has indestructible' is a grantable attached bonus; the Aura is native", () => {
    expect(parseEquipmentBonus(DARKSTEEL_PLATE).map((e) => e.op)).toEqual([{ layerOp: "addKeyword", keyword: "indestructible" }]);
    expect(parseAuraBonus(AURA_INDEST).map((e) => e.op)).toEqual([{ layerOp: "addKeyword", keyword: "indestructible" }]);
    expect(isNativeAura(AURA_INDEST)).toBe(true);
  });
  it("ALL-OR-NOTHING: a combined 'are indestructible and have <unmodeled>' drops the grant (→ Arbiter)", () => {
    expect(parseStaticAbilities({ oracle: "Artifacts you control are indestructible and have hexproof." })).toEqual([]);
  });
});

// ─── isIndestructible reads the layer engine (printed + granted) ──────────────────

describe("isIndestructible — printed and granted both honored", () => {
  it("true for a printed-indestructible permanent, false for a vanilla one", () => {
    const s = board({ user: [perm(DARKSTEEL_MYR, "user"), perm(bearCard, "user")] });
    expect(isIndestructible(findPermanent(s, "c-myr").permanent, s)).toBe(true);
    expect(isIndestructible(findPermanent(s, "c-bear").permanent, s)).toBe(false);
  });
  it("true for a self-granting static (Darksteel Forge protects itself)", () => {
    const s = board({ user: [perm(DARKSTEEL_FORGE, "user")] });
    expect(permanentHasKeyword(s, "c-forge", "indestructible")).toBe(true);
    expect(isIndestructible(findPermanent(s, "c-forge").permanent, s)).toBe(true);
  });
  it("true for a creature wearing indestructible-granting Equipment", () => {
    let s = board({ user: [perm(bearCard, "user"), perm(DARKSTEEL_PLATE, "user")] });
    expect(isIndestructible(findPermanent(s, "c-bear").permanent, s)).toBe(false);
    s = attachPermanent(s, { equipId: "c-plate", targetId: "c-bear" });
    expect(isIndestructible(findPermanent(s, "c-bear").permanent, s)).toBe(true);
  });
});

// ─── applyDestroyEffect (CR 702.12b) — can't be destroyed ─────────────────────────

describe("applyDestroyEffect — indestructible permanents survive destruction", () => {
  it("Darksteel Forge survives Vindicate ('destroy target permanent')", () => {
    const s0 = board({ user: [perm(DARKSTEEL_FORGE, "user")] });
    const s = applyDestroyEffect(s0, { controller: "ai", targets: [{ type: "permanent", id: "c-forge" }] });
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["c-forge"]); // still on the battlefield
    expect(s.players.user.graveyard).toEqual([]);                              // never reached the graveyard
    expect(lastDestroyLog(s).prevented).toContain("c-forge");                  // logged as not destroyed
  });
  it("a printed-indestructible creature survives 'destroy target creature'", () => {
    const s0 = board({ ai: [perm(DARKSTEEL_MYR, "ai")] });
    const s = applyDestroyEffect(s0, { controller: "user", targets: [{ type: "creature", id: "c-myr" }] });
    expect(s.players.ai.battlefield.map((p) => p.id)).toEqual(["c-myr"]);
    expect(s.players.ai.graveyard).toEqual([]);
  });
  it("a creature with indestructible-granting Equipment survives destruction", () => {
    let s = board({ user: [perm(bearCard, "user"), perm(DARKSTEEL_PLATE, "user")] });
    s = attachPermanent(s, { equipId: "c-plate", targetId: "c-bear" });
    s = applyDestroyEffect(s, { controller: "ai", targets: [{ type: "creature", id: "c-bear" }] });
    expect(findPermanent(s, "c-bear")).not.toBeNull();
  });
  it("REGRESSION: a NON-indestructible permanent is still destroyed", () => {
    const s0 = board({ ai: [perm(bearCard, "ai")] });
    const s = applyDestroyEffect(s0, { controller: "user", targets: [{ type: "creature", id: "c-bear" }] });
    expect(s.players.ai.battlefield).toEqual([]);
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["c-bear"]);
  });
});

// ─── destroyLethalCreatures — 704.5g (destroy) vs 704.5f (0 toughness) ────────────

describe("destroyLethalCreatures — indestructible survives lethal/deathtouch but not 0 toughness", () => {
  it("a printed-indestructible creature survives lethal combat damage", () => {
    let s = board({ ai: [perm(DARKSTEEL_MYR, "ai")] });
    s = markCombatDamage(s, { permanentId: "c-myr", amount: 5 }); // ≥ 3 toughness → lethal
    const r = destroyLethalCreatures(s);
    expect(r.dead).toEqual([]);
    expect(r.state.players.ai.battlefield.map((p) => p.id)).toEqual(["c-myr"]);
  });
  it("a granted-indestructible creature (Equipment) survives lethal combat damage", () => {
    let s = board({ user: [perm(bearCard, "user"), perm(DARKSTEEL_PLATE, "user")] });
    s = attachPermanent(s, { equipId: "c-plate", targetId: "c-bear" });
    s = markCombatDamage(s, { permanentId: "c-bear", amount: 5 });
    expect(destroyLethalCreatures(s).dead).toEqual([]);
  });
  it("an indestructible creature survives deathtouch damage (CR 702.2c lethal, 702.12b not destroyed)", () => {
    // Deathtouch makes ANY damage lethal (CR 702.2c), but that lethality still routes through
    // 704.5g "destroy" — which an indestructible creature ignores (CR 702.12b). So it survives.
    let s = board({ ai: [perm(DARKSTEEL_MYR, "ai")] });
    s = markCombatDamage(s, { permanentId: "c-myr", amount: 1 });
    expect(destroyLethalCreatures(s, new Set(["c-myr"])).dead).toEqual([]);
  });
  it("a 0-toughness indestructible creature STILL dies (CR 704.5f is not 'destroy')", () => {
    const s = board({ user: [perm(ZERO_TOUGH_INDEST, "user")] });
    const r = destroyLethalCreatures(s);
    expect(r.dead.map((d) => d.id)).toEqual(["c-zero"]);
    expect(r.state.players.user.graveyard.map((c) => c.id)).toEqual(["c-zero"]);
  });
  it("REGRESSION: a normal creature with lethal damage is still destroyed", () => {
    let s = board({ ai: [perm(bearCard, "ai")] });
    s = markCombatDamage(s, { permanentId: "c-bear", amount: 2 });
    const r = destroyLethalCreatures(s);
    expect(r.dead.map((d) => d.id)).toEqual(["c-bear"]);
  });
});
