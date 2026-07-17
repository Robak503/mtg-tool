/**
 * α2 — the "you may <effect>" optional wrapper.
 *
 * The parser peels a leading "you may" and stamps optional:true on a fully-modeled inner atom (a
 * cost "you may pay …" or an unmodeled inner stays gated). The runner SUSPENDS on an optional atom
 * (a real player yes/no, or AI/Expert auto-take) instead of resolving it as mandatory — that would
 * be a forbidden mis-apply. resolveOptionalChoice runs-or-skips it then resumes.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { runEffectProgram, resolveOptionalChoice } from "./runProgram.js";
import { parseEffectProgram } from "./parser.js";

beforeEach(() => _resetIdsForTests());

const I = (oracle) => ({ type: "Instant", oracle });
const withLibrary = (cards) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: cards, hand: [] } } };
};
const obj = (program) => ({ source: { name: "Test" }, payload: { params: { program, controller: "user", targets: [] } } });

describe("α2 — you-may optional wrapper", () => {
  it("parses 'you may <effect>' to an optional atom; gates costs + unmodeled inners", () => {
    expect(parseEffectProgram(I("You may draw a card.")).atoms).toEqual([{ op: "draw", amount: 1, targetType: null, optional: true }]);
    expect(parseEffectProgram(I("Draw a card.")).atoms[0].optional).toBeUndefined();
    expect(parseEffectProgram(I("You may pay {2}.")).confidence).toBe("low");
    // ("You may sacrifice a creature." sat here until EC-1c modeled the bare controller edict — it now
    // parses to an optional who:"controller" sacrifice, pinned in controllerSacrificeUpkeep.test.js; the
    // unmodeled-inner boundary holds with a FILTERED victim, which the exact-anchor edict never admits.)
    expect(parseEffectProgram(I("You may sacrifice a creature with flying.")).confidence).toBe("low");
  });

  it("an optional atom SUSPENDS instead of resolving mandatory", () => {
    const r = runEffectProgram(withLibrary([{ id: "c1", name: "Forest", type: "Land" }]), obj(parseEffectProgram(I("You may draw a card."))));
    expect(r.pendingChoice?.kind).toBe("optional-effect");
    expect(r.pendingChoice?.effectOp).toBe("draw");
    expect(r.players.user.hand).toHaveLength(0); // not drawn yet — the choice hasn't been made
  });

  it("YES runs the effect, NO skips it — both resume cleanly", () => {
    const paused = runEffectProgram(withLibrary([{ id: "c1", name: "Forest", type: "Land" }]), obj(parseEffectProgram(I("You may draw a card."))));
    const yes = resolveOptionalChoice(paused, true);
    expect(yes.players.user.hand).toHaveLength(1);
    expect(yes.players.user.library).toHaveLength(0);
    expect(yes.pendingChoice).toBeFalsy();
    const no = resolveOptionalChoice(paused, false);
    expect(no.players.user.hand).toHaveLength(0);
    expect(no.players.user.library).toHaveLength(1);
    expect(no.pendingChoice).toBeFalsy();
  });

  it("a chained 'you may scry 2' → YES hands off to the scry reorder choice", () => {
    const paused = runEffectProgram(
      withLibrary([{ id: "a", name: "A", type: "Land" }, { id: "b", name: "B", type: "Land" }, { id: "c", name: "C", type: "Land" }]),
      obj(parseEffectProgram(I("You may scry 2."))),
    );
    expect(paused.pendingChoice?.kind).toBe("optional-effect");
    const yes = resolveOptionalChoice(paused, true);
    expect(yes.pendingChoice?.kind).toBe("scry-surveil"); // the optional's YES chained into the scry
  });
});
