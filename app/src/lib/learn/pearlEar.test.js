/**
 * pearlEar.test.js — Pearl-Ear, Imperial Advisor (shelf decks D44, 2026-10-01: Light-Paws Voltron).
 *
 *   "Lifelink / Enchantment spells you cast have affinity for Auras. (They cost {1} less to cast for each Aura you control.) /
 *    Whenever you cast an Aura spell that targets a modified permanent you control, draw a card. (Equipment, Auras you
 *    control, and counters are modifications.)"
 *
 * CR 702.41a: affinity for Auras = "this spell costs {1} less to cast for each Aura you control" — an enchantment-spell
 * reducer whose amount is the caster's Aura count, read at cost determination (CR 601.2f). CR 700.9: a permanent is modified
 * if it has a counter, is equipped, or is enchanted by an Aura its controller controls; the cast trigger reads the Aura
 * spell's chosen targets at cast time.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers } from "./triggers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PEARL_EAR = { name: "Pearl-Ear, Imperial Advisor", type: "Legendary Creature — Fox Advisor", mana: "{1}{W}{W}", colors: ["W"], power: "3", toughness: "4", keywords: ["Lifelink"],
  oracle: "Lifelink\nEnchantment spells you cast have affinity for Auras. (They cost {1} less to cast for each Aura you control.)\nWhenever you cast an Aura spell that targets a modified permanent you control, draw a card. (Equipment, Auras you control, and counters are modifications.)" };
const WGP = { name: "With Great Power . . .", type: "Enchantment — Aura", mana: "{3}{W}", colors: ["W"], keywords: ["Enchant"],
  oracle: "Enchant creature you control\nEnchanted creature gets +2/+2 for each Aura and Equipment attached to it.\nAll damage that would be dealt to you is dealt to enchanted creature instead." };
const RANCOR = { name: "Rancor", type: "Enchantment — Aura", mana: "{G}", colors: ["G"], keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", colors: ["W"], keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", colors: [], keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const GLORY_SEEKER = { name: "Glory Seeker", type: "Creature — Human Soldier", mana: "{1}{W}", colors: ["W"], power: "2", toughness: "2", keywords: [], oracle: "" };
const GIANT_GROWTH = { name: "Giant Growth", type: "Instant", mana: "{G}", colors: ["G"], keywords: [], oracle: "Target creature gets +3/+3 until end of turn." };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function table({ user = [], ai = [], hand = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: [perm("PEARL", PEARL_EAR, "user"), ...user], hand: hand.map(([id, c]) => ({ ...c, id })),
        library: [{ ...BEARS, id: "lib1" }, { ...BEARS, id: "lib2" }], manaPool: { ...g.players.user.manaPool, ...pool } },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const offered = (s, cardId) => legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === cardId);
/** The user casts `cardId` at `targetId`; everything settles; a logged resolver crash fails loudly. Returns the cards drawn
 *  (the library starts with two). */
function castAt(s, cardId, targetId) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && a.targets?.[0]?.id === targetId);
  if (!cast) throw new Error(`${cardId} at ${targetId} is not offered`);
  let n = dispatchAction(s, cast), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return 2 - n.players.user.library.length;
}
/** Two Auras the user controls, each on one of the AI's Bears. */
const twoAuras = [perm("PAC1", PACIFISM, "user", { attachedTo: "AB1" }), perm("PAC2", PACIFISM, "user", { attachedTo: "AB2" })];
const twoHosts = [perm("AB1", BEARS, "ai", { attachments: ["PAC1"] }), perm("AB2", BEARS, "ai", { attachments: ["PAC2"] })];

describe("the card", () => {
  it("reads native; both lines are read — the affinity reducer and the cast trigger", () => {
    expect({
      tier: classifyCard(PEARL_EAR),
      reducer: parseStaticAbilities(PEARL_EAR).find((d) => d.costReduction)?.costReduction,
      trigger: detectTriggers(PEARL_EAR).find((d) => d.event === "cast")?.spellFilter,
    }).toEqual({ tier: "native-mixed", reducer: { subtype: "enchantment", perAuraYouControl: true }, trigger: { kind: "auraTargetsYourModified" } });
  });

  it("fences (synthetic): another affinity grant and another target description stay unread", () => {
    expect({
      affinity: parseStaticAbilities({ name: "Probe", type: "Creature — Fox", oracle: "Artifact spells you cast have affinity for Auras." }),
      trigger: detectTriggers({ name: "Probe", type: "Creature — Fox", oracle: "Whenever you cast an Aura spell that targets a creature you control, draw a card." }).filter((d) => d.event === "cast"),
    }).toEqual({ affinity: [], trigger: [] });
  });
});

describe("affinity for Auras", () => {
  it("With Great Power . . . ({3}{W}) costs {1}{W} with two Auras you control (WITNESS)", () => {
    const s = table({ user: twoAuras, ai: twoHosts, hand: [["wgp", WGP]], pool: { W: 2 } });
    const witness = { withTwoW: offered(s, "wgp"), withOneW: offered({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, W: 1 } } } }, "wgp") };
    console.log(`WITNESS pearlEar ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ withTwoW: true, withOneW: false });
  });

  it("only the caster's own Auras count: two AI-controlled Pacifisms on your creatures do not", () => {
    const s = table({ user: [perm("UB1", BEARS, "user", { attachments: ["APAC1"] }), perm("UB2", BEARS, "user", { attachments: ["APAC2"] })],
      ai: [perm("APAC1", PACIFISM, "ai", { attachedTo: "UB1" }), perm("APAC2", PACIFISM, "ai", { attachedTo: "UB2" })], hand: [["wgp", WGP]], pool: { W: 2 } });
    expect(offered(s, "wgp")).toBe(false);
  });

  it("a creature spell is not an enchantment spell: Glory Seeker still costs {1}{W}", () => {
    const s = table({ user: twoAuras, ai: twoHosts, hand: [["gs", GLORY_SEEKER]], pool: { W: 1 } });
    expect(offered(s, "gs")).toBe(false);
  });
});

describe("the cast trigger", () => {
  const bear = (extra = {}) => perm("BEAR", BEARS, "user", extra);
  it("Rancor at your Bear with a +1/+1 counter draws a card", () => {
    expect(castAt(table({ user: [bear({ counters: { "+1/+1": 1 } })], hand: [["rancor", RANCOR]], pool: { G: 1 } }), "rancor", "BEAR")).toBe(1);
  });

  it("an equipped Bear is modified too; an unmodified one draws nothing", () => {
    const equipped = castAt(table({ user: [bear({ attachments: ["EQ"] }), perm("EQ", BONESPLITTER, "user", { attachedTo: "BEAR" })], hand: [["rancor", RANCOR]], pool: { G: 1 } }), "rancor", "BEAR");
    const plain = castAt(table({ user: [bear()], hand: [["rancor", RANCOR]], pool: { G: 1 } }), "rancor", "BEAR");
    expect({ equipped, plain }).toEqual({ equipped: 1, plain: 0 });
  });

  it("not another player's modified creature, and not a non-Aura spell", () => {
    const theirs = castAt(table({ ai: [perm("BEAR", BEARS, "ai", { counters: { "+1/+1": 1 } })], hand: [["rancor", RANCOR]], pool: { G: 1 } }), "rancor", "BEAR");
    const growth = castAt(table({ user: [bear({ counters: { "+1/+1": 1 } })], hand: [["gg", GIANT_GROWTH]], pool: { G: 1 } }), "gg", "BEAR");
    expect({ theirs, growth }).toEqual({ theirs: 0, growth: 0 });
  });
});
