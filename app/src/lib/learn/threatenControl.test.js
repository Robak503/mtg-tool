/**
 * threatenControl.test.js — THREATEN (Act of Treason / Turn Against / Goatnap and ~45 siblings). Before
 * this, FORTY-SEVEN corpus cards printed "Gain control of target creature until end of turn" and ZERO of
 * them were native.
 *
 * ⭐ THE CAUSE WAS NOT WHAT THE FAMILY NAME SUGGESTS, and finding that out is the whole story of this slice.
 * control.js's own header named two missing pieces: "an end-of-turn revert schedule + the untap/haste
 * rider". The riders were NOT missing. Measured before building anything:
 *     "Untap target creature. It gains haste until end of turn."          -> [untap, pump[bind]]   ✅
 *     "Tap target creature. Untap that creature. It gains haste…"          -> []                    ❌
 * — a card with NO control clause in it at all. The real blocker was that exactly ONE referent could chain.
 * A second "that creature" / "it" dropped the entire program. Attributing 47 cards to a control-duration
 * cause would have been grouping by SYMPTOM; the shared cause is the referent chain.
 *
 * ── HALF ONE: the referent chain (CR 608.2) ────────────────────────────────────────────────────────────
 * A referent atom is emitted with NO targetType, so it can never itself be a valid antecedent. Both the
 * parse gate and the runtime asked for the LITERAL previous atom. Now both walk back to the nearest atom
 * that actually owns targets, skipping referents — because every "it" in a chain names the same permanent.
 *
 * ⛔ THE RUNTIME HALF WAS WRITTEN FIRST, AND THAT ORDER IS THE POINT. Loosening only the parse gate would
 * have admitted the card while the third atom read `targetsForAtom(targets, i-1)` — the slice of an atom the
 * enumerator never allocated targets for. EMPTY. Act of Treason would have classified native-spell and
 * SILENTLY DROPPED ITS HASTE GRANT: a clean flip-diff, a green suite, and a wrong board. Pinned below by
 * driving the grant, not by reading the atom list.
 *
 * ── HALF TWO: the end-of-turn revert ───────────────────────────────────────────────────────────────────
 * The steal reuses the stash the control Auras have always used (`controlOriginal` + moveControl) and
 * expires at the cleanup step under CR 514.2 rather than on detach.
 *
 * ⛔ IT IS A SWEEP, NOT A SCHEDULED CALLBACK, and controlAura.js records why: a creature that never goes
 * home is a LEGAL-LOOKING board, so a green suite and a completed game both stay silent about permanent
 * theft. A sweep over the stamp cannot be skipped by an interrupted resolution or a thief that has itself
 * left; the only way a creature stays stolen is if the sweep does not run, which is ONE call site to verify
 * rather than N.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test per
 * correction 30): the runtime walk reverted to a literal i-1 -> the haste-grant pin goes red while the
 * classify pin stays GREEN (which is exactly the silent failure described above); the cleanup sweep removed
 * -> the goes-home pin red; the untilEndOfTurn parse arm removed -> every flip pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, revertEndOfTurnControl, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const ACT_OF_TREASON = { id: "c-aot", name: "Act of Treason", type: "Sorcery", mana: "{2}{R}",
  oracle: "Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn." };
const TRAITOROUS_BLOOD = { id: "c-tb", name: "Traitorous Blood", type: "Sorcery", mana: "{2}{R}{R}",
  oracle: "Gain control of target creature until end of turn. Untap it. It gains trample and haste until end of turn." };

function perm(card, id, over = {}) {
  return { id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardWithFoe(over = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const foe = perm(BEAR, "foe", { controller: "ai", tapped: true, ...over });
  return { ...s0, activePlayer: "user",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [] }, ai: { ...s0.players.ai, battlefield: [foe] } } };
}
const controllerOf = (state, id) => Object.entries(state.players).find(([, p]) => (p.battlefield || []).some((x) => x.id === id))?.[0] ?? "GONE";
const permOf = (state, id) => Object.values(state.players).flatMap((p) => p.battlefield || []).find((x) => x.id === id);
/**
 * ⛔ THE `atomIndex` TAG IS LOAD-BEARING IN THIS HARNESS, and leaving it off made the central pin HOLLOW.
 * `targetsForAtom` returns the WHOLE target list when no target carries an atomIndex:
 *     const tagged = targets.some(t => typeof t?.atomIndex === "number");
 *     return tagged ? targets.filter(t => t.atomIndex === atomIndex) : targets;
 * So an untagged harness hands every atom the same target no matter which index it asks for — which
 * sidesteps the exact bug this file exists to pin. Measured: with untagged targets, reverting the runtime
 * walk to a literal `i - 1` left all 14 tests GREEN.
 * The real cast-time enumerator tags per atom, so tagging here is fidelity, not decoration: the target
 * belongs to atom 0 (the only atom with a targetType) and atoms 1-2 own none.
 */
function steal(card, state) {
  return runEffectProgram(state, { id: "so1", source: { name: card.name },
    payload: { params: { program: parseEffectProgram(card), controller: "user",
      targets: [{ type: "creature", id: "foe", controller: "ai", atomIndex: 0 }], sourceId: "src1" } } });
}

