/**
 * jasonBright.test.js — Jason Bright, Glowing Prophet (SHELF S7): three seams.
 *
 *   1. SUBTYPE-UNION dies watcher — "Whenever a Zombie or Mutant you control dies" reuses parseSubtypeList
 *      (array filter; subtypeFilterMatches checks ANY member), the Spawning-Kraken pattern on the dies event.
 *   2. POWER-DIFFERED intervening-if (CR 603.4 + 603.6e) — "if its power was different from its base power"
 *      compares the death look-back's EFFECTIVE power (counters/anthems/pumps) against its BASE power
 *      (printed / layer-7b set, CR 613.4a); both captured pre-move at ALL five death constructors and
 *      stamped as ctx.triggeringPowerDifferedFromBase.
 *   3. ACTIVATED ability-word label (CR 207.2c) — "Come Fly With Me — {2}, Sacrifice a creature: …" strips
 *      ONLY when no "(Activate …)" reminder rides the raw line: Boast (CR 702.142a), Exhaust and Power-up
 *      are RULES-BEARING dash-keywords whose restrictions live in that reminder — they must stay parked
 *      (a spammable free activation is the cardinal FP).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, addCounter } from "./gameState.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const JASON_ORACLE =
  "Whenever a Zombie or Mutant you control dies, if its power was different from its base power, draw a card.\nCome Fly With Me — {2}, Sacrifice a creature: Put a +1/+1 counter on target creature you control. It gains flying until end of turn.";
const jasonCard = (id = "jb-card") => ({
  id, name: "Jason Bright, Glowing Prophet", type: "Legendary Creature — Zombie Mutant Advisor",
  power: "2", toughness: "3", mana: "{2}{U}", oracle: JASON_ORACLE,
});
const USHER_ORACLE = // Boast — the restriction lives ONLY in the reminder (CR 702.142a)
  "Boast — {1}{W}: Create a 1/1 white Human Warrior creature token. (Activate only if this creature attacked this turn and only once each turn.)";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
function markLethal(state, pid, permId) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid],
    battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}
const zombie = (id, controller = "user") =>
  createPermanent({ id, card: { name: id, type: "Creature — Zombie", power: "2", toughness: "2", oracle: "" }, controller });

describe("detection + routing + classify", () => {
  it("the union dies watcher detects with an ARRAY subtype filter and routes natively", () => {
    const [d] = detectTriggers(jasonCard()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "subtypeYouControl", subtypeFilter: ["Zombie", "Mutant"], interveningIf: "its power was different from its base power" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });
  it("Jason Bright → native-mixed (dies watcher + the labeled counter/flying activated ability)", () => {
    expect(classifyCard(jasonCard())).toBe("native-mixed");
  });
});

describe("POWER-DIFFERED intervening-if (CR 603.6e LKI)", () => {
  it("is parseable; evaluates off the context flag; null without a snapshot (FN-safe)", () => {
    expect(interveningIfParseable("its power was different from its base power")).toBe(true);
    const s = baseState();
    expect(evaluateInterveningIf(s, "its power was different from its base power", "user", { triggeringPowerDifferedFromBase: true })).toBe(true);
    expect(evaluateInterveningIf(s, "its power was different from its base power", "user", { triggeringPowerDifferedFromBase: false })).toBe(false);
    expect(evaluateInterveningIf(s, "its power was different from its base power", "user", {})).toBeNull();
  });

  it("engine: a COUNTERED Zombie dying draws Jason's controller a card; an unmodified one does not", () => {
    let s = baseState();
    const jason = createPermanent({ id: "jb", card: jasonCard(), controller: "user" });
    s = withBattlefield(s, "user", [jason, zombie("z1"), zombie("z2")]);
    s = addCounter(s, { permanentId: "z1", type: "+1/+1", amount: 1 }); // power 3 ≠ base 2
    // give the library something to draw
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "lib1", name: "Card A", type: "Instant", oracle: "" }, { id: "lib2", name: "Card B", type: "Instant", oracle: "" }] } } };

    // modified Zombie dies → draw fires
    let lethal = destroyLethalCreatures(markLethal(s, "user", "z1"));
    expect(lethal.dead[0]).toMatchObject({ power: 3, basePower: 2 });
    let after = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(after.players.user.hand.map((c) => c.name)).toContain("Card A");

    // unmodified Zombie dies → the intervening-if is false → no draw
    lethal = destroyLethalCreatures(markLethal(after, "user", "z2"));
    expect(lethal.dead[0]).toMatchObject({ power: 2, basePower: 2 });
    const handBefore = lethal.state.players.user.hand.length;
    after = resolveAll(checkDiesTriggers(lethal.state, lethal.dead));
    expect(after.players.user.hand.length).toBe(handBefore);
  });

  it("a HUMAN dying never fires the union watcher (subtype gate)", () => {
    let s = baseState();
    const jason = createPermanent({ id: "jb", card: jasonCard(), controller: "user" });
    const human = createPermanent({ id: "h1", card: { name: "Villager", type: "Creature — Human", power: "1", toughness: "1", oracle: "" }, controller: "user" });
    s = withBattlefield(s, "user", [jason, human]);
    s = addCounter(s, { permanentId: "h1", type: "+1/+1", amount: 1 });
    const lethal = destroyLethalCreatures(markLethal(s, "user", "h1"));
    const after = checkDiesTriggers(lethal.state, lethal.dead);
    expect((after.pendingTriggers || []).filter((t) => t.event === "dies")).toHaveLength(0);
  });
});

describe("ACTIVATED ability-word label (CR 207.2c) — flavor strips; a rules-bearing keyword strips ONLY once enforced", () => {
  // The rule is unchanged: a label may only be stripped when nothing in its reminder is left unmodeled.
  // BOAST graduated on 2026-07-28 by having its reminder ENFORCED, not by relaxing the bar.
  it("Jason's labeled ability is modeled (counter-then-grant + sac cost)", () => {
    const abs = parseActivatedAbilities(jasonCard());
    expect(abs).toHaveLength(1);
    expect(abs[0].modeled).toBe(true);
    expect(abs[0].costStr.toLowerCase()).not.toContain("come fly with me");
  });
  it("BOAST — PIN SATISFIED 2026-07-28: the label strips now BECAUSE both halves of its reminder are enforced", () => {
    // THIS PIN DID ITS JOB. Its bar was precise: a "(Activate …)" reminder marks a RULES-BEARING keyword,
    // so stripping the label and treating the line as a plain ability would produce "a spammable free
    // activation" — its own words. Correct, and it fired the moment boast started parsing.
    //
    // The bar is now MET, and met by enforcing rather than by stripping harder. Boast is an ability word
    // (CR 207.2c) whose whole rule lives in that reminder, and BOTH halves are now real:
    //   • "only if THIS CREATURE attacked this turn" -> a PER-PERMANENT flag stamped at the declare-attacker
    //     chokepoint and cleared at untap, checked by the offer gate. Deliberately not the seat-level Raid
    //     flag, which would offer boast whenever ANY creature attacked — a materially stronger card.
    //   • "only once each turn" -> the existing activationLimit ledger, not a second mechanism.
    // The spammable activation the pin guarded against is therefore impossible. See boastKeyword.test.js,
    // whose load-bearing case asserts boast is NOT offered when a DIFFERENT creature attacked; mutate the
    // gate to read the seat flag and it fails immediately.
    const usher = { id: "uf", name: "Usher of the Fallen", type: "Creature — Spirit Warrior", power: "2", toughness: "1", oracle: USHER_ORACLE };
    const abs = parseActivatedAbilities(usher);
    const boast = abs.find((a) => a.boast);
    expect(boast).toBeTruthy();
    expect(boast.modeled).toBe(true);
    expect(boast.activationLimit).toBe(1);           // the once-each-turn half, enforced
    expect(boast.costStr.toLowerCase()).not.toContain("boast");
    expect(classifyCard(usher)).toMatch(/^native/);
  });
});
