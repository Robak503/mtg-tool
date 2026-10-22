/**
 * ATTACH-ON-ENTER EQUIPMENT (play-weighted 2026-10-21):
 *   · Hero's Blade (EDHREC #1865) — "Equipped creature gets +3/+2. / Whenever a legendary creature you control enters, you may attach this
 *     Equipment to it. / Equip {4}";
 *   · Sai of the Shinobi, Stormrider Rig ("Whenever a creature you control enters, you may attach this Equipment to it."), Ronin Warclub
 *     (mandatory: "… attach this Equipment to that creature."), Inventor's Goggles ("Whenever an Artificer you control enters …"),
 *     Quintessential Katana ("Whenever a Ninja you control enters …").
 * Two pieces: the Legendary supertype on the controlled-creature enters watcher (CR 205.4a — the entering creature's own type line), and
 * the pronoun — on an enters watcher "it" / "that creature" is the entering creature, so the Equipment moves onto it (CR 701.3a), off any
 * old host. It doesn't move when it can't equip that creature (CR 701.3b): the creature left, is no creature now, or has protection from
 * one of the Equipment's colours (CR 702.16d), or the Equipment is a creature itself. The "you may" is a real choice; the default AI
 * attaches an Equipment that is unattached and keeps an attached one where it is.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard), except the labelled SYNTHETIC guards.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { resolveOptionalChoice, optionalAutoTakeValue } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, creaturePower, creatureToughness, attachPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HEROS_BLADE = {"name":"Hero's Blade","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +3/+2.\nWhenever a legendary creature you control enters, you may attach this Equipment to it.\nEquip {4} ({4}: Attach to target creature you control. Equip only as a sorcery.)"}; // body-only on c2d7f0b0
const SAI = {"name":"Sai of the Shinobi","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+1.\nWhenever a creature you control enters, you may attach this Equipment to it.\nEquip {2}"}; // body-only on c2d7f0b0
const STORMRIDER_RIG = {"name":"Stormrider Rig","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+1.\nWhenever a creature you control enters, you may attach this Equipment to it.\nEquip {2}"}; // body-only on c2d7f0b0
const RONIN_WARCLUB = {"name":"Ronin Warclub","type":"Artifact — Equipment","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+1.\nWhenever a creature you control enters, attach this Equipment to that creature.\nEquip {5} ({5}: Attach to target creature you control. Equip only as a sorcery.)"}; // body-only on c2d7f0b0
const INVENTORS_GOGGLES = {"name":"Inventor's Goggles","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +1/+2.\nWhenever an Artificer you control enters, you may attach this Equipment to it.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // body-only on c2d7f0b0
const KATANA = {"name":"Quintessential Katana","type":"Artifact — Equipment","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":["W"],"oracle":"Equipped creature gets +1/+1 and has \"Whenever this creature deals combat damage, untap it and you gain 2 life.\"\nWhenever a Ninja you control enters, you may attach this Equipment to it.\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // body-only on c2d7f0b0
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const THOPTER_ENGINEER = {"name":"Thopter Engineer","type":"Creature — Human Artificer","mana":"{2}{R}","cmc":3,"power":"1","toughness":"3","keywords":[],"colors":["R"],"oracle":"When this creature enters, create a 1/1 colorless Thopter artifact creature token with flying.\nArtifact creatures you control have haste. (They can attack and {T} as soon as they come under your control.)"};
const NINJA = {"name":"Ninja of the Deep Hours","type":"Creature — Human Ninja","mana":"{3}{U}","cmc":4,"power":"2","toughness":"2","keywords":["Ninjutsu"],"colors":["U"],"oracle":"Ninjutsu {1}{U} ({1}{U}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, you may draw a card."};
const land = (name, sub, c) => ({ name, type: `Basic Land — ${sub}`, mana: "", cmc: 0, keywords: [], colors: [], oracle: `({T}: Add {${c}}.)` });
const PLAINS = land("Plains", "Plains", "W"), FOREST = land("Forest", "Forest", "G"), MOUNTAIN = land("Mountain", "Mountain", "R"), ISLAND = land("Island", "Island", "U");

const cardOf = (card, id) => ({ ...card, id });
const perm = (id, card, controller = "user", extra = {}) => createPermanent({ id, card: cardOf(card, `c-${id}`), controller, summoningSick: false, ...extra });
const lands = (prefix, card, n, controller = "user") => Array.from({ length: n }, (_, i) => perm(`${prefix}${i + 1}`, card, controller));
function board({ bf = [], hand = [], aiBf = [], aiHand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, library: [] }, ai: { ...s0.players.ai, battlefield: aiBf, hand: aiHand, library: [] } } };
}
/** Cast `cardId` (offered to `pid`) and resolve it; its enters triggers go on the stack and resolve. A "you may" stops the walk. */
function castAndResolve(s0, cardId, pid = "user") {
  const withPriority = { ...s0, priorityHolder: pid };
  const cast = legalActionsForPlayer(withPriority, pid).find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(cast, `cast of ${cardId} offered`).toBeTruthy();
  let s = dispatchAction(withPriority, cast);
  for (let g = 0; g < 20 && (s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice; g++) s = s.stack.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return s;
}
const permOfCard = (s, cardId) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.card.id === cardId);
const attachedTo = (s, id) => findPermanent(s, id)?.permanent?.attachedTo ?? null;
const pt = (s, p) => [creaturePower(p, s), creatureToughness(p, s)];

