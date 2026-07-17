/**
 * MODAL CHOOSE-ONE PARTIAL RESOLVABILITY (BLITZ ML-1, CR 700.2 / 700.2b) — a single-pick "Choose one —"
 * TRIGGER whose every mode's EFFECT is modeled (parser HIGH modal) but ONE mode targets something the α1
 * flush chooser can't place on a provably-correct side (an "ambiguous" atom — here "exile target card from
 * A graveyard", which spans every player's graveyard). The prior gate demanded EVERY mode be resolvable
 * (programTriggerTargetsResolvable), so such a card parked on the Arbiter (body-only). CR 700.2b: the
 * controller chooses the mode as the ability goes on the stack and an illegal / un-choosable mode simply
 * isn't chosen — so for CHOOSE-ONE the AI declines the ambiguous mode and picks a fully-resolvable one, and
 * the card routes natively (modalChooseOneRoutable). The census poster-children Dawnbringer Cleric & Cleanup
 * Crew (CENSUS-2026-07-17 vein #9) flip on exactly this.
 *
 * CREED: declining the un-targetable mode is a play-QUALITY false-negative on that ONE mode, never a
 * wrong-mode / mis-targeted resolution (false-positive forbidden). The relaxation is CHOOSE-ONE ONLY —
 * "choose two / one or both / one or more" keep the every-mode-resolvable gate (you can't dodge an ambiguous
 * mode when >1 must resolve). The metric (triggerRoutesNatively) and the runtime (buildTriggerStack) consult
 * the SAME modalChooseOneRoutable helper, and the flush chooser's targetOk now rejects ambiguous atoms, so
 * the AI can NEVER pick the ambiguous mode — metric ⇄ runtime lockstep.
 *
 * This file pins:
 *   1. coverage — Dawnbringer Cleric & Cleanup Crew are native-trigger; the helper's exact gate;
 *   2. runtime — flush picks a RESOLVABLE mode; the ambiguous graveyard mode is NEVER chosen;
 *   3. CREED — only the chosen mode resolves; the unchosen modes do NOT fire;
 *   4. serialize (Phase-7) — the flushed modal stack survives a JSON round-trip and resolves identically;
 *   5. FN guards — a choose-one with EVERY mode ambiguous stays body-only; choose-TWO with one ambiguous
 *      mode stays parked (the relaxation is single-pick only).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, modalChooseOneRoutable } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const C = (type, oracle, name = "X") => ({ name, type, oracle, mana: "" });
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withGraveyard(state, cards, playerId) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], graveyard: cards } } };
}
/** A pending modal ETB trigger controlled by "user". effectClause = the FULL bulleted block. */
function modalTrigger(clause, over = {}) {
  return {
    event: "etb",
    source: { name: "Source", permanentId: "perm-src" },
    controller: "user",
    descriptor: { event: "etb", scope: "self", whose: "any", effectClause: clause, interveningIf: null },
    context: {},
    targets: [],
    payload: { resolver: "manual", params: { controller: "user", targets: [], context: {} } },
    ...over,
  };
}
const flush = (s) => flushTriggers(s, { chooseTargets: chooseTriggerTargets });

// ─── 1. coverage — the census poster-children flip; the helper's exact gate ────
describe("coverage — a choose-one with ONE ambiguous mode routes when the rest resolve", () => {
  it("Dawnbringer Cleric is native-trigger (gain life / destroy enchantment / exile-from-any-graveyard)", () => {
    expect(classifyCard(C("Creature — Human Cleric",
      "When this creature enters, choose one —\n• Cure Wounds — You gain 2 life.\n• Dispel Magic — Destroy target enchantment.\n• Gentle Repose — Exile target card from a graveyard.",
      "Dawnbringer Cleric"))).toBe("native-trigger");
  });
  it("Cleanup Crew is native-trigger (destroy artifact / destroy enchantment / exile-from-any-graveyard / gain life)", () => {
    expect(classifyCard(C("Creature — Human Citizen",
      "When this creature enters, choose one —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Exile target card from a graveyard.\n• You gain 4 life.",
      "Cleanup Crew"))).toBe("native-trigger");
  });

  it("modalChooseOneRoutable is TRUE for a choose-one with ≥1 resolvable mode, FALSE when EVERY mode is ambiguous", () => {
    const partial = parseEffectClause("choose one —\n• You gain 2 life.\n• Exile target card from a graveyard.", "Instant");
    expect(partial.structure).toBe("modal");
    expect(modalChooseOneRoutable(partial)).toBe(true);
    // every mode ambiguous (both exile-from-ANY-graveyard) → no safe fallback → NOT routable
    const allAmbiguous = parseEffectClause("choose one —\n• Exile target card from a graveyard.\n• Exile target card from a graveyard.", "Instant");
    expect(allAmbiguous.structure).toBe("modal");
    expect(modalChooseOneRoutable(allAmbiguous)).toBe(false);
  });

  it("triggerRoutesNatively mirrors: the partial-resolvable choose-one routes; a whole-mode-ambiguous one does not", () => {
    const routable = detectTriggers(C("Creature — Bear", "When this creature enters, choose one —\n• You gain 2 life.\n• Exile target card from a graveyard."))[0];
    const notRoutable = detectTriggers(C("Creature — Bear", "When this creature enters, choose one —\n• Exile target card from a graveyard.\n• Return target creature card from a graveyard to the battlefield."))[0];
    expect(triggerRoutesNatively(routable)).toBe(true);
    expect(triggerRoutesNatively(notRoutable)).toBe(false);
  });
});

