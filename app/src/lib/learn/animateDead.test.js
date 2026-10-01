/**
 * animateDead.test.js — Animate Dead (the play-weighted program, P·12, 2026-10-01: EDHREC rank #224; CR 303.4, 704.5m).
 *
 *   "Enchant creature card in a graveyard
 *    When this Aura enters, if it's on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant
 *    creature put onto the battlefield with this Aura." Return enchanted creature card to the battlefield under your control
 *    and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.
 *    Enchanted creature gets -1/-0."
 *
 * One gate (animateDeadGate — the exact text) drives the cast offer (a creature card in ANY graveyard, CR 303.4a), the
 * AURA_ETB graveyard branch (the Aura enters attached to no permanent, stamped with the card), both synthesized triggers
 * (effects/atoms/animateDead.js) and the coverage tier.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { detectTriggers } from "./triggers.js";
import { isGraveyardReanimateAura } from "./animateDeadGate.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ANIMATE_DEAD = { name: "Animate Dead", type: "Enchantment — Aura", mana: "{1}{B}", cmc: 2, colors: ["B"], keywords: ["Enchant"],
  oracle: "Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets -1/-0." };
const DANCE = { ...ANIMATE_DEAD, name: "Dance of the Dead",
  oracle: "Enchant creature card in a graveyard\nWhen this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Put enchanted creature card onto the battlefield tapped under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.\nEnchanted creature gets +1/+1 and doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {1}{B}. If the player does, untap that creature." };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };

function table({ mine = [["my-wurm", WURM]], theirs = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, hand: [{ ...ANIMATE_DEAD, id: "ad" }], graveyard: mine.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, B: 2 } },
      ai: { ...g.players.ai, graveyard: theirs.map(([id, c]) => ({ ...c, id })) } } };
}
const castOn = (s, cardId) => dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "ad" && a.targets?.[0]?.id === cardId));
/** Resolve the stack and any pending triggers to quiet. */
function settle(s) {
  let n = finalizeStackResolution(s), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = finalizeStackResolution(n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets }));
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const view = (s) => ({
  user: s.players.user.battlefield.map((p) => p.card?.name).sort(), ai: s.players.ai.battlefield.map((p) => p.card?.name).sort(),
  userYard: s.players.user.graveyard.map((c) => c.name).sort(), aiYard: s.players.ai.graveyard.map((c) => c.name).sort(),
});

describe("the card", () => {
  it("one exact-text gate: Animate Dead is native-aura with its two triggers synthesized; Dance of the Dead stays out", () => {
    expect({ gate: [isGraveyardReanimateAura(ANIMATE_DEAD), isGraveyardReanimateAura(DANCE)], tier: classifyCard(ANIMATE_DEAD), triggers: detectTriggers(ANIMATE_DEAD).map((d) => d.event) })
      .toEqual({ gate: [true, false], tier: "native-aura", triggers: ["etb", "leavesSelf"] });
  });

  it("the cast targets a creature card in ANY graveyard (CR 303.4a); with none it isn't castable", () => {
    const both = legalActionsForPlayer(table({ theirs: [["their-wurm", WURM]] }), "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ad");
    const none = legalActionsForPlayer(table({ mine: [] }), "user").filter((a) => a.kind === "cast-spell" && a.cardId === "ad");
    expect({ both: both.map((a) => [a.targets[0].id, a.targets[0].controller]).sort(), none: none.length }).toEqual({ both: [["my-wurm", "user"], ["their-wurm", "ai"]], none: 0 });
  });
});

