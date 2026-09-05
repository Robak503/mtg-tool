/**
 * LITA, LITTLE ORPHAN AMPHIBIAN — the PERIOD-form mode-memory lead. SHELF-85 · Halfshell Q5, 2026-09-05.
 * "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn.
 *  • Put a +1/+1 counter on Lita. • Create a Food token. • Scry 1."
 *
 * Every mode was modelled and the per-turn mode ledger (Teval's Judgment's MODE-MEMORY) already enforces the exclusion
 * at the flush chooser. The card parked on punctuation: the printed lead ends in a PERIOD with the bullets on the next
 * lines, and the trigger's modal block extractor and the modal parser's memory lead both anchored on a DASH. The period
 * joins the dash at those anchors; nothing else changes.
 *
 * Mutation-checked: see the run ledger (docs-sk89).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LITA = { id: "c-lita", name: "Lita, Little Orphan Amphibian", type: "Legendary Creature — Mutant Ninja Turtle", mana: "{1}{W}", power: 1, toughness: 2, keywords: [],
  oracle: "Alliance — Whenever another creature you control enters, choose one that hasn't been chosen this turn.\n• Put a +1/+1 counter on Lita.\n• Create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n• Scry 1." };
const JUDGMENT_LEAD = "Whenever one or more cards leave your graveyard, choose one that hasn't been chosen this turn —\n• Draw a card.\n• Create a Treasure token.\n• Create a 2/2 black Zombie Druid creature token.";
const BEAR = (i) => ({ id: `c-bear${i}`, name: `Bear ${i}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" });

describe("the lead's period form", () => {
  it("the trigger's effect clause keeps the whole bullet block; the program is a three-mode memory modal; the dash form is unchanged; Lita flips native", () => {
    const d = detectTriggers(LITA).find((x) => x.event === "etb");
    const p = parseEffectClause(d.effectClause, "Instant");
    const dash = parseEffectClause(JUDGMENT_LEAD.replace(/^Whenever[^,]+, /, ""), "Instant");
    const row = { scope: d.scope, bullets: (d.effectClause.match(/•/g) || []).length, conf: programConfidence(p), modes: p?.modal?.modes?.length, mem: p?.modal?.modeMemoryPerTurn,
      dash: [programConfidence(dash), dash?.modal?.modes?.length, dash?.modal?.modeMemoryPerTurn], tier: classifyCard(LITA) };
    console.log("  WITNESS litaLead", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.scope).toBe("otherCreatureYouControl");
    expect(row.bullets).toBe(3);
    expect([row.conf, row.modes, row.mem]).toEqual(["high", 3, true]);
    expect(row.dash).toEqual(["high", 3, true]);
    expect(row.tier).toMatch(/^native/);
  });
});

describe("RUNTIME — three entries in one turn pick three different modes through the real flush chooser", () => {
  function board() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const lita = createPermanent({ id: "lita", card: LITA, controller: "user" });
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [lita], library: [{ id: "d1", name: "D1", type: "Sorcery", oracle: "" }, { id: "d2", name: "D2", type: "Sorcery", oracle: "" }] } } };
  }
  function enterAndResolve(s, card) {
    let next = enterPermanent(s, card, "user");
    next = flushTriggers(next, {});
    while (next.stack.length && !next.pendingChoice) next = resolveTopOfStack(next);
    return next;
  }
  it("the ledger fills with three distinct modes; the counter and the Food both really happened", () => {
    let s = board();
    s = enterAndResolve(s, BEAR(1));
    s = enterAndResolve(s, BEAR(2));
    s = enterAndResolve(s, BEAR(3));
    const modes = Object.keys(s.onceTriggersFiredThisTurn || {}).filter((k) => k.startsWith("lita_mode")).sort();
    const row = { modes, litaCounters: s.players.user.battlefield.find((p) => p.id === "lita")?.counters?.["+1/+1"] || 0,
      tokens: s.players.user.battlefield.filter((p) => p.card?.token).map((p) => p.card.name), pending: s.pendingChoice?.kind || null };
    console.log("  WITNESS litaMemory", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(modes).toEqual(["lita_mode0", "lita_mode1", "lita_mode2"]);
    expect(row.litaCounters).toBe(1);
    expect(row.tokens).toEqual(["Food"]);
  });
});
