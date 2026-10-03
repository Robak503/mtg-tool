/**
 * equipOfferParity.test.js — two free-Equip loops found in self-play (2026-10-03), and the commander color identity that
 * fed the first one.
 *
 * THE LOOP: the Equip offer (legalChoices) listed a target the attach resolver (resolvers.ATTACH) then refused, so the
 * activation was paid for and did nothing. With Puresteel Paladin's "equip {0}" the cost is nothing, the AI's equip pick
 * (opponentAI.pickEquipAction — "move it to the best body") repeats until its Equipment sits on that body, and the turn
 * never ends. Two refusals were not mirrored in the offer:
 *   · CR 702.16b — a creature with protection from the Equipment's color can't be targeted by its Equip ability. The
 *     resolver re-checks with the source's colors (CR 608.2b); the offer passed none.
 *   · CR 301.5c — an Equipment that is also a creature can't equip a creature unless it has reconfigure. Halvar, God of
 *     Battle carries its Equipment face's "Equip {1}{W}" on a creature permanent.
 *
 * THE IDENTITY: Commander's Plate's "protection from each color that's not in your commander's color identity" reads the
 * identity stamped on the seat at game start (commanderIdentity.js, CR 903.4a). The deck enrichment
 * (server/learnDeckEnrich.js) did not carry `colorIdentity`, so in every real game the stamp was [] — "colorless" — and the
 * Plate protected from all five colors, the commander's own included. A commander card that states no identity is now
 * UNKNOWN (null: the quality does nothing, CR 903.4f), and the enrichment carries the field.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-03). The offers come from
 * legalActionsForPlayer, dispatchAction applies them and resolveTopOfStack resolves the stack; the AI cases run the AI's own
 * pickAction. The enrichment is exercised through its injected lookup (the fixtures stand in for the index).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { permanentProtectionColors } from "./layers.js";
import { commanderColorIdentityOf, knownColorIdentityOfCards } from "./commanderIdentity.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";
import { enrichDeck, enrichDeckCard, mergeCardData } from "../server/learnDeckEnrich.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const CAP = {"name":"Captain America, First Avenger","type":"Legendary Creature — Human Soldier Hero","mana":"{R}{W}{U}","cmc":3,"power":"4","toughness":"4","keywords":["Throw ...","... Catch"],"colors":["R","U","W"],"colorIdentity":["R","U","W"],"oracle":"Throw ... — {3}, Unattach an Equipment from Captain America: He deals damage equal to that Equipment's mana value divided as you choose among one, two, or three targets.\n... Catch — At the beginning of combat on your turn, attach up to one target Equipment you control to Captain America."};
const PLATE = {"name":"Commander's Plate","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +3/+3 and has protection from each color that's not in your commander's color identity.\nEquip commander {3}\nEquip {5}"};
const BLADES = {"name":"Lizard Blades","type":"Artifact Creature — Equipment Lizard","mana":"{1}{R}","cmc":2,"power":"1","toughness":"1","keywords":["Double strike","Reconfigure"],"colors":["R"],"colorIdentity":["R"],"oracle":"Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)"};
const FIRE_ICE = {"name":"Sword of Fire and Ice","type":"Artifact — Equipment","mana":"{3}","cmc":3,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+2 and has protection from red and from blue.\nWhenever equipped creature deals combat damage to a player, this Equipment deals 2 damage to any target and you draw a card.\nEquip {2}"};
const HALVAR = {"name":"Halvar, God of Battle // Sword of the Realms","type":"Legendary Creature — God // Legendary Artifact — Equipment","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","layout":"modal_dfc","keywords":["Equip"],"colors":[],"colorIdentity":["W"],"oracle":"Halvar, God of Battle - Legendary Creature — God {2}{W}{W}\nCreatures you control that are enchanted or equipped have double strike.\nAt the beginning of each combat, you may attach target Aura or Equipment attached to a creature you control to target creature you control.\n//\nSword of the Realms - Legendary Artifact — Equipment {1}{W}\nEquipped creature gets +2/+0 and has vigilance.\nWhenever equipped creature dies, return it to its owner's hand.\nEquip {1}{W}"};
const PALADIN = {"name":"Puresteel Paladin","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Metalcraft"],"colors":["W"],"colorIdentity":["W"],"oracle":"Whenever an Equipment you control enters, you may draw a card.\nMetalcraft — Equipment you control have equip {0} as long as you control three or more artifacts."};
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"};
const KARN = {"name":"Karn, Silver Golem","type":"Legendary Artifact Creature — Golem","mana":"{5}","cmc":5,"power":"4","toughness":"4","keywords":[],"colors":[],"colorIdentity":[],"oracle":"Whenever Karn blocks or becomes blocked, it gets -4/+4 until end of turn.\n{1}: Target noncreature artifact becomes an artifact creature with power and toughness each equal to its mana value until end of turn."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":""};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const FULL = { W: 6, U: 6, B: 6, R: 6, G: 6, C: 6 };
const LIB = (pid) => [1, 2, 3, 4].map((i) => ({ id: `${pid}-lib${i}`, ...BEARS }));

/** A two-seat game in `active`'s precombat main phase, the stack empty, both mana pools full. `commanders` seeds the user's. */
function board({ user = [], ai = [], commanders = [], active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [], userCommanders: commanders });
  return { ...s, turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, battlefield: ai, manaPool: { ...s.players.ai.manaPool, ...FULL }, library: LIB("ai") } } };
}
const findPerm = (s, id) => Object.values(s.players).flatMap((pl) => pl.battlefield).find((p) => p.id === id);
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const equipOffers = (s, pid, equipId) => legalActionsForPlayer({ ...s, priorityHolder: pid }, pid).filter((a) => a.kind === "activate-ability" && a.permanentId === equipId && a.isEquipAbility);
const equipTargets = (s, pid, equipId) => [...new Set(equipOffers(s, pid, equipId).map((a) => a.targets[0].id))].sort();
const protection = (s, id) => [...permanentProtectionColors(s, id)].sort();
const lastKind = (s) => s.log.at(-1)?.kind;

