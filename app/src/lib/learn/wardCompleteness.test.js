/**
 * wardCompleteness.test.js — WARD, FINISHED (CR 702.21a, 702.21b; 117.3b, 117.3c, 117.5; 113.2c; 118.3, 119.4; 606.1; 701.9b).
 * The ward-on-a-triggered-ability slice (2137476d) found five more places where ward was not what the rules say:
 *
 *   1. A LOYALTY ability raised no ward. A loyalty ability is an activated ability (CR 606.1) and ward triggers on "a spell or
 *      ability an opponent controls" (CR 702.21a), yet actionDispatcher.applyActivateLoyalty never asked it: Chandra, Torch of
 *      Defiance's −3 at an opponent's Leonin Lightbringer resolved without the {2}.
 *   2. Every ward settle handed priority to the ACTIVE player. The caster of a spell (or the activator of an ability) receives
 *      priority after casting it (CR 117.3c), and a ward trigger goes on the stack before that player receives it (CR 117.5) — the
 *      engine asks the ward at once instead, so the settle must leave priority where the cast left it. Before, a non-active player
 *      who cast at a ward permanent lost the priority the cast gave them: the active player acted first.
 *   3. A spell or ability with two or more ward targets asked no ward at all (ward.js returned null for 2+). Each ward triggers
 *      (CR 113.2c; the bundled ruling on a ward card: "If a player casts a spell that targets multiple permanents their opponent
 *      controls with ward, each of those ward abilities will trigger. If that player doesn't pay for all of them, the spell will be
 *      countered.") — Into the Void at a Lightbringer and an Owlin Shieldmage bounced both for free.
 *   4. Ward costs were misread: "Ward—Discard a card or pay {2}" (Titania, Rugged Rumbler) read as a discard only, "Ward—Discard a
 *      card at random" (Alpharael, Stonechosen) as a chosen discard, and every cost the parser could not read — "{2}, Pay 2 life",
 *      a sacrifice, "Pay life equal to this creature's power", Minthara's ward {X}, Iymrith's and The Tarrasque's conditional ward,
 *      a printed life ward plus a granted mana ward — let the spell through free. A ward cost the engine can't take now counters
 *      the spell as an unpaid ward would (declining is always a legal answer, CR 118.12a — a free pass never is).
 *   5. The pay-or-be-countered panel said "<card> will be countered" for an ability too.
 *
 * Engine paths: the session driver (advanceUntilDecision / applyChoice / applyPendingChoice) for a person's spell, ability and
 * answer; dispatchAction for an AI seat's spell and loyalty ability. Real oracle fixtures (bundled Scryfall via cardIndex.publicCard,
 * generated 2026-10-20).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { chooseTriggerTargets, flushTriggers } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { wardTaxForStackObject } from "./ward.js";
import { decisionViewForWire } from "./decisionWire.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."};
const OWLIN_SHIELDMAGE = {"name":"Owlin Shieldmage","type":"Creature — Bird Warlock","mana":"{3}{W}{B}","cmc":5,"power":"3","toughness":"3","keywords":["Flying","Ward"],"colors":["B","W"],"colorIdentity":["B","W"],"oracle":"Flying\nWard—Pay 3 life. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays 3 life.)"};
const SHADOW_PUPPETEERS = {"name":"Shadow Puppeteers","type":"Creature — Faerie Wizard","mana":"{6}{U}","cmc":7,"power":"4","toughness":"4","keywords":["Flying","Ward"],"colors":["U"],"colorIdentity":["U"],"oracle":"Flying, ward {2}\nWhen this creature enters, create two 1/1 black Faerie Rogue creature tokens with flying.\nWhenever a creature you control with flying attacks, you may have it become a red Dragon with base power and toughness 4/4 in addition to its other colors and types until end of turn."};
const SPECTRAL_SNATCHER = {"name":"Spectral Snatcher","type":"Creature — Spirit","mana":"{4}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":["Landcycling","Ward","Typecycling","Cycling","Swampcycling"],"colors":["B"],"colorIdentity":["B"],"oracle":"Ward—Discard a card. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card.)\nSwampcycling {2} ({2}, Discard this card: Search your library for a Swamp card, reveal it, put it into your hand, then shuffle.)"};
const TITANIA = {"name":"Titania, Rugged Rumbler","type":"Legendary Creature — Human Villain","mana":"{2}{B/G}","cmc":3,"power":"5","toughness":"5","keywords":["Ward"],"colors":["B","G"],"colorIdentity":["B","G"],"oracle":"As an additional cost to cast this spell, discard a card or pay {2}.\nWard—Discard a card or pay {2}. (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player discards a card or pays {2}.)"};
const ALPHARAEL = {"name":"Alpharael, Stonechosen","type":"Legendary Creature — Human Cleric","mana":"{3}{B}{B}","cmc":5,"power":"3","toughness":"3","keywords":["Ward","Void"],"colors":["B"],"colorIdentity":["B"],"oracle":"Ward—Discard a card at random.\nVoid — Whenever Alpharael attacks, if a nonland permanent left the battlefield this turn or a spell was warped this turn, defending player loses half their life, rounded up."};
const CAPTAIN_HOWLER = {"name":"Captain Howler, Sea Scourge","type":"Legendary Creature — Shark Pirate","mana":"{2}{U}{R}","cmc":4,"power":"5","toughness":"4","keywords":["Ward"],"colors":["R","U"],"colorIdentity":["R","U"],"oracle":"Ward—{2}, Pay 2 life.\nWhenever you discard one or more cards, target creature gets +2/+0 until end of turn for each card discarded this way. Whenever that creature deals combat damage to a player this turn, you draw a card."};
const VEIN_RIPPER = {"name":"Vein Ripper","type":"Creature — Vampire Assassin","mana":"{3}{B}{B}{B}","cmc":6,"power":"6","toughness":"5","keywords":["Flying","Ward"],"colors":["B"],"colorIdentity":["B"],"oracle":"Flying\nWard—Sacrifice a creature.\nWhenever a creature dies, target opponent loses 2 life and you gain 2 life."};
const MINTHARA = {"name":"Minthara, Merciless Soul","type":"Legendary Creature — Elf Cleric","mana":"{2}{W}{B}","cmc":4,"power":"2","toughness":"2","keywords":["Ward"],"colors":["B","W"],"colorIdentity":["B","W"],"oracle":"Minthara has ward {X}, where X is the number of experience counters you have.\nAt the beginning of your end step, if a permanent you controlled left the battlefield this turn, you get an experience counter.\nCreatures you control get +1/+0 for each experience counter you have."};
const IYMRITH = {"name":"Iymrith, Desert Doom","type":"Legendary Creature — Dragon","mana":"{3}{U}{U}","cmc":5,"power":"5","toughness":"5","keywords":["Flying"],"colors":["U"],"colorIdentity":["U"],"oracle":"Flying\nIymrith has ward {4} as long as it's untapped.\nWhenever Iymrith deals combat damage to a player, draw a card. Then if you have fewer than three cards in hand, draw cards equal to the difference."};
const THE_TARRASQUE = {"name":"The Tarrasque","type":"Legendary Creature — Dinosaur","mana":"{6}{G}{G}{G}","cmc":9,"power":"10","toughness":"10","keywords":["Fight"],"colors":["G"],"colorIdentity":["G"],"oracle":"The Tarrasque has haste and ward {10} as long as it was cast.\nWhenever The Tarrasque attacks, it fights target creature defending player controls."};
const PHYREXIAN_FLESHGORGER = {"name":"Phyrexian Fleshgorger","type":"Artifact Creature — Phyrexian Wurm","mana":"{7}","cmc":7,"power":"7","toughness":"5","keywords":["Lifelink","Menace","Ward","Prototype"],"colors":[],"colorIdentity":["B"],"oracle":"Prototype {1}{B}{B} — 3/3 (You may cast this spell with different mana cost, color, and size. It keeps its abilities and types.)\nMenace, lifelink\nWard—Pay life equal to this creature's power.","layout":"prototype"};
const PLATE_ARMOR = {"name":"Plate Armor","type":"Artifact — Equipment","mana":"{2}{W}","cmc":3,"keywords":["Equip"],"colors":["W"],"colorIdentity":["W"],"oracle":"Equipped creature gets +3/+3 and has ward {1}. (Whenever equipped creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\nEquip {3}. This ability costs {1} less to activate for each other Equipment you control. ({3}: Attach to target creature you control. Equip only as a sorcery.)"};
const DIFFUSION_SLIVER = {"name":"Diffusion Sliver","type":"Creature — Sliver","mana":"{1}{U}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Whenever a Sliver creature you control becomes the target of a spell or ability an opponent controls, counter that spell or ability unless its controller pays {2}."};
const CHANDRA = {"name":"Chandra, Torch of Defiance","type":"Legendary Planeswalker — Chandra","mana":"{2}{R}{R}","cmc":4,"loyalty":"4","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"+1: Exile the top card of your library. You may cast that card. If you don't, Chandra deals 2 damage to each opponent.\n+1: Add {R}{R}.\n−3: Chandra deals 4 damage to target creature.\n−7: You get an emblem with \"Whenever you cast a spell, this emblem deals 5 damage to any target.\""};
const OB_NIXILIS = {"name":"Ob Nixilis Reignited","type":"Legendary Planeswalker — Nixilis","mana":"{3}{B}{B}","cmc":5,"loyalty":"5","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"+1: You draw a card and you lose 1 life.\n−3: Destroy target creature.\n−8: Target opponent gets an emblem with \"Whenever a player draws a card, you lose 2 life.\""};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"Destroy target creature."};
const INTO_THE_VOID = {"name":"Into the Void","type":"Sorcery","mana":"{3}{U}","cmc":4,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Return up to two target creatures to their owners' hands."};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"keywords":["Scry"],"colors":["U"],"colorIdentity":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const WEAVER_OF_LIGHTNING = {"name":"Weaver of Lightning","type":"Creature — Human Shaman","mana":"{2}{R}","cmc":3,"power":"1","toughness":"4","keywords":["Reach"],"colors":["R"],"colorIdentity":["R"],"oracle":"Reach (This creature can block creatures with flying.)\nWhenever you cast an instant or sorcery spell, this creature deals 1 damage to target creature an opponent controls."};
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}{C}."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};
const MISDIRECTION = {"name":"Misdirection","type":"Instant","mana":"{3}{U}{U}","cmc":5,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"You may exile a blue card from your hand rather than pay this spell's mana cost.\nChange the target of target spell with a single target."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""};
const VOID_REND = {"name":"Void Rend","type":"Instant","mana":"{W}{U}{B}","cmc":3,"keywords":[],"colors":["B","U","W"],"colorIdentity":["B","U","W"],"oracle":"This spell can't be countered.\nDestroy target nonland permanent."};

// Where the driver stops for the person (decisionGate: a person is asked whenever they hold priority with anything but a pass to
// choose): Grizzly Bears in hand stops it in the person's own main phase once the stack is empty; an Opt in hand (with blue in the
// pool) stops it at every priority the person holds, the opponent's turn included; an untapped Forest (its mana ability) likewise.

const P = (id, card, controller, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const H = (id, card) => ({ id, ...card });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const EMPTY = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

/** A two-seat game in a precombat main phase, the stack empty; the user seat is a person (state.humanSeats). */
function board({ user = [], ai = [], hand = [], aiHand = [], userPool = FULL, aiPool = EMPTY, active = "user", holder = active, passes = 0, aiExperience = 0, userLife = 20, aiLife = 20 } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, humanSeats: ["user"], turn: 4, activePlayer: active, priorityHolder: holder, phase: "precombat-main", step: "main", consecutivePasses: passes, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, life: userLife, battlefield: user, hand, manaPool: { ...g.players.user.manaPool, ...userPool }, library: LIB("user") },
      ai: { ...g.players.ai, life: aiLife, battlefield: ai, hand: aiHand, manaPool: { ...g.players.ai.manaPool, ...aiPool }, library: LIB("ai"), experience: aiExperience } } };
}
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
const targetsOf = (a) => (a.targets || []).map((t) => t.id).sort().join(",");
/** The person takes the offered action matching `pred` from the driver's first stop. */
function act(state, pred) {
  const first = advanceUntilDecision(session(state));
  const action = (first.decision.options || []).find(pred);
  if (!action) throw new Error(`no such option: ${JSON.stringify((first.decision.options || []).map((a) => [a.kind, a.cardId ?? a.permanentId, targetsOf(a)]))}`);
  return applyChoice(first.session, action);
}
const castAt = (state, cardId, targetIds) => act(state, (a) => a.kind === "cast-spell" && a.cardId === cardId && targetsOf(a) === [...targetIds].sort().join(","));
/** An AI seat's action, dispatched straight (the AI is chosen to act; the driver then settles what it raises). */
function aiAct(state, pred) {
  const action = legalActionsForPlayer(state, "ai").find(pred);
  if (!action) throw new Error("no such AI action");
  return dispatchAction(state, action);
}
/** Pass priority while the stack holds anything and the person is asked to act. */
function passUntilEmpty(r) {
  let cur = r;
  for (let i = 0; i < 12 && cur.decision.kind === "ask" && cur.session.state.stack.length; i++) {
    cur = applyChoice(cur.session, cur.decision.options.find((a) => a.kind === "pass-priority"));
  }
  return cur;
}
const answer = (r, value) => applyPendingChoice(r.session, { kind: "soft-counter", ...value });
const names = (s, seat) => s.players[seat].battlefield.map((p) => p.card?.name).sort();
const wardAsks = (s) => (s.log || []).filter((e) => e.kind === "soft-counter-pending").map((e) => [e.controller, e.sourceName]);
const MANA = (generic) => ({ kind: "mana", mana: { generic, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] } });
const decisionRow = (d) => ({ kind: d.kind, controller: d.controller ?? null, spellName: d.spellName ?? null, sourceName: d.sourceName ?? null, cost: d.cost ?? null });
const pool = (s, seat) => Object.values(s.players[seat].manaPool).reduce((n, v) => n + (typeof v === "number" ? v : 0), 0);

