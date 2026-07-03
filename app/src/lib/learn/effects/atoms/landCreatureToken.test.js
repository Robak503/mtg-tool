/**
 * ===== LAND-CREATURE-TOKEN (CR 305.6) ===== a basic-land-subtype land creature token (Awaken the Woods'
 * "1/1 green Forest Dryad land creature token") functions as a REAL Forest: the parser mints it with the
 * intrinsic "{T}: Add <color>" ability of its basic subtype (tokenOracle), so manaModel taps it for the
 * right color with no special-casing — the shipped T4 "ability-carrying token" pattern.
 *
 * CREED: the flip is admitted ONLY for a land token with EXACTLY ONE basic-land subtype whose intrinsic
 * mana color is known. A "land" token with no basic subtype (bare Dryad/Saproling land), multiple basic
 * subtypes (a dual "Forest Island" token — a color choice the single-color line can't model), or a "with
 * <keyword>" rider (which would collide with the mana line) all stay LOW → Arbiter (whole card or nothing).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { applyCreateToken } from "./tokens.js";
import { parseEffectProgram, programConfidence } from "../parser.js";
import { _resetIdsForTests, createGameState } from "../../gameState.js";
import { manaSources } from "../../manaModel.js";

beforeEach(() => _resetIdsForTests());

function freshState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
}

const X = (oracle, mana) => ({ type: "Sorcery", oracle, mana });
const I = (oracle) => ({ type: "Instant", oracle, mana: "{G}" });

describe("LAND-CREATURE-TOKEN — parse (Awaken the Woods)", () => {
  it("flips HIGH: X-count Forest Dryad land token carries its intrinsic {G} mana ability", () => {
    const p = parseEffectProgram(X("Create X 1/1 green Forest Dryad land creature tokens.", "{X}{G}{G}"));
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "create-token", power: 1, toughness: 1,
      descriptor: "green forest dryad land", tokenOracle: "({T}: Add {G}.)", countX: true,
    });
  });

  it("maps each basic subtype to its color (Mountain → {R}, Island → {U}, Plains → {W}, Swamp → {B})", () => {
    const oracleOf = (sub) => parseEffectProgram(I(`Create a 1/1 green ${sub} Dryad land creature token.`)).atoms[0]?.tokenOracle;
    expect(oracleOf("Mountain")).toBe("({T}: Add {R}.)");
    expect(oracleOf("Island")).toBe("({T}: Add {U}.)");
    expect(oracleOf("Plains")).toBe("({T}: Add {W}.)");
    expect(oracleOf("Swamp")).toBe("({T}: Add {B}.)");
  });

  it("CREED near-miss: a land token with NO basic subtype stays LOW → Arbiter", () => {
    expect(programConfidence(parseEffectProgram(I("Create two 1/1 green Saproling land creature tokens.")))).toBe("low");
    expect(programConfidence(parseEffectProgram(I("Create a 0/1 green Dryad land creature token for each Forest you control.")))).toBe("low");
  });

  it("CREED near-miss: a MULTI-basic ('Forest Island') land token stays LOW (a color choice can't be modeled)", () => {
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 green Forest Island Dryad land creature token.")))).toBe("low");
  });

  it("CREED near-miss: a basic-land token with a 'with <keyword>' rider stays LOW (rider collides with mana line)", () => {
    expect(programConfidence(parseEffectProgram(I("Create a 1/1 green Forest Dryad land creature token with flying.")))).toBe("low");
  });
});

describe("LAND-CREATURE-TOKEN — runtime (the token functions as a Forest)", () => {
  it("mints an X/count of Land Creature tokens that tap for {G} once summoning sickness clears", () => {
    let state = freshState();
    const atom = { op: "create-token", power: 1, toughness: 1, descriptor: "green forest dryad land", tokenOracle: "({T}: Add {G}.)", targetType: null, countX: true };
    state = applyCreateToken(state, atom, { controller: "user", xValue: 3 });
    const bf = state.players.user.battlefield;
    expect(bf).toHaveLength(3);
    expect(bf[0].card.type).toBe("Token Land Creature — Forest Dryad");
    expect(bf[0].card.oracle).toBe("({T}: Add {G}.)");
    expect([bf[0].card.power, bf[0].card.toughness]).toEqual([1, 1]);

    // CR 302.6 — a freshly-created creature token is summoning sick, so its {T} mana ability is unusable
    // this turn (Awaken's reminder text says so explicitly). manaSources reports none.
    expect(manaSources(state, "user")).toHaveLength(0);

    // Next turn (sickness cleared): each token is a real {G} source.
    for (const perm of bf) perm.summoningSick = false;
    const srcs = manaSources(state, "user");
    expect(srcs).toHaveLength(3);
    for (const s of srcs) expect(s.colors).toEqual(["G"]);
  });

  it("X=0 mints ZERO tokens (CR 107.3 — a clean no-op)", () => {
    let state = freshState();
    const atom = { op: "create-token", power: 1, toughness: 1, descriptor: "green forest dryad land", tokenOracle: "({T}: Add {G}.)", targetType: null, countX: true };
    state = applyCreateToken(state, atom, { controller: "user", xValue: 0 });
    expect(state.players.user.battlefield).toHaveLength(0);
  });
});
