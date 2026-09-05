/**
 * DEPLOY THE GATEWATCH — the COUNTED dig onto the battlefield. SHELF-85 · Atraxa A3, 2026-09-05.
 * "Look at the top seven cards of your library. Put up to two planeswalker cards from among them onto the battlefield.
 * Put the rest on the bottom of your library in a random order."
 *
 * The dig-to-battlefield frame (④-C, Kinnan) read ONE pick. The impulse-dig settler already re-raises the choice until
 * `keep` cards are picked and enters each — a decline ends the picking, which is exactly "up to". The new arm is that
 * frame with a keep count from the up-to-N word table; the type goes through the same tutor filter.
 *
 * Mutation-checked: see the run ledger (docs-sk82).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram, resolveImpulseDigChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TEXT = "Look at the top seven cards of your library. Put up to two planeswalker cards from among them onto the battlefield. Put the rest on the bottom of your library in a random order.";
const DEPLOY = { id: "c-dtg", name: "Deploy the Gatewatch", type: "Sorcery", mana: "{4}{W}{W}", keywords: [], oracle: TEXT };
const PW = (i) => ({ id: `pw${i}`, name: `Spark ${i}`, type: "Legendary Planeswalker — Test", mana: "{3}{W}", loyalty: "4", keywords: [], oracle: "+1: You gain 2 life." });
const SORC = (i) => ({ id: `s${i}`, name: `Sorcery ${i}`, type: "Sorcery", mana: "{1}", keywords: [], oracle: "" });

function state(library) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, library } } };
}
function resolve(st, picks) {
  const program = parseEffectClause(TEXT, "Sorcery");
  const out = runEffectProgram(st, { source: { name: "Deploy the Gatewatch" }, payload: { params: { program, controller: "user", sourceId: "src", context: {}, targets: [] } } });
  let next = out?.state ?? out;
  for (const id of picks) { expect(next.pendingChoice?.kind).toBe("impulse-dig"); next = resolveImpulseDigChoice(next, id); }
  return { battlefield: next.players.user.battlefield.map((p) => [p.card.id, p.counters?.loyalty]), library: next.players.user.library.map((c) => c.id), pending: next.pendingChoice?.kind || null };
}

describe("the parser — the counted frame", () => {
  it("reads seven looked at, keep two, the planeswalker filter, the battlefield, and the random rest; an unlisted type word parks", () => {
    const p = parseEffectClause(TEXT, "Sorcery");
    const row = { atoms: p?.atoms, tier: classifyCard(DEPLOY) };
    console.log("  WITNESS deployParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "impulse-dig", amount: 7, keep: 2, chosenTo: "battlefield", restTo: "bottom", restOrder: "random", filter: { groups: [["planeswalker"]] } });
    expect(row.tier).toBe("native-spell");
    expect(classifyCard({ ...DEPLOY, oracle: TEXT.replace("planeswalker", "widget") })).not.toMatch(/^native/);
  });
});

describe("RUNTIME — up to two picks, each through the real entry path", () => {
  it("two walkers among the top seven both enter with their printed loyalty; the other five go to the bottom; nothing stays pending", () => {
    const lib = [SORC(1), PW(1), SORC(2), SORC(3), PW(2), SORC(4), SORC(5), SORC(9)];
    const r = resolve(state(lib), ["pw1", "pw2"]);
    console.log("  WITNESS deployRuntime", JSON.stringify(r)); // vitest 4 needs --disable-console-intercept
    expect(r.battlefield).toEqual([["pw1", 4], ["pw2", 4]]);
    expect(r.library).toHaveLength(6);
    expect(r.library[0]).toBe("s9"); // the untouched eighth card is now the top; the five rest are below it
    expect(r.library.slice(1).sort()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(r.pending).toBeNull();
  });

  it("declining after one pick enters one and bottoms the other six", () => {
    const lib = [SORC(1), PW(1), SORC(2), SORC(3), PW(2), SORC(4), SORC(5), SORC(9)];
    const r = resolve(state(lib), ["pw1", "decline"]);
    expect(r.battlefield).toEqual([["pw1", 4]]);
    expect(r.library).toHaveLength(7);
    expect(r.library[0]).toBe("s9");
    expect(r.pending).toBeNull();
  });

  it("HOLLOW CLOSED — the non-cast entry path stamps starting loyalty through the same reader as a cast: under Oath of Gideon a dug walker enters with 5", () => {
    const OATH = { id: "c-oath", name: "Oath of Gideon", type: "Legendary Enchantment", mana: "{2}{W}", keywords: [],
      oracle: "When Oath of Gideon enters, create two 1/1 white Kor Ally creature tokens.\nEach planeswalker you control enters with an additional loyalty counter on it." };
    const st = state([PW(1), SORC(1), SORC(2), SORC(3), SORC(4), SORC(5), SORC(6)]);
    const oathBoard = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [{ id: "oath", card: OATH, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null }] } } };
    const r = resolve(oathBoard, ["pw1"]);
    expect(r.battlefield.find(([id]) => id === "pw1")).toEqual(["pw1", 5]);
  });

  it("no walker among the top seven: no picker, all seven to the bottom", () => {
    const lib = [SORC(1), SORC(2), SORC(3), SORC(4), SORC(5), SORC(6), SORC(7), SORC(9)];
    const r = resolve(state(lib), []);
    expect(r.battlefield).toEqual([]);
    expect(r.library[0]).toBe("s9");
    expect(r.pending).toBeNull();
  });
});
