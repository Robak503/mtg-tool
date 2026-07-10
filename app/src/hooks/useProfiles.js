"use client";

/**
 * useProfiles — client data layer for local multi-user profiles.
 *
 * Wraps /api/profiles. The first GET also triggers the one-time server
 * migration (legacy single-user data -> per-profile namespaces), so this hook
 * is what makes profiles "go live" on launch.
 *
 * Switching a profile is a hard reload: every route resolves user data through
 * the active-profile pointer on the server, so window.location.reload() is the
 * clean way to swap the whole app (decks, Vault, chats, games) at once and drop
 * any stale per-user client state.
 */
import { useCallback, useEffect, useState } from "react";

export default function useProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetch("/api/profiles");
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.error || "Failed to load profiles");
      setProfiles(body.profiles || []);
      setActiveId(body.activeProfileId || null);
      // Mirror the active profile id into localStorage so synchronous client
      // stores (useColorTags) can namespace per profile without a fetch.
      if (typeof window !== "undefined" && body.activeProfileId) {
        try { window.localStorage.setItem("mtg-active-profile-id", body.activeProfileId); } catch { /* non-fatal */ }
      }
      setStatus("ready");
      setError(null);
      return body;
    } catch (e) {
      setStatus("error");
      setError(e.message || "Failed to load profiles");
      return null;
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // TRAY-STALENESS fix (GHOST-REGISTRY incident, 2026-07-10): the window close button HIDES to the
  // tray, so a webview can live for DAYS with registry state fetched at mount — re-showing it then
  // presents days-old profile names/active as current (the "my decks are under the wrong profile"
  // report). Re-fetch whenever the window becomes visible/focused again; the server read is cheap.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refresh]);

  const create = useCallback(async (name) => {
    const resp = await fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || "Failed to create profile");
    await refresh();
    return body.profile;
  }, [refresh]);

  const rename = useCallback(async (id, name) => {
    const resp = await fetch(`/api/profiles/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || "Failed to rename profile");
    await refresh();
    return body.profile;
  }, [refresh]);

  const remove = useCallback(async (id) => {
    const resp = await fetch(`/api/profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || "Failed to delete profile");
    await refresh();
    return body;
  }, [refresh]);

  // Switch the active profile, then hard-reload so every per-profile fetch
  // resolves to the new namespace. `reload` is injectable for tests.
  //
  // localStorage is domain-global, NOT profile-scoped — so before reloading we
  // must drop the keys that hold per-user data, or the new profile would
  // silently hydrate the previous profile's last-open chat. Color-tag
  // DEFINITIONS are per-profile-namespaced (mtg-color-tags-v1:<id>, see
  // useColorTags) and must NOT be deleted — wiping them destroyed the custom
  // tags that per-profile card assignments still reference (U-F4). Global
  // preferences (model tier, update banner, feedback panel pos) are
  // intentionally left alone so they follow the user across profiles.
  const switchTo = useCallback(async (id, reload = () => window.location.reload()) => {
    const resp = await fetch("/api/profiles/active", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const body = await resp.json();
    if (!resp.ok) throw new Error(body.error || "Failed to switch profile");
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem("mtg-active-session-ids");
        window.localStorage.removeItem("mtg-decks-v3");
        window.localStorage.removeItem("mtg-decks-v2");
        // Point the synchronous profile mirror at the new profile BEFORE the
        // reload so early readers (useColorTags) resolve the right namespace.
        window.localStorage.setItem("mtg-active-profile-id", id);
      } catch { /* private mode / disabled storage — reload still corrects the server data */ }
    }
    reload();
    return body;
  }, []);

  const activeProfile = profiles.find(p => p.id === activeId) || null;

  return { profiles, activeId, activeProfile, status, error, refresh, create, rename, remove, switchTo };
}
