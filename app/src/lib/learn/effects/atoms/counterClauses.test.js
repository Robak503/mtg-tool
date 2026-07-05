/**
 * WAVE 3b COUNTERS-ON-EVENT — the NON-SELF triggering-permanent counter referent.
 *
 *   "Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on that
 *    creature." (Sphere Grid)  /  "…attacks, put a +1/+1 counter on it."
 *
 * Two cooperating pieces deliver this CREED-safely:
 *   1. triggers.detectTriggers rewrites the NON-self triggering referent ("on it" / "on that creature")
 *      → the canonical sentinel "on the triggering creature" — gated to the non-self attack/combat-damage
 *      scopes (a SPELL's anaphoric pronoun is never rewritten).
 *   2. effects/atoms/counterClauses.counterClausesParser (registered here via registerClauseParser, as the
 *      integrator wires it in parser.js at merge) binds the sentinel to an add-counter atom on
 *      target:"thatCreature", which counters.applyAddCounter resolves to ctx.triggeringPermanentId.
 *
 * The sentinel appears in ZERO printed oracle text, so spells that use "it"/"that creature" anaphorically
 * (Big Play, Puncture Bolt, Miraculous Recovery) are NEVER rewritten and stay LOW → Arbiter (no fabricated
 * / mis-bound counter). Engine-first: the counter must actually LAND on the triggering creature.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence, programNeedsChosenTarget, registerClauseParser } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { counterClausesParser } from "./counterClauses.js";
import { detectTriggers, checkAttackTriggers } from "../../triggers.js";
import { resolveCombatDamage } from "../../combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness, findPermanent } from "../../gameState.js";
import { classifyCard } from "../../coverage.js";

// Register the WAVE-3b clause parser into the additive seam (the integrator wires the same line at
// parser.js bottom in production). Idempotent enough for the test module's isolated graph.
registerClauseParser(counterClausesParser);

beforeEach(() => _resetIdsForTests());

const SENTINEL = "put a +1/+1 counter on the triggering creature";
const programOf = (txt) => parseEffectClause(txt, "Instant");
const atomsOf = (txt) => programOf(txt)?.atoms;
const isHigh = (txt) => programConfidence(programOf(txt)) === "high";

// ──────────────────────────────────────────────────────────────────────────────
describe("counterClausesParser — pure clause parser (the sentinel)", () => {
  it("parses 'on the triggering creature' to an add-counter atom on target:thatCreature", () => {
    expect(counterClausesParser(SENTINEL)).toEqual({ op: "add-counter", counterType: "+1/+1", amount: 1, target: "thatCreature" });
    expect(counterClausesParser("Put two +1/+1 counters on the triggering creature")).toEqual({ op: "add-counter", counterType: "+1/+1", amount: 2, target: "thatCreature" });
    expect(counterClausesParser("Put a -1/-1 counter on the triggering creature")).toEqual({ op: "add-counter", counterType: "-1/-1", amount: 1, target: "thatCreature" });
  });

  it("the sentinel parses HIGH and is NON-targeted (routes natively on the trigger path)", () => {
    expect(atomsOf("Put a +1/+1 counter on the triggering creature.")).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "thatCreature" }]);
    expect(isHigh("Put a +1/+1 counter on the triggering creature.")).toBe(true);
    expect(programNeedsChosenTarget(programOf("Put a +1/+1 counter on the triggering creature."))).toBe(false);
  });

  it("CREED: a non-±1/±1 counter on the sentinel stays null → LOW (stun/charge not enforced)", () => {
    expect(counterClausesParser("Put a stun counter on the triggering creature")).toBeNull();
    expect(counterClausesParser("Put a charge counter on the triggering creature")).toBeNull();
    // a filter / rider past the sentinel fails the anchor
    expect(counterClausesParser("Put a +1/+1 counter on the triggering creature you control")).toBeNull();
    expect(counterClausesParser("Put a +1/+1 counter on it")).toBeNull();          // raw pronoun → not the sentinel
    expect(counterClausesParser("Put a +1/+1 counter on that creature")).toBeNull(); // raw referent → not the sentinel
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("detectTriggers — the NON-self triggering-referent rewrite", () => {
  const cls = (oracle) => detectTriggers({ name: "X", type: "Creature — Beast", oracle });

  it("Sphere Grid's combat-damage trigger rewrites 'that creature' → the sentinel + parses HIGH", () => {
    const sphereGrid = "Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on that creature.";
    const d = cls(sphereGrid).find((x) => x.event === "combatDamageToPlayer");
    expect(d).toMatchObject({ scope: "creatureYouControl" });
    expect(d.effectClause).toBe(SENTINEL);                                  // rewritten to the sentinel
    expect(programConfidence(programOf(d.effectClause))).toBe("high");      // → HIGH (fires post-WAVE-1b)
  });

  it("a NON-self attack trigger rewrites 'it' → the sentinel", () => {
    const d = cls("Whenever a creature you control attacks, put a +1/+1 counter on it.").find((x) => x.event === "attacks");
    expect(d).toMatchObject({ scope: "creatureYouControl" });
    expect(d.effectClause).toBe(SENTINEL);
  });

  it("a SUBTYPE non-self attack trigger ('a Dinosaur you control attacks') also rewrites", () => {
    const d = cls("Whenever a Dinosaur you control attacks, put a +1/+1 counter on it.").find((x) => x.event === "attacks");
    expect(d).toMatchObject({ scope: "subtypeYouControl" });
    expect(d.effectClause).toBe(SENTINEL);
  });

  it("CREED: a SELF-scope 'on it' still routes to the SELF atom (NOT the triggering sentinel)", () => {
    // The self-scope rewrite ("it" → "this creature") still wins — the source IS the referent (CR 113.7).
    const d = cls("Whenever this creature attacks, put a +1/+1 counter on it.").find((x) => x.event === "attacks");
    expect(d).toMatchObject({ scope: "self" });
    expect(d.effectClause).toBe("put a +1/+1 counter on this creature");
    expect(atomsOf(d.effectClause)).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" }]);
  });

  it("CREED: an UNPARSEABLE rider past the referent keeps the program LOW (no partial)", () => {
    // The no-partial guard, held against a rider the engine genuinely can't model. (The original pin used
    // "Draw a card" — since the attacks/creatureYouControl pronoun rewrite became per-sentence, the same as
    // the etb arm, a fully-PARSEABLE follow-up legitimately models whole; the positive pin below covers it.
    // The all-or-nothing program confidence is what enforces no-partials, not the rewrite's anchor.)
    const d = cls("Whenever a creature you control attacks, put a +1/+1 counter on it. Exile the top card of each player's library.").find((x) => x.event === "attacks");
    expect(programConfidence(programOf(d.effectClause))).toBe("low");
  });

  it("a fully-PARSEABLE follow-up sentence models WHOLE (per-sentence rewrite — both atoms, no partial)", () => {
    const d = cls("Whenever a creature you control attacks, put a +1/+1 counter on it. Draw a card.").find((x) => x.event === "attacks");
    const p = programOf(d.effectClause);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op).sort()).toEqual(["add-counter", "draw"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("CREED — spells using 'it' / 'that creature' anaphorically stay non-native", () => {
  // The sentinel gate: the parser matches ONLY "the triggering creature". A spell's raw pronoun is never
  // rewritten (it isn't a non-self trigger), so its counter clause never reaches a HIGH atom → the whole
  // spell stays LOW → Arbiter. (Verified card text — Big Play, Puncture Bolt, Miraculous Recovery.)
  it("Big Play / Puncture Bolt / Miraculous Recovery do NOT classify native-spell", () => {
    expect(classifyCard({ name: "Big Play", type: "Instant", oracle: "Target creature gets +2/+2 and gains reach until end of turn. Put a +1/+1 counter on it." })).not.toBe("native-spell");
    expect(classifyCard({ name: "Puncture Bolt", type: "Instant", oracle: "Puncture Bolt deals 1 damage to target creature. Put a -1/-1 counter on that creature." })).not.toBe("native-spell");
    expect(classifyCard({ name: "Miraculous Recovery", type: "Instant", oracle: "Return target creature card from your graveyard to the battlefield. Put a +1/+1 counter on it." })).not.toBe("native-spell");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("resolve — the add-counter atom binds to the triggering permanent", () => {
  const ATOM = { op: "add-counter", counterType: "+1/+1", amount: 1, target: "thatCreature" };
  const beast = (id, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });

  it("places the counter on ctx.triggeringPermanentId", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [beast("b")] } } };
    const after = resolveAtom(s, ATOM, { controller: "user", triggeringPermanentId: "b", cardName: "Sphere Grid" });
    expect(creaturePower(findPermanent(after, "b").permanent, after)).toBe(3);
    expect(creatureToughness(findPermanent(after, "b").permanent, after)).toBe(3);
  });

  it("CREED: an absent triggering referent (a spell) is a clean no-op, never a fabricated counter", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [beast("b")] } } };
    const after = resolveAtom(s, ATOM, { controller: "user", cardName: "Spellish" }); // no triggeringPermanentId
    expect(creaturePower(findPermanent(after, "b").permanent, after)).toBe(2);         // unchanged
  });

  it("a -1/-1 on the triggering creature runs the lethal SBA (drops a 1/1 to the graveyard)", () => {
    const NEG = { op: "add-counter", counterType: "-1/-1", amount: 1, target: "thatCreature" };
    const oneone = createPermanent({ id: "o", card: { id: "co", name: "Wisp", type: "Creature — Spirit", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [oneone] } } };
    const after = resolveAtom(s, NEG, { controller: "ai", triggeringPermanentId: "o", cardName: "Drainer" });
    expect(findPermanent(after, "o")).toBeNull();                                      // 0 toughness → SBA death
    expect(after.players.ai.graveyard.map((c) => c.name)).toEqual(["Wisp"]);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe("engine-first — Sphere Grid's trigger fires + lands the counter on the attacker", () => {
  // Sphere Grid is an Enchantment (the trigger watcher); the attacker is the creature you control. Drive
  // the real combat-damage event so the trigger fires off ev.attackerId = ctx.triggeringPermanentId.
  function st(userBf, aiBf, attackers, blockers = []) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, step: "combat-damage", phase: "combat", combat: { attackers, blockers },
      players: { ...s.players, user: { ...s.players.user, battlefield: userBf, life: 40 }, ai: { ...s.players.ai, battlefield: aiBf, life: 40 } },
    };
  }
  const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 25) st = resolveTopOfStack(st); return st; };

  it("the attacker that dealt combat damage gets a +1/+1 counter (combat-damage path)", () => {
    const grid = createPermanent({ id: "grid", card: { id: "cgrid", name: "Sphere Grid", type: "Enchantment", oracle: "Whenever a creature you control deals combat damage to a player, put a +1/+1 counter on that creature." }, controller: "user", summoningSick: false });
    const attacker = createPermanent({ id: "atk", card: { id: "catk", name: "Bruiser", type: "Creature — Beast", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    let s = st([grid, attacker], [], [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], []);
    s = resolveCombatDamage(s);
    expect(s.players.ai.life).toBe(37);                                    // 3 combat damage landed → trigger condition met
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(creaturePower(findPermanent(s, "atk").permanent, s)).toBe(4);   // +1/+1 counter on the ATTACKER (the triggering creature)
    expect(creatureToughness(findPermanent(s, "atk").permanent, s)).toBe(4);
  });

  it("a NON-self ATTACK trigger ('a creature you control attacks → on it') lands on the attacker", () => {
    const lord = createPermanent({ id: "lord", card: { id: "clord", name: "Boon Lord", type: "Creature — Centaur", power: 1, toughness: 1, oracle: "Whenever a creature you control attacks, put a +1/+1 counter on it." }, controller: "user", summoningSick: false });
    const attacker = createPermanent({ id: "atk2", card: { id: "catk2", name: "Charger", type: "Creature — Beast", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, step: "declare-attackers", phase: "combat", activePlayer: "user",
      combat: { attackers: [{ permanentId: "atk2", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [lord, attacker] } },
    };
    s = checkAttackTriggers(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(creaturePower(findPermanent(s, "atk2").permanent, s)).toBe(3);  // the ATTACKING creature got the counter
    // the lord (the source) did NOT get a counter — the referent is the triggering creature, not the source
    expect(creaturePower(findPermanent(s, "lord").permanent, s)).toBe(1);
  });
});
