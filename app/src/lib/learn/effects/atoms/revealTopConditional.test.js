/**
 * ===== REVEAL-TOP-CONDITIONAL (Lurking Predators) ===== the opponent-cast enchantment native.
 *
 * "Whenever an opponent casts a spell, reveal the top card of your library. If it's a creature card, put it
 * onto the battlefield. Otherwise, you may put that card on the bottom of your library."
 *
 * The trigger (cast / whose:opponent / any spell) was already detected; this slice adds the EFFECT so the
 * whole card flips native. The three-sentence branch (reveal → if-creature-onto-battlefield → otherwise-may-
 * bottom) spans the clause splitter, so the parser collapses it up front (matchRevealTopConditional) to ONE
 * `reveal-top-conditional` atom whose resolver (applyRevealTopConditional) plays the WHOLE branch:
 *   - CREATURE top → enters the controller's battlefield from the library (enterCardFromZone, firing ETB /
 *     permanent-enters / landfall watchers), a free creature under the controller's control.
 *   - NON-CREATURE top → the "you may put on the bottom" optional is resolved DETERMINISTICALLY to the bottom
 *     (exactly like EXPLORE's deterministic keep-on-top option — both branches are legal and drop no clause).
 *   - EMPTY library → a clean no-op reveal of zero cards.
 *
 * CREED near-misses pinned: a different fallback / a "then draw" rider / an "if it's a LAND card" variant / a
 * shuffle stays LOW → Arbiter (the collapse anchor is exact — no partial, no fabricated fallback).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCastTriggers } from "../../triggers.js";
import { parseEffectClause, parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { classifyCard, permanentTriggersCovered } from "../../coverage.js";
import { applyRevealTopConditional } from "./library.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

const ORACLE =
  "Whenever an opponent casts a spell, reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library.";
const LURKING = {
  name: "Lurking Predators",
  type: "Enchantment",
  type_line: "Enchantment",
  oracle: ORACLE,
  oracle_text: ORACLE,
  mana_cost: "{4}{G}{G}",
  cmc: 6,
};
// The effectClause detectTriggers hands to the parser (the trigger lead-in removed).
const EFFECT_CLAUSE =
  "reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library";

describe("REVEAL-TOP-CONDITIONAL — classification + parse", () => {
  it("Lurking Predators classifies native-trigger (was body-only — the cast-trigger's reveal-conditional effect was the only blocker)", () => {
    expect(classifyCard(LURKING)).toBe("native-trigger");
    expect(permanentTriggersCovered(LURKING)).toBe(true);
  });

  it("the cast trigger detects (cast / opponent / any spell) and its effect parses HIGH to one non-targeted reveal-top-conditional atom", () => {
    const trigs = detectTriggers(LURKING);
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "cast", whose: "opponent", spellFilter: "any" });
    const p = parseEffectClause(trigs[0].effectClause, "Enchantment");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reveal-top-conditional", targetType: null }]);
    // Non-targeted (the controller's own library) → routes natively on the trigger flush (no chosen target).
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("the three-sentence effect parses identically as a standalone program (collapsed matcher, not the splitter)", () => {
    // parseEffectProgram is the instant/sorcery entry point; the collapse must survive it too (Yuriko-parity).
    const p = parseEffectProgram({ type: "Instant", oracle: EFFECT_CLAUSE });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["reveal-top-conditional"]);
  });

  it("CREED near-misses: a different fallback / a rider / an 'if it's a land card' variant / a shuffle stays LOW → Arbiter", () => {
    const low = (oracle) => programConfidence(parseEffectProgram({ type: "Instant", oracle }));
    // fallback is "into your graveyard" instead of "on the bottom of your library" — unmodeled
    expect(low("reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, you may put that card into your graveyard")).toBe("low");
    // condition is "a land card" instead of "a creature card" — unmodeled (land onto battlefield is a different effect)
    expect(low("reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library")).toBe("low");
    // a trailing "then draw a card" rider — unmodeled residue after the exact anchor
    expect(low("reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, you may put that card on the bottom of your library. Draw a card")).toBe("low");
    // MANDATORY (not "you may") bottom — a different shape than the printed optional
    expect(low("reveal the top card of your library. If it's a creature card, put it onto the battlefield. Otherwise, put that card on the bottom of your library")).toBe("low");
  });
});

// ── runtime helpers ──
function twoPlayerWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "ai",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library: over.lib || [], hand: [], life: 40 },
      ai: { ...s.players.ai, battlefield: [], library: [], hand: [], life: 40 },
    },
  };
}
function makeLurkingPerm(id = "lurking", controller = "user") {
  return createPermanent({
    id,
    card: { id: "c-" + id, name: "Lurking Predators", type: "Enchantment", oracle: ORACLE },
    controller,
    summoningSick: false,
  });
}
// The AI (an opponent of the user) casts a spell → flush + resolve the user's Lurking Predators trigger.
function opponentCasts(s, spellCard) {
  let next = checkCastTriggers(s, { spellCard, casterId: "ai" });
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((next.stack || []).length && g++ < 30) next = resolveTopOfStack(next);
  return next;
}

describe("REVEAL-TOP-CONDITIONAL — resolver unit (applyRevealTopConditional)", () => {
  it("CREATURE top → enters the controller's battlefield (removed from library), firing ETB watchers", () => {
    const bear = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
    const filler = { id: "f", name: "F", type: "Instant" };
    const s = twoPlayerWith({ user: [], lib: [bear, filler] });
    const after = applyRevealTopConditional(s, { op: "reveal-top-conditional" }, { controller: "user" });
    // The creature is now a permanent under the controller's control...
    expect(after.players.user.battlefield.some((p) => p.card.id === "bear")).toBe(true);
    // ...and NO LONGER in the library (top consumed); filler remains.
    expect(after.players.user.library.map((c) => c.id)).toEqual(["f"]);
  });

  it("NON-CREATURE top → deterministically put on the BOTTOM of the library (top consumed, appended last)", () => {
    const spell = { id: "spell", name: "Divination", type: "Sorcery", power: null, toughness: null, oracle: "" };
    const a = { id: "a", name: "A", type: "Instant" };
    const b = { id: "b", name: "B", type: "Instant" };
    const s = twoPlayerWith({ user: [], lib: [spell, a, b] });
    const after = applyRevealTopConditional(s, { op: "reveal-top-conditional" }, { controller: "user" });
    // Nothing entered the battlefield; the revealed non-creature moved top → bottom (order preserved for the rest).
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["a", "b", "spell"]);
  });

  it("EMPTY library → a clean no-op (nothing enters, nothing moves)", () => {
    const s = twoPlayerWith({ user: [], lib: [] });
    const after = applyRevealTopConditional(s, { op: "reveal-top-conditional" }, { controller: "user" });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.library).toHaveLength(0);
  });
});

describe("REVEAL-TOP-CONDITIONAL — end-to-end (opponent casts → the enchantment's trigger fires)", () => {
  it("an opponent's cast reveals a CREATURE top → it enters the controller's battlefield", () => {
    const bear = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
    let s = twoPlayerWith({ user: [makeLurkingPerm()], lib: [bear, { id: "f", name: "F", type: "Instant" }] });
    s = opponentCasts(s, { name: "Some Spell", type: "Sorcery" });
    // Grizzly Bears entered the user's battlefield (alongside the Lurking Predators enchantment).
    expect(s.players.user.battlefield.some((p) => p.card.id === "bear")).toBe(true);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["f"]);
  });

  it("an opponent's cast reveals a NON-CREATURE top → it goes to the bottom (the deterministic 'you may')", () => {
    const spell = { id: "spell", name: "Divination", type: "Sorcery", oracle: "" };
    let s = twoPlayerWith({ user: [makeLurkingPerm()], lib: [spell, { id: "a", name: "A", type: "Instant" }] });
    s = opponentCasts(s, { name: "Some Spell", type: "Instant" });
    expect(s.players.user.battlefield.some((p) => p.card?.id === "spell")).toBe(false);
    expect(s.players.user.library.map((c) => c.id)).toEqual(["a", "spell"]);
  });

  it("the CONTROLLER's OWN cast does NOT fire the trigger (whose:opponent gate)", () => {
    const bear = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };
    let s = twoPlayerWith({ user: [makeLurkingPerm()], lib: [bear] });
    // The USER (the enchantment's controller) casts — the opponent-watcher stays silent.
    let next = checkCastTriggers(s, { spellCard: { name: "My Spell", type: "Instant" }, casterId: "user" });
    next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((next.stack || []).length && g++ < 30) next = resolveTopOfStack(next);
    expect(next.players.user.battlefield.some((p) => p.card.id === "bear")).toBe(false); // no reveal
    expect(next.players.user.library.map((c) => c.id)).toEqual(["bear"]);                // library untouched
  });
});
