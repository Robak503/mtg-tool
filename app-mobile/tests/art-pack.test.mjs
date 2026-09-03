import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildArtDatabase, planArtRecords } from "../scripts/build-art-pack.mjs";

const image = (id) => ({ small: `https://cards.scryfall.io/small/front/a/b/${id}.jpg` });

test("plans one offline image per playable card face and excludes art-series records", () => {
  const records = planArtRecords([
    {
      oracle_id: "11111111-1111-1111-1111-111111111111",
      name: "Single",
      layout: "normal",
      image_uris: image("single"),
    },
    {
      oracle_id: "22222222-2222-2222-2222-222222222222",
      name: "Front // Back",
      layout: "transform",
      card_faces: [
        { name: "Front", image_uris: image("front") },
        { name: "Back", image_uris: image("back") },
      ],
    },
    {
      oracle_id: "33333333-3333-3333-3333-333333333333",
      name: "Decorative collectible",
      layout: "art_series",
      image_uris: image("art"),
    },
  ]);
  assert.deepEqual(records.map(({ oracleId, faceIndex, relativePath }) => ({ oracleId, faceIndex, relativePath })), [
    {
      oracleId: "11111111-1111-1111-1111-111111111111",
      faceIndex: -1,
      relativePath: "images/11/11111111-1111-1111-1111-111111111111.jpg",
    },
    {
      oracleId: "22222222-2222-2222-2222-222222222222",
      faceIndex: 0,
      relativePath: "images/22/22222222-2222-2222-2222-222222222222-0.jpg",
    },
    {
      oracleId: "22222222-2222-2222-2222-222222222222",
      faceIndex: 1,
      relativePath: "images/22/22222222-2222-2222-2222-222222222222-1.jpg",
    },
  ]);
});

test("builds a single indexed SQLite art payload", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "omnath-art-pack-"));
  try {
    const relativePath = "images/11/11111111-1111-1111-1111-111111111111.jpg";
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
    fs.writeFileSync(path.join(root, relativePath), Buffer.from([0xff, 0xd8, 0xff]));
    const databasePath = buildArtDatabase([{
      oracleId: "11111111-1111-1111-1111-111111111111",
      faceIndex: -1,
      relativePath,
      sha256: "fixture-sha",
    }], root, { schema_version: 1, pack_id: "fixture-pack" });
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      assert.equal(database.prepare("SELECT count(*) AS count FROM card_art").get().count, 1);
      const row = database.prepare("SELECT mime_type, image_bytes FROM card_art").get();
      assert.equal(row.mime_type, "image/jpeg");
      assert.deepEqual([...row.image_bytes], [0xff, 0xd8, 0xff]);
    } finally {
      database.close();
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
