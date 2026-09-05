/**
 * REROUTE SYSTEMS — SHELF-85 · Otharri O10 (2026-09-05). "Choose one — • Target artifact or creature gains indestructible
 * until end of turn. • Reroute Systems deals 2 damage to target tapped creature." The second mode already parsed (a
 * tapped restriction on the burn); the first needed a keyword grant on the ARTIFACT-OR-CREATURE union — the proven
 * β-2 pool (every pick tagged type:"permanent"), which the pump resolver's creature gate now admits beside the bare
 * permanent scope. Loran's Escape ("… gains hexproof and indestructible …") rides the same arm through a splitter
 * keep-whole for the union subject.
 *
 * Mutation-checked: see the run ledger (docs-sk58).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REROUTE = { name: "Reroute Systems", type: "Instant", mana: "{W}", keywords: [], oracle: "Choose one —\n• Target artifact or creature gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)\n• Reroute Systems deals 2 damage to target tapped creature." };
const LORAN = { name: "Loran's Escape", type: "Instant", mana: "{W}", keywords: [], oracle: "Target artifact or creature gains hexproof and indestructible until end of turn. Scry 1." };
const perm = (id, controller, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
function setup() {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players,
      user: { ...b.players.user, hand: [{ ...REROUTE, id: "rs1" }], battlefield: [perm("ring", "user", { name: "Sol Ring", type: "Artifact", oracle: "" }), perm("bear", "user", { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }), perm("aura", "user", { name: "Pacifism", type: "Enchantment — Aura", oracle: "" })], manaPool: { ...b.players.user.manaPool, W: 1 } },
      ai: { ...b.players.ai, battlefield: [perm("tapped", "ai", { name: "Tapped Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, { tapped: true })] } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "rs1");
const modeOf = (a) => Array.isArray(a.chosenMode) ? a.chosenMode[0] : a.chosenMode;

describe("classify + parse", () => {
  it("Reroute Systems: both modes parse HIGH (the union grant + the tapped burn), native-spell; Loran's Escape: the union grant with two keywords + scry, native-spell", () => {
    const rs = parseEffectProgram(REROUTE);
    const le = parseEffectProgram(LORAN);
    const row = {
      rs: { confidence: rs.confidence, modes: (rs.modal?.modes || []).map((m) => m.atoms.map((a) => [a.op, a.targetType, a.grantKeywords ?? null])), tier: classifyCard(REROUTE) },
      le: { confidence: le.confidence, atoms: le.atoms.map((a) => [a.op, a.targetType ?? null, a.grantKeywords ?? null]), tier: classifyCard(LORAN) },
    };
    console.log("  WITNESS rerouteParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.rs.confidence).toBe("high");
    expect(row.rs.modes).toEqual([[["pump", "creatureOrArtifact", ["indestructible"]]], [["deal-damage", "creature", null]]]);
    expect(row.rs.tier).toBe("native-spell");
    expect(row.le.confidence).toBe("high");
    expect(row.le.atoms[0]).toEqual(["pump", "creatureOrArtifact", ["hexproof", "indestructible"]]);
    expect(row.le.tier).toBe("native-spell");
  });
});

describe("mode 1 at resolution — the union pool and the grant on a NON-creature", () => {
  it("the grant mode is offered at the artifact and both creatures (either side) but NOT the aura; cast at the artifact it gains indestructible (a non-creature pick, tagged 'permanent', is kept by the pump gate)", () => {
    const s0 = setup();
    const grantCasts = casts(s0).filter((a) => modeOf(a) === 0);
    const offered = grantCasts.map((a) => a.targetName).sort();
    const atRing = grantCasts.find((a) => a.targetName === "Sol Ring");
    expect(atRing).toBeTruthy();
    const s1 = drain(dispatchAction(s0, atRing));
    const atBear = grantCasts.find((a) => a.targetName === "Grizzly Bears");
    const s2 = drain(dispatchAction(s0, atBear));
    const row = { offered, ringIndestructible: permanentHasKeyword(s1, "ring", "indestructible"), bearIndestructible: permanentHasKeyword(s2, "bear", "indestructible"), ringUntouchedInS2: permanentHasKeyword(s2, "ring", "indestructible"), stack: s1.stack.length };
    console.log("  WITNESS rerouteMode1", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.offered).toEqual(["Grizzly Bears", "Sol Ring", "Tapped Bear"]); // any artifact or creature, EITHER side (the printed target has no controller clause); the aura is out
    expect(row.ringIndestructible).toBe(true);
    expect(row.bearIndestructible).toBe(true);
    expect(row.ringUntouchedInS2).toBe(false);
    expect(row.stack).toBe(0);
  });
});
