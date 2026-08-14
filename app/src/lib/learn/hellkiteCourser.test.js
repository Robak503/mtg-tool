/**
 * hellkiteCourser.test.js — HELLKITE COURSER (2026-08-14), the CZ-COMMANDER-VISIT machine. "When this
 * creature enters, you may put a commander you own from the command zone onto the battlefield. It
 * gains haste. Return it to the command zone at the beginning of the next end step."
 *
 * ⭐ ONE ATOM over three existing doors: resolvers.enterPermanent (ETB triggers/Kismet/timestamp — the
 * same entry every non-cast route uses), a fixed-id endOfTurn Haste addKeyword, and the CR 603.7
 * delayed queue carrying a `[cz-return <permId>]` SENTINEL only czClauseParser reads. splitClauses
 * keeps the three-sentence instruction folded (both continuations anchor on their exact leads).
 * POLICY (documented house auto-picks, the riot discipline): the MAY is always taken; partners fetch
 * the FIRST commander in the zone.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the splitter fold dropped → the sentences sever → Hellkite parks.
 *   · the delayed schedule dropped from the resolver → the commander STAYS after the end step (the
 *     permanent-loan FP — the visit is printed as a loan, not a gift).
 * (The cz-return no-op guard is pinned by the died-before-end-step witness below — its removal makes
 * that test fail directly, so it carries no separate mutation run.)
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { drainDelayedTriggers } from "./effects/atoms/delayedTrigger.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import "./resolvers.js"; // the INTEGRATOR — registers the cz doors (enterPermanent + addContinuousEffect) at load, as the engine always does

beforeEach(() => _resetIdsForTests());

const HELLKITE = { name: "Hellkite Courser", type: "Creature — Dragon", mana: "{4}{R}{R}", keywords: [], power: "5", toughness: "5",
  oracle: "Flying\nWhen this creature enters, you may put a commander you own from the command zone onto the battlefield. It gains haste. Return it to the command zone at the beginning of the next end step." };
const CLAUSE = "you may put a commander you own from the command zone onto the battlefield. It gains haste. Return it to the command zone at the beginning of the next end step";
const CMDR = { id: "cmd-1", name: "Test Commander", type: "Legendary Creature — Dragon", power: "4", toughness: "4", oracle: "", isCommander: true };

const board = () => {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, players: { ...g.players, user: { ...g.players.user, command: [CMDR], battlefield: [] } } };
};
const visit = (s) => ATOM_RESOLVERS["cz-commander-visit"](s, { op: "cz-commander-visit" }, { controller: "user", targets: [], cardName: "Hellkite Courser" });
const findCmdr = (s) => (s.players.user.battlefield || []).find((p) => p.card?.id === "cmd-1") || null;

describe("the carrier and the folded parse", () => {
  it("⭐ Hellkite flips native-trigger; the three-sentence clause parses to ONE atom", () => {
    expect(classifyCard(HELLKITE)).toBe("native-trigger");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "cz-commander-visit", optional: true }]); // the may — α2 peels + stamps it
  });

  it("the [cz-return] sentinel parses to the return atom (the delayed half's whole promise)", () => {
    const p = parseEffectClause("[cz-return perm-77]", "Instant");
    expect(p.atoms).toEqual([{ op: "cz-return", permanentId: "perm-77" }]);
  });
});

describe("⭐⭐ LAW 6 — the loan: enters with haste, leaves at the next end step", () => {
  it("⭐⭐ the commander enters WITH haste + one delayed record; the end-step drain sends him home", () => {
    let s = visit(board());
    const cmdr = findCmdr(s);
    const rec = (s.delayedTriggers || [])[0];
    const row = { entered: !!cmdr, haste: cmdr ? permanentHasKeyword(s, cmdr.id, "Haste") : false,
      czEmpty: (s.players.user.command || []).length === 0, clause: rec?.effectClause, fireStep: rec?.fireStep };
    console.log("  WITNESS hellkiteVisit", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ entered: true, haste: true, czEmpty: true, clause: `[cz-return ${cmdr.id}]`, fireStep: "end" });
    // The end-step fire: resolve the drained clause through the SAME parser+resolver door the flush uses.
    const { state: s2, fired } = drainDelayedTriggers(s, "end", "user");
    expect(fired).toHaveLength(1);
    const prog = parseEffectClause(fired[0].descriptor.effectClause, "Instant");
    const s3 = ATOM_RESOLVERS["cz-return"](s2, prog.atoms[0], { controller: "user", targets: [] });
    expect(findCmdr(s3)).toBeNull();                                      // off the battlefield
    expect((s3.players.user.command || []).some((c) => c.id === "cmd-1")).toBe(true); // home in the CZ
  });

  it("an EMPTY command zone is a clean no-op (the may has nothing to take)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = visit({ ...g, players: { ...g.players, user: { ...g.players.user, command: [] } } });
    expect(s.players.user.battlefield).toHaveLength(0);
    expect((s.delayedTriggers || [])).toHaveLength(0); // nothing fetched → nothing scheduled
  });

  it("⛔ CR 603.7 — the commander DIED before the end step: the return is a clean skip", () => {
    let s = visit(board());
    const cmdr = findCmdr(s);
    // Kill him: drop the permanent from the battlefield (the death path's end state).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== cmdr.id) } } };
    const { state: s2, fired } = drainDelayedTriggers(s, "end", "user");
    const prog = parseEffectClause(fired[0].descriptor.effectClause, "Instant");
    const s3 = ATOM_RESOLVERS["cz-return"](s2, prog.atoms[0], { controller: "user", targets: [] });
    expect((s3.players.user.command || []).some((c) => c.id === "cmd-1")).toBe(false); // never fabricated back
  });
});
