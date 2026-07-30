/**
 * yourTurnGroupGrant.test.js — "During your turn, <group> you control have <keyword>" (CR 611.2 continuous
 * effect with a turn-window condition). Anara, Wolvid Familiar · Bedrock Tortoise · Bayek of Siwa ·
 * Sokka's Charge.
 *
 * ⭐ BOTH HALVES ALREADY EXISTED AND HAD NEVER MET. The group grant emits a `dynamic` selector descriptor,
 * and `gate:{kind:"yourTurn"}` is the SAME gate the SELF forms have used since BLITZ ST-2 ("During your turn,
 * this creature has first strike") — layers.gateMet reads `state.activePlayer === controller`, and
 * permanentHasKeyword / keywordSet both honour `op.gate`. Only the COMBINATION was unreachable. So this arm
 * does no new parsing and invents no new gate: it strips the time prefix, runs the clause through the
 * existing group-grant parser, and stamps the existing gate on whatever came back.
 *
 * ⛔ ALL-OR-NOTHING: the inner parse must return ≥1 descriptor and every one must be an UNGATED layer-6
 * addKeyword. Anything else (a P/T buff, an already-gated descriptor, nothing at all) emits nothing and the
 * clause stays residue → body-only. That is what stops "During your turn, creatures you control get +1/+1"
 * — a different lane entirely — from being silently mis-gated.
 *
 * ⭐ THE RUNTIME BLOCK IS THE POINT, AND IT IS NOT INFERRED FROM THE SELF FORM. A gate proven on
 * `affects:{mode:"self"}` says nothing about a `dynamic` group selector: the gate has to resolve the right
 * CONTROLLER for permanents that are not the source. Measured in all four quadrants below.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANARA = { name: "Anara, Wolvid Familiar", type: "Legendary Creature — Wolf Beast", power: "3", toughness: "4", mana: "{2}{G}",
  oracle: "During your turn, commanders you control have indestructible. (Effects that say \"destroy\" don't destroy them. A creature with indestructible can't be destroyed by damage.)\nPartner (You can have two commanders if both have partner.)" };
const BEDROCK_TORTOISE = { name: "Bedrock Tortoise", type: "Creature — Turtle", power: "2", toughness: "5", mana: "{2}{G}",
  oracle: "During your turn, creatures you control have hexproof.\nEach creature you control with toughness greater than its power assigns combat damage equal to its toughness rather than its power." };
const TORTOISE_LINE = "During your turn, creatures you control have hexproof.";

function board(activePlayer) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const src = createPermanent({ id: "src", card: { id: "c-src", name: "Bedrock Tortoise", type: "Creature — Turtle", power: "2", toughness: "5", oracle: TORTOISE_LINE }, controller: "user" });
  const mine = createPermanent({ id: "mine", card: { id: "c-m", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" });
  const theirs = createPermanent({ id: "theirs", card: { id: "c-t", name: "Ogre", type: "Creature — Ogre", power: "3", toughness: "3", oracle: "" }, controller: "ai" });
  return { ...s0, activePlayer,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [src, mine] }, ai: { ...s0.players.ai, battlefield: [theirs] } } };
}

describe("the parser stamps the EXISTING gate onto the EXISTING group descriptor", () => {
  it("emits one gated layer-6 addKeyword over the group selector", () => {
    expect(parseStaticAbilities({ name: "Anara", type: "Legendary Creature — Wolf", oracle: "During your turn, commanders you control have indestructible." }))
      .toEqual([{
        layer: 6,
        op: { layerOp: "addKeyword", keyword: "indestructible", gate: { kind: "yourTurn" } },
        affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: [], commanderOnly: true } },
        duration: { kind: "permanent" },
      }]);
  });

  it("the UNGATED form is byte-identical apart from the gate (nothing else was touched)", () => {
    const gated = parseStaticAbilities({ name: "X", type: "Creature — Wolf", oracle: "During your turn, creatures you control have hexproof." });
    const plain = parseStaticAbilities({ name: "X", type: "Creature — Wolf", oracle: "Creatures you control have hexproof." });
    expect(plain).toHaveLength(1);
    expect(gated[0].affects).toEqual(plain[0].affects);
    expect(gated[0].op).toEqual({ ...plain[0].op, gate: { kind: "yourTurn" } });
  });

  // ⚠️ THIS ASSERTS LESS THAN IT LOOKS LIKE IT DOES, and the comment is here so nobody reads it as more.
  // A "get +N/+N" clause never reaches the new arm at all — the anchor requires "have|has" — so this pins
  // that the arm keeps its hands off a neighbouring lane, NOT that the all-or-nothing type check works.
  // That check is defensive and currently unexercisable (every parseable "…you control have <X>" clause
  // yields addKeyword today), which is recorded in staticAbilityParser rather than implied by a green test.
  it("⛔ a 'get +N/+N' group buff is a different lane and is left alone", () => {
    expect(parseStaticAbilities({ name: "X", type: "Creature — Wolf", oracle: "During your turn, creatures you control get +1/+1." })).toEqual([]);
  });

  it("⛔ an ungrantable keyword word emits nothing (this one IS live — the inner parse returns [])", () => {
    expect(parseStaticAbilities({ name: "X", type: "Creature — Wolf", oracle: "During your turn, creatures you control have widgetry." })).toEqual([]);
  });
});

describe("⭐ RUNTIME — all four quadrants, because a self-scoped gate proves nothing about a group selector", () => {
  it("MY turn: my creatures have it", () => {
    expect(permanentHasKeyword(board("user"), "mine", "hexproof")).toBe(true);
  });

  it("⛔ THEIR turn: my creatures lose it — the gate really flips at the turn boundary", () => {
    expect(permanentHasKeyword(board("ai"), "mine", "hexproof")).toBe(false);
  });

  it("⛔ the OPPONENT's creatures never get it, on either turn ('you control' holds)", () => {
    expect(permanentHasKeyword(board("user"), "theirs", "hexproof")).toBe(false);
    expect(permanentHasKeyword(board("ai"), "theirs", "hexproof")).toBe(false);
  });

  it("the SOURCE is inside its own group on its controller's turn", () => {
    expect(permanentHasKeyword(board("user"), "src", "hexproof")).toBe(true);
    expect(permanentHasKeyword(board("ai"), "src", "hexproof")).toBe(false);
  });
});

describe("coverage", () => {
  it("Anara and Bedrock Tortoise flip", () => {
    expect(classifyCard(ANARA)).toBe("native-static");
    expect(classifyCard(BEDROCK_TORTOISE)).toBe("native-static");
  });

  it("⛔ an unmodeled companion line still parks the card", () => {
    expect(classifyCard({ ...BEDROCK_TORTOISE, name: "Fake Tortoise",
      oracle: `${TORTOISE_LINE}\nWhenever a player consults an oracle, interpret its riddle however you like.` }))
      .not.toMatch(/^native/);
  });
});
