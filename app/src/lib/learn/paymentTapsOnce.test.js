/**
 * paymentTapsOnce.test.js — a permanent a payment taps is tapped once (manaModel activateCostedInOrder + commitManaTap, 2026-10-20).
 *
 * A cost that taps a permanent needs it untapped: "A permanent that's already tapped can't be tapped again to pay the cost"
 * (CR 107.5), and "a permanent that's already tapped can't be tapped to pay a cost" (CR 118.3). Inside one planner call a tap
 * already marks every record that needs the permanents it taps (planPaymentCore's tapSource). The costed pass makes up to three
 * calls for one payment — the funding of a costed source ("{1}, {T}: Add {R}{G}."), that source's own tap, the rest of the cost —
 * and dropped from the later calls only the records whose OWN permanent an earlier call used. A record whose tap-other payers
 * an earlier call tapped stayed (Urza, Lord High Artificer's "Tap an untapped artifact you control: Add {U}." re-tapped the
 * Gruul Signet the pass had just activated), and the funding call could pay a costed source with a record that taps that very
 * source (Urza tapping the Signet for the Signet's own {1}). So canAfford counted mana the board can't make — an unpayable cost
 * offered — and the commit tapped a tapped permanent again for it.
 * Now every permanent a call taps is unavailable to the calls after it (as a record's own {T} or as a payer), the funding call
 * never uses a record that taps what the costed source's activation taps, and the commit refuses a tap whose cost names a
 * permanent that is already tapped (nothing added, nothing paid — the unpaid cost logged).
 *
 * Payments run through legalActionsForPlayer + dispatchAction (the Academy's auto-tap) or planPayment / canAfford on manaSources.
 * Real oracle fixtures: bundled Scryfall data (scryfall.oracle.local.json, 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { canAfford, commitManaTap, manaSources, planPayment } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, cmc: 0, colors: [], keywords: [], oracle, ...extra });
const FOREST = card("Forest", "Basic Land — Forest", "", "({T}: Add {G}.)");
const ISLAND = card("Island", "Basic Land — Island", "", "({T}: Add {U}.)");
const MOUNTAIN = card("Mountain", "Basic Land — Mountain", "", "({T}: Add {R}.)");
const URZA = card("Urza, Lord High Artificer", "Legendary Creature — Human Artificer", "{2}{U}{U}", "When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost.", { cmc: 4, colors: ["U"], power: "1", toughness: "4" });
const GRUUL_SIGNET = card("Gruul Signet", "Artifact", "{2}", "{1}, {T}: Add {R}{G}.", { cmc: 2 });
const SIMIC_SIGNET = card("Simic Signet", "Artifact", "{2}", "{1}, {T}: Add {G}{U}.", { cmc: 2 });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", "{T}: Add {C}{C}.", { cmc: 1 });
const RELIC = card("Darksteel Relic", "Artifact", "{0}", "Indestructible (Effects that say \"destroy\" don't destroy this artifact.)", { keywords: ["Indestructible"] });
const LLANOWAR = card("Llanowar Elves", "Creature — Elf Druid", "{G}", "{T}: Add {G}.", { cmc: 1, colors: ["G"], power: "1", toughness: "1" });
const PARENTS = card("Supportive Parents", "Creature — Human Citizen", "{2}{G}", "Tap two untapped creatures you control: Add one mana of any color.", { cmc: 3, colors: ["G"], power: "3", toughness: "3" });
const RUMBLE_ARENA = card("Rumble Arena", "Land", "", "Vigilance\nWhen this land enters, scry 1. (Look at the top card of your library. You may put it on the bottom.)\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color.", { keywords: ["Vigilance", "Scry"] });
const LOOT = card("Loot, the Pathfinder", "Legendary Creature — Beast Noble", "{2}{G}{U}{R}", "Double strike, vigilance, haste\nExhaust — {G}, {T}: Add three mana of any one color. (Activate each exhaust ability only once.)\nExhaust — {U}, {T}: Draw three cards.\nExhaust — {R}, {T}: Loot deals 3 damage to any target.", { cmc: 5, colors: ["G", "R", "U"], keywords: ["Vigilance", "Haste", "Exhaust", "Double strike"], power: "2", toughness: "4" });
const ENCAMPMENT = card("Survivors' Encampment", "Land — Desert", "", "{T}: Add {C}.\n{T}, Tap an untapped creature you control: Add one mana of any color.");
const SPRINGLEAF_DRUM = card("Springleaf Drum", "Artifact", "{1}", "{T}, Tap an untapped creature you control: Add one mana of any color.", { cmc: 1 });
// The spells cast.
const COILING_ORACLE = card("Coiling Oracle", "Creature — Snake Elf Druid", "{G}{U}", "When this creature enters, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put that card into your hand.", { cmc: 2, colors: ["G", "U"], power: "1", toughness: "1" });
const YAVIMAYA_BARBARIAN = card("Yavimaya Barbarian", "Creature — Elf Barbarian", "{R}{G}", "Protection from blue", { cmc: 2, colors: ["G", "R"], keywords: ["Protection"], power: "2", toughness: "2" });
const FIRST_WING = card("Azorius First-Wing", "Creature — Griffin", "{W}{U}", "Flying, protection from enchantments", { cmc: 2, colors: ["U", "W"], keywords: ["Flying", "Protection"], power: "2", toughness: "2" });

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
function table({ user = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), library: [{ ...FOREST, id: "lib" }], manaPool: { ...NO_MANA } } } };
}
const P = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false }), ...extra });
const cast = (cardId) => (a) => a.kind === "cast-spell" && a.cardId === cardId;
const offered = (s, cardId) => legalActionsForPlayer(s, "user").some(cast(cardId));
function castIt(s, cardId) {
  const a = legalActionsForPlayer(s, "user").find(cast(cardId));
  if (!a) throw new Error(`${cardId} is not offered`);
  return dispatchAction(s, a);
}
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const cost = (c) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...c });
const plan = (s, c) => planPayment(s.players.user.manaPool, manaSources(s, "user"), c);
const affords = (s, c) => canAfford(s.players.user.manaPool, manaSources(s, "user"), c);
/** The permanents a plan taps more than once: each tap's source (unless its line has no {T}) and its tap-other payers. */
function tappedTwice(p) {
  const n = new Map();
  for (const t of p?.taps || []) for (const id of [...(t.noTap || t.fromHand ? [] : [t.permanentId]), ...(t.extraTaps || [])]) n.set(id, (n.get(id) || 0) + 1);
  return [...n].filter(([, k]) => k > 1).map(([id]) => id);
}
const unpaid = (s) => (s.log || []).filter((e) => e.event === "tap-cost-unpaid");

