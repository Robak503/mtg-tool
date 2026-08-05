/**
 * playerHexproof.test.js — "You have hexproof." (CR 702.11d): Leyline of Sanctity, Aegis of the Gods,
 * Spirit of the Hearth, Metropolis Reformer, Witchbane Orb, Orbs of Warding, Keen-Eared Sentry,
 * Crystal Barricade.
 *
 * ⭐ THE FIRST PLAYER-SCOPED STATIC IN THE ENGINE. Every continuous effect before this one affected a
 * PERMANENT, so "you have hexproof" had nowhere to live and the whole family parked — not because the
 * clause was hard to read, but because there was no shape to put it in.
 *
 * ⛔ THE SHAPE CHOSEN, AND WHY NOT THE OTHER ONE. It emits an INERT layer-6 op and exactly one consumer
 * reads it — the `assignsCombatDamageWithToughness` precedent. The layer engine skips it wholesale
 * (l6IndexOf only processes add/removeKeyword/Protection/Ward), so P/T and keyword derivation are
 * byte-identical to before. The alternative — inventing a player-affects mode — would have forced every
 * collector, selector and matcher in layers.js to learn a scope none of them has any use for, to serve
 * eight cards. `affects: self` is the SOURCE permanent; the reader resolves the grant to that permanent's
 * CONTROLLER, so the op never actually affects the thing it rides on.
 *
 * ⛔ HEXPROOF STOPS TARGETING, NOTHING ELSE, and it is enforced at the SINGLE target-enumeration seam for
 * exactly that reason. Damage, sacrifice edicts, "each player discards", mill — all untargeted, all
 * untouched. Enforcing it anywhere broader would quietly make these cards read as protection from
 * everything, which is not what they print.
 *
 * ⛔ IT IS OPPONENT-SCOPED, NOT ABSOLUTE — the half a naive implementation gets wrong. "You can't be the
 * target of spells or abilities your OPPONENTS control": a player with Leyline of Sanctity may still target
 * THEMSELF. Both directions are driven below; the self-target row is what separates a correct
 * implementation from "hexproof means nobody can ever target you".
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * parser arm removed -> all four carriers park; the enumeration guard removed -> the opponent can target
 * the protected player again and the witness row shows it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { playerHasHexproof } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AEGIS_OF_THE_GODS = { id: "c-ag", name: "Aegis of the Gods", type: "Enchantment Creature — Human Soldier",
  mana: "{1}{W}", power: "2", toughness: "1",
  oracle: "You have hexproof. (You can't be the target of spells or abilities your opponents control.)" };
const LEYLINE_OF_SANCTITY = { id: "c-ls", name: "Leyline of Sanctity", type: "Enchantment", mana: "{2}{W}{W}",
  oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)" };

describe("the clause parses into an inert, player-scoped op", () => {
  it("⭐ one layer-6 playerHexproof descriptor, and the carriers flip", () => {
    expect(parseStaticAbilities(AEGIS_OF_THE_GODS)).toEqual([
      { layer: 6, op: { layerOp: "playerHexproof" }, affects: { mode: "self" }, duration: { kind: "permanent" } },
    ]);
    expect(classifyCard(AEGIS_OF_THE_GODS)).toBe("native-static");
    expect(classifyCard(LEYLINE_OF_SANCTITY)).toBe("native-static");
  });

  it("⛔ WHOLE-CLAUSE ANCHORED — a qualified or conditional grant is NOT this", () => {
    const probe = (line) => parseStaticAbilities({ id: "p", name: "Probe", type: "Enchantment", mana: "{W}", oracle: line });
    expect(probe("You have hexproof from black.")).toEqual([]);
    expect(probe("You have hexproof as long as you control a Cleric.")).toEqual([]);
  });
});

describe("⭐ LAW 6 — driven at the real target-enumeration seam", () => {
  // `user` holds the Aegis. ai1 and ai2 are opponents with nothing.
  function board({ withAegis }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = withAegis ? [createPermanent({ id: "aegis", card: AEGIS_OF_THE_GODS, controller: "user", summoningSick: false })] : [];
    return { ...g, turn: 4, players: { ...g.players, user: { ...g.players.user, battlefield: bf } } };
  }
  // "target player" — the broadest player-target enumeration in the engine.
  const targetsFor = (s, caster) => enumerateTargets(s, caster, { kind: "discard", targetType: "player" }, [])
    .map((t) => t.id).sort();

  it("⭐ an opponent can't target the protected player; the player still can target THEMSELF", () => {
    const rows = [];
    for (const withAegis of [false, true]) {
      const s = board({ withAegis });
      rows.push({
        aegis: withAegis,
        hexproof: playerHasHexproof(s, "user"),
        opponentSees: targetsFor(s, "ai1"),   // what ai1 may aim at
        userSees: targetsFor(s, "user"),      // what the protected player may aim at
      });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { aegis: false, hexproof: false, opponentSees: ["ai1", "ai2", "ai3", "user"], userSees: ["ai1", "ai2", "ai3", "user"] },
      {
        aegis: true, hexproof: true,
        // ⛔ `user` is gone from the OPPONENT's list — and ai2/ai3 are still there, which is the control
        // that separates "hexproof works" from "player targeting broke".
        opponentSees: ["ai1", "ai2", "ai3"],
        // ⭐ THE ROW A NAIVE IMPLEMENTATION FAILS: hexproof is OPPONENT-scoped, so the protected player
        // still sees themself. Leyline of Sanctity does not stop you aiming your own effects at yourself.
        userSees: ["ai1", "ai2", "ai3", "user"],
      },
    ]);
  });

  it("⛔ it LIFTS when the permanent leaves — a static, not a one-way stamp", () => {
    const on = board({ withAegis: true });
    expect(playerHasHexproof(on, "user")).toBe(true);
    const off = { ...on, players: { ...on.players, user: { ...on.players.user, battlefield: [] } } };
    expect(playerHasHexproof(off, "user")).toBe(false);
    expect(targetsFor(off, "ai1")).toContain("user");
  });

  it("⛔ the grant follows the CONTROLLER — an opponent's Aegis does not protect you", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s = { ...g, players: { ...g.players,
      ai1: { ...g.players.ai1, battlefield: [createPermanent({ id: "aegis", card: AEGIS_OF_THE_GODS, controller: "ai1", summoningSick: false })] } } };
    expect(playerHasHexproof(s, "ai1")).toBe(true);
    expect(playerHasHexproof(s, "user")).toBe(false);
    expect(targetsFor(s, "user")).not.toContain("ai1");
    expect(targetsFor(s, "user")).toContain("ai2");
  });
});
