/**
 * wardAiTargeting.test.js — the default AI aims its own spells and abilities with ward in mind (CR 702.21a; 2026-10-20).
 *
 * Ward is a tax, not a shield: an opponent's ward permanent is a legal target, and "Whenever this permanent becomes the target of a
 * spell or ability an opponent controls, counter that spell or ability unless that player pays [cost]" (CR 702.21a) is asked as the
 * cast or activation completes — after the spell's or ability's own costs are paid. The AI answers that question by paying when it
 * can (runProgram.autoPickSoftCounterPay), and since the ward slice (eeb15508) a cost the engine can't take (Vein Ripper's
 * "Ward—Sacrifice a creature") is asked as unpayable, so the spell is countered. The trigger chooser already passed over a ward it
 * wouldn't pay (gameEngine.withoutUnpaidWard); the spell, activated-ability and loyalty choosers did not:
 *   · Murder went at Vein Ripper (the biggest creature) and was countered, the Bears beside it untouched;
 *   · with four Swamps Murder went at a Leonin Lightbringer whose {2} the AI could no longer pay once Murder's {1}{B}{B} was paid;
 *   · Swords to Plowshares at an Owlin Shieldmage (ward — pay 3 life) at 2 life; Murder at a Spectral Snatcher (ward — discard a
 *     card) with Murder the only card in hand — both countered;
 *   · Ob Nixilis Reignited's −3 at Vein Ripper (the loyalty spent, the ability countered); Royal Assassin at a tapped Lightbringer
 *     with no mana to pay.
 * Now an action whose ward the AI won't pay after its own costs (opponentAI.wardCountersAction) is dropped before every chooser —
 * another target is taken, or the card is held. A ward it can pay is still paid when that target is the best one; a spell that
 * can't be countered is asked no ward (CR 701.6a) and may still take it. Policy key `ward` ("v1" = the old pick).
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle-index.json, read 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceUntilDecision, applyChoice } from "./learnSession.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall) ──
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"Destroy target creature."};
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"Exile target creature. Its controller gains life equal to its power."};
const VOID_REND = {"name":"Void Rend","type":"Instant","mana":"{W}{U}{B}","cmc":3,"keywords":[],"colors":["B","U","W"],"colorIdentity":["B","U","W"],"oracle":"This spell can't be countered.\nDestroy target nonland permanent."};
const BONE_SHARDS = {"name":"Bone Shards","type":"Sorcery","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"As an additional cost to cast this spell, sacrifice a creature or discard a card.\nDestroy target creature or planeswalker."};
const DIFFUSION_SLIVER = {"name":"Diffusion Sliver","type":"Creature — Sliver","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}."};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."};
const VEIN_RIPPER = {"name":"Vein Ripper","type":"Creature — Vampire Assassin","mana":"{3}{B}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":["Flying","Ward"],"colors":["B"],"colorIdentity":["B"],"oracle":"Flying\nWard—Sacrifice a creature.\nWhenever a creature dies, target opponent loses 2 life and you gain 2 life."};
const OWLIN_SHIELDMAGE = {"name":"Owlin Shieldmage","type":"Creature — Bird Warlock","mana":"{3}{W}{B}","cmc":5,"power":"3","toughness":"3","keywords":["Flying","Ward"],"colors":["B","W"],"colorIdentity":["B","W"],"oracle":"Flying\nWard—Pay 3 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 3 life.)"};
const SPECTRAL_SNATCHER = {"name":"Spectral Snatcher","type":"Creature — Spirit","mana":"{4}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":["Landcycling","Ward","Typecycling","Cycling","Swampcycling"],"colors":["B"],"colorIdentity":["B"],"oracle":"Ward—Discard a card. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card.)\nSwampcycling {2} ({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const ROYAL_ASSASSIN = {"name":"Royal Assassin","type":"Creature — Human Assassin","mana":"{1}{B}{B}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"{T}: Destroy target tapped creature."};
const OB_NIXILIS = {"name":"Ob Nixilis Reignited","type":"Legendary Planeswalker — Nixilis","mana":"{3}{B}{B}","cmc":5,"loyalty":"5","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"+1: You draw a card and you lose 1 life.\n−3: Destroy target creature.\n−8: Target opponent gets an emblem with \"Whenever a player draws a card, you lose 2 life.\""};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["B"],"oracle":"({T}: Add {B}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["W"],"oracle":"({T}: Add {W}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["U"],"oracle":"({T}: Add {U}.)"};

/**
 * A two-seat board in the AI's precombat main, the stack empty, the AI holding priority. `ai` / `user` = [[permId, card, opts]]
 * (untapped and not summoning-sick unless opts say so); `lands` = the AI's lands, [[permId, card]]; `hand` = the AI's hand. The user
 * seat is a person holding an Opt and one blue mana, so the session driver stops at every priority it holds (playOut).
 */
