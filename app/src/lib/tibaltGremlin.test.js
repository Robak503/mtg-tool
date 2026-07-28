/**
 * tibaltGremlin.test.js — the policy behind Tibalt's uninvited interjection.
 *
 * This feature can hurt someone. That is not hyperbole: an unprompted joke landing on a person who is
 * learning the game, or who just lost, or who is looking at their first deck, is the exact thing the
 * roast law exists to prevent — and unlike a requested roast, they did not ask for it. So the tests here
 * lead with the REFUSALS, and the happy path is last.
 *
 * Omnath's mutation-check is the load-bearing one: force `finding = null` and the path must produce NO
 * BUBBLE AT ALL — not an empty bubble, not a generic quip. If a jab can appear without a finding under
 * it, the right-not-just-mean law is decorative and the whole feature is a liability.
 */
import { describe, expect, it } from "vitest";

import {
  shouldInterject, recordFire, recordReaction, emptyGremlinState, CAPS, GREMLIN_EVENTS, VETOED_SURFACES,
} from "./tibaltGremlin.js";

const ON = { gremlinEnabled: true };
const EVENT = { kind: "deck.saved" };
const FINDING = { key: "draw-count-low", text: "Six draw spells in a deck that wants to durdle.", value: 6 };
const base = (o = {}) => ({ event: EVENT, finding: FINDING, profile: ON, deckId: "d1", ...o });

describe("THE STRUCTURAL EXCLUSION — he hangs off EVENTS, never chat turns", () => {
  it("a chat turn is not a gremlin event", () => {
    // The whole hazard model rests on this. A user mid-question, mid-rules-answer or asking for help is
    // producing MESSAGES, not events — so there is nothing to fire on, by construction rather than by a
    // sentiment guess.
    expect(shouldInterject(base({ event: { kind: "chat.turn" } })).allow).toBe(false);
    expect(shouldInterject(base({ event: { kind: "chat.turn" } })).reason).toBe("not-a-gremlin-event");
  });

  it("the allowed events are exactly the three completed-action ones", () => {
    expect([...GREMLIN_EVENTS].sort()).toEqual(["bench.statCrossedThreshold", "deck.imported", "deck.saved"]);
  });

  it("no event at all → nothing", () => {
    expect(shouldInterject(base({ event: null })).allow).toBe(false);
  });
});

describe("OMNATH'S MUTATION-CHECK — no finding, no joke", () => {
  it("a null finding produces NO bubble", () => {
    const r = shouldInterject(base({ finding: null }));
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("no-finding");
  });

  it("a finding with no text is not a finding", () => {
    expect(shouldInterject(base({ finding: { key: "k", value: 1 } })).allow).toBe(false);
  });

  it("a finding with no key is not a finding — it could never be suppressed, so it could nag forever", () => {
    expect(shouldInterject(base({ finding: { text: "something", value: 1 } })).allow).toBe(false);
  });
});

describe("HARD BLOCKS — each is a person who must not be interrupted", () => {
  it.each([...VETOED_SURFACES])("vetoed on the %s surface", (surface) => {
    expect(shouldInterject(base({ surface })).allow).toBe(false);
  });

  it("never on a profile's FIRST deck — the briefs forbid punching at someone's first", () => {
    expect(shouldInterject(base({ isFirstDeck: true })).reason).toBe("first-deck");
  });

  it("never on a first import, for the same reason", () => {
    expect(shouldInterject(base({ isFirstImport: true })).reason).toBe("first-import");
  });

  it("never when Karn already said it — an echo is not a gremlin", () => {
    expect(shouldInterject(base({ findingAlreadyOnScreen: true })).reason).toBe("already-on-screen");
  });

  it("DEFAULT OFF — a profile that never opted in is never interrupted", () => {
    expect(shouldInterject(base({ profile: {} })).reason).toBe("disabled");
    expect(shouldInterject(base({ profile: null })).reason).toBe("disabled");
  });
});

