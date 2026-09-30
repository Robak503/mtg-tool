/**
 * eleshNornMotherOfMachines.test.js — "Permanents entering don't cause abilities of permanents your opponents control to trigger."
 * (shelf decks D20, 2026-09-30: Brago Blink). Torpor Orb's opponent-scoped sibling: any permanent entering still raises its
 * enters events, but no ability of a PERMANENT an opponent of Norn's controller controls triggers from one — their own enters
 * abilities and their watchers, at all three enters dispatchers (enters, landfall, permanent-enters). Emblems are not permanents
 * and still fire; Norn's own entrance counts (CR 603.10). Her first line — your enters triggers trigger an additional time — was
 * already modeled; the card now reads native.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, addEmblem, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const NORN = card("Elesh Norn, Mother of Machines", "Legendary Creature — Phyrexian Praetor", "{4}{W}", 5, "Vigilance\nIf a permanent entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.\nPermanents entering don't cause abilities of permanents your opponents control to trigger.", { power: "4", toughness: "7", keywords: ["Vigilance"], colors: ["W"] });
const VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", 2, "When this creature enters, draw a card.", { power: "1", toughness: "1", colors: ["G"] });
const WARDEN = card("Soul Warden", "Creature — Human Cleric", "{W}", 1, "Whenever another creature enters, you gain 1 life.", { power: "1", toughness: "1", colors: ["W"] });
const LYNX = card("Steppe Lynx", "Creature — Cat", "{W}", 1, "Landfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.", { power: "0", toughness: "1", colors: ["W"] });
const NISSA_EMBLEM = "Whenever a land you control enters, you may draw a card.";
const FOREST = card("Forest", "Basic Land — Forest", "", 0, "({T}: Add {G}.)");
const FIREWEAVER = card("Reckless Fireweaver", "Creature — Human Artificer", "{1}{R}", 2, "Whenever an artifact you control enters, this creature deals 1 damage to each opponent.", { power: "1", toughness: "3", colors: ["R"] });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", 1, "{T}: Add {C}{C}.", { colors: [] });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });

const perm = (id, c, controller) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false });
function board({ active = "user", norn = true, user = {}, ai = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = (id) => [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `${id}-lib${i}` }));
  const seat = (id, o) => ({ ...g.players[id], hand: (o.hand || []).map(([cid, c]) => ({ ...c, id: cid })), battlefield: o.bf || [], library: lib(id), manaPool: { ...g.players[id].manaPool, ...(o.mana || {}) }, landsPlayedThisTurn: 0 });
  return { ...g, turn: 6, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: seat("user", { ...user, bf: [...(norn ? [perm("norn", NORN, "user")] : []), ...(user.bf || [])] }), ai: seat("ai", ai) } };
}
function act(s, who, pick) {
  const a = legalActionsForPlayer({ ...s, priorityHolder: who }, who).find(pick);
  if (!a) throw new Error(`no action for ${who}`);
  return dispatchAction({ ...s, priorityHolder: who }, a);
}
const cast = (s, who, id) => act(s, who, (a) => a.kind === "cast-spell" && a.cardId === id);
const playLand = (s, who, id) => act(s, who, (a) => a.kind === "play-land" && a.cardId === id);
/** Resolve everything: a land drop leaves its landfall triggers pending on an empty stack, so flush those first. */
const drain = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return n;
};
const drawn = (s, who) => 4 - s.players[who].library.length;
const life = (s, who) => s.players[who].life;

describe("the card", () => {
  it("the silence line reads, and the whole card is native", () => {
    expect({ marker: parseStaticAbilities(NORN).some((d) => d.oppEntersDontTrigger === true), tier: classifyCard(NORN) }).toEqual({ marker: true, tier: "native-static" });
  });
});

