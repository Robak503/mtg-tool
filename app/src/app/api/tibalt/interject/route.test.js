/**
 * /api/tibalt/interject — the gremlin's I/O caller, with the POLICY MODULE RUNNING REAL
 * (lib/tibaltGremlin.js is unmocked — that layer holds every hazard, so these tests drive it).
 * Mocked: the store (in-memory), the ranker (controlled findings), the model (scripted jabs).
 *
 * The load-bearing pins (Omnath's [O2] mutation check first):
 *   - NO FINDING → NO BUBBLE AT ALL. A healthy deck produces silence, not a generic quip.
 *   - a model that returns the empty string → no bubble AND no fire recorded (no suppression
 *     burned for a bubble that never existed);
 *   - a real jab → the fire is recorded (session cap advances, the finding key is suppressed)
 *     and the log entry is written with reaction "pending";
 *   - the profile gate, the vetoed surface, and the session cap all refuse with their reasons;
 *   - PATCH records the reaction on the log entry and feeds ignore-decay.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { emptyGremlinState } from "../../../../lib/tibaltGremlin.js";

// In-memory store — the route reads/writes this instead of profilePath("gremlin.json").
const mem = { record: { enabled: true, state: emptyGremlinState(), log: [] } };
vi.mock("../../../../lib/server/gremlinStore.js", () => ({
  readGremlin: vi.fn(async () => JSON.parse(JSON.stringify(mem.record))),
  writeGremlin: vi.fn(async (r) => { mem.record = JSON.parse(JSON.stringify(r)); return mem.record; }),
}));

// Controlled findings — set mem.findings per test; [] is the healthy deck.
vi.mock("../../../../lib/server/powerRanker.js", () => ({
  rankDeckPower: vi.fn(() => ({ landAssessment: { findings: mem.findings || [] } })),
}));

// Scripted model — mem.jab is what Tibalt says; null simulates a provider failure.
vi.mock("../../../../lib/server/modelProvider.js", () => ({
  callModelMessages: vi.fn(async () => (mem.jab === null
    ? { ok: false, data: { error: "model not pulled" } }
    : { ok: true, data: { content: [{ text: mem.jab }] } })),
}));

vi.mock("../../../../lib/server/profiles.js", () => ({ ensureMigrated: vi.fn() }));

import { GET, POST, PUT, PATCH } from "./route.js";

const CARDS = [{ name: "Island", qty: 40, section: "Mainboard" }];
const FINDING = { key: "draw-count-low", value: 3, text: "3 draw pieces is below the safe floor; the deck may run out of gas." };

function post(body) {
  return new Request("http://localhost/api/tibalt/interject", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
const saveEvent = (over = {}) => ({ event: { kind: "deck.saved" }, deckId: "d1", deckName: "Test Pile", cards: CARDS, ...over });

beforeEach(() => {
  mem.record = { enabled: true, state: emptyGremlinState(), log: [] };
  mem.findings = [FINDING];
  mem.jab = "Three draw spells. Ambitious, planning to win with the opening hand alone.";
});

describe("POST — the policy gates (real tibaltGremlin.js underneath)", () => {
  it("⭐ OMNATH'S MUTATION CHECK — a healthy deck (no finding) produces NO bubble, not a generic quip", async () => {
    mem.findings = [];
    const body = await (await POST(post(saveEvent()))).json();
    expect(body.bubble).toBeNull();
    expect(body.reason).toBe("no-finding");
    expect(mem.record.state.firedThisSession).toBe(0);   // and nothing was recorded
  });

  it("disabled profile → null bubble, reason disabled, and the ranker is never even consulted", async () => {
    mem.record.enabled = false;
    const body = await (await POST(post(saveEvent()))).json();
    expect(body).toEqual({ bubble: null, reason: "disabled" });
  });

  it("a vetoed surface (academy) refuses regardless of the finding", async () => {
    const body = await (await POST(post(saveEvent({ surface: "academy" })))).json();
    expect(body.bubble).toBeNull();
    expect(body.reason).toBe("vetoed-surface:academy");
  });

  it("a first deck / first import is never jabbed at (the briefs' law in code)", async () => {
    expect((await (await POST(post(saveEvent({ isFirstDeck: true })))).json()).reason).toBe("first-deck");
    expect((await (await POST(post(saveEvent({ isFirstImport: true })))).json()).reason).toBe("first-import");
  });

  it("a real jab → bubble returned, fire recorded, finding suppressed, log entry pending", async () => {
    const body = await (await POST(post(saveEvent()))).json();
    expect(body.bubble).toMatchObject({ jab: mem.jab, findingKey: "draw-count-low" });
    expect(mem.record.state.firedThisSession).toBe(1);
    expect(mem.record.state.suppressed["d1:draw-count-low"]).toBe(3);
    expect(mem.record.log).toHaveLength(1);
    expect(mem.record.log[0]).toMatchObject({ findingKey: "draw-count-low", reaction: "pending", trigger: "deck.saved" });
  });

  it("the session cap holds: a second save in the same session is refused", async () => {
    await POST(post(saveEvent()));
    const body = await (await POST(post(saveEvent({ deckId: "d2" })))).json();
    expect(body.bubble).toBeNull();
    expect(body.reason).toBe("session-cap");
  });

  it("suppression is per finding AND per value: same finding unchanged → quiet; stat changed → live again", async () => {
    await POST(post(saveEvent())); // jab recorded, suppressed at value 3
    // New session (cap reset) but the stat unchanged → suppressed-unchanged.
    mem.record.state.firedThisSession = 0;
    mem.record.state.lastFireAt = 0;
    const same = await (await POST(post(saveEvent()))).json();
    expect(same.reason).toBe("suppressed-unchanged");
    // The player added draw — the stat moved — the finding is live again.
    mem.findings = [{ ...FINDING, value: 5, text: "5 draw pieces is below the safe floor; the deck may run out of gas." }];
    const moved = await (await POST(post(saveEvent()))).json();
    expect(moved.bubble).not.toBeNull();
  });

  it("the model returning EMPTY is a valid 'no bubble' — and burns NO fire and NO suppression", async () => {
    mem.jab = "   ";
    const body = await (await POST(post(saveEvent()))).json();
    expect(body).toEqual({ bubble: null, reason: "model-declined" });
    expect(mem.record.state.firedThisSession).toBe(0);
    expect(mem.record.state.suppressed).toEqual({});
  });

  it("a provider failure degrades to silence with the real cause in the reason (never a fake jab)", async () => {
    mem.jab = null;
    const body = await (await POST(post(saveEvent()))).json();
    expect(body.bubble).toBeNull();
    expect(body.reason).toContain("model not pulled");
  });
});

describe("GET / PUT — the per-profile toggle", () => {
  it("round-trips the enabled flag", async () => {
    mem.record.enabled = false;
    expect((await (await GET()).json()).enabled).toBe(false);
    const put = new Request("http://localhost/api/tibalt/interject", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true }),
    });
    expect((await (await PUT(put)).json()).enabled).toBe(true);
    expect(mem.record.enabled).toBe(true);
  });
});

describe("PATCH — the reaction is data", () => {
  it("stamps the reaction on the log entry; 'ignored' advances the decay counter, a reaction resets it", async () => {
    await POST(post(saveEvent()));
    const fireId = mem.record.log[0].id;
    const patch = (reaction) => new Request("http://localhost/api/tibalt/interject", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fireId, reaction }),
    });
    await PATCH(patch("ignored"));
    expect(mem.record.log[0].reaction).toBe("ignored");
    expect(mem.record.state.consecutiveIgnores).toBe(1);
    await PATCH(patch("dismissed"));
    expect(mem.record.log[0].reaction).toBe("dismissed");
    expect(mem.record.state.consecutiveIgnores).toBe(0);   // any real reaction resets the decay
  });
});
