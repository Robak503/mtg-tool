import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { DEFAULT_INPUTS } from "./build-knowledge-pack.mjs";

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_ROOT = path.join(MOBILE_ROOT, "build/knowledge");

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function rows(db, sql) {
  return db.prepare(sql).all().map((row) => ({ ...row }));
}

export function verifyKnowledgeParity({
  databasePath = path.join(BUILD_ROOT, "omnath-knowledge.sqlite"),
  manifestPath = path.join(BUILD_ROOT, "omnath-knowledge.manifest.json"),
  inputs = DEFAULT_INPUTS,
} = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(sha256(databasePath), manifest.database.sha256, "database receipt hash");
  for (const kind of ["oracle", "rulings", "cr"]) {
    assert.equal(sha256(inputs[`${kind}Path`]), manifest.sources[kind].sha256, `${kind} source hash`);
  }

  const oracle = JSON.parse(fs.readFileSync(inputs.oraclePath, "utf8")).cards;
  const rulings = JSON.parse(fs.readFileSync(inputs.rulingsPath, "utf8")).rulings;
  const cr = Object.values(JSON.parse(fs.readFileSync(inputs.crPath, "utf8")));
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const cardsById = new Map(rows(db, "SELECT * FROM cards").map((row) => [row.oracle_id, row]));
    assert.equal(cardsById.size, oracle.length, "every Oracle card is present exactly once");
    for (const card of oracle) {
      const row = cardsById.get(card.oracle_id);
      assert.ok(row, `missing Oracle card ${card.oracle_id}`);
      assert.equal(row.scryfall_id, card.id);
      assert.equal(row.name, card.name);
      assert.equal(row.oracle_text, card.oracle_text ?? null);
      assert.equal(row.type_line, card.type_line ?? null);
      assert.equal(row.card_faces_json, JSON.stringify(card.card_faces ?? []));
    }

    const rulingRows = rows(db, "SELECT oracle_id, source, published_at, comment FROM rulings ORDER BY ruling_id");
    assert.deepEqual(rulingRows, rulings, "every official ruling is byte-for-byte represented");

    const rulesByNumber = new Map(rows(db, "SELECT * FROM cr_rules").map((row) => [row.rule_number, row]));
    assert.equal(rulesByNumber.size, cr.length, "every CR rule is present exactly once");
    for (const rule of cr) {
      const row = rulesByNumber.get(rule.ruleNumber);
      assert.ok(row, `missing CR ${rule.ruleNumber}`);
      assert.equal(row.rule_text, rule.ruleText);
      assert.equal(row.examples_json, JSON.stringify(rule.examples ?? []));
      assert.equal(row.fragment, rule.fragment ?? null);
      assert.equal(row.previous_rule, rule.navigation?.previousRule ?? null);
      assert.equal(row.next_rule, rule.navigation?.nextRule ?? null);
    }
    return { cards: oracle.length, rulings: rulings.length, crRules: cr.length, packId: manifest.packId };
  } finally {
    db.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(verifyKnowledgeParity()));
}
