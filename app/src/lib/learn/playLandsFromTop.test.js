/**
 * playLandsFromTop.test.js — THE LANDS-ONLY play-from-top permission (CR 118.6):
 * Oracle of Mul Daya #499 · Courser of Kruphix #1232.
 *
 *   "You may play lands from the top of your library."
 *
 * The BROAD form ("You may play lands and cast spells from the top of your library" — Future Sight, Magus
 * of the Future) was already modeled end to end: the marker, the permission read, and the runtime that
 * offers the top card as a real cast or land play. This is the narrower sibling — the same permission with
 * the SPELL half absent — which is another empty cell rather than a new mechanic.
 *
 * ⚠️ BUT THE NARROWER CARD NEEDED A NEW GATE, and that is the whole risk of this slice.
 * actionsPlayFromTopOfLibrary offered a nonland top card as a cast UNCONDITIONALLY, because until now every
 * permission that reached it granted spells too. Emitting the lands-only marker without gating that branch
 * would have let Courser of Kruphix cast spells off the library — a far bigger card than the one printed,
 * on a top-2500 staple, and invisible in the coverage tier because the card classifies native either way.
 * The `spellFilter: null` field and the `if (!perm.spellFilter)` gate are one change.
 *
 * playFromTopPermission also became a MERGE instead of first-wins: Courser (lands) and Future Sight
 * (lands + spells) can share a battlefield, and whichever the scan reached first used to win outright.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, playFromTopPermission } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text.
const ORACLE_OF_MUL_DAYA = { id: "c-omd", name: "Oracle of Mul Daya", type: "Creature — Elf Shaman", mana: "{3}{G}", power: 2, toughness: 2,
  oracle: "You may play an additional land on each of your turns.\nPlay with the top card of your library revealed.\nYou may play lands from the top of your library." };
const COURSER = { id: "c-ck", name: "Courser of Kruphix", type: "Enchantment Creature — Centaur", mana: "{1}{G}{G}", power: 2, toughness: 4,
  oracle: "Play with the top card of your library revealed.\nYou may play lands from the top of your library.\nLandfall — Whenever a land you control enters, you gain 1 life." };
const FUTURE_SIGHT = { id: "c-fs", name: "Future Sight", type: "Enchantment", mana: "{2}{U}{U}",
  oracle: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." };

const FOREST = { id: "lib-forest", name: "Forest", type: "Basic Land — Forest", oracle: "" };
const BOLT = { id: "lib-bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };

const MOUNTAIN = { id: "c-mtn", name: "Mountain", type: "Basic Land — Mountain", oracle: "" };

/** `mana` seats untapped Mountains so an affordability gate never masks a permission result. */
function board(grantCard, topCard, mana = 0) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: [
          createPermanent({ id: "grant", card: grantCard, controller: "user", summoningSick: false }),
          ...Array.from({ length: mana }, (_, i) => createPermanent({ id: `mtn${i}`, card: { ...MOUNTAIN, id: `c-mtn${i}` }, controller: "user", summoningSick: false })),
        ],
        library: [topCard],
        hand: [],
        landsPlayedThisTurn: 0,
      },
    },
  };
}
const fromLibrary = (s, kind) => legalActionsForPlayer(s, "user").filter((a) => a.kind === kind && a.fromZone === "library");

describe("the parser — the narrow form carries a null spellFilter", () => {
  it("the lands-only clause parses to { lands: true, spellFilter: null }", () => {
    const d = parseStaticAbilities(COURSER).find((x) => x.playFromTop);
    expect(d.playFromTop).toEqual({ lands: true, spellFilter: null });
  });

  it("the BROAD form still carries spellFilter 'any' (untouched)", () => {
    expect(parseStaticAbilities(FUTURE_SIGHT).find((x) => x.playFromTop).playFromTop)
      .toEqual({ lands: true, spellFilter: "any" });
  });
});

describe("the permission read — MERGED across permanents, not first-wins", () => {
  it("Courser alone grants lands only", () => {
    expect(playFromTopPermission(board(COURSER, FOREST), "user")).toEqual({ lands: true, spellFilter: null });
  });

  it("THE MERGE PIN — Courser + Future Sight grants BOTH, in EITHER battlefield order", () => {
    // Both orders, deliberately. A first-wins scan fails the Courser-first case and a last-wins scan fails
    // the Future-Sight-first case, so only a real merge passes both. (A single-order version of this test
    // survived the mutation that reverted the merge — checked.)
    const withBoth = (order) => {
      const s = board(COURSER, FOREST);
      const courser = s.players.user.battlefield[0];
      const fs = createPermanent({ id: "fs", card: FUTURE_SIGHT, controller: "user" });
      const bf = order === "courser-first" ? [courser, fs] : [fs, courser];
      return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
    };
    expect(playFromTopPermission(withBoth("courser-first"), "user")).toEqual({ lands: true, spellFilter: "any" });
    expect(playFromTopPermission(withBoth("future-sight-first"), "user")).toEqual({ lands: true, spellFilter: "any" });
  });
});

describe("RUNTIME — the land half works, the spell half is refused", () => {
  it("a LAND on top is offered as a play-land from the library", () => {
    expect(fromLibrary(board(COURSER, FOREST), "play-land")).toHaveLength(1);
  });

  it("THE LOAD-BEARING ONE — a NONLAND on top is NOT castable under a lands-only permission", () => {
    // Ungated, Courser of Kruphix casts spells off the library. That is a different, much stronger card,
    // and the coverage tier can't see the difference because it classifies native either way.
    expect(fromLibrary(board(COURSER, BOLT, 2), "cast-spell")).toHaveLength(0);
  });

  it("REGRESSION PIN — Future Sight's broad permission still casts the nonland top", () => {
    expect(fromLibrary(board(FUTURE_SIGHT, BOLT, 2), "cast-spell").length).toBeGreaterThan(0);
  });

  it("the land still costs a land drop — a spent drop withdraws the offer", () => {
    const s = board(COURSER, FOREST);
    const spent = { ...s, players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 1 } } };
    expect(fromLibrary(spent, "play-land")).toHaveLength(0);
  });

  it("the permission ends with the source — no grant on the battlefield, no offer", () => {
    const s = board(COURSER, FOREST);
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(fromLibrary(gone, "play-land")).toHaveLength(0);
  });
});

describe("classification — the staples this unblocks", () => {
  it("Oracle of Mul Daya #499 flips (extra land drop + reveal + lands-from-top)", () => {
    expect(classifyCard(ORACLE_OF_MUL_DAYA)).toMatch(/^native/);
  });

  it("Courser of Kruphix #1232 flips (reveal + lands-from-top + the landfall trigger)", () => {
    expect(classifyCard(COURSER)).toMatch(/^native/);
  });

  it("Augur of Autumn stays PARKED — its coven cast-from-top half is unmodeled", () => {
    // The whole-card law: the lands half is understood, the conditional creature-cast half is not.
    expect(classifyCard({ id: "c-aa", name: "Augur of Autumn", type: "Creature — Human Druid", mana: "{1}{G}{G}", power: 2, toughness: 3,
      oracle: "You may look at the top card of your library any time.\nYou may play lands from the top of your library.\nCoven — As long as you control three or more creatures with different powers, you may cast creature spells from the top of your library." }))
      .toBe("body-only");
  });
});
