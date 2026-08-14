/**
 * templeAltisaur.test.js — THE SUBTYPE-SCOPED PARTIAL PREVENTION (2026-08-14). Temple Altisaur: "If a
 * source would deal damage to another Dinosaur you control, prevent all but 1 of that damage."
 *
 * ⭐ THE MODULE'S LONG-ANTICIPATED PREVENT-N: the damageReplacements design notes promised the op slot
 * ("so triple, +N, and a future prevent-N drop in without a rewrite") — this slice delivers it. Three
 * pieces: the parse entry (target-side, live subtype filter, CR 109.5 excludeSelf), the target-subtype
 * scope matcher (front-face read + "you control" + not-itself), and the preventAllBut op — a CAP at N,
 * never a raise (a 1-damage ping still deals 1).
 *
 * ⛔ damagedBy HONESTY holds by construction: the cap runs in the CONSULT (before the hit), so a capped
 * hit still deals 1 → the stamp lands for 1 real damage — the Raptor rider reads truth either way.
 *
 * Whole-card audit: the card IS its one static sentence.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the parse entry disabled -> the Altisaur parks.
 *   · the excludeSelf gate dropped in the matcher -> the Altisaur caps damage to ITSELF (the ⛔ self
 *     witness dies — strictly better than printed, the forbidden direction).
 *   · the preventAllBut op unhandled -> the cap witness dies (full 5 lands).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseDamageReplacements } from "./damageReplacements.js";
import { applyDamageEffect } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ALTISAUR = { id: "c-ta", name: "Temple Altisaur", type: "Creature — Dinosaur", mana: "{4}{W}", power: "4", toughness: "5",
  oracle: "If a source would deal damage to another Dinosaur you control, prevent all but 1 of that damage." };

function board() {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const mk = (id, controller, card) => createPermanent({ id, controller, summoningSick: false, card: { id: "card-" + id, oracle: "", ...card } });
  return { ...g, players: { ...g.players,
    user: { ...g.players.user, battlefield: [
      mk("TA", "user", ALTISAUR),
      mk("REG", "user", { name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "6" }),
      mk("BEAR", "user", { name: "Bear", type: "Creature — Bear", power: "2", toughness: "6" }),
    ] },
    ai1: { ...g.players.ai1, battlefield: [mk("EDINO", "ai1", { name: "Enemy Dino", type: "Creature — Dinosaur", power: "3", toughness: "6" })] } } };
}
const hit = (s, id, amount = 5) => applyDamageEffect(s, { controller: "ai1", amount, targetType: "creature", targets: [{ type: "creature", id }], source: null });
const marked = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id)?.damageMarked || 0;

describe("the carrier and the entry", () => {
  it("⭐ the Altisaur flips native-static; the entry is target-side/subtype/excludeSelf with the cap", () => {
    expect(classifyCard(ALTISAUR)).toBe("native-static");
    expect(parseDamageReplacements(ALTISAUR)).toEqual([
      { op: { op: "preventAllBut", floor: 1 }, scope: { side: "target", targetSubtype: "dinosaur", excludeSelf: true } },
    ]);
  });
});

describe("⭐⭐ LAW 6 — the cap protects OTHER Dinos you control, and nothing else", () => {
  it("⭐⭐ 5 damage to ANOTHER Dinosaur you control: exactly 1 lands", () => {
    const s = hit(board(), "REG");
    const row = { regisaur: marked(s, "user", "REG") };
    console.log("  WITNESS altisaurCap", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ regisaur: 1 });
  });

  it("⛔ the Altisaur ITSELF takes the full 5 — and DIES (CR 109.5 'another'; 5 on a 4/5 is lethal)", () => {
    const s = hit(board(), "TA");
    const alive = s.players.user.battlefield.some((p) => p.id === "TA");
    console.log("  WITNESS altisaurSelf", JSON.stringify({ alive })); // vitest 4 needs --disable-console-intercept
    expect(alive).toBe(false); // no self-cap: the full 5 landed and the lethal SBA took it
  });

  it("⛔ a non-Dinosaur teammate takes the full 5 (the subtype filter)", () => {
    const s = hit(board(), "BEAR");
    expect(marked(s, "user", "BEAR")).toBe(5);
  });

  it("⛔ an OPPONENT's Dinosaur takes the full 5 ('you control')", () => {
    const s = hit(board(), "EDINO");
    expect(marked(s, "ai1", "EDINO")).toBe(5);
  });

  it("⛔ a 1-damage ping to the protected Dino still deals 1 (a cap, never a raise)", () => {
    const s = hit(board(), "REG", 1);
    expect(marked(s, "user", "REG")).toBe(1);
  });
});
