import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildKnowledgePack,
  normalizeCardName,
  SCHEMA_VERSION,
} from "../scripts/build-knowledge-pack.mjs";

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omnath-knowledge-test-"));
  const oraclePath = path.join(root, "oracle.json");
  const rulingsPath = path.join(root, "rulings.json");
  const crPath = path.join(root, "cr.json");
  const outPath = path.join(root, "pack", "knowledge.sqlite");
  const manifestPath = path.join(root, "pack", "knowledge.manifest.json");
  const cards = [
    {
      id: "scryfall-1",
      oracle_id: "oracle-1",
      name: "Áether Adept",
      layout: "normal",
      mana_cost: "{1}{U}{U}",
      type_line: "Creature — Human Wizard",
      oracle_text:
        "When this creature enters, return target creature to its owner's hand.",
      cmc: 3,
      colors: ["U"],
      color_identity: ["U"],
      keywords: [],
    },
    {
      id: "scryfall-2",
      oracle_id: "oracle-2",
      name: "Front // Back",
      layout: "transform",
      cmc: 2,
      colors: ["G"],
      color_identity: ["G"],
      keywords: ["Trample"],
      card_faces: [
        { name: "Front", type_line: "Creature", oracle_text: "Trample" },
        { name: "Back", type_line: "Creature", oracle_text: "Vigilance" },
      ],
    },
  ];
  const rulings = [
    {
      oracle_id: "oracle-1",
      source: "wotc",
      published_at: "2026-01-01",
      comment:
        "The target is chosen as the triggered ability is put on the stack.",
    },
  ];
  const cr = {
    100.1: {
      ruleNumber: "100.1",
      ruleText: "These rules apply to Magic games.",
      examples: null,
      fragment: "1",
      navigation: { previousRule: null, nextRule: "101.2" },
    },
    101.2: {
      ruleNumber: "101.2",
      ruleText: "A can't effect takes precedence.",
      examples: ["A restriction beats a permission."],
      fragment: "2",
      navigation: { previousRule: "100.1", nextRule: null },
    },
  };
  writeJson(oraclePath, {
    version: 1,
    count: cards.length,
    scryfallUpdatedAt: "2026-01-02T00:00:00Z",
    cards,
  });
  writeJson(rulingsPath, {
    version: 1,
    count: rulings.length,
    scryfallUpdatedAt: "2026-01-03T00:00:00Z",
    rulings,
  });
  writeJson(crPath, cr);
  return { root, oraclePath, rulingsPath, crPath, outPath, manifestPath };
}

test("normalizes card names for deterministic exact lookup", () => {
  assert.equal(normalizeCardName("  Áether   Adept  "), "aether adept");
  assert.equal(normalizeCardName("Urza’s Saga"), "urza's saga");
});

test("builds a versioned SQLite/FTS pack with traceable records", async (t) => {
  const files = fixture();

  const manifest = await buildKnowledgePack({
    ...files,
    allowedOutputRoot: files.root,
  });
  assert.equal(manifest.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(manifest.counts, { cards: 2, rulings: 1, crRules: 2 });
  assert.match(manifest.packId, /^[a-f0-9]{24}$/);
  assert.match(manifest.database.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fs.statSync(files.outPath).size, manifest.database.bytes);

  const db = new DatabaseSync(files.outPath, { readOnly: true });
  t.after(() => db.close());
  t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  assert.deepEqual(
    db
      .prepare(
        "SELECT display_name, oracle_id, face_index FROM card_names WHERE normalized_name = ?",
      )
      .all("front")
      .map((row) => ({ ...row })),
    [{ display_name: "Front", oracle_id: "oracle-2", face_index: 0 }],
  );
  assert.deepEqual(
    db
      .prepare("SELECT oracle_id FROM cards_fts WHERE cards_fts MATCH ?")
      .all("trample")
      .map((row) => ({ ...row })),
    [{ oracle_id: "oracle-2" }],
  );
  assert.deepEqual(
    db
      .prepare("SELECT rule_number FROM cr_fts WHERE cr_fts MATCH ?")
      .all('"takes precedence"')
      .map((row) => ({ ...row })),
    [{ rule_number: "101.2" }],
  );
  assert.equal(
    db
      .prepare("SELECT comment FROM rulings WHERE oracle_id = ?")
      .get("oracle-1").comment,
    "The target is chosen as the triggered ability is put on the stack.",
  );
});

test("fails closed when a source envelope count is wrong", async (t) => {
  const files = fixture();
  t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  const oracle = JSON.parse(fs.readFileSync(files.oraclePath, "utf8"));
  oracle.count += 1;
  writeJson(files.oraclePath, oracle);

  await assert.rejects(
    buildKnowledgePack({ ...files, allowedOutputRoot: files.root }),
    /Oracle count mismatch/,
  );
  assert.equal(fs.existsSync(files.outPath), false);
});

test("refuses CLI-style outputs outside the declared build boundary", async (t) => {
  const files = fixture();
  t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));

  await assert.rejects(
    buildKnowledgePack({
      ...files,
      outPath: path.join(os.tmpdir(), "outside-omnath-pack.sqlite"),
      allowedOutputRoot: path.join(files.root, "pack"),
    }),
    /Refusing knowledge-pack output/,
  );
});