// ─── 2 + 3. runtime — the ambiguous mode is never chosen; only the chosen mode resolves ──
describe("flush — the ambiguous graveyard mode is NEVER chosen; a resolvable mode resolves", () => {
  const CLAUSE = "choose one —\n• You gain 2 life.\n• Exile target card from a graveyard.";

  it("routes via EFFECT_PROGRAM carrying a RESOLVABLE mode (gain life, index 0), not the ambiguous one", () => {
    // A card sits in each graveyard so the ambiguous mode HAS legal targets — the chooser must still avoid it.
    let s = stateWith();
    s = withGraveyard(s, [{ id: "u-gy", name: "UserGY" }], "user");
    s = withGraveyard(s, [{ id: "a-gy", name: "AiGY" }], "ai");
    s = { ...s, pendingTriggers: [modalTrigger(CLAUSE)] };
    const trig = flush(s).stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.chosenMode).toBe(0); // the resolvable gain-life mode, never mode 1 (exile-from-any-gy)
  });

  it("CREED — the chosen gain-life mode resolves; the graveyard exile mode does NOT fire (no card leaves any graveyard)", () => {
    const lifeBefore = stateWith().players.user.life;
    let s = stateWith();
    s = withGraveyard(s, [{ id: "u-gy", name: "UserGY" }], "user");
    s = withGraveyard(s, [{ id: "a-gy", name: "AiGY" }], "ai");
    s = { ...s, pendingTriggers: [modalTrigger(CLAUSE)] };
    const after = resolveTopOfStack(flush(s));
    expect(after.players.user.life).toBe(lifeBefore + 2); // gain-life happened
    expect(after.players.user.graveyard.some((c) => c.id === "u-gy")).toBe(true);  // own gy card untouched
    expect(after.players.ai.graveyard.some((c) => c.id === "a-gy")).toBe(true);    // opponent gy card untouched
  });

  it("with an ENEMY-side resolvable mode (destroy enchantment) the chooser sides it correctly, still never the graveyard mode", () => {
    let s = stateWith();
    const oppEnch = createPermanent({ id: "opp-ench", card: { id: "c-e", name: "OppEnch", type: "Enchantment" }, controller: "ai" });
    const myEnch = createPermanent({ id: "my-ench", card: { id: "c-e2", name: "MyEnch", type: "Enchantment" }, controller: "user" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [oppEnch] }, user: { ...s.players.user, battlefield: [myEnch] } } };
    s = withGraveyard(s, [{ id: "a-gy", name: "AiGY" }], "ai");
    s = { ...s, pendingTriggers: [modalTrigger("choose one —\n• Destroy target enchantment.\n• Exile target card from a graveyard.")] };
    const after = resolveTopOfStack(flush(s));
    expect(after.players.ai.battlefield.some((p) => p.id === "opp-ench")).toBe(false); // opponent's enchantment destroyed
    expect(after.players.user.battlefield.some((p) => p.id === "my-ench")).toBe(true);  // OWN enchantment untouched
    expect(after.players.ai.graveyard.some((c) => c.id === "a-gy")).toBe(true);         // graveyard mode never fired
  });
});

// ─── 4. serialize (Phase-7) — the flushed modal stack round-trips and resolves identically ──
describe("serialize — the flushed choose-one modal stack survives a JSON round-trip", () => {
  it("resolving after JSON serialize/restore gives the SAME result as the live resolve", () => {
    const build = () => {
      let s = stateWith();
      s = withGraveyard(s, [{ id: "a-gy", name: "AiGY" }], "ai");
      s = { ...s, pendingTriggers: [modalTrigger("choose one —\n• You gain 2 life.\n• Exile target card from a graveyard.")] };
      return flush(s);
    };
    const live = resolveTopOfStack(build());
    const restored = resolveTopOfStack(JSON.parse(JSON.stringify(build())));
    expect(restored.players.user.life).toBe(live.players.user.life);
    expect(live.players.user.life).toBe(stateWith().players.user.life + 2);
    expect(restored.players.ai.graveyard.map((c) => c.id)).toEqual(live.players.ai.graveyard.map((c) => c.id));
  });
});

// ─── 5. FN guards — the relaxation is CHOOSE-ONE only, and needs a resolvable fallback ──
describe("CREED false-negative guards", () => {
  it("a choose-one whose EVERY mode is ambiguous stays body-only (no safe mode to fall back to)", () => {
    expect(classifyCard(C("Creature — Bear",
      "When this creature enters, choose one —\n• Exile target card from a graveyard.\n• Return target creature card from a graveyard to the battlefield."))).toBe("body-only");
  });

  it("choose-TWO with one ambiguous mode stays parked — the single-pick relaxation does not apply", () => {
    const two = parseEffectClause("choose two —\n• You gain 2 life.\n• Draw a card.\n• Exile target card from a graveyard.", "Instant");
    expect(two.structure).toBe("modal");
    expect(modalChooseOneRoutable(two)).toBe(false);
    expect(classifyCard(C("Creature — Bear",
      "When this creature enters, choose two —\n• You gain 2 life.\n• Draw a card.\n• Exile target card from a graveyard."))).toBe("body-only");
  });

  it("a fully-resolvable choose-one is unaffected (still native via the every-mode gate)", () => {
    expect(classifyCard(C("Creature — Bear",
      "When this creature enters, choose one —\n• You gain 2 life.\n• Draw a card."))).toBe("native-trigger");
  });
});
