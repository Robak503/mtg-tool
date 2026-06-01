# Polish & Information-Architecture Backlog

The **final pre-ship phase**: once features are built, this is the punch list of
UI cleanup + "put each thing where it belongs" moves. Intentionally deferred —
done as one coherent pass (so the app feels unified) and gated through gstack
`/design-review` + `/qa`, not piecemeal during feature work.

> Owner's framing (2026-05-31): *"after everything is programmed, the last
> changes are all gonna be UI cleanup and location changes — example: the Vault
> showing the mana curve, which has nothing to do with finance, but would be
> great in Karn."*

---

## Relocations (right widget, wrong place)

| # | Move | From → To | Why |
|---|------|-----------|-----|
| P-1 | **Mana curve** | Vault → **Stats** tab → **Karn** (per-deck analysis) | A collection-wide curve is weak signal; curve is only actionable against a specific 99. Karn already reasons about curve/role coverage. Keep Vault Stats to *collection facts* (type/color/rarity/value/sets/most-valuable). |

## UI cleanup (styling / consistency / affordances)

_(seed as noticed during build — examples: button placement, spacing, label
casing, redundant controls, empty-state copy, modal vs. inline, tab order)_

- (none logged yet — populate during the polish pass with `/design-review`)

## Information architecture (navigation / grouping)

- Revisit tab/section grouping in the Vault and deck views once all features land
  (Collection / Stats / Finance / Decks — confirm each panel is in the most
  contextually obvious home).

---

## Process for the polish phase

1. Freeze feature work (`/freeze` to the relevant dirs if helpful).
2. Walk every view in the running app; log each cleanup/relocation here first.
3. Run `/design-review` (designer's-eye QA) and `/qa` against the dev server.
4. Execute relocations + cleanups in small, reviewable PRs grouped by area.
5. Cut a polish release.
