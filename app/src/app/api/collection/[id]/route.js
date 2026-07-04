/**
 * /api/collection/[id] — single-row mutation.
 *
 * The [id] path parameter is the row's scryfallId (the stable per-printing
 * identity). Routes:
 *
 *   PATCH  → update any subset of { stacks, notes, wishlist } on the row
 *   DELETE → remove the row entirely
 *
 * PATCH replaces (not merges) the entire `stacks` array when provided.
 * For additive stack changes use POST /api/collection (which merges).
 * For wishlist flips, send just { wishlist: true/false }.
 *
 * All writes go through writeCollectionAtomic.
 */

export const runtime = "nodejs";

import {
  loadCollection,
  writeCollectionAtomic,
  withCollectionLock,
  CollectionVersionMismatch,
} from "../../../../lib/server/collectionStorage.js";
import { validateProvenance, validateStacks } from "../../../../lib/server/collectionValidation.js";

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

function notFound(scryfallId) {
  return Response.json(
    { error: `No collection row with scryfallId "${scryfallId}".` },
    { status: 404 },
  );
}

function versionConflict(error) {
  return Response.json(
    { error: error.message, code: error.code, found: error.found, expected: error.expected },
    { status: 409 },
  );
}

async function resolveParams(ctx) {
  // Next.js 15: params is a Promise in route handlers. Await when present.
  const raw = ctx?.params;
  if (raw && typeof raw.then === "function") return raw;
  return Promise.resolve(raw || {});
}

export async function PATCH(request, ctx) {
  const { id } = await resolveParams(ctx);
  if (!id || typeof id !== "string") {
    return badRequest("Missing scryfallId in path");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }
  if (!body || typeof body !== "object") {
    return badRequest("Request body must be an object");
  }

  // Whitelist of mutable fields
  const allowedKeys = new Set(["stacks", "notes", "wishlist", "colorTagId", "signed", "altered", "artistProof", "showcase"]);
  const updateKeys = Object.keys(body).filter(k => allowedKeys.has(k));
  if (updateKeys.length === 0) {
    return badRequest("No mutable fields in body (allowed: stacks, notes, wishlist, colorTagId, signed, altered, artistProof, showcase)");
  }

  if ("stacks" in body) {
    const stackError = validateStacks(body.stacks);
    if (stackError) return badRequest(stackError);
  }
  if ("notes" in body && typeof body.notes !== "string") {
    return badRequest("notes must be a string");
  }
  if ("wishlist" in body && typeof body.wishlist !== "boolean") {
    return badRequest("wishlist must be a boolean");
  }
  // colorTagId references a tag in the client-side tag set (localStorage), so
  // we only enforce the type here — null clears the tag.
  if ("colorTagId" in body && body.colorTagId !== null && typeof body.colorTagId !== "string") {
    return badRequest("colorTagId must be a string or null");
  }
  // Trophy Case provenance (V6) — optional, additive; see collectionValidation.
  {
    const provenanceError = validateProvenance(body);
    if (provenanceError) return badRequest(provenanceError);
  }

  try {
    // Serialize the read-modify-write so a concurrent mutation on another row
    // can't load a stale snapshot and drop this update (or vice-versa).
    const result = await withCollectionLock(async () => {
      const { collection } = await loadCollection();
      const idx = collection.cards.findIndex(c => c.scryfallId === id);
      if (idx < 0) return { notFound: true };

      const existing = collection.cards[idx];
      const updated = { ...existing };

      if ("stacks" in body) {
        updated.stacks = body.stacks.map(s => ({
          finish: s.finish,
          quantity: s.quantity,
          condition: s.condition === undefined ? null : s.condition,
        }));
      }
      if ("notes" in body) {
        updated.notes = body.notes;
      }
      if ("wishlist" in body) {
        updated.wishlist = body.wishlist;
      }
      if ("colorTagId" in body) {
        updated.colorTagId = body.colorTagId;
      }
      if ("signed" in body) {
        updated.signed = body.signed === null ? null : {
          artist: body.signed.artist ?? null,
          date: body.signed.date ?? null,
          event: body.signed.event ?? null,
          inPerson: body.signed.inPerson === true,
        };
      }
      for (const key of ["altered", "artistProof", "showcase"]) {
        if (key in body) updated[key] = body[key];
      }

      // Auto-flip wishlist → false if stacks were updated and any stack has
      // quantity > 0, unless the caller explicitly set wishlist: true.
      if ("stacks" in body && body.wishlist !== true) {
        const anyOwned = updated.stacks.some(s => (s.quantity || 0) > 0);
        if (anyOwned) updated.wishlist = false;
      }

      collection.cards[idx] = updated;
      const saved = await writeCollectionAtomic(collection);
      return { saved, name: updated.name || id };
    });

    if (result.notFound) return notFound(id);
    return Response.json({ collection: result.saved, updated: result.name });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json({ error: error.message || "Could not update row." }, { status: 500 });
  }
}

export async function DELETE(request, ctx) {
  const { id } = await resolveParams(ctx);
  if (!id || typeof id !== "string") {
    return badRequest("Missing scryfallId in path");
  }

  try {
    // Serialize against concurrent collection writes (lost-update guard).
    const result = await withCollectionLock(async () => {
      const { collection } = await loadCollection();
      const idx = collection.cards.findIndex(c => c.scryfallId === id);
      if (idx < 0) return { notFound: true };

      const [removed] = collection.cards.splice(idx, 1);
      const saved = await writeCollectionAtomic(collection);
      return { saved, removed: removed.name || id };
    });

    if (result.notFound) return notFound(id);
    return Response.json({
      ok: true,
      removed: result.removed,
      collection: result.saved,
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json({ error: error.message || "Could not remove row." }, { status: 500 });
  }
}
