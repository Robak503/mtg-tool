/**
 * MOLE MODULE — the milled-pick's BATTLEFIELD destination. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "Whenever this Vehicle deals combat damage to a player, mill four cards. You may put a permanent card from among them
 * onto the battlefield."
 *
 * The hand form (Ripples of Undeath / Six) already had the machinery: the candidate set is the mill's stamp ∩ the live
 * graveyard, one candidate moves directly, two or more pause. The battlefield destination reuses all of it and ENTERS the
 * pick through enterCardFromZone (ETBs fire, a walker gets its loyalty). "permanent" is the CR 110.4a gate — a positive
 * front-face permanent type. ⛔ An Aura is never offered here: entering un-cast it must choose what it enchants (CR 303.4f)
 * and this path has no such choice — withholding it is a documented UNDER-offer, never an unattached Aura.
 *
 * Mutation-checked: see the run ledger (docs-sk101).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveMilledPickChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MOLE = { id: "c-mm", name: "Mole Module", type: "Artifact — Vehicle", mana: "{3}", power: "4", toughness: "4", keywords: ["Menace"],
  oracle: "Menace\nWhenever this Vehicle deals combat damage to a player, mill four cards. You may put a permanent card from among them onto the battlefield.\nCrew 2" };
const CLAUSE = "Mill four cards. You may put a permanent card from among them onto the battlefield.";

describe("the parser", () => {
  it("the clause reads to mill + the battlefield pick (permanent gate, optional); the unfiltered, instant-filtered and permanent-to-hand forms park; Mole Module flips native", () => {
    const p = parseEffectClause(CLAUSE, "Artifact");
    const row = {
      conf: programConfidence(p), atoms: p.atoms,
      bare: programConfidence(parseEffectClause("Mill four cards. You may put a card from among them onto the battlefield.", "Artifact")),
      instant: programConfidence(parseEffectClause("Mill four cards. You may put an instant card from among them onto the battlefield.", "Artifact")),
      permHand: programConfidence(parseEffectClause("Mill four cards. You may put a permanent card from among them into your hand.", "Artifact")),
      ripples: parseEffectClause("Mill three cards. You may put a land card from among those cards into your hand.", "Sorcery").atoms[1],
      tier: classifyCard(MOLE),
    };
    console.log("  WITNESS moleModule", JSON.stringify({ ...row, atoms: row.atoms.map((a) => a.op) })); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atoms).toEqual([{ op: "mill", amount: 4, who: "controller", targetType: null }, { op: "pick-milled-to-battlefield", permanentOnly: true, targetType: null, optional: true }]);
    expect([row.bare, row.instant, row.permHand]).toEqual(["low", "low", "low"]);
    expect(row.ripples).toEqual({ op: "pick-milled-to-hand", cardFilter: "land", targetType: null, optional: true }); // the hand form is byte-identical
    expect(row.tier).toBe("native-trigger");
  });
});

const BEAR = { id: "c-bear", name: "Milled Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const ROCK = { id: "c-rock", name: "Milled Rock", type: "Artifact", mana: "{2}", keywords: [], oracle: "" };
const AURA = { id: "c-aura", name: "Milled Aura", type: "Enchantment — Aura", mana: "{G}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +1/+1." };
const bolt = (i) => ({ id: `c-bolt${i}`, name: "Milled Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "" });

function run(library) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players, user: { ...s0.players.user, library } } };
  const program = parseEffectClause(CLAUSE, "Artifact");
  let out = runEffectProgram(s, { source: { name: "Mole Module" }, payload: { params: { program, controller: "user", targets: [], context: {} } } });
  // the "you may" wraps the pick in an optional choice on some paths — accept it; the milled pick is what we pin
  let guard = 0;
  while (out.pendingChoice && out.pendingChoice.kind !== "milled-pick" && guard++ < 3) out = resolveOptionalChoice(out, true);
  return out;
}
const onBf = (s, cardId) => s.players.user.battlefield.some((p) => p.card?.id === cardId);
const inGy = (s, cardId) => s.players.user.graveyard.some((c) => c.id === cardId);

describe("RUNTIME — the milled set, the permanent gate, the Aura withheld, the entry", () => {
  it("two permanents among the four milled (a bear, a rock; an instant and an Aura beside them): the pause offers ONLY the bear and the rock; the bear is picked and ENTERS; the rest stay milled", () => {
    const paused = run([BEAR, bolt(1), AURA, ROCK]);
    expect(paused.pendingChoice).toMatchObject({ kind: "milled-pick", controller: "user", toZone: "battlefield" });
    const offered = paused.pendingChoice.candidates.map((c) => c.id).sort();
    const out = resolveMilledPickChoice(paused, "c-bear");
    const row = { offered, bearOnBf: onBf(out, "c-bear"), bearInGy: inGy(out, "c-bear"), rockInGy: inGy(out, "c-rock"), auraInGy: inGy(out, "c-aura"), boltInGy: inGy(out, "c-bolt1"), bfCount: out.players.user.battlefield.length, pending: out.pendingChoice?.kind ?? null };
    console.log("  WITNESS moleModulePick", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: ["c-bear", "c-rock"], bearOnBf: true, bearInGy: false, rockInGy: true, auraInGy: true, boltInGy: true, bfCount: 1, pending: null });
  });

  it("ONE permanent among the four (three instants and a rock): no pause — the rock enters directly", () => {
    const out = run([bolt(1), bolt(2), ROCK, bolt(3)]);
    const row = { pending: out.pendingChoice?.kind ?? null, rockOnBf: onBf(out, "c-rock"), rockInGy: inGy(out, "c-rock"), gy: out.players.user.graveyard.length };
    console.log("  WITNESS moleModuleDirect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: null, rockOnBf: true, rockInGy: false, gy: 3 });
  });

  it("NO permanent among the four (instants only): no pause, nothing enters, the four stay milled", () => {
    const out = run([bolt(1), bolt(2), bolt(3), bolt(4)]);
    const row = { pending: out.pendingChoice?.kind ?? null, bf: out.players.user.battlefield.length, gy: out.players.user.graveyard.length };
    console.log("  WITNESS moleModuleNone", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: null, bf: 0, gy: 4 });
  });
});
