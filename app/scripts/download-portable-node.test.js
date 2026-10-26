/**
 * download-portable-node.test.js — the bundled Node runtime's LICENSE comes out of the same verified archive (2026-10-22).
 *
 * The installer bundles a portable node.exe taken from the official Node.js zip after its SHA-256 is checked against
 * nodejs.org's SHASUMS256.txt. The zip also carries Node's LICENSE (the Node.js MIT license, whose notice is to be
 * "included in all copies or substantial portions of the Software", and the licenses of the third-party code built into
 * node.exe); the script used to extract only node.exe. It now extracts node.exe and LICENSE together into
 * src-tauri/node/, from the one verified archive, or neither, and re-fetches a node.exe that has no LICENSE beside it.
 *
 * Runs the real script, copied byte-for-byte into a temp app tree (its NODE_DIR is <tree>/app/src-tauri/node), with
 * https.get replaced by a preload: the stub serves a fixture zip built below and a SHASUMS256.txt line for it, records
 * every URL the script asks for, and fails any other request (http and https.request throw), so no test touches the
 * network. The fixture mirrors the official layout — one node-<version>-win-x64/ root folder — with stand-in bytes;
 * it is not Node's binary or license text. Windows only, like the script (it exits 0 on any other platform) and its
 * PowerShell Expand-Archive extraction.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "download-portable-node.cjs");
const VERSION = /const NODE_VERSION = "(v\d+\.\d+\.\d+)";/.exec(fs.readFileSync(SCRIPT, "utf8"))?.[1];
const ROOT = `node-${VERSION}-win-x64`;
const ARCHIVE_NAME = `${ROOT}.zip`;
const ZIP_URL = `https://nodejs.org/dist/${VERSION}/${ARCHIVE_NAME}`;
const SUMS_URL = `https://nodejs.org/dist/${VERSION}/SHASUMS256.txt`;

const FIXTURE_EXE = Buffer.from("MZ fixture: stands in for node.exe\n", "utf8");
const FIXTURE_LICENSE = Buffer.from(
  "FIXTURE: stands in for the LICENSE of the official Node.js archive.\r\nA second line, not ASCII: ü ø 漢\n",
  "utf8",
);

const STUB = `"use strict";
const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const { EventEmitter } = require("node:events");
const { Readable } = require("node:stream");
const bodies = new Map([
  [process.env.STUB_ZIP_URL, fs.readFileSync(process.env.STUB_ZIP)],
  [process.env.STUB_SUMS_URL, fs.readFileSync(process.env.STUB_SUMS)],
]);
function blocked() { throw new Error("stub: no network in this test"); }
https.get = (url, opts, cb) => {
  if (typeof opts === "function") cb = opts;
  const u = String(url);
  fs.appendFileSync(process.env.STUB_LOG, u + "\\n");
  const req = new EventEmitter();
  setImmediate(() => {
    const body = bodies.get(u);
    if (!body) return req.emit("error", new Error("stub: no network in this test (" + u + ")"));
    const resp = Readable.from([body], { objectMode: false });
    resp.statusCode = 200;
    resp.headers = { "content-length": String(body.length) };
    cb(resp);
  });
  return req;
};
https.request = blocked;
http.get = blocked;
http.request = blocked;
`;

// A zip of stored (uncompressed) entries — enough for Expand-Archive, with no zip dependency.
function zipStored(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x21, 12); // date 1980-01-01 (time 00:00, method 0 = stored, flags 0)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0); // central directory header
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x21, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(dir, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// The official zip's shape: one root folder holding node.exe, LICENSE and the rest of the distribution.
function fixtureArchive({ withLicense = true } = {}) {
  const entries = [
    [`${ROOT}/node.exe`, FIXTURE_EXE],
    [`${ROOT}/README.md`, Buffer.from("fixture readme\n")],
    [`${ROOT}/node_modules/npm/package.json`, Buffer.from('{"name":"npm"}\n')],
  ];
  if (withLicense) entries.splice(1, 0, [`${ROOT}/LICENSE`, FIXTURE_LICENSE]);
  return zipStored(entries);
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

// Runs the copied script against the stub; `before` may seed src-tauri/node/. Returns src-tauri/node/'s files after.
function runInSandbox({ archive, sums, before }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "download-portable-node-"));
  try {
    const app = path.join(root, "app");
    fs.mkdirSync(path.join(app, "scripts"), { recursive: true });
    const script = path.join(app, "scripts", "download-portable-node.cjs");
    fs.copyFileSync(SCRIPT, script);
    const nodeDir = path.join(app, "src-tauri", "node");
    if (before) {
      fs.mkdirSync(nodeDir, { recursive: true });
      before(nodeDir);
    }
    const zipPath = path.join(root, "fixture.zip");
    const sumsPath = path.join(root, "SHASUMS256.txt");
    const logPath = path.join(root, "requests.log");
    const stubPath = path.join(root, "https-stub.cjs");
    fs.writeFileSync(zipPath, archive);
    fs.writeFileSync(sumsPath, sums ?? `${sha256(archive)}  ${ARCHIVE_NAME}\n`);
    fs.writeFileSync(logPath, "");
    fs.writeFileSync(stubPath, STUB);
    const r = spawnSync(process.execPath, ["-r", stubPath, script], {
      env: {
        ...process.env,
        STUB_ZIP: zipPath,
        STUB_SUMS: sumsPath,
        STUB_LOG: logPath,
        STUB_ZIP_URL: ZIP_URL,
        STUB_SUMS_URL: SUMS_URL,
      },
      encoding: "utf8",
      timeout: 120_000,
    });
    const files = fs.existsSync(nodeDir)
      ? Object.fromEntries(
          fs
            .readdirSync(nodeDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((e) => [e.name, e.isFile() ? fs.readFileSync(path.join(nodeDir, e.name)) : "<dir>"]),
        )
      : {};
    const requests = fs.readFileSync(logPath, "utf8").split("\n").filter(Boolean);
    return { code: r.status, out: `${r.stdout}\n${r.stderr}`, files, requests };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform !== "win32")("download-portable-node.cjs extracts node.exe with its LICENSE", () => {
  it("reads the pinned version from the script (control: the fixture's root folder and URLs are built from it)", () => {
    expect(VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
  });

  it("a fresh tree: node.exe and LICENSE both come out of the verified archive, byte-identical, then VERSION", () => {
    const r = runInSandbox({ archive: fixtureArchive() });
    expect(r.code, r.out).toBe(0);
    expect(r.requests).toEqual([ZIP_URL, SUMS_URL]);
    expect(Object.keys(r.files)).toEqual(["LICENSE", "node.exe", "VERSION"]);
    expect(r.files["node.exe"].equals(FIXTURE_EXE)).toBe(true);
    expect(r.files.LICENSE.equals(FIXTURE_LICENSE), "LICENSE differs from the archive's").toBe(true);
    expect(r.files.VERSION.toString("utf8")).toBe(VERSION);
  }, 120_000);

  it("an archive without LICENSE fails the download and writes neither node.exe nor VERSION", () => {
    const r = runInSandbox({ archive: fixtureArchive({ withLicense: false }) });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("LICENSE not found");
    expect(r.files["node.exe"]).toBeUndefined();
    expect(r.files.VERSION).toBeUndefined();
  }, 120_000);

  it("node.exe at the pinned version without its LICENSE (the old script's output) is re-fetched and gets it", () => {
    const r = runInSandbox({
      archive: fixtureArchive(),
      before: (dir) => {
        fs.writeFileSync(path.join(dir, "node.exe"), "stale binary from a binary-only extraction\n");
        fs.writeFileSync(path.join(dir, "VERSION"), VERSION);
      },
    });
    expect(r.code, r.out).toBe(0);
    expect(r.requests).toEqual([ZIP_URL, SUMS_URL]);
    expect(r.files.LICENSE?.equals(FIXTURE_LICENSE)).toBe(true);
    expect(r.files["node.exe"].equals(FIXTURE_EXE)).toBe(true);
  }, 120_000);

  it("node.exe, LICENSE and VERSION at the pinned version: nothing is fetched (control)", () => {
    const r = runInSandbox({
      archive: fixtureArchive(),
      before: (dir) => {
        fs.writeFileSync(path.join(dir, "node.exe"), FIXTURE_EXE);
        fs.writeFileSync(path.join(dir, "LICENSE"), FIXTURE_LICENSE);
        fs.writeFileSync(path.join(dir, "VERSION"), VERSION);
      },
    });
    expect(r.code, r.out).toBe(0);
    expect(r.requests).toEqual([]);
  }, 120_000);

  it("an archive whose SHA-256 is not the published one extracts nothing (control: the verification still gates)", () => {
    const r = runInSandbox({ archive: fixtureArchive(), sums: `${"0".repeat(64)}  ${ARCHIVE_NAME}\n` });
    expect(r.code).not.toBe(0);
    expect(r.out).toContain("SHA-256 mismatch");
    expect(Object.keys(r.files)).toEqual([]);
  }, 120_000);
});
