/**
 * BAXTER, FLY IN THE OINTMENT — the counter-filtered group keyword grant. SHELF-85 · Halfshell Q3, 2026-09-05.
 * "Whenever Baxter enters or attacks, each creature you control with a counter on it gains flying until end of turn."
 *
 * The compound head, the draw trigger and the plain "creatures you control gain <kw>" grant were native; the FILTERED
 * grant had no arm. The group grant's resolver already carries a counter filter (Inspiring Call binds "+1/+1"); the
 * filtered sentence is one whole-clause matcher stamping the filter with "any", and the resolver reads "any" as at
 * least one counter of any kind, live at resolution.
 *
 * Mutation-checked: see the run ledger (docs-sk93).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BAXTER = { id: "c-bax", name: "Baxter, Fly in the Ointment", type: "Legendary Creature — Insect Mutant Scientist", mana: "{3}{U}", power: 2, toughness: 4, keywords: [],
  oracle: "Whenever Baxter enters or attacks, each creature you control with a counter on it gains flying until end of turn.\nWhenever you draw a card, put a +1/+1 counter on Baxter." };
const bear = (id, controller, counters = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false }), counters });

describe("the parser and the classifier", () => {
  it("the filtered grant parses to the group grant with the 'any' counter filter; the plain grant has none; an un-grantable keyword is refused; Baxter flips native", () => {
    const filtered = parseEffectClause("Each creature you control with a counter on it gains flying until end of turn.", "Instant")?.atoms?.[0];
    const plain = parseEffectClause("Creatures you control gain flying until end of turn.", "Instant")?.atoms?.[0];
    const bad = parseEffectClause("Each creature you control with a counter on it gains wobbling until end of turn.", "Instant");
    const row = { filtered, plain, bad: bad?.atoms?.length ?? null, tier: classifyCard(BAXTER) };
    console.log("  WITNESS baxterGrant", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(filtered).toEqual({ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Flying"], requiresCounter: "any" });
    expect(plain).toEqual({ op: "grant-keywords-group", scope: "creaturesYouControl", grantKeywords: ["Flying"] });
    expect(bad?.confidence === "high" ? 1 : 0).toBe(0);
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — through the real ETB flush", () => {
  it("a creature with a charge counter gains flying, an unmarked one does not, an opponent's marked creature does not", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear("marked", "user", { charge: 1 }), bear("plain", "user")] }, ai: { ...s0.players.ai, battlefield: [bear("theirs", "ai", { "+1/+1": 2 })] } } };
    s = enterPermanent(s, BAXTER, "user");
    s = flushTriggers(s, {});
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    const row = { marked: permanentHasKeyword(s, "marked", "Flying"), plain: permanentHasKeyword(s, "plain", "Flying"), theirs: permanentHasKeyword(s, "theirs", "Flying") };
    console.log("  WITNESS baxterRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ marked: true, plain: false, theirs: false });
  });
});
