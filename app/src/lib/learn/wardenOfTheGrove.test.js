/**
 * wardenOfTheGrove.test.js — ENDURE-X on the entering creature (Warden of the Grove, SHELF-TAIL W4 —
 * CR 701.63a).
 *
 * "Whenever another nontoken creature you control enters, IT endures X, where X is the number of counters
 * on THIS CREATURE." Three referents, all riding existing seams: the etb otherCreatureYouControl watcher
 * (already detected), the dynamic X = the SOURCE's whole counter bag (countFor kind:"countersOnSource"
 * with NO counterType — the new all-kinds branch in countForSpec), and the endure RECIPIENT = the
 * TRIGGERING creature (atom.recipient:"triggering" → applyEndure's mode A rides the existing
 * target:"thatCreature" referent so doublers/watchers/SBAs compose; the recipient already gone → mode B,
 * the X/X white Spirit). The routing belt gates recipient:"triggering" to the etb event (the referent
 * convention — countContext/upkeepPlayer's sibling).
 *
 * Mutation-checked: disabling the where-clause parser arm kills the route/tier pins; `false &&` on the
 * recipient:"triggering" branch in applyEndure kills the mode-A/mode-B runtime pins (the counters would
 * land on WARDEN instead of the enterer — the mis-bind the recipient field exists to prevent); removing
 * the all-kinds branch in countForSpec kills the two-kind sum pin.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { applyEndure } from "./effects/atoms/counters.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WARDEN = {
  name: "Warden of the Grove", type: "Creature — Hydra", mana: "{3}{G}", power: 3, toughness: 3,
  oracle: "At the beginning of your end step, put a +1/+1 counter on this creature.\nWhenever another nontoken creature you control enters, it endures X, where X is the number of counters on this creature. (Put X +1/+1 counters on the creature that entered or create an X/X white Spirit creature token.)",
};
const CLAUSE = "it endures X, where X is the number of counters on this creature";

const perm = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, controller, card }), ...extra });
const warden = (counters = null) => perm("war", { id: "c-war", name: WARDEN.name, type: WARDEN.type, oracle: WARDEN.oracle }, "user", counters ? { counters } : {});
const enterer = () => perm("ent", { id: "c-ent", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 });
function stateWith(user = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: user } } };
}
const pileOf = (s, id) => (s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"]) || 0;

describe("Warden — parse + routing + the flip", () => {
  it("MUST STAY HIGH: the where-clause form → the endure atom with countFor + recipient:'triggering'", () => {
    const p = parseEffectClause(CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "endure", countFor: { kind: "countersOnSource" }, recipient: "triggering" });
  });
  it("both of Warden's triggers route; the card classifies native-trigger", () => {
    const ds = detectTriggers(WARDEN);
    expect(ds).toHaveLength(2);
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect(classifyCard(WARDEN)).toBe("native-trigger");
  });
  it("the routing BELT: recipient:'triggering' is native ONLY on the etb event (the referent convention)", () => {
    // The same clause on a non-etb trigger must NOT route — the triggering referent would be a different class.
    const attackCarrier = { name: "Wrong Event", type: "Creature — Hydra", oracle: "Whenever this creature attacks, it endures X, where X is the number of counters on this creature." };
    const ds = detectTriggers(attackCarrier);
    expect(ds.length).toBeGreaterThan(0);
    expect(ds.some((d) => triggerRoutesNatively(d))).toBe(false);
  });
});

describe("Warden — the endure-X runtime (CR 701.63a)", () => {
  it("MODE A on the ENTERER: X = the source's whole bag (two kinds summed), landed on the entering creature — never on Warden", () => {
    const w = warden({ "+1/+1": 3, stun: 2 }); // 5 total — the all-kinds sum
    const e = enterer();
    const after = applyEndure(stateWith([w, e]), { op: "endure", countFor: { kind: "countersOnSource" }, recipient: "triggering" }, { controller: "user", sourceId: "war", triggeringPermanentId: "ent" });
    expect(pileOf(after, "ent")).toBe(5);           // the enterer endures 5 (mutation-check line)
    expect(pileOf(after, "war")).toBe(3);           // Warden's own pile untouched (the mis-bind guard)
  });
  it("MODE B: the enterer already left → an X/X white Spirit token", () => {
    const w = warden({ "+1/+1": 2 });
    const after = applyEndure(stateWith([w]), { op: "endure", countFor: { kind: "countersOnSource" }, recipient: "triggering" }, { controller: "user", sourceId: "war", triggeringPermanentId: "gone" });
    const spirit = after.players.user.battlefield.find((p) => /spirit/i.test(p.card?.type || "") || /spirit/i.test(p.card?.name || ""));
    expect(spirit).toBeTruthy();
    expect(spirit.card.power).toBe(2);
    expect(spirit.card.toughness).toBe(2);
  });
  it("X=0 (a counterless Warden) and a GONE Warden both no-op cleanly (CR 701.63b; never a fabricated X)", () => {
    const e1 = enterer();
    const bare = applyEndure(stateWith([warden(), e1]), { op: "endure", countFor: { kind: "countersOnSource" }, recipient: "triggering" }, { controller: "user", sourceId: "war", triggeringPermanentId: "ent" });
    expect(pileOf(bare, "ent")).toBe(0);
    const e2 = enterer();
    const gone = applyEndure(stateWith([e2]), { op: "endure", countFor: { kind: "countersOnSource" }, recipient: "triggering" }, { controller: "user", sourceId: "war", triggeringPermanentId: "ent" });
    expect(pileOf(gone, "ent")).toBe(0);
    expect(gone.players.user.battlefield).toHaveLength(1); // no token either — the whole endure no-ops at 0
  });
  it("the fixed-N self endure is byte-identical (the existing carriers' path)", () => {
    const w = warden();
    const after = applyEndure(stateWith([w]), { op: "endure", amount: 2 }, { controller: "user", sourceId: "war" });
    expect(pileOf(after, "war")).toBe(2);
  });
});
