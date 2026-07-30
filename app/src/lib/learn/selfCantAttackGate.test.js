/**
 * selfCantAttackGate.test.js — SELF "can't attack [or block]", optionally LAND-GATED (CR 508.1c / 509.1a).
 * Topiary Stomper: "This creature can't attack or block unless you control seven or more lands."
 *
 * ⭐ THE BLOCK HALF WAS ALREADY ENFORCED; THE ATTACK HALF HAD NO READER AT ALL. `isSelfCantBlock` has been
 * read by canBlockAttacker all along, and a card printing the attack form simply parked — a safe false
 * negative, never a false positive. This adds the attack mirror plus the "unless you control N lands" window
 * that both halves share, wired at the two declaration sites that own them.
 *
 * ⭐ THE CREDIT USES THE SAME READER AS THE ENFORCEMENT. `isEnforcedEvasionClause` calls
 * `selfCantAttackBlockGate`, which is the exact function `selfCantAttackNow` / `selfCantBlockNow` use in
 * legalChoices — so recognition and enforcement cannot drift. That is the discipline combatEvasion.js already
 * runs on, and the reason the bare "can't attack" becomes credited only NOW that a gate exists to enforce it.
 *
 * ⛔ LAND-ONLY GATE. The corpus prints a land count on this shape; any other "unless …" tail fails the anchor
 * and the card parks. "can't attack alone" / "can't block alone" are a DIFFERENT restriction with their own
 * readers, and the anchor's end-of-clause tail keeps them out — pinned below.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { selfCantAttackBlockGate, cantAttackAlone, cantBlockAlone } from "./combatEvasion.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const GATED = "This creature can't attack or block unless you control seven or more lands.";
const TOPIARY = { name: "Topiary Stomper", type: "Creature — Plant Dinosaur", power: "4", toughness: "4", mana: "{3}{G}",
  oracle: "Vigilance\nThis creature enters tapped.\nWhen this creature enters, search your library for a basic land card, put it onto the battlefield tapped, then shuffle.\n" + GATED };

function boardWith(oracle, nLands) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const st = createPermanent({ id: "st", card: { id: "c-s", name: "Stomper", type: "Creature — Plant Dinosaur", power: "4", toughness: "4", oracle }, controller: "user" });
  st.summoningSick = false;
  const bf = [st];
  for (let i = 0; i < nLands; i++) bf.push(createPermanent({ id: `L${i}`, card: { id: `cl${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" }));
  return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf } } };
}
const offeredAsAttacker = (oracle, nLands) =>
  (legalActionsForPlayer(boardWith(oracle, nLands), "user") || [])
    .some((a) => String(a.kind || a.type || "").includes("attack") && a.permanentId === "st");

describe("the reader", () => {
  it("parses the gated combined form", () => {
    expect(selfCantAttackBlockGate({ oracle: GATED })).toEqual({ attack: true, block: true, minLands: 7 });
  });

  it("parses the ungated and single-sided forms", () => {
    expect(selfCantAttackBlockGate({ oracle: "This creature can't attack." })).toEqual({ attack: true, block: false, minLands: 0 });
    expect(selfCantAttackBlockGate({ oracle: "This creature can't block." })).toEqual({ attack: false, block: true, minLands: 0 });
    expect(selfCantAttackBlockGate({ oracle: "This creature can't attack or block." })).toEqual({ attack: true, block: true, minLands: 0 });
  });

  it("⛔ 'can't attack ALONE' is a different restriction and must not be swallowed", () => {
    // If the anchor leaked, Mogg Flunkies would become permanently unable to attack instead of
    // conditionally — a far worse bug than the one this slice fixes.
    expect(selfCantAttackBlockGate({ oracle: "This creature can't attack or block alone." })).toBeNull();
    expect(cantAttackAlone({ oracle: "This creature can't attack or block alone." })).toBe(true);
    expect(cantBlockAlone({ oracle: "This creature can't attack or block alone." })).toBe(true);
  });

  it("⛔ a non-land 'unless' tail is not modeled and parks", () => {
    expect(selfCantAttackBlockGate({ oracle: "This creature can't attack unless you control a Dragon." })).toBeNull();
  });
});

describe("⭐ RUNTIME — the land window binds and releases", () => {
  it("not offered as an attacker below the threshold, offered at and above it", () => {
    expect(offeredAsAttacker(GATED, 0)).toBe(false);
    expect(offeredAsAttacker(GATED, 6)).toBe(false);   // one short
    expect(offeredAsAttacker(GATED, 7)).toBe(true);    // ⭐ the seventh land frees it, read live
    expect(offeredAsAttacker(GATED, 8)).toBe(true);
  });

  it("⛔ CONTROL — the same creature with NO restriction attacks on zero lands", () => {
    // Without this, "not offered" could just mean the harness never offers attackers at all.
    expect(offeredAsAttacker("", 0)).toBe(true);
  });

  it("the UNGATED attack restriction bars it at any land count", () => {
    expect(offeredAsAttacker("This creature can't attack.", 9)).toBe(false);
  });

  it("⛔ a BLOCK-only restriction does NOT stop it attacking", () => {
    expect(offeredAsAttacker("This creature can't block.", 0)).toBe(true);
  });
});

describe("coverage", () => {
  it("Topiary Stomper flips", () => {
    expect(classifyCard(TOPIARY)).toBe("native-trigger");
  });

  it("⛔ an unmodeled companion line still parks the card", () => {
    expect(classifyCard({ ...TOPIARY, name: "Fake Stomper",
      oracle: `${GATED}\nWhenever a player consults an oracle, interpret its riddle however you like.` }))
      .not.toMatch(/^native/);
  });
});
