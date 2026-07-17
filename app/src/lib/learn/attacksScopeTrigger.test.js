/**
 * attacksScopeTrigger.test.js — BLITZ AT-1: the NON-self attacker-scoped attacks trigger.
 *
 * Two detection anchors added to classifyCondition's attacks block, both routing to scopes the runtime
 * (checkAttackTriggers + scopeMatches) and the non-self pronoun rewrite (TRIG-PRONOUN-IT) ALREADY handle:
 *
 *   (1) "Whenever ANOTHER creature you control attacks, <effect>"  → scope otherCreatureYouControl
 *         Glory Bearers ("it gets +0/+1 …"), Stonehoof Chieftain ("it gains trample and indestructible …").
 *         Fires for every OTHER creature the attacking player declares, NEVER the source's own attack
 *         (the scope's id check). CR 508.3a (the attacks event) + CR 608.2c ("it" = the triggering attacker).
 *
 *   (2) "Whenever a creature you control WITH <combat-kw> attacks, <effect>" → scope creatureYouControlKeyword
 *         Stonebrow ("with trample" → it gets +2/+2), Ognis ("with haste" → create a tapped Treasure).
 *         Reuses the EXACT ETB keyword-filter vocabulary (parseEtbKeywordFilter → FILTERABLE_ETB_KEYWORDS,
 *         permanentHasKeyword-checkable). Fires for every attacker with the keyword, INCLUDING the source
 *         itself when it carries the keyword ("a creature you control" includes the source).
 *
 * The payoff atoms already existed (pump / keyword-grant → target:"thatCreature"; create-named-token); the
 * gap was purely the missing detection anchor. CREED boundaries pinned: an inexpressible quality ("with toxic"
 * / "with a +1/+1 counter on it"), a LOW payoff (Shadow Puppeteers "become a red Dragon"), an "attacks alone"
 * restriction, and a second unmodeled ability (Hooded Blightfang) all keep the card off native (safe FN).
 *
 * Recognition tests use REAL bundled oracle text (verified via cardIndex.lookupCard, 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Real bundled oracle (probed via cardIndex.lookupCard, 2026-07-17) ─────────────────────────────
const GLORY_BEARERS = { name: "Glory Bearers", type: "Enchantment Creature — Human Cleric", power: 2, toughness: 2,
  oracle: "Whenever another creature you control attacks, it gets +0/+1 until end of turn." };
const STONEHOOF = { name: "Stonehoof Chieftain", type: "Creature — Centaur Warrior", power: 6, toughness: 6,
  oracle: "Trample, indestructible\nWhenever another creature you control attacks, it gains trample and indestructible until end of turn." };
const STONEBROW = { name: "Stonebrow, Krosan Hero", type: "Legendary Creature — Centaur Warrior", power: 5, toughness: 4,
  oracle: "Trample\nWhenever a creature you control with trample attacks, it gets +2/+2 until end of turn." };
const OGNIS = { name: "Ognis, the Dragon's Lash", type: "Legendary Creature — Lizard Warrior", power: 3, toughness: 3,
  oracle: "Haste\nWhenever a creature you control with haste attacks, create a tapped Treasure token." };
// FN-guard cards (real oracle):
const SLAUGHTER_SINGER = { name: "Slaughter Singer", type: "Creature — Phyrexian Cleric", power: 4, toughness: 3,
  oracle: "Toxic 2 (Players dealt combat damage by this creature also get two poison counters.)\nWhenever another creature you control with toxic attacks, it gets +1/+1 until end of turn." };
const SHADOW_PUPPETEERS = { name: "Shadow Puppeteers", type: "Creature — Faerie", power: 2, toughness: 2,
  oracle: "Flying, ward {2}\nWhen this creature enters, create two 1/1 black Faerie Rogue creature tokens with flying.\nWhenever a creature you control with flying attacks, you may have it become a red Dragon with base power and toughness 4/4 in addition to its other colors and types until end of turn." };
const ARAHBO = { name: "Arahbo, Roar of the World", type: "Legendary Creature — Cat Avatar", power: 7, toughness: 7,
  oracle: "Eminence — At the beginning of combat on your turn, if Arahbo is in the command zone or on the battlefield, another target Cat you control gets +3/+3 until end of turn.\nWhenever another Cat you control attacks, you may pay {1}{G}{W}. If you do, it gains trample and gets +X/+X until end of turn, where X is its power." };
const HOODED_BLIGHTFANG = { name: "Hooded Blightfang", type: "Creature — Snake", power: 1, toughness: 4,
  oracle: "Deathtouch\nWhenever a creature you control with deathtouch attacks, each opponent loses 1 life and you gain 1 life.\nWhenever a creature you control with deathtouch deals damage to a planeswalker, destroy that planeswalker." };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(userPerms, over = {}) {
  const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", ...over };
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userPerms } } };
}
const userBoard = (s) => s.players.user.battlefield;
const mintedTokens = (s) => userBoard(s).filter((p) => p.card?.token);
const attacking = (id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" });

describe("BLITZ AT-1 — detection (coverage)", () => {
  it("Glory Bearers → attacks/otherCreatureYouControl, routing natively → native-trigger", () => {
    const d = detectTriggers(GLORY_BEARERS);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "otherCreatureYouControl" });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(GLORY_BEARERS)).toBe("native-trigger");
  });

  it("Stonehoof Chieftain → attacks/otherCreatureYouControl (keyword grant) → native-trigger", () => {
    const d = detectTriggers(STONEHOOF);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "otherCreatureYouControl" });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(STONEHOOF)).toBe("native-trigger");
  });

  it("Stonebrow → attacks/creatureYouControlKeyword with keywordFilter 'trample' → native-trigger", () => {
    const d = detectTriggers(STONEBROW);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "creatureYouControlKeyword", keywordFilter: "trample" });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(STONEBROW)).toBe("native-trigger");
  });

  it("Ognis → attacks/creatureYouControlKeyword with keywordFilter 'haste' → native-trigger", () => {
    const d = detectTriggers(OGNIS);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "creatureYouControlKeyword", keywordFilter: "haste" });
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
    expect(classifyCard(OGNIS)).toBe("native-trigger");
  });
});

describe("BLITZ AT-1 — CREED / false-negative guards", () => {
  it("'with toxic' (inexpressible) + 'another' → attack trigger undetected → body-only (Slaughter Singer)", () => {
    // "another creature you control with toxic attacks": toxic ∉ FILTERABLE_ETB_KEYWORDS AND the "another…with"
    // shape matches neither anchor → no attack descriptor → the pump payoff is never reached → parked.
    const d = detectTriggers(SLAUGHTER_SINGER);
    expect(d.some((x) => /attacks/.test(String(x.event)))).toBe(false);
    expect(classifyCard(SLAUGHTER_SINGER)).toBe("body-only");
  });

  it("keyword-filter attacks with a LOW payoff stays off native (Shadow Puppeteers 'become a red Dragon')", () => {
    // The event DETECTS (creatureYouControlKeyword, flying) but the payoff parses LOW → triggerRoutesNatively
    // false → the whole card stays body-only (a safe false-negative, never a dropped-clause over-fire).
    const d = detectTriggers(SHADOW_PUPPETEERS);
    const atk = d.find((x) => x.scope === "creatureYouControlKeyword");
    expect(atk).toBeTruthy();
    expect(!!triggerRoutesNatively(atk)).toBe(false);
    expect(classifyCard(SHADOW_PUPPETEERS)).toBe("body-only");
  });

  it("'another <Subtype> you control attacks' + pay-mana + dynamic X stays parked (Arahbo)", () => {
    expect(classifyCard(ARAHBO)).toBe("body-only");
  });

  it("whole-card law: attack trigger routes but a SECOND unmodeled ability keeps the card body-only (Hooded Blightfang)", () => {
    const d = detectTriggers(HOODED_BLIGHTFANG);
    const atk = d.find((x) => x.scope === "creatureYouControlKeyword" && x.event === "attacks");
    expect(atk).toBeTruthy();
    expect(!!triggerRoutesNatively(atk)).toBe(true);       // the attack half is faithfully modeled…
    expect(classifyCard(HOODED_BLIGHTFANG)).toBe("body-only"); // …but "deals damage to a planeswalker" is not
  });

  it("'attacks alone' restriction (no sole-attacker system) stays undetected even with a keyword subject", () => {
    const card = { name: "Synth", type: "Creature — Beast", power: 2, toughness: 2,
      oracle: "Whenever a creature you control with trample attacks alone, it gets +2/+2 until end of turn." };
    expect(detectTriggers(card).some((x) => /attacks/.test(String(x.event)))).toBe(false);
  });

  it("scope-inexpressible 'with a +1/+1 counter on it attacks' stays undetected (never an over-fire)", () => {
    const card = { name: "Synth", type: "Creature — Beast", power: 2, toughness: 2,
      oracle: "Whenever a creature you control with a +1/+1 counter on it attacks, draw a card." };
    expect(detectTriggers(card).some((x) => /attacks/.test(String(x.event)))).toBe(false);
  });
});

describe("BLITZ AT-1 — runtime: otherCreatureYouControl (checkAttackTriggers)", () => {
  it("ANOTHER creature attacking fires Glory Bearers → that attacker gets +0/+1 until end of turn", () => {
    const glory = permObj(GLORY_BEARERS, "user", "glory");
    const ally = permObj({ name: "Ally", type: "Creature — Soldier", power: 2, toughness: 2, oracle: "" }, "user", "ally");
    const s = { ...stateWith([glory, ally]), combat: { attackers: [attacking("ally")] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentToughness(resolved, "ally")).toBe(3);   // +0/+1 on the TRIGGERING attacker
    expect(permanentPower(resolved, "ally")).toBe(2);
    expect(permanentToughness(resolved, "glory")).toBe(2);  // never the source
  });

  it("the SOURCE's OWN attack does NOT fire an 'another creature' trigger (the id-check)", () => {
    const glory = permObj(GLORY_BEARERS, "user", "glory");
    const s = { ...stateWith([glory]), combat: { attackers: [attacking("glory")] } };
    expect((checkAttackTriggers(s).pendingTriggers || []).length).toBe(0);
  });

  it("Stonehoof grants trample + indestructible to another attacking creature", () => {
    const chief = permObj(STONEHOOF, "user", "chief");
    const ally = permObj({ name: "Ally", type: "Creature — Soldier", power: 2, toughness: 2, oracle: "" }, "user", "ally");
    const s = { ...stateWith([chief, ally]), combat: { attackers: [attacking("ally")] } };
    const resolved = resolveTopOfStack(flushTriggers(checkAttackTriggers(s)));
    expect(permanentHasKeyword(resolved, "ally", "Trample")).toBe(true);
    expect(permanentHasKeyword(resolved, "ally", "Indestructible")).toBe(true);
  });
});

describe("BLITZ AT-1 — runtime: creatureYouControlKeyword (checkAttackTriggers)", () => {
  it("a creature WITH trample attacking fires Stonebrow → it gets +2/+2", () => {
    const stonebrow = permObj(STONEBROW, "user", "stonebrow");
    const trampler = permObj({ name: "Trampler", type: "Creature — Beast", power: 3, toughness: 3, oracle: "Trample" }, "user", "trampler");
    const s = { ...stateWith([stonebrow, trampler]), combat: { attackers: [attacking("trampler")] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentPower(resolved, "trampler")).toBe(5);
    expect(permanentToughness(resolved, "trampler")).toBe(5);
  });

  it("the SOURCE itself (it HAS trample) attacking DOES fire — 'a creature you control' includes the source", () => {
    const stonebrow = permObj(STONEBROW, "user", "stonebrow");
    const s = { ...stateWith([stonebrow]), combat: { attackers: [attacking("stonebrow")] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentPower(resolved, "stonebrow")).toBe(7);  // 5 + 2
  });

  it("a creature WITHOUT the keyword attacking does NOT fire (permanentHasKeyword gate)", () => {
    const stonebrow = permObj(STONEBROW, "user", "stonebrow");
    const vanilla = permObj({ name: "Vanilla", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "vanilla");
    const s = { ...stateWith([stonebrow, vanilla]), combat: { attackers: [attacking("vanilla")] } };
    expect((checkAttackTriggers(s).pendingTriggers || []).length).toBe(0);
  });

  it("Ognis: a haste creature attacking creates a tapped Treasure token", () => {
    const ognis = permObj(OGNIS, "user", "ognis");
    const hasty = permObj({ name: "Hasty", type: "Creature — Lizard", power: 2, toughness: 2, oracle: "Haste" }, "user", "hasty");
    const s = { ...stateWith([ognis, hasty]), combat: { attackers: [attacking("hasty")] } };
    const fired = checkAttackTriggers(s);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    const tokens = mintedTokens(resolved);
    expect(tokens).toHaveLength(1);
    expect(/Treasure/.test(tokens[0].card?.type || "")).toBe(true);
    expect(tokens[0].tapped).toBe(true);
  });
});
