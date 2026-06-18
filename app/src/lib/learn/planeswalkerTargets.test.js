/**
 * Planeswalkers as targets of damage (PW-6, CR 120.3c). Spells/abilities that deal damage can now
 * target a planeswalker — "any target", "target creature or planeswalker", "target player or
 * planeswalker", "target planeswalker" — and the damage is removed as loyalty (not life), killing
 * the walker at 0 (CR 704.5i). This is how walkers die outside combat (burn/removal) + un-gates the
 * planeswalker abilities that deal damage to walkers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets, applyDamageEffect } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const pw = (name, over = {}) => ({ id: `pw-${name}`, name, type: "Legendary Planeswalker — Test", loyalty: "4", oracle: "", ...over });
const creature = (name, over = {}) => ({ id: `c-${name}`, name, type: "Creature — Bear", type_line: "Creature — Bear", power: 2, toughness: 2, oracle: "", ...over });
function withBf(s, pid, perms) { return { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: perms } } }; }
function pwPerm(id, card, controller, loy = 4) { const p = createPermanent({ id, card, controller, summoningSick: false }); return { ...p, counters: { ...p.counters, loyalty: loy } }; }

describe("PW-6 — damage-target parsing offers planeswalkers", () => {
  const tt = (clause) => { const p = parseEffectClause(clause, "Instant"); return p && programConfidence(p) === "high" ? p.atoms[0].targetType : "low"; };
  it("'target creature or planeswalker' → creatureOrPlaneswalker (was dropped to creature)", () => {
    expect(tt("Deal 3 damage to target creature or planeswalker.")).toBe("creatureOrPlaneswalker");
  });
  it("'target player or planeswalker' → playerOrPlaneswalker", () => {
    expect(tt("Deal 1 damage to target player or planeswalker.")).toBe("playerOrPlaneswalker");
  });
  it("'target planeswalker' → planeswalker", () => {
    expect(tt("Deal 2 damage to target planeswalker.")).toBe("planeswalker");
  });
  it("'any target' stays high (now enumerates planeswalkers too)", () => {
    expect(tt("Deal 3 damage to any target.")).toBe("any");
  });
});

describe("PW-6 — enumeration includes live planeswalkers", () => {
  function board() {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "user", [createPermanent({ id: "myc", card: creature("Mine"), controller: "user", summoningSick: false })]);
    s = withBf(s, "ai", [pwPerm("epw", pw("EnemyPW"), "ai", 4), createPermanent({ id: "aic", card: creature("Theirs"), controller: "ai", summoningSick: false })]);
    return s;
  }
  const ids = (s, targetType) => enumerateTargets(s, "user", { kind: "damage", targetType }).map((t) => `${t.type}:${t.id}`);

  it("'any' includes creatures, players, AND planeswalkers", () => {
    const list = ids(board(), "any");
    expect(list).toContain("planeswalker:epw");
    expect(list).toContain("player:ai");
    expect(list).toContain("creature:myc");
  });
  it("'creatureOrPlaneswalker' includes creatures + planeswalkers, NOT players", () => {
    const list = ids(board(), "creatureOrPlaneswalker");
    expect(list).toContain("planeswalker:epw");
    expect(list).toContain("creature:myc");
    expect(list.some((x) => x.startsWith("player:"))).toBe(false);
  });
  it("'planeswalker' includes only planeswalkers", () => {
    expect(ids(board(), "planeswalker")).toEqual(["planeswalker:epw"]);
  });
  it("a creature-only damage spell still never offers a planeswalker (no regression)", () => {
    expect(ids(board(), "creature").some((x) => x.startsWith("planeswalker:"))).toBe(false);
  });
});

describe("PW-6 — damage to a planeswalker removes loyalty", () => {
  it("damage removes loyalty, not the controller's life", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "ai", [pwPerm("epw", pw("EnemyPW"), "ai", 4)]);
    const lifeBefore = s.players.ai.life;
    s = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "planeswalker", targets: [{ type: "planeswalker", id: "epw" }] });
    expect(findPermanent(s, "epw").permanent.counters.loyalty).toBe(1); // 4 − 3
    expect(s.players.ai.life).toBe(lifeBefore);
  });
  it("lethal damage kills the planeswalker (0-loyalty SBA → graveyard)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "ai", [pwPerm("epw", pw("EnemyPW"), "ai", 2)]);
    s = applyDamageEffect(s, { controller: "user", amount: 3, targetType: "planeswalker", targets: [{ type: "planeswalker", id: "epw" }] });
    expect(findPermanent(s, "epw")).toBeNull();
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("EnemyPW");
  });
  it("an 'any target' burn can split — a creature target still takes marked damage", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "ai", [pwPerm("epw", pw("EnemyPW"), "ai", 5), createPermanent({ id: "aic", card: creature("Theirs"), controller: "ai", summoningSick: false })]);
    s = applyDamageEffect(s, { controller: "user", amount: 2, targetType: "any", targets: [{ type: "planeswalker", id: "epw" }] });
    expect(findPermanent(s, "epw").permanent.counters.loyalty).toBe(3); // 5 − 2
  });
});
