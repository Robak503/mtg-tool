const INTENTS = new Set(["card_lookup", "rule_lookup", "interaction", "unknown"]);
const ALLOWED_KEYS = new Set(["intent", "cardNames", "ruleNumber"]);
const RULE_NUMBER = /^\d{3}\.\d+[a-z]?$/i;

function invalid(reason) {
  return Object.freeze({ valid: false, reason, candidate: null });
}

export function deterministicIntent(question) {
  const value = String(question ?? "").trim();
  if (isDirectRuleLookup(value)) return "rule_lookup";
  if (/\b(?:combo|interaction|work together|interact|what happens|in response|target(?:s|ing)?|trigger(?:s|ed|ing)?)\b/i.test(value)) {
    return "interaction";
  }
  if (/^(?:can|does|do|would|will|if|why|how)\b/i.test(value)) return "interaction";
  if (/^\s*(?:what does|what is|show(?: me)?|read|oracle text|explain|tell me about)\b/i.test(value)) return "card_lookup";
  return "unknown";
}

export function isDirectRuleLookup(question) {
  return /^(?:(?:show|read|explain)(?: me)?\s+|what is\s+)?(?:(?:CR|rule)\s*)?\d{3}\.\d+[a-z]?\s*[?.!]*$/i.test(String(question ?? "").trim());
}

export function validateInterpretation(value, maxLength = 800) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maxLength) return invalid("length");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalid("invalid-json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return invalid("shape");
  const keys = Object.keys(parsed);
  if (keys.some((key) => !ALLOWED_KEYS.has(key)) || keys.length !== ALLOWED_KEYS.size) {
    return invalid("keys");
  }
  if (!INTENTS.has(parsed.intent)) return invalid("intent");
  if (!Array.isArray(parsed.cardNames) || parsed.cardNames.length > 3) return invalid("card-names");

  if (parsed.cardNames.some((name) => typeof name !== "string")) return invalid("card-name-type");
  const cardNames = parsed.cardNames.map((name) => name.trim());
  if (cardNames.some((name) => name.length < 2 || name.length > 120)) return invalid("card-name-length");
  const unique = new Set(cardNames.map((name) => name.toLocaleLowerCase("en-US")));
  if (unique.size !== cardNames.length) return invalid("duplicate-card");

  const ruleNumber = parsed.ruleNumber == null ? null : String(parsed.ruleNumber).trim();
  if (ruleNumber !== null && !RULE_NUMBER.test(ruleNumber)) return invalid("rule-number");
  if (parsed.intent === "card_lookup" && (cardNames.length !== 1 || ruleNumber !== null)) return invalid("card-lookup-shape");
  if (parsed.intent === "rule_lookup" && (ruleNumber === null || cardNames.length !== 0)) return invalid("rule-lookup-shape");
  if (parsed.intent === "interaction" && cardNames.length === 0) return invalid("interaction-shape");
  if (parsed.intent === "unknown" && (cardNames.length !== 0 || ruleNumber !== null)) return invalid("unknown-shape");

  return Object.freeze({
    valid: true,
    reason: null,
    candidate: Object.freeze({ intent: parsed.intent, cardNames: Object.freeze(cardNames), ruleNumber }),
  });
}

export async function resolveInterpretation(repository, candidate) {
  if (!candidate) return Object.freeze({ valid: false, reason: "missing-candidate", interpretation: null });
  const cards = [];
  for (const name of candidate.cardNames) {
    const card = await repository.findCardExact(name);
    if (!card) return Object.freeze({ valid: false, reason: "unresolved-card", interpretation: null });
    cards.push(card);
  }
  const rule = candidate.ruleNumber ? await repository.getRuleExact(candidate.ruleNumber) : null;
  if (candidate.ruleNumber && !rule) {
    return Object.freeze({ valid: false, reason: "unresolved-rule", interpretation: null });
  }
  return Object.freeze({
    valid: true,
    reason: null,
    interpretation: Object.freeze({
      intent: candidate.intent,
      cards: Object.freeze(cards),
      rule,
      source: "model-exact-local",
    }),
  });
}

export function interpretationPrompt(question) {
  return [
    "Classify this Magic rules request. Return only compact JSON with exactly these keys:",
    '{"intent":"card_lookup|rule_lookup|interaction|unknown","cardNames":[],"ruleNumber":null}',
    "Use full printed card names only when certain. Never answer the question.",
    `Request: ${JSON.stringify(String(question ?? "").slice(0, 500))}`,
  ].join("\n");
}
