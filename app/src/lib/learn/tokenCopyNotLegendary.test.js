/**
 * tokenCopyNotLegendary.test.js — "create a token that's a copy of it, EXCEPT THE TOKEN ISN'T LEGENDARY"
 * (CR 707.9a): Miirym Sentinel Wyrm, and the target form (Quasiduplicate's kin).
 *
 * ⛔⛔ THE TWIN OF THE cloneCopy BUG, AND THE WORSE HALF. tokenCopy.js swallowed this tail inside its match
 * regex — a non-capturing group — with the same stale justification: *"a NO-OP (the legend rule is
 * unenforced)"*. `sba.js` implements CR 704.5j now, so a token copy that KEPT "Legendary" is destroyed by
 * the rule the instant it enters. For **Miirym, Sentinel Wyrm** — whose whole card is "create a token copy
 * of each legendary Dragon you cast" — that meant **the card did nothing at all**: every token it made died
 * immediately to the original it was copying.
 *
 * ⭐ Same instrument as ward—discard and the clone fix: sweep RUNTIME files for "unenforced" / "not modeled"
 * notes and re-check each against what the engine can do TODAY. Three live bugs, three consecutive slices.
 * **A refusal comment is a claim with a timestamp.**
 *
 * ⓘ NO COVERAGE CHANGE — Miirym was already native-trigger, because the tail was ABSORBED by the regex and
 * so never blocked recognition. The bug was never in classification; it was in what the token became. A
 * flip-diff cannot see this, which is exactly why the drive below exists.
 *
 * ⛔ THE FLAG IS CONDITIONAL, not unconditional. The tail is now a CAPTURING group and `notLegendary` rides
 * only when it is actually printed — a plain "create a token that's a copy of it" (Vaultborn Tyrant, Ochre
 * Jelly) must still mint a faithful copy WITH its supertype. Pinned both ways below; stripping
 * unconditionally would be a different false positive in the other direction.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * resolver rider removed -> the token keeps "Legendary" and the SBA destroys one of the pair; the parser
 * flag forced on -> a plain copy loses its supertype (the opposite FP).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, applyLegendRule } from "./gameState.js";
import { tokenCopyParser } from "./effects/atoms/tokenCopy.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MIIRYM = { id: "c-mi", name: "Miirym, Sentinel Wyrm", type: "Legendary Creature — Dragon Spirit",
  mana: "{3}{G}{U}{R}", power: "6", toughness: "6",
  oracle: "Flying, ward {2}\nWhenever another nontoken Dragon you control enters, create a token that's a copy of it, except the token isn't legendary." };
const LEGENDARY_DRAGON = { id: "c-ld", name: "Ancient Gold Dragon", type: "Legendary Creature — Dragon",
  mana: "{4}{R}{R}", power: "7", toughness: "7", oracle: "Flying" };

const MIIRYM_CLAUSE = "create a token that's a copy of it, except the token isn't legendary";
const PLAIN_CLAUSE = "create a token that's a copy of it";

describe("the tail becomes a real modification, and only when printed", () => {
  it("⭐ the flag rides ONLY when the card prints the tail", () => {
    expect(tokenCopyParser(MIIRYM_CLAUSE)).toMatchObject({ op: "create-token-copy", notLegendary: true });
    // ⛔ THE OTHER DIRECTION: a plain copy must keep its supertype. Stripping unconditionally would be a
    // false positive pointing the opposite way.
    expect(tokenCopyParser(PLAIN_CLAUSE).notLegendary).toBeUndefined();
  });

  it("ⓘ classification is UNCHANGED — this was never a coverage bug", () => {
    expect(classifyCard(MIIRYM)).toBe("native-trigger");
  });
});

describe("⭐ LAW 6 — the token survives beside the Dragon it copied", () => {
  // Miirym's trigger resolving: the copied Dragon is the triggering permanent.
  function mint({ clause }) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const miirym = createPermanent({ id: "miirym", card: MIIRYM, controller: "user", summoningSick: false });
    const dragon = createPermanent({ id: "dragon", card: LEGENDARY_DRAGON, controller: "user", summoningSick: false });
    miirym.timestamp = 1; dragon.timestamp = 2;
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [miirym, dragon] } } };
    // ⛔ The atom comes from the PARSER, not a literal — parser and resolver are otherwise tested separately
    // and a disagreement between them would leave both halves green.
    const atoms = [tokenCopyParser(clause)];
    const s = runEffectProgram(s0, { source: MIIRYM,
      payload: { params: { program: { version: 1, structure: "sequence", atoms }, controller: "user",
        targets: [], sourceId: "miirym", context: { triggeringPermanentId: "dragon" } } } });
    return s;
  }

  it("⭐ Miirym's token lives; without the strip the legend rule eats one of the pair", () => {
    const rows = [];
    for (const [label, clause] of [["printed (isn't legendary)", MIIRYM_CLAUSE], ["plain copy (control)", PLAIN_CLAUSE]]) {
      const s = mint({ clause });
      const tok = s.players.user.battlefield.find((p) => p.card?.token);
      const after = applyLegendRule(s);
      rows.push({ form: label,
        tokenType: tok ? String(tok.card.type) : null,
        destroyed: after.dead.map((d) => d.card?.name || d.id),
        dragonsLeft: after.state.players.user.battlefield.filter((p) => /Dragon/.test(String(p.card?.type || ""))).length });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    // ⭐ The token is NOT legendary and NOTHING dies — the card finally does something.
    // ⓘ dragonsLeft is 3, not 2: MIIRYM HERSELF is a "Legendary Creature — Dragon Spirit", so she counts.
    // The first draft of this pin expected 2 and was simply miscounting the board.
    expect(rows[0]).toEqual({ form: "printed (isn't legendary)", tokenType: "Creature — Dragon", destroyed: [], dragonsLeft: 3 });
    // ⛔ THE CONTROL that proves the strip is what saves it: a legendary token loses one of the pair to
    // CR 704.5j, which is exactly the old behaviour Miirym shipped with.
    expect(rows[1].tokenType).toBe("Legendary Creature — Dragon");
    expect(rows[1].destroyed).toEqual(["Ancient Gold Dragon"]);
    // Miirym survives (different name); the copied Dragon is the one destroyed, leaving Miirym + the token.
    expect(rows[1].dragonsLeft).toBe(2);
  });
});
