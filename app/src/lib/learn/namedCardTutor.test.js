/**
 * namedCardTutor.test.js — "search your library for a card named <X>, reveal it, put it into your hand,
 * then shuffle." The fetch-your-twin family: Screaming Seahawk · Avarax · Daru Cavalier · Embermage Goblin ·
 * Welkin Hawk · Growth-Chamber Guardian.
 *
 * The engine already knew how to search for a card BY NAME — the partner-with slice built `filter.name` and
 * the matcher that enforces it. What it could not do was let a card search its OWN controller's library that
 * way: the only named-tutor arm was the partner-with shape, where the SEARCHER and the DECIDER are both a
 * targeted player. This adds the untargeted self-search arm beside it.
 *
 * ⛔ KEPT AS A SEPARATE ARM ON PURPOSE. Widening the partner-with regex would have meant one matcher serving
 * two different actors (target-player-searches-their-library vs controller-searches-their-own), which is
 * precisely how a tutor ends up searching the wrong library. What they legitimately share — the name gate —
 * is shared; what differs is not.
 *
 * ⭐ THE CANDIDATE POOL IS THE TEST THAT MATTERS. A tutor that offers the whole library and happens to pick
 * the right card looks identical to a correct one on a two-card fixture. So the library below is stocked
 * with decoys, and the assertion is that the pool contains EXACTLY the named card.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveTutorChoice, autoPickTutorCandidate, resolveOptionalChoice } from "./effects/runProgram.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";

beforeEach(() => _resetIdsForTests());

const SEAHAWK_ORACLE = "Flying\nWhen this creature enters, you may search your library for a card named Screaming Seahawk, reveal it, put it into your hand, then shuffle.";
const SEAHAWK = { id: "csh", name: "Screaming Seahawk", type: "Creature — Bird", mana: "{4}{U}", power: 2, toughness: 2, oracle: SEAHAWK_ORACLE };
const card = (id, name, type = "Creature — Bird") => ({ id, name, type, power: 2, toughness: 2, oracle: "" });

/** A Seahawk on the battlefield, and a library holding its twin among decoys. */
function board() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const perm = createPermanent({ id: "h", card: SEAHAWK, controller: "user" });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: {
      ...s0.players,
      user: {
        ...s0.players.user, battlefield: [perm], hand: [],
        library: [
          card("L1", "Forest", "Basic Land — Forest"),
          card("L2", "Screaming Seahawk"),          // ← the only legal find
          card("L3", "Welkin Hawk"),                // decoy: another Bird
          card("L4", "Screaming Fury", "Instant"),  // decoy: shares a WORD with the name
        ],
      },
    },
  };
}

