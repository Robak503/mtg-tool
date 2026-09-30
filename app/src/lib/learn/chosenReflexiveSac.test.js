/**
 * chosenReflexiveSac.test.js — "[<lead>, then] you may sacrifice <a card-type phrase>. If you do, <payoff>" (CR 603.7c —
 * shelf decks D13, 2026-09-30: Iron Man, Titan of Innovation in Captain America).
 *
 * The value-token lane ("you may sacrifice a Treasure") auto-picks because a Treasure is a Treasure. A card-type phrase
 * is not fungible: WHICH artifact is sacrificed is the controller's choice, and Iron Man's payoff reads it — "…mana value
 * equal to 1 plus the sacrificed artifact's mana value…". So the pause lists the candidates (current types — an artifact
 * creature is not a noncreature artifact), the settle sacrifices the named one and hands its last-known values to the
 * payoff (ctx.sacrificedForCost, CR 608.2h), and a yes without a named candidate sacrifices nothing. The self-play
 * auto-pick gives up only a token (the cheapest) and otherwise declines.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkAttackTriggers, checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { resolveOptionalSacChoice, autoPickOptionalSac, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { advanceUntilDecision, applyPendingChoice } from "./learnSession.js";
import { setPendingOptionalSacBySubtypeChoice } from "./pendingChoice.js";

beforeEach(() => _resetIdsForTests());

const c = (name, type, mana, cmc, oracle = "", extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const IRON_MAN = c("Iron Man, Titan of Innovation", "Legendary Artifact Creature — Human Hero", "{3}{U}{R}", 5, "Flying, haste\nGenius Industrialist — Whenever Iron Man attacks, create a Treasure token, then you may sacrifice a noncreature artifact. If you do, search your library for an artifact card with mana value equal to 1 plus the sacrificed artifact's mana value, put it onto the battlefield tapped, then shuffle.", { power: "4", toughness: "4", keywords: ["Flying", "Haste"] });
const IRONCLAD = c("Ironclad Revolutionary", "Creature — Aetherborn Artificer", "{4}{B}{B}", 6, "When this creature enters, you may sacrifice an artifact. If you do, put two +1/+1 counters on this creature and each opponent loses 2 life.", { power: "4", toughness: "4" });
const BENTHIC = c("Benthic Criminologists", "Creature — Merfolk Wizard", "{4}{U}", 5, "Whenever this creature enters or attacks, you may sacrifice an artifact. If you do, draw a card.", { power: "4", toughness: "5" });
const SOL_RING = c("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.");
const MIND_STONE = c("Mind Stone", "Artifact", "{2}", 2, "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card.");
const ORNITHOPTER = c("Ornithopter", "Artifact Creature — Thopter", "{0}", 0, "Flying", { power: "0", toughness: "2", keywords: ["Flying"] });
const BAUBLE = c("Wayfarer's Bauble", "Artifact", "{1}", 1, "{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.");
const FELLWAR = c("Fellwar Stone", "Artifact", "{2}", 2, "{T}: Add one mana of any color that a land an opponent controls could produce.");
const HEDRON = c("Hedron Archive", "Artifact", "{4}", 4, "{T}: Add {C}{C}.\n{2}, {T}, Sacrifice this artifact: Draw two cards.");

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** Iron Man attacking, beside your Sol Ring, Mind Stone and an Ornithopter; three artifacts in the library. */
function ironManAttacks() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers", stack: [], pendingTriggers: [],
    combat: { attackers: [{ permanentId: "im", attackingPlayer: "user", defender: "ai" }], blockers: [] },
    players: { ...g.players, user: { ...g.players.user,
      battlefield: [perm("im", IRON_MAN), perm("ring", SOL_RING), perm("stone", MIND_STONE), perm("thopter", ORNITHOPTER)],
      library: [BAUBLE, FELLWAR, HEDRON].map((x, i) => ({ ...x, id: `l${i}` })) } } };
  s = flushTriggers(checkAttackTriggers(s), { chooseTargets: chooseTriggerTargets });
  return resolveTopOfStack(s);   // the Treasure is made, then the sacrifice choice opens
}
const names = (pc) => (pc?.candidates || []).map((x) => x.name).sort();

