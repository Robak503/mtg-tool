// Optional browser suite: start npm run dev -- --host 127.0.0.1 --port 5175.
// Install Playwright locally, or pass PLAYWRIGHT_MODULE pointing at its entry.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.OMNATH_TEST_URL || "http://127.0.0.1:5175";
const browser = await chromium.launch({ channel: process.env.OMNATH_BROWSER_CHANNEL || "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, reducedMotion: "reduce" });
await context.addInitScript(() => {
  Object.defineProperty(navigator, "clipboard", { value: { async writeText() { throw new Error("clipboard denied for recovery test"); } } });
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const open = async (fixture) => {
  await page.goto(`${base}/?fixture=${fixture}`);
  await page.locator("#startup-gate").waitFor({ state: "hidden" });
};
const ask = async (question) => {
  await page.locator("#question").fill(question);
  await page.locator("#ask-button").click();
  await page.waitForFunction(() => document.querySelector("#app").dataset.state === "ready");
};
try {
  await page.goto(`${base}/?fixture=startup-loading`);
  assert.equal(await page.locator("#startup-gate").isVisible(), true);
  assert.equal(await page.locator("#app").getAttribute("inert"), "");
  assert.equal(await page.locator("#question").isDisabled(), true);
  console.log("PASS startup blocks keyboard and pointer access");

  await open("ready");
  await ask("What does Omnath, Locus of Creation do?");
  await ask("its rulings");
  assert.equal(await page.locator(".asked-question").count(), 2);
  assert.match(await page.locator(".context-label").innerText(), /Omnath/);
  assert.equal(await page.locator(".rulings-details[open]").count(), 0);
  await page.locator(".reading-settings summary").click();
  await page.locator("#large-text").check();
  await page.locator("#expand-rulings").check();
  assert.equal(await page.locator(".rulings-details[open]").count(), 2);
  await page.locator(".reading-settings summary").click();
  await page.locator(".answer-feedback").first().getByRole("button", { name: "Helpful", exact: true }).click();
  await page.locator(".answer-feedback").last().getByRole("button", { name: "Helpful", exact: true }).click();
  const stored = await page.evaluate(() => ({ ...localStorage }));
  assert.equal(JSON.parse(stored["omnath.feedback.v1"]).totals.helpful, 2);
  assert.equal(JSON.stringify(stored).includes("its rulings"), false);
  assert.equal(JSON.stringify(stored).includes("Locus of Creation"), false);
  await page.locator(".answer-feedback").first().getByRole("button", { name: "Revise question" }).click();
  assert.equal(await page.locator("#question").inputValue(), "What does Omnath, Locus of Creation do?");
  console.log("PASS transcript, follow-up context, settings, and per-answer feedback");
  await mkdir("build/review", { recursive: true });
  await page.locator(".answer-card").last().scrollIntoViewIfNeeded();
  await page.screenshot({ path: "build/review/companion-430.png" });

  for (let i = 0; i < 8; i++) await ask("Omnath, Locus of Creation");
  assert.equal(await page.locator(".asked-question").count(), 8);
  await page.locator("#new-chat").click();
  assert.equal(await page.locator(".asked-question").count(), 0);
  await ask("its rulings");
  assert.equal(await page.locator(".context-label").count(), 0);
  await page.reload();
  await page.locator("#startup-gate").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".asked-question").count(), 0);
  assert.match(await page.locator("body").getAttribute("class"), /large-text/);
  console.log("PASS bounded transcript, new chat, and settings-only persistence");

  await open("slow-query");
  await ask("Omnath, Locus of Creation");
  await page.locator("#question").fill("Hang");
  await page.locator("#ask-button").click();
  await page.locator("#stop-button").waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-question]").first().isDisabled(), true);
  await page.locator("#stop-button").click();
  await ask("Omnath, Locus of Creation");
  assert.equal(await page.locator(".asked-question").count(), 2);
  assert.equal(await page.locator(".loading-card").count(), 0);
  console.log("PASS stop of a never-resolving lookup and immediate recovery");

  await page.setViewportSize({ width: 320, height: 740 });
  const fits = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth <= innerWidth,
    input: document.querySelector("#question").getBoundingClientRect().width > 100,
  }));
  assert.deepEqual(fits, { page: true, input: true });
  await page.screenshot({ path: "build/review/companion-320.png" });
  console.log("PASS 320px layout with large text and visible composer");

  await open("pack-error");
  assert.equal(await page.locator("#ask-button").isDisabled(), true);
  assert.equal(await page.locator("#startup-gate").isVisible(), false);
  await page.getByRole("button", { name: "Copy diagnostics" }).click();
  assert.equal(await page.locator(".diagnostic").count(), 1);
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log("PASS startup recovery and clipboard-unavailable diagnostic fallback");
} catch (error) {
  console.error(JSON.stringify({ errors, body: await page.locator("body").innerText() }));
  throw error;
} finally {
  await browser.close();
}
