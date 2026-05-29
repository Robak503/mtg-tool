export const runtime = "nodejs";

import {
  formatPowerRankingForPrompt,
  rankDeckPower,
} from "../../../lib/server/powerRanker.js";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { ready: false, error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  try {
    const result = rankDeckPower(body || {});
    return Response.json({
      ...result,
      formatted: result.formatted || formatPowerRankingForPrompt(result),
    });
  } catch (err) {
    console.error("[/api/power-rank] Error:", err);
    return Response.json(
      {
        ready: false,
        error: err?.message || "Power ranking failed.",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const result = rankDeckPower({ cardNames: [] });
    return Response.json({
      ready: true,
      version: 1,
      emptyDeckPowerLevel: result.powerLevel,
    });
  } catch (err) {
    return Response.json({
      ready: false,
      error: err?.message || "Power ranking unavailable.",
    }, { status: 500 });
  }
}
