/**
 * genericTapOrder.test.js — the auto-tap pays GENERIC with a plain colorless source first (manaModel planPaymentCore tapAny).
 *
 * Measured 2026-10-16 through legalActionsForPlayer + dispatchAction, empty pool, Lightning Bolt in hand, activating
 * Purphoros, God of the Forge's {2}{R}: with Mountain, Mountain, Mountain, Sol Ring on the battlefield in that order the
 * planner tapped all three Mountains (one for the {R}, two for the generic), Sol Ring stayed untapped and the Bolt was no
 * longer castable; with Sol Ring first it tapped the Ring and one Mountain and the Bolt stayed castable. tapAny took the
 * first untapped source in board order, and lands usually reach the battlefield before rocks. This is the source-side twin
 * of GENERIC_SPEND_ORDER (genericSpendOrder.test.js): any mana pays generic (CR 107.4b), colorless pays little else (a {C}
 * pip, CR 107.4c), so the colored sources are the ones to keep.
 *
 * The order now: a plain colorless permanent first (every record it offers is colorless with no rider), the smallest that
 * covers the generic still owed, else board order; then every other repeatable source in board order; a sacrifice source
 * last. One still goes first when it over-produces (Sol Ring for a lone {1}) — the surplus floats to the end of the step
 * (CR 106.4). A rider keeps a source where it was: a skipped untap (Basalt Monolith, Mana Vault), a sacrifice (Eldrazi
 * Spawn), a creature sacrifice (Ashnod's Altar), life (Hall of the Bandit Lord), snow (Snow-Covered Wastes), stored
 * counters (Mage-Ring Network), a colored line beside the colorless one (Mogg Hollows), a colored bonus (Fertile Ground).
 *
 * Real oracle fixtures: bundled Scryfall via cardIndex.publicCard (2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { permanentIsCreature } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { manaSources } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PURPHOROS = { name: "Purphoros, God of the Forge", type: "Legendary Enchantment Creature — God", mana: "{3}{R}", power: "6", toughness: "5", keywords: ["Indestructible"], colors: ["R"],
  oracle: "Indestructible\nAs long as your devotion to red is less than five, Purphoros isn't a creature.\nWhenever another creature you control enters, Purphoros deals 2 damage to each opponent.\n{2}{R}: Creatures you control get +1/+0 until end of turn." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], colors: ["R"], oracle: "Lightning Bolt deals 3 damage to any target." };
const STRIKE = { name: "Lightning Strike", type: "Instant", mana: "{1}{R}", keywords: [], colors: ["R"], oracle: "Lightning Strike deals 3 damage to any target." };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", keywords: [], colors: [], oracle: "({T}: Add {R}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], colors: [], oracle: "{T}: Add {C}." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", keywords: [], colors: [], oracle: "{T}: Add {C}{C}." };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", keywords: [], colors: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const THRAN_DYNAMO = { name: "Thran Dynamo", type: "Artifact", mana: "{4}", keywords: [], colors: [], oracle: "{T}: Add {C}{C}{C}." };
const BASALT_MONOLITH = { name: "Basalt Monolith", type: "Artifact", mana: "{3}", keywords: [], colors: [],
  oracle: "This artifact doesn't untap during your untap step.\n{T}: Add {C}{C}{C}.\n{3}: Untap this artifact." };
const MANA_VAULT = { name: "Mana Vault", type: "Artifact", mana: "{1}", keywords: [], colors: [],
  oracle: "This artifact doesn't untap during your untap step.\nAt the beginning of your upkeep, you may pay {4}. If you do, untap this artifact.\nAt the beginning of your draw step, if this artifact is tapped, it deals 1 damage to you.\n{T}: Add {C}{C}{C}." };
const SPAWN = { name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", mana: "", power: "0", toughness: "1", layout: "token", keywords: [], colors: [], oracle: "Sacrifice this creature: Add {C}." };
const ASHNODS_ALTAR = { name: "Ashnod's Altar", type: "Artifact", mana: "{3}", keywords: [], colors: [], oracle: "Sacrifice a creature: Add {C}{C}." };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };
const HALL = { name: "Hall of the Bandit Lord", type: "Legendary Land", mana: "", keywords: [], colors: [],
  oracle: "Hall of the Bandit Lord enters tapped.\n{T}, Pay 3 life: Add {C}. If that mana is spent on a creature spell, it gains haste." };
const SNOW_WASTES = { name: "Snow-Covered Wastes", type: "Basic Snow Land", mana: "", keywords: [], colors: [], oracle: "{T}: Add {C}." };
const MOGG_HOLLOWS = { name: "Mogg Hollows", type: "Land", mana: "", keywords: [], colors: [],
  oracle: "{T}: Add {C}.\n{T}: Add {R} or {G}. This land doesn't untap during your next untap step." };
const MAGE_RING = { name: "Mage-Ring Network", type: "Land", mana: "", keywords: [], colors: [],
  oracle: "{T}: Add {C}.\n{1}, {T}: Put a storage counter on this land.\n{T}, Remove any number of storage counters from this land: Add {C} for each storage counter removed this way." };
const FERTILE_GROUND = { name: "Fertile Ground", type: "Enchantment — Aura", mana: "{1}{G}", keywords: ["Enchant"], colors: ["G"],
  oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", mana: "", layout: "token", keywords: [], colors: [], oracle: "{T}, Sacrifice this token: Add one mana of any color." };
const MUTAVAULT = { name: "Mutavault", type: "Land", mana: "", keywords: [], colors: [],
  oracle: "{T}: Add {C}.\n{1}: This land becomes a 2/2 creature with all creature types until end of turn. It's still a land." };

const NO_MANA = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function table({ user = [], hand = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...NO_MANA, ...mana } } } };
}
const P = (id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false });
const MOUNTAINS = () => [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("m3", MOUNTAIN)];
function act(s, pick) { const a = legalActionsForPlayer(s, "user").find(pick); if (!a) throw new Error("no such action offered"); return dispatchAction(s, a); }
/** Resolve the stack — and fail loudly on a resolver crash (the engine logs one as a stack-resolve-error instead of throwing). */
const settle = (s) => {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
const pool = (s) => ({ ...s.players.user.manaPool });
const tapped = (s) => s.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort();
const onBattlefield = (s) => s.players.user.battlefield.map((p) => p.id).sort();
const purphoros = (a) => a.kind === "activate-ability" && a.permanentId === "purph";
const castAtAi = (cardId) => (a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === "ai";
const boltOffered = (s) => legalActionsForPlayer(s, "user").some(castAtAi("bolt"));

describe("the cards", () => {
  it("every fixture reads native", () => {
    expect(Object.fromEntries([PURPHOROS, BOLT, STRIKE, SOL_RING, MIND_STONE, THRAN_DYNAMO, BASALT_MONOLITH, MANA_VAULT, ASHNODS_ALTAR].map((c) => [c.name, classifyCard(c)]))).toEqual({
      "Purphoros, God of the Forge": "native-mixed", "Lightning Bolt": "native-spell", "Lightning Strike": "native-spell", "Sol Ring": "native-mana",
      "Mind Stone": "native-mana", "Thran Dynamo": "native-mana", "Basalt Monolith": "native-mana", "Mana Vault": "native-mana", "Ashnod's Altar": "native-mana",
    });
  });
});

describe("Purphoros's {2}{R} with Lightning Bolt in hand — both board orders, through legalActionsForPlayer + dispatchAction", () => {
  it("Mountain, Mountain, Mountain, Sol Ring: the Ring pays the {2}, one Mountain the {R}; two Mountains stay up and the Bolt is cast", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), ...MOUNTAINS(), P("ring", SOL_RING)], hand: [["bolt", BOLT]] });
    const paid = act(s0, purphoros);
    const resolved = settle(paid);
    const lifeBefore = resolved.players.ai.life;
    const bolted = settle(act(resolved, castAtAi("bolt")));
    expect({ tapped: tapped(paid), pool: pool(paid), boltOffered: boltOffered(resolved), damage: lifeBefore - bolted.players.ai.life })
      .toEqual({ tapped: ["m1", "ring"], pool: NO_MANA, boltOffered: true, damage: 3 });
  });

  it("Sol Ring, Mountain, Mountain, Mountain: the same two sources — board order no longer decides", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), P("ring", SOL_RING), ...MOUNTAINS()], hand: [["bolt", BOLT]] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), pool: pool(paid), boltOffered: boltOffered(settle(paid)) }).toEqual({ tapped: ["m1", "ring"], pool: NO_MANA, boltOffered: true });
  });
});

