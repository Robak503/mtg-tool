import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Tauri shell uses an offline CSP and explicit read-only SQL permissions", () => {
  const config = JSON.parse(read("src-tauri/tauri.conf.json"));
  const csp = config.app.security.csp;
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src ipc: http:\/\/ipc\.localhost/);
  assert.match(csp, /object-src 'none'/);
  assert.doesNotMatch(csp, /https:|wss:|\*/);

  const capability = JSON.parse(read("src-tauri/capabilities/default.json"));
  assert.deepEqual(capability.permissions.filter((permission) => permission.startsWith("sql:")), [
    "sql:allow-load", "sql:allow-select", "sql:allow-close",
  ]);
});

test("the chat shell exposes recovery, live status, bounded input, and hidden-state semantics", () => {
  const html = read("index.html");
  const css = read("src/styles.css");
  assert.match(html, /id="activity-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /textarea[^>]*maxlength="500"/);
  assert.match(html, /aria-describedby="composer-privacy"/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /prefers-reduced-motion/);
});

test("optional copy progress cannot gate opening the offline pack", () => {
  const repository = read("src/knowledgeRepository.js");
  assert.doesNotMatch(repository, /addPluginListener/);
  assert.match(repository, /Progress is optional and must never prevent/);
});