describe("⭐ the search really happens, and finds exactly the named card", () => {
  it("Screaming Seahawk fetches its twin into hand", () => {
    let s = flushTriggers(checkEnterTriggers(board(), board().players.user.battlefield[0]), { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    let sawPool = null;
    while (((s.stack || []).length || s.pendingChoice) && guard++ < 12) {
      if (s.pendingChoice?.kind === "tutor-search") {
        sawPool = s.pendingChoice.candidates.map((c) => c.name);
        s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
        continue;
      }
      if (s.pendingChoice) { s = resolveOptionalChoice(s, true); continue; }  // the printed "you may"
      s = resolveTopOfStack(s);
    }
    // ⭐ EXACTLY the named card was offered — not the Bird, not the card sharing a word with the name.
    expect(sawPool).toEqual(["Screaming Seahawk"]);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Screaming Seahawk"]);
    expect(s.players.user.library.map((c) => c.name).sort()).toEqual(["Forest", "Screaming Fury", "Welkin Hawk"]);
    expect((s.log || []).filter((l) => l.kind === "stack-resolve-error")).toHaveLength(0);
  });

  it("⛔ finds nothing when the named card is not in the library — and does not substitute", () => {
    const b = board();
    const noTwin = {
      ...b,
      players: { ...b.players, user: { ...b.players.user, library: [card("L1", "Forest", "Basic Land — Forest"), card("L3", "Welkin Hawk")] } },
    };
    let s = flushTriggers(checkEnterTriggers(noTwin, noTwin.players.user.battlefield[0]), { chooseTargets: chooseTriggerTargets });
    let guard = 0;
    while (((s.stack || []).length || s.pendingChoice) && guard++ < 12) {
      if (s.pendingChoice?.kind === "tutor-search") {
        expect(s.pendingChoice.candidates).toEqual([]);   // nothing legal to find
        s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
        continue;
      }
      if (s.pendingChoice) { s = resolveOptionalChoice(s, true); continue; }
      s = resolveTopOfStack(s);
    }
    expect(s.players.user.hand).toEqual([]);
    expect(s.players.user.library.map((c) => c.name).sort()).toEqual(["Forest", "Welkin Hawk"]);
  });
});

describe("the atom is right", () => {
  const atom = (t) => parseEffectClause(t)?.atoms?.[0] || null;

  it("parses to a name-filtered tutor to hand", () => {
    expect(atom("search your library for a card named Screaming Seahawk, reveal it, put it into your hand, then shuffle."))
      .toMatchObject({ op: "tutor", filter: { name: "screaming seahawk" }, destination: "hand" });
  });

  it("⛔ does NOT claim the searcher is a target — that is the partner-with arm's shape, not this one", () => {
    const a = atom("search your library for a card named Avarax, reveal it, put it into your hand, then shuffle.");
    expect(a.searcherIsTarget).toBeUndefined();
    expect(a.targetType).toBeNull();
  });

  it("⛔ REFUSES a disjunctive name (Forging the Tyrite Sword)", () => {
    // "a card named Halvar, God of Battle OR an Equipment card" — admitting it would silently drop half the
    // choice, so it falls to the Arbiter. The comma'd legendary name alone must still pass, which is why the
    // refusal is anchored on " or " and not on the comma.
    expect(atom("search your library for a card named Halvar, God of Battle or an Equipment card, reveal it, put it into your hand, then shuffle.")).not.toMatchObject({ op: "tutor" });
    expect(atom("search your library for a card named Halvar, God of Battle, reveal it, put it into your hand, then shuffle."))
      .toMatchObject({ op: "tutor", filter: { name: "halvar, god of battle" } });
  });

  it("the trigger routes natively", () => {
    expect(triggerRoutesNatively(detectTriggers(SEAHAWK)[0])).toBe(true);
  });
});

describe("classification — the six real carriers flip", () => {
  const CASES = [
    ["Screaming Seahawk", "Creature — Bird", "Flying\nWhen this creature enters, you may search your library for a card named Screaming Seahawk, reveal it, put it into your hand, then shuffle."],
    ["Avarax", "Creature — Beast", "Flying\nHaste\n{1}{R}: This creature gets +1/+0 until end of turn.\nWhen this creature enters, you may search your library for a card named Avarax, reveal it, put it into your hand, then shuffle."],
    ["Daru Cavalier", "Creature — Human Soldier", "First strike\nWhen this creature enters, you may search your library for a card named Daru Cavalier, reveal it, put it into your hand, then shuffle."],
    ["Welkin Hawk", "Creature — Bird", "Flying\nWhen this creature dies, you may search your library for a card named Welkin Hawk, reveal that card, put it into your hand, then shuffle."],
  ];
  for (const [name, type, oracle] of CASES) {
    it(`${name}`, () => expect(classifyCard({ name, type, mana: "{2}{W}", power: "2", toughness: "2", oracle })).toMatch(/^native/));
  }

  it("⛔ CREED — an unmodeled sibling clause still parks the card", () => {
    expect(classifyCard({ name: "Fake", type: "Creature — Bird", mana: "{2}{W}", power: "2", toughness: "2", oracle: `${SEAHAWK_ORACLE}\nEach opponent glorbulates at dawn.` })).not.toMatch(/^native/);
  });
});
