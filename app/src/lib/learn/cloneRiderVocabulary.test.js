/**
 * cloneRiderVocabulary.test.js — three additions to the SHARED "except …" rider vocabulary (CR 707.9a).
 *
 * `parseCloneRider` is the one place both copy paths read their riders: the entering clone (Spark Double,
 * Phantasmal Image) and — once increments 2b/3 land — the temporary "becomes a copy … until end of turn"
 * family. Extending it here rather than writing a second vocabulary is the whole point; two rider parsers
 * would drift the moment one gained an arm the other lacked.
 *
 * The three arms, each measured against real printed text before being written:
 *   • PRONOUN GENERALITY — "his name is …", "he's 4/4", "he has flying" are the SAME riders as the "it"
 *     forms; only the card's flavour pronoun differs. Normalized once, ahead of every arm, so a future
 *     rider gets all pronouns for free.
 *   • NAME RIDER — "except its name is <X>" (Sarkhan, Soul Aflame; Impossible Man; Hulkling).
 *   • LEGENDARY IN ADDITION — "it's legendary in addition to its other types" (Sarkhan).
 *
 * ⚠️ A REAL BUG THIS FILE EXISTS TO PIN: the name arm lowercases its input to match, so the parsed name is
 * lowercase and title-casing it back is LOSSY ("Scion of the Ur-Dragon" → "Scion Of The Ur-Dragon"). The
 * applier therefore prefers the COPYING CARD'S own printed name, which the rider always restates.
 */
import { describe, expect, it } from "vitest";

import { parseCloneRider, snapshotCopiedCard } from "./cloneCopy.js";

describe("PRONOUN GENERALITY — the same rider, whatever pronoun the card uses", () => {
  it('⭐ "he\'s 4/4" is the same setPT as "it\'s 4/4"', () => {
    expect(parseCloneRider("he's 4/4")).toEqual({ kind: "setPT", power: 4, toughness: 4 });
    expect(parseCloneRider("it's 4/4")).toEqual({ kind: "setPT", power: 4, toughness: 4 });
  });

  it('⭐ "he has flying" is the same addKeyword as "it has flying"', () => {
    expect(parseCloneRider("he has flying")).toEqual({ kind: "addKeyword", keywords: ["flying"] });
  });

  it('⭐ "his name is X" is the same setName as "its name is X"', () => {
    expect(parseCloneRider("his name is Impossible Man")).toMatchObject({ kind: "setName" });
  });

  it("CONTROL — an unrelated leading word is NOT rewritten into a rider", () => {
    // The normalization is anchored to the pronoun forms; it must not turn arbitrary text into a match.
    expect(parseCloneRider("hers is the fourth seat")).toBeNull();
    expect(parseCloneRider("the name is wrong")).toBeNull();
  });
});

