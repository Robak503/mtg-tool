/**
 * DESTROY-TOKEN-RIDER (Zaxara deck-cleanup) — "Destroy target creature. It can't be regenerated.
 * (Its|That creature's) controller creates a N/N <color> <subtype> creature token." (Pongify, Rapid
 * Hybridization). A creature-destroy LEAD + an intervening can't-be-regenerated sentence + a (possibly
 * multi-word) token rider — three shapes the shared RIDER-REMOVAL matcher can't fold. This emits the SAME
 * { op:"destroy", controllerRider:{kind:"createToken"} } atom that applyRemovalWithRider already resolves
 * end-to-end (Beast Within's path), so the runtime is proven; this file pins the parser flip, the runtime
 * (token under the DESTROYED creature's controller, not the caster; the creature actually leaves), and the
 * CREED guards (an unmodeled rider / a 0-toughness token / a wrong shape stays LOW → Arbiter).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectProgram, programConfidence } from "../parser.js";
import { parseDestroyTokenRider } from "./destroyTokenRider.js";
import { classifyCard } from "../../coverage.js";
import { resolveAtom } from "../effectAtoms.js";
import { createGameState, _resetIdsForTests, createPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle, type = "Instant") => parseEffectProgram({ type, oracle });
const isHigh = (oracle, type = "Instant") => programConfidence(S(oracle, type)) === "high";

const PONGIFY = "Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token.";
const RAPID = "Destroy target creature. It can't be regenerated. That creature's controller creates a 3/3 green Frog Lizard creature token.";

describe("DESTROY-TOKEN-RIDER — parser", () => {
  it("Pongify parses to ONE destroy atom (creature, cannotRegenerate) carrying the createToken rider", () => {
    expect(parseDestroyTokenRider(PONGIFY)).toEqual({
      op: "destroy", targetType: "creature", restrictions: [], cannotRegenerate: true,
      controllerRider: { kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "Ape" },
    });
    expect(isHigh(PONGIFY)).toBe(true);
  });

  it("Rapid Hybridization — 'That creature's controller' subject + a multi-word subtype (Frog Lizard)", () => {
    expect(parseDestroyTokenRider(RAPID)).toEqual({
      op: "destroy", targetType: "creature", restrictions: [], cannotRegenerate: true,
      controllerRider: { kind: "createToken", power: 3, toughness: 3, color: "green", subtype: "Frog Lizard" },
    });
    expect(isHigh(RAPID)).toBe(true);
  });

  it("works WITHOUT the can't-be-regenerated sentence too (cannotRegenerate omitted)", () => {
    const r = parseDestroyTokenRider("Destroy target creature. Its controller creates a 3/3 green Ape creature token.");
    expect(r).toMatchObject({ op: "destroy", targetType: "creature", controllerRider: { kind: "createToken", subtype: "Ape" } });
    expect(r.cannotRegenerate).toBeUndefined();
  });

  it("CREED — anything outside the exact shape → null (stays LOW → Arbiter)", () => {
    expect(parseDestroyTokenRider("Destroy target creature. It can't be regenerated. Its controller discards a card.")).toBeNull(); // RE-POINTED 2026-07-29: the lose-life rider became MODELED, so this stand-in moved to a still-unmodeled one (discard). The principle pinned is the UNMODELED-RIDER refusal, never this particular rider.
    expect(parseDestroyTokenRider("Destroy target permanent. Its controller creates a 3/3 green Ape creature token.")).toBeNull(); // not "creature" → the shared matcher owns permanent leads
    expect(parseDestroyTokenRider("Destroy target creature. It can't be regenerated. Its controller creates a 3/3 green Ape creature token. Draw a card.")).toBeNull(); // trailing rider
    expect(parseDestroyTokenRider("Destroy target creature. Its controller creates a 0/0 green Ape creature token.")).toBeNull(); // 0-toughness token dies to SBA → incomplete
  });
});

describe("DESTROY-TOKEN-RIDER — runtime (the token lands on the DESTROYED creature's controller)", () => {
  function pod() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "p-bear", card: { id: "ai-bear", name: "Big Bear", type: "Creature — Bear", oracle: "", power: 4, toughness: 4 }, controller: "ai" });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [bear], life: 40 }, user: { ...s.players.user, life: 40 } } };
  }
  const creatureTarget = { type: "creature", id: "p-bear", controller: "ai" };

  it("Pongify — the OPPONENT (target's controller) gets the 3/3 Ape; the creature is destroyed; the caster gets nothing", () => {
    const atom = parseDestroyTokenRider(PONGIFY);
    const st = resolveAtom(pod(), atom, { controller: "user", targets: [creatureTarget], cardName: "Pongify" });
    const aiTokens = st.players.ai.battlefield.filter((p) => p.card.token);
    expect(aiTokens).toHaveLength(1);
    expect(aiTokens[0].card).toMatchObject({ power: 3, toughness: 3 });
    expect(aiTokens[0].card.type).toMatch(/Ape/);                                  // the descriptor subtype landed
    expect(st.players.user.battlefield.filter((p) => p.card.token)).toHaveLength(0); // NOT the caster
    expect(st.players.ai.battlefield.some((p) => p.id === "p-bear")).toBe(false);     // the bear is gone
  });

  it("Rapid Hybridization — the multi-word Frog Lizard token lands on the target's controller", () => {
    const atom = parseDestroyTokenRider(RAPID);
    const st = resolveAtom(pod(), atom, { controller: "user", targets: [creatureTarget], cardName: "Rapid Hybridization" });
    const aiTokens = st.players.ai.battlefield.filter((p) => p.card.token);
    expect(aiTokens).toHaveLength(1);
    expect(aiTokens[0].card.type).toMatch(/Frog Lizard/);
    expect(st.players.ai.battlefield.some((p) => p.id === "p-bear")).toBe(false);
  });

  it("the token is still made when the target is INDESTRUCTIBLE (CR — the second sentence resolves even if the destroy fails)", () => {
    const base = pod();
    const wall = createPermanent({ id: "p-wall", card: { id: "wall", name: "Darksteel Wall", type: "Artifact Creature — Wall", oracle: "Indestructible", power: 0, toughness: 4, keywords: ["indestructible"] }, controller: "ai" });
    const st0 = { ...base, players: { ...base.players, ai: { ...base.players.ai, battlefield: [wall] } } };
    const st = resolveAtom(st0, parseDestroyTokenRider(PONGIFY), { controller: "user", targets: [{ type: "creature", id: "p-wall", controller: "ai" }], cardName: "Pongify" });
    expect(st.players.ai.battlefield.some((p) => p.id === "p-wall")).toBe(true);     // indestructible survived
    expect(st.players.ai.battlefield.filter((p) => p.card.token)).toHaveLength(1);   // …but the token is still made
  });
});

describe("DESTROY-TOKEN-RIDER — coverage", () => {
  const C = (oracle, name, type = "Instant") => ({ type, oracle, mana: "{U}", name });
  it("Pongify + Rapid Hybridization flip to native-spell", () => {
    expect(classifyCard(C(PONGIFY, "Pongify"))).toBe("native-spell");
    expect(classifyCard(C(RAPID, "Rapid Hybridization"))).toBe("native-spell");
  });
  it("CREED — an unmodeled rider on the same lead shape stays Arbiter", () => {
    expect(classifyCard(C("Destroy target creature. It can't be regenerated. Its controller discards a card.", "X"))).toBe("arbiter-spell"); // RE-POINTED 2026-07-29: the lose-life rider became MODELED, so this stand-in moved to a still-unmodeled one (discard). The principle pinned is the UNMODELED-RIDER refusal, never this particular rider.
  });
});
