/**
 * CONDITIONAL ATTACHED BONUS — Face of Divinity + Shardmage's Rescue. SHELF-85 · Light-Paws L4, 2026-09-05.
 * "As long as another Aura is attached to enchanted creature, it has first strike and lifelink." (Face of Divinity)
 * "As long as this Aura entered this turn, enchanted creature has hexproof." (Shardmage's Rescue)
 *
 * The during-your-turn attachment bonus already showed the shape: strip a leading condition, run the rest through the
 * existing attached-clause parser, stamp a GATE the layer engine re-evaluates every derive pass. Two new gate kinds, each
 * needing the SOURCE Aura: another-Aura-on-the-host excludes the gate's own Aura; entered-this-turn reads the Aura's own
 * enteredOnTurn stamp against the live turn. The source id is stamped where the attached bonus is fixed to its host.
 *
 * Mutation-checked: see the run ledger (docs-sk107).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAuraBonus } from "./staticAbilityParser.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FACE = { id: "c-fod", name: "Face of Divinity", type: "Enchantment — Aura", mana: "{2}{W}", keywords: [],
  oracle: "Enchant creature\nEnchanted creature gets +2/+2.\nAs long as another Aura is attached to enchanted creature, it has first strike and lifelink." };
const RESCUE = { id: "c-sr", name: "Shardmage's Rescue", type: "Enchantment — Aura", mana: "{W}", keywords: ["Flash"],
  oracle: "Flash\nEnchant creature you control\nAs long as this Aura entered this turn, enchanted creature has hexproof.\nEnchanted creature gets +1/+1." };
const PLAIN = { id: "c-pa", name: "Plain Aura", type: "Enchantment — Aura", mana: "{G}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +1/+1." };

describe("the parser", () => {
  it("both conditional lines parse to gated keyword grants beside the plain pump; both cards flip native", () => {
    const f = parseAuraBonus(FACE).map((e) => [e.op?.layerOp, e.op?.keyword ?? null, e.op?.gate?.kind ?? null]);
    const r = parseAuraBonus(RESCUE).map((e) => [e.op?.layerOp, e.op?.keyword ?? null, e.op?.gate?.kind ?? null]);
    const row = { f, r, fTier: classifyCard(FACE), rTier: classifyCard(RESCUE) };
    console.log("  WITNESS conditionalAuraBonus", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(f).toEqual([["ptModify", null, null], ["addKeyword", "First strike", "hostOtherAuraAttached"], ["addKeyword", "Lifelink", "hostOtherAuraAttached"]]);
    expect(r).toEqual([["addKeyword", "hexproof", "auraEnteredThisTurn"], ["ptModify", null, null]]);
    expect(row.fTier).toMatch(/^native/);
    expect(row.rTier).toMatch(/^native/);
  });
});

function board(auras, turn = 5) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = { ...createPermanent({ id: "host", card: { id: "c-host", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false }), attachments: auras.map((a) => a.id) };
  const perms = auras.map((a) => ({ ...createPermanent({ id: a.id, card: a.card, controller: "user" }), attachedTo: "host", enteredOnTurn: a.enteredOnTurn ?? turn }));
  return { ...s0, turn, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, ...perms] } } };
}
const read = (s) => ({ power: permanentPower(s, "host"), firstStrike: !!permanentHasKeyword(s, "host", "First strike"), lifelink: !!permanentHasKeyword(s, "host", "Lifelink"), hexproof: !!permanentHasKeyword(s, "host", "Hexproof") });

describe("RUNTIME — the gates through the layer engine", () => {
  it("Face of Divinity alone: +2/+2 and NO first strike; with a second Aura on the host: first strike + lifelink", () => {
    const alone = read(board([{ id: "face", card: FACE }]));
    const pair = read(board([{ id: "face", card: FACE }, { id: "plain", card: PLAIN }]));
    const row = { alone, pair };
    console.log("  WITNESS faceOfDivinity", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(alone).toEqual({ power: 4, firstStrike: false, lifelink: false, hexproof: false });
    expect(pair).toEqual({ power: 5, firstStrike: true, lifelink: true, hexproof: false });
  });

  it("Shardmage's Rescue that entered THIS turn grants hexproof; the same Aura from an earlier turn keeps only its +1/+1", () => {
    const fresh = read(board([{ id: "rescue", card: RESCUE, enteredOnTurn: 5 }], 5));
    const old = read(board([{ id: "rescue", card: RESCUE, enteredOnTurn: 4 }], 5));
    const row = { fresh, old };
    console.log("  WITNESS shardmagesRescue", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(fresh).toEqual({ power: 3, firstStrike: false, lifelink: false, hexproof: true });
    expect(old).toEqual({ power: 3, firstStrike: false, lifelink: false, hexproof: false });
  });
});
