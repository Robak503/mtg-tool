/**
 * descendThisTurn.test.js — "if you descended this turn" (CR 700.11)
 * Child of the Volcano · Enterprising Scallywag · Deep Goblin Skulltaker · Canonized in Blood · Ruin-Lurker Bat.
 *
 * CR 700.11: a player "descended this turn" iff a PERMANENT CARD was put into that player's graveyard from
 * anywhere this turn; "the number of times descended" counts each such card.
 *
 * ⭐ THE WHOLE RISK IS READING THE TALLY NEXT DOOR. `recordGraveyardEvents` already stamped
 * `gyEnteredThisTurn` — every CARD entering the graveyard — and descend is strictly narrower. An instant or
 * sorcery raises that counter and is NOT a descend; a dying token is not a card at all (CR 111.7). Every
 * carrier here is an end-step rider on a permanent, meant to reward actually losing permanents, so binding
 * the wrong counter would fire all five off a cantrip. That is what the negative tests below exist for.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, recordGraveyardEvents, resetCreatureDeathsAllPlayers, _resetIdsForTests } from "./gameState.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles, read out of the bundled snapshot.
const CHILD_OF_VOLCANO = { name: "Child of the Volcano", type: "Creature — Elemental", power: "2", toughness: "2", mana: "{2}{R}",
  oracle: "Trample\nAt the beginning of your end step, if you descended this turn, put a +1/+1 counter on this creature. (You descended if a permanent card was put into your graveyard from anywhere.)" };
const ENTERPRISING_SCALLYWAG = { name: "Enterprising Scallywag", type: "Creature — Goblin Pirate", power: "2", toughness: "2", mana: "{2}{R}",
  oracle: "At the beginning of your end step, if you descended this turn, create a Treasure token. (You descended if a permanent card was put into your graveyard from anywhere.)" };
const DEEP_GOBLIN_SKULLTAKER = { name: "Deep Goblin Skulltaker", type: "Creature — Goblin Warrior", power: "2", toughness: "1", mana: "{1}{B}",
  oracle: "Menace\nAt the beginning of your end step, if you descended this turn, put a +1/+1 counter on this creature. (You descended if a permanent card was put into your graveyard from anywhere.)" };
const CANONIZED_IN_BLOOD = { name: "Canonized in Blood", type: "Enchantment", mana: "{2}{B}",
  oracle: "At the beginning of your end step, if you descended this turn, put a +1/+1 counter on target creature you control. (You descended if a permanent card was put into your graveyard from anywhere.)\n{5}{B}{B}, Sacrifice this enchantment: Create a 4/3 white and black Vampire Demon creature token with flying." };
const RUIN_LURKER_BAT = { name: "Ruin-Lurker Bat", type: "Creature — Bat", power: "1", toughness: "1", mana: "{1}{B}",
  oracle: "Flying, lifelink\nAt the beginning of your end step, if you descended this turn, scry 1. (You descended if a permanent card was put into your graveyard from anywhere.)" };

const fresh = () => createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
const ask = (state, pid = "user") => evaluateInterveningIf(state, "you descended this turn", pid, {});
/** One graveyard-ENTRY event at the chokepoint every entry site routes through. */
const gyEnter = (state, gyOwner, card) => recordGraveyardEvents(state, [{ dir: "enter", gyOwner, card }]);

const CREATURE = { id: "c1", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };
const LAND = { id: "l1", name: "Forest", type: "Basic Land — Forest", mana: "", oracle: "" };
const INSTANT = { id: "i1", name: "Shock", type: "Instant", mana: "{R}", oracle: "" };
const SORCERY = { id: "s1", name: "Ritual", type: "Sorcery", mana: "{B}", oracle: "" };
const TOKEN_CREATURE = { id: "t1", name: "Saproling", type: "Creature — Saproling", mana: "", oracle: "", token: true };

