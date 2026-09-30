/**
 * leavesBatch.test.js — "Whenever one or more [other] creatures you control leave the battlefield [without dying], …" (shelf decks
 * D20, 2026-09-30: Dour Port-Mage for Brago Blink; Sally Sparrow's plain form). The diesBatch shape: the plural subject is
 * singularized onto the singular leaves arm, and the `permanentLeavesBatch` event fires ONCE per watcher per leave batch
 * (CR 603.2c) through its own pass. "without dying" skips a graveyard exit (CR 700.4). The leaving permanents are sources too
 * (a leaves-the-battlefield ability looks back in time — CR 603.10a), each source id counted once.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const PORT_MAGE = card("Dour Port-Mage", "Creature — Frog Wizard", "{1}{U}", 2, "Whenever one or more other creatures you control leave the battlefield without dying, draw a card.\n{1}{U}, {T}: Return another target creature you control to its owner's hand.", { power: "1", toughness: "3", colors: ["U"] });
const SALLY = card("Sally Sparrow", "Legendary Creature — Human Detective", "{2}{W}{U}", 4, "You may cast creature spells as though they had flash.\nWhenever one or more other creatures you control leave the battlefield, investigate. This ability triggers only once each turn. (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")", { power: "2", toughness: "3", colors: ["W", "U"] });
const UNSUMMON = card("Unsummon", "Instant", "{U}", 1, "Return target creature to its owner's hand.", { colors: ["U"] });
const BOLT = card("Lightning Bolt", "Instant", "{R}", 1, "Lightning Bolt deals 3 damage to any target.", { colors: ["R"] });
const EVACUATION = card("Evacuation", "Instant", "{3}{U}{U}", 5, "Return all creatures to their owners' hands.", { colors: ["U"] });
const FLICKER = card("Ghostly Flicker", "Instant", "{2}{U}", 3, "Exile two target artifacts, creatures, and/or lands you control, then return those cards to the battlefield under your control.", { colors: ["U"] });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3", colors: ["R"] });

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function board({ watcher = PORT_MAGE, user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (id) => [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `${id}-lib${i}` }));
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: lib(id), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) } });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", { ...user, bf: [perm("watcher", watcher, "user"), perm("bear", BEAR, "user"), perm("giant", GIANT, "user"), ...(user.bf || [])] }), ai: seat("ai", ai) } };
}
function cast(s, id, pick = () => true) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: "user" }, "user").find((x) => x.kind === "cast-spell" && x.cardId === id && pick(x));
  if (!a) throw new Error(`no cast of ${id}`);
  return dispatchAction({ ...s, priorityHolder: "user" }, a);
}
const drain = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
};
const drawn = (s) => 4 - s.players.user.library.length;
const clues = (s) => s.players.user.battlefield.filter((p) => /Clue/.test(p.card?.name || "")).length;

describe("the cards", () => {
  it("detect as the batch event (with its without-dying flag) and read native", () => {
    const pick = (c) => detectTriggers(c).filter((d) => d.event === "permanentLeavesBatch").map((d) => ({ scope: d.scope, withoutDying: !!d.withoutDying }));
    expect({ portMage: pick(PORT_MAGE), sally: pick(SALLY), tiers: [classifyCard(PORT_MAGE), classifyCard(SALLY)] }).toEqual({
      portMage: [{ scope: "otherCreatureYouControlLeaves", withoutDying: true }],
      sally: [{ scope: "otherCreatureYouControlLeaves", withoutDying: false }],
      tiers: ["native-mixed", "native-mixed"],
    });
  });
});

describe("⭐ in play — Dour Port-Mage", () => {
  it("⭐ a bounce draws; a death doesn't (CR 700.4)", () => {
    const bounced = drain(cast(board({ user: { hand: [["u", UNSUMMON]], mana: { U: 1 } } }), "u", (a) => a.targets[0].id === "bear"));
    const died = drain(cast(board({ user: { hand: [["b", BOLT]], mana: { R: 1 } } }), "b", (a) => a.targets[0].id === "bear"));
    expect({ bounced: drawn(bounced), died: drawn(died), bearDead: died.players.user.graveyard.some((c) => c.name === "Grizzly Bears") }).toEqual({ bounced: 1, died: 0, bearDead: true });
  });
  it("⭐ ONE draw for a batch (CR 603.2c) — Evacuation returns the Bear, the Giant and Port-Mage itself, which still saw the others go (CR 603.10a)", () => {
    const s = drain(cast(board({ user: { hand: [["e", EVACUATION]], mana: { U: 5 } }, ai: { bf: [perm("theirs", BEAR, "ai")] } }), "e"));
    const row = { drawn: drawn(s), portMageInHand: s.players.user.hand.some((c) => c.name === "Dour Port-Mage") };
    console.log(`WITNESS portMageBatch ${JSON.stringify(row)}`);
    expect(row).toEqual({ drawn: 1, portMageInHand: true });
  });
  it("only creatures YOU control: bouncing their creature draws nothing", () => {
    const s = drain(cast(board({ user: { hand: [["u", UNSUMMON]], mana: { U: 1 } }, ai: { bf: [perm("theirs", BEAR, "ai")] } }), "u", (a) => a.targets[0].id === "theirs"));
    expect({ drawn: drawn(s), theirsInHand: s.players.ai.hand.some((c) => c.name === "Grizzly Bears") }).toEqual({ drawn: 0, theirsInHand: true });
  });
  it("a flicker of Port-Mage and the Bear draws once — the flickered-back watcher is the same source, not a second one", () => {
    const s = drain(cast(board({ user: { hand: [["f", FLICKER]], mana: { U: 3 } } }), "f", (a) => a.targets.map((t) => t.id).sort().join() === "bear,watcher"));
    const row = { drawn: drawn(s), back: ["watcher", "bear"].map((id) => s.players.user.battlefield.some((p) => p.card?.name === (id === "bear" ? "Grizzly Bears" : "Dour Port-Mage"))) };
    console.log(`WITNESS portMageFlicker ${JSON.stringify(row)}`);
    expect(row).toEqual({ drawn: 1, back: [true, true] });
  });
});

describe("⭐ in play — Sally Sparrow (the plain form, once each turn)", () => {
  it("a bounce investigates; a second one the same turn doesn't; a death counts too (no without-dying)", () => {
    let s = drain(cast(board({ watcher: SALLY, user: { hand: [["u1", UNSUMMON], ["u2", UNSUMMON]], mana: { U: 2 } } }), "u1", (a) => a.targets[0].id === "bear"));
    const first = clues(s);
    s = drain(cast(s, "u2", (a) => a.targets[0].id === "giant"));
    const died = drain(cast(board({ watcher: SALLY, user: { hand: [["b", BOLT]], mana: { R: 1 } } }), "b", (a) => a.targets[0].id === "bear"));
    expect({ first, afterSecond: clues(s), onDeath: clues(died) }).toEqual({ first: 1, afterSecond: 1, onDeath: 1 });
  });
});
