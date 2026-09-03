import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const MOBILE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_ORACLE_PATH = path.join(REPO_ROOT, "app/data/scryfall.oracle.local.json");
const DEFAULT_OUTPUT_ROOT = path.join(MOBILE_ROOT, "build/art");
const USER_AGENT = "OmnathMTGAssistant-ArtPack/0.1";

function normalizeUuid(value) {
  const id = String(value ?? "").toLocaleLowerCase("en-US");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)
    ? id
    : null;
}

function imageRecord(card, imageUris, faceIndex, faceName = null) {
  const oracleId = normalizeUuid(card.oracle_id);
  const sourceUrl = imageUris?.small;
  if (!oracleId || !sourceUrl) return null;
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" || parsed.hostname !== "cards.scryfall.io") {
    throw new Error(`Refusing non-Scryfall art source for ${card.name}`);
  }
  const suffix = faceIndex >= 0 ? `-${faceIndex}` : "";
  return Object.freeze({
    oracleId,
    faceIndex,
    name: faceName || card.name,
    sourceUrl,
    relativePath: `images/${oracleId.slice(0, 2)}/${oracleId}${suffix}.jpg`,
  });
}

export function planArtRecords(cards) {
  const records = [];
  const keys = new Set();
  for (const card of cards) {
    if (card.layout === "art_series") continue;
    const candidates = card.image_uris?.small
      ? [imageRecord(card, card.image_uris, -1)]
      : (card.card_faces ?? []).map((face, index) =>
          imageRecord(card, face.image_uris, index, face.name),
        );
    for (const record of candidates.filter(Boolean)) {
      const key = `${record.oracleId}:${record.faceIndex}`;
      if (keys.has(key)) throw new Error(`Duplicate art identity ${key}`);
      keys.add(key);
      records.push(record);
    }
  }
  return records;
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function isJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

async function download(record, outputRoot, fetcher) {
  const destination = path.join(outputRoot, record.relativePath);
  if (fs.existsSync(destination) && fs.statSync(destination).size > 3) {
    const bytes = fs.statSync(destination).size;
    return { ...record, bytes, sha256: await sha256File(destination) };
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetcher(record.sourceUrl, {
        headers: { "User-Agent": USER_AGENT, Accept: "image/jpeg,*/*;q=0.8" },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = Buffer.from(await response.arrayBuffer());
      if (!isJpeg(body)) throw new Error("response was not a JPEG");
      fs.writeFileSync(temporary, body);
      fs.renameSync(temporary, destination);
      return {
        ...record,
        bytes: body.length,
        sha256: crypto.createHash("sha256").update(body).digest("hex"),
      };
    } catch (error) {
      if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
      if (attempt === 3) throw new Error(`Unable to download ${record.name}: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`Unable to download ${record.name}`);
}

export async function buildArtPack({
  oraclePath = DEFAULT_ORACLE_PATH,
  outputRoot = DEFAULT_OUTPUT_ROOT,
  concurrency = 8,
  limit = Number.POSITIVE_INFINITY,
  fetcher = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  const envelope = JSON.parse(fs.readFileSync(oraclePath, "utf8"));
  if (!Array.isArray(envelope.cards) || envelope.count !== envelope.cards.length) {
    throw new Error("Oracle input must contain a count-matched cards array");
  }
  const planned = planArtRecords(envelope.cards).slice(0, limit);
  fs.mkdirSync(outputRoot, { recursive: true });
  const completed = new Array(planned.length);
  let cursor = 0;
  let finished = 0;
  async function worker() {
    while (cursor < planned.length) {
      const index = cursor;
      cursor += 1;
      completed[index] = await download(planned[index], outputRoot, fetcher);
      finished += 1;
      onProgress(finished, planned.length);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(24, concurrency)) }, worker));

  const oracleSha256 = await sha256File(oraclePath);
  const totalBytes = completed.reduce((sum, record) => sum + record.bytes, 0);
  const identity = crypto
    .createHash("sha256")
    .update(`${oracleSha256}\nsmall-jpeg\n${completed.length}\n${totalBytes}`)
    .digest("hex")
    .slice(0, 24);
  const manifest = {
    schemaVersion: 1,
    packId: identity,
    builtAt: new Date().toISOString(),
    profile: "scryfall-small-jpeg",
    source: { file: path.basename(oraclePath), sha256: oracleSha256 },
    images: completed.length,
    bytes: totalBytes,
    records: completed,
  };
  const manifestPath = path.join(outputRoot, "omnath-art.manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest)}\n`);
  return { ...manifest, outputRoot, manifestPath };
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const concurrency = Number(option("--concurrency", "8"));
  const limitText = option("--limit", "");
  let lastReported = 0;
  buildArtPack({
    concurrency,
    limit: limitText ? Number(limitText) : Number.POSITIVE_INFINITY,
    onProgress(done, total) {
      if (done === total || done - lastReported >= 250) {
        lastReported = done;
        process.stdout.write(`art ${done}/${total}\n`);
      }
    },
  })
    .then((result) => process.stdout.write(`${JSON.stringify({
      packId: result.packId,
      images: result.images,
      bytes: result.bytes,
      manifestPath: result.manifestPath,
    })}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error.message}\n`);
      process.exitCode = 1;
    });
}
