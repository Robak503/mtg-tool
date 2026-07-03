/**
 * WAVE-2b TUTOR — RAMP-FETCH + TUTOR filters.
 *
 * PR1 of the wave2b-tutor slice:
 *   1. FETCH-TO-TOP — "search … then shuffle and put that card on top" (Vampiric / Mystical / Worldly
 *      Tutor): destination "top" — resolveTutorChoice SHUFFLES FIRST (CR 701.19e), THEN places the chosen
 *      card on top so it survives the shuffle.
 *   2. UP-TO-N — "up to (two|three|four|five)" land multi-fetch (Nissa's Renewal = 3).
 *   3. MV / richer FILTER — "with mana value N or less" (Spellseeker MV<=2) / "with mana value N" (Trophy
 *      Mage MV=3) + curated creature subtypes (Goblin Matron / Elvish Harbinger). The MV/type gate filters
 *      candidates UPSTREAM (applyTutor + autoPickTutorCandidate), not only in the picker.
 *
 * CREED: every NEW shape must parse HIGH to fire, and every unmodeled neighbor (or-greater MV, "any
 * number" multi, non-land to-battlefield) must stay LOW → Arbiter, never a mis-resolved native.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { setPendingTutorChoice } from "./pendingChoice.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { applyTutor, cardMatchesTutorFilter } from "./effects/atoms/library.js";

beforeEach(() => _resetIdsForTests());

const lib = (id, name, type, mana = "") => ({ id, name, type, mana });

describe("WAVE-2b parser — new tutor shapes flip HIGH with correct atoms", () => {
  const high = (oracle, type) => {
    const p = parseEffectClause(oracle, type);
    return { conf: programConfidence(p), atoms: p?.atoms || [] };
  };

  it("FETCH-TO-TOP: Vampiric Tutor → tutor(top) + lose-life (both clauses kept)", () => {
    const { conf, atoms } = high("Search your library for a card, then shuffle and put that card on top. You lose 2 life.", "Instant");
    expect(conf).toBe("high");
    expect(atoms[0]).toMatchObject({ op: "tutor", filter: null, destination: "top" });
    expect(atoms[1]).toMatchObject({ op: "lose-life", amount: 2, who: "controller" });
  });

  it("FETCH-TO-TOP: Mystical Tutor → filtered tutor(top)", () => {
    const { conf, atoms } = high("Search your library for an instant or sorcery card, reveal it, then shuffle and put that card on top.", "Instant");
    expect(conf).toBe("high");
    expect(atoms[0]).toMatchObject({ op: "tutor", destination: "top" });
    expect(atoms[0].filter.groups).toEqual([["instant"], ["sorcery"]]);
  });

  it("FETCH-TO-TOP: Worldly Tutor — 'put THE card on top' phrasing also matches", () => {
    const { conf, atoms } = high("Search your library for a creature card, reveal it, then shuffle and put the card on top.", "Instant");
    expect(conf).toBe("high");
    expect(atoms[0]).toMatchObject({ op: "tutor", destination: "top" });
  });

  it("MV FILTER: Spellseeker → mv.max=2 on an instant-or-sorcery filter", () => {
    const { conf, atoms } = high("search your library for an instant or sorcery card with mana value 2 or less, reveal it, put it into your hand, then shuffle", "Creature");
    expect(conf).toBe("high");
    expect(atoms[0]).toMatchObject({ op: "tutor", destination: "hand" });
    expect(atoms[0].filter.mv).toEqual({ max: 2 });
    expect(atoms[0].filter.groups).toEqual([["instant"], ["sorcery"]]);
  });

  it("MV FILTER: Trophy Mage → mv.exact=3 on an artifact filter", () => {
    const { conf, atoms } = high("search your library for an artifact card with mana value 3, reveal it, put it into your hand, then shuffle", "Creature");
    expect(conf).toBe("high");
    expect(atoms[0].filter.mv).toEqual({ exact: 3 });
    expect(atoms[0].filter.groups).toEqual([["artifact"]]);
  });

  it("SUBTYPE FILTER: Goblin Matron (to hand) + Elvish Harbinger (to top)", () => {
    const matron = high("search your library for a goblin card, reveal that card, put it into your hand, then shuffle", "Creature");
    expect(matron.conf).toBe("high");
    expect(matron.atoms[0]).toMatchObject({ op: "tutor", destination: "hand" });
    expect(matron.atoms[0].filter.groups).toEqual([["goblin"]]);
    const harbinger = high("search your library for an elf card, reveal it, then shuffle and put that card on top", "Creature");
    expect(harbinger.conf).toBe("high");
    expect(harbinger.atoms[0]).toMatchObject({ op: "tutor", destination: "top" });
  });

  it("UP-TO-N: Nissa's Renewal → up-to-three land fetch (remaining:3) + gain-life", () => {
    const { conf, atoms } = high("Search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle. You gain 7 life.", "Sorcery");
    expect(conf).toBe("high");
    expect(atoms[0]).toMatchObject({ op: "tutor", destination: "battlefield", entersTapped: true, remaining: 3 });
    expect(atoms[1]).toMatchObject({ op: "gain-life", amount: 7 });
  });
});

describe("WAVE-2b parser — CREED false-positive guards (must stay LOW → Arbiter)", () => {
  const low = (oracle, type) => programConfidence(parseEffectClause(oracle, type)) === "low";

  it("an unmodeled MV comparator ('mana value 3 or greater') drops to low", () => {
    expect(low("search your library for an artifact card with mana value 3 or greater, reveal it, put it into your hand, then shuffle", "Creature")).toBe(true);
  });
  it("a multi-card 'any number … on top' (Goblin Recruiter) drops to low", () => {
    expect(low("search your library for any number of goblin cards, reveal them, then shuffle and put those cards on top in any order", "Creature")).toBe(true);
  });
  it("a PLAIN 'creature' up-to-N to the battlefield is now HIGH (Defense of the Heart); a SUBTYPED / typed one stays low", () => {
    // Defense of the Heart opened the multi-fetch to a single unqualified "creature" filter (faithful — each
    // fetched creature enters via enterCardFromZone, firing ETB). The land-guard still rejects a SUBTYPED
    // ("Dragon") or non-creature-typed ("artifact") multi-fetch (no wrong-cheat FP — CREED).
    expect(low("search your library for up to three creature cards, put them onto the battlefield tapped, then shuffle", "Sorcery")).toBe(false);
    expect(low("search your library for up to three Dragon cards, put them onto the battlefield tapped, then shuffle", "Sorcery")).toBe(true);
    expect(low("search your library for up to two artifact cards, put them onto the battlefield, then shuffle", "Sorcery")).toBe(true);
  });
  it("an out-of-range 'up to six' multi-fetch drops to low", () => {
    expect(low("search your library for up to six basic land cards, put them onto the battlefield tapped, then shuffle", "Sorcery")).toBe(true);
  });
  it("an unmodeled destination ('on the bottom') drops to low", () => {
    expect(low("search your library for a card, then shuffle and put that card on the bottom", "Sorcery")).toBe(true);
  });
});

describe("WAVE-2b cardMatchesTutorFilter — MV gate applies upstream", () => {
  it("mv.max excludes a too-expensive card; mv.exact requires the precise value", () => {
    const cheap = lib("c", "Brainstorm", "Instant", "{U}");           // mv 1
    const mid = lib("d", "Cancel", "Instant", "{1}{U}{U}");           // mv 3
    expect(cardMatchesTutorFilter(cheap, { groups: [["instant"]], mv: { max: 2 } })).toBe(true);
    expect(cardMatchesTutorFilter(mid, { groups: [["instant"]], mv: { max: 2 } })).toBe(false);
    expect(cardMatchesTutorFilter(mid, { groups: [["instant"]], mv: { exact: 3 } })).toBe(true);
    expect(cardMatchesTutorFilter(cheap, { groups: [["instant"]], mv: { exact: 3 } })).toBe(false);
  });

  it("applyTutor builds an MV-filtered candidate set (Spellseeker MV<=2 omits the MV-3 card)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const library = [
      lib("a", "Brainstorm", "Instant", "{U}"),          // mv 1 — eligible
      lib("b", "Lightning Bolt", "Instant", "{R}"),       // mv 1 — eligible
      lib("c", "Cancel", "Instant", "{1}{U}{U}"),         // mv 3 — TOO EXPENSIVE
      lib("d", "Sol Ring", "Artifact", "{1}"),            // wrong type
    ];
    const state = { ...base, players: { ...base.players, user: { ...base.players.user, library } } };
    const atom = { op: "tutor", filter: { groups: [["instant"]], mv: { max: 2 } }, filterLabel: "instant card with mana value 2 or less", destination: "hand" };
    const out = applyTutor(state, atom, { controller: "user", cardName: "Spellseeker" });
    const names = out.pendingChoice.candidates.map((c) => c.name).sort();
    expect(names).toEqual(["Brainstorm", "Lightning Bolt"]); // Cancel (MV 3) and Sol Ring (artifact) excluded UPSTREAM
  });

  it("autoPickTutorCandidate never returns an off-MV card even if candidates leak one", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const library = [lib("a", "Brainstorm", "Instant", "{U}"), lib("c", "Cancel", "Instant", "{1}{U}{U}")];
    const state = { ...base, players: { ...base.players, user: { ...base.players.user, library } } };
    // A deliberately UNFILTERED candidate list (both cards) + the structured MV filter on the choice —
    // the defensive re-filter in autoPickTutorCandidate must drop the MV-3 Cancel and pick Brainstorm.
    const pc = { kind: "tutor-search", controller: "user", sourceZone: "library",
      candidates: library.map((c) => ({ id: c.id, name: c.name })), filter: { groups: [["instant"]], mv: { max: 2 } } };
    expect(autoPickTutorCandidate(state, pc)).toBe("a");
  });
});

describe("WAVE-2b resolveTutorChoice — FETCH-TO-TOP shuffles FIRST, then places on top", () => {
  it("the chosen card ends up on TOP of the library after the shuffle (survives it)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    // A multi-card library + a fixed rngSeed so the shuffle DOES reorder (proving order != insertion order),
    // and the fetched card lands at index 0 regardless.
    const library = [
      lib("a", "Sol Ring", "Artifact", "{1}"),
      lib("b", "Mana Crypt", "Artifact", "{0}"),
      lib("c", "Mox Diamond", "Artifact", "{0}"),
      lib("d", "Chrome Mox", "Artifact", "{0}"),
      lib("e", "Lotus Petal", "Artifact", "{0}"),
    ];
    const state = { ...base, rngSeed: 12345, players: { ...base.players, user: { ...base.players.user, library } } };
    const paused = setPendingTutorChoice(state, {
      controller: "user", candidates: library.map((c) => ({ id: c.id, name: c.name })),
      sourceName: "Mystical Tutor", filterLabel: "card", destination: "top",
    });
    expect(paused.pendingChoice.destination).toBe("top");
    const out = resolveTutorChoice(paused, "c"); // fetch Mox Diamond
    const newLib = out.players.user.library;
    expect(newLib).toHaveLength(5);               // nothing lost — it's a reorder + place
    expect(newLib[0].id).toBe("c");               // Mox Diamond is ON TOP (CR 701.19e)
    // It must NOT appear twice (it was moved, not copied).
    expect(newLib.filter((x) => x.id === "c")).toHaveLength(1);
  });

  it("the FETCH-TO-TOP shuffle actually reorders (the placed card sits atop a shuffled deck, not the printed order)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const library = Array.from({ length: 8 }, (_, i) => lib("x" + i, "Card" + i, "Artifact"));
    const state = { ...base, rngSeed: 777, players: { ...base.players, user: { ...base.players.user, library } } };
    const paused = setPendingTutorChoice(state, {
      controller: "user", candidates: library.map((c) => ({ id: c.id, name: c.name })),
      sourceName: "Vampiric Tutor", filterLabel: "card", destination: "top",
    });
    const out = resolveTutorChoice(paused, "x5");
    const newLib = out.players.user.library;
    expect(newLib[0].id).toBe("x5"); // fetched card on top
    // The remaining 7 are not in their original relative order (the shuffle ran) — at least one moved.
    const rest = newLib.slice(1).map((c) => c.id);
    const originalRest = library.filter((c) => c.id !== "x5").map((c) => c.id);
    expect(rest).not.toEqual(originalRest);
  });
});

describe("WAVE-2b resolveTutorChoice — UP-TO-N (3) chains three single picks", () => {
  it("a remaining:3 land fetch re-suspends twice before the final shuffle", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const library = [
      lib("l1", "Forest", "Basic Land — Forest"),
      lib("l2", "Island", "Basic Land — Island"),
      lib("l3", "Swamp", "Basic Land — Swamp"),
      lib("l4", "Plains", "Basic Land — Plains"),
    ];
    const state = { ...base, players: { ...base.players, user: { ...base.players.user, library } } };
    const paused = setPendingTutorChoice(state, {
      controller: "user", candidates: library.map((c) => ({ id: c.id, name: c.name })),
      sourceName: "Nissa's Renewal", filterLabel: "basic land card", destination: "battlefield",
      entersTapped: true, remaining: 3,
    });
    // Pick 1 → re-suspends with remaining 2 (one land now on the battlefield).
    const p1 = resolveTutorChoice({ ...paused, pendingChoice: { ...paused.pendingChoice, resume: { program: { atoms: [] }, controller: "user", targets: [], nextAtomIndex: 1 } } }, "l1");
    expect(p1.pendingChoice).toBeTruthy();
    expect(p1.pendingChoice.remaining).toBe(2);
    expect(p1.pendingChoice.candidates.map((c) => c.id)).not.toContain("l1");
    // Pick 2 → re-suspends with remaining 1.
    const p2 = resolveTutorChoice(p1, "l2");
    expect(p2.pendingChoice.remaining).toBe(1);
    // Three lands moved to the battlefield (tapped) over the chain.
    expect(p2.players.user.battlefield.length).toBe(2);
  });
});
