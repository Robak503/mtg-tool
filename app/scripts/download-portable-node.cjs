/**
 * download-portable-node.cjs
 *
 * Fetches the Windows x64 Node.js portable archive from nodejs.org
 * and extracts only node.exe to src-tauri/node/node.exe. That binary
 * gets bundled by prepare-tauri-resources.cjs and used by the Tauri
 * shell so the .exe doesn't depend on the user having Node on PATH.
 *
 * Idempotent: if the expected node.exe already exists with the right
 * version recorded in src-tauri/node/VERSION, skip the download.
 *
 * Standalone use: `npm run download:node` or invoked from the build
 * pipeline before `prepare-tauri-resources.cjs` runs.
 *
 * On non-Windows hosts this is a no-op — we only ship the Windows
 * .exe today, and Node binaries are platform-specific.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

// LTS as of 2026-08 — the standalone Next.js server runs on 18.17+ but we
// bundle the CURRENT LTS. Staying current is load-bearing, not hygiene:
// Cloudflare fingerprints the TLS ClientHello, and v22.12.0's older OpenSSL
// handshake was 403'd by Moxfield's edge while v22.23.x passes (measured
// 2026-08-02, byte-identical request through both binaries on one machine).
const NODE_VERSION = "v22.23.2";
const ARCHIVE_NAME = `node-${NODE_VERSION}-win-x64.zip`;
const URL = `https://nodejs.org/dist/${NODE_VERSION}/${ARCHIVE_NAME}`;
const SHASUMS_URL = `https://nodejs.org/dist/${NODE_VERSION}/SHASUMS256.txt`;

const APP_ROOT = path.resolve(__dirname, "..");
const NODE_DIR = path.join(APP_ROOT, "src-tauri", "node");
const NODE_EXE = path.join(NODE_DIR, "node.exe");
const VERSION_FILE = path.join(NODE_DIR, "VERSION");
const ARCHIVE_PATH = path.join(NODE_DIR, ARCHIVE_NAME);

function log(msg) { console.log(`[download-portable-node] ${msg}`); }

if (process.platform !== "win32") {
  log(`Skipping — non-Windows host (${process.platform}). The bundle ships Windows binaries only.`);
  process.exit(0);
}

// Idempotency check
if (fs.existsSync(NODE_EXE) && fs.existsSync(VERSION_FILE)) {
  const have = fs.readFileSync(VERSION_FILE, "utf8").trim();
  if (have === NODE_VERSION) {
    log(`Already have node.exe at ${NODE_VERSION}.`);
    process.exit(0);
  }
  log(`Have ${have}, want ${NODE_VERSION} — re-downloading.`);
}

fs.mkdirSync(NODE_DIR, { recursive: true });

function download(url, dst) {
  return new Promise((resolve, reject) => {
    log(`GET ${url}`);
    const file = fs.createWriteStream(dst);
    https.get(url, (resp) => {
      if (resp.statusCode === 302 || resp.statusCode === 301) {
        file.close();
        fs.unlinkSync(dst);
        return resolve(download(resp.headers.location, dst));
      }
      if (resp.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dst);
        return reject(new Error(`HTTP ${resp.statusCode} for ${url}`));
      }
      const total = parseInt(resp.headers["content-length"] || "0", 10);
      let bytes = 0;
      let lastLogged = 0;
      resp.on("data", (chunk) => {
        bytes += chunk.length;
        if (total && bytes - lastLogged > 1024 * 1024) {
          const pct = ((bytes / total) * 100).toFixed(0);
          log(`  ${pct}% (${(bytes / 1024 / 1024).toFixed(1)}/${(total / 1024 / 1024).toFixed(1)} MB)`);
          lastLogged = bytes;
        }
      });
      resp.pipe(file);
      file.on("finish", () => file.close(resolve));
    }).on("error", (err) => {
      file.close();
      try { fs.unlinkSync(dst); } catch {}
      reject(err);
    });
  });
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (resp) => {
      if (resp.statusCode === 301 || resp.statusCode === 302) {
        return resolve(downloadText(resp.headers.location));
      }
      if (resp.statusCode !== 200) {
        return reject(new Error(`HTTP ${resp.statusCode} for ${url}`));
      }
      let data = "";
      resp.setEncoding("utf8");
      resp.on("data", (chunk) => { data += chunk; });
      resp.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function sha256OfFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// SHASUMS256.txt lines look like: "<hex>  node-vX.Y.Z-win-x64.zip"
function expectedHashFor(sumsText, archiveName) {
  for (const line of String(sumsText).split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === archiveName) return parts[0].toLowerCase();
  }
  return null;
}

function extractNodeExeFromZip(zipPath, outNodeExe) {
  // Use PowerShell's Expand-Archive to avoid bringing in a zip lib
  // dependency. Only spawn a child process to extract, then move the
  // node.exe and rm the temp dir.
  return new Promise((resolve, reject) => {
    const extractTo = path.join(NODE_DIR, "tmp-extract");
    // Force clean state
    try { fs.rmSync(extractTo, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(extractTo, { recursive: true });

    const ps = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${extractTo}' -Force`,
      ],
      { windowsHide: true, stdio: "inherit" },
    );
    ps.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Expand-Archive exited ${code}`));
      }
      // Archive root looks like node-vX.Y.Z-win-x64/
      const entries = fs.readdirSync(extractTo);
      const rootName = entries.find((n) => n.startsWith("node-") && n.endsWith("-win-x64"));
      if (!rootName) {
        return reject(new Error("Could not find node-X.Y.Z-win-x64 dir in archive"));
      }
      const src = path.join(extractTo, rootName, "node.exe");
      if (!fs.existsSync(src)) {
        return reject(new Error(`node.exe not found at ${src}`));
      }
      fs.copyFileSync(src, outNodeExe);
      fs.rmSync(extractTo, { recursive: true, force: true });
      resolve();
    });
  });
}

(async () => {
  try {
    await download(URL, ARCHIVE_PATH);
    log(`Downloaded ${ARCHIVE_NAME}`);

    // Verify the archive against the official SHASUMS256.txt BEFORE extracting.
    // Without this, a tampered / MITM'd / mirror-poisoned zip would be extracted
    // and bundled into the signed .exe — minisign signs the installer after this
    // binary is staged, so the signature would bless a tampered runtime.
    const sums = await downloadText(SHASUMS_URL);
    const expected = expectedHashFor(sums, ARCHIVE_NAME);
    if (!expected) {
      throw new Error(`Could not find ${ARCHIVE_NAME} in SHASUMS256.txt`);
    }
    const actual = await sha256OfFile(ARCHIVE_PATH);
    if (actual !== expected) {
      try { fs.unlinkSync(ARCHIVE_PATH); } catch {}
      throw new Error(
        `SHA-256 mismatch for ${ARCHIVE_NAME} — expected ${expected}, got ${actual}. ` +
          `Refusing to bundle a possibly-tampered Node binary.`,
      );
    }
    log(`SHA-256 verified (${actual.slice(0, 16)}...)`);

    await extractNodeExeFromZip(ARCHIVE_PATH, NODE_EXE);
    fs.writeFileSync(VERSION_FILE, NODE_VERSION);
    fs.unlinkSync(ARCHIVE_PATH);
    const size = fs.statSync(NODE_EXE).size;
    log(`Extracted node.exe (${(size / 1024 / 1024).toFixed(1)} MB) at ${NODE_VERSION}`);
  } catch (err) {
    log(`ERROR: ${err.message || err}`);
    log(`Hint: download ${URL} manually, extract node.exe to ${NODE_EXE}, write "${NODE_VERSION}" to ${VERSION_FILE}.`);
    process.exit(1);
  }
})();
