/**
 * Tests for ensureDailySnapshot (Vault V1 #21) — the launch-time daily price
 * snapshot trigger. Best-effort + never-throws, so history accrues even for
 * users who rarely open the Vault.
 */

import { describe, expect, it, vi } from "vitest";

import { ensureDailySnapshot } from "./dailySnapshot.js";

describe("ensureDailySnapshot", () => {
  it("POSTs the daily snapshot endpoint", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    await ensureDailySnapshot(fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/collection/prices", { method: "POST" });
  });

  it("never rejects when the request fails (advisory)", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(ensureDailySnapshot(fetchMock)).resolves.toBeUndefined();
  });

  it("is a no-op when no fetch implementation is available", async () => {
    await expect(ensureDailySnapshot(null)).resolves.toBeUndefined();
  });
});
