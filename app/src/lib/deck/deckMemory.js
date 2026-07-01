/* ── Deck parsing ── */
const TOKENISH_NAMES = new Set([
  "beast", "bird", "copy", "frog lizard", "koma's coil", "kraken", "sliver", "treasure",
]);
const CARD_NAMES = new Set();

function isTokenishName(name) {
  const key = (name || "").toLowerCase();
  return TOKENISH_NAMES.has(key) && !CARD_NAMES.has(key);
}

function cleanDeckName(name) {
  return (name || "").trim().replace(/^"|"$/g, "").replace(/""/g, "\"");
}

export async function loadCardNameCatalog() {
  try {
    const r = await fetch("/card-names.json");
    if (!r.ok) return false;
    const data = await r.json();
    for (const name of data.names || []) CARD_NAMES.add(String(name).toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export async function loadTokenCatalog() {
  try {
    const r = await fetch("/token-names.json");
    if (!r.ok) return false;
    const data = await r.json();
    for (const name of data.names || []) TOKENISH_NAMES.add(String(name).toLowerCase());
    return true;
  } catch {
    return false;
  }
}

export function parseDeck(raw) {
  const cards = [];
  let section = "Mainboard";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^sideboard$/i.test(t)) { section = "Sideboard"; continue; }
    if (/^commander$/i.test(t)) { section = "Commander"; continue; }
    if (/^(mainboard|main deck|maindeck)$/i.test(t)) { section = "Mainboard"; continue; }
    if (/^tokens?$/i.test(t)) { section = "Tokens"; continue; }
    const sb = t.match(/^SB:\s*(\d+)x?\s+(.+)$/i);
    const csv = t.match(/^(\d+)\s*,\s*(?:"((?:[^"]|"")*)"|(.+?))\s*$/);
    const nm = t.match(/^(\d+)x?\s+(.+?)(?:\s+\(.*\))?(?:\s+\d+)?$/);
    const m = sb || csv || nm;
    if (m) {
      const name = cleanDeckName(m[2] || m[3]);
      cards.push({ qty: +m[1], name, section: isTokenishName(name) ? "Tokens" : (sb ? "Sideboard" : section) });
    }
  }
  return cards;
}

export function serializeDeck(cards) {
  return ["Commander","Mainboard","Sideboard","Tokens"].map(g => {
    const grp = cards.filter(c => c.section === g);
    if (!grp.length) return "";
    return (g !== "Mainboard" ? `${g}\n` : "") + grp.map(c => `${c.qty} ${c.name}`).join("\n");
  }).filter(Boolean).join("\n\n");
}

export function defaultDeckMemory() {
  return {
    owner: "Colton",
    notes: "",
    tags: "",
    powerLevel: "",
    boardSnapshot: "",
    agentNotes: { jace: "", karn: "", tibalt: "", arbiter: "" },
    games: [],
    goldfishRuns: [],
    karnPlans: [],
    tibaltRoasts: [],
    snapshots: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeDeck(deck) {
  const memory = { ...defaultDeckMemory(), ...(deck.memory || {}) };
  return {
    ...deck,
    cards: (deck.cards || []).map(c => ({
      ...c,
      section: c.section === "Tokens" || isTokenishName(c.name) ? "Tokens" : (c.section || "Mainboard"),
    })),
    memory: {
      ...memory,
      agentNotes: {
        ...defaultDeckMemory().agentNotes,
        ...(memory.agentNotes || {}),
      },
      games: Array.isArray(memory.games) ? memory.games : [],
      goldfishRuns: Array.isArray(memory.goldfishRuns) ? memory.goldfishRuns : [],
      karnPlans: Array.isArray(memory.karnPlans) ? memory.karnPlans : [],
      tibaltRoasts: Array.isArray(memory.tibaltRoasts) ? memory.tibaltRoasts : [],
      snapshots: Array.isArray(memory.snapshots) ? memory.snapshots : [],
    },
  };
}

export function serializeDeckMemory(deck) {
  if (!deck?.memory) return "";
  const m = deck.memory;
  const lines = [
    `Deck: ${deck.name || "Unnamed"}`,
    m.owner ? `Owner: ${m.owner}` : "",
    m.tags ? `Tags: ${m.tags}` : "",
    m.powerLevel ? `Power Level: ${m.powerLevel}` : "",
    m.notes ? `Notes: ${m.notes}` : "",
    m.boardSnapshot ? `Board Snapshot: ${m.boardSnapshot}` : "",
  ].filter(Boolean);
  const agentNotes = m.agentNotes || {};
  if (agentNotes.jace) lines.push(`Jace Saved Notes: ${agentNotes.jace}`);
  if (agentNotes.karn) lines.push(`Karn Saved Notes: ${agentNotes.karn}`);
  if (agentNotes.tibalt) lines.push(`Tibalt Saved Notes: ${agentNotes.tibalt}`);
  if (agentNotes.arbiter) lines.push(`Arbiter Saved Notes: ${agentNotes.arbiter}`);
  const games = (m.games || []).slice(0, 8).map(g =>
    `- ${g.date || "Unknown date"}: ${g.result || "Result unknown"}${g.opponents ? ` vs ${g.opponents}` : ""}${g.notes ? ` - ${g.notes}` : ""}`
  );
  if (games.length) lines.push("Recent Games:", ...games);
  const goldfishRuns = (m.goldfishRuns || []).slice(0, 3).map(run =>
    `- ${run.date || "Unknown date"}: score ${run.score ?? "?"}/100, ${run.summary || "No summary"}`
  );
  if (goldfishRuns.length) lines.push("Recent Garfield Goldfish Runs:", ...goldfishRuns);
  const karnPlans = (m.karnPlans || []).slice(0, 3).map(plan =>
    `- ${plan.date || "Unknown date"}: ${plan.summary || "Saved Karn plan"}`
  );
  if (karnPlans.length) lines.push("Saved Karn Plans:", ...karnPlans);
  const tibaltRoasts = (m.tibaltRoasts || []).slice(0, 3).map(roast =>
    `- ${roast.date || "Unknown date"}: ${roast.summary || "Saved Tibalt roast"}`
  );
  if (tibaltRoasts.length) lines.push("Saved Tibalt Roasts:", ...tibaltRoasts);
  return lines.join("\n");
}

export function suspiciousDeckEntries(cards) {
  return cards
    .filter(c => c.section === "Tokens")
    .map(c => `${c.qty} ${c.name}`);
}
