/**
 * itsPowerLifegain.test.js — "you gain life equal to its power" on a SELF trigger.
 *
 * ⭐ THE WHOLE SLICE IS A REFERENT PROBLEM. The clause text is byte-identical across the corpus, but "its"
 * names a different object — with a different READ PATH — depending on the ability it hangs off:
 *
 *   dies  (Bottle Golems, Willow Geist, Conclave Mentor, Packsong Pup) → the creature is GONE at resolution.
 *         Its power exists only as the CR 603.6e look-back checkDiesTriggers stamped (ctx.dyingPower).
 *   etb   (Boulderbranch Golem, Sunscourge Champion)                   → the creature is ON the battlefield,
 *         so the existing triggering-creature sentinel (ctx.triggeringPermanentId) is exactly right.
 *   spell (Chastise, Infernal Reckoning, Rashida Scalebane)            → "its" = the destroyed/exiled TARGET.
 *   cost  (Syr Ginger)                                                 → the permanent sacrificed to pay.
 *   watch (Captain Marvel)                                             → an exiled-creature watcher.
 *
 * A single context-free arm would bind ONE of those and silently resolve the rest to 0 — a dropped clause,
 * the forbidden FP. So detectTriggers picks the sentinel from the EVENT, and the last three shapes never
 * reach the rewrite at all: they stay body-only (SAFE FNs), pinned below.
 *
 * ⭐ LEADS WITH RUNTIME. The flip-diff proves these cards PARSE; it cannot tell a correct read from a read
 * that returns 0. Both halves of this slice would have "parsed" perfectly while gaining nothing, so every
 * enforcement test below asserts an actual LIFE TOTAL. (Nothing in the suite drove the dyingPower→gain-life
 * path end to end before this file — Lifeblood Hydra's payoff was classification-tested only.)
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { detectTriggers, checkDiesTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause } from "./effects/parser.js";
import { permanentPower } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles + P/T (bundled Scryfall snapshot).
const BOTTLE_GOLEMS = { id: "bg-card", name: "Bottle Golems", type: "Artifact Creature — Golem", power: "3", toughness: "3", mana: "{4}",
  oracle: "Trample\nWhen this creature dies, you gain life equal to its power." };
const WILLOW_GEIST = { id: "wg-card", name: "Willow Geist", type: "Creature — Treefolk Spirit", power: "1", toughness: "1", mana: "{G}",
  oracle: "Trample\nWhenever one or more cards leave your graveyard, put a +1/+1 counter on this creature.\nWhen this creature dies, you gain life equal to its power." };
const PACKSONG_PUP = { id: "pp-card", name: "Packsong Pup", type: "Creature — Wolf", power: "1", toughness: "1", mana: "{1}{G}",
  oracle: "At the beginning of combat on your turn, if you control another Wolf or Werewolf, put a +1/+1 counter on this creature.\nWhen this creature dies, you gain life equal to its power." };
const CONCLAVE_MENTOR = { id: "cm-card", name: "Conclave Mentor", type: "Creature — Centaur Cleric", power: "2", toughness: "2", mana: "{G}{W}",
  oracle: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on that creature instead.\nWhen this creature dies, you gain life equal to its power." };
const BOULDERBRANCH = { id: "bb-card", name: "Boulderbranch Golem", type: "Artifact Creature — Golem", power: "6", toughness: "5", mana: "{7}",
  oracle: "Prototype {3}{G} — 3/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nWhen this creature enters, you gain life equal to its power." };
const SUNSCOURGE_TOKEN = { id: "sc-card", name: "Sunscourge Champion", type: "Token Creature — Zombie Human Wizard", power: "4", toughness: "4", mana: "",
  oracle: "When Sunscourge Champion enters the battlefield, you gain life equal to its power." };

// ⛔ THE REFUSED REFERENTS — same clause, an antecedent this slice does NOT model.
const CHASTISE = { name: "Chastise", type: "Instant", mana: "{3}{W}",
  oracle: "Destroy target attacking creature. You gain life equal to its power." };
const INFERNAL_RECKONING = { name: "Infernal Reckoning", type: "Instant", mana: "{B}",
  oracle: "Exile target colorless creature. You gain life equal to its power." };
const RASHIDA = { name: "Rashida Scalebane", type: "Legendary Creature — Human Soldier", power: "3", toughness: "4", mana: "{3}{W}{W}",
  oracle: "{T}: Destroy target attacking or blocking Dragon. It can't be regenerated. You gain life equal to its power." };
const SYR_GINGER = { name: "Syr Ginger, the Meal Ender", type: "Legendary Artifact Creature — Food Knight", power: "3", toughness: "1", mana: "{2}",
  oracle: "Syr Ginger has trample, hexproof, and haste as long as an opponent controls a planeswalker.\nWhenever another artifact you control is put into a graveyard from the battlefield, put a +1/+1 counter on Syr Ginger and scry 1.\n{2}, {T}, Sacrifice Syr Ginger: You gain life equal to its power." };
const CAPTAIN_MARVEL = { name: "Captain Marvel, Shooting Star", type: "Legendary Creature — Human Kree Hero", power: "6", toughness: "6", mana: "{5}{W}{W}",
  oracle: "Flying\nWhenever Captain Marvel enters or attacks, exile up to one target creature. That creature's controller gains life equal to its power.\nWhenever a creature other than Captain Marvel is exiled from the battlefield, you gain life equal to its power." };

const baseState = () => {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
};
const withBattlefield = (state, pid, perms) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } });
const markLethal = (state, pid, permId) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid],
  battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } });
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

/** Put `card` on the battlefield (optionally with counters), kill it, let its dies trigger resolve. */
function killIt(card, permId, counters) {
  let s = baseState();
  // createPermanent hardcodes counters:{} and ignores extra props, so counters go on AFTER construction.
  // (The powerAtDeath control below caught exactly this — the first draft passed them in and they vanished.)
  const perm = { ...createPermanent({ id: permId, card, controller: "user", summoningSick: false }), ...(counters && { counters }) };
  s = withBattlefield(s, "user", [perm]);
  const lifeBefore = s.players.user.life;
  const powerAtDeath = permanentPower(s, permId);
  const lethal = destroyLethalCreatures(markLethal(s, "user", permId));
  s = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
  return { lifeBefore, powerAtDeath, lifeAfter: s.players.user.life, state: s };
}

