/**
 * plusCountersOnSource.test.js — "for each +1/+1 counter ON IT" (CR 603.6e): Marketback Walker, Hooded Hydra
 * and Bloodtracker (dies / leaves), Embalmed Brawler (attacks or blocks), Kilnmouth Dragon and Goblin
 * Razerunners (activated / end-step, via the "the number of …" wording).
 *
 * ⛔⛔ ONE PHRASE, TWO SOURCES — THIS IS THE ENTIRE SLICE. On a DIES or LEAVES trigger the permanent is
 * already gone when the effect resolves, so the count must come from the CR 603.10a look-back. Reading the
 * live board there returns 0, and **a zero looks exactly like a working card**: Marketback Walker would
 * simply draw nothing and no assertion about "it resolved" would notice. On an ATTACKS / BLOCKS or activated
 * trigger the permanent is still on the battlefield and the board IS the right answer.
 *
 * ⭐ THE LOOK-BACK VALUE ALREADY EXISTED. `checkDiesTriggers` stamps `triggeringPlusCounterCount` off the
 * death snapshot for MODULAR; this reads that same field rather than threading a second one. The build is a
 * count kind that prefers it and falls back to the live permanent — nothing new is captured.
 *
 * ⛔ BOTH PATHS ARE PINNED, DELIBERATELY. A test that only drove the attacks case would pass with the dies
 * path returning zero — which is the failure mode this slice exists to avoid, not an edge case. The witness
 * prints both rows side by side.
 *
 * ⛔ `!= null` NOT TRUTHY on the look-back: a creature that died with ZERO counters must read 0 from the
 * snapshot, not fall through to a live lookup. Same answer today, wrong reason — and the wrong reason breaks
 * the moment a same-named permanent is on the battlefield.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * look-back branch removed -> the dies row reads 0 while the live row stays correct; the live fallback
 * removed -> the attacks row reads 0 while the dies row stays correct. **Each mutant breaks exactly one
 * row**, which is what proves the two paths are independent.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { countForSpec } from "./effects/atoms/shared.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

describe("the phrase", () => {
  it("⭐ the phrase resolves to one kind", () => {
    expect(parseCountSource("+1/+1 counters on it")).toEqual({ kind: "plusCountersOnSource" });
    expect(parseCountSource("+1/+1 counter on it")).toEqual({ kind: "plusCountersOnSource" });
    // ⓘ CORRECTED AFTER THE FIRST CUT ASSERTED OTHERWISE: parseCountSource is handed the phrase WITHOUT a
    // leading "the number of" — its callers strip that. So this reads null here and is NOT a gap; the
    // "damage equal to THE NUMBER OF +1/+1 counters on it" wording still works end to end, which is why
    // Kilnmouth Dragon and Goblin Razerunners flipped. Asserting the true contract rather than the one I
    // assumed.
    expect(parseCountSource("the number of +1/+1 counters on it")).toBeNull();
  });

  it("⭐ the whole cards flip, across both trigger shapes", () => {
    expect(classifyCard({ name: "Marketback Walker", type: "Artifact Creature — Construct", mana: "{X}{X}", power: "0", toughness: "0",
      oracle: "This creature enters with X +1/+1 counters on it.\n{4}: Put a +1/+1 counter on this creature.\nWhen this creature dies, draw a card for each +1/+1 counter on it." })).toBe("native-mixed");
    expect(classifyCard({ name: "Embalmed Brawler", type: "Creature — Zombie", mana: "{2}{B}", power: "2", toughness: "2",
      oracle: "Amplify 1 (As this creature enters, put a +1/+1 counter on it for each Zombie card you reveal in your hand.)\nWhenever this creature attacks or blocks, you lose 1 life for each +1/+1 counter on it." })).toBe("native-trigger");
  });
});

describe("⭐⭐ LAW 6 — the look-back and the live board, side by side", () => {
  const SPEC = { kind: "plusCountersOnSource" };

  it("⭐⭐ a DEAD source counts from the snapshot; a LIVE source counts from the board", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const live = createPermanent({ id: "live", card: { id: "c-l", name: "Brawler", type: "Creature — Zombie", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [{ ...live, counters: { "+1/+1": 4 } }] } } };
    const row = {
      // DIES path: the permanent is NOT on the battlefield; the count rides the death snapshot.
      diesLookBack: countForSpec(s, { sourceId: "gone", triggeringPlusCounterCount: 3 }, SPEC),
      // …and a creature that died with none reads 0 from the snapshot, not from a live miss.
      diesWithZero: countForSpec(s, { sourceId: "gone", triggeringPlusCounterCount: 0 }, SPEC),
      // LIVE path: no snapshot, so the board answers.
      liveBoard: countForSpec(s, { sourceId: "live" }, SPEC),
      // ⛔ THE FAILURE THIS SLICE EXISTS TO AVOID: a dies trigger read off the live board.
      deadReadLive: countForSpec(s, { sourceId: "gone" }, SPEC),
    };
    console.log("  WITNESS plusCountersOnSource", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ diesLookBack: 3, diesWithZero: 0, liveBoard: 4, deadReadLive: 0 });
  });

  it("⛔ the look-back WINS over a live permanent of the same id (LKI, not the current board)", () => {
    // CR 603.6e: the dying object's last-known counters, even if something with that id is on the board.
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "x", card: { id: "c-x", name: "X", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [{ ...perm, counters: { "+1/+1": 9 } }] } } };
    expect(countForSpec(s, { sourceId: "x", triggeringPlusCounterCount: 2 }, SPEC)).toBe(2);
  });
});
