/**
 * springheartLandfall.test.js — Springheart Nantuko's landfall rider, end to end.
 *
 * "Landfall — Whenever a land you control enters, you may pay {1}{G} if this permanent is attached to a
 *  creature you control. If you do, create a token that's a copy of that creature. If you didn't create a
 *  token this way, create a 1/1 green Insect creature token."
 *
 * Three printed sentences that mean ONE thing, so they are matched whole, before the clause splitter:
 *   - "that creature" is the ATTACHED host. On almost every other card it means something else, so the
 *     referent is reachable ONLY through this anchored shape — never as a general rewrite.
 *   - the Insect is not a third effect; it is the ELSE of the payment. Split off, a card could make BOTH.
 *
 * ⭐ EXACTLY ONE TOKEN ON EVERY PATH, AND THE RIGHT ONE. Paid → a copy of the host. Declined → an Insect.
 * Unattached → an Insect, with the payment unpayable. "Both tokens" and "no token" are the two ways this
 * card can be wrong, and each has a test.
 *
 * ⚠️ THE PROGRAM IS PARSED INSIDE THE TEST BODY, NEVER AT MODULE SCOPE. A first attempt built it with a
 * module-level `const PROGRAM = parseEffectClause(...)`, which runs at IMPORT time — before parser.js has
 * finished its registerClauseParser calls. The program came back empty, no pending choice ever surfaced,
 * and the whole build was reverted on a diagnosis of "unproven runtime" that was really a test-file
 * initialisation-order bug. The engine was fine the entire time.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveOptionalManaPaymentChoice, runEffectProgram } from "./effects/runProgram.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPRINGHEART = { name: "Springheart Nantuko", type: "Enchantment Creature — Insect Monk", power: "1", toughness: "1", mana: "{1}{G}",
  oracle: "Bestow {1}{G}\nEnchanted creature gets +1/+1.\nLandfall — Whenever a land you control enters, you may pay {1}{G} if this permanent is attached to a creature you control. If you do, create a token that's a copy of that creature. If you didn't create a token this way, create a 1/1 green Insect creature token." };
const CLAUSE = "you may pay {1}{G} if this permanent is attached to a creature you control. If you do, create a token that's a copy of that creature. If you didn't create a token this way, create a 1/1 green Insect creature token";

const HOST = { id: "host-c", name: "Rampaging Baloths", type: "Creature — Beast", mana: "{4}{G}{G}", oracle: "" };
// Lands carry an explicit mana ability — the shape the working optional-payment harness uses.
const forest = (i) => createPermanent({ id: `F${i}`, card: { id: `cF${i}`, name: "Forest", type: "Land", oracle: "{T}: Add {G}." }, controller: "user" });

function board({ attached, forests }) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const host = createPermanent({ id: "host", card: HOST, controller: "user", summoningSick: false });
  const self = { ...createPermanent({ id: "spring", card: { ...SPRINGHEART, id: "spring-c" }, controller: "user", summoningSick: false }),
    ...(attached ? { attachedTo: "host" } : {}) };
  const bf = [host, self, ...Array.from({ length: forests }, (_, i) => forest(i))];
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
/** Offer the payment through the REAL program path, then answer it. */
function run(state, pay) {
  const program = parseEffectClause(CLAUSE, "Instant");   // parsed HERE, not at module scope
  const paused = runEffectProgram(state, {
    source: { name: "Springheart Nantuko" },
    payload: { params: { program, controller: "user", targets: [], sourceId: "spring", context: {} } },
  });
  return resolveOptionalManaPaymentChoice(paused, pay);
}
const tokens = (s) => s.players.user.battlefield.filter((p) => p.card?.token);

describe("⭐ EXACTLY ONE TOKEN, AND THE RIGHT ONE", () => {
  it("VACUITY CONTROL: the clause parses and the board starts empty of tokens", () => {
    expect(parseEffectClause(CLAUSE, "Instant")?.atoms?.map((a) => a.op)).toEqual(["optional-mana-payment"]);
    expect(tokens(board({ attached: true, forests: 2 }))).toHaveLength(0);
  });

  it("the payment is actually OFFERED (the pause surfaces)", () => {
    const program = parseEffectClause(CLAUSE, "Instant");
    const paused = runEffectProgram(board({ attached: true, forests: 2 }), {
      source: { name: "Springheart Nantuko" },
      payload: { params: { program, controller: "user", targets: [], sourceId: "spring", context: {} } },
    });
    expect(paused.pendingChoice).toMatchObject({ kind: "optional-mana-payment", controller: "user", available: true });
    expect(paused.pendingChoice.elseAtoms.map((a) => a.op)).toEqual(["create-token"]);
  });

  it("⭐ attached + PAY → one token that copies the HOST, not Springheart", () => {
    const s = run(board({ attached: true, forests: 2 }), true);
    const t = tokens(s);
    expect(t).toHaveLength(1);
    expect(t[0].card.name).toBe("Rampaging Baloths");
  });

  it("attached + DECLINE → one 1/1 Insect, and NOT a copy", () => {
    const s = run(board({ attached: true, forests: 2 }), false);
    const t = tokens(s);
    expect(t).toHaveLength(1);
    expect(t[0].card.name).not.toBe("Rampaging Baloths");
  });

  it("⛔ NOT attached → the Insect, and the payment cannot be made even when answered 'pay'", () => {
    const s = run(board({ attached: false, forests: 5 }), true);
    expect(tokens(s)).toHaveLength(1);
    expect(tokens(s)[0].card.name).not.toBe("Rampaging Baloths");
    expect(s.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(0);   // no mana spent
  });

  it("⛔ attached but CANNOT AFFORD → the Insect, never both tokens", () => {
    expect(tokens(run(board({ attached: true, forests: 0 }), true))).toHaveLength(1);
  });

  it("paying actually spends the mana", () => {
    const s = run(board({ attached: true, forests: 2 }), true);
    expect(s.players.user.battlefield.filter((p) => p.tapped)).toHaveLength(2);
  });
});

describe("the corpus row", () => {
  it("⭐ Springheart Nantuko flips — the last card on Colton's shelf", () => {
    expect(classifyCard(SPRINGHEART)).toBe("native-aura");
  });
});
