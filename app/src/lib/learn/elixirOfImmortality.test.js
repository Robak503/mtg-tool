/**
 * ELIXIR OF IMMORTALITY (EDHREC #1445) — "{2}, {T}: You gain 5 life. Shuffle this artifact and your graveyard into their owner's
 * library." The plain "shuffle your graveyard into your library" atom with the source riding along (CR 701.24a — shuffling a card
 * into a library; each card goes to its OWNER's library, CR 400.3). Its bundled rulings, each witnessed below:
 *   · "If Elixir of Immortality is in your graveyard at the time the ability resolves, you'll still wind up shuffling it into your
 *     library because you shuffle your entire graveyard into your library. If it's anywhere else by that time, including in another
 *     player's graveyard, it remains where it is and you shuffle just your graveyard into your library."
 *   · "As the ability resolves, you'll shuffle Elixir of Immortality into its owner's library directly from the battlefield, if it's
 *     still there."
 *   · "If you gain control of another player's Elixir of Immortality and activate it, the Elixir of Immortality will be shuffled into
 *     its owner's library and the cards in your graveyard will be shuffled into your library."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, moveCardToZone } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const ELIXIR_OF_IMMORTALITY = {"name":"Elixir of Immortality","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{2}, {T}: You gain 5 life. Shuffle this artifact and your graveyard into their owner's library."}; // body-only on 55eb7d63
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const G = (id, card) => ({ ...card, id });
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
/** The user with Elixir (owned by `owner`) on the battlefield, {2} floating, two cards in the graveyard and four in the library. */
function board(owner = "user") {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const elixir = { ...createPermanent({ id: "elixir", card: { id: "c-elixir", ...ELIXIR_OF_IMMORTALITY }, controller: "user", summoningSick: false }), ...(owner !== "user" ? { owner } : {}) };
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, life: 40, battlefield: [elixir], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 },
        graveyard: [G("gy-bears", GRIZZLY_BEARS), G("gy-bolt", LIGHTNING_BOLT)], library: [0, 1, 2, 3].map((i) => G(`lib${i}`, GRIZZLY_BEARS)) },
      ai1: { ...s0.players.ai1, library: [0, 1, 2].map((i) => G(`ai-lib${i}`, GRIZZLY_BEARS)) } } };
}
const activate = (s) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "elixir");
  expect(act, "Elixir's ability is offered").toBeTruthy();
  return dispatchAction(s, act);
};
const zones = (s, pid) => ({ library: s.players[pid].library.map((c) => c.id).sort(), graveyard: s.players[pid].graveyard.map((c) => c.id).sort(), battlefield: s.players[pid].battlefield.map((p) => p.id) });

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(ELIXIR_OF_IMMORTALITY)).toBe("native-activated");
  });
  it("⭐ the clause is one atom: the graveyard shuffle with the source; a bare \"shuffle your graveyard into your library\" is unchanged", () => {
    const atoms = (oracle) => (parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || []).map((a) => ({ op: a.op, withSource: !!a.withSource }));
    expect({ elixir: atoms("You gain 5 life. Shuffle this artifact and your graveyard into their owner's library."), plain: atoms("Shuffle your graveyard into your library.") })
      .toEqual({ elixir: [{ op: "gain-life", withSource: false }, { op: "shuffle-graveyard-into-library", withSource: true }], plain: [{ op: "shuffle-graveyard-into-library", withSource: false }] });
  });
});

describe("the activation", () => {
  it("⭐ 5 life; the Elixir from the battlefield and the whole graveyard go into the library, which is shuffled", () => {
    const s = settle(activate(board()));
    expect({ life: s.players.user.life, ...zones(s, "user") })
      .toEqual({ life: 45, library: ["c-elixir", "gy-bears", "gy-bolt", "lib0", "lib1", "lib2", "lib3"], graveyard: [], battlefield: [] });
    expect((s.log || []).filter((l) => l.effect === "shuffle-graveyard-into-library").map((l) => ({ controller: l.controller, moved: l.moved }))).toEqual([{ controller: "user", moved: 2 }]);
  });

  it("⭐ the ruling — destroyed in response, the Elixir is in the graveyard and goes in with it", () => {
    const paid = activate(board());
    const destroyed = moveCardToZone(paid, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "elixir" });
    const s = settle(destroyed);
    expect({ life: s.players.user.life, ...zones(s, "user") })
      .toEqual({ life: 45, library: ["c-elixir", "gy-bears", "gy-bolt", "lib0", "lib1", "lib2", "lib3"], graveyard: [], battlefield: [] });
  });

  it("⭐ the ruling — exiled in response, it stays in exile; only the graveyard is shuffled in", () => {
    const paid = activate(board());
    const exiled = moveCardToZone(paid, { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: "elixir" });
    const s = settle(exiled);
    expect({ exile: s.players.user.exile.map((c) => c.id), ...zones(s, "user") })
      .toEqual({ exile: ["c-elixir"], library: ["gy-bears", "gy-bolt", "lib0", "lib1", "lib2", "lib3"], graveyard: [], battlefield: [] });
  });

  it("⭐ the ruling — another player's Elixir: it goes to its owner's library, your graveyard to yours", () => {
    const s = settle(activate(board("ai1")));
    expect({ user: zones(s, "user"), ai1: s.players.ai1.library.map((c) => c.id).sort() })
      .toEqual({ user: { library: ["gy-bears", "gy-bolt", "lib0", "lib1", "lib2", "lib3"], graveyard: [], battlefield: [] }, ai1: ["ai-lib0", "ai-lib1", "ai-lib2", "c-elixir"] });
  });
});
