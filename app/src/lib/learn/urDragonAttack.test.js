/**
 * urDragonAttack.test.js — The Ur-Dragon's variable-count tribal attack trigger:
 *   "Whenever one or more Dragons you control attack, draw that many cards, then you may put a
 *    permanent card from your hand onto the battlefield."
 *
 * A targeted #319-style runtime hook (Cindy's compiler can't reach the plural-verb condition, the
 * "that many" variable count, or the cheat-permanent effect). Engine-first: the trigger must actually
 * draw the right count + cheat the right permanent + fire its ETB, or the card is a false positive.
 *
 * METRIC (TIER-1 pod): with EVERY clause of the commander now modeled — the Eminence Dragon cost-reduction
 * (staticAbilityParser's { costReduction, fromCommandZone } marker, applied at the cast site), Flying (an
 * enforced keyword), and this attack trigger (the runtime hook below) — coverage.classifyUrDragon credits
 * The Ur-Dragon native-mixed (the classifyWolverine / classifyXCastTokenCommander additive-seam pattern).
 * The flip is HONEST: it credits exactly the card the runtime already plays end-to-end (proven below).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseUrDragonAttackTrigger, applyUrDragonAttackTriggers } from "./urDragonAttack.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const UR_ORACLE =
  "Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.";

const urDragon = (id = "ur", controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: "The Ur-Dragon", type: "Legendary Creature — Dragon Avatar", power: 10, toughness: 10, oracle: UR_ORACLE }, controller, summoningSick: false });
const dragon = (id, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: `Dragon ${id}`, type: "Creature — Dragon", power: 4, toughness: 4, oracle: "Flying" }, controller, summoningSick: false });
const goblin = (id, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: `Goblin ${id}`, type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller, summoningSick: false });

// Library / hand card fixtures.
const instants = (n) => Array.from({ length: n }, (_, i) => ({ id: `inst${i}`, name: `Bolt ${i}`, type: "Instant", oracle: "", cmc: 1 }));
const perm = (id, cmc, type = "Creature — Beast") => ({ id, name: id, type, oracle: "", cmc });

function st({ userBf = [], attackers = [], userLib = [], userHand = [], aiBf = [], aiLib = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    step: "declare-blockers",
    phase: "combat",
    combat: { attackers, blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf, library: userLib, hand: userHand, life: 40 },
      ai: { ...s.players.ai, battlefield: aiBf, library: aiLib, hand: aiHand, life: 40 },
    },
  };
}
const atk = (permanentId, attackingPlayer = "user") => ({ permanentId, attackingPlayer, defender: attackingPlayer === "user" ? "ai" : "user" });
const onBf = (s, pid, name) => s.players[pid].battlefield.some((p) => p.card?.name === name || p.card?.id === name);

describe("parseUrDragonAttackTrigger — predicate", () => {
  it("parses The Ur-Dragon's real oracle → subtype dragon", () => {
    expect(parseUrDragonAttackTrigger({ oracle: UR_ORACLE })).toEqual({ subtype: "dragon" });
    expect(parseUrDragonAttackTrigger({ oracle_text: UR_ORACLE })).toEqual({ subtype: "dragon" });
  });
  it("is generic over the subtype (regular plural singularized)", () => {
    const o = "Whenever one or more Goblins you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.";
    expect(parseUrDragonAttackTrigger({ oracle: o })).toEqual({ subtype: "goblin" });
  });
  it("strips reminder text before matching", () => {
    const o = "Flying (This creature can't be blocked except by creatures with flying or reach.)\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.";
    expect(parseUrDragonAttackTrigger({ oracle: o })).toEqual({ subtype: "dragon" });
  });
  it("returns null for the OTHER 'one or more <X> attack' cards (different effects → not this hook)", () => {
    // Each carries a DIFFERENT effect — they belong to Cindy's compiler / the Arbiter, never this hook.
    expect(parseUrDragonAttackTrigger({ oracle: "Whenever one or more Dinosaurs you control attack, create that many Treasure tokens." })).toBeNull();
    expect(parseUrDragonAttackTrigger({ oracle: "Whenever one or more Elves you control attack, they gain deathtouch until end of turn." })).toBeNull();
    expect(parseUrDragonAttackTrigger({ oracle: "Whenever one or more creatures you control attack, you gain 1 life for each attacking creature." })).toBeNull();
    expect(parseUrDragonAttackTrigger({ oracle: "Whenever a Dragon you control attacks, it gets +1/+0 until end of turn." })).toBeNull();
  });
  it("returns null for empty / missing oracle", () => {
    expect(parseUrDragonAttackTrigger({})).toBeNull();
    expect(parseUrDragonAttackTrigger({ oracle: "" })).toBeNull();
    expect(parseUrDragonAttackTrigger({ oracle: "Flying" })).toBeNull();
  });
});

describe("applyUrDragonAttackTriggers — draw count ('that many' = attacking Dragons)", () => {
  it("draws one card per attacking Dragon", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), dragon("d1"), dragon("d2")], attackers: [atk("d1"), atk("d2")], userLib: instants(5) }),
    );
    expect(out.players.user.hand).toHaveLength(2); // 2 Dragons attacked → 2 cards
  });
  it("counts ONLY attacking Dragons, not other attacking creatures", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), dragon("d1"), dragon("d2"), goblin("g1")], attackers: [atk("d1"), atk("d2"), atk("g1")], userLib: instants(5) }),
    );
    expect(out.players.user.hand).toHaveLength(2); // the Goblin is not a Dragon → still 2
  });
  it("counts ONLY attacking Dragons, not Dragons sitting back on the battlefield", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), dragon("d1"), dragon("d2")], attackers: [atk("d1")], userLib: instants(5) }),
    );
    expect(out.players.user.hand).toHaveLength(1); // only d1 attacked (d2 stayed home)
  });
  it("the attacking Ur-Dragon itself counts (it is a Dragon)", () => {
    const ur = urDragon();
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [ur, dragon("d1")], attackers: [atk("ur"), atk("d1")], userLib: instants(5) }),
    );
    expect(out.players.user.hand).toHaveLength(2);
  });
  it("no attacking Dragon → no-op (the real trigger would not have fired)", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), goblin("g1")], attackers: [atk("g1")], userLib: instants(5), userHand: [perm("p1", 3)] }),
    );
    expect(out.players.user.hand).toEqual([perm("p1", 3)]); // untouched: no draw, no cheat
  });
});

describe("applyUrDragonAttackTriggers — optional cheat-a-permanent-from-hand", () => {
  it("puts the highest-mana-value PERMANENT from hand onto the battlefield (instants/sorceries stay)", () => {
    const out = applyUrDragonAttackTriggers(
      st({
        userBf: [urDragon(), dragon("d1")],
        attackers: [atk("d1")],
        userLib: instants(1), // draw 1 instant — not a permanent, won't be cheated
        userHand: [perm("c4", 4), { id: "sorc6", name: "sorc6", type: "Sorcery", oracle: "", cmc: 6 }, perm("c7", 7)],
      }),
    );
    expect(onBf(out, "user", "c7")).toBe(true); // MV7 creature was the best permanent → cheated in
    expect(out.players.user.hand.some((c) => c.id === "c7")).toBe(false);
    expect(out.players.user.hand.some((c) => c.id === "sorc6")).toBe(true); // the higher-MV SORCERY is NOT a permanent → stays
    expect(out.players.user.hand.some((c) => c.id === "c4")).toBe(true); // the lower-MV creature stays
    const cheated = out.players.user.battlefield.find((p) => p.card?.id === "c7");
    expect(cheated.summoningSick).toBe(true); // entered this turn (CR 302.6)
  });
  it("a freshly DRAWN permanent is eligible to be the one put onto the battlefield", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), dragon("d1")], attackers: [atk("d1")], userLib: [perm("bomb8", 8)], userHand: [] }),
    );
    expect(onBf(out, "user", "bomb8")).toBe(true); // drew it, then cheated it straight into play
    expect(out.players.user.hand).toHaveLength(0);
  });
  it("the cheated permanent is stamped like the canonical entry path (enteredOnTurn + CR 613.7 timestamp)", () => {
    const s = st({ userBf: [urDragon(), dragon("d1")], attackers: [atk("d1")], userLib: instants(1), userHand: [perm("c5", 5)] });
    const out = applyUrDragonAttackTriggers(s);
    const cheated = out.players.user.battlefield.find((p) => p.card?.id === "c5");
    expect(cheated.enteredOnTurn).toBe(out.turn);                       // entered THIS turn, not null
    expect(typeof cheated.timestamp).toBe("number");                    // layer-ordering timestamp present
    expect(out.timestampCounter).toBe((s.timestampCounter || 0) + 1);  // counter threaded forward
  });
  it("no permanent in hand → draw only, nothing cheated", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon(), dragon("d1")], attackers: [atk("d1")], userLib: instants(1), userHand: [{ id: "i0", name: "i0", type: "Instant", oracle: "", cmc: 2 }] }),
    );
    expect(out.players.user.hand).toHaveLength(2); // 1 held instant + 1 drawn instant
    expect(out.players.user.battlefield).toHaveLength(2); // unchanged (Ur-Dragon + d1)
  });
});

describe("applyUrDragonAttackTriggers — multi-watcher / multiplayer", () => {
  it("two Ur-Dragons each draw 'that many' (a separate trigger per watcher)", () => {
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [urDragon("ur1"), urDragon("ur2")], attackers: [atk("ur1"), atk("ur2")], userLib: instants(8) }),
    );
    expect(out.players.user.hand).toHaveLength(4); // 2 watchers × 2 attacking Dragons each
  });
  it("an opponent's Ur-Dragon draws for the OPPONENT, not the user", () => {
    const out = applyUrDragonAttackTriggers(
      st({ aiBf: [urDragon("uA", "ai"), dragon("dA", "ai")], attackers: [atk("dA", "ai")], aiLib: instants(3) }),
    );
    expect(out.players.ai.hand).toHaveLength(1);
    expect(out.players.user.hand).toHaveLength(0);
  });
  it("two attacking players each with an Ur-Dragon: each draws only THEIR own attacking Dragons (no cross-count)", () => {
    const out = applyUrDragonAttackTriggers(
      st({
        userBf: [urDragon("urU", "user"), dragon("dU", "user")],
        aiBf: [urDragon("urA", "ai"), dragon("dA1", "ai"), dragon("dA2", "ai")],
        attackers: [atk("dU", "user"), atk("dA1", "ai"), atk("dA2", "ai")],
        userLib: instants(4),
        aiLib: instants(4),
      }),
    );
    expect(out.players.user.hand).toHaveLength(1); // user had 1 attacking Dragon
    expect(out.players.ai.hand).toHaveLength(2);   // ai had 2 attacking Dragons — counts never crossed
  });
  it("FP GUARD: a 'one or more Dragons attack' card with a DIFFERENT effect does NOT draw or cheat", () => {
    const poetic = createPermanent({ id: "poe", card: { id: "c-poe", name: "Poetic Ingenuity", type: "Enchantment", oracle: "Whenever one or more Dragons you control attack, create that many Treasure tokens." }, controller: "user" });
    const out = applyUrDragonAttackTriggers(
      st({ userBf: [poetic, dragon("d1")], attackers: [atk("d1")], userLib: instants(3), userHand: [perm("p1", 5)] }),
    );
    expect(out.players.user.hand).toEqual([perm("p1", 5)]); // no draw
    expect(out.players.user.battlefield).toHaveLength(2); // no cheat (poetic + d1 only)
  });
});

describe("Ur-Dragon attack trigger — end-to-end through the engine (runStepActions @ declare-blockers)", () => {
  const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };

  it("at the declare-blockers transition: draws per attacking Dragon AND fires the cheated permanent's ETB", () => {
    // Cheat in a creature whose own ETB draws a card — proves the entry fires ETB triggers (603.6a) that
    // then flush + resolve through the real engine path, not just a silent zone move.
    const etbCreature = { id: "etb5", name: "ETB Drawer", type: "Creature — Bird", power: 2, toughness: 2, oracle: "When this creature enters the battlefield, draw a card.", cmc: 5 };
    const s = st({
      userBf: [urDragon(), dragon("d1")],
      attackers: [atk("d1")],
      userLib: [etbCreature, { id: "etbdraw", name: "FromETB", type: "Instant", oracle: "", cmc: 1 }],
      userHand: [],
    });
    let out = runStepActions(s);           // checkAttackTriggers + the Ur-Dragon hook + flush (enqueues ETB)
    out = resolveAll(out);                 // resolve the cheated creature's ETB off the stack
    expect(onBf(out, "user", "ETB Drawer")).toBe(true);                       // drew it (1 attacking Dragon) then cheated it in
    expect(out.players.user.hand.some((c) => c.id === "etbdraw")).toBe(true); // its ETB "draw a card" actually resolved
  });

  it("no Dragons attacking → the engine step is a clean no-op for this trigger", () => {
    const s = st({ userBf: [urDragon(), goblin("g1")], attackers: [atk("g1")], userLib: instants(3), userHand: [perm("p1", 4)] });
    const out = runStepActions(s);
    expect(out.players.user.hand.some((c) => c.id === "p1")).toBe(true); // permanent NOT cheated
    expect(out.players.user.hand.filter((c) => c.type === "Instant")).toHaveLength(0); // nothing drawn
  });
});

describe("Ur-Dragon — coverage flip (every clause modeled → native-mixed, the TIER-1 pod commander)", () => {
  it("classifyCard(The Ur-Dragon) is native-mixed (Eminence cost-reduction + Flying + the attack-trigger hook)", () => {
    const cls = classifyCard({ name: "The Ur-Dragon", type: "Legendary Creature — Dragon Avatar", mana: "{4}{W}{U}{B}{R}{G}", oracle: UR_ORACLE });
    expect(cls).toBe("native-mixed");
  });
  it("CREED: the flip needs ALL clauses — strip the Eminence line (cost-reduction gone) → NOT native", () => {
    // Without the modeled Eminence cost-reduction, classifyUrDragon returns null (its eminence-required guard),
    // and the bare attack trigger + Flying isn't recognized by any other native tier → body-only (a safe FN).
    const noEminence = "Flying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.";
    const cls = classifyCard({ name: "The Ur-Dragon", type: "Legendary Creature — Dragon Avatar", mana: "{4}{W}{U}{B}{R}{G}", oracle: noEminence });
    expect(cls).toBe("body-only");
  });
  it("CREED: an extra unmodeled clause keeps the card off native (residue guard)", () => {
    const withRider = UR_ORACLE + "\nWhenever you gain life, scry 1.";
    const cls = classifyCard({ name: "The Ur-Dragon", type: "Legendary Creature — Dragon Avatar", mana: "{4}{W}{U}{B}{R}{G}", oracle: withRider });
    expect(cls).toBe("body-only");
  });
});
