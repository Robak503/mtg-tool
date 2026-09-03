import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  createKnowledgeRepository,
  normalizeCardName,
  safeFtsQuery,
} from "../src/knowledgeRepository.js";

const MOBILE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACK_PATH = path.join(
  MOBILE_ROOT,
  "build/knowledge/omnath-knowledge.sqlite",
);

function nodeAdapter(database) {
  return {
    async select(sql, values = []) {
      return database.prepare(sql).all(...values);
    },
    async close() {
      database.close();
    },
  };
}

test("normalization and FTS input are deterministic and syntax-safe", () => {
  assert.equal(normalizeCardName("  Lim-Dûl’s   Vault "), "lim-dul's vault");
  assert.equal(safeFtsQuery('draw OR "drop" -table'), '"draw" AND "OR" AND "drop" AND "table"');
  assert.equal(safeFtsQuery("?!"), "");
});

test("repository reads cards, face aliases, rulings, and CR from the built pack", async () => {
  const database = new DatabaseSync(PACK_PATH, { readOnly: true });
  const metadata = Object.fromEntries(
    database.prepare("SELECT key, value FROM metadata").all().map(({ key, value }) => [key, value]),
  );
  const repository = createKnowledgeRepository(nodeAdapter(database), {
    schemaVersion: Number(metadata.schema_version),
    packId: metadata.pack_id,
  });

  assert.deepEqual(await repository.verify(), {
    integrity: "ok",
    schema_version: metadata.schema_version,
    pack_id: metadata.pack_id,
  });

  const omnath = await repository.findCardExact("Omnath, Locus of Creation");
  assert.equal(omnath.name, "Omnath, Locus of Creation");
  assert.notEqual(omnath.layout, "art_series");
  assert.match(omnath.oracleText, /land you control enters/i);
  assert.ok((await repository.getRulings(omnath.oracleId)).length >= 1);

  const adventureFace = await repository.findCardExact("Petty Theft");
  assert.equal(adventureFace.name, "Brazen Borrower // Petty Theft");
  assert.equal(adventureFace.matchedName, "Petty Theft");

  const cards = await repository.searchCards("Omnath Locus Creation", 5);
  assert.ok(cards.some((card) => card.name === "Omnath, Locus of Creation"));

  const rules = await repository.searchRules("triggered ability", 5);
  assert.ok(rules.length > 0);
  assert.match(rules[0].ruleNumber, /^\d/);

  const firstStrike = await repository.getRuleSection("702.7");
  assert.equal(firstStrike[0].ruleNumber, "702.7");
  assert.match(firstStrike[0].ruleText, /first strike/i);
  assert.ok(firstStrike.some(({ ruleNumber }) => ruleNumber === "702.7a"));
  assert.ok(firstStrike.every(({ ruleNumber }) => ruleNumber === "702.7" || /^702\.7[a-z]/.test(ruleNumber)));
  await repository.close();
});
