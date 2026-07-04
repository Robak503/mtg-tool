// V6 Trophy Case — provenance validation contract pins. These fields are
// ADDITIVE: absent fields always validate (old clients + old data untouched).
import { describe, expect, it } from "vitest";

import { validateProvenance } from "./collectionValidation.js";

describe("validateProvenance", () => {
  it("accepts an empty body (all fields optional)", () => {
    expect(validateProvenance({})).toBeNull();
  });

  it("accepts a full well-formed provenance payload", () => {
    expect(validateProvenance({
      signed: { artist: "Chase Stone", date: "2026-06-25", event: "MagicCon Vegas", inPerson: true },
      altered: false,
      artistProof: true,
      showcase: true,
    })).toBeNull();
  });

  it("accepts signed: null (clears the signature)", () => {
    expect(validateProvenance({ signed: null })).toBeNull();
  });

  it("accepts a partial signed object", () => {
    expect(validateProvenance({ signed: { artist: "Graciano" } })).toBeNull();
  });

  it("rejects a non-object signed", () => {
    expect(validateProvenance({ signed: "yes" })).toMatch(/signed must be an object/);
    expect(validateProvenance({ signed: ["a"] })).toMatch(/signed must be an object/);
  });

  it("rejects wrong-typed signed subfields", () => {
    expect(validateProvenance({ signed: { artist: 7 } })).toMatch(/signed\.artist/);
    expect(validateProvenance({ signed: { inPerson: "yes" } })).toMatch(/signed\.inPerson/);
  });

  it("rejects unknown signed subfields (schema stays closed)", () => {
    expect(validateProvenance({ signed: { grader: "PSA" } })).toMatch(/unknown field: grader/);
  });

  it("rejects non-boolean flags", () => {
    expect(validateProvenance({ altered: "yes" })).toMatch(/altered must be a boolean/);
    expect(validateProvenance({ artistProof: 1 })).toMatch(/artistProof must be a boolean/);
    expect(validateProvenance({ showcase: "on" })).toMatch(/showcase must be a boolean/);
  });
});
