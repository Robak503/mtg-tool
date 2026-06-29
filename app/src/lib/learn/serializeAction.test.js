/**
 * serializeAction.test.js — regression for COMMS ❓[Q3] (Omnath).
 *
 * recordDecisions:true threw on real engine legalActions carrying undefined fields
 * (e.g. `targetName: undefined` on a non-targeted action): the stable-key serializer
 * emitted the literal text `undefined` into the JSON string, so JSON.parse choked
 * ("Unexpected token 'u', …\"targetName\":undefined,… is not valid JSON") and the whole
 * decisionTrajectory came back EMPTY (0 rows) — silently killing trajectory→case mining.
 *
 * The fix mirrors JSON.stringify's real behavior: OMIT undefined object keys, map
 * array-undefined → null. serializeAction must NEVER throw and must produce a clean,
 * stable, JSON-safe descriptor.
 */
import { describe, expect, it } from "vitest";
import { serializeAction } from "./learnSession.js";

describe("serializeAction — undefined-safe (Q3 regression)", () => {
  it("drops an undefined object field instead of throwing (the exact targetName:undefined crash)", () => {
    const action = { kind: "declare-attacker", permanentId: "p1", targetName: undefined, defenderId: undefined };
    let out;
    expect(() => { out = serializeAction(action); }).not.toThrow();
    expect(out).toEqual({ kind: "declare-attacker", permanentId: "p1" });
    expect("targetName" in out).toBe(false);
  });

  it("handles nested undefined in objects and arrays without throwing", () => {
    const action = { kind: "cast", target: { name: undefined, id: "c1" }, modes: ["a", undefined, "b"], x: undefined };
    let out;
    expect(() => { out = serializeAction(action); }).not.toThrow();
    expect(out).toEqual({ kind: "cast", target: { id: "c1" }, modes: ["a", null, "b"] });
  });

  it("produces a canonical (key-order-independent) descriptor", () => {
    const a = serializeAction({ b: 2, a: 1, kind: "x" });
    const b = serializeAction({ kind: "x", a: 1, b: 2 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("passes scalars through and normalizes null/undefined", () => {
    expect(serializeAction(null)).toBe(null);
    expect(serializeAction(undefined)).toBe(null);
    expect(serializeAction({ kind: "pass", n: 0, ok: false })).toEqual({ kind: "pass", n: 0, ok: false });
  });
});
