import "./styles.css";
import { createAssistantController } from "./assistantController.js";
import { buildDiagnosticReceipt, copyDiagnosticReceipt } from "./diagnostics.js";
import { createFeedbackStore } from "./feedbackStore.js";
import { openKnowledgeRepository } from "./knowledgeRepository.js";
import { createModelClient } from "./modelBridge.js";

const app = document.querySelector("#app");
const conversation = document.querySelector("#conversation");
const form = document.querySelector("#ask-form");
const questionInput = document.querySelector("#question");
const askButton = document.querySelector("#ask-button");
const stopButton = document.querySelector("#stop-button");
const runtimeStatus = document.querySelector("#runtime-status");
const packStatus = document.querySelector("#pack-status");
const modelStatusNode = document.querySelector("#model-status");
const activityStatus = document.querySelector("#activity-status");
const feedback = createFeedbackStore(globalThis.localStorage);
let controller;
let lastQuestion = "";
let ratingRecorded = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderList(items, className) {
  const list = element("ul", className);
  for (const item of items) list.append(element("li", "", item));
  return list;
}

function diagnosticReceipt() {
  const state = controller?.getState() ?? {};
  return buildDiagnosticReceipt({ runtime: state.runtime, knowledge: state.knowledge, model: state.model, lastOutcome: state.lastOutcome, feedback: feedback.snapshot() });
}

function addFeedbackControls(article, answer) {
  const controls = element("div", "answer-feedback");
  controls.setAttribute("aria-label", "Answer feedback");
  controls.append(element("span", "", "Was this useful?"));
  for (const [rating, label] of [["helpful", "Helpful"], ["notHelpful", "Not helpful"]]) {
    const button = element("button", "feedback-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      if (ratingRecorded) return;
      ratingRecorded = true;
      feedback.recordRating({ rating, status: answer.status, modelRejection: controller.getState().lastOutcome?.modelRejection });
      for (const peer of controls.querySelectorAll(".feedback-button[data-rating]")) peer.disabled = true;
      button.textContent = `${label} · saved privately`;
      activityStatus.textContent = "Feedback saved on this device without the question or answer text.";
    });
    button.dataset.rating = rating;
    controls.append(button);
  }
  const revise = element("button", "feedback-button", "Revise question");
  revise.type = "button";
  revise.addEventListener("click", () => {
    feedback.recordCorrection({ status: answer.status });
    questionInput.value = lastQuestion;
    questionInput.focus();
    activityStatus.textContent = "Edit the question, then ask again.";
  });
  const diagnostics = element("button", "feedback-button", "Copy diagnostics");
  diagnostics.type = "button";
  diagnostics.addEventListener("click", async () => {
    const result = await copyDiagnosticReceipt(diagnosticReceipt());
    if (result.copied) {
      diagnostics.textContent = "Diagnostics copied";
      activityStatus.textContent = "Privacy-safe diagnostics copied.";
    } else {
      const pre = element("pre", "diagnostic", result.text);
      pre.tabIndex = 0;
      article.append(pre);
      pre.focus();
      activityStatus.textContent = "Clipboard unavailable. Diagnostics are shown below.";
    }
  });
  controls.append(revise, diagnostics);
  article.append(controls);
}

