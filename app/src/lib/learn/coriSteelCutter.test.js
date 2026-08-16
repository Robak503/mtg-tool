/**
 * coriSteelCutter.test.js — the PROWESS token + the OPTIONAL attach-to-minted (Cori-Steel Cutter, W9).
 *
 * Two arms, six riders (all whole-card audited — Monastery Mentor among them):
 *  ① the PROWESS token peel: "create a 1/1 white Monk creature token WITH PROWESS" — prowess is a
 *    TRIGGERED keyword, so it can't ride parseTokenKeywords' static allowlist (an inert stamp); the
 *    changeling convention mints the token with "Prowess" as its ORACLE, so the real prowess machinery
 *    fires its cast-pump like a printed card.
 *  ② ATTACH-SOURCE-TO-LAST-TOKEN: the Cutter's own-sentence "You may attach this Equipment to it" —
 *    split → α2 peels the may (a REAL yes/no: attaching yanks the Cutter off its current host) → the
 *    atom reads the _lastMintedTokenIds stamp ∩ alive. The MANDATORY "and attach this Equipment to it"
 *    (Auxiliary Boosters) rides the same atom un-optionally. The sequence gate
 *    (attachLastTokenSequenceOk) refuses the atom without a preceding create-token in the program.
 *    The legacy auto-policy: attach iff the Equipment is currently UNATTACHED (never the blind
 *    always-take that would strip the current wearer).
 *
 * Mutation-checked (all via Edit): the prowess peel → the token-oracle pin dies; the attach arm → the
 * program pins die; the sequence-gate chain → the bare-attach LOW pin dies; the policy guard → the
 * attached-holds pin dies.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyCreateToken, applyAttachSourceToLastToken } from "./effects/atoms/tokens.js";
import { optionalAutoTakeValue } from "./effects/runProgram.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CUTTER_CLAUSE = "create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it";

function st(userBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf } } };
}
const equip = (id, attachedTo = null) => ({
  ...createPermanent({ id, controller: "user", card: { id: `c-${id}`, name: "Cori-Steel Cutter", type: "Artifact — Equipment", oracle: "Equipped creature gets +1/+1 and has trample and haste." } }),
  attachedTo,
});

describe("Cutter — parse + classify", () => {
  it("MUST STAY HIGH: [create-token, optional attach]; the token carries the PROWESS oracle", () => {
    const p = parseEffectClause(CUTTER_CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["create-token", "attach-source-to-last-token"]);
    expect(p.atoms[0].tokenOracle).toBe("Prowess");   // the peel (mutation-check line)
    expect(p.atoms[1].optional).toBe(true);           // the α2 yes/no — a REAL choice
  });
  it("the MANDATORY 'and attach' form (Auxiliary Boosters) rides the same atom UN-optionally", () => {
    const p = parseEffectClause("create a 2/2 colorless Robot artifact creature token and attach this Equipment to it", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["create-token", "attach-source-to-last-token"]);
    expect(p.atoms[1].optional).toBeUndefined();
  });
  it("SEQUENCE GATE: the attach ALONE stays LOW (no preceding create-token — never a silent no-op native)", () => {
    expect(programConfidence(parseEffectClause("you may attach this equipment to it", "Instant", { sourceScoped: true }))).toBe("low");
  });
  it("the carriers classify native (whole-card audited)", () => {
    expect(classifyCard({ name: "Cori-Steel Cutter", type: "Artifact — Equipment", mana: "{1}{R}",
      oracle: "Equipped creature gets +1/+1 and has trample and haste.\nFlurry — Whenever you cast your second spell each turn, create a 1/1 white Monk creature token with prowess. You may attach this Equipment to it.\nEquip {1}{R}" })).toBe("native-mixed");
    expect(classifyCard({ name: "Monastery Mentor", type: "Creature — Human Monk", power: 2, toughness: 2,
      oracle: "Prowess\nWhenever you cast a noncreature spell, create a 1/1 white Monk creature token with prowess." })).toBe("native-trigger");
  });
});

describe("Cutter — the runtime (stamp → attach → policy)", () => {
  it("the mint stamps _lastMintedTokenIds; the attach lands the Equipment on the token; the token's oracle IS Prowess", () => {
    let s = st([equip("eq")]);
    s = applyCreateToken(s, { op: "create-token", count: 1, power: 1, toughness: 1, descriptor: "white monk", tokenOracle: "Prowess" }, { controller: "user", sourceId: "eq" });
    expect(Array.isArray(s._lastMintedTokenIds) && s._lastMintedTokenIds.length === 1).toBe(true);
    const tokenId = s._lastMintedTokenIds[0];
    expect(findPermanent(s, tokenId).permanent.card.oracle).toMatch(/Prowess/); // the REAL prowess carrier
    const after = applyAttachSourceToLastToken(s, { op: "attach-source-to-last-token" }, { controller: "user", sourceId: "eq" });
    expect(findPermanent(after, "eq").permanent.attachedTo).toBe(tokenId);       // the attach (mutation-check line)
  });
  it("no stamp / vanished token → a clean no-op (never a blind attach)", () => {
    const s = st([equip("eq")]);
    const after = applyAttachSourceToLastToken(s, { op: "attach-source-to-last-token" }, { controller: "user", sourceId: "eq" });
    expect(findPermanent(after, "eq").permanent.attachedTo).toBe(null);
  });
  it("the AUTO-POLICY: an UNATTACHED Cutter takes the attach; an ATTACHED one HOLDS (never strips its wearer)", () => {
    const wearer = createPermanent({ id: "w", controller: "user", card: { id: "c-w", name: "Wearer", type: "Creature — Bear", power: 2, toughness: 2 } });
    const free = st([equip("eq")]);
    expect(optionalAutoTakeValue(free, { kind: "optional-effect", controller: "user", effectOp: "attach-source-to-last-token", resume: { sourceId: "eq" } })).toBe(true);
    const worn = st([{ ...wearer, attachments: ["eq"] }, equip("eq", "w")]);
    expect(optionalAutoTakeValue(worn, { kind: "optional-effect", controller: "user", effectOp: "attach-source-to-last-token", resume: { sourceId: "eq" } })).toBe(false); // the hold (mutation-check line)
  });
});
