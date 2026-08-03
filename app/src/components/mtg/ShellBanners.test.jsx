/**
 * ShellBanners render gates (A2 safe subset) — the direct fingerprint the extraction was gated
 * on: every STATE of each banner renders its real affordances (SSR; the repo bans jsdom/RTL),
 * and none of them carries a looping animation. The call-site wiring in MTGAssistant is covered
 * by the suite + lint; these pin the moved markup itself.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppUpdateBanner, FirstLaunchImportBanner, OllamaHealthBanner } from "./ShellBanners.jsx";

const noop = () => {};
const F = "Inter";

describe("AppUpdateBanner — three states", () => {
  const base = { onSeeDetails: noop, onDismiss: noop, fontFamily: F };
  it("installing: names the version, no buttons (zero-touch)", () => {
    const raw = renderToStaticMarkup(createElement(AppUpdateBanner, { ...base, info: { installing: true, version: "0.151.0" } }));
    expect(raw).toContain("Installing MTG Tool v0.151.0");
    expect(raw).toContain("relaunch");
    expect(raw).not.toContain("See details");
    expect(raw).not.toMatch(/aria-label="Dismiss update notification"/);
  });
  it("installFailed: red palette, retry pointer, dismissible", () => {
    const raw = renderToStaticMarkup(createElement(AppUpdateBanner, { ...base, info: { installFailed: true, version: "0.151.0" } }));
    expect(raw).toContain("Auto-install of v0.151.0 failed");
    expect(raw).toContain("--ley-red");
    expect(raw).toContain("See details");
    expect(raw).toMatch(/aria-label="Dismiss update notification"/);
  });
  it("available: shows both versions and the body excerpt", () => {
    const raw = renderToStaticMarkup(createElement(AppUpdateBanner, { ...base, info: { version: "0.151.0", current: "0.150.1", body: "Bug fixes." } }));
    expect(raw).toContain("v0.151.0 is available");
    expect(raw).toContain("you have v0.150.1");
    expect(raw).toContain("Bug fixes.");
  });
  it("no info → nothing", () => {
    expect(renderToStaticMarkup(createElement(AppUpdateBanner, { ...base, info: null }))).toBe("");
  });
});

describe("FirstLaunchImportBanner — idle/busy/result states", () => {
  const base = { sourcePath: "", onSourcePathChange: noop, onImport: noop, onDismiss: noop, fontFamily: F };
  it("idle: welcome copy, path input, Import disabled on empty path", () => {
    const raw = renderToStaticMarkup(createElement(FirstLaunchImportBanner, { ...base, busy: false, result: null }));
    expect(raw).toContain("Welcome to MTG Tool");
    expect(raw).toMatch(/placeholder="C:\\path/);
    expect(raw).toMatch(/<button[^>]*disabled[^>]*>Import<\/button>/);
  });
  it("busy: the button says Importing… and the input is disabled", () => {
    const raw = renderToStaticMarkup(createElement(FirstLaunchImportBanner, { ...base, sourcePath: "C:\\data", busy: true, result: null }));
    expect(raw).toContain("Importing…");
    expect(raw).toMatch(/<input[^>]*disabled/);
  });
  it("result ok lists the copied files and the reload notice; result error shows the error", () => {
    const ok = renderToStaticMarkup(createElement(FirstLaunchImportBanner, { ...base, busy: false, result: { ok: true, copied: ["decks.local.json"] } }));
    expect(ok).toContain("✓ Imported");
    expect(ok).toContain("decks.local.json");
    expect(ok).toContain("reloading");
    const err = renderToStaticMarkup(createElement(FirstLaunchImportBanner, { ...base, busy: false, result: { ok: false, error: "no such dir" } }));
    expect(err).toContain("✗ no such dir");
  });
});

describe("OllamaHealthBanner — three states + busy overlays", () => {
  const base = { installBusy: false, pullBusy: false, installLog: "", pullProgress: "", onInstall: noop, onPull: noop, onUseAnthropic: noop, onDismiss: noop, fontFamily: F };
  it("not-installed + canAutoInstall: Install button + Anthropic escape", () => {
    const raw = renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, health: { ok: false, status: "not-installed", canAutoInstall: true, message: "Ollama was not found." } }));
    expect(raw).toContain("Ollama not installed");
    expect(raw).toContain("Install Ollama");
    expect(raw).toContain("Use Anthropic instead");
  });
  it("server-down: red palette, no install/pull buttons", () => {
    const raw = renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, health: { ok: false, status: "server-down", message: "Start ollama serve." } }));
    expect(raw).toContain("Ollama not running");
    expect(raw).toContain("--ley-red");
    expect(raw).not.toContain("Install Ollama");
    expect(raw).not.toContain("Pull ");
  });
  it("model-missing: names the first missing model on the Pull button; busy shows the chat-now path + progress log", () => {
    const raw = renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, health: { ok: false, status: "model-missing", missing: ["qwen2.5:32b"], message: "Model missing." } }));
    expect(raw).toContain("Pull qwen2.5:32b");
    const busy = renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, pullBusy: true, pullProgress: "downloading 42%", health: { ok: false, status: "model-missing", missing: ["qwen2.5:32b"], message: "Model missing." } }));
    expect(busy).toContain("Pulling…");
    expect(busy).toContain("Chat now via API");
    expect(busy).toContain("downloading 42%");
  });
  it("healthy or absent health → nothing", () => {
    expect(renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, health: { ok: true } }))).toBe("");
    expect(renderToStaticMarkup(createElement(OllamaHealthBanner, { ...base, health: null }))).toBe("");
  });
});

describe("the pulse ban", () => {
  it("no banner state carries a looping animation", () => {
    const renders = [
      createElement(AppUpdateBanner, { info: { installing: true, version: "1" }, onSeeDetails: noop, onDismiss: noop, fontFamily: F }),
      createElement(FirstLaunchImportBanner, { sourcePath: "x", busy: true, result: null, onSourcePathChange: noop, onImport: noop, onDismiss: noop, fontFamily: F }),
      createElement(OllamaHealthBanner, { health: { ok: false, status: "model-missing", missing: ["m"], message: "" }, installBusy: false, pullBusy: true, installLog: "", pullProgress: "x", onInstall: noop, onPull: noop, onUseAnthropic: noop, onDismiss: noop, fontFamily: F }),
    ];
    for (const el of renders) expect(renderToStaticMarkup(el)).not.toMatch(/\binfinite\b/);
  });
});
