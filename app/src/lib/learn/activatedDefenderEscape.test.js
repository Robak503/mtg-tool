/**
 * activatedDefenderEscape.test.js — the ACTIVATED and TRIGGERED forms of "This creature can attack this
 * turn as though it didn't have defender." (CR 609.4b): Mirror Wall, Returned Phalanx, Wall of One Thousand
 * Cuts, Krotiq Nestguard, Glade Watcher, Hightide Hermit, plus the triggered carriers Skyclave Squid,
 * Steelclad Spirit and Prismari Pledgemage.
 *
 * ⭐ THE STATIC FORM SHIPPED FIRST AND THIS IS ITS ONE-SHOT TWIN. `attacksIgnoringDefender` already exists
 * and is honoured at exactly the two attack-declaration enumeration sites; all that was missing was a way
 * for a one-shot effect to grant it. It rides the ORDINARY PUMP VEHICLE — the same atom every combat trick
 * uses — so the grant lands as a layer-6 addKeyword with the pump's endOfTurn duration and expires at
 * cleanup (CR 514.2) exactly like a granted trample. No new runtime, no new expiry path.
 *
 * ⛔ NOT ROUTED THROUGH parseGrantedKeywords: that helper is an all-or-nothing vocabulary of keyword WORDS,
 * and this is a phrase. Matching it as a phrase is what keeps the keyword vocabulary honest — no
 * pseudo-keyword had to be smuggled into the grantable-word list, where it would have become grantable by
 * any "gains <X>" clause in the corpus.
 *
 * ⓘ FIVE OF THE NINE GAINS WERE THE TRIGGERED FORM, not the activated one ("Landfall — Whenever a land you
 * control enters, this creature can attack this turn …"). Same effect clause, so one matcher served both —
 * which is why the measured yield beat the predicted one.
 *
 * ⛔ THE COMPOUND FORM IS DELIBERATELY REFUSED, and the reason is a false-positive risk, not effort.
 * "{3}: This creature gets +3/-1 until end of turn AND can attack this turn as though it didn't have
 * defender." (Mobile Fort, Walking Wall) is cut by splitClauses into a second, SUBJECTLESS clause:
 * `"can attack this turn as though it didn't have defender"`. Matching that bare phrase as `target:"self"`
 * would be correct here and WRONG the moment the same continuation follows a targeted clause ("Target
 * creature gets +2/+2 and …") — it would silently grant the escape to the wrong permanent. Two cards are
 * not worth that; they wait for proper referent binding.
 *
 * Mutation-checked (2026-08-05, grep-verified as applied AND verified on the case under test): the matcher
 * removed -> the clause parses to an empty program at LOW confidence and every carrier parks; the granted
 * keyword string changed -> the runtime drive shows the Wall still barred from attacking.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { applyPumpEffect } from "./effects/atoms/combat.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MIRROR_WALL = { id: "c-mw", name: "Mirror Wall", type: "Creature — Wall", mana: "{2}{W}",
  power: "3", toughness: "3",
  oracle: "Defender (This creature can't attack.)\n{W}: This creature can attack this turn as though it didn't have defender." };
const SKYCLAVE_SQUID = { id: "c-ss", name: "Skyclave Squid", type: "Creature — Squid", mana: "{2}{U}",
  power: "2", toughness: "4",
  oracle: "Defender\nLandfall — Whenever a land you control enters, this creature can attack this turn as though it didn't have defender." };

describe("the clause parses onto the pump vehicle, and the carriers flip", () => {
  it("⭐ a bare self escape becomes a zero-delta pump carrying the pseudo-keyword", () => {
    const p = parseEffectClause("This creature can attack this turn as though it didn't have defender.", "Creature");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "pump", target: "self", ptDelta: { p: 0, t: 0 }, grantKeywords: ["attacksIgnoringDefender"] }]);
  });

  it("the ACTIVATED and TRIGGERED carriers both flip — one matcher serves both", () => {
    expect(classifyCard(MIRROR_WALL)).toBe("native-activated");
    expect(classifyCard(SKYCLAVE_SQUID)).toBe("native-trigger");
  });

  it("⛔ the compound form still parks — a subjectless continuation must NOT bind to self", () => {
    const p = parseEffectClause("This creature gets +3/-1 until end of turn and can attack this turn as though it didn't have defender.", "Creature");
    expect(p.confidence).toBe("low");
    expect(p.atoms).toEqual([]);
  });
});

describe("⭐ LAW 6 — driven at the real attack gate, and driven through EXPIRY", () => {
  function board() {
    const wall = createPermanent({ id: "wall", card: MIRROR_WALL, controller: "user", summoningSick: false });
    const plain = createPermanent({ id: "plain", card: { id: "ws", name: "Wall of Stone", type: "Creature — Wall", power: "0", toughness: "8", oracle: "Defender" }, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
      combat: { attackers: [], blockers: [] },
      players: { ...g.players, user: { ...g.players.user, battlefield: [wall, plain] } } };
  }
  const canAttack = (s, id) => legalActionsForPlayer(s, "user")
    .filter((a) => a.kind === "declare-attacker").some((a) => a.permanentId === id);

  it("⭐ barred → activate → legal attacker → expires at cleanup, and a plain Wall never budges", () => {
    let s = board();
    const rows = [];
    const read = (label) => rows.push({ at: label,
      hasEscape: permanentHasKeyword(s, "wall", "attacksIgnoringDefender"),
      stillDefender: permanentHasKeyword(s, "wall", "Defender"),
      wallAttacks: canAttack(s, "wall"),
      plainWallAttacks: canAttack(s, "plain") });   // the control: never gains the escape
    read("before");
    // ⛔ THE ATOM IS PARSED FROM THE CARD, NOT HAND-WRITTEN, and that is the whole point of this line.
    // The first version of this drive passed a literal atom — which meant a typo in the PARSER's keyword
    // string left this runtime row green (the mutation proved it: only the parse pin went red). Parser and
    // runtime were each tested and the SEAM BETWEEN THEM was not. Feeding the parsed atom straight into the
    // resolver is what makes one wrong string fail both halves.
    const parsed = parseEffectClause(MIRROR_WALL.oracle.split("\n")[1].replace(/^\{W\}: /, ""), "Creature");
    expect(parsed.atoms).toHaveLength(1);
    s = applyPumpEffect(s, parsed.atoms[0], { sourceId: "wall", controller: "user" });
    read("after-activation");
    // Cleanup: the same expiry sweep the engine runs at end of turn.
    // ⛔ `atCleanupOfTurn` IS REQUIRED. Without it the function short-circuits and KEEPS every endOfTurn
    // effect — the first version of this harness omitted it and the row read "never expires", which looks
    // exactly like a real leak. Pass the turn the grant was created on.
    s = expireContinuousEffects(s, { atCleanupOfTurn: 4 });
    read("next-turn");
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { at: "before", hasEscape: false, stillDefender: true, wallAttacks: false, plainWallAttacks: false },
      // ⛔ stillDefender stays TRUE — CR 609.4b. The escape lifts one restriction, it does not remove the
      // keyword, so Arcades/High Alert and Wall tribal still see a defender.
      { at: "after-activation", hasEscape: true, stillDefender: true, wallAttacks: true, plainWallAttacks: false },
      // ⛔ "THIS TURN" IS REAL: the grant wears off, and the Wall goes back to being barred.
      { at: "next-turn", hasEscape: false, stillDefender: true, wallAttacks: false, plainWallAttacks: false },
    ]);
  });
});
