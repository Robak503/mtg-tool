/**
 * playerShuffleInvestigate.test.js — "<player> investigates." (Panther Pounce; Fateful Absence via the
 * bound-referent arm).
 *
 * ⚠️ THIS FILE EXISTS BECAUSE THE FIRST CUT SHIPPED A WRONG-OWNER FALSE POSITIVE. The Clue mint's recipient
 * field is `whoCreates`, not `who`. The arm emitted `who`, the mint ignored it, and every Clue went to the
 * CASTER — the card classified native while doing the wrong thing. The pre-existing actInvestigate pins
 * caught it by name ("a 3rd-person (wrong-owner) investigate is NOT native").
 *
 * The same cut also emitted `who` for "<player> shuffles their library", where applyShuffle ignores any
 * recipient and always shuffles ctx.controller's library. NOTHING caught that one — there was no pin, and
 * the tests only asserted ATOM SHAPES. So the shuffle half was dropped, and this file leads with a RUNTIME
 * assertion about WHO received the token. Asserting the atom is not asserting the effect.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (o, ty = "Sorcery") => parseEffectClause(o, ty)?.atoms;
const sorcery = (o) => ({ name: "C", type: "Sorcery", mana: "{1}{U}", oracle: o });

const cluesFor = (state, pid) => (state.players[pid].battlefield || []).filter((p) => p.card?.name === "Clue").length;

const runWith = (oracle, targets) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const out = runEffectProgram(s, {
    source: { name: "C" },
    payload: { params: { program: parseEffectClause(oracle, "Sorcery"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return out?.state ?? out;
};

describe("⭐ ENFORCEMENT — the Clue reaches the NAMED player, not the caster", () => {
  it("target player investigates → the TARGET gets the Clue", () => {
    const st = runWith("Target player investigates.", [{ type: "player", id: "ai", atomIndex: 0 }]);
    expect(cluesFor(st, "ai")).toBe(1);
    // The discriminating half, and the exact bug the first cut shipped.
    expect(cluesFor(st, "user")).toBe(0);
  });

  it("VACUITY CONTROL: no investigate clause, no Clues anywhere", () => {
    const st = runWith("Draw a card.", []);
    expect(cluesFor(st, "ai")).toBe(0);
    expect(cluesFor(st, "user")).toBe(0);
  });

  it("emits whoCreates — the field the mint actually reads", () => {
    expect(atomsOf("Target player investigates.")).toEqual([
      { op: "create-named-token", token: "clue", count: 1, whoCreates: "target", targetType: "player" },
    ]);
    // `who` would be silently ignored; asserting the field NAME is what keeps that from coming back.
    expect(atomsOf("Target player investigates.")[0].who).toBeUndefined();
  });
});

describe("refusals the runtime cannot express", () => {
  it("⛔ 'each opponent investigates' stays on the Arbiter", () => {
    // whoCreates supports "target" or the controller and nothing else, so there is no recipient the mint
    // can honour here. Refusing is the only honest option when the runtime cannot express the printed
    // recipient — the alternative is a card credited for tokens nobody gets.
    expect(classifyCard(sorcery("Each opponent investigates."))).toBe("arbiter-spell");
    expect(classifyCard(sorcery("Each player investigates."))).toBe("arbiter-spell");
  });

  it("⛔ '<player> shuffles their library' is NOT modelled", () => {
    // applyShuffle always shuffles ctx.controller's library, so a target form would shuffle the CASTER's
    // deck. Worth 2 cards (Soldier of Fortune, Boggart Forager) and it needs a resolver dispatch first.
    expect(classifyCard(sorcery("Target player shuffles their library."))).toBe("arbiter-spell");
  });

  it("⛔ a qualified subject stays on the Arbiter", () => {
    expect(atomsOf("Target player who attacked investigates.")).toEqual([]);
  });
});

describe("⭐ the bound-referent payload chain — every branch reads its OWN capture group", () => {
  // ⚠️ A second bug from the same slice: the chain used to end in a payload rather than null, so poison was
  // an implicit catch-all. Adding `investigates` as a new capture group shifted the indices, its test read
  // the wrong group, and "Its controller investigates" silently resolved as A POISON COUNTER.
  const second = (o) => atomsOf(o)?.[1]?.op;

  it("routes all five payloads distinctly", () => {
    expect(second("Destroy target creature. Its controller discards a card.")).toBe("discard");
    expect(second("Return target creature to its owner's hand. Its controller loses 1 life.")).toBe("lose-life");
    expect(second("Destroy target artifact. Its controller gains 2 life.")).toBe("gain-life");
    expect(second("Destroy target creature with flying. Its controller gets a poison counter.")).toBe("add-poison");
    expect(second("Destroy target creature. Its controller investigates.")).toBe("create-named-token");
  });

  it("⛔ investigate is NOT poison and poison is NOT investigate", () => {
    expect(second("Destroy target creature. Its controller investigates.")).not.toBe("add-poison");
    expect(second("Destroy target creature with flying. Its controller gets a poison counter.")).not.toBe("create-named-token");
  });

  it("the referent investigate also emits whoCreates", () => {
    expect(atomsOf("Destroy target creature. Its controller investigates.")[1]).toMatchObject({
      op: "create-named-token", token: "clue", whoCreates: "target", bindPreviousTargets: true, playerFrom: "controller",
    });
  });

  it("Panther Pounce and Fateful Absence are native", () => {
    expect(classifyCard({ name: "Panther Pounce", type: "Instant", mana: "{2}{G}",
      oracle: "Target player investigates. Target creature gets +1/+0 and gains flying until end of turn. Untap it." })).toBe("native-spell");
    expect(classifyCard({ name: "Fateful Absence", type: "Instant", mana: "{1}{W}",
      oracle: 'Destroy target creature or planeswalker. Its controller investigates. (To investigate, create a Clue token. It\'s an artifact with "{2}, Sacrifice this artifact: Draw a card.")' })).toBe("native-spell");
  });
});
