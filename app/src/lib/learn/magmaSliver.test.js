/**
 * magmaSliver.test.js — GROUP-GRANT count-scaled subtype-target pump (Magma Sliver).
 *
 * Magma Sliver: "All Slivers have \"{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the
 * number of Slivers on the battlefield.\"" — a Sliver-wide granted ACTIVATED firebreathing whose magnitude is
 * a board-count (all seats) of Slivers. This closes the PARK the group-activated slice noted (its quoted body
 * was the one unmodeled shape blocking the flip): the effect is now a subtype-restricted TARGET pump whose
 * +X/+0 scales off the new `subtypeOnBattlefield` count kind (parseCountSource + countForSpec), applied
 * ASYMMETRICALLY to power only via applyPumpEffect's ptDeltaCountSlot.
 *
 * Proven here (the four gates the mechanic needs to be a HONEST flip, not a hollow claim):
 *  - classify: Magma Sliver → native-static (the quoted body is now a modeled activated ability);
 *  - enumeration: the granted {T} ability is offered on EVERY Sliver, targeting ONLY Slivers (not the Bear);
 *  - runtime: activating it pumps the chosen Sliver's POWER by the live count of Slivers on the battlefield
 *    (all seats, changelings included), toughness UNCHANGED (+X/+0), until end of turn;
 *  - CREED near-miss: an X-pump over an UNMODELED count source stays body-only (safe FN → Arbiter).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MAGMA = 'All Slivers have "{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the number of Slivers on the battlefield."';
const sliver = (name, oracle = "", pt = [1, 1]) => ({ name, type: "Creature — Sliver", power: pt[0], toughness: pt[1], oracle });
const acts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");

// A board: the Magma granter Sliver (un-sick so its {T} is payable), a plain recipient Sliver, a non-Sliver
// Bear (must NOT gain the grant / be targetable), and an OPPONENT Sliver (counts toward the all-seats board
// count, so X sees 3 Slivers total). Everything un-summoning-sick so {T} works and the pump can be measured.
function board() {
  const granter = createPermanent({ id: "granter", card: sliver("Magma Sliver", MAGMA, [1, 1]), controller: "user", summoningSick: false });
  const recip = createPermanent({ id: "recip", card: sliver("Plain Sliver", "", [2, 2]), controller: "user", summoningSick: false });
  const bear = createPermanent({ id: "bear", card: { name: "Grizzly Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const oppSliver = createPermanent({ id: "opp", card: sliver("Enemy Sliver", "", [1, 1]), controller: "ai", summoningSick: false });
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...base.players,
      user: { ...base.players.user, battlefield: [granter, recip, bear], manaPool: {} },
      ai: { ...base.players.ai, battlefield: [oppSliver], manaPool: {} },
    },
  };
}

describe("Magma Sliver — recognition (native flip)", () => {
  it("classifies native-static (the granted count-scaled subtype-target pump is modeled)", () => {
    expect(classifyCard(sliver("Magma Sliver", MAGMA))).toBe("native-static");
  });
});

describe("Magma Sliver — runtime enumeration + subtype-restricted targeting", () => {
  it("offers the {T} ability on EVERY controlled Sliver, NOT the Bear", () => {
    const s = board();
    const ids = [...new Set(acts(s).map((a) => a.permanentId))].sort();
    expect(ids).toContain("granter");
    expect(ids).toContain("recip");
    expect(ids).not.toContain("bear");   // a non-Sliver gains nothing (selector scope)
  });

  it("the target set is ONLY Slivers (granter, recipient, the opponent's Sliver) — never the Bear", () => {
    const s = board();
    const targets = [...new Set(acts(s).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
    expect(targets).toContain("recip");
    expect(targets).toContain("granter");
    expect(targets).toContain("opp");    // an opponent's Sliver IS a legal "target Sliver creature" (CR: any battlefield)
    expect(targets).not.toContain("bear");
  });
});

describe("Magma Sliver — runtime pump (+X/+0, X = Slivers on the battlefield, all seats)", () => {
  it("pumps the target Sliver's POWER by the board count of Slivers (3), toughness UNCHANGED", () => {
    const s = board(); // 3 Slivers on the battlefield: granter (user), recip (user), opp (ai)
    const act = acts(s).find((a) => a.permanentId === "granter" && a.targets?.some((t) => t.id === "recip"));
    expect(act).toBeTruthy();
    let d = dispatchAction(s, act);
    d = resolveTopOfStack(d);
    const recip = d.players.user.battlefield.find((p) => p.id === "recip");
    // Plain Sliver is a printed 2/2; +X/+0 with X=3 → 5/2 (power +3, toughness unchanged).
    expect(creaturePower(recip, d)).toBe(5);
    expect(creatureToughness(recip, d)).toBe(2);
    expect(d.players.user.battlefield.find((p) => p.id === "granter").tapped).toBe(true); // the {T} cost tapped the activator
  });

  it("X tracks the LIVE count — a fourth Sliver on the board pumps power by 4", () => {
    const s = board();
    const extra = createPermanent({ id: "extra", card: sliver("Fourth Sliver", "", [0, 3]), controller: "user", summoningSick: false });
    s.players.user.battlefield = [...s.players.user.battlefield, extra]; // now 4 Slivers on the battlefield
    const act = acts(s).find((a) => a.permanentId === "granter" && a.targets?.some((t) => t.id === "extra"));
    expect(act).toBeTruthy();
    let d = dispatchAction(s, act);
    d = resolveTopOfStack(d);
    const extraLive = d.players.user.battlefield.find((p) => p.id === "extra");
    expect(creaturePower(extraLive, d)).toBe(4);   // 0 base + 4
    expect(creatureToughness(extraLive, d)).toBe(3); // unchanged (+X/+0)
  });
});

describe("Magma Sliver — CREED near-miss (unmodeled count source stays parked)", () => {
  it("an X-pump over 'creatures on the battlefield' (no count kind) stays body-only → Arbiter", () => {
    // Only the CURATED subtype-on-battlefield count is modeled. A bare card-type board count has no count kind,
    // so the quoted body parses unmodeled → NO grant descriptor → the whole card stays body-only (safe FN).
    const fake = 'All Slivers have "{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the number of creatures on the battlefield."';
    expect(classifyCard(sliver("Fake Magma", fake))).toBe("body-only");
  });

  it("an X-pump targeting a NON-curated subtype stays body-only → Arbiter", () => {
    // "target Wurm creature" — Wurm is not in TARGET_SUBTYPES, so the subtype-target matcher rejects it → the
    // body is unmodeled → body-only. (Guards against a target-anything FP on an un-enforced subtype filter.)
    const fake = 'All Slivers have "{T}: Target Wurm creature gets +X/+0 until end of turn, where X is the number of Slivers on the battlefield."';
    expect(classifyCard(sliver("Wurm Magma", fake))).toBe("body-only");
  });
});
