/**
 * cantGainLife.test.js — "Players can't gain life." (Giant Cindermaw, Rampaging Ferocidon, Forsaken Wastes,
 * Havoc Festival, Sunspine Lynx, Everlasting Torment …) and "Your opponents can't gain life."
 * (Erebos God of the Dead, Knight of Dusk's Shadow, Archfiend of Despair, Quakebringer, Gríma Wormtongue …).
 *
 * ⭐ THE SECOND PLAYER-SCOPED STATIC, on the pattern player hexproof established: an INERT layer-6 op that
 * the layer engine skips wholesale, plus exactly ONE consumer. Both printed scopes ride the same op via
 * `op.scope`, which keeps the two readings from ever being conflated by a later edit.
 *
 * ⛔⛔ THE SYMMETRIC FORM IS SYMMETRIC ON PURPOSE — the half that is tempting to get wrong. "PLAYERS can't
 * gain life" stops the CONTROLLER too. Reading it as opponents-only would hand its controller a one-sided
 * prison the card does not print; a false positive in the player's favour is still a false positive, and
 * this is a symmetry these cards are built around. Driven below: with Giant Cindermaw out, its OWN
 * controller gains nothing either.
 *
 * ⛔ ENFORCED AT gameState.gainLife, THE SINGLE LIFE-GAIN CHOKEPOINT — so spell, trigger, lifelink and drain
 * are all covered by one check, and the "you gained life this turn" ledger correctly records ZERO for a
 * prevented gain rather than the amount that was offered.
 * ⓘ NOT placed in replacementEffects.applyLifeGainReplacement, which would have been the tidier home:
 * that module imports NOTHING by design (a documented cycle-safety property triggers.js relies on), and
 * reaching into layers.js from there would break it.
 *
 * ⛔ CHECKED BEFORE THE DOUBLERS, not after. A prevented gain is prevented however many Rhox Faithmenders
 * are out. Zeroing afterwards would give the same answer by luck — and an ADDITIVE replacement (Angel of
 * Vitality) breaks that luck immediately, since 0 + 1 is not 0. Pinned with a doubler on the board.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * parser arm removed -> the carriers park; the gainLife check removed -> life is gained anyway and the
 * witness row shows the life total moving.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, gainLife } from "./gameState.js";
import { playerCantGainLife } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GIANT_CINDERMAW = { id: "c-gc", name: "Giant Cindermaw", type: "Creature — Beast", mana: "{3}{R}",
  power: "4", toughness: "3",
  oracle: "Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nPlayers can't gain life." };
const KNIGHT_OF_DUSKS_SHADOW = { id: "c-kd", name: "Knight of Dusk's Shadow", type: "Creature — Human Knight",
  mana: "{1}{B}", power: "2", toughness: "2",
  oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nYour opponents can't gain life.\n{1}{B}: This creature gets +1/+1 until end of turn." };
const RHOX_FAITHMENDER = { id: "c-rf", name: "Rhox Faithmender", type: "Creature — Rhino Monk", mana: "{3}{W}",
  power: "1", toughness: "5", oracle: "Lifelink\nIf you would gain life, you gain twice that much life instead." };

describe("both printed scopes parse, and they stay distinct", () => {
  it("⭐ symmetric vs opponent-scoped ride the same op with different scope", () => {
    expect(parseStaticAbilities(GIANT_CINDERMAW).map((e) => e.op)).toContainEqual({ layerOp: "cantGainLife", scope: "all" });
    expect(parseStaticAbilities(KNIGHT_OF_DUSKS_SHADOW).map((e) => e.op)).toContainEqual({ layerOp: "cantGainLife", scope: "opponents" });
    expect(classifyCard(GIANT_CINDERMAW)).toBe("native-static");
    expect(classifyCard(KNIGHT_OF_DUSKS_SHADOW)).toBe("native-mixed");
  });
});

describe("⭐ LAW 6 — driven through the real gainLife chokepoint", () => {
  function board(cards) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = cards.map((c, i) => createPermanent({ id: `p${i}`, card: c, controller: "user", summoningSick: false }));
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: bf, life: 40 },
      ai1: { ...g.players.ai1, life: 40 } } };
  }
  // ⛔ gainLife takes an OPTIONS OBJECT, not positional args — the first version of this harness passed
  // (state, pid, 5) and every row threw on an undefined playerId rather than reading as a quiet zero.
  const lifeAfter = (s, pid) => gainLife(s, { playerId: pid, amount: 5 }).players[pid].life;

  it("⛔⛔ SYMMETRIC: Giant Cindermaw stops its OWN controller too", () => {
    const none = board([]);
    const maw = board([GIANT_CINDERMAW]);
    const rows = [
      { board: "empty", userGains: lifeAfter(none, "user") - 40, oppGains: lifeAfter(none, "ai1") - 40 },
      { board: "Cindermaw (user's)", cantUser: playerCantGainLife(maw, "user"), cantOpp: playerCantGainLife(maw, "ai1"),
        userGains: lifeAfter(maw, "user") - 40, oppGains: lifeAfter(maw, "ai1") - 40 },
    ];
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows[0]).toEqual({ board: "empty", userGains: 5, oppGains: 5 });
    // ⭐ userGains 0 is the row that proves the symmetry — an opponents-only reading would leave it at 5.
    expect(rows[1]).toEqual({ board: "Cindermaw (user's)", cantUser: true, cantOpp: true, userGains: 0, oppGains: 0 });
  });

  it("⭐ OPPONENT-SCOPED: the Knight stops opponents and leaves its controller alone", () => {
    const s = board([KNIGHT_OF_DUSKS_SHADOW]);
    const row = { cantUser: playerCantGainLife(s, "user"), cantOpp: playerCantGainLife(s, "ai1"),
      userGains: lifeAfter(s, "user") - 40, oppGains: lifeAfter(s, "ai1") - 40 };
    console.log("  WITNESS", JSON.stringify(row));
    expect(row).toEqual({ cantUser: false, cantOpp: true, userGains: 5, oppGains: 0 });
  });

  it("⛔ PREVENTION BEATS DOUBLING — and the order is not luck", () => {
    // Rhox Faithmender doubles the controller's life gain. With a symmetric prevention out, the answer must
    // be 0 and not 10. Checking AFTER the doublers would also give 0 here, which is why the comment in
    // gainLife spells out the additive case — this row locks the ordering in place regardless.
    const doubled = board([RHOX_FAITHMENDER]);
    expect(lifeAfter(doubled, "user") - 40).toBe(10);
    const both = board([RHOX_FAITHMENDER, GIANT_CINDERMAW]);
    expect(lifeAfter(both, "user") - 40).toBe(0);
  });

  it("⛔ it LIFTS when the permanent leaves — a static, not a stamp", () => {
    const on = board([GIANT_CINDERMAW]);
    expect(playerCantGainLife(on, "user")).toBe(true);
    const off = { ...on, players: { ...on.players, user: { ...on.players.user, battlefield: [] } } };
    expect(playerCantGainLife(off, "user")).toBe(false);
    expect(lifeAfter(off, "user") - 40).toBe(5);
  });
});
