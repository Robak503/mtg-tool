/**
 * castTriggerMultiplier.test.js — the FOURTH member of the trigger-multiplier family: Veyran, Voice of
 * Duality's "If you casting or copying an instant or sorcery spell causes a triggered ability of a
 * permanent you control to trigger, that ability triggers an additional time."
 *
 * Teysa Karlov (dies), Isshin (attacking) and Panharmonicon (entering) already model this exact
 * rule-modifying shape. Veyran is one subject apart on the card and one layerOp apart here: a
 * self-affecting continuous effect, inert in the P/T and keyword layers, counted by
 * layers.castTriggerMultiplierCount and applied at the CAST-trigger enqueue site by the SAME
 * multiplyTriggers helper the other three use.
 *
 * ⭐ WHY THIS CARD IS WORTH A SLICE: it is Colton's own commander, in Veyran Cantrips, the only deck
 * keeping his profile off the >=90% bar. Its magecraft trigger already modelled and routed; the
 * doubling static was the whole blocker.
 *
 * ⛔ THE SITE IS NOT SUFFICIENT SCOPE HERE, and that is the one real difference from its siblings.
 * checkCastTriggers fires for EVERY cast — a creature spell included — while Veyran's line is scoped to
 * "an instant or sorcery spell". The ETB and attack multipliers can lean on their enqueue site alone
 * because that site IS the event; this one needs an explicit spell-type guard, or it would double a
 * watcher on a creature cast that Veyran does not affect. Measured on a board with an any-spell watcher
 * before the guard was written, and pinned below in all four directions.
 *
 * Mutation-checked (2026-08-04, each verified applied): the instant/sorcery guard removed -> the
 * creature-cast and artifact-cast pins go red; the multiplyTriggers call removed -> the doubling pins go
 * red while the no-Veyran control stays green.
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { castTriggerMultiplierCount } from "./layers.js";
import { checkCastTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VEYRAN = { id: "c-v", name: "Veyran, Voice of Duality", type: "Legendary Creature — Efreet Wizard", mana: "{1}{U}{R}", power: "2", toughness: "2",
  oracle: "Magecraft — Whenever you cast or copy an instant or sorcery spell, Veyran gets +1/+1 until end of turn.\nIf you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." };
// A watcher that fires on ANY cast — the only fixture that can tell "doubled the right event" apart from
// "doubled everything". A magecraft-style watcher filters instants itself and would pass either way.
const ANY_WATCHER = { id: "c-a", name: "AnyWatcher", type: "Creature — Wizard", power: "1", toughness: "1",
  oracle: "Whenever you cast a spell, draw a card." };

const SPELLS = {
  instant: { id: "sp-i", name: "Shock", type: "Instant", oracle: "Shock deals 2 damage to any target." },
  sorcery: { id: "sp-s", name: "Rampant Growth", type: "Sorcery", oracle: "Draw a card." },
  creature: { id: "sp-c", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" },
  artifact: { id: "sp-a", name: "Rock", type: "Artifact", oracle: "" },
};

function board({ withVeyran }) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const bf = [createPermanent({ id: "a", card: ANY_WATCHER, controller: "user", summoningSick: false })];
  if (withVeyran) bf.push(createPermanent({ id: "v", card: VEYRAN, controller: "user", summoningSick: false }));
  return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
}
const watcherFires = (withVeyran, spell) =>
  (checkCastTriggers(board({ withVeyran }), { spellCard: spell, casterId: "user" }).pendingTriggers || [])
    .filter((t) => t.source?.permanentId === "a").length;

describe("recognition", () => {
  it("Veyran classifies native-mixed and emits the castTriggerMultiplier static", () => {
    expect(classifyCard(VEYRAN)).toBe("native-mixed");
    expect(parseStaticAbilities(VEYRAN).map((s) => s.op?.layerOp)).toContain("castTriggerMultiplier");
  });

  it("⛔ the three SIBLING multipliers are untouched (no family regression)", () => {
    expect(classifyCard({ id: "c-i", name: "Isshin, Two Heavens as One", type: "Legendary Creature — Human Samurai", mana: "{1}{R}{W}", power: "3", toughness: "4",
      oracle: "If a creature attacking causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." })).toBe("native-static");
    expect(classifyCard({ id: "c-p", name: "Panharmonicon", type: "Artifact", mana: "{4}",
      oracle: "If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." })).toBe("native-static");
  });

  it("⛔ a NARROWER printed variant is not claimed (whole-sentence anchored)", () => {
    // Doubling an event the card does not name is a forbidden FP, and a P/T-shaped gate cannot see it.
    expect(parseStaticAbilities({ ...VEYRAN, id: "c-n",
      oracle: "If you casting an instant spell causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time." })
      .map((s) => s.op?.layerOp)).not.toContain("castTriggerMultiplier");
  });

  it("the counter reads the static off the board for its controller", () => {
    expect(castTriggerMultiplierCount(board({ withVeyran: true }), "user")).toBe(1);
    expect(castTriggerMultiplierCount(board({ withVeyran: false }), "user")).toBe(0);
  });
});

describe("⭐ RUNTIME (law 6) — the doubling happens, and ONLY on the event Veyran names", () => {
  it("an instant cast fires the watcher TWICE with Veyran, once without", () => {
    expect(watcherFires(false, SPELLS.instant)).toBe(1);
    expect(watcherFires(true, SPELLS.instant)).toBe(2);
  });

  it("a sorcery cast doubles too", () => {
    expect(watcherFires(true, SPELLS.sorcery)).toBe(2);
  });

  it("⛔ a CREATURE cast is NOT doubled — the guard the enqueue site cannot provide", () => {
    expect(watcherFires(false, SPELLS.creature)).toBe(1);
    expect(watcherFires(true, SPELLS.creature)).toBe(1);
  });

  it("⛔ an ARTIFACT cast is NOT doubled either", () => {
    expect(watcherFires(true, SPELLS.artifact)).toBe(1);
  });
});
