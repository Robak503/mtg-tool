/**
 * earthbendExperience.test.js — EARTHBEND-PR3: experience counter tracking + Toph's two triggers.
 *
 * Toph, Earthbending Master:
 *   "Landfall — Whenever a land you control enters, you get an experience counter."
 *   "Whenever you attack, earthbend X, where X is the number of experience counters you have."
 *
 * Pieces under test:
 *   1. Parser: "you get an experience counter" → gain-experience atom (HIGH)
 *   2. Parser: "earthbend X, where X is the number of experience counters you have" → earthbend+countSource (HIGH)
 *   3. Trigger detection: Toph's landfall trigger detects as "landfall" + HIGH effect
 *   4. Trigger detection: Toph's attack trigger detects as "youAttack" + HIGH effect
 *   5. applyGainExperience: increments player.experience
 *   6. applyEarthbend with countSource: reads player.experience at resolution
 *   7. checkAttackTriggers: fires youAttack once per combat (not per attacker)
 */
import { describe, it, expect } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { createGameState, createPermanent, addExperience } from "./gameState.js";
import { applyEarthbend, resolveAtom } from "./effects/effectAtoms.js";
import { checkAttackTriggers } from "./triggers.js";
import { permanentIsCreature } from "./layers.js";

// ─── card fixtures ────────────────────────────────────────────────────────────

const TOPH_ORACLE = [
  "Landfall — Whenever a land you control enters, you get an experience counter.",
  "Whenever you attack, earthbend X, where X is the number of experience counters you have. (Target land you control becomes a 0/0 creature with haste that's still a land. Put X +1/+1 counters on it. When it dies or is exiled, return it to the battlefield tapped.)",
].join("\n");

const TOPH = { name: "Toph, Earthbending Master", type: "Legendary Creature — Human Warrior Ally", oracle: TOPH_ORACLE };

// ─── 1. Parser: gain-experience atom ──────────────────────────────────────────

describe("gain-experience atom — parse", () => {
  it("'you get an experience counter' → gain-experience count:1 HIGH", () => {
    const prog = parseEffectClause("You get an experience counter.", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "gain-experience", count: 1 });
  });

  it("'you get 3 experience counters' → gain-experience count:3 HIGH", () => {
    const prog = parseEffectClause("You get three experience counters.", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "gain-experience", count: 3 });
  });

  it("singular 'counter' also parses", () => {
    const prog = parseEffectClause("You get an experience counter.", "Creature");
    expect(prog.atoms[0].op).toBe("gain-experience");
  });
});

// ─── 2. Parser: earthbend X with countSource ──────────────────────────────────

describe("earthbend X with countSource — parse", () => {
  it("'earthbend X, where X is the number of experience counters you have' → earthbend+countSource HIGH", () => {
    const prog = parseEffectClause("Earthbend X, where X is the number of experience counters you have.", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "earthbend", countSource: { kind: "experienceCounters" } });
    expect(prog.atoms[0].count).toBeUndefined();
  });

  it("literal earthbend N still works after the new branch", () => {
    const prog = parseEffectClause("Earthbend 4.", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "earthbend", count: 4 });
    expect(prog.atoms[0].countSource).toBeUndefined();
  });
});

// ─── 3 & 4. Trigger detection for Toph ────────────────────────────────────────

describe("Toph trigger detection", () => {
  it("landfall trigger: event=landfall, effect=HIGH gain-experience", () => {
    const trigs = detectTriggers(TOPH);
    const lf = trigs.find((d) => d.event === "landfall");
    expect(lf).toBeTruthy();
    expect(lf.scope).toBe("landYouControl");
    const prog = parseEffectClause(lf.effectClause, "Creature");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "gain-experience", count: 1 });
  });

  it("attack trigger: event=youAttack, effect=HIGH earthbend+countSource", () => {
    const trigs = detectTriggers(TOPH);
    const atk = trigs.find((d) => d.event === "youAttack");
    expect(atk).toBeTruthy();
    expect(atk.scope).toBe("you");
    const prog = parseEffectClause(atk.effectClause, "Creature");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "earthbend", countSource: { kind: "experienceCounters" } });
  });

  it("Toph has exactly 2 detected triggers", () => {
    expect(detectTriggers(TOPH).length).toBe(2);
  });
});