/** The index stand-in: the fixtures by name, in cardIndex.publicCard's shape. */
const INDEX = new Map([CAP, PLATE, BLADES, KARN, BEARS].map((c) => [c.name, c]));
const lookup = (name) => INDEX.get(name) || null;

// ─── the deck enrichment carries the color identity ──────────────────────────────────────────────────────────────────

describe("learnDeckEnrich — the color identity reaches the engine", () => {
  it("a bare { id, name } commander (the deck store's shape) is filled with the index's color identity", () => {
    const [cmd] = enrichDeck([{ id: "cmd-1", name: CAP.name }], lookup);
    expect(cmd.colorIdentity).toEqual(["R", "U", "W"]);
    expect(cmd).toMatchObject({ id: "cmd-1", name: CAP.name, type: CAP.type, mana: CAP.mana });
  });

  it("an already-shaped card without the field is backfilled, and nothing else on it is overwritten", () => {
    const saved = { id: "s1", name: CAP.name, type: "Legendary Creature — Saved", mana: "{9}", oracle: "saved text", layout: "normal" };
    expect(enrichDeckCard(saved, lookup)).toEqual({ ...saved, colorIdentity: ["R", "U", "W"] });
    // The card's own layout stays even when the index states another.
    expect(enrichDeckCard(saved, (name) => ({ ...lookup(name), layout: "modal_dfc" }))).toEqual({ ...saved, colorIdentity: ["R", "U", "W"] });
  });

  it("an already-shaped card missing BOTH layout and identity gets both", () => {
    const saved = { id: "s2", name: CAP.name, type: CAP.type, mana: CAP.mana, oracle: CAP.oracle };
    const full = (name) => ({ ...lookup(name), layout: "normal" });
    expect(enrichDeckCard(saved, full)).toEqual({ ...saved, layout: "normal", colorIdentity: ["R", "U", "W"] });
  });

  it("a card's own color identity wins over the index's, shaped or bare", () => {
    const own = { id: "s3", name: CAP.name, type: CAP.type, layout: "normal", colorIdentity: ["G"] };
    expect(enrichDeckCard(own, lookup)).toBe(own); // complete already: returned as it is
    expect(enrichDeckCard({ id: "s4", name: CAP.name, colorIdentity: ["G"] }, lookup).colorIdentity).toEqual(["G"]);
    expect(mergeCardData({ id: "s5", name: CAP.name, colorIdentity: [] }, CAP).colorIdentity).toEqual([]); // a stated colorless identity is kept
  });

  it("an index entry that states no identity adds NO field — unknown is never written as colorless", () => {
    const { colorIdentity: _dropped, ...noIdentity } = CAP;
    expect("colorIdentity" in mergeCardData({ id: "b1", name: CAP.name }, noIdentity)).toBe(false);
    const saved = { id: "s6", name: CAP.name, type: CAP.type, layout: "normal" };
    expect(enrichDeckCard(saved, () => noIdentity)).toBe(saved);
  });

  it("an already-shaped card with its identity still gets a missing layout (the V1 backfill is kept)", () => {
    const saved = { id: "s7", name: CAP.name, type: CAP.type, colorIdentity: ["R", "U", "W"] };
    expect(enrichDeckCard(saved, (name) => ({ ...lookup(name), layout: "normal" }))).toEqual({ ...saved, layout: "normal" });
  });

  it("an unknown name is left exactly as it is", () => {
    const saved = { id: "s8", name: "No Such Card", type: "Creature" };
    expect(enrichDeckCard(saved, lookup)).toBe(saved);
    expect(enrichDeckCard({ id: "b2", name: "No Such Card" }, lookup)).toEqual({ id: "b2", name: "No Such Card" });
  });
});

