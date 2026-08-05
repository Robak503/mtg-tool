/**
 * selfDiscardTrigger.test.js — "Whenever you discard a card, …" / "Whenever you cycle or discard [an]other
 * card, …" (CR 701.9a): Grisly Survivor, Hekma Sentinels, Ruthless Sniper, Curator of Mysteries, Drake
 * Haven, Faith of the Devoted, Flameblade Adept, Lazotep Chancellor and eight more.
 *
 * ⭐⭐ BOTH HALVES BUILT, NEVER MET — and the missing piece was one word in a loop header. The `discarded`
 * event ships, and `checkDiscardTriggers` is already called from EVERY discard path in the dispatcher,
 * cost sites included (its own comment cites CR 701.9a: "a discard paid as a COST is still a discard").
 * But the checker only ever scanned `opponentsOf(discardingPlayerId)` — the discarding player's OWN
 * permanents were never consulted, so a self-scoped watcher could not exist at all. The fire sites, the
 * event, the CR reasoning: all there. Nobody had ever scanned the other side of the table.
 *
 * ⛔⛔ THE SCOPE FILTERS ARE LOAD-BEARING IN BOTH DIRECTIONS, and that is why each scan carries one. Without
 * them a self-scoped watcher would ALSO fire off an opponent's discard (it is on the board during that scan
 * too) and an opponent-scoped watcher would fire off its own controller's discard. **Two over-fires, in
 * opposite directions, from one omission** — pinned separately below.
 *
 * ⭐ "CYCLE OR DISCARD" COLLAPSES TO THE DISCARD EVENT, and that is CR-correct rather than convenient:
 * cycling discards the card (CR 702.29a) and the dispatcher's cycling path already calls
 * checkDiscardTriggers. One cycle = one discard = one fire.
 *
 * ⛔ A CYCLE-ONLY FORM IS REFUSED ("whenever you cycle a card"; "whenever a player cycles a card" — Stoic
 * Champion, Warped Researcher). Routing those through the discard event would fire them on an ordinary
 * discard, strictly more than printed. They stay Arbiter until there is a real cycling event. Pinned.
 *
 * ⓘ "ANOTHER card" is admitted: the watcher is a permanent on the battlefield and the discarded card is in
 * hand, so "another" holds by construction.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * self scan removed -> the witness shows zero self-fires; the self scan's scopeFilter removed -> a
 * self-watcher fires off an OPPONENT's discard; the opponent scan's scopeFilter removed -> an
 * opponent-watcher fires off its own controller's discard.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { checkDiscardTriggers, detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SELF_WATCHER = { id: "c-gs", name: "Grisly Survivor", type: "Creature — Minotaur Warrior", mana: "{2}{B}",
  power: "3", toughness: "3", oracle: "Whenever you cycle or discard a card, this creature gets +2/+0 until end of turn." };
const OPP_WATCHER = { id: "c-lc", name: "Liliana's Caress", type: "Enchantment", mana: "{1}{B}",
  oracle: "Whenever an opponent discards a card, that player loses 2 life." };

describe("detection", () => {
  it("⭐ the self forms detect on the shipped event with the new scope", () => {
    for (const o of [
      "Whenever you discard a card, this creature gets +1/+1 until end of turn.",
      "Whenever you cycle or discard a card, this creature gets +1/+1 until end of turn.",
      "Whenever you cycle or discard another card, scry 1.",
    ]) {
      const d = detectTriggers({ name: "Probe", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: o });
      expect(d.map((x) => [x.event, x.scope])).toEqual([["discarded", "youDiscard"]]);
    }
  });

  it("⛔ a CYCLE-ONLY form is refused — it must not ride the discard event", () => {
    for (const o of [
      "Whenever you cycle a card, this creature gets +1/+1 until end of turn.",
      "Whenever a player cycles a card, this creature gets +1/+1 until end of turn.",
    ]) {
      const card = { name: "Probe", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: o };
      expect(detectTriggers(card)).toEqual([]);
      expect(classifyCard(card)).not.toMatch(/^native/);
    }
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(SELF_WATCHER)).toBe("native-trigger");
    expect(classifyCard({ name: "Drake Haven", type: "Enchantment", mana: "{2}{U}",
      oracle: "Whenever you cycle or discard a card, you may pay {1}. If you do, create a 2/2 blue Drake creature token with flying." })).toBe("native-trigger");
  });
});

describe("⭐⭐ LAW 6 — each scan is its own gate, and neither leaks into the other", () => {
  /** user controls the self-watcher; ai controls the opponent-watcher. Both are on the board at once. */
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, players: { ...g.players,
      user: { ...g.players.user, battlefield: [createPermanent({ id: "mine", card: SELF_WATCHER, controller: "user" })] },
      ai: { ...g.players.ai, battlefield: [createPermanent({ id: "theirs", card: OPP_WATCHER, controller: "ai" })] } } };
  }
  const fires = (discarder) => {
    const out = checkDiscardTriggers(board(), discarder, 1);
    const t = (out.pendingTriggers || []).filter((x) => x.event === "discarded");
    return { self: t.filter((x) => x.descriptor?.scope === "youDiscard").length,
      opponent: t.filter((x) => x.descriptor?.scope === "opponentDiscard").length };
  };

  it("⭐⭐ USER discards → only the user's self-watcher fires", () => {
    const row = { userDiscards: fires("user"), aiDiscards: fires("ai") };
    console.log("  WITNESS selfDiscard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      // The user's own watcher fires; the ai's opponent-watcher ALSO fires, because the user IS its opponent.
      userDiscards: { self: 1, opponent: 1 },
      // The ai discards: its own opponent-watcher must NOT fire off its controller's discard, and the user's
      // self-watcher must NOT fire off someone else's. Both zero is the whole pin.
      aiDiscards: { self: 0, opponent: 0 },
    });
  });

  it("⭐ the count is honoured — a 3-card discard fires it three times (CR 701.9a, per card)", () => {
    const out = checkDiscardTriggers(board(), "user", 3);
    const t = (out.pendingTriggers || []).filter((x) => x.descriptor?.scope === "youDiscard");
    expect(t).toHaveLength(3);
  });

  it("⛔ a player with no watcher fires nothing", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    expect((checkDiscardTriggers(g, "user", 1).pendingTriggers || [])).toHaveLength(0);
  });
});
