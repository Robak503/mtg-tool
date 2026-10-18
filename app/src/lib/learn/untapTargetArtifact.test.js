/**
 * untapTargetArtifact.test.js — FIX (false positive, 2026-10-18): "Untap target artifact." untaps a NONCREATURE artifact.
 *
 * The parse reads "untap [another] target artifact" as the untap atom with targetType "artifact" and the enumerator offers any
 * artifact, but the tap/untap resolver's type gate (effects/atoms/combat.js applyTapEffect) only knew creatures, lands and
 * permanents: an artifact target fell to the creature-only fallback, so Voltaic Key on a tapped Sol Ring logged "untap" and the
 * Sol Ring stayed tapped. Credited native at the base: Voltaic Key (EDHREC #1737), Manifold Key (#1026), Sonic Screwdriver
 * (#1934), Filigree Sages, Galvanic Key, Voltaic Servant. Found building Clock of Omens' "Untap target artifact." (the
 * filtered tap cost, filteredTapCost.test.js).
 *
 * Bundled ruling witnessed (rulings.json): Voltaic Servant (2018-04-27) "Voltaic Servant's ability can target an artifact
 * creature, including itself." — an artifact creature target did not untap at the base either: the enumerator hands every artifact
 * target over as a permanent, never as a creature.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-18).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const VOLTAIC_KEY = { id: "c-vk", name: "Voltaic Key", type: "Artifact", mana: "{1}", keywords: [], oracle: "{1}, {T}: Untap target artifact." };
const MANIFOLD_KEY = { id: "c-mk", name: "Manifold Key", type: "Artifact", mana: "{1}", keywords: [],
  oracle: "{1}, {T}: Untap another target artifact.\n{3}, {T}: Target creature can't be blocked this turn." };
const SOL_RING = { id: "c-sr", name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], oracle: "{T}: Add {C}{C}." };
const MIND_STONE = { id: "c-ms", name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const ORNITHOPTER = { id: "c-orn", name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", power: 0, toughness: 2, keywords: ["Flying"], oracle: "Flying" };
const FOREST = (id) => ({ id: "c-" + id, name: "Forest", type: "Basic Land — Forest", keywords: [], oracle: "({T}: Add {G}.)" });

const put = (card, id, over = {}) => ({ ...createPermanent({ id, card, controller: "user" }), summoningSick: false, ...over });
const lib = (n, tag = "u") => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));
function mainPhase(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, library: lib(4), battlefield: perms }, ai: { ...s.players.ai, library: lib(4, "a") } } };
}
const untapWith = (s, keyId, targetId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === keyId && a.targets?.[0]?.id === targetId && /untap/i.test(String(a.abilityText || "")));
  expect(act).toBeTruthy();
  let n = dispatchAction(s, act);
  while (n.stack.length) n = resolveTopOfStack(n);
  return n;
};
const tapped = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.tapped;

describe("a noncreature artifact target untaps", () => {
  it("Voltaic Key untaps a tapped Sol Ring", () => {
    const s = untapWith(mainPhase([put(VOLTAIC_KEY, "VK"), put(SOL_RING, "SR", { tapped: true }), put(FOREST("F1"), "F1")]), "VK", "SR");
    expect(tapped(s, "SR")).toBe(false);
    expect(tapped(s, "VK")).toBe(true);
  });
  it("Manifold Key untaps another target artifact — a tapped Mind Stone", () => {
    const s = untapWith(mainPhase([put(MANIFOLD_KEY, "MK"), put(MIND_STONE, "MS", { tapped: true }), put(FOREST("F1"), "F1")]), "MK", "MS");
    expect(tapped(s, "MS")).toBe(false);
  });
  it("an artifact creature target untaps too (the enumerator hands any artifact target over as a permanent — Voltaic Servant's ruling: it can target an artifact creature)", () => {
    const s = untapWith(mainPhase([put(VOLTAIC_KEY, "VK"), put(ORNITHOPTER, "ORN", { tapped: true }), put(FOREST("F1"), "F1")]), "VK", "ORN");
    expect(tapped(s, "ORN")).toBe(false);
  });
  it("control: the Key's cost is paid and the untap is logged on both trees (the log said untap while nothing untapped)", () => {
    const s = untapWith(mainPhase([put(VOLTAIC_KEY, "VK"), put(SOL_RING, "SR", { tapped: true }), put(FOREST("F1"), "F1")]), "VK", "SR");
    expect(tapped(s, "VK")).toBe(true);
    expect(tapped(s, "F1")).toBe(true);
    expect(s.log.some((e) => e.kind === "spell-effect" && e.effect === "untap" && (e.targets || []).includes("SR"))).toBe(true);
  });
});
