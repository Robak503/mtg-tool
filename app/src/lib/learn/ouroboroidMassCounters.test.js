/**
 * ouroboroidMassCounters.test.js — OUROBOROID (2026-08-14). "At the beginning of combat on your turn,
 * put X +1/+1 counters on each creature you control, where X is this creature's power."
 *
 * ⭐ ONE ARM marrying two existing pieces: countFor sourcePower (the Halana kind — ctx.sourceId's
 * LAYER-AWARE power at resolution) × the scope:"youControl" mass path. The amount resolves ONCE off
 * the source (a single printed X) and applies uniformly; the source is among "each creature you
 * control", so it snowballs — 4 power puts 4 counters on itself, next combat X is 8.
 *
 * Whole-card audit: the card IS its one trigger.
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the arm disabled -> Ouroboroid parks.
 *   · countFor swapped to a fixed amount:1 -> the snowball witness dies (4-power source gives 1, not 4).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OURO = { id: "c-ou", name: "Ouroboroid", type: "Creature — Snake Hydra", mana: "{3}{G}{G}", power: "4", toughness: "4",
  oracle: "At the beginning of combat on your turn, put X +1/+1 counters on each creature you control, where X is this creature's power." };
const CLAUSE = "put x +1/+1 counters on each creature you control, where x is this creature's power";

describe("the carrier and the atom", () => {
  it("⭐ Ouroboroid flips native-trigger; the atom carries sourcePower × the mass scope", () => {
    expect(classifyCard(OURO)).toBe("native-trigger");
    const p = parseEffectClause(CLAUSE, "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", counterType: "+1/+1", countFor: { kind: "sourcePower" }, scope: "youControl" });
  });
});

describe("⭐⭐ LAW 6 — X is the source's LIVE power, applied to the whole team including itself", () => {
  it("⭐⭐ a 4-power Ouroboroid: 4 counters on EACH of your creatures — itself included (the snowball)", () => {
    const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const ouro = createPermanent({ id: "OU", controller: "user", summoningSick: false, card: { id: "card-OU", ...OURO } });
    const bear = createPermanent({ id: "B", controller: "user", summoningSick: false,
      card: { id: "card-B", name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    const enemy = createPermanent({ id: "E", controller: "ai1", summoningSick: false,
      card: { id: "card-E", name: "Enemy Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });
    const s = { ...g, players: { ...g.players,
      user: { ...g.players.user, battlefield: [ouro, bear] },
      ai1: { ...g.players.ai1, battlefield: [enemy] } } };
    const atom = parseEffectClause(CLAUSE, "Instant").atoms[0];
    const after = ATOM_RESOLVERS["add-counter"](s, atom, { controller: "user", sourceId: "OU", targets: [] });
    const cnt = (pid, id) => after.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
    const row = { ouro: cnt("user", "OU"), bear: cnt("user", "B"), enemy: cnt("ai1", "E") };
    console.log("  WITNESS ouroSnowball", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ouro: 4, bear: 4, enemy: 0 });
  });
});
