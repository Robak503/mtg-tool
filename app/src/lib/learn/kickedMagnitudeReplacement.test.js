/**
 * kickedMagnitudeReplacement.test.js — "…deals 2 damage. If this spell was kicked, it deals 4 damage
 * INSTEAD." (Burst Lightning, Shivan Fire, Roil Eruption) and the pump twin (Might of Murasa, Explosive
 * Growth).
 *
 * ⭐ THE COMPLEMENT FLAG. `kickedOnly` has always existed for the ADDITIVE payoff ("<base>. If this spell was
 * kicked, scry 2."), where the base always runs and an extra atom is appended. A REPLACEMENT payoff needs
 * BOTH halves conditional — otherwise a kicked Burst Lightning deals 2 damage AND 4 damage. So this adds
 * `nonKickedOnly`, the exact mirror, and the pair is mutually exclusive: precisely one atom resolves per
 * cast, which is what "instead" means (CR 614). One arm of a pair, missing, for the sixth time this run.
 *
 * ⛔ THE KICKED ATOM IS A CLONE OF THE BASE, NOT AN INDEPENDENT PARSE, and that is the safety argument rather
 * than a convenience. The printed tail is ELLIPTICAL — "it deals 4 damage instead" names no target, "that
 * creature gets +5/+5" back-references one — so parsing it alone yields LOW at best and a DIFFERENT target
 * set at worst. Cloning makes op / targetType / restrictions identical by construction, so a replacement can
 * never silently retarget. The assertions below check the clone's IDENTITY, not just its number.
 */
import { describe, expect, it } from "vitest";

import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

// Printed oracle text, verified against the bundled Scryfall snapshot.
const BURST_LIGHTNING = {
  name: "Burst Lightning", type: "Instant", mana: "{R}",
  oracle: "Kicker {4}\nBurst Lightning deals 2 damage to any target. If this spell was kicked, it deals 4 damage instead.",
};
const MIGHT_OF_MURASA = {
  name: "Might of Murasa", type: "Instant", mana: "{1}{G}",
  oracle: "Kicker {2}{G}\nTarget creature gets +3/+3 until end of turn. If this spell was kicked, that creature gets +5/+5 until end of turn instead.",
};

const atomsOf = (c) => parseEffectProgram(c).atoms;

describe("⭐ the pair is mutually exclusive", () => {
  it("⭐ damage — base nonKickedOnly, kicked clone with the bigger number", () => {
    const a = atomsOf(BURST_LIGHTNING);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ op: "deal-damage", amount: 2, nonKickedOnly: true });
    expect(a[1]).toMatchObject({ op: "deal-damage", amount: 4, kickedOnly: true });
    // ⛔ EXACTLY ONE flag per atom. If both were set the atom could never resolve; if neither, both resolve
    // and the spell deals 2 AND 4 — the bug this whole file exists to prevent.
    expect(!!a[0].kickedOnly).toBe(false);
    expect(!!a[1].nonKickedOnly).toBe(false);
  });

  it("⛔⭐ the clone keeps the base's TARGETING — identical op, targetType and restrictions", () => {
    // The elliptical tail names no target. This is the assertion that would catch a from-scratch parse
    // inventing a different target set (or dropping a restriction) while the numbers still looked right.
    const [base, kicked] = atomsOf(BURST_LIGHTNING);
    expect(kicked.op).toBe(base.op);
    expect(kicked.targetType).toBe(base.targetType);
    expect(kicked.restrictions).toEqual(base.restrictions);
    // …and differ in EXACTLY one field beyond the two flags.
    const diff = Object.keys({ ...base, ...kicked })
      .filter((k) => !["kickedOnly", "nonKickedOnly"].includes(k))
      .filter((k) => JSON.stringify(base[k]) !== JSON.stringify(kicked[k]));
    expect(diff).toEqual(["amount"]);
  });

  it("⭐ pump — the same shape on ptDelta", () => {
    const [base, kicked] = atomsOf(MIGHT_OF_MURASA);
    expect(base).toMatchObject({ op: "pump", ptDelta: { p: 3, t: 3 }, nonKickedOnly: true });
    expect(kicked).toMatchObject({ op: "pump", ptDelta: { p: 5, t: 5 }, kickedOnly: true });
    expect(kicked.duration).toBe(base.duration);
    expect(kicked.targetType).toBe(base.targetType);
  });

  it("both cards classify native-spell", () => {
    expect(classifyCard(BURST_LIGHTNING)).toBe("native-spell");
    expect(classifyCard(MIGHT_OF_MURASA)).toBe("native-spell");
  });
});

