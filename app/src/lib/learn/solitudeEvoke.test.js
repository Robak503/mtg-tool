/**
 * SOLITUDE — SHELF-85 · Shalai's last card (2026-09-05). "Flash / Lifelink / When this creature enters, exile up to one other
 * target creature. That creature's controller gains life equal to its power. / Evoke—Exile a white card from your hand."
 *
 * Two seams. (1) The other-target qualifier on targeted removal ("exile up to one OTHER target creature" — a not-source
 * restriction, peeled at the removal parser's head) composed with the controller-rider ("that creature's controller gains
 * life equal to its power"). (2) EVOKE (CR 702.74): the pitch half is the exile-a-colour-card alt cost with an `evoke` flag
 * that rides the cast; the entering permanent is stamped and its "sacrifice it" trigger is queued UNDER the card's own ETB,
 * so the exile happens and then the evoked body dies. The classifier admits the pitch-evoke line as modelled residue.
 *
 * Mutation-checked: see the run ledger (docs-sk53).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SOLITUDE = { id: "sol", name: "Solitude", type: "Creature — Elemental Incarnation", mana: "{3}{W}{W}", cmc: 5, colors: ["W"], power: 3, toughness: 2, keywords: ["Flash", "Lifelink"], oracle: "Flash\nLifelink\nWhen this creature enters, exile up to one other target creature. That creature's controller gains life equal to its power.\nEvoke—Exile a white card from your hand." };
const WHITE = { id: "wc", name: "Swords to Plowshares", type: "Instant", mana: "{W}", cmc: 1, colors: ["W"], oracle: "Exile target creature. Its controller gains life equal to its power." };
const perm = (id, controller, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const ogre = () => perm("ogre", "ai", { name: "Ogre", type: "Creature — Ogre", power: 4, toughness: 4, oracle: "" });
function state({ hand = [], userPool = {}, userBf = [], aiBf = [ogre()] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: userBf, manaPool: { ...s.players.user.manaPool, ...userPool } }, ai: { ...s.players.ai, battlefield: aiBf } },
  };
}
const castsOf = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };
const names = (cards) => cards.map((c) => c.card?.name ?? c.name).sort();

describe("parse + classify", () => {
  it("the ETB is an up-to-one OTHER exile with the gain-life-power controller rider; the pitch-evoke line is modelled residue; native-trigger", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Exile up to one other target creature. That creature's controller gains life equal to its power." });
    const row = { atoms: p?.atoms, triggers: detectTriggers(SOLITUDE).map((x) => [x.event, x.scope]), tier: classifyCard(SOLITUDE) };
    console.log("  WITNESS solitudeParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.atoms).toEqual([{ op: "exile", targetType: "creature", restrictions: [{ kind: "notSource" }], minTargets: 0, maxTargets: 1, controllerRider: { kind: "gainLifePower" } }]);
    expect(row.triggers).toEqual([["etb", "self"]]);
    expect(row.tier).toBe("native-trigger");
  });
});

describe("the hard cast", () => {
  it("cast for five: the ETB exiles their Ogre, they gain 4 (its power), and Solitude stays", () => {
    const s = state({ hand: [SOLITUDE], userPool: { W: 2, C: 3 } });
    const after = settle(dispatchAction(s, castsOf(s, "sol").find((a) => !a.altCost)));
    const row = { aiBoard: names(after.players.ai.battlefield), aiExile: names(after.players.ai.exile), aiLife: after.players.ai.life - s.players.ai.life, myBoard: names(after.players.user.battlefield), pause: after.pendingChoice?.kind || null };
    console.log("  WITNESS solitudeHard", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.aiBoard).toEqual([]);
    expect(row.aiExile).toEqual(["Ogre"]);
    expect(row.aiLife).toBe(4);
    expect(row.myBoard).toEqual(["Solitude"]);
    expect(row.pause).toBe(null);
  });
});

describe("evoke (CR 702.74)", () => {
  it("with NO mana and a white card in hand the evoke cast is offered; the pitch is exiled, the ETB exiles their Ogre (they gain 4), and THEN Solitude sacrifices itself", () => {
    const s = state({ hand: [SOLITUDE, WHITE] });
    const casts = castsOf(s, "sol");
    const evoke = casts.find((a) => a.altCost?.evoke);
    expect(evoke).toBeTruthy();
    expect(evoke.altCost).toMatchObject({ kind: "exileColorCard", evoke: true, exilePitchId: "wc" });
    const after = settle(dispatchAction(s, evoke));
    const row = { hardOffered: casts.some((a) => !a.altCost), myExile: names(after.players.user.exile), myGraveyard: names(after.players.user.graveyard), myBoard: names(after.players.user.battlefield), aiExile: names(after.players.ai.exile), aiLife: after.players.ai.life - s.players.ai.life, stamped: (after.log || []).some((e) => e.effect === "sacrifice" || e.kind === "sacrifice") };
    console.log("  WITNESS solitudeEvoke", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.hardOffered).toBe(false);          // five mana is not there
    expect(row.myExile).toEqual(["Swords to Plowshares"]);
    expect(row.myGraveyard).toEqual(["Solitude"]); // sacrificed after its ETB
    expect(row.myBoard).toEqual([]);
    expect(row.aiExile).toEqual(["Ogre"]);         // the ETB still happened
    expect(row.aiLife).toBe(4);
  });

  it("the evoked body is stamped; both triggers reach the stack and the ETB resolves FIRST (the exile is logged before the sacrifice)", () => {
    const s = state({ hand: [SOLITUDE, WHITE] });
    const paused = dispatchAction(s, castsOf(s, "sol").find((a) => a.altCost?.evoke));
    const entered = resolveTopOfStack(paused); // the creature spell resolves: Solitude is on the battlefield, evoked; the two triggers are flushed onto the stack
    const sol = entered.players.user.battlefield.find((p) => p.card?.name === "Solitude");
    const after = settle(entered);
    const log = after.log || [];
    const exileAt = log.findIndex((e) => e.effect === "exile" || (e.kind === "spell-effect" && /exile/.test(String(e.effect || ""))));
    const sacAt = log.findIndex((e) => /sacrifice/.test(String(e.effect || e.kind || "")) && e !== log[exileAt]);
    const row = { evoked: !!sol?.evoked, stackAfterEntry: entered.stack.length, exileAt, sacAt, myGraveyard: names(after.players.user.graveyard), aiExile: names(after.players.ai.exile) };
    console.log("  WITNESS solitudeStamp", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.evoked).toBe(true);
    expect(row.stackAfterEntry).toBe(2);
    expect(row.exileAt).toBeGreaterThan(-1);
    expect(row.sacAt).toBeGreaterThan(row.exileAt);
    expect(row.myGraveyard).toEqual(["Solitude"]);
    expect(row.aiExile).toEqual(["Ogre"]);
  });

  it("no white card in hand → no evoke cast; the hard cast needs the mana", () => {
    expect(castsOf(state({ hand: [SOLITUDE] }), "sol")).toHaveLength(0);
    expect(castsOf(state({ hand: [SOLITUDE], userPool: { W: 2, C: 3 } }), "sol").filter((a) => !a.altCost)).toHaveLength(1);
  });
});
