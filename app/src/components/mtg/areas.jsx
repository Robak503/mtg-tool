/**
 * areas.jsx — THE AREA REGISTRY for the kiosk shell.
 *
 * ── HOW TO ADD A NEW AREA (no AI required) ─────────────────────────────
 * 1. Add an entry to AREAS below: { id, title, tagline, icon, defaultView }.
 *    - id: short unique string. It becomes the `area` state value.
 *    - defaultView: which centerView opens when the area is entered.
 *    - icon: a React component (see the pixel-art icons below for the style;
 *      12×12 SVG grids with shapeRendering="crispEdges" keep the look).
 * 2. In MTGAssistant.jsx, render your area's surface(s): find the
 *    "AREA ROUTING" comment — each area maps its centerViews to components
 *    there. Add a branch for your defaultView.
 * 3. That's it. The LandingScreen and the bottom AreaBar both render from
 *    this array — a new entry automatically gets a landing card and a
 *    bottom-bar button. Keep titles short (kiosk targets stay big).
 *
 * Design rules (LEYLINE): compose from var(--ley-*) tokens, never hand-hex
 * (pixel-art palettes are identity/data colors — the sanctioned exception,
 * like mana pips). One glowing primary per surface. See /styleguide.
 * ────────────────────────────────────────────────────────────────────────
 */

/* ── Pixel-art portraits (12×12, hand-placed rects, crispEdges) ──────────
   Inline SVG so the .exe needs zero image assets and stays offline-safe.
   Each cell is 1 unit; `px(x, y, w, fill)` paints a run of cells. */

function px(x, y, w, fill, key) {
  return <rect key={key} x={x} y={y} width={w} height={1} fill={fill} />;
}

