/**
 * DRANNITH MAGISTRATE — the cast-from-hand-only lock on opponents. SHELF-85 · Light-Paws L5, 2026-09-05.
 * "Your opponents can't cast spells from anywhere other than their hands."
 *
 * The existing opponents-can't-cast lock (Grand Abolisher's family) is a during-your-turn WINDOW on every cast; Drannith's is
 * ALWAYS ON and ZONE-scoped. Same marker pattern with its own exact-line reader, and ONE post-filter after the cast block:
 * for a player who is an opponent of any seat whose BATTLEFIELD holds the lock, every cast-family action whose `fromZone` is
 * not "hand" is withheld (graveyard, exile, command, library). Land plays are not casts; the controller is untouched.
 *
 * Mutation-checked: see the run ledger (docs-sk105).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, castFromHandOnlyLockOf } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DRANNITH = { id: "c-dm", name: "Drannith Magistrate", type: "Creature — Human Wizard", mana: "{1}{W}", power: "1", toughness: "3", keywords: [],
  oracle: "Your opponents can't cast spells from anywhere other than their hands." };
const ABOLISHER = { id: "c-ga", name: "Grand Abolisher", type: "Creature — Human Cleric", mana: "{W}{W}", power: "2", toughness: "2", keywords: [],
  oracle: "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments." };

describe("the parser", () => {
  it("Drannith emits the always-on hand-only marker; the reader sees it; Grand Abolisher keeps its windowed lock; Drannith flips native", () => {
    const row = { dm: parseStaticAbilities(DRANNITH), reader: [castFromHandOnlyLockOf(DRANNITH), castFromHandOnlyLockOf(ABOLISHER)], ga: parseStaticAbilities(ABOLISHER), tier: classifyCard(DRANNITH) };
    console.log("  WITNESS drannith", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.dm).toEqual([{ castFromHandOnlyForOpponents: true }]);
    expect(row.reader).toEqual([true, null]);
    expect(row.ga).toEqual([{ cantCast: { window: "yourTurn", includeActivated: true } }]);
    expect(row.tier).toMatch(/^native/);
  });
});

const THINK = { id: "c-tt", name: "Think Twice", type: "Instant", mana: "{1}{U}", keywords: ["Flashback"], oracle: "Draw a card.\nFlashback {2}{U}" };
const BEAR = { id: "c-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{U}", power: 2, toughness: 2, keywords: [], oracle: "" };
const island = (owner, i) => createPermanent({ id: `${owner}-i${i}`, card: { id: `c-${owner}-i${i}`, name: "Island", type: "Basic Land — Island", oracle: "" }, controller: owner });

/** Both seats hold the same hand (a bear), graveyard (a flashback instant) and three Islands; `lockOn` puts the Magistrate on that seat. */
function table(lockOn, active) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const seat = (id) => ({ ...s0.players[id], hand: [{ ...BEAR, id: `c-bear-${id}` }], graveyard: [{ ...THINK, id: `c-tt-${id}` }],
    battlefield: [island(id, 1), island(id, 2), island(id, 3), ...(lockOn === id ? [createPermanent({ id: `dm-${id}`, card: DRANNITH, controller: id, summoningSick: false })] : [])],
    library: [{ id: `lib-${id}`, name: "Lib", type: "Instant", oracle: "" }] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, players: { user: seat("user"), ai: seat("ai") } };
}
const casts = (s, pid) => legalActionsForPlayer(s, pid).filter((x) => x.kind === "cast-spell").map((x) => `${x.cardId}@${x.fromZone}`).sort();

describe("RUNTIME — the offer under the lock", () => {
  it("bare board: the opponent casts from hand AND flashes back from the graveyard; with the Magistrate on the other seat, only the hand cast remains — on the opponent's OWN turn (always on, no window)", () => {
    const bare = casts(table(null, "user"), "user");
    const locked = casts(table("ai", "user"), "user");
    const row = { bare, locked };
    console.log("  WITNESS drannithLock", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ bare: ["c-bear-user@hand", "c-tt-user@graveyard"], locked: ["c-bear-user@hand"] });
  });

  it("the Magistrate's own controller keeps the flashback", () => {
    const own = casts(table("ai", "ai"), "ai");
    console.log("  WITNESS drannithOwner", JSON.stringify(own)); // vitest 4 needs --disable-console-intercept
    expect(own).toEqual(["c-bear-ai@hand", "c-tt-ai@graveyard"]);
  });
});
