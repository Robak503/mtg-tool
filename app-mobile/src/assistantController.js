import { planOfflineAnswer } from "./answerPlanner.js";
import { resolveInterpretation } from "./interpretationContract.js";

function publicState(state) {
  return Object.freeze({ ...state });
}

export function createAssistantController({ verifyRuntime, openRepository, model }) {
  const listeners = new Set();
  let repository = null;
  let requestSequence = 0;
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
      if (!runtime?.passed) throw Object.assign(new Error("runtime failed"), { code: "runtime_failed" });
      repository = await openRepository(onKnowledgeProgress);
      emit({ phase: "ready", runtime, knowledge: repository.status, model: { state: "loading" } });
      modelSettled = model.prepareDefault().then((result) => {
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
      emit({ phase: "error", errorCode });
      return publicState(state);
    }
  }

  async function ask(rawQuestion, onActivity = () => {}) {
    const question = String(rawQuestion ?? "").trim();
    if (!repository || !question) return { cancelled: false, errorCode: "not_ready" };
    const sequence = ++requestSequence;
    emit({ phase: "answering", errorCode: null });
    try {
      onActivity({ phase: "retrieving", tokenCount: 0 });
      let plan = await planOfflineAnswer(repository, question);
      ensureCurrent(sequence);

      const currentModel = await model.status();
      if (!plan.answerTrusted && currentModel.state === "ready") {
        onActivity({ phase: "interpreting", tokenCount: 0 });
        const proposal = await model.interpret(question, (tokenCount) => onActivity({ phase: "interpreting", tokenCount }));
        ensureCurrent(sequence);
        if (proposal.valid) {
          const resolved = await resolveInterpretation(repository, proposal.candidate);
          ensureCurrent(sequence);
          if (resolved.valid) plan = await planOfflineAnswer(repository, question, resolved.interpretation);
        }
      }

      onActivity({ phase: "narrating", tokenCount: 0 });
      const narration = await model.narrate(plan, (tokenCount) => onActivity({ phase: "narrating", tokenCount }));
      ensureCurrent(sequence);
      const outcome = Object.freeze({
        cancelled: false,
        question,
        answer: Object.freeze({ ...plan, facts: Object.freeze({ ...plan.facts, message: narration.text }) }),
        model: Object.freeze({ used: narration.usedModel, rejection: narration.rejection }),
      });
      emit({ phase: "ready", lastOutcome: { status: plan.status, modelRejection: narration.rejection }, errorCode: null });
      return outcome;
    } catch (error) {
      if (error?.code === "cancelled") return { cancelled: true, errorCode: "cancelled" };
      emit({ phase: "ready", errorCode: "answer_failed", lastOutcome: { status: "error", modelRejection: null } });
      return { cancelled: false, errorCode: "answer_failed" };
    }
  }

  async function cancel() {
    requestSequence += 1;
    await model.cancel();
    return emit({ phase: repository ? "ready" : state.phase, errorCode: "cancelled" });
  }

  return Object.freeze({
    start,
    ask,
    cancel,
    whenModelSettled: () => modelSettled,
    subscribe(listener) {
      listeners.add(listener);
      listener(publicState(state));
      return () => listeners.delete(listener);
    },
    getState: () => publicState(state),
  });
}
