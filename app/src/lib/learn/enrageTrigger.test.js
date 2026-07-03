/**
 * ENRAGE / DAMAGE-RECEIVED trigger event (CR 603.2 / 207.2c) — "Enrage — Whenever this creature is dealt
 * damage, <effect>". detectTriggers recognizes the SELF-scope shape (the "Enrage —" ability-word label is
 * stripped, CR 207.2c); combatResolution + applyDamageEffect emit the event ONCE per creature per damage
 * EVENT with the TOTAL amount (CR 510.2 — combat damage dealt simultaneously, so multiple simultaneous sources trigger it exactly once; CR 120.8 —
 * never on 0/prevented damage). The effect rides the existing flush → EffectProgram compiler, and a card
 * whose enrage effect is an already-modeled atom flips body-only → native-trigger. Engine-first: the trigger
 * must actually fire + resolve, or the card is a false positive (CLAUDE.md §1.2).
 *
 * Composes with the Wave-5a damage seam (the doubled amount enrages on the doubled number) and the Wave-5b
 * token-copy atom (Polyraptor copies this creature).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDealtDamageTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyDamageEffect } from "./spellEffects.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ddEvents = (oracle, type = "Creature — Dinosaur", name = "X") =>
  detectTriggers({ name, type, oracle }).filter((d) => d.event === "dealtDamage");

const perm = (id, oracle, over = {}) =>
  createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Dinosaur", power: 4, toughness: 6, oracle, ...(over.card || {}) }, controller: over.controller || "user", summoningSick: false });

// A combat where `attackerId` (the enrage creature) is blocked by `blockers` (ai). Returns the post-step state.
function combat(userBf, aiBf, attackers, blockers, userExtra = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40, ...userExtra },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}
function resolveAll(s) { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; }
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
const find = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id);
const C = (oracle, type = "Creature — Dinosaur", name = "X") => ({ name, type, oracle, mana: "{4}{G}", power: "4", toughness: "5" });

// ─── Detection ──────────────────────────────────────────────────────────────

describe("ENRAGE — detection", () => {
  it("detects the bare self shape (Enrage label stripped) → dealtDamage / self", () => {
    expect(ddEvents("Enrage — Whenever this creature is dealt damage, draw a card.")[0])
      .toMatchObject({ event: "dealtDamage", scope: "self", effectClause: "draw a card" });
  });
  it("detects the card-name self-ref form ('Whenever <name> is dealt damage')", () => {
    expect(ddEvents("Enrage — Whenever Ripjaw Raptor is dealt damage, draw a card.", "Creature — Dinosaur", "Ripjaw Raptor")[0])
      .toMatchObject({ event: "dealtDamage", scope: "self" });
  });
  it("rewrites the self 'on it' counter referent → 'on this creature' (IT-COUNTER)", () => {
    expect(ddEvents("Enrage — Whenever this creature is dealt damage, put a +1/+1 counter on it.")[0].effectClause)
      .toBe("put a +1/+1 counter on this creature");
    expect(ddEvents("Enrage — Whenever this creature is dealt damage, put two +1/+1 counters on it.")[0].effectClause)
      .toBe("put two +1/+1 counters on this creature");
  });
  it("does NOT detect 'is dealt damage BY' (the Sengir family — a DIFFERENT event)", () => {
    // CR: "Whenever a creature dealt damage by Sengir Vampire this turn dies, …" — a dies trigger, not enrage.
    expect(ddEvents("Whenever a creature dealt damage by Sengir Vampire this turn dies, put a +1/+1 counter on Sengir Vampire.", "Creature — Vampire", "Sengir Vampire")).toHaveLength(0);
  });
  it("does NOT detect a non-self 'whenever a creature is dealt damage' (unmodeled scope → Arbiter)", () => {
    // Death Pits of Rath / Expedited Inheritance — a non-self watcher; left UNDETECTED (safe false-negative).
    expect(ddEvents("Whenever a creature is dealt damage, destroy it.", "Enchantment", "Death Pits of Rath")).toHaveLength(0);
  });
});

// ─── Classification flips (the verified flip set) ─────────────────────────────

describe("ENRAGE — modeled-atom enrage cards flip to native-trigger", () => {
  const cases = [
    ["Ripjaw Raptor", "Enrage — Whenever this creature is dealt damage, draw a card."],
    ["Imperial Ceratops", "Enrage — Whenever this creature is dealt damage, you gain 2 life."],
    ["Ravenous Daggertooth", "Enrage — Whenever this creature is dealt damage, you gain 2 life."],
    ["Snapping Sailback", "Flash\nEnrage — Whenever this creature is dealt damage, put a +1/+1 counter on it. (It must survive the damage to get the counter.)"],
    ["Siegehorn Ceratops", "Enrage — Whenever this creature is dealt damage, put two +1/+1 counters on it. (It must survive the damage to get the counters.)"],
    ["Raptor Hatchling", "Enrage — Whenever this creature is dealt damage, create a 3/3 green Dinosaur creature token with trample."],
    ["Overgrown Armasaur", "Enrage — Whenever this creature is dealt damage, create a 1/1 green Saproling creature token."],
    ["Needletooth Raptor", "Enrage — Whenever this creature is dealt damage, it deals 5 damage to target creature an opponent controls."],
    ["Sun-Crowned Hunters", "Enrage — Whenever this creature is dealt damage, it deals 3 damage to target opponent or planeswalker."],
    ["Frilled Deathspitter", "Enrage — Whenever this creature is dealt damage, it deals 2 damage to target opponent or planeswalker."],
    ["Urban Daggertooth", "Vigilance\nEnrage — Whenever this creature is dealt damage, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)"],
    ["Apex Altisaur", "When this creature enters, it fights up to one target creature you don’t control.\nEnrage — Whenever this creature is dealt damage, it fights up to one target creature you don’t control."],
    ["Polyraptor", "Enrage — Whenever this creature is dealt damage, create a token that’s a copy of this creature."],
    // STEP 5 — basic-land tutor IS modeled, so Ranging Raptors legitimately flips too.
    ["Ranging Raptors", "Enrage — Whenever this creature is dealt damage, you may search your library for a basic land card, put it onto the battlefield tapped, then shuffle."],
    // FRONTIER round 3 — the FILTERED MASS-COUNTER scope ("each OTHER creature you control", CR 113.7 self-exclude)
    // is now modeled (counters.js add-counter scope:youControl excludeSource), so Bellowing Aegisaur flips too.
    ["Bellowing Aegisaur", "Enrage — Whenever this creature is dealt damage, put a +1/+1 counter on each other creature you control."],
    // Cacophodon — its ONLY text is an enrage trigger whose effect is "untap target permanent", now a modeled
    // atom (combatKeywordClauseParser → { op:"untap", targetType:"permanent" }; PERMANENT_PREDICATES.permanent),
    // so the enrage trigger routes natively → native-trigger. (Was pinned body-only below when untap-permanent
    // was unrouted — moved here with the Formidable Speaker untap-permanent slice.)
    ["Cacophodon", "Enrage — Whenever this creature is dealt damage, untap target permanent."],
  ];
  for (const [name, oracle] of cases) {
    it(`${name} → native-trigger`, () => {
      expect(classifyCard(C(oracle, "Creature — Dinosaur", name))).toBe("native-trigger");
    });
  }
});

describe("ENRAGE — unmodeled-effect enrage cards stay non-native (all-or-nothing)", () => {
  const cases = [
    ["Stalwart Speartail (perpetual = Alchemy)", "Enrage — Whenever Stalwart Speartail is dealt damage, other Dinosaurs you control and Dinosaur cards in your hand and library perpetually get +1/+1.\nWhenever Stalwart Speartail attacks, Stalwart Speartail deals 1 damage to each creature and each planeswalker."],
    ["Indoraptor (random opponent + unless-sac)", "Menace\nEnrage — Whenever Indoraptor is dealt damage, choose an opponent at random. Indoraptor deals damage equal to its power to that player unless they sacrifice a nontoken creature of their choice."],
    ["Trapjaw Tyrant (exile-until-leaves)", "Enrage — Whenever this creature is dealt damage, exile target creature an opponent controls until this creature leaves the battlefield."],
    // NOTE: Silverclad Ferocidons ("each opponent sacrifices a permanent of their choice") is now NATIVE via
    // the PERMANENT-EDICT subsystem (effects/atoms/removal.js — the what:"permanent" victim pool); see its
    // native-trigger pin in edicts.test.js. It was previously an unmodeled-enrage example here — premise stale.
    ["Vrondiss (token with its own ability)", "Enrage — Whenever Vrondiss is dealt damage, you may create a 5/4 red and green Dragon Spirit creature token with \"When this token deals damage, sacrifice it.\""],
    // NOTE: Cacophodon ("untap target permanent") is now NATIVE via the untap-permanent atom — see its
    // native-trigger pin above. It was previously an unmodeled-enrage example here — premise stale.
  ];
  for (const [label, oracle] of cases) {
    it(`${label} stays body-only`, () => {
      expect(classifyCard(C(oracle, "Legendary Creature — Dinosaur", "X"))).not.toBe("native-trigger");
    });
  }
});

// ─── Engine-first: the trigger fires + resolves ──────────────────────────────

describe("ENRAGE — engine-first (combat damage)", () => {
  it("Ripjaw Raptor blocked by a 2/2 draws a card and survives", () => {
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.", { card: { toughness: 6, name: "Ripjaw Raptor" } });
    const bear = perm("bear", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    let s = combat([rip], [bear],
      [{ permanentId: "rip", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "rip" }],
      { library: [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }] });
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
    s = flush(s);
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true);
    expect(find(s, "user", "rip")).toBeTruthy();
  });

  it("Imperial Ceratops gains 2 life when blocked", () => {
    const cer = perm("cer", "Enrage — Whenever this creature is dealt damage, you gain 2 life.");
    const bear = perm("bear", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    let s = combat([cer], [bear],
      [{ permanentId: "cer", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "cer" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    expect(s.players.user.life).toBe(42);
  });

  it("Wall of Hope gains AMOUNT-SCALED life when dealt damage (the 'gain that much life' enrage sentinel)", () => {
    // "Whenever this creature is dealt damage, you gain that much life." The amount scales with the damage
    // dealt (ctx.dealtDamageAmount, aliased to combatDamageAmount) — NOT a fixed N. A 4-power blocker deals 4
    // → gain exactly 4 life. (checkDealtDamageTriggers aliases the enrage amount to combatDamageAmount, which
    // the "gain that much life" sentinel reads; combatDamageReferentSatisfied admits it on the dealtDamage event.)
    const wall = perm("wall", "Defender\nWhenever this creature is dealt damage, you gain that much life.", { card: { power: 0, toughness: 8, name: "Wall of Hope" } });
    const hitter = perm("hit", "", { controller: "ai", card: { power: 4, toughness: 2, type: "Creature — Bear" } });
    let s = combat([wall], [hitter],
      [{ permanentId: "hit", attackingPlayer: "ai", defender: "user" }],
      [{ blockerId: "wall", blockingPlayer: "user", attackerId: "hit" }]);
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
    s = flush(s);
    expect(s.players.user.life).toBe(44); // gained exactly the 4 damage the wall took (amount-scaled, not fixed)
  });

  it("Snapping Sailback survives 1 damage → gets a +1/+1 counter", () => {
    const snap = perm("snap", "Enrage — Whenever this creature is dealt damage, put a +1/+1 counter on it.", { card: { power: 3, toughness: 3, name: "Snapping Sailback" } });
    const gob = perm("gob", "", { controller: "ai", card: { power: 1, toughness: 1, type: "Creature — Goblin" } });
    let s = combat([snap], [gob],
      [{ permanentId: "snap", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "gob", blockingPlayer: "ai", attackerId: "snap" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    expect(find(s, "user", "snap").counters).toMatchObject({ "+1/+1": 1 });
  });

  it("Needletooth Raptor pings an opponent's creature for 5 when blocked", () => {
    const need = perm("need", "Enrage — Whenever this creature is dealt damage, it deals 5 damage to target creature an opponent controls.", { card: { power: 4, toughness: 6, name: "Needletooth Raptor" } });
    const bear = perm("bear", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    const victim = perm("vic", "", { controller: "ai", card: { power: 1, toughness: 4, type: "Creature — Beast", name: "Victim" } });
    let s = combat([need], [bear, victim],
      [{ permanentId: "need", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "need" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    // The 4-toughness victim took 5 → dead.
    expect(find(s, "ai", "vic")).toBeFalsy();
  });

  it("AMOUNT-SCALED 'draw that many cards' (Illusory Ambusher) draws = damage dealt", () => {
    const amb = perm("amb", "Whenever this creature is dealt damage, draw that many cards.", { card: { power: 1, toughness: 4, name: "Illusory Ambusher", type: "Creature — Illusion" } });
    const bear = perm("bear", "", { controller: "ai", card: { power: 3, toughness: 3, type: "Creature — Bear" } });
    let s = combat([amb], [bear],
      [{ permanentId: "amb", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "amb" }],
      { library: [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }] });
    s = resolveCombatDamage(s);
    s = flush(s);
    expect(s.players.user.hand.length).toBe(3); // took 3 → drew 3 (ctx.combatDamageAmount alias of the received amount)
  });

  it("Polyraptor blocked makes a token copy of itself (Wave-5b atom)", () => {
    const poly = perm("poly", "Enrage — Whenever this creature is dealt damage, create a token that’s a copy of this creature.", { card: { power: 5, toughness: 5, name: "Polyraptor" } });
    const gob = perm("gob", "", { controller: "ai", card: { power: 1, toughness: 1, type: "Creature — Goblin" } });
    let s = combat([poly], [gob],
      [{ permanentId: "poly", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "gob", blockingPlayer: "ai", attackerId: "poly" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    const polys = s.players.user.battlefield.filter((p) => /Polyraptor/.test(p.card?.name || ""));
    expect(polys.length).toBe(2); // the original + one token copy
  });
});

describe("ENRAGE — engine-first (non-combat damage, applyDamageEffect)", () => {
  it("a burn spell to Ripjaw Raptor fires its draw", () => {
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.", { card: { toughness: 6, name: "Ripjaw Raptor" } });
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [rip], library: [{ id: "lib1", name: "Drawn", type: "Instant", oracle: "" }] } } };
    s = applyDamageEffect(s, { controller: "ai", amount: 3, targetType: "creature", targets: [{ type: "creature", id: "rip" }] });
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
    s = flush(s);
    expect(s.players.user.hand.some((c) => c.id === "lib1")).toBe(true);
  });
});

// ─── FP guards ───────────────────────────────────────────────────────────────

describe("ENRAGE — FP guards", () => {
  it("GUARD 1 — ONCE PER EVENT: blocked by TWO creatures fires exactly once, amount = sum", () => {
    const sieg = perm("sg", "Enrage — Whenever this creature is dealt damage, put two +1/+1 counters on it.", { card: { power: 2, toughness: 8, name: "Siegehorn Ceratops" } });
    const g1 = perm("g1", "", { controller: "ai", card: { power: 1, toughness: 1, type: "Creature — Goblin" } });
    const g2 = perm("g2", "", { controller: "ai", card: { power: 1, toughness: 1, type: "Creature — Goblin" } });
    let s = combat([sieg], [g1, g2],
      [{ permanentId: "sg", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "g1", blockingPlayer: "ai", attackerId: "sg" }, { blockerId: "g2", blockingPlayer: "ai", attackerId: "sg" }]);
    s = resolveCombatDamage(s);
    const pend = (s.pendingTriggers || []).filter((t) => t.event === "dealtDamage");
    expect(pend).toHaveLength(1);                                 // ONE event for two simultaneous blockers
    expect(pend[0].context.dealtDamageAmount).toBe(2);           // total of both (1+1), not per-source
    s = flush(s);
    expect(find(s, "user", "sg").counters).toMatchObject({ "+1/+1": 2 }); // "two counters" once, not 4
  });

  it("GUARD 2 — AMOUNT reflects the Wave-5a damage doubler", () => {
    const sieg = perm("sg", "Enrage — Whenever this creature is dealt damage, put two +1/+1 counters on it.", { card: { power: 5, toughness: 8, name: "Siegehorn Ceratops" } });
    const gore = perm("g", "Double all damage Gorehorn would deal.", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Beast", name: "Gorehorn" } });
    let s = combat([sieg], [gore],
      [{ permanentId: "sg", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "g", blockingPlayer: "ai", attackerId: "sg" }]);
    s = resolveCombatDamage(s);
    const pend = (s.pendingTriggers || []).filter((t) => t.event === "dealtDamage");
    expect(pend[0].context.dealtDamageAmount).toBe(4);          // 2 power doubled → 4 (enrage sees the doubled number)
  });

  it("GUARD 3 — SELF-SCOPE: only the creature dealt damage triggers, bound to itself", () => {
    const rip = perm("A", "Enrage — Whenever this creature is dealt damage, draw a card.", { card: { power: 4, toughness: 6, name: "Ripjaw A" } });
    const plain = perm("B", "", { card: { power: 4, toughness: 6, name: "Plain B", type: "Creature — Beast" } });
    const ba = perm("ba", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    const bb = perm("bb", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    let s = combat([rip, plain], [ba, bb],
      [{ permanentId: "A", attackingPlayer: "user", defender: "ai" }, { permanentId: "B", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "ba", blockingPlayer: "ai", attackerId: "A" }, { blockerId: "bb", blockingPlayer: "ai", attackerId: "B" }]);
    s = resolveCombatDamage(s);
    const pend = (s.pendingTriggers || []).filter((t) => t.event === "dealtDamage");
    expect(pend).toHaveLength(1);                                 // only the enrage creature (A); plain B doesn't fire
    expect(pend[0].source.permanentId).toBe("A");               // bound to A, not B
  });

  it("GUARD 4a — 0 DAMAGE: a 0-power blocker deals no damage → no event", () => {
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.");
    const wall = perm("w", "", { controller: "ai", card: { power: 0, toughness: 4, type: "Creature — Wall" } });
    let s = combat([rip], [wall],
      [{ permanentId: "rip", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "w", blockingPlayer: "ai", attackerId: "rip" }]);
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(0);
  });

  it("GUARD 4b — PREVENTED (fog): no combat damage → no enrage event", () => {
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.");
    const bear = perm("bear", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Bear" } });
    let s = combat([rip], [bear],
      [{ permanentId: "rip", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "bear", blockingPlayer: "ai", attackerId: "rip" }]);
    s = { ...s, preventCombatDamageTurn: s.turn };               // a resolved fog
    s = resolveCombatDamage(s);
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(0);
  });

  it("GUARD 5 — MUST SURVIVE: a creature dealt lethal damage that dies gets NO counter (SBA order)", () => {
    const sieg = perm("sg", "Enrage — Whenever this creature is dealt damage, put two +1/+1 counters on it.", { card: { power: 2, toughness: 2, name: "Siegehorn Ceratops" } });
    const gob = perm("g", "", { controller: "ai", card: { power: 2, toughness: 2, type: "Creature — Goblin" } });
    let s = combat([sieg], [gob],
      [{ permanentId: "sg", attackingPlayer: "user", defender: "ai" }],
      [{ blockerId: "g", blockingPlayer: "ai", attackerId: "sg" }]);
    s = resolveCombatDamage(s);
    s = flush(s);
    expect(find(s, "user", "sg")).toBeFalsy();                   // 2/2 took lethal 2 → dead before the counter resolves
  });

  it("GUARD 6 — ALL-OR-NOTHING: an unmodeled-effect enrage stays non-native", () => {
    expect(classifyCard(C("Enrage — Whenever this creature is dealt damage, exile target creature an opponent controls until this creature leaves the battlefield.", "Creature — Dinosaur", "Trapjaw Tyrant"))).not.toBe("native-trigger");
  });

  it("GUARD 7 — NO DOUBLE with combat-damage-to-PLAYER: an unblocked enrage creature is NOT dealt damage", () => {
    // An unblocked Ripjaw deals damage to the player; it is NOT itself dealt damage → no enrage event.
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.");
    let s = combat([rip], [], [{ permanentId: "rip", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(36);                          // 4 combat damage to the player
    expect((s.pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(0);
  });

  it("checkDealtDamageTriggers ignores 0/negative amounts and missing creatures (CR 120.8 guard)", () => {
    const rip = perm("rip", "Enrage — Whenever this creature is dealt damage, draw a card.");
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [rip] } } };
    expect((checkDealtDamageTriggers(s, [{ creatureId: "rip", amount: 0 }]).pendingTriggers || [])).toHaveLength(0);
    expect((checkDealtDamageTriggers(s, [{ creatureId: "ghost", amount: 3 }]).pendingTriggers || [])).toHaveLength(0);
    expect((checkDealtDamageTriggers(s, [{ creatureId: "rip", amount: 3 }]).pendingTriggers || []).filter((t) => t.event === "dealtDamage")).toHaveLength(1);
  });
});
