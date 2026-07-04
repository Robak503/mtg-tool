/**
 * colorTagStore.js — durable per-profile color-tag definitions (E4).
 *
 * The DURABLE FIX for U-F4: tag definitions ({ id, name, color, behavior }) now
 * live on the server at profilePath("color-tags.json") — the same per-profile
 * home as the per-card assignments that reference them (server-side colorTagId).
 * localStorage in useColorTags is demoted from source-of-truth to a write-through
 * sync cache. So tags survive a reinstall (AppData persists), follow the profile,
 * and a profile switch can never orphan an assignment's definition again.
 *
 * readColorTags() returns null when nothing has been saved for the active profile
 * (never []), so the client can tell "brand-new profile → migrate my local set up"
 * apart from "the user deleted everything down to none".
 */

import fs from "node:fs/promises";

import { profilePath } from "./paths.js";

const MAX_TAGS = 100;
const MAX_STR = 120;

function file() {
  return profilePath("color-tags.json");
}

function str(value, fallback = "") {
  return typeof value === "string" ? value.slice(0, MAX_STR) : fallback;
}

/**
 * Coerce arbitrary input to a clean tag array — drop non-objects, keep only the
 * known fields, cap length + string sizes. Pure; the ONE place tag shape is
 * enforced before it's persisted. A tag with no id is skipped (ids are the join
 * key for per-card assignments).
 */
export function sanitizeTags(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const t of input.slice(0, MAX_TAGS)) {
    if (!t || typeof t !== "object" || !t.id) continue;
    const tag = {
      id: str(t.id),
      name: str(t.name, "Tag"),
      color: str(t.color, "#999999"),
      behavior: str(t.behavior, "marker"),
    };
    if (t.builtin === true) tag.builtin = true;
    if (tag.id) out.push(tag);
  }
  return out;
}

/** The active profile's stored tags, or null when nothing has been saved yet. */
export async function readColorTags() {
  try {
    const parsed = JSON.parse(await fs.readFile(file(), "utf8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the whole tag set for the active profile (atomic tmp+rename). Returns the count. */
export async function writeColorTags(tags) {
  const clean = sanitizeTags(tags);
  const f = file();
  const tmp = `${f}.tmp`;
  await fs.mkdir(profilePath(), { recursive: true }).catch(() => {});
  await fs.writeFile(tmp, JSON.stringify(clean));
  await fs.rename(tmp, f);
  return clean.length;
}
