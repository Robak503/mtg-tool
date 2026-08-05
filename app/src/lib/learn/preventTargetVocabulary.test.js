/**
 * preventTargetVocabulary.test.js — the last two cells of the prevent-next-N target vocabulary (CR 615):
 * the SELF referent ("…dealt to THIS CREATURE this turn" — Revered Elder, Ordruun Commando, Ethereal
 * Champion, Ursine Fylgja) and the TYPE-FILTERED target ("…dealt to target ARTIFACT CREATURE this turn" —
 * Argivian Blacksmith, Abuna Acolyte).
 *
 * ⭐ THE FAMILY WAS ~48 CARRIERS NATIVE across "any target" / "target creature" / "you", and these two
 * wordings were native on ZERO. The `pvc` arm's own comment records the previous instance of this exact
 * split ("the same shape, refused only by the target word") — so this is the third cell of a vocabulary that
 * has been filled in one word at a time.
 *
 * ⛔⛔ THE TWO ARMS LOOKED IDENTICAL FROM THE PARSER AND WERE NOT. The type-filtered arm needed nothing at
 * runtime — `cardType` is an existing restriction whose own comment names "target artifact creature". The
 * SELF arm needed a RESOLVER FIX: applyPreventNextDamage read `ctx.targets` **directly**, which is correct
 * for a chosen target and silently wrong for a fixed referent — ctx.targets is empty, so the card would have
 * classified native and shielded NOTHING. That is the "classifies native but does nothing" trap, and it is
 * invisible to a flip-diff: the card flips either way. **The runtime pin below is the only thing that
 * distinguishes them**, which is why it drives a real damage event rather than asserting the atom.
 *
 * ⓘ Rock Hydra carries the self line and still PARKS, on its "for each 1 damage … remove a +1/+1 counter and
 * prevent that damage" replacement — a different mechanic. Pinned so it isn't read as a miss here.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * atomTargets routing reverted to `ctx.targets` -> the witness shows the self shield never created and full
 * damage landing; the cardType restriction dropped -> a NON-artifact creature is offered to Argivian
 * Blacksmith.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, consumePreventionShields } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SELF = "prevent the next 1 damage that would be dealt to this creature this turn";
const TYPED = "prevent the next 2 damage that would be dealt to target artifact creature this turn";
const parse = (s) => parseEffectClause(splitClauses(s)[0], "Creature");

describe("the two new cells parse", () => {
  it("⭐ the SELF referent carries target:'self' and NO targetType", () => {
    const p = parse(SELF);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "prevent-next-damage", amount: 1, target: "self" }]);
  });

  it("⭐ the TYPE-FILTERED target carries the existing cardType restriction", () => {
    expect(parse(TYPED).atoms).toEqual([{ op: "prevent-next-damage", amount: 2, targetType: "creature",
      restrictions: [{ kind: "cardType", type: "artifact" }] }]);
  });

  it("⛔ the three incumbent wordings are untouched", () => {
    expect(parse("prevent the next 1 damage that would be dealt to any target this turn").atoms)
      .toEqual([{ op: "prevent-next-damage", amount: 1, targetType: "any" }]);
    expect(parse("prevent the next 3 damage that would be dealt to target creature this turn").atoms)
      .toEqual([{ op: "prevent-next-damage", amount: 3, targetType: "creature" }]);
    expect(parse("prevent the next 2 damage that would be dealt to you this turn").atoms)
      .toEqual([{ op: "prevent-next-damage", amount: 2, who: "you", targetType: null }]);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard({ name: "Revered Elder", type: "Creature — Human Cleric", mana: "{2}{W}", power: "1", toughness: "1",
      oracle: "{1}: Prevent the next 1 damage that would be dealt to this creature this turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Argivian Blacksmith", type: "Creature — Human Artificer", mana: "{1}{W}{W}", power: "1", toughness: "2",
      oracle: "{T}: Prevent the next 2 damage that would be dealt to target artifact creature this turn." })).toBe("native-activated");
  });

  it("⛔ Rock Hydra still parks — its damage-REPLACEMENT line is a different mechanic", () => {
    expect(classifyCard({ name: "Rock Hydra", type: "Creature — Hydra", mana: "{X}{R}{R}", power: "0", toughness: "0",
      oracle: "This creature enters with X +1/+1 counters on it.\nFor each 1 damage that would be dealt to this creature, if it has a +1/+1 counter on it, remove a +1/+1 counter from it and prevent that 1 damage.\n{R}: Prevent the next 1 damage that would be dealt to this creature this turn." })).not.toMatch(/^native/);
  });
});

describe("⭐⭐ LAW 6 — the SELF shield must actually EXIST (a flip-diff cannot see this)", () => {
  function board() {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const elder = createPermanent({ id: "elder", card: { id: "c-e", name: "Revered Elder", type: "Creature — Human Cleric", power: "1", toughness: "1", oracle: `{1}: ${SELF}.` }, controller: "user" });
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [elder] } } };
  }
  /**
   * ⚠️ THE HARNESS SIGNATURE IS LOAD-BEARING, and the first cut of this test got it wrong. runEffectProgram
   * takes (state, STACK OBJECT) with the program inside `payload.params` — passing the program directly made
   * programConfidence read `undefined`, log "low confidence — unmodeled effect", and return an unchanged
   * state. The witness row printed `shields: []` and looked exactly like the bug this test exists to catch.
   * A pin that asserts values rather than "it passed" is what caught it.
   */
  const resolveSelf = (s) => runEffectProgram(s, {
    source: { name: "Revered Elder" },
    payload: { params: { program: parse(SELF), controller: "user", targets: [], sourceId: "elder" } },
  });

  it("⭐⭐ the source shields ITSELF, and the shield absorbs a real hit", () => {
    const state = resolveSelf(board());
    const hit = consumePreventionShields(state, { targetKind: "creature", targetId: "elder", amount: 3 });
    const row = {
      shields: (state.preventionShields || []).map((s) => `${s.targetKind}:${s.targetId}:${s.amount}`),
      unpreventedOf3: hit.amount,
    };
    console.log("  WITNESS preventSelf", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    // ⭐ Without the atomTargets routing this reads `shields: []` and `unpreventedOf3: 3` — native, and doing
    // absolutely nothing. That contrast is the entire point of this pin.
    expect(row).toEqual({ shields: ["creature:elder:1"], unpreventedOf3: 2 });
  });

  it("⛔ an unrelated creature is NOT shielded by it", () => {
    const state = resolveSelf(board());
    expect(consumePreventionShields(state, { targetKind: "creature", targetId: "someone-else", amount: 3 }).amount).toBe(3);
  });
});

describe("⭐ LAW 6 — the artifact filter is enforced at ENUMERATION", () => {
  it("⭐ only ARTIFACT creatures are offered", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type) => createPermanent({ id, card: { id: `c-${id}`, name: id, type, power: "2", toughness: "2", oracle: "" }, controller: "user" });
    const s = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [mk("golem", "Artifact Creature — Golem"), mk("bear", "Creature — Bear")] } } };
    const offered = expandCastChoices(s, "user", parse(TYPED), [], {}).flatMap((c) => (c.targets || []).map((t) => t.id)).sort();
    const bare = expandCastChoices(s, "user", parse("prevent the next 2 damage that would be dealt to target creature this turn"), [], {})
      .flatMap((c) => (c.targets || []).map((t) => t.id)).sort();
    console.log("  WITNESS preventArtifact", JSON.stringify({ typed: offered, bare }));
    expect({ typed: offered, bare }).toEqual({ typed: ["golem"], bare: ["bear", "golem"] });
  });
});
