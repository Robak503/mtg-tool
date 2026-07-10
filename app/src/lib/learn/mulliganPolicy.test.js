/**
 * mulliganPolicy.test.js — SIM-INTEGRITY Phase 2: the playbook mulligan + ranked bottom-picker.
 * Sanity golden hands (Cindy's labels — superseded/extended by Omnath's ~20/playbook golden set
 * when it lands, Colton-eyeballed), ship floors, the poison-filter divergence that motivated the
 * policy, and the bottom-picker's invariants (exact count, no dup ids, excess lands first,
 * deterministic).
 */
import { describe, it, expect } from "vitest";
import { evaluateHand, makeMulliganPolicy, rankBottomCandidates, PLAYBOOK_MULLIGAN_PARAMS, isProducer } from "./mulliganPolicy.js";

let nextId = 0;
const card = (name, type, mana, oracle = "") => ({ id: `c${nextId++}`, name, type, mana, cmc: (mana.match(/\{[^}]+\}/g) || []).reduce((n, s) => n + (/^\{\d+\}$/.test(s) ? Number(s.slice(1, -1)) : 1), 0), oracle });
const forest = () => card("Forest", "Basic Land — Forest", "", "{T}: Add {G}.");
const island = () => card("Island", "Basic Land — Island", "", "{T}: Add {U}.");
const sol = () => card("Sol Ring", "Artifact", "{1}", "{T}: Add {C}{C}.");
const elf = () => card("Llanowar Elves", "Creature — Elf Druid", "{G}", "{T}: Add {G}.");
const bear = () => card("Grizzly Bears", "Creature — Bear", "{1}{G}", "");
const trawler = () => card("Wall", "Creature — Wall", "{2}{G}", "");
const bolt = () => card("Lightning Bolt", "Instant", "{R}", "Lightning Bolt deals 3 damage to any target.");
const counterspell = () => card("Counterspell", "Instant", "{U}{U}", "Counter target spell.");
const divination = () => card("Divination", "Sorcery", "{2}{U}", "Draw two cards.");
const tutor = () => card("Demonic Tutor", "Sorcery", "{1}{B}", "Search your library for a card, put that card into your hand, then shuffle.");
const bigDragon = () => card("Big Dragon", "Creature — Dragon", "{5}{R}{R}", "Flying");
const sword = () => card("Sword of Hearth", "Artifact — Equipment", "{3}", "Equipped creature gets +2/+2. Equip {2}");

describe("evaluateHand — playbook keep/ship (v1 thresholds, Omnath's table)", () => {
  it("ramp KEEPS 3 lands + a producer + castables", () => {
    const hand = [forest(), forest(), forest(), elf(), bear(), trawler(), bigDragon()];
    expect(evaluateHand(hand, "ramp", 0).keep).toBe(true);
  });

  it("ramp SHIPS a 1-land hand (below window even with no producer)", () => {
    const hand = [forest(), bear(), bear(), trawler(), bigDragon(), bigDragon(), bigDragon()];
    expect(evaluateHand(hand, "ramp", 0).keep).toBe(false);
  });

  it("ramp SHIPS a 6-land do-nothing hand (above window)", () => {
    const hand = [forest(), forest(), forest(), forest(), forest(), forest(), bigDragon()];
    expect(evaluateHand(hand, "ramp", 0).keep).toBe(false);
  });

  it("go-wide SHIPS 2 lands + no producers (2 < window floor 2.5) — the poison filter KEPT this", () => {
    const hand = [forest(), forest(), bear(), bear(), trawler(), bigDragon(), bigDragon()];
    expect(evaluateHand(hand, "go-wide", 0).keep).toBe(false);
  });

  it("go-wide KEEPS 3 lands + a curve (1-2 consecutive drops)", () => {
    const hand = [forest(), forest(), forest(), elf(), bear(), bear(), trawler()];
    expect(evaluateHand(hand, "go-wide", 0).keep).toBe(true);
  });

  it("value-control DEMANDS an interaction/draw piece — 4 lands of vanilla is a ship", () => {
    const noPiece = [island(), island(), island(), island(), bear(), trawler(), bigDragon()];
    expect(evaluateHand(noPiece, "value-control", 0).keep).toBe(false);
    const withPiece = [island(), island(), island(), island(), counterspell(), bear(), bigDragon()];
    expect(evaluateHand(withPiece, "value-control", 0).keep).toBe(true);
  });

  it("voltron wants a threat/equipment piece", () => {
    const withSword = [forest(), forest(), forest(), sword(), bear(), trawler(), bigDragon()];
    expect(evaluateHand(withSword, "voltron", 0).keep).toBe(true);
  });

  it("combo ships a keepable-but-LINELESS hand after the first ship, keeps it with a tutor", () => {
    const merfolk = () => card("Merfolk", "Creature — Merfolk", "{1}{U}", "");
    const wall = () => card("Blue Wall", "Creature — Wall", "{2}{U}", "");
    const lineless = [island(), island(), island(), merfolk(), merfolk(), divination(), wall()];
    // divination is draw but not a tutor/engine; at ships=1 combo demands a LINE piece.
    expect(evaluateHand(lineless, "combo", 1).keep).toBe(false);
    const withLine = [island(), island(), island(), merfolk(), tutor(), divination(), wall()];
    expect(evaluateHand(withLine, "combo", 1).keep).toBe(true);
  });

  it("SHIP FLOORS: a garbage hand is force-kept at the playbook's max ships (never below min keep)", () => {
    const garbage = [bigDragon(), bigDragon(), bigDragon(), bigDragon(), bigDragon(), bigDragon(), bigDragon()];
    // ramp minKeep 5 → maxShips 2: at ships=2 even garbage keeps.
    expect(evaluateHand(garbage, "ramp", 2).keep).toBe(true);
    expect(evaluateHand(garbage, "ramp", 1).keep).toBe(false);
    // combo minKeep 4 → maxShips 3.
    expect(evaluateHand(garbage, "combo", 3).keep).toBe(true);
    expect(evaluateHand(garbage, "combo", 2).keep).toBe(false);
  });

  it("desperation: at the last allowed ship, a window+castable hand keeps even without doesSomething", () => {
    // 3 lands + vanilla castables (no draw/ramp/interaction, no 1-2 or 2-3 curve pair: only 2-drops... use 2+2)
    const hand = [forest(), forest(), forest(), bear(), bear(), bigDragon(), bigDragon()];
    // bear(2)+bear(2): mvs={2,7} → no consecutive pair, no cheap piece → doesSomething false.
    expect(evaluateHand(hand, "ramp", 0).keep).toBe(false); // fresh 7: demands function
    expect(evaluateHand(hand, "ramp", 2).keep).toBe(true); // desperation depth (maxShips=2)
  });
});

