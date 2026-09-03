import assert from "node:assert/strict";
import test from "node:test";
import { planArtRecords } from "../scripts/build-art-pack.mjs";

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
