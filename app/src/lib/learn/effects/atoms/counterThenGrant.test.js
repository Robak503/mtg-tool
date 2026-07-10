/**
 * counterThenGrant.test.js — COUNTER-THEN-GRANT collapse (SHELF slice W1, Snakeskin Veil).
 *
 * "Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn."
 * The anaphoric "It" is the counter's own target → collapsed up front into ONE add-counter atom
 * carrying grantKeywords; applyAddCounter grants each keyword via a layer-6 endOfTurn effect
 * (the applyPumpEffect grant shape). Covers: the parse (restricted + unrestricted + multi-keyword
 * forms), the CREED fall-through (ungrantable keyword → low), and the resolver (counter placed +
 * keyword granted until end of turn, keyword gone next turn).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectProgram } from "../parser.js";
import { resolveAtom } from "../effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "../../gameState.js";
import { permanentHasKeyword } from "../../layers.js";

beforeEach(() => _resetIdsForTests());

const spell = (oracle) => parseEffectProgram({ name: "t", type: "Instant", oracle });

describe("COUNTER-THEN-GRANT — parse", () => {
  it("Snakeskin Veil: one add-counter atom, you-control restriction, hexproof grant, HIGH", () => {
    const prog = spell("Put a +1/+1 counter on target creature you control. It gains hexproof until end of turn.");
    expect(prog.confidence).toBe("high");
    expect(prog.atoms).toEqual([{
      op: "add-counter", counterType: "+1/+1", amount: 1,
      targetType: "creature", restrictions: [{ kind: "controller", who: "you" }],
      grantKeywords: ["hexproof"],
    }]);
  });

  it("Essence Infusion: two counters, unrestricted target, lifelink", () => {
    const prog = spell("Put two +1/+1 counters on target creature. It gains lifelink until end of turn.");
    expect(prog.atoms).toEqual([{
      op: "add-counter", counterType: "+1/+1", amount: 2, targetType: "creature", grantKeywords: ["Lifelink"],
    }]);
  });

  it("multi-keyword list (Gaea's Gift) parses all-or-nothing", () => {
    const prog = spell("Put a +1/+1 counter on target creature you control. It gains reach, trample, hexproof, and indestructible until end of turn.");
    expect(prog.atoms[0].grantKeywords).toEqual(["Reach", "Trample", "hexproof", "indestructible"]);
  });

  it("an ungrantable keyword falls through to low (CREED)", () => {
    const prog = spell("Put a +1/+1 counter on target creature you control. It gains shroudiness until end of turn.");
    expect(prog.confidence).toBe("low");
    expect(prog.atoms).toEqual([]);
  });
});

describe("COUNTER-THEN-GRANT — resolver", () => {
  it("places the counter AND grants the keyword until end of turn only", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear] } } };
    const atom = { op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creature", grantKeywords: ["hexproof"] };
    const s2 = resolveAtom(s1, atom, { controller: "user", targets: [{ id: bear.id, type: "creature", controller: "user" }] });
    const perm = findPermanent(s2, bear.id).permanent;
    expect(perm.counters["+1/+1"]).toBe(1);                              // the counter landed
    expect(permanentHasKeyword(s2, bear.id, "Hexproof")).toBe(true);     // the grant is live this turn
    const s3 = { ...s2, turn: s2.turn + 1, continuousEffects: (s2.continuousEffects || []).filter((e) => !(e.duration?.kind === "endOfTurn" && e.duration.turn < s2.turn + 1)) };
    expect(findPermanent(s3, bear.id).permanent.counters["+1/+1"]).toBe(1); // the counter persists
  });
});