describe("⛔ the costed pass taps a permanent once (CR 107.5, 118.3)", () => {
  it("⭐ Urza's tap can't re-tap the Gruul Signet the costed pass activated: Mountain, Gruul Signet and Urza can't pay {G}{U} — Coiling Oracle is not offered", () => {
    const s = table({ user: [P("m1", MOUNTAIN), P("signet", GRUUL_SIGNET), P("urza", URZA)], hand: [["h-oracle", COILING_ORACLE]] });
    // The only artifact Urza can tap is the Signet (manaSources resolves its payer off the untapped board).
    expect(manaSources(s, "user").find((r) => r.permanentId === "urza").extraTaps).toEqual(["signet"]);
    expect(plan(s, cost({ G: 1, U: 1 }))).toBeNull();
    expect(affords(s, cost({ G: 1, U: 1 }))).toBe(false);
    expect(offered(s, "h-oracle")).toBe(false);
  });

  it("⭐ with an Island beside them the {U} comes from the Island: Coiling Oracle taps the Mountain, the Signet and the Island, and no permanent twice", () => {
    const s = table({ user: [P("m1", MOUNTAIN), P("signet", GRUUL_SIGNET), P("urza", URZA), P("i1", ISLAND)], hand: [["h-oracle", COILING_ORACLE]] });
    const p = plan(s, cost({ G: 1, U: 1 }));
    expect(p).not.toBeNull();
    expect(tappedTwice(p)).toEqual([]);
    expect(p.taps.map((t) => t.permanentId).sort()).toEqual(["i1", "m1", "signet"]);
    const out = castIt(s, "h-oracle");
    expect(tapped(out)).toEqual(["i1", "m1", "signet"]);
    expect(unpaid(out)).toEqual([]);
    expect(out.players.user.manaPool).toEqual({ ...NO_MANA, R: 1 }); // the Signet's {R} floats
  });

  it("⭐ Urza can't fund the Gruul Signet by tapping the Signet itself: Urza and Gruul Signet can't pay Yavimaya Barbarian's {R}{G}", () => {
    const s = table({ user: [P("urza", URZA), P("signet", GRUUL_SIGNET)], hand: [["h-barb", YAVIMAYA_BARBARIAN]] });
    expect(plan(s, cost({ R: 1, G: 1 }))).toBeNull();
    expect(affords(s, cost({ R: 1, G: 1 }))).toBe(false);
    expect(offered(s, "h-barb")).toBe(false);
  });

  it("⭐ Supportive Parents can't tap the Llanowar Elves that funded Rumble Arena: Elves, Parents and the Arena can't pay Azorius First-Wing's {W}{U}", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("parents", PARENTS), P("arena", RUMBLE_ARENA)], hand: [["h-wing", FIRST_WING]] });
    expect(manaSources(s, "user").find((r) => r.permanentId === "parents").extraTaps).toEqual(["elves", "parents"]);
    expect(plan(s, cost({ W: 1, U: 1 }))).toBeNull();
    expect(affords(s, cost({ W: 1, U: 1 }))).toBe(false);
    expect(offered(s, "h-wing")).toBe(false);
  });

  it("⭐ Survivors' Encampment can't tap Loot, the Pathfinder after Loot's exhaust mana: Forest, Loot and the Encampment pay {W}{W}{W}{C} but not {W}{W}{W}{U}", () => {
    const s = table({ user: [P("f1", FOREST), P("loot", LOOT), P("enc", ENCAMPMENT)] });
    expect(plan(s, cost({ W: 3, U: 1 }))).toBeNull();
    expect(affords(s, cost({ W: 3, U: 1 }))).toBe(false);
    const p = plan(s, cost({ W: 3, C: 1 }));
    expect(p).not.toBeNull();
    expect(tappedTwice(p)).toEqual([]);
    expect(affords(s, cost({ W: 3, C: 1 }))).toBe(true);
  });

  it("⭐ a costed source tapped as another record's payer is not activated after it: Supportive Parents taps Loot to fund Rumble Arena, so Loot makes no exhaust mana — Arena, Loot, Parents and a Forest can't pay {W}{W}{W}{W}", () => {
    const s = table({ user: [P("arena", RUMBLE_ARENA), P("loot", LOOT), P("parents", PARENTS), P("f1", FOREST)] });
    expect(manaSources(s, "user").find((r) => r.permanentId === "parents").extraTaps).toEqual(["loot", "parents"]);
    // Three is the most white this board makes: the Forest funds Loot's {G} for {W}{W}{W}; the Arena's {1} could then only be one of
    // those three, and Parents needs two untapped creatures with Loot tapped. Without Loot: Parents and the Arena, two. A fourth {W}
    // takes Loot tapped twice.
    expect(plan(s, cost({ W: 4 }))).toBeNull();
    expect(affords(s, cost({ W: 4 }))).toBe(false);
  });

  it("⭐ a later costed source's funding can't tap a permanent an earlier call tapped as a payer: Llanowar Elves, tapped by Supportive Parents to fund Rumble Arena, can't also pay Loot's {G} — Arena, Parents, Elves and Loot can't pay {W}{W}{W}{W}", () => {
    const s = table({ user: [P("arena", RUMBLE_ARENA), P("parents", PARENTS), P("elves", LLANOWAR), P("loot", LOOT)] });
    expect(manaSources(s, "user").find((r) => r.permanentId === "parents").extraTaps).toEqual(["parents", "elves"]);
    // Three white at most: the Elves fund Loot's {G}; the Arena's {1} could then only be one of those three, and Parents needs two
    // untapped creatures with the Elves and Loot tapped.
    expect(plan(s, cost({ W: 4 }))).toBeNull();
    expect(affords(s, cost({ W: 4 }))).toBe(false);
  });
});

