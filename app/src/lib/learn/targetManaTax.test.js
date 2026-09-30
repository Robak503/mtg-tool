/**
 * targetManaTax.test.js — "Spells your opponents cast that target this creature cost {N} more to cast" (the 09-06 plan's
 * stage ③ · 44, 2026-09-30 — Sphinx of New Prahv, Boreal Elemental, Syr Elenora, the Discerning).
 *
 * The mana twin of Terror of the Peaks' life tax: a MANDATORY cast cost (CR 601.2f) through the same one choke over the
 * assembled action list (legalChoices.applyTargetTaxes). A cast whose chosen targets include the taxed permanent carries
 * the {N} in its generic cost, which the dispatcher pays like any cast's, and is not offered when the caster can't fund
 * the taxed total from the sources the payment will read (manaModel.castPaymentSources). The mana value is untouched
 * (CR 202.3). A free cast pays no mana on the engine's side while the tax still applies, so a free cast aimed at the
 * taxed permanent is not offered. The free-cast windows (a pending free cast, cascade, discover) now run through the
 * choke too, which also makes a free cast at Terror of the Peaks pay its 3 life — before, those windows skipped it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { castPaymentSources } from "./manaModel.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPHINX = { name: "Sphinx of New Prahv", type: "Creature — Sphinx", mana: "{W}{W}{U}{U}", colors: ["U", "W"], cmc: 4, power: "4", toughness: "3", keywords: ["Flying", "Vigilance"],
  oracle: "Flying, vigilance\nSpells your opponents cast that target this creature cost {2} more to cast." };
const BOREAL = { name: "Boreal Elemental", type: "Creature — Elemental", mana: "{4}{U}", colors: ["U"], cmc: 5, power: "3", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nSpells your opponents cast that target this creature cost {2} more to cast." };
const ELENORA = { name: "Syr Elenora, the Discerning", type: "Legendary Creature — Human Knight", mana: "{3}{U}{U}", colors: ["U"], cmc: 5, power: "*", toughness: "4", keywords: [],
  oracle: "Syr Elenora's power is equal to the number of cards in your hand.\nWhen Syr Elenora enters, draw a card.\nSpells your opponents cast that target Syr Elenora cost {2} more to cast." };
const SCION = { name: "Elderwood Scion", type: "Creature — Elemental", mana: "{3}{G}{W}", colors: ["G", "W"], cmc: 5, power: "4", toughness: "4", keywords: ["Lifelink", "Trample"],
  oracle: "Trample, lifelink\nSpells you cast that target this creature cost {2} less to cast.\nSpells your opponents cast that target this creature cost {2} more to cast." };
const TERROR = { name: "Terror of the Peaks", type: "Creature — Dragon", mana: "{3}{R}{R}", colors: ["R"], cmc: 5, power: "5", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nSpells your opponents cast that target this creature cost an additional 3 life to cast.\nWhenever another creature you control enters, this creature deals damage equal to that creature's power to any target." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };
const MURDER = { id: "murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", mana_cost: "{1}{B}{B}", cmc: 3, colors: ["B"], keywords: [], oracle: "Destroy target creature." };
const PACIFISM = { id: "pac", name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, colors: ["W"], keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const SNUFF_OUT = { id: "snuff", name: "Snuff Out", type: "Instant", mana: "{3}{B}", mana_cost: "{3}{B}", cmc: 4, colors: ["B"], keywords: [],
  oracle: "If you control a Swamp, you may pay 4 life rather than pay this spell's mana cost.\nDestroy target nonblack creature. It can't be regenerated." };
const BONE_SPLINTERS = { id: "bone", name: "Bone Splinters", type: "Sorcery", mana: "{B}", mana_cost: "{B}", cmc: 1, colors: ["B"], keywords: [],
  oracle: "As an additional cost to cast this spell, sacrifice a creature.\nDestroy target creature." };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", oracle: "({T}: Add {W}.)" };
// Token texts as the engine mints them (the minting cards' quoted abilities).
const SPAWN = { name: "Eldrazi Spawn", type: "Token Creature — Eldrazi Spawn", power: "0", toughness: "1", keywords: [], oracle: "Sacrifice this token: Add {C}." };
const TREASURE = { name: "Treasure", type: "Token Artifact — Treasure", keywords: [], oracle: "{T}, Sacrifice this artifact: Add one mana of any color." };
const ELVES = { name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", colors: ["G"], cmc: 1, power: "1", toughness: "1", keywords: [], oracle: "{T}: Add {G}." };

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
// The user controls the taxing creature (id TAX) and a Bear; the AI holds `hand` with `swamps` Swamps and `plains` Plains.
function board({ taxer = SPHINX, extra = [], swamps = 5, plains = 0, hand = [MURDER], aiOwnsTaxer = false, zones = {}, aiExtra = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lands = [...Array.from({ length: swamps }, (_, i) => perm(`sw${i}`, SWAMP, "ai")), ...Array.from({ length: plains }, (_, i) => perm(`pl${i}`, PLAINS, "ai")), ...aiExtra];
  const taxPerm = perm("TAX", taxer, aiOwnsTaxer ? "ai" : "user");
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [...(aiOwnsTaxer ? [] : [taxPerm]), perm("BEAR", BEAR, "user"), ...extra] },
      ai: { ...g.players.ai, battlefield: [...lands, ...(aiOwnsTaxer ? [taxPerm] : [])], hand, ...zones } } };
}
const casts = (s, cardId = "murder") => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const at = (list, id) => list.find((a) => (a.targets || []).some((t) => t.id === id));
const tappedLands = (s) => s.players.ai.battlefield.filter((p) => p.tapped && /Land/.test(p.card?.type || "")).length;

describe("the carriers and the descriptor", () => {
  it("⭐ Sphinx of New Prahv, Boreal Elemental and Syr Elenora read native; each tax clause parses to targetManaTax {2}", () => {
    expect([SPHINX, BOREAL, ELENORA].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true, true]);
    // Syr Elenora's clause names her by her short name — the legend rewrite makes it "this creature" upstream.
    expect([SPHINX, BOREAL, ELENORA].map((c) => parseStaticAbilities(c).find((d) => d.targetManaTax)?.targetManaTax.amount)).toEqual([2, 2, 2]);
  });
  it("Elderwood Scion stays parked — its \"Spells you cast … cost {2} less\" half is not claimed", () => {
    expect(isNativeTier(classifyCard(SCION))).toBe(false);
  });
});

describe("⭐ the offer: a cast aimed at the taxed creature costs {2} more and must be fundable", () => {
  it("⭐ five Swamps: Murder at the Sphinx is offered at generic 3 (1 + the tax), stamped, mana value still 3; Murder at the Bear at the printed cost", () => {
    const list = casts(board());
    const atSphinx = at(list, "TAX"), atBear = at(list, "BEAR");
    const row = { sphinx: { generic: atSphinx?.cost?.generic, B: atSphinx?.cost?.B, tax: atSphinx?.targetManaTax, cmc: atSphinx?.cmc },
      bear: { generic: atBear?.cost?.generic, tax: atBear?.targetManaTax ?? null } };
    console.log(`WITNESS targetManaTaxOffer ${JSON.stringify(row)}`);
    expect(row).toEqual({ sphinx: { generic: 3, B: 2, tax: 2, cmc: 3 }, bear: { generic: 1, tax: null } });
  });
  it("⭐ three Swamps: Murder at the Sphinx is NOT offered (it can't fund {3}{B}{B}); Murder at the Bear still is", () => {
    const list = casts(board({ swamps: 3 }));
    expect({ sphinx: !!at(list, "TAX"), bear: !!at(list, "BEAR") }).toEqual({ sphinx: false, bear: true });
  });
  it("the caster's OWN Sphinx doesn't tax them (the static taxes opponents' spells)", () => {
    const own = at(casts(board({ swamps: 3, aiOwnsTaxer: true })), "TAX");
    expect({ offered: !!own, generic: own?.cost?.generic, tax: own?.targetManaTax ?? null }).toEqual({ offered: true, generic: 1, tax: null });
  });
  it("each taxer taxes only spells aimed at IT — a Boreal Elemental beside the Sphinx adds nothing to Murder at the Sphinx", () => {
    const list = casts(board({ extra: [perm("BOR", BOREAL, "user")] }));
    expect({ sphinx: at(list, "TAX")?.cost?.generic, boreal: at(list, "BOR")?.cost?.generic, bear: at(list, "BEAR")?.cost?.generic })
      .toEqual({ sphinx: 3, boreal: 3, bear: 1 });
  });
  it("⭐ an Aura spell targets too (CR 303.4a) — Pacifism at the Sphinx needs {3}{W}: three Plains can't, four can", () => {
    const three = casts(board({ swamps: 0, plains: 3, hand: [PACIFISM] }), "pac");
    const four = casts(board({ swamps: 0, plains: 4, hand: [PACIFISM] }), "pac");
    expect({ threeSphinx: !!at(three, "TAX"), threeBear: !!at(three, "BEAR"), fourSphinx: at(four, "TAX")?.cost?.generic })
      .toEqual({ threeSphinx: false, threeBear: true, fourSphinx: 3 });
  });
  it("⭐ Syr Elenora's short-name clause taxes at runtime too", () => {
    const list = casts(board({ taxer: ELENORA }));
    expect({ elenora: at(list, "TAX")?.targetManaTax, bear: at(list, "BEAR")?.targetManaTax ?? null }).toEqual({ elenora: 2, bear: null });
  });
  it("⭐ an alternative cost pays no mana, so Snuff Out's pay-4-life cast is not offered at the Sphinx; at the Bear it is", () => {
    const alts = casts(board({ hand: [SNUFF_OUT] }), "snuff").filter((a) => a.altCost);
    expect({ sphinx: !!at(alts, "TAX"), bear: !!at(alts, "BEAR") }).toEqual({ sphinx: false, bear: true });
  });
  it("⭐ the re-check reads the payment's own sources: Bone Splinters sacrificing the Eldrazi Spawn can't also crack it for the tax", () => {
    // The Spawn is the AI's only creature, so it is the sacrifice. Two Swamps fund {B} but not {2}{B} once the Spawn is spoken for.
    const two = casts(board({ swamps: 2, hand: [BONE_SPLINTERS], aiExtra: [perm("SPAWN", SPAWN, "ai")] }), "bone");
    const three = casts(board({ swamps: 3, hand: [BONE_SPLINTERS], aiExtra: [perm("SPAWN", SPAWN, "ai")] }), "bone");
    expect({ twoSphinx: !!at(two, "TAX"), twoBear: at(two, "BEAR")?.sacCreatureId, threeSphinx: at(three, "TAX")?.sacCreatureId })
      .toEqual({ twoSphinx: false, twoBear: "SPAWN", threeSphinx: "SPAWN" });
  });
});

describe("⭐ the payment: the dispatcher spends the taxed total", () => {
  it("⭐ Murder at the Sphinx taps all five Swamps and destroys it; Murder at the Bear taps three", () => {
    const s = board();
    const sphinxCast = dispatchAction(s, at(casts(s), "TAX"));
    const bearCast = dispatchAction(s, at(casts(s), "BEAR"));
    const resolved = resolveTopOfStack(sphinxCast);
    const row = { sphinxTapped: tappedLands(sphinxCast), bearTapped: tappedLands(bearCast), sphinxGone: !resolved.players.user.battlefield.some((p) => p.id === "TAX") };
    console.log(`WITNESS targetManaTaxPaid ${JSON.stringify(row)}`);
    expect(row).toEqual({ sphinxTapped: 5, bearTapped: 3, sphinxGone: true });
  });
});

describe("⭐ free casts owe the tax too (CR 601.2f)", () => {
  const FREE = { pendingFreeCast: { controller: "ai", candidateIds: ["murder"], maxMv: 5, typeFilter: null, sourceName: "Expertise" } };
  const windowActions = (s) => legalActionsForPlayer(s, "ai");
  // Two Swamps stay open in each window: the {2} could be funded, so only the free-cast rule keeps the cast off the list.
  it("⭐ a pending free cast: Murder at the Sphinx is not offered even with {2} open (no mana is paid on that path); Murder at the Bear and the decline are", () => {
    const acts = windowActions({ ...board({ swamps: 2 }), ...FREE });
    expect({ sphinx: !!at(acts, "TAX"), bear: !!at(acts, "BEAR"), decline: acts.some((a) => a.kind === "free-cast-decline") })
      .toEqual({ sphinx: false, bear: true, decline: true });
  });
  it("⭐ cascade: a cascaded Murder at the Sphinx is not offered; at the Bear it is, and the decline stays", () => {
    const s = { ...board({ swamps: 2, hand: [], zones: { exile: [MURDER] } }), pendingCascade: { controller: "ai", cardId: "murder" } };
    const acts = windowActions(s);
    expect({ sphinx: !!at(acts, "TAX"), bear: !!at(acts, "BEAR"), decline: acts.some((a) => a.kind === "cascade-decline") })
      .toEqual({ sphinx: false, bear: true, decline: true });
  });
  it("⭐ discover: a discovered Murder at the Sphinx is not offered; at the Bear it is, and to-hand stays", () => {
    const s = { ...board({ swamps: 2, hand: [], zones: { exile: [MURDER] } }), pendingDiscover: { controller: "ai", cardId: "murder" } };
    const acts = windowActions(s);
    expect({ sphinx: !!at(acts, "TAX"), bear: !!at(acts, "BEAR"), toHand: acts.some((a) => a.kind === "discover-to-hand") })
      .toEqual({ sphinx: false, bear: true, toHand: true });
  });
  it("⭐ Terror of the Peaks' LIFE tax now binds a free cast: the free Murder at Terror is stamped and costs 3 life (it skipped the tax before)", () => {
    const s = { ...board({ taxer: TERROR, swamps: 0 }), ...FREE };
    const cast = at(windowActions(s), "TAX");
    const row = { stamped: cast?.targetLifeTax ?? null, lifeAfter: cast ? dispatchAction(s, cast).players.ai.life : null };
    console.log(`WITNESS freeCastLifeTax ${JSON.stringify(row)}`);
    expect(row).toEqual({ stamped: 3, lifeAfter: s.players.ai.life - 3 });
  });
});

// The dispatcher's payment and the tax re-check both read castPaymentSources, so its three exclusions are pinned here
// directly (they moved out of the dispatcher unchanged in this slice).
describe("castPaymentSources — the sources a cast's payment may draw on", () => {
  const s = board({ swamps: 1, aiExtra: [perm("SPAWN", SPAWN, "ai"), perm("ELF", ELVES, "ai"), perm("T1", TREASURE, "ai"), perm("T2", TREASURE, "ai"), perm("T3", TREASURE, "ai")] });
  const ids = (action) => [...new Set(castPaymentSources(s, { playerId: "ai", ...action }).map((x) => x.permanentId))].sort();
  it("no victim: every source", () => {
    expect(ids({})).toEqual(["ELF", "SPAWN", "T1", "T2", "T3", "sw0"]);
  });
  it("W3: a one-shot victim (the Spawn) is out; a repeatable victim (the Elves) still taps first", () => {
    expect({ spawn: ids({ sacCreatureId: "SPAWN" }).includes("SPAWN"), elf: ids({ sacCreatureId: "ELF" }).includes("ELF") }).toEqual({ spawn: false, elf: true });
  });
  it("EMERGE: the creature sacrificed to emerge is out even when it's repeatable", () => {
    expect(ids({ emerge: true, sacCreatureId: "ELF" }).includes("ELF")).toBe(false);
  });
  it("AC-1: the N one-shot victims are out; the rest stay", () => {
    expect(ids({ sacCountIds: ["T1", "T2"] })).toEqual(["ELF", "SPAWN", "T3", "sw0"]);
  });
});
