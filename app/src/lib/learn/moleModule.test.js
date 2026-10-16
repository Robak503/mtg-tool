/**
 * MOLE MODULE — the milled-pick's BATTLEFIELD destination. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "Whenever this Vehicle deals combat damage to a player, mill four cards. You may put a permanent card from among them
 * onto the battlefield."
 *
 * The hand form (Ripples of Undeath / Six) already had the machinery: the candidate set is the mill's stamp ∩ the live
 * graveyard, one candidate moves directly, two or more pause. The battlefield destination reuses all of it and ENTERS the
 * pick through enterCardFromZone (ETBs fire, a walker gets its loyalty). "permanent" is the CR 110.4a gate — a positive
 * front-face permanent type. An Aura (graduated 2026-10-16 — it used to be withheld outright) is offered when it has something
 * to enchant: the entry now chooses what it enchants as it enters (CR 303.4f); with nothing it would stay in the graveyard
 * (CR 303.4g), so it is not offered. The Aura cases are the last describe block.
 *
 * Mutation-checked: see the run ledger (docs-sk101; the Aura lift's own entry for the last block).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram, resolveMilledPickChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

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

describe("RUNTIME — the milled set, the permanent gate, the Aura with nothing to enchant, the entry", () => {
  // GRADUATED 2026-10-16: the Aura here used to be withheld because it was an Aura; it is withheld now because this board has no
  // creature for it to enchant (CR 303.4g) — the boards with one are in the Aura block below.
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

// ── 2026-10-16: the Aura lift. An Aura among the milled cards is offered when it has something to enchant: entering un-cast it
// chooses what it enchants as it enters (CR 303.4f — effects/atoms/zones.enterCardFromZone → auraEntry.chooseAuraEntryHost). With
// nothing it can enchant it would stay in the graveyard (CR 303.4g), so it is not offered — choosing it would put nothing onto the
// battlefield. Real oracle fixtures (bundled Scryfall snapshot, generated 2026-10-16; the trailing comment is the generator's tier).
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand."}; // native-aura
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const GRIZZLY = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // native-body

const lib = (id, card) => ({ ...card, id });
const onBoard = (id, ctrl, card) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: ctrl, summoningSick: false });
/** `run` on a board with permanents: the milled pick reads the board the Aura would enter. */
function runOn(library, { user = [], ai = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players, user: { ...s0.players.user, library, battlefield: user }, ai: { ...s0.players.ai, battlefield: ai } } };
  const program = parseEffectClause(CLAUSE, "Artifact");
  let out = runEffectProgram(s, { source: { name: "Mole Module" }, payload: { params: { program, controller: "user", targets: [], context: {} } } });
  let guard = 0;
  while (out.pendingChoice && out.pendingChoice.kind !== "milled-pick" && guard++ < 3) out = resolveOptionalChoice(out, true);
  return out;
}
function hostOf(s, name) {
  const p = Object.values(s.players).flatMap((pl) => pl.battlefield).find((x) => x.card?.name === name);
  if (!p?.attachedTo) return null;
  const h = findPermanent(s, p.attachedTo);
  return h ? `${h.permanent.card?.name} (${h.controller})` : null;
}

describe("⭐ the Aura lift (2026-10-16) — a milled Aura is offered when it has something to enchant, and enters attached", () => {
  const MILL = [lib("m-rancor", RANCOR), lib("m-bolt", LIGHTNING_BOLT), lib("m-pac", PACIFISM), lib("m-forest", FOREST)];
  const BOARD = { user: [onBoard("bears", "user", GRIZZLY)], ai: [onBoard("wurm", "ai", WURM)] };

  it("⭐ the offer holds Rancor, Pacifism and the Forest (never the instant); Rancor picked enters on your Grizzly Bears", () => {
    const paused = runOn(MILL, BOARD);
    const offered = paused.pendingChoice?.candidates.map((c) => c.name).sort();
    const out = resolveMilledPickChoice(paused, "m-rancor");
    const row = { offered, rancor: hostOf(out, "Rancor"), graveyard: out.players.user.graveyard.map((c) => c.name).sort() };
    console.log("  WITNESS moleModuleAura", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: ["Forest", "Pacifism", "Rancor"], rancor: "Grizzly Bears (user)", graveyard: ["Forest", "Lightning Bolt", "Pacifism"] });
  });

  it("Pacifism picked goes on the opponent's Craw Wurm — the side it hurts", () => {
    expect(hostOf(resolveMilledPickChoice(runOn(MILL, BOARD), "m-pac"), "Pacifism")).toBe("Craw Wurm (ai)");
  });

  it("ONE candidate and it is an Aura: no pause — Rancor enters directly, attached", () => {
    const out = runOn([lib("m-rancor", RANCOR), lib("m-b1", LIGHTNING_BOLT), lib("m-b2", { ...LIGHTNING_BOLT }), lib("m-b3", { ...LIGHTNING_BOLT })], BOARD);
    expect({ pending: out.pendingChoice?.kind ?? null, rancor: hostOf(out, "Rancor") }).toEqual({ pending: null, rancor: "Grizzly Bears (user)" });
  });

  it("⛔ with no creature anywhere, neither Aura is offered (CR 303.4g — it would stay in the graveyard): the Forest is the one candidate and enters", () => {
    const out = runOn(MILL, {});
    const row = { pending: out.pendingChoice?.kind ?? null, battlefield: out.players.user.battlefield.map((p) => p.card?.name), graveyard: out.players.user.graveyard.map((c) => c.name).sort() };
    expect(row).toEqual({ pending: null, battlefield: ["Forest"], graveyard: ["Lightning Bolt", "Pacifism", "Rancor"] });
  });
});
