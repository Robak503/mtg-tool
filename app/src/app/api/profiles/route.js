export const runtime = "nodejs";

import { listProfiles, createProfile } from "../../../lib/server/profiles";

// GET /api/profiles — list profiles + the active one. Runs the one-time
// migration on first call (so the launch picker always sees a populated set).
export async function GET() {
  try {
    return Response.json(listProfiles());
  } catch (error) {
    return Response.json({ error: error.message || "Failed to load profiles" }, { status: 500 });
  }
}

// POST /api/profiles { name } — create a new (empty) profile.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const name = (body?.name || "").toString();
    if (!name.trim()) return Response.json({ error: "Profile name is required" }, { status: 400 });
    return Response.json({ profile: createProfile(name) });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to create profile" }, { status: 500 });
  }
}