describe("makeMulliganPolicy — the pilot-seam adapter", () => {
  it("returns keep/ship actions from the offered set and reads ships from the log", () => {
    const decide = makeMulliganPolicy("ramp");
    const hand = [forest(), bear(), bear(), trawler(), bigDragon(), bigDragon(), bigDragon()]; // 1 land → ship
    const state = { players: { ai1: { hand } }, log: [] };
    const legalActions = [{ kind: "mulligan-keep" }, { kind: "mulligan-ship" }];
    expect(decide({ state, legalActions, seat: "ai1" }).kind).toBe("mulligan-ship");
    // Same hand at the ramp ship floor (2 prior ships in the log) → forced keep.
    const deepLog = [{ kind: "mulligan-ship", player: "ai1" }, { kind: "mulligan-ship", player: "ai1" }];
    expect(decide({ state: { players: { ai1: { hand } }, log: deepLog }, legalActions, seat: "ai1" }).kind).toBe("mulligan-keep");
  });
});

describe("rankBottomCandidates — the London bottom-picker", () => {
  it("bottoms EXCESS LANDS first, exact count, no duplicate ids, all from the hand", () => {
    const hand = [forest(), forest(), forest(), forest(), forest(), bear(), bolt()]; // 5 lands, keep 5 after 2 ships
    const ids = rankBottomCandidates(hand, 2, "ramp");
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    const byId = new Map(hand.map((c) => [c.id, c]));
    for (const id of ids) expect(byId.get(id).name).toBe("Forest"); // excess lands go first
  });

  it("then bottoms the WORST spells: uncastable-early / highest MV before cheap castables", () => {
    const hand = [forest(), forest(), forest(), bear(), bigDragon(), bolt(), trawler()];
    // 3 lands on a 6-keep (1 ship): target lands ≈ round(4*(6/7)) = 3 → no excess lands.
    const ids = rankBottomCandidates(hand, 1, "ramp");
    const byId = new Map(hand.map((c) => [c.id, c]));
    expect(byId.get(ids[0]).name).toBe("Big Dragon"); // 7MV + off-color (R not producible) = worst
  });

  it("is deterministic (same hand → same picks)", () => {
    nextId = 0; const h1 = [forest(), forest(), forest(), forest(), bear(), bigDragon(), bolt()];
    nextId = 0; const h2 = [forest(), forest(), forest(), forest(), bear(), bigDragon(), bolt()];
    expect(rankBottomCandidates(h1, 3, "go-wide")).toEqual(rankBottomCandidates(h2, 3, "go-wide"));
  });

  it("all-lands hand below target still returns exactly N", () => {
    const hand = [forest(), forest(), forest()];
    expect(rankBottomCandidates(hand, 2, null)).toHaveLength(2);
  });
});

describe("plumbing sanity", () => {
  it("every grind playbook has params", () => {
    for (const pb of ["ramp", "go-wide", "aristocrats", "value-control", "voltron", "combo"]) {
      expect(PLAYBOOK_MULLIGAN_PARAMS[pb], pb).toBeTruthy();
    }
  });
  it("producers: dorks/rocks ≤2MV yes, lands no, expensive rampers no", () => {
    expect(isProducer(elf())).toBe(true);
    expect(isProducer(sol())).toBe(true);
    expect(isProducer(forest())).toBe(false);
    expect(isProducer(bigDragon())).toBe(false);
  });
});