describe("⛔⭐ RUNTIME — exactly ONE half resolves, which is what 'instead' means", () => {
  // ⚠️ THIS BLOCK EXISTS BECAUSE A MUTATION EXPOSED ITS ABSENCE. Deleting the `nonKickedOnly` skip from
  // runProgram left the ENTIRE 12,359-test suite green: every assertion above reads the PARSE shape, and
  // nothing resolved a kicked spell to see whether the base was actually suppressed. A flag the runtime
  // ignores is decoration — and the bug it hides is a kicked Burst Lightning dealing 2 damage AND 4.
  const board = () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const victim = createPermanent({ id: "v", controller: "ai", card: { id: "v", name: "Victim", type: "Creature — Bear", power: 9, toughness: 9 } });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [victim] } } };
  };
  const damageAfter = (kicked) => {
    const program = parseEffectProgram(BURST_LIGHTNING);
    const stackObj = {
      source: { name: BURST_LIGHTNING.name },
      payload: { params: { program, controller: "user", targets: [{ type: "creature", id: "v" }], kicked } },
    };
    const next = runEffectProgram(board(), stackObj);
    const v = next.players.ai.battlefield.find((p) => p.id === "v");
    return v?.damageMarked ?? 0;
  };

  it("⭐ NOT kicked → 2 damage (the base only)", () => {
    expect(damageAfter(false)).toBe(2);
  });

  it("⭐ KICKED → 4 damage, NOT 6 — the base is genuinely suppressed", () => {
    // 6 is the number a missing `nonKickedOnly` skip produces, and it is why this assertion is worth more
    // than every parse assertion in this file combined.
    expect(damageAfter(true)).toBe(4);
  });
});

describe("⛔ CREED — everything that is not a pure magnitude swap still refuses", () => {
  const refuses = (name, oracle, type = "Instant") => {
    const card = { name, type, mana: "{2}{R}", oracle };
    expect(classifyCard(card)).not.toBe("native-spell");
  };

  it("⛔ an EXTRA RIDER on the replacement — the lossy-tail direction, inverted", () => {
    // ⭐ On a REPLACEMENT an unread rider makes the kicked mode UNDER-deliver while the card reads native.
    // Same inversion the spend-restriction slice hit: in negative space and in replacements, "reading less
    // than is printed" is not the safe direction it usually is.
    refuses("Urza's Rage", "Kicker {8}{R}\nUrza's Rage deals 3 damage to any target. If this spell was kicked, instead it deals 10 damage to that permanent or player and the damage can't be prevented.");
    refuses("Colossal Growth", "Kicker {4}{G}\nTarget creature gets +2/+2 until end of turn. If this spell was kicked, instead that creature gets +4/+4 and gains trample and haste until end of turn.");
  });

  it("⛔ a DIFFERENT recipient is a different effect, not a bigger one", () => {
    // A single-target base may not be replaced by a mass effect, or the reverse — the magnitude is not the
    // only thing that changed, so the clone would be a lie.
    refuses("Fake Bolt", "Kicker {4}\nFake Bolt deals 2 damage to any target. If this spell was kicked, it deals 4 damage to each creature instead.");
  });

  it("⛔ an op outside the supported set still refuses (draw)", () => {
    refuses("Field Research", "Kicker {2}{U}\nDraw two cards. If this spell was kicked, draw three cards instead.", "Sorcery");
  });

  it("⛔ a MULTI-ATOM base has no single magnitude to replace", () => {
    refuses("Fake Pair", "Kicker {4}\nFake Pair deals 2 damage to any target. Draw a card. If this spell was kicked, it deals 4 damage instead.");
  });

  it("⛔ and the ADDITIVE path is untouched — it still appends, with no nonKickedOnly anywhere", () => {
    const runic = { name: "Runic Shot", type: "Instant", mana: "{2}{W}", oracle: "Kicker {2}\nDestroy target tapped creature. If this spell was kicked, scry 2." };
    const a = atomsOf(runic);
    expect(programConfidence(parseEffectProgram(runic))).toBe("high");
    expect(a.map((x) => !!x.kickedOnly)).toEqual([false, true]);
    expect(a.some((x) => x.nonKickedOnly)).toBe(false);   // the base still ALWAYS runs on an additive payoff
  });
});
