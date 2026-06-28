/**
 * groupActivatedGrant.test.js — GROUP-GRANT activated abilities (queue 1).
 *
 * A lord's "All Slivers have \"{2}: Regenerate this permanent.\"" (Clot Sliver) / "\"{2}, Sacrifice this
 * permanent: Draw a card.\"" (Mnemonic) / "\"Sacrifice this permanent: You gain 3 life.\"" (Darkheart) now
 * (a) classifies native-static and (b) is actually ACTIVATABLE on EVERY affected permanent — the grant is
 * emitted as a layer-6 addAbility (kind "activated", carrying the quoted text) with the group selector;
 * legalChoices reads it via layers.grantedActivatedQuotedFor and parses it through the SAME
 * parseActivatedAbilities a printed ability uses, so cost/effect/binding are identical and bound to the
 * RECIPIENT (not the granter).
 *
 * CREED boundaries proven here:
 *  - the quoted body must be FULLY MODELED — a TARGETED / X-scaling body (Telekinetic "{T}: Tap target
 *    permanent", Crypt "Regenerate target Sliver", Magma's X-pump) stays body-only → Arbiter (safe FN);
 *  - the selector scopes correctly — a non-matching permanent (a Bear under an "All Slivers" grant) does
 *    NOT gain the ability;
 *  - "this permanent" / the {T}/sacrifice COST bind to the recipient: regenerate shields the recipient (not
 *    the granter), and the sacrifice cost sacrifices the recipient.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const sliver = (name, oracle, pt = [1, 1]) => ({ name, type: "Creature — Sliver", power: pt[0], toughness: pt[1], oracle });

// A board with a GRANTER Sliver (carries the "All Slivers have …" static), a plain RECIPIENT Sliver (no own
// text), and a non-Sliver Bear (must NOT gain the grant). `lib` seeds the user's library so draw works.
function board(granterOracle, { recipPT = [2, 2], lib = [], pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } = {}) {
  const granter = createPermanent({ id: "granter", card: sliver("Granter Sliver", granterOracle), controller: "user" });
  const recip = createPermanent({ id: "recip", card: sliver("Plain Sliver", "", recipPT), controller: "user" });
  const bear = createPermanent({ id: "bear", card: { name: "Grizzly Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [granter, recip, bear], library: lib, manaPool: pool } },
  };
}
const acts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");

describe("GROUP-ACTIVATED grant (queue 1) — recognition", () => {
  it("a clean self-bound modeled body → native-static", () => {
    expect(classifyCard(sliver("Clot Sliver", 'All Slivers have "{2}: Regenerate this permanent."'))).toBe("native-static");
    expect(classifyCard(sliver("Mnemonic Sliver", 'All Slivers have "{2}, Sacrifice this permanent: Draw a card."'))).toBe("native-static");
    expect(classifyCard(sliver("Darkheart Sliver", 'All Slivers have "Sacrifice this permanent: You gain 3 life."'))).toBe("native-static");
    // "Sliver creatures you control have …" selector form
    expect(classifyCard(sliver("Variant", 'Sliver creatures you control have "{B}: Regenerate this permanent."'))).toBe("native-static");
  });
  it("FN boundary — a TARGETED / X-scaling / triggered body stays Arbiter (body-only, CREED)", () => {
    expect(classifyCard(sliver("Telekinetic Sliver", 'All Slivers have "{T}: Tap target permanent."'))).toBe("body-only");
    expect(classifyCard(sliver("Crypt Sliver", 'All Slivers have "{T}: Regenerate target Sliver."'))).toBe("body-only");
    expect(classifyCard(sliver("Magma Sliver", 'All Slivers have "{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the number of Slivers on the battlefield."'))).toBe("body-only");
    // a GROUP-granted TRIGGERED body is deferred (group-triggered = a later slice)
    expect(classifyCard(sliver("Tempered Sliver", 'Sliver creatures you control have "Whenever this creature deals combat damage to a player, put a +1/+1 counter on it."'))).toBe("body-only");
  });
});

describe("GROUP-ACTIVATED grant (queue 1) — runtime enumeration + selector scope", () => {
  it("the ability is offered on EVERY affected Sliver (granter + recipient), NOT on a non-Sliver", () => {
    const s = board('All Slivers have "{2}: Regenerate this permanent."');
    const ids = acts(s).map((a) => a.permanentId).sort();
    expect(ids).toContain("granter");
    expect(ids).toContain("recip");
    expect(ids).not.toContain("bear");          // selector scope — a Bear gains nothing
  });
});

describe("GROUP-ACTIVATED grant (queue 1) — 'this permanent' / cost bind to the RECIPIENT", () => {
  it("regenerate ({2}) shields the RECIPIENT, not the granter", () => {
    const s = board('All Slivers have "{2}: Regenerate this permanent."', { pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } });
    const onRecip = acts(s).find((a) => a.permanentId === "recip");
    expect(onRecip).toBeTruthy();
    let d = dispatchAction(s, onRecip);
    d = resolveTopOfStack(d);
    const recip = d.players.user.battlefield.find((p) => p.id === "recip");
    const granter = d.players.user.battlefield.find((p) => p.id === "granter");
    expect((recip.regenShields || 0)).toBeGreaterThan(0);   // the RECIPIENT is shielded
    expect((granter.regenShields || 0)).toBe(0);            // the granter is untouched
  });

  it("sacrifice cost ({2}, Sacrifice this permanent: Draw a card) sacrifices the RECIPIENT + draws", () => {
    const s = board('All Slivers have "{2}, Sacrifice this permanent: Draw a card."', { lib: [{ name: "Top", type: "Instant", oracle: "" }], pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } });
    const onRecip = acts(s).find((a) => a.permanentId === "recip");
    expect(onRecip).toBeTruthy();
    const hand0 = s.players.user.hand.length;
    let d = dispatchAction(s, onRecip);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "recip")).toBeUndefined();  // recipient sacrificed
    expect(d.players.user.battlefield.find((p) => p.id === "granter")).toBeTruthy();   // granter still alive
    expect(d.players.user.hand.length).toBe(hand0 + 1);                                 // drew a card
  });

  it("sacrifice cost (Sacrifice this permanent: You gain 3 life) sacrifices the RECIPIENT + gains life", () => {
    const s = board('All Slivers have "Sacrifice this permanent: You gain 3 life."', { pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } });
    const onRecip = acts(s).find((a) => a.permanentId === "recip");
    expect(onRecip).toBeTruthy();
    const life0 = s.players.user.life;
    let d = dispatchAction(s, onRecip);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "recip")).toBeUndefined();  // recipient sacrificed
    expect(d.players.user.life).toBe(life0 + 3);                                        // controller gained 3
  });

  it("TARGETED body (Acidic Sliver: deals 2 damage to any target) — the RECIPIENT is the source + is sacrificed, target dies", () => {
    // proves the targeted runtime is NOT a hollow flip: targets enumerate, "this permanent deals damage"
    // binds the source to the recipient, and the sacrifice cost sacrifices the recipient.
    const s = board('All Slivers have "{2}, Sacrifice this permanent: This permanent deals 2 damage to any target."', { pool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } });
    const enemy = createPermanent({ id: "enemy", card: { name: "Enemy", type: "Creature — Goblin", power: 2, toughness: 2, oracle: "" }, controller: "ai", summoningSick: false });
    s.players.ai.battlefield = [enemy];
    const atEnemy = acts(s).find((a) => a.permanentId === "recip" && a.targets?.some((t) => t.id === "enemy"));
    expect(atEnemy).toBeTruthy();
    let d = dispatchAction(s, atEnemy);
    d = resolveTopOfStack(d);
    expect(d.players.ai.battlefield.find((p) => p.id === "enemy")).toBeUndefined();     // 2/2 took 2 → dead
    expect(d.players.user.battlefield.find((p) => p.id === "recip")).toBeUndefined();   // recipient sacrificed (cost)
  });
});

describe("GROUP-ACTIVATED grant (queue 1) — non-Sliver selectors (the grant generalizes)", () => {
  it("'White creatures you control have …' confers to a White creature, not to others", () => {
    const granter = createPermanent({ id: "granter", card: { name: "Resplendent Mentor", type: "Creature — Bird Cleric", power: 2, toughness: 2, oracle: 'White creatures you control have "{T}: You gain 1 life."', colors: ["W"] }, controller: "user" });
    const white = createPermanent({ id: "white", card: { name: "White One", type: "Creature — Human", power: 1, toughness: 1, oracle: "", colors: ["W"] }, controller: "user", summoningSick: false });
    const red = createPermanent({ id: "red", card: { name: "Red One", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "", colors: ["R"] }, controller: "user", summoningSick: false });
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", players: { ...base.players, user: { ...base.players.user, battlefield: [granter, white, red], manaPool: {} } } };
    const ids = acts(s).map((a) => a.permanentId);
    expect(ids).toContain("white");
    expect(ids).not.toContain("red");        // a non-White creature gains nothing
    expect(classifyCard({ name: "Resplendent Mentor", type: "Creature — Bird Cleric", oracle: 'White creatures you control have "{T}: You gain 1 life."' })).toBe("native-static");
  });
});
