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
 *  - the quoted body must be FULLY MODELED — a still-unmodeled body (Telekinetic "{T}: Tap target
 *    permanent", Magma's X-scaling pump) stays body-only → Arbiter (safe FN);
 *  - SUBTYPE-REGEN (added later): a SUBTYPE-targeted regenerate IS modeled — Crypt "{T}: Regenerate target
 *    Sliver" + Poultice "{2}, {T}: …" now flip native-static; the granted ability offers ONLY Slivers as
 *    targets (the subtype restriction) and regenerates the chosen one;
 *  - SELF-PERMANENT-BOUNCE (added later): Hibernation "Pay 2 life: Return this permanent to its owner's
 *    hand" flips native-static — the Pay-N-life cost + the "this permanent" self-bounce both model, and the
 *    bounce returns the RECIPIENT to hand;
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
  it("SUBTYPE-REGEN / SELF-PERMANENT-BOUNCE — a modeled SUBTYPE-targeted regen / pay-life self-bounce → native-static", () => {
    // Crypt / Poultice: "{T}: Regenerate target Sliver" — a SUBTYPE-restricted target IS modeled (offers only
    // Slivers; regenerates the chosen one). Hibernation: "Pay 2 life: Return this permanent to its owner's hand".
    expect(classifyCard(sliver("Crypt Sliver", 'All Slivers have "{T}: Regenerate target Sliver."'))).toBe("native-static");
    expect(classifyCard(sliver("Poultice Sliver", 'All Slivers have "{2}, {T}: Regenerate target Sliver."'))).toBe("native-static");
    expect(classifyCard(sliver("Hibernation Sliver", 'All Slivers have "Pay 2 life: Return this permanent to its owner\'s hand."'))).toBe("native-static");
  });
  it("FN boundary — a still-unmodeled TARGETED / X-scaling / triggered body stays Arbiter (body-only, CREED)", () => {
    // A tutor body stays body-only. (Telekinetic Sliver's "{T}: Tap target permanent" now flips native-static —
    // tap-target-permanent is modeled — so it's no longer the boundary; an unparseable tutor body is.)
    expect(classifyCard(sliver("Tutor Sliver", 'All Slivers have "{T}: Search your library for a card, then shuffle."'))).toBe("body-only");
    // Magma stays body-only — an X-scaling pump ("+X/+0 where X = the number of Slivers") is NOT modeled (PARK).
    expect(classifyCard(sliver("Magma Sliver", 'All Slivers have "{T}: Target Sliver creature gets +X/+0 until end of turn, where X is the number of Slivers on the battlefield."'))).toBe("body-only");
    // a GROUP-granted TRIGGERED body whose EFFECT does not route natively (reanimate-on-death) stays body-only
    // (the Tempered Sliver combat-damage→+1/+1-counter body IS modeled now — see groupTriggeredGrant.test.js).
    expect(classifyCard(sliver("Test Reanimator Sliver", 'Sliver creatures you control have "When this creature dies, return it to the battlefield under your control."'))).toBe("body-only");
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

describe("GROUP-ACTIVATED grant — SUBTYPE-REGEN (Crypt Sliver: {T}: Regenerate target Sliver)", () => {
  // un-summoning-sick every battlefield permanent so the {T} cost is payable (the board() helper defaults
  // creatures to summoningSick).
  const wake = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, summoningSick: false })) } } });

  it("offers the regen ONLY targeting Slivers — never the non-Sliver Bear", () => {
    const s = wake(board('All Slivers have "{T}: Regenerate target Sliver."'));
    const a = acts(s);
    const targets = [...new Set(a.flatMap((x) => (x.targets || []).map((t) => t.id)))].sort();
    expect(targets).toContain("granter");
    expect(targets).toContain("recip");
    expect(targets).not.toContain("bear");   // the SUBTYPE restriction excludes the Bear from the target set
  });

  it("a Sliver taps ({T}) to regenerate a TARGET Sliver (the granter shields the recipient)", () => {
    const s = wake(board('All Slivers have "{T}: Regenerate target Sliver."'));
    const act = acts(s).find((x) => x.permanentId === "granter" && x.targets?.some((t) => t.id === "recip"));
    expect(act).toBeTruthy();
    let d = dispatchAction(s, act);
    d = resolveTopOfStack(d);
    const recip = d.players.user.battlefield.find((p) => p.id === "recip");
    const granter = d.players.user.battlefield.find((p) => p.id === "granter");
    expect((recip.regenShields || 0)).toBeGreaterThan(0);   // the TARGET Sliver is shielded
    expect(granter.tapped).toBe(true);                       // the {T} cost tapped the activator
  });
});

describe("GROUP-ACTIVATED grant — SELF-PERMANENT-BOUNCE (Hibernation Sliver: Pay 2 life: Return this permanent…)", () => {
  it("the ability is offered on every Sliver, NOT the Bear (selector scope)", () => {
    const s = board('All Slivers have "Pay 2 life: Return this permanent to its owner\'s hand."');
    const ids = acts(s).map((a) => a.permanentId);
    expect(ids).toContain("granter");
    expect(ids).toContain("recip");
    expect(ids).not.toContain("bear");
  });

  it("a Sliver pays 2 life to bounce ITSELF (the RECIPIENT) to its owner's hand; the granter is untouched", () => {
    const s = board('All Slivers have "Pay 2 life: Return this permanent to its owner\'s hand."');
    const life0 = s.players.user.life;
    const onRecip = acts(s).find((a) => a.permanentId === "recip");
    expect(onRecip).toBeTruthy();
    let d = dispatchAction(s, onRecip);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.find((p) => p.id === "recip")).toBeUndefined();        // recipient left the battlefield
    expect(d.players.user.battlefield.find((p) => p.id === "granter")).toBeTruthy();         // the granter is untouched
    expect(d.players.user.hand.some((c) => c.name === "Plain Sliver")).toBe(true);           // the recipient is now in hand (bounced)
    expect(d.players.user.life).toBe(life0 - 2);                                             // the Pay-2-life cost was paid
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
