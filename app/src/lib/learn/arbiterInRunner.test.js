/**
 * arbiterInRunner.test.js — the Arbiter-in-runner deterministic foundation (Omnath handoff #2; spec:
 * docs/orchestration/ARBITER-IN-RUNNER-SPEC.md). Covers the verdict STORE (the determinism boundary) and the
 * verdict APPLIER (applyArbiterVerdict). The cardinal guard — hook OFF ⇒ trajectory hash `ab524e20`/5706
 * byte-identical — is enforced by the out-of-repo trajectory-hash probe (verified: the resolveArbiter opt
 * defaults null so advanceUntilDecision's interception is skipped entirely). The LIVE Ollama pre-pass that
 * POPULATES the cache is a separate off-loop task; this locks the pure, deterministic replay half.
 *
 * CREED: the applier is ALL-OR-NOTHING and never fabricates — any malformed / targeted / optional / no-resolver
 * atom rejects the WHOLE verdict (returns null ⇒ the runner keeps today's honest no-op).
 */
import { describe, it, expect } from "vitest";
import { createGameState } from "./gameState.js";
import { applyArbiterVerdict } from "./learnSession.js";
import { verdictKey, getVerdict, putVerdict, verdictCacheContentHash } from "./arbiterVerdictStore.js";
import { warmArbiterCache, verdictLooksApplyable } from "./arbiterPrepass.js";

function stateWithLibrary() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, library: [{ id: "c1", name: "A" }, { id: "c2", name: "B" }, { id: "c3", name: "C" }], hand: [] } },
    pendingArbiter: { controller: "user", cardName: "GatedCard", stackObjectId: "stk1" },
  };
}
const pa = (s) => s.pendingArbiter;

describe("applyArbiterVerdict — resolves a clean verdict, else honest no-op (null)", () => {
  it("a clean non-targeted verdict resolves: applies the atoms, clears pendingArbiter, logs arbiter-resolved", () => {
    const s = stateWithLibrary();
    const r = applyArbiterVerdict(s, { atoms: [{ op: "draw", amount: 1 }], source: "test" }, pa(s));
    expect(r).not.toBeNull();
    expect(r.players.user.hand).toHaveLength(1);              // the draw applied
    expect(r.pendingArbiter).toBeFalsy();                     // cleared
    expect(r.log.some((e) => e.kind === "arbiter-resolved")).toBe(true);
  });
  it("CREED — a malformed atom (no op) rejects the WHOLE verdict (null, no partial apply)", () => {
    const s = stateWithLibrary();
    expect(applyArbiterVerdict(s, { atoms: [{ amount: 1 }] }, pa(s))).toBeNull();
  });
  it("CREED — a TARGETED atom rejects (a chosen target would need resolution → SAFE false-negative)", () => {
    const s = stateWithLibrary();
    expect(applyArbiterVerdict(s, { atoms: [{ op: "draw", targetType: "creature" }] }, pa(s))).toBeNull();
  });
  it("CREED — an unknown op (no resolver) rejects (never fabricate)", () => {
    const s = stateWithLibrary();
    expect(applyArbiterVerdict(s, { atoms: [{ op: "totally-fake-op-xyz" }] }, pa(s))).toBeNull();
  });
  it("empty / missing atoms ⇒ null (nothing to apply)", () => {
    const s = stateWithLibrary();
    expect(applyArbiterVerdict(s, { atoms: [] }, pa(s))).toBeNull();
    expect(applyArbiterVerdict(s, {}, pa(s))).toBeNull();
    expect(applyArbiterVerdict(s, null, pa(s))).toBeNull();
  });
  it("no controller on the pendingArbiter ⇒ null (can't scope the effect)", () => {
    const s = stateWithLibrary();
    expect(applyArbiterVerdict(s, { atoms: [{ op: "draw", amount: 1 }] }, { cardName: "X" })).toBeNull();
  });
  it("a multi-atom verdict applies ALL atoms in order (draw twice ⇒ 2 cards)", () => {
    const s = stateWithLibrary();
    const r = applyArbiterVerdict(s, { atoms: [{ op: "draw", amount: 1 }, { op: "draw", amount: 1 }] }, pa(s));
    expect(r).not.toBeNull();
    expect(r.players.user.hand).toHaveLength(2);
  });
});

