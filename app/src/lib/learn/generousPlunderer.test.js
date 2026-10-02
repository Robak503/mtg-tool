/**
 * GENEROUS PLUNDERER ({1}{R} Creature — Human Rogue) — three modeled mechanics on ONE card:
 *
 *   Menace
 *   At the beginning of your upkeep, you may create a Treasure token. When you do, target opponent
 *     creates a tapped Treasure token.
 *   Whenever this creature attacks, it deals damage to defending player equal to the number of artifacts
 *     they control.
 *
 * Three slices land it as native-trigger:
 *
 *  (1) OPTIONAL-PRIMARY REFLEXIVE (CR 603.7) — "you may create a Treasure. When you do, <reflexive>". The
 *      matchReflexiveTrigger fold REJECTS an optional primary (a naive sequential tail would fire the
 *      reflexive even on a DECLINE — the cardinal FP). matchOptionalReflexiveTrigger instead folds to
 *      [optional-create, reflexiveGate-payoff]; the runtime (resolveOptionalChoice) runs the gated payoff
 *      ONLY when the "may" was TAKEN and SKIPS it on a decline. CREED safety is preserved by the gate.
 *
 *  (2) TARGET-OPPONENT-CREATES — "target opponent creates a tapped Treasure token": a CHOSEN opponent (not
 *      the controller) mints the token (whoCreates:"target"). applyCreateNamedToken puts it on that player's
 *      battlefield, TAPPED (so it's not a mana source until it untaps). The chosen target is unambiguously an
 *      opponent (atomTargetIntent → "enemy"), so the attacks/upkeep trigger routes on the α1 allowlist.
 *
 *  (3) ATTACKS-DAMAGE-BY-ARTIFACT-COUNT — "it deals damage to defending player equal to the number of
 *      artifacts they control": a defendingPlayer-scoped count-scaled combat damage. The target is the
 *      attacked player (ctx.defenderId), and the count is that same player's artifacts (who:"defendingPlayer"
 *      → countForSpec reads ctx.defenderId). The combat-referent gate pins BOTH to the ATTACKS event — on any
 *      other event ctx.defenderId is unset → the clause silently drops → kept on the Arbiter (a SAFE FN).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalChoice } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { passPriority, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE =
  "Menace\n" +
  "At the beginning of your upkeep, you may create a Treasure token. When you do, target opponent creates a tapped Treasure token.\n" +
  "Whenever this creature attacks, it deals damage to defending player equal to the number of artifacts they control.";

const CARD = { name: "Generous Plunderer", type: "Creature — Human Rogue", mana: "{1}{R}", oracle: ORACLE, power: "3", toughness: "1" };

// ───────────────────────── PARSE ─────────────────────────
describe("Generous Plunderer — parse", () => {
  it("upkeep effectClause folds to [optional create-Treasure, reflexiveGate target-opponent tapped Treasure]", () => {
    const p = parseEffectClause("you may create a Treasure token. When you do, target opponent creates a tapped Treasure token", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "create-named-token", token: "treasure", count: 1, targetType: null, optional: true },
      { op: "create-named-token", token: "treasure", count: 1, targetType: "opponent", whoCreates: "target", tapped: true, reflexiveGate: true },
    ]);
  });

  it("attacks effectClause → deal-damage / defendingPlayer target / who:'defendingPlayer' artifact count", () => {
    const p = parseEffectClause("it deals damage to defending player equal to the number of artifacts they control", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "deal-damage",
      targetType: "defendingPlayer",
      who: "defendingPlayer",
      amountCount: { kind: "permanentsYouControl", cardType: "artifact", who: "defendingPlayer" },
    });
  });

  it("'target opponent creates a Treasure token' (no tapped rider) parses without the tapped flag", () => {
    const p = parseEffectClause("target opponent creates a Treasure token", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-named-token", token: "treasure", targetType: "opponent", whoCreates: "target" });
    expect(p.atoms[0].tapped).toBeUndefined();
  });
});

// ───────────────────────── DETECTION + ROUTING ─────────────────────────
describe("Generous Plunderer — trigger detection + routing", () => {
  it("both the upkeep reflexive and the attacks-damage triggers route natively", () => {
    const trigs = detectTriggers(CARD);
    expect(trigs.map((t) => t.event).sort()).toEqual(["attacks", "upkeep"]);
    for (const t of trigs) expect(triggerRoutesNatively(t)).toBe(true);
  });

  it("CREED referent gate: the attacks-damage clause does NOT route on a non-attacks event (defenderId unset)", () => {
    const clause = "it deals damage to defending player equal to the number of artifacts they control";
    // On an ETB / upkeep the defendingPlayer referent is unset → the whole clause would silently deal 0 to
    // nobody → must NOT route (kept on the Arbiter, a SAFE FN).
    expect(triggerRoutesNatively({ event: "etb", scope: "self", whose: "any", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", scope: "self", whose: "any", effectClause: clause })).toBe(false);
  });
});

// ───────────────────────── CLASSIFICATION ─────────────────────────
describe("Generous Plunderer — classification", () => {
  it("flips to native-trigger (both triggers modeled; Menace is an evergreen keyword)", () => {
    expect(classifyCard(CARD)).toBe("native-trigger");
  });

  it("CREED: an UNMODELED extra TRIGGER keeps the card body-only (never a partial flip)", () => {
    // Add a genuinely-unmodeled trigger (a coin-flip win condition the engine doesn't model). The
    // allTriggerSentencesModeled gate requires EVERY trigger to route natively, so this third trigger drops
    // the whole card to body-only — never a partial flip that silently skips the unmodeled trigger.
    expect(classifyCard({ ...CARD, oracle: ORACLE + "\nWhenever you cast a spell, flip a coin. If you win the flip, you win the game." })).toBe("body-only");
  });

  it("CREED: replacing the attacks payoff with an UNMODELED scaled source keeps it body-only", () => {
    // "…equal to the number of Clues they control" — Clue is not in the count-source card types for this scope,
    // so parseCountSource returns null → the attacks clause is LOW → the whole card stays body-only.
    const alt = ORACLE.replace("the number of artifacts they control", "the number of Clues they control");
    expect(classifyCard({ ...CARD, oracle: alt })).toBe("body-only");
  });
});

// ───────────────────────── BONUS FLIP — the optional-reflexive slice generalizes ─────────────────────────
describe("optional-primary reflexive generalizes (Forgehammer Centurion)", () => {
  // Forgehammer Centurion's attacks trigger is ANOTHER optional-primary reflexive: "you may remove two oil
  // counters from it. When you do, target creature can't block this turn." My matchOptionalReflexiveTrigger
  // folds it to [remove-oil (optional), cant-block (reflexiveGate)] — the counter removal is a real optional
  // action and the can't-block reflexive fires ONLY if it was taken. This is the corpus bonus flip from the slice.
  const FORGE_ATTACK = "you may remove two oil counters from it. When you do, target creature can't block this turn";

  it("folds to [remove-oil (optional), cant-block (reflexiveGate)], HIGH", () => {
    const p = parseEffectClause(FORGE_ATTACK, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "remove-named-counter-self", counterType: "oil", amount: 2, optional: true },
      { op: "cant-block", targetType: "creature", reflexiveGate: true },
    ]);
  });

  it("runtime: TAKING removes two oil counters (3→1); DECLINING removes none and grants no can't-block", () => {
    const p = parseEffectClause(FORGE_ATTACK, "Instant");
    function forgeState() {
      const s = createGameState({ userDeck: [], aiDeck: [] });
      const src = createPermanent({ id: "src", card: { id: "cs", name: "Forgehammer", type: "Creature — Dwarf Warrior", oracle: "" }, controller: "user" });
      src.counters = { oil: 3 };
      const enemy = createPermanent({ id: "e1", card: { id: "ce", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai" });
      return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src] }, ai: { ...s.players.ai, battlefield: [enemy] } } };
    }
    const obj = { source: { name: "Forgehammer" }, payload: { params: { program: p, controller: "user", sourceId: "src", targets: [{ type: "creature", id: "e1", atomIndex: 1 }] } } };

    let taken = runEffectProgram(forgeState(), obj);
    expect(taken.pendingChoice?.kind).toBe("optional-effect");
    taken = resolveOptionalChoice(taken, true);
    expect(taken.players.user.battlefield.find((p2) => p2.id === "src").counters.oil).toBe(1); // 3 - 2

    let declined = runEffectProgram(forgeState(), obj);
    declined = resolveOptionalChoice(declined, false);
    expect(declined.players.user.battlefield.find((p2) => p2.id === "src").counters.oil).toBe(3); // untouched
  });
});

// ───────────────────────── RUNTIME — upkeep optional reflexive ─────────────────────────
describe("Generous Plunderer — upkeep optional reflexive (runtime)", () => {
  function upkeepProgram() {
    return parseEffectClause("you may create a Treasure token. When you do, target opponent creates a tapped Treasure token", "Instant");
  }
  function baseState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, activePlayer: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [], life: 40 }, ai: { ...s.players.ai, battlefield: [], life: 40 } },
    };
  }
  function runObj(program) {
    // The reflexive's targetType:"opponent" target (ai) is chosen at flush; here we supply it directly on the atom index.
    return { source: { name: "Generous Plunderer" }, payload: { params: { program, controller: "user", targets: [{ type: "player", id: "ai", atomIndex: 1 }] } } };
  }

  it("TAKING the 'may': you get a Treasure AND the targeted opponent gets a TAPPED Treasure", () => {
    let s = baseState();
    s = runEffectProgram(s, runObj(upkeepProgram()));
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    const userTreasures = s.players.user.battlefield.filter((p) => p.card.token);
    const aiTreasures = s.players.ai.battlefield.filter((p) => p.card.token);
    expect(userTreasures).toHaveLength(1);
    expect(userTreasures[0].tapped).toBeFalsy();          // yours enters UNtapped
    expect(aiTreasures).toHaveLength(1);
    expect(aiTreasures[0].tapped).toBe(true);             // the opponent's enters TAPPED
    expect(aiTreasures[0].card.name).toBe("Treasure");
  });

  it("CREED: DECLINING the 'may' creates NO tokens for anyone (the reflexive is gated off)", () => {
    let s = baseState();
    s = runEffectProgram(s, runObj(upkeepProgram()));
    s = resolveOptionalChoice(s, false);
    expect(s.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(0);
    expect(s.players.ai.battlefield.filter((p) => p.card.token)).toHaveLength(0); // the opponent Treasure NEVER minted
  });
});

// ───────────────────────── RUNTIME — attacks damage ─────────────────────────
describe("Generous Plunderer — attacks damage (runtime)", () => {
  const attackAtom = () => parseEffectClause("it deals damage to defending player equal to the number of artifacts they control", "Instant").atoms[0];

  it("deals damage to the DEFENDING player equal to THEIR artifact count", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const art1 = createPermanent({ id: "a1", card: { id: "c1", name: "Sol Ring", type: "Artifact" }, controller: "ai" });
    const art2 = createPermanent({ id: "a2", card: { id: "c2", name: "Signet", type: "Artifact" }, controller: "ai" });
    // an artifact the ATTACKER controls must NOT count (only the defender's)
    const ownArt = createPermanent({ id: "a3", card: { id: "c3", name: "Mox", type: "Artifact" }, controller: "user" });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [ownArt], life: 40 }, ai: { ...s0.players.ai, battlefield: [art1, art2], life: 40 } } };
    s = resolveAtom(s, attackAtom(), { controller: "user", defenderId: "ai", sourceId: "plunderer", targets: [] });
    expect(s.players.ai.life).toBe(38);   // 40 - 2 (the defender's two artifacts; the attacker's Mox is ignored)
    expect(s.players.user.life).toBe(40); // the attacker's controller is untouched
  });

  it("CREED: with NO defenderId (a non-attacks context) the clause deals NO damage", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const art = createPermanent({ id: "a1", card: { id: "c1", name: "Sol Ring", type: "Artifact" }, controller: "ai" });
    let s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [art], life: 40 } } };
    s = resolveAtom(s, attackAtom(), { controller: "user", sourceId: "p", targets: [] }); // no defenderId
    expect(s.players.ai.life).toBe(40);
  });

  it("END-TO-END: declaring an attack fires the trigger and damages the defender by their artifact count", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const plunderer = createPermanent({
      id: "perm-gp",
      card: { id: "card-gp", name: "Generous Plunderer", type: "Creature — Human Rogue", power: 3, toughness: 1, oracle: ORACLE },
      controller: "user",
    });
    plunderer.tapped = true; plunderer.summoningSick = false;
    const art1 = createPermanent({ id: "a1", card: { id: "c1", name: "Sol Ring", type: "Artifact" }, controller: "ai" });
    const art2 = createPermanent({ id: "a2", card: { id: "c2", name: "Signet", type: "Artifact" }, controller: "ai" });
    const art3 = createPermanent({ id: "a3", card: { id: "c3", name: "Mind Stone", type: "Artifact" }, controller: "ai" });
    let s = {
      ...s0, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
      combat: { attackers: [{ permanentId: "perm-gp", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [plunderer], life: 40 },
        ai: { ...s0.players.ai, battlefield: [art1, art2, art3], life: 40 },
      },
    };
    // RE-POINTED (the attack-trigger timing fix, CR 508.1m / 508.2): the attack trigger fires when the declaration closes — the
    // active player's first pass of the declare attackers step — not at the declare-blockers step entry.
    const out = passPriority(s);
    const trig = (out.stack || []).find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.payload.params.context.defenderId).toBe("ai");
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.ai.life).toBe(37); // 40 - 3 (three artifacts the defender controls)
  });
});
