/**
 * CLONE WIDENING — POD-SIM THREE · KN-2 (2026-09-05): Copy Enchantment ("any enchantment on the battlefield") and Clever
 * Impersonator ("any nonland permanent on the battlefield").
 *
 * The runbook's bar: a copied STATIC must APPLY — a Copy Enchantment entering as an anthem pumps the copier's creatures.
 * Sagas are never offered under either scope (a Saga copy needs its lore counter on entry, CR 714.3a — unmodeled, so a narrower
 * pool: false-negative safe). Auras were not either until 2026-10-16; the copy now chooses what it enchants as it enters
 * (CR 303.4f — copyEnchantmentAura.test.js), so the pins below that kept the Pacifism out are graduated.
 *
 * Mutation-checked: see the run ledger (docs-sk44).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { cloneCandidates } from "./cloneCopy.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const COPY_ENCHANT = { id: "card-ce", name: "Copy Enchantment", type: "Enchantment", mana: "{2}{U}", cmc: 3, colors: ["U"], oracle: "You may have this enchantment enter as a copy of any enchantment on the battlefield." };
const CLEVER = { id: "card-cl", name: "Clever Impersonator", type: "Creature — Shapeshifter", mana: "{2}{U}{U}", cmc: 4, colors: ["U"], power: 0, toughness: 0, oracle: "You may have this creature enter as a copy of any nonland permanent on the battlefield." };

const perm = (id, controller, card, extra = {}) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false, ...extra });
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}", oracle: "Creatures you control get +1/+1." };
// The Pacifism is attached to the Bear (2026-10-16): an Aura attached to nothing is put into the graveyard by the next
// state-based check (CR 704.5m), so an unattached one would vanish mid-cast and never reach the copy choice.
const board = () => [
  perm("anthem", "ai", ANTHEM),
  { ...perm("aura", "ai", { name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block." }), attachedTo: "bear" },
  perm("saga", "ai", { name: "History of Benalia", type: "Enchantment — Saga", oracle: "I, II — Create a 2/2 white Knight creature token with vigilance." }),
  { ...perm("bear", "ai", { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }), attachments: ["aura"] },
  perm("sol", "ai", { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }),
  perm("pw", "ai", { name: "Jace", type: "Legendary Planeswalker — Jace", oracle: "" }),
  perm("land", "ai", { name: "Island", type: "Basic Land — Island", oracle: "" }),
];
function state(hand, userBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [hand], battlefield: userBf, manaPool: { ...s.players.user.manaPool, U: 2, C: 2 } },
      ai: { ...s.players.ai, battlefield: board() },
    },
  };
}
function castToPause(s, cardId) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  const paused = resolveTopOfStack(dispatchAction(s, cast));
  expect(paused.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
  return paused;
}
const ids = (cands) => cands.map((c) => c.id).sort();

describe("candidate pools", () => {
  // GRADUATED 2026-10-16: the Aura (Pacifism, Enchant creature — a line the engine lists) is in both pools now.
  it("anyEnchantment offers the anthem and the Aura — never the Saga, a creature, an artifact, a planeswalker or a land", () => {
    const s = state(COPY_ENCHANT);
    const row = { ench: ids(cloneCandidates(s, "user", "anyEnchantment")), nonland: ids(cloneCandidates(s, "user", "anyNonlandPermanent")) };
    console.log("  WITNESS cloneWidenedPools", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ench).toEqual(["anthem", "aura"]);
    expect(row.nonland).toEqual(["anthem", "aura", "bear", "pw", "sol"]);
  });
});

describe("Copy Enchantment — the copied STATIC applies", () => {
  it("entering as a copy of the opponent's Glorious Anthem, MY bear is 3/3 (theirs stays 3/3 from their own); declining, it enters as itself and my bear stays 2/2", () => {
    const mine = perm("mybear", "user", { name: "My Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
    const s = state(COPY_ENCHANT, [mine]);
    const paused = castToPause(s, "card-ce");
    expect(ids(paused.pendingChoice.candidates)).toEqual(["anthem", "aura"]); // graduated 2026-10-16: + the Pacifism (its copy has a host)
    const copied = finalizeStackResolution(resolveCloneChoice(paused, "anthem"));
    const clone = copied.players.user.battlefield.find((p) => p.printedCard);
    const row = { became: clone?.card?.name, printed: clone?.printedCard?.name, type: clone?.card?.type, myBear: permanentPower(copied, "mybear"), theirBear: permanentPower(copied, "bear") };
    console.log("  WITNESS cloneWidenedAnthem", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.became).toBe("Glorious Anthem");
    expect(row.printed).toBe("Copy Enchantment");
    expect(row.type).toBe("Enchantment");
    expect(row.myBear).toBe(3);
    expect(row.theirBear).toBe(3);
    const declined = finalizeStackResolution(resolveCloneChoice(castToPause(state(COPY_ENCHANT, [mine]), "card-ce"), null));
    const self = declined.players.user.battlefield.find((p) => p.card?.name === "Copy Enchantment");
    expect(self).toBeTruthy();
    expect(permanentPower(declined, "mybear")).toBe(2);
  });

  // GRADUATED 2026-10-16: this was "a wrong pick (the Aura) is refused: … never as a Pacifism with nothing to enchant". The Aura is
  // a legal pick now — the copy chooses what it enchants as it enters — so it becomes a Pacifism on the opponent's Bear.
  it("the Aura is a legal pick now: the copy enters as a Pacifism attached to the opponent's Bear (never to nothing)", () => {
    const paused = castToPause(state(COPY_ENCHANT), "card-ce");
    const after = finalizeStackResolution(resolveCloneChoice(paused, "aura"));
    const copy = after.players.user.battlefield.find((p) => p.printedCard?.name === "Copy Enchantment");
    expect({ became: copy?.card?.name, host: copy?.attachedTo ?? null }).toEqual({ became: "Pacifism", host: "bear" });
  });
});

describe("Clever Impersonator — any nonland permanent", () => {
  it("copies the opponent's Sol Ring (a creature card becoming an artifact) and their anthem; the pause offers the five nonland non-Saga permanents", () => {
    const paused = castToPause(state(CLEVER), "card-cl");
    expect(ids(paused.pendingChoice.candidates)).toEqual(["anthem", "aura", "bear", "pw", "sol"]); // graduated 2026-10-16: + the Pacifism
    const asRing = finalizeStackResolution(resolveCloneChoice(paused, "sol"));
    const ring = asRing.players.user.battlefield.find((p) => p.printedCard);
    const mine = perm("mybear", "user", { name: "My Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
    const asAnthem = finalizeStackResolution(resolveCloneChoice(castToPause(state(CLEVER, [mine]), "card-cl"), "anthem"));
    const row = { ring: ring?.card?.name, ringType: ring?.card?.type, printed: ring?.printedCard?.name, myBearUnderCopiedAnthem: permanentPower(asAnthem, "mybear") };
    console.log("  WITNESS cloneWidenedImpersonator", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ring).toBe("Sol Ring");
    expect(row.ringType).toBe("Artifact");
    expect(row.printed).toBe("Clever Impersonator");
    expect(row.myBearUnderCopiedAnthem).toBe(3);
  });

  it("the land is never a legal pick: choosing it enters the Impersonator as itself (a 0/0 that dies)", () => {
    const paused = castToPause(state(CLEVER), "card-cl");
    const after = finalizeStackResolution(resolveCloneChoice(paused, "land"));
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Island")).toBe(false);
    expect(after.players.user.battlefield.some((p) => p.printedCard)).toBe(false);
  });
});
