/**
 * footChopper.test.js — Foot Chopper (shelf decks D24, 2026-09-30: Halfshell heroes). "Whenever equipped creature deals combat
 * damage to a player, you may sacrifice it. If you do, draw cards equal to its power."
 *
 * The chosen-sacrifice payment (shelf D13) with ONE candidate: "it" is the creature that dealt the damage, while its controller
 * still controls it. "its power" is the sacrificed creature's, off the settle's last-known snapshot (CR 608.2h). The referent is
 * the per-creature combat-damage event's alone: the trigger gate refuses "sacrifice it" elsewhere, the spell fence on a spell.
 * The autopilot gives up only a token — Foot Chopper's own Ninja.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the one synthetic spell that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { checkCombatDamageTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { autoPickOptionalSac, resolveOptionalSacChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { combatDamageReferentSatisfied } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CHOPPER = { name: "Foot Chopper", type: "Artifact — Equipment", mana: "{1}{B}", keywords: ["Equip"],
  oracle: "When this Equipment enters, create a 1/1 black Ninja creature token, then attach this Equipment to it.\nEquipped creature has flying.\nWhenever equipped creature deals combat damage to a player, you may sacrifice it. If you do, draw cards equal to its power.\nEquip {2}" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const NINJA_TOKEN = { name: "Ninja", type: "Token Creature — Ninja", mana: "", power: "1", toughness: "1", keywords: [], oracle: "", token: true };

const perm = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
function board(wearer, wearerCard, others = []) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    // The others go FIRST, so "the one candidate is the wearer" is decided by the trigger, not by battlefield order.
    players: { ...g.players, user: { ...g.players.user, battlefield: [...others, perm(wearer, wearerCard, { attachments: ["chopper"] }), perm("chopper", CHOPPER, { attachedTo: wearer })], library: lib } } };
}
/** The wearer connects; resolve to the sacrifice question. */
function connect(s, wearer) {
  let n = flushTriggers(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: wearer, attackingPlayer: "user", defender: "ai", amount: 3 }]), { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while (n.stack?.length && !n.pendingChoice && g++ < 10) n = resolveTopOfStack(n);
  return noCrash(n);
}
/** The engine logs a crashing resolver as a stack-resolve-error rather than throwing — fail loudly instead of passing over one. */
function noCrash(s) {
  const crash = (s.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return s;
}
const drawn = (s) => 4 - s.players.user.library.length;

describe("the card", () => {
  it("parses to the one-candidate sacrifice whose payoff reads the sacrificed power; reads native", () => {
    const d = detectTriggers(CHOPPER).find((x) => x.event === "combatDamageToPlayer");
    const atom = parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms[0];
    expect({ scope: d.scope, atom, tier: classifyCard(CHOPPER) }).toEqual({
      scope: "equippedCreature",
      atom: { op: "optional-sac-payment", subtype: "creature", sacTriggering: true, effectAtoms: [{ op: "draw", amountCount: { kind: "sacrificedPower", per: 1 }, targetType: null }], targetType: null },
      tier: "native-mixed",
    });
  });
});

describe("⭐ in play", () => {
  it("⭐ the Hill Giant wearing it connects: the one candidate is the Giant (not the Bear beside it); sacrificed, three cards", () => {
    const s = connect(board("giant", GIANT, [perm("bear", BEAR)]), "giant");
    const candidates = (s.pendingChoice?.candidates || []).map((c) => c.id);
    const after = noCrash(resolveOptionalSacChoice(s, true, "giant"));
    const row = { kind: s.pendingChoice?.kind, candidates, drew: drawn(after), giantGone: !findPermanent(after, "giant"), bearStays: !!findPermanent(after, "bear") };
    console.log(`WITNESS footChopper ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "optional-sac-payment", candidates: ["giant"], drew: 3, giantGone: true, bearStays: true });
  });
  it("declined, nothing happens", () => {
    const after = noCrash(resolveOptionalSacChoice(connect(board("giant", GIANT), "giant"), false));
    expect({ drew: drawn(after), giantStays: !!findPermanent(after, "giant") }).toEqual({ drew: 0, giantStays: true });
  });
  it("the wearer gone before resolution: no candidate, nothing to sacrifice, no cards", () => {
    let s = flushTriggers(checkCombatDamageTriggers(board("giant", GIANT), [{ kind: "combat-damage-player", attackerId: "giant", attackingPlayer: "user", defender: "ai", amount: 3 }]), { chooseTargets: chooseTriggerTargets });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "giant") } } };
    let g = 0;
    while (s.stack?.length && !s.pendingChoice && g++ < 10) s = resolveTopOfStack(s);
    const after = noCrash(s.pendingChoice ? resolveOptionalSacChoice(s, true, "giant") : s);
    expect({ candidates: (s.pendingChoice?.candidates || []).length, drew: drawn(after) }).toEqual({ candidates: 0, drew: 0 });
  });
  it("the autopilot gives up only a token: its own Ninja yes, the Hill Giant no", () => {
    const ninja = connect(board("ninja", NINJA_TOKEN), "ninja");
    const giant = connect(board("giant", GIANT), "giant");
    expect({ ninja: autoPickOptionalSac(ninja, ninja.pendingChoice), giant: autoPickOptionalSac(giant, giant.pendingChoice) }).toEqual({ ninja: "ninja", giant: false });
  });
});

describe("the referent is the combat-damage creature's alone", () => {
  it("the trigger gate takes \"sacrifice it\" only on the per-creature combat-damage event; a spell carrying it is not native", () => {
    const p = parseEffectClause("you may sacrifice it. If you do, draw cards equal to its power", "Instant", { sourceScoped: true });
    // SYNTHETIC spell — no printed spell parses to this atom; it pins the spell fence (coverage.atomCarriesEventReferent).
    const spell = { name: "Synthetic Spell", type: "Sorcery", mana: "{1}{B}", keywords: [], oracle: "You may sacrifice it. If you do, draw cards equal to its power." };
    expect({ combat: combatDamageReferentSatisfied(p, "combatDamageToPlayer"), attacks: combatDamageReferentSatisfied(p, "attacks"), spellTier: classifyCard(spell) })
      .toEqual({ combat: true, attacks: false, spellTier: expect.not.stringMatching(/^native/) });
  });
});

// ── The same arm reaches three printed cards whose "it" is the creature itself (the flip-diff's unaimed gains) — each in play.
const SHRIKE = { name: "Impaler Shrike", type: "Creature — Phyrexian Bird", mana: "{2}{U}{U}", power: "3", toughness: "1", keywords: ["Flying"], oracle: "Flying\nWhenever this creature deals combat damage to a player, you may sacrifice it. If you do, draw three cards." };
const CADAVER = { name: "Haunted Cadaver", type: "Creature — Zombie", mana: "{3}{B}", power: "2", toughness: "2", keywords: ["Morph"], oracle: "Whenever this creature deals combat damage to a player, you may sacrifice it. If you do, that player discards three cards.\nMorph {1}{B} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" };
const SCAMP = { name: "Cacophony Scamp", type: "Creature — Phyrexian Goblin Warrior", mana: "{R}", power: "1", toughness: "1", keywords: ["Proliferate"], oracle: "Whenever this creature deals combat damage to a player, you may sacrifice it. If you do, proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\nWhen this creature dies, it deals damage equal to its power to any target." };

/** The creature itself connects; sacrifice it; run whatever follows (its own dies trigger included). */
function selfSac(card, others = []) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  let s = { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [...others, perm("me", card)], library: lib }, ai: { ...g.players.ai, hand: [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `h${i}` })) } } };
  s = connect(s, "me");
  s = resolveOptionalSacChoice(s, true, "me");
  let g2 = 0;
  while ((s.stack?.length || s.pendingTriggers?.length) && !s.pendingChoice && g2++ < 10) s = s.stack?.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return noCrash(s);
}

describe("the unaimed gains, in play", () => {
  it("Impaler Shrike sacrificed after it connects: three cards", () => {
    const s = selfSac(SHRIKE);
    expect({ tier: classifyCard(SHRIKE), drew: drawn(s), gone: !findPermanent(s, "me") }).toEqual({ tier: "native-trigger", drew: 3, gone: true });
  });
  it("Haunted Cadaver sacrificed: THAT player — the one it hit — is asked to discard three", () => {
    const s = selfSac(CADAVER);
    expect({ tier: classifyCard(CADAVER), kind: s.pendingChoice?.kind, who: s.pendingChoice?.controller, remaining: s.pendingChoice?.remaining }).toEqual({ tier: "native-trigger", kind: "discard", who: "ai", remaining: 3 });
  });
  it("Cacophony Scamp sacrificed: it proliferates (your Bear's counter grows), then its own dies trigger deals its power", () => {
    const s = selfSac(SCAMP, [perm("bear", BEAR, { counters: { "+1/+1": 1 } })]);
    expect({ tier: classifyCard(SCAMP), bear: findPermanent(s, "bear")?.permanent.counters?.["+1/+1"], aiLife: s.players.ai.life }).toEqual({ tier: "native-trigger", bear: 2, aiLife: 39 });
  });
});
