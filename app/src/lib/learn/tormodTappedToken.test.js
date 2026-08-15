/**
 * tormodTappedToken.test.js — the TAPPED creature token (Tormod, the Desecrator, Teval shelf,
 * 2026-08-15): "Whenever one or more cards leave your graveyard, create a TAPPED 2/2 black Zombie
 * creature token." One captured adjective riding the SAME atom.tapped flag the Treasure-maker's mint
 * already honors — the batch gyLeave watcher (Teval's own machinery) predates this slice.
 *
 * Mutation-checked (2026-08-15): the mint's tapped pass-through dropped (createPermanent without
 * tapped) → the enters-tapped witness dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const TORMOD = { name: "Tormod, the Desecrator", type: "Legendary Creature — Zombie Wizard", power: "4", toughness: "2", mana: "{3}{B}",
  oracle: "Whenever one or more cards leave your graveyard, create a tapped 2/2 black Zombie creature token.\nPartner (You can have two commanders if both have partner.)" };

describe("TORMOD — the tapped token adjective", () => {
  it("⭐ parses with tapped:true; Tormod classifies native-trigger; the untapped form is byte-identical", () => {
    const p = parseEffectClause("Create a tapped 2/2 black Zombie creature token.", "Instant");
    const row = { conf: programConfidence(p), tapped: p.atoms[0].tapped, tier: classifyCard(TORMOD) };
    console.log("  WITNESS tormod", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ conf: "high", tapped: true, tier: "native-trigger" });
    expect(parseEffectClause("Create a 2/2 black Zombie creature token.", "Instant").atoms[0].tapped).toBeUndefined();
  });

  it("⭐⭐ the minted token really ENTERS TAPPED (the untapped control enters untapped)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mint = (oracle) => runEffectProgram(s, {
      id: "stk-tk", kind: "spell", controller: "user", source: { name: "Tormod Trigger" },
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectClause(oracle, "Instant"), controller: "user", targets: [] } },
    });
    const tapped = mint("Create a tapped 2/2 black Zombie creature token.");
    const untapped = mint("Create a 2/2 black Zombie creature token.");
    const row = { tapped: tapped.players.user.battlefield[0].tapped, control: untapped.players.user.battlefield[0].tapped };
    console.log("  WITNESS tormodMint", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ tapped: true, control: false });
  });
});
