/**
 * Android-WebView runtime contract for the first Omnath phone slice.
 *
 * Paths are repository-relative so build tooling can evaluate the same contract
 * from a Git worktree, CI checkout, or future Android packaging workspace.
 * Adding an entrypoint or external package is a reviewed boundary change: the
 * portability guard walks every reachable relative import before it is allowed
 * into the APK graph.
 */
export const MOBILE_RUNTIME_MANIFEST = Object.freeze({
  schemaVersion: 1,
  runtime: "android-webview",
  entrypoints: Object.freeze([
    Object.freeze({
      id: "rules-play-core",
      file: "app/src/lib/mobile/runtime.js",
      exports: Object.freeze([
        "classifyCard",
        "isNativeTier",
        "createGameState",
        "createPermanent",
        "legalActionsForPlayer",
        "filterActions",
        "dispatchAction",
        "resolveCombatDamage",
        "checkAllStateBasedActions",
        "permanentPower",
        "permanentToughness",
        "applyCounterDoubling",
        "checkLandfallTriggers",
        "flushTriggers",
      ]),
    }),
  ]),
  allowedPackages: Object.freeze([]),
  forbiddenPathPrefixes: Object.freeze(["app/src/lib/server/", "app/src/app/api/", "app/scripts/"]),
});
