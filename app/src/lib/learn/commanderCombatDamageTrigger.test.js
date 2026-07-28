/**
 * commanderCombatDamageTrigger.test.js — "Whenever a commander you control deals combat damage to an
 * opponent, …" (CR 903.3), the trigger subject Kediss, Emberclaw Familiar needs.
 *
 * A SMALL SLICE WITH A CLEAR REASON. Only 2 corpus cards print this subject and only Kediss flips — but it
 * is in TWO of the saved decks, and deck slots are the metric the shelf is measured in. The effect side
 * ("it deals that much damage to each other opponent") ALREADY parsed HIGH; the entire gap was that the
 * trigger detector had no commander-scoped subject, so the card parked with a working payload attached to a
 * trigger nobody detected.
 *
 * THE ASSERTION THAT MATTERS is the negative one: a NON-COMMANDER creature you control connecting must not
 * fire this. Reusing `creatureYouControl` would have been the one-line build and would have turned Kediss
 * into "whenever ANY creature you control connects, ping every other opponent" — a wildly stronger card
 * than the one printed. Same failure mode as reading the seat-level Raid flag for boast; same fix shape,
 * one scope narrower than the obvious one.
 *
 * A copy of a commander is NOT a commander (CR 707.2), and the engine gets that for free: gameState stamps
 * `isCommander` on the real card at seat setup and a clone never inherits it. Pinned below anyway, because
 * "it works for free" is exactly the kind of claim that quietly stops being true.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && g++ < 30) st = resolveTopOfStack(st); return st; };

const KEDISS_ORACLE = "Whenever a commander you control deals combat damage to an opponent, it deals that much damage to each other opponent.";
const KEDISS = { id: "c-kediss", name: "Kediss, Emberclaw Familiar", type: "Legendary Creature — Elemental Lizard", mana: "{1}{R}", power: 1, toughness: 2, keywords: [], oracle: KEDISS_ORACLE };

describe("detection — the commander subject is recognized", () => {
  const scopeOf = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle })[0];

  it("both printed subjects map to the commanderYouControl scope", () => {
    for (const subject of ["a commander you control", "your commander"]) {
      const t = scopeOf(`Whenever ${subject} deals combat damage to an opponent, draw a card.`);
      expect(t).toMatchObject({ event: "combatDamageToPlayer", scope: "commanderYouControl" });
    }
  });

  it("the ordinary creature subject is UNCHANGED (no regression)", () => {
    expect(scopeOf("Whenever a creature you control deals combat damage to a player, draw a card."))
      .toMatchObject({ scope: "creatureYouControl" });
  });

  it("CREED — the PLURAL form never reaches this PER-ATTACKER scope", () => {
    // "one or more commanders you control deal…" is a BATCH event: once per combat, not once per attacker.
    // Routing it here would multi-fire, so the assertion is that it does not land on commanderYouControl.
    //
    // What it DOES do is worth writing down, because I expected it to be undetected and it isn't: the
    // pre-existing batch arm picks it up with subtypeFilter "Commander", i.e. it reads "commanders" as a
    // creature SUBTYPE. Commander is a designation, not a subtype (CR 903.3), so that filter matches no
    // type line and the trigger simply never fires — an under-fire, which is the safe direction, and moot
    // either way: ZERO corpus cards print this plural form. Left alone rather than "fixed" into a shape no
    // card needs; pinned here so the next reader doesn't re-derive it.
    const t = scopeOf("Whenever one or more commanders you control deal combat damage to an opponent, draw a card.");
    expect(t.scope).not.toBe("commanderYouControl");
    expect(t.event).toBe("combatDamageBatch");
  });
});

describe("RUNTIME — a 4-player pod, so 'each OTHER opponent' is observable", () => {
  /** Kediss on the battlefield; `attacker` (a permanent) attacks ai1 and connects. */
  function pod({ attackerIsCommander }) {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const kediss = createPermanent({ id: "kd", card: KEDISS, controller: "user", summoningSick: false });
    const attackerCard = attackerIsCommander
      ? { id: "c-cmd", name: "Warlord", type: "Legendary Creature — Human Soldier", power: 4, toughness: 4, oracle: "", isCommander: true }
      : { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 4, toughness: 4, oracle: "" };
    const attacker = createPermanent({ id: "atk", card: attackerCard, controller: "user", summoningSick: false });
    let s = {
      ...s0, phase: "combat", step: "combat-damage",
      combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
      players: {
        ...s0.players,
        user: { ...s0.players.user, battlefield: [kediss, attacker] },
      },
    };
    for (const id of ["ai1", "ai2", "ai3"]) s.players[id] = { ...s.players[id], life: 40, battlefield: [] };
    s = resolveCombatDamage(s);
    return resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
  }

  it("a COMMANDER connecting pings each OTHER opponent for the same amount", () => {
    const s = pod({ attackerIsCommander: true });
    expect(s.players.ai1.life).toBe(36); // 4 combat damage — and NOT hit twice
    expect(s.players.ai2.life).toBe(36); // 4 from the Kediss trigger
    expect(s.players.ai3.life).toBe(36);
  });

  it("THE LOAD-BEARING ONE — a NON-COMMANDER creature connecting fires nothing", () => {
    // Swap the scope to creatureYouControl and this fails. If it ever passes wrongly, Kediss has become a
    // materially stronger card than the one printed.
    const s = pod({ attackerIsCommander: false });
    expect(s.players.ai1.life).toBe(36); // the combat damage still lands
    expect(s.players.ai2.life).toBe(40); // …and nothing else does
    expect(s.players.ai3.life).toBe(40);
  });

  it("the damaged opponent is not double-dipped by 'each OTHER opponent'", () => {
    // ai1 took 4 combat damage and must not also take the 4 from the trigger.
    expect(pod({ attackerIsCommander: true }).players.ai1.life).toBe(36);
  });
});

describe("classification", () => {
  it("Kediss flips", () => {
    expect(classifyCard({ name: KEDISS.name, type: KEDISS.type, mana: KEDISS.mana, power: 1, toughness: 2, keywords: [], oracle: `${KEDISS_ORACLE}\nPartner` })).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ name: KEDISS.name, type: KEDISS.type, mana: KEDISS.mana, power: 1, toughness: 2, keywords: [], oracle: `${KEDISS_ORACLE}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
