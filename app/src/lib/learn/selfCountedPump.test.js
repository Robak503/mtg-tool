/**
 * selfCountedPump.test.js — "this creature gets +X/+N until end of turn, where X is <count>" (Rubblebelt Rioters, Orcish
 * Siegemaster — census rank 62 of the 09-06 plan's stage ③, 2026-09-30 — and six more carriers of the same self form).
 *
 * The subtype-target "where x is" pump existed (Magma Sliver's grant); the SELF form had only the symmetric "for each" arm, so
 * "it gets +X/+0 until end of turn, where X is the greatest power among creatures you control" parked. The new arm reuses the
 * pump applier's counted lane (ptDeltaCount, and ptDeltaCountSlot for the one scaling stat; the count read on the pre-pump
 * board at resolution, CR 608.2h).
 *
 * ⛔ THE PRONOUN. The arm takes "this creature" only. A SELF trigger's "it" is named by the detector (SELF_PUMP_X_IT_RE, gated
 * on scope "self"); in a NON-self trigger ("Whenever a creature you control attacks alone, it gets +X/+X …" — Angelic
 * Exaltation, Team Avatar) "it" is the TRIGGERING creature, and reading it as the source would pump the wrong object. The first
 * draft took a bare "it" and flipped those two; the flip-diff caught it before any gate. They stay parked (a safe FN).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Triggers through checkAttackTriggers → the stack; activations
 * through legalActionsForPlayer → dispatch → the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RIOTERS = { name: "Rubblebelt Rioters", type: "Creature — Human Berserker", mana: "{1}{R}{G}", power: "0", toughness: "4", keywords: ["Haste"],
  oracle: "Haste\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the greatest power among creatures you control." };
const SIEGEMASTER = { name: "Orcish Siegemaster", type: "Creature — Orc Soldier", mana: "{2}{R}", power: "0", toughness: "5", keywords: ["Trample"],
  oracle: "Trample\nOther Orcs and Goblins you control have trample.\nWhenever this creature attacks, it gets +X/+0 until end of turn, where X is the greatest power among creatures you control." };
const DEACON = { name: "Vile Deacon", type: "Creature — Human Cleric", mana: "{2}{B}{B}", power: "2", toughness: "2", keywords: [],
  oracle: "Whenever this creature attacks, it gets +X/+X until end of turn, where X is the number of Clerics on the battlefield." };
const IMARYLL = { name: "Imaryll, Elfhame Elite", type: "Legendary Creature — Elf Warrior", mana: "{2}{G}{G}", power: "3", toughness: "3", keywords: [],
  oracle: "Whenever Imaryll attacks, it gets +X/+X until end of turn, where X is the number of other Elves you control.\nYou may have Imaryll assign its combat damage as though it weren't blocked." };
const IGNITER = { name: "Hellkite Igniter", type: "Creature — Dragon", mana: "{5}{R}{R}", power: "5", toughness: "5", keywords: ["Flying", "Haste"],
  oracle: "Flying, haste\n{1}{R}: This creature gets +X/+0 until end of turn, where X is the number of artifacts you control." };
const SPELLBLADE = { name: "Sokenzan Spellblade", type: "Creature — Ogre Samurai Shaman", mana: "{4}{R}", power: "2", toughness: "3", keywords: ["Bushido"],
  oracle: "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)\n{1}{R}: This creature gets +X/+0 until end of turn, where X is the number of cards in your hand." };
const LOREWEAVER = { name: "Kitsune Loreweaver", type: "Creature — Fox Cleric", mana: "{1}{W}", power: "2", toughness: "1", keywords: [],
  oracle: "{1}{W}: This creature gets +0/+X until end of turn, where X is the number of cards in your hand." };
const SPIDER = { name: "Graverobber Spider", type: "Creature — Spider", mana: "{3}{G}", power: "2", toughness: "4", keywords: ["Reach"],
  oracle: "Reach\n{3}{B}: This creature gets +X/+X until end of turn, where X is the number of creature cards in your graveyard. Activate only once each turn." };
const EXALTATION = { name: "Angelic Exaltation", type: "Enchantment", mana: "{3}{W}", keywords: [],
  oracle: "Whenever a creature you control attacks alone, it gets +X/+X until end of turn, where X is the number of creatures you control." };
const body = (name, type, p, t) => ({ name, type, mana: "{1}", power: String(p), toughness: String(t), keywords: [], oracle: "" });

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board({ user = [], ai = [], attackers = [], hand = [], graveyard = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: attackers.length ? "combat" : "precombat-main", step: attackers.length ? "declare-attackers" : "main",
    activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    ...(attackers.length && { combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } }),
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, graveyard, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }, ai: { ...s.players.ai, battlefield: ai } } };
}
const drain = (s0) => { let s = flushTriggers(s0); for (let i = 0; i < 12 && (s.stack || []).length; i++) s = resolveTopOfStack(s); return s; };
const pt = (s, id) => `${permanentPower(s, id)}/${permanentToughness(s, id)}`;
function activate(s, id) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === id);
  if (!act) throw new Error(`no activation offered for ${id}`);
  return drain(dispatchAction(s, act));
}

describe("the parse + the tiers", () => {
  it("⭐ the eight carriers classify native", () => {
    expect([RIOTERS, SIEGEMASTER, DEACON, IMARYLL, IGNITER, SPELLBLADE, LOREWEAVER, SPIDER].map(classifyCard).map((t) => /^native-/.test(t))).toEqual(Array(8).fill(true));
  });
  it("⛔ THE PRONOUN — a bare 'it' is not the source: the clause stays low, and Angelic Exaltation's lone-attacker 'it' stays parked", () => {
    expect(programConfidence(parseEffectClause("it gets +x/+0 until end of turn, where x is the greatest power among creatures you control", "Instant"))).toBe("low");
    expect(detectTriggers(EXALTATION).map((d) => [d.scope, d.effectClause])).toEqual([["creatureYouControl", "it gets +X/+X until end of turn, where X is the number of creatures you control"]]);
    expect(classifyCard(EXALTATION)).not.toMatch(/^native-/);
  });
});

describe("RUNTIME — the attack triggers", () => {
  it("⭐ Rubblebelt Rioters beside a 5-power Giant: +5/+0 (the greatest power, read on the pre-pump board)", () => {
    const s0 = board({ user: [perm("rr", RIOTERS, "user"), perm("giant", body("Giant", "Creature — Giant", 5, 5), "user")], attackers: ["rr"] });
    const out = drain(checkAttackTriggers(s0));
    expect({ before: pt(s0, "rr"), after: pt(out, "rr") }).toEqual({ before: "0/4", after: "5/4" });
    console.log(`WITNESS rioters ${JSON.stringify({ before: pt(s0, "rr"), after: pt(out, "rr") })}`);
  });
  it("Orcish Siegemaster alone reads its own 0 — +0/+0 (VACUITY CONTROL: no bigger creature, no pump)", () => {
    const s0 = board({ user: [perm("os", SIEGEMASTER, "user")], attackers: ["os"] });
    expect(pt(drain(checkAttackTriggers(s0)), "os")).toBe("0/5");
    const withBear = board({ user: [perm("os", SIEGEMASTER, "user"), perm("b", body("Bear", "Creature — Bear", 2, 2), "user")], attackers: ["os"] });
    expect(pt(drain(checkAttackTriggers(withBear)), "os")).toBe("2/5");
  });
  it("⭐ Vile Deacon counts every Cleric on the battlefield, the opponent's too: +3/+3 with one of each other", () => {
    const s0 = board({ user: [perm("vd", DEACON, "user"), perm("c1", body("Acolyte", "Creature — Human Cleric", 1, 1), "user")],
      ai: [perm("c2", body("Priest", "Creature — Human Cleric", 1, 1), "ai"), perm("w", body("Warrior", "Creature — Human Warrior", 2, 2), "ai")], attackers: ["vd"] });
    expect(pt(drain(checkAttackTriggers(s0)), "vd")).toBe("5/5");
  });
  it("Imaryll counts OTHER Elves you control — not itself, not an opponent's", () => {
    const s0 = board({ user: [perm("im", IMARYLL, "user"), perm("e1", body("Elf", "Creature — Elf", 1, 1), "user")], ai: [perm("e2", body("Elf", "Creature — Elf", 1, 1), "ai")], attackers: ["im"] });
    expect(pt(drain(checkAttackTriggers(s0)), "im")).toBe("4/4");
  });
  it("⛔ Angelic Exaltation's lone attacker is not pumped by the source-reading arm (nothing happens — parked)", () => {
    const s0 = board({ user: [perm("ex", EXALTATION, "user"), perm("b", body("Bear", "Creature — Bear", 2, 2), "user")], attackers: ["b"] });
    expect(pt(drain(checkAttackTriggers(s0)), "b")).toBe("2/2");
  });
});

describe("RUNTIME — the activated abilities", () => {
  it("⭐ Kitsune Loreweaver with three cards in hand: +0/+3 — the TOUGHNESS slot scales, power stays", () => {
    const hand = [1, 2, 3].map((n) => body(`Card ${n}`, "Creature — Bear", 2, 2)).map((c, i) => ({ ...c, id: `h${i}` }));
    const s0 = board({ user: [perm("kl", LOREWEAVER, "user")], hand, pool: { W: 1, C: 1 } });
    const out = activate(s0, "kl");
    expect({ before: pt(s0, "kl"), after: pt(out, "kl") }).toEqual({ before: "2/1", after: "2/4" });
    console.log(`WITNESS loreweaver ${JSON.stringify({ before: pt(s0, "kl"), after: pt(out, "kl") })}`);
  });
  it("Hellkite Igniter with two artifacts: +2/+0; Sokenzan Spellblade with one card in hand: +1/+0", () => {
    const art = (id) => perm(id, { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" }, "user");
    const ig = activate(board({ user: [perm("hi", IGNITER, "user"), art("o1"), art("o2")], pool: { R: 1, C: 1 } }), "hi");
    expect(pt(ig, "hi")).toBe("7/5");
    const sb = activate(board({ user: [perm("ss", SPELLBLADE, "user")], hand: [{ ...body("Card", "Creature — Bear", 2, 2), id: "h0" }], pool: { R: 1, C: 1 } }), "ss");
    expect(pt(sb, "ss")).toBe("3/3");
  });
  it("Graverobber Spider counts CREATURE cards in your graveyard (a land there adds nothing)", () => {
    const gy = [{ ...body("Bear", "Creature — Bear", 2, 2), id: "g1" }, { ...body("Elk", "Creature — Elk", 3, 3), id: "g2" }, { id: "g3", name: "Forest", type: "Basic Land — Forest", oracle: "" }];
    expect(pt(activate(board({ user: [perm("gs", SPIDER, "user")], graveyard: gy, pool: { B: 1, C: 3 } }), "gs"), "gs")).toBe("4/6");
  });
});