describe("in play", () => {
  it("returns the Wurm from your graveyard with Animate Dead attached — a 5/4 (WITNESS)", () => {
    const s = settle(castOn(table(), "my-wurm"));
    const wurm = s.players.user.battlefield.find((p) => p.card?.name === "Craw Wurm");
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Animate Dead");
    const witness = { wurm: !!wurm, attached: aura?.attachedTo === wurm?.id, linked: wurm?.animatedBy === aura?.id, size: wurm ? [permanentPower(s, wurm.id), permanentToughness(s, wurm.id)] : null, stamp: aura?.enchantedGraveyardCard ?? null };
    console.log(`WITNESS animateDead ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ wurm: true, attached: true, linked: true, size: [5, 4], stamp: null });
  });

  it("an opponent's creature card returns under YOUR control", () => {
    const s = settle(castOn(table({ mine: [], theirs: [["their-wurm", WURM]] }), "their-wurm"));
    expect(view(s)).toEqual({ user: ["Animate Dead", "Craw Wurm"], ai: [], userYard: [], aiYard: [] });
  });

  it("⛔ the card leaves before the spell resolves: it fizzles — the Aura goes to the graveyard, nothing enters (CR 608.2b)", () => {
    const cast = castOn(table(), "my-wurm");
    const gone = { ...cast, players: { ...cast.players, user: { ...cast.players.user, graveyard: [] } } };
    const s = settle(gone);
    expect({ ...view(s), fizzled: (s.log || []).some((e) => e.kind === "spell-fizzle" && e.reason === "enchanted card left the graveyard"),
      everEntered: (s.log || []).some((e) => e.kind === "permanent-enters" && /Animate Dead/.test(String(e.cardName || e.name || ""))) })
      .toEqual({ user: [], ai: [], userYard: ["Animate Dead"], aiYard: [], fizzled: true, everEntered: false });
  });

  it("⛔ the Aura is removed in response to its trigger: \"if it's on the battlefield\" fails — nothing returns (CR 603.4)", () => {
    const entered = finalizeStackResolution(resolveTopOfStack(castOn(table(), "my-wurm")));
    const auraId = entered.players.user.battlefield.find((p) => p.card?.name === "Animate Dead").id;
    const removed = ATOM_RESOLVERS["destroy"](entered, { op: "destroy", targetType: "artifactOrEnchantment" }, { controller: "ai", targets: [{ type: "permanent", id: auraId }] });
    expect(view(settle(removed))).toEqual({ user: [], ai: [], userYard: ["Animate Dead", "Craw Wurm"], aiYard: [] });
  });

  it("⛔ the card leaves after the Aura enters, before its trigger resolves: the Aura is attached to nothing — graveyard (CR 704.5m)", () => {
    const entered = finalizeStackResolution(resolveTopOfStack(castOn(table(), "my-wurm"))); // the Aura on the battlefield, its ETB pending
    if (!entered.players.user.battlefield.some((p) => p.card?.name === "Animate Dead")) throw new Error("the Aura did not enter");
    const gone = { ...entered, players: { ...entered.players, user: { ...entered.players.user, graveyard: [] } } };
    expect(view(settle(gone))).toEqual({ user: [], ai: [], userYard: ["Animate Dead"], aiYard: [] });
  });

  it("the Aura is destroyed: the creature's controller sacrifices it", () => {
    const s = settle(castOn(table({ mine: [], theirs: [["their-wurm", WURM]] }), "their-wurm"));
    const auraId = s.players.user.battlefield.find((p) => p.card?.name === "Animate Dead").id;
    const destroyed = settle(ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "artifactOrEnchantment" }, { controller: "ai", targets: [{ type: "permanent", id: auraId }] }));
    expect(view(destroyed)).toEqual({ user: [], ai: [], userYard: ["Animate Dead"], aiYard: ["Craw Wurm"] });
  });

  it("the creature dies first: the Aura falls off and its leave trigger finds nothing to sacrifice", () => {
    const s = settle(castOn(table(), "my-wurm"));
    const wurmId = s.players.user.battlefield.find((p) => p.card?.name === "Craw Wurm").id;
    const killed = settle(ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "creature" }, { controller: "ai", targets: [{ type: "creature", id: wurmId }] }));
    expect(view(killed)).toEqual({ user: [], ai: [], userYard: ["Animate Dead", "Craw Wurm"], aiYard: [] });
  });
});