describe("⭐ THE TALLY — what counts as a descend (CR 700.11)", () => {
  it("VACUITY CONTROL: a fresh seat has not descended", () => {
    expect(ask(fresh())).toBe(false);
    expect(fresh().players.user.descendedThisTurn || 0).toBe(0);
  });

  it("a CREATURE card entering your graveyard is a descend", () => {
    const s = gyEnter(fresh(), "user", CREATURE);
    expect(s.players.user.descendedThisTurn).toBe(1);
    expect(ask(s)).toBe(true);
  });

  it("a LAND card counts too — every permanent type does", () => {
    expect(ask(gyEnter(fresh(), "user", LAND))).toBe(true);
  });

  it("⛔ an INSTANT does NOT — the discriminating case against the tally next door", () => {
    const s = gyEnter(fresh(), "user", INSTANT);
    expect(s.players.user.gyEnteredThisTurn).toBe(1);          // the neighbouring counter DID move …
    expect(s.players.user.descendedThisTurn || 0).toBe(0);     // … and this one correctly did not
    expect(ask(s)).toBe(false);
  });

  it("⛔ a SORCERY does not either", () => {
    expect(ask(gyEnter(fresh(), "user", SORCERY))).toBe(false);
  });

  it("⛔ a dying TOKEN is not a card (CR 111.7) — no descend", () => {
    const s = gyEnter(fresh(), "user", TOKEN_CREATURE);
    expect(s.players.user.descendedThisTurn || 0).toBe(0);
    expect(ask(s)).toBe(false);
  });

  it("counts each permanent card, not just a flag (The Mycotyrant reads the COUNT)", () => {
    let s = gyEnter(fresh(), "user", CREATURE);
    s = gyEnter(s, "user", LAND);
    expect(s.players.user.descendedThisTurn).toBe(2);
  });

  it("⛔ PER-SEAT — an opponent's descend does not satisfy YOUR condition", () => {
    const s = gyEnter(fresh(), "ai1", CREATURE);
    expect(ask(s, "user")).toBe(false);
    expect(ask(s, "ai1")).toBe(true);
  });

  it("resets for every seat at untap", () => {
    let s = gyEnter(fresh(), "user", CREATURE);
    s = gyEnter(s, "ai1", CREATURE);
    expect(ask(s, "user")).toBe(true);
    const next = resetCreatureDeathsAllPlayers(s);
    expect(ask(next, "user")).toBe(false);
    expect(ask(next, "ai1")).toBe(false);
  });

  it("⛔ an unknown seat → false, never true (the engine's own convention)", () => {
    // evaluateSingleCondition's opening guard already returns false for a missing controller — "condition
    // unmet". A first draft of this arm added its own seat check returning null, which was both dead code
    // and a comment describing a return this function never makes. Pinned so the convention stays visible.
    expect(ask(fresh(), "nobody")).toBe(false);
  });
});

describe("detection + vocabulary", () => {
  it("the rider is carried as an intervening-if and is now parseable", () => {
    const d = detectTriggers(CHILD_OF_VOLCANO).find((x) => x.interveningIf);
    expect(d.interveningIf).toBe("you descended this turn");
    expect(interveningIfParseable("you descended this turn")).toBe(true);
  });

  it("⛔ the COUNT form stays unparseable — it is a magnitude, not a condition (SAFE FN)", () => {
    // The Mycotyrant's "where X is the number of times you descended this turn" is a different build.
    expect(interveningIfParseable("the number of times you descended this turn")).toBe(false);
  });
});

describe("the corpus rows", () => {
  it("all five carriers flip", () => {
    expect(classifyCard(CHILD_OF_VOLCANO)).toBe("native-trigger");
    expect(classifyCard(ENTERPRISING_SCALLYWAG)).toBe("native-trigger");
    expect(classifyCard(DEEP_GOBLIN_SKULLTAKER)).toBe("native-trigger");
    expect(classifyCard(RUIN_LURKER_BAT)).toBe("native-trigger");
    expect(classifyCard(CANONIZED_IN_BLOOD)).toBe("native-mixed");   // + its sacrifice-for-a-token activated
  });
});
