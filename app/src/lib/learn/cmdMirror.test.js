/**
 * CMD-MIRROR (CR 903.10a) — per-SEAT commander instance keying (overhaul pass).
 * Two seats running the SAME commander card must track 21-rule damage SEPARATELY —
 * self-play pads pods by wrapping the deck list, so mirrors are routine, and the
 * old card-id keying summed 11+10 across two mirror commanders into one false
 * 21-rule death (probe-confirmed; corrupted self-play outcome labels).
 * Back-compat: an UNSTAMPED isCommander card keys by card.id — the entire
 * pre-existing cmdDamage/cmdPartner suite is the regression gate for that.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { createLearnSession, advanceUntilDecision, _forceLifeForTests, isPlayerDead } from "./learnSession.js";
import { tableSnapshot } from "./tableSnapshot.js";

beforeEach(() => _resetIdsForTests());

const KOMA = { id: "cmd-koma-Koma", name: "Koma, Cosmos Serpent", type: "Legendary Creature — Serpent", power: 6, toughness: 6, oracle: "", mana: "{3}{G}{G}{U}{U}" };
function deck(prefix) {
  const out = [];
  // 60 cards — deep enough that no seat DECKS OUT mid-walk (CR 104.3c is real as of 2026-08-14; the
  // old 20-card fixture survived only because empty draws were silently smaller draws back then).
  for (let i = 0; i < 60; i++) out.push({ id: prefix + "-f-" + i, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
  return out;
}

describe("commanderInstanceId stamping at seat build", () => {
  it("stamps a DISTINCT per-seat instance id on the SAME commander card (mirror pod)", () => {
    const s = createGameState({
      mode: "commander",
      userDeck: deck("u"), opponentDecks: [deck("a"), deck("b"), deck("c")],
      userCommanders: [{ ...KOMA }],
      opponentCommanders: [[{ ...KOMA }], [{ ...KOMA }], []],
    });
    expect(s.players.user.command[0].commanderInstanceId).toBe("user::cmd-koma-Koma");
    expect(s.players.ai1.command[0].commanderInstanceId).toBe("ai1::cmd-koma-Koma");
    expect(s.players.ai2.command[0].commanderInstanceId).toBe("ai2::cmd-koma-Koma");
    expect(s.players.user.command[0].isCommander).toBe(true); // the designation still rides
  });

  it("standard (1v1) seats are stamped too", () => {
    const s = createGameState({ userDeck: deck("u"), aiDeck: deck("a"), userCommanders: [{ ...KOMA }], aiCommanders: [{ ...KOMA }] });
    expect(s.players.user.command[0].commanderInstanceId).toBe("user::cmd-koma-Koma");
    expect(s.players.ai.command[0].commanderInstanceId).toBe("ai::cmd-koma-Koma");
  });
});

function stampedCmdr(name, seat, power) {
  return createPermanent({
    card: { id: name + "-card", name, power, toughness: power, type_line: "Legendary Creature — Avatar", isCommander: true, commanderInstanceId: seat + "::" + name + "-card", oracle: "" },
    controller: seat,
  });
}

describe("21-rule tracking in a same-commander MIRROR (CR 903.10a)", () => {
  it("an 11+10 split across two mirror commanders is NOT a death; 21+ from ONE is", () => {
    const a1 = stampedCmdr("Koma", "ai1", 11);
    const a2 = stampedCmdr("Koma", "ai2", 10);
    const base = {
      turn: 3, log: [], mode: "commander",
      players: {
        user: { life: 60, battlefield: [], graveyard: [], commanderDamageFrom: {} },
        ai1: { life: 40, battlefield: [a1], graveyard: [], commanderDamageFrom: {} },
        ai2: { life: 40, battlefield: [a2], graveyard: [], commanderDamageFrom: {} },
      },
      combat: {
        attackers: [
          { permanentId: a1.id, attackingPlayer: "ai1", defender: "user" },
          { permanentId: a2.id, attackingPlayer: "ai2", defender: "user" },
        ],
        blockers: [],
      },
    };
    const out = resolveCombatDamage(base);
    expect(out.players.user.commanderDamageFrom).toEqual({ "ai1::Koma-card": 11, "ai2::Koma-card": 10 });
    expect(isPlayerDead(out, "user")).toBe(false); // the OLD keying summed to 21 here — a false death

    // A second hit from ai1's instance crosses 21 for that SINGLE commander (903.10a).
    const again = resolveCombatDamage({
      ...out,
      combat: { attackers: [{ permanentId: a1.id, attackingPlayer: "ai1", defender: "user" }], blockers: [] },
    });
    expect(again.players.user.commanderDamageFrom["ai1::Koma-card"]).toBe(22);
    expect(isPlayerDead(again, "user")).toBe(true);
  });
});

describe("elimination strips ONLY the departed seat instance keys (CR 800.4a)", () => {
  it("a live mirror twin keeps its accumulated damage when the other twin is eliminated", () => {
    let session = createLearnSession({
      userDeck: deck("u"), opponentDecks: [deck("a"), deck("b"), deck("c")],
      mode: "commander", difficulty: "expert",
    });
    const cmdCard = (seat) => ({ id: "X", name: "Koma, Cosmos Serpent", type: "Legendary Creature — Serpent", isCommander: true, commanderInstanceId: seat + "::X" });
    session = {
      ...session,
      state: {
        ...session.state,
        players: {
          ...session.state.players,
          user: { ...session.state.players.user, commanderDamageFrom: { "ai1::X": 15, "ai2::X": 9 } },
          ai1: { ...session.state.players.ai1, command: [cmdCard("ai1")] },
          ai2: { ...session.state.players.ai2, command: [cmdCard("ai2")] },
        },
      },
    };
    session = _forceLifeForTests(session, "ai1", 0);
    const { session: after } = advanceUntilDecision(session);
    expect(after.state.players.ai1).toBeUndefined();                     // ai1 eliminated
    const dmg = after.state.players.user.commanderDamageFrom;
    expect(dmg["ai1::X"]).toBeUndefined();                               // departed instance stripped
    expect(dmg["ai2::X"]).toBe(9);                                       // the LIVE twin survives
  });
});

describe("mirror display disambiguation (tableSnapshot)", () => {
  it("same-named live commanders get seat-suffixed labels; distinct values survive", () => {
    const cmd = (seat) => ({ id: "X", name: "Koma, Cosmos Serpent", isCommander: true, commanderInstanceId: seat + "::X" });
    const state = {
      turnOrder: ["user", "ai1", "ai2"], activePlayer: "user",
      players: {
        user: { life: 40, hand: [], battlefield: [], graveyard: [], commanderDamageFrom: { "ai1::X": 7, "ai2::X": 9 } },
        ai1: { life: 40, hand: [], battlefield: [], graveyard: [], exile: [], command: [cmd("ai1")], commanderDamageFrom: {} },
        ai2: { life: 40, hand: [], battlefield: [], graveyard: [], exile: [], command: [cmd("ai2")], commanderDamageFrom: {} },
      },
    };
    const user = tableSnapshot(state).find((r) => r.id === "user");
    expect(user.commanderDamage).toEqual({ "Koma, Cosmos Serpent (ai1)": 7, "Koma, Cosmos Serpent (ai2)": 9 });
  });

  it("a NON-mirror board keeps the bare-name labels (byte-identical to before)", () => {
    const state = {
      turnOrder: ["user", "ai1"], activePlayer: "user",
      players: {
        user: { life: 40, hand: [], battlefield: [], graveyard: [], commanderDamageFrom: { "ai1::X": 7 } },
        ai1: { life: 40, hand: [], battlefield: [], graveyard: [], exile: [], command: [{ id: "X", name: "Koma, Cosmos Serpent", isCommander: true, commanderInstanceId: "ai1::X" }], commanderDamageFrom: {} },
      },
    };
    const user = tableSnapshot(state).find((r) => r.id === "user");
    expect(user.commanderDamage).toEqual({ "Koma, Cosmos Serpent": 7 });
  });
});