describe("among plain colorless sources, the smallest that covers what is owed; over-producing still beats a colored source", () => {
  it("Lightning Strike's {1}{R} from Mountain, Mountain, Sol Ring: the Ring pays the {1} and its spare {C} floats — a Mountain stays up for the Bolt", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("ring", SOL_RING)], hand: [["strike", STRIKE], ["bolt", BOLT]] });
    const cast = act(s0, castAtAi("strike"));
    expect({ tapped: tapped(cast), pool: pool(cast), boltOffered: boltOffered(settle(cast)) }).toEqual({ tapped: ["m1", "ring"], pool: { ...NO_MANA, C: 1 }, boltOffered: true });
  });

  it("Lightning Strike's {1}{R} from Mountain, Sol Ring, Mind Stone: Mind Stone pays the {1} exactly and the Ring stays up", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("ring", SOL_RING), P("stone", MIND_STONE)], hand: [["strike", STRIKE]] });
    const cast = act(s0, castAtAi("strike"));
    expect({ tapped: tapped(cast), pool: pool(cast) }).toEqual({ tapped: ["m1", "stone"], pool: NO_MANA });
  });

  it("Purphoros's {2}{R} from Mountain, Mind Stone, Sol Ring: Sol Ring covers the {2} exactly and Mind Stone stays up", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), P("m1", MOUNTAIN), P("stone", MIND_STONE), P("ring", SOL_RING)] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), pool: pool(paid) }).toEqual({ tapped: ["m1", "ring"], pool: NO_MANA });
  });

  it("Purphoros's {2}{R} from Mountain, Wastes, Thran Dynamo: the Dynamo alone covers the {2} and floats one — the Wastes first would still need the Dynamo and float two", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), P("m1", MOUNTAIN), P("w", WASTES), P("dyn", THRAN_DYNAMO)] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), pool: pool(paid) }).toEqual({ tapped: ["dyn", "m1"], pool: { ...NO_MANA, C: 1 } });
  });

  it("a Treasure is still cracked last: Treasure, Mountain, Mountain, Sol Ring pays the {2}{R} with a Mountain and the Ring", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), P("treasure", TREASURE), P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("ring", SOL_RING)] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid) }).toEqual({ tapped: ["m1", "ring"], battlefield: onBattlefield(s0) });
  });
});

