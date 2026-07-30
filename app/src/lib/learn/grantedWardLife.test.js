/**
 * grantedWardLife.test.js — a GROUP-GRANTED "Ward—Pay N life" (CR 702.21):
 *
 *   Hexing Squelcher    — Other creatures you control have "Ward—Pay 2 life."
 *   Hag of Mage's Doom  — Warlocks you control have "Ward—Pay 2 life."
 *
 * Two independent gaps met on these cards. The granted-ward channel carried GENERIC MANA only (Cathedral
 * Acolyte, Lavaspur Boots), so a life cost had nowhere to live; and the quoted-grant branch swallowed every
 * `<selector> have "…"` clause on the assumption — written into its own closing comment — that such a clause
 * is never also a plain keyword grant. Quoting is a printing convention, not a rules distinction, which is
 * why `have flying.` was native while `have "Flying."` was body-only.
 *
 * Every runtime claim drives ward.wardTaxForStackObject and is paired with the same measurement in the
 * granter's absence, so an unenforced parse cannot pass for a working tax.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentGrantedWardCosts } from "./layers.js";
import { wardTaxForStackObject } from "./ward.js";

beforeEach(() => _resetIdsForTests());

const DASH = "—"; // em dash, exactly as printed
const SQUELCHER = {
  name: "Hexing Squelcher", type: "Creature — Goblin Sorcerer", mana: "{1}{R}",
  oracle: `This spell can't be countered.\nWard${DASH}Pay 2 life.\nSpells you control can't be countered.\nOther creatures you control have "Ward${DASH}Pay 2 life."`,
};
const HAG = {
  name: "Hag of Mage's Doom", type: "Creature — Hag Warlock", mana: "{3}{B}",
  oracle: `Warlocks you control have "Ward${DASH}Pay 2 life."`,
};
const BEAR = { name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };

const layerOps = (card) => parseStaticAbilities(card).map((e) => e.op?.layerOp);

/** `user` controls the granter (optional) plus a plain Bear; `ai` is the caster. */
function board({ granter = null } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [createPermanent({ id: "bear", card: { ...BEAR, id: "cbear" }, controller: "user" })];
  if (granter) bf.push(createPermanent({ id: "gr", card: { ...granter, id: "cgr" }, controller: "user" }));
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}

/** An opponent's spell targeting the Bear — the thing ward taxes. */
const boltAt = (id) => ({ kind: "spell", id: "sp", controller: "ai", targets: [{ type: "creature", id }], source: { name: "Bolt" } });

describe("granted Ward—Pay N life — parse", () => {
  it("flips both carriers native", () => {
    expect(classifyCard(SQUELCHER)).toBe("native-static");
    expect(classifyCard(HAG)).toBe("native-static");
  });

  it("emits a layer-6 addWard carrying the LIFE cost", () => {
    const eff = parseStaticAbilities(HAG).filter((e) => e.op?.layerOp === "addWard");
    expect(eff).toHaveLength(1);
    expect(eff[0].op.life).toBe(2);
    expect(eff[0].op.generic).toBeUndefined(); // must NOT masquerade as a mana ward
  });

  it("parses the QUOTED and UNQUOTED spellings identically (CR 702.21)", () => {
    const quoted = { ...HAG, oracle: `Warlocks you control have "Ward${DASH}Pay 2 life."` };
    const bare = { ...HAG, oracle: `Warlocks you control have ward${DASH}pay 2 life.` };
    expect(layerOps(quoted)).toEqual(["addWard"]);
    expect(layerOps(bare)).toEqual(["addWard"]);
  });

  it("REFUSES the costs the runtime cannot pay (CREED: residue, never a guess)", () => {
    // parseWardCost returns null for sacrifice/discard — no payer-choice model — so the grant must not
    // be emitted either, or the card would be credited for a tax that never fires. Mishra, Tamer of Mak Fawa.
    const sac = { ...HAG, oracle: `Permanents you control have "Ward${DASH}Sacrifice a permanent."` };
    const discard = { ...HAG, oracle: `Warlocks you control have "Ward${DASH}Discard a card."` };
    expect(layerOps(sac)).toEqual([]);
    expect(layerOps(discard)).toEqual([]);
    // The MANA form is refused here too — it belongs to the `generic` channel (Cathedral Acolyte), and
    // routing it through the life arm would price a {2} ward as 2 LIFE, which is a different cost.
    const manaWard = { ...HAG, oracle: 'Warlocks you control have "Ward {2}."' };
    expect(layerOps(manaWard)).toEqual([]);
  });

  it("leaves an unrelated quoted grant alone", () => {
    const mana = { ...HAG, oracle: 'All Slivers have "{T}: Add one mana of any color."' };
    expect(layerOps(mana)).toEqual(["addAbility"]);
  });
});

describe("ENFORCEMENT — the granted ward actually taxes", () => {
  it("VACUITY CONTROL: with no granter out, the Bear is untaxed", () => {
    expect(permanentGrantedWardCosts(board(), "bear")).toEqual([]);
    expect(wardTaxForStackObject(board(), boltAt("bear"))).toBeNull();
  });

  it("surfaces the granted life cost on the affected creature", () => {
    expect(permanentGrantedWardCosts(board({ granter: SQUELCHER }), "bear")).toEqual([{ life: 2 }]);
  });

  it("taxes an opponent's spell 2 life for targeting the granted creature", () => {
    const tax = wardTaxForStackObject(board({ granter: SQUELCHER }), boltAt("bear"));
    expect(tax?.cost).toEqual({ kind: "life", life: 2 });
  });

  it("does NOT tax the granter's own controller (ward is opponents-only, CR 702.21a)", () => {
    const own = { ...boltAt("bear"), controller: "user" };
    expect(wardTaxForStackObject(board({ granter: SQUELCHER }), own)).toBeNull();
  });

  it("respects the grant's SELECTOR — the Hag reaches Warlocks, not a Bear", () => {
    const s = board({ granter: HAG });
    // The Bear is not a Warlock. If the selector were ignored this would read a 2-life tax.
    expect(wardTaxForStackObject(s, boltAt("bear"))).toBeNull();
    const withWarlock = {
      ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [
        ...s.players.user.battlefield,
        createPermanent({ id: "wl", card: { name: "Warlock", type: "Creature — Human Warlock", mana: "{B}", oracle: "", id: "cwl" }, controller: "user" }),
      ] } },
    };
    expect(wardTaxForStackObject(withWarlock, boltAt("wl"))?.cost).toEqual({ kind: "life", life: 2 });
  });

  it("SUMS a printed life ward with a granted one (single cost kind, CR 702.21c)", () => {
    const printedWard = {
      name: "Warded Warlock", type: "Creature — Human Warlock", mana: "{B}",
      oracle: `Ward${DASH}Pay 1 life.`,
    };
    const s = board({ granter: HAG });
    const withBoth = {
      ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [
        ...s.players.user.battlefield,
        createPermanent({ id: "ww", card: { ...printedWard, id: "cww" }, controller: "user" }),
      ] } },
    };
    // printed 1 + granted 2 = 3. Either half alone would read 1 or 2, so this pins the addition itself.
    expect(wardTaxForStackObject(withBoth, boltAt("ww"))?.cost).toEqual({ kind: "life", life: 3 });
  });
});
