/**
 * fblthp.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Fblthp, the Lost (Kellan); four twins audited.
 *
 *   "When Fblthp enters, draw a card. If it entered from your library or was cast from your library, draw two cards instead.
 *    When Fblthp becomes the target of a spell, shuffle Fblthp into its owner's library."
 *
 * Four pieces. The ETB: a draw with an amountUpgrade whose condition reads the entering permanent's two zone stamps —
 * `castFromZone` (the cast lane's, "library" for the play-from-top lane) and the new `enteredFromZone` (enterCardFromZone's,
 * for a put-onto-battlefield). The second trigger: a STANDALONE becomes-target-of-a-spell self event (its own name, fired
 * only at the targeting site beside the Kira-class compound, never at attack declaration), and the object-position
 * self-name rewrite so "shuffle Fblthp into…" reads "shuffle this creature into…". The atom: shuffle-self-into-library —
 * the source permanent, or (the dies-trigger twins) the source CARD found in a graveyard, joins its owner's library.
 *
 * Twins: Angel of Fury / Cavalier of Gales / Alabaster Dragon (dies → shuffle it in; the graveyard form), Livewire Lash
 * (the granted "Whenever this creature becomes the target of a spell" on the equipped creature).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { detectTriggers, checkEnterTriggers, checkDiesTriggers, checkBecomesTargetTriggers } from "./triggers.js";
import { enterCardFromZone } from "./effects/atoms/zones.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FBLTHP = { id: "c-fb", name: "Fblthp, the Lost", type: "Legendary Creature — Homunculus", mana: "{1}{U}", keywords: [], power: 1, toughness: 1,
  oracle: "When Fblthp enters, draw a card. If it entered from your library or was cast from your library, draw two cards instead.\nWhen Fblthp becomes the target of a spell, shuffle Fblthp into its owner's library." };
const DRAGON = { id: "c-ad", name: "Alabaster Dragon", type: "Creature — Dragon", mana: "{4}{W}{W}", keywords: ["Flying"], power: 4, toughness: 4, oracle: "Flying\nWhen this creature dies, shuffle it into its owner's library." };
const ANGEL = { id: "c-af", name: "Angel of Fury", type: "Creature — Angel", mana: "{4}{W}{W}", keywords: ["Flying"], power: 3, toughness: 5, oracle: "Flying\nWhen this creature dies, you may shuffle it into its owner's library." };
const CAVALIER = { id: "c-cg", name: "Cavalier of Gales", type: "Creature — Elemental Knight", mana: "{2}{U}{U}{U}", keywords: ["Flying"], power: 5, toughness: 5, oracle: "Flying\nWhen this creature enters, draw three cards, then put two cards from your hand on top of your library in any order.\nWhen this creature dies, shuffle it into its owner's library, then scry 2." };
const LASH = { id: "c-ll", name: "Livewire Lash", type: "Artifact — Equipment", mana: "{2}", keywords: [], oracle: "Equipped creature gets +2/+0 and has \"Whenever this creature becomes the target of a spell, this creature deals 2 damage to any target.\"\nEquip {2}" };
const filler = (id) => ({ id, name: "Filler " + id, type: "Creature — Bear", oracle: "", power: 1, toughness: 1 });
const lib = (n, tag) => Array.from({ length: n }, (_, i) => filler(tag + i));
const COND = "it entered from your library or was cast from your library";

const base = () => {
  let s = createGameState({ userDeck: lib(8, "u"), aiDeck: lib(8, "a") });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5 };
};
const settle = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };
const enterWith = (s, perm) => {
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, perm] } } };
  return settle(flushTriggers(checkEnterTriggers(s, perm)));
};

describe("parse", () => {
  it("both triggers detect and both effects parse high", () => {
    const t = detectTriggers(FBLTHP);
    expect(t.map((x) => x.event)).toEqual(["etb", "becomesTargetOfSpell"]);
    const etb = parseEffectClause(t[0].effectClause, "Creature");
    expect(programConfidence(etb)).toBe("high");
    expect(etb.atoms).toEqual([{ op: "draw", amount: 1, targetType: null, amountUpgrade: { condition: COND, amount: 2 } }]);
    expect(parseEffectClause(t[1].effectClause, "Creature").atoms).toEqual([{ op: "shuffle-self-into-library", targetType: null }]);
    // The compound Kira form is untouched; "another creature you control becomes the target" (Monk Gyatso) stays undetected.
    expect(detectTriggers({ ...FBLTHP, oracle: "Whenever another creature you control becomes the target of a spell or ability, draw a card." })).toEqual([]);
  });
});

describe("runtime — the ETB and its condition", () => {
  it("cast from hand: draws 1; cast from the library top or put in from the library: draws 2", () => {
    const hand = createPermanent({ id: "F", card: FBLTHP, controller: "user" });
    expect(evaluateInterveningIf({ ...base(), players: { ...base().players, user: { ...base().players.user, battlefield: [{ ...hand, castFromZone: "hand", wasCast: true }] } } }, COND, "user", { triggeringPermanentId: "F" })).toBe(false);
    expect(evaluateInterveningIf({ ...base(), players: { ...base().players, user: { ...base().players.user, battlefield: [{ ...hand, castFromZone: "library", wasCast: true }] } } }, COND, "user", { triggeringPermanentId: "F" })).toBe(true);
    let s = base();
    const before = s.players.user.hand.length;
    s = enterWith(s, { ...hand, castFromZone: "hand", wasCast: true });
    expect(s.players.user.hand.length - before).toBe(1);
    let t = base();
    const tBefore = t.players.user.hand.length;
    t = enterWith(t, { ...createPermanent({ id: "F2", card: { ...FBLTHP, id: "c-fb2" }, controller: "user" }), castFromZone: "library", wasCast: true });
    expect(t.players.user.hand.length - tBefore).toBe(2);
    // enterCardFromZone stamps the source zone: a Fblthp put onto the battlefield from the library reads true.
    let u = base();
    u = { ...u, players: { ...u.players, user: { ...u.players.user, library: [{ ...FBLTHP, id: "c-fb3" }, ...u.players.user.library] } } };
    const r = enterCardFromZone(u, { playerId: "user", cardId: "c-fb3", fromZone: "library" });
    const entered = r.state.players.user.battlefield.find((p) => p.card.id === "c-fb3");
    expect(entered.enteredFromZone).toBe("library");
    expect(evaluateInterveningIf(r.state, COND, "user", { triggeringPermanentId: entered.id })).toBe(true);
  });
});

describe("runtime — becomes the target, and the shuffle-in", () => {
  it("an opponent's spell targeting Fblthp fires the standalone event; resolving shuffles Fblthp into its owner's library", () => {
    let s = base();
    const fb = createPermanent({ id: "F", card: FBLTHP, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [fb] } } };
    const libBefore = s.players.user.library.length;
    const fired = checkBecomesTargetTriggers(s, { kind: "spell", controller: "ai", source: { name: "Shock" }, targets: [{ id: "F", type: "creature" }] });
    expect((fired.pendingTriggers || []).some((t) => t.source?.name === "Fblthp, the Lost")).toBe(true);
    // An ABILITY targeting Fblthp never fires it (the printed "of a spell") — the spell-only gate at the chokepoint.
    const abil = checkBecomesTargetTriggers(s, { kind: "ability", controller: "ai", source: { name: "Some Ability" }, targets: [{ id: "F", type: "creature" }] });
    expect((abil.pendingTriggers || []).some((t) => t.source?.name === "Fblthp, the Lost")).toBe(false);
    s = settle(flushTriggers(fired));
    expect(s.players.user.battlefield.some((p) => p.id === "F")).toBe(false);
    expect(s.players.user.library.length).toBe(libBefore + 1);
    expect(s.players.user.library.some((c) => c.id === "c-fb")).toBe(true);
    expect(s.players.user.graveyard.some((c) => c.id === "c-fb")).toBe(false);
  });
  it("the dies form (Alabaster Dragon): the card leaves the graveyard for the library", () => {
    let s = base();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [DRAGON] } } };
    const libBefore = s.players.user.library.length;
    s = ATOM_RESOLVERS["shuffle-self-into-library"](s, { op: "shuffle-self-into-library" }, { controller: "user", sourceId: "gone", sourceCardId: "c-ad" });
    expect(s.players.user.graveyard.some((c) => c.id === "c-ad")).toBe(false);
    expect(s.players.user.library.length).toBe(libBefore + 1);
    // nowhere at all → a logged no-op, never a throw
    const n = ATOM_RESOLVERS["shuffle-self-into-library"](s, { op: "shuffle-self-into-library" }, { controller: "user", sourceId: "gone", sourceCardId: "nope" });
    expect(n.players.user.library.length).toBe(libBefore + 1);
    // a NON-self dies watcher (the triggering permanent is not the source) never shuffles the OTHER creature's card
    const other = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ ...DRAGON, id: "c-other" }] } } };
    const o = ATOM_RESOLVERS["shuffle-self-into-library"](other, { op: "shuffle-self-into-library" }, { controller: "user", sourceId: "gone", triggeringPermanentId: "X", triggeringCardId: "c-other" });
    expect(o.players.user.graveyard.some((c) => c.id === "c-other")).toBe(true);
    expect(o.players.user.library.length).toBe(libBefore + 1);
  });
  it("the dies trigger end to end: Alabaster Dragon dying shuffles itself in", () => {
    let s = base();
    const d = createPermanent({ id: "D", card: DRAGON, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [d] } } };
    const libBefore = s.players.user.library.length;
    // lethal damage → the SBA moves it to the graveyard and hands back the dead list the dies pass expects
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...d, damageMarked: 4 }] } } };
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.length).toBe(1);
    expect(lethal.state.players.user.graveyard.some((c) => c.id === "c-ad")).toBe(true);
    const fired = checkDiesTriggers(lethal.state, lethal.dead);
    expect((fired.pendingTriggers || []).some((t) => t.source?.name === "Alabaster Dragon")).toBe(true);
    s = settle(flushTriggers(fired));
    expect(s.players.user.graveyard.some((c) => c.id === "c-ad")).toBe(false);
    expect(s.players.user.library.length).toBe(libBefore + 1);
  });
});

describe("classifier", () => {
  it("Fblthp and the four twins", () => {
    expect(classifyCard(FBLTHP)).toBe("native-trigger");
    expect(classifyCard(DRAGON)).toBe("native-trigger");
    expect(classifyCard(ANGEL)).toBe("native-trigger");
    expect(classifyCard(CAVALIER)).toBe("native-trigger");
    expect(classifyCard(LASH)).toBe("native-trigger");
  });
});
