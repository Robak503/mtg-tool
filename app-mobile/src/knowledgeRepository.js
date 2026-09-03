import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";

export function normalizeCardName(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .replace(/[’‘]/g, "'")
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ")
    .trim();
}

export function safeFtsQuery(text, operator = "AND") {
  const joiner = operator === "OR" ? " OR " : " AND ";
  const tokens = String(text ?? "").match(/[\p{L}\p{N}]+/gu) ?? [];
  return tokens
    .slice(0, 12)
    .map((token) => `"${token.replaceAll('"', '""')}"`)
    .join(joiner);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hydrateCard(row) {
  if (!row) return null;
  return {
    oracleId: row.oracle_id,
    scryfallId: row.scryfall_id,
    name: row.name,
    matchedName: row.matched_name ?? row.name,
    matchedFaceIndex: Number(row.face_index ?? -1),
    layout: row.layout,
    manaCost: row.mana_cost,
    typeLine: row.type_line,
    oracleText: row.oracle_text,
    manaValue: Number(row.cmc),
    colors: parseJson(row.colors_json, []),
    colorIdentity: parseJson(row.color_identity_json, []),
    keywords: parseJson(row.keywords_json, []),
    power: row.power,
    toughness: row.toughness,
    loyalty: row.loyalty,
    defense: row.defense,
    faces: parseJson(row.card_faces_json, []),
  };
}

function hydrateRule(row) {
  if (!row) return null;
  const { examplesJson, ...rule } = row;
  return { ...rule, examples: parseJson(examplesJson, []) };
}

export function createKnowledgeRepository(database, status) {
  return Object.freeze({
    status,

    async verify() {
      const [integrity] = await database.select("PRAGMA quick_check");
      const result = integrity?.quick_check;
      if (result !== "ok") {
        throw new Error(`Knowledge database integrity check failed: ${result}`);
      }
      const metadata = await database.select(
        "SELECT key, value FROM metadata WHERE key IN ('schema_version', 'pack_id')",
      );
      const receipt = Object.fromEntries(
        metadata.map(({ key, value }) => [key, value]),
      );
      if (
        Number(receipt.schema_version) !== status.schemaVersion ||
        receipt.pack_id !== status.packId
      ) {
        throw new Error("Knowledge database receipt does not match the native pack");
      }
      return { integrity: result, ...receipt };
    },

    async findCardExact(name) {
      const [row] = await database.select(
        `SELECT c.*, n.display_name AS matched_name, n.face_index
         FROM card_names n
         JOIN cards c ON c.oracle_id = n.oracle_id
         WHERE n.normalized_name = ?
         ORDER BY n.face_index ASC
         LIMIT 1`,
        [normalizeCardName(name)],
      );
      return hydrateCard(row);
    },

    async searchCards(text, limit = 8) {
      const query = safeFtsQuery(text, "OR");
      if (!query) return [];
      const rows = await database.select(
        `SELECT c.*, c.name AS matched_name, -1 AS face_index,
                bm25(cards_fts, 0.0, 8.0, 2.0, 4.0, 4.0) AS rank
         FROM cards_fts
         JOIN cards c ON c.oracle_id = cards_fts.oracle_id
         WHERE cards_fts MATCH ?
         ORDER BY rank, c.name
         LIMIT ?`,
        [query, Math.max(1, Math.min(20, Number(limit) || 8))],
      );
      return rows.map(hydrateCard);
    },

    async getRulings(oracleId) {
      return database.select(
        `SELECT source, published_at AS publishedAt, comment
         FROM rulings
         WHERE oracle_id = ?
         ORDER BY published_at DESC, ruling_id DESC`,
        [oracleId],
      );
    },

    async searchRules(text, limit = 6) {
      const query = safeFtsQuery(text, "OR");
      if (!query) return [];
      const rows = await database.select(
        `SELECT r.rule_number AS ruleNumber, r.rule_text AS ruleText,
                r.examples_json AS examplesJson, r.fragment,
                r.previous_rule AS previousRule, r.next_rule AS nextRule,
                bm25(cr_fts, 0.0, 3.0, 1.0) AS rank
         FROM cr_fts
         JOIN cr_rules r ON r.rule_number = cr_fts.rule_number
         WHERE cr_fts MATCH ?
         ORDER BY rank, r.rule_number
         LIMIT ?`,
        [query, Math.max(1, Math.min(20, Number(limit) || 6))],
      );
      return rows.map(hydrateRule);
    },

    async getRuleExact(ruleNumber) {
      const [row] = await database.select(
        `SELECT rule_number AS ruleNumber, rule_text AS ruleText,
                examples_json AS examplesJson, fragment,
                previous_rule AS previousRule, next_rule AS nextRule
         FROM cr_rules
         WHERE rule_number = ?
         LIMIT 1`,
        [String(ruleNumber ?? "").trim()],
      );
      return hydrateRule(row);
    },

    async getRuleSection(ruleNumber, limit = 12) {
      const normalized = String(ruleNumber ?? "").trim();
      const isSection = /^\d{3}\.\d+$/.test(normalized);
      const rows = await database.select(
        `SELECT rule_number AS ruleNumber, rule_text AS ruleText,
                examples_json AS examplesJson, fragment,
                previous_rule AS previousRule, next_rule AS nextRule
         FROM cr_rules
         WHERE rule_number = ?
            OR (? = 1 AND rule_number GLOB ?)
         ORDER BY CASE WHEN rule_number = ? THEN 0 ELSE 1 END,
                  LENGTH(rule_number), rule_number
         LIMIT ?`,
        [
          normalized,
          isSection ? 1 : 0,
          `${normalized}[a-z]*`,
          normalized,
          Math.max(1, Math.min(30, Number(limit) || 12)),
        ],
      );
      return rows.map(hydrateRule);
    },

    async close() {
      await database.close();
    },
  });
}

export async function openKnowledgeRepository(onProgress) {
  let unlisten = null;
  if (onProgress) {
    const { listen } = await import("@tauri-apps/api/event");
    unlisten = await listen("knowledge-progress", ({ payload }) => onProgress(payload));
  }
  const status = await invoke("prepare_knowledge").finally(() => unlisten?.());
  if (!status?.ready) {
    throw new Error(status?.error || "The offline knowledge pack is not ready");
  }
  const database = await Database.load(status.databaseUrl);
  const repository = createKnowledgeRepository(database, status);
  await repository.verify();
  return repository;
}
