import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 1;

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "../..");
const MOBILE_ROOT = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_BUILD_ROOT = path.join(MOBILE_ROOT, "build/knowledge");

export const DEFAULT_INPUTS = Object.freeze({
  oraclePath: path.join(REPO_ROOT, "app/data/scryfall.oracle.local.json"),
  rulingsPath: path.join(REPO_ROOT, "app/data/scryfall.rulings.local.json"),
  crPath: path.join(REPO_ROOT, "knowledge/mtg-judge/data/cr/cr_current.json"),
});

function isWithin(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function assertOutputBoundary(outputPath, allowedOutputRoot) {
  if (allowedOutputRoot && !isWithin(outputPath, allowedOutputRoot)) {
    throw new Error(
      `Refusing knowledge-pack output outside ${path.resolve(allowedOutputRoot)}`,
    );
  }
}

function readJson(sourcePath, label) {
  let text;
  try {
    text = fs.readFileSync(sourcePath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read ${label} input at ${sourcePath}: ${error.message}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Unable to parse ${label} input at ${sourcePath}: ${error.message}`,
    );
  }
}

function requireArrayEnvelope(value, recordsKey, label) {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray(value[recordsKey])
  ) {
    throw new Error(`${label} input must contain a ${recordsKey} array`);
  }
  if (
    !Number.isInteger(value.count) ||
    value.count !== value[recordsKey].length
  ) {
    throw new Error(
      `${label} count mismatch: declared ${String(value.count)}, parsed ${value[recordsKey].length}`,
    );
  }
  return value[recordsKey];
}

function requireCrRecords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("CR input must be an object keyed by rule number");
  }
  const records = Object.entries(value);
  for (const [key, rule] of records) {
    if (
      !rule ||
      typeof rule !== "object" ||
      rule.ruleNumber !== key ||
      !rule.ruleText
    ) {
      throw new Error(`Malformed CR record at ${key}`);
    }
  }
  return records.map(([, rule]) => rule);
}

function json(value, fallback) {
  return JSON.stringify(value ?? fallback);
}

function faceText(card) {
  return (card.card_faces ?? [])
    .map((face) =>
      [face.name, face.type_line, face.oracle_text].filter(Boolean).join("\n"),
    )
    .join("\n\n");
}

function examplesText(examples) {
  return Array.isArray(examples) ? examples.filter(Boolean).join("\n") : "";
}

export function normalizeCardName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

async function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function createSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    PRAGMA temp_store = MEMORY;

    CREATE TABLE metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE TABLE cards (
      oracle_id TEXT PRIMARY KEY NOT NULL,
      scryfall_id TEXT NOT NULL,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      layout TEXT NOT NULL,
      mana_cost TEXT,
      type_line TEXT,
      oracle_text TEXT,
      cmc REAL NOT NULL,
      colors_json TEXT NOT NULL,
      color_identity_json TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      power TEXT,
      toughness TEXT,
      loyalty TEXT,
      defense TEXT,
      card_faces_json TEXT NOT NULL
    ) WITHOUT ROWID;

    CREATE INDEX cards_normalized_name_idx ON cards(normalized_name);

    CREATE TABLE card_names (
      normalized_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),
      face_index INTEGER NOT NULL,
      PRIMARY KEY (normalized_name, oracle_id, face_index)
    ) WITHOUT ROWID;

    CREATE INDEX card_names_oracle_id_idx ON card_names(oracle_id);

    CREATE TABLE rulings (
      ruling_id INTEGER PRIMARY KEY,
      oracle_id TEXT NOT NULL REFERENCES cards(oracle_id),
      source TEXT NOT NULL,
      published_at TEXT NOT NULL,
      comment TEXT NOT NULL
    );

    CREATE INDEX rulings_oracle_id_idx ON rulings(oracle_id, published_at);

    CREATE TABLE cr_rules (
      rule_number TEXT PRIMARY KEY NOT NULL,
      rule_text TEXT NOT NULL,
      examples_json TEXT NOT NULL,
      fragment TEXT,
      previous_rule TEXT,
      next_rule TEXT
    ) WITHOUT ROWID;

    CREATE VIRTUAL TABLE cards_fts USING fts5(
      oracle_id UNINDEXED,
      name,
      type_line,
      oracle_text,
      face_text,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE VIRTUAL TABLE rulings_fts USING fts5(
      ruling_id UNINDEXED,
      oracle_id UNINDEXED,
      comment,
      tokenize = 'unicode61 remove_diacritics 2'
    );

    CREATE VIRTUAL TABLE cr_fts USING fts5(
      rule_number UNINDEXED,
      rule_text,
      examples,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
}

function loadRecords(db, { oracle, rulings, crRules, sourceMetadata }) {
  const insertMetadata = db.prepare(
    "INSERT INTO metadata(key, value) VALUES (?, ?)",
  );
  const insertCard = db.prepare(`
    INSERT INTO cards(
      oracle_id, scryfall_id, name, normalized_name, layout, mana_cost,
      type_line, oracle_text, cmc, colors_json, color_identity_json,
      keywords_json, power, toughness, loyalty, defense, card_faces_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertCardName = db.prepare(`
    INSERT OR IGNORE INTO card_names(normalized_name, display_name, oracle_id, face_index)
    VALUES (?, ?, ?, ?)
  `);
  const insertCardFts = db.prepare(`
    INSERT INTO cards_fts(oracle_id, name, type_line, oracle_text, face_text)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertRuling = db.prepare(`
    INSERT INTO rulings(oracle_id, source, published_at, comment)
    VALUES (?, ?, ?, ?)
  `);
  const insertRulingFts = db.prepare(`
    INSERT INTO rulings_fts(ruling_id, oracle_id, comment) VALUES (?, ?, ?)
  `);
  const insertCr = db.prepare(`
    INSERT INTO cr_rules(rule_number, rule_text, examples_json, fragment, previous_rule, next_rule)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertCrFts = db.prepare(`
    INSERT INTO cr_fts(rule_number, rule_text, examples) VALUES (?, ?, ?)
  `);

  const seenOracleIds = new Set();
  db.exec("BEGIN IMMEDIATE");
  try {
    insertMetadata.run("schema_version", String(SCHEMA_VERSION));
    for (const [key, value] of Object.entries(sourceMetadata)) {
      insertMetadata.run(key, String(value));
    }

    for (const card of oracle) {
      if (
        !card?.oracle_id ||
        !card.id ||
        !card.name ||
        seenOracleIds.has(card.oracle_id)
      ) {
        throw new Error(
          `Malformed or duplicate Oracle card: ${card?.name ?? card?.oracle_id ?? "unknown"}`,
        );
      }
      seenOracleIds.add(card.oracle_id);
      const normalizedName = normalizeCardName(card.name);
      const serializedFaces = json(card.card_faces, []);
      const searchableFaces = faceText(card);
      insertCard.run(
        card.oracle_id,
        card.id,
        card.name,
        normalizedName,
        card.layout ?? "normal",
        card.mana_cost ?? null,
        card.type_line ?? null,
        card.oracle_text ?? null,
        Number(card.cmc ?? 0),
        json(card.colors, []),
        json(card.color_identity, []),
        json(card.keywords, []),
        card.power ?? null,
        card.toughness ?? null,
        card.loyalty ?? null,
        card.defense ?? null,
        serializedFaces,
      );
      insertCardName.run(normalizedName, card.name, card.oracle_id, -1);
      (card.card_faces ?? []).forEach((face, index) => {
        if (face?.name) {
          insertCardName.run(
            normalizeCardName(face.name),
            face.name,
            card.oracle_id,
            index,
          );
        }
      });
      insertCardFts.run(
        card.oracle_id,
        card.name,
        card.type_line ?? "",
        card.oracle_text ?? "",
        searchableFaces,
      );
    }

    for (const ruling of rulings) {
      if (
        !ruling?.oracle_id ||
        !seenOracleIds.has(ruling.oracle_id) ||
        !ruling.source ||
        !ruling.published_at ||
        !ruling.comment
      ) {
        throw new Error(
          `Malformed or orphaned ruling for ${ruling?.oracle_id ?? "unknown"}`,
        );
      }
      const result = insertRuling.run(
        ruling.oracle_id,
        ruling.source,
        ruling.published_at,
        ruling.comment,
      );
      insertRulingFts.run(
        Number(result.lastInsertRowid),
        ruling.oracle_id,
        ruling.comment,
      );
    }

    for (const rule of crRules) {
      const examples = examplesText(rule.examples);
      insertCr.run(
        rule.ruleNumber,
        rule.ruleText,
        json(rule.examples, []),
        rule.fragment ?? null,
        rule.navigation?.previousRule ?? null,
        rule.navigation?.nextRule ?? null,
      );
      insertCrFts.run(rule.ruleNumber, rule.ruleText, examples);
    }

    db.exec(`
      INSERT INTO cards_fts(cards_fts) VALUES ('optimize');
      INSERT INTO rulings_fts(rulings_fts) VALUES ('optimize');
      INSERT INTO cr_fts(cr_fts) VALUES ('optimize');
      COMMIT;
    `);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export async function buildKnowledgePack({
  oraclePath,
  rulingsPath,
  crPath,
  outPath,
  manifestPath,
  allowedOutputRoot,
}) {
  const resolved = {
    oraclePath: path.resolve(oraclePath),
    rulingsPath: path.resolve(rulingsPath),
    crPath: path.resolve(crPath),
    outPath: path.resolve(outPath),
    manifestPath: path.resolve(manifestPath),
  };
  assertOutputBoundary(resolved.outPath, allowedOutputRoot);
  assertOutputBoundary(resolved.manifestPath, allowedOutputRoot);

  const oracleEnvelope = readJson(resolved.oraclePath, "Oracle");
  const rulingsEnvelope = readJson(resolved.rulingsPath, "rulings");
  const oracle = requireArrayEnvelope(oracleEnvelope, "cards", "Oracle");
  const rulings = requireArrayEnvelope(rulingsEnvelope, "rulings", "rulings");
  const crRules = requireCrRecords(readJson(resolved.crPath, "CR"));

  const sourceHashes = {
    oracle: await sha256File(resolved.oraclePath),
    rulings: await sha256File(resolved.rulingsPath),
    cr: await sha256File(resolved.crPath),
  };
  const packId = crypto
    .createHash("sha256")
    .update(JSON.stringify({ schemaVersion: SCHEMA_VERSION, sourceHashes }))
    .digest("hex")
    .slice(0, 24);

  fs.mkdirSync(path.dirname(resolved.outPath), { recursive: true });
  fs.mkdirSync(path.dirname(resolved.manifestPath), { recursive: true });
  const nonce = `${process.pid}-${Date.now()}`;
  const tempDbPath = `${resolved.outPath}.tmp-${nonce}`;
  const tempManifestPath = `${resolved.manifestPath}.tmp-${nonce}`;
  let db;
  try {
    db = new DatabaseSync(tempDbPath);
    createSchema(db);
    loadRecords(db, {
      oracle,
      rulings,
      crRules,
      sourceMetadata: {
        pack_id: packId,
        oracle_updated_at: oracleEnvelope.scryfallUpdatedAt ?? "unknown",
        rulings_updated_at: rulingsEnvelope.scryfallUpdatedAt ?? "unknown",
      },
    });
    db.exec("VACUUM");
    db.close();
    db = undefined;

    const databaseSha256 = await sha256File(tempDbPath);
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      packId,
      builtAt: new Date().toISOString(),
      database: {
        file: path.basename(resolved.outPath),
        bytes: fs.statSync(tempDbPath).size,
        sha256: databaseSha256,
      },
      counts: {
        cards: oracle.length,
        rulings: rulings.length,
        crRules: crRules.length,
      },
      sources: {
        oracle: {
          file: path.basename(resolved.oraclePath),
          sha256: sourceHashes.oracle,
          updatedAt: oracleEnvelope.scryfallUpdatedAt ?? null,
        },
        rulings: {
          file: path.basename(resolved.rulingsPath),
          sha256: sourceHashes.rulings,
          updatedAt: rulingsEnvelope.scryfallUpdatedAt ?? null,
        },
        cr: {
          file: path.basename(resolved.crPath),
          sha256: sourceHashes.cr,
        },
      },
    };
    fs.writeFileSync(
      tempManifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    for (const finalPath of [resolved.outPath, resolved.manifestPath]) {
      if (fs.existsSync(finalPath)) fs.rmSync(finalPath);
    }
    fs.renameSync(tempDbPath, resolved.outPath);
    fs.renameSync(tempManifestPath, resolved.manifestPath);
    return {
      ...manifest,
      outPath: resolved.outPath,
      manifestPath: resolved.manifestPath,
    };
  } finally {
    if (db) db.close();
    for (const tempPath of [tempDbPath, tempManifestPath]) {
      if (fs.existsSync(tempPath)) fs.rmSync(tempPath);
    }
  }
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const outPath = path.join(DEFAULT_BUILD_ROOT, "omnath-knowledge.sqlite");
  const manifestPath = path.join(
    DEFAULT_BUILD_ROOT,
    "omnath-knowledge.manifest.json",
  );
  const result = await buildKnowledgePack({
    ...DEFAULT_INPUTS,
    outPath,
    manifestPath,
    allowedOutputRoot: DEFAULT_BUILD_ROOT,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
