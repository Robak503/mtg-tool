/**
 * reanimateTapped.test.js — RT-1: "return target <type> card from your graveyard to the battlefield TAPPED".
 * Writ of Return, Gravewaker, Undergrowth Recon, Dr. Madison Li, Scaretiller.
 *
 * ⭐⭐ THIRTEENTH "BUILT ENGINE, PARTIAL IGNITION" OF THIS RUN, and the clearest example of the shape: the
 * resolver ALREADY honoured the rider. `applyReanimate` threads `atom.entersTapped` into
 * `enterCardFromZone`'s `tapped` param — built for Tato Farmer — and the MASS form ("return ALL <type>
 * cards … tapped") already emitted it. Only this single-target matcher was `$`-anchored with nowhere for
 * the rider to go, so every carrier parked while the machinery underneath sat ready.
 *
 * ⭐ FOUND BY SPLITTING A SHARED ATOM BY ITS RIDERS, the same instrument that found the graveyard-exile
 * verb split an hour earlier. Probing each printed rider on the reanimate lane: `tapped` was 79 carriers
 * with a ceiling of 7, `with a +1/+1 counter on it` was 0, `under your control` was 0. One rider carried
 * the whole vein; the other wordings had no parked carriers at all.
 *
 * ⛔ AN OPTIONAL GROUP, and `entersTapped` is added ONLY when the rider matched — never as a `false`. Every
 * pre-existing reanimate therefore emits a byte-identical atom, asserted below. A `false` would be
 * harmless at runtime and still churn every pinned atom shape in the suite.
 *
 * ⭐⭐ VERIFIED AT RUNTIME BEFORE THE PINS WERE GRADUATED, because two gates asserted this form must stay
 * LOW and a parse-only check cannot tell "the rider is modeled" from "the rider is parsed and ignored" —
 * the second would be a card reading native with printed text doing nothing. The row below reanimates with
 * Writ of Return and asserts the permanent arrives TAPPED, against a Zombify control that arrives UNTAPPED.
 * Without that control the assertion would also pass on an engine that tapped everything it reanimated.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the optional group removed -> all five park (the anchor fails).
 *   · `entersTapped` never set (the group matches but is dropped) -> all five STILL classify native and the
 *     permanent arrives UNTAPPED. The tier cannot see it; only the runtime row can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WRIT_OF_RETURN = { id: "c-wr", name: "Writ of Return", type: "Sorcery", mana: "{3}{B}{B}",
  oracle: "Return target creature card from your graveyard to the battlefield tapped.\nCipher (Then you may exile this spell card encoded on a creature you control. Whenever that creature deals combat damage to a player, its controller may cast a copy of the encoded card without paying its mana cost.)" };
const GRAVEWAKER = { id: "c-gw", name: "Gravewaker", type: "Creature — Bird Spirit", mana: "{4}{B}{B}", power: "3", toughness: "4",
  oracle: "Flying (This creature can't be blocked except by creatures with flying or reach.)\n{5}{B}{B}: Return target creature card from your graveyard to the battlefield tapped." };
const UNDERGROWTH_RECON = { id: "c-ur", name: "Undergrowth Recon", type: "Enchantment", mana: "{1}{G}{G}",
  oracle: "At the beginning of your upkeep, return target land card from your graveyard to the battlefield tapped." };
const ZOMBIFY = { id: "c-zb", name: "Zombify", type: "Sorcery", mana: "{3}{B}",
  oracle: "Return target creature card from your graveyard to the battlefield." };

describe("the carriers", () => {
  it("⭐ the tapped rider no longer parks the card — creature, land and artifact filters", () => {
    for (const c of [WRIT_OF_RETURN, GRAVEWAKER, UNDERGROWTH_RECON]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ the rider rides the atom — and the bare form is BYTE-IDENTICAL", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      tapped: p("return target creature card from your graveyard to the battlefield tapped"),
      artifactTapped: p("return target artifact card from your graveyard to the battlefield tapped"),
      // ⛔ NO `entersTapped: false` — the key is absent, not falsy. A `false` would be harmless at runtime
      // and would still churn every pinned reanimate atom in the suite.
      bare: p("return target creature card from your graveyard to the battlefield"),
    };
    console.log("  WITNESS reanimateTappedParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tapped).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", entersTapped: true }]);
    expect(row.artifactTapped).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: { typeFilter: "artifact" }, entersTapped: true }]);
    expect(row.bare).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" }]);
  });
});

describe("⭐⭐ runtime — the permanent actually ARRIVES tapped", () => {
  function reanimateWith(spell) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players,
        user: { ...base.players.user, hand: [spell], manaPool: { ...base.players.user.manaPool, B: 6, C: 6 },
          graveyard: [{ id: "gy1", name: "Dead Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }], battlefield: [] } } };
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === spell.id);
    expect(cast, `${spell.name} must offer the graveyard creature`).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    const perm = after.players.user.battlefield.find((p) => p.card?.name === "Dead Bear");
    return { onBattlefield: !!perm, tapped: !!perm?.tapped };
  }

  it("⭐⭐ Writ of Return arrives TAPPED; Zombify arrives untapped", () => {
    // ⛔ THE CONTROL IS NOT DECORATION. Without Zombify this would also pass on an engine that tapped
    // everything it reanimated — the assertion would be true and would mean nothing.
    const row = { writOfReturn: reanimateWith(WRIT_OF_RETURN), zombify: reanimateWith(ZOMBIFY) };
    console.log("  WITNESS reanimateTappedRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      writOfReturn: { onBattlefield: true, tapped: true },
      zombify: { onBattlefield: true, tapped: false },
    });
  });
});