describe("a source with a rider keeps its board place — Purphoros's {2}{R}, three Mountains first, the rider source after them", () => {
  it("control: a plain Wastes in that seat IS taken first — a Mountain for the {R}, the Wastes and one Mountain for the {2}", () => {
    const s0 = table({ user: [P("purph", PURPHOROS), ...MOUNTAINS(), P("x", WASTES)] });
    expect(tapped(act(s0, purphoros))).toEqual(["m1", "m2", "x"]);
  });

  it.each([
    ["Basalt Monolith — it doesn't untap in its untap step", [P("x", BASALT_MONOLITH)]],
    ["Mana Vault — the same lock, named by the artifact", [P("x", MANA_VAULT)]],
    ["an Eldrazi Spawn — a sacrifice", [P("x", SPAWN)]],
    ["Ashnod's Altar — a creature sacrifice (Grizzly Bears is there to feed it)", [P("x", ASHNODS_ALTAR), P("bears", GRIZZLY_BEARS)]],
    ["Hall of the Bandit Lord — 3 life", [P("x", HALL)]],
    ["Snow-Covered Wastes — its mana also pays {S}", [P("x", SNOW_WASTES)]],
    ["Mogg Hollows — a colored line beside its {C}", [P("x", MOGG_HOLLOWS)]],
  ])("%s: the three Mountains pay; nothing is sacrificed, no life is paid", (_label, extra) => {
    const s0 = table({ user: [P("purph", PURPHOROS), ...MOUNTAINS(), ...extra] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), battlefield: onBattlefield(paid), life: paid.players.user.life })
      .toEqual({ tapped: ["m1", "m2", "m3"], battlefield: onBattlefield(s0), life: s0.players.user.life });
  });

  it("Wastes enchanted with Fertile Ground — its tap also makes a colored mana, so it is not plain colorless", () => {
    const s0 = attachPermanent(table({ user: [P("purph", PURPHOROS), ...MOUNTAINS(), P("x", WASTES), P("fg", FERTILE_GROUND)] }), { equipId: "fg", targetId: "x" });
    expect(tapped(act(s0, purphoros))).toEqual(["m1", "m2", "m3"]);
  });

  it("Mage-Ring Network's stored counters still pay: the two-pass plan taps its counter line, never its plain {C} first", () => {
    const net = { ...P("net", MAGE_RING), counters: { storage: 2 } };
    const s0 = table({ user: [P("purph", PURPHOROS), P("m1", MOUNTAIN), net] });
    const paid = act(s0, purphoros);
    expect({ tapped: tapped(paid), storage: paid.players.user.battlefield.find((p) => p.id === "net").counters?.storage ?? 0, pool: pool(paid) })
      .toEqual({ tapped: ["m1", "net"], storage: 0, pool: NO_MANA });
  });
});

