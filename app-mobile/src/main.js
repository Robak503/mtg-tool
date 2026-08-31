import "./styles.css";
import { runWebviewSmoke } from "../../app/src/lib/mobile/webviewSmoke.js";
import { planOfflineAnswer } from "./answerPlanner.js";
import { openKnowledgeRepository } from "./knowledgeRepository.js";
import { cancelGeneration, narratePlan, prepareDefaultModel } from "./modelBridge.js";

const app = document.querySelector("#app");
const conversation = document.querySelector("#conversation");
const form = document.querySelector("#ask-form");
const questionInput = document.querySelector("#question");
const askButton = document.querySelector("#ask-button");
const stopButton = document.querySelector("#stop-button");
const runtimeStatus = document.querySelector("#runtime-status");
const packStatus = document.querySelector("#pack-status");
const modelStatusNode = document.querySelector("#model-status");

const runtime = runWebviewSmoke();
const realm = {
  browserWindow: typeof window === "object" && typeof document === "object",
  processAbsent: typeof process === "undefined",
  bufferAbsent: typeof Buffer === "undefined",
  requireAbsent: typeof window.require === "undefined",
};
const runtimePassed = runtime.passed && Object.values(realm).every(Boolean);
runtimeStatus.textContent = runtimePassed ? "Verified" : "Failed";

let repository;

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

function renderAnswer(answer, question) {
  const facts = answer.facts;
  const article = element("article", `answer-card answer-${answer.status}`);
  const labels = {
    grounded: "VERIFIED LOCAL EVIDENCE",
    matches: "RELATED RULES · NOT A RULING",
    insufficient: "MORE DETAIL NEEDED",
  };
  article.append(
    element("p", "asked-question", question),
    element("div", "answer-kicker", labels[answer.status]),
    element("h2", "", facts.heading),
  );

  if (facts.subheading) article.append(element("p", "card-line", facts.subheading));
  article.append(element("p", "answer-message", facts.message));

  if (facts.details?.length) {
    article.append(element("h3", "", "Official rulings"));
    article.append(renderList(facts.details, "detail-list"));
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

  conversation.replaceChildren(article);
  article.tabIndex = -1;
  article.focus({ preventScroll: true });
  article.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderFailure(error) {
  const article = element("article", "answer-card answer-error");
  article.append(
    element("div", "answer-kicker", "OFFLINE PACK UNAVAILABLE"),
    element("h2", "", "Omnath couldn’t open local knowledge"),
    element("p", "answer-message", "Close and reopen the app. If this persists, send the diagnostic below back to the development task."),
    element("pre", "diagnostic", String(error?.message ?? error)),
  );
  conversation.replaceChildren(article);
}

async function ask(rawQuestion) {
  const question = String(rawQuestion ?? "").trim();
  if (!question || !repository) return;
  questionInput.value = question;
  askButton.disabled = true;
  stopButton.hidden = false;
  app.dataset.state = "answering";
  app.setAttribute("aria-busy", "true");
  conversation.replaceChildren(element("article", "answer-card loading-card", "Checking only the evidence stored on this phone…"));
  try {
    const plan = await planOfflineAnswer(repository, question);
    const narration = await narratePlan(plan);
    renderAnswer({ ...plan, facts: { ...plan.facts, message: narration.text } }, question);
  } catch (error) {
    renderFailure(error);
  } finally {
    askButton.disabled = false;
    stopButton.hidden = true;
    app.dataset.state = "ready";
    app.setAttribute("aria-busy", "false");
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  ask(questionInput.value);
});
stopButton.addEventListener("click", async () => {
  await cancelGeneration();
  stopButton.hidden = true;
  askButton.disabled = false;
  app.dataset.state = "ready";
  app.setAttribute("aria-busy", "false");
});
for (const button of document.querySelectorAll("[data-question]")) {
  button.addEventListener("click", () => ask(button.dataset.question));
}

async function initialize() {
  try {
    if (!runtimePassed) throw new Error("Browser-safe rules runtime probe failed");
    repository = await openKnowledgeRepository((progress) => {
      if (progress.phase === "copying" && progress.totalBytes) {
        packStatus.textContent = `Preparing · ${Math.floor((progress.copiedBytes / progress.totalBytes) * 100)}%`;
      } else {
        packStatus.textContent = progress.phase === "verifying" ? "Verifying" : progress.phase;
      }
    });
    packStatus.textContent = `Verified · ${repository.status.packId}`;
    app.dataset.state = "ready";
    document.querySelector("#startup-title").textContent = "Offline and ready";
    document.querySelector("#startup-copy").textContent = "Ask with full card names for the strongest result. Omnath will quote local evidence or tell you when it needs more detail.";
    document.querySelector(".welcome-card .answer-kicker").textContent = "VERIFIED RULES RUNTIME + KNOWLEDGE PACK";
    modelStatusNode.textContent = "Loading if staged";
    prepareDefaultModel().then((model) => {
      modelStatusNode.textContent = model.state === "ready" ? `Ready · ${model.modelId}` : "Deterministic fallback";
    });
  } catch (error) {
    app.dataset.state = "error";
    packStatus.textContent = "Unavailable";
    renderFailure(error);
  }
}

window.__OMNATH_MOBILE_STATUS__ = {
  runtime: { passed: runtimePassed, results: runtime.results, realm },
  get knowledge() {
    return repository?.status ?? null;
  },
};
console.info("OMNATH_MOBILE_RUNTIME", JSON.stringify(window.__OMNATH_MOBILE_STATUS__.runtime));

initialize();

if (import.meta.env.DEV) {
  const fixture = new URLSearchParams(location.search).get("fixture");
  if (fixture === "insufficient") {
    renderAnswer({ status: "insufficient", answerTrusted: false, facts: { heading: "Fixture: more detail needed", message: "This fixture verifies recovery language and focus." }, citations: [], narrationSlots: [], fallback: "" }, "Fixture question");
  }
}
