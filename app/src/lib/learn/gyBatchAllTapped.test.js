/**
 * "PUT THEM ONTO THE BATTLEFIELD TAPPED" — the graveyard-enter batch referent, every card of it (play-weighted 2026-10-21).
 *
 * Hedge Shredder (EDHREC #1264) — "Whenever this Vehicle attacks, you may mill two cards. / Whenever one or more land cards are put
 * into your graveyard from your library, put them onto the battlefield tapped. / Crew 1". Sidisi's batch event already fires on the
 * land cards a mill puts into its controller's graveyard (Colossal Grave-Reaver reads "put one of them"); "them" is every land card
 * of that batch: all of them still in the graveyard enter together, tapped (a card that left the graveyard first is a new object the
 * trigger never named — CR 400.7), as one event (CR 603.6a). Put, not played — the turn's land drop is untouched (CR 305.4).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { checkEnterTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HEDGE_SHREDDER = {"name":"Hedge Shredder","type":"Artifact — Vehicle","mana":"{2}{G}{G}","cmc":4,"power":"5","toughness":"5","keywords":["Crew","Mill"],"colors":["G"],"oracle":"Whenever this Vehicle attacks, you may mill two cards.\nWhenever one or more land cards are put into your graveyard from your library, put them onto the battlefield tapped.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // body-only on c2d7f0b0
const STITCHERS_SUPPLIER = {"name":"Stitcher's Supplier","type":"Creature — Zombie","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":["Mill"],"colors":["B"],"oracle":"When this creature enters or dies, mill three cards. (Put the top three cards of your library into your graveyard.)"};
const THOUGHT_SCOUR = {"name":"Thought Scour","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Mill"],"colors":["U"],"oracle":"Target player mills two cards.\nDraw a card."};
const GRAZING_GLADEHART = {"name":"Grazing Gladehart","type":"Creature — Antelope","mana":"{2}{G}","cmc":3,"power":"2","toughness":"2","keywords":["Landfall"],"colors":["G"],"oracle":"Landfall — Whenever a land you control enters, you may gain 2 life."};
const COLOSSAL_GRAVE_REAVER = { name: "Colossal Grave-Reaver", type: "Creature — Dragon", mana: "{6}{B}{G}", cmc: 8, power: "7", toughness: "6", keywords: ["Flying", "Mill"],
  oracle: "Flying\nWhenever this creature enters or attacks, mill three cards.\nWhenever one or more creature cards are put into your graveyard from your library, put one of them onto the battlefield." };
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lib = (cards, prefix) => cards.map((c, i) => ({ ...c, id: c.id || `${prefix}${i}` }));
function board({ user = [], ai = [], userLib = [], aiLib = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], landsPlayedThisTurn: 0, consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, battlefield: user, library: lib(userLib, "u"), hand, graveyard: [] }, ai: { ...g.players.ai, battlefield: ai, library: lib(aiLib, "a"), graveyard: [] } } };
}
/** Resolve the stack, putting any triggers that fire onto it; a "you may" is answered `yes`. Fails loudly on a crashed resolver. */
function settle(s, yes = true) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length || n.pendingChoice?.kind === "optional-effect") && g++ < 40) {
    if (n.pendingChoice?.kind === "optional-effect") { n = resolveOptionalChoice(n, yes); continue; }
    if (n.pendingChoice) break;
    n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  }
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const field = (s, pid = "user") => s.players[pid].battlefield.map((p) => [p.card.name, !!p.tapped]).sort((a, b) => a[0].localeCompare(b[0]));
const names = (zone) => zone.map((c) => c.card?.name || c.name).sort();
const supplierMills = (s0) => settle(checkEnterTriggers(s0, s0.players.user.battlefield.find((p) => p.card.name === "Stitcher's Supplier")));