// ─── 5. applyGainExperience ───────────────────────────────────────────────────

describe("applyGainExperience", () => {
  it("increments player.experience by 1", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    expect(s.players.user.experience).toBe(0);
    const next = resolveAtom(s, { op: "gain-experience", count: 1 }, { controller: "user" });
    expect(next.players.user.experience).toBe(1);
  });

  it("accumulates across multiple calls", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = resolveAtom(s, { op: "gain-experience", count: 1 }, { controller: "user" });
    s = resolveAtom(s, { op: "gain-experience", count: 1 }, { controller: "user" });
    s = resolveAtom(s, { op: "gain-experience", count: 1 }, { controller: "user" });
    expect(s.players.user.experience).toBe(3);
  });

  it("addExperience helper correctly sets the field", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const next = addExperience(s, { playerId: "user", amount: 5 });
    expect(next.players.user.experience).toBe(5);
  });
});

// ─── 6. applyEarthbend with countSource reads player.experience ────────────────

describe("applyEarthbend — countSource reads player.experience", () => {
  it("animates a land with N counters = experience total", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    // Give the user 4 experience counters
    s = addExperience(s, { playerId: "user", amount: 4 });
    // Put a non-creature land on the battlefield
    const forest = createPermanent({ card: { name: "Forest", type: "Basic Land — Forest" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [forest] } } };

    const atom = { op: "earthbend", countSource: { kind: "experienceCounters" } };
    const next = applyEarthbend(s, atom, { controller: "user" });

    // The land should now be a creature
    const perm = next.players.user.battlefield.find((p) => p.id === forest.id);
    expect(perm).toBeTruthy();
    expect(permanentIsCreature(next, forest.id)).toBe(true);
    // Should have 4 +1/+1 counters (= experience total)
    expect(perm.counters?.["+1/+1"]).toBe(4);
  });

  it("0 experience → land animates as 0/0 and dies to SBA (graveyard, not battlefield)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const forest = createPermanent({ card: { name: "Forest", type: "Basic Land — Forest" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [forest] } } };

    const atom = { op: "earthbend", countSource: { kind: "experienceCounters" } };
    const next = applyEarthbend(s, atom, { controller: "user" });

    // A 0/0 with no counters dies immediately to CR 704.5f SBA — the land is not on the battlefield
    const stillOnBf = next.players.user.battlefield.find((p) => p.id === forest.id);
    expect(stillOnBf).toBeUndefined();
  });
});

// ─── 7. checkAttackTriggers fires youAttack once per combat ────────────────────

describe("checkAttackTriggers — youAttack fires once per combat", () => {
  it("Toph on battlefield fires youAttack once when any attacker is declared", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const toph = createPermanent({ card: TOPH, controller: "user" });
    const bear = createPermanent({ card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [toph, bear] } },
      combat: { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }] },
    };

    const next = checkAttackTriggers(s);
    const youAttackTrigs = (next.pendingTriggers || []).filter((t) => t.event === "youAttack");
    expect(youAttackTrigs.length).toBe(1);
    expect(youAttackTrigs[0].source.name).toBe("Toph, Earthbending Master");
  });

  it("two attackers declared → youAttack still fires only once (not twice)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const toph = createPermanent({ card: TOPH, controller: "user" });
    const bear = createPermanent({ card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const elk = createPermanent({ card: { name: "Elk", type: "Creature — Elk", power: 3, toughness: 3 }, controller: "user" });
    s = { ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [toph, bear, elk] } },
      combat: { attackers: [
        { permanentId: bear.id, attackingPlayer: "user", defender: "ai" },
        { permanentId: elk.id, attackingPlayer: "user", defender: "ai" },
      ] },
    };

    const next = checkAttackTriggers(s);
    const youAttackTrigs = (next.pendingTriggers || []).filter((t) => t.event === "youAttack");
    expect(youAttackTrigs.length).toBe(1);
  });

  it("no Toph on battlefield → no youAttack triggers", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } },
      combat: { attackers: [{ permanentId: bear.id, attackingPlayer: "user", defender: "ai" }] },
    };

    const next = checkAttackTriggers(s);
    const youAttackTrigs = (next.pendingTriggers || []).filter((t) => t.event === "youAttack");
    expect(youAttackTrigs.length).toBe(0);
  });
});