// ─── the stamp: a stated identity, or unknown ────────────────────────────────────────────────────────────────────────

describe("commanderIdentity — a commander card with no identity field is unknown, not colorless", () => {
  const stampOf = (commanders) => createGameState({ userDeck: [], aiDeck: [], userCommanders: commanders }).players.user.commanderIdentity;

  it("the enriched commander stamps its identity, in WUBRG order", () => {
    expect(stampOf(enrichDeck([{ id: "cmd-1", name: CAP.name }], lookup))).toEqual(["W", "U", "R"]);
  });

  it("a commander with no identity field stamps null; a colorless commander stamps []; no commander stamps null", () => {
    const { colorIdentity: _dropped, ...noIdentity } = CAP;
    expect(stampOf([{ id: "cmd-1", ...noIdentity }])).toBeNull();
    expect(stampOf([{ id: "cmd-1", ...KARN }])).toEqual([]);
    expect(stampOf([])).toBeNull();
  });

  it("partners: the union when both state an identity, unknown when either does not", () => {
    const { colorIdentity: _dropped, ...noIdentity } = BEARS;
    expect(stampOf([{ id: "a", ...CAP }, { id: "b", ...BEARS }])).toEqual(["W", "U", "R", "G"]);
    expect(stampOf([{ id: "a", ...CAP }, { id: "b", ...noIdentity }])).toBeNull();
    expect(knownColorIdentityOfCards([{ id: "a", color_identity: ["B"] }, { id: "b", colorIdentity: ["W"] }])).toEqual(["W", "B"]); // the raw Scryfall field reads too
    expect(knownColorIdentityOfCards([null, undefined])).toBeNull();
  });

  it("the read: the stamp answers once the zone is empty; a zone card with no field never turns unknown into colorless", () => {
    const stamped = { players: { user: { commanderIdentity: ["W"], command: [] } } };
    expect(commanderColorIdentityOf(stamped, "user")).toEqual(["W"]);
    const zoneUnknown = { players: { user: { commanderIdentity: null, command: [{ id: "c", name: "Unshaped" }] } } };
    expect(commanderColorIdentityOf(zoneUnknown, "user")).toBeNull();
    const stampedPlusUnknownZone = { players: { user: { commanderIdentity: ["W"], command: [{ id: "c", name: "Unshaped" }] } } };
    expect(commanderColorIdentityOf(stampedPlusUnknownZone, "user")).toEqual(["W"]);
    const zoneOnly = { players: { user: { command: [{ id: "c", name: "Zone", colorIdentity: ["G", "U"] }] } } };
    expect(commanderColorIdentityOf(zoneOnly, "user")).toEqual(["U", "G"]);
  });
});

// ─── Commander's Plate on a commander that came through the real deck path ───────────────────────────────────────────

