/**
 * protectionAttachWalkerOffer.test.js — four places protection (CR 702.16) was not enforced, each a false positive:
 *
 *   (1) ATTACHMENTS — an Aura or Equipment already attached stayed when its host GAINED protection from a quality it has. The
 *       state-based action reads protection now: the Aura is put into its owner's graveyard, the Equipment becomes unattached
 *       and stays on the battlefield — every colour quality, colorless included. "This effect doesn't remove this Aura" (White
 *       Ward) is honoured: the protection that Aura grants never removes the Aura itself.
 *   (2) PLANESWALKER DAMAGE — damage to a planeswalker checked no protection (spell and ability damage, and combat damage to an
 *       attacked planeswalker). It goes through the same prevention judgment creature damage does.
 *   (3) TARGET OFFERS — a triggered ability's and a loyalty ability's targets were offered with no source colours, so a
 *       permanent with protection from the source's colour was OFFERED (and only the resolution re-check fizzled it). The offer
 *       reads the source as the re-check does: on the battlefield its current colours, departed its last known ones.
 *   (4) "COMBAT DAMAGE CAN'T BE PREVENTED" (Frenzied Baloth) — protection, Maze of Ith's prevention (both halves) and a shield
 *       counter still prevented combat damage. Under it they prevent nothing; a shield counter is still removed.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 702.16c — "Such Auras attached to the permanent or player with protection will be put into their owners' graveyards as a
 *     state-based action."; CR 702.16d — "Such Equipment or Fortifications become unattached from that permanent as a state-based
 *     action, but remain on the battlefield."; CR 704.5m, 704.5n.
 *   · CR 702.16e — "Any damage that would be dealt by sources that have the stated quality to a permanent or player with protection
 *     is prevented."; CR 120.3c (damage to a planeswalker removes loyalty counters).
 *   · CR 702.16b — can't be targeted by abilities from a source with the stated quality; CR 603.3d (a triggered ability's targets
 *     are chosen as for a spell, CR 601.2c); CR 606 (loyalty abilities are activated abilities).
 *   · CR 105.2c — "A colorless object has no color."; CR 608.2b / 113.7a — a departed source's last known information.
 *   · CR 615.12 — "If unpreventable damage would be dealt, any applicable prevention effects are still applied to it. Those effects
 *     won't prevent any damage, but any additional effects they have will take place."; CR 122.1c (a shield counter's prevention
 *     effect "prevent that damage and remove a shield counter from it"). The bundled shield-counter ruling (2022-04-29): "If a
 *     permanent with a shield counter is dealt unpreventable damage, that damage will be dealt and a shield counter will still be
 *     removed."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, read 2026-10-22). One grant is written directly: no bundled card
 * that gives a PLANESWALKER protection from a colour is native yet (Angelic Intervention, Faith's Shield and Razor Barrier are
 * Arbiter-routed; Eight-and-a-Half-Tails' grant is not offered), so the planeswalker's protection is the resolver's own grant
 * (combat.applyGrantProtection — the layer-6 effect Mother of Runes' and Gods Willing's resolution write), credited to Faith's
 * Shield.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentProtectionColors } from "./layers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { applyGrantProtection } from "./effects/atoms/combat.js";
import { advanceUntilDecision } from "./learnSession.js";
import { checkAllStateBasedActions } from "./sba.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim, cardIndex.publicCard) ─────────────────────────────────────────────────────────────────────
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
const SWORD_OF_WAR_AND_PEACE = {"name":"Sword of War and Peace","type":"Artifact — Equipment","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+2 and has protection from red and from white.\nWhenever equipped creature deals combat damage to a player, this Equipment deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your hand.\nEquip {2}"};
const MAUL_OF_THE_SKYCLAVES = {"name":"Maul of the Skyclaves","type":"Artifact — Equipment","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Equip"],"colors":["W"],"colorIdentity":["W"],"oracle":"When this Equipment enters, attach it to target creature you control.\nEquipped creature gets +2/+2 and has flying and first strike.(It deals combat damage before creatures without first strike.)\nEquip {2}{W}{W}"};
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"};
const GIVER_OF_RUNES = {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"colorIdentity":[],"oracle":"Flying"};
const WHITE_WARD = {"name":"White Ward","type":"Enchantment — Aura","mana":"{W}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"colorIdentity":["W"],"oracle":"Enchant creature\nEnchanted creature has protection from white. This effect doesn't remove this Aura."};
const BLANCHWOOD_ARMOR = {"name":"Blanchwood Armor","type":"Enchantment — Aura","mana":"{2}{G}","cmc":3,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"],"oracle":"Enchant creature\nEnchanted creature gets +1/+1 for each Forest you control."};
const CHANDRA_TORCH = {"name":"Chandra, Torch of Defiance","type":"Legendary Planeswalker — Chandra","mana":"{2}{R}{R}","cmc":4,"power":null,"toughness":null,"loyalty":"4","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\""};
const STORMS_WRATH = {"name":"Storm's Wrath","type":"Sorcery","mana":"{2}{R}{R}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Storm's Wrath deals 4 damage to each creature and each planeswalker."};
const END_THE_FESTIVITIES = {"name":"End the Festivities","type":"Sorcery","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"End the Festivities deals 1 damage to each opponent and each creature and planeswalker they control."};
const RAGING_GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"colorIdentity":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"};
const FLAMETONGUE_KAVU = {"name":"Flametongue Kavu","type":"Creature — Kavu","mana":"{3}{R}","cmc":4,"power":"4","toughness":"2","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"When this creature enters, it deals 4 damage to target creature."};
const SILVER_KNIGHT = {"name":"Silver Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike, protection from red"};
const WHITE_KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"};
const PERILOUS_MYR = {"name":"Perilous Myr","type":"Artifact Creature — Phyrexian Myr","mana":"{2}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":[],"colorIdentity":[],"oracle":"When this creature dies, it deals 2 damage to any target."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const SPINED_WURM = {"name":"Spined Wurm","type":"Creature — Wurm","mana":"{4}{G}","cmc":5,"power":"5","toughness":"4","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const FRENZIED_BALOTH = {"name":"Frenzied Baloth","type":"Creature — Beast","mana":"{G}{G}","cmc":2,"power":"3","toughness":"2","keywords":["Haste","Trample"],"colors":["G"],"colorIdentity":["G"],"oracle":"This spell can't be countered.\nTrample, haste\nCreature spells you control can't be countered.\nCombat damage can't be prevented."};
const SPECTRAL_LYNX = {"name":"Spectral Lynx","type":"Creature — Cat Spirit","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":["Regenerate","Protection"],"colors":["W"],"colorIdentity":["B","W"],"oracle":"Protection from green\n{B}: Regenerate this creature."};
const MAZE_OF_ITH = {"name":"Maze of Ith","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn."};
const HUNTED_HORROR = {"name":"Hunted Horror","type":"Creature — Horror","mana":"{B}{B}","cmc":2,"power":"7","toughness":"7","keywords":["Trample"],"colors":["B"],"colorIdentity":["B"],"oracle":"Trample\nWhen this creature enters, target opponent creates two 3/3 green Centaur creature tokens with protection from black."};
const UNHOLY_STRENGTH = {"name":"Unholy Strength","type":"Enchantment — Aura","mana":"{B}","cmc":1,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["B"],"colorIdentity":["B"],"oracle":"Enchant creature\nEnchanted creature gets +2/+1."};
const ICE_OVER = {"name":"Ice Over","type":"Enchantment — Aura","mana":"{1}{U}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["U"],"colorIdentity":["U"],"oracle":"Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step."};
const SWORD_OF_FIRE_AND_ICE = {"name":"Sword of Fire and Ice","type":"Artifact — Equipment","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["W"],"oracle":"({T}: Add {W}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["R"],"oracle":"({T}: Add {R}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};

// ── boards ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...extra });
const C = (id, card) => ({ id, ...card });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));
const LIB = (pid) => Array.from({ length: 6 }, (_, i) => C(`${pid}-lib${i}`, GRIZZLY_BEARS));
const walker = (id, card, controller) => P(id, card, controller, { counters: { loyalty: Number(card.loyalty) } });
/** `attachment` (controlled by its own `controller`) attached to `host` — both links, as gameState.attachPermanent forms them. */
function attach(host, ...attachments) {
  return [{ ...host, attachments: [...(host.attachments || []), ...attachments.map((a) => a.id)] }, ...attachments.map((a) => ({ ...a, attachedTo: host.id }))];
}

