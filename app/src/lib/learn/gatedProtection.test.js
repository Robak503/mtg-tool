/**
 * gatedProtection.test.js — GATED-PROTECTION: a "protection from <color>" span inside a GATED self
 * static ("Threshold — As long as there are seven or more cards in your graveyard, this creature gets
 * +1/+1 and has protection from black."). Carrier: Mystic Familiar (+1, measured ceiling — Pristine
 * Angel parks on "protection from artifacts", a non-color quality; Teroh's Vanguard on a quoted grant).
 *
 * ⭐ ONE EVALUATOR: emitGatedEffect's has-tail now delegates to parseAnthemHaveTail — the SAME
 * all-or-nothing oracle the group-anthem path uses — so keyword lists, protection spans, and their
 * refusals are decided in one place. A wardLife result is REJECTED in the gated path (no carrier, and
 * the ward read has no gate check): accepting one would credit the card while silently dropping or
 * ungatedly granting the ward.
 *
 * ⛔ THE GATE CHECK IN permanentProtectionColors IS THE ENFORCEMENT HALF: without it a gated
 * addProtection confers protection with the gate SHUT — wrongly protective at all three enforcement
 * sites (combat damage / block / targeting), a forbidden FP.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the gate check dropped from permanentProtectionColors -> the six-card row wrongly confers B.
 *   · the sentence-start fix reverted in parseProtectionColors -> the leading-conditional printed rows
 *     die (familiarPrinted/angelPrinted come back non-empty).
 *   · the wardLife rejection dropped from emitGatedEffect -> NO test fails: the quoted ward tail is
 *     refused UPSTREAM and never reaches the rejection (descriptors [] under the mutant, verified).
 *     The rejection is documented in-file as defensive-only; the refusal row here pins the UPSTREAM
 *     behavior, not that line.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { permanentProtectionColors } from "./layers.js";
import { parseProtectionColors } from "./protection.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FAMILIAR = { id: "c-mf", name: "Mystic Familiar", type: "Creature — Bird", mana: "{1}{W}", power: "1", toughness: "2",
  oracle: "Flying\nThreshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has protection from black." };
const ANGEL = { id: "c-pa", name: "Pristine Angel", type: "Creature — Angel", mana: "{4}{W}{W}", power: "4", toughness: "4",
  oracle: "Flying\nAs long as this creature is untapped, it has protection from artifacts and from each color.\nWhenever you cast a spell, you may untap this creature." };

describe("the carrier and the refusals", () => {
  it("⭐ Mystic Familiar flips native", () => {
    expect(classifyCard(FAMILIAR)).toMatch(/^native/);
  });

  it("⛔⛔ THE PRE-EXISTING FP, fixed: a LEADING conditional is not printed protection", () => {
    // Before 2026-08-12 parseProtectionColors's conditional guard scanned the sentence only FROM the
    // match onward, so "As long as …, this creature has protection from black" read as UNCONDITIONAL
    // printed protection — Pristine Angel conferred all-five-color protection even while TAPPED, live
    // at the targeting/blocking/damage sites. The whole-sentence guard forbids both leading forms;
    // Etched Champion's TRAILING "as long as" form is inside the same sentence slice and stays caught.
    const row = {
      familiarPrinted: [...parseProtectionColors(FAMILIAR)],
      angelPrinted: [...parseProtectionColors(ANGEL)],
      etchedChampion: [...parseProtectionColors({ name: "Etched Champion", type: "Artifact Creature — Soldier",
        oracle: "Metalcraft — This creature has protection from all colors as long as you control three or more artifacts." })],
      plainPrinted: [...parseProtectionColors({ name: "Black Knight", type: "Creature — Human Knight",
        oracle: "First strike\nProtection from white" })],
    };
    console.log("  WITNESS leadingConditionalNotPrinted", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ familiarPrinted: [], angelPrinted: [], etchedChampion: [], plainPrinted: ["W"] });
  });

  it("⛔ refusals: a non-color quality parks whole; a gated ward tail parks whole", () => {
    const row = {
      pristineAngel: classifyCard(ANGEL), // "protection from artifacts" — non-color quality
      gatedWard: classifyCard({ ...FAMILIAR, name: "T", oracle: 'Threshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has "Ward—Pay 2 life."' }),
      incumbentGatedFlying: classifyCard({ ...FAMILIAR, name: "T2", oracle: "Threshold — As long as there are seven or more cards in your graveyard, this creature gets +1/+1 and has flying." }),
    };
    console.log("  WITNESS gatedProtectionRefusals", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.pristineAngel).toBe("body-only");
    expect(row.gatedWard).toBe("body-only");
    expect(row.incumbentGatedFlying).toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the gate turns the protection (and the buff) on and off", () => {
  function boardState(graveyardCount) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "FAM", controller: "user", summoningSick: false, card: FAMILIAR });
    const gy = Array.from({ length: graveyardCount }, (_, i) => ({ id: "gy" + i, name: "Gravel " + i, type: "Sorcery", oracle: "" }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm], graveyard: gy } } };
  }

  it("⭐⭐ SEVEN cards: protection from black is conferred, and the buff is live (2/3)", () => {
    const s = boardState(7);
    const perm = s.players.user.battlefield[0];
    const row = {
      colors: [...permanentProtectionColors(s, "FAM")],
      power: creaturePower(perm, s),
      toughness: creatureToughness(perm, s),
    };
    console.log("  WITNESS familiarThresholdOpen", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ colors: ["B"], power: 2, toughness: 3 });
  });

  it("⛔⛔ SIX cards: NO protection, base body (1/2) — the gate is shut", () => {
    const s = boardState(6);
    const perm = s.players.user.battlefield[0];
    const row = {
      colors: [...permanentProtectionColors(s, "FAM")],
      power: creaturePower(perm, s),
      toughness: creatureToughness(perm, s),
    };
    console.log("  WITNESS familiarThresholdShut", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ colors: [], power: 1, toughness: 2 });
  });
});
