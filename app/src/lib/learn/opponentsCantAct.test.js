/**
 * OPPONENTS-CANT-ACT (Wave 4, brief #18) — Grand Abolisher / Voice of Victory / Conqueror's Flail.
 *
 * Covers the static "your opponents can't cast spells [or activate abilities of artifacts, creatures, or
 * enchantments] during your turn" restriction: the parser descriptor, the coverage flip, and the
 * legalChoices suppression gate (cast + activated-ability, the during-your-turn window, the opponent
 * scope, the attachment gate, and the CREED negatives — own casts never suppressed, lands/loyalty never
 * locked, riders never wrongly flipped native).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { parseStaticAbilities, cantCastDescriptorOf } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => {
  _resetIdsForTests();
});

const GRAND_ABOLISHER = {
  name: "Grand Abolisher",
  type: "Creature — Human Cleric",
  oracle: "During your turn, your opponents can't cast spells or activate abilities of artifacts, creatures, or enchantments.",
};
const VOICE_OF_VICTORY = {
  name: "Voice of Victory",
  type: "Creature — Human Bard",
  oracle:
    "Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nYour opponents can't cast spells during your turn.",
};
const CONQUERORS_FLAIL = {
  name: "Conqueror's Flail",
  type: "Artifact — Equipment",
  oracle:
    "Equipped creature gets +1/+1 for each color among permanents you control.\nAs long as this Equipment is attached to a creature, your opponents can't cast spells during your turn.\nEquip {2}",
};

// ── Parser + coverage ────────────────────────────────────────────────────────

describe("OPPONENTS-CANT-ACT — parser", () => {
  it("Grand Abolisher emits a cant-cast descriptor that includes activated abilities", () => {
    const d = cantCastDescriptorOf(GRAND_ABOLISHER);
    expect(d).toEqual({ window: "yourTurn", includeActivated: true });
  });

  it("Voice of Victory emits cast-only (no activated-ability half)", () => {
    const d = cantCastDescriptorOf(VOICE_OF_VICTORY);
    expect(d).toEqual({ window: "yourTurn", includeActivated: false });
  });

  it("Conqueror's Flail rider is attachment-gated, cast-only", () => {
    const d = cantCastDescriptorOf(CONQUERORS_FLAIL);
    expect(d).toEqual({ window: "yourTurn", includeActivated: false, attachedGated: true });
  });

  it("a windowless 'opponents can't cast' clause stays UNDETECTED (safe FN)", () => {
    // Teferi's-Protection-tier all-the-time form — not one of these cards; must NOT match.
    expect(cantCastDescriptorOf({ name: "X", type: "Enchantment", oracle: "Your opponents can't cast spells." })).toBeNull();
  });

  it("does not fire on an unrelated anthem/keyword line", () => {
    expect(parseStaticAbilities({ name: "Bear", type: "Creature", oracle: "Flying" }).some((d) => d.cantCast)).toBe(false);
  });
});

describe("OPPONENTS-CANT-ACT — coverage (CREED: no partial flips)", () => {
  it("Grand Abolisher (single clause) flips native-static", () => {
    expect(classifyCard(GRAND_ABOLISHER)).toBe("native-static");
  });

  it("Voice of Victory stays body-only (Mobilize unmodeled)", () => {
    expect(classifyCard(VOICE_OF_VICTORY)).toBe("body-only");
  });

  it("Conqueror's Flail stays body-only (dynamic-PT bonus unmodeled here)", () => {
    expect(classifyCard(CONQUERORS_FLAIL)).toBe("body-only");
  });
});

// ── Runtime gate ───────────────────────────────────────────────────────────

function permanent({ id, card, controller, tapped = false, attachedTo = null }) {
  return { id, card, controller, tapped, summoningSick: false, counters: {}, attachments: [], attachedTo };
}

// A 2-player (Standard) state with the queried player holding priority on the ACTIVE player's turn.
function twoPlayerState({ activePlayer, abolisherController, abolisher, bolt, victimMana = { R: 5, G: 5 } }) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  const state = {
    ...base,
    activePlayer,
    phase: "precombat-main",
    step: "main",
    priorityHolder: "user",
    turnOrder: ["user", "ai"],
    consecutivePasses: 0,
    players: {
      ...base.players,
      user: {
        ...base.players.user,
        hand: bolt ? [bolt] : [],
        manaPool: { ...base.players.user.manaPool, ...victimMana },
        battlefield: abolisherController === "user" && abolisher ? [abolisher] : [],
      },
      ai: {
        ...base.players.ai,
        battlefield: abolisherController === "ai" && abolisher ? [abolisher] : [],
      },
    },
  };
  return state;
}

describe("OPPONENTS-CANT-ACT — cast suppression", () => {
  const abolisher = permanent({ id: "ga1", card: GRAND_ABOLISHER, controller: "ai" });
  const bolt = { id: "bolt1", name: "Lightning Bolt", type: "Instant", mana: "{R}" };

  it("an opponent CANNOT cast during the abolisher controller's turn", () => {
    // AI controls Grand Abolisher and it is the AI's turn → user (their opponent) can't cast.
    const state = twoPlayerState({ activePlayer: "ai", abolisherController: "ai", abolisher, bolt });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(0);
  });

  it("the SAME spell is castable once it is NOT the abolisher controller's turn", () => {
    // Now it's the user's own turn — the AI's Grand Abolisher only bites during the AI's turn.
    const state = twoPlayerState({ activePlayer: "user", abolisherController: "ai", abolisher, bolt });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(1);
  });

  it("the abolisher's OWN controller is NEVER suppressed (no self-lock)", () => {
    // AI controls Grand Abolisher on the AI's turn; the AI itself can still cast (it's not its own opponent).
    const state = twoPlayerState({ activePlayer: "ai", abolisherController: "ai", abolisher, bolt: null });
    const aiBolt = { id: "bolt2", name: "Lightning Bolt", type: "Instant", mana: "{R}" };
    state.players.ai = {
      ...state.players.ai,
      hand: [aiBolt],
      manaPool: { ...state.players.ai.manaPool, R: 3 },
    };
    state.priorityHolder = "ai";
    expect(filterActions(legalActionsForPlayer(state, "ai"), "cast-spell")).toHaveLength(1);
  });

  it("a windowless / no-abolisher board imposes nothing", () => {
    const state = twoPlayerState({ activePlayer: "ai", abolisherController: "ai", abolisher: null, bolt });
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(1);
  });

  it("FP GUARD — a cant-cast CREATURE-COMMANDER in the COMMAND ZONE imposes nothing (CR 113.6)", () => {
    // Grand Abolisher (a creature) sitting in the AI's command zone, NOT yet cast onto the battlefield, must
    // NOT suppress the user's casts — a static ability functions only while its source is on the battlefield.
    const state = twoPlayerState({ activePlayer: "ai", abolisherController: "ai", abolisher: null, bolt });
    state.players.ai = { ...state.players.ai, command: [GRAND_ABOLISHER] };
    expect(filterActions(legalActionsForPlayer(state, "user"), "cast-spell")).toHaveLength(1);
  });
});

describe("OPPONENTS-CANT-ACT — activated-ability half (Grand Abolisher) is enforced by own-turn gating", () => {
  // Grand Abolisher also stops opponents activating abilities of artifacts/creatures/enchantments during
  // your turn. The engine ALREADY only offers activated/mana abilities on the acting player's OWN main
  // phase, so during the abolisher controller's turn an opponent has zero ability actions regardless. These
  // tests assert that invariant (the basis for honoring the clause without dropping it — CREED).
  const abolisher = permanent({ id: "ga2", card: GRAND_ABOLISHER, controller: "ai" });
  const dork = permanent({
    id: "dork1",
    card: { id: "c-dork", name: "Llanowar Elves", type: "Creature — Elf Druid", oracle: "{T}: Add {G}." },
    controller: "user",
  });

  function gateState(activePlayer) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      activePlayer,
      phase: "precombat-main",
      step: "main",
      priorityHolder: "user",
      turnOrder: ["user", "ai"],
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [dork] },
        ai: { ...base.players.ai, battlefield: [abolisher] },
      },
    };
  }

  it("an opponent has NO mana/activated-ability actions during the abolisher controller's turn", () => {
    const acts = legalActionsForPlayer(gateState("ai"), "user");
    expect(filterActions(acts, "tap-for-mana")).toHaveLength(0);
    expect(filterActions(acts, "activate-ability")).toHaveLength(0);
  });

  it("the opponent CAN tap their own creature for mana on their OWN turn (no over-restriction)", () => {
    const acts = legalActionsForPlayer(gateState("user"), "user");
    expect(filterActions(acts, "tap-for-mana").some((a) => a.permanentId === "dork1")).toBe(true);
  });
});

describe("OPPONENTS-CANT-ACT — Conqueror's Flail (attachment-gated)", () => {
  const bolt = { id: "bolt3", name: "Lightning Bolt", type: "Instant", mana: "{R}" };

  function flailState(attachedTo) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const flail = permanent({ id: "flail1", card: CONQUERORS_FLAIL, controller: "ai", attachedTo });
    return {
      ...base,
      activePlayer: "ai",
      phase: "precombat-main",
      step: "main",
      priorityHolder: "user",
      turnOrder: ["user", "ai"],
      players: {
        ...base.players,
        user: { ...base.players.user, hand: [bolt], manaPool: { ...base.players.user.manaPool, R: 3 } },
        ai: { ...base.players.ai, battlefield: [flail] },
      },
    };
  }

  it("an UNATTACHED Flail imposes nothing (opponent can still cast)", () => {
    expect(filterActions(legalActionsForPlayer(flailState(null), "user"), "cast-spell")).toHaveLength(1);
  });

  it("an ATTACHED Flail suppresses the opponent's cast during the controller's turn", () => {
    expect(filterActions(legalActionsForPlayer(flailState("somecreature"), "user"), "cast-spell")).toHaveLength(0);
  });
});
