/**
 * converge.test.js — CONVERGE (CR 702.117a), enters-with form: "Converge — This creature enters with a
 * +1/+1 counter on it for each color of mana spent to cast it." Skyrider Elf, Woodland Wanderer, Tajuru
 * Stalwart, Rancorous Archaic — and Glinting Creeper, which takes TWO per colour.
 *
 * ⭐ THE SAME QUESTION AS SUNBURST, WRITTEN LONGHAND. Converge is an ability WORD (CR 207.2c) whose sentence
 * carries the whole rule; sunburst is a keyword whose rule lives in reminder parens. Both consume the colour
 * count captured off the payment plan one slice earlier — only the DETECTION differs, which is why this is a
 * sibling reader rather than a widened sunburst one.
 *
 * ⛔⛔ THE PER-COLOUR MULTIPLIER IS PARSED, NOT ASSUMED. Glinting Creeper gets TWO counters per colour. A
 * hard-coded 1 halves it — and the card still enters with *some* counters, so the error is invisible unless
 * a pin reads the number. Exactly the shape of the sunburst kind-mutant: **a plausible answer is not a
 * correct one.**
 *
 * ⛔ THE COVERAGE STRIP IS ANCHORED AT THE LABEL. The generic enters-with strips lead with `[^.\n]*` and
 * would have left "Converge —" behind as residue; this one takes the whole labelled sentence and nothing
 * else. It is authorised by the SAME helper the resolver reads, so a card can never be credited for a
 * sentence the runtime won't honour.
 *
 * ⓘ Crystalline Crawler and Wildgrowth Archaic carry the identical line and parked — on their OTHER
 * abilities (a mana-producing counter removal; a cast-trigger that adds counters to other creatures).
 * Pinned so they aren't misread as misses here. Crystalline Crawler is native since the 09-06 plan's stage
 * ③ · 37 (2026-09-30), when the no-{T} remove-a-counter mana source landed (counterRemovalMana.test.js).
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): `per`
 * forced to 1 -> Glinting Creeper enters with half its counters; the resolver arm removed -> the witness
 * shows zero counters after a three-colour cast.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseManaCost } from "./legalChoices.js";
import { convergeEntersCounters } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LINE = "Converge — This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.";
const WANDERER = { id: "cv1", name: "Woodland Wanderer", type: "Creature — Elemental", mana: "{3}", power: "3", toughness: "3",
  oracle: `Vigilance, trample\n${LINE}` };
const CREEPER = { id: "cv2", name: "Glinting Creeper", type: "Creature — Plant", mana: "{3}", power: "3", toughness: "3",
  oracle: "Converge — This creature enters with two +1/+1 counters on it for each color of mana spent to cast it.\nThis creature can't be blocked by creatures with power 2 or less." };

describe("the reader", () => {
  it("⭐ the singular form is one per colour; the doubled form is two", () => {
    expect(convergeEntersCounters(WANDERER)).toEqual({ per: 1 });
    expect(convergeEntersCounters(CREEPER)).toEqual({ per: 2 });
  });

  it("⛔ a non-converge enters-with sentence is not claimed", () => {
    expect(convergeEntersCounters({ name: "Probe", type: "Creature — Bear",
      oracle: "This creature enters with two +1/+1 counters on it." })).toBeNull();
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(WANDERER)).toBe("native-body");
    expect(classifyCard(CREEPER)).toBe("native-body");
  });

  it("⛔ the identical line still parks a card whose OTHER ability is unmodelled", () => {
    expect(classifyCard({ name: "Wildgrowth Archaic", type: "Creature — Avatar", mana: "{2/G}{2/G}", power: "4", toughness: "4",
      oracle: `Trample, reach\n${LINE}\nWhenever you cast a creature spell, that creature enters with X additional +1/+1 counters on it, where X is the number of colors of mana spent to cast it.` })).toBe("body-only");
  });
});

describe("⭐⭐ LAW 6 — the colour count reaches the counters through the real cast path", () => {
  function castAndResolve(card, pool) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const start = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [card], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
    const cast = dispatchAction(start, { kind: "cast-spell", playerId: "user", cardId: card.id, name: card.name, cost: parseManaCost("{3}"), cmc: 3 });
    const resolved = resolveTopOfStack(cast);
    const s = resolved.state || resolved;
    return (s.players.user.battlefield || []).find((p) => p.card?.id === card.id);
  }

  it("⭐⭐ one per colour, and TWO per colour where the card says two", () => {
    const row = {
      wandererThreeColours: castAndResolve(WANDERER, { W: 1, U: 1, B: 1 })?.counters?.["+1/+1"] ?? 0,
      wandererColourless: castAndResolve(WANDERER, { C: 3 })?.counters?.["+1/+1"] ?? 0,
      // ⭐ THE MULTIPLIER ROW: three colours × two per colour = six. A hard-coded 1 reads 3 here — still
      // plausible, still wrong.
      creeperThreeColours: castAndResolve(CREEPER, { W: 1, U: 1, B: 1 })?.counters?.["+1/+1"] ?? 0,
    };
    console.log("  WITNESS converge", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ wandererThreeColours: 3, wandererColourless: 0, creeperThreeColours: 6 });
  });
});
