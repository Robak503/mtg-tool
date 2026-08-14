/**
 * bonehoardDracosaur.test.js — THE EXILED-TYPE RIDERS (2026-08-14). Bonehoard Dracosaur: "At the
 * beginning of your upkeep, exile the top two cards of your library. You may play them this turn. If
 * you exiled a land card this way, create a 3/1 red Dinosaur creature token. If you exiled a nonland
 * card this way, this creature gets +2/+2 until end of turn."
 *
 * ⭐ THE DESIGN: the impulse-exile resolver writes a TRANSIENT { land, nonland } stamp (overwritten by
 * every impulse), two interveningIf predicates read it, and the parser fold emits [impulse-exile,
 * conditional(land→token), conditional(nonland→self-pump)] — the impulse atom precedes its
 * conditionals in the SAME program, so the read is fresh by construction. Fail-closed: no stamp → null
 * (the condition only exists behind the fold's sentinel).
 *
 * Whole-card audit: Flying + first strike + this one trigger.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the fold disabled -> Bonehoard parks.
 *   · the resolver stamp removed -> the predicates read null -> both conditionals reject (the mixed
 *     witness dies).
 *   · the land/nonland branch swapped in the predicate -> the land-only board mints no token (dies).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE_FX = "exile the top two cards of your library. You may play them this turn. If you exiled a land card this way, create a 3/1 red Dinosaur creature token. If you exiled a nonland card this way, this creature gets +2/+2 until end of turn";
const BONEHOARD = { id: "c-bd", name: "Bonehoard Dracosaur", type: "Creature — Dinosaur", mana: "{3}{R}{R}", power: "5", toughness: "5",
  oracle: "Flying, first strike\nAt the beginning of your upkeep, " + ORACLE_FX + "." };

function board(libCards) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const dino = createPermanent({ id: "BD", controller: "user", summoningSick: false, card: { id: "card-BD", ...BONEHOARD } });
  return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [dino], library: libCards, exile: [] } } };
}
const run = (s) => {
  // Resolve the three atoms in program order (the same sequential contract the program runner keeps) —
  // the impulse stamp is written by atom 1 and read by the two conditionals' predicates.
  const p = parseEffectClause(ORACLE_FX, "Instant");
  let st = s;
  for (const a of p.atoms) {
    const next = ATOM_RESOLVERS[a.op](st, a, { controller: "user", sourceId: "BD", targets: [] });
    if (next != null) st = next;
  }
  return st;
};
const tokens = (s) => s.players.user.battlefield.filter((p) => p.card?.token).length;

describe("the carrier and the program", () => {
  it("⭐ Bonehoard flips native-trigger; the program is [impulse, conditional(land), conditional(nonland)]", () => {
    expect(classifyCard(BONEHOARD)).toBe("native-trigger");
    const p = parseEffectClause(ORACLE_FX, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["impulse-exile", "conditional", "conditional"]);
    expect(p.atoms[1].branchOn).toBe("you exiled a land card this way");
    expect(p.atoms[2].branchOn).toBe("you exiled a nonland card this way");
  });
});

describe("⭐⭐ LAW 6 — the riders read WHAT was actually exiled", () => {
  const LAND = { id: "L", name: "Mountain", type: "Basic Land — Mountain" };
  const SPELL = { id: "S", name: "Shock", type: "Instant" };

  it("⭐⭐ land + nonland exiled: the token mints AND the pump lands (both riders true)", () => {
    const after = run(board([LAND, SPELL, { id: "D", name: "Deep", type: "Instant" }]));
    const row = { exiled: after.players.user.exile.map((c) => c.id).sort(), tokens: tokens(after) };
    console.log("  WITNESS bonehoardMixed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ exiled: ["L", "S"], tokens: 1 });
  });

  it("⛔ two LANDS exiled: the token mints, NO pump path (nonland false)", () => {
    const after = run(board([LAND, { ...LAND, id: "L2" }]));
    console.log("  WITNESS bonehoardLands", JSON.stringify({ tokens: tokens(after) })); // vitest 4 needs --disable-console-intercept
    expect(tokens(after)).toBe(1);
  });

  it("⛔ two NONLANDS exiled: NO token (land false)", () => {
    const after = run(board([SPELL, { ...SPELL, id: "S2" }]));
    console.log("  WITNESS bonehoardSpells", JSON.stringify({ tokens: tokens(after) })); // vitest 4 needs --disable-console-intercept
    expect(tokens(after)).toBe(0);
  });
});
