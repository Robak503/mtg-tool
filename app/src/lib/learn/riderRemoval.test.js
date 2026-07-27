/**
 * RIDER-REMOVAL (Dex, real-deck-unlock slice 2) — premium removal whose SECOND sentence acts on the
 * TARGET's controller (CR — "its controller" = the just-removed permanent's controller, NOT the caster):
 *   - Swords to Plowshares    "Exile target creature. Its controller gains life equal to its power."
 *   - Path to Exile           "Exile target creature. Its controller may search … a basic land … battlefield…"
 *   - Beast Within / Gen. Gift "Destroy target permanent. Its controller creates a 3/3 green Beast/Elephant…"
 *   - Assassin's Trophy        "Destroy target permanent an opponent controls. Its controller may search …"
 *
 * The lead removal reuses the SHARED removal grammar (every modeled targetType + controller restriction);
 * the rider rides on the atom as `controllerRider`, applied at resolution to the controller captured BEFORE
 * the removal. This file pins: (1) the parser flips the modeled shapes and the landmines stay LOW; (2) the
 * engine — the rider lands on the TARGET's controller, never the caster (the RIDER-CTRL-LIFE trap); (3)
 * coverage — the staples are native, keyword/named/multi-color tokens + lose-life/discard riders bounce.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle, type = "Instant") => parseEffectProgram({ type, oracle });
const isHigh = (oracle, type = "Instant") => programConfidence(S(oracle, type)) === "high";
const riderOf = (oracle, type = "Instant") => (S(oracle, type).atoms || []).find((a) => a.controllerRider)?.controllerRider;

describe("parser — removal + 'its controller' rider (RIDER-REMOVAL)", () => {
  it("parses the modeled riders onto a single removal atom", () => {
    expect(S("Exile target creature. Its controller gains life equal to its power.").atoms)
      .toEqual([{ op: "exile", targetType: "creature", controllerRider: { kind: "gainLifePower" } }]);
    expect(riderOf("Destroy target permanent. Its controller creates a 3/3 green Beast creature token."))
      .toEqual({ kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "beast" });
    expect(riderOf("Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle."))
      .toEqual({ kind: "rampBasic", entersTapped: true });
    // the lead reuses the removal grammar's restriction (Assassin's Trophy) + 2-way union (Erode)
    const trophy = S("Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.").atoms[0];
    expect(trophy).toMatchObject({ op: "destroy", targetType: "permanent", restrictions: [{ kind: "controller", who: "opponent" }], controllerRider: { kind: "rampBasic", entersTapped: false } });
    expect(isHigh("Destroy target creature or planeswalker. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle.")).toBe(true); // Erode
  });

  it("CREED: an UNMODELED rider keeps the whole card LOW → Arbiter (never fires the removal alone)", () => {
    expect(isHigh("Destroy target creature. Its controller loses 2 life.")).toBe(false);                          // lose-life rider (Sip of Hemlock)
    expect(isHigh("Destroy target creature. Its controller discards a card.")).toBe(false);                       // discard rider (Assassin's Strike)
    expect(isHigh("Exile target creature with power 2 or less. Its controller gains 4 life.")).toBe(false);       // fixed gain-life (Last Breath) + MV filter
    expect(isHigh("Exile target nonland permanent. Its controller creates a 3/2 red and white Spirit creature token.")).toBe(false); // MULTI-COLOR token (Reduce to Memory) — still unmodeled
    // GRADUATED (census slice 15) — Geomancer's Gambit's "Draw a card." was pinned here as an unmodeled
    // "extra rider", but it was never a rider at all: an unqualified "Draw a card." is the SPELL's own
    // effect and the CASTER draws, not the target's controller. It was parked only because the matcher was
    // anchored to end-of-oracle and had no way to hand a trailing sentence back. It now returns it as `rest`,
    // which collapsed() parses into a normal draw atom (no player redirect — verified in the program), so
    // this line asserts the opposite. See removalRiderTrailingSentence.test.js. Every OTHER case in this
    // block is a genuine controller-rider the engine still cannot express, and stays exactly as it was.
    expect(isHigh("Destroy target land. Its controller may search their library for a basic land card, put it onto the battlefield tapped, then shuffle. Draw a card.")).toBe(true);
    expect(isHigh("Exile target creature. Its controller may search their library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.")).toBe(false); // multi-land ramp rider
    // NOTE: KEYWORD tokens (Afterlife's flying Spirit) + NAMED tokens (Buy Your Silence's Treasure) are now
    // MODELED by SOFT-COUNTER-RIDER's token-rider widening — see softCounterRider.test.js.
  });

  it("CREED: a plain removal with NO rider is untouched (still the bare exile/destroy atom)", () => {
    expect(S("Exile target creature.").atoms).toEqual([{ op: "exile", targetType: "creature" }]);
    expect(S("Destroy target permanent.").atoms[0]).toMatchObject({ op: "destroy", targetType: "permanent" });
    expect(S("Destroy target permanent.").atoms[0].controllerRider).toBeUndefined();
  });
});

// ── The engine sim: the rider must land on the TARGET's controller, NEVER the caster (the RIDER-CTRL-LIFE trap).
describe("engine — the rider resolves to the TARGET's controller (RIDER-REMOVAL)", () => {
  function pod() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "p-bear", card: { id: "ai-bear", name: "Big Bear", type: "Creature — Bear", oracle: "", power: 4, toughness: 4 }, controller: "ai" });
    const forest = { id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" };
    return { ...s, players: { ...s.players,
      ai: { ...s.players.ai, battlefield: [bear], library: [forest], life: 40 },
      user: { ...s.players.user, life: 40 },
    } };
  }
  const creatureTarget = { type: "creature", id: "p-bear", controller: "ai" };
  const permTarget = { type: "permanent", id: "p-bear", controller: "ai" };

  it("Swords — the TARGET's controller gains life = the creature's power (not the caster)", () => {
    const atom = { op: "exile", targetType: "creature", controllerRider: { kind: "gainLifePower" } };
    const st = resolveAtom(pod(), atom, { controller: "user", targets: [creatureTarget], cardName: "Swords to Plowshares" });
    expect(st.players.ai.life).toBe(44);                         // the OPPONENT (target's controller) gains 4
    expect(st.players.user.life).toBe(40);                       // the CASTER gains nothing
    expect(st.players.ai.battlefield).toHaveLength(0);           // the creature is exiled
  });

  it("Beast Within — the TARGET's controller gets the 3/3 token (not the caster)", () => {
    const atom = { op: "destroy", targetType: "permanent", restrictions: [], controllerRider: { kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "beast" } };
    const st = resolveAtom(pod(), atom, { controller: "user", targets: [permTarget], cardName: "Beast Within" });
    const aiTokens = st.players.ai.battlefield.filter((p) => p.card.token);
    expect(aiTokens).toHaveLength(1);
    expect(aiTokens[0].card).toMatchObject({ power: 3, toughness: 3, type: "Token Creature — Beast" });
    expect(st.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(0); // not the caster
    expect(st.players.ai.battlefield.some((p) => p.id === "p-bear")).toBe(false);     // the target is destroyed
  });

  it("Path — the ramp tutor is scoped to the TARGET's controller's library; the land enters THEIR battlefield tapped", () => {
    const atom = { op: "exile", targetType: "creature", controllerRider: { kind: "rampBasic", entersTapped: true } };
    let st = resolveAtom(pod(), atom, { controller: "user", targets: [creatureTarget], cardName: "Path to Exile" });
    expect(st.pendingChoice).toMatchObject({ kind: "tutor-search", controller: "ai", destination: "battlefield", entersTapped: true });
    expect(st.pendingChoice.candidates.map((c) => c.name)).toEqual(["Forest"]); // the opponent's own library
    st = resolveTutorChoice(st, autoPickTutorCandidate(st, st.pendingChoice));
    const aiLands = st.players.ai.battlefield.filter((p) => /Land/.test(p.card.type));
    expect(aiLands).toHaveLength(1);
    expect(aiLands[0].tapped).toBe(true);
    expect(st.players.ai.battlefield.some((p) => p.id === "p-bear")).toBe(false);     // the creature is exiled
  });

  it("Beast Within still makes the token when the target is INDESTRUCTIBLE (the destroy fails, the rider doesn't)", () => {
    const base = pod();
    const indes = createPermanent({ id: "p-wall", card: { id: "wall", name: "Darksteel Wall", type: "Artifact Creature — Wall", oracle: "Indestructible", power: 0, toughness: 4, keywords: ["indestructible"] }, controller: "ai" });
    const st0 = { ...base, players: { ...base.players, ai: { ...base.players.ai, battlefield: [indes] } } };
    const atom = { op: "destroy", targetType: "permanent", restrictions: [], controllerRider: { kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "beast" } };
    const st = resolveAtom(st0, atom, { controller: "user", targets: [{ type: "permanent", id: "p-wall", controller: "ai" }], cardName: "Beast Within" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-wall")).toBe(true);                       // indestructible → survived
    expect(st.players.ai.battlefield.filter((p) => p.card.token)).toHaveLength(1);                     // …but the token is still made
  });
});

describe("coverage — RIDER-REMOVAL staples flip native; the unmodeled riders bounce", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("the real-deck staples are native-spell (incl. the bonus cards the corpus sweep surfaced)", () => {
    expect(classifyCard(C("Instant", "Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.", "Path to Exile"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Exile target creature. Its controller gains life equal to its power.", "Swords to Plowshares"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Destroy target permanent. Its controller creates a 3/3 green Beast creature token.", "Beast Within"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Destroy target permanent. Its controller creates a 3/3 green Elephant creature token.", "Generous Gift"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Destroy target permanent an opponent controls. Its controller may search their library for a basic land card, put it onto the battlefield, then shuffle.", "Assassin's Trophy"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Exile target nonland permanent. Its controller creates a 1/1 white Soldier creature token.", "Secure the Scene"))).toBe("native-spell");
  });

  it("CREED: unmodeled-rider removal stays Arbiter-routed", () => {
    expect(classifyCard(C("Instant", "Destroy target creature. Its controller loses 2 life.", "Sip of Hemlock"))).toBe("arbiter-spell");
    // Pongify / Rapid Hybridization (destroy creature + can't-be-regenerated + that controller makes a token)
    // are now NATIVE via DESTROY-TOKEN-RIDER (effects/atoms/destroyTokenRider.js) — the can't-be-regenerated
    // sentence is carried as cannotRegenerate (applyDestroyEffect honors it), so the flip is correct, not an FP.
    // See destroyTokenRider.test.js for the parser + end-to-end runtime + CREED pins.
    expect(classifyCard(C("Sorcery", "Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.", "Pongify"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Destroy target creature. Its controller discards a card.", "Assassin's Strike"))).toBe("arbiter-spell"); // discard rider
    expect(classifyCard(C("Sorcery", "Destroy target artifact or enchantment. Its controller gains 4 life.", "Nature's Claim"))).toBe("arbiter-spell"); // fixed gain-life (not "equal to its power")
  });
});
