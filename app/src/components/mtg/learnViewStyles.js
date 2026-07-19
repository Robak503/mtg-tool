/**
 * learnViewStyles.js — LEYLINE layout tokens for the Academy play view.
 *
 * Extracted verbatim from LearnView.jsx (decomposition slice 1, 2026-07-18). Pure functions returning
 * style objects — no React, no state, no imports. Glass surfaces still come from the
 * .ley-glass-strong / .ley-glass-lit classes on the elements; these only carry layout + tokens.
 *
 * Behaviour proven unchanged by LearnViewRenderFingerprint.test.jsx, which snapshots every panel's
 * rendered markup AND each helper's returned object (that gate catches a single trailing space).
 */

// ─── Style helpers (LEYLINE — layout + tokens only; glass panels come from
//     the .ley-glass-strong/.ley-glass-lit classes on the elements) ───────────

export function tutorSheetStyle() {
  return {
    position: "absolute",
    top: 70,
    right: 16,
    bottom: 64,
    width: 440,
    maxWidth: "52%",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    zIndex: 45,
  };
}

export function containerStyle(fontFamily) {
  return {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "var(--ley-bg)",
    fontFamily,
    position: "relative", // anchors the floating Ask-Jace pop-out
  };
}

export function headerStyle() {
  return {
    padding: "10px 16px",
    borderBottom: "1px solid var(--ley-line)",
    background: "var(--ley-surface-1)",
    color: "var(--ley-green)",
    fontFamily: "var(--font-display), Georgia, serif",
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: "-0.01em",
    display: "flex",
    alignItems: "center",
    gap: 12,
  };
}

export function labelStyle() {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--ley-text-faint)",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
  };
}

// Tracked mono section label (the LEYLINE label treatment).
export function sectionLabelStyle() {
  return {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--ley-text-faint)",
    textTransform: "uppercase",
    letterSpacing: "0.18em",
  };
}

export function selectStyle(fontFamily) {
  return {
    padding: "8px 10px",
    background: "var(--ley-surface-2)",
    color: "var(--ley-text)",
    border: "1px solid var(--ley-line)",
    borderRadius: 6,
    fontSize: 13,
    fontFamily,
  };
}

// Floating Arbiter side-sheet — sits over the right of the board, non-blocking
// (the board behind stays visible + interactive). Anchored by containerStyle's
// position:relative.
export function unresolvedSheetStyle() {
  return {
    position: "absolute",
    top: 70,
    right: 16,
    bottom: 64,
    width: 372,
    maxWidth: "44%",
    padding: 16,
    overflowY: "auto",
    zIndex: 40,
  };
}

// Floating engine-error banner over the board (replaces the old drop-to-text).
// Red accents on glass — the element also carries .ley-glass-strong.
export function floatErrorStyle() {
  return {
    position: "absolute",
    top: 70,
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: 560,
    border: "1px solid var(--ley-red)",
    color: "var(--ley-red)",
    borderRadius: 8,
    padding: "10px 16px",
    fontSize: 12.5,
    lineHeight: 1.5,
    zIndex: 41,
  };
}

export function errorBoxStyle() {
  return {
    padding: "10px 12px",
    background: "var(--ley-red-dim)",
    border: "1px solid var(--ley-red)",
    color: "var(--ley-red)",
    borderRadius: 6,
    fontSize: 12,
  };
}
