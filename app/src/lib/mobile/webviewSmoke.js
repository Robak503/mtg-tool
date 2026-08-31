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

/**
 * Deterministic smoke cases that execute in both Vitest and the built browser
 * probe. The browser page adds realm checks; this function focuses on proving
 * that the real classifier and legal-choice graph executes after bundling.
 */
export function runWebviewSmoke() {
  const declaredExports = [
    "applyCounterDoubling",
    "checkAllStateBasedActions",
    "checkLandfallTriggers",
    "classifyCard",
    "createGameState",
    "createPermanent",
    "dispatchAction",
    "filterActions",
    "flushTriggers",
    "isNativeTier",
    "legalActionsForPlayer",
    "permanentPower",
    "permanentToughness",
    "resolveCombatDamage",
  ];
  const actualExports = Object.keys(runtime).sort();

  const plotState = mainPhaseState({
    hand: [SHERIFF],
    battlefield: [plains("p1"), plains("p2")],
  });
  const plotActions = runtime.filterActions(
    runtime.legalActionsForPlayer(plotState, "user"),
    "plot",
  );

  const adventureState = mainPhaseState({
    hand: [FAERIE],
    battlefield: [
      plains("p3"),
      plains("p4"),
      permanent("bear-target", {
        name: "Grizzly Bears",
        type: "Creature — Bear",
        power: 2,
        toughness: 2,
        oracle: "",
      }),
    ],
  });
  const adventureActions = runtime
    .filterActions(runtime.legalActionsForPlayer(adventureState, "user"), "cast-spell")
    .filter((action) => action.cardId === FAERIE.id);

  const emergeState = mainPhaseState({
    hand: [WRETCHED_GRYFF],
    battlefield: [
      permanent("bear-sacrifice", {
        name: "Grizzly Bears",
        type: "Creature — Bear",
        mana: "{1}{G}",
        power: 2,
        toughness: 2,
        oracle: "",
      }),
    ],
    manaPool: { U: 1, C: 3 },
  });
  const emergeActions = runtime
    .filterActions(runtime.legalActionsForPlayer(emergeState, "user"), "cast-spell")
    .filter((action) => action.cardId === WRETCHED_GRYFF.id);

  const checks = {
    exactRuntimeExports: JSON.stringify(actualExports) === JSON.stringify(declaredExports),
    classifier: runtime.classifyCard(SHERIFF) === "native-body",
    plot:
      plotActions.length === 1 &&
      plotActions[0].kind === "plot" &&
      plotActions[0].cardId === SHERIFF.id,
    adventure:
      adventureActions.some(
        (action) => action.adventureCast === true && action.name === "Gift of the Fae",
      ) && adventureActions.every((action) => Boolean(action.faceCard)),
    emerge:
      emergeActions.length === 1 &&
      emergeActions[0].emerge === true &&
      emergeActions[0].sacCreatureId === "bear-sacrifice" &&
      emergeActions[0].cost?.generic === 3 &&
      emergeActions[0].cost?.U === 1,
  };

  return {
    passed: Object.values(checks).every(Boolean),
    checks,
    observations: {
      runtimeExports: actualExports,
      plotActionCount: plotActions.length,
      adventureActionCount: adventureActions.length,
      emergeActionCount: emergeActions.length,
    },
  };
}