describe("Commander's Plate — the protection a real game computes", () => {
  /** Captain America cast from the command zone (the zone is empty), wearing the Plate; Lizard Blades unattached beside him. */
  function plateBoard(commanderCards) {
    const s0 = board({ commanders: commanderCards });
    const cmd = s0.players.user.command[0];
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, command: [],
      battlefield: [P("cap", cmd, "user"), P("plate", PLATE, "user"), P("blades", BLADES, "user")] } } };
    return attachPermanent(s1, { equipId: "plate", targetId: "cap" });
  }

  it("a red-white-blue commander gets protection from black and green only, and red Lizard Blades may be attached to him", () => {
    const s = plateBoard(enrichDeck([{ id: "cmd-1", name: CAP.name }], lookup));
    expect(protection(s, "cap")).toEqual(["B", "G"]);
    expect(equipTargets(s, "user", "blades")).toEqual(["cap"]);
    const after = resolveAll(dispatchAction(s, equipOffers(s, "user", "blades")[0]));
    expect(lastKind(after)).toBe("attach");
    expect(findPerm(after, "blades").attachedTo).toBe("cap");
  });

  it("an unknown identity grants NO protection (CR 903.4f); the +3/+3 still applies", () => {
    const { colorIdentity: _dropped, ...noIdentity } = CAP;
    const s = plateBoard([{ id: "cmd-1", ...noIdentity }]);
    expect(protection(s, "cap")).toEqual([]);
    const cap = findPerm(s, "cap");
    expect(`${creaturePower(cap, s)}/${creatureToughness(cap, s)}`).toBe("7/7");
  });

  it("a colorless commander still gets protection from all five colors, and the red Equipment is not offered onto it", () => {
    const s0 = board({ commanders: [{ id: "cmd-1", ...KARN }] });
    const s1 = { ...s0, players: { ...s0.players, user: { ...s0.players.user, command: [],
      battlefield: [P("karn", s0.players.user.command[0], "user"), P("plate", PLATE, "user"), P("blades", BLADES, "user")] } } };
    const s = attachPermanent(s1, { equipId: "plate", targetId: "karn" });
    expect(protection(s, "karn")).toEqual(["B", "G", "R", "U", "W"]);
    expect(equipTargets(s, "user", "blades")).toEqual([]);
  });
});

// ─── the Equip offer mirrors the attach resolver ─────────────────────────────────────────────────────────────────────

describe("Equip offer — a target the resolver refuses is not offered (CR 702.16b)", () => {
  /** Isamaru wears Sword of Fire and Ice (protection from red and from blue); Hill Giant is bare. */
  function swordBoard(extra = []) {
    const s = board({ user: [P("dog", ISAMARU, "user"), P("giant", GIANT, "user"), P("sword", FIRE_ICE, "user"), P("blades", BLADES, "user"), P("bone", BONESPLITTER, "user"), ...extra] });
    return attachPermanent(s, { equipId: "sword", targetId: "dog" });
  }

  it("the red Equipment is offered onto the unprotected creature only; a colorless Equipment is offered onto both", () => {
    const s = swordBoard();
    expect(protection(s, "dog")).toEqual(["R", "U"]);
    expect(equipTargets(s, "user", "blades")).toEqual(["giant"]);
    expect(equipTargets(s, "user", "bone")).toEqual(["blades", "dog", "giant"]); // unattached Lizard Blades is a creature
  });

  it("every Equip the offer lists attaches when it resolves", () => {
    const s = swordBoard();
    const offers = ["blades", "bone", "sword"].flatMap((id) => equipOffers(s, "user", id));
    expect(offers.length).toBeGreaterThanOrEqual(5);
    for (const action of offers) {
      const after = resolveAll(dispatchAction(s, action));
      expect(`${action.name} → ${action.targets[0].id}: ${lastKind(after)}`).toBe(`${action.name} → ${action.targets[0].id}: attach`);
      expect(findPerm(after, action.permanentId).attachedTo).toBe(action.targets[0].id);
    }
  });
});