/** A two-seat game in `active`'s precombat main phase, the stack empty, `active` holding priority; `humans` is state.humanSeats. */
function duel({ user = [], ai = [], userHand = [], aiHand = [], active = "user", humans = null } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...g, ...(humans ? { humanSeats: humans } : {}), turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active,
    consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] },
    players: {
      ...g.players,
      user: { ...g.players.user, life: 20, battlefield: user, hand: userHand, graveyard: [], library: LIB("user") },
      ai: { ...g.players.ai, life: 20, battlefield: ai, hand: aiHand, graveyard: [], library: LIB("ai") },
    },
  };
}
const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
const targetsIt = (id) => (a) => (a.targets || []).some((t) => t.id === id);
/** Both seats pass until the stack is empty. */
function resolveAll(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.stack.length; g++) cur = pass(cur);
  return cur;
}
const alive = (s, id) => !!findPermanent(s, id);
const perm = (s, id) => findPermanent(s, id)?.permanent ?? null;
const prot = (s, id) => [...permanentProtectionColors(s, id)].sort();
const graveyardNames = (s, pid) => (s.players[pid].graveyard || []).map((c) => c.name).sort();
const loyalty = (s, id) => perm(s, id)?.counters?.loyalty ?? null;
/** Equip `equipmentId` onto `targetId` (the Equip activation), resolved. */
const equip = (s, pid, equipmentId, targetId) => resolveAll(act(s, pid, "activate-ability", (a) => a.permanentId === equipmentId && targetsIt(targetId)(a)));
/** The resolver's own protection grant onto `id` (see the header — no native card grants a planeswalker protection yet). */
const grantProtection = (s, id, colors, controller) =>
  applyGrantProtection(s, { op: "grant-protection", colors }, { controller, cardName: "Faith's Shield", targets: [{ type: "planeswalker", id }] });
