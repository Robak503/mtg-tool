/**
 * monarch.test.js — THE MONARCH (CR 725): the become-monarch atom + end-step draw + crown steal.
 *
 * Three owners, tested end to end: the effect atom ("you become the monarch" — Palace Sentinels' ETB,
 * Feast of Succession's spell sentence) crowns the program's controller; CR 725.3 draws the monarch a
 * card at the beginning of THEIR end step only; CR 725.4 passes the crown when a creature deals combat
 * damage to the monarch. No monarch until an effect crowns someone (every hook no-ops); exactly one
 * monarch thereafter by construction (a single state field).
 *
 * CREED parks pinned: the targeted form ("target player becomes the monarch" — Denethor) and rider
 * carriers (Regal Behemoth's while-monarch mana rider, Custodi Lich's crown-trigger sacrifice) stay
 * body-only.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { becomeMonarch, applyMonarchEndStepDraw, applyMonarchCombatSteal, monarchClauseParser } from "./effects/atoms/monarch.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SENTINELS = { name: "Palace Sentinels", type: "Creature — Human Soldier", power: 2, toughness: 4, oracle: "When this creature enters, you become the monarch." };

describe("MONARCH — recognition", () => {
  it("the clause parses to the atom; the ETB creatures + the clean spell flip native", () => {
    expect(monarchClauseParser("you become the monarch")).toEqual({ op: "become-monarch", targetType: null });
    const p = parseEffectClause("you become the monarch", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(classifyCard(SENTINELS)).toBe("native-trigger");
    expect(classifyCard({ name: "Feast of Succession", type: "Sorcery", oracle: "All creatures get -4/-4 until end of turn.\nYou become the monarch." })).toBe("native-spell");
  });
  it("CREED: the targeted crown form and a still-unmodeled monarch rider stay body-only", () => {
    expect(monarchClauseParser("target player becomes the monarch")).toBeNull();
    // (Custodi Lich GRADUATED to native-trigger — its becomes-monarch edict is modeled now
    // (monarchBecomes.test.js); Regal Behemoth GRADUATED to native-mixed — its while-monarch any-color
    // tap-augment is modeled now (regalBehemoth.test.js).) Queen Marchesa's "if you're NOT the monarch"
    // upkeep-token conditional is still unmodeled, so it holds the body-only seat here.
    expect(classifyCard({ name: "Queen Marchesa", type: "Legendary Creature — Human Assassin", oracle: "Deathtouch, haste\nWhen Queen Marchesa enters, you become the monarch.\nAt the beginning of your upkeep, if you're not the monarch, create a 1/1 black Assassin creature token with deathtouch and haste." })).toBe("body-only");
  });
});

describe("MONARCH — runtime (CR 725)", () => {
  const BASE = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user" });

  it("the ETB trigger crowns the controller (fired through the real flush)", () => {
    const sent = createPermanent({ id: "sent", card: SENTINELS, controller: "user" });
    const base = BASE();
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: [sent] } } };
    s = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, sent)));
    expect(s.monarchId).toBe("user");
  });

  it("CR 725.3: the monarch draws at THEIR end step only; no monarch → no draw", () => {
    const base = BASE();
    const lib = [{ id: "l1", name: "A", type: "Instant" }, { id: "l2", name: "B", type: "Instant" }];
    let s = { ...base, players: { ...base.players, user: { ...base.players.user, library: lib, hand: [] } } };
    expect(applyMonarchEndStepDraw(s).players.user.hand).toHaveLength(0);          // no monarch → no-op
    s = becomeMonarch(s, "user");
    expect(applyMonarchEndStepDraw(s).players.user.hand).toHaveLength(1);          // monarch's own end step → draw
    const offTurn = { ...s, activePlayer: "ai" };
    expect(applyMonarchEndStepDraw(offTurn).players.user.hand).toHaveLength(0);    // an OPPONENT's end step → no draw
  });

  it("CR 725.4: combat damage to the monarch steals the crown; a no-damage event does not", () => {
    let s = becomeMonarch(BASE(), "user");
    s = applyMonarchCombatSteal(s, [{ kind: "combat-damage-player", attackerId: "x", attackingPlayer: "ai", defender: "user", amount: 3 }]);
    expect(s.monarchId).toBe("ai");
    const untouched = applyMonarchCombatSteal(s, [{ kind: "combat-damage-player", attackerId: "y", attackingPlayer: "user", defender: "ai", amount: 0 }]);
    expect(untouched.monarchId).toBe("ai"); // zero damage never steals
    const nonMonarchHit = applyMonarchCombatSteal(s, [{ kind: "combat-damage-player", attackerId: "y", attackingPlayer: "user", defender: "someoneElse", amount: 4 }]);
    expect(nonMonarchHit.monarchId).toBe("ai"); // damage to a NON-monarch never steals
  });

  it("idempotent crown: re-crowning the sitting monarch adds no event", () => {
    let s = becomeMonarch(BASE(), "user");
    const logLen = (s.log || []).length;
    s = becomeMonarch(s, "user");
    expect((s.log || []).length).toBe(logLen);
  });
});
