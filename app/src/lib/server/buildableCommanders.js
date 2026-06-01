/**
 * buildableCommanders.js — "what can I build now" (Vault #20).
 *
 * Pure: the route resolves each owned card's oracle metadata (type line, color
 * identity, EDHREC rank) and injects it. This finds the legendary creatures (and
 * planeswalkers that can be a commander) you OWN, and for each scores how many
 * other cards you own that are legal in its color identity — i.e. how much of a
 * deck you could already build around it. Ranked by that owned in-color pool.
 */

const WUBRG = ["W", "U", "B", "R", "G"];
const ciOnly = (ci) => (Array.isArray(ci) ? ci : []).filter((c) => WUBRG.includes(c));

/** A legendary creature (or a "can be your commander" planeswalker) can head a deck. */
export function canBeCommander(typeLine, oracleText = "") {
  const t = String(typeLine || "").toLowerCase();
  if (t.includes("legendary") && t.includes("creature")) return true;
  // Planeswalkers only with the explicit "can be your commander" line.
  if (t.includes("planeswalker") && /can be your commander/i.test(oracleText || "")) return true;
  return false;
}

/** Is a card with identity `ci` legal in a `commanderCI` deck? */
export function inIdentity(ci, commanderCI) {
  const allowed = new Set(commanderCI);
  return ciOnly(ci).every((c) => allowed.has(c));
}

/**
 * @param ownedEntries {name, typeLine, colorIdentity, oracleText?, edhrecRank?}[]
 *   — owned, non-wishlist, ideally deduped by name (the route dedupes).
 * @returns {{ name, colorIdentity, ownedInColor }[]}  best-supported commanders first
 */
export function computeBuildableCommanders(ownedEntries, { topN = 12, minPool = 1 } = {}) {
  const entries = dedupeByName(ownedEntries);
  const commanders = entries.filter((e) => canBeCommander(e.typeLine, e.oracleText));

  const ranked = commanders.map((cmd) => {
    const cmdCI = ciOnly(cmd.colorIdentity);
    const allowed = new Set(cmdCI);
    let ownedInColor = 0;
    for (const e of entries) {
      if (e.name === cmd.name) continue; // the commander doesn't count toward its own pool
      if (ciOnly(e.colorIdentity).every((c) => allowed.has(c))) ownedInColor += 1;
    }
    return { name: cmd.name, colorIdentity: cmdCI, ownedInColor };
  });

  return ranked
    .filter((r) => r.ownedInColor >= minPool)
    .sort((a, b) => b.ownedInColor - a.ownedInColor || a.name.localeCompare(b.name))
    .slice(0, topN);
}

function dedupeByName(entries) {
  const seen = new Map();
  for (const e of entries || []) {
    if (!e || !e.name) continue;
    const k = String(e.name).toLowerCase();
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()];
}
