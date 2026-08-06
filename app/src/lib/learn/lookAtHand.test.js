/**
 * lookAtHand.test.js — "Look at target player's hand." (CR 701.20e)
 * Peek · Gitaxian Probe · Clairvoyance · Ingenious Thief · Glasses of Urza.
 *
 * ⭐ THE ONLY EFFECT IN THE FAMILY WITH NO BOARD CONSEQUENCE, which makes it the easiest one to fake.
 * CR 701.20e: looking follows the reveal rules, except the card is shown only to the specified player.
 * No zone change, no state change — the information IS the effect. So an atom that resolved to a bare
 * `effect:"look-at-hand"` marker would let five cards classify native while conveying NOTHING, and every
 * test that merely asserted "an atom was produced" would pass on it.
 *
 * ⭐ SO THE FIRST TEST BELOW IS THE ONE THAT DECIDES WHETHER THIS BUILD IS REAL: the logged card list must
 * EQUAL the target's actual hand. If that could not be asserted, this arm would not be worth having.
 *
 * The log is a consumed surface, not a debug artifact — /api/why-you-lost, /api/self-play and /api/grind
 * all read it, so a looked-at hand genuinely reaches a reader.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { lookAtHandClauseParser } from "./effects/atoms/hand.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";

beforeEach(() => _resetIdsForTests());

const PEEK = { name: "Peek", type: "Instant", mana: "{U}", oracle: "Look at target player's hand.\nDraw a card." };
const GITAXIAN_PROBE = { name: "Gitaxian Probe", type: "Sorcery", mana: "{U/P}",
  oracle: "({U/P} can be paid with either {U} or 2 life.)\nLook at target player's hand.\nDraw a card." };
const CLAIRVOYANCE = { name: "Clairvoyance", type: "Instant", mana: "{U}",
  oracle: "Look at target player's hand.\nDraw a card at the beginning of the next turn's upkeep." };
const INGENIOUS_THIEF = { name: "Ingenious Thief", type: "Creature — Human Rogue", power: "1", toughness: "1", mana: "{2}{U}",
  oracle: "Flying\nWhen this creature enters, look at target player's hand." };
const GLASSES_OF_URZA = { name: "Glasses of Urza", type: "Artifact", mana: "{1}", oracle: "{T}: Look at target player's hand." };

// ⛔ The richer shapes — a look PLUS a choice PLUS a material consequence. A different build.
const AGONIZING_MEMORIES = { name: "Agonizing Memories", type: "Sorcery", mana: "{2}{B}{B}",
  oracle: "Look at target player's hand and choose two cards from it. Put them on top of that player's library in any order." };
const MIND_WARP = { name: "Mind Warp", type: "Sorcery", mana: "{X}{2}{B}",
  oracle: "Look at target player's hand and choose X cards from it. That player discards those cards." };
const EXTORTION = { name: "Extortion", type: "Sorcery", mana: "{2}{B}{B}",
  oracle: "Look at target player's hand and choose up to two cards from it. That player discards those cards." };
const THRULL_SURGEON = { name: "Thrull Surgeon", type: "Creature — Thrull", power: "1", toughness: "1", mana: "{1}{B}",
  oracle: "{1}{B}, Sacrifice this creature: Look at target player's hand and choose a card from it. That player discards that card. Activate only as a sorcery." };
const VENDILION_CLIQUE = { name: "Vendilion Clique", type: "Legendary Creature — Faerie Wizard", power: "3", toughness: "1", mana: "{1}{U}{U}",
  oracle: "Flash\nFlying\nWhen Vendilion Clique enters, look at target player's hand. You may choose a nonland card from it. If you do, that player reveals the chosen card, puts it on the bottom of their library, then draws a card." };

const card = (name) => ({ id: `c-${name}`, name, type: "Instant", mana: "{1}", oracle: "" });

/** A board where the two seats hold DIFFERENT, non-empty hands — so an equality assertion can discriminate. */
function board() {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [card("Mine A"), card("Mine B")] },
      ai1: { ...s.players.ai1, hand: [card("Theirs X"), card("Theirs Y"), card("Theirs Z")] },
    },
  };
}