describe("⛔ the commit taps no permanent that is already tapped (CR 107.5, 118.3, 701.26a)", () => {
  it("⭐ a {T} line of a tapped Sol Ring adds nothing and pays nothing — the unpaid cost is logged", () => {
    const s = table({ user: [P("sol", SOL_RING, { tapped: true })] });
    const out = commitManaTap(s, "user", { permanentId: "sol", color: "C", amount: 2 });
    expect(out.players.user.manaPool).toEqual(NO_MANA);
    expect(unpaid(out).map((e) => e.permanentId)).toEqual(["sol"]);
  });

  it("⭐ Urza's tap whose payer is already tapped adds nothing: the Gruul Signet tapped since the record was read", () => {
    const s = table({ user: [P("signet", GRUUL_SIGNET), P("urza", URZA)] });
    const rec = manaSources(s, "user").find((r) => r.permanentId === "urza");
    expect(rec.extraTaps).toEqual(["signet"]);
    const later = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "signet" ? { ...p, tapped: true } : p)) } } };
    const out = commitManaTap(later, "user", { permanentId: "urza", color: "U", amount: 1, extraTaps: ["signet"], noTap: true });
    expect(out.players.user.manaPool).toEqual(NO_MANA);
    expect(unpaid(out).map((e) => e.permanentId)).toEqual(["urza"]);
  });

  it("control: an untapped Sol Ring adds {C}{C} and taps; Urza (its line has no {T}) adds {U} while tapped, tapping the untapped Relic", () => {
    const s = table({ user: [P("sol", SOL_RING), P("relic", RELIC), P("urza", URZA, { tapped: true })] });
    const a = commitManaTap(s, "user", { permanentId: "sol", color: "C", amount: 2 });
    expect(a.players.user.manaPool).toEqual({ ...NO_MANA, C: 2 });
    expect(tapped(a)).toEqual(["sol", "urza"]);
    const b = commitManaTap(s, "user", { permanentId: "urza", color: "U", amount: 1, extraTaps: ["relic"], noTap: true });
    expect(b.players.user.manaPool).toEqual({ ...NO_MANA, U: 1 });
    expect(tapped(b)).toEqual(["relic", "urza"]);
    expect([...unpaid(a), ...unpaid(b)]).toEqual([]);
  });
});

