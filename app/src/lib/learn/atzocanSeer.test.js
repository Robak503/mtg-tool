/**
 * atzocanSeer.test.js — SUBTYPE graveyard return (Atzocan Seer, Jurassic Ramp shelf, 2026-08-15):
 * "Return target Dinosaur card from your graveyard to your hand."
 *
 * A SINGLE creature-subtype word (validated against CR_CREATURE_TYPES, the closed vocabulary leaf)
 * rides the STRUCTURED {subtype} cardFilter the soulshift shape already enforces word-bounded at the
 * ONE cardMatchesGraveyardFilter chokepoint — enumeration and resolution can't drift. A non-subtype
 * word or multi-word phrase still nulls the whole clause (CREED FN-safe).
 *
 * Mutation-checked (2026-08-15): the CR_CREATURE_TYPES vocabulary gate dropped (accept any word) →
 * the misspelled-word control dies (a nonsense filter parses and enumerates everything). Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const CLAUSE = "Return target Dinosaur card from your graveyard to your hand.";

describe("parse + classify", () => {
  it("⭐ the subtype return parses HIGH with the structured {subtype} filter; Atzocan Seer classifies native", () => {
    const p = parseEffectClause(CLAUSE, "Instant");
    const seer = { name: "Atzocan Seer", type: "Creature — Human Druid", power: "2", toughness: "3", mana: "{1}{G}{G}",
      oracle: "{T}: Add one mana of any color.\nSacrifice this creature: Return target Dinosaur card from your graveyard to your hand." };
    const row = { conf: programConfidence(p), atom: p.atoms[0], tier: classifyCard(seer) };
    console.log("  WITNESS atzocan", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: { subtype: "dinosaur" } });
    expect(row.tier).toBe("native-mana");
  });

  it("seen-to-fail: a non-subtype word ('nonland') and a multi-word phrase still null the whole clause", () => {
    expect(programConfidence(parseEffectClause("Return target nonland card from your graveyard to your hand.", "Instant"))).toBe("low");
    expect(programConfidence(parseEffectClause("Return target Dinosaur creature card from your graveyard to your hand.", "Instant"))).toBe("low");
  });
});

describe("⭐⭐ enumeration + resolution — only Dinosaurs offered, the chosen one returns", () => {
  function withGy() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [
      { id: "dino1", name: "Raptor", type: "Creature — Dinosaur", oracle: "" },
      { id: "elf1", name: "Elf", type: "Creature — Elf", oracle: "" },
      { id: "land1", name: "Forest", type: "Basic Land — Forest", oracle: "" },
    ] } } };
  }

  it("⭐⭐ enumeration offers ONLY the Dinosaur; resolution moves it graveyard → hand", () => {
    const s = withGy();
    const program = parseEffectProgram(I(CLAUSE));
    const combos = expandCastChoices(s, "user", program);
    const offered = combos.flatMap((c) => c.targets.map((t) => t.id));
    console.log("  WITNESS atzocanEnum", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["dino1"]);
    const out = runEffectProgram(s, {
      id: "stk-a", kind: "spell", controller: "user", source: { name: "Seer Return" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: combos[0].targets } },
    });
    expect(out.players.user.hand.some((c) => c.id === "dino1")).toBe(true);
    expect(out.players.user.graveyard.some((c) => c.id === "dino1")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.id === "elf1")).toBe(true); // the Elf stays
  });

  it("no Dinosaur in the graveyard → no legal target (not castable)", () => {
    const s = withGy();
    const noDino = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: s.players.user.graveyard.filter((c) => c.id !== "dino1") } } };
    expect(expandCastChoices(noDino, "user", parseEffectProgram(I(CLAUSE)))).toEqual([]);
  });
});
