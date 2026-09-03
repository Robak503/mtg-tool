import { deterministicIntent } from "./interpretationContract.js";

const QUESTION_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "can",
  "card",
  "do",
  "does",
  "explain",
  "for",
  "how",
  "i",
  "in",
  "is",
  "it",
  "me",
  "mean",
  "meaning",
  "of",
  "on",
  "or",
  "please",
  "rule",
  "rules",
  "the",
  "this",
  "to",
  "what",
  "when",
  "with",
  "work",
  "works",
]);

const RULE_SECTION_NUMBER = /^\d{3}\.\d+$/;

function searchTerms(question) {
  return (String(question).match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((token) => !QUESTION_STOP_WORDS.has(token.toLocaleLowerCase("en-US")))
    .join(" ");
}

function comparable(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function questionNamesCard(question, card) {
  const haystack = ` ${comparable(question)} `;
  return [card.name, card.matchedName, ...(card.faces ?? []).map((face) => face.name)]
    .filter(Boolean)
    .some((name) => haystack.includes(` ${comparable(name)} `));
}

function cardLookupName(question) {
  const value = String(question ?? "").trim();
  const quotedName = value.match(/[“"]([^”"]{2,})[”"]/)?.[1];
  if (quotedName) return quotedName;

  const patterns = [
    /^what does\s+(.+?)\s+do\s*[?.!]*$/iu,
    /^show(?: me)?\s+(?:the\s+)?oracle text(?:\s+(?:for|of))?\s+(.+?)\s*[?.!]*$/iu,
    /^oracle text(?:\s+(?:for|of))?\s+(.+?)\s*[?.!]*$/iu,
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) return match[1].trim();
  }
  return value;
}

function cardCitation(card) {
  return {
    kind: "oracle-card",
    label: `${card.name} — Oracle text`,
    oracleId: card.oracleId,
  };
}

function ruleCitation(rule) {
  return {
    kind: "comprehensive-rule",
    label: `Comprehensive Rules ${rule.ruleNumber}`,
    ruleNumber: rule.ruleNumber,
  };
}

async function ruleSection(repository, rule) {
  if (!rule || !RULE_SECTION_NUMBER.test(rule.ruleNumber) || typeof repository.getRuleSection !== "function") {
    return rule ? [rule] : [];
  }
  const rules = await repository.getRuleSection(rule.ruleNumber);
  return rules.length ? rules : [rule];
}

function ruleAnswer(rules) {
  const [rule, ...children] = rules;
  const primary = children[0] ?? rule;
  const citations = rules.map(ruleCitation);
  const relatedRules = children.slice(1);
  return answerPlan("grounded", {
    heading: `Rule ${rule.ruleNumber}`,
    subheading: children.length ? rule.ruleText : undefined,
    message: children.length ? `CR ${primary.ruleNumber} — ${primary.ruleText}` : primary.ruleText,
    details: primary.examples,
  }, citations, {
    relatedRules: Object.freeze(relatedRules),
  });
}

function answerPlan(status, facts, citations = [], extra = {}) {
  const answerTrusted = status === "grounded" && citations.length > 0;
  return Object.freeze({
    status,
    answerTrusted,
    facts: Object.freeze({ ...facts }),
    citations: Object.freeze([...citations]),
    narrationSlots: Object.freeze([
      Object.freeze({ name: "RESULT", value: String(facts.message ?? "") }),
      Object.freeze({ name: "FOLLOW_UP", value: String(facts.followUp ?? "") }),
    ]),
    fallback: String(facts.message ?? ""),
    ...extra,
  });
}

export async function planOfflineAnswer(repository, rawQuestion, verifiedInterpretation = null) {
  const question = String(rawQuestion ?? "").trim();
  if (!question) {
    return answerPlan("insufficient", {
      heading: "Ask Omnath a rules question",
      message: "Name a card, quote a rule number, or describe the interaction you want to check.",
      followUp: "Try a full card name or CR number.",
    });
  }

  const ruleNumber = verifiedInterpretation?.rule?.ruleNumber
    ?? question.match(/\b(?:CR\s*)?(\d{3}\.\d+[a-z]?)\b/i)?.[1];
  if (ruleNumber) {
    const rule = verifiedInterpretation?.rule ?? await repository.getRuleExact(ruleNumber);
    if (rule) {
      return ruleAnswer(await ruleSection(repository, rule));
    }
  }

  const intent = verifiedInterpretation?.intent ?? deterministicIntent(question);
  const interpretedCards = verifiedInterpretation?.cards ?? [];
  const exact = interpretedCards[0] ?? await repository.findCardExact(cardLookupName(question));
  const terms = searchTerms(question);
  const candidates = exact
    ? [exact]
    : terms
      ? await repository.searchCards(terms, 6)
      : [];
  const card = exact ?? candidates.find((candidate) => questionNamesCard(question, candidate));

  if (card && intent === "card_lookup") {
    const rulings = (await repository.getRulings(card.oracleId)).slice(0, 4);
    return answerPlan("grounded", {
      heading: card.name,
      subheading: [card.manaCost, card.typeLine].filter(Boolean).join(" · "),
      message:
        card.oracleText ||
        card.faces
          .map((face) => [face.name, face.oracle_text].filter(Boolean).join(" — "))
          .join("\n\n"),
      details: rulings.map((ruling) => `${ruling.publishedAt}: ${ruling.comment}`),
    }, [
        cardCitation(card),
        ...rulings.map((ruling) => ({
          kind: "official-ruling",
          label: `${card.name} ruling — ${ruling.publishedAt}`,
          oracleId: card.oracleId,
        })),
      ]);
  }

  if (card || interpretedCards.length) {
    const referenceCards = interpretedCards.length ? interpretedCards : [card];
    const reference = referenceCards[0];
    const rulings = (await repository.getRulings(reference.oracleId)).slice(0, 2);
    const rules = terms ? await repository.searchRules(terms, 4) : [];
    return answerPlan("matches", {
      heading: "I found the local card evidence, but not a complete ruling",
      subheading: referenceCards.map(({ name }) => name).join(" · "),
      message:
        "I can quote the cards and related rules stored on this phone, but this interaction still needs a deterministic verdict or more game-state detail before I can call it resolved.",
      details: referenceCards.map(({ name, oracleText }) => `${name}: ${oracleText || "No single-face Oracle text."}`),
      followUp: "Add the zones, targets, timing, and choices involved.",
    }, [
      ...referenceCards.map(cardCitation),
      ...rulings.map((ruling) => ({
        kind: "official-ruling",
        label: `${reference.name} ruling — ${ruling.publishedAt}`,
        oracleId: reference.oracleId,
      })),
      ...rules.map(ruleCitation),
    ], {
      relatedRules: Object.freeze(rules),
      suggestions: Object.freeze(candidates.slice(0, 4).map((candidate) => candidate.name)),
    });
  }

  const rules = terms ? await repository.searchRules(terms, 4) : [];
  if (rules.length) {
    const exactTitleRule = rules.find((rule) => comparable(rule.ruleText) === comparable(terms));
    if (exactTitleRule) {
      return ruleAnswer(await ruleSection(repository, exactTitleRule));
    }
    return answerPlan("matches", {
      heading: "I found related rules, but not enough to rule on the interaction",
      message:
        "These are verbatim offline CR matches, not enough evidence for a ruling. Add the exact card names or the game state before treating one as the answer.",
      followUp: "Add the exact card names and game state.",
    }, rules.map(ruleCitation), {
      relatedRules: Object.freeze(rules),
      suggestions: Object.freeze(candidates.slice(0, 4).map((candidate) => candidate.name)),
    });
  }

  return answerPlan("insufficient", {
    heading: "I can’t verify that from the offline pack yet",
    message:
      "Try the full card name, a CR number such as 702.7, or more detail about the game state. I won’t invent a ruling without local evidence.",
    followUp: "Try the full card name or a CR number such as 702.7.",
  }, [], { suggestions: Object.freeze(candidates.slice(0, 4).map((candidate) => candidate.name)) });
}
