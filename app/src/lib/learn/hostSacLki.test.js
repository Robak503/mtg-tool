/**
 * hostSacLki.test.js — CORPUS ④-Q (2026-09-03 night): "SACRIFICE THIS AURA: <effect on enchanted creature>" — the host by
 * LAST KNOWN INFORMATION (CR 113.7a). The cost detaches the Aura BEFORE the ability resolves, so the old GUARD-LEAVE
 * parked every carrier (Briar Shield / Thrull Retainer / Stamina / Carapace were the four it was written for). Now the
 * dispatcher stamps the host's id on the activation as the cost is paid (ctx.enchantedLkiId) and enchantedTargets
 * reads it ONLY when the Aura has left the battlefield; the two classifier guards admit a self-SACRIFICE whose atoms
 * are all the enchanted referent. Exile-self costs, equipped referents and text-only host mentions keep the guard.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { enchantedTargets } from "./effects/atoms/shared.js";

beforeEach(() => _resetIdsForTests());

const A = (id, name, mana, cmc, oracle) => ({ id, name, type: "Enchantment — Aura", mana, cmc, keywords: [], oracle });
const CHOKING = A("c-cr", "Choking Restraints", "{2}{W}", 3, "Enchant creature\nEnchanted creature can't attack or block.\n{3}{W}{W}, Sacrifice this Aura: Exile enchanted creature.");
const PHANTOM_WINGS = A("c-pw", "Phantom Wings", "{1}{U}", 2, "Enchant creature\nEnchanted creature has flying.\nSacrifice this Aura: Return enchanted creature to its owner's hand.");
const THRULL = A("c-tr", "Thrull Retainer", "{B}", 1, "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Regenerate enchanted creature.");
const STAMINA = A("c-st", "Stamina", "{2}{G}", 3, "Enchant creature\nEnchanted creature has vigilance.\nSacrifice this Aura: Regenerate enchanted creature.");
const CARAPACE = A("c-ca", "Carapace", "{G}", 1, "Enchant creature\nEnchanted creature gets +0/+2.\nSacrifice this Aura: Regenerate enchanted creature.");
const BRIAR = A("c-bs", "Briar Shield", "{G}", 1, "Enchant creature\nEnchanted creature gets +1/+1.\nSacrifice this Aura: Enchanted creature gets +3/+3 until end of turn.");
const KITHKIN_ARMOR = A("c-ka", "Kithkin Armor", "{W}", 1, "Enchant creature\nEnchanted creature can't be blocked by creatures with power 3 or greater.\nSacrifice this Aura: The next time a source of your choice would deal damage to enchanted creature this turn, prevent that damage.");
const COILS = A("c-co", "Coils of the Medusa", "{1}{B}", 2, "Enchant creature\nEnchanted creature gets +1/-1.\nSacrifice this Aura: Destroy all non-Wall creatures blocking enchanted creature.");

function setup(auraCard, pool, { hostController = "ai" } = {}) {
  const host = createPermanent({ id: "host", card: { id: "c-host", name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: hostController, summoningSick: false });
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "host"; host.attachments = ["aura"];
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const userBf = hostController === "user" ? [host, a] : [a];
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 6,
    players: { ...base.players,
      user: { ...base.players.user, graveyard: [], exile: [], hand: [], battlefield: userBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...base.players.ai, graveyard: [], exile: [], hand: [], battlefield: hostController === "ai" ? [host] : [] } } };
}
const sacAct = (s) => legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "aura" && x.sacSelf);

describe("the tiers", () => {
  it("⭐ the six LKI-resolvable self-sacrifice Auras are native; the unmodeled-effect siblings stay parked", () => {
    for (const c of [CHOKING, PHANTOM_WINGS, THRULL, STAMINA, CARAPACE, BRIAR]) expect(classifyCard(c)).toMatch(/^native/);
    expect(classifyCard(KITHKIN_ARMOR)).not.toMatch(/^native/);
    expect(classifyCard(COILS)).not.toMatch(/^native/);
    // an EXILE-self cost has no LKI stamp and keeps the guard — SYNTHETIC (no printed Aura exiles itself for a host effect)
    expect(classifyCard(A("c-syn", "Probe Exiler", "{G}", 1, "Enchant creature\nEnchanted creature gets +1/+1.\nExile this Aura: Enchanted creature gets +3/+3 until end of turn."))).not.toMatch(/^native/);
  });
});

describe("the referent — live first, LKI only once the Aura is gone", () => {
  it("attached and on the battlefield → the live host; gone → the stamped host; merely detached → nothing", () => {
    const s = setup(BRIAR, {});
    expect(enchantedTargets(s, { sourceId: "aura" }).map((t) => t.id)).toEqual(["host"]);
    const gone = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    expect(enchantedTargets(gone, { sourceId: "aura", enchantedLkiId: "host" }).map((t) => t.id)).toEqual(["host"]);
    expect(enchantedTargets(gone, { sourceId: "aura" })).toEqual([]);
    const detached = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...s.players.user.battlefield[0], attachedTo: undefined }] } } };
    expect(enchantedTargets(detached, { sourceId: "aura", enchantedLkiId: "host" })).toEqual([]);
  });
});

describe("runtime — the Aura is sacrificed as the cost, and the effect still lands on its host", () => {
  it("⭐ Choking Restraints: {3}{W}{W}, sacrifice → the opponent's Bear is exiled, the Aura in our graveyard", () => {
    const s = setup(CHOKING, { W: 2, C: 3 });
    const act = sacAct(s);
    expect(act).toBeTruthy();
    const out = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(out, "aura")).toBeFalsy();
    expect(out.players.user.graveyard.some((c) => c.name === "Choking Restraints")).toBe(true);
    expect(findPermanent(out, "host")).toBeFalsy();
    expect(out.players.ai.exile.some((c) => c.name === "Host Bear")).toBe(true);
  });
  it("⭐ Briar Shield on our own Bear: sacrifice → the +1/+1 static is gone, the +3/+3 pump lands → 5/5 this turn", () => {
    const s = setup(BRIAR, {}, { hostController: "user" });
    expect(permanentPower(s, "host")).toBe(3);
    const out = resolveTopOfStack(dispatchAction(s, sacAct(s)));
    expect(findPermanent(out, "aura")).toBeFalsy();
    expect(permanentPower(out, "host")).toBe(5);
    expect(permanentToughness(out, "host")).toBe(5);
  });
  it("Phantom Wings: sacrifice → the opponent's Bear returns to its owner's hand", () => {
    const s = setup(PHANTOM_WINGS, {});
    const out = resolveTopOfStack(dispatchAction(s, sacAct(s)));
    expect(findPermanent(out, "host")).toBeFalsy();
    expect(out.players.ai.hand.some((c) => c.name === "Host Bear")).toBe(true);
  });
  it("Thrull Retainer on our Bear: sacrifice → the Bear carries a regeneration shield", () => {
    const s = setup(THRULL, {}, { hostController: "user" });
    const out = resolveTopOfStack(dispatchAction(s, sacAct(s)));
    expect(findPermanent(out, "aura")).toBeFalsy();
    expect(findPermanent(out, "host").permanent.regenShields).toBe(1);
  });
});