function table({ ai = [], user = [], lands = [], hand = [], life = 20 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => ({ ...createPermanent({ id, controller, summoningSick: false, tapped: !!o.tapped, card: { ...c, id: `c-${id}` } }), counters: { ...(o.counters || {}) } });
  const lib = (pid) => [1, 2, 3, 4, 5].map((i) => ({ ...GRIZZLY_BEARS, id: `${pid}-lib${i}` }));
  return { ...s0, humanSeats: ["user"], turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: { ...s0.players,
      ai: { ...s0.players.ai, life, landsPlayedThisTurn: 1, battlefield: [...lands, ...ai].map(P("ai")), hand: hand.map(([id, c]) => ({ ...c, id })), library: lib("ai") },
      user: { ...s0.players.user, life: 20, landsPlayedThisTurn: 1, battlefield: user.map(P("user")), hand: [{ ...OPT, id: "uopt" }], manaPool: { ...s0.players.user.manaPool, U: 1 }, library: lib("user") } } };
}
const swamps = (n) => Array.from({ length: n }, (_, i) => [`sw${i}`, SWAMP]);
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
const targetIds = (a) => (a?.targets || []).map((t) => t.id).sort();
const offeredAt = (s, pred) => legalActionsForPlayer(s, "ai").filter(pred).map((a) => targetIds(a).join(",")).sort();
const brief = (a) => (a ? [a.kind, a.cardId ?? a.permanentId ?? null, a.costDelta ?? null, targetIds(a).join(",")] : null);
const names = (s, seat) => s.players[seat].battlefield.filter((p) => !/Land/.test(p.card?.type || "")).map((p) => p.card?.name).sort();
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.sourceName]);
/** Dispatch the AI's pick; the session driver settles what it raised (the AI answers its own ward); the person passes until the stack is empty. */
function playOut(s, action) {
  let r = advanceUntilDecision({ status: "active", state: dispatchAction(s, action), difficulty: "beginner", decisionLog: [] });
  for (let i = 0; i < 12 && r.decision.kind === "ask" && r.session.state.stack.length; i++) r = applyChoice(r.session, r.decision.options.find((a) => a.kind === "pass-priority"));
  return r.session.state;
}

