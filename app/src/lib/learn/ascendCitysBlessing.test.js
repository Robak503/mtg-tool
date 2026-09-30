/**
 * ascendCitysBlessing.test.js — ASCEND and the city's blessing (CR 702.131 — shelf deck work, D5, 2026-09-30: Arch of Orazca
 * and Wayward Swordtooth in Jurassic Ramp, and the "as long as you have the city's blessing" family).
 *
 * CR 702.131b: "Any time you control ten or more permanents and you don't have the city's blessing, you get the city's
 * blessing for the rest of the game." The grant runs at the state-based-action cadence (sba.checkAllStateBasedActions —
 * before every priority window, after every resolution); the designation never leaves (CR 702.131c). Readers: the
 * intervening-if / "Activate only if" condition, the self can't-attack-or-block window, and the static "as long as" gate.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { checkAllStateBasedActions } from "./sba.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { interveningIfParseable, activationConditionParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ASCEND = "Ascend (If you control ten or more permanents, you get the city's blessing for the rest of the game.)";
const ARCH = { name: "Arch of Orazca", type: "Land", mana: "", cmc: 0, colors: [], keywords: ["Ascend"], oracle: `${ASCEND}\n{T}: Add {C}.\n{5}, {T}: Draw a card. Activate only if you have the city's blessing.` };
const SWORDTOOTH = { name: "Wayward Swordtooth", type: "Creature — Dinosaur", mana: "{2}{G}", cmc: 3, colors: ["G"], power: "5", toughness: "5", keywords: ["Ascend"],
  oracle: `${ASCEND}\nYou may play an additional land on each of your turns.\nThis creature can't attack or block unless you have the city's blessing.` };
const SKYMARCHER = { name: "Skymarcher Aspirant", type: "Creature — Vampire Soldier", mana: "{W}", cmc: 1, colors: ["W"], power: "2", toughness: "1", keywords: ["Ascend"],
  oracle: `${ASCEND}\nThis creature has flying as long as you have the city's blessing.` };
const DUSK_CHARGER = { name: "Dusk Charger", type: "Creature — Horse", mana: "{3}{B}", cmc: 4, colors: ["B"], power: "3", toughness: "3", keywords: ["Ascend"],
  oracle: `${ASCEND}\nThis creature gets +2/+2 as long as you have the city's blessing.` };
const TENDERSHOOT = { name: "Tendershoot Dryad", type: "Creature — Dryad", mana: "{4}{G}", cmc: 5, colors: ["G"], power: "2", toughness: "2", keywords: ["Ascend"],
  oracle: `${ASCEND}\nAt the beginning of each upkeep, create a 1/1 green Saproling creature token.\nSaprolings you control get +2/+2 as long as you have the city's blessing.` };
const RADIANT_DESTINY = { name: "Radiant Destiny", type: "Enchantment", mana: "{2}{W}", cmc: 3, colors: ["W"], keywords: ["Ascend"],
  oracle: `${ASCEND}\nAs this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+1. As long as you have the city's blessing, they also have vigilance.` };
const SECRETS = { name: "Secrets of the Golden City", type: "Sorcery", mana: "{1}{U}{U}", cmc: 3, colors: ["U"], keywords: ["Ascend"],
  oracle: `${ASCEND}\nDraw two cards. If you have the city's blessing, draw three cards instead.` };
const WINDY_CITY = { name: "Windy City Elemental", type: "Creature — Elemental", mana: "{3}{W}{W}", cmc: 5, colors: ["W"], power: "4", toughness: "4", keywords: ["Flying", "Ascend"],
  oracle: "Flying\nAscend MagicCon Chicago (If you attended MagicCon Chicago and control ten or more permanents, you get the windy city's blessing for the rest of the game.)\nWhenever Windy City Elemental attacks, if you have the windy city's blessing, put a +1/+1 counter on each creature you control with flying." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const SAPROLING = { name: "Saproling", type: "Token Creature — Saproling", mana: "", cmc: 0, colors: ["G"], power: "1", toughness: "1", keywords: [], oracle: "", token: true };
const TEMUR_ELEVATOR = { name: "Temur Elevator", type: "Land", mana: "", cmc: 0, colors: [], keywords: ["Ascend"], oracle: `${ASCEND}\n{T}: Add {G}, {U}, or {R}. If you don't have the city's blessing, you lose 1 life.` };
const ORAZCA_RELIC = { name: "Orazca Relic", type: "Artifact", mana: "{3}", cmc: 3, colors: [], keywords: ["Ascend"], oracle: `${ASCEND}\n{T}: Add {C}.\n{T}, Sacrifice this artifact: You gain 3 life and draw a card. Activate only if you have the city's blessing.` };
const DEADEYE_BRAWLER = { name: "Deadeye Brawler", type: "Creature — Human Pirate", mana: "{2}{U}{B}", cmc: 4, colors: ["U", "B"], power: "2", toughness: "4", keywords: ["Ascend", "Deathtouch"],
  oracle: `Deathtouch\n${ASCEND}\nWhenever this creature deals combat damage to a player, if you have the city's blessing, draw a card.` };
const WANDERGLYPH = { name: "Illustrious Wanderglyph", type: "Artifact Creature — Golem", mana: "{4}{W}", cmc: 5, colors: ["W"], power: "2", toughness: "2", keywords: ["Ascend"],
  oracle: `${ASCEND}\nOther artifact creatures you control get +2/+2 as long as you have the city's blessing.\nAt the beginning of each upkeep, create a 1/1 colorless Gnome artifact creature token.` };
const SWASHBUCKLER = { name: "Storm Fleet Swashbuckler", type: "Creature — Human Pirate", mana: "{1}{R}", cmc: 2, colors: ["R"], power: "2", toughness: "2", keywords: ["Ascend"],
  oracle: `${ASCEND}\nThis creature has double strike as long as you have the city's blessing.` };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, colors: [], power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const SOLDIER = { name: "Savannah Lions", type: "Creature — Cat Soldier", mana: "{W}", cmc: 1, colors: ["W"], power: "2", toughness: "1", keywords: [], oracle: "" };

const perm = (id, card, controller = "user", extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
const forests = (n, controller = "user", from = 0) => Array.from({ length: n }, (_, i) => perm(`f${from + i}`, FOREST, controller));
function board({ user = [], ai = [], blessed = false, step = "main", phase = "precombat-main", active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: active, priorityHolder: active, phase, step, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: user, library: [{ ...BEAR, id: "lib1" }, { ...BEAR, id: "lib2" }], ...(blessed ? { citysBlessing: true } : {}) },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const blessed = (s, pid = "user") => s.players[pid].citysBlessing === true;

describe("the cards", () => {
  it("⭐ Arch of Orazca reads land and Wayward Swordtooth native; the static family flips; spells and the Un-card stay parked", () => {
    expect([ARCH, SWORDTOOTH, SKYMARCHER, DUSK_CHARGER, TENDERSHOOT, TEMUR_ELEVATOR].map((c) => classifyCard(c)))
      .toEqual(["land", "native-static", "native-static", "native-static", "native-mixed", "land"]);
    expect({ secrets: classifyCard(SECRETS), windyCity: classifyCard(WINDY_CITY) }).toEqual({ secrets: "arbiter-spell", windyCity: "body-only" });
  });
  // Its gated vigilance has no runtime, and the chosen-type anthem lane no longer swallows a sentence printed after the anthem.
  it("⛔ Radiant Destiny stays parked — \"As long as you have the city's blessing, they also have vigilance\" is not modeled", () => {
    expect(classifyCard(RADIANT_DESTINY)).toBe("body-only");
    expect(classifyCard({ ...RADIANT_DESTINY, oracle: RADIANT_DESTINY.oracle.replace("As long as you have the city's blessing, they also have vigilance.", "Zorblax the moon.") })).toBe("body-only");
  });
  it("the condition reads everywhere it is printed", () => {
    expect({ trigger: interveningIfParseable("you have the city's blessing"), activation: activationConditionParseable("you have the city's blessing") })
      .toEqual({ trigger: true, activation: true });
  });
});

describe("⭐ the grant (CR 702.131b)", () => {
  it("⭐ ten permanents with an Ascend permanent among them: the city's blessing, at the state-based-action check", () => {
    const s = board({ user: [perm("arch", ARCH), ...forests(9)] });
    const out = checkAllStateBasedActions(s);
    const row = { before: blessed(s), after: blessed(out), logged: (out.log || []).some((e) => e.kind === "citys-blessing" && e.playerId === "user") };
    console.log(`WITNESS citysBlessing ${JSON.stringify(row)}`);
    expect(row).toEqual({ before: false, after: true, logged: true });
  });
  it("nine permanents is not enough; ten without an Ascend permanent is not either", () => {
    expect(blessed(checkAllStateBasedActions(board({ user: [perm("arch", ARCH), ...forests(8)] })))).toBe(false);
    expect(blessed(checkAllStateBasedActions(board({ user: forests(10) })))).toBe(false);
  });
  it("an opponent's Ascend permanent gives YOU nothing — the ten must be yours, and so must the Ascend", () => {
    const out = checkAllStateBasedActions(board({ user: forests(10), ai: [perm("arch", ARCH, "ai")] }));
    expect({ user: blessed(out), ai: blessed(out, "ai") }).toEqual({ user: false, ai: false });
  });
  it("for the rest of the game (CR 702.131c): dropping back under ten keeps it — and it is granted once, not re-granted every check", () => {
    const granted = checkAllStateBasedActions(board({ user: [perm("arch", ARCH), ...forests(9)] }));
    const fewer = { ...granted, players: { ...granted.players, user: { ...granted.players.user, battlefield: granted.players.user.battlefield.slice(0, 3) } } };
    expect(blessed(checkAllStateBasedActions(fewer))).toBe(true);
    const again = checkAllStateBasedActions(checkAllStateBasedActions(granted));
    expect((again.log || []).filter((e) => e.kind === "citys-blessing").length).toBe(1);
  });
  it("the Un-card's \"Ascend MagicCon Chicago\" is not Ascend: ten permanents beside it grant nothing", () => {
    expect(blessed(checkAllStateBasedActions(board({ user: [perm("wc", WINDY_CITY), ...forests(9)] })))).toBe(false);
  });
  it("a real land drop as the tenth permanent: the next priority check grants it", () => {
    const s = { ...board({ user: [perm("arch", ARCH), ...forests(8)] }), players: { ...board().players } };
    const g = board({ user: [perm("arch", ARCH), ...forests(8)] });
    const withHand = { ...g, players: { ...g.players, user: { ...g.players.user, hand: [{ ...FOREST, id: "h-forest" }] } } };
    const drop = legalActionsForPlayer(withHand, "user").find((a) => a.kind === "play-land" && a.cardId === "h-forest");
    const out = checkAllStateBasedActions(dispatchAction(withHand, drop));
    expect({ permanents: out.players.user.battlefield.length, blessed: blessed(out), unusedFixture: !!s }).toEqual({ permanents: 10, blessed: true, unusedFixture: true });
  });
});

describe("⭐ the readers", () => {
  const drawOffer = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "arch" && /draw/i.test(a.abilityText || a.effectText || ""));
  it("⭐ Arch of Orazca's draw is offered only with the blessing — and draws", () => {
    const lands = [perm("arch", ARCH), ...forests(5)];
    const without = board({ user: lands });
    const withIt = board({ user: lands, blessed: true });
    expect({ without: drawOffer(without).length, with: drawOffer(withIt).length > 0 }).toEqual({ without: 0, with: true });
    let out = dispatchAction(withIt, drawOffer(withIt)[0]);
    for (let i = 0; i < 5 && out.stack.length; i++) out = resolveTopOfStack(out);
    expect(out.players.user.hand.map((c) => c.id)).toEqual(["lib1"]);
  });
  it("⭐ Wayward Swordtooth attacks and blocks only with the blessing", () => {
    const atk = (b) => legalActionsForPlayer({ ...board({ user: [perm("sw", SWORDTOOTH)], blessed: b, phase: "combat", step: "declare-attackers" }), combat: { attackers: [], blockers: [] } }, "user")
      .filter((a) => a.kind === "declare-attacker" && a.permanentId === "sw").length > 0;
    expect({ without: atk(false), with: atk(true) }).toEqual({ without: false, with: true });
    const blk = (b) => {
      const g = board({ user: [perm("sw", SWORDTOOTH)], ai: [perm("o1", BEAR, "ai")], blessed: b, phase: "combat", step: "declare-blockers", active: "ai" });
      const s = { ...g, priorityHolder: "user", combat: { attackers: [{ permanentId: "o1", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
      return legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-blocker" && a.permanentId === "sw").length > 0;
    };
    expect({ without: blk(false), with: blk(true) }).toEqual({ without: false, with: true });
  });
  it("the static gates: flying, +2/+2, the Saprolings' +2/+2, OTHER artifact creatures' +2/+2 (not the Wanderglyph), double strike — with the blessing", () => {
    const read = (b) => {
      const s = board({ user: [perm("sky", SKYMARCHER), perm("dusk", DUSK_CHARGER), perm("td", TENDERSHOOT), perm("sap", SAPROLING), perm("lion", SOLDIER), perm("wg", WANDERGLYPH), perm("orn", ORNITHOPTER), perm("sfs", SWASHBUCKLER)], blessed: b });
      return { skyFlying: permanentHasKeyword(s, "sky", "flying"), dusk: `${permanentPower(s, "dusk")}/${permanentToughness(s, "dusk")}`,
        saproling: `${permanentPower(s, "sap")}/${permanentToughness(s, "sap")}`, lion: `${permanentPower(s, "lion")}/${permanentToughness(s, "lion")}`, ornithopter: `${permanentPower(s, "orn")}/${permanentToughness(s, "orn")}`, wanderglyph: `${permanentPower(s, "wg")}/${permanentToughness(s, "wg")}`, swashbucklerDS: permanentHasKeyword(s, "sfs", "double strike") };
    };
    expect({ without: read(false), with: read(true) }).toEqual({
      without: { skyFlying: false, dusk: "3/3", saproling: "1/1", lion: "2/1", ornithopter: "0/2", wanderglyph: "2/2", swashbucklerDS: false },
      with: { skyFlying: true, dusk: "5/5", saproling: "3/3", lion: "2/1", ornithopter: "2/4", wanderglyph: "2/2", swashbucklerDS: true },
    });
  });
  it("⭐ Temur Elevator costs a life per tap without the blessing, and nothing with it (a real cast paid with it)", () => {
    const cast = (b) => {
      const g = board({ user: [perm("te", TEMUR_ELEVATOR), perm("f0", FOREST)], blessed: b });
      const s = { ...g, players: { ...g.players, user: { ...g.players.user, life: 40, hand: [{ ...BEAR, id: "h-bear" }] } } };
      const out = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-bear"));
      return { life: out.players.user.life, elevatorTapped: out.players.user.battlefield.find((p) => p.id === "te").tapped };
    };
    expect({ without: cast(false), with: cast(true) }).toEqual({ without: { life: 39, elevatorTapped: true }, with: { life: 40, elevatorTapped: true } });
  });
  it("Orazca Relic's sacrifice is offered only with the blessing — 3 life and a card", () => {
    const offer = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "relic" && /draw/i.test(a.abilityText || a.effectText || ""));
    const without = board({ user: [perm("relic", ORAZCA_RELIC)] });
    const withIt = board({ user: [perm("relic", ORAZCA_RELIC)], blessed: true });
    expect({ without: offer(without).length, with: offer(withIt).length > 0 }).toEqual({ without: 0, with: true });
    let out = dispatchAction(withIt, offer(withIt)[0]);
    for (let i = 0; i < 5 && out.stack.length; i++) out = resolveTopOfStack(out);
    expect({ life: out.players.user.life - withIt.players.user.life, hand: out.players.user.hand.map((c) => c.id), relicGone: !out.players.user.battlefield.some((p) => p.id === "relic") })
      .toEqual({ life: 3, hand: ["lib1"], relicGone: true });
  });
  it("Deadeye Brawler draws on connecting only with the blessing (a real combat-damage trigger)", () => {
    const connect = (b) => {
      const g = board({ user: [perm("db", DEADEYE_BRAWLER)], blessed: b, phase: "combat", step: "combat-damage" });
      let s = resolveCombatDamage({ ...g, combat: { attackers: [{ permanentId: "db", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
      s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
      for (let i = 0; i < 5 && s.stack.length; i++) s = resolveTopOfStack(s);
      return s.players.user.hand.map((c) => c.id);
    };
    expect({ without: connect(false), with: connect(true) }).toEqual({ without: [], with: ["lib1"] });
  });
  it("an OPPONENT's blessing opens none of your gates: the gate reads the source's controller", () => {
    const s = board({ user: [perm("dusk", DUSK_CHARGER)] });
    const theirs = { ...s, players: { ...s.players, ai: { ...s.players.ai, citysBlessing: true } } };
    expect(`${permanentPower(theirs, "dusk")}/${permanentToughness(theirs, "dusk")}`).toBe("3/3");
  });
});
