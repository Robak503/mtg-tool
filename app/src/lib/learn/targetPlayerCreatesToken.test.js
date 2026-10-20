/**
 * "TARGET PLAYER CREATES <token>" — the either-player sibling of "target opponent creates" (Generous Plunderer's Treasure, Forbidden
 * Orchard's Spirit). The chosen player, not the spell's controller, creates the token: it enters under that player's control and they
 * own it (CR 111.2), and any player may be chosen — the caster included (CR 115.1, the "target player" draw / discard modes beside it).
 *   · Prismari Command (EDHREC #1109) — "• Target player creates a Treasure token."
 *   · Brigid's Command (#16651) — "• Target player creates a 1/1 green and white Kithkin creature token."
 * Prismari Command's bundled ruling: "If at least one target is still legal as Prismari Command tries to resolve, it will resolve and do
 * as much as it can."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";

beforeEach(() => _resetIdsForTests());

const PRISMARI_COMMAND = {"name":"Prismari Command","type":"Instant","mana":"{1}{U}{R}","cmc":3,"power":null,"toughness":null,"keywords":["Treasure"],"colors":["R","U"],"oracle":"Choose two —\n• Prismari Command deals 2 damage to any target.\n• Target player draws two cards, then discards two cards.\n• Target player creates a Treasure token.\n• Destroy target artifact."}; // arbiter-spell on 55eb7d63
const BRIGIDS_COMMAND = {"name":"Brigid's Command","type":"Kindred Sorcery — Kithkin","mana":"{1}{G}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Fight"],"colors":["G","W"],"oracle":"Choose two —\n• Create a token that's a copy of target Kithkin you control.\n• Target player creates a 1/1 green and white Kithkin creature token.\n• Target creature you control gets +3/+3 until end of turn.\n• Target creature you control fights target creature an opponent controls."}; // arbiter-spell on 55eb7d63
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};

const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
function pod(spell, mana, { user = [], ai = [] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], battlefield: user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai1: { ...s0.players.ai1, battlefield: ai } } };
}
const casts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "h-spell");
const modes = (a) => (Array.isArray(a.chosenMode) ? a.chosenMode : [a.chosenMode]).join("-");
const tokenRow = (s, pid) => (s.players[pid].battlefield || []).filter((p) => p.isToken || /Token/.test(p.card?.type || "")).map((p) => ({ name: p.card.name, controller: p.controller, owner: p.owner ?? p.controller }));

describe("the reader", () => {
  it("⭐ both Commands play their whole text", () => {
    expect({ prismari: classifyCard(PRISMARI_COMMAND), brigid: classifyCard(BRIGIDS_COMMAND) }).toEqual({ prismari: "native-spell", brigid: "native-spell" });
  });

  it("⭐ the atom: a chosen player creates (whoCreates target), aimed at its own side by a trigger chooser; \"target opponent\" stays enemy-side", () => {
    const atom = (oracle) => parseEffectProgram({ name: "x", type: "Instant", oracle }).atoms?.[0] || null;
    const treasure = atom("Target player creates a Treasure token.");
    const kithkin = atom("Target player creates a 1/1 green and white Kithkin creature token.");
    const plunder = atom("Target opponent creates a tapped Treasure token.");
    expect({
      treasure: treasure && { op: treasure.op, targetType: treasure.targetType, whoCreates: treasure.whoCreates, intent: atomTargetIntent(treasure) },
      kithkin: kithkin && { op: kithkin.op, targetType: kithkin.targetType, whoCreates: kithkin.whoCreates, intent: atomTargetIntent(kithkin) },
      plunder: plunder && { targetType: plunder.targetType, intent: atomTargetIntent(plunder) },
    }).toEqual({
      treasure: { op: "create-named-token", targetType: "player", whoCreates: "target", intent: "own" },
      kithkin: { op: "create-token", targetType: "player", whoCreates: "target", intent: "own" },
      plunder: { targetType: "opponent", intent: "enemy" },
    });
  });
});

describe("Prismari Command", () => {
  const MANA = { U: 1, R: 1, C: 1 };

  it("⭐ the Treasure mode is offered on every player", () => {
    const s = pod(PRISMARI_COMMAND, MANA, { ai: [P("ring", SOL_RING, "ai1")] });
    // modes 2 + 3 (the Treasure and "Destroy target artifact"): the only player target is the Treasure mode's
    const treasureFor = [...new Set(casts(s).filter((a) => modes(a) === "2-3").flatMap((a) => (a.targets || []).filter((t) => t.type === "player").map((t) => t.id)))].sort();
    expect(treasureFor).toEqual(["ai1", "ai2", "ai3", "user"]);
  });

  it("⭐ 2 damage to the opponent's Bears and the caster creates a Treasure — theirs, untapped", () => {
    const s0 = pod(PRISMARI_COMMAND, MANA, { ai: [P("bears", GRIZZLY_BEARS, "ai1")] });
    const act = casts(s0).find((a) => modes(a) === "0-2" && a.targets.some((t) => t.id === "bears") && a.targets.some((t) => t.type === "player" && t.id === "user"));
    expect(act, "damage on the Bears + the Treasure for the caster").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    const treasure = s.players.user.battlefield.find((p) => p.card?.name === "Treasure");
    expect({ bears: !!findPermanent(s, "bears"), tokens: tokenRow(s, "user"), tapped: treasure?.tapped ?? null, aiTokens: tokenRow(s, "ai1") })
      .toEqual({ bears: false, tokens: [{ name: "Treasure", controller: "user", owner: "user" }], tapped: false, aiTokens: [] });
  });

  it("⭐ another player chosen: the Treasure is created under that player's control (CR 111.2)", () => {
    const s0 = pod(PRISMARI_COMMAND, MANA, { ai: [P("ring", SOL_RING, "ai1")] });
    const act = casts(s0).find((a) => modes(a) === "2-3" && a.targets.some((t) => t.id === "ring") && a.targets.some((t) => t.type === "player" && t.id === "ai2"));
    expect(act, "the Treasure for ai2 + destroy the Sol Ring").toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ ring: !!findPermanent(s, "ring"), user: tokenRow(s, "user"), ai2: tokenRow(s, "ai2") })
      .toEqual({ ring: false, user: [], ai2: [{ name: "Treasure", controller: "ai2", owner: "ai2" }] });
  });

  it("⭐ the ruling — one target gone, the rest still happens: the artifact left, the Treasure is still created", () => {
    const s0 = pod(PRISMARI_COMMAND, MANA, { ai: [P("ring", SOL_RING, "ai1")] });
    const act = casts(s0).find((a) => modes(a) === "2-3" && a.targets.some((t) => t.id === "ring") && a.targets.some((t) => t.type === "player" && t.id === "user"));
    expect(act).toBeTruthy();
    const cast = dispatchAction(s0, act);
    const gone = { ...cast, players: { ...cast.players, ai1: { ...cast.players.ai1, battlefield: [] } } };
    const s = settle(gone);
    expect(tokenRow(s, "user")).toEqual([{ name: "Treasure", controller: "user", owner: "user" }]);
  });
});

describe("Brigid's Command", () => {
  it("⭐ a Kithkin for the caster and +3/+3 on the Bears", () => {
    const s0 = pod(BRIGIDS_COMMAND, { G: 1, W: 1, C: 1 }, { user: [P("bears", GRIZZLY_BEARS)] });
    const act = casts(s0).find((a) => modes(a) === "1-2" && a.targets.some((t) => t.type === "player" && t.id === "user") && a.targets.some((t) => t.id === "bears"));
    expect(act).toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    const kithkin = s.players.user.battlefield.find((p) => p.card?.name === "Kithkin");
    const bears = findPermanent(s, "bears").permanent;
    expect({ kithkin: kithkin ? `${creaturePower(kithkin, s)}/${creatureToughness(kithkin, s)} ${[...(kithkin.card.colors || [])].sort().join("")}` : null, bears: `${creaturePower(bears, s)}/${creatureToughness(bears, s)}` })
      .toEqual({ kithkin: "1/1 GW", bears: "5/5" });
  });

  it("⭐ the Kithkin for an opponent: theirs", () => {
    const s0 = pod(BRIGIDS_COMMAND, { G: 1, W: 1, C: 1 }, { user: [P("bears", GRIZZLY_BEARS)] });
    const act = casts(s0).find((a) => modes(a) === "1-2" && a.targets.some((t) => t.type === "player" && t.id === "ai1") && a.targets.some((t) => t.id === "bears"));
    expect(act).toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ user: tokenRow(s, "user"), ai1: tokenRow(s, "ai1") }).toEqual({ user: [], ai1: [{ name: "Kithkin", controller: "ai1", owner: "ai1" }] });
  });
});
