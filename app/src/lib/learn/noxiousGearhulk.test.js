/**
 * noxiousGearhulk.test.js — the play-weighted program, #1002 Noxious Gearhulk.
 *
 *   "When this creature enters, you may destroy another target creature. If a creature is destroyed this way, you gain life
 *    equal to its toughness."
 *
 * Two pieces were missing. "destroy another target creature" did not parse (the other/another arm recursed into a plain
 * "destroy target creature" that only the legacy creature lane reads), and the life rider was read only unconditionally
 * (Sever Soul: "You gain life equal to its toughness."). The rider now carries `onlyIfDestroyed`: the controller gains the
 * creature's toughness as it last existed on the battlefield only when the destroy moved it off the battlefield (the bundled
 * rulings: "Use the toughness of the creature as it last existed on the battlefield"; "If the target creature has
 * indestructible, it isn't destroyed this way and you won't gain life. If it is destroyed but put into a zone other than a
 * graveyard, you'll gain life."). "Another" is the not-source restriction (CR 109.5 — the source is never its own target).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The cast is the offered legal action, dispatched; passPriority resolves the creature and its enters trigger, whose
 * target the trigger chooser picks; the "you may" is answered through resolveOptionalChoice.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const NOXIOUS = {"name":"Noxious Gearhulk","type":"Artifact Creature — Construct","mana":"{4}{B}{B}","cmc":6,"power":"5","toughness":"4","keywords":["Menace"],"colors":["B"],"oracle":"Menace\nWhen this creature enters, you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness."}; // body-only #1002
const SEVER = {"name":"Sever Soul","type":"Sorcery","mana":"{3}{B}{B}","cmc":5,"keywords":[],"colors":["B"],"oracle":"Destroy target nonblack creature. It can't be regenerated. You gain life equal to its toughness."}; // native-spell #27307
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const DMYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","cmc":3,"power":"0","toughness":"1","keywords":["Indestructible"],"colors":[],"oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)"}; // native-body
const RIP = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."}; // native-mixed
const PHANTOM = {"name":"Phantom Blade","type":"Artifact — Equipment","mana":"{4}{B}","cmc":5,"keywords":["Equip"],"colors":["B"],"oracle":"When this Equipment enters, attach it to up to one target creature you control. Destroy up to one other target creature.\nEquipped creature gets +1/+1 and has menace. (It can't be blocked except by two or more creatures.)\nEquip {2}"}; // body-only #10356
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const swamps = (n) => Array.from({ length: n }, (_, i) => P(`sw${i}`, SWAMP, "user"));
const ETB = "you may destroy another target creature. If a creature is destroyed this way, you gain life equal to its toughness";

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
/** Resolve the stack; the "you may" is answered `take`. */
function resolveStack(s, take = true) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length || s.pendingChoice) && g++ < 200) {
    if (s.pendingChoice?.kind === "optional-effect") { s = resolveOptionalChoice(s, take); continue; }
    if (s.pendingChoice) break;
    s = passPriority(s);
  }
  return s;
}
function castGearhulk({ user = [], ai = [] }, take = true) {
  const s = table({ user: [...user, ...swamps(6)], ai, hand: [{ ...NOXIOUS, id: "nox" }] });
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "nox");
  return resolveStack(dispatchAction(s, a), take);
}
const onField = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].some((p) => p.id === id);

describe("PARSE + CLASSIFICATION", () => {
  it("the enters effect → ONE optional destroy of another target creature carrying the destroyed-this-way toughness rider", () => {
    const p = parseEffectClause(ETB, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creature", restrictions: [{ kind: "notSource" }], optional: true,
      controllerRider: { kind: "casterGainLife", metric: "toughness", onlyIfDestroyed: true } }]);
  });

  it("the trigger routes natively and Noxious Gearhulk classifies native", () => {
    const d = detectTriggers(NOXIOUS).find((x) => x.event === "etb");
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(isNativeTier(classifyCard(NOXIOUS))).toBe(true);
  });

  it("control — Sever Soul's unconditional rider parses as before (no destroyed-this-way gate) and stays native", () => {
    const p = parseEffectClause("Destroy target nonblack creature. It can't be regenerated. You gain life equal to its toughness.", "Sorcery");
    expect(p.atoms.map((a) => a.controllerRider)).toEqual([{ kind: "casterGainLife", metric: "toughness" }]);
    expect(isNativeTier(classifyCard(SEVER))).toBe(true);
  });

  it("CREED — \"destroy up to one other target creature\" after an earlier target (Phantom Blade: other than the creature it attaches to) is not the not-source reading: parked", () => {
    expect(programConfidence(parseEffectClause("destroy up to one other target creature", "Instant", { sourceScoped: true }))).toBe("low");
    expect(isNativeTier(classifyCard(PHANTOM))).toBe(false);
  });

  it("CREED — the same sentence scaled by power, or gaining for another player, is not read", () => {
    for (const clause of [ETB.replace("its toughness", "its power"), ETB.replace("you gain life", "its controller gains life")]) {
      expect([clause, programConfidence(parseEffectClause(clause, "Instant", { sourceScoped: true }))]).toEqual([clause, "low"]);
    }
  });
});

describe("RUNTIME", () => {
  it("⭐ Noxious Gearhulk enters → the opponent's Hill Giant is destroyed and the user gains 3 (its toughness)", () => {
    const s = castGearhulk({ ai: [P("giant", GIANT, "ai")] });
    expect(onField(s, "giant")).toBe(false);
    expect(s.players.ai.graveyard.map((c) => c.name)).toEqual(["Hill Giant"]);
    expect(s.players.user.life).toBe(23);
    expect(onField(s, s.players.user.battlefield.find((p) => p.card.name === "Noxious Gearhulk")?.id)).toBe(true);
  });

  it("the toughness as it last existed: Grizzly Bears with two +1/+1 counters (4/4) → the user gains 4", () => {
    const s = castGearhulk({ ai: [P("bears", BEARS, "ai", { counters: { "+1/+1": 2 } })] });
    expect(onField(s, "bears")).toBe(false);
    expect(s.players.user.life).toBe(24);
  });

  it("destroyed into exile still counts (the ruling): with Rest in Peace out, Hill Giant goes to exile and the user gains 3", () => {
    const s = castGearhulk({ ai: [P("giant", GIANT, "ai"), P("rip", RIP, "ai")] });
    expect(s.players.ai.exile.map((c) => c.name)).toEqual(["Hill Giant"]);
    expect(s.players.user.life).toBe(23);
  });

  it("control — an indestructible creature isn't destroyed this way: Darksteel Myr stays, no life", () => {
    const s = castGearhulk({ ai: [P("myr", DMYR, "ai")] });
    expect(onField(s, "myr")).toBe(true);
    expect(s.players.user.life).toBe(20);
  });

  it("control — declining the \"you may\": nothing is destroyed, no life", () => {
    const s = castGearhulk({ ai: [P("giant", GIANT, "ai")] }, false);
    expect(onField(s, "giant")).toBe(true);
    expect(s.players.user.life).toBe(20);
  });

  it("control — \"another\": with no other creature the Gearhulk never destroys itself", () => {
    const s = castGearhulk({});
    expect(s.players.user.battlefield.some((p) => p.card.name === "Noxious Gearhulk")).toBe(true);
    expect(s.players.user.life).toBe(20);
  });
});
