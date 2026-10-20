/**
 * "YOU GAIN LIFE EQUAL TO THE DAMAGE DEALT THIS WAY" — the gain reads what the damage sentence before it actually dealt
 * (the play-weighted slice, 2026-10-18):
 *
 *   Creeping Bloodsucker (EDHREC #1543) — "At the beginning of your upkeep, this creature deals 1 damage to each opponent. You gain
 *                                          life equal to the damage dealt this way."
 *   Corrupt (#9986)                     — "Corrupt deals damage to any target equal to the number of Swamps you control. You gain life
 *                                          equal to the damage dealt this way."
 *   Rite of Consumption (#8004)         — a sacrificed creature's power, to target player or planeswalker; the same gain.
 *   Enter the God-Eternals (#11587)     — "deals 4 damage to target creature and you gain life equal to the damage dealt this way",
 *                                          then a mill and amass 4.
 *   Syphon Soul (#14417)                — "deals 2 damage to each other player", the same gain.
 *
 * THE RULES (Corrupt's and Brightflame's bundled rulings): the life gained is the damage the source actually dealt — "not
 * necessarily … the number of Swamps you control (if some or all of the damage is prevented, for example)"; "The amount of damage
 * dealt to a creature is not bounded by its toughness, and the amount of damage dealt to a player is not bounded by that player's
 * life total"; summed over every recipient ("the total damage dealt … to all creatures. You don't gain life for any damage that was
 * prevented"). A replacement that changes the damage (CR 614.1 — Furnace of Rath) changes what was dealt; a redirection (CR 614.9)
 * still has the same source deal it, to another recipient; prevention (CR 615) and protection (CR 702.16e) mean it was never dealt.
 * Enter the God-Eternals' rulings: a 2/2 dealt 4 still gains 4; with its creature target illegal, no damage and no life, but the
 * mill and the amass still happen (CR 608.2b).
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard — never typed by hand).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkStepTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (generated from the bundled Scryfall data) ──────────────
const CREEPING_BLOODSUCKER = {"name":"Creeping Bloodsucker","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"power":"1","toughness":"2","keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, this creature deals 1 damage to each opponent. You gain life equal to the damage dealt this way."}; // body-only on f71c2a49
const CORRUPT = {"name":"Corrupt","type":"Sorcery","mana":"{5}{B}","cmc":6,"keywords":[],"colors":["B"],"oracle":"Corrupt deals damage to any target equal to the number of Swamps you control. You gain life equal to the damage dealt this way."}; // arbiter-spell on f71c2a49
const RITE_OF_CONSUMPTION = {"name":"Rite of Consumption","type":"Sorcery","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"As an additional cost to cast this spell, sacrifice a creature.\nRite of Consumption deals damage equal to the sacrificed creature's power to target player or planeswalker. You gain life equal to the damage dealt this way."}; // arbiter-spell on f71c2a49
const ENTER_THE_GOD_ETERNALS = {"name":"Enter the God-Eternals","type":"Sorcery","mana":"{2}{U}{U}{B}","cmc":5,"keywords":["Amass","Mill"],"colors":["B","U"],"oracle":"Enter the God-Eternals deals 4 damage to target creature and you gain life equal to the damage dealt this way. Target player mills four cards. Amass Zombies 4. (Put four +1/+1 counters on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)"}; // arbiter-spell on f71c2a49
const SYPHON_SOUL = {"name":"Syphon Soul","type":"Sorcery","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Syphon Soul deals 2 damage to each other player. You gain life equal to the damage dealt this way."}; // arbiter-spell on f71c2a49
const BRIGHTFLAME = {"name":"Brightflame","type":"Sorcery","mana":"{X}{R}{R}{W}{W}","cmc":4,"keywords":["Radiance"],"colors":["R","W"],"oracle":"Radiance — Brightflame deals X damage to target creature and each other creature that shares a color with it. You gain life equal to the damage dealt this way."}; // arbiter-spell on f71c2a49
const RAZOR_RINGS = {"name":"Razor Rings","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"Razor Rings deals 4 damage to target attacking or blocking creature. You gain life equal to the excess damage dealt this way."}; // arbiter-spell on f71c2a49
const SPITEFUL_REPOSSESSION = {"name":"Spiteful Repossession","type":"Sorcery","mana":"{4}{R}","cmc":5,"keywords":["Treasure"],"colors":["R"],"oracle":"Spiteful Repossession deals damage to each opponent who controls more lands than you equal to the difference. Then create a number of Treasure tokens equal to the damage dealt this way."}; // arbiter-spell on f71c2a49
const TENDRILS_OF_CORRUPTION = {"name":"Tendrils of Corruption","type":"Instant","mana":"{3}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"Tendrils of Corruption deals X damage to target creature and you gain X life, where X is the number of Swamps you control."}; // native-spell on f71c2a49
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land on f71c2a49
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body on f71c2a49
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body on f71c2a49
const FURNACE_OF_RATH = {"name":"Furnace of Rath","type":"Enchantment","mana":"{1}{R}{R}{R}","cmc":4,"keywords":["Double"],"colors":["R"],"oracle":"If a source would deal damage to a permanent or player, it deals double that damage to that permanent or player instead."}; // native-static on f71c2a49
const DAWN_ELEMENTAL = {"name":"Dawn Elemental","type":"Creature — Elemental","mana":"{W}{W}{W}{W}","cmc":4,"power":"3","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nPrevent all damage that would be dealt to this creature."}; // native-static on f71c2a49
const BASILISK_COLLAR = {"name":"Basilisk Collar","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has deathtouch and lifelink. (Any amount of damage it deals to a creature is enough to destroy it. Damage dealt by this creature also causes you to gain that much life.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // native-equipment on f71c2a49

// ─── harness ──────────────────────────────────────────────────────────────────
const P = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ ...card, id });
const LIB = (n, who) => Array.from({ length: n }, (_, i) => ({ ...GRIZZLY_BEARS, id: `${who}-lib${i}` }));
const SWAMPS = (n) => Array.from({ length: n }, (_, i) => P(`sw${i}`, SWAMP));
const errors = (s) => (s.log || []).filter((e) => e.kind === "stack-resolve-error");

/** A two-seat game in the user's precombat main phase: the stack empty, both libraries stocked. */
function board({ user = [], ai = [], hand = [], pool = {}, shields = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    preventionShields: shields.map((sh) => ({ ...sh, turn: 5 })),
    players: { ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand, library: LIB(10, "u"), manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: [], library: LIB(10, "a") } } };
}
/** A four-seat Commander pod at the beginning of `active`'s upkeep; every seat at 40. */
function pod({ user = [], ai1 = [], ai2 = [], ai3 = [], active = "user", shields = [] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const s = { ...g, turn: 5, activePlayer: active, priorityHolder: active, phase: "beginning", step: "upkeep", stack: [], pendingTriggers: [], consecutivePasses: 0,
    preventionShields: shields.map((sh) => ({ ...sh, turn: 5 })), players: { ...g.players } };
  for (const [id, bf] of Object.entries({ user, ai1, ai2, ai3 })) s.players[id] = { ...s.players[id], life: 40, battlefield: bf, library: LIB(5, id) };
  return s;
}
const lives = (s) => Object.fromEntries(Object.keys(s.players).map((id) => [id, s.players[id].life]));
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
const upkeep = (s) => settle(checkStepTriggers(s, "upkeep"));
const offers = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const aimsAt = (a, id) => (a.targets || []).some((t) => t.id === id);
function cast(s, cardId, pick = () => true) {
  const offer = offers(s, cardId).find(pick);
  expect(offer).toBeTruthy();
  return dispatchAction(s, offer);
}

describe("the cards and their parse", () => {
  it("⭐ classify: Creeping Bloodsucker native-trigger; Corrupt, Rite of Consumption, Enter the God-Eternals and Syphon Soul native-spell; Brightflame (radiance), Razor Rings (\"excess damage\") and Spiteful Repossession (Treasures, a conditional count) stay parked; Tendrils of Corruption (a counted X) unchanged", () => {
    const row = Object.fromEntries(Object.entries({ CREEPING_BLOODSUCKER, CORRUPT, RITE_OF_CONSUMPTION, ENTER_THE_GOD_ETERNALS, SYPHON_SOUL, BRIGHTFLAME, RAZOR_RINGS, SPITEFUL_REPOSSESSION, TENDRILS_OF_CORRUPTION }).map(([k, c]) => [k, classifyCard(c)]));
    expect(row).toEqual({
      CREEPING_BLOODSUCKER: "native-trigger", CORRUPT: "native-spell", RITE_OF_CONSUMPTION: "native-spell", ENTER_THE_GOD_ETERNALS: "native-spell", SYPHON_SOUL: "native-spell",
      BRIGHTFLAME: "arbiter-spell", RAZOR_RINGS: "arbiter-spell", SPITEFUL_REPOSSESSION: "arbiter-spell", TENDRILS_OF_CORRUPTION: "native-spell",
    });
  });

  it("the program: the damage records what it dealt, the gain right after reads it", () => {
    const p = parseEffectProgram(CORRUPT);
    expect({ conf: programConfidence(p), atoms: p.atoms }).toEqual({ conf: "high", atoms: [
      { op: "deal-damage", targetType: "any", amountCount: { kind: "permanentsYouControl", subtype: "Swamp" }, recordDamageDealtThisWay: true },
      { op: "gain-life", amountCount: { kind: "damageDealtThisWay", per: 1 }, targetType: null },
    ] });
    expect(parseEffectProgram(SYPHON_SOUL).atoms[0]).toEqual({ op: "deal-damage", amount: 2, targetType: "eachOpponent", recordDamageDealtThisWay: true });
  });

  it("CONTROL — near misses stay unparsed: the gain alone, after a sentence that deals nothing, after an optional or a self-hitting deal, the excess form, another payoff", () => {
    const atoms = (clause) => parseEffectClause(clause, "Sorcery")?.atoms ?? [];
    expect({
      alone: atoms("You gain life equal to the damage dealt this way."),
      afterDraw: atoms("Draw a card. You gain life equal to the damage dealt this way."),
      notNext: atoms("Corrupt deals 3 damage to any target. Draw a card. You gain life equal to the damage dealt this way."),
      afterSelfHit: atoms("Orcish Artillery deals 2 damage to any target and 3 damage to you. You gain life equal to the damage dealt this way."),
      excess: atoms("Razor Rings deals 4 damage to target creature. You gain life equal to the excess damage dealt this way."),
      treasures: atoms("Corrupt deals 3 damage to any target. Create a number of Treasure tokens equal to the damage dealt this way."),
    }).toEqual({ alone: [], afterDraw: [], notNext: [], afterSelfHit: [], excess: [], treasures: [] });
  });

  it("CONTROL — the sequence gate: a reader not directly after a recording deal is LOW, whatever path built the program", () => {
    const gain = { op: "gain-life", amountCount: { kind: "damageDealtThisWay", per: 1 }, targetType: null };
    const dealRec = { op: "deal-damage", amount: 3, targetType: "any", recordDamageDealtThisWay: true };
    const deal = { op: "deal-damage", amount: 3, targetType: "any" };
    const conf = (atoms) => programConfidence({ version: 1, source: "parser", confidence: "high", structure: "sequence", atoms });
    expect({ ok: conf([dealRec, gain]), unrecorded: conf([deal, gain]), gap: conf([dealRec, { op: "draw", amount: 1, targetType: null }, gain]), first: conf([gain, dealRec]) })
      .toEqual({ ok: "high", unrecorded: "low", gap: "low", first: "low" });
  });
});

describe("⭐ Creeping Bloodsucker — the upkeep trigger in a four-seat pod", () => {
  it("⭐ 1 damage to each of three opponents: its controller gains 3", () => {
    const s = upkeep(pod({ user: [P("cb", CREEPING_BLOODSUCKER)] }));
    expect({ lives: lives(s), errors: errors(s).length }).toEqual({ lives: { user: 43, ai1: 39, ai2: 39, ai3: 39 }, errors: 0 });
  });

  it("⭐ prevented damage is not dealt: ai2 behind a 1-damage shield takes nothing, and the gain is 2", () => {
    const s = upkeep(pod({ user: [P("cb", CREEPING_BLOODSUCKER)], shields: [{ targetKind: "player", targetId: "ai2", amount: 1 }] }));
    expect(lives(s)).toEqual({ user: 42, ai1: 39, ai2: 40, ai3: 39 });
  });

  it("⭐ a replacement changes what was dealt: under Furnace of Rath each opponent is dealt 2, and the gain is 6", () => {
    const s = upkeep(pod({ user: [P("cb", CREEPING_BLOODSUCKER)], ai1: [P("furnace", FURNACE_OF_RATH, "ai1")] }));
    expect(lives(s)).toEqual({ user: 46, ai1: 38, ai2: 38, ai3: 38 });
  });

  it("⭐ lifelink is a separate gain: wearing Basilisk Collar, 3 from lifelink and 3 from the instruction", () => {
    const s = upkeep(pod({ user: [P("cb", CREEPING_BLOODSUCKER, "user", { attachments: ["collar"] }), P("collar", BASILISK_COLLAR, "user", { attachedTo: "cb" })] }));
    expect(lives(s)).toEqual({ user: 46, ai1: 39, ai2: 39, ai3: 39 });
  });

  it("CONTROL — another player's upkeep: nothing", () => {
    const s = upkeep(pod({ user: [P("cb", CREEPING_BLOODSUCKER)], active: "ai1" }));
    expect(lives(s)).toEqual({ user: 40, ai1: 40, ai2: 40, ai3: 40 });
  });
});

describe("⭐ Corrupt — cast, resolved", () => {
  it("⭐ six Swamps at a 2/2: the Bears die and the gain is 6 — not bounded by its toughness (the ruling)", () => {
    const s0 = board({ user: SWAMPS(6), hand: [H("corrupt", CORRUPT)], pool: { B: 6 }, ai: [P("bears", GRIZZLY_BEARS, "ai")] });
    const s = cast(s0, "corrupt", (a) => aimsAt(a, "bears"));
    const out = resolveTopOfStack(s);
    expect({ gain: out.players.user.life - 20, bears: !!findPermanent(out, "bears"), errors: errors(out).length }).toEqual({ gain: 6, bears: false, errors: 0 });
  });

  it("⭐ at a player behind a 2-damage shield: 4 dealt, 4 gained (the ruling — prevented damage gains nothing)", () => {
    const s0 = board({ user: SWAMPS(6), hand: [H("corrupt", CORRUPT)], pool: { B: 6 }, shields: [{ targetKind: "player", targetId: "ai", amount: 2 }] });
    const out = resolveTopOfStack(cast(s0, "corrupt", (a) => aimsAt(a, "ai")));
    expect({ ai: out.players.ai.life, user: out.players.user.life }).toEqual({ ai: 16, user: 24 });
  });

  it("⭐ at Dawn Elemental (it prevents all damage dealt to it): nothing dealt, nothing gained", () => {
    const s0 = board({ user: SWAMPS(6), hand: [H("corrupt", CORRUPT)], pool: { B: 6 }, ai: [P("dawn", DAWN_ELEMENTAL, "ai")] });
    const out = resolveTopOfStack(cast(s0, "corrupt", (a) => aimsAt(a, "dawn")));
    expect({ user: out.players.user.life, dawn: findPermanent(out, "dawn")?.permanent.damageMarked ?? null }).toEqual({ user: 20, dawn: 0 });
  });

  it("⭐ Furnace of Rath doubles it: three Swamps deal 6 to the player, and the gain is 6", () => {
    const s0 = board({ user: [...SWAMPS(3), P("furnace", FURNACE_OF_RATH)], hand: [H("corrupt", CORRUPT)], pool: { B: 6 } });
    const out = resolveTopOfStack(cast(s0, "corrupt", (a) => aimsAt(a, "ai")));
    expect({ ai: out.players.ai.life, user: out.players.user.life }).toEqual({ ai: 14, user: 26 });
  });

  it("⭐ a redirection still has Corrupt deal the damage (CR 614.9): 2 of the 6 move from the Giant to a Bear, the gain is 6", () => {
    const s0 = board({ user: SWAMPS(6), hand: [H("corrupt", CORRUPT)], pool: { B: 6 },
      ai: [P("giant", HILL_GIANT, "ai"), P("bears", GRIZZLY_BEARS, "ai")],
      shields: [{ targetKind: "creature", targetId: "giant", amount: 2, redirectTo: "bears" }] });
    const out = resolveTopOfStack(cast(s0, "corrupt", (a) => aimsAt(a, "giant")));
    expect({ user: out.players.user.life, giant: !!findPermanent(out, "giant"), bears: !!findPermanent(out, "bears") }).toEqual({ user: 26, giant: false, bears: false });
  });
});

describe("⭐ Rite of Consumption — sacrifice, cast, resolved", () => {
  it("⭐ the sacrificed Hill Giant's power: 3 to the opponent, 3 gained", () => {
    const s0 = board({ user: [P("giant", HILL_GIANT)], hand: [H("rite", RITE_OF_CONSUMPTION)], pool: { B: 2 } });
    const out = resolveTopOfStack(cast(s0, "rite", (a) => a.sacCreatureId === "giant" && aimsAt(a, "ai")));
    expect({ ai: out.players.ai.life, user: out.players.user.life, giant: !!findPermanent(out, "giant") }).toEqual({ ai: 17, user: 23, giant: false });
  });
});

describe("⭐ Enter the God-Eternals — two targets, then amass", () => {
  it("⭐ 4 damage to a 2/2 still gains 4 (the ruling); the target player mills four; a 0/0 Zombie Army gets four counters", () => {
    const s0 = board({ hand: [H("ege", ENTER_THE_GOD_ETERNALS)], pool: { U: 2, B: 1, C: 2 }, ai: [P("bears", GRIZZLY_BEARS, "ai")] });
    const out = resolveTopOfStack(cast(s0, "ege", (a) => aimsAt(a, "bears") && aimsAt(a, "ai")));
    const army = out.players.user.battlefield.find((p) => /Army/.test(p.card?.type || ""));
    expect({ gain: out.players.user.life - 20, bears: !!findPermanent(out, "bears"), milled: out.players.ai.graveyard.length - 1, counters: army?.counters?.["+1/+1"] ?? null, errors: errors(out).length })
      .toEqual({ gain: 4, bears: false, milled: 4, counters: 4, errors: 0 });
  });

  it("⭐ its creature target gone before it resolves: no damage, no life — the mill and the amass still happen (the ruling)", () => {
    const s0 = board({ hand: [H("ege", ENTER_THE_GOD_ETERNALS)], pool: { U: 2, B: 1, C: 2 }, ai: [P("bears", GRIZZLY_BEARS, "ai")] });
    const cast0 = cast(s0, "ege", (a) => aimsAt(a, "bears") && aimsAt(a, "ai"));
    const gone = { ...cast0, players: { ...cast0.players, ai: { ...cast0.players.ai, battlefield: [] } } };
    const out = resolveTopOfStack(gone);
    const army = out.players.user.battlefield.find((p) => /Army/.test(p.card?.type || ""));
    expect({ gain: out.players.user.life - 20, milled: out.players.ai.graveyard.length, counters: army?.counters?.["+1/+1"] ?? null }).toEqual({ gain: 0, milled: 4, counters: 4 });
  });
});

describe("⭐ Syphon Soul — each other player", () => {
  it("⭐ 2 to each of three other players, 6 gained; ai3 behind a 2-damage shield makes it 4", () => {
    const podMain = (shields = []) => {
      const s = pod({ shields });
      return { ...s, phase: "precombat-main", step: "main", players: { ...s.players, user: { ...s.players.user, hand: [H("ss", SYPHON_SOUL)], manaPool: { ...s.players.user.manaPool, B: 3 } } } };
    };
    const plain = resolveTopOfStack(cast(podMain(), "ss"));
    const shielded = resolveTopOfStack(cast(podMain([{ targetKind: "player", targetId: "ai3", amount: 2 }]), "ss"));
    expect({ plain: lives(plain), shielded: lives(shielded) }).toEqual({
      plain: { user: 46, ai1: 38, ai2: 38, ai3: 38 },
      shielded: { user: 44, ai1: 38, ai2: 38, ai3: 40 },
    });
  });
});
