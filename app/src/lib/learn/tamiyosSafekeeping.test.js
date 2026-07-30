/**
 * tamiyosSafekeeping.test.js — a TARGETED keyword grant on a NON-CREATURE permanent.
 *
 * "Target permanent you control gains hexproof and indestructible until end of turn. You gain 2 life."
 *
 * ⭐ THREE THINGS HAD TO LINE UP, AND TWO OF THEM WERE INVISIBLE FROM THE CARD TEXT:
 *   1. the parser arm (obvious — a "permanent" subject beside the existing "creature" one),
 *   2. applyPumpEffect's `t.type === "creature"` loop guard, which drops the "permanent"-tagged target the
 *      cast path builds — the THIRD such resolver gate found this run, after untap-self and regenerate,
 *   3. ⭐ splitClauses, which shattered the sentence on its internal " and ". The whole-sentence keep-rule
 *      there is anchored to "^target creature", so a permanent subject fell through and the clause arrived
 *      as "…gains hexproof" + "indestructible until end of turn" — neither of which parses.
 *
 * ⭐ (3) IS THE ONE WORTH REMEMBERING. The clause parser returned the CORRECT atom when called directly and
 * `parseEffectClause` returned nothing at all. When a parser works in isolation but not through its driver,
 * the driver is doing something to the input — the same lesson the Springheart field-name collision taught
 * about `runEffectProgram`, one layer earlier in the pipeline. Read the driver, don't re-read the parser.
 *
 * The runtime was already permanent-wide: both granted keywords are layer-6 effects, `groupGrantClauseParser`
 * has carried a `permanentsYouControl` scope for the MASS form, and applyDestroyEffect's indestructible check
 * reads the layer engine (that is how Darksteel Forge protects artifacts). Only the single-target path was
 * missing, so this file proves the GRANT LANDS ON AN ARTIFACT and that the artifact actually survives.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { pumpClauseParser } from "./effects/atoms/combat.js";
import { applyDestroyEffect } from "./spellEffects.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TAMIYOS = { name: "Tamiyo's Safekeeping", type: "Instant", mana: "{G}",
  oracle: "Target permanent you control gains hexproof and indestructible until end of turn. You gain 2 life." };
const GRANT = "Target permanent you control gains hexproof and indestructible until end of turn.";

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const ring = createPermanent({ id: "ring", card: { id: "c-ring", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [ring] } } };
}
const grantAtom = () => parseEffectClause(GRANT, "Instant").atoms[0];

describe("⭐ the SPLITTER had to keep the sentence whole", () => {
  it("the clause parser always produced the right atom in isolation", () => {
    expect(pumpClauseParser("target permanent you control gains hexproof and indestructible until end of turn"))
      .toEqual({ op: "pump", targetType: "permanent", restrictions: [{ kind: "controller", who: "you" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["hexproof", "indestructible"] });
  });

  it("⭐ and now it survives the driver too — the internal ' and ' no longer shatters it", () => {
    expect(parseEffectClause(GRANT, "Instant").atoms).toEqual([
      { op: "pump", targetType: "permanent", restrictions: [{ kind: "controller", who: "you" }], ptDelta: { p: 0, t: 0 }, grantKeywords: ["hexproof", "indestructible"] },
    ]);
  });

  it("the creature subject is unchanged", () => {
    expect(parseEffectClause("Target creature you control gains hexproof and indestructible until end of turn.", "Instant").atoms[0])
      .toMatchObject({ targetType: "creature", grantKeywords: ["hexproof", "indestructible"] });
  });

  it("⛔ an ungrantable word still parks the clause (all-or-nothing keyword parse)", () => {
    expect(parseEffectClause("Target permanent you control gains widgetry until end of turn.", "Instant").atoms).toEqual([]);
  });

  it("⛔ NO opponent-scoped form and NO P/T form — neither is a printed shape here", () => {
    expect(parseEffectClause("Target permanent an opponent controls gains hexproof until end of turn.", "Instant").atoms).toEqual([]);
    expect(parseEffectClause("Target permanent you control gets +2/+2 until end of turn.", "Instant").atoms).toEqual([]);
  });
});

describe("⭐ RUNTIME — the grant lands on an ARTIFACT and really protects it", () => {
  it("both keywords apply to a non-creature permanent", () => {
    const out = ATOM_RESOLVERS.pump(board(), grantAtom(), { controller: "user", targets: [{ type: "permanent", id: "ring" }], cardName: "Tamiyo's Safekeeping" });
    expect(permanentHasKeyword(out, "ring", "hexproof")).toBe(true);
    expect(permanentHasKeyword(out, "ring", "indestructible")).toBe(true);
  });

  it("⭐ the granted indestructible actually survives a destroy", () => {
    const out = ATOM_RESOLVERS.pump(board(), grantAtom(), { controller: "user", targets: [{ type: "permanent", id: "ring" }], cardName: "Tamiyo's Safekeeping" });
    const after = applyDestroyEffect(out, { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(findPermanent(after, "ring")).toBeTruthy();
  });

  it("⛔ CREED CONTROL — WITHOUT the grant the same destroy kills it (the survival is the grant)", () => {
    const after = applyDestroyEffect(board(), { controller: "ai", targets: [{ type: "permanent", id: "ring" }] });
    expect(findPermanent(after, "ring")).toBeFalsy();
  });

  it("⛔ CREED — a target that already left the battlefield gets nothing", () => {
    const out = ATOM_RESOLVERS.pump(board(), grantAtom(), { controller: "user", targets: [{ type: "permanent", id: "gone" }], cardName: "Tamiyo's Safekeeping" });
    expect(permanentHasKeyword(out, "ring", "hexproof")).toBe(false);
  });

  it("⛔ a CREATURE-scoped pump still drops a 'permanent'-tagged target (the gate opened for one atom only)", () => {
    const creatureScoped = { op: "pump", targetType: "creature", ptDelta: { p: 0, t: 0 }, grantKeywords: ["hexproof"] };
    const out = ATOM_RESOLVERS.pump(board(), creatureScoped, { controller: "user", targets: [{ type: "permanent", id: "ring" }], cardName: "Probe" });
    expect(permanentHasKeyword(out, "ring", "hexproof")).toBe(false);
  });
});

describe("coverage", () => {
  it("Tamiyo's Safekeeping flips native-spell (the lifegain rider was already modeled)", () => {
    expect(classifyCard(TAMIYOS)).toBe("native-spell");
  });
});