describe("arbiterVerdictStore — the determinism boundary", () => {
  it("verdictKey: card-only vs card+situation", () => {
    expect(verdictKey("Garruk's Uprising")).toBe("Garruk's Uprising");
    expect(verdictKey("Card", "t5-p2")).toBe("Card::t5-p2");
  });
  it("put/get round-trips; card-only fallback when no situation match; miss ⇒ null", () => {
    const cache = {};
    putVerdict(cache, "GatedCard", { atoms: [{ op: "draw", amount: 1 }] });
    expect(getVerdict(cache, "GatedCard").atoms).toEqual([{ op: "draw", amount: 1 }]);
    expect(getVerdict(cache, "GatedCard", "some-sig").atoms).toEqual([{ op: "draw", amount: 1 }]); // falls back to card-only
    expect(getVerdict(cache, "Unknown")).toBeNull();
    expect(getVerdict(null, "GatedCard")).toBeNull();
  });
  it("a situation-keyed verdict beats the card-only one for a matching sig", () => {
    const cache = {};
    putVerdict(cache, "C", { atoms: [{ op: "draw", amount: 1 }] });
    putVerdict(cache, "C", { atoms: [{ op: "draw", amount: 2 }] }, "sig9");
    expect(getVerdict(cache, "C", "sig9").atoms).toEqual([{ op: "draw", amount: 2 }]);
    expect(getVerdict(cache, "C").atoms).toEqual([{ op: "draw", amount: 1 }]);
  });
  it("contentHash is a stable 16-hex digest, order-independent", () => {
    const a = {}; putVerdict(a, "X", { atoms: [] }); putVerdict(a, "Y", { atoms: [] });
    const b = {}; putVerdict(b, "Y", { atoms: [] }); putVerdict(b, "X", { atoms: [] });
    expect(verdictCacheContentHash(a)).toMatch(/^[0-9a-f]{16}$/);
    expect(verdictCacheContentHash(a)).toBe(verdictCacheContentHash(b)); // insertion-order independent
  });
});

describe("warmArbiterCache — the off-loop pre-pass (pluggable verdict source)", () => {
  it("verdictLooksApplyable: a known non-targeted op passes; targeted/optional/unknown/empty fail", () => {
    expect(verdictLooksApplyable({ atoms: [{ op: "draw", amount: 1 }] })).toBe(true);
    expect(verdictLooksApplyable({ atoms: [{ op: "draw", targetType: "creature" }] })).toBe(false);
    expect(verdictLooksApplyable({ atoms: [{ op: "draw", optional: true }] })).toBe(false);
    expect(verdictLooksApplyable({ atoms: [{ op: "totally-fake-op" }] })).toBe(false);
    expect(verdictLooksApplyable({ atoms: [] })).toBe(false);
    expect(verdictLooksApplyable(null)).toBe(false);
  });
  it("caches applyable verdicts from the injected resolver + reports counts", async () => {
    const gated = [{ cardName: "Gated A" }, { cardName: "Gated B" }];
    const resolve = (pa) => (pa.cardName === "Gated A" ? { atoms: [{ op: "draw", amount: 1 }] } : { atoms: [{ op: "totally-fake" }] });
    const { cache, resolved, skipped } = await warmArbiterCache(gated, { resolve });
    expect(resolved).toBe(1);                       // A cached
    expect(skipped).toBe(1);                        // B's garbage verdict rejected by the validator
    expect(getVerdict(cache, "Gated A").atoms).toEqual([{ op: "draw", amount: 1 }]);
    expect(getVerdict(cache, "Gated B")).toBeNull(); // never cached garbage
  });
  it("DEDUPES by card (Garruk's Uprising ×N ⇒ ONE resolve call)", async () => {
    let calls = 0;
    const resolve = () => { calls += 1; return { atoms: [{ op: "draw", amount: 1 }] }; };
    const gated = Array.from({ length: 50 }, () => ({ cardName: "Garruk's Uprising" }));
    const { resolved } = await warmArbiterCache(gated, { resolve });
    expect(calls).toBe(1);      // 50 occurrences → 1 query
    expect(resolved).toBe(1);
  });
  it("a resolver THROW is skipped + counted, never fabricated", async () => {
    const resolve = () => { throw new Error("ollama down"); };
    const { resolved, errors, cache } = await warmArbiterCache([{ cardName: "X" }], { resolve });
    expect(resolved).toBe(0);
    expect(errors).toBe(1);
    expect(getVerdict(cache, "X")).toBeNull();
  });
  it("skips a card already in the cache (reuse a prior warm, don't re-query)", async () => {
    const cache = {}; putVerdict(cache, "Cached", { atoms: [{ op: "draw", amount: 1 }] });
    let calls = 0;
    const resolve = () => { calls += 1; return { atoms: [{ op: "draw", amount: 1 }] }; };
    await warmArbiterCache([{ cardName: "Cached" }], { resolve, cache });
    expect(calls).toBe(0); // already cached → no resolve
  });
});