describe("a creature Equipment without reconfigure (CR 301.5c): the Equip is legal, does nothing, and the AI does not take it", () => {
  const halvarBoard = (controller = "user") => {
    const mine = [P("halvar", HALVAR, controller), P("bears", BEARS, controller), P("bone", BONESPLITTER, controller), P("blades", BLADES, controller)];
    return board({ [controller]: mine, active: controller });
  };

  it("Halvar, God of Battle (a creature carrying its Equipment face's Equip): the activation is refused at resolution (CR 701.3b)", () => {
    const s = halvarBoard();
    expect(equipTargets(s, "user", "halvar")).toEqual(["bears", "blades"]); // activating is legal; attachLegality.test.js pins the same for a crewed Rover Blades
    const after = resolveAll(dispatchAction(s, equipOffers(s, "user", "halvar")[0]));
    expect(after.log.at(-1)).toMatchObject({ kind: "attach-refused", rule: "CR 301.5c" });
    expect(findPerm(after, "halvar").attachedTo ?? null).toBeNull();
  });

  it("the AI's own pick never takes Halvar's Equip, and still equips the ordinary Equipment", () => {
    const s = halvarBoard("ai");
    const legal = legalActionsForPlayer(s, "ai");
    expect(legal.some((a) => a.isEquipAbility && a.permanentId === "halvar")).toBe(true);
    const pick = pickAction(s, "ai", legal);
    expect({ kind: pick.kind, source: pick.permanentId, equip: pick.isEquipAbility }).toEqual({ kind: "activate-ability", source: "blades", equip: true });
    // With only Halvar's Equip left to take, the AI takes no Equip at all.
    const onlyHalvar = legal.filter((a) => !a.isEquipAbility || a.permanentId === "halvar");
    expect(pickAction(s, "ai", onlyHalvar)?.isEquipAbility ?? false).toBe(false);
    // Halvar FIRST in the pick's id order: it is skipped, and the Equipment after it is still taken.
    const first = board({ active: "ai", ai: [P("a-halvar", HALVAR, "ai"), P("bears", BEARS, "ai"), P("bone", BONESPLITTER, "ai")] });
    const firstPick = pickAction(first, "ai", legalActionsForPlayer(first, "ai"));
    expect({ source: firstPick.permanentId, equip: firstPick.isEquipAbility }).toEqual({ source: "bone", equip: true });
  });

  it("an ordinary Equipment is still offered onto Halvar, and Lizard Blades — a creature WITH reconfigure — still offers its attach", () => {
    const s = halvarBoard();
    expect(equipTargets(s, "user", "bone")).toEqual(["bears", "blades", "halvar"]);
    expect(equipTargets(s, "user", "blades")).toEqual(["bears", "halvar"]);
    const after = resolveAll(dispatchAction(s, equipOffers(s, "user", "blades").find((a) => a.targets[0].id === "halvar")));
    expect(lastKind(after)).toBe("attach");
  });
});

// ─── the loop itself: the AI under Puresteel Paladin's free Equip ────────────────────────────────────────────────────

describe("the AI with a free Equip (Puresteel Paladin) stops", () => {
  /** Run the AI's own picks until it passes priority on an empty stack; the count of actions it took, or null if it never stopped. */
  function actionsUntilPass(s0, limit = 40) {
    let s = s0;
    for (let n = 0; n < limit; n++) {
      const legal = legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai");
      const pick = pickAction({ ...s, priorityHolder: "ai" }, "ai", legal);
      if (!pick || pick.kind === "pass-priority") return n;
      s = resolveAll(dispatchAction({ ...s, priorityHolder: "ai" }, pick));
    }
    return null;
  }

  it("metalcraft is on: the Equip offers cost nothing", () => {
    const s = board({ active: "ai", ai: [P("paladin", PALADIN, "ai"), P("giant", GIANT, "ai"), P("bone", BONESPLITTER, "ai"), P("sword", FIRE_ICE, "ai"), P("plate", PLATE, "ai")] });
    expect(equipOffers(s, "ai", "bone").map((a) => a.cmc)).toEqual([0, 0]);
  });

  it("Halvar beside the Paladin: the AI equips what it can and passes", () => {
    const s = board({ active: "ai", ai: [P("paladin", PALADIN, "ai"), P("halvar", HALVAR, "ai"), P("bears", BEARS, "ai"), P("bone", BONESPLITTER, "ai"), P("sword", FIRE_ICE, "ai"), P("plate", PLATE, "ai")] });
    expect(actionsUntilPass(s)).not.toBeNull();
  });

  it("a red Equipment beside a creature with protection from red: the AI equips what it can and passes", () => {
    const s0 = board({ active: "ai", ai: [P("paladin", PALADIN, "ai"), P("dog", ISAMARU, "ai"), P("sword", FIRE_ICE, "ai"), P("blades", BLADES, "ai"), P("bone", BONESPLITTER, "ai"), P("plate", PLATE, "ai")] });
    // The Sword makes the Dog the biggest body (4/4) — the one the AI's equip pick aims every Equipment at.
    const s = attachPermanent(s0, { equipId: "sword", targetId: "dog" });
    expect(actionsUntilPass(s)).not.toBeNull();
    expect(equipTargets(s, "ai", "blades")).toEqual(["paladin"]);
  });
});
