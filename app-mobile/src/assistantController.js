import { planOfflineAnswer } from "./answerPlanner.js";
import { resolveInterpretation } from "./interpretationContract.js";
import { boundedOperation, operationError } from "./asyncOperation.js";
import { createConversationSession } from "./conversationSession.js";

function publicState(state) {
  return Object.freeze({ ...state });
}

function safeFailedKnowledge(status) {
  if (!status || typeof status !== "object") return null;
  return Object.freeze({
    ready: false,
    schemaVersion: Number(status.schemaVersion ?? 0),
    packId: status.packId ?? null,
    databaseBytes: Number(status.databaseBytes ?? 0),
    databaseSha256: status.databaseSha256 ?? null,
    artReady: status.artReady === true,
    artPackId: status.artPackId ?? null,
    artDatabaseBytes: Number(status.artDatabaseBytes ?? 0),
    artDatabaseSha256: status.artDatabaseSha256 ?? null,
    error: status.error ? "unavailable" : null,
    artError: status.artError ? "unavailable" : null,
  });
}

export function createAssistantController({ verifyRuntime, openRepository, model, requestTimeoutMs = 15000, modelTimeoutMs = 12000 }) {
  const listeners = new Set();
  let repository = null;
  let requestSequence = 0;
  let activeRequest = null;
  const session = createConversationSession();
  let modelSettled = Promise.resolve({ state: "unavailable" });
  let state = {
    phase: "booting",
    runtime: null,
    knowledge: null,
    model: { state: "checking" },
    lastOutcome: null,
    errorCode: null,
  };

  const emit = (patch = {}) => {
    state = { ...state, ...patch };
    const snapshot = publicState(state);
    for (const listener of listeners) listener(snapshot);
    return snapshot;
  };

  const ensureCurrent = (sequence) => {
    if (sequence !== requestSequence) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
  };

  async function start(onKnowledgeProgress) {
    emit({ phase: "booting", errorCode: null });
    try {
      const runtime = await verifyRuntime();
      emit({ runtime });
      if (!runtime?.passed) throw Object.assign(new Error("runtime failed"), { code: "runtime_failed" });
      repository = await openRepository(onKnowledgeProgress);
      emit({ phase: "ready", runtime, knowledge: repository.status, model: { state: "loading" } });
      modelSettled = boundedOperation(() => model.prepareDefault(), { timeoutMs: 120000 }).then((result) => {
        emit({ model: result?.state === "ready" ? result : { state: "unavailable" } });
        return result;
      }).catch(() => {
        const unavailable = { state: "unavailable" };
        emit({ model: unavailable });
        return unavailable;
      });
      return publicState(state);
    } catch (error) {
      const errorCode = error?.code === "runtime_failed" ? "runtime_failed" : "knowledge_unavailable";
      emit({ phase: "error", errorCode, knowledge: safeFailedKnowledge(error?.knowledgeStatus) });
      return publicState(state);
    }
  }

  async function ask(rawQuestion, onActivity = () => {}) {
    const originalQuestion = String(rawQuestion ?? "").trim();
    if (!repository || !originalQuestion) return { cancelled: false, errorCode: "not_ready" };
    if (originalQuestion.length > 500) return { cancelled: false, errorCode: "question_too_long" };
    // Keep a single native generation owner. The UI disables other submitters.
    if (activeRequest) return { cancelled: false, errorCode: "busy" };
    const sequence = ++requestSequence;
    const abort = new AbortController();
    activeRequest = abort;
    const { question, contextLabel } = session.resolve(originalQuestion);
    const run = (work, timeoutMs = requestTimeoutMs) => boundedOperation(work, { signal: abort.signal, timeoutMs });
    const activity = (value) => { if (sequence === requestSequence && !abort.signal.aborted) onActivity(value); };
    emit({ phase: "answering", errorCode: null });
    try {
      activity({ phase: "retrieving", tokenCount: 0 });
      let plan = await run(() => planOfflineAnswer(repository, question));
      ensureCurrent(sequence);
      let modelUsed = false;
      let modelRejection = plan.answerTrusted || plan.status === "conversation" ? "not_needed" : "unavailable";
      // Verbatim evidence needs no generation. The model only assists unresolved intent.
      if (!plan.answerTrusted && plan.status !== "conversation") {
        try {
          const currentModel = await run(() => model.status(), 2000);
          ensureCurrent(sequence);
          emit({ model: currentModel?.state === "ready" ? currentModel : state.model });
          if (currentModel?.state === "ready") {
            activity({ phase: "interpreting", tokenCount: 0 });
            const proposal = await run(() => model.interpret(question, (tokenCount) => activity({ phase: "interpreting", tokenCount })), modelTimeoutMs);
            ensureCurrent(sequence);
            modelRejection = proposal.reason ?? "invalid_intent";
            if (proposal.valid) {
              const resolved = await run(() => resolveInterpretation(repository, proposal.candidate));
              ensureCurrent(sequence);
              if (resolved.valid) {
                plan = await run(() => planOfflineAnswer(repository, question, resolved.interpretation));
                modelUsed = true;
                modelRejection = null;
              } else modelRejection = resolved.reason;
            }
          }
        } catch (error) {
          ensureCurrent(sequence);
          if (error?.code === "cancelled") throw error;
          modelRejection = error?.code === "timeout" ? "timeout" : "generation_failed";
          void boundedOperation(() => model.cancel(), { timeoutMs: 1000 }).catch(() => null);
        }
      }
      ensureCurrent(sequence);
      const outcome = Object.freeze({
        cancelled: false,
        question: originalQuestion,
        contextLabel,
        answer: plan,
        model: Object.freeze({ used: modelUsed, rejection: modelRejection }),
      });
      session.remember(plan);
      emit({ phase: "ready", lastOutcome: { status: plan.status, modelRejection }, errorCode: null });
      return outcome;
    } catch (error) {
      if (error?.code === "cancelled" || sequence !== requestSequence) return { cancelled: true, errorCode: "cancelled" };
      const errorCode = error?.code === "timeout" ? "answer_timeout" : "answer_failed";
      emit({ phase: "ready", errorCode, lastOutcome: { status: "error", modelRejection: null } });
      return { cancelled: false, errorCode };
    } finally {
      if (activeRequest === abort) activeRequest = null;
    }
  }

  async function cancel() {
    requestSequence += 1;
    activeRequest?.abort(operationError("cancelled"));
    activeRequest = null;
    void boundedOperation(() => model.cancel(), { timeoutMs: 1000 }).catch(() => null);
    return emit({ phase: repository ? "ready" : state.phase, errorCode: "cancelled" });
  }

  return Object.freeze({
    start,
    ask,
    cancel,
    clearConversation() { session.clear(); },
    getCardArt: (oracleId, faceIndex) => boundedOperation(() => repository?.getCardArt?.(oracleId, faceIndex), { timeoutMs: 2000 }).catch(() => null),
    whenModelSettled: () => modelSettled,
    subscribe(listener) {
      listeners.add(listener);
      listener(publicState(state));
      return () => listeners.delete(listener);
    },
    getState: () => publicState(state),
  });
}
