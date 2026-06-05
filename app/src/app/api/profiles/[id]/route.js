export const runtime = "nodejs";

import { renameProfile, deleteProfile } from "../../../../lib/server/profiles";

// Next.js 15: params is a Promise in route handlers.
async function getId(ctx) {
  const raw = ctx?.params;
  const params = raw && typeof raw.then === "function" ? await raw : raw;
  return params?.id;
}

// PATCH /api/profiles/:id { name } — rename (moves no files; name lives in the registry).
export async function PATCH(request, ctx) {
  try {
    const id = await getId(ctx);
    const body = await request.json().catch(() => ({}));
    const name = (body?.name || "").toString();
    if (!name.trim()) return Response.json({ error: "Profile name is required" }, { status: 400 });
    return Response.json({ profile: renameProfile(id, name) });
  } catch (error) {
    const status = error.code === "UNKNOWN_PROFILE" ? 404 : 500;
    return Response.json({ error: error.message || "Failed to rename profile" }, { status });
  }
}

// DELETE /api/profiles/:id — remove the profile and its data folder. Blocked
// when it's the last remaining profile.
export async function DELETE(request, ctx) {
  try {
    const id = await getId(ctx);
    return Response.json(deleteProfile(id));
  } catch (error) {
    const status = error.code === "LAST_PROFILE" ? 400 : error.code === "UNKNOWN_PROFILE" ? 404 : 500;
    return Response.json({ error: error.message || "Failed to delete profile" }, { status });
  }
}
