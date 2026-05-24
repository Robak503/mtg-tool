export const runtime = "nodejs";

import fs from "node:fs/promises";
import path from "node:path";

import { DECK_SEEDS } from "../../../data/deckSeeds";
import { buildSeedDeck, normalizeDeck } from "../../../lib/deckMemory";

const DATA_DIR = path.join(process.cwd(), "data");
const DECK_FILE = path.join(DATA_DIR, "decks.local.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

function mergeSeedDecks(decks, seedDecks) {
  const merged = [...decks];

  for (const seed of seedDecks) {
    const index = merged.findIndex(deck =>
      (deck.memory?.owner || "Colton") === seed.memory.owner && deck.name === seed.name
    );

    if (index === -1) merged.push(seed);
  }

  return merged;
}

async function readDeckFile() {
  try {
    const raw = await fs.readFile(DECK_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const decks = Array.isArray(parsed) ? parsed : parsed.decks;
    return Array.isArray(decks) ? decks.map(normalizeDeck) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeDeckFile(decks) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    decks: decks.map(normalizeDeck),
  };
  await fs.writeFile(DECK_FILE, JSON.stringify(payload, null, 2), "utf8");
  return payload.decks;
}

function backupName(reason = "manual") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const cleanReason = String(reason).replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "") || "manual";
  return `decks.local.${stamp}.${cleanReason}.json`;
}

async function createBackup(reason) {
  try {
    await fs.access(DECK_FILE);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, backupName(reason));
  await fs.copyFile(DECK_FILE, backupPath);
  return backupPath;
}

export async function GET() {
  try {
    const seedDecks = DECK_SEEDS.map(buildSeedDeck);
    const storedDecks = await readDeckFile();
    const decks = mergeSeedDecks(storedDecks, seedDecks);

    if (!storedDecks.length || decks.length !== storedDecks.length) {
      await writeDeckFile(decks);
    }

    return Response.json({ decks, path: DECK_FILE });
  } catch (error) {
    return Response.json({ error: error.message || "Could not load deck file." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.decks)) {
      return Response.json({ error: "Request body must include a decks array." }, { status: 400 });
    }

    const seedDecks = DECK_SEEDS.map(buildSeedDeck);
    const decks = mergeSeedDecks(body.decks.map(normalizeDeck), seedDecks);
    const backupPath = body.createBackup ? await createBackup(body.reason || "manual") : null;
    const saved = await writeDeckFile(decks);

    return Response.json({ decks: saved, path: DECK_FILE, backupPath });
  } catch (error) {
    return Response.json({ error: error.message || "Could not save deck file." }, { status: 500 });
  }
}
