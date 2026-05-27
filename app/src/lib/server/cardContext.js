import {
  detectCardNamesInText,
  extractBracketedCardNames,
  getCardIndex,
  lookupCard,
  lookupRulingsForCard,
  oracleText,
} from "./cardIndex.js";

function formatCardBlock(card, rulings = [], maxRulingsPerCard = 3) {
  const stat = card.power != null ? ` | ${card.power}/${card.toughness}`
    : card.loyalty != null ? ` | Loyalty ${card.loyalty}`
    : "";
  const keywords = card.keywords?.length ? `\nKeywords: ${card.keywords.join(", ")}` : "";
  let block = `[${card.name}] | ${card.mana_cost || card.card_faces?.[0]?.mana_cost || "-"} | ${card.type_line || "Card"}${stat}${keywords}\n${oracleText(card) || "(no Oracle text)"}`;

  if (rulings.length && maxRulingsPerCard > 0) {
    const rulingsText = rulings
      .slice(0, maxRulingsPerCard)
      .map(ruling => `- (${ruling.published_at}) ${ruling.comment}`)
      .join("\n");
    block += `\n\nWOTC RULINGS:\n${rulingsText}`;
  }

  return block;
}

export async function buildServerCardContext(text, options = {}) {
  const {
    includeRulings = true,
    maxCardNames = 10,
    maxRulingsPerCard = 3,
    heading = "## CARDS REFERENCED - LOCAL ORACLE DATA (authoritative; use ONLY this text for card behavior)",
  } = options;

  try {
    getCardIndex();
  } catch {
    return "";
  }

  const bracketed = extractBracketedCardNames(text);
  const detected = detectCardNamesInText(String(text || "").replace(/\[\[([^\]]+)\]\]/g, " "));
  const requestedNames = [...new Set([...bracketed, ...detected])].slice(0, maxCardNames);
  if (!requestedNames.length) return "";

  const pairs = requestedNames.map(name => ({ requested: name, card: lookupCard(name) }));
  const validPairs = pairs.filter(pair => pair.card);
  if (!validPairs.length) return "";

  const localCount = validPairs.length;
  const missingNames = pairs.filter(pair => !pair.card).map(pair => pair.requested);
  const receipt = [
    `Source receipt: ${localCount} local card(s), 0 live Scryfall fallback card(s), ${missingNames.length} unresolved card(s).`,
    missingNames.length ? `Unresolved cards: ${missingNames.map(name => `[[${name}]]`).join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const blocks = validPairs.map(({ card }) => {
    const rulings = includeRulings ? lookupRulingsForCard(card) : [];
    return formatCardBlock(card, rulings, maxRulingsPerCard);
  });

  return `${heading}\n\n${receipt}\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}
