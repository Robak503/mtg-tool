/**
 * /api/records — the completed-game archive (P2 v1).
 *
 *   GET            → { records: [meta rows, newest first] } (log tails omitted)
 *   GET ?id=<id>   → { record } — one full record including its log tail
 *
 * Read-only over profilePath("learn-records.json"); records are written by the
 * Academy's terminal step/choose handlers. Fully local.
 */

export const runtime = "nodejs";

import { listGameRecords } from "../../../lib/server/gameRecordsStore.js";

export async function GET(request) {
  try {
    const id = new URL(request.url).searchParams.get("id");
    const records = await listGameRecords();
    if (id) {
      const record = records.find((r) => r?.id === id) || null;
      if (!record) return Response.json({ error: "No such record." }, { status: 404 });
      return Response.json({ record });
    }
    return Response.json({
      records: records.map(({ logTail, ...meta }) => ({ ...meta, logLines: logTail?.length ?? 0 })),
    });
  } catch (error) {
    return Response.json({ error: error.message || "Failed to read records." }, { status: 500 });
  }
}
