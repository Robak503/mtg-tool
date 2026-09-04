/**
 * valleyFloodcaller.test.js — SHELF-85 runbook V9 (2026-09-04): Valley Floodcaller (Kinnan · cdh).
 *
 *   "Flash
 *    You may cast noncreature spells as though they had flash.
 *    Whenever you cast a noncreature spell, Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn.
 *    Untap them."
 *
 * The flash-permission static and the noncreature cast watcher existed. Three cells:
 *   · the team-pump arm took ONE curated subtype; it now takes a comma/and list onto the `subtypeFilter` ARRAY the
 *     youControl gatherer already accepts (Frog and Otter joined the vocabulary — every listed word must be curated);
 *   · the clause splitter keeps the list together (its commas and " and " are internal to one subject) — before this,
 *     the sentence shattered into "Birds", "Frogs", … and parsed LOW no matter what the arm could do;
 *   · the trailing "Untap them." is folded onto the pump exactly as "Untap it." is for the single-target combat
 *     tricks — the same `untap: true`, applied to each pumped creature of the set locked at resolution (CR 611.2c).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FLOODCALLER = { id: "c-vf", name: "Valley Floodcaller", type: "Creature — Otter Wizard", mana: "{2}{U}", power: 1, toughness: 3, keywords: ["Flash"],
  oracle: "Flash\nYou may cast noncreature spells as though they had flash.\nWhenever you cast a noncreature spell, Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them." };
const SENTENCE = "Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them.";
const CANTRIP = { id: "c-opt", name: "Probe Cantrip", type: "Instant", mana: "{U}", oracle: "Draw a card." };

const creature = (id, name, type, tapped = true) => ({ ...createPermanent({ id, card: { id: "c-" + id, name, type, power: 2, toughness: 2 }, controller: "user" }), summoningSick: false, tapped });
const island = (id) => createPermanent({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user" });
function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, hand: [CANTRIP], library: [{ id: "lib-0", name: "Card", type: "Instant", oracle: "" }],
      battlefield: [{ ...createPermanent({ id: "VF", card: FLOODCALLER, controller: "user" }), summoningSick: false, tapped: true }, creature("BIRD", "Probe Bird", "Creature — Bird"), creature("BEAR", "Probe Bear", "Creature — Bear"), island("L1")] } } };
}
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

describe("parser — the multi-subtype team pump with the untap tail", () => {
  it("the splitter keeps the list AND the folded untap as one clause", () => {
    expect(splitClauses(SENTENCE)).toEqual(["Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn and untap them"]);
  });
  it("parses HIGH: four curated subtypes, +1/+1, untap:true", () => {
    expect(parseEffectClause(SENTENCE, "Instant").atoms).toEqual([{ op: "pump", scope: "youControl", subtypeFilter: ["Bird", "Frog", "Otter", "Rat"], ptDelta: { p: 1, t: 1 }, untap: true }]);
    expect(parseEffectClause("Birds and Rats you control get +1/+1 until end of turn.", "Instant").atoms).toEqual([{ op: "pump", scope: "youControl", subtypeFilter: ["Bird", "Rat"], ptDelta: { p: 1, t: 1 } }]);
  });
  it("CREED near-miss: an uncurated word in the list parks the whole clause", () => {
    expect(parseEffectClause("Birds, Wumpuses, and Rats you control get +1/+1 until end of turn.", "Instant").confidence).toBe("low");
  });
  it("detectTriggers: the noncreature cast watcher carries the whole effect", () => {
    const d = detectTriggers(FLOODCALLER).find((x) => x.event === "cast");
    expect(d).toMatchObject({ spellFilter: "noncreature" });
    expect(d.effectClause).toBe("Birds, Frogs, Otters, and Rats you control get +1/+1 until end of turn. Untap them");
  });
});

describe("end to end — casting a cantrip pumps and untaps the Bird and the Otter, never the Bear", () => {
  it("both listed creatures grow and untap; the Bear stays tapped at 2 power", () => {
    let s = board();
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-opt");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack.some((o) => o.kind === "triggered-ability" && o.source?.name === "Valley Floodcaller")).toBe(true);
    s = resolveAll(s);
    expect(perm(s, "BIRD").tapped).toBe(false);
    expect(creaturePower(perm(s, "BIRD"), s)).toBe(3);
    expect(perm(s, "VF").tapped).toBe(false);          // the Floodcaller is an Otter — it pumps and untaps itself
    expect(creaturePower(perm(s, "VF"), s)).toBe(2);
    expect(perm(s, "BEAR").tapped).toBe(true);
    expect(creaturePower(perm(s, "BEAR"), s)).toBe(2);
  });
});

describe("classifier", () => {
  it("Valley Floodcaller is native-mixed", () => {
    expect(classifyCard(FLOODCALLER)).toBe("native-mixed");
  });
});