/** The decision a person seat is asked next (learnSession's driver). */
const nextDecision = (state) => advanceUntilDecision({ status: "active", state, difficulty: "beginner", decisionLog: [] }).decision;
const candidateIds = (decision) => [...new Set((decision?.candidates || []).flatMap((c) => (c.targets || []).map((t) => t.id)))].sort();
/** The names a decision offers as targets (a card that entered has a new permanent id). */
const candidateNames = (decision) => [...new Set((decision?.candidates || []).flatMap((c) => (c.targets || []).map((t) => t.name)))].sort();
/** `pid` casts `name` and both seats pass once — the spell resolves; its enters trigger waits (a person is asked next). */
const castAndResolveSpell = (s, pid, name) => pass(pass(act(s, pid, "cast-spell", (a) => a.name === name)));
const onBattlefield = (s, pid, name) => s.players[pid].battlefield.some((p) => p.card?.name === name);

describe("(1) an attachment falls off when its host gains protection from it (CR 702.16c, 702.16d, 704.5m, 704.5n)", () => {
  it("⭐ the AI's Pacifism on the user's Grizzly Bears: Sword of War and Peace (protection from red and from white) equipped onto the Bears — the white Aura goes to its owner's graveyard", () => {
    const [gb, pac] = attach(P("gb", GRIZZLY_BEARS, "user"), P("pac", PACIFISM, "ai"));
    const s0 = duel({ user: [gb, P("sw", SWORD_OF_WAR_AND_PEACE, "user"), ...lands("up", PLAINS, 2, "user")], ai: [pac] });
    const done = equip(s0, "user", "sw", "gb");
    const row = { protection: prot(done, "gb"), pacifismOnBattlefield: alive(done, "pac"), aiGraveyard: graveyardNames(done, "ai"), bearsAttachments: perm(done, "gb").attachments };
    console.log(`  WITNESS sword-drops-pacifism ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["R", "W"], pacifismOnBattlefield: false, aiGraveyard: ["Pacifism"], bearsAttachments: ["sw"] });
  });

  it("⭐ a coloured Equipment: Maul of the Skyclaves (white) on the Bears becomes unattached when Sword of War and Peace is equipped — and stays on the battlefield", () => {
    const [gb, maul] = attach(P("gb", GRIZZLY_BEARS, "user"), P("maul", MAUL_OF_THE_SKYCLAVES, "user"));
    const s0 = duel({ user: [gb, maul, P("sw", SWORD_OF_WAR_AND_PEACE, "user"), ...lands("up", PLAINS, 2, "user")] });
    const done = equip(s0, "user", "sw", "gb");
    const row = { maulOnBattlefield: alive(done, "maul"), maulAttachedTo: perm(done, "maul")?.attachedTo ?? null, bearsAttachments: perm(done, "gb").attachments };
    console.log(`  WITNESS sword-unattaches-maul ${JSON.stringify(row)}`);
    expect(row).toEqual({ maulOnBattlefield: true, maulAttachedTo: null, bearsAttachments: ["sw"] });
  });

  it("⭐ colorless: Giver of Runes gives the Bears protection from colorless (the AI's board is colourless — the automatic pick) — Bonesplitter becomes unattached (CR 105.2c)", () => {
    const [gb, bs] = attach(P("gb", GRIZZLY_BEARS, "user"), P("bs", BONESPLITTER, "user"));
    const s0 = duel({ user: [P("gor", GIVER_OF_RUNES, "user"), gb, bs], ai: [P("orn", ORNITHOPTER, "ai")] });
    const done = resolveAll(act(s0, "user", "activate-ability", (a) => a.permanentId === "gor" && targetsIt("gb")(a)));
    const row = { protection: prot(done, "gb"), bonesplitterAttachedTo: perm(done, "bs")?.attachedTo ?? null, bonesplitterOnBattlefield: alive(done, "bs"), bearsAttachments: perm(done, "gb").attachments };
    console.log(`  WITNESS giver-colorless-unattaches-bonesplitter ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], bonesplitterAttachedTo: null, bonesplitterOnBattlefield: true, bearsAttachments: [] });
  });

  it("⭐ White Ward cast on the Bears wearing the AI's Pacifism: the Pacifism goes, and White Ward stays — \"This effect doesn't remove this Aura.\"", () => {
    const [gb, pac] = attach(P("gb", GRIZZLY_BEARS, "user"), P("pac", PACIFISM, "ai"));
    const s0 = duel({ user: [gb, ...lands("up", PLAINS, 1, "user")], ai: [pac], userHand: [C("h-ww", WHITE_WARD)] });
    const done = resolveAll(act(s0, "user", "cast-spell", (a) => a.name === "White Ward" && targetsIt("gb")(a)));
    const ward = done.players.user.battlefield.find((p) => p.card?.name === "White Ward");
    const row = { protection: prot(done, "gb"), pacifismOnBattlefield: alive(done, "pac"), aiGraveyard: graveyardNames(done, "ai"), wardAttachedTo: ward?.attachedTo ?? null };
    console.log(`  WITNESS white-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["W"], pacifismOnBattlefield: false, aiGraveyard: ["Pacifism"], wardAttachedTo: "gb" });
  });

  it("control: attachments of no protected quality stay — a green Blanchwood Armor and a colourless Bonesplitter beside Sword of War and Peace", () => {
    const [gb, armor, bs] = attach(P("gb", GRIZZLY_BEARS, "user"), P("arm", BLANCHWOOD_ARMOR, "user"), P("bs", BONESPLITTER, "user"));
    const s0 = duel({ user: [gb, armor, bs, P("sw", SWORD_OF_WAR_AND_PEACE, "user"), ...lands("up", PLAINS, 2, "user"), ...lands("uf", FOREST, 1, "user")] });
    const done = equip(s0, "user", "sw", "gb");
    const row = { armorAttachedTo: perm(done, "arm")?.attachedTo ?? null, bonesplitterAttachedTo: perm(done, "bs")?.attachedTo ?? null, bearsAttachments: [...perm(done, "gb").attachments].sort() };
    expect(row).toEqual({ armorAttachedTo: "gb", bonesplitterAttachedTo: "gb", bearsAttachments: ["arm", "bs", "sw"] });
  });

  it("control: only a host's OWN protection counts — Unholy Strength stays on Hunted Horror (its text gives TOKENS protection from black) and Ice Over stays on Sword of Fire and Ice (it gives the EQUIPPED creature protection from blue)", () => {
    const [hh, us] = attach(P("hh", HUNTED_HORROR, "user"), P("us", UNHOLY_STRENGTH, "user"));
    const [sofi, ice] = attach(P("sofi", SWORD_OF_FIRE_AND_ICE, "user"), P("ice", ICE_OVER, "ai"));
    const done = checkAllStateBasedActions(duel({ user: [hh, us, sofi], ai: [ice] }));
    expect({ unholyStrength: perm(done, "us")?.attachedTo ?? null, iceOver: perm(done, "ice")?.attachedTo ?? null }).toEqual({ unholyStrength: "hh", iceOver: "sofi" });
  });

  it("control: White Ward alone stays on its host — its own protection from white never removes it", () => {
    const s0 = duel({ user: [P("gb", GRIZZLY_BEARS, "user"), ...lands("up", PLAINS, 1, "user")], userHand: [C("h-ww", WHITE_WARD)] });
    const done = resolveAll(act(s0, "user", "cast-spell", (a) => a.name === "White Ward" && targetsIt("gb")(a)));
    const ward = done.players.user.battlefield.find((p) => p.card?.name === "White Ward");
    expect({ protection: prot(done, "gb"), wardAttachedTo: ward?.attachedTo ?? null, userGraveyard: graveyardNames(done, "user") }).toEqual({ protection: ["W"], wardAttachedTo: "gb", userGraveyard: [] });
  });
});

describe("(2) damage to a planeswalker respects protection (CR 702.16e, 120.3c)", () => {
  it("⭐ Storm's Wrath (red, 4 damage to each creature and each planeswalker): Chandra with protection from red keeps her 4 loyalty", () => {
    const s0 = duel({ active: "ai", user: [walker("pw", CHANDRA_TORCH, "user")], ai: lands("am", MOUNTAIN, 4, "ai"), aiHand: [C("h-sw", STORMS_WRATH)] });
    const shielded = grantProtection(s0, "pw", ["R"], "user");
    const done = resolveAll(act(shielded, "ai", "cast-spell", (a) => a.name === "Storm's Wrath"));
    const row = { protection: prot(shielded, "pw"), chandraOnBattlefield: alive(done, "pw"), loyalty: loyalty(done, "pw") };
    console.log(`  WITNESS storms-wrath-walker ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["R"], chandraOnBattlefield: true, loyalty: 4 });
  });

  it("⭐ End the Festivities (red, 1 damage to each opponent and each creature and planeswalker they control): protection from red keeps Chandra at 4; the player still takes 1", () => {
    const s0 = duel({ active: "ai", user: [walker("pw", CHANDRA_TORCH, "user")], ai: lands("am", MOUNTAIN, 1, "ai"), aiHand: [C("h-etf", END_THE_FESTIVITIES)] });
    const done = resolveAll(act(grantProtection(s0, "pw", ["R"], "user"), "ai", "cast-spell", (a) => a.name === "End the Festivities"));
    const row = { loyalty: loyalty(done, "pw"), userLife: done.players.user.life };
    console.log(`  WITNESS end-the-festivities-walker ${JSON.stringify(row)}`);
    expect(row).toEqual({ loyalty: 4, userLife: 19 });
  });

  it("⭐ combat: Raging Goblin (red) attacking Chandra with protection from red deals her no damage", () => {
    const s0 = duel({ active: "ai", user: [walker("pw", CHANDRA_TORCH, "user")], ai: [P("rg", RAGING_GOBLIN, "ai", { tapped: true, attackedThisTurn: true })] });
    const shielded = grantProtection(s0, "pw", ["R"], "user");
    const done = resolveCombatDamage({ ...shielded, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "rg", attackingPlayer: "ai", defender: "user", defenderPlaneswalkerId: "pw" }], blockers: [] } });
    const row = { loyalty: loyalty(done, "pw"), userLife: done.players.user.life };
    console.log(`  WITNESS goblin-attacks-walker ${JSON.stringify(row)}`);
    expect(row).toEqual({ loyalty: 4, userLife: 20 });
  });

  it("control: protection from a colour the source isn't (green) — Storm's Wrath kills Chandra; Raging Goblin takes 1 loyalty", () => {
    const s0 = duel({ active: "ai", user: [walker("pw", CHANDRA_TORCH, "user")], ai: [...lands("am", MOUNTAIN, 4, "ai"), P("rg", RAGING_GOBLIN, "ai", { tapped: true, attackedThisTurn: true })], aiHand: [C("h-sw", STORMS_WRATH)] });
    const green = grantProtection(s0, "pw", ["G"], "user");
    const hit = resolveCombatDamage({ ...green, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "rg", attackingPlayer: "ai", defender: "user", defenderPlaneswalkerId: "pw" }], blockers: [] } });
    const wrath = resolveAll(act(green, "ai", "cast-spell", (a) => a.name === "Storm's Wrath"));
    expect({ goblinHit: loyalty(hit, "pw"), wrathKills: !alive(wrath, "pw") }).toEqual({ goblinHit: 3, wrathKills: true });
  });
});

