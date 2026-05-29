import path from "node:path";
import { existsSync } from "node:fs";

/**
 * Find the Ollama binary in the well-known Windows install locations.
 * Returns the absolute path if found, null otherwise (and always null off
 * Windows). Doesn't run the binary — just looks on disk, so callers can
 * distinguish "not installed yet" from "installed but the server is down."
 *
 * Shared by /api/ollama-health and /api/install-ollama. Kept in its own module
 * so tests can mock it (the real implementation is host-coupled: platform +
 * install paths + fs).
 */
export function findOllamaBinary() {
  if (process.platform !== "win32") return null;
  const candidates = [
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"),
    process.env["ProgramFiles(x86)"] &&
      path.join(process.env["ProgramFiles(x86)"], "Ollama", "ollama.exe"),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}
