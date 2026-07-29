/**
 * amuletOfVigor.test.js — Amulet of Vigor #1301: "Whenever a permanent you control enters TAPPED, untap it."
 *
 * ⚠️ THE REASON THIS FILE IS RUNTIME-HEAVY. Amulet needed FOUR pieces and only three of them are visible to
 * the classifier: the `permanentYouControl` subject, the enters-TAPPED filter, and the "untap it" referent.
 * The fourth is a FIRE SITE — `checkPermanentEntersTriggers` was called from token mint, zone-enter and the
 * cast/resolve path, and from nowhere else. A land is PLAYED, not cast, so a land drop reached none of them.
 * Building 1–3 alone would have produced a card that classifies native and never fires on its signature use:
 * a RUNTIME-VACUOUS NATIVE, invisible to the tier metric because the tier is not evidence about a board.
 * Hence every assertion below that matters runs a real dispatchAction, not a parse.
 *
 * SCOPE, stated plainly: the trigger is permanent-WIDE and controller-scoped. The "tapped" qualifier is read
 * off the entering permanent's LIVE state at fire time, which makes the ORDER on the play-land path
 * load-bearing — tapPermanent runs before checkPermanentEntersTriggers, and the pin below fails if that ever
 * inverts.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkPermanentEntersTriggers } from "./triggers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AMULET = { id: "amu", name: "Amulet of Vigor", type: "Artifact", mana: "{1}", oracle: "Whenever a permanent you control enters tapped, untap it." };
// A REAL tapped-land printing — the shape Amulet exists for. Its own ETB text is the tapped rider.
const VAULT = { id: "vault1", name: "Blossoming Sands", type: "Land", oracle: "Blossoming Sands enters tapped.\nWhen Blossoming Sands enters, you gain 2 life." };
const FOREST = { id: "forest1", name: "Forest", type: "Basic Land — Forest", oracle: "" };

function board(hand) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user",
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: [createPermanent({ id: "amu", card: AMULET, controller: "user" })] } },
  };
}
const playLand = (s, cardId, name) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId, name });
const settle = (s) => { let g = 0; s = flushTriggers(s); while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; };
const landNamed = (s, name) => s.players.user.battlefield.find((p) => p.card.name === name);

describe("classification", () => {
  it("Amulet of Vigor is native", () => {
    expect(classifyCard(AMULET)).toBe("native-trigger");
  });

  it("the subject reads permanent-wide, and the TAPPED qualifier is captured (not silently dropped)", () => {
    const [t] = detectTriggers(AMULET);
    expect(t).toMatchObject({ event: "permanentEnters", scope: "permanentYouControl", enteredTapped: true });
  });

  it("the untapped-subject sibling exists and carries NO tapped filter", () => {
    const [t] = detectTriggers({ ...AMULET, oracle: "Whenever a permanent you control enters, draw a card." });
    expect(t).toMatchObject({ event: "permanentEnters", scope: "permanentYouControl" });
    expect(t.enteredTapped).toBeFalsy();
  });

  it("⛔ CREED — a BARE 'a permanent enters' (no 'you control') stays refused: the engine can't scope it", () => {
    expect(detectTriggers({ ...AMULET, oracle: "Whenever a permanent enters tapped, untap it." })).toHaveLength(0);
  });

  it("⛔ CREED — a RIDER on the effect clause stays unrewritten → the card leaves native", () => {
    // "untap it AND draw a card" is not the modelled clause; the anaphor rewrite is whole-clause anchored, so
    // the bare "it" never resolves and the program drops to LOW rather than untapping and eating the draw.
    expect(classifyCard({ ...AMULET, oracle: "Whenever a permanent you control enters tapped, untap it and draw a card." })).not.toBe("native-trigger");
  });
});

describe("⭐ RUNTIME — the fire site (the piece no static instrument could see)", () => {
  it("a TAPPED land drop fires the trigger and the land ends UNTAPPED", () => {
    let s = playLand(board([VAULT]), "vault1", "Blossoming Sands");
    // The land entered tapped (its own printed rider) and the permanentEnters watcher saw it.
    expect(landNamed(s, "Blossoming Sands").tapped).toBe(true);
    expect((s.pendingTriggers || []).filter((t) => t.event === "permanentEnters")).toHaveLength(1);
    s = settle(s);
    expect(landNamed(s, "Blossoming Sands").tapped).toBe(false);
  });

  it("⭐ an UNTAPPED land drop does NOT fire — the enters-tapped filter is real, not decoration", () => {
    const s = playLand(board([FOREST]), "forest1", "Forest");
    expect(landNamed(s, "Forest").tapped).toBe(false);
    expect((s.pendingTriggers || []).filter((t) => t.event === "permanentEnters")).toHaveLength(0);
  });

  it("⭐ CREED — an OPPONENT's tapped permanent never fires it (controller scope)", () => {
    const s = board([]);
    const theirs = createPermanent({ id: "opp-land", card: { ...VAULT, id: "opp-land" }, controller: "ai" });
    const withTheirs = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [{ ...theirs, tapped: true }] } } };
    const after = checkPermanentEntersTriggers(withTheirs, { ...theirs, tapped: true });
    expect((after.pendingTriggers || []).filter((t) => t.event === "permanentEnters")).toHaveLength(0);
  });

  it("⭐ MUTATION PIN — the untap must reach the ENTERING permanent, not merely 'some land'", () => {
    // A second, already-tapped land is on the battlefield when the drop happens. A resolver that untapped the
    // controller's tapped lands generally (or the first one it found) would clear this bystander too.
    let s = board([VAULT]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      ...s.players.user.battlefield,
      { ...createPermanent({ id: "bystander", card: { ...FOREST, id: "bystander" }, controller: "user" }), tapped: true },
    ] } } };
    s = settle(playLand(s, "vault1", "Blossoming Sands"));
    expect(landNamed(s, "Blossoming Sands").tapped).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "bystander").tapped).toBe(true);
  });

  it("⭐ two Amulets untap once each — the trigger is per-watcher, and a second untap is a harmless no-op", () => {
    let s = board([VAULT]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      ...s.players.user.battlefield,
      createPermanent({ id: "amu2", card: { ...AMULET, id: "amu2" }, controller: "user" }),
    ] } } };
    s = playLand(s, "vault1", "Blossoming Sands");
    expect((s.pendingTriggers || []).filter((t) => t.event === "permanentEnters")).toHaveLength(2);
    s = settle(s);
    expect(landNamed(s, "Blossoming Sands").tapped).toBe(false);
  });

  it("the land's OWN ETB still fires alongside — the new fire site is ADDITIVE, it displaced nothing", () => {
    const before = board([VAULT]);
    const s = settle(playLand(before, "vault1", "Blossoming Sands"));
    expect(s.players.user.life).toBe(before.players.user.life + 2); // Blossoming Sands' gain-2
    expect(landNamed(s, "Blossoming Sands").tapped).toBe(false);
  });
});
