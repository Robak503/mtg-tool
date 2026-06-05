/**
 * /api/art-crop — local cache proxy. Cache hit, SSRF guard, fetch+cache,
 * offline fallback. fetch is mocked so tests never touch the network.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir, originalCwd, route;

async function loadRoute() {
  vi.resetModules();
  return import("./route.js");
}

function req(query) {
  return new Request(`http://localhost/api/art-crop?${query}`);
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "art-crop-route-"));
  await fs.mkdir(path.join(tmpDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmpDir);
  route = await loadRoute();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

describe("module load", () => {
  it("imports without throwing", async () => {
    await expect(loadRoute()).resolves.toBeDefined();
  });
  it("exports GET", () => {
    expect(typeof route.GET).toBe("function");
  });
});

describe("validation", () => {
  it("400 when id is missing", async () => {
    const resp = await route.GET(req(""));
    expect(resp.status).toBe(400);
  });

  it("400 when id contains path-traversal characters", async () => {
    const resp = await route.GET(req("id=" + encodeURIComponent("../../etc/passwd")));
    expect(resp.status).toBe(400);
  });
});

describe("cache hit", () => {
  it("serves the cached file from disk with image content-type", async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03]); // jpeg-ish
    await fs.mkdir(path.join(tmpDir, "data", "art-crops"), { recursive: true });
    await fs.writeFile(path.join(tmpDir, "data", "art-crops", "abc-123.jpg"), bytes);

    const fresh = await loadRoute();
    const resp = await fresh.GET(req("id=abc-123"));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("Content-Type")).toBe("image/jpeg");
    const out = Buffer.from(await resp.arrayBuffer());
    expect(out.equals(bytes)).toBe(true);
  });
});

describe("SSRF guard", () => {
  it("404s when the only source URL is a non-scryfall host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resp = await route.GET(req("id=evil&url=" + encodeURIComponent("https://evil.example.com/x.jpg")));
    expect(resp.status).toBe(404);
    // Never attempted the fetch — the guard rejected the host first.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects http (non-https) scryfall URLs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const resp = await route.GET(req("id=x&url=" + encodeURIComponent("http://cards.scryfall.io/art_crop/x.jpg")));
    expect(resp.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetch + cache", () => {
  it("fetches a scryfall URL, caches it, and serves the bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg", "content-length": String(bytes.length) }),
      arrayBuffer: async () => bytes.buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const fresh = await loadRoute();
    const url = "https://cards.scryfall.io/art_crop/front/0/0/abc.jpg";
    const resp = await fresh.GET(req("id=fetch-me&url=" + encodeURIComponent(url)));

    expect(resp.status).toBe(200);
    // Now called with an abort signal for the timeout guard.
    expect(fetchMock).toHaveBeenCalledWith(url, expect.objectContaining({ signal: expect.anything() }));
    const out = Buffer.from(await resp.arrayBuffer());
    expect(out.equals(Buffer.from(bytes))).toBe(true);

    // Written to cache for next time
    const cached = await fs.readFile(path.join(tmpDir, "data", "art-crops", "fetch-me.jpg"));
    expect(cached.equals(Buffer.from(bytes))).toBe(true);
  });

  it("404s when the upstream fetch fails (offline)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await route.GET(req("id=offline&url=" + encodeURIComponent("https://cards.scryfall.io/x.jpg")));
    expect(resp.status).toBe(404);
  });

  it("404s when upstream returns a non-OK status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const resp = await route.GET(req("id=err&url=" + encodeURIComponent("https://cards.scryfall.io/x.jpg")));
    expect(resp.status).toBe(404);
  });
});

describe("upstream hardening", () => {
  const scryUrl = "https://cards.scryfall.io/art_crop/front/0/0/x.jpg";

  it("404s (and does not cache) when upstream returns a non-image content-type", async () => {
    const html = new Uint8Array([60, 33, 100]); // "<!d..." — an HTML error page
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
      arrayBuffer: async () => html.buffer,
    }));
    const fresh = await loadRoute();
    const resp = await fresh.GET(req("id=htmlpage&url=" + encodeURIComponent(scryUrl)));
    expect(resp.status).toBe(404);
    // Nothing written to the cache.
    await expect(fs.readFile(path.join(tmpDir, "data", "art-crops", "htmlpage.jpg"))).rejects.toThrow();
  });

  it("404s when the declared Content-Length exceeds the cap (before buffering)", async () => {
    const arrayBuffer = vi.fn(async () => new Uint8Array([1, 2]).buffer);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg", "content-length": String(20 * 1024 * 1024) }),
      arrayBuffer,
    }));
    const fresh = await loadRoute();
    const resp = await fresh.GET(req("id=huge&url=" + encodeURIComponent(scryUrl)));
    expect(resp.status).toBe(404);
    expect(arrayBuffer).not.toHaveBeenCalled(); // rejected before reading the body
  });

  it("404s when the actual body exceeds the cap (Content-Length absent/lied)", async () => {
    const big = new Uint8Array(9 * 1024 * 1024); // 9 MB > 8 MB cap
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }), // no content-length
      arrayBuffer: async () => big.buffer,
    }));
    const fresh = await loadRoute();
    const resp = await fresh.GET(req("id=lying&url=" + encodeURIComponent(scryUrl)));
    expect(resp.status).toBe(404);
    await expect(fs.readFile(path.join(tmpDir, "data", "art-crops", "lying.jpg"))).rejects.toThrow();
  });

  it("passes an abort signal to fetch and 404s when it aborts (timeout path)", async () => {
    // The route wraps fetch in an AbortController + setTimeout; when that fires,
    // fetch rejects with an AbortError. Assert the signal is wired and an abort
    // degrades to the placeholder 404 (rather than asserting on the timer clock,
    // which is brittle under fake timers + real module I/O).
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);
    const fresh = await loadRoute();
    const resp = await fresh.GET(req("id=timedout&url=" + encodeURIComponent(scryUrl)));
    expect(resp.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledWith(scryUrl, expect.objectContaining({ signal: expect.anything() }));
  });
});

describe("resolve by name", () => {
  it("404s for a name with no resolvable printing (index missing)", async () => {
    // tmpDir has no printings-index.json, so lookupByName throws and the name
    // can't resolve to a cache id.
    const resp = await route.GET(req("name=" + encodeURIComponent("Sol Ring")));
    expect(resp.status).toBe(404);
  });

  it("resolves art by name via the printings index, caching under the printing id", async () => {
    vi.resetModules();
    const artUrl = "https://cards.scryfall.io/art_crop/front/0/0/name.jpg";
    vi.doMock("../../../lib/server/printingIndex.js", () => ({
      lookupById: cardId => (cardId === "name-resolved-id" ? { id: cardId, artCropUrl: artUrl } : null),
      lookupByName: n => (n === "Sol Ring" ? [{ id: "name-resolved-id", artCropUrl: artUrl }] : []),
    }));
    const bytes = new Uint8Array([9, 8, 7, 6]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg", "content-length": String(bytes.length) }),
      arrayBuffer: async () => bytes.buffer,
    }));

    const fresh = await import("./route.js");
    const resp = await fresh.GET(req("name=" + encodeURIComponent("Sol Ring")));
    expect(resp.status).toBe(200);
    const cached = await fs.readFile(path.join(tmpDir, "data", "art-crops", "name-resolved-id.jpg"));
    expect(cached.equals(Buffer.from(bytes))).toBe(true);

    vi.doUnmock("../../../lib/server/printingIndex.js");
  });
});
