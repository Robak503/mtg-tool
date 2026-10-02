/**
 * backgroundCommanderGrant.test.js — the COMMANDER-qualified group selector (BLITZ BG-1: Bastion
 * Protector / Bloodsworn Steward / the Background cycle's "Commander creatures you own have …").
 * "Commander" is a game-STATE quality (card.isCommander, stamped at seat build), not a type-line
 * word — the selector carries commanderOnly and matchesSelector gates on the flag. "You own" and
 * "you control" are different scopes since native theft shipped (ownerScope vs controllerScope —
 * pinned in backgroundOwnerScope.test.js); every board here keeps owner = controller.
 *
 * BLITZ BG-2 extends the pins to the GRANT-carrying Backgrounds ("Commander creatures you own have
 * "<quoted body>""): the six whose body the group validators model (Clan Crafter / Sword Coast
 * Sailor / Guild Artisan / Feywild Visitor / Flaming Fist / Candlekeep Sage) classify native-static
 * AND their granted bodies genuinely enumerate/fire ON the commander at runtime — including the
 * LEAVE half of Candlekeep's "enters or leaves" (the DYNAMIC dead-look-back in
 * grantedTriggeredQuotedFor, CR 603.6c/603.10a) and the quote-mask fix that stopped the GRANTER
 * itself phantom-drawing on its own leave (splitCompoundTriggerSentences rewrote disjunctions
 * INSIDE quoted grants).
 *
 * CREED FPs guarded here: a non-commander creature must NEVER take the buff or the granted body;
 * the selector must not fabricate a "Commander" subtype; interiors the grant validators can't model
 * keep their whole card body-only (Inspiring Leader's quoted static, Scion of Halaster's
 * replacement, Master Chef's twin quoted statics, Street Urchin's compound sac cost); the granter
 * never fires the quoted body as its own trigger; the grant lifts with the carrier.
 *
 * Real oracle fixtures (exact bundled Scryfall text, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests, creaturePower } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { permanentHasKeyword } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { detectTriggers, checkAttackTriggers, checkLeavesTriggers, checkBatchCombatDamageTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const BASTION = { id: "bp", name: "Bastion Protector", type: "Creature — Human Soldier", mana: "{2}{W}",
  power: "3", toughness: "3",
  oracle: "Commander creatures you control get +2/+2 and have indestructible." };
const BLOODSWORN = { id: "bs", name: "Bloodsworn Steward", type: "Creature — Vampire Knight", mana: "{2}{B}{B}",
  power: "4", toughness: "4",
  oracle: "Flying\nCommander creatures you control get +2/+2 and have haste." };
const INSPIRING_LEADER = { id: "il", name: "Inspiring Leader", type: "Legendary Enchantment — Background", mana: "{1}{W}",
  oracle: "Commander creatures you own have \"Creature tokens you control get +2/+2.\"" };
const SCION_OF_HALASTER = { id: "sh", name: "Scion of Halaster", type: "Legendary Enchantment — Background", mana: "{1}{B}",
  oracle: "Commander creatures you own have \"The first time you would draw a card each turn, instead look at the top two cards of your library. Put one of them into your graveyard and the rest back on top of your library. Then draw a card.\"" };

describe("classify — the anthem carriers flip; unmodelable interiors hold the card back", () => {
  it("Bastion Protector + Bloodsworn Steward → native-static", () => {
    expect(classifyCard(BASTION)).toBe("native-static");
    expect(classifyCard(BLOODSWORN)).toBe("native-static");
  });
  it("CREED — a Background whose quoted interior is a STATIC anthem (not a modeled grant kind) stays body-only", () => {
    expect(classifyCard(INSPIRING_LEADER)).toBe("body-only");
  });
  it("CREED — a Background granting a REPLACEMENT effect stays body-only", () => {
    expect(classifyCard(SCION_OF_HALASTER)).toBe("body-only");
  });
});

describe("runtime — the buff reaches exactly the controller's commander creatures", () => {
  function board() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const protector = createPermanent({ id: "prot", card: BASTION, controller: "user", summoningSick: false });
    const myCommander = createPermanent({
      id: "cmdr",
      card: { id: "kc", name: "Kestia, the Cultivator", type: "Legendary Creature — Nymph", power: "4", toughness: "4", oracle: "", isCommander: true },
      controller: "user", summoningSick: false,
    });
    const myBear = createPermanent({
      id: "bear",
      card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" },
      controller: "user", summoningSick: false,
    });
    const theirCommander = createPermanent({
      id: "oppc",
      card: { id: "oc", name: "Opposing Commander", type: "Legendary Creature — Giant", power: "5", toughness: "5", oracle: "", isCommander: true },
      controller: "ai1", summoningSick: false,
    });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [protector, myCommander, myBear] },
        ai1: { ...s.players.ai1, battlefield: [theirCommander] },
      },
    };
  }

  it("own commander gets +2/+2 and indestructible; own non-commander and the OPPONENT's commander do not", () => {
    const s = board();
    const perm = (id) => {
      for (const p of Object.values(s.players)) {
        const found = (p.battlefield || []).find((x) => x.id === id);
        if (found) return found;
      }
      return null;
    };
    expect(creaturePower(perm("cmdr"), s)).toBe(6);   // 4 + 2
    expect(permanentHasKeyword(s, "cmdr", "indestructible")).toBe(true);
    expect(creaturePower(perm("bear"), s)).toBe(2);   // not a commander — no buff
    expect(permanentHasKeyword(s, "bear", "indestructible")).toBe(false);
    expect(creaturePower(perm("oppc"), s)).toBe(5);   // an opponent's commander — out of scope ("you")
    expect(permanentHasKeyword(s, "oppc", "indestructible")).toBe(false);
  });
});

// ─── BLITZ BG-2 — the GRANT-carrying Backgrounds ("Commander creatures you own have "<body>"") ────────

const BG = (id, name, oracle) => ({ id, name, type: "Legendary Enchantment — Background", oracle });
const CLAN_CRAFTER = BG("cc", "Clan Crafter",
  "Commander creatures you own have \"{2}, Sacrifice an artifact: Put a +1/+1 counter on this creature and draw a card.\"");
const SWORD_COAST_SAILOR = BG("scs", "Sword Coast Sailor",
  "Commander creatures you own have \"Whenever this creature attacks a player, if no opponent has more life than that player, this creature can't be blocked this turn.\"");
const GUILD_ARTISAN = BG("ga", "Guild Artisan",
  "Commander creatures you own have \"Whenever this creature attacks a player, if no opponent has more life than that player, you create two Treasure tokens.\" (They're artifacts with \"{T}, Sacrifice this token: Add one mana of any color.\")");
const FEYWILD_VISITOR = BG("fv", "Feywild Visitor",
  "Commander creatures you own have \"Whenever one or more nontoken creatures you control deal combat damage to a player, you create a 1/1 blue Faerie Dragon creature token with flying.\"");
const FLAMING_FIST = BG("ff", "Flaming Fist",
  "Commander creatures you own have \"Whenever this creature attacks, it gains double strike until end of turn.\"");
const CANDLEKEEP_SAGE = BG("cks", "Candlekeep Sage",
  "Commander creatures you own have \"When this creature enters or leaves the battlefield, draw a card.\"");
const MASTER_CHEF = BG("mc", "Master Chef",
  "Commander creatures you own have \"This creature enters with an additional +1/+1 counter on it\" and \"Other creatures you control enter with an additional +1/+1 counter on them.\"");
const STREET_URCHIN = BG("su", "Street Urchin",
  "Commander creatures you own have \"{1}, Sacrifice another creature or an artifact: This creature deals 1 damage to any target.\"");

const CMDR_CARD = { id: "kc", name: "My Commander", type: "Legendary Creature — Dwarf", power: "3", toughness: "3", oracle: "", isCommander: true };
const BEAR_CARD = { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };

// Commander-mode board at the universal activation window; `library` feeds the draw payoffs.
function bgBoard(userBf, { library = [{ id: "lib-1", name: "Top Card" }] } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return {
    ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, library, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 9 } } },
  };
}
const perm = (id, card, over = {}) => Object.assign(createPermanent({ id, card, controller: "user", summoningSick: false }), { enteredOnTurn: 1, ...over });

describe("BG-2 classify — the six modeled-body carriers flip; unmodeled bodies hold the card back", () => {
  it("the six validator-passing carriers → native-static", () => {
    for (const c of [CLAN_CRAFTER, SWORD_COAST_SAILOR, GUILD_ARTISAN, FEYWILD_VISITOR, FLAMING_FIST, CANDLEKEEP_SAGE]) {
      expect(classifyCard(c), c.name).toBe("native-static");
    }
  });
  it("CREED — twin quoted statics (Master Chef) and a compound sac cost (Street Urchin) stay body-only", () => {
    expect(classifyCard(MASTER_CHEF)).toBe("body-only");
    expect(classifyCard(STREET_URCHIN)).toBe("body-only");
  });
  it("CREED — the granter's own card detects NO trigger (the quoted body is the recipient's, not the Sage's)", () => {
    // Regression pin for the quote-mask: splitCompoundTriggerSentences used to rewrite the "enters or
    // leaves" disjunction INSIDE the quoted grant, promoting the tail to a phantom leavesSelf on the
    // GRANTER — Candlekeep Sage drew a card when IT left the battlefield.
    expect(detectTriggers(CANDLEKEEP_SAGE)).toEqual([]);
  });
});

describe("BG-2 runtime — granted ACTIVATED (Clan Crafter) enumerates and resolves on the commander only", () => {
  it("the commander is offered the sac ability, the non-commander is not, and dispatch resolves it", () => {
    const spareArt = perm("art", { id: "sa", name: "Spare Rig", type: "Artifact", oracle: "" });
    const s = bgBoard([perm("bg", CLAN_CRAFTER), perm("cmdr", CMDR_CARD), perm("bear", BEAR_CARD), spareArt]);
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(offers).toHaveLength(1);
    expect(offers[0].permanentId).toBe("cmdr");
    const after = resolveTopOfStack(dispatchAction(s, offers[0])); // the ability resolves off the stack (CR 602.2)
    expect(after.players.user.battlefield.find((p) => p.id === "cmdr").counters["+1/+1"]).toBe(1);
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["lib-1"]);          // drew off the sac
    expect(after.players.user.battlefield.some((p) => p.id === "art")).toBe(false); // the artifact was sacrificed
  });
  it("the grant lifts with the carrier (a live selector, not a stored flag)", () => {
    const s = bgBoard([perm("cmdr", CMDR_CARD), perm("bear", BEAR_CARD), perm("art", { id: "sa", name: "Spare Rig", type: "Artifact", oracle: "" })]);
    expect(legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability")).toEqual([]);
  });
});

describe("BG-2 runtime — granted TRIGGERED bodies fire on the commander's events only", () => {
  const attackWith = (bf, attackerId) => ({ ...bgBoard(bf), phase: "combat", step: "declare-attackers",
    combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai1" }] } });

  it("Flaming Fist — the attacking commander gains double strike until end of turn; a bear attacker fires nothing", () => {
    const fired = checkAttackTriggers(attackWith([perm("bg", FLAMING_FIST), perm("cmdr", CMDR_CARD), perm("bear", BEAR_CARD)], "cmdr"));
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentHasKeyword(resolved, "cmdr", "Double strike")).toBe(true);
    const bearAttack = checkAttackTriggers(attackWith([perm("bg", FLAMING_FIST), perm("cmdr", CMDR_CARD), perm("bear", BEAR_CARD)], "bear"));
    expect((bearAttack.pendingTriggers || []).length).toBe(0);
  });

  it("Sword Coast Sailor — the intervening-if holds at flush (CR 603.4): equal life fires, a richer bystander suppresses", () => {
    const fired = checkAttackTriggers(attackWith([perm("bg", SWORD_COAST_SAILOR), perm("cmdr", CMDR_CARD)], "cmdr"));
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentHasKeyword(resolved, "cmdr", "unblockable")).toBe(true);
    let rich = attackWith([perm("bg", SWORD_COAST_SAILOR), perm("cmdr", CMDR_CARD)], "cmdr");
    rich = { ...rich, players: { ...rich.players, ai2: { ...rich.players.ai2, life: 99 } } };
    expect(flushTriggers(checkAttackTriggers(rich)).stack).toHaveLength(0); // dropped at flush — never resolves
  });

  it("Guild Artisan — two Treasures on the qualifying attack; Feywild Visitor — a 1/1 flying Faerie Dragon on the nontoken connect", () => {
    const fired = checkAttackTriggers(attackWith([perm("bg", GUILD_ARTISAN), perm("cmdr", CMDR_CARD)], "cmdr"));
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(resolved.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.type || ""))).toHaveLength(2);
    let s = bgBoard([perm("bg", FEYWILD_VISITOR), perm("cmdr", CMDR_CARD)]);
    s = checkBatchCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "cmdr", attackingPlayer: "user", defender: "ai1", amount: 3 }]);
    const done = resolveTopOfStack(flushTriggers(s));
    const toks = done.players.user.battlefield.filter((p) => p.card?.token);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Faerie Dragon");
    expect(String(toks[0].card.power)).toBe("1");
  });

  it("Candlekeep Sage — BOTH halves of 'enters or leaves' fire on the commander (CR 603.6c look-back on the leave)", () => {
    // ETB half: the commander entering draws.
    const entered = enterPermanent(bgBoard([perm("bg", CANDLEKEEP_SAGE)]), { ...CMDR_CARD }, "user");
    expect((entered.pendingTriggers || []).length).toBe(1);
    expect(resolveTopOfStack(flushTriggers(entered)).players.user.hand.map((c) => c.id)).toEqual(["lib-1"]);
    // LEAVE half: the commander dying draws — the DYNAMIC dead-look-back (the permanent is off the
    // battlefield when checkLeavesTriggers runs; the grant is matched against its look-back).
    let s = bgBoard([perm("bg", CANDLEKEEP_SAGE), perm("cmdr", CMDR_CARD)]);
    s = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "cmdr" }));
    expect((s.pendingTriggers || []).length).toBe(1);
    expect(resolveTopOfStack(flushTriggers(s)).players.user.hand.map((c) => c.id)).toEqual(["lib-1"]);
  });

  it("CREED — the SAGE leaving fires nothing (no phantom self-draw), a non-commander leaving fires nothing, and a carrier gone before the leave-check grants nothing", () => {
    // The granter itself leaves: the quoted body is not ITS trigger (the quote-mask regression pin, runtime side).
    let s = bgBoard([perm("bg", CANDLEKEEP_SAGE), perm("cmdr", CMDR_CARD)]);
    s = checkLeavesTriggers(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bg" }));
    expect((s.pendingTriggers || []).length).toBe(0);
    // A non-commander creature leaving is outside the commanderOnly selector.
    let s2 = bgBoard([perm("bg", CANDLEKEEP_SAGE), perm("bear", BEAR_CARD)]);
    s2 = checkLeavesTriggers(moveCardToZone(s2, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bear" }));
    expect((s2.pendingTriggers || []).length).toBe(0);
    // Carrier already gone when the commander's leave is checked: the dynamic-source rule requires the
    // granter on the battlefield — the versioned under-fire corner, never a fabricated fire.
    let s3 = bgBoard([perm("bg", CANDLEKEEP_SAGE), perm("cmdr", CMDR_CARD)]);
    s3 = moveCardToZone(s3, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "bg" });
    s3 = moveCardToZone(s3, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "cmdr" });
    expect((checkLeavesTriggers(s3).pendingTriggers || []).length).toBe(0);
  });
});
