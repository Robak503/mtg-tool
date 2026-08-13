/**
 * massUntapOwnCreatures.test.js — "untap all/each creature(s) you control" (CR 701.20).
 *
 * The untap resolver has always done a deterministic greedy mass untap with an `all` / up-to-N cap — it was
 * simply scoped to LANDS by a single hardcoded type-line check. The same resolver plays the creature form
 * with `scope: "creature"`; the axis pattern once more, this time one line deep.
 *
 * Untapping your OWN board is never a downside, so there is no decision to model and no CREED risk: the loop
 * only ever walks the controller's own battlefield, and the live type check keeps a non-creature out.
 *
 * ⛔ "UNTAP ALL CREATURES" WITHOUT "you control" IS DELIBERATELY NOT THIS ATOM. That form untaps opponents'
 * blockers too — a symmetric effect with a real downside, and a different card. It stays LOW.
 *
 * ⚠️ HONEST SCOPE NOTE: 43 corpus cards carry this clause, and the big names on that list (Aggravated Assault
 * #699, Aurelia #820, Moraug #995, Great Train Heist #1118) do NOT flip — every one of them pairs the untap
 * with an "additional combat phase" rider that is its own blocker. The eight cards this actually moved are
 * the ones where the untap was the whole effect. A clause landing is not a card landing.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (oracle) => parseEffectProgram({ type: "Sorcery", name: "X", oracle })?.atoms?.[0] || null;

describe("parsing", () => {
  it("⭐ both printed spellings ride the existing untap resolver, scoped to creatures", () => {
    expect(atomOf("Untap all creatures you control.")).toMatchObject({ op: "untap-lands", all: true, scope: "creature" });
    expect(atomOf("Untap each creature you control.")).toMatchObject({ op: "untap-lands", all: true, scope: "creature" });
  });

  it("CONTROL — the LAND forms are untouched and carry no scope", () => {
    expect(atomOf("Untap all lands you control.")).toMatchObject({ op: "untap-lands", all: true });
    expect(atomOf("Untap all lands you control.").scope).toBeUndefined();
  });

  it("⛔ the SYMMETRIC form parks — it would untap opponents' blockers too", () => {
    expect(atomOf("Untap all creatures.")).toBeNull();
  });
});

describe("⭐ RUNTIME — only the controller's own tapped creatures untap", () => {
  const creature = (id, controller) => createPermanent({
    id, controller, card: { id, name: `C${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" },
  });
  const land = (id, controller) => createPermanent({
    id, controller, card: { id, name: `L${id}`, type: "Land", oracle: "" },
  });
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mine = [creature("m1", "user"), creature("m2", "user"), land("ml", "user")];
    const theirs = [creature("t1", "ai")];
    for (const p of [...mine, ...theirs]) p.tapped = true;
    return { ...s, players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine },
      ai: { ...s.players.ai, battlefield: theirs },
    } };
  }
  const run = (st) => resolveAtom(st, atomOf("Untap all creatures you control."), { controller: "user", cardName: "To Arms!", targets: [] });
  const tapped = (st, pid) => st.players[pid].battlefield.filter((p) => p.tapped).map((p) => p.id);

  it("⭐ the controller's creatures untap", () => {
    expect(tapped(run(board()), "user")).not.toContain("m1");
    expect(tapped(run(board()), "user")).not.toContain("m2");
  });

  it("⛔ the OPPONENT's creature stays tapped", () => {
    // The whole reason the symmetric form is a different card.
    expect(tapped(run(board()), "ai")).toEqual(["t1"]);
  });

  it("⛔ and the controller's own LAND stays tapped — the scope really is creatures", () => {
    // Without this, `scope:"creature"` could be ignored and the land path would untap everything, with
    // every assertion above still passing.
    expect(tapped(run(board()), "user")).toEqual(["ml"]);
  });

  it("CONTROL — before resolution everything is tapped", () => {
    const b = board();
    expect(tapped(b, "user").sort()).toEqual(["m1", "m2", "ml"]);
    expect(tapped(b, "ai")).toEqual(["t1"]);
  });
});

describe("tier", () => {
  it("⭐ the cards where the untap IS the whole effect flip", () => {
    expect(classifyCard({ name: "To Arms!", type: "Instant", mana: "{1}{W}",
      oracle: "Untap all creatures you control.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Vitalize", type: "Instant", mana: "{G}",
      oracle: "Untap all creatures you control." })).toBe("native-spell");
  });

  it("⭐ GRADUATED (2026-08-12): Aggravated Assault flips — the additional-combat rider landed (Increment 3)", () => {
    // The separate blocker this pin named — the after-MAIN extra-combat rider — got its insertion point
    // (extraCombatAtom.test.js's Increment-3 describe holds the pop witnesses). The 43-card clause count's
    // honest counterweight is now the flip itself.
    expect(classifyCard({ name: "Aggravated Assault", type: "Enchantment", mana: "{2}{R}",
      oracle: "{3}{R}{R}: Untap all creatures you control. After this main phase, there is an additional combat phase followed by an additional main phase." }))
      .toMatch(/^native/);
  });
});
