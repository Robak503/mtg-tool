/**
 * flashTiming.test.js — FLASH (CR 702.8a: "You may cast this spell any time you could cast an instant"), honoured at last — the
 * 09-06 plan's stage ③ · 22, 2026-09-30.
 *
 * legalChoices.isSorcerySpeed read the TYPE LINE alone ("Flash check is a v1.5 add — for now any non-instant defaults to
 * sorcery"), so every Flash permanent was castable only at sorcery speed: strictly weaker than printed, a documented under-
 * delivery that coverage credited anyway (flash sits among COVERED_KEYWORDS). A comment in the cast builder even claimed "a
 * Flash card reads instant-speed via isSorcerySpeed already" — it did not. It reads the card's own keyword now, through the
 * oracle-aware hasKeyword; the keywords array and the line-anchored scan agree on all 613 Flash cards in the corpus. A GRANTED
 * flash (Yeva, Vedalken Orrery) is the separate flash-cast-permission path and is untouched.
 *
 * Found while scoping census row ㉒ (Ancient Stone Idol, Static Snare, Embercleave — "costs {1} less for each attacking
 * creature"): all three have Flash, and at sorcery speed nothing is ever attacking, so their discount could never apply.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each cast offered by legalActionsForPlayer and resolved for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const VIPER = { id: "c-viper", name: "Ambush Viper", type: "Creature — Snake", mana: "{1}{G}", cmc: 2, power: "2", toughness: "1",
  keywords: ["Flash", "Deathtouch"], oracle: "Flash\nDeathtouch" };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const SHOCK = { id: "c-shock", name: "Shock", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Shock deals 2 damage to any target." };

const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
// It is `active`'s turn, at `phase`/`step`; `holder` has priority with `hand` in hand and `pool` floating.
function window({ active = "ai", holder = "user", phase = "ending", step = "end", hand = [], pool = { R: 1, G: 2 }, combat = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase, step, activePlayer: active, priorityHolder: holder, consecutivePasses: 0, stack: [], pendingTriggers: [], combat,
    players: { ...s.players, [holder]: { ...s.players[holder], hand, manaPool: { ...EMPTY, ...pool } } } };
}
const offered = (s, pid = "user") => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell").map((a) => a.name);

describe("RUNTIME — a Flash permanent is cast any time an instant could be", () => {
  it("VACUITY CONTROL — the AI's end step is a real instant window (Shock is offered), and a creature WITHOUT flash is not", () => {
    const names = offered(window({ hand: [SHOCK, BEARS] }));
    expect(names).toContain("Shock");
    expect(names).not.toContain("Grizzly Bears");
  });

  it("⭐ Ambush Viper is offered in the AI's end step, and resolves onto the user's battlefield during the AI's turn", () => {
    const s0 = window({ hand: [VIPER] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.name === "Ambush Viper");
    expect(cast).toBeDefined();
    const s = resolveTopOfStack(dispatchAction(s0, cast));
    const out = { turnOf: s.activePlayer, viperOnUserBattlefield: s.players.user.battlefield.some((p) => p.card.name === "Ambush Viper"), handLeft: s.players.user.hand.length };
    expect(out).toEqual({ turnOf: "ai", viperOnUserBattlefield: true, handLeft: 0 });
    console.log(`WITNESS flashViper ${JSON.stringify(out)}`);
  });

  it("⭐ the ambush: Ambush Viper is offered while the AI's attackers are declared", () => {
    const attacker = createPermanent({ id: "atk", card: { ...BEARS, id: "c-atk" }, controller: "ai", summoningSick: false });
    const s0 = window({ phase: "combat", step: "declare-attackers", hand: [VIPER],
      combat: { attackers: [{ permanentId: "atk", attackingPlayer: "ai", defender: "user" }], blockers: [] } });
    const s = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, battlefield: [attacker] } } };
    expect(offered(s)).toContain("Ambush Viper");
  });

  it("⭐ both seats: the AI's own Ambush Viper is offered to the AI in the user's end step", () => {
    expect(offered(window({ active: "user", holder: "ai", hand: [VIPER] }), "ai")).toContain("Ambush Viper");
  });

  it("the user's own main phase is unchanged: the Viper and the Bears are both offered there", () => {
    const names = offered(window({ active: "user", holder: "user", phase: "precombat-main", step: "main", hand: [VIPER, BEARS] }));
    expect(names).toEqual(expect.arrayContaining(["Ambush Viper", "Grizzly Bears"]));
  });
});
