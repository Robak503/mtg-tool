"use client";

/**
 * useColorTags — the user's custom card color-tag set (Archidekt-style labels).
 *
 * A per-profile set of tags { id, name, color, behavior } that can be applied to
 * cards across decks and the Vault. Seeded with the familiar acquisition tags
 * (Have / Getting / Don't Have / Have wrong printing) plus an unset Default; the
 * user can create, rename, recolor, and delete their own.
 *
 * STORAGE (E4 — the durable fix for U-F4): the SERVER is now the source of truth
 * (`/api/color-tags` → profilePath("color-tags.json"), the same per-profile home
 * as the per-card colorTagId assignments that reference these ids). localStorage
 * is kept as a WRITE-THROUGH SYNC CACHE — it gives an instant, flash-free hydrate,
 * an offline fallback, and the synchronous read `swapBehaviorTagIds()` needs. On
 * mount we render the cache immediately, then reconcile with the server (server
 * wins); a brand-new profile (server has nothing) migrates the local set up once.
 * A profile switch reloads the window (useProfiles.switchTo), so this mount-time
 * hydrate re-scopes automatically.
 *
 * Per-card assignment (which card has which tag) is stored separately on the
 * card/deck data; this hook only owns the tag definitions.
 */

import { useEffect, useRef, useState } from "react";

// Legacy (pre-profiles) global key — kept as the migration source and as the
// fallback namespace when no active-profile pointer exists.
const LEGACY_STORAGE_KEY = "mtg-color-tags-v1";
// Written by useProfiles (on load and on switch) so this module can resolve
// the active profile synchronously without a server round-trip.
const ACTIVE_PROFILE_KEY = "mtg-active-profile-id";

function storageKey() {
  if (typeof window === "undefined") return LEGACY_STORAGE_KEY;
  try {
    const profileId = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    return profileId ? `${LEGACY_STORAGE_KEY}:${profileId}` : LEGACY_STORAGE_KEY;
  } catch {
    return LEGACY_STORAGE_KEY;
  }
}

// A tag can carry a BEHAVIOR — what happens to a card when you apply the tag.
// This is what turns color tags into a workflow (own it / want it / swap it)
// instead of just a visual marker. A tag with a missing behavior is treated as
// "marker" (no side effect), so tags saved before this field shipped keep working.
export const TAG_BEHAVIORS = [
  { id: "marker", label: "Just a marker (no action)" },
  { id: "collection", label: "I own it → add to collection" },
  { id: "wishlist", label: "Want it → add to wishlist" },
  { id: "consider", label: "Considering (not sure yet)" },
  { id: "swap", label: "Swap — let Karn suggest replacements" },
];

export const behaviorLabel = (id) =>
  (TAG_BEHAVIORS.find(behavior => behavior.id === id) || TAG_BEHAVIORS[0]).label;

// The built-in starter set, matching the acquisition-tracking tags the user is
// used to, each wired to a behavior. `builtin: true` marks the unset/Default tag
// so the UI treats it specially (the "no tag" state; can't be deleted).
export const DEFAULT_COLOR_TAGS = [
  { id: "default", name: "Default", color: "#656565", behavior: "marker", builtin: true },
  { id: "have", name: "Have", color: "#37d67a", behavior: "collection" },
  { id: "getting", name: "Getting", color: "#2ccce4", behavior: "wishlist" },
  { id: "considering", name: "Considering", color: "#f47373", behavior: "consider" },
  { id: "wrong-print", name: "Have wrong printing", color: "#fa890d", behavior: "marker" },
  { id: "swap", name: "Swap", color: "#a36bd4", behavior: "swap" },
];

function loadTags() {
  if (typeof window === "undefined") return DEFAULT_COLOR_TAGS;
  try {
    const key = storageKey();
    let raw = window.localStorage.getItem(key);
    // One-time migration: definitions used to live under the single global
    // key. Seed this profile's namespace from it; the legacy key is left in
    // place so every other profile inherits the same starting set the first
    // time it loads (their per-card assignments reference these same ids).
    if (!raw && key !== LEGACY_STORAGE_KEY) {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        window.localStorage.setItem(key, legacy);
        raw = legacy;
      }
    }
    if (!raw) return DEFAULT_COLOR_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_COLOR_TAGS;
  } catch {
    return DEFAULT_COLOR_TAGS;
  }
}

/** Write the tag set to the localStorage sync cache (best-effort; never throws). */
function saveTagsToCache(tags) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(), JSON.stringify(tags));
  } catch {
    // localStorage failures must not break the app.
  }
}

/**
 * Ids of the user's swap-behavior tags, read from the localStorage sync CACHE (no
 * hook / render / await needed). The chat hook calls this synchronously to tell
 * Karn which cards the user flagged for replacement; the cache is kept current by
 * the hook's write-through. SSR-safe: returns [] when localStorage is unavailable.
 */
export function swapBehaviorTagIds() {
  return loadTags().filter(tag => tag.behavior === "swap").map(tag => tag.id);
}

function makeId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return `tag-${globalThis.crypto.randomUUID()}`;
  return `tag-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export default function useColorTags() {
  const [tags, setTags] = useState(DEFAULT_COLOR_TAGS);
  const [loaded, setLoaded] = useState(false);
  // Skip the very first write-through: it would just PUT the server's own tags
  // straight back on hydrate. Real user edits (after load) always persist.
  const skipNextPersist = useRef(false);

  // Hydrate: render the localStorage cache instantly (no flash), then reconcile
  // with the server — server is the source of truth. A brand-new profile (server
  // returns null) migrates the local set up once.
  useEffect(() => {
    const cached = loadTags();
    setTags(cached);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/color-tags", { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (Array.isArray(data.tags) && data.tags.length) {
          // Server has this profile's tags → authoritative. Adopt + refresh cache;
          // don't echo them straight back with a redundant PUT.
          skipNextPersist.current = true;
          setTags(data.tags);
          saveTagsToCache(data.tags);
        } else {
          // Never saved for this profile → migrate the local/legacy/default set up.
          // We just PUT it, so skip the persist the loaded-flip would otherwise trigger.
          skipNextPersist.current = true;
          fetch("/api/color-tags", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: cached }),
          }).catch(() => {});
        }
      } catch {
        // Offline / server down → the cache stands (local-first).
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist on change (after the initial hydrate): write-through to the cache
  // (keeps swapBehaviorTagIds current) AND to the server (durable). Both
  // best-effort — a failed save never breaks the UI.
  useEffect(() => {
    if (!loaded) return;
    if (skipNextPersist.current) { skipNextPersist.current = false; return; }
    saveTagsToCache(tags);
    fetch("/api/color-tags", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    }).catch(() => {});
  }, [tags, loaded]);

  const addTag = ({ name, color, behavior }) => {
    const tag = {
      id: makeId(),
      name: (name || "").trim() || "New tag",
      color: color || "#999999",
      behavior: behavior || "marker",
    };
    setTags(current => [...current, tag]);
    return tag;
  };

  const updateTag = (id, patch) => {
    setTags(current => current.map(tag => (tag.id === id ? { ...tag, ...patch } : tag)));
  };

  const deleteTag = (id) => {
    setTags(current => current.filter(tag => tag.id !== id));
  };

  const tagById = (id) => tags.find(tag => tag.id === id) || null;

  return { tags, addTag, updateTag, deleteTag, tagById };
}
