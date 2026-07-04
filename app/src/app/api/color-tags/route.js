/**
 * /api/color-tags — durable per-profile color-tag definitions (E4).
 *
 * GET → { tags: Tag[] | null }   null = this profile has never saved (client migrates its local set up)
 * PUT { tags: Tag[] } → { ok, count }   replace the active profile's whole tag set (sanitized server-side)
 *
 * Scoped to the active profile via profilePath() — same home as the per-card
 * colorTagId assignments that reference these definitions.
 */

export const runtime = "nodejs";

import { readColorTags, writeColorTags } from "../../../lib/server/colorTagStore.js";

export async function GET() {
  return Response.json({ tags: await readColorTags() });
}

export async function PUT(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  if (!Array.isArray(body?.tags)) {
    return Response.json({ error: "tags must be an array." }, { status: 400 });
  }
  let count;
  try {
    count = await writeColorTags(body.tags);
  } catch (e) {
    return Response.json({ error: e.message || "Could not save color tags." }, { status: 500 });
  }
  return Response.json({ ok: true, count });
}