describe("the reader", () => {
  it("⭐ Hedge Shredder plays its whole text; the batch payoff is every card, tapped", () => {
    const d = detectTriggers(HEDGE_SHREDDER).find((x) => x.event === "gyEnterBatch");
    expect({ tier: classifyCard(HEDGE_SHREDDER), gyCardType: d.gyCardType, from: d.gyFromZone, atoms: parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms })
      .toEqual({ tier: "native-trigger", gyCardType: "Land", from: "library", atoms: [{ op: "gy-batch-to-battlefield", all: true, entersTapped: true, targetType: null }] });
  });
  it("control: Colossal Grave-Reaver's 'put one of them' reads as before", () => {
    const d = detectTriggers(COLOSSAL_GRAVE_REAVER).find((x) => x.event === "gyEnterBatch");
    expect(parseEffectClause(d.effectClause, "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "gy-batch-to-battlefield", targetType: null }]);
  });
});

describe("Hedge Shredder in play", () => {
  it("⭐ Stitcher's Supplier mills a Forest, a Bear and an Island: both lands enter tapped, the Bear stays; no land drop is spent", () => {
    const s = supplierMills(board({ user: [perm("hs", HEDGE_SHREDDER), perm("sup", STITCHERS_SUPPLIER)], userLib: [FOREST, BEARS, ISLAND, FOREST] }));
    const row = { field: field(s), graveyard: names(s.players.user.graveyard), library: names(s.players.user.library), drops: s.landsPlayedThisTurn ?? 0 };
    expect(row).toEqual({ field: [["Forest", true], ["Hedge Shredder", false], ["Island", true], ["Stitcher's Supplier", false]], graveyard: ["Grizzly Bears"], library: ["Forest"], drops: 0 });
  });
  it("⭐ the lands enter as one event and are lands entering: Grazing Gladehart's landfall triggers for each (4 life)", () => {
    const s = supplierMills(board({ user: [perm("hs", HEDGE_SHREDDER), perm("sup", STITCHERS_SUPPLIER), perm("gg", GRAZING_GLADEHART)], userLib: [FOREST, BEARS, ISLAND, FOREST] }));
    expect({ life: s.players.user.life - 40, field: field(s).filter(([n]) => n === "Forest" || n === "Island") }).toEqual({ life: 4, field: [["Forest", true], ["Island", true]] });
  });
  it("no land milled: nothing happens", () => {
    const s = supplierMills(board({ user: [perm("hs", HEDGE_SHREDDER), perm("sup", STITCHERS_SUPPLIER)], userLib: [BEARS, BEARS, BEARS] }));
    expect({ field: field(s), logged: s.log.some((e) => e.effect === "gy-batch-to-battlefield") }).toEqual({ field: [["Hedge Shredder", false], ["Stitcher's Supplier", false]], logged: false });
  });
  it("⭐ an opponent's land milled into THEIR graveyard is not one of yours: Thought Scour on the opponent puts nothing onto the battlefield", () => {
    const s0 = board({ user: [perm("hs", HEDGE_SHREDDER), perm("i1", ISLAND)], userLib: [BEARS, BEARS], aiLib: [FOREST, ISLAND, BEARS], hand: [{ ...THOUGHT_SCOUR, id: "c-ts" }] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-ts" && (a.targets || []).some((t) => t.id === "ai"));
    expect(cast, "Thought Scour aimed at the opponent is offered").toBeTruthy();
    const s = settle(dispatchAction(s0, cast));
    expect({ aiGraveyard: names(s.players.ai.graveyard), aiField: field(s, "ai"), userField: field(s).map(([n]) => n) })
      .toEqual({ aiGraveyard: ["Forest", "Island"], aiField: [], userField: ["Hedge Shredder", "Island"] });
  });
  it("SYNTHETIC: a milled land that left the graveyard before the trigger resolves stays where it went; the other enters", () => {
    let s = board({ user: [perm("hs", HEDGE_SHREDDER), perm("sup", STITCHERS_SUPPLIER)], userLib: [{ ...FOREST, id: "f1" }, BEARS, { ...ISLAND, id: "i1" }, FOREST] });
    s = resolveTopOfStack(flushTriggers(checkEnterTriggers(s, s.players.user.battlefield.find((p) => p.id === "sup")), { chooseTargets: chooseTriggerTargets })); // the mill resolves
    expect((s.pendingTriggers || []).length + s.stack.length).toBeGreaterThan(0);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: s.players.user.graveyard.filter((c) => c.id !== "f1"), exile: [...(s.players.user.exile || []), { ...FOREST, id: "f1" }] } } };
    const after = settle(s);
    expect({ field: field(after), exile: names(after.players.user.exile) }).toEqual({ field: [["Hedge Shredder", false], ["Island", true], ["Stitcher's Supplier", false]], exile: ["Forest"] });
  });
});
