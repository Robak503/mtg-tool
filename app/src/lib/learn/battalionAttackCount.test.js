/**
 * battalionAttackCount.test.js — BATTALION (CR 702.101a). Twenty-two carriers, ZERO native before this.
 *
 * "Battalion — Whenever this creature and at least two other creatures attack, …" (Legion Loyalist,
 * Firemane Avenger, Tajic, Haazda Marshal, Daring Skyjek …). `detectTriggers` returned NOTHING for any of
 * them, so the whole family sat on the Arbiter.
 *
 * ── THE CAUSE WAS TWO INDEPENDENT GAPS, and each hid the other ──────────────────────────────────────────
 * ① THE ABILITY-WORD LABEL. `battalion` was simply absent from the shared CR 207.2c label list in
 *    textNormalize.js, so the trigger sentence never got its prefix stripped. NOT guessed — a `Landfall —`
 *    prefix was measured detecting fine on the identical sentence, which is what proved the label list
 *    rather than the label MECHANISM was at fault. (`battle cry` was missing too and went in beside it.)
 * ② THE CONDITION. Nothing could express "and at least two other creatures attack". Measured with the
 *    label removed, so ① could not mask it:
 *        "Whenever this creature and at least two other creatures attack, draw a card."  -> 0 triggers
 *        "Whenever this creature attacks, draw a card."                                  -> 1 trigger
 *
 * ── WHY IT RIDES `youAttack` AND NOT `attacks` ──────────────────────────────────────────────────────────
 * Battalion fires ONCE per combat. Routing it through the per-attacker `attacks` event would fire once per
 * attacker — a three-creature alpha strike triggering three times. That is the exact over-fire the
 * batched-attack note in triggers.js already exists to prevent, so this reuses the once-per-combat lane and
 * adds two gate fields instead.
 *
 * ⛔ THE FIELD WHITELIST BIT, AND THIS FILE'S OWN COMMENTS PREDICTED IT. The descriptor build lists every
 * field it copies off the classifier result; an UNLISTED field is silently dropped. On the first attempt
 * `minAttackers`/`requireSelfAttacking` were not listed, so the descriptor decayed to a bare "whenever you
 * attack" — detection looked perfect (`event: "youAttack"`) while the card would have triggered off a
 * SINGLE attacker. Four separate comments in that whitelist warn about exactly this shape. Both fields are
 * now listed, with their own warnings.
 *
 * `requireSelfAttacking` is the second half and is not optional: battalion says "THIS CREATURE and …", so
 * without it a battalion creature sitting at home triggers off three OTHER attackers — strictly better than
 * printed, the forbidden direction. Pinned below on a real board.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test):
 * `minAttackers` dropped from the whitelist -> the too-few-attackers pins go red while detection still
 * reports youAttack; `requireSelfAttacking` dropped -> the source-at-home pin goes red; `battalion` removed
 * from the label list -> every flip pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HAAZDA_MARSHAL = { id: "c-hm", name: "Haazda Marshal", type: "Creature — Human Soldier", mana: "{W}",
  power: 1, toughness: 1, oracle: "Whenever this creature and at least two other creatures attack, create a 1/1 white Soldier creature token with vigilance." };
const DARING_SKYJEK = { id: "c-ds", name: "Daring Skyjek", type: "Creature — Human Soldier", mana: "{1}{W}",
  power: 3, toughness: 1, oracle: "Battalion — Whenever this creature and at least two other creatures attack, this creature gains flying until end of turn." };
const TAJIC = { id: "c-tj", name: "Tajic, Blade of the Legion", type: "Legendary Creature — Human Soldier", mana: "{2}{R}{W}",
  power: 2, toughness: 2, oracle: "Indestructible\nBattalion — Whenever Tajic and at least two other creatures attack, Tajic gets +5/+5 until end of turn." };

const perm = (card, id) => ({ id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
const bear = (id) => perm({ name: `Bear${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, id);

/** Declare `attackerIds` as the attacking batch and count the triggers checkAttackTriggers enqueues. */
function triggersFired(card, attackerIds) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const battlefield = [perm(card, "src"), bear("b1"), bear("b2"), bear("b3")];
  const s = { ...b, activePlayer: "user", phase: "combat", step: "declare-attackers",
    players: { ...b.players, user: { ...b.players.user, battlefield } },
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })) } };
  const after = checkAttackTriggers(s);
  return (after.pendingTriggers || after.triggerQueue || []).length || (after.stack || []).length;
}

describe("detection — both gaps closed", () => {
  it("the labelled and unlabelled forms both detect, with the gate fields intact", () => {
    for (const card of [HAAZDA_MARSHAL, DARING_SKYJEK, TAJIC]) {
      const [t, ...rest] = detectTriggers(card).filter((d) => d.event === "youAttack");
      expect(rest).toHaveLength(0);
      expect(t).toMatchObject({ event: "youAttack", minAttackers: 3, requireSelfAttacking: true });
      expect(triggerRoutesNatively(t, card)).toBe(true);
    }
  });

  it("the carriers flip", () => {
    expect(classifyCard(HAAZDA_MARSHAL)).toBe("native-trigger");
    expect(classifyCard(DARING_SKYJEK)).toBe("native-trigger");
    expect(classifyCard(TAJIC)).toBe("native-trigger");
  });

  it("⛔ a PLAIN 'whenever you attack' is untouched — no count gate, byte-for-byte", () => {
    const plain = { id: "c-pl", name: "Plain Watcher", type: "Creature — Human", mana: "{W}", power: 1, toughness: 1,
      oracle: "Whenever you attack, draw a card." };
    const [t] = detectTriggers(plain);
    expect(t.event).toBe("youAttack");
    expect(t.minAttackers).toBeUndefined();
    expect(t.requireSelfAttacking).toBeUndefined();
  });
});

