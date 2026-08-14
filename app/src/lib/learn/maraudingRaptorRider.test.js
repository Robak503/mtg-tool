/**
 * maraudingRaptorRider.test.js — MARAUDING RAPTOR + the DAMAGE-RIDER machinery (2026-08-14).
 * "Whenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is
 * dealt damage this way, this creature gets +2/+0 until end of turn." Rider: Aether Flash (the
 * any-creature watcher, no rider — same referent sentinel).
 *
 * ⭐ THE HONESTY LINE: "dealt damage this way" is NOT subtype-alone — the rider's interveningIf
 * predicate reads the victim's `damagedBy` list, which the noncombat damage path now stamps (mirroring
 * the combat funnel's recordDamageSource) ONLY when damage actually landed. A prevention shield zeroes
 * the hit BEFORE the stamp, so a fully-prevented Dinosaur is never falsely "dealt damage this way".
 * That prevention witness is the whole reason this design exists (the subtype-only shortcut was
 * refused as an FP lane — see the wake-report design note).
 *
 * ⭐ The pieces: the ETB entering-creature sentinels ("to it" → "to the triggering creature"; the rider
 * condition → the sentinel phrase no card prints), the parser's DAMAGE-RIDER arm (spell-mastery's
 * template, gated on interveningIfParseable — the TRIGGER-side probe), triggeringPermanentId threaded
 * into applyConditional's context, and the two residue strips (permanentTriggersCovered + the
 * composite chain — the Raptor also carries a cost-reduction static, hence native-MIXED).
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the damagedBy stamp removed from the noncombat path -> the TRUE-branch witness dies (verdict false).
 *   · the predicate's wasDamagedBySource conjunct dropped -> the PREVENTION witness dies (shield ignored).
 *   · the parser arm disabled -> both carriers park.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { applyDamageEffect } from "./spellEffects.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RAPTOR = { id: "c-mr", name: "Marauding Raptor", type: "Creature — Dinosaur", mana: "{1}{R}", power: "2", toughness: "3",
  oracle: "Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn." };
const COND = "the triggering creature is a dinosaur dealt damage by this source";

/** The Raptor + a fresh victim on the user's battlefield; returns state + ids. */
function board(victimCard, { shield = 0 } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const raptor = createPermanent({ id: "RAP", controller: "user", summoningSick: false, card: { id: "card-RAP", ...RAPTOR } });
  const victim = createPermanent({ id: "VIC", controller: "user", summoningSick: false, card: { id: "card-VIC", oracle: "", ...victimCard } });
  const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [raptor, victim] } } };
  return shield > 0 ? { ...s, preventionShields: [{ targetKind: "creature", targetId: "VIC", amount: shield, turn: s.turn }] } : s;
}
const hit = (s) => applyDamageEffect(s, { controller: "user", amount: 2, targetType: "creature", targets: [{ type: "creature", id: "VIC" }], source: { id: "RAP", card: RAPTOR } });
const verdict = (s) => evaluateInterveningIf(s, COND, "user", { triggeringPermanentId: "VIC", sourcePermanentId: "RAP" });

describe("the carriers and the program", () => {
  it("⭐ Raptor flips native-mixed (static + trigger); Aether Flash rides native-trigger", () => {
    expect(classifyCard(RAPTOR)).toBe("native-mixed");
    expect(classifyCard({ name: "Aether Flash", type: "Enchantment", mana: "{2}{R}{R}",
      oracle: "Whenever a creature enters, Aether Flash deals 2 damage to it." })).toBe("native-trigger");
    const p = parseEffectClause("this creature deals 2 damage to the triggering creature. if the triggering creature is a dinosaur dealt damage by this source, this creature gets +2/+0 until end of turn", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["deal-damage", "conditional"]);
    expect(p.atoms[1]).toMatchObject({ branchOn: COND, ifFalse: [] });
  });
});

describe("⭐⭐ LAW 6 — the rider reads the REAL hit, never subtype alone", () => {
  it("⭐⭐ a Dinosaur takes the hit: damagedBy stamped, verdict TRUE", () => {
    const s = hit(board({ name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4" }));
    const vic = s.players.user.battlefield.find((p) => p.id === "VIC");
    const row = { damagedBy: vic.damagedBy || [], verdict: verdict(s) };
    console.log("  WITNESS raptorDinoHit", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ damagedBy: ["RAP"], verdict: true });
  });

  it("⛔ a NON-Dinosaur takes the hit: verdict FALSE (the subtype conjunct)", () => {
    const s = hit(board({ name: "Bear", type: "Creature — Bear", power: "2", toughness: "2" }));
    console.log("  WITNESS raptorBearHit", JSON.stringify({ verdict: verdict(s) })); // vitest 4 needs --disable-console-intercept
    expect(verdict(s)).toBe(false);
  });

  it("⛔⛔ PREVENTION: a shielded Dinosaur takes NO damage — no stamp, verdict FALSE (the design's whole point)", () => {
    const s = hit(board({ name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4" }, { shield: 2 }));
    const vic = s.players.user.battlefield.find((p) => p.id === "VIC");
    const row = { damageMarked: vic.damageMarked || 0, damagedBy: vic.damagedBy || [], verdict: verdict(s) };
    console.log("  WITNESS raptorShielded", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ damageMarked: 0, damagedBy: [], verdict: false });
  });

  it("⛔ a missing referent fail-closes (null, never a guessed branch)", () => {
    const s = hit(board({ name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4" }));
    expect(evaluateInterveningIf(s, COND, "user", { sourcePermanentId: "RAP" })).toBe(null);
  });
});
