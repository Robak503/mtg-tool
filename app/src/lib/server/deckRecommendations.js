/**
 * deckRecommendations.js — deterministic, local "deck doctor" recommendations.
 *
 * The lighter-MVP alternative to a full EDHREC sync: instead of per-commander
 * inclusion data we don't bundle, we derive add/cut guidance from signals we
 * already compute locally —
 *   - role gaps: the power ranker's role counts (ramp/draw/removal/...) vs
 *     Commander rules-of-thumb, filled with color-identity-legal staples
 *     (ranked by edhrec_rank via the injected `search`);
 *   - completions: the Commander Spellbook "one card away" combos;
 *   - cuts: the ranker's lowest-impact cards + the deck's saltiest cards.
 *
 * Pure: the card search is injected so this is unit-testable with a stub and
 * the route wires in the real cardIndex.searchLocalCards. Zero network calls.
 */

const norm = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();

// Commander rules-of-thumb floors. A deck below a floor gets staple suggestions
// for that role; at/above it, the role is considered covered.
const ROLE_GAPS = [
  { key: "ramp", label: "Ramp / mana acceleration", target: 10, query: "add mana" },
  { key: "draw", label: "Card draw", target: 10, query: "draw a card" },
  { key: "removal", label: "Spot removal", target: 8, query: "destroy target creature" },
  { key: "wipes", label: "Board wipes", target: 2, query: "destroy all creatures" },
  { key: "protection", label: "Protection", target: 4, query: "hexproof indestructible" },
];

export function recommendForDeck({ ranker, deckNames = [], search } = {}) {
  if (!ranker?.ready) {
    return { ready: false, adds: [], completions: [], cuts: [], notes: [] };
  }

  const owned = new Set(deckNames.map(norm));
  const counts = ranker.inventory || {};

  const adds = [];
  for (const gap of ROLE_GAPS) {
    const have = counts[gap.key] || 0;
    if (have >= gap.target) continue;
    const deficit = gap.target - have;
    const found = typeof search === "function" ? (search(gap.query, deficit + 4) || []) : [];
    const suggestions = found
      .map(item => (typeof item === "string" ? item : item?.name))
      .filter(Boolean)
      .filter(name => !owned.has(norm(name)))
      .slice(0, 5);
    adds.push({ role: gap.label, have, target: gap.target, deficit, suggestions });
  }

  const completions = (ranker.spellbook?.oneCardAway || []).slice(0, 6).map(combo => ({
    missingCard: combo.missingCard,
    pieces: (combo.cards || []).filter(name => norm(name) !== norm(combo.missingCard)),
    produces: combo.produces || [],
  }));

  const cutSeen = new Set();
  const cuts = [];
  for (const card of ranker.efficiencyMetrics?.lowImpactCards || []) {
    const key = norm(card.name);
    if (!key || cutSeen.has(key)) continue;
    cutSeen.add(key);
    cuts.push({ name: card.name, reason: "Low modeled impact for its slot" });
  }
  for (const card of ranker.salt?.topCards || []) {
    const key = norm(card.name);
    if (!key || cutSeen.has(key) || (card.salt ?? 0) < 2) continue;
    cutSeen.add(key);
    cuts.push({ name: card.name, reason: `High salt (${card.salt}) — annoys the table` });
  }

  const notes = [];
  if ((counts.lands || 0) < 35) {
    notes.push(`Only ${counts.lands || 0} lands — most Commander decks want 36-38 (or heavy ramp to compensate).`);
  }
  for (const issue of (ranker.landAssessment?.issues || []).slice(0, 2)) notes.push(issue);

  return {
    ready: true,
    commanderNames: ranker.commanderNames || [],
    colors: ranker.commanderColors || [],
    adds,
    completions,
    cuts: cuts.slice(0, 10),
    notes,
  };
}
