/**
 * pluralNamedTutor.test.js — "search your library for UP TO THREE cards named ~, reveal them, put them into
 * your hand, then shuffle": Squadron Hawk, Nesting Wurm, Skyshroud Sentinel, Howling Wolf.
 *
 * ⭐ A CARDINALITY ON A PROVEN PATH, not a new fetch mode. The singular named tutor already existed, and the
 * multi-fetch wire already existed too — `remaining` is the field resolveTutorChoice chains on, the same one
 * the RAMP-MULTI lands tutor uses. The plural self-named shape simply had no matcher, so four cards parked
 * on a clause whose every component was already built.
 *
 * ⛔ THE COUNT MUST BE A PRINTED LITERAL, and "ANY NUMBER OF cards named ~" is refused for that reason
 * (Legion Conquistador, Gathering Throng, Battalion Foot Soldier — 3 more cards, deliberately left parked).
 * `remaining` is a hard cap, so admitting that wording means INVENTING a bound. Four is the obvious guess
 * and it is a fabricated number: it silently under-fetches exactly the decks the wording exists for
 * (Relentless Rats / Persistent Petitioners print "a deck can have any number of cards named ~"). The CREED
 * has no room for a magnitude the card doesn't print. They wait for a wire that can express "all".
 *
 * ⓘ The count is read with NUM_WORD rather than SMALL_NUM — the wider map was already imported here, and
 * reaching for the narrower one crashed the module on a missing import. Worth a line because the failure
 * mode was a hard crash inside classifyCard, not a parse miss.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the matcher
 * removed -> all four park; `remaining` dropped from the atom -> the runtime drive fetches ONE Hawk instead
 * of three and the witness row shows it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram, resolveTutorChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SQUADRON_HAWK = { id: "c-sh", name: "Squadron Hawk", type: "Creature — Bird", mana: "{1}{W}",
  power: "1", toughness: "1",
  oracle: "Flying\nWhen this creature enters, you may search your library for up to three cards named Squadron Hawk, reveal them, put them into your hand, then shuffle." };
const LEGION_CONQUISTADOR = { id: "c-lc", name: "Legion Conquistador", type: "Creature — Vampire Soldier",
  mana: "{2}{W}", power: "2", toughness: "2",
  oracle: "When this creature enters, you may search your library for any number of cards named Legion Conquistador, reveal them, put them into your hand, then shuffle." };

const CLAUSE = "you may search your library for up to three cards named Squadron Hawk, reveal them, put them into your hand, then shuffle.";

describe("the plural shape parses with its printed count", () => {
  it("⭐ a tutor atom carrying remaining:3 and an exact name filter", () => {
    const p = parseEffectClause(CLAUSE, "Creature");
    expect(p.confidence).toBe("high");
    // ⓘ The clause arrives lowercased (the parser normalises before matching), so the name filter is
    // lowercase too — the same shape the singular named tutor has always produced. The runtime drive below
    // is what proves that filter actually MATCHES the real "Squadron Hawk" cards; without it, a
    // case-sensitive lookup would fetch nothing while this pin stayed green.
    expect(p.atoms).toEqual([{ op: "tutor", filter: { name: "squadron hawk" }, filterLabel: "card named squadron hawk",
      destination: "hand", sourceZones: ["library"], remaining: 3, targetType: null, optional: true }]);
    expect(classifyCard(SQUADRON_HAWK)).toBe("native-trigger");
  });

  it("⛔ 'any number of' stays parked — the bound is not printed, so it cannot be invented", () => {
    expect(parseEffectClause("you may search your library for any number of cards named Legion Conquistador, reveal them, put them into your hand, then shuffle.", "Creature").atoms).toEqual([]);
    expect(classifyCard(LEGION_CONQUISTADOR)).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the count is real: three Hawks come out, and the fourth stays in the library", () => {
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    // FOUR Hawks in the library plus a blank — "up to three" must take three and leave one behind.
    const library = [
      { id: "hawk1", name: "Squadron Hawk", type: "Creature — Bird", oracle: "" },
      { id: "hawk2", name: "Squadron Hawk", type: "Creature — Bird", oracle: "" },
      { id: "plains", name: "Plains", type: "Basic Land — Plains", oracle: "" },
      { id: "hawk3", name: "Squadron Hawk", type: "Creature — Bird", oracle: "" },
      { id: "hawk4", name: "Squadron Hawk", type: "Creature — Bird", oracle: "" },
    ];
    return { ...g, players: { ...g.players, user: { ...g.players.user, hand: [], library } } };
  }

  it("⭐ three sequential picks resolve, then the pause ENDS — driven on the PARSED atom", () => {
    // ⛔ The atom comes from the parser, not from a literal: parser and runtime are otherwise tested
    // separately and a disagreement between them would leave both halves green.
    const atoms = parseEffectClause(CLAUSE, "Creature").atoms;
    let s = runEffectProgram(board(), { source: { name: "Squadron Hawk" },
      payload: { params: { program: { version: 1, structure: "sequence", atoms }, controller: "user", targets: [] } } });

    // "You may" — the optional wrapper pauses first; take it.
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);

    const rows = [];
    for (const pick of ["hawk1", "hawk2", "hawk3"]) {
      rows.push({ pause: s.pendingChoice?.kind || null, candidates: (s.pendingChoice?.candidates || []).length });
      s = resolveTutorChoice(s, pick);
    }
    const hand = s.players.user.hand.map((c) => c.id).sort();
    const libNames = s.players.user.library.map((c) => c.id).sort();
    console.log("  WITNESS", JSON.stringify({ rows, hand, library: libNames, pauseAfter: s.pendingChoice?.kind || null }));
    // Three pauses, each offering only the four legal Hawks (never the Plains).
    expect(rows).toEqual([
      { pause: "tutor-search", candidates: 4 },
      { pause: "tutor-search", candidates: 3 },
      { pause: "tutor-search", candidates: 2 },
    ]);
    expect(hand).toEqual(["hawk1", "hawk2", "hawk3"]);
    // ⛔ THE FOURTH HAWK STAYS PUT. "Up to three" is a cap, and a resolver that ignored `remaining` would
    // either stop at one or drain all four — this row distinguishes both failures from correct behaviour.
    expect(libNames).toEqual(["hawk4", "plains"]);
    expect(s.pendingChoice).toBeFalsy();
  });
});
