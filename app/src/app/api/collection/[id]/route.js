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
  CollectionVersionMismatch,
} from "../../../../lib/server/collectionStorage.js";

const VALID_FINISHES = new Set(["nonfoil", "foil", "etched"]);
const VALID_CONDITIONS = new Set([null, "NM", "LP", "MP", "HP", "DMG"]);

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

function validateStacks(stacks) {
  if (!Array.isArray(stacks) || stacks.length === 0) {
    return "stacks must be a non-empty array";
  }
  for (const stack of stacks) {
    if (!stack || typeof stack !== "object") return "each stack must be an object";
    if (!VALID_FINISHES.has(stack.finish)) {
      return "stack.finish must be one of: nonfoil, foil, etched";
    }
    if (typeof stack.quantity !== "number" || !Number.isFinite(stack.quantity) || stack.quantity < 0) {
      return "stack.quantity must be a non-negative number";
    }
    const cond = stack.condition === undefined ? null : stack.condition;
    if (!VALID_CONDITIONS.has(cond)) {
      return "stack.condition must be NM, LP, MP, HP, DMG, or null";
    }
  }
  return null;
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
  const allowedKeys = new Set(["stacks", "notes", "wishlist"]);
  const updateKeys = Object.keys(body).filter(k => allowedKeys.has(k));
  if (updateKeys.length === 0) {
    return badRequest("No mutable fields in body (allowed: stacks, notes, wishlist)");
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

  try {
    const { collection } = await loadCollection();
    const idx = collection.cards.findIndex(c => c.scryfallId === id);
    if (idx < 0) return notFound(id);

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

    // Auto-flip wishlist → false if stacks were updated and any stack has
    // quantity > 0, unless the caller explicitly set wishlist: true.
    if ("stacks" in body && body.wishlist !== true) {
      const anyOwned = updated.stacks.some(s => (s.quantity || 0) > 0);
      if (anyOwned) updated.wishlist = false;
    }

    collection.cards[idx] = updated;
    const saved = await writeCollectionAtomic(collection);
    return Response.json({ collection: saved, updated: updated.name || id });
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
    const { collection } = await loadCollection();
    const idx = collection.cards.findIndex(c => c.scryfallId === id);
    if (idx < 0) return notFound(id);

    const [removed] = collection.cards.splice(idx, 1);
    const saved = await writeCollectionAtomic(collection);
    return Response.json({
      ok: true,
      removed: removed.name || id,
      collection: saved,
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json({ error: error.message || "Could not remove row." }, { status: 500 });
  }
}
