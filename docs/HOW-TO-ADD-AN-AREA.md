# How to add a new AREA to the kiosk shell (no AI required)

The app's top-level navigation is: **Landing screen → areas → surfaces**,
with a bottom AreaBar to hop between areas. All of it renders from ONE
registry, so adding an area is three small steps.

## 1. Register it — `app/src/components/mtg/areas.jsx`

Add an entry to the `AREAS` array:

```jsx
{
  id: "workshop",                 // unique string — becomes the area state value
  title: "The Workshop",          // shows on the landing card + bottom bar
  tagline: "What it's for",       // one line under the title on the landing card
  icon: WorkshopIcon,             // a React component (see below)
  defaultView: "workshop-home",   // which centerView opens on entry
},
```

For the icon, copy one of the existing pixel-art components in the same
file (`AgentsIcon` / `ProvingIcon` / `VaultIcon`): a 12×12 grid of
`[x, y, width, color]` runs rendered with `shapeRendering="crispEdges"`.
Stick to the LEYLINE greens (`#56d65d`, `#74ff86`, `#2e9a3f`) for area
icons; character portraits may use identity palettes.

**That's all the landing screen and bottom bar need** — both are
registry-driven and will show the new area automatically.

## 2. Route it — `app/src/components/MTGAssistant.jsx`

Search for `AREA ROUTING` (it appears twice):

- The first hit is `enterArea` — nothing to do there; it reads
  `defaultView` from your registry entry.
- The second hit is the center switch. Add a branch for your view:

```jsx
{centerView==="workshop-home"?(
  <WorkshopHome onPick={...} fontFamily={F} />
):centerView==="agents-home"?(
```

Import your component at the top of the file with the other
`./mtg/` imports.

## 3. Build the surface — `app/src/components/mtg/WorkshopHome.jsx`

Copy `ProvingHome.jsx` as the template — it's the canonical "area front
door": a centered column of big `.ley-card` glass buttons. Design rules
(see `/styleguide` in a running app):

- Compose from `var(--ley-*)` tokens. Never hand-hex a color.
- Buttons use the `.btn` classes. ONE `btn-primary` per screen.
- Only primary actions, live states, and focus glow.
- Titles in `var(--font-display)`, section labels in mono tracked caps.

## Notes

- The area state lives in `MTGAssistant.jsx` (`const [area, setArea]`);
  `"home"` is the landing screen and is not a registry entry.
- On mobile the AreaBar is replaced by the Home tab in `MobileTabBar` —
  new areas are reachable on mobile via Landing → card.
- Sub-surfaces inside an area are just more `centerView` values; wire
  them from your area-home's `onPick` (see how `ProvingHome` maps
  Academy/Sim/Pod Balance).
