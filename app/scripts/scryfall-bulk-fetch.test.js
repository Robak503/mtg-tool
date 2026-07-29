/**
 * scryfall-bulk-fetch.test.js — the guard on the sync seam that killed release v0.149.13.
 *
 * ⛔ WHAT HAPPENED. Scryfall renamed `download_uri` → `jsonl_download_uri` and switched the
 * payload to gzipped JSONL. sync-scryfall-bulk.cjs looped the four wanted types and did
 * `if (!item.download_uri) continue;`, so it downloaded ZERO files, wrote a manifest with
 * `files: []`, and exited 0. The CI step went green in one second; the release died two steps
 * later on a missing oracle_cards.json and published nothing.
 *
 * ⭐ SO THE TESTS THAT MATTER HERE ARE THE REFUSALS, not the happy path: a URL-less item must
 * THROW rather than be skipped, and a snapshot that decodes to nothing must never be installed
 * over good data. The happy path is covered too — by an actual gzipped-JSONL HTTP server on
 * loopback, because a "we handle gzip now" claim verified only by unit-testing the parser is
 * exactly the hollow gate this project keeps re-learning. Offline, deterministic, no Scryfall.
 */
import http from "node:http";
import { createRequire } from "node:module";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  bulkDownloadUrl,
  downloadBulkFile,
  fetchBulkRecords,
  isGzipped,
  isJsonl,
  jsonlToJsonArray,
  missingUrlError,
} = require("./scryfall-bulk-fetch.cjs");

// ── the JSONL fixtures. Multi-byte names on purpose (see the chunk-boundary test).
const CARDS = [
  { name: "Æther Vial", oracle_text: "Charge." },
  { name: "Lim-Dûl's Vault", oracle_text: "Look at the top five cards." },
  { name: "Jötun Grunt", oracle_text: "Cumulative upkeep." },
];
const JSONL = CARDS.map((c) => JSON.stringify(c)).join("\n");

/** A payload comfortably over MIN_PLAUSIBLE_BYTES once expanded, for the end-to-end path. */
const BIG_RECORDS = Array.from({ length: 200 }, (_, i) => ({
  name: `Card ${i} — Æther`,
  oracle_text: "x".repeat(40),
}));
const BIG_JSONL = BIG_RECORDS.map((c) => JSON.stringify(c)).join("\n");

