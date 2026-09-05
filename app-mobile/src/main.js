import "./styles.css";
import { createAssistantController } from "./assistantController.js";
import { buildDiagnosticReceipt, copyDiagnosticReceipt } from "./diagnostics.js";
import { createFeedbackStore } from "./feedbackStore.js";
import { openKnowledgeRepository } from "./knowledgeRepository.js";
import { createModelClient } from "./modelBridge.js";
import { createReadingPreferences } from "./readingPreferences.js";

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
const startupGate = document.querySelector("#startup-gate");
const startupGateCopy = document.querySelector("#startup-gate-copy");
let localStorage;
try { localStorage = globalThis.localStorage; } catch { /* Storage is optional. */ }
const feedback = createFeedbackStore(localStorage);
const preferences = createReadingPreferences(localStorage);
const newChatButton = document.querySelector("#new-chat");
let controller;
let uiSequence = 0;
let startupReady = false;
let loadingCard = null;

function applyReadingSettings() {
  const settings = preferences.snapshot();
  document.body.classList.toggle("large-text", settings.largeText);
  document.body.classList.toggle("hide-card-art", !settings.showArt);
  document.querySelector("#large-text").checked = settings.largeText;
  document.querySelector("#show-art").checked = settings.showArt;
  document.querySelector("#expand-rulings").checked = settings.expandRulings;
  for (const details of document.querySelectorAll(".rulings-details")) details.open = settings.expandRulings;
}

for (const [id, key] of [["large-text", "largeText"], ["show-art", "showArt"], ["expand-rulings", "expandRulings"]]) {
  document.querySelector(`#${id}`).addEventListener("change", (event) => {
    const settings = preferences.update({ [key]: event.target.checked });
    applyReadingSettings();
    activityStatus.textContent = settings.saved ? "Reading settings saved on this device." : "Reading settings changed for this session; storage is unavailable.";
  });
}
document.querySelector("#reset-reading").addEventListener("click", () => {
  const settings = preferences.reset();
  applyReadingSettings();
  activityStatus.textContent = settings.saved ? "Reading settings reset." : "Settings reset for this session; storage is unavailable.";
});
applyReadingSettings();

function setAnswering(busy) {
  askButton.disabled = !startupReady || busy;
  questionInput.readOnly = busy;
  stopButton.hidden = !busy;
  for (const button of document.querySelectorAll("[data-question], [data-ask]")) button.disabled = !startupReady || busy;
  app.dataset.state = busy ? "answering" : startupReady ? "ready" : "error";
  conversation.setAttribute("aria-busy", String(busy));
}

function appendTurn(article) {
  conversation.querySelector(".welcome-card")?.remove();
  conversation.append(article);
  // Bound DOM and image memory without putting conversation content on disk.
  const turns = [...conversation.querySelectorAll(":scope > .answer-card")];
  for (const old of turns.slice(0, -8)) old.remove();
}

function finishStartup(ready) {
  startupReady = ready;
  startupGate.hidden = true;
  app.inert = false;
  form.inert = false;
  app.setAttribute("aria-busy", "false");
  document.body.classList.remove("startup-locked");
  questionInput.disabled = !ready;
  newChatButton.disabled = !ready;
  setAnswering(false);
}

function showStartupPhase(progress) {
  const messages = {
    verifying: "Verifying the rules, card details, and artwork stored in the app.",
    copying: "Placing the offline rules and card database in private app storage.",
    "copying-art": "Placing the offline card artwork in private app storage.",
  };
  startupGateCopy.textContent = messages[progress?.phase] ?? startupGateCopy.textContent;
}

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

function renderCardArt(article, answer) {
  if (!answer.cardArt?.dataUrl) return;
  const figure = element("figure", "card-art");
  const picture = element("img");
  picture.alt = `${answer.facts.heading} card`;
  picture.decoding = "async";
  picture.loading = "lazy";
  picture.src = answer.cardArt.dataUrl;
  figure.append(picture);
  article.append(figure);
  if (answer.cardFaces?.length > 1) {
    let artSequence = 0;
    const faces = element("div", "suggestions face-controls");
    for (const face of answer.cardFaces) {
      const button = element("button", "", face.name);
      button.type = "button";
      button.addEventListener("click", async () => {
        const sequence = ++artSequence;
        button.disabled = true;
        const dataUrl = await controller.getCardArt(answer.subject.oracleId, face.index);
        button.disabled = false;
        if (!figure.isConnected || sequence !== artSequence) return;
        if (dataUrl) { picture.src = dataUrl; picture.alt = `${face.name} card`; }
        else activityStatus.textContent = "This face has no available offline preview. Its Oracle text is still below.";
      });
      faces.append(button);
    }
    figure.append(faces);
  }
}

function diagnosticReceipt() {
  const state = controller?.getState() ?? {};
  return buildDiagnosticReceipt({ runtime: state.runtime, knowledge: state.knowledge, model: state.model, lastOutcome: state.lastOutcome, errorCode: state.errorCode, feedback: feedback.snapshot() });
}

