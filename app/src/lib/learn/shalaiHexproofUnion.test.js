/**
 * SHALAI, VOICE OF PLENTY (EDHREC #1148) — "Flying / You, planeswalkers you control, and other creatures you control have hexproof. /
 * {4}{G}{G}: Put a +1/+1 counter on each creature you control." One static, three subjects: the player (CR 702.11c — "You can't be
 * the target of spells or abilities your opponents control"), each planeswalker they control and each OTHER creature they control
 * (CR 702.11b — "This permanent can't be the target of spells or abilities your opponents control"). "Other" leaves Shalai herself
 * targetable; hexproof stops only opponents, so Shalai's controller still targets their own.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

const SHALAI = {"name":"Shalai, Voice of Plenty","type":"Legendary Creature — Angel","mana":"{3}{W}","cmc":4,"power":"3","toughness":"4","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nYou, planeswalkers you control, and other creatures you control have hexproof.\n{4}{G}{G}: Put a +1/+1 counter on each creature you control."}; // body-only on 0fbdec14
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const JACE_BELEREN = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"power":null,"toughness":null,"keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const P = (id, card, controller, counters = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), counters });
/** `caster` holds a Lightning Bolt with {R} floating; the user controls Shalai (or not), a Bears and Jace; ai1 controls a Bears. */
function table(caster, { shalai = true } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const userBf = [...(shalai ? [P("shalai", SHALAI, "user")] : []), P("ubears", GRIZZLY_BEARS, "user"), P("jace", JACE_BELEREN, "user", { loyalty: 3 })];
  const pool = (pid) => ({ W: 0, U: 0, B: 0, R: pid === caster ? 1 : 0, G: 0, C: 0 });
  const hand = (pid) => (pid === caster ? [{ ...LIGHTNING_BOLT, id: "h-bolt" }] : []);
  return { ...s0, turn: 4, activePlayer: caster, priorityHolder: caster, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: userBf, hand: hand("user"), manaPool: pool("user") },
      ai1: { ...s0.players.ai1, battlefield: [P("abears", GRIZZLY_BEARS, "ai1")], hand: hand("ai1"), manaPool: pool("ai1") } } };
}
const boltTargets = (s, pid) => [...new Set(legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === "h-bolt").flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(SHALAI)).toBe("native-mixed");
  });
  it("⭐ three grants from the one sentence: the player's, the planeswalkers', the other creatures'; a keyword with no player op stays unread", () => {
    const line = (oracle) => parseStaticAbilities({ name: "Probe", type: "Creature — Angel", oracle }).map((d) => ({ op: d.op.layerOp, keyword: d.op.keyword ?? null, mode: d.affects.mode, ...(d.affects.selector ? { types: d.affects.selector.cardTypes, other: !!d.affects.selector.excludeSelf } : {}) }));
    expect({
      shalai: line("You, planeswalkers you control, and other creatures you control have hexproof."),
      flying: line("You, planeswalkers you control, and other creatures you control have flying."),
    }).toEqual({
      shalai: [
        { op: "playerHexproof", keyword: null, mode: "self" },
        { op: "addKeyword", keyword: "hexproof", mode: "dynamic", types: ["Planeswalker"], other: false },
        { op: "addKeyword", keyword: "hexproof", mode: "dynamic", types: ["Creature"], other: true },
      ],
      flying: [],
    });
  });
});

describe("the targets an opponent's Lightning Bolt may choose", () => {
  it("⭐ with Shalai: never her controller, their planeswalker or their other creature — Shalai herself, the opponent's own Bears and the other players still", () => {
    expect(boltTargets(table("ai1"), "ai1")).toEqual(["abears", "ai1", "ai2", "ai3", "shalai"]);
  });
  it("CONTROL — without Shalai the same Bolt may target all of them", () => {
    expect(boltTargets(table("ai1", { shalai: false }), "ai1")).toEqual(["abears", "ai1", "ai2", "ai3", "jace", "ubears", "user"]);
  });
  it("⭐ hexproof stops only opponents: Shalai's controller targets their own player, planeswalker and creatures", () => {
    expect(boltTargets(table("user"), "user")).toEqual(["abears", "ai1", "ai2", "ai3", "jace", "shalai", "ubears", "user"]);
  });
});
