/**
 * cloneCostKeyword.test.js — a clone carrying a COST-ONLY keyword line must still clone at RUNTIME.
 *
 * ⚠️ THE BUG. `parseCloneSpec` requires the WHOLE oracle to be the copy clause, so a cost-only keyword line
 * — "Plot {2}{U}" (Visage Bandit), Convoke, Affinity — made it return null. coverage.js knew that and
 * stripped those lines BEFORE calling isCloneCard, so the card classified `native-clone`… but the RUNTIME
 * (resolvers.js PERMANENT_ETB) called isCloneCard on the RAW card.
 *
 * Result: Visage Bandit was credited native-clone and, on a board with a legal copy target, raised NO clone
 * choice at all — it entered as itself. A RUNTIME-VACUOUS NATIVE, and invisible to the tier, which is the
 * recurring shape of this whole run.
 *
 * ⭐ THE FIX IS THE SHARED STRIP, not a patch at the call site. Doing it inside parseCloneSpec means every
 * consumer — classifier, resolver, legalChoices' X-cost check — sees the same text, so metric and runtime
 * cannot drift apart again. A per-caller fix would have left the next caller free to repeat it.
 *
 * Clone and Mirror Image are LIVE CONTROLS in every runtime assertion below: without them, a harness that
 * silently reached no clone path at all would read exactly like the bug (it did, on the first attempt —
 * enterPermanent is not the route; the PERMANENT_ETB resolver is).
 */
import { beforeEach, describe, expect, it } from "vitest";

import "./coverage.js";
import { classifyCard } from "./coverage.js";
import { parseCloneSpec, isCloneCard } from "./cloneCopy.js";
import { RESOLVERS, RESOLVER_KEYS } from "./resolvers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text, verbatim.
const VISAGE_BANDIT = {
  id: "x", name: "Visage Bandit", type: "Creature — Shapeshifter Rogue", mana: "{2}{U}", power: 2, toughness: 2,
  oracle: "You may have this creature enter as a copy of a creature you control, except it's a Shapeshifter Rogue in addition to its other types.\nPlot {2}{U} (You may pay {2}{U} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
};
const CLONE = { id: "x", name: "Clone", type: "Creature — Shapeshifter", mana: "{2}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any creature on the battlefield." };
const MIRROR_IMAGE = { id: "x", name: "Mirror Image", type: "Creature — Shapeshifter", mana: "{2}{U}", power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of a creature you control." };
const BEAR = { id: "b", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function boardWithBear() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "b", card: BEAR, controller: "user" })] } } };
}
// Drive the REAL resolver — enterPermanent is not the clone route, and using it made every card (controls
// included) look like the bug.
const resolveEtb = (card) => RESOLVERS[RESOLVER_KEYS.PERMANENT_ETB](
  boardWithBear(),
  { payload: { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card, controller: "user" } } },
);

describe("the shared strip", () => {
  it("⭐ a cost-only keyword line no longer hides the copy clause", () => {
    expect(isCloneCard(VISAGE_BANDIT)).toBe(true);
    expect(parseCloneSpec(VISAGE_BANDIT)).toMatchObject({ optional: true, scope: "youControl" });
  });

  it("the plain clones are unchanged", () => {
    expect(parseCloneSpec(CLONE)).toMatchObject({ scope: "any" });
    expect(parseCloneSpec(MIRROR_IMAGE)).toMatchObject({ scope: "youControl" });
  });

  it("⛔ a non-clone is still not a clone (the strip cannot over-claim)", () => {
    expect(isCloneCard(BEAR)).toBe(false);
    expect(isCloneCard({ name: "Plotter", type: "Creature — Rogue", oracle: "Plot {2}{U}" })).toBe(false);
  });
});

describe("⭐ RUNTIME — the clone choice is actually raised", () => {
  it("CONTROL — Clone and Mirror Image raise the copy choice", () => {
    expect(resolveEtb(CLONE).pendingChoice?.kind).toBe("clone-search");
    expect(resolveEtb(MIRROR_IMAGE).pendingChoice?.kind).toBe("clone-search");
  });

  it("⭐ Visage Bandit raises it too — it used to enter as itself", () => {
    expect(resolveEtb(VISAGE_BANDIT).pendingChoice?.kind).toBe("clone-search");
  });

  it("CONTROL — a vanilla creature raises nothing", () => {
    expect(resolveEtb({ ...BEAR, id: "x" }).pendingChoice).toBeFalsy();
  });

  it("the tier and the runtime now AGREE for all three", () => {
    // The bug was precisely a metric⇄runtime disagreement: tier said native-clone, runtime never cloned.
    for (const c of [CLONE, MIRROR_IMAGE, VISAGE_BANDIT]) {
      expect(classifyCard(c)).toBe("native-clone");
      expect(resolveEtb(c).pendingChoice?.kind).toBe("clone-search");
    }
  });
});
