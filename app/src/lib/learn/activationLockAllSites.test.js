/**
 * activationLockAllSites.test.js — AU-2, CR 602.5: "its activated abilities can't be activated" must shut
 * off the permanent's WHOLE activation surface, at every enumeration site. Arrest, Lawmage's Binding,
 * Demotion, Stupefying Touch, Detainment Spell, Petrify, Stasis Cocoon — and Koma's mode-1 lock, which
 * grants the identical layer-6 keyword.
 *
 * ⭐⭐ A LIVE OVER-DELIVERY ON SHIPPED CODE, FOUND BY A POSITIVE CONTROL. legalChoices has FIVE sites that
 * enumerate an activated ability of a battlefield permanent — tap-for-mana, crew, activate-ability,
 * double-mana-pool, loyalty — and the file's own comment claimed all five gate through one predicate. They
 * did, but that predicate only knew the BOARD-WIDE artifact lock (NR-1 / Null Rod). The PER-PERMANENT lock
 * was checked at exactly one site: actionsActivateAbility. So an ARRESTED Llanowar Elves was refused by
 * manaModel.manaSources for affordability — and still OFFERED a tap-for-mana action. Measured on shipped
 * code before the fix: `{ offered: 1, forPayment: 0 }`. The engine doing MORE than the printed card allows
 * is the forbidden direction; the two-sites invariant this codebase keeps naming had quietly broken.
 *
 * ⛔ THE BUG WAS THE DIVERGENCE, so the fix is in the shared predicate (lockedActivationSource), not in
 * four call sites. The duplicate check inside actionsActivateAbility was collapsed to a pointer for the
 * same reason: two sources of truth is how this started.
 *
 * ⛔ EVERY ROW CARRIES ITS POSITIVE CONTROL (before > 0). A harness that never enumerated the ability in
 * the first place reads EXACTLY like a working lock — that is not a hypothetical here, it is how the
 * first cut of enchantSubjectHosts.test.js failed: a Signet whose only ability is a MANA ability was
 * asserted through the `activate-ability` lane, which never offers mana abilities, so `after: 0` was
 * true and meaningless.
 *
 * ⛔ AND ITS NEGATIVE CONTROL: a second, UN-enchanted permanent of the same kind keeps its ability in
 * every row. Without it, a fix that simply switched the whole surface off would pass identically.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the
 * permanentHasKeyword branch removed from lockedActivationSource -> all four `after` rows go back to 1
 * while every `otherAfter` row is unchanged, which is the exact shape of the shipped bug.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ARREST = { id: "c-ar", name: "Arrest", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated." };
const PETRIFY = { id: "c-pf", name: "Petrify", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant artifact or creature\nEnchanted permanent can't attack or block, and its activated abilities can't be activated." };

const ELVES = { id: "c-le", name: "Llanowar Elves", type: "Creature — Elf Druid", power: 1, toughness: 1, oracle: "{T}: Add {G}." };
const TOME = { id: "c-jt", name: "Jayemdae Tome", type: "Artifact — Book", oracle: "{4}, {T}: Draw a card." };
const CUBE = { id: "c-dc", name: "Doubling Cube", type: "Artifact", oracle: "{3}, {T}: Double the amount of each type of unspent mana you have." };
const SKIFF = { id: "c-ss", name: "Sky Skiff", type: "Artifact — Vehicle", power: 3, toughness: 2, oracle: "Flying\nCrew 1" };
const BEAR = { id: "c-b", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

/** A main-phase board with `perms` and a fat any-color mana base (so nothing fails for affordability). */
function board(perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const lands = ["l1", "l2", "l3", "l4", "l5", "l6"].map((id) => createPermanent({ id, card: { name: "City of Brass", type: "Land", oracle: "{T}: Add one mana of any color." }, controller: "user", summoningSick: false }));
  const built = perms.map((p) => createPermanent({ id: p.id, card: p.card, controller: "user", summoningSick: false }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: [...lands, ...built] } } };
}
const count = (s, kind, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === kind && a.permanentId === id).length;

describe("⭐⭐ LAW 6 — the lock reaches ALL FOUR previously-ungated enumeration sites", () => {
  it("⭐⭐ tap-for-mana · crew · double-mana-pool · activate-ability, each with both controls", () => {
    // Each row: one LOCKED permanent and one identical UNLOCKED twin on the same board.
    const rows = {};
    for (const [label, kind, host, twin, aura] of [
      ["tapForMana", "tap-for-mana", { id: "elf", card: ELVES }, { id: "elf2", card: ELVES }, ARREST],
      // ⚠️ THE KIND IS "crew-vehicle", NOT "crew". The first cut used "crew" and the row read
      // {before: 0, after: 0} — a filter that matches nothing is indistinguishable from a perfect lock.
      // The positive control is the only reason this was a failure instead of a green vacuous pass.
      ["crew", "crew-vehicle", { id: "skiff", card: SKIFF }, { id: "skiff2", card: SKIFF }, PETRIFY],
      ["doubleManaPool", "double-mana-pool", { id: "cube", card: CUBE }, { id: "cube2", card: CUBE }, PETRIFY],
      ["activateAbility", "activate-ability", { id: "tome", card: TOME }, { id: "tome2", card: TOME }, PETRIFY],
    ]) {
      // Crew needs a creature to tap; harmless everywhere else.
      let s = board([host, twin, { id: "crewer", card: BEAR }, { id: "aura", card: aura }]);
      const before = count(s, kind, host.id);
      s = attachPermanent(s, { equipId: "aura", targetId: host.id });
      rows[label] = { before, after: count(s, kind, host.id), twinAfter: count(s, kind, twin.id) };
    }
    console.log("  WITNESS activationLockAllSites", JSON.stringify(rows)); // vitest 4 needs --disable-console-intercept
    for (const [label, r] of Object.entries(rows)) {
      expect(r.before, `${label}: positive control — the ability must be offered UNLOCKED, or the row is vacuous`).toBeGreaterThan(0);
      expect(r.after, `${label}: the lock must shut it off`).toBe(0);
      expect(r.twinAfter, `${label}: negative control — the UN-enchanted twin keeps its ability`).toBe(r.before);
    }
  });

  it("⛔ the two-sites invariant: the OFFER and the PAYMENT view now agree (they didn't)", () => {
    // This is the exact pair that was measured as {offered: 1, forPayment: 0} on shipped code.
    let s = board([{ id: "elf", card: ELVES }, { id: "ar", card: ARREST }]);
    s = attachPermanent(s, { equipId: "ar", targetId: "elf" });
    const row = { offered: count(s, "tap-for-mana", "elf"), forPayment: manaSources(s, "user").filter((m) => m.permanentId === "elf").length };
    console.log("  WITNESS arrestedDorkTwoSites", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: 0, forPayment: 0 });
  });

  it("⛔ Arrest was already native — this was reachable in shipped play, not a latent path", () => {
    // The finding's severity rests on this: no new card had to flip for the bug to bite.
    expect(classifyCard(ARREST)).toMatch(/^native/);
  });
});