describe("controls — what the fix leaves as it was", () => {
  it("Urza taps another artifact: Mountain, Gruul Signet, Darksteel Relic and Urza pay Coiling Oracle — the Mountain funds the Signet, Urza taps the Relic", () => {
    const s = table({ user: [P("m1", MOUNTAIN), P("signet", GRUUL_SIGNET), P("relic", RELIC), P("urza", URZA)], hand: [["h-oracle", COILING_ORACLE]] });
    expect(manaSources(s, "user").find((r) => r.permanentId === "urza").extraTaps).toEqual(["relic"]);
    expect(affords(s, cost({ G: 1, U: 1 }))).toBe(true);
    expect(tapped(castIt(s, "h-oracle"))).toEqual(["m1", "relic", "signet"]);
  });

  it("Urza funds the Gruul Signet by tapping Darksteel Relic: Urza, the Signet and the Relic pay Yavimaya Barbarian's {R}{G}", () => {
    const s = table({ user: [P("urza", URZA), P("signet", GRUUL_SIGNET), P("relic", RELIC)], hand: [["h-barb", YAVIMAYA_BARBARIAN]] });
    expect(affords(s, cost({ R: 1, G: 1 }))).toBe(true);
    expect(tapped(castIt(s, "h-barb"))).toEqual(["relic", "signet"]);
  });

  it("an ordinary costed payment: a Forest funds Simic Signet for Coiling Oracle", () => {
    const s = table({ user: [P("f1", FOREST), P("signet", SIMIC_SIGNET)], hand: [["h-oracle", COILING_ORACLE]] });
    expect(tapped(castIt(s, "h-oracle"))).toEqual(["f1", "signet"]);
  });

  it("one call's own rule stands: Springleaf Drum beside a lone Llanowar Elves pays {G} but not {2}", () => {
    const s = table({ user: [P("drum", SPRINGLEAF_DRUM), P("elves", LLANOWAR)] });
    expect(affords(s, cost({ G: 1 }))).toBe(true);
    expect(plan(s, cost({ generic: 2 }))).toBeNull();
    expect(affords(s, cost({ generic: 2 }))).toBe(false);
  });

  it("Supportive Parents taps itself and the Elves for one mana: Elves and Parents pay {W}", () => {
    const s = table({ user: [P("elves", LLANOWAR), P("parents", PARENTS)] });
    const p = plan(s, cost({ W: 1 }));
    expect(p.taps.map((t) => [t.permanentId, t.extraTaps])).toEqual([["parents", ["elves", "parents"]]]);
    expect(affords(s, cost({ W: 1 }))).toBe(true);
  });
});