describe("1 · a loyalty ability is an activated ability (CR 606.1) — ward triggers on it (CR 702.21a)", () => {
  const chandra = () => P("chandra", CHANDRA, "user", { counters: { loyalty: 4 } });
  const minus3At = (id) => (a) => a.kind === "activate-loyalty" && a.costDelta === -3 && targetsOf(a) === id;

  it("⭐ your Chandra, Torch of Defiance's −3 at the opponent's Leonin Lightbringer asks for the {2}: declining counters the ability and the Lightbringer lives, paying lets the 4 damage kill it", () => {
    const start = board({ user: [chandra()], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("ubears", GRIZZLY_BEARS)] });
    const asked = act(start, minus3At("light"));
    const declined = passUntilEmpty(answer(asked, { pay: false })).session.state;
    const paid = passUntilEmpty(answer(act(start, minus3At("light")), { pay: true })).session.state;
    const row = { ask: decisionRow(asked.decision), declinedAi: names(declined, "ai"), paidAi: names(paid, "ai"), loyaltyAfter: declined.players.user.battlefield.find((p) => p.id === "chandra")?.counters?.loyalty };
    console.log(`  WITNESS loyalty-person ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Chandra, Torch of Defiance", sourceName: "Leonin Lightbringer", cost: MANA(2) },
      declinedAi: ["Leonin Lightbringer"], paidAi: [], loyaltyAfter: 1 });
  });

  it("⭐ the AI's Ob Nixilis Reignited −3 at your Lightbringer with no mana to pay: the ward is demanded of the AI, the ability is countered, the Lightbringer lives", () => {
    const start = board({ active: "ai", user: [P("light", LEONIN_LIGHTBRINGER, "user")], ai: [P("ob", OB_NIXILIS, "ai", { counters: { loyalty: 5 } })], hand: [H("opt", OPT)] });
    const activated = aiAct(start, (a) => a.kind === "activate-loyalty" && a.costDelta === -3 && targetsOf(a) === "light");
    const end = passUntilEmpty(advanceUntilDecision(session(activated))).session.state;
    const row = { asked: wardAsks(end), userBoard: names(end, "user") };
    console.log(`  WITNESS loyalty-ai ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Leonin Lightbringer"]], userBoard: ["Leonin Lightbringer"] });
  });

  it("Diffusion Sliver's tax too (a spell or ability, like ward): Chandra's −3 at the opponent's Diffusion Sliver asks for its {2}", () => {
    const asked = act(board({ user: [chandra()], ai: [P("diff", DIFFUSION_SLIVER, "ai")] }), minus3At("diff"));
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS loyalty-diffusion ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Chandra, Torch of Defiance", sourceName: "Diffusion Sliver", cost: MANA(2) });
  });

  it("control: Chandra's −3 at a creature without ward asks nothing (both trees)", () => {
    const r = passUntilEmpty(act(board({ user: [chandra()], ai: [P("bear", GRIZZLY_BEARS, "ai")], hand: [H("ubears", GRIZZLY_BEARS)] }), minus3At("bear")));
    expect({ asked: wardAsks(r.session.state), ai: names(r.session.state, "ai") }).toEqual({ asked: [], ai: [] });
  });
});

