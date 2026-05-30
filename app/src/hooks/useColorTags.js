"use client";

/**
 * useColorTags — the user's custom card color-tag set (Archidekt-style labels).
 *
 * A single global set of tags { id, name, color } that can be applied to cards
 * across decks and the Vault. Seeded with the familiar acquisition tags
 * (Have / Getting / Don't Have / Have wrong printing) plus an unset Default;
 * the user can create, rename, recolor, and delete their own. Persisted to
 * localStorage (local-first — no server round-trip).
 *
 * Per-card assignment (which card has which tag) is stored separately on the
 * card/deck data; this hook only owns the tag definitions.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "mtg-color-tags-v1";

// The built-in starter set, matching the acquisition-tracking tags the user
// is used to. `builtin: true` marks the unset/Default tag so the UI can treat
// it specially (it's the "no tag" state and shouldn't be deleted).
export const DEFAULT_COLOR_TAGS = [
  { id: "default", name: "Default", color: "#656565", builtin: true },
  { id: "have", name: "Have", color: "#37d67a" },
  { id: "getting", name: "Getting", color: "#2ccce4" },
  { id: "dont-have", name: "Don't Have", color: "#f47373" },
  { id: "wrong-print", name: "Have wrong printing", color: "#fa890d" },
];

function loadTags() {
  if (typeof window === "undefined") return DEFAULT_COLOR_TAGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLOR_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_COLOR_TAGS;
  } catch {
    return DEFAULT_COLOR_TAGS;
  }
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
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tags));
    } catch {
      // localStorage failures must not break the app.
    }
  }, [tags, loaded]);

  const addTag = ({ name, color }) => {
    const tag = { id: makeId(), name: (name || "").trim() || "New tag", color: color || "#999999" };
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