function PixelSvg({ rows, size = 96, grid = 12, label }) {
  // rows: array of [x, y, w, color] runs on a grid×grid canvas
  return (
    <svg
      viewBox={`0 0 ${grid} ${grid}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      style={{ imageRendering: "pixelated", display: "block" }}
    >
      {rows.map((r, i) => px(r[0], r[1], r[2], r[3], i))}
    </svg>
  );
}

/* Jace — hooded blue mage, glowing arcane eyes (24×24, LEYLINE v5.3).
   Hand-placed runs; palette documented in design/leyline. Persona colors
   are identity data — the sanctioned non-green exception. */
export function JacePixel({ size = 96 }) {
  return (
    <PixelSvg
      size={size}
      grid={24}
      label="Jace pixel portrait"
      rows={[
        [11, 0, 2, "#2b5486"], [10, 1, 4, "#2b5486"], [9, 2, 6, "#2b5486"], [8, 3, 2, "#1d3a5f"], [10, 3, 3, "#2b5486"],
        [13, 3, 3, "#1d3a5f"], [7, 4, 10, "#1d3a5f"], [6, 5, 12, "#1d3a5f"], [6, 6, 2, "#1d3a5f"], [8, 6, 8, "#0a1622"],
        [16, 6, 2, "#1d3a5f"], [5, 7, 2, "#1d3a5f"], [7, 7, 10, "#0a1622"], [17, 7, 2, "#1d3a5f"], [21, 7, 1, "#3f7fc4"],
        [5, 8, 2, "#1d3a5f"], [7, 8, 10, "#0a1622"], [17, 8, 2, "#1d3a5f"], [4, 9, 2, "#1d3a5f"], [6, 9, 12, "#0a1622"],
        [18, 9, 2, "#1d3a5f"], [22, 9, 1, "#6ab8ff"], [4, 10, 2, "#1d3a5f"], [6, 10, 12, "#0a1622"], [18, 10, 2, "#1d3a5f"],
        [1, 10, 1, "#6ab8ff"], [4, 11, 2, "#1d3a5f"], [6, 11, 2, "#0a1622"], [8, 11, 3, "#bfe9ff"], [11, 11, 2, "#0a1622"],
        [13, 11, 3, "#bfe9ff"], [16, 11, 2, "#0a1622"], [18, 11, 2, "#1d3a5f"], [21, 11, 1, "#3f7fc4"], [4, 12, 2, "#1d3a5f"],
        [6, 12, 2, "#0a1622"], [8, 12, 3, "#5fb3f0"], [11, 12, 2, "#0a1622"], [13, 12, 3, "#5fb3f0"], [16, 12, 2, "#0a1622"],
        [18, 12, 2, "#1d3a5f"], [4, 13, 2, "#1d3a5f"], [6, 13, 12, "#0a1622"], [18, 13, 2, "#1d3a5f"], [4, 14, 2, "#1d3a5f"],
        [6, 14, 5, "#0a1622"], [11, 14, 1, "#7e93ab"], [12, 14, 6, "#0a1622"], [18, 14, 2, "#1d3a5f"], [5, 15, 2, "#1d3a5f"],
        [7, 15, 3, "#0a1622"], [10, 15, 4, "#7e93ab"], [14, 15, 3, "#0a1622"], [17, 15, 2, "#1d3a5f"], [6, 16, 2, "#1d3a5f"],
        [8, 16, 3, "#0a1622"], [11, 16, 2, "#7e93ab"], [13, 16, 3, "#0a1622"], [16, 16, 2, "#1d3a5f"], [6, 17, 12, "#122840"],
        [4, 18, 16, "#152a45"], [2, 19, 20, "#152a45"], [0, 19, 1, "#6ab8ff"], [1, 20, 10, "#152a45"], [11, 20, 2, "#a33b30"],
        [13, 20, 10, "#152a45"], [0, 21, 11, "#152a45"], [11, 21, 2, "#a33b30"], [13, 21, 11, "#152a45"], [0, 22, 24, "#0f1f33"],
        [1, 23, 22, "#0f1f33"],
      ]}
    />
  );
}

/* Karn — silver golem, calm white gaze, Urza-red tabard (24×24, v5.3). */
export function KarnPixel({ size = 96 }) {
  return (
    <PixelSvg
      size={size}
      grid={24}
      label="Karn pixel portrait"
      rows={[
        [11, 0, 2, "#7c7b85"], [10, 1, 4, "#9a99a4"], [9, 2, 1, "#c7c6cd"], [10, 2, 3, "#dfdee4"], [13, 2, 2, "#c7c6cd"],
        [8, 3, 8, "#c7c6cd"], [8, 4, 8, "#c7c6cd"], [8, 5, 1, "#7c7b85"], [9, 5, 6, "#c7c6cd"], [15, 5, 1, "#7c7b85"],
        [8, 6, 1, "#7c7b85"], [9, 6, 2, "#9a99a4"], [11, 6, 2, "#c7c6cd"], [13, 6, 2, "#9a99a4"], [15, 6, 1, "#7c7b85"],
        [8, 7, 1, "#9a99a4"], [9, 7, 2, "#f6fff8"], [11, 7, 2, "#9a99a4"], [13, 7, 2, "#f6fff8"], [15, 7, 1, "#9a99a4"],
        [8, 8, 8, "#9a99a4"], [8, 9, 2, "#7c7b85"], [10, 9, 4, "#9a99a4"], [14, 9, 2, "#7c7b85"], [9, 10, 2, "#7c7b85"],
        [11, 10, 2, "#4c4b55"], [13, 10, 2, "#7c7b85"], [10, 11, 4, "#4c4b55"], [10, 12, 4, "#4c4b55"], [4, 13, 6, "#c7c6cd"],
        [10, 13, 4, "#4c4b55"], [14, 13, 6, "#c7c6cd"], [1, 14, 5, "#dfdee4"], [6, 14, 17, "#c7c6cd"], [0, 15, 6, "#c7c6cd"],
        [6, 15, 3, "#9a99a4"], [9, 15, 6, "#4c4b55"], [15, 15, 3, "#9a99a4"], [18, 15, 6, "#c7c6cd"], [0, 16, 6, "#c7c6cd"],
        [6, 16, 3, "#9a99a4"], [9, 16, 2, "#4c4b55"], [11, 16, 2, "#8f2f2a"], [13, 16, 2, "#4c4b55"], [15, 16, 3, "#9a99a4"],
        [18, 16, 6, "#c7c6cd"], [0, 17, 6, "#9a99a4"], [6, 17, 3, "#7c7b85"], [9, 17, 2, "#4c4b55"], [11, 17, 2, "#8f2f2a"],
        [13, 17, 2, "#4c4b55"], [15, 17, 3, "#7c7b85"], [18, 17, 6, "#9a99a4"], [0, 18, 6, "#9a99a4"], [6, 18, 3, "#7c7b85"],
        [9, 18, 6, "#4c4b55"], [15, 18, 3, "#7c7b85"], [18, 18, 6, "#9a99a4"], [0, 19, 5, "#7c7b85"], [5, 19, 4, "#4c4b55"],
        [9, 19, 2, "#4c4b55"], [11, 19, 2, "#d4a94e"], [13, 19, 2, "#4c4b55"], [15, 19, 4, "#4c4b55"], [19, 19, 5, "#7c7b85"],
        [0, 20, 24, "#7c7b85"], [0, 21, 24, "#4c4b55"], [1, 22, 22, "#4c4b55"], [2, 23, 20, "#4c4b55"],
      ]}
    />
  );
}

/* Tibalt — horned fiend, gold eyes, toothed grin, fur coat (24×24, v5.3). */
export function TibaltPixel({ size = 96 }) {
  return (
    <PixelSvg
      size={size}
      grid={24}
      label="Tibalt pixel portrait"
      rows={[
        [3, 0, 2, "#4a2020"], [19, 0, 2, "#4a2020"], [4, 1, 2, "#4a2020"], [18, 1, 2, "#4a2020"], [5, 2, 2, "#4a2020"],
        [17, 2, 2, "#4a2020"], [6, 3, 1, "#4a2020"], [7, 3, 3, "#6e2620"], [11, 3, 2, "#93362e"], [13, 3, 3, "#6e2620"],
        [17, 3, 1, "#4a2020"], [7, 4, 10, "#6e2620"], [6, 5, 12, "#93362e"], [5, 6, 14, "#c94f42"], [5, 7, 14, "#c94f42"],
        [5, 8, 2, "#c94f42"], [7, 8, 3, "#93362e"], [10, 8, 4, "#c94f42"], [14, 8, 3, "#93362e"], [17, 8, 2, "#c94f42"],
        [5, 9, 2, "#c94f42"], [7, 9, 3, "#f2c659"], [10, 9, 4, "#c94f42"], [14, 9, 3, "#f2c659"], [17, 9, 2, "#c94f42"],
        [5, 10, 14, "#c94f42"], [5, 11, 6, "#c94f42"], [11, 11, 2, "#93362e"], [13, 11, 6, "#c94f42"], [5, 12, 1, "#c94f42"],
        [6, 12, 12, "#2b0f0f"], [18, 12, 1, "#c94f42"], [6, 13, 1, "#c94f42"], [7, 13, 2, "#e8ddcc"], [9, 13, 2, "#2b0f0f"],
        [11, 13, 2, "#e8ddcc"], [13, 13, 2, "#2b0f0f"], [15, 13, 2, "#e8ddcc"], [17, 13, 1, "#c94f42"], [7, 14, 10, "#2b0f0f"],
        [8, 15, 8, "#c94f42"], [9, 16, 6, "#93362e"], [10, 17, 4, "#93362e"], [2, 18, 4, "#efe6d8"], [6, 18, 16, "#d8cbb8"],
        [1, 19, 3, "#efe6d8"], [4, 19, 14, "#d8cbb8"], [18, 19, 5, "#b5a48e"], [0, 20, 4, "#d8cbb8"], [4, 20, 3, "#b5a48e"],
        [7, 20, 10, "#d8cbb8"], [17, 20, 3, "#b5a48e"], [20, 20, 4, "#d8cbb8"], [0, 21, 3, "#b5a48e"], [3, 21, 18, "#d8cbb8"],
        [21, 21, 3, "#b5a48e"], [1, 22, 22, "#b5a48e"], [2, 23, 20, "#6e3a30"],
      ]}
    />
  );
}

/* ── Area icons (same pixel language, LEYLINE green family) ─────────── */

/* The Agents — a speech rune. */
export function AgentsIcon({ size = 64 }) {
  const g = "#56d65d", dim = "#2e9a3f";
  return (
    <PixelSvg
      size={size}
      label="Agents icon"
      rows={[
        [2, 1, 8, dim],
        [1, 2, 10, g],
        [1, 3, 10, g],
        [1, 4, 2, g], [4, 4, 1, "#05130a"], [6, 4, 1, "#05130a"], [8, 4, 3, g],
        [1, 5, 10, g],
        [1, 6, 10, g],
        [2, 7, 9, dim],
        [3, 8, 2, g],
        [3, 9, 1, dim],
      ]}
    />
  );
}

/* The Proving Grounds — crossed blades. */
export function ProvingIcon({ size = 64 }) {
  const g = "#56d65d", dim = "#2e9a3f", hi = "#74ff86";
  return (
    <PixelSvg
      size={size}
      label="Proving Grounds icon"
      rows={[
        [1, 1, 1, hi], [10, 1, 1, hi],
        [2, 2, 1, g], [9, 2, 1, g],
        [3, 3, 1, g], [8, 3, 1, g],
        [4, 4, 1, g], [7, 4, 1, g],
        [5, 5, 2, hi],
        [5, 6, 2, hi],
        [4, 7, 1, g], [7, 7, 1, g],
        [3, 8, 1, g], [8, 8, 1, g],
        [2, 9, 2, dim], [8, 9, 2, dim],
        [1, 10, 2, dim], [9, 10, 2, dim],
      ]}
    />
  );
}

/* The Vault — a chest with a glowing gem. */
export function VaultIcon({ size = 64 }) {
  const g = "#56d65d", dim = "#2e9a3f", hi = "#74ff86", dark = "#123516";
  return (
    <PixelSvg
      size={size}
      label="Vault icon"
      rows={[
        [2, 2, 8, dim],
        [1, 3, 10, g],
        [1, 4, 10, g],
        [1, 5, 4, g], [5, 5, 2, hi], [7, 5, 4, g],
        [1, 6, 10, dark],
        [1, 7, 10, g],
        [1, 8, 10, g],
        [1, 9, 10, g],
        [2, 10, 8, dim],
      ]}
    />
  );
}

/* The Library — an open book. */
export function LibraryIcon({ size = 64 }) {
  const g = "#56d65d", dim = "#2e9a3f", hi = "#74ff86";
  return (
    <PixelSvg
      size={size}
      label="Library icon"
      rows={[
        [2, 2, 3, dim], [7, 2, 3, dim],
        [1, 3, 4, g], [7, 3, 4, g],
        [1, 4, 4, hi], [7, 4, 4, hi],
        [1, 5, 4, g], [7, 5, 4, g],
        [1, 6, 4, g], [7, 6, 4, g],
        [1, 7, 4, g], [7, 7, 4, g],
        [1, 8, 4, dim], [7, 8, 4, dim],
        [5, 3, 2, dim], [5, 8, 2, dim],
      ]}
    />
  );
}

/* ── THE REGISTRY ───────────────────────────────────────────────────── */

export const AREAS = [
  {
    id: "agents",
    title: "The Agents",
    tagline: "Jace · Karn · Tibalt — rules, builds, roasts",
    icon: AgentsIcon,
    defaultView: "agents-home",
  },
  {
    // id stays "proving" internally (all routing/saved-state keys on it); the USER sees "The Crucible".
    id: "proving",
    title: "The Crucible",
    tagline: "Sim Center · Records · Post-Mortem",
    icon: ProvingIcon,
    defaultView: "proving-home",
  },
  {
    // The Academy absorbs the old Library — learn-to-play, Judge Trials, and the rules/rulings explainers.
    id: "academy",
    title: "The Academy",
    tagline: "Learn to play · Judge Trials · Rules",
    icon: LibraryIcon,
    defaultView: "academy-home",
  },
  {
    id: "vault",
    title: "The Vault",
    tagline: "Stacks · Ledger · Atlas · Forge",
    icon: VaultIcon,
    defaultView: "vault-home",
  },
];
