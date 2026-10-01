/**
 * HELM OF THE HOST — the play-weighted program, P·30 (EDHREC #396).
 *   "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary.
 *    That token gains haste.
 *    Equip {5}"
 *
 * The token-copy anchor reads "equipped creature" (and Followed Footsteps' "enchanted creature") as the creature the source is
 * attached to: the "attached" referent Springheart Nantuko's copy already reads, live at resolution, so an unattached Helm makes
 * nothing (CR 111.12). "Except the token isn't legendary" strips the supertype from the copy (CR 707.9b), so the copy of a legend
 * survives the legend rule (CR 704.5j); "That token gains haste" is the minted-token haste fold (a lasting grant, CR 611.2a), so
 * the token attacks the turn it is made (CR 702.10b).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01); the triggers fire from the engine's own step machine.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceStep, runStepActions, flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HELM = { name: "Helm of the Host", type: "Legendary Artifact — Equipment", mana: "{4}", cmc: 4, keywords: ["Equip"], oracle: "At the beginning of combat on your turn, create a token that's a copy of equipped creature, except the token isn't legendary. That token gains haste.\nEquip {5}" };
const FOOTSTEPS = { name: "Followed Footsteps", type: "Enchantment — Aura", mana: "{3}{U}{U}", cmc: 5, keywords: ["Enchant"], oracle: "Enchant creature\nAt the beginning of your upkeep, create a token that's a copy of enchanted creature." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", cmc: 1, power: "2", toughness: "2", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

const P = (id, ctrl, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: ctrl, summoningSick: false }), ...over });
function board({ user = [], ai = [], active = "user", phase = "precombat-main", step = "main" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: active, phase, step, consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) },
      ai: { ...s.players.ai, battlefield: ai, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `al${i}` })) } } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 12 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
// The engine's own step entry: advance, then the new step's actions (its step triggers among them), then settle the stack.
const next = (s) => settle(runStepActions(advanceStep(s)));
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.token || p.card?.token);

describe("classify", () => {
  it("Helm of the Host → native-mixed; Followed Footsteps → native-trigger", () => {
    expect([classifyCard(HELM), classifyCard(FOOTSTEPS)]).toEqual(["native-mixed", "native-trigger"]);
  });
});

describe("Helm of the Host — at the beginning of combat on your turn", () => {
  it("⭐ a token copy of the equipped legend: not legendary (so both survive the legend rule), with haste — it may attack now", () => {
    const s0 = board({ user: [P("isamaru", "user", ISAMARU), P("helm", "user", HELM, { attachedTo: "isamaru" })] });
    const s = next(s0);
    const [tok] = tokensOf(s, "user");
    const attackers = legalActionsForPlayer(next(s), "user").filter((a) => a.kind === "declare-attacker").map((a) => a.attackerId ?? a.permanentId);
    const row = { step: s.step, copies: s.players.user.battlefield.filter((p) => p.card?.name === ISAMARU.name).length, tokenType: tok?.card?.type ?? null,
      haste: tok ? permanentHasKeyword(s, tok.id, "Haste") : null, tokenMayAttack: tok ? attackers.includes(tok.id) : null };
    console.log("  WITNESS helmCopy", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ step: "beginning-of-combat", copies: 2, tokenType: "Creature — Dog", haste: true, tokenMayAttack: true });
  });

  it("an unattached Helm makes nothing (no equipped creature, CR 111.12); nor does it on an opponent's turn", () => {
    const loose = next(board({ user: [P("isamaru", "user", ISAMARU), P("helm", "user", HELM)] }));
    const theirs = next(board({ user: [P("isamaru", "user", ISAMARU), P("helm", "user", HELM, { attachedTo: "isamaru" })], active: "ai" }));
    expect({ loose: tokensOf(loose, "user").length, theirTurn: tokensOf(theirs, "user").length, steps: [loose.step, theirs.step] })
      .toEqual({ loose: 0, theirTurn: 0, steps: ["beginning-of-combat", "beginning-of-combat"] });
  });
});

describe("Followed Footsteps — the enchanted-creature form", () => {
  it("at your upkeep, a token copy of the enchanted creature", () => {
    const s = next(board({ user: [P("bears", "user", BEARS), P("steps", "user", FOOTSTEPS, { attachedTo: "bears" })], phase: "beginning", step: "untap" }));
    expect({ step: s.step, tokens: tokensOf(s, "user").map((p) => p.card?.name) }).toEqual({ step: "upkeep", tokens: ["Grizzly Bears"] });
  });
});
