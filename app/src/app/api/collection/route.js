/**
 * /api/collection — top-level Collection CRUD.
 *
 *   GET    → list the entire collection + any recoveryWarning + storage path
 *   POST   → add a new card (or merge stacks into an existing row by scryfallId)
 *   DELETE → clear the entire collection. Requires ?confirm=true.
 *
 * All writes go through writeCollectionAtomic (temp + rename).
 *
 * Per-row mutation (PATCH/DELETE on a single id) lives at /api/collection/[id].
 */

export const runtime = "nodejs";

import { dataPath } from "../../../lib/server/paths.js";
import {
  loadCollection,
  writeCollectionAtomic,
  withCollectionLock,
  emptyCollection,
  CollectionVersionMismatch,
} from "../../../lib/server/collectionStorage.js";
import { lookupById } from "../../../lib/server/printingIndex.js";
import { validateStacks } from "../../../lib/server/collectionValidation.js";

function badRequest(message) {
  return Response.json({ error: message }, { status: 400 });
}

function versionConflict(error) {
  return Response.json(
    {
      error: error.message,
      code: error.code,
      found: error.found,
      expected: error.expected,
    },
    { status: 409 },
  );
}

function tryLookupPrinting(scryfallId) {
  // Best-effort. If the printings-index hasn't been built yet (dev or
  // first-launch before sync), the route degrades to "save what the
  // client sent" instead of refusing the write.
  try {
    return lookupById(scryfallId);
  } catch {
    return null;
  }
}

function mergeStacks(existing, incoming) {
  const out = existing.map(s => ({ ...s }));
  for (const newStack of incoming) {
    const idx = out.findIndex(s => s.finish === newStack.finish);
    if (idx >= 0) {
      out[idx] = {
        ...out[idx],
        quantity: (out[idx].quantity || 0) + newStack.quantity,
        // Worst observed condition wins. NM > LP > MP > HP > DMG.
        // For now keep the incoming condition if it's set, else preserve.
        condition: newStack.condition !== undefined && newStack.condition !== null
          ? newStack.condition
          : out[idx].condition,
      };
    } else {
      out.push({ ...newStack });
    }
  }
  return out;
}

export async function GET() {
  try {
    const { collection, recoveryWarning } = await loadCollection();
    return Response.json({
      collection,
      recoveryWarning,
      path: dataPath("collection.json"),
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json(
      { error: error.message || "Could not load collection." },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON");
  }

  if (!body || typeof body !== "object") {
    return badRequest("Request body must be an object");
  }
  if (!body.scryfallId || typeof body.scryfallId !== "string") {
    return badRequest("scryfallId is required");
  }
  const stackError = validateStacks(body.stacks);
  if (stackError) return badRequest(stackError);

  const printing = tryLookupPrinting(body.scryfallId);

  // Canonical fields prefer body input but fall back to printingIndex lookup.
  const oracleId = body.oracleId || printing?.oracleId;
  if (!oracleId) {
    return Response.json(
      {
        error:
          `scryfallId "${body.scryfallId}" not found in printings index ` +
          "and no oracleId was provided in the request body.",
      },
      { status: 404 },
    );
  }

  const newRow = {
    scryfallId: body.scryfallId,
    oracleId,
    name: body.name || printing?.name || "",
    setCode: (body.setCode || printing?.set || "").toLowerCase(),
    collectorNumber: body.collectorNumber || printing?.collectorNumber || "",
    stacks: body.stacks.map(s => ({
      finish: s.finish,
      quantity: s.quantity,
      condition: s.condition === undefined ? null : s.condition,
    })),
    addedAt: new Date().toISOString(),
    notes: typeof body.notes === "string" ? body.notes : "",
    wishlist: !!body.wishlist,
  };
  if (printing?.prices) newRow.prices = printing.prices;
  if (printing?.artCropUrl) newRow.artCropUrl = printing.artCropUrl;

  try {
    // Serialize the whole load → mutate → write so a concurrent add/merge
    // can't read the same starting state and clobber this one's change.
    const { saved, merged } = await withCollectionLock(async () => {
      const { collection } = await loadCollection();
      const existingIdx = collection.cards.findIndex(c => c.scryfallId === body.scryfallId);

      if (existingIdx >= 0) {
        const existing = collection.cards[existingIdx];
        const mergedStacks = mergeStacks(existing.stacks || [], newRow.stacks);
        const anyOwned = mergedStacks.some(s => (s.quantity || 0) > 0);
        collection.cards[existingIdx] = {
          ...existing,
          ...newRow,
          addedAt: existing.addedAt || newRow.addedAt,
          stacks: mergedStacks,
          // Auto-flip out of wishlist when stacks gain quantity, unless caller
          // explicitly set wishlist: true.
          wishlist: body.wishlist === true ? true : (anyOwned ? false : existing.wishlist),
        };
      } else {
        collection.cards.push(newRow);
      }

      const written = await writeCollectionAtomic(collection);
      return { saved: written, merged: existingIdx >= 0 };
    });

    return Response.json({
      collection: saved,
      added: newRow.name || newRow.scryfallId,
      merged,
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json(
      { error: error.message || "Could not save card." },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  let confirm;
  try {
    const url = new URL(request.url);
    confirm = url.searchParams.get("confirm");
  } catch {
    confirm = null;
  }
  if (confirm !== "true") {
    return badRequest(
      "Refusing to clear collection. Pass ?confirm=true to confirm.",
    );
  }
  try {
    // Serialize against in-flight adds/edits so the clear can't race a write.
    const { empty, previousCount } = await withCollectionLock(async () => {
      const { collection } = await loadCollection();
      const written = await writeCollectionAtomic(emptyCollection());
      return { empty: written, previousCount: collection.cards.length };
    });
    return Response.json({
      ok: true,
      cleared: previousCount,
      collection: empty,
    });
  } catch (error) {
    if (error instanceof CollectionVersionMismatch) return versionConflict(error);
    return Response.json(
      { error: error.message || "Could not clear collection." },
      { status: 500 },
    );
  }
}
