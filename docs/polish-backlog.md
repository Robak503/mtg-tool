# Polish & Information-Architecture Backlog

The **final pre-1.0.0 phase: a full layout overhaul.** Once features are built,
this is the punch list for the redesign — re-laying-out the whole app and
moving every widget to where it belongs. Intentionally deferred and done as one
coherent pass (so the app feels deliberately designed, not incrementally
shuffled), gated through gstack `/design-review` + `/qa`. **"Ready to ship" = the
1.0.0 release, and this overhaul is the last thing before it.**

> Owner's framing (2026-05-31): *"by ready to ship I mean the final 1.0.0
> release; prior to that final release will be a full overhaul of the layout."*
> and: *"the Vault showing the mana curve, which has nothing to do with finance,
> but would be great in Karn."*

> **Scope rule (owner, 2026-05-31): only defer *purely cosmetic* items to the
> 1.0.0 overhaul — 1.0.0 is still a long way off.** Anything *functional* (a bug,
> broken interaction, slow/confusing behavior) gets fixed **now**, not parked here.
> Example fixes already shipped inline rather than deferred: chat auto-scroll
> hijack, stream surviving a view switch, Tibalt's slow streaming, grail price
> floor. This file is for layout/placement/visual-consistency only.

---

## Relocations (right widget, wrong place)

| # | Move | From → To | Why |
|---|------|-----------|-----|
| P-1 | **Mana curve** | Vault → **Stats** tab → **Karn** (per-deck analysis) | A collection-wide curve is weak signal; curve is only actionable against a specific 99. Karn already reasons about curve/role coverage. Keep Vault Stats to *collection facts* (type/color/rarity/value/sets/most-valuable). |

## UI cleanup (styling / consistency / affordances)

_(seed as noticed during build — examples: button placement, spacing, label
casing, redundant controls, empty-state copy, modal vs. inline, tab order)_

- **Shorthand/longhand style mixing → React warnings.** Several buttons spread a
  base style that sets the `border` shorthand and then override `borderColor`
  (longhand), which logs *"Removing borderColor border"* on every rerender.
  App-wide (mounted everywhere via `AppHeader.jsx:136`), plus `CollectionAddModal`,
  `CollectionImportModal`, `CollectionCardDetail` (`primaryBtn`/`dangerBtn`),
  `GarfieldPanel`. Fix: use the full `border` shorthand in the override instead of
  `borderColor`. (Already fixed in `CollectionView` during #12.) Clean sweep here.

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
