/**
 * userDataExport.js — assemble a single backup bundle of all the user's work
 * (decks, chats, collection, grails, agent notes, feedback, games) for
 * migration / safekeeping (K1, PLAN I1).
 *
 * Pure: the route reads the files and hands the parsed data here. No secrets,
 * env, or model keys are ever included — only user content.
 */

function countOf(value, arrayKey) {
  if (Array.isArray(value)) return value.length;
  if (value && Array.isArray(value[arrayKey])) return value[arrayKey].length;
  return 0;
}

export function summarizeUserData(sections = {}) {
  const s = sections || {};
  return {
    decks: countOf(s.decks, "decks"),
    chatSessions: countOf(s.chats, "sessions"),
    collectionCards: countOf(s.collection, "cards"),
    grails: countOf(s.watchlist, "cards"),
    priceAlerts: countOf(s.priceAlerts, "alerts"),
    feedback: Array.isArray(s.feedback) ? s.feedback.length : 0,
    games: Array.isArray(s.games) ? s.games.length : 0,
  };
}

/**
 * @param sections { decks, chats, collection, watchlist, priceAlerts, agentNotes, feedback[], games[] }
 *   — each null/absent when that data doesn't exist yet.
 */
export function buildUserDataBundle(sections = {}, exportedAt = new Date().toISOString()) {
  const s = sections || {};
  return {
    kind: "mtg-tool-backup",
    version: 1,
    exportedAt,
    summary: summarizeUserData(s),
    sections: {
      decks: s.decks ?? null,
      chats: s.chats ?? null,
      collection: s.collection ?? null,
      watchlist: s.watchlist ?? null,
      priceAlerts: s.priceAlerts ?? null,
      agentNotes: s.agentNotes ?? null,
      feedback: Array.isArray(s.feedback) ? s.feedback : [],
      games: Array.isArray(s.games) ? s.games : [],
    },
  };
}
