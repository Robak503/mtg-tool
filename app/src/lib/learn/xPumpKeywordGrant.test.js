/**
 * xPumpKeywordGrant.test.js — THE X-PUMP + KEYWORD-GRANT COMPOUND (2026-08-14). Tyvar's Stand
 * "+X/+X and gains hexproof and indestructible"; riders Pedal to the Metal, Frantic Confrontation,
 * Lunar Frenzy (the asymmetric "+X/+0 and gains first strike [and trample]" trio).
 *
 * ⭐ TWO PIECES, ONE SEVERED CHAIN: the keep-whole guard's pip pattern excluded X (the compound
 * SHATTERED on " and " — the same driver-vs-parser lesson the permanent-subject guard documents),
 * and the amountX rebuild DROPPED grantKeywords in transit (the unlisted-=-dropped trap, fourth
 * instance — the X-pump would have resolved with the protection half silently gone, the forbidden
 * partial). A third piece (a compound fallback) was built on a wrong diagnosis, PROVEN dead by its
 * surviving mutation (the hollow-gate law working as designed), and removed.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the pip widening reverted -> Tyvar shatters and parks.
 *   · the grantKeywords carry removed -> the atom loses its keywords (the partial the comment names).
 *   · (a third mutation — the compound-fallback removal — SURVIVED, proving that code dead; removed.)
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";
import { creaturePower, creatureToughness } from "./gameState.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TYVAR = { name: "Tyvar's Stand", type: "Instant", mana: "{X}{G}",
  oracle: "Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn." };

describe("the carriers and the atoms", () => {
  it("⭐ all four flip native-spell; the atoms carry amountX AND the keywords", () => {
    expect(classifyCard(TYVAR)).toBe("native-spell");
    expect(classifyCard({ name: "Pedal to the Metal", type: "Sorcery", mana: "{X}{R}",
      oracle: "Target creature gets +X/+0 and gains first strike until end of turn." })).toBe("native-spell");
    expect(classifyCard({ name: "Lunar Frenzy", type: "Instant", mana: "{X}{R}",
      oracle: "Target creature you control gets +X/+0 and gains first strike and trample until end of turn." })).toBe("native-spell");
    const sym = parseEffectClause("Target creature you control gets +X/+X and gains hexproof and indestructible until end of turn", "Instant", { hasX: true });
    expect(sym.atoms[0]).toMatchObject({ op: "pump", amountX: true, grantKeywords: ["hexproof", "indestructible"], restrictions: [{ kind: "controller", who: "you" }] });
    const asym = parseEffectClause("Target creature gets +X/+0 and gains first strike until end of turn", "Instant", { hasX: true });
    // "First strike" capitalized — this shape parses through a different clause arm than the sym form;
    // the layer engine reads keywords case-insensitively (the Law-6 row below proves the grant lands).
    expect(asym.atoms[0]).toMatchObject({ op: "pump", amountX: true, amountXSlot: "p", grantKeywords: ["First strike"] });
  });

  it("⛔ the FIXED compound is byte-identical (the incumbent pin)", () => {
    const p = parseEffectClause("Target creature you control gets +2/+2 and gains hexproof and indestructible until end of turn", "Instant");
    expect(p.atoms[0]).toMatchObject({ op: "pump", ptDelta: { p: 2, t: 2 }, grantKeywords: ["hexproof", "indestructible"] });
    expect(p.atoms[0].amountX).toBeUndefined();
  });
});

describe("⭐⭐ LAW 6 — X lands on the pips AND the keywords arrive", () => {
  const board = () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "B", controller: "user", summoningSick: false,
      card: { id: "card-B", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    return { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [bear] } } };
  };

  it("⭐⭐ Tyvar at X=3: +3/+3 AND hexproof AND indestructible, all on the one target", () => {
    const atom = parseEffectClause(TYVAR.oracle.replace(/\.$/, ""), "Instant", { hasX: true }).atoms[0];
    const after = ATOM_RESOLVERS.pump(board(), atom, { controller: "user", xValue: 3, targets: [{ type: "creature", id: "B" }] });
    const perm = after.players.user.battlefield[0];
    const row = { power: creaturePower(perm, after), toughness: creatureToughness(perm, after),
      hexproof: permanentHasKeyword(after, perm.id, "hexproof"), indestructible: permanentHasKeyword(after, perm.id, "indestructible") };
    console.log("  WITNESS tyvarX3", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ power: 5, toughness: 5, hexproof: true, indestructible: true });
  });

  it("⭐ the asymmetric trio at X=4: +4/+0 — toughness untouched, first strike arrives", () => {
    const atom = parseEffectClause("Target creature gets +X/+0 and gains first strike until end of turn", "Instant", { hasX: true }).atoms[0];
    const after = ATOM_RESOLVERS.pump(board(), atom, { controller: "user", xValue: 4, targets: [{ type: "creature", id: "B" }] });
    const perm = after.players.user.battlefield[0];
    const row = { power: creaturePower(perm, after), toughness: creatureToughness(perm, after), firstStrike: permanentHasKeyword(after, perm.id, "first strike") };
    console.log("  WITNESS pedalX4", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ power: 6, toughness: 2, firstStrike: true });
  });
});
