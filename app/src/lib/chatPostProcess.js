/**
 * chatPostProcess.js
 *
 * Post-processing helpers applied to assistant replies before they are committed
 * to history: card-name bracketing, rules primers, context counters.
 * No React state. Safe to call from hooks, server routes, or test files.
 *
 * Extracted from useChatAgents.js (PR0).
 */

import { normalizeSearchText } from "./deck/deckContextBuilder";

// ─── Context counters (used for factReceipt) ──────────────────────────────────

/** Count distinct card context blocks in an assembled context string. */
export function countContextCards(text) {
  return (String(text || "").match(/^\[/gm) || []).length;
}

/** Count distinct ruling blocks in an assembled context string. */
export function countContextRulings(text) {
  return (String(text || "").match(/WOTC RULINGS:/g) || []).length;
}

// ─── Card-name bracketing ─────────────────────────────────────────────────────

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wrap every occurrence of a known card name in [[double brackets]]
 * unless it is already bracketed. Longest names are replaced first to
 * avoid partial matches clobbering multi-word names.
 */
export function bracketKnownCardNames(text, cardNames = []) {
  let output = String(text || "");
  const names = [...new Set(cardNames.filter(Boolean))]
    .sort((a, b) => b.length - a.length);

  for (const name of names) {
    const escaped = escapeRegExp(name);
    const pattern = new RegExp(`(?<!\\[\\[)\\b${escaped}\\b(?!\\]\\])`, "g");
    output = output.replace(pattern, `[[${name}]]`);
  }

  return output;
}

// ─── Local rules primer ───────────────────────────────────────────────────────

/**
 * Return a deterministic local answer for well-understood rules questions
 * (e.g. "how does the stack work?") so Ollama isn't needed for simple lookups.
 * Returns an empty string when the prompt doesn't match any primer.
 */
export function localJaceRulesPrimer(prompt) {
  const text = normalizeSearchText(prompt);
  if (!/\bhow does the stack work\b/.test(text)) return "";

  return [
    "The stack is the waiting line for spells and non-mana abilities: the newest object goes on top, and the top object resolves first after every player passes priority in order.",
    "",
    "Key points:",
    "- Casting a spell or activating a non-mana activated ability puts that object on the stack.",
    "- Triggered abilities trigger when their event happens, then are put onto the stack at the next trigger insertion checkpoint.",
    "- Lands do not use the stack.",
    "- Most mana abilities do not use the stack; they resolve immediately.",
    "- After each object resolves, state-based actions are checked, waiting triggers are put on the stack, then the active player gets priority again.",
    "- A phase or step only advances when the stack is empty and all players pass priority in succession.",
    "",
    "Rules anchors: priority is rule 117, resolving spells and abilities is rule 608, triggered abilities are rule 603, and state-based actions are rule 704.",
  ].join("\n");
}