describe("NAME RIDER (CR 707.9a)", () => {
  it("⭐ parses the stated name", () => {
    expect(parseCloneRider("its name is Sarkhan, Soul Aflame")).toEqual({ kind: "setName", name: "sarkhan, soul aflame" });
  });

  it("⭐ the applied copy carries the copying card's EXACT printed casing, not a title-cased guess", () => {
    // "Scion of the Ur-Dragon" is the case that makes this matter — title-casing would capitalize "of"
    // and "the". The rider always restates the copying card's own name, so the applier uses that card.
    const src = { card: { name: "Shivan Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "Flying" } };
    const clone = { id: "c1", name: "Scion of the Ur-Dragon" };
    const out = snapshotCopiedCard(src, clone, [parseCloneRider("its name is Scion of the Ur-Dragon")]);
    expect(out.name).toBe("Scion of the Ur-Dragon");
  });

  it("⛔ the rest of the copy is untouched by the name rider", () => {
    // A name rider must not quietly alter the body it renames.
    const src = { card: { name: "Shivan Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "Flying" } };
    const out = snapshotCopiedCard(src, { id: "c1", name: "Sarkhan, Soul Aflame" }, [parseCloneRider("its name is Sarkhan, Soul Aflame")]);
    expect([out.power, out.toughness]).toEqual([5, 5]);
    expect(out.type).toBe("Creature — Dragon");
    expect(out.oracle).toBe("Flying");
  });

  it("⛔ when the copying card's name DISAGREES with the rider, the RIDER wins", () => {
    // No printed card does this, but stamping the copying card's name regardless would be inventing a
    // name the rider never asked for. The fallback keeps the printed instruction authoritative.
    const src = { card: { name: "Shivan Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "" } };
    const out = snapshotCopiedCard(src, { id: "c1", name: "Something Else" }, [{ kind: "setName", name: "stated name" }]);
    expect(out.name).toBe("stated name");
  });
});

describe("⛔ LEGENDARY IN ADDITION stays PARKED — a pin I was wrong to try to graduate", () => {
  it("⛔ 'it's legendary in addition to its other types' is still null", () => {
    // I briefly made this a `noop`, reasoning that the engine does not enforce the legend rule (CR 704.5j)
    // so the modification changes nothing. clone.test.js's existing pin failed and it was RIGHT: the legend
    // rule is not the point. LEGENDARY-MATTERS effects are real here — Bard Class taxes "Legendary spells",
    // and anthems/ETB triggers scope on the supertype — so a copy that should BE legendary and is not would
    // be credited native with a real modification silently dropped. The forbidden direction.
    //
    // Modelling it properly means PREPENDING the supertype to the copy's type line (as addCardType does for
    // artifact/enchantment, but further left). Until then it parks, and Sarkhan, Soul Aflame parks with it.
    expect(parseCloneRider("it's legendary in addition to its other types")).toBeNull();
  });

  it("CONTROL — a TYPE addition is still a real addType", () => {
    expect(parseCloneRider("it's an artifact in addition to its other types")).toEqual({ kind: "addCardType", cardType: "Artifact" });
  });
});

describe("⛔ the existing vocabulary is unchanged", () => {
  it("the arms that already worked still return exactly what they did", () => {
    expect(parseCloneRider("it isn't legendary")).toEqual({ kind: "noop" });
    expect(parseCloneRider("it's 1/4")).toEqual({ kind: "setPT", power: 1, toughness: 4 });
    expect(parseCloneRider("it has flying")).toEqual({ kind: "addKeyword", keywords: ["flying"] });
    expect(parseCloneRider("it has ~'s other abilities")).toEqual({ kind: "retainOwnAbilities" });
  });

  it("⛔ an unmodelled rider still returns null so the whole card parks (CREED all-or-nothing)", () => {
    expect(parseCloneRider("it gains protection from everything")).toBeNull();
  });
});

describe("⛔ the ELIDED name form — the shape a printed card actually produces", () => {
  it("⭐ 'its name is ~' is a selfName marker, never the literal string", () => {
    // parseCloneSpec elides the card's own name to `~` before splitting riders, so this is the form that
    // reaches the parser from real oracle text. A literal would stamp the copy with the name "~".
    expect(parseCloneRider("its name is ~")).toEqual({ kind: "setName", selfName: true });
  });

  it("⭐ the applier resolves it against the COPYING card", () => {
    const src = { card: { name: "Shivan Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "" } };
    const out = snapshotCopiedCard(src, { id: "c1", name: "Sarkhan, Soul Aflame" }, [parseCloneRider("its name is ~")]);
    expect(out.name).toBe("Sarkhan, Soul Aflame");
  });

  it("⛔ with no copying card to resolve against, the copied name stands — never a literal '~'", () => {
    const src = { card: { name: "Shivan Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "" } };
    const out = snapshotCopiedCard(src, undefined, [parseCloneRider("its name is ~")]);
    expect(out.name).toBe("Shivan Dragon");
    expect(out.name).not.toBe("~");
  });
});
