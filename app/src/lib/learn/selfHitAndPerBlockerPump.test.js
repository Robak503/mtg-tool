/**
 * selfHitAndPerBlockerPump.test.js — the two BLITZ micro-slices OA-1 + RE-1.
 *
 * OA-1 SELF-HIT DAMAGE (Orcish Artillery frame): "<source> deals N damage to any target and M damage
 * to you" → ONE deal-damage atom with `selfDamage`; the resolver deals the target damage then M to
 * the CONTROLLER through the same applyDamageEffect (print order, unconditional).
 *
 * RE-1 PER-BLOCKER PUMP (Rabid Elephant class, the rampage sibling): "Whenever THIS CREATURE becomes
 * blocked, it gets +N/+M until end of turn for each creature blocking it" — a coverage-only
 * perBlockerPump descriptor (the LOW normal-path twin is evicted); checkBlockTriggers computes
 * N×count at fire time and fires from ONE blocker up (rampage counts beyond-the-first).
 *
 * CREED FPs guarded: the GROUP forms ("Whenever a creature you control / a Beast becomes blocked …"
 * — General Marhault Elsdragon, Berserk Murlodont) must NOT synthesize (the fire loop reads the
 * blocked attacker's own card — a group form would fire on the wrong scope); the self-hit must land
 * on the CONTROLLER only. Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { detectTriggers, checkBlockTriggers } from "./triggers.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ORCISH_ARTILLERY = { id: "oa", name: "Orcish Artillery", type: "Creature — Orc Warrior", mana: "{1}{R}{R}",
  power: "1", toughness: "3", oracle: "{T}: This creature deals 2 damage to any target and 3 damage to you." };
const RABID_ELEPHANT = { id: "re", name: "Rabid Elephant", type: "Creature — Elephant", mana: "{4}{G}",
  power: "3", toughness: "4", oracle: "Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it." };
const MARHAULT = { id: "gme", name: "General Marhault Elsdragon", type: "Legendary Creature — Elf Warrior", mana: "{3}{R}{G}",
  power: "3", toughness: "4", oracle: "Whenever a creature you control becomes blocked, it gets +3/+3 until end of turn for each creature blocking it." };

describe("OA-1 — parse + resolver", () => {
  it("the compound clause parses to ONE deal-damage atom with selfDamage", () => {
    const p = parseEffectClause("This creature deals 2 damage to any target and 3 damage to you.", "Creature");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 2, targetType: "any", selfDamage: 3 }]);
  });
  it("classify: Orcish Artillery → native-activated", () => {
    expect(classifyCard(ORCISH_ARTILLERY)).toBe("native-activated");
  });
  it("resolver: target takes N, the CONTROLLER takes M — nobody else", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const atom = { op: "deal-damage", amount: 2, targetType: "any", selfDamage: 3 };
    const before = { user: s.players.user.life, ai1: s.players.ai1.life, ai2: s.players.ai2.life };
    s = runEffectProgram(s, { source: { name: "Orcish Artillery" }, payload: { params: { program: { atoms: [atom] }, controller: "user", targets: [{ type: "player", id: "ai1" }], sourceId: "oa1" } } });
    expect(s.players.ai1.life).toBe(before.ai1 - 2);
    expect(s.players.user.life).toBe(before.user - 3);
    expect(s.players.ai2.life).toBe(before.ai2);
  });
});

describe("RE-1 — synthesis + fire-time dynamics", () => {
  it("the SELF form synthesizes exactly ONE perBlockerPump descriptor (the LOW twin evicted)", () => {
    const trigs = detectTriggers(RABID_ELEPHANT);
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "perBlockerPump", scope: "self" });
  });
  it("CREED — the GROUP form (Marhault) does NOT synthesize and the card stays body-only", () => {
    expect(detectTriggers(MARHAULT).filter((t) => t.event === "perBlockerPump")).toHaveLength(0);
    expect(classifyCard(MARHAULT)).toBe("body-only");
  });
  it("fires from ONE blocker (×1) and scales ×count — +4/+4 with two blockers", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const elephant = createPermanent({ id: "eperm", card: RABID_ELEPHANT, controller: "user", summoningSick: false });
    const b1 = createPermanent({ id: "b1", card: { name: "Bear A", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const b2 = createPermanent({ id: "b2", card: { name: "Bear B", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = {
      ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [elephant] }, ai1: { ...s.players.ai1, battlefield: [b1, b2] } },
      combat: { attackers: [{ permanentId: "eperm", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "eperm" }, { blockerId: "b2", attackerId: "eperm" }] },
    };
    const out = checkBlockTriggers(s);
    const pump = (out.pendingTriggers || []).find((t) => t.descriptor?.event === "perBlockerPump");
    expect(pump).toBeTruthy();
    expect(pump.descriptor.effectClause).toBe("this creature gets +4/+4 until end of turn");

    // Single blocker: fires ×1 (rampage would stay silent here).
    const s1 = { ...s, combat: { attackers: [{ permanentId: "eperm", defender: "ai1" }], blockers: [{ blockerId: "b1", attackerId: "eperm" }] } };
    const out1 = checkBlockTriggers(s1);
    const pump1 = (out1.pendingTriggers || []).find((t) => t.descriptor?.event === "perBlockerPump");
    expect(pump1?.descriptor?.effectClause).toBe("this creature gets +2/+2 until end of turn");
  });
});

// BLITZ BF-1 — the blocks-a-flyer pump (Netcaster Spider class), the same fire-time family.
const NETCASTER_SPIDER = { id: "ns", name: "Netcaster Spider", type: "Creature — Spider", mana: "{2}{G}",
  power: "2", toughness: "3", oracle: "Reach (This creature can block creatures with flying.)\nWhenever this creature blocks a creature with flying, this creature gets +2/+0 until end of turn." };

describe("BF-1 — blocks-a-flyer pump", () => {
  it("synthesizes the coverage-only descriptor; the card flips native-trigger", () => {
    const trigs = detectTriggers(NETCASTER_SPIDER);
    expect(trigs.filter((t) => t.event === "blocksFlyerPump")).toHaveLength(1);
    expect(classifyCard(NETCASTER_SPIDER)).toBe("native-trigger");
  });
  it("fires ONLY when the blocked attacker has flying (layer-aware at fire time)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const spider = createPermanent({ id: "sp", card: NETCASTER_SPIDER, controller: "user", summoningSick: false });
    const flyer = createPermanent({ id: "fl", card: { name: "Wind Drake", type: "Creature — Drake", power: "2", toughness: "2", oracle: "Flying" }, controller: "ai1", summoningSick: false });
    const ground = createPermanent({ id: "gr", card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [spider] }, ai1: { ...s.players.ai1, battlefield: [flyer, ground] } } };
    const vsFlyer = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "fl", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "sp", attackerId: "fl" }] } });
    const pump = (vsFlyer.pendingTriggers || []).find((t) => t.descriptor?.event === "blocksFlyerPump");
    expect(pump?.descriptor?.effectClause).toBe("this creature gets +2/+0 until end of turn");
    const vsGround = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "gr", attackingPlayer: "ai1", defender: "user" }], blockers: [{ blockerId: "sp", attackerId: "gr" }] } });
    expect((vsGround.pendingTriggers || []).some((t) => t.descriptor?.event === "blocksFlyerPump")).toBe(false);
  });
});

// BLITZ FL-1 — KW-FLANKING (CR 702.25), the same fire-time family: the blocked attacker's flanking
// debuffs each non-flanking blocker -1/-1, once PER printed instance; a flanking blocker is immune.
const BENALISH_CAVALRY = { id: "bc", name: "Benalish Cavalry", type: "Creature — Human Knight", mana: "{W}{W}",
  power: "2", toughness: "2", oracle: "Flanking (Whenever a creature without flanking blocks this creature, the blocking creature gets -1/-1 until end of turn.)" };

describe("FL-1 — flanking", () => {
  it("synthesizes per printed instance; grants and 'without flanking' phrases contribute 0", () => {
    expect(detectTriggers(BENALISH_CAVALRY).filter((t) => t.event === "flanking")).toHaveLength(1);
    expect(detectTriggers({ oracle: "Flanking, flanking", type: "Creature", name: "Double" }).filter((t) => t.event === "flanking")).toHaveLength(2);
    expect(detectTriggers({ oracle: "Knights you control have flanking.", type: "Creature", name: "Granter" }).filter((t) => t.event === "flanking")).toHaveLength(0);
    expect(classifyCard(BENALISH_CAVALRY)).toBe("native-body");
  });
  it("fires the -1/-1 onto a NON-flanking blocker (the triggering permanent); a flanking blocker is immune", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const knight = createPermanent({ id: "kn", card: BENALISH_CAVALRY, controller: "user", summoningSick: false });
    const plain = createPermanent({ id: "pl", card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai1", summoningSick: false });
    const rival = createPermanent({ id: "rv", card: { name: "Rival Knight", type: "Creature — Knight", power: "2", toughness: "2", oracle: "Flanking" }, controller: "ai1", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [knight] }, ai1: { ...s.players.ai1, battlefield: [plain, rival] } } };
    const vsPlain = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "kn", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "pl", attackerId: "kn" }] } });
    const fl = (vsPlain.pendingTriggers || []).filter((t) => t.descriptor?.event === "flanking");
    expect(fl).toHaveLength(1);
    expect(fl[0].context.triggeringPermanentId).toBe("pl"); // the -1/-1 lands on the blocker
    const vsRival = checkBlockTriggers({ ...s, combat: { attackers: [{ permanentId: "kn", attackingPlayer: "user", defender: "ai1" }], blockers: [{ blockerId: "rv", attackerId: "kn" }] } });
    expect((vsRival.pendingTriggers || []).filter((t) => t.descriptor?.event === "flanking")).toHaveLength(0);
  });
});
