/**
 * /api/card-image — local-first FULL card image proxy + cache.
 *
 * Like /api/art-crop, but serves the whole Magic card (Scryfall `normal`: frame,
 * border, name, type line, text box, P/T) instead of just the art crop. The
 * Academy board points <img> here so cards look like real Magic cards.
 *
 * Source: the bundled printing index gives a trusted `artCropUrl`; Scryfall's CDN
 * uses one path per size, so we derive the `normal` URL by swapping the
 * `/art_crop/` path segment for `/normal/` (same printing, full-card variant).
 * First view fetches + caches to %APPDATA%\…\data\card-images\<id>.jpg; every
 * later view (incl. offline) is served from disk. 404 when offline + uncached so
 * the caller falls back to a placeholder.
 *
 * Query params: `id` (scryfallId cache key) or `name` (resolved via the index).
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";

import { dataPath } from "../../../lib/server/paths.js";
import { lookupById, lookupByName } from "../../../lib/server/printingIndex.js";

const IMG_HEADERS = {
  "Content-Type": "image/jpeg",
  "Cache-Control": "public, max-age=31536000, immutable",
};

const FETCH_TIMEOUT_MS = 10_000;
// Full `normal` JPEGs are ~100-400 KB; 8 MB is a generous ceiling.
const MAX_IMG_BYTES = 8 * 1024 * 1024;

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

/** Derive the full-card `normal` URL from a trusted `art_crop` URL (same printing). */
function toNormalUrl(artCropUrl) {
  if (!artCropUrl || !isAllowedScryfallHost(artCropUrl)) return null;
  if (!artCropUrl.includes("/art_crop/")) return null;
  const normal = artCropUrl.replace("/art_crop/", "/normal/");
  return isAllowedScryfallHost(normal) ? normal : null;
}

function resolveSourceUrl(id, clientUrl) {
  try {
    const printing = lookupById(id);
    const normal = toNormalUrl(printing?.artCropUrl);
    if (normal) return normal;
  } catch {
    // index not built — fall through to the client URL
  }
  return toNormalUrl(clientUrl);
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

  if (!id && name) {
    try {
      const printing = lookupByName(name)[0];
      if (printing?.id) {
        id = printing.id;
        if (!clientUrl && printing.artCropUrl) clientUrl = printing.artCropUrl;
      }
    } catch (err) {
      if (err?.code !== "ENOENT") console.error("[card-image] lookupByName failed for name:", name, err);
    }
  }

  const cacheName = safeCacheName(id);
  if (!cacheName) {
    if (name && !id) return Response.json({ error: `No printing found for name: ${name}` }, { status: 404 });
    return Response.json({ error: "id is required and must be alphanumeric/hyphen" }, { status: 400 });
  }

  const cachePath = dataPath("card-images", cacheName);

  // 1. Cache hit.
  try {
    const cached = await fs.readFile(cachePath);
    return new Response(cached, { headers: IMG_HEADERS });
  } catch (error) {
    if (error.code !== "ENOENT") return Response.json({ error: error.message }, { status: 500 });
  }

  // 2. Cache miss — fetch the trusted normal URL.
  const sourceUrl = resolveSourceUrl(id, clientUrl);
  if (!sourceUrl) return Response.json({ error: "No trusted image source for this id" }, { status: 404 });

  let bytes;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // Scryfall's CDN 400s requests with no User-Agent (Node fetch sends none).
    const resp = await fetch(sourceUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "MTGTool (local-first Commander assistant)", "Accept": "image/*" },
    });
    if (!resp.ok) return Response.json({ error: `Upstream ${resp.status}` }, { status: 404 });
    const contentType = (resp.headers?.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) return Response.json({ error: "Upstream did not return an image" }, { status: 404 });
    const declaredLen = Number(resp.headers?.get("content-length"));
    if (Number.isFinite(declaredLen) && declaredLen > MAX_IMG_BYTES) return Response.json({ error: "Upstream image too large" }, { status: 404 });
    const arrayBuf = await resp.arrayBuffer();
    if (arrayBuf.byteLength > MAX_IMG_BYTES) return Response.json({ error: "Upstream image too large" }, { status: 404 });
    bytes = Buffer.from(arrayBuf);
  } catch {
    return Response.json({ error: "Image unavailable (offline?)" }, { status: 404 });
  } finally {
    clearTimeout(timer);
  }

  // 3. Cache atomically (best-effort).
  try {
    await fs.mkdir(dataPath("card-images"), { recursive: true });
    const tmp = `${cachePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, bytes);
    await fs.rename(tmp, cachePath);
  } catch {
    // serve the bytes even if caching failed
  }

  return new Response(bytes, { headers: IMG_HEADERS });
}
