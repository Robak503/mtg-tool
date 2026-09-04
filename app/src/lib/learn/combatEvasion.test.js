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
    for (const oracle of ["Menace", "Skulk", "Fear", "Intimidate", "Horsemanship", "Shadow", "Defender"]) {
      expect(classifyCard({ type: "Creature — Beast", name: "KW", oracle })).toBe("native-body");
    }
    expect(classifyCard({ type: "Creature — Spirit", name: "Combo", oracle: "Flying, menace" })).toBe("native-body");
  });

  it("MUST stay body-only — conditional / except / team / extra-ability shapes (no false positive)", () => {
    // "except by Walls" flipped NATIVE under BLITZ EV-3 (the subtype-allowlist except-gate, enforced in
    // canBlockAttacker via permIsSubtype — see evasionMinBlockers.test.js); an unvetted filter still parks.
    expect(classifyCard({ type: "Creature — Beast", name: "X", oracle: "This creature can't be blocked except by Walls." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Beast", name: "X", oracle: "This creature can't be blocked except by legendary creatures." })).toBe("body-only");
    // Team grant (others, not self) — never a self-evasion body.
    expect(classifyCard({ type: "Creature — Lord", name: "X", oracle: "Other creatures you control can't be blocked." })).toBe("body-only");
    // Unblockable beside an UNMODELED activated ability — one bare evasion clause can't carry it.
    expect(classifyCard({ type: "Creature — Rogue", name: "X", oracle: "This creature can't be blocked.\n{2}: Draw a card for each Island an opponent controls." })).toBe("body-only");
    // "can't be blocked by artifact creatures" flipped NATIVE under ④-AV (2026-09-04): the kind:"artifact" restriction is
    // enforced in canBlockAttacker via isArtifactPerm (see blockerPowerCapArtifactEvasion.test.js). Its enchantment
    // sibling has no restriction kind and still parks.
    expect(classifyCard({ type: "Creature — Sprite", name: "X", oracle: "This creature can't be blocked by artifact creatures." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Sprite", name: "X", oracle: "This creature can't be blocked by enchantment creatures." })).toBe("body-only");
  });

  it("isEnforcedEvasionClause: exact-end matching, no over-broad catch", () => {
    expect(isEnforcedEvasionClause("swampwalk")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked")).toBe(true);
    expect(isEnforcedEvasionClause("can't be blocked")).toBe(true);
    // Bare "can't be blocked by X" WITHOUT "this creature" prefix — still unrecognized (needs subject).
    expect(isEnforcedEvasionClause("can't be blocked by creatures with flying")).toBe(false);
    expect(isEnforcedEvasionClause("creatures you control can't be blocked")).toBe(false);
    expect(isEnforcedEvasionClause("nonbasic landwalk")).toBe(false);
    // EVASION-QUALIFIER forms (with subject) are recognized:
    expect(isEnforcedEvasionClause("this creature can't be blocked by creatures with flying")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked by white creatures")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked by creatures with power 3 or less")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked by walls")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked by creature tokens")).toBe(true);
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

  it("shadow — SYMMETRIC: shadow blocks/blocked-by only shadow (EVADE-2, CR 702.28b)", () => {
    // a shadow attacker can't be blocked by a non-shadow creature
    expect(setup(cr("Dauthi", "a", "user", { oracle: "Shadow" }), cr("Bear", "b", "ai"))()).toBe(false);
    // a shadow attacker CAN be blocked by a shadow creature
    expect(setup(cr("Dauthi", "a", "user", { oracle: "Shadow" }), cr("Soltari", "b", "ai", { oracle: "Shadow" }))()).toBe(true);
    // the REVERSE direction (the symmetric half flying/horsemanship lack): a NON-shadow attacker
    // can't be blocked by a shadow creature — a shadow creature can only block shadow.
    expect(setup(cr("Bear", "a", "user"), cr("Soltari", "b", "ai", { oracle: "Shadow" }))()).toBe(false);
    // two normal creatures block normally (behavior-neutral)
    expect(setup(cr("Bear", "a", "user"), cr("Grizzly", "b", "ai"))()).toBe(true);
  });

  it("shadow — declare-blocker ENUMERATION (the real legalChoices path) honors the exclusion", () => {
    const shadowAtt = cr("Dauthi", "a", "user", { oracle: "Shadow" });
    // a non-shadow blocker can't block the shadow attacker → 0 block options offered
    const noBlock = st({ userBf: [shadowAtt], aiBf: [cr("Bear", "b1", "ai")], step: "declare-blockers" });
    expect(filterActions(legalActionsForPlayer(noBlock, "ai", { declaredAttackers: ["a"] }), "declare-blocker")).toHaveLength(0);
    // a shadow blocker CAN block it → a block option appears
    const canBlock = st({ userBf: [shadowAtt], aiBf: [cr("Soltari", "b1", "ai", { oracle: "Shadow" })], step: "declare-blockers" });
    expect(filterActions(legalActionsForPlayer(canBlock, "ai", { declaredAttackers: ["a"] }), "declare-blocker").length).toBeGreaterThanOrEqual(1);
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

describe("EVADE — EVASION-QUALIFIER: parsed 'can't be blocked by [qualifier]' restrictions", () => {
  const setup = (attOracle, blockerOpts = {}) => {
    const att = cr("Attacker", "a", "user", { oracle: attOracle });
    const blk = cr("Blocker", "b", "ai", blockerOpts);
    const s = st({ userBf: [att], aiBf: [blk] });
    return canBlockAttacker(s, "b", "a", "ai");
  };

  // ── CLASSIFIER: MUST_STAY_HIGH — these bodies flip native-body ──
  it("MUST_STAY_HIGH: color restriction bodies are native-body", () => {
    // Dauthi Horror: "This creature can't be blocked by white creatures."
    expect(classifyCard({ type: "Creature — Shade", name: "Dauthi Horror", oracle: "This creature can't be blocked by white creatures." })).toBe("native-body");
    // Red + Blue + Black + Green
    for (const color of ["blue", "black", "red", "green"]) {
      expect(classifyCard({ type: "Creature — Beast", name: "X", oracle: `This creature can't be blocked by ${color} creatures.` })).toBe("native-body");
    }
  });

  it("MUST_STAY_HIGH: keyword restriction bodies are native-body", () => {
    // Gnat Alley Creeper: "This creature can't be blocked by creatures with flying."
    expect(classifyCard({ type: "Creature — Human Rogue", name: "Gnat Alley Creeper", oracle: "This creature can't be blocked by creatures with flying." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Human", name: "X", oracle: "This creature can't be blocked by creatures with horsemanship." })).toBe("native-body");
  });

  it("MUST_STAY_HIGH: power restriction bodies are native-body", () => {
    // Giltgrove Stalker: "This creature can't be blocked by creatures with power 2 or less."
    expect(classifyCard({ type: "Creature — Elf Scout", name: "Giltgrove Stalker", oracle: "This creature can't be blocked by creatures with power 2 or less." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Human", name: "Lydia Frye", oracle: "Lydia Frye can't be blocked by creatures with power 3 or greater." })).toBe("native-body");
  });

  it("MUST_STAY_HIGH: subtype restriction bodies are native-body", () => {
    // Bog Rats: "This creature can't be blocked by Walls."
    expect(classifyCard({ type: "Creature — Rat", name: "Bog Rats", oracle: "This creature can't be blocked by Walls." })).toBe("native-body");
    // Creature tokens
    expect(classifyCard({ type: "Creature — Scout", name: "Rubblebelt Runner", oracle: "Rubblebelt Runner can't be blocked by creature tokens." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Human", name: "X", oracle: "This creature can't be blocked by Dinosaurs." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Insect", name: "X", oracle: "This creature can't be blocked by Humans." })).toBe("native-body");
  });

  it("MUST_STAY_HIGH: with own-body keywords alongside the restriction", () => {
    expect(classifyCard({ type: "Creature — Spirit", name: "X", oracle: "Flying\nThis creature can't be blocked by white creatures." })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Cat", name: "X", oracle: "Trample\nThis creature can't be blocked by creatures with power 4 or greater." })).toBe("native-body");
  });

  // BLOCK-COUNT CAP (CR 509.1c, the menace-inverse) — the SELF "can't be blocked by more than one creature" is now
  // MODELED (isBlockedByAtMostOne + the legalBlockerActions ≤1 cap), so a body whose only text is that static flips.
  it("BLOCK-COUNT CAP: self 'more than one creature' restriction flips native-body (enforced at block declaration)", () => {
    // Charging Rhino, Norwood Riders, Bristling Boar, Stalking Tiger, Ironhoof Ox — vanilla + the cap.
    expect(classifyCard({ type: "Creature — Rhino", name: "Charging Rhino", oracle: "This creature can't be blocked by more than one creature." })).toBe("native-body");
  });

  // ── CLASSIFIER: FP-GUARD — must NOT flip (still body-only) ──
  it("FP-GUARD: team grants stay body-only (the cap is self-only, not a group static)", () => {
    // "Each creature you control can't be blocked by more than one creature." — a TEAM grant (not "this creature");
    // the block-count-cap matcher is anchored to the self subject, so these stay body-only (the group static isn't
    // enforced by the per-attacker cap, which reads the attacker's OWN card).
    expect(classifyCard({ type: "Creature — Human", name: "Yuan Shao", oracle: "Each creature you control can't be blocked by more than one creature." })).toBe("body-only");
    expect(classifyCard({ type: "Enchantment", name: "Familiar Ground", oracle: "Each creature you control can't be blocked by more than one creature." })).toBe("body-only");
  });

  it("FP-GUARD: compound OR restriction stays body-only", () => {
    // "can't be blocked by Knights or Walls" — compound, not modeled
    expect(classifyCard({ type: "Creature — Warrior", name: "X", oracle: "This creature can't be blocked by Knights or Walls." })).toBe("body-only");
  });

  it("FP-GUARD: 'can't be blocked by creatures with greater power' stays body-only (dynamic comparison)", () => {
    // "greater power" without a fixed N is relative to this creature — not modeled.
    expect(classifyCard({ type: "Creature — Dinosaur", name: "Prehistoric Pet", oracle: "This creature can't be blocked by creatures with greater power." })).toBe("body-only");
  });

  it("FP-GUARD: novel unknown qualifiers stay body-only", () => {
    // Phoebe, Head of S.N.E.A.K.: flavor-text — novel qualifier, safely stays body-only.
    expect(classifyCard({ type: "Creature — Human Rogue", name: "Phoebe, Head of S.N.E.A.K.", oracle: "Phoebe can't be blocked by creatures with flavor text." })).toBe("body-only");
    // "can't be blocked by enchanted creatures" — complex type, not in our set
    expect(classifyCard({ type: "Creature — Cat", name: "X", oracle: "This creature can't be blocked by enchanted creatures." })).toBe("body-only");
  });

  // ── ENFORCEMENT: canBlockAttacker ──
  it("color restriction: blocker of restricted color can't block", () => {
    // attacker: can't be blocked by white; blocker is white → can't block
    expect(setup("This creature can't be blocked by white creatures.", { colors: ["W"] })).toBe(false);
    // blocker is blue → can block (not the restricted color)
    expect(setup("This creature can't be blocked by white creatures.", { colors: ["U"] })).toBe(true);
    // attacker: can't be blocked by black; black blocker can't block, non-black can
    expect(setup("This creature can't be blocked by black creatures.", { colors: ["B"] })).toBe(false);
    expect(setup("This creature can't be blocked by black creatures.", { colors: ["G"] })).toBe(true);
  });

  it("keyword restriction: blocker with the keyword can't block", () => {
    // attacker: can't be blocked by creatures with flying; flying blocker can't block
    expect(setup("This creature can't be blocked by creatures with flying.", { oracle: "Flying" })).toBe(false);
    // non-flying blocker can block
    expect(setup("This creature can't be blocked by creatures with flying.", { oracle: "" })).toBe(true);
    // horsemanship restriction
    expect(setup("This creature can't be blocked by creatures with horsemanship.", { oracle: "Horsemanship" })).toBe(false);
    expect(setup("This creature can't be blocked by creatures with horsemanship.", { oracle: "" })).toBe(true);
  });

  it("power restriction: power-le — blocker with power ≤ N can't block", () => {
    // attacker: can't be blocked by creatures with power 2 or less
    expect(setup("This creature can't be blocked by creatures with power 2 or less.", { power: 2 })).toBe(false);  // power 2 ≤ 2
    expect(setup("This creature can't be blocked by creatures with power 2 or less.", { power: 1 })).toBe(false);  // power 1 ≤ 2
    expect(setup("This creature can't be blocked by creatures with power 2 or less.", { power: 3 })).toBe(true);   // power 3 > 2 → CAN block
  });

  it("power restriction: power-ge — blocker with power ≥ N can't block", () => {
    // attacker: can't be blocked by creatures with power 3 or greater
    expect(setup("This creature can't be blocked by creatures with power 3 or greater.", { power: 3 })).toBe(false); // power 3 ≥ 3
    expect(setup("This creature can't be blocked by creatures with power 3 or greater.", { power: 5 })).toBe(false); // power 5 ≥ 3
    expect(setup("This creature can't be blocked by creatures with power 3 or greater.", { power: 2 })).toBe(true);  // power 2 < 3 → CAN block
  });

  it("subtype restriction: blocker with matching subtype can't block", () => {
    const wallCard = cr("Wall of Stone", "b", "ai", { type: "Creature — Wall", oracle: "Defender" });
    const bearCard = cr("Bear", "b", "ai", { type: "Creature — Bear" });
    const bogRats = cr("Bog Rats", "a", "user", { oracle: "This creature can't be blocked by Walls." });
    const s1 = st({ userBf: [bogRats], aiBf: [wallCard] });
    expect(canBlockAttacker(s1, "b", "a", "ai")).toBe(false);   // Wall can't block Bog Rats
    const s2 = st({ userBf: [bogRats], aiBf: [bearCard] });
    expect(canBlockAttacker(s2, "b", "a", "ai")).toBe(true);    // Bear can block fine
  });

  it("token restriction: creature tokens can't block (real card.token flag, not a fabricated field)", () => {
    // A REAL token: the flag lives on the CARD (`card.token`), exactly as tokens.js/amass.js mint it.
    const tokenCreature = { id: "b", card: { name: "Goblin", type: "Token Creature — Goblin", power: 1, toughness: 1, oracle: "", token: true }, controller: "ai", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
    const normCreature = cr("Regular", "b", "ai");
    const attNamed = cr("Rubblebelt Runner", "a2", "user", { oracle: "Rubblebelt Runner can't be blocked by creature tokens." });
    const s1 = st({ userBf: [attNamed], aiBf: [tokenCreature] });
    expect(canBlockAttacker(s1, "b", "a2", "ai")).toBe(false);  // token can't block
    const s2 = st({ userBf: [attNamed], aiBf: [normCreature] });
    expect(canBlockAttacker(s2, "b", "a2", "ai")).toBe(true);   // non-token can block
  });

  it("subtype restriction: 'Oxen' maps to the real subtype 'Ox' (irregular plural — Ox Drover)", () => {
    // Ox Drover: "This creature can't be blocked by Oxen." The token it makes is a 2/4 Ox — subtype "Ox".
    const oxBlocker = cr("Ox Token", "b", "ai", { type: "Token Creature — Ox" });
    const bear = cr("Bear", "b", "ai", { type: "Creature — Bear" });
    const oxDrover = cr("Ox Drover", "a", "user", { oracle: "This creature can't be blocked by Oxen." });
    const s1 = st({ userBf: [oxDrover], aiBf: [oxBlocker] });
    expect(canBlockAttacker(s1, "b", "a", "ai")).toBe(false);   // an Ox can't block (subtype matches)
    const s2 = st({ userBf: [oxDrover], aiBf: [bear] });
    expect(canBlockAttacker(s2, "b", "a", "ai")).toBe(true);    // a Bear can block fine
  });
});
