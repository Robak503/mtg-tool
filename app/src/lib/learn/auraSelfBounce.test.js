/**
 * auraSelfBounce.test.js — "{R}: Return this Aura to its owner's hand." (Crown of Flames, Ghitu
 * Firebreathing, Hypervolt Grasp). Census bug signature: 5 native carriers of the shape against 3
 * blocked, so the ability is plainly built and its blockers are a defect report.
 *
 * WHY THEY PARKED. isNativeOwnActivatedAura admits an aura-own activated ability only when its whole
 * program is tap / untap / pump / regenerate aimed at `target: "enchanted"` — the HOST. The self-bounce
 * is the one ability here whose referent is the AURA ITSELF, so it failed a gate that was otherwise
 * happy with the card. Both abilities on Crown of Flames already parse `modeled: true`; nothing was
 * missing but the admission.
 *
 * ⛔ ADMITTED BY OP **AND** TARGET TOGETHER, never by op alone: `bounce` aimed at anything else (a chosen
 * target, the host) is a different card and still fails this gate. Pinned below.
 *
 * ⭐ RUNTIME-VERIFIED BEFORE ADMISSION, and the detach is the part no parse check can see: activating the
 * bounce really returns the Aura to hand AND clears the host's `attachments` list, leaving no orphaned
 * link. The pump half still takes the host 2/2 -> 3/2 on the same board.
 *
 * Mutation-checked (2026-08-04, verified applied): the `a.target === "self"` clause loosened to any
 * bounce -> the chosen-target-bounce park goes red; the whole self-bounce arm removed -> all three flip
 * pins go red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CROWN_OF_FLAMES = { id: "c-cf", name: "Crown of Flames", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\n{R}: Return this Aura to its owner's hand." };
const GHITU_FIREBREATHING = { id: "c-gf", name: "Ghitu Firebreathing", type: "Enchantment — Aura", mana: "{R}",
  oracle: "Flash\nEnchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\n{R}: Return this Aura to its owner's hand." };
const HYPERVOLT_GRASP = { id: "c-hg", name: "Hypervolt Grasp", type: "Enchantment — Aura", mana: "{2}{U}",
  oracle: "Enchant creature\nEnchanted creature has \"{T}: This creature deals 1 damage to any target.\"\n{1}{U}: Return this Aura to its owner's hand." };

describe("recognition", () => {
  it("all three carriers flip to native-activated", () => {
    expect(classifyCard(CROWN_OF_FLAMES)).toBe("native-activated");
    expect(classifyCard(GHITU_FIREBREATHING)).toBe("native-activated");   // also rides the covered-keyword line fix
    expect(classifyCard(HYPERVOLT_GRASP)).toBe("native-activated");       // and the granted-ability lane
  });

  it("both of Crown of Flames' abilities were ALREADY modeled — only the admission was missing", () => {
    const abs = parseActivatedAbilities(CROWN_OF_FLAMES);
    expect(abs).toHaveLength(2);
    expect(abs.every((a) => a.modeled)).toBe(true);
    expect(abs.map((a) => a.program.atoms[0].op)).toEqual(["pump", "bounce"]);
    expect(abs[1].program.atoms[0].target).toBe("self");
  });

  it("⛔ a bounce aimed at a CHOSEN TARGET is not admitted (op + target together, never op alone)", () => {
    expect(classifyCard({ ...CROWN_OF_FLAMES, id: "c-x", name: "Odd Crown",
      oracle: "Enchant creature\n{R}: Enchanted creature gets +1/+0 until end of turn.\n{R}: Return target creature to its owner's hand." })).toBe("body-only");
  });

  it("⛔ an unmodeled co-ability still parks the whole card", () => {
    expect(classifyCard({ ...CROWN_OF_FLAMES, id: "c-y", name: "Riddle Crown",
      oracle: "Enchant creature\n{R}: Interpret the omens however you like.\n{R}: Return this Aura to its owner's hand." })).toBe("body-only");
  });
});

describe("⭐ RUNTIME (law 6) — the bounce returns the Aura AND detaches it", () => {
  function board() {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const crown = createPermanent({ id: "cr", card: CROWN_OF_FLAMES, controller: "user", summoningSick: false });
    crown.attachedTo = "bear";
    bear.attachments = ["cr"];
    return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [bear, crown], manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } } } };
  }
  const abilities = (s) => filterActions(legalActionsForPlayer(s, "user"), "activate-ability").filter((a) => a.permanentId === "cr");

  it("both abilities are offered on the Aura", () => {
    expect(abilities(board())).toHaveLength(2);
  });

  it("⭐ the bounce puts the Aura in hand, off the battlefield, and clears the host's attachment", () => {
    const s0 = board();
    const results = abilities(s0).map((a) => resolveTopOfStack(dispatchAction(s0, a)));
    const bounced = results.find((s) => s.players.user.hand.some((c) => c.name === "Crown of Flames"));
    expect(bounced, "no ability returned the Aura to hand").toBeTruthy();
    expect(bounced.players.user.battlefield.some((p) => p.id === "cr")).toBe(false);
    expect(bounced.players.user.battlefield.find((p) => p.id === "bear").attachments).toEqual([]);
  });

  it("the pump half still works on the same board (2/2 -> 3/2)", () => {
    const s0 = board();
    expect(permanentPower(s0, "bear")).toBe(2);
    const pumped = abilities(s0).map((a) => resolveTopOfStack(dispatchAction(s0, a)))
      .find((s) => s.players.user.battlefield.some((p) => p.id === "cr"));
    expect(permanentPower(pumped, "bear")).toBe(3);
  });
});
