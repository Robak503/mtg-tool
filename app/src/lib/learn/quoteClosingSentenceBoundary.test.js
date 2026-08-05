/**
 * quoteClosingSentenceBoundary.test.js — a sentence whose final period sits INSIDE a quoted ability was
 * never a sentence boundary, so the NEXT sentence got welded onto it (Verdant Rebirth).
 *
 * THE SHAPE. `splitClauses` breaks on `\.\s+`, i.e. a period followed by whitespace. When the clause ends
 * with a granted quoted ability the text reads `… to its owner's hand."` + newline — the period is
 * followed by a QUOTE, not whitespace — so no boundary fired and "Draw a card." rode along inside the
 * grant clause. The combined text matched nothing and the whole spell parsed LOW.
 *
 * Fixed by adding `(?<=\.")\s+` as an alternative boundary. **Purely additive by construction:** `."`
 * followed by whitespace is not a split point today, so the rule can only ever ADD one.
 *
 * ⚠️ AND THE ADDITIVE ARGUMENT WAS NOT TAKEN ON FAITH. 479 corpus cards carry `."` followed by more text
 * after reminder-stripping, 56 of them native, so the obvious worry was a card like
 * `gains "…." until end of turn` being severed from its own duration. Measured instead of reasoned:
 * whole-corpus diff **GAINED 1 / LOST 0 / RETIERED 0**. Not one of the 56 moved. The speculation was
 * wrong and the measurement settled it — which is the only reason this shipped as a general boundary
 * rather than an anchored one-card fold.
 *
 * ⛔ LAW 6 — the grant is a *dies* trigger handed out until end of turn, so parsing proves nothing about
 * whether the creature ever comes back. Driven through the REAL death pipeline below.
 *
 * ⚠️ A HARNESS SCAR WORTH KEEPING: the first runtime probe reported ZERO dies-triggers and looked exactly
 * like a false positive. It was the PROBE that was wrong — it killed the creature with a hand-built
 * `moveCardToZone` + a hand-made dead list instead of `destroyLethalCreatures`, the path the engine
 * actually uses. A bad harness manufactures false NEGATIVES just as readily as false positives; when a
 * runtime probe says "nothing happened", check the harness against a working one before believing it.
 *
 * Mutation-checked (2026-08-04, verified applied): the lookbehind alternative removed -> the split pin,
 * the classification pin and the runtime pin all go red.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { grantedTriggeredQuotedFor } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VERDANT_REBIRTH = { id: "c-vr", name: "Verdant Rebirth", type: "Instant", mana: "{1}{G}",
  oracle: "Until end of turn, target creature gains \"When this creature dies, return it to its owner's hand.\"\nDraw a card." };

describe("the quote-closing boundary", () => {
  it("⭐ the oracle splits into TWO clauses (the draw used to be welded into the grant)", () => {
    expect(splitClauses(VERDANT_REBIRTH.oracle)).toEqual([
      "Until end of turn, target creature gains \"When this creature dies, return it to its owner's hand.\"",
      "Draw a card",
    ]);
  });

  it("Verdant Rebirth flips, carrying BOTH atoms", () => {
    expect(classifyCard(VERDANT_REBIRTH)).toBe("native-spell");
    const p = parseEffectProgram(VERDANT_REBIRTH);
    expect(programConfidence(p)).toBe("high");
    expect((p.atoms || []).map((a) => a.op)).toEqual(["grant-until-eot", "draw"]);
  });

  it("a quoted ability with NO trailing sentence is unaffected", () => {
    const bare = { id: "c-b", name: "Bare Grant", type: "Instant", mana: "{B}",
      oracle: "Until end of turn, target creature gains \"When this creature dies, return it to its owner's hand.\"" };
    expect(splitClauses(bare.oracle)).toEqual(["Until end of turn, target creature gains \"When this creature dies, return it to its owner's hand.\""]);
  });
});

describe("⭐ RUNTIME (law 6) — the granted DIES trigger actually returns the creature", () => {
  it("grant, draw, kill through the real SBA pipeline, and the creature comes back to hand", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "b1", card: { id: "cb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear],
      library: [{ id: "l1", name: "Top", type: "Instant", oracle: "" }] } } };

    s = runEffectProgram(s, { source: { name: "Verdant Rebirth" }, payload: { params: {
      program: parseEffectProgram(VERDANT_REBIRTH), controller: "user", targets: [{ type: "creature", id: "b1" }] } } });
    expect(grantedTriggeredQuotedFor(s, "b1")).toHaveLength(1);          // the grant landed
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Top"]);      // the draw half ran

    // Kill it the way the engine does — lethal damage → SBA → dies triggers. NOT a hand-built zone move:
    // that path reports zero triggers and reads exactly like a broken card (see the file header).
    s = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: s.players.user.battlefield.map((p) => (p.id === "b1" ? { ...p, damageMarked: 99 } : p)) } } };
    const res = destroyLethalCreatures(s);
    s = res.state ?? res;
    s = checkDiesTriggers(s, res.dead ?? []);
    expect((s.pendingTriggers || []).length).toBe(1);

    s = flushTriggers(s);
    for (let i = 0; i < 4 && s.stack?.length; i++) s = resolveTopOfStack(s);
    expect(s.players.user.hand.map((c) => c.name).sort()).toEqual(["Grizzly Bears", "Top"]);   // ⭐ it came back
    expect(s.players.user.graveyard).toHaveLength(0);
  });
});
