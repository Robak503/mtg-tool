/**
 * populate.test.js — POPULATE (CR 701.32a). Thirteen carriers, none native before this: Trostani, Growing
 * Ranks, Wayfaring Temple, Rootborn Defenses, Sundering Growth and more.
 *
 * "Populate. (Create a token that's a copy of a creature token you control.)"
 *
 * ⭐ THE MINTER WAS ALREADY BUILT. `create-token-copy` (CR 707.1) does the entire job — the copiable-values
 * snapshot, the token-doubler multiply, the per-copy ETB triggers — and `resolveCopySource` is the single
 * place that decides WHICH permanent gets copied. Populate needed exactly one new source kind
 * (`creatureTokenYouControl`) and a clause alias. No new minting and no new resolver, which is why a
 * thirteen-card mechanic cost two small additions.
 *
 * ⛔ TOKENS ONLY, and that is the RULE, not a simplification. A nontoken creature is not a legal populate
 * source, so copying one would be strictly more than the card allows. The gate is `card.token` — the same
 * flag the minter stamps and Miirym's nontoken gate reads. Pinned with a 9/9 nontoken sitting next to a 1/1
 * token: the 1/1 is copied.
 *
 * ⛔ NOT A TARGET. Populate never prints "target", so nothing is chosen at cast time and the source is
 * picked at resolution. With no creature token the atom's existing CR 111.12 path makes it a clean no-op —
 * the printed outcome for a player with no tokens, not an engine shortfall. Pinned.
 *
 * The pick is DETERMINISTIC AND STATED so self-play traces reproduce: largest body by power+toughness, ties
 * by permanent id. Populate's choice is unconstrained by the rules (any creature token you control), so any
 * legal pick is faithful; the biggest is the obvious play and never illegal.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied AND verified on the case under test): the
 * `card.token` gate dropped -> the nontoken pin goes red (a 9/9 Grizzly Bears gets copied); the clause
 * parser disabled -> every flip pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, populateClauseParser } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WAKE_THE_REFLECTIONS = { id: "c-wr", name: "Wake the Reflections", type: "Sorcery", mana: "{W}",
  oracle: "Populate. (Create a token that's a copy of a creature token you control.)" };
const SUNDERING_GROWTH = { id: "c-sg", name: "Sundering Growth", type: "Instant", mana: "{1}{G}{W}",
  oracle: "Destroy target artifact or enchantment. Populate." };

const perm = (card, id) => ({ id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
const token = (id, name, p, t) => perm({ id: `c${id}`, name, type: "Creature — Elemental", power: p, toughness: t, oracle: "", token: true }, id);
const nontoken = (id, name, p, t) => perm({ id: `c${id}`, name, type: "Creature — Bear", power: p, toughness: t, oracle: "" }, id);

/** Resolve Wake the Reflections over `battlefield` and return the resulting creature names. */
function afterPopulate(battlefield) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...b, players: { ...b.players, user: { ...b.players.user, battlefield } } };
  const r = runEffectProgram(s, { id: "so", source: { name: "Wake the Reflections" },
    payload: { params: { program: parseEffectProgram(WAKE_THE_REFLECTIONS), controller: "user", targets: [], sourceId: "wk" } } });
  const st = r?.state || r;
  return (st.players.user.battlefield || []).map((p) => `${p.card.name}${p.card.token ? "(tok)" : ""}`);
}

describe("recognition", () => {
  it("the bare sentence and the ', then populate' tail both parse to the token-copy atom", () => {
    expect(populateClauseParser("Populate.")).toEqual({ op: "create-token-copy", copySource: "creatureTokenYouControl", count: 1, targetType: null });
    expect(populateClauseParser("then populate")).toEqual({ op: "create-token-copy", copySource: "creatureTokenYouControl", count: 1, targetType: null });
  });

  it("the carriers flip, keeping their own effect alongside", () => {
    expect(classifyCard(WAKE_THE_REFLECTIONS)).toBe("native-spell");
    expect(classifyCard(SUNDERING_GROWTH)).toBe("native-spell");
    expect((parseEffectProgram(SUNDERING_GROWTH).atoms || []).map((a) => a.op)).toEqual(["destroy", "create-token-copy"]);
  });

  it("⛔ whole-clause anchored — 'populate' inside other text never matches", () => {
    expect(populateClauseParser("Populate the battlefield with dreams.")).toBeNull();
    expect(populateClauseParser("population")).toBeNull();
  });
});

describe("⭐ LAW 6 — resolved on a real board", () => {
  it("⛔ with NO creature token it is a clean no-op (CR 111.12), not a fabricated body", () => {
    expect(afterPopulate([nontoken("r1", "Grizzly Bears", 9, 9)])).toEqual(["Grizzly Bears"]);
  });

  it("copies the token, producing a second one", () => {
    expect(afterPopulate([token("t1", "Saproling", 1, 1)])).toEqual(["Saproling(tok)", "Saproling(tok)"]);
  });

  it("picks the largest body, deterministically", () => {
    expect(afterPopulate([token("t1", "Saproling", 1, 1), token("t2", "Wurm", 4, 4)]))
      .toEqual(["Saproling(tok)", "Wurm(tok)", "Wurm(tok)"]);
  });

  it("⭐ ⛔ a NONTOKEN creature is not a legal source, however big", () => {
    // The 9/9 loses to a 1/1 because it is not a token. Without the card.token gate the biggest-body pick
    // would copy the Grizzly Bears — strictly more than the card allows.
    expect(afterPopulate([nontoken("r1", "Grizzly Bears", 9, 9), token("t1", "Saproling", 1, 1)]))
      .toEqual(["Grizzly Bears", "Saproling(tok)", "Saproling(tok)"]);
  });
});