function addFeedbackControls(article, answer, question, modelRejection) {
  let ratingRecorded = false;
  const controls = element("div", "answer-feedback");
  controls.setAttribute("aria-label", "Answer feedback");
  controls.append(element("span", "", "Was this useful?"));
  for (const [rating, label] of [["helpful", "Helpful"], ["notHelpful", "Not helpful"]]) {
    const button = element("button", "feedback-button", label);
    button.type = "button";
    button.addEventListener("click", () => {
      if (ratingRecorded) return;
      ratingRecorded = true;
      feedback.recordRating({ rating, status: answer.status, modelRejection });
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
    questionInput.value = question;
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

function renderAnswer(answer, question, contextLabel = null, modelRejection = null) {
  questionInput.value = "";
  const article = element("article", `answer-card answer-${answer.status}`);
  const labels = { grounded: "OMNATH · VERIFIED LOCAL EVIDENCE", matches: "OMNATH · RELATED EVIDENCE · NOT A RULING", insufficient: "OMNATH · MORE DETAIL NEEDED", conversation: "OMNATH · ON THIS DEVICE" };
  article.append(element("p", "asked-question", question), element("div", "answer-kicker", labels[answer.status]), element("h2", "", answer.facts.heading));
  if (contextLabel) article.append(element("p", "context-label", `Following up on ${contextLabel}`));
  renderCardArt(article, answer);
  if (answer.facts.subheading) article.append(element("p", "card-line", answer.facts.subheading));
  article.append(element("p", "answer-message", answer.facts.message));
  if (answer.facts.details?.length) {
    const details = element("details", "rulings-details");
    details.open = preferences.snapshot().expandRulings;
    details.append(element("summary", "", `${answer.facts.detailLabel ?? "Local card evidence"} (${answer.facts.details.length})`), renderList(answer.facts.details, "detail-list"));
    article.append(details);
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
      button.dataset.ask = "true";
      button.addEventListener("click", () => ask(`What does ${suggestion} do?`));
      suggestions.append(button);
    }
    article.append(suggestions);
  }
  if (answer.citations?.length) {
    const footer = element("details", "citations");
    footer.append(element("summary", "", `Sources on device (${answer.citations.length})`));
    for (const citation of answer.citations) footer.append(element("small", "", citation.label));
    article.append(footer);
  }
  if (answer.facts.followUp) article.append(element("p", "follow-up", answer.facts.followUp));
  if (answer.followUps?.length) {
    const links = element("div", "suggestions");
    for (const followUp of answer.followUps) {
      const button = element("button", "", followUp.label);
      button.type = "button";
      button.dataset.ask = "true";
      button.addEventListener("click", () => ask(followUp.question));
      links.append(button);
    }
    article.append(links);
  }
  addFeedbackControls(article, answer, question, modelRejection);
  appendTurn(article);
  article.tabIndex = -1;
  article.focus({ preventScroll: true });
  article.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFailure(code) {
  const messages = {
    runtime_failed: ["Rules runtime didn’t pass its local check", "Restart the app before relying on an answer."],
    knowledge_unavailable: ["Omnath couldn’t open local knowledge", "Close and reopen the app. If this persists, copy the privacy-safe diagnostics."],
    answer_failed: ["That answer couldn’t be completed", "Your local data is unchanged. Try the question again or add more detail."],
    answer_timeout: ["That lookup took too long", "Your earlier answers are still here. Try again, or narrow the question to one card or rule."],
  };
  const [heading, message] = messages[code] ?? messages.answer_failed;
  const article = element("article", "answer-card answer-error");
  article.append(element("div", "answer-kicker", "OFFLINE RECOVERY"), element("h2", "", heading), element("p", "answer-message", message));
  const diagnostics = element("button", "feedback-button", "Copy diagnostics");
  diagnostics.type = "button";
  diagnostics.addEventListener("click", async () => {
    const result = await copyDiagnosticReceipt(diagnosticReceipt());
    diagnostics.textContent = result.copied ? "Diagnostics copied" : "Clipboard unavailable";
    if (!result.copied) {
      article.querySelector(".diagnostic")?.remove();
      const receipt = element("pre", "diagnostic", result.text);
      receipt.tabIndex = 0;
      article.append(receipt);
      receipt.focus();
    }
  });
  article.append(diagnostics);
  appendTurn(article);
  article.tabIndex = -1;
  article.focus();
}

function renderCancelled() {
  const article = element("article", "answer-card answer-insufficient");
  article.append(
    element("div", "answer-kicker", "RESPONSE STOPPED"),
    element("h2", "", "Stopped — your earlier answers are still here"),
    element("p", "answer-message", "Edit the question or ask again whenever you’re ready."),
  );
  appendTurn(article);
  article.tabIndex = -1;
  article.focus();
}

function activity({ phase, tokenCount }) {
  const labels = { retrieving: "Checking only the evidence stored on this phone…", interpreting: "Interpreting the question locally", narrating: "Arranging the verified response locally" };
  activityStatus.textContent = `${labels[phase] ?? "Working locally"}${tokenCount ? ` · ${tokenCount} local tokens` : ""}`;
}

async function ask(rawQuestion) {
  const question = String(rawQuestion ?? "").trim();
  if (!question || !controller || !startupReady || controller.getState().phase === "answering") return;
  if (question.length > 500) { activityStatus.textContent = "Keep the question under 500 characters."; return; }
  const sequence = ++uiSequence;
  questionInput.value = question;
  setAnswering(true);
  loadingCard = element("article", "answer-card loading-card", "Checking local evidence…");
  conversation.append(loadingCard);
  const result = await controller.ask(question, activity);
  if (sequence !== uiSequence) return;
  loadingCard?.remove();
  loadingCard = null;
  if (!result.cancelled && result.answer) {
    renderAnswer(result.answer, question, result.contextLabel, result.model?.rejection);
    activityStatus.textContent = result.answer.status === "conversation" ? "Ready when you are." : result.answer.answerTrusted ? "Verified local evidence ready." : "Qualified local guidance ready.";
  }
  else if (!result.cancelled) renderFailure(result.errorCode);
  else renderCancelled();
  setAnswering(false);
}

form.addEventListener("submit", (event) => { event.preventDefault(); ask(questionInput.value); });
stopButton.addEventListener("click", () => {
  uiSequence += 1;
  void controller?.cancel();
  loadingCard?.remove();
  loadingCard = null;
  renderCancelled();
  setAnswering(false);
  activityStatus.textContent = "Response stopped. You can edit the question and try again.";
  questionInput.focus();
});
newChatButton.addEventListener("click", () => {
  uiSequence += 1;
  if (controller?.getState().phase === "answering") void controller.cancel();
  controller?.clearConversation();
  loadingCard = null;
  conversation.replaceChildren();
  const welcome = element("article", "answer-card welcome-card");
  welcome.append(element("h2", "", "What are we looking at?"), element("p", "answer-message", "Name a card or ask about a rule. I’ll use the library on this phone."));
  conversation.append(welcome);
  questionInput.value = "";
  setAnswering(false);
  activityStatus.textContent = "New chat. Previous conversation context cleared.";
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
    runtimeStatus.textContent = state.runtime?.passed ? "Verified" : state.runtime ? "Failed" : state.phase === "error" ? "Unavailable" : "Checking";
    if (state.knowledge?.packId) packStatus.textContent = `Verified · ${state.knowledge.packId}${state.knowledge.artReady ? " · Art ready" : ""}`;
    document.querySelector("#source-date").textContent = state.knowledge?.sourceDates?.oracle ?? "Not recorded";
    modelStatusNode.textContent = state.model?.state === "ready" ? `Local question helper ready · ${state.model.modelId ?? "local"}` : state.model?.state === "loading" ? "Preparing optional question helper" : "Not loaded · card and rules lookup works";
  });
  const state = await controller.start((progress) => {
    showStartupPhase(progress);
    packStatus.textContent = ["copying", "copying-art"].includes(progress.phase) && progress.totalBytes
      ? `${progress.phase === "copying-art" ? "Preparing card art" : "Preparing knowledge"} · ${Math.floor((progress.copiedBytes / progress.totalBytes) * 100)}%`
      : progress.phase === "verifying" ? "Verifying" : progress.phase;
  });
  if (state.phase === "error") {
    finishStartup(false);
    packStatus.textContent = "Unavailable";
    activityStatus.textContent = "Offline knowledge is unavailable. No answer will be generated.";
    renderFailure(state.errorCode);
    return;
  }
  app.dataset.state = "ready";
  app.setAttribute("aria-busy", "false");
  document.querySelector("#startup-title").textContent = "Offline and ready";
  document.querySelector("#startup-copy").textContent = "What are we looking at? Name a card or ask about a rule. You can follow up with “show it again” or “its rulings.” This chat stays on your phone while the app is open.";
  document.querySelector(".welcome-card .answer-kicker").textContent = "OMNATH · VERIFIED RULES RUNTIME + KNOWLEDGE PACK";
  activityStatus.textContent = "Offline knowledge is ready.";
  finishStartup(true);
  if (fixture?.initialQuestion) {
    const pending = ask(fixture.initialQuestion);
    if (fixture.cancelImmediately) await controller.cancel();
    await pending;
  }
}

window.__OMNATH_MOBILE_STATUS__ = { get state() { return controller?.getState() ?? null; }, diagnostics: () => diagnosticReceipt() };
initialize().catch(() => {
  finishStartup(false);
  activityStatus.textContent = "Startup couldn’t finish. Reopen Omnath to try again.";
  renderFailure("knowledge_unavailable");
});
