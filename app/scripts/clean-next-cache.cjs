#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = path.resolve(__dirname, "..");
const NEXT_DIR = path.join(APP_ROOT, ".next");

if (!fs.existsSync(NEXT_DIR)) {
  process.exit(0);
}

fs.rmSync(NEXT_DIR, { recursive: true, force: true });
console.log("Removed stale .next cache.");
