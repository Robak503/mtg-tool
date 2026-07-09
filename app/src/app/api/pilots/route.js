/**
 * /api/pilots — lists the persona pilot modules available for the Sim Center's pilot selector. Personas are
 * .mjs files in the writable pilotsDir() (%APPDATA%/com.colton.mtg-tool/pilots/), dropped there by Omnath so
 * they can be injected into a self-play batch without a rebuild. GET returns { pilots: [<filename>, …] }; the
 * SimCenter populates its dropdown, and /api/self-play POST resolves the chosen filename server-side.
 */

export const runtime = "nodejs";

import { listPilots } from "../../../lib/server/pilotLoader.js";

export async function GET() {
  try {
    return Response.json({ pilots: await listPilots() });
  } catch (error) {
    return Response.json({ pilots: [], error: error?.message || "Could not list pilots." }, { status: 500 });
  }
}
