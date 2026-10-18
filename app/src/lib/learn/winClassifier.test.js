/**
 * winClassifier.test.js — the combo tag is HONEST: it fires only when the winner cast every piece of a
 * catalogued combo AND that combo's result matches the actual win-condition. Enabling combos and
 * incidental piece-holding never get tagged. Small fixtures — no 99MB file, no network.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { producesToWincons, buildComboLookup, classifyComboWin, loadComboData, _resetComboCacheForTests } from "./winClassifier.js";

const RAW = [
  { id: "1", cards: ["Exquisite Blood", "Sanguine Bond"], produces: ["Infinite life loss", "Infinite life gain"], popularity: 100 },
  { id: "2", cards: ["Thassa's Oracle", "Demonic Consultation"], produces: ["Win the game"], popularity: 200 },
  { id: "3", cards: ["Scurry Oak", "Railway Brawler"], produces: ["Infinite +1/+1 counters", "Infinite tokens"], popularity: 12 }, // enabling only
  { id: "4", cards: ["Lonely Card"], produces: ["Win the game"], popularity: 5 }, // < 2 cards
];

const castLog = (seat, ...names) => names.map((cardName) => ({ kind: "cast-spell", playerId: seat, cardName }));

describe("producesToWincons (conservative mapping)", () => {
  it("maps only DIRECT win results", () => {
    expect([...producesToWincons(["Win the game"])]).toEqual(["win-game-effect"]);
    expect(producesToWincons(["Infinite life loss"]).has("damage")).toBe(true);
    expect(producesToWincons(["Infinite mill"]).has("decking")).toBe(true);
    expect(producesToWincons(["Infinite poison counters"]).has("poison")).toBe(true);
    // Enabling results map to NOTHING → never a combo tag.
    expect(producesToWincons(["Infinite +1/+1 counters", "Infinite tokens"]).size).toBe(0);
  });
});

describe("buildComboLookup", () => {
  it("keeps only ≥2-card combos with a direct-win result", () => {
    const { combos, byCard } = buildComboLookup(RAW);
    expect(combos.map((c) => c.name).sort()).toEqual([
      "Exquisite Blood + Sanguine Bond",
      "Thassa's Oracle + Demonic Consultation",
    ]); // combo 3 (enabling) + combo 4 (<2 cards) dropped
    expect(byCard.has("exquisite blood")).toBe(true);
    expect(byCard.has("scurry oak")).toBe(false); // dropped combo's card isn't indexed
  });
});

describe("classifyComboWin (CREED — no false combo)", () => {
  const data = buildComboLookup(RAW);

  it("tags a combo when every piece was cast AND the win-con is consistent", () => {
    const r = classifyComboWin({ data: undefined, comboData: data, log: castLog("ai1", "Exquisite Blood", "Sanguine Bond"), winnerSeat: "ai1", winCondition: "damage" });
    expect(r.isCombo).toBe(true);
    expect(r.name).toBe("Exquisite Blood + Sanguine Bond");
  });

  it("does NOT tag when the win-con is inconsistent with the combo's result", () => {
    const r = classifyComboWin({ comboData: data, log: castLog("ai1", "Exquisite Blood", "Sanguine Bond"), winnerSeat: "ai1", winCondition: "commander-damage" });
    expect(r.isCombo).toBe(false);
  });

  it("does NOT tag when only some pieces were cast", () => {
    const r = classifyComboWin({ comboData: data, log: castLog("ai1", "Exquisite Blood"), winnerSeat: "ai1", winCondition: "damage" });
    expect(r.isCombo).toBe(false);
  });

  it("does NOT tag pieces cast by a DIFFERENT seat than the winner", () => {
    const r = classifyComboWin({ comboData: data, log: castLog("ai2", "Exquisite Blood", "Sanguine Bond"), winnerSeat: "ai1", winCondition: "damage" });
    expect(r.isCombo).toBe(false);
  });

  it("tags a win-the-game combo on the win-game-effect win-con", () => {
    const r = classifyComboWin({ comboData: data, log: castLog("user", "Thassa's Oracle", "Demonic Consultation"), winnerSeat: "user", winCondition: "win-game-effect" });
    expect(r.isCombo).toBe(true);
    expect(r.name).toBe("Thassa's Oracle + Demonic Consultation");
  });
});

// The loader's one quiet answer is an ABSENT snapshot (a dev tree, a test sandbox): null, and combo tagging is skipped. It used
// to answer every failure that way, so a corrupt snapshot or a lookup-builder bug read as "no combo data" with nothing said.
describe("loadComboData — only an absent snapshot reads null", () => {
  let tmp;
  let prevRoot;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "win-classifier-test-"));
    fs.mkdirSync(path.join(tmp, "data"));
    prevRoot = process.env.MTG_APP_ROOT;
    process.env.MTG_APP_ROOT = tmp;
    _resetComboCacheForTests();
  });
  afterEach(() => {
    if (prevRoot === undefined) delete process.env.MTG_APP_ROOT;
    else process.env.MTG_APP_ROOT = prevRoot;
    _resetComboCacheForTests();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("an absent snapshot reads null", async () => {
    expect(await loadComboData()).toBeNull();
  });

  it("a snapshot that cannot be parsed rejects instead of reading as no combo data, and is not cached", async () => {
    const file = path.join(tmp, "data", "spellbook-combos.local.json");
    fs.writeFileSync(file, "{ truncated");
    await expect(loadComboData()).rejects.toThrow(SyntaxError);
    fs.writeFileSync(file, JSON.stringify(RAW));
    const data = await loadComboData();
    expect(data.combos.map((c) => c.name)).toEqual(["Exquisite Blood + Sanguine Bond", "Thassa's Oracle + Demonic Consultation"]);
  });
});
