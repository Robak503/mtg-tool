/**
 * artCropProxySrc — build a /api/art-crop URL for a collection row.
 *
 * Routes card art through the local cache proxy instead of the Scryfall
 * CDN directly: first view fetches + caches to AppData, every later view
 * (including offline) is served from disk. Shared by the grid and the
 * card-detail drawer so both honor the local-first mandate identically.
 *
 *   id  → cache key (the row's scryfallId)
 *   url → trusted fallback source (the stored Scryfall art_crop URL),
 *         used by the route only when the printing index lookup misses
 *
 * Returns null when the card has neither identifier.
 */
export function artCropProxySrc(card) {
  if (!card) return null;
  const params = new URLSearchParams();
  if (card.scryfallId) params.set("id", card.scryfallId);
  if (card.artCropUrl) params.set("url", card.artCropUrl);
  const qs = params.toString();
  return qs ? `/api/art-crop?${qs}` : null;
}
