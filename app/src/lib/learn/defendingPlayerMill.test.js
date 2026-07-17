/**
 * DEFENDING-PLAYER mill (BLITZ DM-1 — CR 508.5: an ability of an attacking creature that refers to the
 * defending player; CR 701.17 mill) on ATTACKS / BECOMES-BLOCKED triggers.
 *
 * "Whenever this creature attacks, defending player mills N cards" (Nemesis of Reason "mills ten") and the
 * BECOMES-BLOCKED sibling "Whenever this creature becomes blocked, defending player mills N cards" (Flint
 * Golem "mills three"). A NEW who:"defendingPlayer" mill atom reads ctx.defenderId — the per-attacker
 * defending player carried by triggers.checkAttackTriggers (attacks) AND triggers.checkBlockTriggers
 * (becomesBlocked, CR 509.1h). This is the EXACT referent AFFLICT's "defending player loses N life" rides,
 * so the combat-referent gate in triggerRouting.js (DEFENDING_PLAYER_EVENTS = {attacks, becomesBlocked})
 * already restricts it: a spell / non-combat trigger leaves ctx.defenderId unset → the clause would silently
 * drop → kept on the Arbiter (a SAFE false-negative, CREED). A wrong-player mill is a forbidden FP.
 *
 * Corpus flip-diff: +2 clean (Nemesis of Reason, Flint Golem), 0 regressions. The other cards in the pattern
 * carry OTHER unmodeled abilities and/or a DYNAMIC half-library count and correctly STAY body-only:
 * Specimen Freighter (Station + 9+ conditional flying + ETB bounce), Terisian Mindbreaker (Unearth +
 * half-library mill), Lord Xander (discard-half + sacrifice-half + half-library mill). FIXED-N is the clean
 * subset; "mills half their library" is a dynamic count this branch deliberately parks (whole-card gate).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers, checkBlockTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard, spellIsNative } from "./coverage.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (Scryfall-verified, exactly as the bundled slim index returns it).
const NEMESIS_ORACLE = "Whenever this creature attacks, defending player mills ten cards.";
const FLINT_ORACLE = "Whenever this creature becomes blocked, defending player mills three cards.";
const SPECIMEN_ORACLE =
  "When this Spacecraft enters, return up to two target non-Spacecraft creatures to their owners' hands.\n" +
  "Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It's an artifact creature at 9+.)\n" +
  "9+ | Flying\n" +
  "Whenever this Spacecraft attacks, defending player mills four cards.";
const TERISIAN_ORACLE =
  "Whenever this creature attacks, defending player mills half their library, rounded up.\n" +
  "Unearth {1}{U}{U}{U} ({1}{U}{U}{U}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)";
const LORD_XANDER_ORACLE =
  "When Lord Xander enters, target opponent discards half the cards in their hand, rounded down.\n" +
  "Whenever Lord Xander attacks, defending player mills half their library, rounded down.\n" +
  "When Lord Xander dies, target opponent sacrifices half the nonland permanents they control of their choice, rounded down.";

const C = (type, oracle, over = {}) => ({ type, oracle, mana: "{4}", name: "X", power: "3", toughness: "3", ...over });
const atom0 = (clause) => parseEffectClause(clause, "Instant")?.atoms?.[0];
const conf = (clause) => { const p = parseEffectClause(clause, "Instant"); return p ? programConfidence(p) : "none"; };

// ───────────────────────── PARSE ─────────────────────────
describe("defendingPlayer mill parse", () => {
  it("'defending player mills N cards' → mill / defendingPlayer / non-targeted", () => {
    expect(atom0("defending player mills ten cards")).toMatchObject({ op: "mill", who: "defendingPlayer", amount: 10, targetType: null });
    expect(atom0("defending player mills three cards")).toMatchObject({ op: "mill", who: "defendingPlayer", amount: 3, targetType: null });
    expect(atom0("defending player mills four cards")).toMatchObject({ op: "mill", who: "defendingPlayer", amount: 4, targetType: null });
    expect(atom0("defending player mills 5 cards")).toMatchObject({ op: "mill", who: "defendingPlayer", amount: 5, targetType: null });
  });

  it("CREED: the DYNAMIC half-library count is NOT modeled here → parks LOW (Lord Xander / Terisian)", () => {
    // "half their library" is a dynamic count this fixed-N branch deliberately parks (whole-card gate).
    expect(conf("defending player mills half their library, rounded down")).toBe("low");
    expect(conf("defending player mills half their library, rounded up")).toBe("low");
  });

  it("CREED: a scaled count stays LOW → Arbiter (anchored to a fixed N, never a fabricated magnitude)", () => {
    // "equal to the number of …" is a scaled count this fixed-N branch does not model — the `$`-anchored
    // matcher rejects it, so the whole program parks LOW rather than silently milling a wrong amount.
    expect(conf("defending player mills cards equal to the number of creatures you control")).toBe("low");
    expect(conf("defending player mills x cards, where x is the number of lands they control")).toBe("low");
  });
});

// ───────────────────────── DETECTION + ROUTING ─────────────────────────
describe("defendingPlayer mill detection + routing", () => {
  const trig = (oracle, type = "Creature — Leviathan Horror") => detectTriggers({ name: "X", type, oracle, mana: "{4}" });

  it("detects the attacks trigger and routes it natively (Nemesis of Reason)", () => {
    const d = trig(NEMESIS_ORACLE)[0];
    expect(d).toMatchObject({ event: "attacks", scope: "self" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("detects the becomes-blocked trigger and routes it natively (Flint Golem)", () => {
    const d = trig(FLINT_ORACLE, "Artifact Creature — Golem")[0];
    expect(d).toMatchObject({ event: "becomesBlocked", scope: "self" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("CREED referent gate: the SAME defendingPlayer mill does NOT route on a non-attack/non-block event", () => {
    // ctx.defenderId is set ONLY on attacks + becomesBlocked; on any other event the mill would silently drop.
    const eff = "defending player mills ten cards";
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", scope: "self", whose: "any", effectClause: eff })).toBe(false);
    expect(triggerRoutesNatively({ event: "etb", scope: "self", whose: "any", effectClause: eff })).toBe(false);
    expect(triggerRoutesNatively({ event: "upkeep", scope: "you", whose: "yours", effectClause: eff })).toBe(false);
    expect(triggerRoutesNatively({ event: "castSpell", scope: "self", whose: "opponent", effectClause: eff })).toBe(false);
  });
});

// ───────────────────────── CLASSIFICATION (corpus flips + parks) ─────────────────────────
describe("classifyCard — defendingPlayer mill flips + parks", () => {
  it("Nemesis of Reason (attacks → defender mills ten) → native-trigger", () => {
    expect(classifyCard(C("Creature — Leviathan Horror", NEMESIS_ORACLE))).toBe("native-trigger");
  });

  it("Flint Golem (becomes blocked → defender mills three) → native-trigger", () => {
    expect(classifyCard(C("Artifact Creature — Golem", FLINT_ORACLE))).toBe("native-trigger");
  });

  it("CREED park: Specimen Freighter stays body-only (Station + 9+ flying + ETB bounce are unmodeled)", () => {
    expect(classifyCard(C("Artifact — Spacecraft", SPECIMEN_ORACLE, { power: null, toughness: null }))).toBe("body-only");
  });

  it("CREED park: Terisian Mindbreaker stays body-only (Unearth + DYNAMIC half-library mill)", () => {
    expect(classifyCard(C("Artifact Creature — Juggernaut", TERISIAN_ORACLE, { power: "4", toughness: "4" }))).toBe("body-only");
  });

  it("CREED park: Lord Xander stays body-only (discard-half + sacrifice-half + half-library mill)", () => {
    expect(classifyCard(C("Legendary Creature — Vampire Demon Noble", LORD_XANDER_ORACLE, { power: "6", toughness: "6" }))).toBe("body-only");
  });

  it("CREED: a SPELL carrying the defendingPlayer referent is NOT native (a spell never supplies ctx.defenderId)", () => {
    expect(spellIsNative(C("Sorcery", "Defending player mills ten cards."))).toBe(false);
  });
});

// ───────────────────────── RUNTIME (declare attack / becomes blocked → trigger fires → mill) ─────────────────────────
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib${i}`, name: `Card${i}`, type: "Creature — Bear" }));
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };
const perm = (id, name, type, oracle, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type, power: 3, toughness: 3, oracle }, controller, summoningSick: false });

// A combat state: `user` attacking with the given battlefield; `ai` patched with a library (+ optional blocker).
function combat(userBf, aiPatch, attackers, blockers = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers",
    combat: { attackers, blockers },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai: { ...s.players.ai, battlefield: [], graveyard: [], ...aiPatch },
    },
  };
}

describe("runtime: the defendingPlayer mill lands on the RIGHT player", () => {
  it("Nemesis attacks → resolve → the DEFENDING player (ai) mills 10; the attacker's controller is untouched", () => {
    const nemesis = perm("nem", "Nemesis of Reason", "Creature — Leviathan Horror", NEMESIS_ORACLE);
    let s = combat([nemesis], { library: lib(15) }, [{ permanentId: "nem", attackingPlayer: "user", defender: "ai" }]);
    s = resolveAll(flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.library.length).toBe(5);      // top 10 milled
    expect(s.players.ai.graveyard.length).toBe(10);
    expect((s.players.user.library || []).length).toBe(0); // the controller did NOT mill
  });

  it("Flint Golem becomes blocked → resolve → the DEFENDING player (ai) mills 3", () => {
    const golem = perm("gol", "Flint Golem", "Artifact Creature — Golem", FLINT_ORACLE);
    const wall = createPermanent({ id: "w", card: { id: "c-w", name: "Wall", type: "Creature — Wall", power: 0, toughness: 4, oracle: "" }, controller: "ai", summoningSick: false });
    let s = combat([golem], { library: lib(10), battlefield: [wall] },
      [{ permanentId: "gol", attackingPlayer: "user", defender: "ai" }], [{ attackerId: "gol", blockerId: "w" }]);
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.library.length).toBe(7);
    expect(s.players.ai.graveyard.length).toBe(3);
  });

  it("CREED near-miss: an UNBLOCKED becomes-blocked mill does NOT fire (no fabricated mill)", () => {
    const golem = perm("gol", "Flint Golem", "Artifact Creature — Golem", FLINT_ORACLE);
    let s = combat([golem], { library: lib(10) }, [{ permanentId: "gol", attackingPlayer: "user", defender: "ai" }], []); // no blockers
    s = resolveAll(flushTriggers(checkBlockTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.library.length).toBe(10);  // becomes-blocked never triggered
    expect(s.players.ai.graveyard.length).toBe(0);
  });

  it("multiplayer (CR 508.5a): ONLY the specific defending player mills, never every opponent", () => {
    const nemesis = perm("nem", "Nemesis of Reason", "Creature — Leviathan Horror", NEMESIS_ORACLE);
    let s = combat([nemesis], { library: lib(15) }, [{ permanentId: "nem", attackingPlayer: "user", defender: "ai" }]);
    // add a third seat — a non-defending opponent who must stay untouched
    s = { ...s, turnOrder: ["user", "ai", "ai2"], players: { ...s.players, ai2: { ...s.players.ai, battlefield: [], graveyard: [], library: lib(15) } } };
    s = resolveAll(flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets }));
    expect(s.players.ai.library.length).toBe(5);    // the attacked defender milled 10
    expect(s.players.ai.graveyard.length).toBe(10);
    expect(s.players.ai2.library.length).toBe(15);  // the OTHER opponent is untouched (never "each opponent")
    expect(s.players.ai2.graveyard.length).toBe(0);
  });

  it("checkAttackTriggers threads the per-attacker defender (multi-defender Commander shape)", () => {
    const a1 = perm("a1", "Nemesis A", "Creature — Leviathan Horror", NEMESIS_ORACLE);
    const a2 = perm("a2", "Nemesis B", "Creature — Leviathan Horror", NEMESIS_ORACLE);
    let s = combat([a1, a2], { library: lib(15) }, [
      { permanentId: "a1", attackingPlayer: "user", defender: "ai" },
      { permanentId: "a2", attackingPlayer: "user", defender: "ai2" },
    ]);
    s = { ...s, turnOrder: ["user", "ai", "ai2"], players: { ...s.players, ai2: { ...s.players.ai, battlefield: [], graveyard: [], library: lib(15) } } };
    const out = checkAttackTriggers(s);
    const defenders = out.pendingTriggers.map((t) => t.payload.params.context.defenderId).sort();
    expect(defenders).toEqual(["ai", "ai2"]);
  });
});
