/**
 * savageOrder.test.js — SAVAGE ORDER, Jurassic's bar card (2026-08-14). "As an additional cost to cast
 * this spell, sacrifice a creature with power 4 or greater. / Search your library for a Dinosaur
 * creature card, put it onto the battlefield, then shuffle. It gains indestructible until your next
 * turn." 🏁 Landing this put JURASSIC RAMP at 90 — the second deck across the bar.
 *
 * ⭐ THE SIX SITES: the power-qualified sac cost (SAC_COST_POWER_RE → minPower, enforced LAYER-AWARE at
 * the victim enumeration AND re-validated at the dispatcher charge) · the bfm battlefield-tutor's
 * guaranteed-CREATURE admission arm · the fetched-grants fold (tutor + "It gains <kw> until <dur>") ·
 * the fetchedGrants/Until threading through the pending-choice whitelist (its own warning says
 * unlisted = dropped) · the resolveTutorChoice battlefield grant · the untilOwnersNextTurn duration
 * (a documented one-step approximation: expires at the OWNER's next cleanup — covers the opponents'
 * turns as printed; the gap is the owner's own next turn body, strictly closer than endOfTurn).
 *
 * ⛔ THE FIXTURE LESSON, recorded: the first build matched "until end of turn" from a TRUNCATED probe
 * of the oracle — the real card says "until your next turn", and the fold's FN-safety correctly
 * refused until the duration was modeled. Always print the FULL oracle before anchoring.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the creature admission arm removed -> Savage Order + Shadow-Rite Priest park.
 *   · the minPower filter dropped at enumeration -> the 3-power board becomes castable (dies).
 *   · the fetchedGrants threading dropped -> the fetched Dino enters WITHOUT indestructible (dies).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE = "As an additional cost to cast this spell, sacrifice a creature with power 4 or greater.\nSearch your library for a Dinosaur creature card, put it onto the battlefield, then shuffle. It gains indestructible until your next turn.";
const SAVAGE = { id: "c-so", name: "Savage Order", type: "Sorcery", mana: "{2}{G}{G}", oracle: ORACLE };

describe("the carriers and the parse", () => {
  it("⭐ Savage Order flips (the REAL until-your-next-turn text); riders Shadow-Rite Priest + Garruk", () => {
    expect(classifyCard(SAVAGE)).toBe("native-spell");
    expect(classifyCard({ name: "Shadow-Rite Priest", type: "Creature — Human Cleric", mana: "{1}{B}", power: "1", toughness: "2",
      oracle: "Other Clerics you control get +1/+1.\n{3}{B}{B}, {T}, Sacrifice another Cleric: Search your library for a black creature card, put it onto the battlefield, then shuffle." })).toBe("native-mixed");
    const p = parseEffectProgram(SAVAGE);
    expect(programConfidence(p)).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature", minPower: 4 }]);
    expect(p.atoms[0]).toMatchObject({ op: "tutor", destination: "battlefield", fetchedGrants: ["indestructible"], fetchedGrantsUntil: "untilOwnersNextTurn" });
  });
});

describe("⭐⭐ LAW 6 — the cost refuses small victims; the fetched Dino arrives protected", () => {
  function castBoard(power) {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const body = createPermanent({ id: "V", controller: "user", summoningSick: false,
      card: { id: "card-V", name: "Victim", type: "Creature — Beast", power: String(power), toughness: "4", oracle: "" } });
    return { ...g, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
      players: { ...g.players, user: { ...g.players.user, battlefield: [body], hand: [{ ...SAVAGE, id: "HAND" }],
        library: [{ id: "DINO", name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4", oracle: "" }],
        manaPool: { W: 5, U: 5, B: 5, R: 5, G: 5, C: 5 } } } };
  }
  const castOffered = (s) => legalActionsForPlayer(s, "user").some((a) => a.cardId === "HAND");

  it("⭐⭐ a 4-power victim makes it castable; a 3-power board CANNOT pay (CR 601.2h, layer-aware)", () => {
    const row = { with4: castOffered(castBoard(4)), with3: castOffered(castBoard(3)) };
    console.log("  WITNESS savageCost", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ with4: true, with3: false });
  });

  it("⭐⭐ the fetched Dinosaur enters WITH indestructible, holds through the OPPONENT's cleanup, drops at the owner's", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user,
      library: [{ id: "DINO", name: "Regisaur", type: "Creature — Dinosaur", power: "4", toughness: "4", oracle: "" }] } } };
    const atom = parseEffectProgram(SAVAGE).atoms[0];
    let s = ATOM_RESOLVERS.tutor(s0, atom, { controller: "user", targets: [], cardName: "Savage Order" });
    s = resolveTutorChoice(s, "DINO");
    const perm = s.players.user.battlefield.find((p) => p.card?.id === "DINO");
    const rows = { entered: !!perm, indestructible: permanentHasKeyword(s, perm?.id, "indestructible") };
    // the OPPONENT's cleanup (activePlayer ai1, a later turn) must NOT strip it…
    const afterOppCleanup = expireContinuousEffects({ ...s, activePlayer: "ai1", turn: s.turn + 1 }, { atCleanupOfTurn: s.turn + 1 });
    rows.holdsThroughOppTurn = permanentHasKeyword(afterOppCleanup, perm?.id, "indestructible");
    // …and the OWNER's next cleanup must.
    const afterOwnCleanup = expireContinuousEffects({ ...afterOppCleanup, activePlayer: "user", turn: s.turn + 4 }, { atCleanupOfTurn: s.turn + 4 });
    rows.dropsAtOwnersNext = !permanentHasKeyword(afterOwnCleanup, perm?.id, "indestructible");
    console.log("  WITNESS savageFetch", JSON.stringify(rows)); // vitest 4 needs --disable-console-intercept
    expect(rows).toEqual({ entered: true, indestructible: true, holdsThroughOppTurn: true, dropsAtOwnersNext: true });
  });
});
