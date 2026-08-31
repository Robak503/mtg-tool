import { runWebviewSmoke } from "../webviewSmoke.js";

const runtime = runWebviewSmoke();
const realm = {
  browserWindow: typeof window === "object" && typeof document === "object",
  processAbsent: typeof process === "undefined",
  bufferAbsent: typeof Buffer === "undefined",
  requireAbsent: typeof window.require === "undefined",
};
const report = {
  passed: runtime.passed && Object.values(realm).every(Boolean),
  runtime,
  realm,
};

const root = document.querySelector("#probe");
const title = root.querySelector("h1");
root.dataset.status = report.passed ? "pass" : "fail";
title.textContent = report.passed
  ? "Omnath WebView runtime probe passed"
  : "Omnath WebView runtime probe failed";
document.querySelector("#report").textContent = JSON.stringify(report, null, 2);

window.__OMNATH_WEBVIEW_PROBE__ = report;