describe("⭐ LAW 6 — the firing gate on a real declared batch", () => {
  it("fires at exactly three attackers including the source", () => {
    expect(triggersFired(HAAZDA_MARSHAL, ["src", "b1", "b2"])).toBe(1);
  });

  it("still fires above the threshold, and only ONCE per combat", () => {
    // The whole reason this rides youAttack: on the per-attacker lane a 4-creature strike would fire 4×.
    expect(triggersFired(HAAZDA_MARSHAL, ["src", "b1", "b2", "b3"])).toBe(1);
  });

  it("⛔ does NOT fire below the threshold", () => {
    expect(triggersFired(HAAZDA_MARSHAL, ["src", "b1"])).toBe(0);
    expect(triggersFired(HAAZDA_MARSHAL, ["src"])).toBe(0);
  });

  it("⛔ does NOT fire when the SOURCE stayed home, however many others attack", () => {
    // Without requireSelfAttacking this is the forbidden direction: a battalion creature that never
    // attacked collecting its own trigger off three teammates.
    expect(triggersFired(HAAZDA_MARSHAL, ["b1", "b2", "b3"])).toBe(0);
  });

  it("a plain 'whenever you attack' watcher still fires off a single attacker", () => {
    const plain = { id: "c-pl", name: "Plain Watcher", type: "Creature — Human", mana: "{W}", power: 1, toughness: 1,
      oracle: "Whenever you attack, draw a card." };
    expect(triggersFired(plain, ["b1"])).toBe(1);
  });
});

/**
 * ⭐ THE UNLABELLED TWIN — "Whenever you attack with N or more creatures" (Military Intelligence,
 * Overwhelming Instinct, Meddling Youths, Armasaur Guide, Seasoned Consultant, Escarpment Fortress,
 * Chivalric Alliance). Same once-per-combat lane, same `minAttackers` gate, NO self requirement — this
 * wording never names the source as an attacker, and an enchantment carries it (Military Intelligence
 * cannot attack at all).
 *
 * ⛔ IT WAS BLOCKED BY MATCHER ORDER, NOT BY ITS ANCHOR, and no amount of rewriting the regex would have
 * found that. A broad qualifier guard rejects ANY condition containing "with" — so the arm placed beside
 * the other youAttack matchers was NEVER REACHED. Proven by dumping the condition at two points: it
 * printed at the top of classifyCondition and never at the matcher. The arm now sits ABOVE that guard,
 * whole-string anchored so moving it earlier cannot widen anything; every other "with" condition still
 * hits the guard unchanged. The battalion twin needs no move — its wording carries no "with".
 */
describe("the unlabelled attack-count twin", () => {
  const MILITARY_INTELLIGENCE = { id: "c-mi", name: "Military Intelligence", type: "Enchantment", mana: "{1}{U}",
    oracle: "Whenever you attack with two or more creatures, draw a card." };
  const OVERWHELMING_INSTINCT = { id: "c-oi", name: "Overwhelming Instinct", type: "Enchantment", mana: "{2}{G}",
    oracle: "Whenever you attack with three or more creatures, draw a card." };

  it("detects with the count gate and NO self requirement", () => {
    const [t] = detectTriggers(MILITARY_INTELLIGENCE);
    expect(t).toMatchObject({ event: "youAttack", minAttackers: 2 });
    expect(t.requireSelfAttacking).toBeUndefined();
    expect(detectTriggers(OVERWHELMING_INSTINCT)[0]).toMatchObject({ event: "youAttack", minAttackers: 3 });
  });

  it("the carriers flip", () => {
    expect(classifyCard(MILITARY_INTELLIGENCE)).toBe("native-trigger");
    expect(classifyCard(OVERWHELMING_INSTINCT)).toBe("native-trigger");
  });

  it("⭐ LAW 6 — fires at the threshold, not below, and the SOURCE need not attack", () => {
    // The enchantment is never an attacker, so a self requirement here would make it dead. Two bears
    // attacking is enough; one is not.
    expect(triggersFired(MILITARY_INTELLIGENCE, ["b1", "b2"])).toBe(1);
    expect(triggersFired(MILITARY_INTELLIGENCE, ["b1"])).toBe(0);
    expect(triggersFired(OVERWHELMING_INSTINCT, ["b1", "b2"])).toBe(0);
    expect(triggersFired(OVERWHELMING_INSTINCT, ["b1", "b2", "b3"])).toBe(1);
  });

  it("⛔ every OTHER 'with' condition still hits the qualifier guard (the move widened nothing)", () => {
    expect(detectTriggers({ id: "c-x", name: "Odd Watcher", type: "Enchantment", mana: "{1}{U}",
      oracle: "Whenever you attack with a creature named Bob, draw a card." })).toEqual([]);
  });
});