describe("2 · after a ward settles, priority is where the cast left it (CR 117.3c, 117.5) — not handed to the active player", () => {
  it("⭐ the opponent's turn: you (holding priority) Murder their Lightbringer and pay the {2} — you still hold priority, the pass count at 0; before, the active player took priority first and passed", () => {
    const start = board({ active: "ai", holder: "user", passes: 1, ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)] });
    const asked = castAt(start, "murder", ["light"]);
    const after = answer(asked, { pay: true });
    const s = after.session.state;
    const row = { ask: asked.decision.kind, next: after.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses, stack: s.stack.map((o) => o.source?.name) };
    console.log(`  WITNESS priority-person-nap ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: "soft-counter", next: "ask", holder: "user", passes: 0, stack: ["Murder"] });
  });

  it("⭐ your turn: the AI (holding priority) Murders your Lightbringer and pays from its pool — the AI keeps priority and passes it to you (count 1); before, you were handed priority by the ward's settle (count 0)", () => {
    const start = board({ active: "user", holder: "ai", passes: 1, user: [P("light", LEONIN_LIGHTBRINGER, "user")], aiHand: [H("aimurder", MURDER)], aiPool: FULL, hand: [H("opt", OPT)] });
    const cast = aiAct(start, (a) => a.kind === "cast-spell" && a.cardId === "aimurder" && targetsOf(a) === "light");
    const r = advanceUntilDecision(session(cast));
    const s = r.session.state;
    const row = { asked: wardAsks(s), next: r.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses, stack: s.stack.map((o) => o.source?.name) };
    console.log(`  WITNESS priority-ai-nap ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Leonin Lightbringer"]], next: "ask", holder: "user", passes: 1, stack: ["Murder"] });
  });

  it("the ward on a triggered ability too: in the opponent's turn you cast Opt, your Weaver of Lightning's ping aims at their Lightbringer, you pay the {2} — you still hold priority", () => {
    const start = board({ active: "ai", holder: "user", passes: 1, user: [P("weaver", WEAVER_OF_LIGHTNING, "user")], ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("opt", OPT), H("opt2", OPT)] });
    const asked = act(start, (a) => a.kind === "cast-spell" && a.cardId === "opt");
    const after = answer(asked, { pay: true });
    const s = after.session.state;
    const row = { ask: [asked.decision.kind, asked.decision.spellName], next: after.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses };
    console.log(`  WITNESS priority-trigger-nap ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: ["soft-counter", "Weaver of Lightning"], next: "ask", holder: "user", passes: 0 });
  });

  it("a ward paid by a discard you pick: in the opponent's turn you Murder their Spectral Snatcher, pay by discarding (you choose which), and still hold priority once the card is gone", () => {
    const start = board({ active: "ai", holder: "user", passes: 1, ai: [P("snatch", SPECTRAL_SNATCHER, "ai")], hand: [H("murder", MURDER), H("opt", OPT), H("spare", GRIZZLY_BEARS)] });
    const asked = castAt(start, "murder", ["snatch"]);
    const pick = answer(asked, { pay: true });
    const after = applyPendingChoice(pick.session, { kind: "discard", cardId: "spare" });
    const s = after.session.state;
    const row = { pick: pick.decision.kind, next: after.decision.kind, holder: s.priorityHolder, passes: s.consecutivePasses, graveyard: s.players.user.graveyard.map((c) => c.id) };
    console.log(`  WITNESS priority-discard-pick ${JSON.stringify(row)}`);
    expect(row).toEqual({ pick: "discard", next: "ask", holder: "user", passes: 0, graveyard: ["spare"] });
  });

  it("Diffusion Sliver's tax the same way: in the opponent's turn you Murder their Diffusion Sliver and pay its {2} — you still hold priority", () => {
    const start = board({ active: "ai", holder: "user", passes: 1, ai: [P("diff", DIFFUSION_SLIVER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)] });
    const asked = castAt(start, "murder", ["diff"]);
    const after = answer(asked, { pay: true });
    const row = { ask: [asked.decision.kind, asked.decision.sourceName], next: after.decision.kind, holder: after.session.state.priorityHolder, passes: after.session.state.consecutivePasses };
    console.log(`  WITNESS priority-diffusion ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: ["soft-counter", "Diffusion Sliver"], next: "ask", holder: "user", passes: 0 });
  });

  it("control: on your own turn your Murder at their Lightbringer, paid — you hold priority, count 0 (the active player IS the caster; both trees)", () => {
    const after = answer(castAt(board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER), H("opt", OPT)] }), "murder", ["light"]), { pay: true });
    expect({ next: after.decision.kind, holder: after.session.state.priorityHolder, passes: after.session.state.consecutivePasses }).toEqual({ next: "ask", holder: "user", passes: 0 });
  });
});

