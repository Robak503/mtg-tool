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

/* ── Area icons — GREEN SCAN style (Colton, 2026-07-19: "move away from the
   pixel art… make them look like a green scan of what the object is — the
   anvil looks like a real anvil with a green scan-style wash over it").
   Real object contours, drawn as stroke paths, washed in a phosphor gradient
   with SCANLINES clipped to the silhouette. Matrix/Xbox green kept. Inline SVG
   only — the .exe still ships zero image assets. ─────────────────────── */

/* Shared scan treatment: per-icon unique id prefix (several render per page). */
function ScanDefs({ p }) {
  return (
    <defs>
      <linearGradient id={`${p}-stroke`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#a7f3d0" />
        <stop offset="55%" stopColor="#56d65d" />
        <stop offset="100%" stopColor="#1d9e54" />
      </linearGradient>
      <linearGradient id={`${p}-wash`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="rgba(86,214,93,0.26)" />
        <stop offset="100%" stopColor="rgba(86,214,93,0.05)" />
      </linearGradient>
      <pattern id={`${p}-scan`} width="4" height="3" patternUnits="userSpaceOnUse">
        <rect width="4" height="1" fill="rgba(167,243,208,0.45)" />
      </pattern>
    </defs>
  );
}

/** One scanned object: silhouette gets the wash + scanlines, contours get the gradient stroke. */
function ScanSvg({ size, label, p, silhouette, contours }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label={label} style={{ display: "block" }}>
      <ScanDefs p={p} />
      <clipPath id={`${p}-clip`}>{silhouette}</clipPath>
      <g clipPath={`url(#${p}-clip)`}>
        <rect x="0" y="0" width="64" height="64" fill={`url(#${p}-wash)`} />
        <rect x="0" y="0" width="64" height="64" fill={`url(#${p}-scan)`} opacity="0.5" />
      </g>
      <g fill="none" stroke={`url(#${p}-stroke)`} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round">
        {contours}
      </g>
    </svg>
  );
}

/* Omnath's mark — a hearth flame (his zone lives in the bottom bar, not the landing). */
export function OmnathIcon({ size = 64 }) {
  const flame = "M32 6 C38 16 47 22 47 36 C47 48 40 56 32 56 C24 56 17 48 17 36 C17 28 21 24 24 17 C26 23 29 25 31 22 C28 16 30 10 32 6 Z";
  const inner = "M32 30 C36 35 39 38 39 44 C39 50 36 53 32 53 C28 53 25 50 25 44 C25 39 28 35 32 30 Z";
  return (
    <ScanSvg
      size={size}
      label="Omnath icon"
      p="scan-om"
      silhouette={<path d={flame} />}
      contours={<><path d={flame} /><path d={inner} /></>}
    />
  );
}

/* The Crucible — crossed swords, real blades. */
export function ProvingIcon({ size = 64 }) {
  const bladeA = "M10 8 L16 6 L46 36 L42 42 Z";
  const bladeB = "M54 8 L48 6 L18 36 L22 42 Z";
  return (
    <ScanSvg
      size={size}
      label="Crucible icon"
      p="scan-cru"
      silhouette={<><path d={bladeA} /><path d={bladeB} /></>}
      contours={
        <>
          <path d={bladeA} />
          <path d={bladeB} />
          {/* crossguards, grips, pommels */}
          <path d="M38 44 L50 32" strokeWidth="2.5" />
          <path d="M26 44 L14 32" strokeWidth="2.5" />
          <path d="M46 40 L54 48" strokeWidth="3" />
          <path d="M18 40 L10 48" strokeWidth="3" />
          <circle cx="56" cy="50" r="2.4" />
          <circle cx="8" cy="50" r="2.4" />
        </>
      }
    />
  );
}

/* The Vault — a round bank-vault door: rings, spoke wheel, bolts. */
export function VaultIcon({ size = 64 }) {
  return (
    <ScanSvg
      size={size}
      label="Vault icon"
      p="scan-vau"
      silhouette={<circle cx="32" cy="32" r="26" />}
      contours={
        <>
          <circle cx="32" cy="32" r="26" />
          <circle cx="32" cy="32" r="19" />
          <circle cx="32" cy="32" r="6" />
          {/* the spoke wheel */}
          {[0, 60, 120, 180, 240, 300].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            const x1 = 32 + 6 * Math.cos(rad), y1 = 32 + 6 * Math.sin(rad);
            const x2 = 32 + 19 * Math.cos(rad), y2 = 32 + 19 * Math.sin(rad);
            return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="2.2" />;
          })}
          {/* rim bolts */}
          {[30, 90, 150, 210, 270, 330].map((deg) => {
            const rad = (deg * Math.PI) / 180;
            return <circle key={deg} cx={32 + 22.5 * Math.cos(rad)} cy={32 + 22.5 * Math.sin(rad)} r="1.4" />;
          })}
        </>
      }
    />
  );
}

