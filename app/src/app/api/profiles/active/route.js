export const runtime = "nodejs";

import { setActiveProfile } from "../../../../lib/server/profiles";

// PUT /api/profiles/active { id } — switch the active profile. The client
// reloads afterward so every subsequent fetch resolves to the new namespace.
export async function PUT(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = (body?.id || "").toString();
    if (!id) return Response.json({ error: "Profile id is required" }, { status: 400 });
    return Response.json(setActiveProfile(id));
  } catch (error) {
    const status = error.code === "UNKNOWN_PROFILE" ? 404 : 500;
    return Response.json({ error: error.message || "Failed to switch profile" }, { status });
  }
}
