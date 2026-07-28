/**
 * docketRag.test.js — the RAG enricher must never become a dependency.
 *
 * Omnath's own acceptance test, quoted from the seam sketch: "point docket.json at a dead port and the
 * full agent path must still answer, degraded:true, with local hits, inside the normal response time. If
 * that test hangs or throws, the enricher has become a dependency and the whole design has failed."
 *
 * That is the test this file is built around. Everything else here is supporting it.
 *
 * The reason it matters is documented, not hypothetical: two silent box outages in six days, both with the
 * service reporting healthy — a BSOD that left every scheduled task unrun, and a live `tailscaled.exe`
 * with a flat-dead tailnet. SERVICE STATE IS NOT EVIDENCE, so the health check is a real round-trip and
 * the breaker exists to stop a dead box costing a timeout per message.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { docketRecall, readDocketConfig, AGENT_CORPORA, _resetDocketStateForTests } from "./docketRag.js";

const CFG = { url: "http://127.0.0.1:9", apiKey: "", budgetMs: 50, personalCorpora: false };
const LOCAL = [{ content: "CR 509.1a", source: "cr", score: 1 }];

beforeEach(() => _resetDocketStateForTests());

/** A fetch that never resolves — the "slow box" case, which must degrade exactly like a dead one. */
const hangingFetch = () => new Promise(() => {});
/** A fetch that rejects immediately — the "dead port" case. */
const deadFetch = () => Promise.reject(new Error("ECONNREFUSED"));
const okFetch = (hits) => (url) =>
  Promise.resolve(url.includes("ready")
    ? { ok: true }
    : { ok: true, json: () => Promise.resolve({ hits }) });

describe("OMNATH'S ACCEPTANCE TEST — a dead box must not break the agent path", () => {
  it("dead port: answers, degraded:true, local hits intact, no throw", async () => {
    const r = await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: CFG, fetchImpl: deadFetch });
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe("unreachable");
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0].origin).toBe("local");
  });

  it("SLOW box degrades exactly like a dead one — it never becomes latency the user feels", async () => {
    // A hanging fetch would block forever if the budget were not enforced. The assertion is that this
    // resolves at all; vitest's own timeout is the backstop if it does not.
    const t0 = Date.now();
    const r = await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: CFG, fetchImpl: hangingFetch });
    expect(r.degraded).toBe(true);
    expect(r.hits).toHaveLength(1);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it("a garbage response degrades instead of throwing", async () => {
    const bad = (url) => Promise.resolve(url.includes("ready") ? { ok: true } : { ok: false, status: 500 });
    const r = await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: CFG, fetchImpl: bad });
    expect(r.degraded).toBe(true);
    expect(r.reason).toMatch(/^error:http-500/);
    expect(r.hits).toHaveLength(1);
  });
});

describe("ABSENT CONFIG IS OFF — which is why shipping this changes nothing", () => {
  it("no config: not degraded, reason 'off', local hits returned untouched", async () => {
    const r = await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: null });
    expect(r.degraded).toBe(false);
    expect(r.reason).toBe("off");
    expect(r.hits).toHaveLength(1);
  });

  it("readDocketConfig returns null when the file is absent", async () => {
    // The default state for every user who has no box, including Colton until he writes one.
    expect(await readDocketConfig()).toBeNull();
  });
});

describe("THE HARD RULE — the Arbiter never gets retrieval", () => {
  it("arbiter has no corpus slice at all", () => {
    // A deterministic instrument: injected prose would make the same board state answer differently on two
    // runs. It looks like the most natural fit for RAG and is the one agent that must never have it.
    expect(AGENT_CORPORA.arbiter).toBeUndefined();
  });

  it("and it never reaches the network, even with a live config and a working box", async () => {
    const spy = vi.fn(okFetch([{ content: "x" }]));
    const r = await docketRecall({ agent: "arbiter", query: "q", local: LOCAL, config: CFG, fetchImpl: spy });
    expect(spy).not.toHaveBeenCalled();
    expect(r.degraded).toBe(false);
    expect(r.hits).toHaveLength(1);
  });

  it("Teferi and Digby likewise — absence of a slice means no query", async () => {
    for (const agent of ["teferi", "keeper"]) {
      const spy = vi.fn(okFetch([]));
      await docketRecall({ agent, query: "q", local: LOCAL, config: CFG, fetchImpl: spy });
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe("THE SENSITIVE TIER — MemoryChunk needs the flag AND the owner", () => {
  async function classesQueried(opts) {
    let sent = null;
    const spy = (url, init) => {
      if (url.includes("ready")) return Promise.resolve({ ok: true });
      sent = JSON.parse(init.body).classes;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ hits: [] }) });
    };
    await docketRecall({ agent: "omnath", query: "q", local: LOCAL, fetchImpl: spy, ...opts });
    return sent;
  }

  it("withheld when the flag is off, even for the owner", async () => {
    const sent = await classesQueried({ config: { ...CFG, personalCorpora: false }, isOwner: true });
    expect(sent).not.toContain("MemoryChunk");
    expect(sent).toContain("RulesChunk");      // the rest of the slice still runs
  });

  it("withheld when the profile is not the owner, even with the flag on", async () => {
    const sent = await classesQueried({ config: { ...CFG, personalCorpora: true }, isOwner: false });
    expect(sent).not.toContain("MemoryChunk");
  });

  it("queried ONLY with both", async () => {
    const sent = await classesQueried({ config: { ...CFG, personalCorpora: true }, isOwner: true });
    expect(sent).toContain("MemoryChunk");
  });

  it("Vihaan's slice is text-only — prices never come from RAG", () => {
    expect(AGENT_CORPORA.vihaan).toEqual(["CardChunk"]);
  });
});

describe("THE BREAKER — a dead box costs one timeout an hour, not one per message", () => {
  it("opens after 3 consecutive failures and then short-circuits without fetching", async () => {
    const spy = vi.fn(deadFetch);
    for (let i = 0; i < 3; i++) {
      await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: CFG, fetchImpl: spy });
    }
    const callsBefore = spy.mock.calls.length;
    const r = await docketRecall({ agent: "jace", query: "q", local: LOCAL, config: CFG, fetchImpl: spy });
    expect(r.degraded).toBe(true);
    expect(r.reason).toBe("unreachable");
    expect(spy.mock.calls.length).toBe(callsBefore);   // no new network call at all
  });

  it("a success merges box hits and marks their origin", async () => {
    const r = await docketRecall({
      agent: "jace", query: "q", local: LOCAL, config: CFG, k: 6,
      fetchImpl: okFetch([{ content: "from the box", source: "RulesChunk", score: 0.9 }]),
    });
    expect(r.degraded).toBe(false);
    expect(r.reason).toBeNull();
    expect(r.hits.map((h) => h.origin)).toEqual(["local", "box"]);
  });
});
