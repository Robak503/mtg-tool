/**
 * ===== SELF-NAME COUNTER COSTS — "Remove N <kind> counters from <CardName>" (BLITZ CC-3) =====
 *
 * The CC-2 follow-up: ~39 corpus cards write the γ1c remove-counter activation cost with the card's OWN
 * NAME as the from-object instead of "this <noun>/~/it" — "Remove a charge counter from Umezawa's Jitte",
 * the Myojin cycle's "Remove a divinity counter from Myojin of Cleansing Fire", and the legendary
 * SHORT-name convention ("Remove a +1/+1 counter from Mikaeus" on "Mikaeus, the Lunarch"). CR 201.5 —
 * text that refers to the object it's on by name means just that particular object (the engine's older
 * comments cite the same rule under its legacy 201.4 number) — so the cost is byte-identical in meaning
 * to the CC-2 "from this" form and rides the SAME shipped seam end to end:
 *
 *   • PARSE (effects/abilities.js parseAbilityCost, now `(costStr, card)`): the from-tail must equal the
 *     card's FULL or pre-comma SHORT name VERBATIM, whole-tail anchored (`^…$`, regex-escaped) — never a
 *     substring, never ANOTHER card's name, no trailing text. Both regexes are built from single-sourced
 *     count/type pieces (RC_COUNT/RC_TYPE) so the two forms can never drift on vocabulary. A card-less
 *     call never matches the self-name form (fail-closed).
 *   • METRIC MIRROR (coverage.js isActivatedAbilityLine, now `(line, card)`): every residue-strip call
 *     site threads the SAME card into the SAME parseAbilityCost, so the metric can never credit a
 *     self-name cost line the runtime can't pay (the CA-1/EV-3 shared-parser lockstep pattern).
 *   • OFFER (legalChoices, CR 118.3) / PAYMENT (actionDispatcher, CR 601.2h via 602.2b) / AI
 *     (opponentAI's conservative removeCounter exclusion): all read the parsed `{type, count}` shape —
 *     structurally inherited, zero runtime changes in this slice.
 *
 * HONEST FLIP COUNT: exactly ONE — Mikaeus, the Lunarch (enters-with-X is the modeled hydra lane; both
 * activated abilities now modeled). Every other census card stays parked whole-card (CREED): the Jitte
 * family (unmodeled modal modes + equipped-creature trigger), the Myojin cycle (conditional cast-from-hand
 * ETB counter — unmodeled replacement), Slogurk (γ1 leave-trigger fail-safe + self-bounce effect),
 * Grimoire of the Dead / Trenzalore Clocktower (COMPOUND "and sacrifice/exile it" cost items fail the
 * whole-item anchor), Vish Kal ("Remove all" — outside the count vocabulary), Ramos (counter-cost MANA
 * ability — dead at runtime until a counter-cost mana subsystem lands, stripCounterCostManaLines keeps it
 * un-credited). Oracle fixtures below are the REAL bundled text (verified via cardIndex.lookupCard →
 * publicCard, 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBf(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
const activateActions = (state, playerId = "user") =>
  legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");

// The REAL bundled Mikaeus (publicCard shape, verified 2026-07-17).
const MIKAEUS = {
  id: "c-mik", name: "Mikaeus, the Lunarch", type: "Legendary Creature — Human Cleric",
  mana: "{X}{W}", power: "0", toughness: "0",
  oracle: "Mikaeus enters with X +1/+1 counters on it.\n{T}: Put a +1/+1 counter on Mikaeus.\n{T}, Remove a +1/+1 counter from Mikaeus: Put a +1/+1 counter on each other creature you control.",
};

// ────────────────────────────────────────────────────────────────────────────
// 1. parseAbilityCost — the self-name anchor (CC-3), exactness pins
// ────────────────────────────────────────────────────────────────────────────
describe("SELF-NAME COUNTER COST — parse (CR 201.5)", () => {
  it("FULL name: 'Remove a charge counter from Umezawa's Jitte' on Umezawa's Jitte → removeCounter(charge, 1)", () => {
    expect(parseAbilityCost("Remove a charge counter from Umezawa's Jitte", { name: "Umezawa's Jitte" }))
      .toMatchObject({ removeCounter: { type: "charge", count: 1 } });
  });
  it("SHORT name (legendary pre-comma): 'from Mikaeus' on 'Mikaeus, the Lunarch', with {T}", () => {
    expect(parseAbilityCost("{T}, Remove a +1/+1 counter from Mikaeus", { name: "Mikaeus, the Lunarch" }))
      .toMatchObject({ tapSelf: true, removeCounter: { type: "+1/+1", count: 1 } });
  });
  it("plural count words ride the shared CC-2 vocabulary ('three … from Slogurk', 'five … from Ramos')", () => {
    expect(parseAbilityCost("Remove three +1/+1 counters from Slogurk", { name: "Slogurk, the Overslime" }))
      .toMatchObject({ removeCounter: { type: "+1/+1", count: 3 } });
    expect(parseAbilityCost("Remove five +1/+1 counters from Ramos", { name: "Ramos, Dragon Engine" }))
      .toMatchObject({ removeCounter: { type: "+1/+1", count: 5 } });
  });
  it("a multi-word comma-free FULL name matches whole ('Jitte and Divining Top')", () => {
    expect(parseAbilityCost("Remove a charge counter from Jitte and Divining Top", { name: "Jitte and Divining Top" }))
      .toMatchObject({ removeCounter: { type: "charge", count: 1 } });
  });

  // CREED — the name anchor is EXACT; everything else fails closed (null → whole cost parks → Arbiter)
  it("NOT-my-name fails closed: another card's name in the from-tail never matches", () => {
    expect(parseAbilityCost("Remove a charge counter from Umezawa's Jitte", { name: "Lost Jitte" })).toBeNull();
  });
  it("a SUBSTRING / prefix of the name fails closed (whole-tail `$` anchor, no partial-name credit)", () => {
    expect(parseAbilityCost("Remove an oil counter from Miglo", { name: "Migloz, Maze Crusher" })).toBeNull();
    expect(parseAbilityCost("Remove a charge counter from Umezawa", { name: "Umezawa's Jitte" })).toBeNull();
  });
  it("TRAILING text after the name fails closed (compound items park — Grimoire / Trenzalore, real oracle)", () => {
    expect(parseAbilityCost("{T}, Remove three study counters from Grimoire of the Dead and sacrifice it",
      { name: "Grimoire of the Dead" })).toBeNull();
    expect(parseAbilityCost("{1}{U}, {T}, Remove twelve time counters from Trenzalore Clocktower and exile it",
      { name: "Trenzalore Clocktower" })).toBeNull();
  });
  it("a CARD-LESS call never matches the self-name form (the metric-mirror fail-safe)", () => {
    expect(parseAbilityCost("Remove a charge counter from Umezawa's Jitte")).toBeNull();
    expect(parseAbilityCost("Remove a charge counter from Umezawa's Jitte", { name: "" })).toBeNull();
  });
  it("'Remove all …' stays outside the count vocabulary even with the right name (Vish Kal)", () => {
    expect(parseAbilityCost("Remove all +1/+1 counters from Vish Kal", { name: "Vish Kal, Blood Arbiter" })).toBeNull();
  });
  it("number/noun AGREEMENT still fails closed on the self-name form", () => {
    expect(parseAbilityCost("Remove three charge counter from Umezawa's Jitte", { name: "Umezawa's Jitte" })).toBeNull();
    expect(parseAbilityCost("Remove a charge counters from Umezawa's Jitte", { name: "Umezawa's Jitte" })).toBeNull();
  });
  it("REGRESSION: the CC-2 'from this/~/it' forms parse identically with or without the card threaded", () => {
    for (const card of [undefined, { name: "Lux Cannon" }]) {
      expect(parseAbilityCost("{T}, Remove three charge counters from this artifact", card))
        .toMatchObject({ tapSelf: true, removeCounter: { type: "charge", count: 3 } });
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. classification — the ONE honest flip + CREED park pins (real bundled oracle)
// ────────────────────────────────────────────────────────────────────────────
describe("SELF-NAME COUNTER COST — classification (real bundled oracle)", () => {
  it("Mikaeus, the Lunarch → native-activated (enters-with-X lane + both self-name abilities modeled)", () => {
    expect(classifyCard(MIKAEUS)).toBe("native-activated");
  });
  it("CREED: Myojin of Cleansing Fire STAYS body-only (conditional cast-from-hand ETB counter is unmodeled)", () => {
    expect(classifyCard({
      name: "Myojin of Cleansing Fire", type: "Legendary Creature — Spirit", mana: "{5}{W}{W}{W}", power: "4", toughness: "6",
      oracle: "Myojin of Cleansing Fire enters with a divinity counter on it if you cast it from your hand.\nMyojin of Cleansing Fire has indestructible as long as it has a divinity counter on it.\nRemove a divinity counter from Myojin of Cleansing Fire: Destroy all other creatures.",
    })).toBe("body-only");
  });
  it("CREED: Umezawa's Jitte STAYS body-only (unmodeled modal modes + equipped-damage trigger — whole-card law)", () => {
    expect(classifyCard({
      name: "Umezawa's Jitte", type: "Legendary Artifact — Equipment", mana: "{2}",
      oracle: "Whenever equipped creature deals combat damage, put two charge counters on Umezawa's Jitte.\nRemove a charge counter from Umezawa's Jitte: Choose one —\n• Equipped creature gets +2/+2 until end of turn.\n• Target creature gets -1/-1 until end of turn.\n• You gain 2 life.\nEquip {2}",
    })).toBe("body-only");
  });
  it("CREED: Slogurk STAYS body-only, and its remove-counter ability is UNMODELED (the γ1 leave-trigger fail-safe)", () => {
    const slogurk = {
      name: "Slogurk, the Overslime", type: "Legendary Creature — Ooze", mana: "{1}{G}{U}", power: "3", toughness: "3",
      oracle: "Trample\nWhenever a land card is put into your graveyard from anywhere, put a +1/+1 counter on Slogurk.\nRemove three +1/+1 counters from Slogurk: Return it to its owner's hand.\nWhen Slogurk leaves the battlefield, return up to three target land cards from your graveyard to your hand.",
    };
    expect(classifyCard(slogurk)).toBe("body-only");
    // The cost PARSES (the seam works) but the ability must stay unmodeled: a +1/+1 removal can be lethal,
    // and the self-bounce leaves the battlefield — either exit would silently drop Slogurk's own LTB trigger.
    const ab = parseActivatedAbilities(slogurk).find((a) => a.removeCounter);
    expect(ab?.removeCounter).toMatchObject({ type: "+1/+1", count: 3 });
    expect(ab?.modeled).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RUNTIME — Mikaeus end to end (offer gate, exact payment, group counter effect)
// ────────────────────────────────────────────────────────────────────────────
describe("SELF-NAME COUNTER COST — runtime (Mikaeus, the Lunarch)", () => {
  const mikaeusWith = (n) => ({
    ...createPermanent({ id: "mik", card: MIKAEUS, controller: "user", summoningSick: false }),
    counters: { "+1/+1": n },
  });
  const OTHER = { id: "c-sq", name: "Squire", type: "Creature — Human Soldier", power: "1", toughness: "2", oracle: "" };
  const ENEMY = { id: "c-en", name: "Enemy Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };

  it("CREED — at 0 counters the remove ability is NOT offered (CR 118.3); the plain {T} ability still is", () => {
    const s = withBf(mainState(), "user", [mikaeusWith(0)]);
    const acts = activateActions(s);
    expect(acts.filter((a) => a.removeCounter)).toHaveLength(0);
    expect(acts.length).toBeGreaterThan(0); // "{T}: Put a +1/+1 counter on Mikaeus." is offered
  });

  it("at 2 counters it IS offered; payment taps and removes EXACTLY 1, and resolution puts a counter on each OTHER creature I control only", () => {
    let s = withBf(mainState(), "user", [
      mikaeusWith(2),
      createPermanent({ id: "sq", card: OTHER, controller: "user", summoningSick: false }),
    ]);
    s = withBf(s, "ai", [createPermanent({ id: "en", card: ENEMY, controller: "ai", summoningSick: false })]);
    const act = activateActions(s).find((a) => a.removeCounter);
    expect(act).toMatchObject({ removeCounter: { type: "+1/+1", count: 1 } });
    const paid = dispatchAction(s, act);
    const mik = paid.players.user.battlefield.find((p) => p.id === "mik");
    expect(mik.counters["+1/+1"]).toBe(1);   // exactly 1 removed (CR 601.2h via 602.2b), not all
    expect(mik.tapped).toBe(true);           // the {T} half of the cost
    const resolved = resolveTopOfStack(paid);
    const sq = resolved.players.user.battlefield.find((p) => p.id === "sq");
    const mikAfter = resolved.players.user.battlefield.find((p) => p.id === "mik");
    const en = resolved.players.ai.battlefield.find((p) => p.id === "en");
    expect(sq.counters?.["+1/+1"] || 0).toBe(1);       // each OTHER creature you control got one
    expect(mikAfter.counters?.["+1/+1"] || 0).toBe(1); // "other" — Mikaeus itself gets none (still the 1 left)
    expect(en.counters?.["+1/+1"] || 0).toBe(0);       // "you control" — the opponent's creature gets none
  });
});
