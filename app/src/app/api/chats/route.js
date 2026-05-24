export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CHAT_FILE = path.join(DATA_DIR, "chats.local.json");
const AGENT_KEYS = ["jace", "karn", "tibalt", "arbiter"];

function normalizeMessage(message) {
  return {
    role: message?.role === "assistant" ? "assistant" : "user",
    content: String(message?.content || ""),
    ...(message?.arbiterTrace ? { arbiterTrace: String(message.arbiterTrace) } : {}),
  };
}

function normalizeHistories(histories = {}) {
  const normalized = {};
  for (const key of AGENT_KEYS) {
    normalized[key] = Array.isArray(histories[key])
      ? histories[key].map(normalizeMessage).slice(-200)
      : [];
  }
  return normalized;
}

function normalizeLocks(locks = {}) {
  const normalized = {};
  for (const key of AGENT_KEYS) {
    normalized[key] = locks[key] || null;
  }
  return normalized;
}

async function readChatFile() {
  try {
    const raw = await fs.readFile(CHAT_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return {
      histories: normalizeHistories(parsed.histories || parsed),
      locks: normalizeLocks(parsed.locks || {}),
    };
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeChatFile({ histories, locks }) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    histories: normalizeHistories(histories),
    locks: normalizeLocks(locks),
  };
  await fs.writeFile(CHAT_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export async function GET() {
  try {
    const state = await readChatFile();
    return Response.json({
      histories: state?.histories || null,
      locks: state?.locks || null,
      exists: Boolean(state),
      path: CHAT_FILE,
    });
  } catch (error) {
    return Response.json({ error: error.message || "Could not load chat file." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const saved = await writeChatFile({
      histories: body.histories || body,
      locks: body.locks || {},
    });
    return Response.json({ ...saved, path: CHAT_FILE });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save chat file." }, { status: 500 });
  }
}