describe("the permanent whose own ability is being paid for is never promoted (dispatcher: spendContext.activatingPermanentId)", () => {
  const animate = (a) => a.kind === "activate-ability" && a.permanentId === "vault" && !a.isManaAbility;

  it("Mountain, Mutavault: Mutavault's {1} is paid by the Mountain — it animates UNTAPPED, free to attack or block", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("vault", MUTAVAULT)] });
    const animated = settle(act(s0, animate));
    const vault = animated.players.user.battlefield.find((p) => p.id === "vault");
    expect({ tapped: tapped(animated), vaultTapped: vault.tapped, vaultIsCreature: permanentIsCreature(animated, "vault") })
      .toEqual({ tapped: ["m1"], vaultTapped: false, vaultIsCreature: true });
  });

  it("scope: for any OTHER payment Mutavault is a plain colorless land like Wastes — Lightning Strike's {1} taps it, a Mountain stays up", () => {
    const s0 = table({ user: [P("m1", MOUNTAIN), P("m2", MOUNTAIN), P("vault", MUTAVAULT)], hand: [["strike", STRIKE]] });
    expect(tapped(act(s0, castAtAi("strike")))).toEqual(["m1", "vault"]);
  });
});

describe("manaSources — staysTapped is the untap step's own read (cardSelfPreventsUntap)", () => {
  it("Basalt Monolith and Mana Vault carry it; Sol Ring and Thran Dynamo do not", () => {
    const s = table({ user: [P("bm", BASALT_MONOLITH), P("mv", MANA_VAULT), P("ring", SOL_RING), P("dyn", THRAN_DYNAMO)] });
    expect(Object.fromEntries(manaSources(s, "user").map((r) => [r.permanentId, r.staysTapped === true]))).toEqual({ bm: true, mv: true, ring: false, dyn: false });
  });
});
