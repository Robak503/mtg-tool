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
    // Machine power rating from the local power ranker (/api/power-rank), written
    // automatically on import and by the Pod Balance surface. Distinct from
    // `powerLevel` above, which stays Colton's own free-text notes field.
    // Shape when set: { powerLevel:number, bracket:number, bracketLabel:string, ratedAt:ISO }
    powerRank: null,
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

// ── LOCKED vs CANDIDATE (roadmap wave 3 item 8) ───────────────────────────────
//
// A per-card `locked` BOOLEAN, not a new `section` value and not a separate candidates list. Omnath's
// schema read, and the reason is load-bearing enough to keep written down: every consumer that reads deck
// content filters with a DENY-list (`section !== "Sideboard" && section !== "Tokens"`). Verified before
// building — 18 such sites in src/, and ZERO allow-list (`section === "Mainboard"`) sites. A new section
// value would therefore fall straight through all 18 and be silently counted as part of the deck: it would
// inflate the power rating, bend the curve, price into the ledger, and reach the ENGINE as a real card,
// with no error anywhere. A new FIELD is invisible to those same 18, so today's behavior is unchanged and
// each consumer opts in deliberately.
//
// ABSENT MEANS LOCKED, on purpose. Every deck that exists right now reads exactly as it does today — no
// migration, no deck silently losing cards under the owner. Only an explicit `false` demotes a card.

/** A slot in the 100 — excludes sideboard and tokens, which are never deck content. */
export const isDeckSlot = (c) => c?.section !== "Sideboard" && c?.section !== "Tokens";

/**
 * LOCKED = committed to the deck. The COMMANDER is structurally lock #1 and this is DERIVED, never
 * stored: color identity comes off the commander (CR 903.4) and the mana pips already derive from it, so
 * a "candidate commander" would make identity ambiguous and every downstream legality check unstable.
 * A stored `locked:false` on a commander is therefore ignored rather than honoured.
 */
export const isLocked = (c) => isDeckSlot(c) && (c?.section === "Commander" || c?.locked !== false);

/** CANDIDATE = being considered, not in the deck. Never counts toward x/100. */
export const isCandidate = (c) => isDeckSlot(c) && c?.section !== "Commander" && c?.locked === false;

/** x/100 — the bench's lock bar. Identical to what every deck already reports, since absent = locked. */
export const lockedCount = (cards) => (cards || []).filter(isLocked).reduce((s, c) => s + (c.qty || 0), 0);

/** The "+N considering" figure shown beside the lock bar. */
export const candidateCount = (cards) => (cards || []).filter(isCandidate).reduce((s, c) => s + (c.qty || 0), 0);

export function normalizeDeck(deck) {
  const memory = { ...defaultDeckMemory(), ...(deck.memory || {}) };
  return {
    ...deck,
    cards: (deck.cards || []).map(c => ({
      ...c,
      section: c.section === "Tokens" || isTokenishName(c.name) ? "Tokens" : (c.section || "Mainboard"),
      // LOCKED normalization — FAIL-SAFE TOWARD THE STATUS QUO. Anything that is not an explicit `false`
      // becomes `true`, so a hand-edited or half-written file can never invent candidates and quietly
      // shrink someone's deck. The commander is forced true regardless of what the file says.
      locked: c.section === "Commander" ? true : c.locked === false ? false : true,
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
      // Guard the machine rating's shape so a hand-edited file can't feed the
      // UI a string/array where an object is expected. null = unrated.
      powerRank:
        memory.powerRank && typeof memory.powerRank === "object" && !Array.isArray(memory.powerRank)
          ? memory.powerRank
          : null,
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
    m.powerRank && m.powerRank.powerLevel != null
      ? `Machine Power Rating: ${m.powerRank.powerLevel}/10 — Bracket ${m.powerRank.bracket ?? "?"}${m.powerRank.bracketLabel ? ` (${m.powerRank.bracketLabel})` : ""}${m.powerRank.ratedAt ? `, rated ${String(m.powerRank.ratedAt).slice(0, 10)}` : ""}`
      : "",
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
