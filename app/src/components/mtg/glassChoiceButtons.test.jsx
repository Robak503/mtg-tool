/**
 * glassChoiceButtons.test.jsx — the pick-one panels whose choices are glass buttons (the Aura's host, change the target, the
 * graveyard pick) must be READABLE and answer the cursor. Found live 2026-10-16 (the aura-entry-host panel in npm run dev): a
 * <button> does not inherit the page's text colour (globals.css passes only `font` on to buttons, and `.ley-glass` sets no
 * colour), so every label rendered in the browser default — black on the black glass — and plain `.ley-glass` has no hover.
 * Each button now carries the theme's text colour and `.ley-card` (LEYLINE's hover lift and glow edge).
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuraEntryHostPanel, ChangeTargetPanel, MilledPickPanel } from "./learnDecisionPanels.jsx";

const buttons = (Panel, decision) => {
  const html = renderToStaticMarkup(createElement(Panel, { decision, onChoose: () => {} }));
  return [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
};

describe("every glass choice button reads in the theme's text colour and lights up under the cursor", () => {
  const cases = {
    "aura-entry-host": [AuraEntryHostPanel, { kind: "aura-entry-host", controller: "user", cardName: "Pacifism", candidates: [{ id: "bear", name: "Grizzly Bears", controller: "ai" }, { id: "wurm", name: "Craw Wurm", controller: "ai" }] }],
    "change-target": [ChangeTargetPanel, { kind: "change-target", controller: "user", spellName: "Lightning Bolt", candidates: [{ type: "player", id: "user", name: "user" }, { type: "creature", id: "bear", name: "Grizzly Bears", controller: "ai" }] }],
    "milled-pick": [MilledPickPanel, { kind: "milled-pick", controller: "user", toZone: "hand", candidates: [{ id: "a", name: "Forest", type: "Basic Land — Forest" }, { id: "b", name: "Grizzly Bears", type: "Creature — Bear" }] }],
  };
  for (const [kind, [Panel, decision]] of Object.entries(cases)) {
    it(kind, () => {
      const tags = buttons(Panel, decision);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag).toContain('class="ley-glass ley-card"');
        expect(tag).toContain("color:var(--ley-text)");
      }
    });
  }
});
