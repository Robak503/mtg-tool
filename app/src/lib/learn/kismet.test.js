/**
 * kismet.test.js — BLITZ KM-1 (CR 614.1c): "Artifacts, creatures, and lands your opponents control
 * enter [the battlefield] tapped." (Kismet / Frozen Aether / Loxodon Gatekeeper). One reader
 * (impositionEntersTapped) consulted at EVERY entry path — cast/enter (resolvers.enterPermanent),
 * the land drop (actionDispatcher), and non-cast entries (zones.enterCardFromZone: reanimate / ramp /
 * detain-return) — so the imposition can't be dodged through a side door. The controller's own
 * permanents are never taxed ("your opponents"). Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { impositionEntersTapped, opponentsEnterTappedOf } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KISMET = { id: "ksc", name: "Kismet", type: "Enchantment", mana: "{3}{W}",
  oracle: "Artifacts, creatures, and lands your opponents control enter tapped." };

function board() {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const kismet = createPermanent({ id: "ks", card: KISMET, controller: "ai1", summoningSick: false });
  return { ...s, players: { ...s.players, ai1: { ...s.players.ai1, battlefield: [kismet] } } };
}

describe("reader + classify", () => {
  it("the exact line reads; the three carriers flip native-static; an instant never matches", () => {
    expect(opponentsEnterTappedOf(KISMET)).toBe(true);
    // PIN MOVED 2026-07-27 (census slice 45), not weakened. This line used to assert that the CREATURE-ONLY
    // printing was unrecognized — true when the reader was hard-coded to Kismet's three-type form, but it was
    // pinning a GAP, not a rule: Imposing Sovereign prints the same imposition over a smaller type list. That
    // form is now read and enforced, so the pin moves to the boundary that still matters — a QUALIFIED
    // subject, where matching would silently drop the qualifier and over-apply the imposition.
    expect(opponentsEnterTappedOf({ oracle: "Creatures your opponents control enter tapped." })).toBe(true);
    expect(opponentsEnterTappedOf({ oracle: "Creatures and nonbasic lands your opponents control enter tapped." })).toBe(false);
    expect(classifyCard(KISMET)).toBe("native-static");
  });
});

describe("runtime — every entry path consults the one reader", () => {
  it("an opponent's creature enters tapped; the Kismet owner's own does not; a non-listed type is spared", () => {
    const s = board();
    const after = enterPermanent(s, { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, "user", {});
    expect(after.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears").tapped).toBe(true);
    const own = enterPermanent(s, { id: "ob", name: "Own Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, "ai1", {});
    expect(own.players.ai1.battlefield.find((p) => p.card.name === "Own Bear").tapped).toBe(false);
    expect(impositionEntersTapped(s, { type: "Enchantment" }, "user")).toBe(false); // an enchantment isn't in the triple
  });
  it("a NON-CAST entry (reanimate via enterCardFromZone) is taxed too", () => {
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ id: "dd", name: "Dead Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }] } } };
    const { state: after, entered } = enterCardFromZone(s, { playerId: "user", cardId: "dd", fromZone: "graveyard" });
    expect(entered).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.card.id === "dd").tapped).toBe(true);
  });
});
