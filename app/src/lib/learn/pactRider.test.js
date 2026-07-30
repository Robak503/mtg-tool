/**
 * pactRider.test.js — the Pact cycle (CR 603.7 + 104.3a).
 * Pact of Negation · Slaughter Pact · Summoner's Pact · Pact of the Titan.
 *
 * "<spell effect>. At the beginning of your next upkeep, pay {cost}. If you don't, you lose the game."
 * Two gaps had to close together, which is why the shelf ledger's single-blocker attribution was wrong
 * about this card:
 *
 *   1. COMPOSITION — matchDelayedTrigger's LEAD branch was anchored so the whole clause had to be the
 *      delayed ability. Its TRAIL branch already accepted leading sentences; the LEAD word order did not,
 *      so every "<effect>. At the beginning of …" card fell through. 46 non-native instants/sorceries
 *      carry that shape. On its own it unlocks NOTHING (measured) — it is a prerequisite, not a slice.
 *   2. THE RIDER ITSELF — "pay {cost}. If you don't, you lose the game" had no reader.
 *
 * ⭐ THE INTERESTING HALF IS THE FAILURE. Paying when able is not a policy guess — the alternative is
 * losing the game outright, so there is exactly one rational line. What earns the tests is the other
 * branch: a Pact you CANNOT pay kills you, and that is the entire reason these cards cost {0}.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { matchDelayedTrigger } from "./effects/spanMatchers.js";
import { applyPayOrLose, payOrLoseClauseParser } from "./effects/atoms/winGame.js";
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles (bundled Scryfall snapshot).
const PACT_OF_NEGATION = { name: "Pact of Negation", type: "Instant", mana: "{0}",
  oracle: "Counter target spell.\nAt the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game." };
const SLAUGHTER_PACT = { name: "Slaughter Pact", type: "Instant", mana: "{0}",
  oracle: "Destroy target nonblack creature.\nAt the beginning of your next upkeep, pay {2}{B}. If you don't, you lose the game." };
const SUMMONERS_PACT = { name: "Summoner's Pact", type: "Instant", mana: "{0}",
  oracle: "Search your library for a green creature card, reveal it, put it into your hand, then shuffle.\nAt the beginning of your next upkeep, pay {2}{G}{G}. If you don't, you lose the game." };
const PACT_OF_THE_TITAN = { name: "Pact of the Titan", type: "Instant", mana: "{0}",
  oracle: "Create a 4/4 red Giant creature token.\nAt the beginning of your next upkeep, pay {4}{R}. If you don't, you lose the game." };
// ⛔ The two Pacts whose SPELL half is unmodeled — out of scope, and they must stay that way.
const INTERVENTION_PACT = { name: "Intervention Pact", type: "Instant", mana: "{0}",
  oracle: "The next time a source of your choice would deal damage to you this turn, prevent that damage. You gain life equal to the damage prevented this way.\nAt the beginning of your next upkeep, pay {1}{W}{W}. If you don't, you lose the game." };
const GUILD_PACT = { name: "Guild Pact", type: "Instant", mana: "{0}",
  oracle: "Choose two colors. Add a mana of each of the chosen colors.\nAt the beginning of your next upkeep, pay one mana of each of the chosen colors. If you don't, you lose the game." };

const ISLAND = { id: "isl", name: "Island", type: "Basic Land — Island", mana: "", oracle: "" };

/** A board with N untapped Islands for the controller. */
function board(islands) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perms = Array.from({ length: islands }, (_, i) =>
    createPermanent({ id: `isl${i}`, card: { ...ISLAND, id: `isl-c${i}` }, controller: "user", summoningSick: false }));
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const COST_3UU = { generic: 3, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const payRider = (state, manaCost) => applyPayOrLose(state, { op: "pay-or-lose", manaCost }, { controller: "user" });

describe("⭐ THE RIDER — pay if able, die if not", () => {
  it("VACUITY CONTROL: nobody has lost before the rider resolves", () => {
    expect(board(5).players.user.lostGame).toBeFalsy();
  });

  it("enough mana → the Pact is paid and the controller lives", () => {
    const s = payRider(board(5), { ...COST_3UU, U: 2 });
    expect(s.players.user.lostGame).toBeFalsy();
    // …and it really was PAID, not waved through: the Islands are now tapped.
    expect(s.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(5);
  });

  it("⭐ NOT enough mana → the controller LOSES THE GAME", () => {
    // Four Islands cannot pay {3}{U}{U}. This is the branch the whole card exists for.
    const s = payRider(board(4), { ...COST_3UU, U: 2 });
    expect(s.players.user.lostGame).toBe(true);
  });

  it("⛔ an empty board loses too — no mana is not 'no cost'", () => {
    expect(payRider(board(0), { ...COST_3UU, U: 2 }).players.user.lostGame).toBe(true);
  });

  it("the log records which branch was taken", () => {
    const paid = payRider(board(5), { ...COST_3UU, U: 2 }).log.filter((e) => e.effect === "pay-or-lose");
    const died = payRider(board(0), { ...COST_3UU, U: 2 }).log.filter((e) => e.effect === "pay-or-lose");
    expect(paid[0]).toMatchObject({ paid: true });
    expect(died[0]).toMatchObject({ paid: false, lost: true });
  });
});

describe("the clause reader", () => {
  it("reads the cost off the printed pips", () => {
    expect(payOrLoseClauseParser("pay {3}{U}{U}. If you don't, you lose the game."))
      .toEqual({ op: "pay-or-lose", manaCost: { generic: 3, W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 }, targetType: null });
    expect(payOrLoseClauseParser("pay {2}{B}. If you don't, you lose the game.")?.manaCost)
      .toEqual({ generic: 2, W: 0, U: 0, B: 1, R: 0, G: 0, C: 0 });
  });

  it("⛔ a cost shape this reader does not model is REFUSED, never guessed", () => {
    // Guild Pact's "one mana of each of the chosen colors" is not pips at all; {X}/hybrid/Phyrexian are
    // pips it deliberately will not price. Refusing keeps the card on the Arbiter instead of underpaying.
    expect(payOrLoseClauseParser("pay one mana of each of the chosen colors. If you don't, you lose the game.")).toBeNull();
    expect(payOrLoseClauseParser("pay {X}. If you don't, you lose the game.")).toBeNull();
    expect(payOrLoseClauseParser("pay {2/U}. If you don't, you lose the game.")).toBeNull();
    expect(payOrLoseClauseParser("pay {U/P}. If you don't, you lose the game.")).toBeNull();
  });
});

describe("⭐ COMPOSITION — the spell half resolves NOW, the rider is scheduled (CR 603.7)", () => {
  it("the LEAD form now splits a leading sentence off", () => {
    const d = matchDelayedTrigger("Counter target spell. At the beginning of your next upkeep, pay {3}{U}{U}. If you don't, you lose the game.");
    expect(d.immediateClause).toBe("Counter target spell.");
    expect(d.delayedClause).toBe("pay {3}{U}{U}. If you don't, you lose the game");
    expect(d.fireStep).toBe("upkeep");
    expect(d.fireScope).toBe("yours");
  });

  it("the program is [immediate…, schedule] — the counter is NOT deferred", () => {
    const p = parseEffectClause(PACT_OF_NEGATION.oracle.replace(/\n/g, " "), "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["counter", "schedule-delayed"]);
  });

  it("a bare LEAD form with no leading sentence is unchanged", () => {
    const d = matchDelayedTrigger("At the beginning of the next end step, sacrifice it.");
    expect(d.immediateClause).toBeNull();
    expect(d.delayedClause).toBe("sacrifice it");
  });

  it("resolving the spell schedules the rider for the controller's next upkeep", () => {
    const out = runEffectProgram(board(5), {
      source: { name: "Pact of Negation" },
      payload: { params: { program: parseEffectClause(PACT_OF_NEGATION.oracle.replace(/\n/g, " "), "Instant"),
        controller: "user", sourceId: "src", context: {}, targets: [] } },
    });
    const s = out?.state ?? out;
    expect(s.delayedTriggers).toHaveLength(1);
    expect(s.delayedTriggers[0]).toMatchObject({ controller: "user", fireStep: "upkeep", fireScope: "yours" });
    // It fires on YOUR upkeep, not an opponent's.
    expect(drainDelayedTriggers(s, "upkeep", "ai1").fired).toHaveLength(0);
    expect(drainDelayedTriggers(s, "upkeep", "user").fired).toHaveLength(1);
  });
});

describe("the corpus rows", () => {
  it("the four modelled Pacts flip", () => {
    for (const c of [PACT_OF_NEGATION, SLAUGHTER_PACT, SUMMONERS_PACT, PACT_OF_THE_TITAN]) {
      expect(classifyCard(c), c.name).toBe("native-spell");
    }
  });

  it("⛔ the two Pacts with an unmodelled SPELL half stay non-native", () => {
    // Intervention Pact (a damage-prevention shield) and Guild Pact (choose-two-colours mana) are blocked
    // by their first clause, not the rider — building the rider must not drag them in behind it.
    expect(classifyCard(INTERVENTION_PACT)).not.toMatch(/^native/);
    expect(classifyCard(GUILD_PACT)).not.toMatch(/^native/);
  });
});