describe("⭐ in play", () => {
  it("⭐ their Elvish Visionary draws them nothing; yours draws you two (her first line)", () => {
    const theirs = drain(cast(board({ active: "ai", ai: { hand: [["v", VISIONARY]], mana: { G: 2 } } }), "ai", "v"));
    const yours = drain(cast(board({ user: { hand: [["v", VISIONARY]], mana: { G: 2 } } }), "user", "v"));
    const row = { theirs: drawn(theirs, "ai"), yours: drawn(yours, "user") };
    console.log(`WITNESS nornEnters ${JSON.stringify(row)}`);
    expect(row).toEqual({ theirs: 0, yours: 2 });
  });
  it("their watchers too: their Soul Warden gains nothing when your Bear enters; yours gains twice when theirs does", () => {
    const yourBear = drain(cast(board({ user: { hand: [["b", BEAR]], mana: { G: 2 } }, ai: { bf: [perm("aw", WARDEN, "ai")] } }), "user", "b"));
    const theirBear = drain(cast(board({ active: "ai", user: { bf: [perm("uw", WARDEN, "user")] }, ai: { hand: [["b", BEAR]], mana: { G: 2 } } }), "ai", "b"));
    expect({ theirWarden: life(yourBear, "ai"), yourWarden: life(theirBear, "user") }).toEqual({ theirWarden: 40, yourWarden: 42 });
  });
  it("her own entrance counts (CR 603.10): their Soul Warden doesn't see Norn arrive", () => {
    const s = drain(cast(board({ norn: false, user: { hand: [["n", NORN]], mana: { W: 5 } }, ai: { bf: [perm("aw", WARDEN, "ai")] } }), "user", "n"));
    expect({ nornIn: s.players.user.battlefield.some((p) => p.card?.name === NORN.name), theirLife: life(s, "ai") }).toEqual({ nornIn: true, theirLife: 40 });
  });
  it("landfall too — their Steppe Lynx stays 0/1 — but an emblem is no permanent: their Nissa emblem still draws", () => {
    let s = board({ active: "ai", ai: { hand: [["f", FOREST]], bf: [perm("lynx", LYNX, "ai")] } });
    s = addEmblem(s, { playerId: "ai", oracle: NISSA_EMBLEM });
    s = drain(playLand(s, "ai", "f"));
    const emblemAsked = s.pendingChoice?.kind === "optional-effect" && s.pendingChoice.controller === "ai"; // "you may draw a card"
    if (emblemAsked) s = drain(resolveOptionalChoice(s, true));
    const lynx = s.players.ai.battlefield.find((p) => p.id === "lynx");
    const pumped = (s.continuousEffects || []).some((e) => e.affects?.permanentIds?.includes("lynx") || e.affects?.permanentId === "lynx");
    const row = { lynxPumped: pumped, emblemAsked, emblemDrew: drawn(s, "ai"), lynxAlive: !!lynx };
    console.log(`WITNESS nornLandfall ${JSON.stringify(row)}`);
    expect(row).toEqual({ lynxPumped: false, emblemAsked: true, emblemDrew: 1, lynxAlive: true });
  });
  it("the artifact-enters watchers too: their Reckless Fireweaver pings no one when their Sol Ring enters — without Norn, it does", () => {
    const run = (norn) => drain(cast(board({ norn, active: "ai", ai: { hand: [["ring", SOL_RING]], bf: [perm("fw", FIREWEAVER, "ai")], mana: { C: 1 } } }), "ai", "ring"));
    expect({ withNorn: life(run(true), "user"), withoutNorn: life(run(false), "user") }).toEqual({ withNorn: 40, withoutNorn: 39 });
  });
  it("without Norn the same boards trigger as printed — their Visionary draws, their Lynx is pumped", () => {
    const vis = drain(cast(board({ norn: false, active: "ai", ai: { hand: [["v", VISIONARY]], mana: { G: 2 } } }), "ai", "v"));
    const land = drain(playLand(board({ norn: false, active: "ai", ai: { hand: [["f", FOREST]], bf: [perm("lynx", LYNX, "ai")] } }), "ai", "f"));
    const pumped = (land.continuousEffects || []).some((e) => e.affects?.permanentIds?.includes("lynx") || e.affects?.permanentId === "lynx");
    expect({ drew: drawn(vis, "ai"), pumped }).toEqual({ drew: 1, pumped: true });
  });
});
