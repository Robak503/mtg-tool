/**
 * attachToCreatedToken.test.js — "create a token, then attach this Equipment to it" (CR 701.3), slice 13.
 *
 * The spelled-out form of what Living Weapon / For Mirrodin! do as a keyword. The keyword forms mint a FIXED
 * token inside resolvers.enterPermanent; these print their token spec, so they route through the ordinary
 * create-token atom and only the rider had to survive.
 *
 * DELIBERATELY NOT routed through livingWeaponToken: these cards carry a REAL printed trigger sentence, so
 * minting from the keyword path too would create the token TWICE as soon as the clause parsed HIGH.
 *
 * Needed the keep-whole guard AGAIN (third time this shift): ", then" is not an effect boundary here — "it"
 * is the token the same clause mints — so the top-level split stranded "attach this Equipment to it" as an
 * unbindable clause and the parse stayed LOW.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { splitClauses } from "./effects/splitClauses.js";
import { createTokenClauseParser, applyCreateToken } from "./effects/atoms/tokens.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const RIDER = "create a 1/1 white Soldier creature token, then attach this Equipment to it";

describe("parse", () => {
  it("the joined sentence survives the top-level split", () => {
    expect(splitClauses(RIDER)).toEqual([RIDER]);
  });

  it("the rider peels and stamps attachSourceToCreated on the create-token atom", () => {
    expect(createTokenClauseParser(RIDER)).toMatchObject({
      op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier", attachSourceToCreated: true,
    });
  });

  it("the bare create-token clause is untouched (no flag invented)", () => {
    const bare = createTokenClauseParser("create a 1/1 white Soldier creature token");
    expect(bare.op).toBe("create-token");
    expect(bare.attachSourceToCreated).toBeUndefined();
  });

  it("CREED — a MULTI-token clause parks: \"it\" presupposes exactly one token", () => {
    expect(createTokenClauseParser("create two 1/1 white Soldier creature tokens, then attach this Equipment to it")).toBeNull();
  });

  it("CREED — a DYNAMIC count parks for the same reason", () => {
    expect(createTokenClauseParser("create X 1/1 white Soldier creature tokens, then attach this Equipment to it")).toBeNull();
  });
});

describe("classification", () => {
  const eq = (name, lines) => ({ name, type: "Artifact — Equipment", mana: "{2}", oracle: lines.join("\n") });
  it("Ancestral Blade flips native-equipment", () => {
    expect(classifyCard(eq("Ancestral Blade", [
      "When this Equipment enters, create a 1/1 white Soldier creature token, then attach this Equipment to it.",
      "Equipped creature gets +1/+1.", "Equip {2}"]))).toBe("native-equipment");
  });
  it("a keyworded token spec still flips (Barbed Spike's flying Thopter)", () => {
    expect(classifyCard(eq("Barbed Spike", [
      "When this Equipment enters, create a 1/1 blue Thopter artifact creature token with flying, then attach this Equipment to it.",
      "Equipped creature gets +1/+0.", "Equip {3}"]))).toBe("native-equipment");
  });
});

describe("RUNTIME — the token is minted AND the Equipment really lands on it", () => {
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const equip = createPermanent({ id: "eq", controller: "user",
      card: { id: "c-eq", name: "Ancestral Blade", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1." } });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [equip] } } };
  }
  const atom = { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white soldier", attachSourceToCreated: true };

  it("mints exactly one token and attaches the source Equipment to it", () => {
    const out = applyCreateToken(board(), atom, { controller: "user", sourceId: "eq" });
    const bf = out.players.user.battlefield;
    const tokens = bf.filter((p) => p.card?.token);
    expect(tokens).toHaveLength(1);
    const equip = bf.find((p) => p.id === "eq");
    expect(equip.attachedTo).toBe(tokens[0].id);   // the Equipment moved onto the token it just made
  });

  it("WITHOUT the flag the token is minted but nothing is attached", () => {
    const { attachSourceToCreated, ...bare } = atom; // eslint-disable-line no-unused-vars
    const out = applyCreateToken(board(), bare, { controller: "user", sourceId: "eq" });
    expect(out.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(1);
    expect(out.players.user.battlefield.find((p) => p.id === "eq").attachedTo).toBeFalsy();
  });

  it("no source on the context → the token still enters, nothing attaches (no crash, no fabrication)", () => {
    const out = applyCreateToken(board(), atom, { controller: "user" });
    expect(out.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(1);
    expect(out.players.user.battlefield.find((p) => p.id === "eq").attachedTo).toBeFalsy();
  });
});
