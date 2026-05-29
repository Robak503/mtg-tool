/**
 * /api/install-ollama — install Ollama via winget, then pull recommended
 * model. Used by the Ollama health banner when the .exe user lands on a
 * machine without Ollama yet.
 *
 * Two POST actions, both Windows-only:
 *
 *   { action: "install" }
 *     Spawns `winget install Ollama.Ollama -e --silent --accept-source-
 *     agreements --accept-package-agreements`. Windows shows the UAC
 *     prompt; everything else is silent. Returns when winget exits.
 *     {ok, exitCode, stdout, stderr, installedAfter}
 *
 *   { action: "pull-model", model: "qwen2.5:14b" }
 *     Spawns `ollama pull <model>` and streams stdout/stderr as
 *     Server-Sent Events. Model pulls are minutes long for 9GB+ files
 *     so progress streaming is essential.
 *     Stream events: { text }... terminated by { done: true, exitCode }
 *
 * GET — returns { installed, binaryPath } without doing anything. Used
 * by the UI to poll for completion after install kicks off.
 */

export const runtime = "nodejs";

import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync } from "node:fs";

/** Re-implements ollama-health's binary detection so this route can answer GET. */
function findOllamaBinary() {
  if (process.platform !== "win32") return null;
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Ollama", "ollama.exe"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

export async function GET() {
  const binaryPath = findOllamaBinary();
  return Response.json({
    installed: binaryPath !== null,
    binaryPath,
    platform: process.platform,
  });
}

function runInstall() {
  return new Promise((resolve) => {
    let proc;
    try {
      // winget lives in WindowsApps which is on PATH for desktop sessions
      // but not always for spawned child processes — fall back to the
      // explicit user-profile path if needed.
      proc = spawn(
        "winget",
        [
          "install",
          "Ollama.Ollama",
          "-e",
          "--silent",
          "--accept-source-agreements",
          "--accept-package-agreements",
        ],
        { windowsHide: true, shell: false },
      );
    } catch (e) {
      resolve({ ok: false, error: `Failed to spawn winget: ${e.message || e}` });
      return;
    }

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      resolve({
        ok: false,
        error: `winget spawn error: ${err.message}`,
        hint: "Make sure App Installer is installed (Microsoft Store) and on PATH.",
      });
    });

    proc.on("close", (code) => {
      const installedAfter = findOllamaBinary() !== null;
      resolve({
        ok: code === 0 && installedAfter,
        exitCode: code,
        // Keep payloads small — winget can print a lot during install.
        stdout: stdout.slice(-1500),
        stderr: stderr.slice(-1500),
        installedAfter,
        binaryPath: findOllamaBinary(),
      });
    });
  });
}

function streamModelPull(model) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (obj) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          // Stream closed under us — best-effort, keep going till spawn exits
        }
      };

      let proc;
      try {
        proc = spawn("ollama", ["pull", model], { windowsHide: true, shell: false });
      } catch (e) {
        send({ error: `Failed to spawn ollama: ${e.message || e}` });
        send({ done: true, exitCode: -1 });
        controller.close();
        return;
      }

      proc.stdout?.on("data", (d) => send({ text: d.toString() }));
      proc.stderr?.on("data", (d) => send({ text: d.toString() }));

      proc.on("error", (err) => {
        send({ error: `ollama spawn error: ${err.message}` });
        send({ done: true, exitCode: -1 });
        controller.close();
      });

      proc.on("close", (code) => {
        send({ done: true, exitCode: code });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}

export async function POST(req) {
  if (process.platform !== "win32") {
    return Response.json(
      { ok: false, error: "Auto-install only supported on Windows." },
      { status: 400 },
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body?.action || "");

  if (action === "install") {
    const result = await runInstall();
    return Response.json(result, { status: result.ok ? 200 : 500 });
  }

  if (action === "pull-model") {
    const model = String(body?.model || "qwen2.5:14b").trim();
    if (!/^[a-zA-Z0-9._:\-/]+$/.test(model)) {
      return Response.json({ ok: false, error: "Invalid model name" }, { status: 400 });
    }
    return streamModelPull(model);
  }

  return Response.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
