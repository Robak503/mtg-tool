/**
 * "WHENEVER AN ARTIFACT ENTERS" — the bare subject: any player's artifact, a token included, the watcher itself when it is one
 * (CR 603.6a — an enters ability triggers for each permanent that enters, and the permanent's own entry is one of them):
 *   · Grinding Station (EDHREC #2174) — "Whenever an artifact enters, you may untap this artifact." (its "{T}, Sacrifice an
 *     artifact: Target player mills three cards." already read);
 *   · Leonin Elder ("you may gain 1 life"), Battered Golem ("you may untap this creature", beside "This creature doesn't untap
 *     during your untap step."), Vermiculos ("this creature gets +4/+4 until end of turn"), Karstoderm ("remove a +1/+1 counter
 *     from this creature").
 * A creature that is not an artifact entering fires none of them.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { checkPermanentEntersTriggers, detectTriggers } from "./triggers.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const GRINDING_STATION = {"name":"Grinding Station","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Mill"],"colors":[],"oracle":"{T}, Sacrifice an artifact: Target player mills three cards.\nWhenever an artifact enters, you may untap this artifact."}; // body-only on 0a65c51c
const LEONIN_ELDER = {"name":"Leonin Elder","type":"Creature — Cat Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"Whenever an artifact enters, you may gain 1 life."}; // body-only on 0a65c51c
const BATTERED_GOLEM = {"name":"Battered Golem","type":"Artifact Creature — Golem","mana":"{3}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"oracle":"This creature doesn't untap during your untap step.\nWhenever an artifact enters, you may untap this creature."}; // body-only on 0a65c51c
const VERMICULOS = {"name":"Vermiculos","type":"Creature — Horror","mana":"{4}{B}","cmc":5,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"Whenever an artifact enters, this creature gets +4/+4 until end of turn."}; // body-only on 0a65c51c
const KARSTODERM = {"name":"Karstoderm","type":"Creature — Beast","mana":"{2}{G}{G}","cmc":4,"power":"0","toughness":"0","keywords":[],"colors":["G"],"oracle":"This creature enters with five +1/+1 counters on it.\nWhenever an artifact enters, remove a +1/+1 counter from this creature."}; // body-only on 0a65c51c
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", colors: ["G"], keywords: [], oracle: "" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", cmc: 0, colors: [], keywords: [], oracle: "{T}: Add {C}." };

const perm = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...over });
function board({ user = [], ai = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, life: 40, hand, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
// An opponent's permanent entering: put it onto the AI's battlefield and run the permanent-enters check for it.
function aiEnters(s, id, card) {
  const p = perm(id, card, "ai");
  const t = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, p] } } };
  return checkPermanentEntersTriggers(t, p);
}
// Resolve everything; a printed "you may" is answered `yes`.
function resolveAll(s, yes = true) {
  let out = flushTriggers(s);
  for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice || (out.pendingTriggers || []).length); i++) {
    out = out.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(out, yes) : flushTriggers(resolveTopOfStack(out));
  }
  return out;
}
const tapped = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.tapped;

describe("the reader", () => {
  it("⭐ the five cards play their whole text", () => {
    expect([GRINDING_STATION, LEONIN_ELDER, BATTERED_GOLEM, VERMICULOS, KARSTODERM].map((c) => classifyCard(c)))
      .toEqual(["native-mixed", "native-trigger", "native-trigger", "native-trigger", "native-trigger"]);
  });
  it("control: a controller phrase or a qualifier on the bare subject stays unread", () => {
    const n = (cond) => detectTriggers({ name: "Probe", type: "Artifact", oracle: `Whenever ${cond} enters, you may untap this artifact.` }).length;
    expect({ opp: n("an artifact an opponent controls"), nontoken: n("a nontoken artifact"), legendary: n("a legendary artifact") }).toEqual({ opp: 0, nontoken: 0, legendary: 0 });
  });
});

describe("Grinding Station", () => {
  it("⭐ an opponent's artifact entering: it may untap", () => {
    const s = resolveAll(aiEnters(board({ user: [perm("gs", GRINDING_STATION, "user", { tapped: true })] }), "ai-ring", SOL_RING));
    expect(tapped(s, "gs")).toBe(false);
  });
  it("⭐ its controller's own artifact spell entering: it may untap; declined, it stays tapped", () => {
    const s0 = board({ user: [perm("gs", GRINDING_STATION, "user", { tapped: true }), perm("w", WASTES)], hand: [{ ...SOL_RING, id: "h-ring" }] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-ring");
    expect(cast, "Sol Ring is offered").toBeDefined();
    const yes = resolveAll(resolveTopOfStack(dispatchAction(s0, cast)), true);
    const no = resolveAll(resolveTopOfStack(dispatchAction(s0, cast)), false);
    expect({ yes: tapped(yes, "gs"), no: tapped(no, "gs") }).toEqual({ yes: false, no: true });
  });
  it("control: a creature that is not an artifact entering fires nothing", () => {
    const s = aiEnters(board({ user: [perm("gs", GRINDING_STATION, "user", { tapped: true })] }), "ai-bears", BEARS);
    expect({ pending: (s.pendingTriggers || []).length, tapped: tapped(resolveAll(s), "gs") }).toEqual({ pending: 0, tapped: true });
  });
});

describe("Leonin Elder, Battered Golem, Vermiculos, Karstoderm", () => {
  it("⭐ one opponent's artifact: 1 life, the Golem untaps, Vermiculos 5/5, Karstoderm loses a counter", () => {
    const s0 = board({ user: [perm("elder", LEONIN_ELDER), perm("golem", BATTERED_GOLEM, "user", { tapped: true }), perm("verm", VERMICULOS), perm("karst", KARSTODERM, "user", { counters: { "+1/+1": 5 } })] });
    const s = resolveAll(aiEnters(s0, "ai-ring", SOL_RING));
    expect({ life: s.players.user.life, golem: tapped(s, "golem"), verm: [permanentPower(s, "verm"), permanentToughness(s, "verm")], karst: [permanentPower(s, "karst"), permanentToughness(s, "karst")] })
      .toEqual({ life: 41, golem: false, verm: [5, 5], karst: [4, 4] });
  });
});
