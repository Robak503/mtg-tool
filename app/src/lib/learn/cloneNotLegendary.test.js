/**
 * cloneNotLegendary.test.js — "except it isn't legendary" (CR 707.9a): Spark Double.
 *
 * ⛔⛔ THIS FIXES A LIVE FALSE POSITIVE THAT A STALE COMMENT CREATED. cloneCopy.js parsed the rider as a
 * `noop`, and said why: *"the legend rule is unenforced by the engine"*. That was TRUE when it was written.
 * It is not true now — `sba.js` implements CR 704.5j (`applyLegendRule`), which groups a player's legendary
 * permanents BY NAME off the type line and destroys all but the newest. So the copy kept "Legendary" on its
 * type line and the engine **destroyed one of the pair** — precisely the outcome the printed card exempts it
 * from. A Spark Double on your commander was killing your commander.
 *
 * ⭐ FOUND BY POINTING THE REFUSAL SWEEP AT RUNTIME FILES rather than at the classifier. The same sweep that
 * found ward—discard: grep the engine for "unenforced" / "not modeled" notes and check each against what the
 * engine can do TODAY. A refusal comment is a claim with a timestamp, and this one had expired.
 *
 * ⓘ NO COVERAGE CHANGE — Spark Double was already native-clone, because the rider was RECOGNIZED (as a
 * no-op) and so passed the all-or-nothing rider gate. The bug was never in classification; it was in what
 * the copy actually became. A flip-diff cannot see this, which is exactly why the drive below exists.
 *
 * ⛔ THE FIX IS A TYPE-LINE STRIP, not a flag: every legend-rule read goes through the type line, and
 * "isn't legendary" means precisely that the copy lacks the supertype. Both `type` and `type_line` are
 * edited because different readers use different fields.
 *
 * ⏭ THE TWIN IS STILL OPEN and is worse: effects/atoms/tokenCopy.js swallows ", except the token isn't
 * legendary" inside its match regex with the same stale justification. Miirym, Sentinel Wyrm mints a token
 * copy of each legendary Dragon you cast — a LEGENDARY token, which dies to the rule immediately, so the
 * card currently does nothing at all. Scoped in the run ledger.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the rider
 * reverted to `{ kind: "noop" }` -> the copy keeps "Legendary", the SBA destroys one of the pair, and the
 * witness row shows a single survivor.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, applyLegendRule } from "./gameState.js";
import { parseCloneSpec, snapshotCopiedCard } from "./cloneCopy.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ⛔ REAL oracle, pulled from the bundled Scryfall data — an earlier draft of this fixture was typed from
// memory ("Shapeshifter", a trailing "if that permanent is legendary") and classified body-only, which
// would have made the whole pin meaningless. Card text comes from the corpus, never from recollection.
const SPARK_DOUBLE = { id: "c-sd", name: "Spark Double", type: "Creature — Illusion", mana: "{3}{U}",
  power: "0", toughness: "0",
  oracle: "You may have this creature enter as a copy of a creature or planeswalker you control, except it enters with an additional +1/+1 counter on it if it's a creature, it enters with an additional loyalty counter on it if it's a planeswalker, and it isn't legendary." };
const KRENKO = { id: "c-kr", name: "Krenko, Mob Boss", type: "Legendary Creature — Goblin Warrior",
  mana: "{2}{R}{R}", power: "3", toughness: "3", oracle: "" };

describe("the rider is a real type-line modification now", () => {
  it("⭐ the copy of a legend is NOT legendary", () => {
    const spec = parseCloneSpec(SPARK_DOUBLE);
    expect(spec.riders.map((r) => r.kind)).toContain("stripLegendary");
    const copy = snapshotCopiedCard({ card: KRENKO }, SPARK_DOUBLE, spec.riders);
    expect(copy.type).toBe("Creature — Goblin Warrior");
    // ⛔ Only the supertype goes — the copy is still the same creature in every other respect.
    expect(copy.name).toBe("Krenko, Mob Boss");
  });

  it("ⓘ classification is UNCHANGED — this was never a coverage bug", () => {
    expect(classifyCard(SPARK_DOUBLE)).toBe("native-clone");
  });
});

describe("⭐ LAW 6 — both survive the legend-rule state-based action", () => {
  function board({ copyIsLegendary }) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const spec = parseCloneSpec(SPARK_DOUBLE);
    // The REAL snapshot the resolver takes, with the REAL parsed riders — not a hand-built card.
    const copied = snapshotCopiedCard({ card: KRENKO }, SPARK_DOUBLE, copyIsLegendary ? [] : spec.riders);
    const orig = createPermanent({ id: "orig", card: KRENKO, controller: "user", summoningSick: false });
    const dupe = createPermanent({ id: "dupe", card: copied, controller: "user", summoningSick: false });
    orig.timestamp = 1; dupe.timestamp = 2;
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [orig, dupe] } } };
  }

  it("⭐ Spark Double on your own commander no longer kills it", () => {
    const rows = [];
    for (const copyIsLegendary of [true, false]) {
      const s = board({ copyIsLegendary });
      const r = applyLegendRule(s);
      rows.push({ copyKeptLegendary: copyIsLegendary,
        destroyed: r.dead.map((d) => d.id),
        survivors: r.state.players.user.battlefield.map((p) => p.id) });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      // ⛔ THE OLD BEHAVIOUR, kept as the control: a legendary copy loses one of the pair to CR 704.5j.
      { copyKeptLegendary: true, destroyed: ["orig"], survivors: ["dupe"] },
      // ⭐ THE FIX: nothing dies, both stay on the battlefield.
      { copyKeptLegendary: false, destroyed: [], survivors: ["orig", "dupe"] },
    ]);
  });

  it("⛔ the legend rule still WORKS — this didn't disable it", () => {
    // Two genuine legends with the same name must still collapse to one.
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const a = createPermanent({ id: "a", card: KRENKO, controller: "user", summoningSick: false });
    const b = createPermanent({ id: "b", card: { ...KRENKO }, controller: "user", summoningSick: false });
    a.timestamp = 1; b.timestamp = 2;
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [a, b] } } };
    const r = applyLegendRule(s);
    expect(r.dead.map((d) => d.id)).toEqual(["a"]);
    expect(r.state.players.user.battlefield.map((p) => p.id)).toEqual(["b"]);
  });
});
