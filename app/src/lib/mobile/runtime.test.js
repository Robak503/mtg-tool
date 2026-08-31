import { describe, expect, it } from "vitest";
import { MOBILE_RUNTIME_MANIFEST } from "./runtimeManifest.js";
import * as runtime from "./runtime.js";

const SHERIFF = {
  id: "sheriff",
  name: "Sheriff of Safe Passage",
  type: "Creature — Human Knight",
  mana: "{2}{W}",
  oracle:
    "This creature enters with a +1/+1 counter on it plus an additional +1/+1 counter on it for each other creature you control.\n" +
    "Plot {1}{W} (You may pay {1}{W} and exile this card from your hand. Cast it as a sorcery on a later turn without paying its mana cost. Plot only as a sorcery.)",
};

const FAERIE = {
  id: "faerie",
  name: "Faerie Guidemother // Gift of the Fae",
  type: "Creature — Faerie // Sorcery — Adventure",
  mana: "{W} // {1}{W}",
  oracle:
    "Faerie Guidemother - Creature — Faerie {W}\nFlying\n//\n" +
    "Gift of the Fae - Sorcery — Adventure {1}{W}\n" +
    "Target creature gets +2/+1 and gains flying until end of turn. (Then exile this card. You may cast the creature later from exile.)",
};

const WRETCHED_GRYFF = {
  id: "gryff",
  name: "Wretched Gryff",
  type: "Creature — Eldrazi Hippogriff",
  mana: "{7}",
  power: 3,
  toughness: 4,
  oracle:
    "Emerge {5}{U} (You may cast this spell by sacrificing a creature and paying the emerge cost reduced by that creature's mana value.)\n" +
    "When you cast this spell, draw a card.\nFlying",
};

function permanent(id, card) {
  return runtime.createPermanent({
    id,
    card: { id, ...card },
    controller: "user",
    summoningSick: false,
  });
}

function mainPhaseState({ hand = [], battlefield = [], manaPool = {} } = {}) {
  const state = runtime.createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...state,
    activePlayer: "user",
    priorityHolder: "user",
    phase: "precombat-main",
    step: "main",
    players: {
      ...state.players,
      user: {
        ...state.players.user,
        hand,
        battlefield,
        manaPool: { ...state.players.user.manaPool, ...manaPool },
      },
    },
  };
}

const plains = (id) =>
  permanent(id, {
    name: "Plains",
    type: "Basic Land — Plains",
    oracle: "{T}: Add {W}.",
  });

describe("Omnath mobile runtime entrypoint", () => {
  it("implements every export declared by the manifest", () => {
    const declared = MOBILE_RUNTIME_MANIFEST.entrypoints[0].exports;
    expect(Object.keys(runtime).sort()).toEqual([...declared].sort());
    for (const name of declared) expect(runtime[name]).toBeTypeOf("function");
  });

  it("carries the real classifier into the phone boundary", () => {
    expect(runtime.classifyCard(SHERIFF)).toBe("native-body");
    expect(runtime.isNativeTier(runtime.classifyCard(SHERIFF))).toBe(true);
  });

  it("offers a classifier-gated plot action", () => {
    const state = mainPhaseState({
      hand: [SHERIFF],
      battlefield: [plains("p1"), plains("p2")],
    });
    const plots = runtime.filterActions(runtime.legalActionsForPlayer(state, "user"), "plot");
    expect(plots).toEqual([
      expect.objectContaining({
        kind: "plot",
        cardId: "sheriff",
        name: "Sheriff of Safe Passage",
      }),
    ]);
  });

  it("offers a classifier-gated Adventure half without exposing the combined card", () => {
    const bear = permanent("bear", {
      name: "Grizzly Bears",
      type: "Creature — Bear",
      power: 2,
      toughness: 2,
      oracle: "",
    });
    const state = mainPhaseState({
      hand: [FAERIE],
      battlefield: [plains("p1"), plains("p2"), bear],
    });
    const casts = runtime
      .filterActions(runtime.legalActionsForPlayer(state, "user"), "cast-spell")
      .filter((action) => action.cardId === "faerie");
    expect(casts.some((action) => action.adventureCast && action.name === "Gift of the Fae")).toBe(
      true,
    );
    expect(casts.every((action) => action.faceCard)).toBe(true);
  });

  it("offers reduced emerge only when a legal sacrifice and payment exist", () => {
    const bear = permanent("bear", {
      name: "Grizzly Bears",
      type: "Creature — Bear",
      mana: "{1}{G}",
      power: 2,
      toughness: 2,
      oracle: "",
    });
    const state = mainPhaseState({
      hand: [WRETCHED_GRYFF],
      battlefield: [bear],
      manaPool: { U: 1, C: 3 },
    });
    const casts = runtime
      .filterActions(runtime.legalActionsForPlayer(state, "user"), "cast-spell")
      .filter((action) => action.cardId === "gryff");
    expect(casts).toEqual([
      expect.objectContaining({
        emerge: true,
        sacCreatureId: "bear",
        cost: expect.objectContaining({ generic: 3, U: 1 }),
      }),
    ]);
  });

  it("executes a legal land play through the dispatcher", () => {
    const forest = { id: "forest", name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." };
    const after = runtime.dispatchAction(mainPhaseState({ hand: [forest] }), {
      kind: "play-land",
      playerId: "user",
      cardId: forest.id,
      name: forest.name,
    });
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.battlefield[0].card.name).toBe("Forest");
    expect(after.players.user.landsPlayedThisTurn).toBe(1);
  });

  it("carries layers through combat damage", () => {
    const anthem = permanent("anthem", {
      name: "Glorious Anthem",
      type: "Enchantment",
      oracle: "Creatures you control get +1/+1.",
    });
    const soldier = permanent("soldier", {
      name: "Soldier",
      type: "Creature — Soldier",
      power: 1,
      toughness: 1,
      oracle: "",
    });
    const base = mainPhaseState({ battlefield: [] });
    const state = {
      ...base,
      activePlayer: "ai",
      players: {
        ...base.players,
        ai: { ...base.players.ai, battlefield: [{ ...anthem, controller: "ai" }, { ...soldier, controller: "ai" }] },
      },
      combat: { attackers: [{ permanentId: "soldier", attackingPlayer: "ai", defender: "user" }], blockers: [] },
    };
    expect(runtime.permanentPower(state, "soldier")).toBe(2);
    expect(runtime.permanentToughness(state, "soldier")).toBe(2);
    expect(runtime.resolveCombatDamage(state).players.user.life).toBe(38);
  });

  it("applies replacement effects, SBAs, and trigger flushing", () => {
    const season = permanent("season", {
      name: "Doubling Season",
      type: "Enchantment",
      oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead.",
    });
    const doomed = { ...permanent("doomed", { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }), damageMarked: 2 };
    const state = mainPhaseState({ battlefield: [season, doomed] });
    expect(runtime.applyCounterDoubling(state, "user", "+1/+1", 1, "doomed")).toBe(2);
    expect(runtime.checkAllStateBasedActions(state).players.user.graveyard[0].name).toBe("Bear");

    const flushed = runtime.flushTriggers({
      ...state,
      pendingTriggers: [{ id: "mobile-trigger", controller: "user", source: { name: "Witness" }, payload: {} }],
    });
    expect(flushed.pendingTriggers).toEqual([]);
    expect(flushed.stack[0].id).toBe("mobile-trigger");
  });
});