function renderAnswer(answer, question) {
  ratingRecorded = false;
  lastQuestion = question;
  const article = element("article", `answer-card answer-${answer.status}`);
  const labels = { grounded: "VERIFIED LOCAL EVIDENCE", matches: "RELATED EVIDENCE · NOT A RULING", insufficient: "MORE DETAIL NEEDED" };
  article.append(element("p", "asked-question", question), element("div", "answer-kicker", labels[answer.status]), element("h2", "", answer.facts.heading));
  if (answer.facts.subheading) article.append(element("p", "card-line", answer.facts.subheading));
  article.append(element("p", "answer-message", answer.facts.message));
  if (answer.facts.details?.length) {
    article.append(element("h3", "", answer.answerTrusted ? "Official rulings" : "Local card evidence"));
    article.append(renderList(answer.facts.details, "detail-list"));
  }
  if (answer.relatedRules?.length) {
    const rules = element("div", "rule-results");
    for (const rule of answer.relatedRules) {
      const result = element("article", "rule-result");
      result.append(element("strong", "", `CR ${rule.ruleNumber}`), element("p", "", rule.ruleText));
      rules.append(result);
    }
    article.append(rules);
  }
  if (answer.suggestions?.length) {
    article.append(element("h3", "", "Possible card matches"));
    const suggestions = element("div", "suggestions");
    for (const suggestion of answer.suggestions) {
      const button = element("button", "", suggestion);
      button.type = "button";
      button.addEventListener("click", () => ask(`What does ${suggestion} do?`));
      suggestions.append(button);
    }
    article.append(suggestions);
  }
  if (answer.citations?.length) {
    const footer = element("footer", "citations");
    footer.append(element("span", "", "Sources on device"));
    for (const citation of answer.citations) footer.append(element("small", "", citation.label));
    article.append(footer);
  }
  addFeedbackControls(article, answer);
  conversation.replaceChildren(article);
  article.tabIndex = -1;
  article.focus({ preventScroll: true });
  article.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFailure(code) {
  const messages = {
    runtime_failed: ["Rules runtime didn’t pass its local check", "Restart the app before relying on an answer."],
    knowledge_unavailable: ["Omnath couldn’t open local knowledge", "Close and reopen the app. If this persists, copy the privacy-safe diagnostics."],
    answer_failed: ["That answer couldn’t be completed", "Your local data is unchanged. Try the question again or add more detail."],
  };
  const [heading, message] = messages[code] ?? messages.answer_failed;
  const article = element("article", "answer-card answer-error");
  article.append(element("div", "answer-kicker", "OFFLINE RECOVERY"), element("h2", "", heading), element("p", "answer-message", message));
  const diagnostics = element("button", "feedback-button", "Copy diagnostics");
  diagnostics.type = "button";
  diagnostics.addEventListener("click", async () => {
    const result = await copyDiagnosticReceipt(diagnosticReceipt());
    diagnostics.textContent = result.copied ? "Diagnostics copied" : "Clipboard unavailable";
  });
  article.append(diagnostics);
  conversation.replaceChildren(article);
  article.tabIndex = -1;
  article.focus();
}

function renderCancelled() {
  const article = element("article", "answer-card answer-insufficient");
  article.append(
    element("div", "answer-kicker", "RESPONSE STOPPED"),
    element("h2", "", "No answer was changed or saved"),
    element("p", "answer-message", "Edit the question or ask again whenever you’re ready."),
  );
  conversation.replaceChildren(article);
  article.tabIndex = -1;
  article.focus();
}

function activity({ phase, tokenCount }) {
  const labels = { retrieving: "Checking only the evidence stored on this phone…", interpreting: "Interpreting the question locally", narrating: "Arranging the verified response locally" };
  activityStatus.textContent = `${labels[phase] ?? "Working locally"}${tokenCount ? ` · ${tokenCount} local tokens` : ""}`;
}

async function ask(rawQuestion) {
  const question = String(rawQuestion ?? "").trim();
  if (!question || !controller || controller.getState().phase === "error") return;
  questionInput.value = question;
  askButton.disabled = true;
  stopButton.hidden = false;
  app.dataset.state = "answering";
  app.setAttribute("aria-busy", "true");
  conversation.replaceChildren(element("article", "answer-card loading-card", "Checking local evidence…"));
  const result = await controller.ask(question, activity);
  if (!result.cancelled && result.answer) {
    renderAnswer(result.answer, question);
    activityStatus.textContent = result.answer.answerTrusted ? "Verified local evidence ready." : "Qualified local guidance ready.";
  }
  else if (!result.cancelled) renderFailure(result.errorCode);
  else renderCancelled();
  askButton.disabled = false;
  stopButton.hidden = true;
  app.dataset.state = "ready";
  app.setAttribute("aria-busy", "false");
}

form.addEventListener("submit", (event) => { event.preventDefault(); ask(questionInput.value); });
stopButton.addEventListener("click", async () => {
  await controller?.cancel();
  stopButton.hidden = true;
  askButton.disabled = false;
  app.dataset.state = "ready";
  app.setAttribute("aria-busy", "false");
  activityStatus.textContent = "Response stopped. You can edit the question and try again.";
  questionInput.focus();
});
for (const button of document.querySelectorAll("[data-question]")) button.addEventListener("click", () => ask(button.dataset.question));

async function productionDependencies() {
  return {
    verifyRuntime: async () => {
      const { runWebviewSmoke } = await import("../../app/src/lib/mobile/webviewSmoke.js");
      const runtime = runWebviewSmoke();
      const realm = { browserWindow: typeof window === "object" && typeof document === "object", processAbsent: typeof process === "undefined", bufferAbsent: typeof Buffer === "undefined", requireAbsent: typeof window.require === "undefined" };
      return { ...runtime, passed: runtime.passed && Object.values(realm).every(Boolean), realm };
    },
    openRepository: openKnowledgeRepository,
    model: createModelClient(),
  };
}

async function initialize() {
  const fixtureName = import.meta.env.DEV ? new URLSearchParams(location.search).get("fixture") : null;
  const fixture = fixtureName ? (await import("./fixtures.js")).createFixtureDependencies(fixtureName) : null;
  controller = createAssistantController(fixture ?? await productionDependencies());
  controller.subscribe((state) => {
    runtimeStatus.textContent = state.runtime?.passed ? "Verified" : state.phase === "error" ? "Failed" : "Checking";
    if (state.knowledge?.packId) packStatus.textContent = `Verified · ${state.knowledge.packId}`;
    modelStatusNode.textContent = state.model?.state === "ready" ? `Ready · ${state.model.modelId}` : state.model?.state === "loading" ? "Loading if staged" : "Deterministic fallback";
  });
  const state = await controller.start((progress) => {
    packStatus.textContent = progress.phase === "copying" && progress.totalBytes
      ? `Preparing · ${Math.floor((progress.copiedBytes / progress.totalBytes) * 100)}%`
      : progress.phase === "verifying" ? "Verifying" : progress.phase;
  });
  if (state.phase === "error") {
    packStatus.textContent = "Unavailable";
    activityStatus.textContent = "Offline knowledge is unavailable. No answer will be generated.";
    renderFailure(state.errorCode);
    return;
  }
  app.dataset.state = "ready";
  app.setAttribute("aria-busy", "false");
  document.querySelector("#startup-title").textContent = "Offline and ready";
  document.querySelector("#startup-copy").textContent = "Ask with full card names for the strongest result. Omnath will quote local evidence or tell you when it needs more detail.";
  document.querySelector(".welcome-card .answer-kicker").textContent = "VERIFIED RULES RUNTIME + KNOWLEDGE PACK";
  activityStatus.textContent = "Offline knowledge is ready.";
  if (fixture?.initialQuestion) {
    const pending = ask(fixture.initialQuestion);
    if (fixture.cancelImmediately) await controller.cancel();
    await pending;
  }
}

window.__OMNATH_MOBILE_STATUS__ = { get state() { return controller?.getState() ?? null; }, diagnostics: () => diagnosticReceipt() };
initialize();
