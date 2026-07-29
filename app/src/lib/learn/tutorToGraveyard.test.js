/**
 * tutorToGraveyard.test.js — "search your library for a card, put that card into your graveyard" (CR 701.19a).
 *
 * The reanimator setup family: Entomb (rank 328), Buried Alive (371), Goblin Engineer (1172), Unmarked Grave
 * (1599), Vile Entomber (1887), Corpse Connoisseur, Oriq Loremage, Scion of the Ur-Dragon — 17 corpus cards,
 * not one of them modelled before, for a single reason: the tutor had hand / battlefield / top destinations
 * and no graveyard. The search itself was already right.
 *
 * So this is a DESTINATION, not a new mechanic. The parser arms mirror the fetch-to-hand ones exactly and the
 * settler runs the SAME moveCardToZone with a different toZone — the CR 701.19e shuffle, the multi-pick chain,
 * the find-nothing path and the auto-pick filter are all the existing ones.
 *
 * ⚠️ THE AUTO-PICK COINCIDENCE, asserted rather than assumed: the deterministic picker takes the HIGHEST mana
 * value, which is correct for a fetch-to-hand and happens to also be correct here — a reanimator wants the
 * fattest body in the yard. It coincides; it was not designed for this, so it is pinned.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (clause) => parseEffectClause(clause, "Instant", { hasX: false })?.atoms?.[0] || null;

describe("parsing — the graveyard destination", () => {
  it("⭐ Entomb's unfiltered fetch", () => {
    expect(atomOf("search your library for a card, put that card into your graveyard, then shuffle"))
      .toMatchObject({ op: "tutor", destination: "graveyard", filter: null });
  });

  it("⭐ Buried Alive's up-to-three creature fetch", () => {
    expect(atomOf("search your library for up to three creature cards, put them into your graveyard, then shuffle"))
      .toMatchObject({ op: "tutor", destination: "graveyard", remaining: 3 });
  });

  it("CONTROL — the fetch-to-HAND form is untouched and still lands in hand", () => {
    expect(atomOf("search your library for a creature card, put it into your hand, then shuffle"))
      .toMatchObject({ op: "tutor", destination: "hand" });
  });

  it("⛔ an unmodelled FILTER still parks (CREED) — the destination doesn't loosen the search", () => {
    // Unmarked Grave's "a nonlegendary card" is not in parseTutorFilter's vocabulary, so it stays on the
    // Arbiter even though its destination is now understood. A safe FN.
    expect(atomOf("search your library for a nonlegendary card, put that card into your graveyard, then shuffle")).toBeNull();
  });
});

describe("⭐ RUNTIME — the card actually reaches the graveyard", () => {
  const card = (id, name, cmc) => ({ id, name, type: "Creature — Zombie", mana: "{" + cmc + "}", cmc, power: cmc, toughness: cmc, oracle: "" });
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user,
      library: [card("c1", "Small", 1), card("c2", "Huge", 8), card("c3", "Mid", 4)], graveyard: [], hand: [],
    } } };
  }
  const run = (state, clause) => resolveAtom(state, atomOf(clause), { controller: "user", cardName: "Entomb", targets: [] });
  const ENTOMB = "search your library for a card, put that card into your graveyard, then shuffle";

  it("⭐ the fetch suspends on a choice, and settling it moves the card library → graveyard", () => {
    const paused = run(board(), ENTOMB);
    expect(paused.pendingChoice?.kind).toBe("tutor-search");
    expect(paused.pendingChoice.destination).toBe("graveyard");
    const pick = autoPickTutorCandidate(paused, paused.pendingChoice);
    const done = resolveTutorChoice(paused, pick);
    expect(done.players.user.graveyard.map((c) => c.name)).toContain("Huge");
    expect(done.players.user.library.some((c) => c.id === pick)).toBe(false);
    expect(done.players.user.hand).toHaveLength(0); // ⛔ NOT the hand
  });

  it("⭐ the auto-pick takes the FATTEST card — right for a reanimator, and only by coincidence", () => {
    const paused = run(board(), ENTOMB);
    expect(autoPickTutorCandidate(paused, paused.pendingChoice)).toBe("c2"); // the 8-drop
  });

  it("CONTROL — the same search to HAND still lands in hand, not the graveyard", () => {
    // Without this, a destination applied unconditionally would pass every assertion above.
    const paused = run(board(), "search your library for a card, put that card into your hand, then shuffle");
    const done = resolveTutorChoice(paused, autoPickTutorCandidate(paused, paused.pendingChoice));
    expect(done.players.user.hand).toHaveLength(1);
    expect(done.players.user.graveyard).toHaveLength(0);
  });

  it("⭐ Buried Alive's multi-fetch chains and lands THREE cards in the graveyard", () => {
    let s = run(board(), "search your library for up to three creature cards, put them into your graveyard, then shuffle");
    let guard = 0;
    while (s.pendingChoice?.kind === "tutor-search" && guard++ < 8) {
      s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    }
    expect(s.players.user.graveyard).toHaveLength(3);
    expect(s.players.user.library).toHaveLength(0);
  });

  it("⛔ finding NOTHING leaves the graveyard empty — never a fabricated card", () => {
    const empty = { ...board(), players: { ...board().players, user: { ...board().players.user, library: [] } } };
    const out = run(empty, ENTOMB);
    const settled = out.pendingChoice ? resolveTutorChoice(out, null) : out;
    expect(settled.players.user.graveyard).toHaveLength(0);
  });
});

describe("tier", () => {
  it("⭐ the family flips", () => {
    expect(classifyCard({ name: "Entomb", type: "Instant", mana: "{B}",
      oracle: "Search your library for a card, put that card into your graveyard, then shuffle." })).toBe("native-spell");
    expect(classifyCard({ name: "Buried Alive", type: "Sorcery", mana: "{2}{B}",
      oracle: "Search your library for up to three creature cards, put them into your graveyard, then shuffle." })).toBe("native-spell");
    expect(classifyCard({ name: "Vile Entomber", type: "Creature — Zombie Warlock", mana: "{2}{B}{B}", power: "3", toughness: "1",
      oracle: "Deathtouch\nWhen this creature enters, search your library for a card, put that card into your graveyard, then shuffle." })).toBe("native-trigger");
  });

  it("⛔ Unmarked Grave stays PARKED — its 'nonlegendary' filter is still unmodelled", () => {
    // The destination landing does not widen the search vocabulary, and this is the pin that proves it.
    expect(classifyCard({ name: "Unmarked Grave", type: "Sorcery", mana: "{1}{B}",
      oracle: "Search your library for a nonlegendary card, put that card into your graveyard, then shuffle." })).toBe("arbiter-spell");
  });
});
