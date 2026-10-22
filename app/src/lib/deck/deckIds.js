/**
 * deckIds.js — every saved deck carries a stable, unique `id`.
 *
 * Pure and dependency-free so the deck store (client) and /api/decks (server)
 * share one rule. Everything that picks or remembers a deck keys it by `id` —
 * the Academy pickers, the active deck, a chat's locked deck, the Sim Center —
 * so a deck saved without one cannot be picked anywhere. A deck written by a
 * caller that never set an id (an outside script posting the import preview's
 * `{ name, format, source, cards }` shape, a library JSON from an old export, a
 * restored or copied deck file) is given one here.
 *
 * The id is DERIVED, not random: `deck_<name slug>_<8 base-36 hash chars>`,
 * where the hash covers the scope (the server passes the profile id), the
 * deck's owner and name, and its ordinal among the id-less decks of that same
 * owner + name. So the same library always derives the same ids — a backfill
 * that is retried, raced, or redone from a backup lands on the ids it would
 * have written the first time, and two decks with the same name still differ.
 * An id that is already present is never changed; a derived id that collides
 * with one already in the library takes a `_2`, `_3`… suffix.
 */

/** True when the deck has an id the pickers and stores can key by: a non-blank string, or a finite number. */
export function hasDeckId(deck) {
  const id = deck?.id;
  if (typeof id === "string") return id.trim() !== "";
  return typeof id === "number" && Number.isFinite(id);
}

function ownerOf(deck) {
  return String(deck?.memory?.owner ?? deck?.owner ?? "").trim();
}

function nameOf(deck) {
  return String(deck?.name ?? "").trim();
}

// cyrb53 (public domain): a fast 53-bit string hash with good dispersion. Not
// cryptographic — the id only has to be stable and unlikely to collide, and a
// collision inside one library is resolved by the suffix below anyway.
function hash53(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function slugOf(name) {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/, "");
  return slug || "deck";
}

/** The id an id-less deck derives: its name slug plus a hash of (scope, owner, name, ordinal). */
export function derivedDeckId(deck, ordinal = 0, scope = "") {
  const name = nameOf(deck);
  const hash = hash53(`${scope}\u0000${ownerOf(deck)}\u0000${name}\u0000${ordinal}`).toString(36).padStart(11, "0").slice(-8);
  return `deck_${slugOf(name)}_${hash}`;
}

/**
 * Give every deck in `decks` that lacks an id a derived one, unique within the
 * list. Decks that already have an id come back as the same objects, untouched;
 * a deck that gains one comes back as a new object with `id` first.
 *
 * @param {Array<object>} decks
 * @param {{ scope?: string, reserved?: Iterable<string> }} [options] scope is folded into the hash (the
 *   server passes the profile id); reserved ids are in use elsewhere (a library being merged into) and
 *   are never handed out
 * @returns {{ decks: Array<object>, assigned: Array<{ index: number, name: string, id: string }> }}
 */
export function ensureDeckIds(decks, { scope = "", reserved = [] } = {}) {
  if (!Array.isArray(decks)) return { decks, assigned: [] };
  const taken = new Set([...reserved].map(String));
  for (const deck of decks) if (hasDeckId(deck)) taken.add(String(deck.id));
  const ordinals = new Map();
  const assigned = [];
  const out = decks.map((deck, index) => {
    if (!deck || typeof deck !== "object" || hasDeckId(deck)) return deck;
    const key = `${ownerOf(deck)}\u0000${nameOf(deck)}`;
    const ordinal = ordinals.get(key) || 0;
    ordinals.set(key, ordinal + 1);
    const base = derivedDeckId(deck, ordinal, scope);
    let id = base;
    for (let n = 2; taken.has(id); n++) id = `${base}_${n}`;
    taken.add(id);
    assigned.push({ index, name: nameOf(deck), id });
    const { id: _blank, ...rest } = deck; // drop a blank/null `id` key so the new one leads
    return { id, ...rest };
  });
  return { decks: out, assigned };
}
