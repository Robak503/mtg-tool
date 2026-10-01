/**
 * umbraMystic.test.js — Umbra Mystic (shelf decks D43, 2026-10-01: Light-Paws Voltron).
 *
 *   "Auras attached to permanents you control have umbra armor. (If an enchanted permanent you control would be destroyed,
 *    instead remove all damage from it and destroy an Aura attached to it.)"
 *
 * CR 702.89a: umbra armor means "If enchanted permanent would be destroyed, instead remove all damage marked on it and
 * destroy this Aura." The grant reaches every Aura attached to a permanent the Mystic's controller controls — whoever
 * controls the Aura — and nothing on another player's permanent. gameState.totemArmorAuraFor reads it at both destruction
 * sites (the lethal-damage state-based action and the destroy effect).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MYSTIC = { name: "Umbra Mystic", type: "Creature — Human Wizard", mana: "{2}{W}", power: "2", toughness: "2", keywords: [],
  oracle: "Auras attached to permanents you control have umbra armor. (If an enchanted permanent you control would be destroyed, instead remove all damage from it and destroy an Aura attached to it.)" };
// `colors` as the card index carries it — Doom Blade's "nonblack" reads the printed colours and fails closed without them.
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const RANCOR = { name: "Rancor", type: "Enchantment — Aura", mana: "{G}", keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
const PACIFISM = { name: "Pacifism", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Enchant"], oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const DOOM_BLADE = { name: "Doom Blade", type: "Instant", mana: "{1}{B}", keywords: [], oracle: "Destroy target nonblack creature." };
const BOLT = { name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." };

const perm = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
/** HOST (a Bear, controlled by `hostSide`) wearing ATT (`att`, controlled by `attSide`); the user may control an Umbra Mystic. */
function table({ att = RANCOR, attSide = "user", hostSide = "user", mystic = true } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const sides = { user: mystic ? [perm("MYSTIC", MYSTIC, "user")] : [], ai: [] };
  sides[hostSide].push(perm("HOST", BEARS, hostSide, { attachments: ["ATT"] }));
  sides[attSide].push(perm("ATT", att, attSide, { attachedTo: "HOST" }));
  return { ...g, turn: 5, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: sides.user }, ai: { ...g.players.ai, battlefield: sides.ai } } };
}
/** The AI casts `spell` at HOST through the real cast path; everything settles; a logged resolver crash fails loudly. */
function castAtHost(s, spell, mana) {
  const s1 = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...spell, id: "spell" }], manaPool: { ...s.players.ai.manaPool, ...mana } } } };
  const cast = legalActionsForPlayer(s1, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "spell" && a.targets?.[0]?.id === "HOST");
  if (!cast) throw new Error(`${spell.name} at HOST is not offered`);
  let n = dispatchAction(s1, cast), g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const doomBlade = (s) => castAtHost(s, DOOM_BLADE, { B: 1, C: 1 });
const names = (cards) => cards.map((c) => c.name).sort();

describe("the card", () => {
  it("reads native-static; its line is the umbra-armor grant marker", () => {
    expect({ tier: classifyCard(MYSTIC), statics: parseStaticAbilities(MYSTIC) }).toEqual({ tier: "native-static", statics: [{ grantsUmbraArmorToAttachedAuras: true }] });
  });

  it("fence (synthetic): a narrower scope stays unread", () => {
    expect(parseStaticAbilities({ name: "Probe", type: "Creature — Human", oracle: "Auras attached to creatures you control have umbra armor." })).toEqual([]);
  });
});

describe("in play", () => {
  it("Doom Blade on your Bear destroys its Rancor instead; Rancor returns to your hand (WITNESS)", () => {
    const s = doomBlade(table());
    const witness = { hostAlive: !!findPermanent(s, "HOST"), hand: names(s.players.user.hand), graveyard: names(s.players.user.graveyard) };
    console.log(`WITNESS umbraMystic ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ hostAlive: true, hand: ["Rancor"], graveyard: [] });
  });

  it("without the Mystic, the same Doom Blade kills the Bear", () => {
    const s = doomBlade(table({ mystic: false }));
    expect({ hostAlive: !!findPermanent(s, "HOST"), graveyard: names(s.players.user.graveyard) }).toEqual({ hostAlive: false, graveyard: ["Grizzly Bears"] });
  });

  it("lethal damage: an OPPONENT's Pacifism on your Bear is destroyed instead, and the damage is removed", () => {
    const s = castAtHost(table({ att: PACIFISM, attSide: "ai" }), BOLT, { R: 1 });
    expect({ hostAlive: !!findPermanent(s, "HOST"), damage: findPermanent(s, "HOST")?.permanent?.damageMarked, aiGraveyard: names(s.players.ai.graveyard) })
      .toEqual({ hostAlive: true, damage: 0, aiGraveyard: ["Lightning Bolt", "Pacifism"] });
  });

  it("not on another player's permanent: your Rancor on the AI's Bear does not save it", () => {
    const s = doomBlade(table({ hostSide: "ai" }));
    expect({ hostAlive: !!findPermanent(s, "HOST"), aiGraveyard: names(s.players.ai.graveyard) }).toEqual({ hostAlive: false, aiGraveyard: ["Doom Blade", "Grizzly Bears"] });
  });

  it("an Equipment is not an Aura: Bonesplitter does not save the Bear", () => {
    const s = doomBlade(table({ att: BONESPLITTER }));
    expect({ hostAlive: !!findPermanent(s, "HOST"), bonesplitter: !!findPermanent(s, "ATT") }).toEqual({ hostAlive: false, bonesplitter: true });
  });
});
