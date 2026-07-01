"use client";

/**
 * useColorTags — the user's custom card color-tag set (Archidekt-style labels).
 *
 * A per-profile set of tags { id, name, color } that can be applied to cards
 * across decks and the Vault. Seeded with the familiar acquisition tags
 * (Have / Getting / Don't Have / Have wrong printing) plus an unset Default;
 * the user can create, rename, recolor, and delete their own. Persisted to
 * localStorage (local-first — no server round-trip), namespaced by the active
 * profile id (U-F4): per-card assignments live per-profile on the server, so
 * the definitions they reference must survive a profile switch too. STOPGAP —
 * the durable fix is server-side per-profile tag storage.
 *
 * Per-card assignment (which card has which tag) is stored separately on the
 * card/deck data; this hook only owns the tag definitions.
 */

import { useEffect, useState } from "react";

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

/**
 * Ids of the user's swap-behavior tags, read straight from localStorage (no
 * hook / render needed). The chat hook calls this to tell Karn which cards the
 * user has flagged for replacement, since the server stores only colorTagId.
 * SSR-safe: returns [] when window/localStorage is unavailable.
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

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setTags(loadTags());
    setLoaded(true);
  }, []);

  // Persist on change, but only after the initial hydrate so we never clobber
  // saved tags with the defaults on first render.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(storageKey(), JSON.stringify(tags));
    } catch {
      // localStorage failures must not break the app.
    }
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
