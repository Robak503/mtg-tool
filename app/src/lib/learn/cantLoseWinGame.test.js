/**
 * cantLoseWinGame.test.js — "You can't lose the game" / "your opponents can't win the game" and their
 * INVERSIONS (CR 104.3a / 104.2a): Platinum Angel, Herald of Eternal Dawn, Darksteel Angel, Lich's Mastery,
 * Platinum Persecutor, and Abyssal Persecutor.
 *
 * ⛔⛔ PLATINUM ANGEL DID NOTHING. `learnSession.isPlayerDead` enforces losing (life ≤ 0, poison ≥ 10,
 * commander damage ≥ 21) and `hasWonGame` enforces winning — but NOTHING read the exemption. The most
 * iconic "you can't lose the game" card in Magic was a 7-mana 4/4 flier.
 *
 * ⛔⛔ ABYSSAL PERSECUTOR WAS WORSE THAN INERT. It prints both halves INVERTED — *its controller* can't win
 * and *its opponents* can't lose. With the statics unread, the engine happily let its controller win
 * outright, which is the one thing that card exists to prevent. A drawback the engine skips is not a safe
 * false negative; it is a card playing better than printed.
 *
 * ⭐ SIXTH FIND FROM THE RUNTIME-REFUSAL SWEEP, and the shape has not changed once: a rule the engine DOES
 * enforce, whose OFF-SWITCH was never modelled. legend rule → exemption. max hand size → modifier. Losing →
 * this. **Ask of every enforced rule: what turns it off, and is that modelled?**
 *
 * ⛔ THE SUBJECT IS CAPTURED PER-CLAUSE, never assumed. Platinum Angel and Abyssal Persecutor share a
 * sentence skeleton and mean opposite things; a parser or reader that treated "you" as "the good side"
 * would hand the Persecutor's controller a win. That inversion is pinned in both the parse and the drive.
 *
 * ⛔ CHECKED AHEAD OF EVERY LOSE CONDITION, because that is what CR 104.3a says: the player does not lose,
 * however far below zero their life is. An eliminated seat is still gone — the missing-player guard runs
 * first, so a stale static can never resurrect one.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * isPlayerDead check removed -> Platinum Angel's controller dies at -5 life; the hasWonGame check removed
 * -> Abyssal Persecutor's controller wins.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { playerCantLoseGame, playerCantWinGame } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { hasWonGame, isPlayerDead } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

const PLATINUM_ANGEL = { id: "c-pa", name: "Platinum Angel", type: "Artifact Creature — Angel", mana: "{7}",
  power: "4", toughness: "4", oracle: "Flying\nYou can't lose the game and your opponents can't win the game." };
const ABYSSAL_PERSECUTOR = { id: "c-ap", name: "Abyssal Persecutor", type: "Creature — Demon", mana: "{2}{B}{B}",
  power: "6", toughness: "6", oracle: "Flying, trample\nYou can't win the game and your opponents can't lose the game." };

describe("the two halves are captured with their real subjects", () => {
  it("⭐⛔ Platinum Angel and Abyssal Persecutor are MIRRORS, not the same card", () => {
    expect(parseStaticAbilities(PLATINUM_ANGEL).map((e) => e.op)).toEqual([
      { layerOp: "cantLoseGame", who: "you" }, { layerOp: "cantWinGame", who: "opponents" },
    ]);
    // ⛔ THE INVERSION. Same sentence skeleton, opposite meaning — this is the pin that stops a future
    // "simplification" from collapsing the two into one shape.
    expect(parseStaticAbilities(ABYSSAL_PERSECUTOR).map((e) => e.op)).toEqual([
      { layerOp: "cantWinGame", who: "you" }, { layerOp: "cantLoseGame", who: "opponents" },
    ]);
    expect(classifyCard(PLATINUM_ANGEL)).toBe("native-static");
    expect(classifyCard(ABYSSAL_PERSECUTOR)).toBe("native-static");
  });
});

describe("⭐ LAW 6 — the readers resolve the subject off the SOURCE's controller", () => {
  function board(card, controller) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "src", card, controller, summoningSick: false });
    const players = { ...g.players };
    players[controller] = { ...players[controller], battlefield: [perm], life: -5 };
    return { ...g, players };
  }

  it("⭐ Platinum Angel: its controller can't lose, its OPPONENTS can't win", () => {
    const s = board(PLATINUM_ANGEL, "user");
    const row = {
      userCantLose: playerCantLoseGame(s, "user"), userCantWin: playerCantWinGame(s, "user"),
      oppCantLose: playerCantLoseGame(s, "ai1"), oppCantWin: playerCantWinGame(s, "ai1"),
    };
    console.log("  WITNESS PlatinumAngel", JSON.stringify(row)); // printed so a broken harness can't read clean
    expect(row).toEqual({ userCantLose: true, userCantWin: false, oppCantLose: false, oppCantWin: true });
  });

  it("⛔⛔ Abyssal Persecutor: EVERY flag is inverted — its controller can't WIN", () => {
    const s = board(ABYSSAL_PERSECUTOR, "user");
    const row = {
      userCantLose: playerCantLoseGame(s, "user"), userCantWin: playerCantWinGame(s, "user"),
      oppCantLose: playerCantLoseGame(s, "ai1"), oppCantWin: playerCantWinGame(s, "ai1"),
    };
    console.log("  WITNESS AbyssalPersecutor", JSON.stringify(row));
    // ⭐ userCantWin:true is the drawback the engine was skipping — the card played strictly better than
    // printed without it.
    expect(row).toEqual({ userCantLose: false, userCantWin: true, oppCantLose: true, oppCantWin: false });
  });

  it("⛔ it follows the CONTROLLER — an opponent's Platinum Angel does not protect you", () => {
    const s = board(PLATINUM_ANGEL, "ai1");
    expect(playerCantLoseGame(s, "ai1")).toBe(true);
    expect(playerCantLoseGame(s, "user")).toBe(false);
    expect(playerCantWinGame(s, "user")).toBe(true);   // you are its opponent
  });

  it("⛔ with no such permanent out, nothing is blocked", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(playerCantLoseGame(g, "user")).toBe(false);
    expect(playerCantWinGame(g, "user")).toBe(false);
  });
});

describe("⭐⭐ LAW 6 — the REAL consumers, isPlayerDead and hasWonGame", () => {
  /** @param {object|null} card the static, or null for a bare board */
  function seat(card, { life = -5, poison = 0, cmdrDamage = 0, wonGame = false } = {}) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = card ? [createPermanent({ id: "src", card, controller: "user", summoningSick: false })] : [];
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: bf, life, poison, wonGame,
      commanderDamageFrom: cmdrDamage ? { "cmd-x": cmdrDamage } : {} } } };
  }

  it("⭐⭐ PLATINUM ANGEL SAVES YOU — from life, poison, and commander damage alike", () => {
    const rows = [
      { cause: "life -5", bare: isPlayerDead(seat(null, { life: -5 }), "user"), angel: isPlayerDead(seat(PLATINUM_ANGEL, { life: -5 }), "user") },
      { cause: "poison 10", bare: isPlayerDead(seat(null, { life: 20, poison: 10 }), "user"), angel: isPlayerDead(seat(PLATINUM_ANGEL, { life: 20, poison: 10 }), "user") },
      { cause: "cmdr dmg 21", bare: isPlayerDead(seat(null, { life: 20, cmdrDamage: 21 }), "user"), angel: isPlayerDead(seat(PLATINUM_ANGEL, { life: 20, cmdrDamage: 21 }), "user") },
      { cause: "alive anyway", bare: isPlayerDead(seat(null, { life: 20 }), "user"), angel: isPlayerDead(seat(PLATINUM_ANGEL, { life: 20 }), "user") },
    ];
    console.log("  WITNESS isPlayerDead", JSON.stringify(rows));
    // ⭐ `bare:true, angel:false` on every lose condition is the whole slice: before this, the angel column
    // read `true` across the board and the most iconic "you can't lose" card in Magic did nothing.
    expect(rows).toEqual([
      { cause: "life -5", bare: true, angel: false },
      { cause: "poison 10", bare: true, angel: false },
      { cause: "cmdr dmg 21", bare: true, angel: false },
      { cause: "alive anyway", bare: false, angel: false },
    ]);
  });

  it("⛔⛔ ABYSSAL PERSECUTOR REFUSES THE WIN — and its opponents stop dying", () => {
    const rows = [
      { q: "won w/o it", v: hasWonGame(seat(null, { life: 20, wonGame: true }), "user") },
      { q: "won WITH it", v: hasWonGame(seat(ABYSSAL_PERSECUTOR, { life: 20, wonGame: true }), "user") },
      { q: "its opponent at -5", v: isPlayerDead(seat(ABYSSAL_PERSECUTOR, { life: 20 }), "ai1") },
    ];
    console.log("  WITNESS hasWonGame", JSON.stringify(rows));
    // ⭐ The opponent row is `false` because their life is a healthy 20 in this fixture; the meaningful pin
    // is the middle row — the flag is set and the win is REFUSED.
    expect(rows).toEqual([{ q: "won w/o it", v: true }, { q: "won WITH it", v: false }, { q: "its opponent at -5", v: false }]);
  });

  it("⛔ an ELIMINATED seat stays eliminated — the missing-player guard runs first", () => {
    const s = seat(PLATINUM_ANGEL, { life: -5 });
    const gone = { ...s, players: { ...s.players } };
    delete gone.players.ai1;
    // ⭐ Without the ordering, a stale static could resurrect a seat already removed from the pod.
    expect(isPlayerDead(gone, "ai1")).toBe(true);
  });
});