describe("⭐ the referent CHAIN — the actual cause, provable with no control clause at all", () => {
  const prog = (oracle) => parseEffectProgram({ id: "p", name: "Probe", type: "Sorcery", mana: "{2}{R}", oracle });

  it("one referent always worked; a SECOND used to drop the whole program", () => {
    expect((prog("Untap target creature. It gains haste until end of turn.").atoms || []).map((a) => a.op))
      .toEqual(["untap", "pump"]);
    expect((prog("Tap target creature. Untap that creature. It gains haste until end of turn.").atoms || []).map((a) => a.op))
      .toEqual(["tap", "untap", "pump"]);
  });

  it("both referents bind, and the chain has no depth limit", () => {
    const p = prog("Tap target creature. Untap that creature. It gains haste until end of turn.");
    expect(p.atoms[1].bindPreviousTargets).toBe(true);
    expect(p.atoms[2].bindPreviousTargets).toBe(true);
    // THREE referents, two different shapes — the walk is a loop, not a one-step lookback.
    expect((prog("Untap target creature. It gains haste until end of turn. It gains trample until end of turn.").atoms || []).map((a) => a.op))
      .toEqual(["untap", "pump", "pump"]);
    expect((prog("Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. It gains trample until end of turn.").atoms || []).map((a) => a.op))
      .toEqual(["gain-control", "untap", "pump", "pump"]);
  });

  it("ⓘ an UNRELATED, pre-existing guard refuses untap-then-tap — recorded so it is not misread as chain depth", () => {
    // Written down because it cost a wrong assumption: "Tap. Untap that. Tap that." returns [] and looks
    // like a 3-referent limit. It is not — untap-then-tap is refused at TWO clauses, with no chain
    // involved, while untap -> pump -> untap (also three, also a repeated op) parses fine. Nothing in this
    // slice touches that guard.
    expect((prog("Untap target creature. Tap that creature.").atoms || [])).toEqual([]);
    expect((prog("Untap target creature. It gains haste until end of turn. Untap it.").atoms || []).map((a) => a.op))
      .toEqual(["untap", "pump", "untap"]);
  });

  it("⛔ a referent with NO targeting antecedent anywhere before it still drops the spell", () => {
    expect((prog("Draw a card. It gains haste until end of turn.").atoms || [])).toEqual([]);
  });
});

describe("recognition — the Threaten family", () => {
  it("the canonical carriers flip", () => {
    expect(classifyCard(ACT_OF_TREASON)).toBe("native-spell");
    expect(classifyCard(TRAITOROUS_BLOOD)).toBe("native-spell");
  });

  it("the control atom carries the duration as a flag, not a new op", () => {
    // A separate op would have broken every downstream consumer of "gain-control" (targeting, legality,
    // the event log). The flag keeps them all working untouched.
    const atoms = parseEffectProgram(ACT_OF_TREASON).atoms;
    expect(atoms.map((a) => a.op)).toEqual(["gain-control", "untap", "pump"]);
    expect(atoms[0].untilEndOfTurn).toBe(true);
    expect(atoms[0].targetType).toBe("creature");
  });

  it("⛔ the INDEFINITE form is untouched and carries no duration flag", () => {
    const atoms = parseEffectProgram({ id: "c-so", name: "Sliver Overlord", type: "Sorcery", mana: "{3}",
      oracle: "Gain control of target creature." }).atoms;
    expect(atoms[0].untilEndOfTurn).toBeUndefined();
  });
});

describe("⭐ LAW 6 — the whole steal-and-return cycle on a real board", () => {
  it("⭐ resolving takes the creature, UNTAPS it, and grants haste — all three clauses, not just the first", () => {
    // This is the pin that catches the silent failure. With the runtime walk reverted to a literal i-1 the
    // card still CLASSIFIES native and the control still moves — only the haste (and untap) quietly vanish.
    const after = steal(ACT_OF_TREASON, boardWithFoe());
    expect(controllerOf(after, "foe")).toBe("user");
    expect(permOf(after, "foe").tapped).toBe(false);
    expect(permanentHasKeyword(after, "foe", "haste")).toBe(true);
  });

  it("the steal stamps where home is, so the revert needs nothing else to have run", () => {
    const p = permOf(steal(ACT_OF_TREASON, boardWithFoe()), "foe");
    expect(p.controlUntilEndOfTurn).toBe(true);
    expect(p.controlOriginal).toBe("ai");
  });

  it("⭐ the cleanup sweep sends it home and clears the stamp", () => {
    const after = revertEndOfTurnControl(steal(ACT_OF_TREASON, boardWithFoe()));
    expect(controllerOf(after, "foe")).toBe("ai");
    expect(permOf(after, "foe").controlUntilEndOfTurn).toBeUndefined();
    expect(permOf(after, "foe").controlOriginal).toBeUndefined();
  });

  it("⛔ the sweep is IDEMPOTENT — a second pass must not move anything", () => {
    const once = revertEndOfTurnControl(steal(ACT_OF_TREASON, boardWithFoe()));
    expect(controllerOf(revertEndOfTurnControl(once), "foe")).toBe("ai");
  });

  it("the untap does NOT revert — only the control does (CR 514.2 ends the effect, not its consequences)", () => {
    const after = revertEndOfTurnControl(steal(ACT_OF_TREASON, boardWithFoe()));
    expect(permOf(after, "foe").tapped).toBe(false);
  });

  it("⛔ a board with nothing stolen is a clean no-op (the sweep returns the same state object)", () => {
    const plain = boardWithFoe();
    expect(revertEndOfTurnControl(plain)).toBe(plain);
  });

  it("a multi-keyword rider grants EVERY keyword it names", () => {
    const after = steal(TRAITOROUS_BLOOD, boardWithFoe());
    expect(permanentHasKeyword(after, "foe", "haste")).toBe(true);
    expect(permanentHasKeyword(after, "foe", "trample")).toBe(true);
  });
});