describe("the reader", () => {
  it("⭐ the six Equipment play their whole text", () => {
    expect([HEROS_BLADE, SAI, STORMRIDER_RIG, RONIN_WARCLUB, INVENTORS_GOGGLES, KATANA].map((c) => classifyCard(c)))
      .toEqual(["native-equipment", "native-equipment", "native-equipment", "native-equipment", "native-equipment", "native-trigger"]);
  });
  it("⭐ the watcher: the controlled-creature scope with the Legendary filter; the payoff names the entering creature", () => {
    const [d] = detectTriggers(HEROS_BLADE);
    expect(d, "the enters watcher is detected").toBeTruthy();
    const p = parseEffectClause(d.effectClause, "Instant", { hasX: false, sourceScoped: true });
    expect({ event: d.event, scope: d.scope, legendary: d.legendaryFilter, clause: d.effectClause, atoms: p.atoms })
      .toEqual({ event: "etb", scope: "creatureYouControl", legendary: true, clause: "you may attach this Equipment to the triggering creature",
        atoms: [{ op: "attach-equipment-to-triggering", targetType: null, optional: true }] });
    const [r] = detectTriggers(RONIN_WARCLUB);
    expect(parseEffectClause(r.effectClause, "Instant", { hasX: false, sourceScoped: true }).atoms).toEqual([{ op: "attach-equipment-to-triggering", targetType: null }]);
  });
  it("control: the printed pronoun is never read off a spell, and an Equipment watching any player's creatures keeps its raw pronoun", () => {
    expect(parseEffectClause("Attach this Equipment to it.", "Instant").confidence).toBe("low");
    const anyones = { ...SAI, name: "Synthetic Sai", oracle: SAI.oracle.replace("a creature you control enters", "a creature enters") };
    const [d] = detectTriggers(anyones);
    expect({ clause: d?.effectClause ?? null, tier: classifyCard(anyones) }).toEqual({ clause: "you may attach this Equipment to it", tier: "body-only" });
  });
});

describe("Hero's Blade", () => {
  const bladeBoard = (extra = {}) => board({ bf: [perm("blade", HEROS_BLADE), ...lands("p", PLAINS, 2), ...lands("f", FOREST, 2)], hand: [cardOf(ISAMARU, "c-isa"), cardOf(BEARS, "c-bear")], ...extra });
  it("⭐ a legendary creature enters: asked; yes → the Blade is on Isamaru, a 5/4", () => {
    const s = castAndResolve(bladeBoard(), "c-isa");
    const asked = s.pendingChoice?.kind;
    const after = resolveOptionalChoice(s, true);
    const isa = permOfCard(after, "c-isa");
    expect({ asked, on: attachedTo(after, "blade") === isa.id, pt: pt(after, isa) }).toEqual({ asked: "optional-effect", on: true, pt: [5, 4] });
  });
  it("declined: the Blade stays unattached", () => {
    const after = resolveOptionalChoice(castAndResolve(bladeBoard(), "c-isa"), false);
    expect({ on: attachedTo(after, "blade"), pt: pt(after, permOfCard(after, "c-isa")) }).toEqual({ on: null, pt: [2, 2] });
  });
  it("⭐ a creature that isn't legendary: no trigger", () => {
    const s = castAndResolve(bladeBoard(), "c-bear");
    expect({ asked: s.pendingChoice?.kind ?? null, on: attachedTo(s, "blade") }).toEqual({ asked: null, on: null });
  });
  it("an opponent's legendary creature entering: no trigger", () => {
    const s = castAndResolve({ ...bladeBoard({ aiBf: lands("ap", PLAINS, 1, "ai"), aiHand: [cardOf(ISAMARU, "c-aisa")] }), activePlayer: "ai" }, "c-aisa", "ai");
    expect({ asked: s.pendingChoice?.kind ?? null, on: attachedTo(s, "blade"), isamaru: !!permOfCard(s, "c-aisa") }).toEqual({ asked: null, on: null, isamaru: true });
  });
  it("⭐ the default AI: an unattached Blade is attached; one already on a creature stays there", () => {
    const free = castAndResolve(bladeBoard(), "c-isa");
    const worn = castAndResolve(bladeBoard({ bf: [perm("blade", HEROS_BLADE), perm("old", BEARS), ...lands("p", PLAINS, 2)] }), "c-isa");
    const wornState = { ...worn, ...attachPermanent(worn, { equipId: "blade", targetId: "old" }) };
    expect({ free: optionalAutoTakeValue(free, free.pendingChoice), worn: optionalAutoTakeValue(wornState, wornState.pendingChoice) }).toEqual({ free: true, worn: false });
  });
});