async function runTransform(chunks) {
  const counted = { records: 0 };
  const stream = jsonlToJsonArray(counted);
  const out = [];
  const done = new Promise((resolve, reject) => {
    stream.on("data", (d) => out.push(Buffer.from(d)));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  for (const chunk of chunks) stream.write(chunk);
  stream.end();
  await done;
  return { text: Buffer.concat(out).toString("utf8"), records: counted.records };
}

describe("bulkDownloadUrl — the field that moved", () => {
  it("⭐ prefers the CURRENT field", () => {
    expect(bulkDownloadUrl({ jsonl_download_uri: "https://x/a.jsonl.gz", download_uri: "https://x/a.json" }))
      .toBe("https://x/a.jsonl.gz");
  });

  it("still accepts the LEGACY field, so an upstream rollback needs no code change", () => {
    expect(bulkDownloadUrl({ download_uri: "https://x/a.json" })).toBe("https://x/a.json");
  });

  it("⛔ returns \"\" when neither field is present — the v0.149.13 shape", () => {
    // This is the exact object Scryfall served on 2026-07-29 minus the new field: the old code
    // saw this and `continue`d, turning it into a green no-op sync.
    expect(bulkDownloadUrl({ object: "bulk_data", type: "oracle_cards", uri: "https://api/x", compressed_size: 24357783 })).toBe("");
    expect(bulkDownloadUrl({})).toBe("");
    expect(bulkDownloadUrl(null)).toBe("");
    expect(bulkDownloadUrl({ jsonl_download_uri: { nested: true } })).toBe("");
  });

  it("the error names the fields it looked for AND the fields it found", () => {
    const message = missingUrlError({ type: "oracle_cards", compressed_size: 1 }).message;
    expect(message).toContain("jsonl_download_uri");
    expect(message).toContain("oracle_cards");
    expect(message).toContain("compressed_size");
  });
});

describe("URL classification", () => {
  it("recognises the new gzipped-JSONL shape", () => {
    expect(isGzipped("https://data.scryfall.io/oracle-cards/oracle-cards-20260729210249.jsonl.gz")).toBe(true);
    expect(isJsonl("https://data.scryfall.io/oracle-cards/oracle-cards-20260729210249.jsonl.gz")).toBe(true);
  });

  it("leaves a plain JSON array alone — no gunzip, no line-splitting", () => {
    expect(isGzipped("https://data.scryfall.io/oracle-cards/x.json")).toBe(false);
    expect(isJsonl("https://data.scryfall.io/oracle-cards/x.json")).toBe(false);
  });

  it("handles uncompressed .jsonl and .json.gz independently", () => {
    expect(isJsonl("https://x/a.jsonl")).toBe(true);
    expect(isGzipped("https://x/a.jsonl")).toBe(false);
    expect(isGzipped("https://x/a.json.gz")).toBe(true);
    expect(isJsonl("https://x/a.json.gz")).toBe(false);
  });
});

describe("JSONL → JSON array", () => {
  it("converts one-record-per-line into a parseable array", async () => {
    const { text, records } = await runTransform([Buffer.from(JSONL, "utf8")]);
    expect(records).toBe(3);
    expect(JSON.parse(text)).toEqual(CARDS);
  });

  it("⛔⭐ SURVIVES A MULTI-BYTE CHARACTER SPLIT ACROSS CHUNKS", async () => {
    // Fed ONE BYTE AT A TIME, so every multi-byte codepoint (Æ, û, ö) is split at every
    // possible boundary. chunk.toString("utf8") would emit U+FFFD here and silently corrupt
    // the card name — a data-integrity bug no record count would catch. This is why the
    // transform uses StringDecoder; delete that and this test is the only thing that screams.
    const bytes = Buffer.from(JSONL, "utf8");
    const oneByteChunks = Array.from({ length: bytes.length }, (_, i) => bytes.subarray(i, i + 1));
    const { text, records } = await runTransform(oneByteChunks);
    expect(records).toBe(3);
    expect(JSON.parse(text)).toEqual(CARDS);
    expect(text).not.toContain("�");
  });

  it("handles CRLF, blank lines and a trailing newline", async () => {
    const { text, records } = await runTransform([Buffer.from(`${CARDS.map((c) => JSON.stringify(c)).join("\r\n")}\r\n\r\n`, "utf8")]);
    expect(records).toBe(3);
    expect(JSON.parse(text)).toEqual(CARDS);
  });

  it("tolerates a plain JSON array arriving on a .jsonl URL (wrapper lines + trailing commas)", async () => {
    const body = `[\n${CARDS.map((c) => JSON.stringify(c)).join(",\n")}\n]`;
    const { text, records } = await runTransform([Buffer.from(body, "utf8")]);
    expect(records).toBe(3);
    expect(JSON.parse(text)).toEqual(CARDS);
  });

  it("empty input yields an empty array, and reports ZERO records so callers can refuse it", async () => {
    const { text, records } = await runTransform([Buffer.from("", "utf8")]);
    expect(records).toBe(0);
    expect(JSON.parse(text)).toEqual([]);
  });
});

describe("downloadBulkFile / fetchBulkRecords against a real gzipped-JSONL server", () => {
  let server;
  let base;
  let tmpDir;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = String(req.url || "");
      const send = (body, gz) => {
        res.writeHead(200, { "content-type": gz ? "application/gzip" : "application/json" });
        res.end(gz ? zlib.gzipSync(body) : body);
      };
      if (url.startsWith("/big.jsonl.gz")) return send(BIG_JSONL, true);
      if (url.startsWith("/small.jsonl.gz")) return send(JSON.stringify(CARDS[0]), true);
      if (url.startsWith("/empty.jsonl.gz")) return send("", true);
      if (url.startsWith("/plain.jsonl")) return send(BIG_JSONL, false);
      res.writeHead(404).end("nope");
      return undefined;
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), "scryfall-bulk-fetch-"));
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    fsSync.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("⭐ POSITIVE CONTROL: gzipped JSONL lands on disk as the plain JSON array downstream reads", async () => {
    // The whole seam end-to-end: fetch → gunzip → JSONL→array → temp file → rename. The
    // assertion is deliberately the DOWNSTREAM contract — readFileSync + JSON.parse +
    // Array.isArray — because that is literally what cardIndex.js and build-oracle-index.cjs do.
    const out = path.join(tmpDir, "oracle_cards.json");
    const result = await downloadBulkFile({ type: "oracle_cards", jsonl_download_uri: `${base}/big.jsonl.gz` }, out);

    expect(result.records).toBe(BIG_RECORDS.length);
    expect(result.bytes).toBeGreaterThan(1024);

    const parsed = JSON.parse(fsSync.readFileSync(out, "utf8"));
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toEqual(BIG_RECORDS);
    expect(fsSync.existsSync(`${out}.tmp`)).toBe(false);
  });

  it("an uncompressed .jsonl body works too", async () => {
    const out = path.join(tmpDir, "plain.json");
    const result = await downloadBulkFile({ type: "rulings", jsonl_download_uri: `${base}/plain.jsonl` }, out);
    expect(result.records).toBe(BIG_RECORDS.length);
    expect(JSON.parse(fsSync.readFileSync(out, "utf8"))).toEqual(BIG_RECORDS);
  });

  it("⛔ a URL-LESS item THROWS instead of being skipped", async () => {
    // The regression guard for the actual outage. Old behaviour: `continue`. New behaviour: throw.
    await expect(downloadBulkFile({ type: "oracle_cards", compressed_size: 24357783 }, path.join(tmpDir, "never.json")))
      .rejects.toThrow(/no download URL/i);
    expect(fsSync.existsSync(path.join(tmpDir, "never.json"))).toBe(false);
  });

  it("⛔ an implausibly SMALL snapshot is refused and never installed over good data", async () => {
    // Both this and the zero-record guard watch the WRITTEN file, deliberately overlapping —
    // the point is that no path exists where a junk snapshot replaces a working one.
    const out = path.join(tmpDir, "small.json");
    await expect(downloadBulkFile({ type: "rulings", jsonl_download_uri: `${base}/small.jsonl.gz` }, out)).rejects.toThrow();
    expect(fsSync.existsSync(out)).toBe(false);
    expect(fsSync.existsSync(`${out}.tmp`)).toBe(false);
  });

  it("⛔ an EMPTY snapshot is refused, and leaves no torn temp file behind", async () => {
    const out = path.join(tmpDir, "empty.json");
    await expect(downloadBulkFile({ type: "rulings", jsonl_download_uri: `${base}/empty.jsonl.gz` }, out)).rejects.toThrow();
    expect(fsSync.existsSync(out)).toBe(false);
    expect(fsSync.existsSync(`${out}.tmp`)).toBe(false);
  });

  it("⛔ HTTP failure is surfaced, not swallowed", async () => {
    await expect(downloadBulkFile({ type: "rulings", jsonl_download_uri: `${base}/missing.jsonl.gz` }, path.join(tmpDir, "x.json")))
      .rejects.toThrow(/Download failed 404/);
  });

  it("fetchBulkRecords streams gzipped JSONL into objects, multi-byte names intact", async () => {
    const records = await fetchBulkRecords({ type: "oracle_cards", jsonl_download_uri: `${base}/big.jsonl.gz` });
    expect(records).toHaveLength(BIG_RECORDS.length);
    expect(records[0].name).toContain("Æther");
  });

  it("⛔ fetchBulkRecords refuses a zero-record response rather than returning []", async () => {
    await expect(fetchBulkRecords({ type: "rulings", jsonl_download_uri: `${base}/empty.jsonl.gz` }))
      .rejects.toThrow(/ZERO records/i);
  });

  it("⛔ fetchBulkRecords throws on a URL-less item", async () => {
    await expect(fetchBulkRecords({ type: "rulings" })).rejects.toThrow(/no download URL/i);
  });
});
