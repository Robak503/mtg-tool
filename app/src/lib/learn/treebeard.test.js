/**
 * TREEBEARD, GRACIOUS HOST — the SUBTYPE TARGET NOUN + lifegain counters on a target. SHELF-85 · Phase 3 (Bumble Flower), 2026-09-05.
 * "Trample, ward {2} / When Treebeard enters, create two Food tokens. / Whenever you gain life, put that many +1/+1 counters on
 * target Halfling or Treefolk."
 *
 * Two seams: (1) "target <Subtype>[ or <Subtype>]" was unmodeled as a target noun everywhere ("Destroy target Elf" sat on the
 * Arbiter) — a fallback peel in parseClauseToAtom reduces it to "target creature" and appends a union-aware subtype restriction
 * the enumerator and the resolver both enforce (closed CR vocabulary); (2) the lifegain "that many" counters knew only their
 * self form — the detector's sentinel now covers the targeted form, and counters.js has the targeted twin.
 *
 * Mutation-checked: see the run ledger (docs-sk120).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { checkLifegainTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TREEBEARD = { id: "c-tb", name: "Treebeard, Gracious Host", type: "Legendary Creature — Treefolk", mana: "{4}{G}", power: 4, toughness: 5, keywords: ["Trample", "Ward"],
  oracle: "Trample, ward {2}\nWhen Treebeard enters, create two Food tokens.\nWhenever you gain life, put that many +1/+1 counters on target Halfling or Treefolk." };
const spell = (name, oracle, type = "Instant") => ({ id: "c-" + name.replace(/\W/g, ""), name, type, mana: "{1}{G}", keywords: [], oracle });

describe("the parser — the subtype target noun", () => {
  it("Treebeard reads native; single, union, pump and counter forms of a subtype target all parse; a non-creature subtype and a card noun stay parked", () => {
    const row = {
      treebeard: classifyCard(TREEBEARD),
      elf: classifyCard(spell("Elf Kill", "Destroy target Elf.")),
      wolfPump: classifyCard(spell("Pack Boost", "Target Wolf or Werewolf gets +2/+2 until end of turn.")),
      halflingCounters: classifyCard(spell("Second Breakfast", "Put two +1/+1 counters on target Halfling or Treefolk.", "Sorcery")),
      merfolkTap: classifyCard(spell("Tide Pull", "Tap target Merfolk.")),
      saga: classifyCard(spell("Unwrite", "Destroy target Saga.")),
      cardNoun: classifyCard(spell("Elf Card", "Destroy target Elf creature card.")),
      // "target Cleric CARD from your graveyard" is ALREADY native through zones' SUBTYPE RETURN lane (its own closed-vocabulary
      // filter) — so the peel's tail guard is pinned on a noun the engine does not model: a SPELL on the stack.
      spellNoun: classifyCard(spell("Elf Counter", "Counter target Elf spell.")),
    };
    console.log("  WITNESS treebeard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.treebeard).toBe("native-trigger");
    for (const k of ["elf", "wolfPump", "halflingCounters", "merfolkTap"]) expect(row[k], k).toMatch(/^native/);
    for (const k of ["saga", "cardNoun", "spellNoun"]) expect(row[k], k).not.toMatch(/^native/);
  });
});

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (id, card) => createPermanent({ id, card, controller: "user", summoningSick: false });
  const bf = [
    mk("tb", TREEBEARD),
    mk("half", { id: "c-half", name: "Halfling Cook", type: "Creature — Halfling Peasant", mana: "{W}", power: 1, toughness: 1, keywords: [], oracle: "" }),
    mk("bear", { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }),
  ];
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
}
const counters = (s, id) => (s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"]) || 0;

describe("RUNTIME — the trigger offers only the subtyped creatures and places the gained amount", () => {
  it("a gain of 2: the offer holds the Halfling and Treebeard (a Treefolk), never the Bear; the chosen Halfling gets two counters", () => {
    let offered = null;
    let s = checkLifegainTriggers(board(), "user", 2);
    s = flushTriggers(s, { chooseTargets: (cands) => {
      offered = cands.map((c) => (c.targets || []).map((t) => t.id).join("+")).sort();
      return cands.findIndex((c) => (c.targets || []).some((t) => t.id === "half"));
    } });
    let guard = 0;
    while ((s.stack || []).length && guard++ < 10) s = resolveTopOfStack(s);
    const row = { offered, half: counters(s, "half"), bear: counters(s, "bear"), tb: counters(s, "tb") };
    console.log("  WITNESS treebeardRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["half", "tb"]);
    expect(row).toMatchObject({ half: 2, bear: 0, tb: 0 });
  });
});