describe("a spell the AI casts: a target whose ward it won't pay is passed over (CR 702.21a)", () => {
  it("⭐ Murder with Vein Ripper (ward — sacrifice a creature, a cost the engine can't take) and Grizzly Bears to aim at: the Bears (before: Vein Ripper, the bigger creature — and Murder was countered)", () => {
    const s = table({ lands: swamps(3), user: [["ripper", VEIN_RIPPER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER]] });
    const row = { offered: offeredAt(s, (a) => a.cardId === "murder"), pick: brief(aiPick(s)) };
    console.log(`  WITNESS murder-ripper-bears ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["bear", "ripper"], pick: ["cast-spell", "murder", null, "bear"] });
  });

  it("⭐ Murder with only Vein Ripper to aim at is held (before: cast, and countered by the ward)", () => {
    const s = table({ lands: swamps(3), user: [["ripper", VEIN_RIPPER]], hand: [["murder", MURDER]] });
    const row = { offered: offeredAt(s, (a) => a.cardId === "murder"), pick: brief(aiPick(s)) };
    console.log(`  WITNESS murder-ripper-only ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["ripper"], pick: ["pass-priority", null, null, ""] });
  });

  it("control: a ward it can pay is paid when that target is the best one — five Swamps, Murder at the Lightbringer (3 power) over the Bears, the {2} paid and the Lightbringer destroyed (both trees)", () => {
    const s = table({ lands: swamps(5), user: [["light", LEONIN_LIGHTBRINGER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER]] });
    const pick = aiPick(s);
    const end = playOut(s, pick);
    expect({ pick: brief(pick), asked: wardAsks(end), user: names(end, "user") })
      .toEqual({ pick: ["cast-spell", "murder", null, "light"], asked: [["ai", "Leonin Lightbringer"]], user: ["Grizzly Bears"] });
  });

  it("⭐ the ward is paid AFTER the spell: four Swamps pay Murder's {1}{B}{B} but not the Lightbringer's {2} too — Murder goes at the Bears (before: at the Lightbringer, countered)", () => {
    const s = table({ lands: swamps(4), user: [["light", LEONIN_LIGHTBRINGER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER]] });
    const pick = aiPick(s);
    const end = playOut(s, pick);
    const row = { pick: brief(pick), asked: wardAsks(end), user: names(end, "user") };
    console.log(`  WITNESS murder-after-cost ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["cast-spell", "murder", null, "bear"], asked: [], user: ["Leonin Lightbringer"] });
  });

  it("⭐ four Swamps and only the Lightbringer to aim at: Murder is held (before: cast, countered, three mana spent for nothing)", () => {
    const s = table({ lands: swamps(4), user: [["light", LEONIN_LIGHTBRINGER]], hand: [["murder", MURDER]] });
    const row = { pick: brief(aiPick(s)) };
    console.log(`  WITNESS murder-light-only ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["pass-priority", null, null, ""] });
  });

  it("⭐ a life ward at 2 life: Swords to Plowshares goes at the Bears, not the Owlin Shieldmage (ward — pay 3 life) it could not pay for (before: the Shieldmage, countered)", () => {
    const s = table({ life: 2, lands: [["pl", PLAINS]], user: [["owl", OWLIN_SHIELDMAGE], ["bear", GRIZZLY_BEARS]], hand: [["stp", SWORDS]] });
    const row = { pick: brief(aiPick(s)) };
    console.log(`  WITNESS swords-life-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["cast-spell", "stp", null, "bear"] });
  });

  it("control: at 20 life the Shieldmage's 3 life is paid — Swords to Plowshares at the Shieldmage (both trees)", () => {
    const s = table({ life: 20, lands: [["pl", PLAINS]], user: [["owl", OWLIN_SHIELDMAGE], ["bear", GRIZZLY_BEARS]], hand: [["stp", SWORDS]] });
    expect(brief(aiPick(s))).toEqual(["cast-spell", "stp", null, "owl"]);
  });

  it("⭐ a discard ward when the spell is the last card in hand: Murder goes at the Bears, not the Spectral Snatcher (ward — discard a card), since casting Murder empties the hand (before: the Snatcher, countered)", () => {
    const s = table({ lands: swamps(3), user: [["snatch", SPECTRAL_SNATCHER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER]] });
    const row = { pick: brief(aiPick(s)) };
    console.log(`  WITNESS murder-discard-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["cast-spell", "murder", null, "bear"] });
  });

  it("control: with a second card in hand the discard is paid — Murder at the Snatcher (both trees)", () => {
    const s = table({ lands: swamps(3), user: [["snatch", SPECTRAL_SNATCHER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER], ["opt", OPT]] });
    expect(brief(aiPick(s))).toEqual(["cast-spell", "murder", null, "snatch"]);
  });

  it("⭐ a discard paid as the spell's own cost empties the hand too: Bone Shards discarding the Opt goes at the Bears, not the Spectral Snatcher (before: the Snatcher, countered)", () => {
    const s = table({ lands: swamps(1), user: [["snatch", SPECTRAL_SNATCHER], ["bear", GRIZZLY_BEARS]], hand: [["shards", BONE_SHARDS], ["opt", OPT]] });
    const row = { offered: offeredAt(s, (a) => a.cardId === "shards"), pick: brief(aiPick(s)) };
    console.log(`  WITNESS shards-discard-cost ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["bear", "snatch"], pick: ["cast-spell", "shards", null, "bear"] });
  });

  it("⭐ Diffusion Sliver's tax too (the dispatcher asks it when no ward is): three Swamps and only the opponent's Diffusion Sliver — Murder is held (before: cast, countered by the {2})", () => {
    const s = table({ lands: swamps(3), user: [["diff", DIFFUSION_SLIVER]], hand: [["murder", MURDER]] });
    const row = { offered: offeredAt(s, (a) => a.cardId === "murder"), pick: brief(aiPick(s)) };
    console.log(`  WITNESS murder-diffusion ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["diff"], pick: ["pass-priority", null, null, ""] });
  });

  it("control: a spell that can't be countered is asked no ward (CR 701.6a) — Void Rend still destroys Vein Ripper (both trees)", () => {
    const s = table({ lands: [["pl", PLAINS], ["is", ISLAND], ["sw", SWAMP]], user: [["ripper", VEIN_RIPPER], ["bear", GRIZZLY_BEARS]], hand: [["rend", VOID_REND]] });
    const pick = aiPick(s);
    const end = playOut(s, pick);
    expect({ pick: brief(pick), asked: wardAsks(end), user: names(end, "user") }).toEqual({ pick: ["cast-spell", "rend", null, "ripper"], asked: [], user: ["Grizzly Bears"] });
  });

  it("policy key `ward`: 'v1' recovers the old pick (Murder at Vein Ripper) for the A/B probe", () => {
    expect(POLICY_KEYS).toContain("ward");
    const s = table({ lands: swamps(3), user: [["ripper", VEIN_RIPPER], ["bear", GRIZZLY_BEARS]], hand: [["murder", MURDER]] });
    expect(brief(aiPick(s, { policy: { ward: "v1" } }))).toEqual(["cast-spell", "murder", null, "ripper"]);
  });
});