describe("3 · each ward permanent's ward triggers (CR 113.2c) — a spell aimed at two is countered unless every ward is paid", () => {
  const two = () => board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("owl", OWLIN_SHIELDMAGE, "ai")], hand: [H("void", INTO_THE_VOID), H("ubears", GRIZZLY_BEARS)] });

  it("⭐ your Into the Void at the opponent's Leonin Lightbringer (ward {2}) and Owlin Shieldmage (ward — pay 3 life): you're asked for both; declining saves both, paying costs {2} and 3 life and bounces both", () => {
    const asked = castAt(two(), "void", ["light", "owl"]);
    const declined = passUntilEmpty(answer(asked, { pay: false })).session.state;
    const paid = passUntilEmpty(answer(castAt(two(), "void", ["light", "owl"]), { pay: true })).session.state;
    const row = { ask: decisionRow(asked.decision), declinedAi: names(declined, "ai"), paidAi: names(paid, "ai"), paidLife: paid.players.user.life };
    console.log(`  WITNESS multi-person ${JSON.stringify(row)}`);
    expect(row).toEqual({
      ask: { kind: "soft-counter", controller: "user", spellName: "Into the Void", sourceName: "Leonin Lightbringer and Owlin Shieldmage", cost: { kind: "all", parts: [MANA(2), { kind: "life", life: 3 }] } },
      declinedAi: ["Leonin Lightbringer", "Owlin Shieldmage"], paidAi: [], paidLife: 17,
    });
  });

  it("⭐ two mana wards add up: Into the Void at a Lightbringer ({2}) and a Shadow Puppeteers ({2}) asks {4}", () => {
    const asked = castAt(board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("pup", SHADOW_PUPPETEERS, "ai")], hand: [H("void", INTO_THE_VOID), H("ubears", GRIZZLY_BEARS)] }), "void", ["light", "pup"]);
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS multi-mana ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Into the Void", sourceName: "Leonin Lightbringer and Shadow Puppeteers", cost: MANA(4) });
  });

  it("⭐ the AI pays all or nothing: its Into the Void at your two with {2} in its pool and 2 life — it can't pay the 3 life, so it pays nothing and the spell is countered (its mana stays)", () => {
    const start = board({ active: "ai", user: [P("light", LEONIN_LIGHTBRINGER, "user"), P("owl", OWLIN_SHIELDMAGE, "user")], aiHand: [H("aivoid", INTO_THE_VOID)], aiPool: { ...EMPTY, U: 4, C: 2 }, aiLife: 2, hand: [H("opt", OPT)] });
    const cast = aiAct(start, (a) => a.kind === "cast-spell" && a.cardId === "aivoid" && targetsOf(a) === "light,owl");
    const end = passUntilEmpty(advanceUntilDecision(session(cast))).session.state;
    const row = { asked: wardAsks(end), userBoard: names(end, "user"), aiLife: end.players.ai.life, aiPool: pool(end, "ai") };
    console.log(`  WITNESS multi-ai ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Leonin Lightbringer and Owlin Shieldmage"]], userBoard: ["Leonin Lightbringer", "Owlin Shieldmage"], aiLife: 2, aiPool: 2 });
  });

  it("control: one ward target beside one without ward asks that ward alone, as before (both trees)", () => {
    const asked = castAt(board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai"), P("bear", GRIZZLY_BEARS, "ai")], hand: [H("void", INTO_THE_VOID), H("ubears", GRIZZLY_BEARS)] }), "void", ["light", "bear"]);
    expect(decisionRow(asked.decision)).toEqual({ kind: "soft-counter", controller: "user", spellName: "Into the Void", sourceName: "Leonin Lightbringer", cost: MANA(2) });
  });
});

describe("4 · every printed ward cost is read as printed — and one the engine can't take counters the spell, never lets it through free", () => {
  const murderAt = (ward, { hand = [H("ubears", GRIZZLY_BEARS)], user = [], userPool = FULL, extra = {}, userLife = 20 } = {}) => castAt(board({ user, ai: [P("w", ward, "ai", extra)], hand: [H("murder", MURDER), ...hand], userPool, userLife }), "murder", ["w"]);

  it("⭐ Titania, Rugged Rumbler — 'Discard a card or pay {2}': two ways to pay; with an empty hand you pay the {2} and Titania dies (before: a discard only, so it couldn't be paid)", () => {
    const asked = murderAt(TITANIA, { hand: [], user: [P("forest", FOREST, "user")] });
    const paid = passUntilEmpty(answer(asked, { pay: true, option: 1 })).session.state;
    const row = { cost: asked.decision.cost, optionsAffordable: asked.decision.optionsAffordable ?? null, ai: names(paid, "ai"), pool: pool(paid, "user") };
    console.log(`  WITNESS titania-mana ${JSON.stringify(row)}`);
    expect(row).toEqual({ cost: { kind: "any", options: [{ kind: "discard", n: 1 }, MANA(2)] }, optionsAffordable: [false, true], ai: [], pool: 54 - 3 - 2 });
  });

  it("Titania, your choice: with both a card and the {2} to spare you choose to discard — the card goes, the mana stays (the house pick would have paid the mana)", () => {
    const asked = murderAt(TITANIA, { hand: [H("spare", GRIZZLY_BEARS)], user: [P("forest", FOREST, "user")] });
    const paid = passUntilEmpty(answer(asked, { pay: true, option: 0 })).session.state;
    const row = { optionsAffordable: asked.decision.optionsAffordable ?? null, ai: names(paid, "ai"), hand: paid.players.user.hand.map((c) => c.id), pool: pool(paid, "user") };
    console.log(`  WITNESS titania-choice ${JSON.stringify(row)}`);
    expect(row).toEqual({ optionsAffordable: [true, true], ai: [], hand: [], pool: 54 - 3 });
  });

  it("Titania paid the other way: one card in hand, and only a Forest left after Murder ({2} out of reach) — you discard the card", () => {
    const asked = murderAt(TITANIA, { hand: [H("spare", GRIZZLY_BEARS)], user: [P("forest", FOREST, "user")], userPool: { ...EMPTY, B: 3 } });
    const paid = passUntilEmpty(answer(asked, { pay: true, option: 0 })).session.state;
    const row = { optionsAffordable: asked.decision.optionsAffordable ?? null, ai: names(paid, "ai"), hand: paid.players.user.hand.map((c) => c.id), graveyard: paid.players.user.graveyard.map((c) => c.id).sort() };
    console.log(`  WITNESS titania-discard ${JSON.stringify(row)}`);
    expect(row).toEqual({ optionsAffordable: [true, false], ai: [], hand: [], graveyard: ["murder", "spare"] });
  });

  it("⭐ Alpharael, Stonechosen — 'Discard a card at random': paying discards one at random — no card is picked by you (before: you chose it)", () => {
    const asked = murderAt(ALPHARAEL, { hand: [H("h1", GRIZZLY_BEARS), H("h2", SOL_RING), H("h3", OPT)] });
    const paid = answer(asked, { pay: true });
    const end = passUntilEmpty(paid).session.state;
    const random = (end.log || []).filter((e) => e.effect === "discard" && e.atRandom === true).length;
    const row = { cost: asked.decision.cost, next: paid.decision.kind, randomDiscards: random, hand: end.players.user.hand.length, ai: names(end, "ai") };
    console.log(`  WITNESS alpharael-random ${JSON.stringify(row)}`);
    expect(row).toEqual({ cost: { kind: "discard-random", count: 1 }, next: "ask", randomDiscards: 1, hand: 2, ai: [] });
  });

  it("⭐ Captain Howler, Sea Scourge — 'Ward—{2}, Pay 2 life': both are paid (before: no ward at all)", () => {
    const asked = murderAt(CAPTAIN_HOWLER);
    const end = passUntilEmpty(asked.decision.kind === "soft-counter" ? answer(asked, { pay: true }) : asked).session.state;
    const row = { ask: decisionRow(asked.decision), life: end.players.user.life, ai: names(end, "ai") };
    console.log(`  WITNESS howler-all ${JSON.stringify(row)}`);
    expect(row).toEqual({ ask: { kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Captain Howler, Sea Scourge", cost: { kind: "all", parts: [MANA(2), { kind: "life", life: 2 }] } }, life: 18, ai: [] });
  });

  it("⭐ Vein Ripper — 'Ward—Sacrifice a creature': a cost the engine can't take is asked and can't be paid, so the spell is countered (before: Murder killed it free)", () => {
    const asked = murderAt(VEIN_RIPPER, { hand: [H("ubears", GRIZZLY_BEARS)] });
    const end = passUntilEmpty(asked.decision.kind === "soft-counter" ? answer(asked, { pay: true }) : asked).session.state;
    const row = { kind: asked.decision.kind, cost: asked.decision.cost ?? null, affordable: asked.decision.affordable ?? null, ai: names(end, "ai") };
    console.log(`  WITNESS vein-ripper-unpayable ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", cost: { kind: "unpayable", text: "Sacrifice a creature" }, affordable: false, ai: ["Vein Ripper"] });
  });

  it("⭐ the AI meets Vein Ripper the same way: its Murder at yours is countered", () => {
    const start = board({ active: "ai", user: [P("w", VEIN_RIPPER, "user")], aiHand: [H("aimurder", MURDER)], aiPool: FULL, hand: [H("ubears", GRIZZLY_BEARS)] });
    const end = passUntilEmpty(advanceUntilDecision(session(aiAct(start, (a) => a.kind === "cast-spell" && a.cardId === "aimurder" && targetsOf(a) === "w")))).session.state;
    const row = { asked: wardAsks(end), user: names(end, "user") };
    console.log(`  WITNESS vein-ripper-ai ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["ai", "Vein Ripper"]], user: ["Vein Ripper"] });
  });

  it("⭐ Minthara, Merciless Soul — ward {X}, X = her controller's experience counters (CR 702.21b): with 3, Murder is asked {3} (before: no ward)", () => {
    const asked = castAt(board({ ai: [P("w", MINTHARA, "ai")], aiExperience: 3, hand: [H("murder", MURDER), H("ubears", GRIZZLY_BEARS)] }), "murder", ["w"]);
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS minthara-x ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Minthara, Merciless Soul", cost: MANA(3) });
  });

  it("⭐ Iymrith, Desert Doom — ward {4} as long as it's untapped: untapped, Murder is asked {4} (before: never)", () => {
    expect(decisionRow(murderAt(IYMRITH).decision)).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Iymrith, Desert Doom", cost: MANA(4) });
  });

  it("control: Iymrith tapped has no ward (both trees)", () => {
    expect(murderAt(IYMRITH, { extra: { tapped: true } }).decision.kind).toBe("ask");
  });

  it("⭐ The Tarrasque — ward {10} as long as it was cast: cast, Murder is asked {10} (before: never)", () => {
    expect(decisionRow(murderAt(THE_TARRASQUE, { extra: { wasCast: true } }).decision)).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "The Tarrasque", cost: MANA(10) });
  });

  it("control: The Tarrasque put onto the battlefield without being cast has no ward (both trees)", () => {
    expect(murderAt(THE_TARRASQUE).decision.kind).toBe("ask");
  });

  it("⭐ Phyrexian Fleshgorger — 'Pay life equal to this creature's power': a 7/5 asks 7 life (before: no ward)", () => {
    const asked = murderAt(PHYREXIAN_FLESHGORGER);
    const end = passUntilEmpty(asked.decision.kind === "soft-counter" ? answer(asked, { pay: true }) : asked).session.state;
    const row = { cost: asked.decision.cost ?? null, life: end.players.user.life, ai: names(end, "ai") };
    console.log(`  WITNESS fleshgorger-power ${JSON.stringify(row)}`);
    expect(row).toEqual({ cost: { kind: "life", life: 7 }, life: 13, ai: [] });
  });

  it("⭐ a printed life ward and a granted mana ward both trigger: Owlin Shieldmage wearing Plate Armor asks 3 life AND {1} (before: the {1} was dropped)", () => {
    let s = board({ ai: [P("w", OWLIN_SHIELDMAGE, "ai"), P("armor", PLATE_ARMOR, "ai")], hand: [H("murder", MURDER)] });
    s = attachPermanent(s, { equipId: "armor", targetId: "w" });
    const asked = castAt(s, "murder", ["w"]);
    const row = decisionRow(asked.decision);
    console.log(`  WITNESS shieldmage-armor ${JSON.stringify(row)}`);
    expect(row).toEqual({ kind: "soft-counter", controller: "user", spellName: "Murder", sourceName: "Owlin Shieldmage", cost: { kind: "all", parts: [MANA(1), { kind: "life", life: 3 }] } });
  });

  it("controls — the costs that were already right read the same (both trees): ward {2}, pay 3 life, discard a card", () => {
    expect([LEONIN_LIGHTBRINGER, OWLIN_SHIELDMAGE, SPECTRAL_SNATCHER].map((c) => murderAt(c, { hand: [H("ubears", GRIZZLY_BEARS)] }).decision.cost))
      .toEqual([MANA(2), { kind: "life", life: 3 }, { kind: "discard", n: 1 }]);
  });

  it("the detector itself: a spell aimed at your own ward creature owes nothing, an opponent's owes its cost (both trees)", () => {
    const s = board({ user: [P("mine", LEONIN_LIGHTBRINGER, "user")], ai: [P("theirs", LEONIN_LIGHTBRINGER, "ai")] });
    expect([wardTaxForStackObject(s, { controller: "user", targets: [{ type: "creature", id: "mine" }] }), wardTaxForStackObject(s, { controller: "user", targets: [{ type: "creature", id: "theirs" }] })?.cost])
      .toEqual([null, MANA(2)]);
  });
});

describe("4b · a target changed onto a ward permanent becomes the target — its ward triggers (CR 702.21a, 115.7a)", () => {
  const redirect = (spell, spellCard, mana) => {
    const start = board({ active: "ai", user: [P("giant", HILL_GIANT, "user"), P("light", LEONIN_LIGHTBRINGER, "user")], hand: [H("mis", MISDIRECTION), H("opt", OPT)], userPool: { ...EMPTY, U: 6 }, aiHand: [H(spell, spellCard)], aiPool: mana });
    const cast = aiAct(start, (a) => a.kind === "cast-spell" && a.cardId === spell && targetsOf(a) === "giant");
    const asked = advanceUntilDecision(session(cast));
    const theirs = asked.session.state.stack[0].id;
    const misdirected = passUntilEmpty(applyChoice(asked.session, asked.decision.options.find((a) => a.kind === "cast-spell" && a.cardId === "mis" && targetsOf(a) === theirs)));
    const changed = applyPendingChoice(misdirected.session, { kind: "change-target", targetId: "light" });
    return { pause: misdirected.decision.kind, end: passUntilEmpty(changed).session.state };
  };

  it("⭐ the AI's Lightning Bolt at your Hill Giant, your Misdirection moves it to your Leonin Lightbringer: the Lightbringer's ward is asked of the AI, which can't pay — the Bolt is countered (before: it killed the Lightbringer)", () => {
    const { pause, end } = redirect("aibolt", LIGHTNING_BOLT, { ...EMPTY, R: 1 });
    const row = { pause, asked: wardAsks(end), user: names(end, "user") };
    console.log(`  WITNESS redirect-ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ pause: "change-target", asked: [["ai", "Leonin Lightbringer"]], user: ["Hill Giant", "Leonin Lightbringer"] });
  });

  it("⭐ with one other legal target the change needs no choice (the move inside the resolution): the AI's Murder at your Hill Giant moves to your Lightbringer, and its ward counters the Murder", () => {
    const { pause, end } = redirect("aimurder", MURDER, { ...EMPTY, B: 3 });
    const row = { pause, asked: wardAsks(end), user: names(end, "user") };
    console.log(`  WITNESS redirect-ward-auto ${JSON.stringify(row)}`);
    expect(row).toEqual({ pause: "ask", asked: [["ai", "Leonin Lightbringer"]], user: ["Hill Giant", "Leonin Lightbringer"] });
  });

  it("control: a spell that can't be countered (Void Rend) moved onto the Lightbringer asks nothing and destroys it (both trees)", () => {
    const { pause, end } = redirect("airend", VOID_REND, { ...EMPTY, W: 1, U: 1, B: 1 });
    expect({ pause, asked: wardAsks(end), user: names(end, "user") }).toEqual({ pause: "ask", asked: [], user: ["Hill Giant"] });
  });
});

