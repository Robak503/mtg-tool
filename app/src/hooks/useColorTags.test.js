/**
 * useColorTags — per-profile namespacing + legacy migration (U-F4).
 *
 * The vitest env is node (no jsdom), so we stub window.localStorage and
 * exercise the storage behavior through swapBehaviorTagIds(), which reads
 * tags via the same loadTags() path the hook hydrates from. What's asserted:
 *
 *   1. With an active-profile pointer set, tags resolve from the namespaced
 *      key (mtg-color-tags-v1:<profileId>), not the legacy global key.
 *   2. First read for a profile with no namespaced entry MIGRATES the legacy
 *      definitions into the namespace (and keeps reading them), leaving the
 *      legacy key intact so other profiles can inherit the same set.
 *   3. No pointer → the legacy key keeps working (pre-profiles installs).
 *
 * This is the stopgap for the profile-switch bug where switchTo() deleted
 * mtg-color-tags-v1 outright, destroying custom tag definitions that
 * per-profile card assignments (server-side colorTagId) still referenced.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { swapBehaviorTagIds } from "./useColorTags";

const LEGACY_KEY = "mtg-color-tags-v1";
const PROFILE_KEY = "mtg-active-profile-id";

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    _store: store,
  };
}

const customTags = (swapId) => JSON.stringify([
  { id: "default", name: "Default", color: "#656565", behavior: "marker", builtin: true },
  { id: swapId, name: "Swap", color: "#a36bd4", behavior: "swap" },
]);

describe("useColorTags per-profile storage (U-F4)", () => {
  let ls;

  beforeEach(() => {
    ls = makeLocalStorageStub();
    globalThis.window = { localStorage: ls };
  });

  afterEach(() => {
    delete globalThis.window;
  });

  it("reads the namespaced key when an active-profile pointer exists", () => {
    ls.setItem(PROFILE_KEY, "p1");
    ls.setItem(`${LEGACY_KEY}:p1`, customTags("swap-p1"));
    ls.setItem(LEGACY_KEY, customTags("swap-legacy"));

    expect(swapBehaviorTagIds()).toEqual(["swap-p1"]);
  });

  it("migrates legacy definitions into the profile namespace on first read", () => {
    ls.setItem(PROFILE_KEY, "p2");
    ls.setItem(LEGACY_KEY, customTags("swap-custom"));

    // First read: falls back to legacy AND seeds the namespaced key.
    expect(swapBehaviorTagIds()).toEqual(["swap-custom"]);
    expect(ls.getItem(`${LEGACY_KEY}:p2`)).toBe(customTags("swap-custom"));
    // The legacy key survives so OTHER profiles inherit the same set.
    expect(ls.getItem(LEGACY_KEY)).toBe(customTags("swap-custom"));

    // The namespace is now authoritative: later legacy changes don't leak in.
    ls.setItem(LEGACY_KEY, customTags("swap-other"));
    expect(swapBehaviorTagIds()).toEqual(["swap-custom"]);
  });

  it("keeps using the legacy key when no profile pointer exists", () => {
    ls.setItem(LEGACY_KEY, customTags("swap-legacy"));

    expect(swapBehaviorTagIds()).toEqual(["swap-legacy"]);
    // No pointer → nothing to migrate to.
    expect([...ls._store.keys()].filter(k => k.startsWith(`${LEGACY_KEY}:`))).toEqual([]);
  });

  it("falls back to the built-in defaults when nothing is stored", () => {
    ls.setItem(PROFILE_KEY, "p3");
    // DEFAULT_COLOR_TAGS ships one swap-behavior tag with id "swap".
    expect(swapBehaviorTagIds()).toEqual(["swap"]);
  });
});
