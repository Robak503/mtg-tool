/**
 * ===== IMPULSE-EXILE-AND-PLAY ===== "Exile the top card of your library. You may play that card this turn."
 * (Professional Face-Breaker's sac-Treasure activated ability; the Light Up the Stage / impulse-draw family).
 *
 * The `impulse-exile` atom moves the top card of the controller's library to their exile FACE-UP and stamps
 * `_impulse`/`_impulseTurn`. The play PERMISSION is then genuinely OFFERED + ENFORCED at the action layer
 * (legalChoices.actionsPlayImpulseFromExile) THIS TURN ONLY — a nonland is cast at FULL COST from exile, a land
 * is played from exile (a land drop). gameEngine's cleanup step clears the flags at end of turn so the window
 * closes and the card stays inert in exile. This is a REAL playable-from-exile subsystem (not a parse-only
 * flip): the exiled card can actually be cast/played and leaves exile through the normal machinery.
 *
 * Pins:
 *   - parser: the exact two-sentence shape → ONE high impulse-exile atom; every variant (count, MV cap,
 *     other zone, cost rider) stays LOW → Arbiter (CREED near-misses).
 *   - resolver: top card → exile face-up + stamped; empty library = clean no-op; eliminated controller = no-op.
 *   - action layer: the impulse card is castable at FULL cost this turn; a land is playable this turn; NOT after
 *     a land drop is spent; NOT on a different (later) turn.
 *   - cleanup: the end-of-turn cleanup strips the _impulse markers (the permission lapses; the card stays exiled).
 *   - coverage: Professional Face-Breaker flips native-mixed (the sac-Treasure ability is now modeled); the
 *     combat-damage-team → Treasure trigger + Menace were already modeled.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "../parser.js";
import { parseActivatedAbilities } from "../abilities.js";
import { _resetIdsForTests, createGameState } from "../../gameState.js";
import { legalActionsForPlayer } from "../../legalChoices.js";
import { runStepActions } from "../../gameEngine.js";
import { classifyCard } from "../../coverage.js";

beforeEach(() => _resetIdsForTests());

const FACE_BREAKER_ORACLE =
  "Menace\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nSacrifice a Treasure: Exile the top card of your library. You may play that card this turn.";
const IMPULSE_CLAUSE = "Exile the top card of your library. You may play that card this turn.";

const spell = (id, over = {}) => ({ id, name: id, type: "Instant", mana: "{1}", oracle: "Draw a card.", ...over });
const land = (id) => ({ id, name: id, type: "Basic Land — Mountain", oracle: "" });

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    consecutivePasses: 0, ...over,
  };
}
function withLibrary(state, playerId, library) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library } } };
}
function withExile(state, playerId, exile) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], exile } } };
}
const impulseAtom = () => parseEffectClause(IMPULSE_CLAUSE, { type: "Creature" }).atoms[0];

// ────────────────────────────────────────────────────────────────────────────
// 1. Parser — the exact shape flips HIGH; CREED near-misses stay LOW → Arbiter
// ────────────────────────────────────────────────────────────────────────────
describe("IMPULSE-EXILE — parser", () => {
  it("'Exile the top card of your library. You may play that card this turn.' → ONE high impulse-exile atom", () => {
    const p = parseEffectClause(IMPULSE_CLAUSE, { type: "Creature" });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "impulse-exile", targetType: null }]);
  });

  it("the pronoun 'it' + 'until end of turn' variants also parse HIGH", () => {
    for (const c of [
      "Exile the top card of your library. You may play it this turn.",
      "Exile the top card of your library. You may play that card until end of turn.",
    ]) {
      expect(programConfidence(parseEffectClause(c, { type: "Creature" }))).toBe("high");
    }
  });

  it("CREED near-misses stay LOW → Arbiter (never a partial flip)", () => {
    const low = (oracle) => expect(programConfidence(parseEffectClause(oracle, { type: "Creature" }))).toBe("low");
    // (A COUNT — "the top two cards" — GRADUATED out of this list. It was a scope marker for the single-card
    //  slice, annotated "a different, unmodeled magnitude"; the count is now a parameter on the same atom and
    //  the same this-turn stamp, pinned in impulseExileCount.test.js. The near-misses below are GENUINE
    //  refusals — each needs machinery that still does not exist — and are untouched.)
    // A MANA-VALUE cap — an unmodeled filter on what may be played.
    low("Exile the top card of your library. You may play that card this turn if it's a land card.");
    // A COST rider ("If you do, …") — the play permission is entangled with an extra effect.
    low("Exile the top card of your library. You may play that card this turn. If you don't, you lose 2 life.");
    // A DIFFERENT zone / permission window ("without paying its mana cost").
    low("Exile the top card of your library. You may cast that card this turn without paying its mana cost.");
    // NOT the controller's own library (top card of an opponent's library).
    low("Exile the top card of target opponent's library. You may play that card this turn.");
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. Resolver — top card → exile face-up + stamped; no-op guards
// ────────────────────────────────────────────────────────────────────────────
describe("IMPULSE-EXILE — resolver", () => {
  it("moves the top library card to exile, stamped _impulse + _impulseTurn = the current turn", () => {
    let s = mainState({ turn: 5 });
    s = withLibrary(s, "user", [spell("top"), spell("second"), spell("third")]);
    s = resolveAtom(s, impulseAtom(), { controller: "user", targets: [] });
    // The top card left the library (the next card is now on top).
    expect(s.players.user.library.map((c) => c.id)).toEqual(["second", "third"]);
    // It's in exile, face-up, stamped for THIS turn.
    const exiled = s.players.user.exile.find((c) => c.id === "top");
    expect(exiled).toMatchObject({ _impulse: true, _impulseTurn: 5 });
  });

  it("an empty library is a clean no-op (nothing exiled, no throw)", () => {
    let s = mainState();
    s = withLibrary(s, "user", []);
    expect(() => { s = resolveAtom(s, impulseAtom(), { controller: "user", targets: [] }); }).not.toThrow();
    expect(s.players.user.exile).toHaveLength(0);
  });

  it("an eliminated controller mid-resolution is a clean no-op (CR 800.4a)", () => {
    let s = mainState();
    s = withLibrary(s, "user", [spell("top")]);
    const gone = { ...s, players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "user")) };
    expect(() => resolveAtom(gone, impulseAtom(), { controller: "user", targets: [] })).not.toThrow();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Action layer — the impulse-exiled card is genuinely PLAYABLE this turn
// ────────────────────────────────────────────────────────────────────────────
describe("IMPULSE-EXILE — the exiled card is playable THIS TURN (real capability, not a marker)", () => {
  it("a nonland impulse card is offered as a FULL-COST cast from exile this turn", () => {
    let s = mainState({ turn: 3 });
    // A Lightning-bolt-ish instant impulse-exiled this turn, with mana to pay for it.
    const exiled = { ...spell("bolt", { mana: "{R}", oracle: "This deals 3 damage to any target." }), _impulse: true, _impulseTurn: 3 };
    s = withExile(s, "user", [exiled]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 1 } } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "bolt");
    expect(casts.length).toBeGreaterThanOrEqual(1);
    // FULL cost (not free) — the play permission pays normally, unlike discover/cascade/plot.
    expect(casts.every((a) => !a.freeCast)).toBe(true);
    expect(casts.every((a) => a.fromZone === "exile")).toBe(true);
  });

  it("a LAND impulse card is offered as a play-land-from-exile this turn (a land drop)", () => {
    let s = mainState({ turn: 3 });
    const exiledLand = { ...land("mtn"), _impulse: true, _impulseTurn: 3 };
    s = withExile(s, "user", [exiledLand]);
    const plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.cardId === "mtn");
    expect(plays).toHaveLength(1);
    expect(plays[0].fromZone).toBe("exile");
  });

  it("NOT offered once the land drop is already spent (a land impulse still respects the land-per-turn cap)", () => {
    let s = mainState({ turn: 3 });
    const exiledLand = { ...land("mtn"), _impulse: true, _impulseTurn: 3 };
    s = withExile(s, "user", [exiledLand]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 1 } } };
    const plays = legalActionsForPlayer(s, "user").filter((a) => a.kind === "play-land" && a.cardId === "mtn");
    expect(plays).toHaveLength(0);
  });

  it("NOT offered on a LATER turn — the permission is THIS turn only (stamp mismatch)", () => {
    let s = mainState({ turn: 9 });
    const staleExiled = { ...spell("bolt", { mana: "{R}" }), _impulse: true, _impulseTurn: 3 }; // stamped turn 3, now turn 9
    s = withExile(s, "user", [staleExiled]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 1 } } } };
    const casts = legalActionsForPlayer(s, "user").filter((a) => a.cardId === "bolt");
    expect(casts).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Cleanup — the permission lapses at end of turn (the card stays inert in exile)
// ────────────────────────────────────────────────────────────────────────────
describe("IMPULSE-EXILE — end-of-turn cleanup", () => {
  it("the cleanup step strips the _impulse markers; the card remains in exile", () => {
    // Run the cleanup step's automatic effects on turn 4 — the marker-clear happens here (CR 514.2).
    let s = mainState({ turn: 4, phase: "ending", step: "cleanup", priorityHolder: null });
    const exiled = { ...spell("bolt"), _impulse: true, _impulseTurn: 4 };
    s = withExile(s, "user", [exiled]);
    s = runStepActions(s); // cleanup step effects (empties mana, clears combat damage, clears impulse permissions)
    const stillExiled = s.players.user.exile.find((c) => c.id === "bolt");
    expect(stillExiled).toBeTruthy();                 // card is NOT put anywhere else (it stays exiled)
    expect(stillExiled._impulse).toBeUndefined();     // but the play permission is gone
    expect(stillExiled._impulseTurn).toBeUndefined();
    // And after cleanup it's no longer offered as playable.
    const revived = { ...s, phase: "precombat-main", step: "main", priorityHolder: "user", turn: 4 };
    expect(legalActionsForPlayer(revived, "user").filter((a) => a.cardId === "bolt")).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. Coverage — Professional Face-Breaker flips native-mixed
// ────────────────────────────────────────────────────────────────────────────
describe("IMPULSE-EXILE — coverage flip", () => {
  it("the sac-Treasure activated ability is now modeled (HIGH impulse-exile program)", () => {
    const acts = parseActivatedAbilities({ type: "Creature", oracle: "Sacrifice a Treasure: " + IMPULSE_CLAUSE });
    expect(acts[0].modeled).toBe(true);
    expect(acts[0].program.confidence).toBe("high");
    expect(acts[0].program.atoms).toEqual([{ op: "impulse-exile", targetType: null }]);
  });

  it("Professional Face-Breaker classifies native-mixed (whole card modeled: Menace + team-cdmg Treasure + sac-impulse)", () => {
    expect(classifyCard({ name: "Professional Face-Breaker", type: "Creature — Human Warrior", oracle: FACE_BREAKER_ORACLE }))
      .toBe("native-mixed");
  });

  it("CREED near-miss: the SAME card with an UNMODELED impulse variant stays body-only, not a partial flip", () => {
    // FIXTURE SWAPPED — this used the COUNT variant, which is modeled now, so it stopped exercising anything.
    // The assertion's intent is unchanged and still the point: an impulse variant the engine CANNOT model must
    // drop the whole card to body-only rather than flip it on the strength of its other, modeled lines.
    // Swapped to the mana-value-cap rider, which remains genuinely unmodeled (see the near-miss list above).
    const partial = FACE_BREAKER_ORACLE.replace(
      "Exile the top card of your library. You may play that card this turn.",
      "Exile the top card of your library. You may play that card this turn if it's a land card.",
    );
    expect(classifyCard({ name: "X", type: "Creature — Human Warrior", oracle: partial })).toBe("body-only");
  });

  it("…and the SAME card with the now-MODELED count variant flips, rather than silently staying parked", () => {
    // The positive counterpart to the swap above — it keeps both halves of the rule visible in one file, so
    // graduating the count cannot quietly weaken what the near-miss test was protecting.
    const counted = FACE_BREAKER_ORACLE.replace(
      "Exile the top card of your library. You may play that card this turn.",
      "Exile the top two cards of your library. You may play those cards this turn.",
    );
    expect(classifyCard({ name: "X", type: "Creature — Human Warrior", oracle: counted })).toMatch(/^native/);
  });

  it("a bare impulse-exile parses HIGH as a standalone program (the atom is registered + KNOWN)", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: IMPULSE_CLAUSE });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "impulse-exile", targetType: null }]);
  });
});
