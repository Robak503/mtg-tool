/**
 * cardImageProxySrc — build a /api/card-image URL (FULL card: frame, name,
 * text box) for a collection row, printing-index row, or bare card name.
 *
 * Sister of artCropProxySrc (art-only). Routes through the local cache proxy
 * so the first view fetches + caches to AppData and every later view —
 * including offline — is served from disk.
 *
 *   id   → cache key: row.scryfallId (collection rows) or row.id (printing rows)
 *   url  → trusted fallback source (stored Scryfall art_crop URL); the route
 *          derives the full-card `normal` URL from it when the index misses
 *   name → last resort when the caller only knows the card name (deck lists);
 *          resolves to the first printing of that name
 *
 * Returns null when the card has no usable identifier.
 */
export function cardImageProxySrc(card) {
  if (!card) return null;
  const params = new URLSearchParams();
  const id = card.scryfallId || card.id;
  if (id) params.set("id", id);
  if (card.artCropUrl) params.set("url", card.artCropUrl);
  if (!id && !card.artCropUrl && card.name) params.set("name", card.name);
  const qs = params.toString();
  return qs ? `/api/card-image?${qs}` : null;
}
