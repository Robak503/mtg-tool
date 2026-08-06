/**
 * combatDamageToOpponent.test.js — CD-OPP: "Whenever … deals combat damage to AN OPPONENT" (CR 510.2).
 * Coastal Piracy, Hydra Omnivore, Mindscour Dragon, Joven and Chandler.
 *
 * ⭐⭐ A SPLIT-BY-TIER FIND WHERE THE SIBLINGS ARE IN THE SAME FILE. Seven matchers in triggers.js ALREADY
 * accepted `(?:a player|an opponent)` — the keyword-batch arm, the batch arm, the damage-to-a-player
 * (non-combat) arm, the enchanted-creature arm, the commander arm and both mill arms. The MAIN
 * combat-damage-to-a-player arm was the holdout, END-ANCHORED on the literal "a player". So the opponent
 * wording was not mis-scoped — it was **UNDETECTED ENTIRELY**: detectTriggers returned `[]` and the whole
 * card parked. Nothing about these effects was unmodelled. One noun.
 *
 * ⛔⛔ DETECTION IS NOT FIRING, AND THIS EVENT HAS ALREADY BURNED THIS PROJECT ONCE. The combatDamageToYou
 * arm a few lines above carries the scar in its own comment: a scope value scopeMatches did not know made
 * the descriptor detect fine and then NEVER FIRE, and "only the POSITIVE runtime test caught it" — the
 * negative half passed the entire time on nothing firing at all. That is exactly why this file drives the
 * real fire site and asserts a trigger ENQUEUED, rather than stopping at classifyCard.
 *
 * ⛔ WHY whose:"any" IS CORRECT AND A NEW SCOPE WOULD BE THE RISK. In combat the damaged player is the
 * DEFENDING player, who is by construction an opponent of the attacking creature's controller (CR 506.2) —
 * true even when the attacker was stolen, since the thief is then the controller. "a player" and "an
 * opponent" name the same reachable set for this event, so the two wordings genuinely are one descriptor.
 * Inventing a narrower scope value would have re-created the fail-closed trap above for no gain.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the outer
 * guard reverted to the literal "a player" -> all four carriers park AND the runtime row enqueues nothing.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const COASTAL_PIRACY = { id: "c-cp", name: "Coastal Piracy", type: "Enchantment", mana: "{2}{U}",
  oracle: "Whenever a creature you control deals combat damage to an opponent, you may draw a card." };
const MINDSCOUR = { id: "c-md", name: "Mindscour Dragon", type: "Creature — Dragon", mana: "{4}{U}{U}", power: "4", toughness: "4",
  oracle: ["Flying", "Whenever this creature deals combat damage to an opponent, target player mills four cards."].join("\n") };
const HYDRA_OMNIVORE = { id: "c-ho", name: "Hydra Omnivore", type: "Creature — Hydra", mana: "{4}{G}{G}", power: "4", toughness: "4",
  oracle: "Whenever this creature deals combat damage to an opponent, it deals that much damage to each other opponent." };
const JOVEN = { id: "c-jc", name: "Joven and Chandler", type: "Legendary Creature — Human Rogue", mana: "{2}{R}", power: "3", toughness: "3",
  oracle: ["Haste", "Whenever this creature deals combat damage to an opponent, destroy target artifact that player controls."].join("\n") };

describe("the carriers", () => {
  it("⭐ all four flip", () => {
    for (const c of [COASTAL_PIRACY, MINDSCOUR, HYDRA_OMNIVORE, JOVEN]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the opponent wording detects as the SAME descriptor the player wording does", () => {
    const opp = detectTriggers(MINDSCOUR).find((d) => d.event === "combatDamageToPlayer");
    const player = detectTriggers({ ...MINDSCOUR, oracle: MINDSCOUR.oracle.replace("an opponent", "a player") })
      .find((d) => d.event === "combatDamageToPlayer");
    const row = { opp: { event: opp?.event, scope: opp?.scope, whose: opp?.whose }, player: { event: player?.event, scope: player?.scope, whose: player?.whose } };
    console.log("  WITNESS cdOppDescriptor", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.opp).toEqual(row.player);
    expect(row.opp.event).toBe("combatDamageToPlayer");
  });

  it("⛔ a QUALIFIED variant still stays undetected (the end-anchor's real job)", () => {
    // The anchor exists to refuse scopes the engine cannot check — widening the NOUN must not have
    // loosened that. "…to an opponent or a planeswalker" has no modelled scope and must stay parked.
    expect(classifyCard({ ...MINDSCOUR, id: "c-q",
      oracle: ["Flying", "Whenever this creature deals combat damage to an opponent or a planeswalker, target player mills four cards."].join("\n") }))
      .not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the trigger actually FIRES (detection is not firing)", () => {
  function board(watcher) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const atk = createPermanent({ id: "atk", card: { id: "c-atk", name: "Attacker", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const w = createPermanent({ id: "w", card: watcher, controller: "user", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [atk, w] } } };
  }
  // The user's creature connects with an opponent — the shape every carrier here is written for.
  const EVENTS = [{ kind: "combat-damage-player", attackerId: "atk", attackingPlayer: "user", defender: "ai1", amount: 2 }];
  const fired = (watcher) => (checkCombatDamageTriggers(board(watcher), EVENTS).pendingTriggers || [])
    .filter((t) => t.descriptor?.event === "combatDamageToPlayer").length;

  it("⭐⭐ both the SELF and the creature-you-control scopes enqueue a real trigger", () => {
    // ⛔ THE POSITIVE CONTROL IS THE POINT. A descriptor that detects and never fires reads identically to
    // a working one at classifyCard — this event's own history says so. These counts are the difference.
    const row = {
      // Coastal Piracy watches "a creature you control" — the attacker is not the watcher.
      creatureYouControl: fired(COASTAL_PIRACY),
      // Mindscour watches ITSELF; the harness's watcher is a different permanent than the attacker, so a
      // self-scoped watcher must NOT fire here — the negative that proves the scopes are discriminated.
      selfScopedOnOtherAttacker: fired(MINDSCOUR),
      // …and the self-scoped watcher DOES fire when it is the attacker.
      selfScopedAsAttacker: (() => {
        const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
        const me = createPermanent({ id: "atk", card: MINDSCOUR, controller: "user", summoningSick: false });
        const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [me] } } };
        return (checkCombatDamageTriggers(st, EVENTS).pendingTriggers || [])
          .filter((t) => t.descriptor?.event === "combatDamageToPlayer").length;
      })(),
    };
    console.log("  WITNESS cdOppFires", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.creatureYouControl).toBe(1);
    expect(row.selfScopedOnOtherAttacker).toBe(0);
    expect(row.selfScopedAsAttacker).toBe(1);
  });
});