describe("⭐ ENFORCEMENT (dies) — the life actually arrives, and it is the DEAD creature's power", () => {
  it("VACUITY CONTROL: the life reader returns a real starting total", () => {
    // Without this, every "gained N life" assertion below could be comparing undefined to undefined.
    expect(typeof baseState().players.user.life).toBe("number");
    expect(baseState().players.user.life).toBeGreaterThan(0);
  });

  it("Bottle Golems (3/3) dies → +3 life", () => {
    const r = killIt(BOTTLE_GOLEMS, "bg");
    // ⭐ THE DISCRIMINATING ASSERTION. The creature is in the graveyard when this resolves, so any
    // implementation that reads the LIVE board (findPermanent → null) gains 0 and leaves life unchanged.
    expect(r.lifeAfter).toBe(r.lifeBefore + 3);
  });

  it("⭐ Willow Geist grown to 3/3 by counters dies → +3, NOT its printed 1", () => {
    const r = killIt(WILLOW_GEIST, "wg", { "+1/+1": 2 });
    expect(r.powerAtDeath).toBe(3);                       // control: it really was a 3/3 as it died
    expect(r.lifeAfter).toBe(r.lifeBefore + 3);           // LKI is the LAST-KNOWN power (CR 603.6e), not base
    expect(r.lifeAfter).not.toBe(r.lifeBefore + 1);       // the base-P/T misread this test exists to catch
  });

  it("Packsong Pup grown to 2/2 dies → +2", () => {
    const r = killIt(PACKSONG_PUP, "pp", { "+1/+1": 1 });
    expect(r.lifeAfter).toBe(r.lifeBefore + 2);
  });

  it("Conclave Mentor (2/2) dies → +2", () => {
    const r = killIt(CONCLAVE_MENTOR, "cm");
    expect(r.lifeAfter).toBe(r.lifeBefore + 2);
  });

  it("the dead creature is gone from the battlefield — the gain is genuinely a look-back read", () => {
    const r = killIt(BOTTLE_GOLEMS, "bg");
    expect(r.state.players.user.battlefield.some((p) => p.card?.name === "Bottle Golems")).toBe(false);
  });
});

describe("⭐ ENFORCEMENT (etb) — the SAME clause text, the LIVE creature's power", () => {
  const enterIt = (card, permId) => {
    let s = baseState();
    const perm = createPermanent({ id: permId, card, controller: "user", summoningSick: true });
    s = withBattlefield(s, "user", [perm]);
    const lifeBefore = s.players.user.life;
    s = resolveAll(checkEnterTriggers(s, perm));   // takes ONE entering permanent, not an array
    return { lifeBefore, lifeAfter: s.players.user.life };
  };

  it("Boulderbranch Golem (6/5) enters → +6 (POWER, not toughness, and not 0)", () => {
    const r = enterIt(BOULDERBRANCH, "bb");
    expect(r.lifeAfter).toBe(r.lifeBefore + 6);
    expect(r.lifeAfter).not.toBe(r.lifeBefore + 5);   // the power/toughness swap this arm could have made
  });

  it("Sunscourge Champion token (4/4) enters → +4", () => {
    const r = enterIt(SUNSCOURGE_TOKEN, "sc");
    expect(r.lifeAfter).toBe(r.lifeBefore + 4);
  });
});