describe("Ronin Warclub, Sai of the Shinobi, Stormrider Rig, Inventor's Goggles", () => {
  it("⭐ Ronin Warclub (no 'may'): it leaves its old host for the Bear that enters", () => {
    let s = board({ bf: [perm("club", RONIN_WARCLUB), perm("old", ISAMARU), ...lands("f", FOREST, 2)], hand: [cardOf(BEARS, "c-bear")] });
    s = attachPermanent(s, { equipId: "club", targetId: "old" });
    const after = castAndResolve(s, "c-bear");
    const bear = permOfCard(after, "c-bear");
    expect({ asked: after.pendingChoice?.kind ?? null, on: attachedTo(after, "club") === bear.id, bear: pt(after, bear), old: pt(after, findPermanent(after, "old").permanent) })
      .toEqual({ asked: null, on: true, bear: [4, 3], old: [2, 2] });
  });
  it("Sai of the Shinobi and Stormrider Rig: any creature you control entering", () => {
    for (const eq of [SAI, STORMRIDER_RIG]) {
      const s = castAndResolve(board({ bf: [perm("eq", eq), ...lands("f", FOREST, 2)], hand: [cardOf(BEARS, "c-bear")] }), "c-bear");
      const after = resolveOptionalChoice(s, true);
      expect({ name: eq.name, pt: pt(after, permOfCard(after, "c-bear")) }).toEqual({ name: eq.name, pt: [3, 3] });
    }
  });
  it("Inventor's Goggles: an Artificer entering, never a Bear", () => {
    const art = resolveOptionalChoice(castAndResolve(board({ bf: [perm("gog", INVENTORS_GOGGLES), ...lands("m", MOUNTAIN, 3)], hand: [cardOf(THOPTER_ENGINEER, "c-te")] }), "c-te"), true);
    let bear = castAndResolve(board({ bf: [perm("gog", INVENTORS_GOGGLES), ...lands("f", FOREST, 2)], hand: [cardOf(BEARS, "c-bear")] }), "c-bear");
    expect({ engineer: pt(art, permOfCard(art, "c-te")), goggles: attachedTo(art, "gog") === permOfCard(art, "c-te").id, bearAsked: bear.pendingChoice?.kind ?? null })
      .toEqual({ engineer: [2, 5], goggles: true, bearAsked: null });
  });
});

describe("Quintessential Katana — its whole text", () => {
  it("⭐ a Ninja enters: the Katana goes on (3/3); its combat damage untaps it and gains 2 life (the granted trigger)", () => {
    const s0 = board({ bf: [perm("kat", KATANA), ...lands("i", ISLAND, 4)], hand: [cardOf(NINJA, "c-ninja")] });
    let s = resolveOptionalChoice(castAndResolve(s0, "c-ninja"), true);
    const ninja = permOfCard(s, "c-ninja");
    const equipped = { on: attachedTo(s, "kat") === ninja.id, pt: pt(s, ninja) };
    // The Ninja attacks the next turn (SETUP: tapped as an attacker, the regular combat damage step dealt — the engine's own resolver).
    s = { ...s, phase: "combat", step: "combat-damage", players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === ninja.id ? { ...p, tapped: true, summoningSick: false } : p)) } },
      combat: { attackers: [{ permanentId: ninja.id, attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    s = resolveCombatDamage(s);
    for (let g = 0; g < 20; g++) { s = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); if (!s.stack.length || s.pendingChoice) break; s = resolveTopOfStack(s); }
    if (s.pendingChoice?.kind === "optional-effect") s = resolveOptionalChoice(s, false); // the Ninja's own "you may draw" — declined
    expect({ ...equipped, ai: s.players.ai.life, user: s.players.user.life, untapped: !findPermanent(s, ninja.id).permanent.tapped })
      .toEqual({ on: true, pt: [3, 3], ai: 37, user: 42, untapped: true });
  });
});

describe("SYNTHETIC — the Equipment doesn't move when it can't equip", () => {
  it("protection from the Equipment's colour (CR 702.16d): the white Katana stays put", () => {
    const proNinja = { ...NINJA, name: "Synthetic Warded Ninja", oracle: "Protection from white" };
    const s = resolveOptionalChoice(castAndResolve(board({ bf: [perm("kat", KATANA), ...lands("i", ISLAND, 4)], hand: [cardOf(proNinja, "c-pn")] }), "c-pn"), true);
    expect(attachedTo(s, "kat")).toBe(null);
  });
  it("the Equipment is a creature right now (CR 301.5c): it doesn't move", () => {
    const s0 = board({ bf: [perm("blade", { ...HEROS_BLADE, type: "Artifact Creature — Equipment", power: "1", toughness: "1" }), ...lands("p", PLAINS, 1)], hand: [cardOf(ISAMARU, "c-isa")] });
    const s = castAndResolve(s0, "c-isa");
    const after = s.pendingChoice ? resolveOptionalChoice(s, true) : s;
    expect(attachedTo(after, "blade")).toBe(null);
  });
});
