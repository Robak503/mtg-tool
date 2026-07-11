# LEYLINE — the MTG Tool design system

Source of truth for the app's visual language: true-black aurora ground, soft
frosted glass, phosphor-green accent. Each `.html` file is a self-contained
spec card (first line carries the `@dsCard` marker) that renders standalone
and syncs to the claude.ai Design System project **"LEYLINE — MTG Tool Design
System"** via the DesignSync tool.

## Layout

- `foundations/` — the laws, color tokens, type roles, the six-layer glass
  recipe, the aurora ground.
- `components/` — glass panel, status bar, buttons, pills, stat tiles,
  progress bars, grind telemetry, deck card/row, run dock. Components that
  exist on both screen sizes show the desktop AND phone variant in one card
  (law 5: same parts, two arrangements).

## Rules of use

1. New UI starts from these cards — copy the token block and the `.glass`
   recipe verbatim; don't re-derive values.
2. Changing a token or recipe = edit the card here, re-sync the project,
   THEN apply in app code. The card library and the app must not drift.
3. Amber/red are semantic only. Peer items dress identically. Every page
   renders its own freshness. See `foundations/principles.html` — the Six Laws.

## Sync

From a Claude session: `DesignSync finalize_plan` against project
`8407f701-d8d3-4ee9-ba3a-1f40f2de9192` with `localDir` = this folder, then
`write_files` for the changed cards. Cards register themselves via their
first-line `@dsCard` comment.