/* The Foundry — a real anvil: horn, face, waist, flared base. */
export function FoundryIcon({ size = 64 }) {
  const body =
    "M6 21 C11 16 19 15 26 15 L52 15 C56 15 58 17 58 20 L58 24 C58 27 55 29 51 29 L42 29 " +
    "L44 35 C44 37 42 38 40 39 L40 44 C40 45 41 46 43 47 L48 49 C51 50 52 52 52 56 L12 56 " +
    "C12 52 13 50 16 49 L21 47 C23 46 24 45 24 44 L24 39 C22 38 20 37 20 35 L22 29 L16 29 " +
    "C11 29 8 25 6 21 Z";
  return (
    <ScanSvg
      size={size}
      label="Foundry icon"
      p="scan-fou"
      silhouette={<path d={body} />}
      contours={
        <>
          <path d={body} />
          {/* the face line + hardy hole */}
          <path d="M14 21 L54 21" strokeWidth="1.2" opacity="0.8" />
          <rect x="46" y="17" width="3.5" height="3.5" strokeWidth="1.2" />
        </>
      }
    />
  );
}

/* The Academy — an open book, real perspective. */
export function LibraryIcon({ size = 64 }) {
  const leftPage = "M32 18 C26 13 15 12 7 15 L7 46 C15 43 26 44 32 49 Z";
  const rightPage = "M32 18 C38 13 49 12 57 15 L57 46 C49 43 38 44 32 49 Z";
  return (
    <ScanSvg
      size={size}
      label="Academy icon"
      p="scan-aca"
      silhouette={<><path d={leftPage} /><path d={rightPage} /></>}
      contours={
        <>
          <path d={leftPage} />
          <path d={rightPage} />
          <path d="M32 18 L32 49" strokeWidth="1.2" />
          {/* board edges under the pages */}
          <path d="M7 46 L5 49 C14 46 26 47 32 52 C38 47 50 46 59 49 L57 46" strokeWidth="1.2" />
          {/* text lines */}
          <path d="M12 22 C18 20 24 20 28 22 M12 28 C18 26 24 26 28 28 M12 34 C18 32 24 32 28 34" strokeWidth="1" opacity="0.7" />
          <path d="M52 22 C46 20 40 20 36 22 M52 28 C46 26 40 26 36 28 M52 34 C46 32 40 32 36 34" strokeWidth="1" opacity="0.7" />
        </>
      }
    />
  );
}

/* ── THE REGISTRY ───────────────────────────────────────────────────── */

export const AREAS = [
  {
    // OMNATH'S ZONE (Colton, 2026-07-19: "cut the agents page… just a chat zone
    // with my homie omnath — the hearth/roil version"). Id stays "agents"
    // internally (routing/saved-state keys on it); the USER sees "Omnath".
    // No landing square — his door is the bottom bar; the room IS the chat.
    id: "agents",
    title: "Omnath",
    tagline: "Hearth & Roil — your companion at the table",
    icon: OmnathIcon,
    defaultView: "chat",
  },
  {
    // id stays "proving" internally (all routing/saved-state keys on it); the USER sees "The Crucible".
    id: "proving",
    title: "The Crucible",
    tagline: "Sim Center · Records · Reflecting Pool",
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
    // Karn's zone (Colton, 2026-07-19): building + theorycrafting decks — the bench
    // done right. Decks live here as CRAFTED objects; the Vault keeps the finance view.
    id: "foundry",
    title: "The Foundry",
    tagline: "Build decks · theorycraft · Karn's bench",
    icon: FoundryIcon,
    defaultView: "foundry-home",
  },
  {
    id: "vault",
    title: "The Vault",
    tagline: "Stacks · Ledger · Census · Atlas · Forge",
    icon: VaultIcon,
    defaultView: "vault-home",
  },
];
