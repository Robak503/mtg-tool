/**
 * throneTappedCount.test.js — THE TAPPED-QUALIFIED COUNT (2026-08-14). Throne of the God-Pharaoh:
 * "At the beginning of your end step, each opponent loses life equal to the number of tapped creatures
 * you control." Riders: Black Widow, Daring Operative (the combat-damage drain scaled by creature
 * cards in your graveyard — the new "equal to the number of" arm on an existing count kind) and
 * Harvest Season (the RAMP-MULTI-X tutor whose X is the tapped count — unlocked by the same qualifier).
 *
 * ⭐ TWO SMALL PIECES: the tappedOnly qualifier on the permanentsYouControl count (parsed in
 * parseCountSource, honored in countForSpec's main branch off the LIVE perm.tapped at resolution —
 * the same qualifier pattern as powerAtLeast/requiresCounter) + the "each opponent loses life equal
 * to the number of <count>" spelling of the existing for-each arm (per:1, the same atom).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the equal-to arm disabled -> Throne + Black Widow park.
 *   · the tappedOnly filter dropped in countForSpec -> untapped creatures count too (the mixed-board
 *     witness dies — the over-count the qualifier exists to prevent).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const THRONE = { name: "Throne of the God-Pharaoh", type: "Legendary Artifact", mana: "{2}",
  oracle: "At the beginning of your end step, each opponent loses life equal to the number of tapped creatures you control." };
const CLAUSE = "each opponent loses life equal to the number of tapped creatures you control";

describe("the carriers and the count", () => {
  it("⭐ all three flip native; the count parses with tappedOnly; the atom is the scaled each-opponent drain", () => {
    expect(classifyCard(THRONE)).toBe("native-trigger");
    expect(classifyCard({ name: "Black Widow, Daring Operative", type: "Legendary Creature — Human Spy", mana: "{4}{B}", power: "4", toughness: "3",
      oracle: "Menace\nWhen Black Widow enters, mill three cards.\nWhenever Black Widow deals combat damage to a player, each opponent loses life equal to the number of creature cards in your graveyard." })).toBe("native-trigger");
    expect(classifyCard({ name: "Harvest Season", type: "Sorcery", mana: "{2}{G}",
      oracle: "Search your library for up to X basic land cards, where X is the number of tapped creatures you control, put those cards onto the battlefield tapped, then shuffle." })).toBe("native-spell");
    expect(parseCountSource("tapped creatures you control")).toMatchObject({ kind: "permanentsYouControl", tappedOnly: true });
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "lose-life", who: "eachOpponent", amountCount: { kind: "permanentsYouControl", tappedOnly: true, per: 1 } });
  });
});

describe("⭐⭐ LAW 6 — only TAPPED creatures count, read live at resolution", () => {
  const mk = (id, tapped) => createPermanent({ id, controller: "user", summoningSick: false, tapped,
    card: { id: "card-" + id, name: "Bear " + id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });

  it("⭐⭐ 2 tapped + 1 untapped: each opponent loses exactly 2", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [mk("A", true), mk("B", true), mk("C", false)] } } };
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["lose-life"](s, atom, { controller: "user", targets: [] });
    const row = { ai1: 40 - after.players.ai1.life, ai2: 40 - after.players.ai2.life, user: 40 - after.players.user.life };
    console.log("  WITNESS throneTapped", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai1: 2, ai2: 2, user: 0 });
  });

  it("⛔ ZERO tapped creatures: zero loss — never a fabricated floor", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [mk("C", false)] } } };
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["lose-life"](s, atom, { controller: "user", targets: [] });
    expect(after.players.ai1.life).toBe(40);
  });
});
