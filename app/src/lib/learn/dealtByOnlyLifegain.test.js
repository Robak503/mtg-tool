/**
 * THE DEALT-BY EVENT FIRES ONE PAYOFF — "Whenever this creature deals [combat] damage, you gain that much life." The runtime's only
 * firing site for this event is checkDealtByTriggers (both damage paths, once per source per damage event — CR 510.2), and it fires
 * exactly the lifegain link it reads off the dealer's card (dealtByLinkOf) and its attached Auras. Any other payoff on the same
 * event parsed HIGH and routed natively, so the card read native while its trigger never happened:
 *   · Drinker of Sorrow (EDHREC #13014) — "Whenever this creature deals combat damage, sacrifice a permanent.";
 *   · Olivia's Attendants (#8688) — "Whenever this creature deals damage, create that many Blood tokens.";
 *   · Angel of Deliverance (#19146) — "Delirium — Whenever this creature deals damage, if there are four or more card types among
 *     cards in your graveyard, exile target creature an opponent controls.";
 *   · Stir the Pride (#27604) — its second mode grants "Whenever this creature deals damage, you gain that much life." until end of turn: a
 *     granted body is never read by dealtByLinkOf, so even the lifegain link never fired;
 *   · and the quoted grant Ceremonial Knife carries ("Whenever this creature deals combat damage, create a Blood token."), which the
 *     reminder-quote fix (reminderQuotedSpan.test.js) would otherwise have credited.
 * A false credit, removed on purpose (play-weighted 2026-10-20): the dealt-by descriptor routes natively only as the lifegain link.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively, isModeledGroupTriggeredBody } from "./triggerRouting.js";
import { createGameState, createPermanent } from "./gameState.js";
import { resolveCombatDamage } from "./combatResolution.js";

const DRINKER_OF_SORROW = {"name":"Drinker of Sorrow","type":"Creature — Horror","mana":"{2}{B}","cmc":3,"power":"5","toughness":"3","keywords":[],"colors":["B"],"oracle":"This creature can't block.\nWhenever this creature deals combat damage, sacrifice a permanent."}; // native-trigger on 0a65c51c
const OLIVIAS_ATTENDANTS = {"name":"Olivia's Attendants","type":"Creature — Vampire","mana":"{4}{R}{R}","cmc":6,"power":"6","toughness":"6","keywords":["Menace"],"colors":["R"],"oracle":"Menace\nWhenever this creature deals damage, create that many Blood tokens. (They're artifacts with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\n{2}{R}: This creature deals 1 damage to any target."}; // native-mixed on 0a65c51c
const ANGEL_OF_DELIVERANCE = {"name":"Angel of Deliverance","type":"Creature — Angel","mana":"{6}{W}{W}","cmc":8,"power":"6","toughness":"6","keywords":["Flying","Delirium"],"colors":["W"],"oracle":"Flying\nDelirium — Whenever this creature deals damage, if there are four or more card types among cards in your graveyard, exile target creature an opponent controls."}; // native-trigger on 0a65c51c
const EXALTED_ANGEL = {"name":"Exalted Angel","type":"Creature — Angel","mana":"{4}{W}{W}","cmc":6,"power":"4","toughness":"5","keywords":["Flying","Morph"],"colors":["W"],"oracle":"Flying\nWhenever this creature deals damage, you gain that much life.\nMorph {2}{W}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)"}; // native-trigger on 0a65c51c
const STIR_THE_PRIDE = {"name":"Stir the Pride","type":"Instant","mana":"{4}{W}","cmc":5,"power":null,"toughness":null,"keywords":["Entwine"],"colors":["W"],"oracle":"Choose one —\n• Creatures you control get +2/+2 until end of turn.\n• Until end of turn, creatures you control gain \"Whenever this creature deals damage, you gain that much life.\"\nEntwine {1}{W} (Choose both if you pay the entwine cost.)"}; // native-spell on 0a65c51c
const CEREMONIAL_KNIFE = {"name":"Ceremonial Knife","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+0 and has \"Whenever this creature deals combat damage, create a Blood token.\" (It's an artifact with \"{1}, {T}, Discard a card, Sacrifice this token: Draw a card.\")\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // body-only on 0a65c51c

// `card` attacks the AI unblocked and deals its combat damage.
function swing(card) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const p = createPermanent({ id: "atk", card: { ...card, id: "c-atk" }, controller: "user", summoningSick: false });
  const land = createPermanent({ id: "land", card: { id: "c-land", name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" }, controller: "user" });
  const s = { ...s0, turn: 3, activePlayer: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...s0.players, user: { ...s0.players.user, life: 20, battlefield: [p, land] } } };
  return resolveCombatDamage(s);
}
const fired = (s) => (s.pendingTriggers || []).map((t) => t.effectClause ?? t.descriptor?.effectClause ?? null);

describe("the dealt-by event's one payoff", () => {
  it("⭐ the carriers of another payoff park; the lifegain link and an unrelated card stay as they were", () => {
    expect([DRINKER_OF_SORROW, OLIVIAS_ATTENDANTS, ANGEL_OF_DELIVERANCE, STIR_THE_PRIDE, CEREMONIAL_KNIFE, EXALTED_ANGEL].map((c) => classifyCard(c)))
      .toEqual(["body-only", "body-only", "body-only", "arbiter-spell", "body-only", "native-trigger"]);
  });
  it("⭐ the routing gate: a dealt-by descriptor routes only as the lifegain link", () => {
    const route = (card) => detectTriggers(card).filter((d) => d.event === "dealtBy").map((d) => triggerRoutesNatively(d));
    expect({ drinker: route(DRINKER_OF_SORROW), angel: route(EXALTED_ANGEL), grantedLifegain: isModeledGroupTriggeredBody("Whenever this creature deals damage, you gain that much life.") })
      .toEqual({ drinker: [false], angel: [true], grantedLifegain: false });
  });
  it("why: the runtime fires the lifegain link, and nothing for Drinker of Sorrow", () => {
    const drinker = swing(DRINKER_OF_SORROW);
    const angel = swing(EXALTED_ANGEL);
    expect({ drinker: fired(drinker), drinkerLand: drinker.players.user.battlefield.length, angel: (angel.pendingTriggers || []).length })
      .toEqual({ drinker: [], drinkerLand: 2, angel: 1 });
  });
});
