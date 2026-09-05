/**
 * WINDS OF RATH — the "aren't enchanted" wipe. SHELF-85 · Light-Paws L5, 2026-09-05.
 * "Destroy all creatures that aren't enchanted. They can't be regenerated."
 *
 * The every-creature wipe with a restriction already ships (the nontoken wipe), and the regeneration rider is stripped
 * and stamped on the destroy atom. What was missing is the predicate: ENCHANTED (CR 303.4 — a permanent with an Aura
 * attached, whoever controls the Aura). One restriction kind reading the attached permanents, negated here, and one
 * mass-destroy arm carrying it.
 *
 * Mutation-checked: see the run ledger (docs-sk94).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WINDS = { id: "c-wor", name: "Winds of Rath", type: "Sorcery", mana: "{3}{W}{W}", keywords: [], oracle: "Destroy all creatures that aren't enchanted. They can't be regenerated." };
const bear = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
const aura = (id, controller, hostId) => ({ ...createPermanent({ id, card: { id: `c-${id}`, name: "Plain Aura", type: "Enchantment — Aura", mana: "{W}", keywords: [], oracle: "Enchant creature" }, controller }), attachedTo: hostId });

describe("the parser and the classifier", () => {
  it("the wipe reads to every creature with the negated enchanted restriction and the regeneration stamp; Winds of Rath flips native", () => {
    const p = parseEffectProgram(WINDS);
    const bare = parseEffectClause("Destroy all creatures that aren't enchanted.", "Sorcery")?.atoms?.[0];
    const row = { atom: p?.atoms?.[0], bare, tier: classifyCard(WINDS) };
    console.log("  WITNESS windsOfRath", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.atom).toMatchObject({ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "enchanted", negate: true }], cannotRegenerate: true });
    expect(row.bare).toMatchObject({ op: "destroy", targetType: "eachCreature", restrictions: [{ kind: "enchanted", negate: true }] });
    expect(row.bare.cannotRegenerate).toBeUndefined();
    expect(row.tier).toBe("native-spell");
  });
});

describe("RUNTIME — enchanted creatures survive, whoever controls the Aura", () => {
  it("your enchanted creature and the opponent's creature enchanted by YOUR Aura both live; the bare creatures on both sides die", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const plains = (i) => createPermanent({ id: `pl${i}`, card: { id: `c-pl${i}`, name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller: "user" });
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players,
        // the state audit wants both ends of an attachment: the Aura's attachedTo AND the host's attachments list
        // an EQUIPPED but un-enchanted creature is not "enchanted" (CR 303.4) — it dies with the bare ones
        user: { ...s0.players.user, hand: [WINDS], battlefield: [plains(1), plains(2), plains(3), plains(4), plains(5), { ...bear("mine", "user"), attachments: ["auraMine"] }, bear("mineBare", "user"), { ...bear("geared", "user"), attachments: ["sword"] },
          aura("auraMine", "user", "mine"), aura("auraTheirs", "user", "theirs"),
          { ...createPermanent({ id: "sword", card: { id: "c-sword", name: "Plain Sword", type: "Artifact — Equipment", mana: "{1}", keywords: [], oracle: "Equip {1}" }, controller: "user" }), attachedTo: "geared" }] },
        ai: { ...s0.players.ai, battlefield: [{ ...bear("theirs", "ai"), attachments: ["auraTheirs"] }, bear("theirsBare", "ai")] } } };
    const cast = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "c-wor");
    expect(cast).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, cast));
    const row = { user: resolved.players.user.battlefield.filter((p) => /Creature/.test(p.card.type)).map((p) => p.id), ai: resolved.players.ai.battlefield.map((p) => p.id) };
    console.log("  WITNESS windsRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ user: ["mine"], ai: ["theirs"] });
  });
});