describe("an ability the AI activates — loyalty (CR 606.1) and activated — the same", () => {
  const ob = (loyalty = 5) => ["ob", OB_NIXILIS, { counters: { loyalty } }];

  it("⭐ Ob Nixilis Reignited with only Vein Ripper on the other side: +1 (draw), not the −3 the ward would counter (before: −3 at Vein Ripper — the loyalty spent, the ability countered)", () => {
    const s = table({ ai: [ob()], user: [["ripper", VEIN_RIPPER]] });
    const row = { pick: brief(aiPick(s)) };
    console.log(`  WITNESS ob-ripper ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["activate-loyalty", "ob", 1, ""] });
  });

  it("control: Ob Nixilis's −3 at a creature without ward, as before (both trees)", () => {
    const s = table({ ai: [ob()], user: [["bear", GRIZZLY_BEARS]] });
    expect(brief(aiPick(s))).toEqual(["activate-loyalty", "ob", -3, "bear"]);
  });

  it("⭐ Royal Assassin with no mana for the Lightbringer's {2}: the tapped Bears, not the tapped Lightbringer (before: the Lightbringer, countered)", () => {
    const s = table({ ai: [["assassin", ROYAL_ASSASSIN]], user: [["light", LEONIN_LIGHTBRINGER, { tapped: true }], ["bear", GRIZZLY_BEARS, { tapped: true }]] });
    const row = { pick: brief(aiPick(s)) };
    console.log(`  WITNESS assassin-no-mana ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: ["activate-ability", "assassin", null, "bear"] });
  });

  it("control: with two Swamps to pay the {2}, Royal Assassin destroys the Lightbringer (both trees)", () => {
    const s = table({ lands: swamps(2), ai: [["assassin", ROYAL_ASSASSIN]], user: [["light", LEONIN_LIGHTBRINGER, { tapped: true }], ["bear", GRIZZLY_BEARS, { tapped: true }]] });
    const pick = aiPick(s);
    const end = playOut(s, pick);
    expect({ pick: brief(pick), asked: wardAsks(end), user: names(end, "user") })
      .toEqual({ pick: ["activate-ability", "assassin", null, "light"], asked: [["ai", "Leonin Lightbringer"]], user: ["Grizzly Bears"] });
  });
});
