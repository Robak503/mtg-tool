/**
 * activateDuringYourTurn.test.js — BLITZ AA-1: the "Activate only during your turn." timing restriction
 * (the Disrupting Scepter / Vona / Steadfast Unicorn frame). The sibling of ONCE-1's frequency rider: the
 * sentence is stripped for the EFFECT parse ONLY because the runtime enforces an at-least-as-strict window —
 * legalChoices.actionsActivateAbility offers an activated ability solely when it is the controller's OWN main
 * step (activePlayer === controller && priorityHolder === controller && step === "main"). Own MAIN is a strict
 * SUBSET of "your turn", so stripping can only ever UNDER-offer (never at instant speed on your turn, which the
 * card would allow) — a safe false-negative, never an FP.
 *
 * CREED FP guard: a rider that carries an EXTRA, un-enforced condition — "…during your turn, before attackers
 * are declared." / "…only if <condition>." — must NOT strip, because offering it in the engine's main-step
 * window would VIOLATE that extra constraint. Real oracle fixtures (bundled Scryfall, verified 2026-07-17).
 *
 * The test is "does the runtime enforce it", not "is it a rider": "…no more than twice each turn." was in
 * that list until census slice 11 built the counted cap, and it GRADUATED out (see the case below). A guard
 * here is a statement about engine capability at a point in time — when the capability lands, the guard is
 * supposed to flip, and the principle it protects is untouched by that.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle (bundled Scryfall), verbatim — the trailing "Activate only during your turn." is the SOLE blocker.
const VONA = { name: "Vona, Butcher of Magan", type: "Legendary Creature — Vampire Knight", mana: "{2}{W}{B}",
  oracle: "Vigilance, lifelink\n{T}, Pay 7 life: Destroy target nonland permanent. Activate only during your turn." };
const DISRUPTING_SCEPTER = { name: "Disrupting Scepter", type: "Artifact", mana: "{3}",
  oracle: "{3}, {T}: Target player discards a card. Activate only during your turn." };
const GWENDLYN = { name: "Gwendlyn Di Corci", type: "Legendary Creature — Human Rogue", mana: "{2}{U}{B}{R}",
  oracle: "{T}: Target player discards a card at random. Activate only during your turn." };
const ZURAN_ENCHANTER = { name: "Zuran Enchanter", type: "Creature — Human Wizard", mana: "{1}{B}",
  oracle: "{2}{B}, {T}: Target player discards a card. Activate only during your turn." };
const SCEPTER_OF_FUGUE = { name: "Scepter of Fugue", type: "Artifact", mana: "{3}",
  oracle: "{1}{B}, {T}: Target player discards a card. Activate only during your turn." };
const STEADFAST_UNICORN = { name: "Steadfast Unicorn", type: "Creature — Unicorn", mana: "{2}{W}", power: "2", toughness: "2",
  oracle: "{3}{W}: Creatures you control get +1/+1 and gain vigilance until end of turn. Activate only during your turn. (Attacking doesn't cause them to tap.)" };
const FLESHFORMER = { name: "Fleshformer", type: "Creature — Human Wizard", mana: "{2}{B}{B}", power: "2", toughness: "2",
  oracle: "{W}{U}{B}{R}{G}: This creature gets +2/+2 and gains fear until end of turn. Target creature gets -2/-2 until end of turn. Activate only during your turn. (A creature with fear can't be blocked except by artifact creatures and/or black creatures.)" };

describe("AA-1 — recognition (classifyCard) — real oracle flips native-activated", () => {
  it("Vona, Butcher of Magan → native-activated ({T}, Pay 7 life : destroy nonland permanent)", () => {
    expect(classifyCard(VONA)).toBe("native-activated");
  });
  it("the discard-a-card cycle flips (Disrupting Scepter / Gwendlyn / Zuran Enchanter / Scepter of Fugue)", () => {
    expect(classifyCard(DISRUPTING_SCEPTER)).toBe("native-activated");
    expect(classifyCard(GWENDLYN)).toBe("native-activated");
    expect(classifyCard(ZURAN_ENCHANTER)).toBe("native-activated");
    expect(classifyCard(SCEPTER_OF_FUGUE)).toBe("native-activated");
  });
  it("mass-pump / self-pump carriers flip (Steadfast Unicorn, Fleshformer)", () => {
    expect(classifyCard(STEADFAST_UNICORN)).toBe("native-activated");
    expect(classifyCard(FLESHFORMER)).toBe("native-activated");
  });

  it("the rider strips for the parse; the ability is modeled and carries no residual \"activate only\"", () => {
    const [a] = parseActivatedAbilities(VONA).slice(-1); // the sole activated ability (after the keyword line)
    expect(a.modeled).toBe(true);
    expect(a.tapSelf).toBe(true);
    expect(a.payLife).toBe(7);
    expect(a.effectClause.toLowerCase()).not.toContain("activate only");
    expect(a.effectClause).toBe("Destroy target nonland permanent"); // the strip drops the rider AND its leading period
  });
});

describe("AA-1 — CREED FP guards: an EXTRA un-enforced condition must NOT strip (stays Arbiter)", () => {
  it("\"…during your turn, before attackers are declared.\" (Capricious Sorcerer) — before-attackers is not enforced", () => {
    // The engine offers at BOTH pre- and post-combat main; postcombat main is AFTER attackers. Stripping the
    // whole rider would over-offer → FP. The anchored strip requires the phrase to END the clause, so the comma
    // + trailing condition blocks the match and the effect stays LOW → body-only.
    const c = { name: "Capricious Sorcerer", type: "Creature — Human Wizard",
      oracle: "{T}: This creature deals 1 damage to any target. Activate only during your turn, before attackers are declared." };
    expect(classifyCard(c)).toBe("body-only");
    expect(parseActivatedAbilities(c)[0].modeled).toBe(false);
  });
  it("GRADUATED — \"…no more than twice each turn.\" (Pit Imp) now strips, because the cap is enforced", () => {
    // This case used to live here as an FP guard on the grounds that "the runtime has no twice-per-turn cap;
    // spammable if stripped". That premise ended with census slice 11: the frequency restriction is parsed as
    // a COUNT (activationLimit) and legalChoices stops offering the ability once the per-turn ledger reaches
    // it. The guard's PRINCIPLE is unchanged and its siblings above/below still hold — strip only what the
    // runtime enforces. What changed is that the runtime now enforces this one. The cap itself (including the
    // exact N-vs-N+1 boundary and the turn reset) is pinned in activationLimitCount.test.js.
    const c = { name: "Pit Imp", type: "Creature — Imp",
      oracle: "Flying\n{B}: This creature gets +1/+0 until end of turn. Activate no more than twice each turn." };
    expect(classifyCard(c)).toBe("native-activated");
    expect(parseActivatedAbilities(c)[0].modeled).toBe(true);
    expect(parseActivatedAbilities(c)[0].activationLimit).toBe(2);
  });
  it("\"…only if this creature is blocked.\" (Cinder Crawler) — a conditional gate the runtime doesn't evaluate", () => {
    const c = { name: "Cinder Crawler", type: "Creature — Salamander",
      oracle: "{R}: This creature gets +1/+0 until end of turn. Activate only if this creature is blocked." };
    expect(classifyCard(c)).toBe("body-only");
    expect(parseActivatedAbilities(c)[0].modeled).toBe(false);
  });
});

describe("AA-1 — runtime: offered ONLY on the controller's own turn, and the effect resolves", () => {
  function board({ active = "user" } = {}) {
    const v = createPermanent({ id: "v", card: VONA, controller: "user", summoningSick: false });
    const bear = createPermanent({ id: "bear", card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "ai" });
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main",
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [v], life: 40 },
        ai: { ...base.players.ai, battlefield: [bear] },
      },
    };
  }
  const vonaActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "v");

  it("enumerated on the user's own main step (a target action per legal nonland permanent)", () => {
    const acts = vonaActs(board());
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.some((a) => a.targetName === "Grizzly Bears")).toBe(true);
  });

  it("NOT offered on the opponent's turn — the runtime honors \"during your turn\" via the main-step/activePlayer gate", () => {
    expect(vonaActs(board({ active: "ai" }))).toHaveLength(0);
  });

  it("cost is paid (7 life + tap) and the effect resolves — the targeted permanent is destroyed", () => {
    let s = board();
    const destroyBear = vonaActs(s).find((a) => a.targetName === "Grizzly Bears");
    expect(destroyBear).toBeTruthy();
    s = dispatchAction(s, destroyBear);
    expect(s.players.user.life).toBe(33);                                            // Pay 7 life
    expect(s.players.user.battlefield.find((p) => p.id === "v").tapped).toBe(true);  // {T}
    s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Grizzly Bears"); // destroyed
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
  });
});
