/**
 * landLinesMade.test.js — A LAND'S MANA LINE IS CREDITED ONLY WHEN THE ENGINE MAKES IT (2026-10-17, the land lines).
 *
 * The land {C} fallback slice (landManaFallback.test.js) left one hole open: coverage.landFullyCovered read each mana line
 * through manaModel.landLineMana, whose last arm read the line ALONE — and 54 single-faced lands print a line that parses
 * alone but that the engine never made on the whole card (12 in the play-weighted top 1,000):
 *   · the filter lands — "{R/W}, {T}: Add {R}{R}, {R}{W}, or {W}{W}." (read alone it misparses as one mana of R or W);
 *   · a costed line beside a plain {C} — "{1}, {T}: Add one mana of any color." (Talon Gates of Madara, Planar Nexus …),
 *     "{1}, {T}: Add {R}." / "{2}, {T}: Add {B} or {G}." (Koskun Keep …), Crystal Quarry's {5} five-colour bundle;
 *   · Phyrexian Tower's "{T}, Sacrifice a creature: Add {B}{B}.", Spire of Industry's gated pay-life line, the Amonkhet
 *     deserts' pay-life colour, Opal Palace's commander line and its +1/+1 counter rider, Guildmages' Forum's rider,
 *     Muraganda Raceway's max-speed line, Murmuring Bosk's painful pair, Grove of the Burnwillows' "Each opponent gains
 *     1 life.", the restricted lines (Power Depot, Tournament Grounds, Maelstrom of the Spirit Dragon, Brotherhood
 *     Headquarters), The Grey Havens' graveyard colour set, Crumbling Vestige (its enter trigger's mana read as its tap).
 * Now each of those lines is made — by the planner and by the explicit tap (a filter land offers each of its three bundles)
 * — or the land is no longer credited (Artist Alley, Reflective Gate: their colour is a joke condition no reader holds).
 * The land gate reads the line alone only when the card's main product makes it.
 *
 * Fixtures: every land, spell and creature text is verbatim from the bundled Scryfall snapshot (probed 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { manaProduction, manaSources, planPayment, landLineMana, extraManaLineProducts } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const land = (name, type, oracle) => ({ name, type, mana: "", cmc: 0, colors: [], keywords: [], oracle });
const card = (name, type, mana, oracle, extra = {}) => ({ name, type, mana, mana_cost: mana, cmc: (mana.match(/\{[^}]+\}/g) || []).length, keywords: [], oracle, ...extra });

// ── The filter lands (Shadowmoor / Eventide): [land, hybrid colours a, b] ──
const FILTERS = [
  ["Rugged Prairie", "R", "W"], ["Cascade Bluffs", "U", "R"], ["Flooded Grove", "G", "U"], ["Fetid Heath", "W", "B"],
  ["Twilight Mire", "B", "G"], ["Graven Cairns", "B", "R"], ["Mystic Gate", "W", "U"], ["Sunken Ruins", "U", "B"],
  ["Fire-Lit Thicket", "R", "G"], ["Wooded Bastion", "G", "W"],
].map(([name, a, b]) => ({ land: land(name, "Land", `{T}: Add {C}.\n{${a}/${b}}, {T}: Add {${a}}{${a}}, {${a}}{${b}}, or {${b}}{${b}}.`), a, b }));
// ── The other top-1,000 lands ──
const PHYREXIAN_TOWER = land("Phyrexian Tower", "Legendary Land", "{T}: Add {C}.\n{T}, Sacrifice a creature: Add {B}{B}.");
const SPIRE = land("Spire of Industry", "Land", "{T}: Add {C}.\n{T}, Pay 1 life: Add one mana of any color. Activate only if you control an artifact.");
const TALON = land("Talon Gates of Madara", "Land — Gate", "When this land enters, up to one target creature phases out.\n{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{4}: Put this card from your hand onto the battlefield.");
const OPAL = land("Opal Palace", "Land", "{T}: Add {C}.\n{1}, {T}: Add one mana of any color in your commander's color identity. If you spend this mana to cast your commander, it enters with a number of additional +1/+1 counters on it equal to the number of times it's been cast from the command zone this game.");
// ── The rest ──
const KOSKUN = land("Koskun Keep", "Land", "{T}: Add {C}.\n{1}, {T}: Add {R}.\n{2}, {T}: Add {B} or {G}.");
const CRYSTAL_QUARRY = land("Crystal Quarry", "Land", "{T}: Add {C}.\n{5}, {T}: Add {W}{U}{B}{R}{G}.");
const CRYPT_ETERNALS = land("Crypt of the Eternals", "Land", "When this land enters, you gain 1 life.\n{T}: Add {C}.\n{1}, {T}: Add {U}, {B}, or {R}.");
const SCHOOL_UNSEEN = land("School of the Unseen", "Land", "{T}: Add {C}.\n{2}, {T}: Add one mana of any color.");
const HASHEP = land("Hashep Oasis", "Land — Desert", "{T}: Add {C}.\n{T}, Pay 1 life: Add {G}.\n{1}{G}{G}, {T}, Sacrifice a Desert: Target creature gets +3/+3 until end of turn. Activate only as a sorcery.");
const FORUM = land("Guildmages' Forum", "Land", "{T}: Add {C}.\n{1}, {T}: Add one mana of any color. If that mana is spent on a multicolored creature spell, that creature enters with an additional +1/+1 counter on it.");
const RACEWAY = land("Muraganda Raceway", "Land", "Start your engines! (If you have no speed, it starts at 1. It increases once on each of your turns when an opponent loses life. Max speed is 4.)\n{T}: Add {C}.\nMax speed — {T}: Add {C}{C}.");
const BOSK = land("Murmuring Bosk", "Land — Forest", "({T}: Add {G}.)\nAs this land enters, you may reveal a Treefolk card from your hand. If you don't, this land enters tapped.\n{T}: Add {W} or {B}. This land deals 1 damage to you.");
const GROVE = land("Grove of the Burnwillows", "Land", "{T}: Add {C}.\n{T}: Add {R} or {G}. Each opponent gains 1 life.");
const POWER_DEPOT = { ...land("Power Depot", "Artifact Land", "This land enters tapped.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast artifact spells or activate abilities of artifacts.\nModular 1"), keywords: ["Modular"] };
const TOURNAMENT = land("Tournament Grounds", "Land", "{T}: Add {C}.\n{T}: Add {R}, {W}, or {B}. Spend this mana only to cast a Knight or Equipment spell.");
const MAELSTROM = land("Maelstrom of the Spirit Dragon", "Land", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Dragon spell or an Omen spell.\n{4}, {T}, Sacrifice this land: Search your library for a Dragon card, reveal it, put it into your hand, then shuffle.");
const BROTHERHOOD = land("Brotherhood Headquarters", "Land", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast an Assassin spell or a spell that has freerunning, or to activate an ability of an Assassin source.");
const GREY_HAVENS = land("The Grey Havens", "Legendary Land", "When The Grey Havens enters, scry 1.\n{T}: Add {C}.\n{T}: Add one mana of any color among legendary creature cards in your graveyard.");
const VESTIGE = land("Crumbling Vestige", "Land", "This land enters tapped.\nWhen this land enters, add one mana of any color.\n{T}: Add {C}. ({C} represents colorless mana.)");
const ARTIST_ALLEY = land("Artist Alley", "Land", "{T}: Add {C}\n{T}: Add one mana of any color signed in this card's art box by someone who has illustrated a printed Magic card. (You can't add colors besides white, blue, black, red, and green. Sorry, purple and orange enjoyers.)");
const REFLECTIVE_GATE = land("Reflective Gate", "Artifact Land — Gate Food", "{T}: Add {C}.\n{T}: Add one mana of any color that shares a color with a permanent a player controls.\n{2}, {T}, Sacrifice this land: You gain 3 life.");
// ── Controls ──
const FOREST = land("Forest", "Basic Land — Forest", "({T}: Add {G}.)");
const ISLAND = land("Island", "Basic Land — Island", "({T}: Add {U}.)");
const MOUNTAIN = land("Mountain", "Basic Land — Mountain", "({T}: Add {R}.)");
const PLAINS = land("Plains", "Basic Land — Plains", "({T}: Add {W}.)");
const SWAMP = land("Swamp", "Basic Land — Swamp", "({T}: Add {B}.)");
const BASIC = { W: PLAINS, U: ISLAND, B: SWAMP, R: MOUNTAIN, G: FOREST };
const COMMAND_TOWER = land("Command Tower", "Land", "{T}: Add one mana of any color in your commander's color identity.");
const CATACOMBS = land("Darkwater Catacombs", "Land", "{1}, {T}: Add {U}{B}.");
// ── Creatures / artifacts on the battlefield, cards in hand or graveyard ──
const BEARS = card("Grizzly Bears", "Creature — Bear", "{1}{G}", "", { colors: ["G"], power: "2", toughness: "2" });
const ORNITHOPTER = card("Ornithopter", "Artifact Creature — Thopter", "{0}", "Flying", { colors: [], power: "0", toughness: "2", keywords: ["Flying"] });
const SOL_RING = card("Sol Ring", "Artifact", "{1}", "{T}: Add {C}{C}.", { colors: [] });
const TWO_PIP = {
  W: card("Leonin Skyhunter", "Creature — Cat Knight", "{W}{W}", "Flying", { colors: ["W"], power: "2", toughness: "2", keywords: ["Flying"] }),
  U: card("Lord of Atlantis", "Creature — Merfolk", "{U}{U}", "Other Merfolk get +1/+1 and have islandwalk. (They can't be blocked as long as defending player controls an Island.)", { colors: ["U"], power: "2", toughness: "2" }),
  B: card("Order of the Ebon Hand", "Creature — Cleric Knight", "{B}{B}", "Protection from white\n{B}: This creature gains first strike until end of turn.\n{B}{B}: This creature gets +1/+0 until end of turn.", { colors: ["B"], power: "2", toughness: "1", keywords: ["Protection"] }),
  R: card("Ash Zealot", "Creature — Human Warrior", "{R}{R}", "First strike, haste\nWhenever a player casts a spell from a graveyard, this creature deals 3 damage to that player.", { colors: ["R"], power: "2", toughness: "2", keywords: ["First strike", "Haste"] }),
  G: card("Kalonian Tusker", "Creature — Beast", "{G}{G}", "", { colors: ["G"], power: "3", toughness: "3" }),
};
const WATCHWOLF = card("Watchwolf", "Creature — Wolf", "{G}{W}", "", { colors: ["G", "W"], power: "3", toughness: "3" });
const SILVERCOAT = card("Silvercoat Lion", "Creature — Cat", "{1}{W}", "", { colors: ["W"], power: "2", toughness: "2" });
const ESPER_SENTINEL = card("Esper Sentinel", "Artifact Creature — Human Soldier", "{W}", "Whenever an opponent casts their first noncreature spell each turn, draw a card unless that player pays {X}, where X is this creature's power.", { colors: ["W"], power: "1", toughness: "1" });
const BENALISH_KNIGHT = card("Benalish Knight", "Creature — Human Knight", "{2}{W}", "Flash (You may cast this spell any time you could cast an instant.)\nFirst strike (This creature deals combat damage before creatures without first strike.)", { colors: ["W"], power: "2", toughness: "2", keywords: ["First strike", "Flash"] });
const ISAMARU = card("Isamaru, Hound of Konda", "Legendary Creature — Dog", "{W}", "", { colors: ["W"], power: "2", toughness: "2" });

const on = (id, c, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...c }, controller: "user", summoningSick: false }), ...extra });
function table(battlefield, { hand = [], graveyard = [], pool = {}, life = 40, speed, commanders } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [], ...(commanders ? { userCommanders: commanders } : {}) });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield, life, ...(speed != null ? { speed } : {}),
      manaPool: { ...s.players.user.manaPool, ...pool }, hand: hand.map((c, i) => ({ id: `h${i}`, ...c })),
      graveyard: graveyard.map((c, i) => ({ id: `g${i}`, ...c })), library: [{ id: "lib", ...FOREST }] } } };
}
const COST0 = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
const affords = (s, cost) => planPayment(s.players.user.manaPool, manaSources(s, "user"), { ...COST0, ...cost }) !== null;
const acts = (s) => legalActionsForPlayer(s, "user");
// The explicit tap's options for one permanent: a bundle's letters, else the colour the action names.
const handTaps = (s, id) => acts(s).filter((a) => a.kind === "tap-for-mana" && a.permanentId === id).map((a) => a.bundle || a.color).sort();
const handTap = (s, id, key) => acts(s).find((a) => a.kind === "tap-for-mana" && a.permanentId === id && (a.bundle || a.color) === key);
const castOf = (s, name) => acts(s).find((a) => a.kind === "cast-spell" && s.players.user.hand.find((c) => c.id === a.cardId)?.name === name);
const castNow = (s, name) => { const a = castOf(s, name); expect(a, `${name} is castable`).toBeDefined(); return dispatchAction(s, a); };
const floating = (s) => Object.fromEntries(Object.entries(s.players.user.manaPool).filter(([, n]) => n));
const perm = (s, id) => s.players.user.battlefield.find((p) => p.id === id);
const pipCost = (letters) => { const c = { ...COST0 }; for (const l of letters) c[l] += 1; return c; };

// ═══════════════════════════════════════ THE FILTER LANDS ═══════════════════════════════════════
describe("the filter lands — the hybrid pip buys one of three two-mana bundles", () => {
  for (const { land: F, a, b } of FILTERS) {
    describe(F.name, () => {
      it(`planner (WITNESS): a basic ${a} funds {${a}/${b}} and it makes ${a}${a}, ${a}${b} or ${b}${b}; never three mana`, () => {
        const s = table([on("f", F), on("basic", BASIC[a])]);
        expect({ aa: affords(s, pipCost(a + a)), ab: affords(s, pipCost(a + b)), bb: affords(s, pipCost(b + b)), three: affords(s, { ...pipCost(b + b), generic: 1 }) })
          .toEqual({ aa: true, ab: true, bb: true, three: false });
      });
      it("planner: it never funds its own hybrid pip — alone it makes {C} and no bundle", () => {
        const s = table([on("f", F)]);
        expect({ c: affords(s, { C: 1 }), aa: affords(s, pipCost(a + a)), bb: affords(s, pipCost(b + b)) }).toEqual({ c: true, aa: false, bb: false });
      });
      it(`cast (WITNESS): the basic ${a} pays the hybrid, the land makes ${b}${b}, and ${TWO_PIP[b].name} resolves; both lands tapped, nothing floats`, () => {
        const s = table([on("f", F), on("basic", BASIC[a])], { hand: [TWO_PIP[b]] });
        const cast = castOf(s, TWO_PIP[b].name);
        expect(cast).toBeDefined();
        const out = dispatchAction(s, cast);
        expect({ f: perm(out, "f").tapped, basic: perm(out, "basic").tapped, pool: floating(out) }).toEqual({ f: true, basic: true, pool: {} });
      });
      it("explicit tap (WITNESS): with {" + a + "} floating it offers {C} and each bundle; the bundle taken is made and the hybrid paid", () => {
        const s = table([on("f", F)], { pool: { [a]: 1 } });
        const keys = ["C", a + a, a + b, b + b].sort();
        expect(handTaps(s, "f")).toEqual(keys);
        const out = dispatchAction(s, handTap(s, "f", a + b));
        expect({ pool: floating(out), tapped: perm(out, "f").tapped }).toEqual({ pool: { [a]: 1, [b]: 1 }, tapped: true });
        const out2 = dispatchAction(s, handTap(s, "f", b + b));
        expect(floating(out2)).toEqual({ [b]: 2 });
      });
      it("explicit tap: with nothing floating only {C} — the hybrid can't be paid", () => {
        expect(handTaps(table([on("f", F)]), "f")).toEqual(["C"]);
      });
      it("stays a covered land", () => {
        expect(classifyCard(F)).toBe("land");
      });
    });
  }
});

// ═══════════════════════════════════════ THE OTHER TOP-1,000 LANDS ═══════════════════════════════════════
describe("Phyrexian Tower — {T}, Sacrifice a creature: Add {B}{B}", () => {
  it("planner (WITNESS): beside a creature it pays {B}{B}; with none, {C} only", () => {
    expect(affords(table([on("t", PHYREXIAN_TOWER), on("bear", BEARS)]), { B: 2 })).toBe(true);
    expect({ bb: affords(table([on("t", PHYREXIAN_TOWER)]), { B: 2 }), c: affords(table([on("t", PHYREXIAN_TOWER)]), { C: 1 }) }).toEqual({ bb: false, c: true });
  });
  it("cast (WITNESS): Order of the Ebon Hand is cast off the Tower — the Bears are sacrificed, the Tower taps", () => {
    const s = table([on("t", PHYREXIAN_TOWER), on("bear", BEARS)], { hand: [TWO_PIP.B] });
    const cast = castOf(s, TWO_PIP.B.name);
    expect(cast).toBeDefined();
    const out = dispatchAction(s, cast);
    expect({ tower: perm(out, "t").tapped, bear: !!perm(out, "bear"), gy: out.players.user.graveyard.map((c) => c.name) })
      .toEqual({ tower: true, bear: false, gy: ["Grizzly Bears"] });
  });
  it("planner: a cost the plain {C} covers keeps the creature", () => {
    const s = table([on("t", PHYREXIAN_TOWER), on("bear", BEARS)], { hand: [SOL_RING] });
    const out = castNow(s, "Sol Ring");
    expect(!!perm(out, "bear")).toBe(true);
  });
  it("explicit tap (WITNESS): {B} beside a creature, sacrificing it for {B}{B}; {C} alone without one", () => {
    const s = table([on("t", PHYREXIAN_TOWER), on("bear", BEARS)]);
    expect({ with: handTaps(s, "t"), without: handTaps(table([on("t", PHYREXIAN_TOWER)]), "t") }).toEqual({ with: ["B", "C"], without: ["C"] });
    const out = dispatchAction(s, handTap(s, "t", "B"));
    expect({ pool: floating(out), bear: !!perm(out, "bear") }).toEqual({ pool: { B: 2 }, bear: false });
  });
  it("stays a covered land", () => { expect(classifyCard(PHYREXIAN_TOWER)).toBe("land"); });
});

describe("Spire of Industry — {T}, Pay 1 life: any colour, only with an artifact", () => {
  it("planner (WITNESS): with an artifact it pays {G}, costing 1 life; without one it makes {C} only", () => {
    const s = table([on("sp", SPIRE), on("orn", ORNITHOPTER)], { hand: [BEARS], pool: { C: 1 } });
    expect(affords(s, { G: 1 })).toBe(true);
    expect(affords(table([on("sp", SPIRE)]), { G: 1 })).toBe(false);
    const out = castNow(s, "Grizzly Bears");
    expect({ life: out.players.user.life, tapped: perm(out, "sp").tapped }).toEqual({ life: 39, tapped: true });
  });
  it("explicit tap (WITNESS): every colour with an artifact (each costs 1 life); {C} without", () => {
    const s = table([on("sp", SPIRE), on("orn", ORNITHOPTER)]);
    expect(handTaps(s, "sp")).toEqual(["B", "C", "G", "R", "U", "W"]);
    expect(handTaps(table([on("sp", SPIRE)]), "sp")).toEqual(["C"]);
    const out = dispatchAction(s, handTap(s, "sp", "R"));
    expect({ pool: floating(out), life: out.players.user.life }).toEqual({ pool: { R: 1 }, life: 39 });
  });
  it("stays a covered land", () => { expect(classifyCard(SPIRE)).toBe("land"); });
});

describe("Talon Gates of Madara — {1}, {T}: Add one mana of any color", () => {
  it("planner (WITNESS): an Island funds the {1} and it makes {R}; alone, {C} only", () => {
    expect(affords(table([on("tg", TALON), on("isl", ISLAND)]), { R: 1 })).toBe(true);
    expect(affords(table([on("tg", TALON), on("isl", ISLAND)]), { R: 1, U: 1 })).toBe(false);
    expect(affords(table([on("tg", TALON)]), { R: 1 })).toBe(false);
  });
  it("cast (WITNESS): Silvercoat Lion off an Island and the Gates is not castable ({1}{W} is two mana, the Gates nets one); off two Islands it is", () => {
    expect(castOf(table([on("tg", TALON), on("isl", ISLAND)], { hand: [SILVERCOAT] }), "Silvercoat Lion")).toBeUndefined();
    const s = table([on("tg", TALON), on("isl", ISLAND), on("isl2", ISLAND)], { hand: [SILVERCOAT] });
    const out = castNow(s, "Silvercoat Lion");
    expect({ tg: perm(out, "tg").tapped, pool: floating(out) }).toEqual({ tg: true, pool: {} });
  });
  it("explicit tap (WITNESS): with {1} floating every colour is offered, paid from the pool", () => {
    const s = table([on("tg", TALON)], { pool: { C: 1 } });
    expect(handTaps(s, "tg")).toEqual(["B", "C", "G", "R", "U", "W"]);
    expect(floating(dispatchAction(s, handTap(s, "tg", "G")))).toEqual({ G: 1 });
    expect(handTaps(table([on("tg", TALON)]), "tg")).toEqual(["C"]);
  });
  it("stays a covered land", () => { expect(classifyCard(TALON)).toBe("land"); });
});

describe("Opal Palace — {1}, {T}: a colour of the commander's identity; the commander enters with more counters", () => {
  const GENERAL = { id: "cmdr1", name: "Test General", type: "Legendary Creature — Elemental", mana: "{G}{U}", mana_cost: "{G}{U}", cmc: 2, colors: ["G", "U"], colorIdentity: ["G", "U"], power: "2", toughness: "2", keywords: [], oracle: "" };
  const cmdCast = (s) => acts(s).find((a) => a.kind === "cast-spell" && a.fromZone === "command");
  const castCmdNow = (s) => { const a = cmdCast(s); expect(a, "the commander is castable").toBeDefined(); return dispatchAction(s, a); };
  const withCount = (s, n) => ({ ...s, players: { ...s.players, user: { ...s.players.user, commanderCastCount: { "user::cmdr1": n } } } });
  it("planner (WITNESS): a Forest funds the {1} and it makes {U} (in the identity), never {R}", () => {
    const s = table([on("op", OPAL), on("f1", FOREST)], { commanders: [GENERAL] });
    expect({ u: affords(s, { U: 1 }), r: affords(s, { R: 1 }) }).toEqual({ u: true, r: false });
  });
  it("cast (WITNESS): the commander paid with the Palace's {U} enters with one more +1/+1 counter on its first cast, two on its second", () => {
    const s = table([on("op", OPAL), on("f1", FOREST), on("f2", FOREST)], { commanders: [GENERAL] });
    const cast = cmdCast(s);
    expect(cast).toBeDefined();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.players.user.battlefield.find((p) => p.card.id === "cmdr1")?.counters?.["+1/+1"] || 0).toBe(1);
    const s2 = withCount(table([on("op", OPAL), on("f1", FOREST), on("f2", FOREST), on("f3", FOREST), on("f4", FOREST)], { commanders: [GENERAL] }), 1);
    const after2 = resolveTopOfStack(castCmdNow(s2));
    expect(after2.players.user.battlefield.find((p) => p.card.id === "cmdr1")?.counters?.["+1/+1"] || 0).toBe(2);
  });
  it("control: the commander paid without the Palace's coloured line gets no counter", () => {
    const s = table([on("op", OPAL), on("f1", FOREST), on("isl", ISLAND)], { commanders: [GENERAL] });
    const after = resolveTopOfStack(castCmdNow(s));
    expect(after.players.user.battlefield.find((p) => p.card.id === "cmdr1")?.counters?.["+1/+1"] || 0).toBe(0);
  });
  it("explicit tap: never the coloured line — floating mana can't carry its rider (as Path of Ancestry); {C} alone", () => {
    expect(handTaps(table([on("op", OPAL)], { pool: { C: 1 }, commanders: [GENERAL] }), "op")).toEqual(["C"]);
  });
  it("stays a covered land", () => { expect(classifyCard(OPAL)).toBe("land"); });
});

// ═══════════════════════════════════════ THE REST OF THE 54 ═══════════════════════════════════════
describe("costed colour lines beside a plain {C}", () => {
  it("Koskun Keep (WITNESS): {1} → {R}, {2} → {B} or {G}; the {2} line needs two other lands", () => {
    expect(affords(table([on("k", KOSKUN), on("isl", ISLAND)]), { R: 1 })).toBe(true);
    expect(affords(table([on("k", KOSKUN), on("isl", ISLAND)]), { G: 1 })).toBe(false);
    expect(affords(table([on("k", KOSKUN), on("isl", ISLAND), on("isl2", ISLAND)]), { G: 1 })).toBe(true);
  });
  it("Crystal Quarry (WITNESS): {5} buys one of each colour", () => {
    const five = [on("q", CRYSTAL_QUARRY), ...[1, 2, 3, 4, 5].map((i) => on(`w${i}`, PLAINS))];
    expect(affords(table(five), { W: 1, U: 1, B: 1, R: 1, G: 1 })).toBe(true);
    expect(affords(table(five.slice(0, 5)), { U: 1 })).toBe(false);
  });
  it("Crypt of the Eternals (WITNESS): {1} → {U}, {B} or {R}, never {G}", () => {
    const s = table([on("c", CRYPT_ETERNALS), on("w", PLAINS)]);
    expect({ b: affords(s, { B: 1 }), g: affords(s, { G: 1 }) }).toEqual({ b: true, g: false });
  });
  it("School of the Unseen (WITNESS): {2} → any colour", () => {
    expect(affords(table([on("su", SCHOOL_UNSEEN), on("w1", PLAINS), on("w2", PLAINS)]), { G: 1 })).toBe(true);
    expect(affords(table([on("su", SCHOOL_UNSEEN), on("w1", PLAINS)]), { G: 1 })).toBe(false);
  });
  it("control — Darkwater Catacombs (its only line is costed) still makes {U}{B} behind its {1}, and its line is no second record", () => {
    expect(affords(table([on("dc", CATACOMBS), on("f", FOREST)]), { U: 1, B: 1 })).toBe(true);
    expect(affords(table([on("dc", CATACOMBS)]), { U: 1 })).toBe(false);
    expect(extraManaLineProducts(CATACOMBS, manaProduction(CATACOMBS))).toEqual([]);
  });
  it("control — a painland's pain pair is its main product's line, never a second record (Shivan Reef)", () => {
    const REEF = land("Shivan Reef", "Land", "{T}: Add {C}.\n{T}: Add {U} or {R}. This land deals 1 damage to you.");
    expect(extraManaLineProducts(REEF, manaProduction(REEF))).toEqual([]);
  });
});

describe("Hashep Oasis — {T}, Pay 1 life: Add {G}", () => {
  it("planner (WITNESS): {G} for 1 life", () => {
    const s = table([on("h", HASHEP)], { hand: [TWO_PIP.G], pool: { G: 1 } });
    const out = castNow(s, TWO_PIP.G.name);
    expect(out.players.user.life).toBe(39);
  });
});

describe("Guildmages' Forum — a multicoloured creature cast with its mana enters with a +1/+1 counter", () => {
  it("cast (WITNESS): Watchwolf off a Forest and the Forum's {W} enters with one counter; Kalonian Tusker gets none", () => {
    const s = table([on("gf", FORUM), on("f1", FOREST), on("f2", FOREST)], { hand: [WATCHWOLF] });
    const cast = castOf(s, "Watchwolf");
    expect(cast).toBeDefined();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.players.user.battlefield.find((p) => p.card.name === "Watchwolf")?.counters?.["+1/+1"] || 0).toBe(1);
    const t = table([on("gf", FORUM), on("f1", FOREST), on("isl", ISLAND)], { hand: [{ ...TWO_PIP.U, mana: "{1}{U}", mana_cost: "{1}{U}" }] });
    const afterT = resolveTopOfStack(castNow(t, TWO_PIP.U.name));
    expect(afterT.players.user.battlefield.find((p) => p.card.name === TWO_PIP.U.name)?.counters?.["+1/+1"] || 0).toBe(0);
  });
});

describe("Muraganda Raceway — Max speed — {T}: Add {C}{C}", () => {
  it("planner (WITNESS): two mana at speed 4, one below it", () => {
    expect(affords(table([on("mr", RACEWAY)], { speed: 4 }), { generic: 2 })).toBe(true);
    expect(affords(table([on("mr", RACEWAY)], { speed: 3 }), { generic: 2 })).toBe(false);
    expect(affords(table([on("mr", RACEWAY)], { speed: 3 }), { generic: 1 })).toBe(true);
  });
});

describe("Murmuring Bosk — {T}: Add {W} or {B}, dealing 1 damage", () => {
  it("planner (WITNESS): it pays {W}, costing 1 life; {G} is free", () => {
    const s = table([on("mb", BOSK)], { hand: [TWO_PIP.W], pool: { W: 1 } });
    const out = castNow(s, TWO_PIP.W.name);
    expect(out.players.user.life).toBe(39);
    const g = table([on("mb", BOSK)], { hand: [TWO_PIP.G], pool: { G: 1 } });
    expect(castNow(g, TWO_PIP.G.name).players.user.life).toBe(40);
  });
});

describe("Grove of the Burnwillows — {T}: Add {R} or {G}, each opponent gains 1 life", () => {
  it("planner (WITNESS): it pays {G} and every opponent gains 1 life; its {C} gives nothing", () => {
    const s = table([on("gr", GROVE)], { hand: [TWO_PIP.G], pool: { G: 1 } });
    const opps = Object.keys(s.players).filter((p) => p !== "user");
    const before = opps.map((p) => s.players[p].life);
    const out = castNow(s, TWO_PIP.G.name);
    expect(opps.map((p) => out.players[p].life)).toEqual(before.map((l) => l + 1));
    const c = table([on("gr", GROVE)], { hand: [SOL_RING] });
    const outC = castNow(c, "Sol Ring");
    expect(opps.map((p) => outC.players[p].life)).toEqual(before);
  });
});

describe("restricted lines", () => {
  it("Power Depot (WITNESS): any colour for an artifact spell (Esper Sentinel's {W}) only", () => {
    expect(castOf(table([on("pd", POWER_DEPOT)], { hand: [ESPER_SENTINEL] }), "Esper Sentinel")).toBeDefined();
    const s = table([on("pd", POWER_DEPOT)], { hand: [{ ...TWO_PIP.W, mana: "{W}", mana_cost: "{W}" }] });
    expect(castOf(s, TWO_PIP.W.name)).toBeUndefined();
  });
  it("Tournament Grounds (WITNESS): {W} for a Knight spell, never for a Cat", () => {
    expect(castOf(table([on("tgr", TOURNAMENT), on("f", FOREST), on("f2", FOREST)], { hand: [BENALISH_KNIGHT] }), "Benalish Knight")).toBeDefined();
    expect(castOf(table([on("tgr", TOURNAMENT), on("f", FOREST)], { hand: [SILVERCOAT] }), "Silvercoat Lion")).toBeUndefined();
  });
  it("Maelstrom of the Spirit Dragon: the restriction reads both Dragon and Omen spells", () => {
    expect(manaSources(table([on("ms", MAELSTROM)]), "user").find((r) => r.extraLine)?.restriction?.castTypes).toEqual(["dragon", "omen"]);
  });
  it("Brotherhood Headquarters: the restriction reads Assassin spells, spells with freerunning, and Assassin sources' abilities", () => {
    expect(manaSources(table([on("bh", BROTHERHOOD)]), "user").find((r) => r.extraLine)?.restriction)
      .toMatchObject({ castTypes: ["assassin"], castKeywords: ["freerunning"], abilityOf: ["assassin"] });
  });
  it("Brotherhood Headquarters (WITNESS): its {G} pays for Viewpoint Synchronization (freerunning), never for Kalonian Tusker", () => {
    const VIEWPOINT = card("Viewpoint Synchronization", "Sorcery", "{4}{G}", "Freerunning {2}{G} (You may cast this spell for its freerunning cost if you dealt combat damage to a player this turn with an Assassin or commander.)\nSearch your library for up to three basic land cards and reveal them. Put two of them onto the battlefield tapped and the other into your hand, then shuffle.", { colors: ["G"], keywords: ["Freerunning"] });
    const islands = [1, 2, 3, 4].map((i) => on(`i${i}`, ISLAND));
    expect(castOf(table([on("bh", BROTHERHOOD), ...islands], { hand: [VIEWPOINT] }), "Viewpoint Synchronization")).toBeDefined();
    expect(castOf(table([on("bh", BROTHERHOOD), on("f", FOREST)], { hand: [TWO_PIP.G] }), TWO_PIP.G.name)).toBeUndefined();
  });
});

describe("The Grey Havens — a colour of a legendary creature card in its controller's graveyard", () => {
  it("planner (WITNESS): Isamaru in the graveyard → {W}, never {G}; an empty graveyard → {C} only", () => {
    const s = table([on("gh", GREY_HAVENS)], { graveyard: [ISAMARU, BEARS] });
    expect({ w: affords(s, { W: 1 }), g: affords(s, { G: 1 }), c: affords(s, { C: 1 }) }).toEqual({ w: true, g: false, c: true });
    expect(affords(table([on("gh", GREY_HAVENS)]), { W: 1 })).toBe(false);
  });
});

describe("Crumbling Vestige — its enter trigger's mana is not its tap", () => {
  it("(WITNESS) taps for {C}, never any colour", () => {
    expect(manaProduction(VESTIGE)).toMatchObject({ colors: ["C"], amount: 1 });
    expect(affords(table([on("cv", VESTIGE)]), { G: 1 })).toBe(false);
  });
});

// ═══════════════════════════════════════ THE LAND GATE ═══════════════════════════════════════
describe("the land gate credits a line only when the card makes it", () => {
  it("(WITNESS) a colour no reader holds is no line the engine makes: Artist Alley and Reflective Gate are land-partial", () => {
    expect({ alley: classifyCard(ARTIST_ALLEY), gate: classifyCard(REFLECTIVE_GATE) }).toEqual({ alley: "land-partial", gate: "land-partial" });
    expect(manaProduction(ARTIST_ALLEY)).toMatchObject({ colors: ["C"] });
  });
  it("every modelled land of the 54 stays covered", () => {
    for (const l of [KOSKUN, CRYSTAL_QUARRY, CRYPT_ETERNALS, SCHOOL_UNSEEN, HASHEP, FORUM, RACEWAY, BOSK, GROVE, POWER_DEPOT, TOURNAMENT, MAELSTROM, BROTHERHOOD, GREY_HAVENS, VESTIGE]) {
      expect([l.name, classifyCard(l)]).toEqual([l.name, "land"]);
    }
  });
  it("(WITNESS) The Big Top's colour is a joke condition too: no mana, land-partial", () => {
    const BIG_TOP = land("The Big Top", "Land", "{T}: Add one mana of any color that appears on your top. (A top is an outerwear garment worn on the upper body.)");
    expect({ mana: manaProduction(BIG_TOP), tier: classifyCard(BIG_TOP) }).toEqual({ mana: null, tier: "land-partial" });
  });
  it("the gate (mutation witness): Tarkir Omenpath's Omen-only line reads alone, but no record makes it — not credited", () => {
    const OMENPATH = land("Tarkir Omenpath", "Land", "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast Omen spells.\n{1}, {T}: Add one mana of any color.");
    const omenLine = "{T}: Add one mana of any color. Spend this mana only to cast Omen spells.";
    expect(manaProduction({ name: OMENPATH.name, type: OMENPATH.type, oracle: omenLine })).toMatchObject({ restriction: { castTypes: ["omen"] } });
    expect({ line: landLineMana(OMENPATH, omenLine), tier: classifyCard(OMENPATH) }).toEqual({ line: null, tier: "land-partial" });
  });
  it("controls — the painlands' pain lines, read alone, carry their damage: Shivan Reef, Grand Coliseum and Tarnished Citadel stay covered and hurt", () => {
    const REEF = land("Shivan Reef", "Land", "{T}: Add {C}.\n{T}: Add {U} or {R}. This land deals 1 damage to you.");
    const COLISEUM = land("Grand Coliseum", "Land", "This land enters tapped.\n{T}: Add {C}.\n{T}: Add one mana of any color. This land deals 1 damage to you.");
    const CITADEL = land("Tarnished Citadel", "Land", "{T}: Add {C}.\n{T}: Add one mana of any color. This land deals 3 damage to you.");
    expect([classifyCard(REEF), classifyCard(COLISEUM), classifyCard(CITADEL)]).toEqual(["land", "land", "land"]);
    expect(landLineMana(CITADEL, "{T}: Add one mana of any color. This land deals 3 damage to you.")).toMatchObject({ painAmount: 3 });
    const s = table([on("tc", CITADEL)], { hand: [TWO_PIP.G], pool: { G: 1 } });
    expect(castNow(s, TWO_PIP.G.name).players.user.life).toBe(37);
  });
  it("controls — a basic, Command Tower and Darkwater Catacombs stay covered, and make what they print", () => {
    expect([classifyCard(FOREST), classifyCard(COMMAND_TOWER), classifyCard(CATACOMBS)]).toEqual(["land", "land", "land"]);
    expect(handTaps(table([on("f", FOREST)]), "f")).toEqual(["G"]);
    const GENERAL = { id: "cmdr1", name: "Test General", type: "Legendary Creature — Elemental", mana: "{G}{U}", colorIdentity: ["G", "U"], power: "2", toughness: "2", oracle: "" };
    expect(handTaps(table([on("ct", COMMAND_TOWER)], { commanders: [GENERAL] }), "ct")).toEqual(["G", "U"]);
  });
});
