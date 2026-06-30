/**
 * fight.test.js — ETB-FIGHT (CR 701.12) atom + clause parser (slice ETB-FIGHT, branch wave2b-fight).
 *
 * Covers the BUILD-NEW fight subsystem: the source creature and the chosen creature each deal damage
 * equal to their power to the OTHER, SIMULTANEOUSLY (CR 701.12a — both amounts locked from pre-fight
 * P/T, then a SINGLE lethal SBA pass). Verified:
 *   - a 5/4 fights a 3/3 → both take damage simultaneously; the 3/3 dies (5≥3), the 5/4 survives (3<4);
 *   - a 2/2 fights a 2/2 → both die on ONE SBA pass (mutual lethality);
 *   - a deathtouch SOURCE kills any-toughness target (and a deathtouch TARGET kills the source);
 *   - power read AT RESOLUTION, not parse (buff the source between parse and resolve → higher damage);
 *   - "up to one" with no opponent creature → a clean no-op (the declined no-target cast);
 *   - parseEffectClause("It fights target creature you don't control.","Creature") → HIGH, op "fight";
 *   - atomTargetIntent({op:"fight", targetType:"creature"}) === "enemy" (the load-bearing trigger-route).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { parseEffectClause, atomTargetIntent } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, addCounter } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

// Two-player board: `mine` on user's battlefield, `theirs` on ai's. Both real creatures.
function board(mine = [], theirs = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine },
      ai: { ...s.players.ai, battlefield: theirs },
    },
  };
}
const creature = (id, name, power, toughness, extra = {}, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Beast", power, toughness, ...extra }, controller, summoningSick: false });

// Resolve the fight atom with the source threaded as ctx.sourceId and the chosen target in ctx.targets
// (exactly as the trigger flush threads them: an "enemy"-intent atom gets an opponent's creature).
const fight = (s, { sourceId, targetId, optionalTarget = false }) =>
  resolveAtom(
    s,
    { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], optionalTarget },
    { controller: "user", sourceId, targets: targetId ? [{ type: "creature", id: targetId, controller: "ai" }] : [] },
  );

const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const inGy = (s, pid, name) => s.players[pid].graveyard.some((c) => c.name === name);

describe("ETB-FIGHT resolver — simultaneous two-way damage (CR 701.12a)", () => {
  it("a 5/4 fights a 3/3 → both take damage simultaneously; the 3/3 dies (5≥3), the 5/4 survives (3<4)", () => {
    const src = creature("src", "Apex", 5, 4, {}, "user");
    const tgt = creature("tgt", "Bear", 3, 3, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(false);      // the 3/3 took 5 → lethal → dead
    expect(inGy(s, "ai", "Bear")).toBe(true);
    expect(onBf(s, "user", "src")).toBe(true);     // the 5/4 took 3 < 4 → survives
    expect(findPermanent(s, "src").permanent.damageMarked).toBe(3); // damage marked, not life
  });

  it("a 2/2 fights a 2/2 → BOTH die on one SBA pass (mutual lethality, no sequential SBA between hits)", () => {
    const src = creature("src", "Mauler", 2, 2, {}, "user");
    const tgt = creature("tgt", "Ox", 2, 2, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "user", "src")).toBe(false);    // source dealt 2 to a 2-toughness foe → both lethal
    expect(onBf(s, "ai", "tgt")).toBe(false);
    expect(inGy(s, "user", "Mauler")).toBe(true);
    expect(inGy(s, "ai", "Ox")).toBe(true);
  });

  it("a SOURCE killed by the fight still dealt its locked-in damage (a 1/1 fights a 5/5 → both die)", () => {
    // The 1/1 source dies to the 5/5's 5 damage, but its own 1 damage was marked BEFORE the SBA; pair
    // it with deathtouch below for the any-toughness kill. Here the 1 < 5 so only the source dies — the
    // 5/5 survives with 1 marked, proving the source's hit landed even as it died (CR 701.12c).
    const src = creature("src", "Mouse", 1, 1, {}, "user");
    const tgt = creature("tgt", "Giant", 5, 5, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "user", "src")).toBe(false);    // 1/1 took 5 → dead
    expect(onBf(s, "ai", "tgt")).toBe(true);       // 5/5 took 1 < 5 → survives
    expect(findPermanent(s, "tgt").permanent.damageMarked).toBe(1); // the dying source's hit landed
  });
});

describe("ETB-FIGHT resolver — deathtouch (CR 702.2c)", () => {
  it("a deathtouch SOURCE kills any-toughness target (1/1 deathtouch fights a 5/5 → the 5/5 dies)", () => {
    const src = creature("src", "Adder", 1, 1, { keywords: ["Deathtouch"] }, "user");
    const tgt = creature("tgt", "Giant", 5, 5, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(false);      // 1 deathtouch damage is lethal → dead
    expect(onBf(s, "user", "src")).toBe(false);    // the 1/1 took 5 → also dead (no deathtouch needed there)
  });

  it("a deathtouch TARGET kills the source (5/4 source fights a 1/1 deathtouch → the 5/4 dies)", () => {
    const src = creature("src", "Brute", 5, 4, {}, "user");
    const tgt = creature("tgt", "Viper", 1, 1, { keywords: ["Deathtouch"] }, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "user", "src")).toBe(false);    // 1 deathtouch damage from the viper is lethal
    expect(onBf(s, "ai", "tgt")).toBe(false);      // the viper took 5 → dead too
  });
});

describe("ETB-FIGHT resolver — power read AT RESOLUTION, edge cases", () => {
  it("power is read AT RESOLUTION (buff the source AFTER 'parse', before resolve → higher damage)", () => {
    // Parse-time the source is a 1/4; we add three +1/+1 counters (it's now a 4/7) BEFORE resolving the
    // fight — the resolver must read 4, not the printed 1, and kill the 3/3 (4≥3). Proves no parse-time bake.
    const src = creature("src", "Grower", 1, 4, {}, "user");
    const tgt = creature("tgt", "Bear", 3, 3, {}, "ai");
    let s = board([src], [tgt]);
    s = addCounter(s, { permanentId: "src", type: "+1/+1", amount: 3 }); // now a 4/7
    s = fight(s, { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(false);      // took 4 ≥ 3 → dead (printed-1 would have left it alive)
    expect(onBf(s, "user", "src")).toBe(true);     // 4/7 took 3 < 7 → survives
  });

  it("a 0-power fighter deals nothing (floor at 0 — a 0/3 fights a 2/2: only the 0/3 takes damage)", () => {
    const src = creature("src", "Wall", 0, 3, {}, "user");
    const tgt = creature("tgt", "Ox", 2, 2, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(true);       // took 0 → no damage marked
    expect(findPermanent(s, "tgt").permanent.damageMarked).toBe(0);
    expect(findPermanent(s, "src").permanent.damageMarked).toBe(2); // the 0/3 took the foe's 2
    expect(onBf(s, "user", "src")).toBe(true);     // 2 < 3 → survives
  });

  it("'up to one' with NO opponent creature → a clean no-op (declined no-target cast, nothing dies)", () => {
    const src = creature("src", "Loner", 4, 4, {}, "user");
    const s = fight(board([src], []), { sourceId: "src", targetId: null, optionalTarget: true });
    expect(onBf(s, "user", "src")).toBe(true);     // the source is untouched
    expect(findPermanent(s, "src").permanent.damageMarked).toBe(0);
  });
});

describe("ETB-FIGHT parser", () => {
  it("parseEffectClause('It fights target creature you don\\'t control.','Creature') → HIGH, op 'fight'", () => {
    const program = parseEffectClause("It fights target creature you don't control.", "Creature");
    expect(program.confidence).toBe("high");
    expect(program.atoms).toHaveLength(1);
    expect(program.atoms[0]).toMatchObject({
      op: "fight",
      targetType: "creature",
      restrictions: [{ kind: "controller", who: "opponent" }],
      optionalTarget: false,
    });
  });

  it("the 'up to one' head sets optionalTarget:true (Kogla / Apex Altisaur)", () => {
    const program = parseEffectClause("It fights up to one target creature you don't control.", "Creature");
    expect(program.confidence).toBe("high");
    expect(program.atoms[0]).toMatchObject({ op: "fight", optionalTarget: true });
  });

  it("'This creature fights target creature you don't control.' parses the head DIRECTLY", () => {
    const program = parseEffectClause("This creature fights target creature you don't control.", "Creature");
    expect(program.confidence).toBe("high");
    expect(program.atoms[0]).toMatchObject({ op: "fight", optionalTarget: false });
  });

  it("a 'you control' source-bound fight stays LOW (Arbiter — CREED, never one-sided)", () => {
    // The own-side half (Prey Upon) is enemy-agnostic — the source head only accepts "you don't control"
    // (the bare enemy form) or "another target creature" (the source-bound distinct form below). A bare
    // "you control" dealee on a source head never appears in the corpus and stays LOW.
    expect(parseEffectClause("It fights target creature you control.", "Creature").confidence).toBe("low");
  });

  it("atomTargetIntent({op:'fight', targetType:'creature'}) === 'enemy' (load-bearing trigger route)", () => {
    expect(atomTargetIntent({ op: "fight", targetType: "creature" })).toBe("enemy");
  });

  // FP GUARD (adversarial review): the fight atom binds its fighter to ctx.sourceId, so it is only correct as
  // the SOLE atom. A pump-then-fight SPELL ("Target creature you control gets +X/+Y. It fights …") splits into
  // [pump, fight] where "it" is the PUMPED target, not the source — fightAtomMisplaced forces the whole program
  // LOW (→ Arbiter) so the spell never half-resolves (pump applies, fight silently no-ops on a sourceId-less spell).
  it("CREED — a pump-then-fight SPELL stays LOW (fight not the sole atom)", () => {
    // Epic Confrontation (Sorcery), Swift Kick (Instant) — real printed cards the bare matcher over-matched.
    expect(parseEffectClause("Target creature you control gets +1/+2 until end of turn. It fights target creature you don't control.", "Sorcery").confidence).toBe("low");
    expect(parseEffectClause("Target creature you control gets +2/+0 until end of turn. It fights target creature you don't control.", "Instant").confidence).toBe("low");
    // …but a SOLE fight clause (the ETB/triggered-ability form) is still HIGH on the same Instant trigger cardType.
    expect(parseEffectClause("It fights target creature you don't control.", "Instant").confidence).toBe("high");
  });
});

// ===== SOURCE-BOUND "FIGHT ANOTHER TARGET CREATURE" (CR 701.12) =====
// "[this creature|it] fights another target creature" (Brash Taunter's activated ability, Territorial
// Allosaurus' kicked-ETB, Atzocan Archer's "you may have it fight …", Nessian Wilds Ravager's tribute
// if-not). Fighter = the SOURCE (ctx.sourceId); "another" = the dealee must be DISTINCT from the source.
describe("ETB-FIGHT — source-bound 'another target creature' parse (CR 701.12)", () => {
  it("'This creature fights another target creature.' → HIGH source-bound fight (Brash Taunter / Territorial Allosaurus)", () => {
    const p = parseEffectClause("This creature fights another target creature.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight", targetType: "creature", optionalTarget: false, distinct: true });
    // restricted to an enemy dealee → enumeration EXCLUDES the source (a creature never fights itself).
    expect(p.atoms[0].restrictions).toContainEqual({ kind: "controller", who: "opponent" });
  });

  it("'It fights another target creature.' → HIGH (the it→this-creature head, source-bound)", () => {
    const p = parseEffectClause("It fights another target creature.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight", distinct: true });
  });

  it("'you may have it fight another target creature' → HIGH + optional (Atzocan Archer; α2 peels 'you may')", () => {
    const p = parseEffectClause("You may have it fight another target creature.", "Creature");
    expect(p.confidence).toBe("high");
    // α2 stamps optional:true on the peeled inner fight atom → a real yes/no, never mandatory.
    expect(p.atoms[0]).toMatchObject({ op: "fight", optional: true, distinct: true });
  });

  it("'you may have this creature fight another target creature' → HIGH + optional (Nessian Wilds Ravager if-not)", () => {
    const p = parseEffectClause("You may have this creature fight another target creature.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight", optional: true, distinct: true });
  });

  it("CREED — a source-bound 'fight another' SPELL with a pump rider stays LOW (fight not the sole atom)", () => {
    // fightAtomMisplaced forces the WHOLE program LOW when fight isn't the sole atom — never a half-resolve.
    expect(parseEffectClause("Target creature you control gets +2/+2 until end of turn. It fights another target creature.", "Sorcery").confidence).toBe("low");
  });
});

describe("ETB-FIGHT — source-bound 'another' RUNTIME (CR 701.12)", () => {
  it("a 4/4 fights another 2/2 → both deal power-damage; the 2/2 dies, the 4/4 survives (Territorial Allosaurus)", () => {
    const src = creature("src", "Allosaurus", 4, 4, {}, "user");
    const tgt = creature("tgt", "Goat", 2, 2, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(false);     // 2/2 took 4 → lethal
    expect(onBf(s, "user", "src")).toBe(true);    // 4/4 took 2 < 4 → survives
    expect(findPermanent(s, "src").permanent.damageMarked).toBe(2); // took the dealee's power back
  });

  it("a 3/3 fights another 3/3 → BOTH die on one SBA pass (mutual lethality)", () => {
    const src = creature("src", "Taunter", 3, 3, {}, "user");
    const tgt = creature("tgt", "Rival", 3, 3, {}, "ai");
    const s = fight(board([src], [tgt]), { sourceId: "src", targetId: "tgt" });
    expect(onBf(s, "ai", "tgt")).toBe(false);
    expect(onBf(s, "user", "src")).toBe(false);   // the source dies too — two-way, simultaneous
    expect(inGy(s, "user", "Taunter")).toBe(true);
    expect(inGy(s, "ai", "Rival")).toBe(true);
  });

  it("'another' (CR 701.12) — the source can NEVER fight itself even if its own id is fed as the target", () => {
    // Defense in depth: a malformed ctx that aims the source at itself is a clean no-op (no self-damage).
    const src = creature("src", "Solo", 5, 5, {}, "user");
    const s = resolveAtom(
      board([src], []),
      { op: "fight", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], distinct: true },
      { controller: "user", sourceId: "src", targets: [{ type: "creature", id: "src", controller: "user" }] },
    );
    expect(onBf(s, "user", "src")).toBe(true);            // still alive
    expect(findPermanent(s, "src").permanent.damageMarked || 0).toBe(0); // no fabricated self-damage
  });
});