describe("(3) a triggered or loyalty ability is not OFFERED a permanent with protection from its source (CR 702.16b, 603.3d, 601.2c)", () => {
  it("⭐ the user's Flametongue Kavu enters: its trigger is not offered the AI's Silver Knight (protection from red)", () => {
    const s0 = duel({ humans: ["user"], user: lands("um", MOUNTAIN, 4, "user"), ai: [P("sk", SILVER_KNIGHT, "ai"), P("ab", GRIZZLY_BEARS, "ai")], userHand: [C("h-ftk", FLAMETONGUE_KAVU)] });
    const asked = nextDecision(castAndResolveSpell(s0, "user", "Flametongue Kavu"));
    const row = { asked: asked?.kind ?? null, offered: candidateNames(asked) };
    console.log(`  WITNESS ftk-offer ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: "trigger-target", offered: ["Flametongue Kavu", "Grizzly Bears"] });
  });

  it("⭐ the AI's Flametongue Kavu enters facing only the user's Silver Knight: the mandatory trigger must target the Kavu itself, and the Kavu dies (CR 603.3d)", () => {
    const s0 = duel({ active: "ai", user: [P("sk", SILVER_KNIGHT, "user")], ai: lands("am", MOUNTAIN, 4, "ai"), aiHand: [C("h-ftk", FLAMETONGUE_KAVU)] });
    const done = resolveAll(act(s0, "ai", "cast-spell", (a) => a.name === "Flametongue Kavu"));
    const row = { kavuOnBattlefield: onBattlefield(done, "ai", "Flametongue Kavu"), knightOnBattlefield: alive(done, "sk"), aiGraveyard: graveyardNames(done, "ai") };
    console.log(`  WITNESS ftk-forced-self ${JSON.stringify(row)}`);
    expect(row).toEqual({ kavuOnBattlefield: false, knightOnBattlefield: true, aiGraveyard: ["Flametongue Kavu"] });
  });

  it("⭐ a departed source by its last known colours: Perilous Myr (colourless) dies, and its trigger is not offered the AI's Bears with protection from colorless (Giver of Runes)", () => {
    const s0 = duel({ humans: ["user"], active: "ai", user: [P("myr", PERILOUS_MYR, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai"), ...lands("am", MOUNTAIN, 1, "ai")], aiHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const granted = resolveAll(act(s0, "ai", "activate-ability", (a) => a.permanentId === "gor" && targetsIt("gb")(a)));
    const died = pass(pass(act(granted, "ai", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("myr")(a))));
    const asked = nextDecision(died);
    const row = { protection: prot(granted, "gb"), myrGone: !alive(died, "myr"), asked: asked?.kind ?? null, offered: candidateIds(asked) };
    console.log(`  WITNESS myr-colourless-offer ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], myrGone: true, asked: "trigger-target", offered: ["ai", "gor", "user"] });
  });

  it("⭐ the loyalty offer: Chandra's −3 (\"Chandra deals 4 damage to target creature.\") is not offered the AI's Silver Knight", () => {
    const s0 = duel({ user: [walker("pw", CHANDRA_TORCH, "user")], ai: [P("sk", SILVER_KNIGHT, "ai"), P("ab", GRIZZLY_BEARS, "ai")] });
    const minus3 = offered(s0, "user", "activate-loyalty").filter((a) => a.costDelta === -3);
    const row = { offered: [...new Set(minus3.flatMap((a) => (a.targets || []).map((t) => t.id)))].sort() };
    console.log(`  WITNESS chandra-minus3-offer ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["ab"] });
  });

  it("control: protection from a colour the source isn't — White Knight (protection from black) is offered to Flametongue Kavu's trigger and Chandra's −3", () => {
    const s0 = duel({ humans: ["user"], user: [walker("pw", CHANDRA_TORCH, "user"), ...lands("um", MOUNTAIN, 4, "user")], ai: [P("wk", WHITE_KNIGHT, "ai")], userHand: [C("h-ftk", FLAMETONGUE_KAVU)] });
    const minus3 = offered(s0, "user", "activate-loyalty").filter((a) => a.costDelta === -3).flatMap((a) => (a.targets || []).map((t) => t.id));
    const asked = nextDecision(castAndResolveSpell(s0, "user", "Flametongue Kavu"));
    expect({ minus3, trigger: candidateNames(asked) }).toEqual({ minus3: ["wk"], trigger: ["Flametongue Kavu", "White Knight"] });
  });
});

describe("(4) \"Combat damage can't be prevented\" overrides protection, Maze of Ith and a shield counter in combat (CR 615.12)", () => {
  /** `atkId` (the user's) attacks the AI, blocked by `blockers` (the AI's), in the combat damage step. */
  const combat = (s, atkId, blockers = []) => ({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: atkId, attackingPlayer: "user", defender: "ai" }], blockers: blockers.map((b) => ({ blockerId: b, blockingPlayer: "ai", attackerId: atkId })) } });
  const baloth = () => P("fb", FRENZIED_BALOTH, "user", { tapped: true, attackedThisTurn: true });

  it("⭐ protection: Frenzied Baloth (3/2 trample) blocked by Spectral Lynx (protection from green) — its lethal share is dealt, the Lynx dies, 2 tramples over", () => {
    const s0 = duel({ user: [baloth()], ai: [P("lynx", SPECTRAL_LYNX, "ai")] });
    const done = resolveCombatDamage(combat(s0, "fb", ["lynx"]));
    const row = { lynxOnBattlefield: alive(done, "lynx"), aiLife: done.players.ai.life };
    console.log(`  WITNESS baloth-vs-protection ${JSON.stringify(row)}`);
    expect(row).toEqual({ lynxOnBattlefield: false, aiLife: 18 });
  });

  it("⭐ Maze of Ith on the attacking Baloth: its damage to the AI is dealt, and a blocker's damage to it too", () => {
    const s0 = { ...duel({ user: [baloth()], ai: [P("maze", MAZE_OF_ITH, "ai")] }), phase: "declare-blockers", step: "declare-blockers", priorityHolder: "ai", combat: { attackers: [{ permanentId: "fb", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const mazed = resolveAll(act(s0, "ai", "activate-ability", (a) => a.permanentId === "maze" && targetsIt("fb")(a)));
    const unblocked = resolveCombatDamage(combat(mazed, "fb"));
    const withBlocker = { ...mazed, players: { ...mazed.players, ai: { ...mazed.players.ai, battlefield: [...mazed.players.ai.battlefield, P("ab", GRIZZLY_BEARS, "ai")] } } };
    const blocked = resolveCombatDamage(combat(withBlocker, "fb", ["ab"]));
    const row = { balothUntapped: perm(mazed, "fb").tapped === false, aiLifeUnblocked: unblocked.players.ai.life, balothDiesToBlocker: !alive(blocked, "fb") };
    console.log(`  WITNESS baloth-vs-maze ${JSON.stringify(row)}`);
    expect(row).toEqual({ balothUntapped: true, aiLifeUnblocked: 17, balothDiesToBlocker: true });
  });

  it("⭐ a shield counter: a Spined Wurm with two shield counters blocking the Baloth is dealt its 3 — and one shield counter is still removed (the bundled shield-counter ruling)", () => {
    const s0 = duel({ user: [baloth()], ai: [P("sw", SPINED_WURM, "ai", { counters: { shield: 2 } })] });
    const done = resolveCombatDamage(combat(s0, "fb", ["sw"]));
    const row = { wurmDamage: perm(done, "sw")?.damageMarked ?? 0, shieldCounters: perm(done, "sw")?.counters?.shield ?? null };
    console.log(`  WITNESS baloth-vs-shield ${JSON.stringify(row)}`);
    expect(row).toEqual({ wurmDamage: 3, shieldCounters: 1 });
  });

  it("control: without Frenzied Baloth the same prevention holds — a green Grizzly Bears blocked by the Lynx deals it nothing, and the Maze keeps a Bears' damage off the AI", () => {
    const s0 = duel({ user: [P("ub", GRIZZLY_BEARS, "user", { tapped: true, attackedThisTurn: true })], ai: [P("lynx", SPECTRAL_LYNX, "ai"), P("maze", MAZE_OF_ITH, "ai")] });
    const vsLynx = resolveCombatDamage(combat(s0, "ub", ["lynx"]));
    const declare = { ...s0, phase: "declare-blockers", step: "declare-blockers", priorityHolder: "ai", combat: { attackers: [{ permanentId: "ub", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const mazed = resolveCombatDamage(combat(resolveAll(act(declare, "ai", "activate-ability", (a) => a.permanentId === "maze" && targetsIt("ub")(a))), "ub"));
    expect({ lynxDamage: perm(vsLynx, "lynx")?.damageMarked ?? 0, aiLifeMazed: mazed.players.ai.life }).toEqual({ lynxDamage: 0, aiLifeMazed: 20 });
  });
});
