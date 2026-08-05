/**
 * scopedUntap.test.js — "untap [another] target <permanent type> YOU CONTROL" (CR 109.5 + a controller
 * scope): Breaching Hippocamp, Dauntless Aven, Kelpie Guide, Tenth District Veteran.
 *
 * ⭐ THE SECOND MISSING CELL IN THE SAME ARM. This matcher already HAD a restriction lane — `another` →
 * `{kind:"notSource"}` — and its type alternation had already been widened once (the artifact cell, Voltaic
 * Key class). It still had no ` you control` lane, so the scoped wording fell off the anchor while its
 * unscoped twin parsed fine. **A parser that grew one restriction is not a parser that grew restrictions.**
 *
 * ⭐ FOUND BY THE GREP THE PREVIOUS SLICE WROTE DOWN: comments saying a scoped variant "fails the anchor",
 * cross-checked against a 0-native tier tally. That is now a repeatable vein, not a lucky find.
 *
 * ⛔ THE TWO RESTRICTIONS COMPOSE, and they must: "untap ANOTHER target permanent YOU CONTROL" means both
 * (CR 109.5 excludes the source, the scope excludes opponents). Dropping either one alone still leaves a
 * plausible-looking atom, so both are pinned separately at ENUMERATION — where an illegal target is born.
 *
 * ⓘ Forensic Researcher and North Pole Patrol carry the identical line and still PARK, on their OTHER
 * abilities (collect evidence; waterbend). Pinned, so a later reader doesn't mistake them for a miss here.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * controller restriction dropped -> the witness offers an OPPONENT'S permanent; the notSource restriction
 * dropped -> the source untaps itself, which "another" exists to forbid.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const parse = (s) => parseEffectClause(splitClauses(s)[0], "Creature");

describe("the scope reaches the atom, and composes with 'another'", () => {
  it("⭐ bare scoped form → the controller restriction alone", () => {
    const p = parse("untap target creature you control");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "untap", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }]);
  });

  it("⭐ 'another' + scoped → BOTH restrictions, in that order", () => {
    expect(parse("untap another target permanent you control").atoms).toEqual([
      { op: "untap", targetType: "permanent", restrictions: [{ kind: "notSource" }, { kind: "controller", who: "you" }] },
    ]);
  });

  it("⛔ the unscoped forms are untouched", () => {
    expect(parse("untap target permanent").atoms).toEqual([{ op: "untap", targetType: "permanent", restrictions: [] }]);
    expect(parse("untap another target creature").atoms).toEqual([{ op: "untap", targetType: "creature", restrictions: [{ kind: "notSource" }] }]);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard({ name: "Breaching Hippocamp", type: "Creature — Horse Fish", mana: "{3}{U}", power: "2", toughness: "3",
      oracle: "Flash (You may cast this spell any time you could cast an instant.)\nWhen this creature enters, untap another target creature you control." })).toBe("native-trigger");
    expect(classifyCard({ name: "Dauntless Aven", type: "Creature — Bird Warrior", mana: "{2}{W}", power: "2", toughness: "3",
      oracle: "Flying\nWhenever this creature attacks, untap target creature you control." })).toBe("native-trigger");
  });

  it("⛔ the same line on a card with ANOTHER unmodelled ability still parks (whole-card law)", () => {
    // Forensic Researcher's collect-evidence cost is the blocker, not this clause.
    expect(classifyCard({ name: "Forensic Researcher", type: "Creature — Merfolk Detective", mana: "{2}{U}", power: "1", toughness: "3",
      oracle: "{T}: Untap another target permanent you control.\n{T}, Collect evidence 3: Tap target creature you don't control." })).not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — both restrictions are enforced at ENUMERATION", () => {
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller, summoningSick: false });
    return { ...g, players: { ...g.players,
      user: { ...g.players.user, battlefield: [mk("src", "user"), mk("mine", "user")] },
      ai: { ...g.players.ai, battlefield: [mk("theirs", "ai")] } } };
  }
  const offered = (clause) => expandCastChoices(board(), "user", parse(clause), [], { sourceId: "src" })
    .flatMap((c) => (c.targets || []).map((t) => t.id)).sort();

  it("⭐⭐ 'another … you control' offers ONLY your other permanent", () => {
    const row = {
      anotherScoped: offered("untap another target permanent you control"),
      scopedOnly: offered("untap target permanent you control"),
      unscoped: offered("untap target permanent"),
    };
    console.log("  WITNESS scopedUntap", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      anotherScoped: ["mine"],                    // ⭐ not the source, not the opponent's
      scopedOnly: ["mine", "src"],                // the source IS legal without "another"
      unscoped: ["mine", "src", "theirs"],
    });
  });
});