describe("⭐ Iron Man — the chosen sacrifice sets the fetched mana value", () => {
  it("⭐ the choice lists your NONCREATURE artifacts — the fresh Treasure included, never Iron Man or the Ornithopter", () => {
    const s = ironManAttacks();
    const row = { kind: s.pendingChoice?.kind, candidates: names(s.pendingChoice), treasureIsToken: s.pendingChoice.candidates.find((x) => x.name === "Treasure")?.token };
    console.log(`WITNESS ironManChoice ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "optional-sac-payment", candidates: ["Mind Stone", "Sol Ring", "Treasure"], treasureIsToken: true });
  });
  it("⭐ sacrificing Sol Ring (mana value 1) fetches a 2 — Fellwar Stone, tapped; Sol Ring is gone", () => {
    const paused = resolveOptionalSacChoice(ironManAttacks(), true, "ring");
    const done = resolveTutorChoice(paused, paused.pendingChoice.candidates[0].id);
    const bf = done.players.user.battlefield;
    expect({ tutor: names(paused.pendingChoice), fellwarTapped: bf.find((p) => p.card.name === "Fellwar Stone")?.tapped, ringGone: !bf.some((p) => p.id === "ring") })
      .toEqual({ tutor: ["Fellwar Stone"], fellwarTapped: true, ringGone: true });
  });
  it("sacrificing the fresh Treasure (mana value 0) fetches a 1 instead — the same trigger, a different choice", () => {
    const s = ironManAttacks();
    const treasure = s.pendingChoice.candidates.find((x) => x.name === "Treasure").id;
    expect(names(resolveOptionalSacChoice(s, true, treasure).pendingChoice)).toEqual(["Wayfarer's Bauble"]);
  });
  it("decline, a yes that names nothing, and a named non-candidate all sacrifice nothing and fetch nothing", () => {
    const outcome = (st) => ({ pending: st.pendingChoice?.kind ?? null, artifacts: st.players.user.battlefield.length });
    const s = ironManAttacks();
    expect({ decline: outcome(resolveOptionalSacChoice(s, false)), unnamed: outcome(resolveOptionalSacChoice(s, true, null)), ironManItself: outcome(resolveOptionalSacChoice(s, true, "im")) })
      .toEqual({ decline: { pending: null, artifacts: 5 }, unnamed: { pending: null, artifacts: 5 }, ironManItself: { pending: null, artifacts: 5 } });
  });
  it("the self-play auto-pick gives up the Treasure (a token, the cheapest) — never Sol Ring or Mind Stone", () => {
    const s = ironManAttacks();
    const pick = autoPickOptionalSac(s, s.pendingChoice);
    expect(s.pendingChoice.candidates.find((x) => x.id === pick)?.name).toBe("Treasure");
    const noTokens = { ...s.pendingChoice, candidates: s.pendingChoice.candidates.filter((x) => !x.token) };
    expect(autoPickOptionalSac(s, noTokens)).toBe(false);
  });
});

describe("the session: a human names the artifact; the AI seat takes the token", () => {
  const pendingFor = (controller) => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, [controller]: { ...g.players[controller], battlefield: [perm("ring", SOL_RING, controller), perm("tr", { name: "Treasure", type: "Token Artifact — Treasure", mana: "", cmc: 0, keywords: [], oracle: "{T}, Sacrifice this artifact: Add one mana of any color.", token: true }, controller)],
        library: [BAUBLE, FELLWAR].map((x, i) => ({ ...x, id: `l${i}` })), hand: [] } } };
    return setPendingOptionalSacBySubtypeChoice(s, {
      controller, subtype: "noncreature artifact", available: true, sourceName: "Iron Man, Titan of Innovation", effectAtoms: [{ op: "draw", amount: 1, targetType: null }],
      candidates: [{ id: "ring", name: "Sol Ring", manaValue: 1, token: false }, { id: "tr", name: "Treasure", manaValue: 0, token: true }],
    });
  };
  it("the human's pause carries the candidates, and { sac, victimId } sacrifices exactly that one", () => {
    const pending = { status: "active", state: pendingFor("user"), difficulty: "beginner", decisionLog: [] };
    const { decision } = advanceUntilDecision(pending);
    const { session } = applyPendingChoice(pending, { sac: true, victimId: "ring" });
    const bf = session.state.players.user.battlefield.map((p) => p.id);
    expect({ offered: (decision.candidates || []).map((x) => x.id), ringGone: !bf.includes("ring"), treasureKept: bf.includes("tr"), logged: session.decisionLog.at(-1)?.action })
      .toEqual({ offered: ["ring", "tr"], ringGone: true, treasureKept: true, logged: { kind: "optional-sac-payment-choice", sacrificed: true, victimId: "ring" } });
  });
  it("a pilot is offered one action per candidate plus decline — and its pick is what gets sacrificed", () => {
    let offered = null;
    const decide = ({ legalActions }) => {
      if (legalActions.some((a) => a.choiceKind === "optional-sac-payment")) offered = legalActions.map((a) => a.value);
      return legalActions.find((a) => a.value === "ring") ?? legalActions[0];
    };
    const { session } = advanceUntilDecision({ status: "active", state: pendingFor("ai"), difficulty: "beginner", decisionLog: [] }, { decide });
    const bf = session.state.players.ai.battlefield.map((p) => p.id);
    expect({ offered, ringGone: !bf.includes("ring"), treasureKept: bf.includes("tr") }).toEqual({ offered: ["ring", "tr", false], ringGone: true, treasureKept: true });
  });
  it("the AI seat's autopilot gives up the Treasure and keeps Sol Ring", () => {
    const { session } = advanceUntilDecision({ status: "active", state: pendingFor("ai"), difficulty: "beginner", decisionLog: [] });
    const bf = session.state.players.ai.battlefield.map((p) => p.id);
    expect({ ringKept: bf.includes("ring"), treasureGone: !bf.includes("tr"), drew: session.state.players.ai.hand.length }).toEqual({ ringKept: true, treasureGone: true, drew: 1 });
  });
});

describe("the two other cards the artifact phrase reads", () => {
  it("Ironclad Revolutionary: sacrificing an artifact puts two +1/+1 counters on it and drains each opponent for 2", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [perm("ir", IRONCLAD), perm("ring", SOL_RING)] } } };
    s = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, s.players.user.battlefield[0]), { chooseTargets: chooseTriggerTargets }));
    const done = resolveOptionalSacChoice(s, true, "ring");
    expect({ counters: done.players.user.battlefield.find((p) => p.id === "ir")?.counters?.["+1/+1"], aiLost: g.players.ai.life - done.players.ai.life })
      .toEqual({ counters: 2, aiLost: 2 });
  });
  it("Benthic Criminologists and Ironclad Revolutionary read native; 'a creature' stays out of the vocabulary", () => {
    expect([IRON_MAN, IRONCLAD, BENTHIC].map((x) => classifyCard(x))).toEqual(["native-trigger", "native-trigger", "native-trigger"]);
    expect(programConfidence(parseEffectProgram({ type: "Instant", oracle: "you may sacrifice a creature. If you do, draw a card." }))).toBe("low");
  });
  it("the payoff stays refused for a second 'if you do' (its guard) and an 'otherwise' (it never parses HIGH)", () => {
    const low = (oracle) => programConfidence(parseEffectProgram({ type: "Instant", oracle }));
    expect({
      secondIfYouDo: low("you may sacrifice an artifact. If you do, you may pay {1}. If you do, draw a card."),
      otherwise: low("you may sacrifice an artifact. If you do, draw a card. Otherwise, you lose 2 life."),
    }).toEqual({ secondIfYouDo: "low", otherwise: "low" });
  });
});
