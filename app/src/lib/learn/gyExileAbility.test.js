/**
 * gyExileAbility.test.js — BLITZ GY-2: the exile-cost graveyard ability (CR 602.2).
 * "<mana>, Exile this card from your graveyard: <effect>." — the exile is a COST (paid before the
 * ability stacks, CR 602.2b; graveyard-leave watchers fire), making the ability structurally
 * once-per-copy. V1 = non-targeted/non-modal/non-X HIGH effects; the sorcery rider is recognized
 * and enforced at the offer gate. One shared recognizer (parseGraveyardExileAbility) feeds the
 * enumerator, the dispatcher, and the coverage classifier.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseGraveyardExileAbility } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HALO_SCARAB = { id: "hsc", name: "Halo Scarab", type: "Artifact Creature — Insect", mana: "{2}",
  power: "2", toughness: "1", oracle: "{2}, Exile this card from your graveyard: Create a Treasure token." };
const GHOULCALLER = { id: "gca", name: "Ghoulcaller's Accomplice", type: "Creature — Human Rogue", mana: "{1}{B}",
  power: "2", toughness: "1", oracle: "{3}{B}, Exile this card from your graveyard: Create a 2/2 black Zombie creature token. Activate only as a sorcery." };
const RUBBLEBELT = { id: "rbm", name: "Rubblebelt Maverick", type: "Creature — Human Shaman", mana: "{G}",
  power: "2", toughness: "1", oracle: "{1}{G}, Exile this card from your graveyard: Put a +1/+1 counter on target creature. Activate only as a sorcery." };

describe("recognizer + classify", () => {
  it("parses the plain and sorcery-rider forms; a TARGETED effect is admitted and flagged since GY-3 (④-T, 2026-09-03)", () => {
    expect(parseGraveyardExileAbility(HALO_SCARAB)).toMatchObject({ manaPips: "{2}", sorceryOnly: false, targeted: false });
    expect(parseGraveyardExileAbility(GHOULCALLER)).toMatchObject({ manaPips: "{3}{B}", sorceryOnly: true, targeted: false });
    expect(parseGraveyardExileAbility(RUBBLEBELT)).toMatchObject({ manaPips: "{1}{G}", targeted: true }); // GY-3: the lane expands its targets (gyExileTargeted.test.js)
  });
  it("carriers flip native-activated; the targeted one composes since GY-3", () => {
    expect(classifyCard(HALO_SCARAB)).toBe("native-activated");
    expect(classifyCard(GHOULCALLER)).toBe("native-activated");
    expect(classifyCard(RUBBLEBELT)).toMatch(/^native/);
  });
});

describe("runtime — the exile cost, the sorcery gate, the resolved effect", () => {
  const land = (id, name, sym) => createPermanent({ id, card: { name, type: `Basic Land — ${name}`, oracle: `{T}: Add {${sym}}.` }, controller: "user", summoningSick: false });

  function board(gyCards, { phase = "precombat-main", step = "main", stack = [] } = {}) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return {
      ...s,
      phase, step, activePlayer: "user", priorityHolder: "user", turn: 4, stack,
      players: { ...s.players, user: { ...s.players.user, graveyard: gyCards, battlefield: [land("s1", "Swamp", "B"), land("s2", "Swamp", "B"), land("s3", "Swamp", "B"), land("s4", "Swamp", "B")] } },
    };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-exile");

  it("Halo Scarab: activate → the card is EXILED at cost time, the Treasure arrives on resolution", () => {
    let s = board([HALO_SCARAB]);
    const o = offers(s);
    expect(o).toHaveLength(1);
    s = dispatchAction(s, o[0]);
    expect(s.players.user.graveyard.some((c) => c.id === "hsc")).toBe(false); // cost paid — already gone
    expect(s.players.user.exile.some((c) => c.id === "hsc")).toBe(true);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some((p) => /treasure/i.test(p.card?.type || "") || /treasure/i.test(p.card?.name || ""))).toBe(true);
  });

  it("the sorcery rider gates the offer to the sorcery window (not offered off-turn-phase)", () => {
    const mainOffers = offers(board([GHOULCALLER]));
    expect(mainOffers).toHaveLength(1);
    // Same board, but during combat (not a sorcery window) — the plain Scarab would still be offered;
    // the sorcery-gated Ghoulcaller is not.
    const combatState = board([GHOULCALLER, HALO_SCARAB], { phase: "combat", step: "declare-attackers" });
    const names = offers(combatState).map((a) => a.name);
    expect(names).toContain("Halo Scarab");
    expect(names).not.toContain("Ghoulcaller's Accomplice");
  });
});