describe("5 · the question names what is threatened — a spell or an ability", () => {
  it("⭐ the driver says which: Murder's ward is a spell's, the Chupacabra's enters trigger's is an ability's", () => {
    const spell = castAt(board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], hand: [H("murder", MURDER)] }), "murder", ["light"]);
    const s0 = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], user: [P("chupa", RAVENOUS_CHUPACABRA, "user")] });
    const flushed = flushTriggers(checkEnterTriggers(s0, s0.players.user.battlefield[0]), { chooseTargets: chooseTriggerTargets });
    const ability = advanceUntilDecision(session(flushed));
    const row = [[spell.decision.kind, spell.decision.objectKind ?? null], [ability.decision.kind, ability.decision.objectKind ?? null]];
    console.log(`  WITNESS object-kind ${JSON.stringify(row)}`);
    expect(row).toEqual([["soft-counter", "spell"], ["soft-counter", "ability"]]);
  });

  it("⭐ and it reaches the panel: the wire view (decisionWire, every HTTP route) keeps `objectKind` and Titania's `optionsAffordable` — never the engine's `priorityAfter`", () => {
    const ability = (() => {
      const s0 = board({ ai: [P("light", LEONIN_LIGHTBRINGER, "ai")], user: [P("chupa", RAVENOUS_CHUPACABRA, "user")] });
      return advanceUntilDecision(session(flushTriggers(checkEnterTriggers(s0, s0.players.user.battlefield[0]), { chooseTargets: chooseTriggerTargets }))).decision;
    })();
    const titania = castAt(board({ ai: [P("w", TITANIA, "ai")], hand: [H("murder", MURDER)] }), "murder", ["w"]).decision;
    const wire = [decisionViewForWire(ability), decisionViewForWire(titania)];
    const row = wire.map((d) => ({ objectKind: d.objectKind ?? null, optionsAffordable: d.optionsAffordable ?? null, priorityAfter: d.priorityAfter ?? null }));
    console.log(`  WITNESS wire ${JSON.stringify(row)}`);
    expect(row).toEqual([{ objectKind: "ability", optionsAffordable: null, priorityAfter: null }, { objectKind: "spell", optionsAffordable: [false, true], priorityAfter: null }]);
  });
});
