/**
 * MODAL MULTI-SENTENCE MODE (CR 700.2 / 601.2b) — a "Choose one [or both] —" mode whose effect SPANS
 * SENTENCES now resolves natively, closing a gap where the modal parser shattered a multi-sentence mode
 * into unparsable fragments while the SAME text parsed HIGH as a standalone clause.
 *
 * Before this fix `parseModal` parsed each mode with a bare `splitClauses` + `parseClauseToAtom` loop,
 * which has NO access to the up-front multi-sentence matchers in `parseEffectClauseImpl` — impulse-dig
 * ("Look at the top N … Put one … the rest …"), the exile-if-dies removal rider ("… deals N damage to
 * target creature. If that creature would die this turn, exile it instead."), δ-1 hand disruption
 * ("… reveals their hand. You choose a card from it. That player discards that card."), counter-unless,
 * and the destroy + reflexive-search rider. So Maestros Charm, Supreme Will, Suplex, Agate Assault,
 * Confounding Riddle, Splitting Headache, Avengers Disassembled all parked at the Arbiter even though every
 * mode was individually modeled. The fix parses each mode through the FULL `parseEffectClauseImpl`
 * machinery (rejecting a nested-modal mode), so a multi-sentence mode resolves exactly as the same text
 * does outside a modal.
 *
 * CREED — whole-card or PARK: a mode that doesn't parse HIGH (or is itself a nested modal) still drops the
 * WHOLE card to low → Arbiter (all-or-nothing). The chosen mode GENUINELY resolves at runtime; the unchosen
 * mode does NOT. Pins:
 *   1. coverage — the 8 flipped staples are native-spell;
 *   2. the parse — each card is HIGH/modal with the right per-mode atoms;
 *   3. the executor (CREED core) — a chosen multi-sentence mode RESOLVES (impulse-dig fills the hand;
 *      exile-if-dies deals damage AND exiles; discard-chosen discards) and the UNCHOSEN mode does not;
 *   4. anti-FP — a modal whose multi-sentence mode is UNMODELED stays low → Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { autoPickTutorCandidate, resolveImpulseDigChoice, autoPickHandDiscardCandidate, resolveHandDiscardChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const prog = (oracle, type = "Instant", mana = "") => parseEffectProgram({ name: "x", type, oracle, mana });

const permAI = (id, card) => ({ id, card, controller: "ai", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
function castState(card, { aiBattlefield = [], userLibrary = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  // A pool of every color (+ generic) so any modal staple's cost is payable regardless of pips.
  const pool = { ...s.players.user.manaPool, C: 8, W: 4, U: 4, B: 4, R: 4, G: 4 };
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [card], manaPool: pool, library: userLibrary, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBattlefield, hand: aiHand, life: 40 },
    },
  };
}
const castsOf = (st, id) => filterActions(legalActionsForPlayer(st, "user"), "cast-spell").filter((c) => c.cardId === id);

// ─── 1. coverage — the flipped staples are native-spell ───────────────────────
describe("coverage — multi-sentence-mode modal staples flip native-spell", () => {
  const C = (oracle, name, type = "Instant", mana = "") => ({ type, oracle, mana, name });
  it("Maestros Charm (impulse-dig mode) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Look at the top five cards of your library. Put one of those cards into your hand and the rest into your graveyard.\n• Each opponent loses 3 life and you gain 3 life.\n• Maestros Charm deals 5 damage to target creature or planeswalker.",
      "Maestros Charm",
    ))).toBe("native-spell");
  });
  it("Supreme Will (counter-unless + impulse-dig modes) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Counter target spell unless its controller pays {3}.\n• Look at the top four cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order.",
      "Supreme Will",
    ))).toBe("native-spell");
  });
  it("Suplex (exile-if-dies removal rider mode) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Suplex deals 3 damage to target creature. If that creature would die this turn, exile it instead.\n• Exile target artifact.",
      "Suplex", "Instant", "{1}{R}",
    ))).toBe("native-spell");
  });
  it("Agate Assault (exile-if-dies removal rider mode) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Agate Assault deals 4 damage to target creature. If that creature would die this turn, exile it instead.\n• Exile target artifact.",
      "Agate Assault", "Sorcery",
    ))).toBe("native-spell");
  });
  it("Confounding Riddle (impulse-dig + counter-unless modes) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Look at the top four cards of your library. Put one of them into your hand and the rest into your graveyard.\n• Counter target spell unless its controller pays {4}.",
      "Confounding Riddle",
    ))).toBe("native-spell");
  });
  it("Splitting Headache (δ-1 hand-disruption mode) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one —\n• Target player discards two cards.\n• Target player reveals their hand. You choose a card from it. That player discards that card.",
      "Splitting Headache", "Sorcery",
    ))).toBe("native-spell");
  });
  it("Avengers Disassembled (destroy + reflexive-search rider mode, one or both) → native-spell", () => {
    expect(classifyCard(C(
      "Choose one or both —\n• Avengers Disassembled deals 3 damage to each creature.\n• Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.",
      "Avengers Disassembled", "Sorcery",
    ))).toBe("native-spell");
  });
});

// ─── 2. the parse — HIGH/modal with the right per-mode atoms ───────────────────
describe("parser — each mode carries its collapsed multi-sentence atom(s)", () => {
  it("impulse-dig mode is a single impulse-dig atom (not a shattered fragment)", () => {
    const p = prog("Choose one —\n• Look at the top five cards of your library. Put one of those cards into your hand and the rest into your graveyard.\n• Draw a card.");
    expect(programConfidence(p)).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal.modes[0].atoms.map((a) => a.op)).toEqual(["impulse-dig"]);
  });
  it("exile-if-dies mode folds the rider onto ONE deal-damage atom", () => {
    const p = prog("Choose one —\n• X deals 3 damage to target creature. If that creature would die this turn, exile it instead.\n• Exile target artifact.");
    expect(programConfidence(p)).toBe("high");
    expect(p.modal.modes[0].atoms).toHaveLength(1);
    expect(p.modal.modes[0].atoms[0].op).toBe("deal-damage");
  });
  it("δ-1 hand-disruption mode is a single discard-chosen atom", () => {
    const p = prog("Choose one —\n• Target player discards two cards.\n• Target player reveals their hand. You choose a card from it. That player discards that card.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.modal.modes[1].atoms.map((a) => a.op)).toEqual(["discard-chosen"]);
  });
});

// ─── 3. the executor (CREED core) — a chosen multi-sentence mode RESOLVES ──────
describe("executor — the chosen multi-sentence mode resolves; the unchosen does not", () => {
  it("choosing the impulse-dig mode fills the hand from the library (and the other mode does NOT fire)", () => {
    // Two modes: [0] impulse-dig (look top 3, keep 1, rest to GY), [1] gain 5 life. Pick mode 0.
    const card = { id: "dig", name: "DigCharm", type: "Instant", mana: "{1}{U}", oracle: "Choose one —\n• Look at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.\n• You gain 5 life." };
    let st = castState(card, { userLibrary: [{ id: "a", name: "A", cmc: 1 }, { id: "b", name: "B", cmc: 3 }, { id: "c", name: "C", cmc: 2 }] });
    const pick = castsOf(st, "dig").find((c) => c.chosenMode === 0 || (Array.isArray(c.chosenMode) && c.chosenMode[0] === 0));
    expect(pick).toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    // impulse-dig pauses for a keep choice — auto-keep the best card (AI path), then drain.
    while (st.pendingChoice?.kind === "impulse-dig") st = resolveImpulseDigChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    while (st.stack.length) st = resolveTopOfStack(st);
    expect(st.players.user.hand).toHaveLength(1);            // one card kept to hand
    expect(st.players.user.graveyard).toHaveLength(2);        // the rest went to GY
    expect(st.players.user.life).toBe(40);                    // the GAIN-LIFE mode did NOT fire
  });

  it("choosing the exile-if-dies removal mode deals damage AND exiles the dying creature", () => {
    const card = { id: "spx", name: "Suplex", type: "Instant", mana: "{1}{R}", oracle: "Choose one —\n• Suplex deals 3 damage to target creature. If that creature would die this turn, exile it instead.\n• Exile target artifact." };
    let st = castState(card, { aiBattlefield: [permAI("bear", { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2 })] });
    const pick = castsOf(st, "spx").find((c) => (c.chosenMode === 0 || (Array.isArray(c.chosenMode) && c.chosenMode[0] === 0)) && c.targets.some((t) => t.id === "bear"));
    expect(pick).toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    while (st.stack.length) st = resolveTopOfStack(st);
    expect(st.players.ai.battlefield).toHaveLength(0);                    // creature destroyed by 3 dmg
    expect(st.players.ai.graveyard).toHaveLength(0);                       // but exiled, NOT in the GY
    expect((st.players.ai.exile || []).map((c) => c.name)).toEqual(["Grizzly Bears"]); // exile-if-dies rider applied
  });

  it("choosing the δ-1 hand-disruption mode makes the targeted player discard", () => {
    const card = { id: "sh", name: "Splitting Headache", type: "Sorcery", mana: "{2}{B}", oracle: "Choose one —\n• Target player discards two cards.\n• Target player reveals their hand. You choose a card from it. That player discards that card." };
    let st = castState(card, { aiHand: [{ id: "h1", name: "Swamp", type: "Land" }, { id: "h2", name: "Doom Blade", type: "Instant" }] });
    const pick = castsOf(st, "sh").find((c) => (c.chosenMode === 1 || (Array.isArray(c.chosenMode) && c.chosenMode[0] === 1)) && c.targets.some((t) => t.id === "ai"));
    expect(pick, "a discard-chosen mode targeting the AI was offered").toBeTruthy();
    st = resolveTopOfStack(dispatchAction(st, pick));
    // discard-chosen sets a pendingChoice for the CASTER to pick a card from the victim's hand —
    // settle it via the SAME auto-pick the engine uses (AI strips the best card), then drain.
    let guard = 0;
    while ((st.pendingChoice || st.stack.length) && guard < 10) {
      if (st.pendingChoice?.kind === "hand-discard") {
        st = resolveHandDiscardChoice(st, autoPickHandDiscardCandidate(st, st.pendingChoice));
      } else if (st.stack.length) {
        st = resolveTopOfStack(st);
      } else break;
      guard += 1;
    }
    // The AI's hand shrank by exactly one (a card was discarded by the chosen mode).
    expect(st.players.ai.hand.length).toBe(1);
  });
});

// ─── 4. anti-FP — an UNMODELED multi-sentence mode keeps the whole card LOW ────
describe("CREED anti-FP — a modal with an unmodeled multi-sentence mode stays low → Arbiter", () => {
  const low = (oracle, type = "Instant") => expect(programConfidence(prog(oracle, type))).toBe("low");
  it("an unmodeled multi-sentence mode (vote/secret) drops the whole modal to low", () => {
    // Mode 1's "Starting with you, each player votes …" is not modeled — all-or-nothing → low.
    low("Choose one —\n• Draw a card.\n• Starting with you, each player votes for an artifact or a creature. Destroy each permanent with the most votes or tied for most votes.");
  });
  it("an unmodeled impulse-dig variant (multi-pick) inside a mode drops the whole modal to low", () => {
    // "Put TWO of them into your hand" is outside the modeled single-keep impulse-dig allowlist → low.
    low("Choose one —\n• Look at the top four cards of your library. Put two of them into your hand and the rest into your graveyard.\n• You gain 3 life.");
  });
  it("a nested modal mode is rejected (the per-mode executor doesn't model nested modes) → low", () => {
    low("Choose one —\n• Choose one — • Draw a card. • You gain 2 life.\n• Each opponent loses 2 life.");
  });
});
