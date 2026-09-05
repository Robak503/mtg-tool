// Only explicit references to the last verified subject are resolved here.
// This session never persists questions, answers, or inferred player facts.
export function createConversationSession() {
  let subject = null;
  return Object.freeze({
    remember(answer) {
      if (answer.status === "conversation") return;
      subject = answer.answerTrusted && answer.subject ? { ...answer.subject } : null;
    },
    clear() { subject = null; },
    resolve(question) {
      const text = String(question ?? "").trim();
      if (!subject) return { question: text, contextLabel: null };
      const reference = /^(?:(?:show|read)(?: me)? (?:it|that|that card|that rule)(?: again)?|(?:show(?: me)? )?(?:its |the )?(?:oracle text|official rulings|rulings))\s*[?.!]*$/i;
      if (!reference.test(text)) return { question: text, contextLabel: null };
      return {
        question: subject.kind === "card" ? `What does ${subject.name} do?` : `Show CR ${subject.ruleNumber}`,
        contextLabel: subject.kind === "card" ? subject.name : `CR ${subject.ruleNumber}`,
      };
    },
  });
}
