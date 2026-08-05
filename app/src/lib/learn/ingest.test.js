/**
 * ingest.test.js — INGEST (CR 702.114a), the Battle for Zendikar processor shell: Benthic Infiltrator,
 * Ruination Guide, Dominator Drone, Culling Drone, Sludge Crawler, Mist Intruder, Salvage Drone, Raven
 * Guild Master.
 *
 * "Ingest (Whenever this creature deals combat damage to a player, that player exiles the top card of
 * their library.)"
 *
 * ⛔ IT IS **NOT** AN ALIAS FOR MILL, and that is the whole reason it needed its own atom rather than a
 * one-line reuse. A milled card lands in the GRAVEYARD, where recursion, delve, threshold, escape and every
 * graveyard count can still reach it; an ingested card is gone. Routing ingest through `mill` would be
 * strictly more generous to the ingested player than the printed card — the forbidden direction. The
 * graveyard is asserted EMPTY in the drive below precisely so that shortcut can never creep back in.
 *
 * In every OTHER respect it deliberately IS the mill lane: the same `who:"damagedPlayer"` non-targeted
 * referent (threaded by checkCombatDamageTriggers), the same absent/eliminated-referent guard (→ exile
 * nobody, a clean no-op), and the same top-N-bounded-by-library-size read. Only the destination differs.
 *
 * ⭐ THREE PIECES, AND THE CARD STAYED PARKED UNTIL ALL THREE LANDED — worth recording, because each one
 * looked like the finish line:
 *   ① the ATOM + matcher — the clause parsed, and the cards still parked;
 *   ② the KEYWORD→TRIGGER synthesis in detectTriggers plus the shaped-count bump in
 *      allTriggerSentencesModeled — the descriptor then detected AND routed natively, and the cards STILL
 *      parked (the standing `shaped === detected` tell: native in detection, parked in classification);
 *   ③ crediting the bare "Ingest" line as keyword-only — its own printed line was surviving the
 *      trigger-sentence strip as residue.
 * A keyword whose rules text lives only in reminder text needs all three; two of them buy nothing.
 *
 * ⛔ NO MILLED-TRIGGER BIND, and that is correct rather than an omission: checkMilledTriggers fires on cards
 * entering a GRAVEYARD (CR 701.13a). Nothing entered one, so binding it would fire mill payoffs off an
 * exile — a fabricated trigger.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * keyword-only credit removed -> every flip pin red while detection still reports one native descriptor;
 * the shaped-count bump removed -> same, one layer earlier.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BENTHIC_INFILTRATOR = { id: "c-bi", name: "Benthic Infiltrator", type: "Creature — Eldrazi Drone", mana: "{2}{U}",
  power: 1, toughness: 4, oracle: "Devoid (This card has no color.)\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)\nThis creature can't be blocked." };
const CULLING_DRONE = { id: "c-cd", name: "Culling Drone", type: "Creature — Eldrazi Drone", mana: "{1}{B}",
  power: 2, toughness: 3, oracle: "Devoid (This card has no color.)\nIngest (Whenever this creature deals combat damage to a player, that player exiles the top card of their library.)" };

const card = (i) => ({ id: `c${i}`, name: `Card ${i}`, type: "Instant", oracle: "", mana: "{1}" });

/** Resolve the ingest effect against an opponent library of `libN`, with `damagedId` as the referent. */
function ingest(libN, damagedId) {
  const prog = parseEffectClause("that player exiles the top card of their library", "Creature");
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...b, players: { ...b.players,
    ai: { ...b.players.ai, library: Array.from({ length: libN }, (_, i) => card(i)), graveyard: [], exile: [] } } };
  const r = runEffectProgram(s, { id: "so", source: { name: "Benthic Infiltrator" },
    payload: { params: { program: prog, controller: "user", targets: [], sourceId: "bi", context: { damagedPlayerId: damagedId } } } });
  const p = (r?.state || r).players.ai;
  return { lib: (p.library || []).length, exile: (p.exile || []).length, graveyard: (p.graveyard || []).length };
}

describe("the keyword synthesizes its trigger, and the effect is its OWN atom", () => {
  it("the clause parses to exile-top-of-library, NOT to mill", () => {
    expect(parseEffectClause("that player exiles the top card of their library", "Creature").atoms)
      .toEqual([{ op: "exile-top-of-library", amount: 1, who: "damagedPlayer", targetType: null }]);
  });

  it("the printed keyword synthesizes one natively-routing descriptor", () => {
    const [t, ...rest] = detectTriggers(CULLING_DRONE);
    expect(rest).toHaveLength(0);
    expect(t).toMatchObject({ event: "combatDamageToPlayer", scope: "self", sourceText: "Ingest" });
    expect(triggerRoutesNatively(t, CULLING_DRONE)).toBe(true);
  });

  it("the carriers flip", () => {
    expect(classifyCard(BENTHIC_INFILTRATOR)).toBe("native-body");
    expect(classifyCard(CULLING_DRONE)).toBe("native-body");
  });
});

describe("⭐ LAW 6 — the card is EXILED, and the graveyard stays empty", () => {
  it("⭐ the top card goes to EXILE, never the graveyard", () => {
    // The assertion that keeps ingest from ever being reduced to mill: a milled card would show up in the
    // graveyard, where recursion could still reach it.
    expect(ingest(3, "ai")).toEqual({ lib: 2, exile: 1, graveyard: 0 });
  });

  it("⛔ no damaged player ⇒ a clean no-op, never a fabricated exile", () => {
    expect(ingest(3, null)).toEqual({ lib: 3, exile: 0, graveyard: 0 });
  });

  it("⛔ an empty library is bounded, not over-read", () => {
    expect(ingest(0, "ai")).toEqual({ lib: 0, exile: 0, graveyard: 0 });
  });
});
