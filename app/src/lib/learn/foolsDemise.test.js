/**
 * foolsDemise.test.js — "When enchanted creature dies, return that card to the battlefield under your control." (Fool's Demise,
 * Shade's Form — census rank 64 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * The AURA HOST DIES detector (triggers.js) fired these, but "that card" names the DEAD host, which no atom could bind, so the
 * detector's own note held: "an effect that DOES reference the dead creature … simply fails to parse". The dies look-back
 * already threads the dead card's id (ctx.triggeringCardId); a dies + attached-gated sentinel now hands the clause to one
 * atom (selfReturn.applyAttachedDiesReturnYours) that takes the card from whichever graveyard holds it — its OWNER's — onto
 * the battlefield under the ATTACHMENT controller's control ("your", CR 603.3a), owner stamped. Tokens never return (CR
 * 111.7); a card gone from the graveyard is a clean no-op (CR 608.2b). Demonic Vigor's "…to its owner's hand" stays parked.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). The host dies through the destroy atom; the triggers flush and
 * resolve through the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkDiesTriggers } from "./triggers.js";
import { applyAttachedDiesReturnYours } from "./effects/atoms/selfReturn.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FOOLS_DEMISE = { name: "Fool's Demise", type: "Enchantment — Aura", mana: "{4}{U}", keywords: ["Enchant"],
  oracle: "Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under your control.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
const SHADES_FORM = { name: "Shade's Form", type: "Enchantment — Aura", mana: "{2}{B}", keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature has \"{B}: This creature gets +1/+1 until end of turn.\"\nWhen enchanted creature dies, return that card to the battlefield under your control." };
const DEMONIC_VIGOR = { name: "Demonic Vigor", type: "Enchantment — Aura", mana: "{B}", keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +1/+1.\nWhen enchanted creature dies, return that card to its owner's hand." };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const SOLDIER = { name: "Soldier", type: "Token Creature — Soldier", mana: "", power: "1", toughness: "1", keywords: [], oracle: "", token: true };

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
// `aura` (the user's) enchants `host` (controlled by `hostSide`); the host takes lethal damage and dies through the engine's
// own death path — destroyLethalCreatures (the detach, the Aura binned, the CR 603.10a look-back with its attachments) then
// checkDiesTriggers — exactly as auraHostDiesTrigger.test.js drives it; then everything resolves. (A DESTROY-effect kill
// loses the attachments look-back today — a separate engine gap, closed and witnessed in the next slice.)
function killHost(aura, host, hostSide) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const auraPerm = perm("aura", aura, "user");
  const hostPerm = perm("host", host, hostSide);
  let s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: hostSide === "user" ? [auraPerm, hostPerm] : [auraPerm] },
      ai: { ...s0.players.ai, battlefield: hostSide === "ai" ? [hostPerm] : [] } } };
  s = attachPermanent(s, { equipId: "aura", targetId: "host" });
  s = { ...s, players: { ...s.players, [hostSide]: { ...s.players[hostSide], battlefield: s.players[hostSide].battlefield.map((p) => (p.id === "host" ? { ...p, damageMarked: 99 } : p)) } } };
  const r = destroyLethalCreatures(s);
  s = flushTriggers(checkDiesTriggers(r.state, r.dead));
  for (let i = 0; i < 12 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s));
  return s;
}
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();

describe("the tiers", () => {
  it("⭐ Fool's Demise and Shade's Form classify native; Demonic Vigor's '…to its owner's hand' stays parked (vacuity control)", () => {
    expect([FOOLS_DEMISE, SHADES_FORM].map(classifyCard).map((t) => /^native-/.test(t))).toEqual([true, true]);
    expect(classifyCard(DEMONIC_VIGOR)).not.toMatch(/^native-/);
  });
  it("⛔ the marker is DIES-gated: the same words on a live event stay parked (a synthetic attacks trigger)", () => {
    expect(classifyCard({ ...FOOLS_DEMISE, oracle: "Enchant creature\nWhenever enchanted creature attacks, return that card to the battlefield under your control." })).not.toMatch(/^native-/);
  });
});

describe("RUNTIME — the host dies, and comes back under the Aura controller's control", () => {
  it("⭐ your Fool's Demise on the AI's Hill Giant: the Giant dies and returns under YOUR control (owner stamped), and the Aura returns to your hand", () => {
    const out = killHost(FOOLS_DEMISE, GIANT, "ai");
    const giant = out.players.user.battlefield.find((p) => p.card?.name === "Hill Giant");
    const result = { userBattlefield: names(out.players.user.battlefield), aiBattlefield: names(out.players.ai.battlefield), aiGraveyard: names(out.players.ai.graveyard),
      owner: giant?.owner ?? null, userHand: names(out.players.user.hand) };
    expect(result).toEqual({ userBattlefield: ["Hill Giant"], aiBattlefield: [], aiGraveyard: [], owner: "ai", userHand: ["Fool's Demise"] });
    console.log(`WITNESS foolsDemiseSteal ${JSON.stringify(result)}`);
  });
  it("⭐ the three that flipped unplanned print the same trigger — False Demise, Minion's Return, Unhallowed Pact each bring the Bear back (WITNESS)", () => {
    const same = (name, extra = "") => ({ name, type: "Enchantment — Aura", mana: "{2}{B}", keywords: ["Enchant"],
      oracle: `${extra}Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under your control.` });
    const cards = [same("False Demise"), same("Minion's Return", "Flash\n"), same("Unhallowed Pact")];
    const result = Object.fromEntries(cards.map((c) => [c.name, { native: /^native-/.test(classifyCard(c)), back: names(killHost(c, BEAR, "user").players.user.battlefield) }]));
    expect(result).toEqual({
      "False Demise": { native: true, back: ["Grizzly Bears"] },
      "Minion's Return": { native: true, back: ["Grizzly Bears"] },
      "Unhallowed Pact": { native: true, back: ["Grizzly Bears"] },
    });
    console.log(`WITNESS unplannedCarriers ${JSON.stringify(result)}`);
  });
  it("Shade's Form on your own Bear: the Bear comes back to you", () => {
    const out = killHost(SHADES_FORM, BEAR, "user");
    expect({ bf: names(out.players.user.battlefield), gy: names(out.players.user.graveyard) }).toEqual({ bf: ["Grizzly Bears"], gy: ["Shade's Form"] });
  });
  it("⭐ a STOLEN host (you control it, the AI owns it) dies into its OWNER's graveyard — and still comes back to you", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const auraPerm = perm("aura", SHADES_FORM, "user");
    const stolen = { ...perm("host", GIANT, "user"), owner: "ai" };
    let s = { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [auraPerm, stolen] } } };
    s = attachPermanent(s, { equipId: "aura", targetId: "host" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "host" ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    expect(names(r.state.players.ai.graveyard)).toEqual(["Hill Giant"]);          // it went HOME to its owner's graveyard
    s = flushTriggers(checkDiesTriggers(r.state, r.dead));
    for (let i = 0; i < 12 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s));
    expect({ user: names(s.players.user.battlefield), aiGraveyard: names(s.players.ai.graveyard) }).toEqual({ user: ["Hill Giant"], aiGraveyard: [] });
  });
  it("a TOKEN host ceases to exist and never returns (CR 111.7)", () => {
    const out = killHost(SHADES_FORM, SOLDIER, "user");
    expect(names(out.players.user.battlefield)).toEqual([]);
  });
  it("a card already gone from the graveyard: a clean, logged no-op (CR 608.2b)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const out = applyAttachedDiesReturnYours(s0, { op: "attached-dies-return-bf" }, { controller: "user", triggeringCardId: "c-gone", triggeringController: "ai" });
    expect({ user: out.players.user.battlefield.length, ai: out.players.ai.battlefield.length, logged: (out.log || []).some((e) => e.effect === "attached-dies-return-bf" && e.returned === false) })
      .toEqual({ user: 0, ai: 0, logged: true });
  });
});
