/**
 * GREATER AURAMANCY — the enchanted-creatures shield selector. SHELF-85 · Light-Paws L4, 2026-09-05.
 * "Enchanted creatures you control have shroud."
 *
 * The team shield static knew four permanent-type subjects; this is the creature subject with the ENCHANTED qualifier —
 * the same Aura-attached predicate Winds of Rath's restriction reads (whoever controls the Aura, CR 303.4), here as a
 * LAYER SELECTOR gate beside the modified gate, re-evaluated live by the layer engine.
 *
 * Mutation-checked: see the run ledger (docs-sk95).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AURAMANCY = { id: "c-ga", name: "Greater Auramancy", type: "Enchantment", mana: "{1}{W}", keywords: [], oracle: "Enchanted creatures you control have shroud." };
const bear = (id, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false }), ...over });
const aura = (id, controller, hostId) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name: "Plain Aura", type: "Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant creature" }, controller }), attachedTo: hostId });

function board() {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [createPermanent({ id: "ga", card: AURAMANCY, controller: "user" }),
        bear("mine", "user", { attachments: ["auraMine"] }), bear("bare", "user"), bear("geared", "user", { attachments: ["sword"] }),
        aura("auraMine", "user", "mine"), aura("auraTheirs", "user", "theirs"),
        { ...createPermanent({ id: "sword", card: { id: "c-sword", name: "Plain Sword", type: "Artifact — Equipment", mana: "{1}", keywords: [], oracle: "Equip {1}" }, controller: "user" }), attachedTo: "geared" }] },
      ai: { ...s0.players.ai, battlefield: [bear("theirs", "ai", { attachments: ["auraTheirs"] })] } } };
}

describe("the static parser and the classifier", () => {
  it("reads to a shroud grant whose selector carries the enchanted gate; the plain creature form is untouched; Greater Auramancy flips native", () => {
    const d = parseStaticAbilities(AURAMANCY).find((x) => x.op?.layerOp === "addKeyword");
    const row = { op: d?.op, selector: d?.affects?.selector, tier: classifyCard(AURAMANCY) };
    console.log("  WITNESS greaterAuramancy", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.op).toEqual({ layerOp: "addKeyword", keyword: "shroud" });
    expect(row.selector).toEqual({ controllerScope: "you", cardTypes: ["Creature"], enchanted: true });
    expect(row.tier).toBe("native-static");
  });
});

describe("RUNTIME — the layer engine gates on the attached Aura, live", () => {
  it("your enchanted creature has shroud; your bare and equipped creatures do not; the opponent's enchanted creature does not; attaching an Aura turns it on", () => {
    const s = board();
    const row = { mine: permanentHasKeyword(s, "mine", "Shroud"), bare: permanentHasKeyword(s, "bare", "Shroud"), geared: permanentHasKeyword(s, "geared", "Shroud"), theirs: permanentHasKeyword(s, "theirs", "Shroud") };
    console.log("  WITNESS auramancyRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ mine: true, bare: false, geared: false, theirs: false });
    // attach a second Aura to the bare creature: the shroud follows the Aura
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => p.id === "bare" ? { ...p, attachments: ["aura2"] } : p).concat([aura("aura2", "user", "bare")]) } } };
    expect(permanentHasKeyword(later, "bare", "Shroud")).toBe(true);
  });
});
