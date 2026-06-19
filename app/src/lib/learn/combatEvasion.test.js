/**
 * EVADE — the combat-evasion enforcement chokepoint (engine-first).
 *
 * Two halves, both required by THE CREED:
 *  1. CLASSIFIER pins — which keyword-only bodies now flip native (unblockable / basic landwalk /
 *     can't-block / can-block-only-flying), and the conditional/compound/team shapes that MUST stay
 *     body-only (no false positive).
 *  2. ENFORCEMENT — canBlockAttacker honors every restriction, menace's ≥2 rule is normalized at
 *     resolution, and Defender can't attack. A matcher with no working resolution is a false
 *     positive, so the classifier flips above are only honest because these pass.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { canBlockAttacker, attackerHasMenace, isEnforcedEvasionClause } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── helpers (mirror combatKeywords.test.js) ──
function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear", colors, tapped = false, summoningSick = false } = {}) {
  const card = { name, type, power, toughness, oracle };
  if (colors) card.colors = colors;
  return { id, card, controller, tapped, summoningSick, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}
function land(name, id, controller, type) {
  return { id, card: { name, type }, controller, tapped: false, counters: {}, attachments: [], attachedTo: null };
}
function st({ userBf = [], aiBf = [], attackers = [], blockers = [], step = "combat-damage", activePlayer = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer,
    step,
    phase: "combat",
    combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}

describe("EVADE — classifier (which evasion bodies are honestly native)", () => {
  it("bare unblockable flips native-body — name-form and templated-form", () => {
    expect(classifyCard({ type: "Creature — Naga", name: "Slither Blade", oracle: "Slither Blade can't be blocked." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Spirit", name: "X", oracle: "This creature can't be blocked." })).toBe("native-body");
  });

  it("basic landwalk flips native-body (reminder text is stripped)", () => {
    expect(classifyCard({ type: "Creature — Wraith", name: "Bog Wraith", oracle: "Swampwalk (This creature can't be blocked as long as defending player controls a Swamp.)" })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Cat", name: "Jungle Lion", oracle: "Forestwalk" })).toBe("native-body");
  });

  it("blocker-side can't-block and can-block-only-flying flip native-body", () => {
    expect(classifyCard({ type: "Creature — Wall", name: "Stoic Wall", oracle: "This creature can't block." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Elemental", name: "Cloud Elemental", oracle: "Flying\nCloud Elemental can block only creatures with flying." })).toBe("native-body");
  });

  it("the menace family stays native-body — now enforced, not interim-FP", () => {
    for (const oracle of ["Menace", "Skulk", "Fear", "Intimidate", "Horsemanship", "Defender"]) {
      expect(classifyCard({ type: "Creature — Beast", name: "KW", oracle })).toBe("native-body");
    }
    expect(classifyCard({ type: "Creature — Spirit", name: "Combo", oracle: "Flying, menace" })).toBe("native-body");
  });

  it("MUST stay body-only — conditional / except / team / extra-ability shapes (no false positive)", () => {
    // Conditional unblockable — the chokepoint doesn't model the "by creatures with flying" qualifier.
    expect(classifyCard({ type: "Creature — Rogue", name: "X", oracle: "This creature can't be blocked by creatures with flying." })).toBe("body-only");
    expect(classifyCard({ type: "Creature — Beast", name: "X", oracle: "This creature can't be blocked except by Walls." })).toBe("body-only");
    // Team grant (others, not self) — never a self-evasion body.
    expect(classifyCard({ type: "Creature — Lord", name: "X", oracle: "Other creatures you control can't be blocked." })).toBe("body-only");
    // Unblockable beside an UNMODELED activated ability — one bare evasion clause can't carry it. (The
    // count source is opponent-scoped, so FOR-EACH leaves the ability unmodeled → still body-only.)
    expect(classifyCard({ type: "Creature — Rogue", name: "X", oracle: "This creature can't be blocked.\n{2}: Draw a card for each Island an opponent controls." })).toBe("body-only");
  });

  it("isEnforcedEvasionClause: exact-end matching, no over-broad catch", () => {
    expect(isEnforcedEvasionClause("swampwalk")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked")).toBe(true);
    expect(isEnforcedEvasionClause("can't be blocked")).toBe(true);
    expect(isEnforcedEvasionClause("can't be blocked by creatures with flying")).toBe(false);
    expect(isEnforcedEvasionClause("creatures you control can't be blocked")).toBe(false);
    expect(isEnforcedEvasionClause("nonbasic landwalk")).toBe(false);
  });
});

describe("EVADE — canBlockAttacker enforcement (pairwise, layer-aware)", () => {
  const setup = (attacker, blocker, defenderLands = []) => {
    const s = st({ userBf: [attacker], aiBf: [blocker, ...defenderLands] });
    return (def = "ai") => canBlockAttacker(s, blocker.id, attacker.id, def);
  };

  it("flying — blockable only by flying/reach", () => {
    expect(setup(cr("Drake", "a", "user", { oracle: "Flying" }), cr("Bear", "b", "ai"))()).toBe(false);
    expect(setup(cr("Drake", "a", "user", { oracle: "Flying" }), cr("Eagle", "b", "ai", { oracle: "Flying" }))()).toBe(true);
    expect(setup(cr("Drake", "a", "user", { oracle: "Flying" }), cr("Spider", "b", "ai", { oracle: "Reach" }))()).toBe(true);
  });

  it("unblockable — blockable by nothing", () => {
    expect(setup(cr("Stalker", "a", "user", { oracle: "This creature can't be blocked." }), cr("Bear", "b", "ai"))()).toBe(false);
  });

  it("basic landwalk — unblockable only while THIS defender controls the land type", () => {
    const withSwamp = setup(cr("Wraith", "a", "user", { oracle: "Swampwalk" }), cr("Bear", "b", "ai"), [land("Swamp", "s", "ai", "Basic Land — Swamp")]);
    expect(withSwamp("ai")).toBe(false);
    const noSwamp = setup(cr("Wraith", "a", "user", { oracle: "Swampwalk" }), cr("Bear", "b", "ai"));
    expect(noSwamp("ai")).toBe(true);
  });

  it("skulk — not blockable by greater power", () => {
    expect(setup(cr("Sneak", "a", "user", { power: 2, oracle: "Skulk" }), cr("Big", "b", "ai", { power: 3 }))()).toBe(false);
    expect(setup(cr("Sneak", "a", "user", { power: 2, oracle: "Skulk" }), cr("Equal", "b", "ai", { power: 2 }))()).toBe(true);
  });

  it("fear — blockable only by artifact and/or black", () => {
    const fearAtt = () => cr("Horror", "a", "user", { oracle: "Fear", colors: ["B"] });
    expect(setup(fearAtt(), cr("White", "b", "ai", { colors: ["W"] }))()).toBe(false);
    expect(setup(fearAtt(), cr("Black", "b", "ai", { colors: ["B"] }))()).toBe(true);
    expect(setup(fearAtt(), cr("Golem", "b", "ai", { type: "Artifact Creature — Golem", colors: [] }))()).toBe(true);
  });

  it("intimidate — blockable only by artifact and/or a shared color", () => {
    const redAtt = () => cr("Goblin", "a", "user", { oracle: "Intimidate", colors: ["R"] });
    expect(setup(redAtt(), cr("Green", "b", "ai", { colors: ["G"] }))()).toBe(false);
    expect(setup(redAtt(), cr("Red", "b", "ai", { colors: ["R"] }))()).toBe(true);
    expect(setup(redAtt(), cr("Golem", "b", "ai", { type: "Artifact Creature — Golem", colors: [] }))()).toBe(true);
  });

  it("horsemanship — blockable only by horsemanship", () => {
    expect(setup(cr("Cavalry", "a", "user", { oracle: "Horsemanship" }), cr("Bear", "b", "ai"))()).toBe(false);
    expect(setup(cr("Cavalry", "a", "user", { oracle: "Horsemanship" }), cr("Rider", "b", "ai", { oracle: "Horsemanship" }))()).toBe(true);
  });

  it("blocker-side: can't-block never blocks; can-block-only-flying blocks only flyers", () => {
    expect(setup(cr("Bear", "a", "user"), cr("Pacifist", "b", "ai", { oracle: "This creature can't block." }))()).toBe(false);
    expect(setup(cr("Bear", "a", "user"), cr("AirGuard", "b", "ai", { oracle: "This creature can block only creatures with flying." }))()).toBe(false);
    expect(setup(cr("Drake", "a", "user", { oracle: "Flying" }), cr("AirGuard", "b", "ai", { oracle: "Flying\nThis creature can block only creatures with flying." }))()).toBe(true);
    // ...but WITHOUT flying/reach it can block nothing: its clause restricts it to flyers, yet a flying
    // attacker still requires the blocker to have flying/reach (CR 702.9b). Locks the reviewed interaction
    // — the clause is a restriction, not a grant; allowing this block would be illegal.
    expect(setup(cr("Drake", "a", "user", { oracle: "Flying" }), cr("Grounded", "b", "ai", { oracle: "This creature can block only creatures with flying." }))()).toBe(false);
  });
});

describe("EVADE — menace (the SET-level ≥2 rule)", () => {
  it("resolution: a menace attacker with exactly ONE blocker is unblocked (connects)", () => {
    const att = cr("Brute", "a", "user", { power: 3, toughness: 3, oracle: "Menace" });
    const blk = cr("Bear", "b", "ai", { power: 2, toughness: 2 });
    const s = st({
      userBf: [att], aiBf: [blk],
      attackers: [{ permanentId: "a", attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: "b", blockingPlayer: "ai", attackerId: "a" }],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(37);                                   // 3 dmg got through
    expect(out.players.ai.battlefield.map(p => p.card.name)).toContain("Bear"); // lone blocker took no damage
  });

  it("resolution: a menace attacker with TWO blockers is blocked normally (no face damage)", () => {
    const att = cr("Brute", "a", "user", { power: 3, toughness: 3, oracle: "Menace" });
    const s = st({
      userBf: [att], aiBf: [cr("B1", "b1", "ai", { power: 2, toughness: 2 }), cr("B2", "b2", "ai", { power: 2, toughness: 2 })],
      attackers: [{ permanentId: "a", attackingPlayer: "user", defender: "ai" }],
      blockers: [
        { blockerId: "b1", blockingPlayer: "ai", attackerId: "a" },
        { blockerId: "b2", blockingPlayer: "ai", attackerId: "a" },
      ],
    });
    const out = resolveCombatDamage(s);
    expect(out.players.ai.life).toBe(40);                                       // blocked → no face damage
    expect(out.players.user.graveyard.map(c => c.name)).toContain("Brute");     // 2+2 ≥ 3 toughness → dies
  });

  it("declaration gate: a menace attacker isn't offered a block unless ≥2 eligible blockers exist", () => {
    const att = cr("Brute", "a", "user", { power: 3, toughness: 3, oracle: "Menace" });
    const one = st({ userBf: [att], aiBf: [cr("Lone", "b1", "ai")], step: "declare-blockers" });
    expect(filterActions(legalActionsForPlayer(one, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(0);
    const two = st({ userBf: [att], aiBf: [cr("B1", "b1", "ai"), cr("B2", "b2", "ai")], step: "declare-blockers" });
    expect(filterActions(legalActionsForPlayer(two, "ai", { declaredAttackers: ["a"] }), "declare-blocker").length).toBeGreaterThanOrEqual(2);
    expect(attackerHasMenace(two, "a")).toBe(true);
  });
});

describe("EVADE — defender can't attack (CR 702.3b)", () => {
  it("a Defender creature is not offered as an attacker; a normal creature is", () => {
    const wall = cr("Wall of Omens", "w", "user", { oracle: "Defender" });
    const bear = cr("Bear", "br", "user");
    const s = st({ userBf: [wall, bear], step: "declare-attackers", activePlayer: "user" });
    const names = filterActions(legalActionsForPlayer(s, "user"), "declare-attacker").map(a => a.name);
    expect(names).toContain("Bear");
    expect(names).not.toContain("Wall of Omens");
  });
});
