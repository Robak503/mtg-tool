export const runtime = "nodejs";

import { callModelMessages } from "../../../lib/server/modelProvider";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  if (!Array.isArray(body.messages)) {
    return Response.json({ error: "Request body must include a messages array." }, { status: 400 });
  }

  const result = await callModelMessages(body);
  return Response.json(result.data, { status: result.status });
}
