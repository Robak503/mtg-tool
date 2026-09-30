/**
 * /api/sync-data — refresh bundled reference data from official sources.
 *
 * GET  → status snapshot: which datasets are present in the live data
 *        dir, when each was last synced, age in days
 * POST { action }
 *   "scryfall-bulk" → run sync-scryfall-bulk.cjs (downloads Scryfall
 *                     bulk files; skips the unused all_cards giant)
 *   "spellbook"     → run sync-spellbook.cjs (Commander Spellbook
 *                     combos + cards; rate-limited, ~5-15 min)
 *   "edhrec-salt"   → run sync-edhrec-salt.cjs (top salt cards)
 *   "oracle-index"  → run build-oracle-index.cjs (rebuilds slim index)
 *   "rules-index"   → run build-rules-index.cjs (rebuilds rules index)
 *   "all"           → runs scryfall-bulk → oracle-index → spellbook →
 *                     edhrec-salt → rules-index sequentially
 *
 * All POSTs stream Server-Sent Events. Event payloads:
 *   { phase, text }                     — log line
 *   { phase, step, totalSteps }         — phase change (for "all")
 *   { done: true, ok: boolean, summary } — terminal event
 *
 * Resolves scripts in this priority order:
 *   1. MTG_REFERENCE_DIR/../scripts/   ← bundled .exe (Tauri shell sets)
 *   2. app/scripts/                    ← dev tree
 * The dev fallback keeps the same route usable from `npm run dev`
 * without a custom env. Scripts themselves already honor MTG_APP_ROOT
 * so writes land in the right place.
 */

export const runtime = "nodejs";

import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { dataPath, dataPathSource, appRoot } from "../../../lib/server/paths";
import { invalidateCachesFor } from "../../../lib/server/syncCacheInvalidation";

const SCRIPTS = {
  "scryfall-bulk": "sync-scryfall-bulk.cjs",
  spellbook: "sync-spellbook.cjs",
  "edhrec-salt": "sync-edhrec-salt.cjs",
  "cardkingdom-prices": "sync-cardkingdom-prices.cjs",
  "oracle-index": "build-oracle-index.cjs",
  "printings-index": "build-collection-printings-index.cjs",
  "rules-index": "build-rules-index.cjs",
};

const PHASE_LABELS = {
  "scryfall-bulk": "Scryfall bulk data",
  spellbook: "Commander Spellbook combos",
  "edhrec-salt": "EDHREC salt scores",
  "cardkingdom-prices": "Card Kingdom fallback prices",
  "oracle-index": "Slim oracle index",
  "printings-index": "Collection card index (printings)",
  "rules-index": "Rules retrieval index",
};

// COLD-START HARDENING (B3): indexes DERIVED from a dataset — they are rebuilt FROM the primary
// file and go stale the instant it's refreshed on its own. The full ("all") sequence already
// rebuilds them in order; this map closes the SINGLE-action gap so a lone "scryfall-bulk" sync
// (which rewrites oracle_cards.json + the printings source) can't leave the slim oracle-index /
// printings-index pointing at the old data. streamSingle chains these after the primary succeeds.
const DERIVED_FOLLOWUPS = {
  "scryfall-bulk": ["oracle-index", "printings-index"],
};

// Datasets surfaced by GET — file → label + freshness source
const DATASETS = [
  {
    key: "scryfall-bulk",
    file: ["scryfall-bulk", "manifest.json"],
    label: "Scryfall bulk data",
    timestampField: "generatedAt",
  },
  {
    key: "spellbook",
    file: ["spellbook-meta.local.json"],
    label: "Commander Spellbook combos",
    timestampField: "syncedAt",
  },
  {
    key: "edhrec-salt",
    file: ["edhrec-salt-meta.local.json"],
    label: "EDHREC salt scores",
    timestampField: "syncedAt",
  },
  {
    key: "cardkingdom-prices",
    file: ["cardkingdom-prices.json"],
    label: "Card Kingdom fallback prices",
    timestampField: "generatedAt",
  },
  {
    key: "oracle-index",
    file: ["scryfall-bulk", "oracle-index.json"],
    label: "Slim oracle index",
    timestampField: "generatedAt",
  },
  {
    key: "printings-index",
    file: ["scryfall-bulk", "printings-index.json"],
    label: "Collection card index (printings)",
    timestampField: "generatedAt",
  },
  {
    key: "rules-index",
    file: ["rules-index.json"],
    label: "Rules retrieval index",
    timestampField: null /* uses file mtime */,
  },
];

function findScriptsDir() {
  const refDir = process.env.MTG_REFERENCE_DIR;
  if (refDir && refDir.trim()) {
    // resources/scripts/ sits next to resources/data/
    const bundled = path.resolve(refDir.trim(), "..", "scripts");
    return bundled;
  }
  // Dev: <app>/scripts/
  return path.join(appRoot(), "scripts");
}

