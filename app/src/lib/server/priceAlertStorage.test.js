/**
 * priceAlertStorage — atomic load/upsert/remove round-trip (Vault #1).
 *
 * Uses process.chdir(tmpdir) so paths.js resolves price-alerts.json to a
 * throwaway location per test (matches collectionStorage.test.js).
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let workDir;
let originalCwd;

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "price-alert-storage-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true });
});

async function load() {
  return import("./priceAlertStorage.js?bust=" + Math.random());
}

describe("loadAlerts — missing file", () => {
  it("returns an empty store", async () => {
    const { loadAlerts } = await load();
    const { store } = await loadAlerts();
    expect(store.version).toBe(1);
    expect(store.alerts).toEqual([]);
  });
});

describe("upsert / load round-trip", () => {
  it("persists an alert and reloads it", async () => {
    const { upsertAlert, loadAlerts } = await load();
    await upsertAlert({ scryfallId: "a", name: "Sol Ring", target: 1.5, direction: "below" });
    const { store } = await loadAlerts();
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toMatchObject({ scryfallId: "a", name: "Sol Ring", target: 1.5, direction: "below" });
  });

  it("upsert replaces the existing alert for the same printing", async () => {
    const { upsertAlert, loadAlerts } = await load();
    await upsertAlert({ scryfallId: "a", name: "Sol Ring", target: 1.5, direction: "below" });
    await upsertAlert({ scryfallId: "a", name: "Sol Ring", target: 9, direction: "above" });
    const { store } = await loadAlerts();
    expect(store.alerts).toHaveLength(1);
    expect(store.alerts[0]).toMatchObject({ target: 9, direction: "above" });
  });

  it("does not leave a .tmp file behind after write", async () => {
    const { upsertAlert } = await load();
    await upsertAlert({ scryfallId: "a", name: "x", target: 2 });
    const files = await fs.readdir(path.join(workDir, "data"));
    expect(files.find(n => n.includes(".tmp."))).toBeUndefined();
    expect(files).toContain("price-alerts.json");
  });
});

describe("removeAlert", () => {
  it("removes one alert and keeps the rest", async () => {
    const { upsertAlert, removeAlert, loadAlerts } = await load();
    await upsertAlert({ scryfallId: "a", name: "A", target: 1 });
    await upsertAlert({ scryfallId: "b", name: "B", target: 2 });
    await removeAlert("a");
    const { store } = await loadAlerts();
    expect(store.alerts.map(x => x.scryfallId)).toEqual(["b"]);
  });
});