describe("PER-FINDING SUPPRESSION — what separates a gremlin from a heckler", () => {
  it("he never makes the same joke twice about a problem you have not fixed", () => {
    const after = recordFire(emptyGremlinState(), { deckId: "d1", finding: FINDING, now: 1000 });
    // Same deck, same finding, same underlying value → dead key, even ignoring every clock-based cap.
    const r = shouldInterject(base({ state: { ...after, firedThisSession: 0, lastFireAt: 0 }, now: 9e12 }));
    expect(r.allow).toBe(false);
    expect(r.reason).toBe("suppressed-unchanged");
  });

  it("…but he speaks again once the underlying stat actually CHANGES", () => {
    const after = recordFire(emptyGremlinState(), { deckId: "d1", finding: FINDING, now: 1000 });
    const moved = { ...FINDING, value: 11 };            // they fixed it — that is a new fact
    const r = shouldInterject(base({ finding: moved, state: { ...after, firedThisSession: 0, lastFireAt: 0 }, now: 9e12 }));
    expect(r.allow).toBe(true);
  });

  it("suppression is per DECK, not global — the same flaw in a different deck is a different fact", () => {
    const after = recordFire(emptyGremlinState(), { deckId: "d1", finding: FINDING, now: 1000 });
    const r = shouldInterject(base({ deckId: "d2", state: { ...after, firedThisSession: 0, lastFireAt: 0 }, now: 9e12 }));
    expect(r.allow).toBe(true);
  });
});

describe("CAPS — three layers, because time alone does not stop a heckler", () => {
  it("one per session, hard", () => {
    const s = { ...emptyGremlinState(), firedThisSession: CAPS.sessionCap };
    expect(shouldInterject(base({ state: s })).reason).toBe("session-cap");
  });

  it("6h spacing between any two fires", () => {
    const s = { ...emptyGremlinState(), lastFireAt: 1_000_000 };
    expect(shouldInterject(base({ state: s, now: 1_000_000 + 60_000 })).reason).toBe("spacing");
    expect(shouldInterject(base({ state: s, now: 1_000_000 + CAPS.spacingMs + 1 })).allow).toBe(true);
  });

  it("3 per rolling 7 days", () => {
    const now = 9e12;
    const s = { ...emptyGremlinState(), recentFires: [now - 1000, now - 2000, now - 3000] };
    expect(shouldInterject(base({ state: s, now })).reason).toBe("rolling-cap");
  });

  it("IGNORE-DECAY — two unreacted bubbles double the spacing; he reads the room", () => {
    let s = { ...emptyGremlinState(), lastFireAt: 1_000_000 };
    s = recordReaction(recordReaction(s, "ignored"), "ignored");
    // At exactly the normal spacing he is now still silent, because the window doubled.
    expect(shouldInterject(base({ state: s, now: 1_000_000 + CAPS.spacingMs + 1 })).reason).toBe("spacing");
    expect(shouldInterject(base({ state: s, now: 1_000_000 + CAPS.spacingMs * 2 + 1 })).allow).toBe(true);
  });

  it("…and a single reaction resets the decay — one landing forgives the silence", () => {
    let s = { ...emptyGremlinState(), lastFireAt: 1_000_000 };
    s = recordReaction(recordReaction(s, "ignored"), "ignored");
    s = recordReaction(s, "replied");
    expect(s.consecutiveIgnores).toBe(0);
    expect(shouldInterject(base({ state: s, now: 1_000_000 + CAPS.spacingMs + 1 })).allow).toBe(true);
  });
});

describe("the happy path, last — everything true", () => {
  it("a real finding on a saved deck, opted in, fresh state → allowed", () => {
    const r = shouldInterject(base({ state: emptyGremlinState() }));
    expect(r).toEqual({ allow: true, reason: "ok" });
  });

  it("recordFire is pure and stamps the suppression key with the finding's VALUE", () => {
    const s0 = emptyGremlinState();
    const s1 = recordFire(s0, { deckId: "d1", finding: FINDING, now: 42 });
    expect(s0.firedThisSession).toBe(0);            // unchanged — pure
    expect(s1.firedThisSession).toBe(1);
    expect(s1.suppressed["d1:draw-count-low"]).toBe(6);
  });
});

describe("the interjection REGISTER is its own prompt, not the roast delta", () => {
  it("carries the one-bubble form and the say-nothing permission", async () => {
    const { TIBALT_INTERJECTION, TIBALT_DELTA } = await import("./agents.js");
    // Separate from the delta on purpose: the delta is the roast the user ASKED for; this is the
    // intrusion they did not, so it carries tighter constraints.
    expect(TIBALT_INTERJECTION).not.toBe(TIBALT_DELTA);
    expect(TIBALT_INTERJECTION).toContain("ONE bubble");
    expect(TIBALT_INTERJECTION).toContain("no question");
    expect(TIBALT_INTERJECTION).toContain("Returning an empty string is a valid, correct answer");
  });

  it("forbids addressing the room's guide — a face bickering with a face breaks the one-mind claim", () => {
    return import("./agents.js").then(({ TIBALT_INTERJECTION }) => {
      expect(TIBALT_INTERJECTION).toContain("never address, name, or argue with the guide");
    });
  });
});
