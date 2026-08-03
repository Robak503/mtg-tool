/**
 * TibaltGremlinBubble render gates — the [O2] UI register, test-enforced where the
 * ledger binds it:
 *   - ZERO looping animations (the pulse ban — a gremlin that throbs fails, rightly);
 *   - the ONE-SHOT .ley-rise entrance;
 *   - Tibalt's own registry red, never a minted color;
 *   - his real card art with the monogram fallback;
 *   - a dismiss affordance (the dismissal is data);
 *   - and no bubble object → NO markup at all (an empty bubble is not a bubble).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import TibaltGremlinBubble from "./TibaltGremlinBubble.jsx";

const noop = () => {};
const BUBBLE = { id: "fire-1", jab: "Thirty-eight lands and six things worth casting. Bold.", findingKey: "draw-count-low" };

describe("TibaltGremlinBubble — the UI laws", () => {
  it("renders the jab, the nameplate, the art, and the dismiss control", () => {
    const raw = renderToStaticMarkup(createElement(TibaltGremlinBubble, { bubble: BUBBLE, onDismiss: noop }));
    expect(raw).toContain("Thirty-eight lands");
    expect(raw).toContain("TIBALT");
    expect(raw).toContain("Fiend-Blooded");            // his real card art via /api/art-crop
    expect(raw).toMatch(/ley-avatar-fallback/);        // monogram fallback present
    expect(raw).toMatch(/aria-label="Dismiss"/);
  });

  it("enters with ONE-SHOT ley-rise and carries no looping animation (the pulse ban)", () => {
    const raw = renderToStaticMarkup(createElement(TibaltGremlinBubble, { bubble: BUBBLE, onDismiss: noop }));
    expect(raw).toMatch(/ley-rise/);
    expect(raw).not.toMatch(/\binfinite\b/);
  });

  it("wears Tibalt's registry red (#ffb4ab family), not a minted color", () => {
    const raw = renderToStaticMarkup(createElement(TibaltGremlinBubble, { bubble: BUBBLE, onDismiss: noop }));
    expect(raw).toContain("255,180,171");              // the dim/border/glow rgba family
    expect(raw).toContain("#ffb4ab");                  // the nameplate color token
  });

  it("no bubble (or an empty jab) renders NOTHING — an empty bubble is not a bubble", () => {
    expect(renderToStaticMarkup(createElement(TibaltGremlinBubble, { bubble: null, onDismiss: noop }))).toBe("");
    expect(renderToStaticMarkup(createElement(TibaltGremlinBubble, { bubble: { id: "x", jab: "" }, onDismiss: noop }))).toBe("");
  });
});
