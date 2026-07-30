/**
 * combatDamageToYou.test.js — "Whenever a creature deals combat damage to YOU" (CR 510.2), the
 * RECIPIENT-side twin of the fully-built to-a-player family, plus the named-token sacrifice payload it
 * needs. Together they flip The Cabbage Merchant (a cdh shelf card).
 *
 * Every other arm in checkCombatDamageTriggers is written from the DEALER's side. The only difference here
 * is which player's permanents are scanned — so the load-bearing test is the one proving the watcher
 * belongs to the DAMAGED player and does NOT fire for the attacker's controller. A scan of the wrong
 * player would satisfy every other assertion in this file.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkCombatDamageTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const WATCHER = { name: "Watcher", type: "Creature — Human Citizen", mana: "{2}{G}", oracle: "Whenever a creature deals combat damage to you, draw a card." };
const BEAR = { name: "Bear", type: "Creature — Bear", mana: "{1}{G}", oracle: "" };

/** `ai` attacks with a Bear; `watcherOwner` controls the to-you watcher. */
function board(watcherOwner) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const atk = createPermanent({ id: "atk", card: { ...BEAR, id: "catk" }, controller: "ai" });
  const w = createPermanent({ id: "w", card: { ...WATCHER, id: "cw" }, controller: watcherOwner });
  const put = (pid, perms) => ({ ...s.players[pid], battlefield: perms });
  return {
    ...s,
    players: {
      ...s.players,
      ai: put("ai", watcherOwner === "ai" ? [atk, w] : [atk]),
      user: put("user", watcherOwner === "user" ? [w] : []),
    },
  };
}

const EVENTS = [{ kind: "combat-damage-player", attackerId: "atk", attackingPlayer: "ai", defender: "user", amount: 2 }];
const firedFor = (owner) => (checkCombatDamageTriggers(board(owner), EVENTS).pendingTriggers || [])
  .filter((t) => t.descriptor?.event === "combatDamageToYou");

describe("combat damage to YOU — parse", () => {
  const mk = (o) => ({ name: "C", type: "Creature — Human", mana: "{2}{G}", oracle: o });

  it("the bare form is detected", () => {
    expect(classifyCard(mk("Whenever a creature deals combat damage to you, draw a card."))).toBe("native-trigger");
  });

  it("⛔ a QUALIFIED variant stays undetected (safe FN, never an over-fire)", () => {
    // "…to you or a planeswalker you control" is a scope the engine cannot check here, so it must not be
    // shaved down to the bare form. End-anchored on purpose.
    expect(classifyCard(mk("Whenever a creature deals combat damage to you or a planeswalker you control, draw a card."))).toBe("body-only");
  });
});

describe("⭐ ENFORCEMENT — the watcher belongs to the DAMAGED player", () => {
  it("fires for a watcher the damaged player controls", () => {
    expect(firedFor("user")).toHaveLength(1);
  });

  it("⭐ does NOT fire for a watcher the ATTACKING player controls", () => {
    // The discriminating assertion. Scanning the attacker's side instead would pass every other test
    // here, because the same event and the same attacker are involved either way.
    expect(firedFor("ai")).toHaveLength(0);
  });

  it("VACUITY CONTROL: with no damage events, nothing fires", () => {
    const out = checkCombatDamageTriggers(board("user"), []);
    expect((out.pendingTriggers || []).filter((t) => t.descriptor?.event === "combatDamageToYou")).toHaveLength(0);
  });
});

describe("named-token sacrifice payload", () => {
  it("parses a named token to its own victim pool", () => {
    expect(parseEffectClause("Sacrifice a Food token.", "Creature")?.atoms)
      .toEqual([{ op: "sacrifice", who: "controller", what: "token:food" }]);
    // The optional trailing word — both spellings are printed.
    expect(parseEffectClause("Sacrifice a Treasure.", "Creature")?.atoms)
      .toEqual([{ op: "sacrifice", who: "controller", what: "token:treasure" }]);
  });

  it("⛔ refuses a token the engine cannot mint (pool validated against NAMED_TOKENS)", () => {
    // A name outside the mint registry would produce a pool that is empty at resolution — i.e. a card
    // credited for a sacrifice that never happens. It must produce no atom at all instead.
    expect(parseEffectClause("Sacrifice a Wombat token.", "Creature")?.atoms).toEqual([]);
  });

  it("leaves the generic nouns byte-identical", () => {
    expect(parseEffectClause("Sacrifice a creature.", "Creature")?.atoms)
      .toEqual([{ op: "sacrifice", who: "controller", what: "creature" }]);
    expect(parseEffectClause("Sacrifice an artifact.", "Creature")?.atoms)
      .toEqual([{ op: "sacrifice", who: "controller", what: "artifact" }]);
  });
});

describe("the card", () => {
  it("The Cabbage Merchant is native (both halves together)", () => {
    // Oracle from the bundled snapshot, reminder text as printed.
    expect(classifyCard({
      name: "The Cabbage Merchant", type: "Legendary Creature — Human Citizen", mana: "{2}{G}",
      oracle: 'Whenever an opponent casts a noncreature spell, create a Food token. (It\'s an artifact with "{2}, {T}, Sacrifice this token: You gain 3 life.")\nWhenever a creature deals combat damage to you, sacrifice a Food token.\nTap two untapped Foods you control: Add one mana of any color.',
    })).toBe("native-mana");
  });
});