async function statOrNull(p) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function readJsonOrNull(p) {
  try {
    return JSON.parse(await fs.readFile(p, "utf8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const out = [];
  for (const ds of DATASETS) {
    const file = dataPath(...ds.file);
    const stat = await statOrNull(file);
    let timestamp = null;
    if (stat) {
      if (ds.timestampField) {
        const meta = await readJsonOrNull(file);
        if (meta && meta[ds.timestampField]) timestamp = meta[ds.timestampField];
        else timestamp = stat.mtime.toISOString();
      } else {
        timestamp = stat.mtime.toISOString();
      }
    }
    const ageMs = timestamp ? Date.now() - new Date(timestamp).getTime() : null;
    const ageDays = ageMs !== null ? Math.floor(ageMs / 86_400_000) : null;
    out.push({
      key: ds.key,
      label: ds.label,
      present: stat !== null,
      // Which copy reads resolve to: "bundle" (the app's shipped snapshot — newer than the last sync)
      // or "appdata" (the writable copy an in-app sync wrote). See paths.js REFERENCE DATA FRESHNESS.
      source: dataPathSource(...ds.file),
      sizeBytes: stat?.size ?? 0,
      syncedAt: timestamp,
      ageDays,
      stale: ageDays !== null && ageDays > 30,
    });
  }
  return Response.json({ datasets: out, dataDir: dataPath() });
}

/**
 * Spawn a script and yield SSE events as it produces output. Honors
 * MTG_APP_ROOT / MTG_JUDGE_DIR / MTG_REFERENCE_DIR for the child so it
 * writes to the right place.
 */
function runScriptToStream(phase, scriptName, controller) {
  const encoder = new TextEncoder();
  const scriptPath = path.join(findScriptsDir(), scriptName);

  const send = (obj) => {
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
    } catch {
      /* stream closed by client */
    }
  };

  return new Promise((resolve) => {
    send({ phase, text: `→ running ${scriptName}` });

    let proc;
    try {
      // Use process.execPath so we spawn the SAME Node binary that's
      // running the server — that's the bundled portable node.exe in
      // the .exe, and the system Node in dev. Avoids depending on
      // "node" being on the child's PATH.
      proc = spawn(process.execPath, [scriptPath], {
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          // Make sure children inherit these so their writes go to AppData.
          MTG_APP_ROOT: process.env.MTG_APP_ROOT || appRoot(),
        },
      });
    } catch (e) {
      send({ phase, text: `spawn failed: ${e.message || e}` });
      resolve({ ok: false, exitCode: -1 });
      return;
    }

    proc.stdout?.on("data", (d) => send({ phase, text: d.toString() }));
    proc.stderr?.on("data", (d) => send({ phase, text: d.toString() }));

    proc.on("error", (err) => {
      send({ phase, text: `error: ${err.message}` });
      resolve({ ok: false, exitCode: -1 });
    });

    proc.on("close", (code) => {
      send({ phase, text: `← ${scriptName} exited ${code}` });
      resolve({ ok: code === 0, exitCode: code });
    });
  });
}

function streamSingle(action, scriptName) {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };
      const result = await runScriptToStream(action, scriptName, controller);
      // Drop stale server caches so the freshly-written data is visible without
      // a restart (A5). Only on success — a failed sync left the old files.
      if (result.ok) invalidateCachesFor(action);

      // COLD-START HARDENING (B3): rebuild any indexes DERIVED from this dataset so a lone
      // single-action sync leaves a self-consistent set. A derived rebuild that FAILS is worse
      // than not syncing (the index now points at data that moved), so it flips the whole sync
      // to not-ok with a summary that names the stale index — never silently "refreshed".
      let ok = result.ok;
      let summary = result.ok
        ? `${PHASE_LABELS[action] || action} refreshed`
        : `${PHASE_LABELS[action] || action} failed (exit ${result.exitCode})`;
      if (result.ok) {
        for (const dep of DERIVED_FOLLOWUPS[action] || []) {
          if (!SCRIPTS[dep]) continue;
          send({
            phase: dep,
            text: `↳ rebuilding ${PHASE_LABELS[dep] || dep} (derived from ${PHASE_LABELS[action] || action})`,
          });
          const depResult = await runScriptToStream(dep, SCRIPTS[dep], controller);
          if (depResult.ok) {
            invalidateCachesFor(dep);
          } else {
            ok = false;
            summary = `${PHASE_LABELS[action] || action} refreshed, but the ${PHASE_LABELS[dep] || dep} rebuild failed (exit ${depResult.exitCode}) — that index may now be stale; re-run it.`;
          }
        }
      }

      send({ done: true, ok, exitCode: result.exitCode, summary });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function streamFullSequence() {
  // Order matters: download Scryfall bulk first, then rebuild the oracle-index
  // and printings-index off the fresh data; spellbook + salt next; rules-index
  // last (independent of card data, just needs the bundled mtg-judge codex).
  const sequence = [
    ["scryfall-bulk", SCRIPTS["scryfall-bulk"]],
    ["oracle-index", SCRIPTS["oracle-index"]],
    ["printings-index", SCRIPTS["printings-index"]],
    ["spellbook", SCRIPTS["spellbook"]],
    ["edhrec-salt", SCRIPTS["edhrec-salt"]],
    ["cardkingdom-prices", SCRIPTS["cardkingdom-prices"]],
    ["rules-index", SCRIPTS["rules-index"]],
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {}
      };
      const totalSteps = sequence.length;
      let failures = 0;
      for (let i = 0; i < sequence.length; i++) {
        const [action, scriptName] = sequence[i];
        send({
          phase: action,
          step: i + 1,
          totalSteps,
          text: `[${i + 1}/${totalSteps}] ${PHASE_LABELS[action]}`,
        });
        const result = await runScriptToStream(action, scriptName, controller);
        if (result.ok) invalidateCachesFor(action);
        else failures += 1;
      }
      send({
        done: true,
        ok: failures === 0,
        summary:
          failures === 0
            ? `All ${totalSteps} datasets refreshed`
            : `${failures} of ${totalSteps} steps failed — see log`,
      });
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body?.action || "").trim();
  if (action === "all") return streamFullSequence();
  if (SCRIPTS[action]) return streamSingle(action, SCRIPTS[action]);
  return Response.json(
    {
      ok: false,
      error: `Unknown action: ${action}. Try: ${["all", ...Object.keys(SCRIPTS)].join(", ")}`,
    },
    { status: 400 },
  );
}
