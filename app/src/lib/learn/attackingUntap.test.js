/**
 * attackingUntap.test.js — "untap all ATTACKING creatures" (CR 506.3 + 701.20), the third scope on the
 * mass-untap resolver.
 *
 * The axis pattern one line deep, again: the untap resolver already did the deterministic mass untap and
 * already carried a `scope` ("land" by default, "creature" since the To Arms! slice). Attacking is a strict
 * SUBSET of the creature scope — the same loop, filtered by the live attacker set instead of a type line.
 *
 * ⛔ THE SET COMES FROM state.combat.attackers, NOT A FLAG ON THE PERMANENT. That is what makes it exactly
 * the set the combat system is currently resolving. Outside combat there is no such set and the atom untaps
 * NOTHING — never a fallback to "all creatures", which would untap the whole board off a card that promised
 * only the attackers. Every corpus carrier is a combat trigger or combat-restricted activation, so the empty
 * case is unreachable in play and a clean no-op if it ever isn't.
 *
 * ⚠️ HONEST SCOPE — measured, not predicted: 6 corpus cards print this clause and the tier diff moved exactly
 * ONE (Hellkite Charger #2125: body-only → native-trigger). Every other carrier holds a SECOND blocker of its
 * own — Karlach #1039 and Scourge of the Throne #1277 an intervening-if, Najeela and Karlach a keyword-grant
 * rider, Take the Bait goad + damage prevention. Raphael, Tag Team Tough needed the wording widen below AND
 * still parks: its trigger is "deals combat damage to a player FOR THE FIRST TIME EACH TURN", and that
 * once-per-turn qualifier is modeled on the ATTACK event but not on the combat-damage one (verified by
 * classifying the card with and without the qualifier — the axis for a later slice). A clause landing is not
 * a card landing; the count that matters is the tier diff.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { runEffectProgram, resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (oracle) => parseEffectProgram({ type: "Sorcery", name: "X", oracle })?.atoms?.[0] || null;

describe("parsing — the three scopes stay distinct", () => {
  it("⭐ the attacking form reaches the untap resolver with its own scope", () => {
    expect(atomOf("Untap all attacking creatures.")).toMatchObject({ op: "untap-lands", all: true, scope: "attacking" });
  });

  it("CONTROL — the creature and land forms are unchanged", () => {
    // If "attacking" had been folded into the creature arm instead of added beside it, this still passes —
    // which is why the runtime block below asserts a non-attacking own creature stays TAPPED.
    expect(atomOf("Untap all creatures you control.")).toMatchObject({ op: "untap-lands", scope: "creature" });
    expect(atomOf("Untap all lands you control.").scope).toBeUndefined();
  });

  it("⛔ the symmetric untap-all-creatures form still parks", () => {
    expect(atomOf("Untap all creatures.")).toBeNull();
  });
});

describe("⭐ RUNTIME — only the creatures actually attacking untap", () => {
  const creature = (id, controller) => createPermanent({
    id, controller, card: { id, name: `C${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  });
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = [creature("atk1", "user"), creature("atk2", "user"), creature("home", "user")];
    const theirs = [creature("t1", "ai")];
    for (const p of [...mine, ...theirs]) p.tapped = true;
    return {
      ...s,
      combat: { attackers: [{ permanentId: "atk1", attackingPlayer: "user", defender: "ai" },
                            { permanentId: "atk2", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: mine },
        ai: { ...s.players.ai, battlefield: theirs },
      },
    };
  }
  const run = (st) => resolveAtom(st, atomOf("Untap all attacking creatures."), { controller: "user", cardName: "Hellkite Charger", targets: [] });
  const tapped = (st, pid) => st.players[pid].battlefield.filter((p) => p.tapped).map((p) => p.id);

  it("⭐ the attackers untap", () => {
    expect(tapped(run(board()), "user")).not.toContain("atk1");
    expect(tapped(run(board()), "user")).not.toContain("atk2");
  });

  it("⛔ the creature that STAYED HOME is still tapped — the scope really is the attacker set", () => {
    // The load-bearing assertion. Without it, `scope: "attacking"` could silently fall through to the
    // creature arm and untap the whole board with every other expectation here still green.
    expect(tapped(run(board()), "user")).toEqual(["home"]);
  });

  it("⛔ the opponent's creature is untouched", () => {
    expect(tapped(run(board()), "ai")).toEqual(["t1"]);
  });

  it("⛔ OUTSIDE COMBAT it untaps nothing — no fallback to the whole board", () => {
    const s = { ...board(), combat: null };
    expect(tapped(run(s), "user").sort()).toEqual(["atk1", "atk2", "home"]);
  });

  it("CONTROL — before resolution everything is tapped", () => {
    expect(tapped(board(), "user").sort()).toEqual(["atk1", "atk2", "home"]);
  });
});

describe("⭐ the RAPHAEL wording — 'after this COMBAT phase' is the same insertion point", () => {
  it("reaches the extra-combat atom", () => {
    const ops = (parseEffectProgram({ type: "Sorcery", name: "X", oracle: "After this combat phase, there is an additional combat phase." })?.atoms || []).map((a) => a.op);
    expect(ops).toEqual(["extra-combat"]);
  });

  it("⛔ and widening it did NOT open the after-MAIN form", () => {
    // The reason it is a separate alternative rather than an optional `(combat )?` inside one pattern.
    const ops = (parseEffectProgram({ type: "Sorcery", name: "X", oracle: "After this main phase, there is an additional combat phase." })?.atoms || []).map((a) => a.op);
    expect(ops).not.toContain("extra-combat");
  });
});

describe("⭐ THE SEAM — Hellkite Charger's whole clause, end to end through the pay-choice", () => {
  // Three tested halves do not make a tested card: the optional-payment machinery is proven elsewhere with a
  // DRAW payoff, and both payoff atoms here are proven above in isolation. What is untested until this block
  // is the join — that the pay-choice runs BOTH of these atoms, in a state that has a live combat. The stun
  // slice and the tutor-destination slice were each lost for a round to exactly this gap.
  const mountain = (id) => createPermanent({ id, controller: "user", card: { id: `c${id}`, name: "Mountain", type: "Land", oracle: "{T}: Add {R}." } });
  const attacker = (id) => createPermanent({ id, controller: "user", card: { id: `c${id}`, name: "Dragon", type: "Creature — Dragon", power: 5, toughness: 5, oracle: "" } });

  function table() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const atk = attacker("charger");
    atk.tapped = true;                                    // it attacked, so it is tapped
    const lands = Array.from({ length: 7 }, (_, i) => mountain(`M${i}`));
    return {
      ...s,
      combat: { attackers: [{ permanentId: "charger", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s.players, user: { ...s.players.user, battlefield: [atk, ...lands], hand: [] } },
    };
  }
  const clause = "you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase";
  const paused = () => runEffectProgram(table(), {
    source: { name: "Hellkite Charger" },
    payload: { params: { program: parseEffectClause(clause, "Creature"), controller: "user", targets: [], sourceId: "charger", context: {} } },
  });

  it("⭐ the clause pauses on a real pay/decline choice carrying BOTH payoff atoms", () => {
    const p = paused();
    expect(p.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user" });
    expect(p.pendingChoice.effectAtoms.map((a) => a.op)).toEqual(["untap-lands", "extra-combat"]);
    expect(p.players.user.battlefield.find((x) => x.id === "charger").tapped).toBe(true); // payoff not run yet
  });

  it("⭐ PAY — seven lands tap, the attacker untaps, and a combat is queued", () => {
    const settled = resolveOptionalManaPaymentChoice(paused(), true);
    expect(settled.players.user.battlefield.filter((x) => x.card.type === "Land" && x.tapped)).toHaveLength(7);
    expect(settled.players.user.battlefield.find((x) => x.id === "charger").tapped).toBe(false);
    expect(settled.extraPhases).toEqual([{ kind: "combat" }]);
  });

  it("⛔ DECLINE — no mana spent, nothing untaps, and NO combat is queued", () => {
    // The free-attack FP this card would be if the cost were cosmetic.
    const settled = resolveOptionalManaPaymentChoice(paused(), false);
    expect(settled.players.user.battlefield.some((x) => x.card.type === "Land" && x.tapped)).toBe(false);
    expect(settled.players.user.battlefield.find((x) => x.id === "charger").tapped).toBe(true);
    expect(settled.extraPhases || []).toEqual([]);
  });
});

describe("tier", () => {
  it("⭐ Hellkite Charger flips (rank 2125) — the untap and the extra combat both behind its optional cost", () => {
    expect(classifyCard({ name: "Hellkite Charger", type: "Creature — Dragon", mana: "{4}{R}{R}", power: "5", toughness: "5",
      oracle: "Flying, haste\nWhenever this creature attacks, you may pay {5}{R}{R}. If you do, untap all attacking creatures and after this phase, there is an additional combat phase." }))
      .toBe("native-trigger");
  });

  it("⛔ Karlach and Scourge of the Throne stay PARKED — each holds a second blocker", () => {
    // The honest counterweight: 6 carriers, 1 flip. Both of these print an intervening-if the clause
    // widening does nothing for, and Karlach adds a keyword-grant rider on top.
    expect(classifyCard({ name: "Karlach, Fury of Avernus", type: "Legendary Creature — Human Barbarian", mana: "{2}{R}{R}", power: "4", toughness: "4",
      oracle: "Whenever you attack, if it's the first combat phase of the turn, untap all attacking creatures. They gain first strike until end of turn. After this phase, there is an additional combat phase.\nChoose a Background (You can have a Background as a second commander.)" }))
      .not.toMatch(/^native/);
    expect(classifyCard({ name: "Scourge of the Throne", type: "Creature — Dragon", mana: "{4}{R}{R}", power: "5", toughness: "5",
      oracle: "Flying\nDethrone (Whenever this creature attacks the player with the most life or tied for most life, put a +1/+1 counter on it.)\nWhenever this creature attacks for the first time each turn, if it's attacking the player with the most life or tied for most life, untap all attacking creatures. After this phase, there is an additional combat phase." }))
      .not.toMatch(/^native/);
  });
});