const look = (state, targets) => {
  const out = runEffectProgram(state, {
    source: { name: "Peek" },
    payload: { params: { program: parseEffectClause("Look at target player's hand.", "Instant"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return out?.state ?? out;
};
const lookEntries = (s) => (s.log || []).filter((e) => e.effect === "look-at-hand");

describe("⭐ ENFORCEMENT — the information is actually delivered", () => {
  it("VACUITY CONTROL: the two seats hold different, non-empty hands", () => {
    // Without this, an equality assertion could pass by comparing two empty arrays — the exact hollow
    // shape this whole file exists to rule out.
    const s = board();
    expect(s.players.ai1.hand.map((c) => c.name)).toEqual(["Theirs X", "Theirs Y", "Theirs Z"]);
    expect(s.players.user.hand.map((c) => c.name)).toEqual(["Mine A", "Mine B"]);
  });

  it("⭐ THE DECIDING ASSERTION — the log carries the target's REAL hand, card for card", () => {
    const s = look(board(), [{ type: "player", id: "ai1", atomIndex: 0 }]);
    const [entry] = lookEntries(s);
    expect(entry).toBeDefined();
    // A marker-only resolver ("we looked at something") passes nothing here. This is the whole effect.
    expect(entry.cards).toEqual(["Theirs X", "Theirs Y", "Theirs Z"]);
  });

  it("⛔ WRONG-OWNER PIN — looker is the controller, player is the target, and they are not swapped", () => {
    const s = look(board(), [{ type: "player", id: "ai1", atomIndex: 0 }]);
    const [entry] = lookEntries(s);
    expect(entry.looker).toBe("user");
    expect(entry.player).toBe("ai1");
    // The discriminating half: the CONTROLLER's own hand must not be what got read.
    expect(entry.cards).not.toContain("Mine A");
  });

  it("targeting a different seat reads THAT seat's hand", () => {
    const s = look(board(), [{ type: "player", id: "user", atomIndex: 0 }]);
    expect(lookEntries(s)[0].cards).toEqual(["Mine A", "Mine B"]);
  });

  it("no legal target → an empty entry, never a fabricated peek", () => {
    const s = look(board(), []);
    const [entry] = lookEntries(s);
    expect(entry.cards).toEqual([]);
    expect(entry.player).toBeNull();
  });

  it("nothing else moves — looking is not a reveal-and-take (CR 701.20e)", () => {
    const before = board();
    const s = look(before, [{ type: "player", id: "ai1", atomIndex: 0 }]);
    expect(s.players.ai1.hand.map((c) => c.name)).toEqual(before.players.ai1.hand.map((c) => c.name));
    expect(s.players.user.hand.map((c) => c.name)).toEqual(before.players.user.hand.map((c) => c.name));
  });
});

describe("parse + targeting intent", () => {
  it("emits the player-targeted atom", () => {
    expect(parseEffectClause("Look at target player's hand.", "Instant")?.atoms)
      .toEqual([{ op: "look-at-hand", targetType: "player" }]);
  });

  it("⭐ intent is ENEMY — without it Ingenious Thief's ETB cannot route", () => {
    // Legality stays wider than intent ("target player" really is any player); intent is what lets the
    // α1 trigger chooser place it on a provably-correct side. This case IS why the Thief flips.
    expect(atomTargetIntent({ op: "look-at-hand", targetType: "player" })).toBe("enemy");
  });

  it("⛔ the look-and-choose form does not parse — and here is what ACTUALLY stops it", () => {
    // ⚠️ A first draft credited the ^…$ anchor for this. A mutation loosening the anchor to a prefix match
    // changed nothing, which proved the claim wrong: the clause is SPLIT on " and ", and it is the SECOND
    // fragment failing that sinks the whole program. Both halves asserted, so the real mechanism is the
    // one on record.
    expect(parseEffectClause("Look at target player's hand and choose two cards from it.", "Sorcery")?.atoms).toEqual([]);
    expect(parseEffectClause("choose two cards from it", "Sorcery")?.atoms).toEqual([]);   // ← the actual guard
  });

  it("⛔ the whole-clause anchor, tested where it is observable — at the clause parser itself", () => {
    // Belt-and-braces the program-level split hides: if a future rider used a conjunction the splitter does
    // NOT break on, a prefix match would swallow the tail and silently drop it (the forbidden partial).
    // Asserted directly against the parser so the anchor is load-bearing rather than decorative.
    expect(lookAtHandClauseParser("look at target player's hand")).toEqual({ op: "look-at-hand", targetType: "player" });
    expect(lookAtHandClauseParser("look at target player's hand and choose two cards from it")).toBeNull();
    // ⚠️ THE THIRD LINE HERE ASSERTED THE **OPPONENT** WORDING RETURNS NULL, and it sat inside an ANCHOR
    // test while actually pinning something else: that the opponent NOUN was unhandled. It was the record
    // of a gap, not of a guard — 15 corpus cards use that wording against 14 for "player", so the atom,
    // resolver and log were all built while the larger half never reached them (LH-2). Rewritten to assert
    // the noun is now supported, with the ANCHOR coverage kept symmetric on BOTH nouns below.
    expect(lookAtHandClauseParser("look at target opponent's hand")).toEqual({ op: "look-at-hand", targetType: "opponent" });
    expect(lookAtHandClauseParser("look at target opponent's hand and choose two cards from it")).toBeNull();
  });

  it("a comma rider still splits cleanly — the arm takes its own sentence only", () => {
    expect(parseEffectClause("Look at target player's hand, then draw a card.", "Sorcery")?.atoms)
      .toEqual([{ op: "look-at-hand", targetType: "player" }, { op: "draw", amount: 1, targetType: null }]);
  });
});

describe("the corpus rows", () => {
  it("all five carriers flip", () => {
    expect(classifyCard(PEEK)).toBe("native-spell");
    expect(classifyCard(GITAXIAN_PROBE)).toBe("native-spell");
    expect(classifyCard(CLAIRVOYANCE)).toBe("native-spell");
    expect(classifyCard(INGENIOUS_THIEF)).toBe("native-trigger");
    expect(classifyCard(GLASSES_OF_URZA)).toBe("native-activated");
  });

  it("⛔ CREED — every look-and-choose card stays non-native", () => {
    for (const c of [AGONIZING_MEMORIES, MIND_WARP, EXTORTION, THRULL_SURGEON, VENDILION_CLIQUE]) {
      expect(classifyCard(c)).not.toMatch(/^native/);
    }
  });
});

describe("⭐⭐ LH-2 — the OPPONENT wording: built engine, no ignition", () => {
  // ⭐⭐ THE COUNT IS THE FINDING. 15 corpus cards say "look at target OPPONENT's hand" and 14 say "target
  // PLAYER's hand". Everything above this line — the atom, applyLookAtHand, the truthful log and its gates
  // — was already built and correct; the clause parser simply had no branch for the larger half. Nothing
  // was broken. One noun was missing, and five cards sat on the Arbiter because of it.
  const SORCEROUS_SIGHT = { id: "c-sos", name: "Sorcerous Sight", type: "Instant", mana: "{U}",
    oracle: "Look at target opponent's hand.\nDraw a card." };
  const TELEPATHIC_SPIES = { id: "c-tsp", name: "Telepathic Spies", type: "Creature — Human Advisor", mana: "{2}{U}", power: "1", toughness: "3",
    oracle: "When this creature enters, look at target opponent's hand." };
  const WANDERGUARD_SENTRY = { id: "c-wgs", name: "Wanderguard Sentry", type: "Creature — Human Soldier", mana: "{3}{U}", power: "2", toughness: "3",
    oracle: "When this creature enters, look at target opponent's hand." };

  it("⭐ the clause parses, and to the NARROWER target type", () => {
    expect(lookAtHandClauseParser("Look at target opponent's hand")).toEqual({ op: "look-at-hand", targetType: "opponent" });
    // The player wording is untouched — this is additive by construction.
    expect(lookAtHandClauseParser("Look at target player's hand")).toEqual({ op: "look-at-hand", targetType: "player" });
  });

  it("⭐ the carriers flip", () => {
    expect(classifyCard(SORCEROUS_SIGHT)).toBe("native-spell");
    expect(classifyCard(TELEPATHIC_SPIES)).toBe("native-trigger");
    expect(classifyCard(WANDERGUARD_SENTRY)).toBe("native-trigger");
  });

  it("⛔⛔ THE PIN THAT MATTERS: an OPPONENT target never offers the CONTROLLER", () => {
    // "opponent" is NARROWER than "player", and reusing "player" would have been a legal-target set larger
    // than printed — the forbidden direction. A pin that only checked "it looked at a hand" would pass
    // while the card peeked at its own controller's hand.
    const s = board();
    const row = {
      opponent: enumerateTargets(s, "user", { targetType: "opponent" }, []).map((t) => t.id).sort(),
      player: enumerateTargets(s, "user", { targetType: "player" }, []).map((t) => t.id).sort(),
    };
    console.log("  WITNESS lookAtHandOpponentPool", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.opponent).not.toContain("user");        // ⛔ the whole point
    expect(row.player).toContain("user");              // …and the control that proves the two differ
    expect(row.opponent.length).toBe(row.player.length - 1);
  });

  it("⭐⭐ LAW 6 — the log names the OPPONENT seat and carries their ACTUAL hand", () => {
    // The file's standing discipline (see the header): a bare marker would let cards classify native while
    // conveying nothing, so the log must equal the real hand. Same bar for the opponent wording.
    const before = board();
    const out = runEffectProgram(before, {
      source: { name: "Sorcerous Sight" },
      payload: { params: { program: parseEffectClause("Look at target opponent's hand.", "Instant"), controller: "user", sourceId: "src", context: {}, targets: [{ type: "player", id: "ai1", atomIndex: 0 }] } },
    });
    const s = out?.state ?? out;
    const entries = (s.log || []).filter((e) => e.effect === "look-at-hand");
    const row = { count: entries.length, looker: entries[0]?.looker, player: entries[0]?.player, cards: entries[0]?.cards };
    console.log("  WITNESS lookAtHandOpponentLog", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ count: 1, looker: "user", player: "ai1", cards: ["Theirs X", "Theirs Y", "Theirs Z"] });
    // …and looking is not taking (CR 701.20e) — the hand is unchanged.
    expect(s.players.ai1.hand.map((c) => c.name)).toEqual(before.players.ai1.hand.map((c) => c.name));
  });

  it("⛔ the look-and-CHOOSE family still parks on the opponent wording too", () => {
    // The whole-clause anchor is unchanged, and its documented reason is the tail, not the noun. A choice
    // with a material consequence remains a different build.
    expect(classifyCard({ id: "c-dcb", name: "Deep-Cavern Bat", type: "Creature — Bat", mana: "{1}{B}", power: "1", toughness: "1",
      oracle: "Flying\nWhen this creature enters, look at target opponent's hand. You may exile a nonland card from it. For as long as that card remains exiled, its owner may play it." })).not.toMatch(/^native/);
  });
});
