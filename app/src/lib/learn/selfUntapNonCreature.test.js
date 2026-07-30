/**
 * selfUntapNonCreature.test.js — SELF-UNTAP WITH A NON-CREATURE NOUN.
 * Mana Vault · Staff of Domination · Retrofitter Foundry · Summoning Station · Blasting Station.
 *
 * The corpus prints "untap this creature" 94 times and the engine has parsed it since BLITZ UP-1. It also
 * prints "untap this artifact" 15 times, "untap this land" once and "untap this permanent" once — and none
 * of those parsed at all. The REFERENT is identical in every case: `target:"self"` is ctx.sourceId, and
 * selfTargets has handed back a {type:"permanent"} entry for a non-creature source since census slice 22.
 * ⭐ Only the printed NOUN differed, and a card's own text always names its own type — the noun here is
 * DESCRIPTIVE, never a filter, because this referent can only ever be the source.
 *
 * ⭐⛔ AND THE PARSER HALF ALONE WOULD HAVE BEEN A FALSE POSITIVE. applyTapEffect ends its type check with
 * `t.type === "creature"`, so an untap-self atom on an artifact source would have classified native and then
 * untapped NOTHING — the "classifies native but does nothing" trap this very file's neighbours were written
 * about (the thatPermanent note in combat.js says so in as many words about an entering LAND). The resolver's
 * gate is widened by the atom's own `selfPermanent` flag, so no existing tap/untap atom's type check moves.
 * The runtime block below is the part that matters: it asserts the artifact is actually untapped, and the
 * mutation that reverts only the resolver half is seen to fail it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle, read out of the bundled index.
const MANA_VAULT = { name: "Mana Vault", type: "Artifact", mana: "{1}",
  oracle: "This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}." };

const forest = (id) => createPermanent({ id, card: { id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" });
function boardWith(card, { tapped = true, forests = 4 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: { id: "c-src", ...card }, controller: "user" });
  src.tapped = tapped;
  const bf = [src];
  for (let i = 0; i < forests; i++) bf.push(forest(`F${i}`));
  return { ...s, activePlayer: "user", priorityHolder: "user", players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
function fireUpkeep(state) {
  let s = checkStepTriggers(state, "upkeep");
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while (s.stack?.length && !s.pendingChoice && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}
const srcOf = (s) => findPermanent(s, "src").permanent;

describe("the PARSER learns the three non-creature self nouns", () => {
  it("artifact / land / permanent all parse to the same self referent the creature form uses", () => {
    for (const noun of ["artifact", "land", "permanent"]) {
      const p = parseEffectClause(`Untap this ${noun}.`, "Artifact");
      expect(p.atoms).toHaveLength(1);
      expect(p.atoms[0]).toMatchObject({ op: "untap", target: "self", selfPermanent: true });
    }
  });

  it("the creature form is untouched — no selfPermanent flag, so no existing atom changes", () => {
    const p = parseEffectClause("Untap this creature.", "Creature — Construct");
    expect(p.atoms[0]).toMatchObject({ op: "untap", target: "self" });
    expect(p.atoms[0].selfPermanent).toBeUndefined();
  });

  it("⛔ the untap RESTRICTION sentence is not an untap effect (16 corpus cards print it)", () => {
    // "You may choose not to untap this artifact during your untap step." — a static restriction. The
    // whole-clause anchor is what keeps it out; a containment match would turn it into a free untap.
    const p = parseEffectClause("You may choose not to untap this artifact during your untap step.", "Artifact");
    expect((p?.atoms || []).some((a) => a.op === "untap")) .toBe(false);
  });
});

describe("⭐ RUNTIME — the artifact is really untapped, which the classifier alone cannot prove", () => {
  it("PAY: the {4} is spent and MANA VAULT UNTAPS", () => {
    const paused = fireUpkeep(boardWith(MANA_VAULT, { tapped: true, forests: 4 }));
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user" });
    expect(paused.pendingChoice.cost.mana.generic).toBe(4);
    expect(srcOf(paused).tapped).toBe(true);                 // still tapped at the pause
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(settled.pendingChoice).toBeFalsy();
    expect(srcOf(settled).tapped).toBe(false);               // ⭐ THE WHOLE SLICE
  });

  it("DECLINE: nothing is spent and the artifact stays tapped", () => {
    const paused = fireUpkeep(boardWith(MANA_VAULT, { tapped: true, forests: 4 }));
    const settled = resolveOptionalManaPaymentChoice(paused, false);
    expect(srcOf(settled).tapped).toBe(true);
    expect(settled.players.user.battlefield.filter((p) => p.id.startsWith("F") && p.tapped)).toHaveLength(0);
  });

  it("⛔ CREED — pay=true while BROKE fabricates no mana and never untaps for free", () => {
    const paused = fireUpkeep(boardWith(MANA_VAULT, { tapped: true, forests: 0 }));
    const settled = resolveOptionalManaPaymentChoice(paused, true);
    expect(srcOf(settled).tapped).toBe(true);
  });
});

describe("coverage — the five carriers flip", () => {
  const T = (name, type, oracle, mana) => classifyCard({ name, type, oracle, mana });
  it("Mana Vault flips native-mana", () => {
    expect(classifyCard(MANA_VAULT)).toBe("native-mana");
  });
  it("⛔ an unmodeled companion line still parks the card (all-or-nothing is unchanged)", () => {
    const residue = { ...MANA_VAULT, name: "Fake Vault",
      oracle: MANA_VAULT.oracle + "\nWhenever a player consults an oracle, interpret its riddle however you like." };
    expect(classifyCard(residue)).not.toMatch(/^native/);
  });
  it("⛔ a self-untap on a card with NO other modeled text is still judged whole-card", () => {
    // The noun widening credits the clause, never the card: an untap-self line beside unmodeled text parks.
    expect(T("Fake Foundry", "Artifact", "Untap this artifact.\nWhenever a player consults an oracle, interpret its riddle.", "{1}"))
      .not.toMatch(/^native/);
  });
});
