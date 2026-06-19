/**
 * TRUNK-SELFBUFF — a STATIC self-buff scaled by a board count: "This creature gets +X/+Y for each
 * <countsource>" (Nim Lasher, Benalish Honor Guard…). Modeled as a layer-7c dynamic effect (re-evaluated
 * live). parseClause emits a ptModifyDynamicCount descriptor with a serializable count spec; layers.js
 * evaluates the count each P/T computation. CREED: only the dup-free count sources (card-type / basic-land
 * "you control"); a subtype / opponent / graveyard / "other" source → NO descriptor → LOW (Arbiter).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const creature = (id, name, oracle, p = 1, t = 1, extraType = "Zombie") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type: `Creature — ${extraType}`, power: p, toughness: t, oracle }, controller: "user" });
const artifact = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Trinket", type: "Artifact", oracle: "" }, controller: "user" });

function board(userBf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf } } };
}

describe("TRUNK-SELFBUFF — engine-sim: the buff tracks a live board count", () => {
  it("'this creature gets +1/+0 for each artifact you control' = base power + #artifacts", () => {
    const lasher = creature("lash", "Tester", "This creature gets +1/+0 for each artifact you control.", 1, 1);
    const s = board([lasher, artifact("a1"), artifact("a2"), artifact("a3")]);
    expect(permanentPower(s, "lash")).toBe(4);     // 1 + 3 artifacts
    expect(permanentToughness(s, "lash")).toBe(1); // +0 toughness
  });

  it("NAME-based self-reference ('Nim Lasher gets +1/+0 for each artifact…') works (name → 'this creature')", () => {
    const nim = creature("nim", "Nim Lasher", "Nim Lasher gets +1/+0 for each artifact you control.", 1, 1);
    const s = board([nim, artifact("a1"), artifact("a2")]);
    expect(permanentPower(s, "nim")).toBe(3); // 1 + 2
  });

  it("re-evaluates live — removing an artifact lowers the buff", () => {
    const c = creature("c", "Tester", "This creature gets +2/+2 for each artifact you control.", 0, 0);
    let s = board([c, artifact("a1"), artifact("a2")]);
    expect(permanentPower(s, "c")).toBe(4); // 0 + 2×2
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter(p => p.id !== "a2") } } };
    expect(permanentPower(s, "c")).toBe(2); // 0 + 2×1
  });

  it("counts a modeled basic-land source", () => {
    const c = creature("c", "Loam Lion", "This creature gets +1/+1 for each Forest you control.", 1, 1);
    const forest = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
    const s = board([c, forest("f1"), forest("f2")]);
    expect(permanentPower(s, "c")).toBe(3);     // 1 + 2 Forests
    expect(permanentToughness(s, "c")).toBe(3);
  });
});

describe("TRUNK-SELFBUFF — coverage classification + descriptor shape", () => {
  it("a single-line count self-buff classifies native-static", () => {
    expect(classifyCard({ type: "Creature — Rat", name: "Relentless Rats Jr", mana: "{2}{B}", oracle: "Relentless Rats Jr gets +1/+1 for each creature you control." })).toBe("native-static");
  });

  it("emits the right layer-7c dynamic descriptor", () => {
    const d = parseStaticAbilities({ name: "X", type: "Creature", oracle: "This creature gets +2/+2 for each creature you control." });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({
      layer: 7, sublayer: "7c", affects: { mode: "self" },
      op: { layerOp: "ptModifyDynamicCount", perPower: 2, perToughness: 2, countSpec: { kind: "permanentsYouControl", cardType: "Creature" } },
    });
  });
});

describe("TRUNK-SELFBUFF — MUST_DROP_TO_LOW (no fabricated buff)", () => {
  const noDescriptor = (oracle) => expect(parseStaticAbilities({ name: "X", type: "Creature", oracle })).toHaveLength(0);
  it("rejects an unmodeled count source — subtype, graveyard, hand, 'other'", () => {
    noDescriptor("This creature gets +1/+1 for each Goblin you control.");        // subtype not in the dup-free allowlist
    noDescriptor("This creature gets +1/+1 for each card in your graveyard.");    // graveyard count (follow-up)
    noDescriptor("This creature gets +1/+1 for each other artifact you control."); // "other" / excludeSelf (follow-up)
  });
  it("rejects an OPPONENT-scoped count (would buff the wrong way)", () => {
    noDescriptor("This creature gets +1/+1 for each artifact an opponent controls.");
  });
  it("rejects a TRIGGERED / one-shot pump (not a static buff)", () => {
    noDescriptor("Whenever this creature attacks, it gets +1/+1 for each artifact you control until end of turn.");
  });
});