describe("the sentinel rewrite — the event picks the referent", () => {
  it("a dies trigger rewrites to the DYING sentinel; an etb trigger to the TRIGGERING one", () => {
    expect(detectTriggers(BOTTLE_GOLEMS)[0].effectClause).toBe("you gain life equal to the dying creature's power");
    expect(detectTriggers(BOULDERBRANCH)[0].effectClause).toBe("you gain life equal to the triggering creature's power");
  });

  it("each sentinel parses to its own magnitude — a look-back CONTEXT vs a live count SPEC", () => {
    expect(parseEffectClause("you gain life equal to the dying creature's power", "Instant")?.atoms)
      .toEqual([{ op: "gain-life", countContext: "dyingPower", targetType: null }]);
    expect(parseEffectClause("you gain life equal to the triggering creature's power", "Instant")?.atoms)
      .toEqual([{ op: "gain-life", amountCount: { kind: "triggeringPower", per: 1 }, targetType: null }]);
  });

  it("⛔ the raw 'its power' clause still parses to NOTHING on its own", () => {
    // The rewrite is the ONLY way in. A spell body carrying this text never becomes a lifegain atom.
    expect(parseEffectClause("you gain life equal to its power", "Instant")?.atoms).toEqual([]);
  });

  it("⛔ a rider defeats the whole-clause anchor → no rewrite (a SAFE FN, not a partial parse)", () => {
    const rider = { ...BOTTLE_GOLEMS, oracle: "When this creature dies, you gain life equal to its power and draw a card." };
    expect(detectTriggers(rider)[0].effectClause).not.toMatch(/dying creature/);
  });

  it("⛔ scope:self is required — a WATCHER keeps its raw clause and stays body-only", () => {
    // These have no corpus carrier, so the gate costs nothing today. It is deliberately tighter than the
    // semantics strictly require: on a watcher fire the referent is a DIFFERENT object from the trigger's
    // source, and this slice has runtime-verified the per-fire stamp only for the self case. Unverified →
    // stays body-only (a SAFE FN), rather than routing on an assumption. Both mutation-covered.
    const diesWatcher = { name: "W", type: "Creature — Bear", power: "2", toughness: "2",
      oracle: "Whenever another creature you control dies, you gain life equal to its power." };
    const etbWatcher = { name: "W2", type: "Creature — Bear", power: "2", toughness: "2",
      oracle: "Whenever another creature enters the battlefield under your control, you gain life equal to its power." };
    expect(detectTriggers(diesWatcher)[0].scope).toBe("otherCreatureYouControl");
    expect(detectTriggers(diesWatcher)[0].effectClause).toBe("you gain life equal to its power");
    expect(detectTriggers(etbWatcher)[0].effectClause).toBe("you gain life equal to its power");
    expect(classifyCard(diesWatcher)).not.toMatch(/^native/);
    expect(classifyCard(etbWatcher)).not.toMatch(/^native/);
  });
});

describe("⛔ THE REFERENT GATE — dyingPower can only route off the event that stamps it", () => {
  it("the dying sentinel does NOT route natively on a non-dies event", () => {
    // An absent ctx.dyingPower reads 0 — a silently dropped clause. The gate makes that unreachable.
    const clause = "you gain life equal to the dying creature's power";
    expect(triggerRoutesNatively({ event: "dies", effectClause: clause })).toBe(true);
    expect(triggerRoutesNatively({ event: "etb", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "attacks", effectClause: clause })).toBe(false);
  });
});

describe("the corpus rows", () => {
  it("all six carriers flip", () => {
    expect(classifyCard(BOTTLE_GOLEMS)).toBe("native-trigger");
    expect(classifyCard(WILLOW_GEIST)).toBe("native-trigger");
    expect(classifyCard(PACKSONG_PUP)).toBe("native-trigger");
    expect(classifyCard(BOULDERBRANCH)).toBe("native-trigger");
    expect(classifyCard(SUNSCOURGE_TOKEN)).toBe("native-trigger");
    expect(classifyCard(CONCLAVE_MENTOR)).toBe("native-mixed");   // + its replacement-effect static line
  });

  it("⛔ CREED — the four unmodeled antecedents stay body-only", () => {
    // Each of these would have been a FALSE POSITIVE under a context-free "its power" arm: the referent
    // they name is never stamped on the path they resolve through, so the clause would gain 0 in silence.
    for (const c of [CHASTISE, INFERNAL_RECKONING, RASHIDA, SYR_GINGER, CAPTAIN_MARVEL]) {
      expect(classifyCard(c)).not.toMatch(/^native/);
    }
  });
});
