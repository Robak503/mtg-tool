import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildWebviewProbe } from "./webview-bundle.mjs";

const outputs = [];

afterEach(() => {
  for (const output of outputs.splice(0)) {
    fs.rmSync(output, { recursive: true, force: true });
  }
});

function filesUnder(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(full));
    else files.push(full);
  }
  return files;
}

describe("Omnath WebView production bundle", () => {
  it("builds the declared runtime for ES2020 without Node or server residue", async () => {
    const result = await buildWebviewProbe();
    outputs.push(result.outDir);

    expect(fs.existsSync(result.indexHtml)).toBe(true);
    expect(fs.existsSync(result.manifest)).toBe(true);

    const files = filesUnder(result.outDir);
    const scripts = files.filter((file) => file.endsWith(".js"));
    expect(scripts).toHaveLength(1);

    const bundle = scripts.map((file) => fs.readFileSync(file, "utf8")).join("\n");
    expect(bundle).toContain("__OMNATH_WEBVIEW_PROBE__");
    expect(bundle).not.toMatch(/(?:node:|@tauri-apps|src\/lib\/server|src\/app\/api)/);
    expect(bundle).not.toContain("Calling `require`");

    const totalBytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
    expect(totalBytes).toBeGreaterThan(0);
  });

  it("refuses to empty or overwrite an output directory outside the temp probe boundary", async () => {
    await expect(
      buildWebviewProbe({ outDir: path.resolve(process.cwd(), "unsafe-probe-output") }),
    ).rejects.toThrow(/Refusing WebView probe output/);
  });
});
