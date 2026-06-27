/**
 * ritualMana.test.js — RITUAL-MANA: "Add {C}{C}{C}" spells (Dark Ritual, Pyretic Ritual, Seething Song,
 * Channel the Suns) and the ETB/death/cast-trigger "add mana" permanents (Akki Rockspeaker, Su-Chi). New
 * add-mana atom + applyAddMana resolver adds basic mana to the controller's pool via addMana. The parser
 * anchors the BARE add-basic-mana form only — a restricted-use rider ("Spend this mana only on…") or {X}/
 * hybrid is a separate/unmodeled clause → low → Arbiter, so a restricted ritual never over-credits.
 *
 * CREED note: classifyCard's native-mana tier keys off hasManaAbility + the trigger-only residue gate (the
 * documented Lantern boundary), and is metric-decoupled from runtime; manaProduction (the standing-source
 * classifier) does NOT read a triggered/spell "Add" as a tap-source (no phantom mana).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { manaProduction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("ritual-mana — parser", () => {
  it("'Add {B}{B}{B}' → add-mana atom with B:3", () => {
    const p = parseEffectClause("Add {B}{B}{B}.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-mana", mana: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 }, targetType: null }]);
  });
  it("'Add {W}{U}{B}{R}{G}' → one of each (Channel the Suns)", () => {
    const p = parseEffectClause("Add {W}{U}{B}{R}{G}.", "Sorcery");
    expect(p.atoms[0].mana).toEqual({ W: 1, U: 1, B: 1, R: 1, G: 1, C: 0 });
  });
  it("CREED: a restricted-use ritual ('Spend this mana only on…') stays low → Arbiter", () => {
    expect(programConfidence(parseEffectClause("Add {R}{R}{R}. Spend this mana only on artifact spells.", "Instant"))).toBe("low");
  });
});

describe("ritual-mana — resolver adds mana to the controller's pool", () => {
  it("Add {B}{B}{B} puts 3 black in the pool; other colors untouched", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const after = resolveAtom(s, { op: "add-mana", mana: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 } }, { controller: "user" });
    expect(after.players.user.manaPool.B).toBe(3);
    expect(after.players.user.manaPool.R).toBe(0);
    expect(after.players.ai.manaPool.B).toBe(0); // only the controller's pool
  });
  it("Add {W}{U}{B}{R}{G} adds one of each to the controller's pool", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const after = resolveAtom(s, { op: "add-mana", mana: { W: 1, U: 1, B: 1, R: 1, G: 1, C: 0 } }, { controller: "user" });
    expect(after.players.user.manaPool).toMatchObject({ W: 1, U: 1, B: 1, R: 1, G: 1 });
  });
});

describe("ritual-mana — coverage + no phantom standing source", () => {
  const C = (name, oracle, type = "Instant", mana = "{B}") => ({ name, oracle, type, keywords: [], mana });
  it("ritual spells + ETB-add permanents flip native", () => {
    expect(classifyCard(C("Dark Ritual", "Add {B}{B}{B}."))).toBe("native-spell");
    expect(classifyCard(C("Akki Rockspeaker", "When this creature enters, add {R}.", "Creature — Goblin Shaman", "{2}{R}"))).toBe("native-mana");
  });
  it("a triggered/spell 'Add' is NOT a standing mana source (no phantom mana)", () => {
    const akki = { name: "Akki Rockspeaker", type: "Creature — Goblin Shaman", oracle: "When this creature enters, add {R}.", mana: "{2}{R}" };
    expect(manaProduction(akki)).toBeNull();
  });
});
