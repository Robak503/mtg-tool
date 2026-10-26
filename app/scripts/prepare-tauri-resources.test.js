/**
 * prepare-tauri-resources.test.js — the installer carries each vendored font's license (2026-10-22).
 *
 * The four UI typefaces (Space Grotesk, Inter, JetBrains Mono, Cinzel) are vendored under
 * src/app/fonts/<family>/ with their SIL Open Font License 1.1 text (OFL.txt). The woff2 files reach the
 * installer inside the Next build; OFL 1.1 condition 2 lets the fonts be bundled with software "provided
 * that each copy contains the above copyright notice and this license", so the staging must put each
 * family's OFL.txt into the bundle too: resources/licenses/fonts/<family>-OFL.txt.
 *
 * The same goes for the portable Node runtime (2026-10-22): download-portable-node.cjs extracts node.exe and
 * Node's LICENSE from the one verified archive into src-tauri/node/, and the staging ships the LICENSE as
 * resources/licenses/node-LICENSE.txt — and refuses a node.exe without it.
 *
 * Runs the real script, copied byte-for-byte into a temp tree beside a copy of the real fonts folder, so
 * it stages into that tree's src-tauri/resources (APP_ROOT is the script's parent folder) and never
 * touches the dev tree's staging or target dirs. Every reference-data file, sync dependency and the
 * standalone server are absent there, which the non-strict staging skips with a warning; CI is cleared so
 * the run is not strict. node.exe is absent too unless a test seeds src-tauri/node/ with stand-in bytes.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(SCRIPTS, "..");
const SCRIPT = path.join(SCRIPTS, "prepare-tauri-resources.cjs");
const FONTS = path.join(APP, "src", "app", "fonts");

function fontFamilies() {
  return fs
    .readdirSync(FONTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

// A temp app tree holding a copy of the script and of the real fonts folder; `edit` may alter the fonts copy,
// and `seedNode` may write files into the tree's src-tauri/node/ (where download-portable-node.cjs extracts to).
function stageInSandbox(edit, seedNode) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-tauri-resources-"));
  try {
    const app = path.join(root, "app");
    fs.mkdirSync(path.join(app, "scripts"), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(app, "scripts", "prepare-tauri-resources.cjs"));
    const fonts = path.join(app, "src", "app", "fonts");
    fs.cpSync(FONTS, fonts, { recursive: true });
    if (edit) edit(fonts);
    if (seedNode) {
      const nodeDir = path.join(app, "src-tauri", "node");
      fs.mkdirSync(nodeDir, { recursive: true });
      seedNode(nodeDir);
    }
    const r = spawnSync(process.execPath, [path.join(app, "scripts", "prepare-tauri-resources.cjs")], {
      env: { ...process.env, CI: "" },
      encoding: "utf8",
    });
    const resources = path.join(app, "src-tauri", "resources");
    const licensesDir = path.join(resources, "licenses", "fonts");
    const staged = fs.existsSync(licensesDir)
      ? Object.fromEntries(fs.readdirSync(licensesDir).sort().map((name) => [name, fs.readFileSync(path.join(licensesDir, name))]))
      : {};
    const read = (rel) => (fs.existsSync(path.join(resources, rel)) ? fs.readFileSync(path.join(resources, rel)) : null);
    return {
      code: r.status,
      stderr: r.stderr,
      staged,
      nodeExe: read(path.join("node", "node.exe")),
      nodeLicense: read(path.join("licenses", "node-LICENSE.txt")),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe("prepare-tauri-resources.cjs stages the font licenses", () => {
  it("each vendored font's OFL.txt is staged as resources/licenses/fonts/<family>-OFL.txt, byte-identical", () => {
    const families = fontFamilies();
    expect(families).toEqual(["cinzel", "inter", "jetbrains-mono", "space-grotesk"]);

    const r = stageInSandbox();
    expect(r.code).toBe(0);
    expect(Object.keys(r.staged)).toEqual(families.map((f) => `${f}-OFL.txt`));
    for (const family of families) {
      const vendored = fs.readFileSync(path.join(FONTS, family, "OFL.txt"));
      expect(vendored.toString("utf8")).toContain("SIL Open Font License, Version 1.1");
      expect(r.staged[`${family}-OFL.txt`].equals(vendored), `${family}-OFL.txt differs from fonts/${family}/OFL.txt`).toBe(true);
    }
  });

  it("a font folder without its OFL.txt fails the staging and names the folder", () => {
    const r = stageInSandbox((fonts) => fs.rmSync(path.join(fonts, "inter", "OFL.txt")));
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("src/app/fonts/inter/");
  });

  it("the bundle ships the whole staged resources tree (control: tauri.conf.json's resources glob)", () => {
    const conf = JSON.parse(fs.readFileSync(path.join(APP, "src-tauri", "tauri.conf.json"), "utf8"));
    expect(conf.bundle.resources).toContain("resources/**/*");
  });
});

// Stand-ins for what download-portable-node.cjs extracts — not Node's binary or license text.
const FIXTURE_EXE = Buffer.from("MZ fixture: stands in for node.exe\n", "utf8");
const FIXTURE_LICENSE = Buffer.from(
  "FIXTURE: stands in for the LICENSE of the official Node.js archive.\r\nA second line, not ASCII: ü ø 漢\n",
  "utf8",
);

describe("prepare-tauri-resources.cjs stages node.exe with Node's LICENSE", () => {
  it("node.exe's LICENSE is staged as resources/licenses/node-LICENSE.txt, byte-identical, beside the binary", () => {
    const r = stageInSandbox(null, (nodeDir) => {
      fs.writeFileSync(path.join(nodeDir, "node.exe"), FIXTURE_EXE);
      fs.writeFileSync(path.join(nodeDir, "LICENSE"), FIXTURE_LICENSE);
    });
    expect(r.code, r.stderr).toBe(0);
    expect(r.nodeExe?.equals(FIXTURE_EXE)).toBe(true);
    expect(r.nodeLicense?.equals(FIXTURE_LICENSE), "node-LICENSE.txt differs from src-tauri/node/LICENSE").toBe(true);
  });

  it("node.exe without its LICENSE fails the staging, names the missing file, and stages no node.exe", () => {
    const r = stageInSandbox(null, (nodeDir) => fs.writeFileSync(path.join(nodeDir, "node.exe"), FIXTURE_EXE));
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("src-tauri/node/node.exe has no LICENSE");
    expect(r.nodeExe).toBeNull();
  });

  it("no node.exe: no Node license is staged, even with a LICENSE in src-tauri/node/ (control)", () => {
    const r = stageInSandbox(null, (nodeDir) => fs.writeFileSync(path.join(nodeDir, "LICENSE"), FIXTURE_LICENSE));
    expect(r.code, r.stderr).toBe(0);
    expect(r.nodeExe).toBeNull();
    expect(r.nodeLicense).toBeNull();
  });
});
