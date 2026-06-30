/**
 * annihilator.test.js — KW-ANNIHILATOR (CR 702.86a): "Whenever this creature attacks, defending player
 * sacrifices N permanents."  The Eldrazi forced-mass-sacrifice attack keyword.
 *
 * A #319-style combat hook (annihilator.js) fired at the declare-blockers transition alongside
 * checkAttackTriggers, reusing the SHIPPED edict sacrifice chain (advanceSacrificeChain): each attacking
 * annihilator obligates its defending player to sacrifice N permanents of their choice. Engine-first — the
 * defender must ACTUALLY lose N permanents at runtime (forced when ≤1 per pick, a real choice when ≥2: a
 * human picks via the learnSession sacrifice-choice loop, the AI auto-sacs its least-valuable), or the card
 * is a false positive.
 *
 * CREED pins below: the coverage flip credits ONLY a card whose ENTIRE remaining body is otherwise modeled
 * (vanilla / evergreen-keyword); a titan with a SECOND unmodeled ability (Ulamog's cast trigger, Kozilek's
 * graveyard-shuffle) stays body-only — never a partial flip that silently drops the unmodeled ability.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseAnnihilator, applyAnnihilatorTriggers } from "./annihilator.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────────────────
const ANN_REMINDER = "(Whenever this creature attacks, defending player sacrifices two permanents of their choice.)";

const annCreature = (id, n, controller = "user", extraOracle = "") =>
  createPermanent({
    id,
    card: { id: `c-${id}`, name: `Eldrazi ${id}`, type: "Creature — Eldrazi", power: 8, toughness: 8, oracle: `Annihilator ${n}${extraOracle ? `\n${extraOracle}` : ""}` },
    controller,
    summoningSick: false,
  });
const vanilla = (id, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });
const land = (id, controller = "ai") =>
  createPermanent({ id, card: { id: `c-${id}`, name: `Land ${id}`, type: "Land", oracle: "" }, controller });
const dork = (id, cmc, controller = "ai") =>
  createPermanent({ id, card: { id: `c-${id}`, name: `Body ${id}`, type: "Creature — Goblin", power: 1, toughness: 1, cmc, oracle: "" }, controller });

function st({ userBf = [], aiBf = [], attackers = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    step: "declare-blockers",
    phase: "combat",
    combat: { attackers, blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, life: 40 },
    },
  };
}
const atk = (permanentId, attackingPlayer = "user") => ({ permanentId, attackingPlayer, defender: attackingPlayer === "user" ? "ai" : "user" });

// Drive the sacrifice chain to completion the way the learnSession driver does for an AI sacrificer
// (auto-pick least-valuable, settle, repeat) — so a test can assert the END board after all N sacrifices.
const drainAISacChain = (s) => {
  let cur = s, guard = 0;
  while (cur.pendingChoice && cur.pendingChoice.kind === "sacrifice-choice" && guard++ < 50) {
    cur = resolveSacrificeChoice(cur, autoPickSacrificeCandidate(cur, cur.pendingChoice));
  }
  return cur;
};

describe("parseAnnihilator — predicate", () => {
  it("parses 'Annihilator N' → { n }", () => {
    expect(parseAnnihilator({ oracle: "Annihilator 2" })).toEqual({ n: 2 });
    expect(parseAnnihilator({ oracle_text: "Annihilator 6" })).toEqual({ n: 6 });
  });
  it("matches the keyword in a keyword list / after a newline", () => {
    expect(parseAnnihilator({ oracle: "Flying, trample\nAnnihilator 1" })).toEqual({ n: 1 });
    expect(parseAnnihilator({ oracle: "Menace; Annihilator 3" })).toEqual({ n: 3 });
  });
  it("strips reminder text before matching (real printed form)", () => {
    expect(parseAnnihilator({ oracle: `Annihilator 2 ${ANN_REMINDER}` })).toEqual({ n: 2 });
  });
  it("sums multiple instances (CR 702.86b — each triggers separately)", () => {
    expect(parseAnnihilator({ oracle: "Annihilator 1\nAnnihilator 1" })).toEqual({ n: 2 });
  });
  it("returns null with no annihilator keyword", () => {
    expect(parseAnnihilator({ oracle: "Flying" })).toBeNull();
    expect(parseAnnihilator({ oracle: "" })).toBeNull();
    expect(parseAnnihilator({})).toBeNull();
  });
  it("FP GUARD: a prose mention of the word 'annihilator' (no keyword line) does NOT match", () => {
    expect(parseAnnihilator({ oracle: "This is the great annihilator of worlds, a fearsome beast." })).toBeNull();
  });
  it("FP GUARD: 'annihilator' with no count does not match (the keyword always carries N)", () => {
    expect(parseAnnihilator({ oracle: "Annihilator" })).toBeNull();
  });
});

describe("applyAnnihilatorTriggers — the defender sacrifices N permanents (runtime)", () => {
  it("AI defender, Annihilator 2, 3 permanents → sacrifices the 2 least-valuable (1 remains)", () => {
    const out = drainAISacChain(
      applyAnnihilatorTriggers(st({ userBf: [annCreature("e1", 2)], aiBf: [land("L1"), dork("d1", 4), dork("d2", 1)], attackers: [atk("e1")] })),
    );
    expect(out.players.ai.battlefield).toHaveLength(1);                       // 3 − 2 = 1
    expect(out.players.ai.battlefield[0].card.name).toBe("Body d1");          // kept the highest-MV (4) body; gave up the land + the MV1 body
  });

  it("a permanent (land/artifact/etc.), not just a creature, may be sacrificed (what:'permanent')", () => {
    // ann1, defender holds ONLY a land → it must be the sacrifice (forced single, no creature available).
    const out = applyAnnihilatorTriggers(st({ userBf: [annCreature("e2", 1)], aiBf: [land("Lonly")], attackers: [atk("e2")] }));
    expect(out.pendingChoice).toBeUndefined();                               // exactly 1 permanent → forced, no pause
    expect(out.players.ai.battlefield).toHaveLength(0);                      // the land was sacrificed
  });

  it("HUMAN defender → pauses with a real picker (sacrifice-choice for 'user'), does NOT auto-resolve", () => {
    const out = applyAnnihilatorTriggers(
      st({ aiBf: [annCreature("eA", 1, "ai")], userBf: [land("uL", "user"), dork("ud", 2, "user")], attackers: [atk("eA", "ai")] }),
    );
    expect(out.pendingChoice?.kind).toBe("sacrifice-choice");
    expect(out.pendingChoice.controller).toBe("user");                       // the human DEFENDER chooses (CR 701.16)
    expect(out.pendingChoice.candidates).toHaveLength(2);                    // both of their permanents are eligible
    // No sacrifice has happened yet — the human still has both permanents until they pick.
    expect(out.players.user.battlefield).toHaveLength(2);
  });

  it("Annihilator N larger than the defender's board sacrifices everything (can't over-sacrifice)", () => {
    const out = drainAISacChain(
      applyAnnihilatorTriggers(st({ userBf: [annCreature("e3", 6)], aiBf: [land("L1"), dork("d1", 2)], attackers: [atk("e3")] })),
    );
    expect(out.players.ai.battlefield).toHaveLength(0);                      // 2 permanents, asked for 6 → all gone, no crash
  });

  it("no annihilator attacker → byte-identical no-op (same reference)", () => {
    const base = st({ userBf: [vanilla("v")], aiBf: [land("Lx")], attackers: [atk("v")] });
    expect(applyAnnihilatorTriggers(base)).toBe(base);
  });

  it("no attackers at all → no-op", () => {
    const base = st({ userBf: [annCreature("e", 4)], aiBf: [land("L")], attackers: [] });
    expect(applyAnnihilatorTriggers(base)).toBe(base);
  });

  it("the annihilator creature sits BACK (not attacking) → no trigger", () => {
    // e attacks with a different (vanilla) creature; the annihilator is on the board but did not attack.
    const out = applyAnnihilatorTriggers(st({ userBf: [annCreature("e", 4), vanilla("v")], aiBf: [land("L1"), land("L2")], attackers: [atk("v")] }));
    expect(out).toEqual(st({ userBf: [annCreature("e", 4), vanilla("v")], aiBf: [land("L1"), land("L2")], attackers: [atk("v")] }));
    expect(out.players.ai.battlefield).toHaveLength(2);                      // untouched
  });

  it("MULTI-ATTACKER (FIFO-safe): two attacking annihilators pool into ONE chain — the defender sacrifices the SUM", () => {
    // Annihilator 1 + Annihilator 2 attacking the same AI defender (3 perms) → 3 total sacrifices → 0 remain.
    // (If the second hook had collided with the first's pendingChoice it would have silently dropped 2 — the
    //  bug the pooled single-chain design prevents.)
    const out = drainAISacChain(
      applyAnnihilatorTriggers(
        st({ userBf: [annCreature("e1", 1), annCreature("e2", 2)], aiBf: [land("L1"), dork("d1", 3), dork("d2", 1)], attackers: [atk("e1"), atk("e2")] }),
      ),
    );
    expect(out.players.ai.battlefield).toHaveLength(0);                      // 1 + 2 = 3 sacrifices, all 3 gone
  });

  it("MULTIPLAYER: each attacking annihilator hits ITS OWN defending player (no cross-sacrifice)", () => {
    // user's annihilator attacks ai; that's the only defender here. Assert the user's own board is untouched
    // (the defender, not the attacker, sacrifices) and the ai loses exactly N.
    const out = drainAISacChain(
      applyAnnihilatorTriggers(st({ userBf: [annCreature("e", 2), vanilla("keep", "user")], aiBf: [land("L1"), dork("d1", 1), dork("d2", 5)], attackers: [atk("e")] })),
    );
    expect(out.players.user.battlefield.some((p) => p.card.id === "c-keep")).toBe(true); // attacker's board intact
    expect(out.players.ai.battlefield).toHaveLength(1);                                  // defender lost 2 of 3
  });

  it("defender already left the game (CR 800.4a) → clean skip (no crash)", () => {
    const s = st({ userBf: [annCreature("e", 3)], aiBf: [land("L")], attackers: [{ permanentId: "e", attackingPlayer: "user", defender: "ghost" }] });
    const out = applyAnnihilatorTriggers(s);
    expect(out).toBe(s);                                                     // no such defender → contributes nothing → no-op
  });
});

describe("Annihilator — end-to-end through the engine (runStepActions @ declare-blockers)", () => {
  it("at the declare-blockers transition: the defender's sacrifice chain is set up, then resolves to lose N", () => {
    let s = st({ userBf: [annCreature("e", 2)], aiBf: [land("La"), dork("db", 3), dork("dc", 1)], attackers: [atk("e")] });
    s = runStepActions(s);                                                   // fires checkAttackTriggers + the annihilator hook
    expect(s.pendingChoice?.kind).toBe("sacrifice-choice");                  // a real ≥2 choice was set up
    s = drainAISacChain(s);                                                  // the driver auto-resolves the AI defender's picks
    expect(s.players.ai.battlefield).toHaveLength(1);                        // sacrificed 2 of 3
    expect(s.players.ai.battlefield[0].card.name).toBe("Body db");          // kept the highest-MV body
  });

  it("dies-triggers fire for a sacrificed creature (the shared sacrificeCreatureEffect path)", () => {
    // A defender creature with a death trigger that drains the controller's life — proves the sacrifice runs
    // through the real dies-trigger machinery, not a silent zone move.
    const dyer = createPermanent({
      id: "dy",
      card: { id: "c-dy", name: "Blood Artist Lite", type: "Creature — Vampire", power: 0, toughness: 1, cmc: 1, oracle: "When this creature dies, each opponent loses 1 life." },
      controller: "ai",
    });
    let s = st({ userBf: [annCreature("e", 1)], aiBf: [dyer], attackers: [atk("e")] });
    const userLifeBefore = s.players.user.life;
    s = runStepActions(s);                                                   // ann1, 1 permanent → FORCED sac of the dyer
    // Forced single sac happened inline (no pause); resolve any enqueued death trigger off the stack.
    let g = 0;
    while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield).toHaveLength(0);                        // the creature was sacrificed
    expect(s.players.user.life).toBeLessThan(userLifeBefore);               // its dies-trigger drained the opponent
  });
});

describe("Annihilator — coverage flip (CREED: whole card modeled → native; a second ability → PARK)", () => {
  it("CREED PARK: Pathrazer's 'can't be blocked except by three or more' is not a covered keyword → body-only", () => {
    expect(classifyCard({ name: "Pathrazer", type: "Creature — Eldrazi", mana: "{11}", oracle: "Annihilator 3\nPathrazer of Ulamog can't be blocked except by three or more creatures." }))
      .toBe("body-only"); // the can't-be-blocked-except-by-3 clause is NOT a covered keyword → residue → PARK
  });
  it("classifyCard: a CLEAN vanilla annihilator body → native-trigger", () => {
    expect(classifyCard({ name: "Clean Eldrazi", type: "Creature — Eldrazi", mana: "{8}", oracle: "Annihilator 2" })).toBe("native-trigger");
  });
  it("classifyCard: an annihilator body with only evergreen keywords → native-trigger", () => {
    expect(classifyCard({ name: "Flyer", type: "Creature — Eldrazi", mana: "{7}", oracle: "Flying, trample\nAnnihilator 1" })).toBe("native-trigger");
  });
  it("classifyCard: real printed reminder text does not block the flip", () => {
    expect(classifyCard({ name: "Reminded", type: "Creature — Eldrazi", mana: "{8}", oracle: `Annihilator 2 ${ANN_REMINDER}` })).toBe("native-trigger");
  });
  it("CREED PARK: Kozilek-style (cast trigger + GY-shuffle trigger) stays body-only — the extra triggers are unmodeled", () => {
    const kozilek = "When you cast this spell, draw four cards.\nAnnihilator 4\nWhen Kozilek is put into a graveyard from anywhere, its owner shuffles their graveyard into their library.";
    expect(classifyCard({ name: "Kozilek, Butcher of Truth", type: "Legendary Creature — Eldrazi", mana: "{10}", oracle: kozilek })).toBe("body-only");
  });
  it("CREED PARK: Ulamog-style (cast trigger 'exile two target permanents') stays body-only", () => {
    const ulamog = "When you cast this spell, exile two target permanents.\nAnnihilator 4\nUlamog is indestructible.";
    // indestructible IS a covered keyword, but the cast trigger leaves an unmodeled trigger → PARK.
    expect(classifyCard({ name: "Ulamog, the Infinite Gyre", type: "Legendary Creature — Eldrazi", mana: "{11}", oracle: ulamog })).toBe("body-only");
  });
  it("CREED PARK: a non-keyword static rider keeps the card off native", () => {
    const withStatic = "Annihilator 2\nOther creatures you control get +1/+1.";
    expect(classifyCard({ name: "Anthemic Eldrazi", type: "Creature — Eldrazi", mana: "{8}", oracle: withStatic })).toBe("body-only");
  });
  it("annihilator is creature-only: a non-creature card with the word does not flip", () => {
    // (Defensive — annihilator never appears off a creature; gate proven.)
    expect(classifyCard({ name: "Weird Artifact", type: "Artifact", mana: "{4}", oracle: "Annihilator 2" })).not.toBe("native-trigger");
  });
});
