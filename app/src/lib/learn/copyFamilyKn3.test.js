/**
 * COPY FAMILY — POD-SIM THREE · KN-3 (2026-09-05): Flash Photography + Imposter Mech.
 *
 * Flash Photography — "Create a token that's a copy of target permanent." (any permanent, any controller; an Aura or a
 * Saga is never a legal target — no attach choice / no lore counter on the token path). The card's own conditional flash
 * line is stripped and NOT honored: sorcery-speed only (a documented false negative).
 *
 * Imposter Mech — "You may have this Vehicle enter as a copy of a creature an opponent controls, except it's a Vehicle
 * artifact with crew 3 and it loses all other card types." The opponent-creature scope; the copy's type line is exactly
 * "Artifact — Vehicle" with the creature's P/T and a Crew 3 line the crew parser reads.
 *
 * Mutation-checked: see the run ledger (docs-sk45).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { resolveCloneChoice } from "./resolvers.js";
import { parseCloneSpec } from "./cloneCopy.js";
import { parseEffectProgram } from "./effects/parser.js";
import { parseCrewCost } from "./effects/abilities.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PHOTO = { id: "card-fp", name: "Flash Photography", type: "Sorcery", mana: "{2}{U}{U}", cmc: 4, colors: ["U"], oracle: "You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U}" };
const MECH = { id: "card-im", name: "Imposter Mech", type: "Artifact — Vehicle", mana: "{1}{U}", cmc: 2, colors: ["U"], power: 0, toughness: 0, oracle: "You may have this Vehicle enter as a copy of a creature an opponent controls, except it's a Vehicle artifact with crew 3 and it loses all other card types.\nCrew 3" };

const perm = (id, controller, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const aiBoard = () => [
  perm("ogre", "ai", { name: "Ogre", type: "Creature — Ogre Warrior", power: 4, toughness: 4, oracle: "" }),
  perm("sol", "ai", { name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }),
  perm("aura", "ai", { name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block." }),
  perm("saga", "ai", { name: "History of Benalia", type: "Enchantment — Saga", oracle: "I, II — Create a 2/2 white Knight creature token with vigilance." }),
  perm("island", "ai", { name: "Island", type: "Basic Land — Island", oracle: "" }),
];
function state(hand, userBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [hand], battlefield: userBf, manaPool: { ...s.players.user.manaPool, U: 2, C: 2 } },
      ai: { ...s.players.ai, battlefield: aiBoard() },
    },
  };
}
const castsOf = (s, cardId) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === cardId);
const bear = () => perm("mybear", "user", { name: "My Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });

describe("Flash Photography — a token copy of target permanent", () => {
  it("parses to the target token-copy with the Aura/Saga exclusions; native-spell", () => {
    const p = parseEffectProgram(PHOTO);
    const row = { confidence: p.confidence, atoms: p.atoms, tier: classifyCard({ ...PHOTO, keywords: [] }) };
    console.log("  WITNESS photoParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.confidence).toBe("high");
    expect(row.atoms).toEqual([{ op: "create-token-copy", copySource: "target", count: 1, targetType: "permanent", restrictions: [{ kind: "typeNeg", type: "aura" }, { kind: "typeNeg", type: "saga" }] }]);
    expect(row.tier).toBe("native-spell");
  });

  it("targets: the Ogre, the Sol Ring, the Island and MY bear are offered — never the Aura or the Saga", () => {
    const s = state(PHOTO, [bear()]);
    const offered = castsOf(s, "card-fp").flatMap((a) => (a.targets || []).map((t) => t.id)).sort();
    console.log("  WITNESS photoTargets", JSON.stringify(offered)); // vitest 4 needs --disable-console-intercept
    expect(offered).toEqual(["island", "mybear", "ogre", "sol"]);
  });

  it("copying the opponent's Sol Ring gives ME a Sol Ring TOKEN (an artifact, not a creature); copying my bear gives a second bear", () => {
    const s = state(PHOTO, [bear()]);
    const ringCast = castsOf(s, "card-fp").find((a) => a.targets?.[0]?.id === "sol");
    const afterRing = finalizeStackResolution(resolveTopOfStack(dispatchAction(s, ringCast)));
    const tok = afterRing.players.user.battlefield.find((p) => p.card?.token);
    const bearCast = castsOf(state(PHOTO, [bear()]), "card-fp").find((a) => a.targets?.[0]?.id === "mybear");
    const afterBear = finalizeStackResolution(resolveTopOfStack(dispatchAction(state(PHOTO, [bear()]), bearCast)));
    const bears = afterBear.players.user.battlefield.filter((p) => p.card?.name === "My Bear");
    const row = { token: tok?.card?.name, tokenType: tok?.card?.type, isCreature: tok ? permanentIsCreature(afterRing, tok.id) : null, aiStillHasRing: afterRing.players.ai.battlefield.some((p) => p.id === "sol"), bears: bears.length, tokenBears: bears.filter((p) => p.card.token).length };
    console.log("  WITNESS photoTokens", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.token).toBe("Sol Ring");
    expect(row.tokenType).toBe("Artifact");
    expect(row.isCreature).toBe(false);
    expect(row.aiStillHasRing).toBe(true);
    expect(row.bears).toBe(2);
    expect(row.tokenBears).toBe(1);
  });
});

describe("Imposter Mech — a Vehicle copy of an opponent's creature", () => {
  it("parses: scope opponentCreature, the become-Vehicle rider with crew 3; native-clone", () => {
    const spec = parseCloneSpec(MECH);
    const row = { scope: spec?.scope, riders: spec?.riders, optional: spec?.optional, tier: classifyCard({ ...MECH, keywords: [] }) };
    console.log("  WITNESS mechParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.scope).toBe("opponentCreature");
    expect(row.riders).toEqual([{ kind: "becomeVehicle", crew: 3 }, { kind: "becomeVehicle", crew: null }]);
    expect(row.optional).toBe(true);
    expect(row.tier).toBe("native-clone");
  });

  it("the pause offers ONLY the opponent's creature (not my bear, not their artifact); as the Ogre it is a 4/4 Artifact — Vehicle with Crew 3, NOT a creature", () => {
    const s = state(MECH, [bear()]);
    const cast = castsOf(s, "card-im")[0];
    expect(cast).toBeTruthy();
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
    const candidates = paused.pendingChoice.candidates.map((c) => c.id);
    const after = finalizeStackResolution(resolveCloneChoice(paused, "ogre"));
    const mech = after.players.user.battlefield.find((p) => p.printedCard);
    const row = { candidates, name: mech?.card?.name, type: mech?.card?.type, pt: [mech?.card?.power, mech?.card?.toughness], crew: mech ? parseCrewCost(mech.card) : null, isCreature: mech ? permanentIsCreature(after, mech.id) : null, printed: mech?.printedCard?.name };
    console.log("  WITNESS mechCopy", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.candidates).toEqual(["ogre"]);
    expect(row.name).toBe("Ogre");
    expect(row.type).toBe("Artifact — Vehicle");
    expect(row.pt).toEqual([4, 4]);
    expect(row.crew).toBe(3);
    expect(row.isCreature).toBe(false);
    expect(row.printed).toBe("Imposter Mech");
  });

  it("⭐ MALLEABLE IMPOSTOR (the flip-diff twin — a printed Flash line before the copy clause): the RUNTIME raises the copy pause and the copy is a flying Faerie Shapeshifter Ogre", () => {
    const MALLEABLE = { id: "card-mi", name: "Malleable Impostor", type: "Creature — Faerie Shapeshifter", mana: "{3}{U}", cmc: 4, colors: ["U"], power: 3, toughness: 3, keywords: ["Flash", "Flying"], oracle: "Flash\nFlying\nYou may have this creature enter as a copy of a creature an opponent controls, except it's a Faerie Shapeshifter in addition to its other types and it has flying." };
    const s = state(MALLEABLE, [bear()]);
    const cast = castsOf(s, "card-mi")[0];
    expect(cast).toBeTruthy();
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "clone-search", controller: "user" });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["ogre"]);
    const after = finalizeStackResolution(resolveCloneChoice(paused, "ogre"));
    const copy = after.players.user.battlefield.find((p) => p.printedCard);
    const row = { name: copy?.card?.name, type: copy?.card?.type, keywords: copy?.card?.keywords, isCreature: copy ? permanentIsCreature(after, copy.id) : null, tier: classifyCard(MALLEABLE) };
    console.log("  WITNESS malleable", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.name).toBe("Ogre");
    expect(row.type).toMatch(/^Creature — Ogre Warrior Faerie Shapeshifter$/);
    expect(row.keywords).toContain("flying");
    expect(row.isCreature).toBe(true);
    expect(row.tier).toBe("native-clone");
  });

  it("picking MY OWN bear is refused — it enters as itself (a plain Imposter Mech); declining does the same", () => {
    const s = state(MECH, [bear()]);
    const paused = resolveTopOfStack(dispatchAction(s, castsOf(s, "card-im")[0]));
    const refused = finalizeStackResolution(resolveCloneChoice(paused, "mybear"));
    const declined = finalizeStackResolution(resolveCloneChoice(resolveTopOfStack(dispatchAction(state(MECH, [bear()]), castsOf(state(MECH, [bear()]), "card-im")[0])), null));
    const names = (st) => st.players.user.battlefield.map((p) => p.card?.name).sort();
    expect(names(refused)).toEqual(["Imposter Mech", "My Bear"]);
    expect(names(declined)).toEqual(["Imposter Mech", "My Bear"]);
    expect(refused.players.user.battlefield.some((p) => p.printedCard)).toBe(false);
  });
});
