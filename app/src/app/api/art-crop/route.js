/**
 * /api/art-crop — local-first art crop proxy + cache.
 *
 * The Collection grid points <img> at this route instead of the Scryfall
 * CDN directly. First view of a card fetches the art from Scryfall and
 * writes it to %APPDATA%\com.colton.mtg-tool\data\art-crops\<id>.jpg.
 * Every subsequent view (including with no internet) is served straight
 * from disk. This honors the local-first mandate: after a card has been
 * seen once, it never needs the network again.
 *
 * Query params:
 *   id   — scryfallId (used as the cache key; sanitized to [A-Za-z0-9-])
 *   name — optional card name; when no id is given, resolved against the
 *          printings index to the canonical scryfallId (cache key) + its
 *          trusted art_crop URL. Lets callers that only know a card name
 *          (chat mentions, the active commander) request art without first
 *          doing their own id lookup.
 *   url  — optional Scryfall CDN URL (fallback source when the printing
 *          index hasn't been built; SSRF-guarded to scryfall hosts)
 *
 * Source URL resolution: the bundled printing index is authoritative
 * (its URLs are trusted). The client-supplied url is only used when the
 * index lookup misses, and only if it passes the scryfall-host guard.
 *
 * When the art can't be obtained (offline + uncached), returns 404 so
 * the grid falls back to its card-name placeholder.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../lib/server/paths.js";
import { lookupById, lookupByName } from "../../../lib/server/printingIndex.js";

const IMG_HEADERS = {
  "Content-Type": "image/jpeg",
  // Immutable: a given scryfallId's art never changes.
  "Cache-Control": "public, max-age=31536000, immutable",
};

// Upstream-fetch safety rails. The source URL is already host-guarded to
// Scryfall, but a slow/huge/non-image response (CDN hiccup, redirect to an
// error page) must not hang the request or poison the on-disk cache.
const FETCH_TIMEOUT_MS = 10_000;
// art_crop JPEGs are ~50-200 KB; 8 MB is a generous ceiling that still bounds
// memory against an upstream that lies about (or omits) Content-Length.
const MAX_ART_BYTES = 8 * 1024 * 1024;

function safeCacheName(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9-]+$/.test(id)) return null;
  return `${id}.jpg`;
}

function isAllowedScryfallHost(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "cards.scryfall.io" || host.endsWith(".scryfall.io") || host.endsWith(".scryfall.com");
  } catch {
    return false;
  }
}

function resolveSourceUrl(id, clientUrl) {
  // Authoritative: the bundled printing index.
  try {
    const printing = lookupById(id);
    if (printing?.artCropUrl && isAllowedScryfallHost(printing.artCropUrl)) {
      return printing.artCropUrl;
    }
  } catch {
    // Index not built (dev / pre-sync). Fall back to the client URL.
  }
  if (clientUrl && isAllowedScryfallHost(clientUrl)) return clientUrl;
  return null;
}

export async function GET(request) {
  let id, clientUrl, name;
  try {
    const url = new URL(request.url);
    id = url.searchParams.get("id");
    clientUrl = url.searchParams.get("url");
    name = url.searchParams.get("name");
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  // Resolve by name when no explicit id is given: the printings index yields
  // the canonical scryfallId (our cache key) and a trusted art_crop URL.
  if (!id && name) {
    try {
      const printing = lookupByName(name)[0];
      if (printing?.id) {
        id = printing.id;
        if (!clientUrl && printing.artCropUrl) clientUrl = printing.artCropUrl;
      }
    } catch (err) {
      // A missing index (ENOENT) is the expected dev / pre-sync state — fall
      // through silently and let the name resolve to a 404 below. Anything else
      // (malformed index JSON, wrong data shape, a bug in lookupByName) is
      // unexpected: surface it to server.err.log rather than swallow it, so the
      // misleading "no printing found" 404 doesn't hide a real failure (CLAUDE.md §8).
      if (err?.code !== "ENOENT") {
        console.error("[art-crop] lookupByName failed for name:", name, err);
      }
    }
  }

  const cacheName = safeCacheName(id);
  if (!cacheName) {
    // A name we couldn't resolve is a 404 (not found); no id and no name is a
    // 400 (nothing to act on).
    if (name && !id) {
      return Response.json({ error: `No printing found for name: ${name}` }, { status: 404 });
    }
    return Response.json({ error: "id is required and must be alphanumeric/hyphen" }, { status: 400 });
  }

  const cachePath = dataPath("art-crops", cacheName);

  // 1. Cache hit — serve from disk (works offline).
  try {
    const cached = await fs.readFile(cachePath);
    return new Response(cached, { headers: IMG_HEADERS });
  } catch (error) {
    if (error.code !== "ENOENT") {
      return Response.json({ error: error.message }, { status: 500 });
    }
    // fall through to fetch
  }

  // 2. Cache miss — resolve a trusted source URL and fetch it.
  const sourceUrl = resolveSourceUrl(id, clientUrl);
  if (!sourceUrl) {
    return Response.json({ error: "No trusted art source for this id" }, { status: 404 });
  }

  let bytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Scryfall's CDN 400s requests with no User-Agent (Node fetch sends none).
    const resp = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "MTGTool (local-first Commander assistant)", "Accept": "image/*" },
    });
    if (!resp.ok) {
      return Response.json({ error: `Upstream ${resp.status}` }, { status: 404 });
    }
    // Require an image content-type — a redirect to an HTML error/login page or
    // any non-image body must never be cached as art.
    const contentType = (resp.headers?.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return Response.json({ error: "Upstream did not return an image" }, { status: 404 });
    }
    // Reject a declared-oversized body before buffering it, then re-check after
    // reading in case Content-Length was absent or lied.
    const declaredLen = Number(resp.headers?.get("content-length"));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_ART_BYTES) {
      return Response.json({ error: "Upstream art too large" }, { status: 404 });
    }
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength > MAX_ART_BYTES) {
      return Response.json({ error: "Upstream art too large" }, { status: 404 });
    }
    bytes = Buffer.from(arrayBuf);
  } catch {
    // Offline, request timeout (abort), or network error. The grid shows its
    // placeholder.
    return Response.json({ error: "Art unavailable (offline?)" }, { status: 404 });
  } finally {
    clearTimeout(timer);
  }

  // 3. Write to cache atomically (temp + rename), best-effort.
  try {
    await fs.mkdir(dataPath("art-crops"), { recursive: true });
    const tmp = `${cachePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, cachePath);
  } catch {
    // If caching fails we still serve the bytes we fetched.
  }

  return new Response(bytes, { headers: IMG_HEADERS });
}
