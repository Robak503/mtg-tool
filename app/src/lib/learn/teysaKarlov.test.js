/**
 * teysaKarlov.test.js — TEYSA KARLOV, the DIES-TRIGGER doubler subsystem.
 *
 * Two clauses, both modeled here:
 *   1. DIES-TRIGGER MULTIPLIER (CR 603.x) — "If a creature dying causes a triggered ability of a permanent
 *      you control to trigger, that ability triggers an additional time." A trigger-count multiplier applied
 *      at the TWO death-trigger enqueue sites where a creature going to a graveyard causes an ability to fire:
 *        - checkDiesTriggers   (creature death — SBA/destroy/combat/sacrifice-as-cost all route here)
 *        - checkSacrificeTriggers (a "whenever you sacrifice a creature" watcher — the sacrificed CREATURE
 *          died, so per the official ruling Teysa doubles it too; a NON-creature sacrifice is NOT doubled)
 *      A planeswalker death (checkPlaneswalkerDiesTriggers) is NOT "a creature dying" → never doubled.
 *   2. TOKEN KEYWORD ANTHEM — "Creature tokens you control have vigilance and lifelink." A static
 *      layer-6 keyword grant restricted to CREATURE TOKENS the controller owns (selector.token).
 *
 * CREED: the multiplier fires an ADDITIONAL time only for an ability whose CONTROLLER controls Teysa, only on
 * a CREATURE death, and each extra instance is a DISTINCT pending trigger (a separate ability on the stack).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkDiesTriggers, checkSacrificeTriggers, checkPlaneswalkerDiesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword, diesTriggerMultiplierCount } from "./layers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TEYSA_ORACLE =
  "If a creature dying causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nCreature tokens you control have vigilance and lifelink.";

function card(name, oracle, over = {}) {
  return { id: `card-${name}`, name, type: "Creature — Human Advisor", power: 2, toughness: 2, oracle, ...over };
}
function permObj(c, controller, id, over = {}) {
  return { id, card: c, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, timestamp: 0, ...over };
}
function stateWith(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
}
function place(state, perms) {
  const players = { ...state.players };
  for (const p of perms) {
    players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  }
  return { ...state, players };
}
const teysa = (id, controller) => permObj(card("Teysa Karlov", TEYSA_ORACLE, { type: "Legendary Creature — Human Advisor" }), controller, id);
const bloodArtist = (id, controller) =>
  permObj(card("Blood Artist", "Whenever a creature dies, target player loses 1 life and you gain 1 life.", { id: "card-ba", type: "Creature — Vampire" }), controller, id);
const deadBear = (controller, id = "perm-x") => ({ id, controller, name: "Bear", card: { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } });

// ── 1. CLASSIFICATION ─────────────────────────────────────────────────────────────
describe("Teysa Karlov — classification", () => {
  it("flips native-static (both clauses modeled)", () => {
    const pub = { name: "Teysa Karlov", type: "Legendary Creature — Human Advisor", mana: "{2}{W}{B}", oracle: TEYSA_ORACLE };
    expect(classifyCard(pub)).toBe("native-static");
  });
  it("emits a diesTriggerMultiplier static + two token keyword grants", () => {
    const statics = parseStaticAbilities({ name: "Teysa Karlov", type: "Legendary Creature — Human Advisor", oracle: TEYSA_ORACLE });
    expect(statics.some((s) => s.op?.layerOp === "diesTriggerMultiplier")).toBe(true);
    const grants = statics.filter((s) => s.op?.layerOp === "addKeyword");
    expect(grants.map((g) => g.op.keyword).sort()).toEqual(["Lifelink", "Vigilance"]);
    for (const g of grants) expect(g.affects.selector.token).toBe(true);
  });
});

// ── 2. DIES-TRIGGER MULTIPLIER (checkDiesTriggers) ─────────────────────────────────
describe("Teysa Karlov — dies-trigger multiplier", () => {
  it("a watcher you control fires TWICE (one additional time) when a creature dies", () => {
    const state = place(stateWith(), [teysa("perm-teysa", "user"), bloodArtist("perm-ba", "user")]);
    const out = checkDiesTriggers(state, [deadBear("ai1")]);
    const baFires = out.pendingTriggers.filter((t) => t.source?.name === "Blood Artist");
    expect(baFires).toHaveLength(2); // printed + one additional (Teysa)
    // Each is a DISTINCT pending trigger (separate stack objects, independent targets).
    expect(baFires[0]).not.toBe(baFires[1]);
    expect(baFires.every((t) => t.controller === "user")).toBe(true);
  });

  it("TWO Teysas → the watcher fires THREE times (each Teysa adds one)", () => {
    const state = place(stateWith(), [teysa("perm-t1", "user"), teysa("perm-t2", "user"), bloodArtist("perm-ba", "user")]);
    const out = checkDiesTriggers(state, [deadBear("ai1")]);
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Blood Artist")).toHaveLength(3);
  });

  it("the DYING creature's own dies trigger is also doubled (Teysa controller = its controller)", () => {
    const doomed = card("Doomed", "When Doomed dies, you draw a card.", { id: "card-doomed", type: "Creature — Bear" });
    const state = place(stateWith(), [teysa("perm-teysa", "user")]);
    const out = checkDiesTriggers(state, [{ id: "perm-doomed", controller: "user", name: "Doomed", card: doomed }]);
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Doomed")).toHaveLength(2);
  });

  // ── CREED near-misses ──
  it("CREED: an OPPONENT's Teysa does NOT double YOUR watcher's trigger", () => {
    // Blood Artist controlled by user; Teysa controlled by ai1. The trigger's controller is user, who has
    // no Teysa → no additional instance.
    const state = place(stateWith(), [bloodArtist("perm-ba", "user"), teysa("perm-teysa", "ai1")]);
    const out = checkDiesTriggers(state, [deadBear("ai2")]);
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Blood Artist")).toHaveLength(1);
  });

  it("CREED: a watcher controlled by a NON-Teysa player fires once; a co-controlled watcher fires twice", () => {
    // user controls Teysa + a Blood Artist; ai1 controls its OWN Blood Artist (no Teysa).
    const state = place(stateWith(), [
      teysa("perm-teysa", "user"),
      bloodArtist("perm-ba-user", "user"),
      bloodArtist("perm-ba-ai", "ai1"),
    ]);
    const out = checkDiesTriggers(state, [deadBear("ai2")]);
    expect(out.pendingTriggers.filter((t) => t.controller === "user" && t.source?.name === "Blood Artist")).toHaveLength(2);
    expect(out.pendingTriggers.filter((t) => t.controller === "ai1" && t.source?.name === "Blood Artist")).toHaveLength(1);
  });

  it("CREED: no Teysa → the watcher fires exactly once (fast path, unchanged)", () => {
    const state = place(stateWith(), [bloodArtist("perm-ba", "user")]);
    const out = checkDiesTriggers(state, [deadBear("ai1")]);
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Blood Artist")).toHaveLength(1);
  });
});

// ── 3. PLANESWALKER DEATH is not "a creature dying" ────────────────────────────────
describe("Teysa Karlov — planeswalker death is NOT doubled", () => {
  // A planeswalker "dies" via checkPlaneswalkerDiesTriggers, a dispatch that deliberately does NOT call the
  // dies-trigger multiplier (a PW dying is not "a creature dying" — CR / Teysa's clause names creatures). The
  // guarantee: the PW-death dispatch yields the SAME pending-trigger count with vs without Teysa on the board.
  const deadPw = () => [{ id: "perm-pw", controller: "user", name: "Gideon", card: { id: "card-gid", name: "Gideon", type: "Legendary Planeswalker — Gideon", oracle: "" } }];
  const selfDiesPw = () => [{
    id: "perm-pw2", controller: "user", name: "Doomwalker",
    card: { id: "card-dpw", name: "Doomwalker", type: "Legendary Planeswalker — Doom", oracle: "When Doomwalker dies, you draw a card." },
  }];

  it("CREED: a PW's own dies trigger fires the SAME number of times with or without Teysa", () => {
    const withoutTeysa = checkPlaneswalkerDiesTriggers(place(stateWith(), []), selfDiesPw());
    const withTeysa = checkPlaneswalkerDiesTriggers(place(stateWith(), [teysa("perm-teysa", "user")]), selfDiesPw());
    const n0 = withoutTeysa.pendingTriggers.filter((t) => t.source?.name === "Doomwalker").length;
    const n1 = withTeysa.pendingTriggers.filter((t) => t.source?.name === "Doomwalker").length;
    expect(n1).toBe(n0); // Teysa never doubles a planeswalker death
  });

  it("CREED: a plain PW death enqueues nothing extra with Teysa present", () => {
    const out = checkPlaneswalkerDiesTriggers(place(stateWith(), [teysa("perm-teysa", "user")]), deadPw());
    // No modeled watcher fires on a bare PW death → the multiplier has nothing to double (and wouldn't anyway).
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Gideon")).toHaveLength(0);
  });
});

// ── 4. SACRIFICE dispatch — creature doubled, non-creature NOT ─────────────────────
describe("Teysa Karlov — sacrifice-trigger multiplier (creature only)", () => {
  const saccer = (id, controller) =>
    permObj(card("Zulaport", "Whenever you sacrifice a creature, each opponent loses 1 life.", { id: "card-zc", type: "Creature — Human" }), controller, id, {
      // give it a "sacrifice a creature" watcher — detectTriggers must recognize event:"sacrifice"
    });

  it("sacrificing a CREATURE doubles a 'whenever you sacrifice a creature' watcher (with Teysa)", () => {
    const state = place(stateWith(), [teysa("perm-teysa", "user"), saccer("perm-zc", "user")]);
    const sacrificed = { id: "perm-tok", controller: "user", card: { id: "card-tok", name: "Zombie", type: "Creature — Zombie", oracle: "", token: true } };
    const out = checkSacrificeTriggers(state, "user", sacrificed);
    const fires = out.pendingTriggers.filter((t) => t.source?.name === "Zulaport");
    expect(fires.length).toBe(2); // one printed + one additional (Teysa) — the sacrificed creature died
  });

  it("CREED: sacrificing a NON-creature (Treasure) does NOT double, even with Teysa", () => {
    // A "whenever you sacrifice a permanent" watcher fires on a Treasure sac (scope "you" matches any
    // permanent), but a Treasure isn't a creature dying → Teysa must not double it. It fires EXACTLY once.
    const permSaccer = permObj(
      card("Deadly Dispute", "Whenever you sacrifice a permanent, you draw a card.", { id: "card-dd", type: "Enchantment" }),
      "user", "perm-dd",
    );
    const state = place(stateWith(), [teysa("perm-teysa", "user"), permSaccer]);
    const treasure = { id: "perm-tr", controller: "user", card: { id: "card-tr", name: "Treasure", type: "Artifact — Treasure", oracle: "", token: true } };
    const out = checkSacrificeTriggers(state, "user", treasure);
    // Treasure is not a creature → the watcher fires once, never doubled.
    const fires = out.pendingTriggers.filter((t) => t.source?.name === "Deadly Dispute");
    expect(fires).toHaveLength(1);
  });

  it("sacrificing a CREATURE doubles the same 'sacrifice a permanent' watcher (creature death)", () => {
    // Contrast to the Treasure case: the SAME watcher, but the sacrificed permanent is a CREATURE → it died →
    // Teysa doubles it. Proves the gate keys on the sacrificed object's type, not the watcher's scope.
    const permSaccer = permObj(
      card("Deadly Dispute", "Whenever you sacrifice a permanent, you draw a card.", { id: "card-dd", type: "Enchantment" }),
      "user", "perm-dd",
    );
    const state = place(stateWith(), [teysa("perm-teysa", "user"), permSaccer]);
    const creatureSac = { id: "perm-cr", controller: "user", card: { id: "card-cr", name: "Zombie", type: "Creature — Zombie", oracle: "", token: true } };
    const out = checkSacrificeTriggers(state, "user", creatureSac);
    expect(out.pendingTriggers.filter((t) => t.source?.name === "Deadly Dispute")).toHaveLength(2);
  });
});

// ── 5. diesTriggerMultiplierCount helper ───────────────────────────────────────────
describe("diesTriggerMultiplierCount", () => {
  it("counts Teysas per LIVE controller", () => {
    const state = place(stateWith(), [teysa("perm-t1", "user"), teysa("perm-t2", "user"), teysa("perm-t3", "ai1")]);
    expect(diesTriggerMultiplierCount(state, "user")).toBe(2);
    expect(diesTriggerMultiplierCount(state, "ai1")).toBe(1);
    expect(diesTriggerMultiplierCount(state, "ai2")).toBe(0);
  });
});

// ── 6. TOKEN KEYWORD ANTHEM ─────────────────────────────────────────────────────────
describe("Teysa Karlov — token keyword anthem", () => {
  const tokenCreature = (id, controller) =>
    permObj({ id: `card-${id}`, name: "Spirit", type: "Creature — Spirit", power: 1, toughness: 1, oracle: "", token: true }, controller, id);
  const nontokenCreature = (id, controller) =>
    permObj({ id: `card-${id}`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, id);

  it("grants vigilance + lifelink to a CREATURE TOKEN you control", () => {
    const state = place(stateWith(), [teysa("perm-teysa", "user"), tokenCreature("tok1", "user")]);
    expect(permanentHasKeyword(state, "tok1", "Vigilance")).toBe(true);
    expect(permanentHasKeyword(state, "tok1", "Lifelink")).toBe(true);
  });

  it("CREED: does NOT grant to a NONTOKEN creature you control", () => {
    const state = place(stateWith(), [teysa("perm-teysa", "user"), nontokenCreature("nt1", "user")]);
    expect(permanentHasKeyword(state, "nt1", "Vigilance")).toBe(false);
    expect(permanentHasKeyword(state, "nt1", "Lifelink")).toBe(false);
  });

  it("CREED: does NOT grant to an OPPONENT's creature token ('you control')", () => {
    const state = place(stateWith(), [teysa("perm-teysa", "user"), tokenCreature("tok-ai", "ai1")]);
    expect(permanentHasKeyword(state, "tok-ai", "Vigilance")).toBe(false);
    expect(permanentHasKeyword(state, "tok-ai", "Lifelink")).toBe(false);
  });
});
