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

function PixelSvg({ rows, size = 96, label }) {
  // rows: array of [x, y, w, color] runs
  return (
    <svg
      viewBox="0 0 12 12"
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

/* Jace — hooded blue mage, glowing arcane eyes. */
export function JacePixel({ size = 96 }) {
  const hood = "#1d3a5f", hoodHi = "#2b5486", face = "#0a1622", eye = "#6ab8ff", cloak = "#152a45";
  return (
    <PixelSvg
      size={size}
      label="Jace pixel portrait"
      rows={[
        [4, 0, 4, hoodHi],
        [3, 1, 6, hood],
        [2, 2, 8, hood],
        [2, 3, 2, hood], [4, 3, 4, face], [8, 3, 2, hood],
        [1, 4, 2, hood], [3, 4, 6, face], [9, 4, 2, hood],
        [1, 5, 2, hood], [3, 5, 6, face], [9, 5, 2, hood],
        [1, 6, 2, hood], [3, 6, 1, face], [4, 6, 1, eye], [5, 6, 2, face], [7, 6, 1, eye], [8, 6, 1, face], [9, 6, 2, hood],
        [1, 7, 2, hood], [3, 7, 6, face], [9, 7, 2, hood],
        [2, 8, 2, hood], [4, 8, 4, face], [8, 8, 2, hood],
        [2, 9, 8, cloak],
        [1, 10, 10, cloak],
        [0, 11, 12, cloak],
      ]}
    />
  );
}

/* Karn — silver golem, calm white gaze. */
export function KarnPixel({ size = 96 }) {
  const body = "#c7c6cd", dark = "#7c7b85", deep = "#4c4b55", eye = "#f3fff6";
  return (
    <PixelSvg
      size={size}
      label="Karn pixel portrait"
      rows={[
        [5, 0, 2, dark],
        [3, 1, 6, body],
        [2, 2, 8, body],
        [2, 3, 8, body],
        [2, 4, 1, dark], [3, 4, 6, body], [9, 4, 1, dark],
        [2, 5, 2, body], [4, 5, 1, eye], [5, 5, 2, body], [7, 5, 1, eye], [8, 5, 2, body],
        [2, 6, 8, body],
        [3, 7, 2, dark], [5, 7, 2, deep], [7, 7, 2, dark],
        [2, 8, 8, dark],
        [1, 9, 3, deep], [4, 9, 4, dark], [8, 9, 3, deep],
        [0, 10, 12, deep],
        [1, 11, 10, dark],
      ]}
    />
  );
}

/* Tibalt — horned fiend, gold eyes, permanent smirk. */
export function TibaltPixel({ size = 96 }) {
  const skin = "#c94f42", shade = "#93362e", horn = "#4a2020", eye = "#f2c659", grin = "#2b0f0f";
  return (
    <PixelSvg
      size={size}
      label="Tibalt pixel portrait"
      rows={[
        [1, 0, 2, horn], [9, 0, 2, horn],
        [2, 1, 2, horn], [8, 1, 2, horn],
        [3, 2, 6, shade],
        [2, 3, 8, skin],
        [2, 4, 8, skin],
        [2, 5, 1, skin], [3, 5, 2, eye], [5, 5, 2, skin], [7, 5, 2, eye], [9, 5, 1, skin],
        [2, 6, 8, skin],
        [3, 7, 1, skin], [4, 7, 5, grin], [9, 7, 1, skin],
        [3, 8, 2, skin], [5, 8, 3, grin], [8, 8, 1, skin],
        [3, 9, 6, shade],
        [2, 10, 8, shade],
        [3, 11, 6, horn],
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
    id: "proving",
    title: "The Proving Grounds",
    tagline: "The Academy · Sim Center · Pod Balance",
    icon: ProvingIcon,
    defaultView: "proving-home",
  },
  {
    id: "vault",
    title: "The Vault",
    tagline: "Stacks · Ledger · Atlas · Forge",
    icon: VaultIcon,
    defaultView: "vault-home",
  },
];
