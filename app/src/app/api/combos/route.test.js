/**
 * Smoke + contract test for /api/combos.
 *
 * Per CLAUDE.md gotcha #10: every new route gets at least an import smoke test
 * so a latent ReferenceError can't ship silently. We also assert the response
 * contract the RightPanel Combos tab relies on (included / almostIncluded
 * arrays + a `ready` flag), which holds whether or not the local Spellbook
 * snapshot is present.
 */

import { describe, expect, it } from "vitest";

describe("/api/combos — module load and request handling", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports GET + POST handlers", async () => {
    const mod = await import("./route.js");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });

  it("POST returns the combo-result contract", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/combos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardNames: ["Thassa's Oracle", "Demonic Consultation"] }),
    });
    const resp = await mod.POST(req);
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(200);

    const body = await resp.json();
    expect(Array.isArray(body.included)).toBe(true);
    expect(Array.isArray(body.almostIncluded)).toBe(true);
    expect(typeof body.ready).toBe("boolean");
  });

  it("POST without a cardNames array is a 400", async () => {
    const mod = await import("./route.js");
    const req = new Request("http://localhost/api/combos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nope: true }),
    });
    const resp = await mod.POST(req);
    expect(resp.status).toBe(400);
  });
});
