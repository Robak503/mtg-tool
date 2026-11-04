/**
 * copyTargetChoice.test.js — A COPY'S NEW TARGETS ARE ITS CONTROLLER'S CHOICE (CR 707.10c, 702.40a, 707.10, 115.7, 601.2c).
 *
 *   CR 707.10c: "Some effects copy a spell or ability and state that its controller may choose new targets for the copy. The player may
 *   leave any number of the targets unchanged, even if those targets would be illegal. If the player chooses to change some or all of the
 *   targets, the new targets must be legal. Once the player has decided what the copy's targets will be, the copy is put onto the stack
 *   with those targets."
 *
 * Before this fix the engine picked every copy's targets itself — for a person too (the storm copies' "prefer the enemy side" house rule,
 * a copy of another spell's keep-or-re-aim rule, a copied ability's kept targets). Now a seat a person plays is asked as the copy is put on
 * the stack (the `copy-targets` pause — atoms/stack placeCopyForPerson, raiseCopyTargetsChoice, settleCopyTargetsChoice), ONE TARGET AT A
 * TIME (the blind review's F1 — targeting.newTargetPositions / newTargetCandidates): keep the target as it stands, or any other legal object
 * for it, so every legal set is reachable, the mixed ones included (CR 115.7d, 115.3, 601.2c). Deflecting Swat asks the same question (F6).
 * Round 2 also pins, for every seat: a copy's targets become its targets (F3 — Phantasmal Bear, Kira, valiant), a self-copy has the spell's
 * colours (F2 — protection from blue), a Bracers copy is the Bracers' controller's (F4). Round 3 pins: an atom whose targets constrain each
 * other (a player and cards from that player's graveyard, a single graveyard) is offered whole on full graveyards and every target is asked
 * (R2-F1); a person's copy keeps the resolution's triggers in one batch with its targets' (R2-F2 — APNAP, one order question); Deflecting
 * Swat's new targets become its targets, for every seat (R2-F3). The default AI's picks are unchanged. Driven through
 * the session driver (advanceUntilDecision / applyChoice / applyPendingChoice), so each row reads the real question a person sees and the
 * board after the copies resolve. Every assertion is on literal ids and life totals.
 *
 * Card text: the bundled Scryfall oracle (scryfall-bulk/oracle_cards.json), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { advanceUntilDecision, applyChoice, applyPendingChoice } from "./learnSession.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { newTargetCandidates } from "./effects/targeting.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (the bundled oracle) ──
const GRAPESHOT = {"name":"Grapeshot","type":"Sorcery","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":["Storm"],"colors":["R"],"colorIdentity":["R"],"oracle":"Grapeshot deals 1 damage to any target.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"}; // EDHREC #729
const TENDRILS_OF_AGONY = {"name":"Tendrils of Agony","type":"Sorcery","mana":"{2}{B}{B}","cmc":4,"power":null,"toughness":null,"keywords":["Storm"],"colors":["B"],"colorIdentity":["B"],"oracle":"Target player loses 2 life and you gain 2 life.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"}; // EDHREC #5621
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"{T}: Add {G}."}; // EDHREC #58
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // EDHREC #157
const REVERBERATE = {"name":"Reverberate","type":"Instant","mana":"{R}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."}; // EDHREC #1418
const TWINCAST = {"name":"Twincast","type":"Instant","mana":"{U}{U}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Copy target instant or sorcery spell. You may choose new targets for the copy."}; // EDHREC #6265
const DUALCASTER_MAGE = {"name":"Dualcaster Mage","type":"Creature — Human Wizard","mana":"{1}{R}{R}","cmc":3,"power":"2","toughness":"2","keywords":["Flash"],"colors":["R"],"colorIdentity":["R"],"oracle":"Flash\nWhen this creature enters, copy target instant or sorcery spell. You may choose new targets for the copy."}; // EDHREC #675
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Return target creature to its owner's hand."}; // EDHREC #2928
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":""}; // EDHREC #29123
const CHAIN_OF_VAPOR = {"name":"Chain of Vapor","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Return target nonland permanent to its owner's hand. Then that permanent's controller may sacrifice a land of their choice. If the player does, they may copy this spell and may choose a new target for that copy."}; // EDHREC #975
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}{C}."}; // EDHREC #1
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // EDHREC #32
const WAYFARERS_BAUBLE = {"name":"Wayfarer's Bauble","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{2}, {T}, Sacrifice this artifact: Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle."}; // EDHREC #124
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"}; // EDHREC #—
const SEVINNES_RECLAMATION = {"name":"Sevinne's Reclamation","type":"Sorcery","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Flashback"],"colors":["W"],"colorIdentity":["W"],"oracle":"Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If this spell was cast from a graveyard, you may copy this spell and may choose a new target for the copy.\nFlashback {4}{W} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // EDHREC #341
const STRIONIC_RESONATOR = {"name":"Strionic Resonator","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{2}, {T}: Copy target triggered ability you control. You may choose new targets for the copy. (A triggered ability uses the words \"when,\" \"whenever,\" or \"at.\")"}; // EDHREC #602
const RAVENOUS_CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."}; // EDHREC #1133
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"{T}: This creature deals 1 damage to any target."}; // EDHREC #11683
const ILLUSIONISTS_BRACERS = {"name":"Illusionist's Bracers","type":"Artifact — Equipment","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Whenever an ability of equipped creature is activated, if it isn't a mana ability, copy that ability. You may choose new targets for the copy.\nEquip {3}"}; // EDHREC #1636
const LEONIN_LIGHTBRINGER = {"name":"Leonin Lightbringer","type":"Creature — Cat Rebel","mana":"{2}{W}","cmc":3,"power":"3","toughness":"2","keywords":["Ward"],"colors":["W"],"colorIdentity":["W"],"oracle":"Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\nAs long as this creature is equipped, it gets +1/+1."}; // EDHREC #22619
const PALADIN_EN_VEC = {"name":"Paladin en-Vec","type":"Creature — Human Knight","mana":"{1}{W}{W}","cmc":3,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike, protection from black and from red (This creature deals combat damage before creatures without first strike. It can't be blocked, targeted, dealt damage, or enchanted by anything black or red.)"}; // EDHREC #22704
const CHOMPING_CHANGELING = {"name":"Chomping Changeling","type":"Creature — Shapeshifter","mana":"{2}{G}","cmc":3,"power":"1","toughness":"2","keywords":["Changeling"],"colors":["G"],"colorIdentity":["G"],"oracle":"Changeling (This card is every creature type.)\nWhen this creature enters, destroy up to one target artifact or enchantment."}; // EDHREC #2513
const KOLAGHANS_COMMAND = {"name":"Kolaghan's Command","type":"Instant","mana":"{1}{B}{R}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["B","R"],"colorIdentity":["B","R"],"oracle":"Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n• Kolaghan's Command deals 2 damage to any target."}; // EDHREC #3728
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Destroy target artifact."}; // EDHREC #14015
const GRASP_OF_FATE = {"name":"Grasp of Fate","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"When this enchantment enters, for each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield. (Those permanents return under their owners' control.)"}; // EDHREC #1151
const RISHKAR_PEEMA_RENEGADE = {"name":"Rishkar, Peema Renegade","type":"Legendary Creature — Elf Druid","mana":"{2}{G}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"When Rishkar enters, put a +1/+1 counter on each of up to two target creatures.\nEach creature you control with a counter on it has \"{T}: Add {G}.\""}; // EDHREC #873
const YAVIMAYA_BARBARIAN = {"name":"Yavimaya Barbarian","type":"Creature — Elf Barbarian","mana":"{R}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Protection"],"colors":["G","R"],"colorIdentity":["G","R"],"oracle":"Protection from blue"}; // EDHREC #29806
const PHANTASMAL_BEAR = {"name":"Phantasmal Bear","type":"Creature — Bear Illusion","mana":"{U}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"When this creature becomes the target of a spell or ability, sacrifice it."}; // EDHREC #22542
const KIRA_GREAT_GLASS_SPINNER = {"name":"Kira, Great Glass-Spinner","type":"Legendary Creature — Spirit","mana":"{1}{U}{U}","cmc":3,"power":"2","toughness":"2","keywords":["Flying"],"colors":["U"],"colorIdentity":["U"],"oracle":"Flying\nCreatures you control have \"Whenever this creature becomes the target of a spell or ability for the first time each turn, counter that spell or ability.\""}; // EDHREC #5590
const HEARTFIRE_HERO = {"name":"Heartfire Hero","type":"Creature — Mouse Soldier","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Valiant"],"colors":["R"],"colorIdentity":["R"],"oracle":"Valiant — Whenever this creature becomes the target of a spell or ability you control for the first time each turn, put a +1/+1 counter on it.\nWhen this creature dies, it deals damage equal to its power to each opponent."}; // EDHREC #8005
const DEFLECTING_SWAT = {"name":"Deflecting Swat","type":"Instant","mana":"{2}{R}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"If you control a commander, you may cast this spell without paying its mana cost.\nYou may choose new targets for target spell or ability."}; // EDHREC #74
const ASTRAL_STEEL = {"name":"Astral Steel","type":"Instant","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Storm"],"colors":["W"],"colorIdentity":["W"],"oracle":"Target creature gets +1/+2 until end of turn.\nStorm (When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.)"}; // EDHREC #18439
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""}; // EDHREC #8126
const MEMORY_S_JOURNEY = {"name":"Memory's Journey","type":"Instant","mana":"{1}{U}","cmc":2,"power":null,"toughness":null,"keywords":["Flashback"],"colors":["U"],"colorIdentity":["G","U"],"oracle":"Target player shuffles up to three target cards from their graveyard into their library.\nFlashback {G} (You may cast this card from your graveyard for its flashback cost. Then exile it.)"}; // EDHREC #14274
const DWELL_ON_THE_PAST = {"name":"Dwell on the Past","type":"Sorcery","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"Target player shuffles up to four target cards from their graveyard into their library."}; // EDHREC #23135
const STREAM_OF_CONSCIOUSNESS = {"name":"Stream of Consciousness","type":"Instant — Arcane","mana":"{1}{U}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["U"],"colorIdentity":["U"],"oracle":"Target player shuffles up to four target cards from their graveyard into their library."}; // EDHREC #19733
const SHRED_MEMORY = {"name":"Shred Memory","type":"Instant","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":["Transmute"],"colors":["B"],"colorIdentity":["B"],"oracle":"Exile up to four target cards from a single graveyard.\nTransmute {1}{B}{B} ({1}{B}{B}, Discard this card: Search your library for a card with the same mana value as this card, reveal it, put it into your hand, then shuffle. Transmute only as a sorcery.)"}; // EDHREC #8317
const RAPID_DECAY = {"name":"Rapid Decay","type":"Instant","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":["Cycling"],"colors":["B"],"colorIdentity":["B"],"oracle":"Exile up to three target cards from a single graveyard.\nCycling {2} ({2}, Discard this card: Draw a card.)"}; // EDHREC #28606
const STORM_KILN_ARTIST = {"name":"Storm-Kiln Artist","type":"Creature — Dwarf Shaman","mana":"{3}{R}","cmc":4,"power":"2","toughness":"2","keywords":["Treasure","Magecraft"],"colors":["R"],"colorIdentity":["R"],"oracle":"This creature gets +1/+0 for each artifact you control.\nMagecraft — Whenever you cast or copy an instant or sorcery spell, create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // EDHREC #199

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const LIB = (pid) => [1, 2, 3, 4, 5, 6].map((i) => ({ id: `${pid}-lib${i}`, ...GRIZZLY_BEARS }));
const FULL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };
const SEATS = ["user", "ai1", "ai2", "ai3"];

/**
 * A four-seat commander pod in the user's precombat main phase, the stack empty; `humans` is state.humanSeats. The person also holds a
 * Lightning Bolt they never cast (`bolt`), so the driver stops at each of their priorities — the board is read as the stack empties.
 */
function pod({ boards = {}, hand = [], spellsCast = 0, humans = ["user"] } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const pid of SEATS) {
    const mine = pid === "user";
    players[pid] = { ...players[pid], life: 40, graveyard: [], library: LIB(pid), battlefield: boards[pid] || [], hand: mine ? [...hand, { id: "bolt", ...LIGHTNING_BOLT }] : [],
      manaPool: mine ? { ...players[pid].manaPool, ...FULL } : players[pid].manaPool, ...(mine ? { spellsCastThisTurn: spellsCast } : {}) };
  }
  return { ...g, ...(humans ? { humanSeats: humans } : {}), turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const session = (state, difficulty = "beginner") => ({ status: "active", state, difficulty, decisionLog: [] });
const ids = (ts) => (ts || []).map((t) => t.id).join("+");
/** The person casts `cardId` with the targets `targetIds` (joined by "+"); returns the driver's next stop. */
function cast(state, cardId, targetIds) {
  const first = advanceUntilDecision(session(state));
  const action = (first.decision.options || []).find((a) => a.kind === "cast-spell" && a.cardId === cardId && ids(a.targets) === targetIds);
  expect(action, `no cast of ${cardId} at ${targetIds}`).toBeTruthy();
  return applyChoice(first.session, action);
}
/** Pass priority until the driver stops on something other than the person's own priority with a non-empty stack (or the stack empties). */
function passUntilAsked(r) {
  for (let k = 0; k < 40; k++) {
    if (!Array.isArray(r.decision?.options)) return r; // a question, or the game over — not the person's priority
    if (!(r.session.state.stack || []).length) return r;
    const pass = (r.decision.options || []).find((a) => a.kind === "pass-priority");
    if (!pass) return r;
    r = applyChoice(r.session, pass);
  }
  return r;
}
/** Answer each copy-targets question with the next of `picks` (a candidate's target ids joined by "+", "keep" for the copied targets). */
function answerCopies(r, picks) {
  const asked = [];
  for (const want of picks) {
    r = passUntilAsked(r);
    const d = r.decision;
    asked.push({ kind: d?.kind ?? null, copy: d?.copyNumber != null ? `${d.copyNumber}/${d.copyCount}` : null, rows: (d?.candidates || []).map((c) => (c.keep ? `keep:${ids(c.targets)}` : ids(c.targets))) });
    if (d?.kind !== "copy-targets") break;
    const c = (d.candidates || []).find((x) => (want === "keep" ? x.keep : !x.keep && ids(x.targets) === want));
    expect(c, `copy ${d.copyNumber}: no row ${want}`).toBeTruthy();
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: c.id });
  }
  return { r, asked };
}
/** Pass until the stack is empty (no question left). */
function drain(r) {
  for (let k = 0; k < 60 && (r.session.state.stack || []).length; k++) {
    const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
    if (!pass) break;
    r = applyChoice(r.session, pass);
  }
  return r;
}
const life = (s) => Object.fromEntries(SEATS.map((p) => [p, s.players[p].life]));
const onBoard = (s, pid) => s.players[pid].battlefield.map((p) => p.id).sort();

describe("CR 702.40a / 707.10c — a person chooses each storm copy's target", () => {
  it("⭐ Grapeshot with storm 3 cast by the person in a pod: asked copy by copy (keep, or any legal target), and the copies resolve at exactly those choices — one at a creature, one at a player, one kept", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 3, boards: { ai2: [P("elf", LLANOWAR_ELVES, "ai2")], ai3: [P("bear", GRIZZLY_BEARS, "ai3")] } });
    const cast1 = cast(start, "shot", "ai1");
    const { r, asked } = answerCopies(cast1, ["elf", "ai3", "keep"]);
    const end = drain(r);
    const row = {
      asked: asked.map((a) => [a.kind, a.copy, a.rows.length, a.rows[0], a.rows.includes("elf"), a.rows.includes("ai3"), a.rows.includes("user")]),
      life: life(end.session.state), ai2: onBoard(end.session.state, "ai2"), ai3: onBoard(end.session.state, "ai3"),
      stack: end.session.state.stack.length,
    };
    console.log(`  WITNESS grapeshot ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: [["copy-targets", "1/3", 6, "keep:ai1", true, true, true], ["copy-targets", "2/3", 6, "keep:ai1", true, true, true], ["copy-targets", "3/3", 6, "keep:ai1", true, true, true]],
      life: { user: 40, ai1: 38, ai2: 40, ai3: 39 }, ai2: [], ai3: ["bear"], stack: 0,
    });
  });

  it("⭐ Tendrils of Agony with storm 2: the person sends each copy at a different opponent — each loses 2, the caster gains 6", () => {
    const start = pod({ hand: [{ id: "tend", ...TENDRILS_OF_AGONY }], spellsCast: 2 });
    const { r, asked } = answerCopies(cast(start, "tend", "ai1"), ["ai2", "ai3"]);
    const end = drain(r);
    const row = { asked: asked.map((a) => [a.kind, a.copy, a.rows]), life: life(end.session.state) };
    console.log(`  WITNESS tendrils ${JSON.stringify(row)}`);
    expect(row).toEqual({
      asked: [["copy-targets", "1/2", ["keep:ai1", "user", "ai2", "ai3"]], ["copy-targets", "2/2", ["keep:ai1", "user", "ai2", "ai3"]]],
      life: { user: 46, ai1: 38, ai2: 38, ai3: 38 },
    });
  });
});

/** `seat` casts `cardId` from its hand (given `card` and the mana) at `targetIds` while holding priority; the person then holds priority (the caster passed). */
function opponentCasts(state, seat, card, cardId, targetIds) {
  const withCard = { ...state, priorityHolder: seat, players: { ...state.players, [seat]: { ...state.players[seat], hand: [...state.players[seat].hand, { id: cardId, ...card }], manaPool: { ...state.players[seat].manaPool, ...FULL } } } };
  const a = legalActionsForPlayer(withCard, seat).find((x) => x.kind === "cast-spell" && x.cardId === cardId && ids(x.targets) === targetIds);
  expect(a, `${seat} can't cast ${cardId} at ${targetIds}`).toBeTruthy();
  const cast = dispatchAction(withCard, a);
  return { ...cast, priorityHolder: "user", consecutivePasses: 0 };
}
const stackId = (s, name) => s.stack.find((o) => o.source?.name === name)?.id;
const userHand = (s) => s.players.user.hand.map((c) => c.id).sort();

describe("CR 707.10c — a copy of another spell: the person keeps its targets or re-aims it", () => {
  // ai1's Lightning Bolt at the person's Grizzly Bears; ai2 has a Hill Giant. The person copies the Bolt.
  const BOLTED = () => opponentCasts(pod({ hand: [{ id: "rev", ...REVERBERATE }, { id: "twin", ...TWINCAST }, { id: "dual", ...DUALCASTER_MAGE }], boards: { user: [P("ubear", GRIZZLY_BEARS, "user")], ai2: [P("giant", HILL_GIANT, "ai2")] } }), "ai1", LIGHTNING_BOLT, "aibolt", "ubear");

  it("⭐ Reverberate on an opponent's Lightning Bolt — re-aimed: the copy hits the Hill Giant the person chose, then the Bolt kills their Bears", () => {
    const s = BOLTED();
    const { r, asked } = answerCopies(cast(s, "rev", stackId(s, "Lightning Bolt")), ["giant"]);
    const end = drain(r);
    const row = { asked: asked.map((a) => [a.kind, a.rows[0], a.rows.length]), user: onBoard(end.session.state, "user"), ai2: onBoard(end.session.state, "ai2"), life: life(end.session.state) };
    console.log(`  WITNESS reverberate-reaim ${JSON.stringify(row)}`);
    // Rows: keep (the Bears), then every other legal "any target" — the four players, the Hill Giant.
    expect(row).toEqual({ asked: [["copy-targets", "keep:ubear", 6]], user: [], ai2: [], life: { user: 40, ai1: 40, ai2: 40, ai3: 40 } });
  });

  it("⭐ Reverberate on an opponent's Lightning Bolt — kept: the copy hits the person's own Bears (their choice), the Bolt then fizzles, the Hill Giant lives", () => {
    const s = BOLTED();
    const { r, asked } = answerCopies(cast(s, "rev", stackId(s, "Lightning Bolt")), ["keep"]);
    const end = drain(r);
    const log = end.session.state.log || [];
    const row = { asked: asked.map((a) => a.kind), user: onBoard(end.session.state, "user"), ai2: onBoard(end.session.state, "ai2"), boltFizzled: log.some((e) => e.kind === "spell-fizzle" && e.source === "Lightning Bolt") };
    console.log(`  WITNESS reverberate-keep ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: ["copy-targets"], user: [], ai2: ["giant"], boltFizzled: true });
  });

  it("⭐ Twincast on an opponent's Lightning Bolt: re-aimed at a player — ai3 takes the copy's 3", () => {
    const s = BOLTED();
    const { r, asked } = answerCopies(cast(s, "twin", stackId(s, "Lightning Bolt")), ["ai3"]);
    const end = drain(r);
    const row = { asked: asked.map((a) => [a.kind, a.rows[0]]), life: life(end.session.state), user: onBoard(end.session.state, "user"), ai2: onBoard(end.session.state, "ai2") };
    console.log(`  WITNESS twincast ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", "keep:ubear"]], life: { user: 40, ai1: 40, ai2: 40, ai3: 37 }, user: [], ai2: ["giant"] });
  });

  it("⭐ Dualcaster Mage flashed in on an opponent's Lightning Bolt: its enters trigger copies the Bolt, and the person aims the copy at ai1", () => {
    const s = BOLTED();
    const { r, asked } = answerCopies(cast(s, "dual", ""), ["ai1"]);
    const end = drain(r);
    const mage = end.session.state.players.user.battlefield.filter((p) => p.card?.name === "Dualcaster Mage").length;
    const row = { asked: asked.map((a) => [a.kind, a.rows[0]]), life: life(end.session.state), ubear: onBoard(end.session.state, "user").includes("ubear"), mage };
    console.log(`  WITNESS dualcaster ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", "keep:ubear"]], life: { user: 40, ai1: 37, ai2: 40, ai3: 40 }, ubear: false, mage: 1 });
  });
});

describe("CR 707.10c — no legal new target: the copy keeps its targets, or is removed, exactly as before (controls — the same on the base)", () => {
  it("Twincast on ai1's Unsummon at the only creature: nothing else is legal, so nobody is asked — the copy returns the person's Bears and Unsummon fizzles", () => {
    const s = opponentCasts(pod({ hand: [{ id: "twin", ...TWINCAST }], boards: { user: [P("ubear", GRIZZLY_BEARS, "user")] } }), "ai1", UNSUMMON, "aiun", "ubear");
    let r = cast(s, "twin", stackId(s, "Unsummon"));
    const kinds = [];
    for (let k = 0; k < 40 && (r.session.state.stack || []).length; k++) {
      kinds.push(r.decision?.kind);
      const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    const log = r.session.state.log || [];
    expect({ asked: kinds.includes("copy-targets"), hand: userHand(r.session.state), unsummonFizzled: log.some((e) => e.kind === "spell-fizzle" && e.source === "Unsummon") })
      .toEqual({ asked: false, hand: ["bolt", "c-ubear"], unsummonFizzled: true });
  });

  it("Chain of Vapor on the person's own Sol Ring with no other nonland permanent anywhere: the copy would have no target, so no land question and no copy", () => {
    const s = pod({ hand: [{ id: "chain", ...CHAIN_OF_VAPOR }], boards: { user: [P("sol", SOL_RING, "user"), P("f1", FOREST, "user")] } });
    let r = cast(s, "chain", "sol");
    const kinds = [];
    for (let k = 0; k < 40 && (r.session.state.stack || []).length; k++) {
      kinds.push(r.decision?.kind);
      const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    expect({ kinds: [...new Set(kinds)], hand: userHand(r.session.state), lands: onBoard(r.session.state, "user") }).toEqual({ kinds: ["ask"], hand: ["bolt", "c-sol"], lands: ["f1"] });
  });
});

describe("the default AI: its copies' targets are the house pick, unchanged (controls — the same on the base)", () => {
  // The house rule (freshCopyTargets): the enemy side, then the first legal, in enumeration order — for "any target" creatures, then players,
  // then planeswalkers (spellEffects.enumerateTargets). The board is unchanged while the copies are made, so every copy takes ai2's Llanowar
  // Elves: the first kills it and the other two fizzle (CR 608.2b). Unchanged by this fix.
  it("Grapeshot with storm 3 and no person at the table: every copy takes the house pick, ai2's Llanowar Elves — the original hits ai1, the Elves die, the Bears and the other players are untouched", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 3, humans: null, boards: { ai2: [P("elf", LLANOWAR_ELVES, "ai2")], ai3: [P("bear", GRIZZLY_BEARS, "ai3")] } });
    let r = cast(start, "shot", "ai1");
    const kinds = [];
    for (let k = 0; k < 40 && (r.session.state.stack || []).length; k++) {
      kinds.push(r.decision?.kind);
      const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    expect({ asked: kinds.includes("copy-targets"), life: life(r.session.state), ai2: onBoard(r.session.state, "ai2"), ai3: onBoard(r.session.state, "ai3") })
      .toEqual({ asked: false, life: { user: 40, ai1: 39, ai2: 40, ai3: 40 }, ai2: [], ai3: ["bear"] });
  });

  it("an AI's copy at a table with a person: ai1 Twincasts the person's Bolt at ai1's own Hill Giant — nobody is asked, and the house re-aims the copy at the person (the first player off ai1's side)", () => {
    let s = pod({ hand: [{ id: "ubolt", ...LIGHTNING_BOLT }], boards: { ai1: [P("giant", HILL_GIANT, "ai1")] } });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "ubolt" && ids(x.targets) === "giant");
    s = dispatchAction(s, a);
    s = opponentCasts(s, "ai1", TWINCAST, "aitwin", stackId(s, "Lightning Bolt"));
    let r = advanceUntilDecision(session(s));
    const kinds = [];
    for (let k = 0; k < 40 && (r.session.state.stack || []).length; k++) {
      kinds.push(r.decision?.kind);
      const pass = (r.decision?.options || []).find((x) => x.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    expect({ asked: kinds.includes("copy-targets"), life: life(r.session.state), ai1: onBoard(r.session.state, "ai1") })
      .toEqual({ asked: false, life: { user: 37, ai1: 40, ai2: 40, ai3: 40 }, ai1: [] });
  });
});

describe("CR 707.10c — the self-copy and Chain of Vapor: the person's copy may take any legal new target", () => {
  it("⭐ Sevinne's Reclamation cast with flashback: the copy asks — keep (the card the spell returned) or another permanent card — and returns the Wayfarer's Bauble the person chose, not the Mind Stone the house would take", () => {
    const s0 = pod({});
    const user = s0.players.user;
    const s = { ...s0, players: { ...s0.players, user: { ...user, graveyard: [{ id: "sev", ...SEVINNES_RECLAMATION }, { id: "gsol", ...SOL_RING }, { id: "gstone", ...MIND_STONE }, { id: "gbauble", ...WAYFARERS_BAUBLE }] } } };
    // "you may copy this spell" is its own yes/no (the optional-effect question) before the copy's targets.
    let mayCopy = passUntilAsked(cast(s, "sev", "gsol"));
    const optional = mayCopy.decision?.kind;
    if (optional === "optional-effect") mayCopy = applyPendingChoice(mayCopy.session, { kind: "optional-effect", take: true });
    const { r, asked } = answerCopies(mayCopy, ["gbauble"]);
    const end = drain(r);
    const row = { optional, asked: asked.map((a) => [a.kind, a.rows]), board: end.session.state.players.user.battlefield.map((p) => p.card?.name).sort(), graveyard: end.session.state.players.user.graveyard.map((c) => c.id).sort() };
    console.log(`  WITNESS sevinne ${JSON.stringify(row)}`);
    expect(row).toEqual({ optional: "optional-effect", asked: [["copy-targets", ["keep:gsol", "gstone", "gbauble"]]], board: ["Sol Ring", "Wayfarer's Bauble"], graveyard: ["gstone"] });
  });

  it("⭐ Chain of Vapor on the person's own Sol Ring with only their own Mind Stone left: they are asked the land question (the copy has a legal target — their own), and the copy bounces the Mind Stone they chose", () => {
    const s = pod({ hand: [{ id: "chain", ...CHAIN_OF_VAPOR }], boards: { user: [P("sol", SOL_RING, "user"), P("stone", MIND_STONE, "user"), P("f1", FOREST, "user")] } });
    let r = passUntilAsked(cast(s, "chain", "sol"));
    const landAsk = r.decision?.kind;
    if (landAsk === "optional-sac-payment") r = applyPendingChoice(r.session, { kind: "optional-sac-payment", sac: true, victimId: "f1" });
    const { r: r2, asked } = answerCopies(r, ["stone"]);
    r = r2;
    // The copy's own chain: the Mind Stone's controller (the person) may sacrifice a land again — they have none left.
    for (let k = 0; k < 40 && (r.session.state.stack || []).length; k++) {
      if (r.decision?.kind === "optional-sac-payment") { r = applyPendingChoice(r.session, { kind: "optional-sac-payment", sac: false }); continue; }
      const pass = (r.decision?.options || []).find((x) => x.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    const row = { landAsk, asked: asked.map((a) => [a.kind, a.rows]), hand: userHand(r.session.state), board: onBoard(r.session.state, "user"), graveyard: r.session.state.players.user.graveyard.map((c) => c.id).sort() };
    console.log(`  WITNESS chain ${JSON.stringify(row)}`);
    expect(row).toEqual({ landAsk: "optional-sac-payment", asked: [["copy-targets", ["keep:sol", "stone"]]], hand: ["bolt", "c-sol", "c-stone"], board: [], graveyard: ["c-f1", "chain"] });
  });
});

describe("CR 707.10c — a copied ability: the person keeps its targets or chooses new ones (Strionic Resonator)", () => {
  it("⭐ Strionic Resonator copies the person's Ravenous Chupacabra trigger (at ai1's Hill Giant): the copy asks, the person aims it at ai2's Bears, and both die", () => {
    const s = pod({ hand: [{ id: "chupa", ...RAVENOUS_CHUPACABRA }], boards: { user: [P("reso", STRIONIC_RESONATOR, "user")], ai1: [P("giant", HILL_GIANT, "ai1")], ai2: [P("bear", GRIZZLY_BEARS, "ai2")] } });
    let r = passUntilAsked(cast(s, "chupa", ""));
    const trig = r.decision;
    expect(trig?.kind).toBe("trigger-target");
    r = applyPendingChoice(r.session, { kind: "trigger-target", candidateId: (trig.candidates || []).find((c) => ids(c.targets) === "giant")?.id });
    const trigId = r.session.state.stack.find((o) => o.kind === "triggered-ability")?.id;
    const act = (r.decision?.options || []).find((x) => x.kind === "activate-ability" && (x.permanentId === "reso" || x.sourceId === "reso") && ids(x.targets) === trigId);
    expect(act, "Strionic Resonator is not offered at the trigger").toBeTruthy();
    r = applyChoice(r.session, act);
    const { r: r2, asked } = answerCopies(r, ["bear"]);
    const end = drain(r2);
    const row = { asked: asked.map((a) => [a.kind, a.rows]), ai1: onBoard(end.session.state, "ai1"), ai2: onBoard(end.session.state, "ai2") };
    console.log(`  WITNESS resonator ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", ["keep:giant", "bear"]]], ai1: [], ai2: [] });
  });
});

describe("CR 707.10c — a copied activated ability: the person keeps its target or chooses a new one (Illusionist's Bracers)", () => {
  it("⭐ Prodigal Pyromancer wearing Illusionist's Bracers pings ai1: the Bracers' copy asks, and the person sends the copy at ai2's Llanowar Elves", () => {
    const s0 = pod({ boards: { user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("bracers", ILLUSIONISTS_BRACERS, "user")], ai2: [P("elf", LLANOWAR_ELVES, "ai2")] } });
    const s = attachPermanent(s0, { equipId: "bracers", targetId: "pyro" });
    const first = advanceUntilDecision(session(s));
    const act = (first.decision.options || []).find((x) => x.kind === "activate-ability" && x.permanentId === "pyro" && ids(x.targets) === "ai1");
    expect(act, "Prodigal Pyromancer's ping at ai1 is not offered").toBeTruthy();
    const { r, asked } = answerCopies(applyChoice(first.session, act), ["elf"]);
    const end = drain(r);
    const row = { asked: asked.map((a) => [a.kind, a.rows[0], a.rows.includes("elf"), a.rows.includes("ai2")]), life: life(end.session.state), ai2: onBoard(end.session.state, "ai2") };
    console.log(`  WITNESS bracers ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", "keep:ai1", true, true]], life: { user: 40, ai1: 39, ai2: 40, ai3: 40 }, ai2: [] });
  });
});

describe("CR 707.10c with ward, protection and the copy's slots — the offer is every LEGAL set for the SAME targets", () => {
  it("⭐ ward on a new target (CR 702.21a): the person re-aims a Reverberate copy at ai2's Leonin Lightbringer — its ward is asked of the person after the answer, they pay {2}, and the copy kills it", () => {
    const s = opponentCasts(pod({ hand: [{ id: "rev", ...REVERBERATE }], boards: { user: [P("ubear", GRIZZLY_BEARS, "user")], ai2: [P("leo", LEONIN_LIGHTBRINGER, "ai2")] } }), "ai1", LIGHTNING_BOLT, "aibolt", "ubear");
    const { r, asked } = answerCopies(cast(s, "rev", stackId(s, "Lightning Bolt")), ["leo"]);
    const w = passUntilAsked(r);
    const ward = w.decision;
    const paid = applyPendingChoice(w.session, { kind: "soft-counter", pay: true });
    const end = drain(paid);
    const row = { asked: asked.map((a) => a.kind), ward: [ward?.kind, ward?.controller, ward?.spellName, ward?.sourceName], ai2: onBoard(end.session.state, "ai2"), user: onBoard(end.session.state, "user") };
    console.log(`  WITNESS ward ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: ["copy-targets"], ward: ["soft-counter", "user", "Lightning Bolt", "Leonin Lightbringer"], ai2: [], user: [] });
  });

  it("⭐ protection (CR 702.16b): a Grapeshot copy is never offered ai1's Paladin en-Vec (protection from red) — every other creature and player is", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 1, boards: { ai1: [P("pal", PALADIN_EN_VEC, "ai1")], ai2: [P("elf", LLANOWAR_ELVES, "ai2")] } });
    const { asked } = answerCopies(cast(start, "shot", "ai1"), ["elf"]);
    const row = asked.map((a) => [a.kind, [...a.rows].sort()]);
    expect(row).toEqual([["copy-targets", ["ai2", "ai3", "elf", "keep:ai1", "user"]]]);
  });

  it("⭐ a copy never drops a target (CR 707.10, 601.2c): Strionic Resonator's copy of Chomping Changeling's \"up to one target\" trigger, aimed at ai1's Sol Ring, offers every other artifact (the person's own Strionic Resonator too — the trigger's artifact may be anyone's) — never no target", () => {
    const s = pod({ hand: [{ id: "chomp", ...CHOMPING_CHANGELING }], boards: { user: [P("reso", STRIONIC_RESONATOR, "user")], ai1: [P("sol", SOL_RING, "ai1"), P("stone", MIND_STONE, "ai1")] } });
    let r = passUntilAsked(cast(s, "chomp", ""));
    expect(r.decision?.kind).toBe("trigger-target");
    r = applyPendingChoice(r.session, { kind: "trigger-target", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "sol")?.id });
    const trigId = r.session.state.stack.find((o) => o.kind === "triggered-ability")?.id;
    const act = (r.decision?.options || []).find((x) => x.kind === "activate-ability" && x.permanentId === "reso" && ids(x.targets) === trigId);
    expect(act, "Strionic Resonator is not offered at the trigger").toBeTruthy();
    const { r: r2, asked } = answerCopies(applyChoice(r.session, act), ["stone"]);
    const end = drain(r2);
    const row = { asked: asked.map((a) => [a.kind, a.rows]), ai1: onBoard(end.session.state, "ai1") };
    console.log(`  WITNESS upto ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", ["keep:sol", "reso", "stone"]]], ai1: [] });
  });
});

describe("saves — a game saved mid-question resumes the same", () => {
  it("a Grapeshot copy's question survives a save and load (plain JSON, migrated at the current schema): the restored pause settles exactly as the live one", async () => {
    const { migrate, isResumable, CURRENT_SCHEMA_VERSION } = await import("../server/learnSaveSchema.js");
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 2, boards: { ai2: [P("elf", LLANOWAR_ELVES, "ai2")] } });
    const paused = passUntilAsked(cast(start, "shot", "ai1"));
    const doc = { schemaVersion: CURRENT_SCHEMA_VERSION, kind: "learn-session-save", savedAt: "2026-11-04T00:00:00.000Z", sessionId: "g", serializable: true, session: JSON.parse(JSON.stringify(paused.session)) };
    const loaded = migrate(JSON.parse(JSON.stringify(doc)));
    const resumed = advanceUntilDecision(loaded.session);
    const pick = (r) => (r.decision?.candidates || []).find((c) => ids(c.targets) === "elf")?.id;
    const live = applyPendingChoice(paused.session, { kind: "copy-targets", candidateId: pick(paused) });
    const again = applyPendingChoice(resumed.session, { kind: "copy-targets", candidateId: pick(resumed) });
    expect({ resumable: isResumable(loaded), kind: resumed.decision?.kind, same: JSON.stringify(resumed.decision) === JSON.stringify(paused.decision) }).toEqual({ resumable: true, kind: "copy-targets", same: true });
    expect(JSON.parse(JSON.stringify(again.session.state))).toEqual(JSON.parse(JSON.stringify(live.session.state)));
    const end = drain(answerCopies(again, ["ai3"]).r);
    expect({ life: life(end.session.state), ai2: onBoard(end.session.state, "ai2") }).toEqual({ life: { user: 40, ai1: 39, ai2: 40, ai3: 39 }, ai2: [] });
  });
});

// ── round 2: the blind review's F1–F4 and F6 ──
/** From the driver stop `r` (the person's priority), cast `cardId` at `targetIds`, its action also matching `pred`. */
function castFrom(r, cardId, targetIds, pred = () => true) {
  const action = (r.decision?.options || []).find((a) => a.kind === "cast-spell" && a.cardId === cardId && ids(a.targets) === targetIds && pred(a));
  expect(action, `no cast of ${cardId} at ${targetIds}`).toBeTruthy();
  return applyChoice(r.session, action);
}
/** From the person's priority, activate `permId`'s ability at `targetIds`. */
function activateFrom(r, permId, targetIds) {
  const action = (r.decision?.options || []).find((a) => a.kind === "activate-ability" && a.permanentId === permId && ids(a.targets) === targetIds);
  expect(action, `no activation of ${permId} at ${targetIds}`).toBeTruthy();
  return applyChoice(r.session, action);
}
/** The question's rows as "keep:<id>" / "<id>" (one target per row — a copy is asked one target at a time). */
const rowsOf = (d) => (d?.candidates || []).map((c) => (c.keep ? `keep:${ids(c.targets)}` : ids(c.targets)));
const kc = (a) => JSON.stringify(a.chosenMode) === "[2,3]"; // Kolaghan's Command: destroy target artifact + 2 damage to any target
const SIX = (seat, pfx) => [P(`${pfx}sol`, SOL_RING, seat), P(`${pfx}stone`, MIND_STONE, seat), P(`${pfx}baub`, WAYFARERS_BAUBLE, seat), P(`${pfx}bear`, GRIZZLY_BEARS, seat), P(`${pfx}giant`, HILL_GIANT, seat), P(`${pfx}elf`, LLANOWAR_ELVES, seat)];
const exiled = (s, pid) => (s.players[pid].exile || []).map((c) => c.id).sort();
const counters = (s, pid, id) => s.players[pid].battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;

describe("the review's F1 — a copy is asked one target at a time: every legal set is reachable, the mixed ones included (CR 707.10c, 115.7d, 115.3, 601.2c)", () => {
  it("⭐ Twincast on the person's Kolaghan's Command (at ai1's Sol Ring + ai1): asked the artifact, then the damage — ai2's Mind Stone + ai3 (a set the 64-row offer never reached); Paladin en-Vec (protection from red and black) offered at neither", () => {
    const start = pod({ hand: [{ id: "kc", ...KOLAGHANS_COMMAND }, { id: "twin", ...TWINCAST }], boards: { ai1: SIX("ai1", "a1"), ai2: SIX("ai2", "a2"), ai3: [...SIX("ai3", "a3"), P("a3pal", PALADIN_EN_VEC, "ai3")] } });
    const first = advanceUntilDecision(session(start));
    const kcCast = castFrom(first, "kc", "a1sol+ai1", kc);
    const kcId = stackId(kcCast.session.state, "Kolaghan's Command");
    let r = passUntilAsked(castFrom(kcCast, "twin", kcId));
    const q1 = { kind: r.decision?.kind, slot: [r.decision?.slotNumber, r.decision?.slotCount], rows: rowsOf(r.decision) };
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "a2stone")?.id });
    const q2 = { kind: r.decision?.kind, slot: [r.decision?.slotNumber, r.decision?.slotCount], rows: rowsOf(r.decision) };
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "ai3")?.id });
    const end = drain(r).session.state;
    const row = { q1: [q1.kind, q1.slot, q1.rows.length, q1.rows[0], q1.rows.includes("a2stone"), q1.rows.includes("a3pal")],
      q2: [q2.kind, q2.slot, q2.rows.length, q2.rows[0], q2.rows.includes("ai3"), q2.rows.includes("a3pal")],
      life: life(end), ai1: onBoard(end, "ai1").includes("a1sol"), ai2: onBoard(end, "ai2").includes("a2stone") };
    console.log(`  WITNESS kc-twincast ${JSON.stringify(row)}`);
    // Rows: the artifact — keep (ai1's Sol Ring) and the other 8 artifacts; the damage — keep (ai1), the other 3 players and 9 creatures (never the Paladin).
    expect(row).toEqual({ q1: ["copy-targets", [1, 2], 9, "keep:a1sol", true, false], q2: ["copy-targets", [2, 2], 13, "keep:ai1", true, false],
      life: { user: 40, ai1: 38, ai2: 40, ai3: 38 }, ai1: false, ai2: false });
  });

  it("⭐ the mixed row (CR 115.7d): the person's Kolaghan's Command at ai1's Mind Stone + ai1's Bears, Shatter kills the Mind Stone, Twincast copies the Command — keep the dead Mind Stone, send the damage to ai2's Hill Giant (the person's Sol Ring is never forced)", () => {
    const start = pod({ hand: [{ id: "kc", ...KOLAGHANS_COMMAND }, { id: "shat", ...SHATTER }, { id: "twin", ...TWINCAST }], boards: { user: [P("usol", SOL_RING, "user")], ai1: [P("a1stone", MIND_STONE, "ai1"), P("a1bear", GRIZZLY_BEARS, "ai1")], ai2: [P("a2giant", HILL_GIANT, "ai2")] } });
    const first = advanceUntilDecision(session(start));
    const kcCast = castFrom(first, "kc", "a1stone+a1bear", kc);
    const kcId = stackId(kcCast.session.state, "Kolaghan's Command");
    let r = castFrom(kcCast, "shat", "a1stone");
    for (let k = 0; k < 10 && r.session.state.stack.some((o) => o.source?.name === "Shatter"); k++) r = applyChoice(r.session, (r.decision.options || []).find((a) => a.kind === "pass-priority"));
    r = passUntilAsked(castFrom(r, "twin", kcId));
    const q1 = rowsOf(r.decision);
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => c.keep)?.id });
    const q2 = rowsOf(r.decision);
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "a2giant")?.id });
    const end = drain(r).session.state;
    const giant = end.players.ai2.battlefield.find((p) => p.id === "a2giant");
    const row = { q1, q2: [q2[0], q2.includes("a2giant")], usol: onBoard(end, "user").includes("usol"), giantDamage: giant?.damageMarked ?? null, a1bear: onBoard(end, "ai1").includes("a1bear") };
    console.log(`  WITNESS kc-mixed ${JSON.stringify(row)}`);
    expect(row).toEqual({ q1: ["keep:a1stone", "usol"], q2: ["keep:a1bear", true], usol: true, giantDamage: 2, a1bear: false });
  });

  it("⭐ Strionic Resonator on the person's Grasp of Fate trigger (one target per opponent): asked opponent by opponent — ai1's third permanent, ai2's kept, ai3's second (a set the 64-row offer never reached)", () => {
    const FIVE = (seat, pfx) => [P(`${pfx}p0`, SOL_RING, seat), P(`${pfx}p1`, MIND_STONE, seat), P(`${pfx}p2`, WAYFARERS_BAUBLE, seat), P(`${pfx}p3`, GRIZZLY_BEARS, seat), P(`${pfx}p4`, HILL_GIANT, seat)];
    const start = pod({ hand: [{ id: "grasp", ...GRASP_OF_FATE }], boards: { user: [P("reso", STRIONIC_RESONATOR, "user")], ai1: FIVE("ai1", "a1"), ai2: FIVE("ai2", "a2"), ai3: FIVE("ai3", "a3") } });
    let r = passUntilAsked(castFrom(advanceUntilDecision(session(start)), "grasp", ""));
    for (const pick of ["a1p0", "a2p0", "a3p0"]) {
      expect(r.decision?.kind).toBe("trigger-target");
      r = applyPendingChoice(r.session, { kind: "trigger-target", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === pick)?.id });
    }
    const trigId = r.session.state.stack.find((o) => o.kind === "triggered-ability")?.id;
    r = passUntilAsked(activateFrom(r, "reso", trigId));
    const asked = [];
    for (const pick of ["a1p2", "keep", "a3p1"]) {
      asked.push([r.decision?.kind, r.decision?.slotNumber, rowsOf(r.decision).length, rowsOf(r.decision)[0]]);
      const c = (r.decision?.candidates || []).find((x) => (pick === "keep" ? x.keep : ids(x.targets) === pick));
      r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: c?.id });
    }
    const end = drain(r).session.state;
    const row = { asked, ai1: exiled(end, "ai1"), ai2: exiled(end, "ai2"), ai3: exiled(end, "ai3") };
    console.log(`  WITNESS grasp-resonator ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [["copy-targets", 1, 5, "keep:a1p0"], ["copy-targets", 2, 5, "keep:a2p0"], ["copy-targets", 3, 5, "keep:a3p0"]],
      ai1: ["c-a1p0", "c-a1p2"], ai2: ["c-a2p0"], ai3: ["c-a3p0", "c-a3p1"] });
  });

  it("⭐ Strionic Resonator on Rishkar, Peema Renegade's \"each of up to two target creatures\" (17 creatures): a pair of ai2's and ai3's creatures, and the second target never offers the first's (CR 115.3)", () => {
    const FOUR = (seat, pfx) => [P(`${pfx}c0`, GRIZZLY_BEARS, seat), P(`${pfx}c1`, HILL_GIANT, seat), P(`${pfx}c2`, LLANOWAR_ELVES, seat), P(`${pfx}c3`, GRIZZLY_BEARS, seat)];
    const start = pod({ hand: [{ id: "rish", ...RISHKAR_PEEMA_RENEGADE }], boards: { user: [P("reso", STRIONIC_RESONATOR, "user"), ...FOUR("user", "u")], ai1: FOUR("ai1", "a1"), ai2: FOUR("ai2", "a2"), ai3: FOUR("ai3", "a3") } });
    let r = passUntilAsked(castFrom(advanceUntilDecision(session(start)), "rish", ""));
    expect(r.decision?.kind).toBe("trigger-target");
    r = applyPendingChoice(r.session, { kind: "trigger-target", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "uc0+uc1")?.id });
    const trigId = r.session.state.stack.find((o) => o.kind === "triggered-ability")?.id;
    r = passUntilAsked(activateFrom(r, "reso", trigId));
    const q1 = rowsOf(r.decision);
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "a2c0")?.id });
    const q2 = rowsOf(r.decision);
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "a3c1")?.id });
    const end = drain(r).session.state;
    const row = { q1: [q1.length, q1[0], q1.includes("uc1")], q2: [q2.length, q2[0], q2.includes("a2c0")],
      counters: { uc0: counters(end, "user", "uc0"), uc1: counters(end, "user", "uc1"), a2c0: counters(end, "ai2", "a2c0"), a3c1: counters(end, "ai3", "a3c1") } };
    console.log(`  WITNESS rishkar-resonator ${JSON.stringify(row)}`);
    // The first target: keep (uc0) and the 16 other creatures (uc1, the second target's kept creature, among them — it can change too);
    // the second: keep (uc1) and the 15 creatures that are neither it nor the first target's new a2c0.
    expect(row).toEqual({ q1: [17, "keep:uc0", true], q2: [16, "keep:uc1", false], counters: { uc0: 1, uc1: 1, a2c0: 1, a3c1: 1 } });
  });
});

describe("the review's F2 — the self-copy has the spell's colours: Chain of Vapor's copy never offers or bounces a creature with protection from blue (CR 707.2, 707.10, 702.16b)", () => {
  it("⭐ the person's copy: Chain of Vapor on their own Sol Ring, ai1's Yavimaya Barbarian and Mind Stone — the copy offers keep and the Mind Stone, never the Barbarian", () => {
    const s = pod({ hand: [{ id: "chain", ...CHAIN_OF_VAPOR }], boards: { user: [P("sol", SOL_RING, "user"), P("f1", FOREST, "user")], ai1: [P("barb", YAVIMAYA_BARBARIAN, "ai1"), P("a1stone", MIND_STONE, "ai1")] } });
    let r = passUntilAsked(cast(s, "chain", "sol"));
    expect(r.decision?.kind).toBe("optional-sac-payment");
    r = passUntilAsked(applyPendingChoice(r.session, { kind: "optional-sac-payment", sac: true, victimId: "f1" }));
    const rows = rowsOf(r.decision);
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision.candidates || []).find((c) => ids(c.targets) === "a1stone")?.id });
    const end = drain(r).session.state;
    expect({ kind: "copy-targets", rows, barb: onBoard(end, "ai1").includes("barb"), stone: end.players.ai1.hand.map((c) => c.id) }).toEqual({ kind: "copy-targets", rows: ["keep:sol", "a1stone"], barb: true, stone: ["c-a1stone"] });
  });

  it("⭐ the AI's copy: the person's Chain of Vapor at ai1's Bears, ai1 gives up its Forest token to copy it at the person's Yavimaya Barbarian — the copy is blue, so it fizzles and the Barbarian stays", () => {
    const s = pod({ hand: [{ id: "chain", ...CHAIN_OF_VAPOR }], boards: { user: [P("ubarb", YAVIMAYA_BARBARIAN, "user")], ai1: [P("a1bear", GRIZZLY_BEARS, "ai1"), P("ftok", { ...FOREST, token: true }, "ai1")] } });
    const end = drain(cast(s, "chain", "a1bear")).session.state;
    const log = end.log || [];
    const row = { copied: log.some((e) => e.effect === "self-copy"), ubarb: onBoard(end, "user").includes("ubarb"), userHand: userHand(end).includes("c-ubarb") };
    console.log(`  WITNESS chain-ai-barbarian ${JSON.stringify(row)}`);
    expect(row).toEqual({ copied: true, ubarb: true, userHand: false });
  });
});

describe("the review's F3 — a copy's targets become its targets (CR 601.2c, 707.10c): becomes-the-target triggers and Kira see copies", () => {
  it("⭐ Phantasmal Bear: the person's Grapeshot storm copy re-aimed at ai2's Phantasmal Bear — it is sacrificed", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 1, boards: { ai2: [P("pbear", PHANTASMAL_BEAR, "ai2")] } });
    const { r } = answerCopies(cast(start, "shot", "ai1"), ["pbear"]);
    const end = drain(r).session.state;
    expect({ onBoard: onBoard(end, "ai2"), gy: end.players.ai2.graveyard.map((c) => c.id), ai1: end.players.ai1.life }).toEqual({ onBoard: [], gy: ["c-pbear"], ai1: 39 });
  });

  it("⭐ Kira, Great Glass-Spinner: the person's Twincast copy of ai1's Bolt re-aimed at ai2's Hill Giant is countered (the Giant's first time this turn) — the Giant lives, the Bolt still hits the person", () => {
    const s = opponentCasts(pod({ hand: [{ id: "twin", ...TWINCAST }], boards: { ai2: [P("kira", KIRA_GREAT_GLASS_SPINNER, "ai2"), P("a2giant", HILL_GIANT, "ai2")] } }), "ai1", LIGHTNING_BOLT, "aibolt", "user");
    const { r } = answerCopies(cast(s, "twin", stackId(s, "Lightning Bolt")), ["a2giant"]);
    const end = drain(r).session.state;
    const giant = end.players.ai2.battlefield.find((p) => p.id === "a2giant");
    expect({ giant: !!giant, damage: giant?.damageMarked ?? 0, user: end.players.user.life }).toEqual({ giant: true, damage: 0, user: 37 });
  });

  it("⭐ valiant: the person's Astral Steel storm copy re-aimed at their own Heartfire Hero — a +1/+1 counter (the original went at their Bears)", () => {
    const start = pod({ hand: [{ id: "steel", ...ASTRAL_STEEL }], spellsCast: 1, boards: { user: [P("ubear", GRIZZLY_BEARS, "user"), P("hero", HEARTFIRE_HERO, "user")] } });
    const { r } = answerCopies(cast(start, "steel", "ubear"), ["hero"]);
    const end = drain(r).session.state;
    expect({ hero: counters(end, "user", "hero"), bear: counters(end, "user", "ubear") }).toEqual({ hero: 1, bear: 0 });
  });

  it("⭐ the house copy too (every seat): no person at the table, Grapeshot with storm 1 — its copy takes the house pick, ai2's Phantasmal Bear, which is sacrificed", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 1, humans: null, boards: { ai2: [P("pbear", PHANTASMAL_BEAR, "ai2")] } });
    const end = drain(cast(start, "shot", "ai1")).session.state;
    expect({ onBoard: onBoard(end, "ai2"), gy: end.players.ai2.graveyard.map((c) => c.id) }).toEqual({ onBoard: [], gy: ["c-pbear"] });
  });
});

describe("the review's F4 — a Bracers copy is the Bracers' controller's (CR 707.10, 603.3a, 301.5d)", () => {
  it("⭐ ai1's Illusionist's Bracers on the person's Prodigal Pyromancer: the person pings ai1, and the Bracers' copy is ai1's — the person is asked nothing", () => {
    const s0 = pod({ boards: { user: [P("upyro", PRODIGAL_PYROMANCER, "user")], ai1: [P("a1brace", ILLUSIONISTS_BRACERS, "ai1")] } });
    const s = attachPermanent(s0, { equipId: "a1brace", targetId: "upyro" });
    let r = activateFrom(advanceUntilDecision(session(s)), "upyro", "ai1");
    const kinds = [];
    for (let k = 0; k < 30 && (r.session.state.stack || []).length; k++) {
      kinds.push(r.decision?.kind);
      const pass = (r.decision?.options || []).find((a) => a.kind === "pass-priority");
      if (!pass) break;
      r = applyChoice(r.session, pass);
    }
    const copyLog = (r.session.state.log || []).find((e) => e.kind === "copy-ability");
    expect({ asked: kinds.includes("copy-targets"), copier: copyLog?.controller ?? null }).toEqual({ asked: false, copier: "ai1" });
  });

  it("⭐ the person's Illusionist's Bracers on ai1's Prodigal Pyromancer: ai1 pings the person, and the Bracers' copy is the person's — asked, they send it at ai2", () => {
    const s0 = pod({ boards: { user: [P("ubrace", ILLUSIONISTS_BRACERS, "user")], ai1: [P("a1pyro", PRODIGAL_PYROMANCER, "ai1")] } });
    const s1 = { ...attachPermanent(s0, { equipId: "ubrace", targetId: "a1pyro" }), priorityHolder: "ai1" };
    const a = legalActionsForPlayer(s1, "ai1").find((x) => x.kind === "activate-ability" && x.permanentId === "a1pyro" && ids(x.targets) === "user");
    expect(a, "ai1's ping at the person is not offered").toBeTruthy();
    const s = { ...dispatchAction(s1, a), priorityHolder: "user", consecutivePasses: 0 };
    const { r, asked } = answerCopies(advanceUntilDecision(session(s)), ["ai2"]);
    const end = drain(r).session.state;
    expect({ asked: asked.map((x) => [x.kind, x.rows[0]]), life: life(end) }).toEqual({ asked: [["copy-targets", "keep:user"]], life: { user: 39, ai1: 40, ai2: 39, ai3: 40 } });
  });
});

describe("the review's F6 — Deflecting Swat: a person chooses any legal new targets (CR 115.7d), whoever the spell is aimed at", () => {
  it("⭐ ai1's Lightning Bolt at the person: their Deflecting Swat offers keep and every legal target — ai1, ai3 and ai3's Bears among them — and they send it at ai1", () => {
    const s = opponentCasts(pod({ hand: [{ id: "swat", ...DEFLECTING_SWAT }], boards: { ai2: [P("elf", LLANOWAR_ELVES, "ai2")], ai3: [P("a3bear", GRIZZLY_BEARS, "ai3")] } }), "ai1", LIGHTNING_BOLT, "aibolt", "user");
    let r = passUntilAsked(cast(s, "swat", stackId(s, "Lightning Bolt")));
    if (r.decision?.kind === "optional-effect") r = passUntilAsked(applyPendingChoice(r.session, { kind: "optional-effect", take: true }));
    const d = r.decision;
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (d?.candidates || []).find((c) => ids(c.targets) === "ai1")?.id });
    const end = drain(r).session.state;
    const rows = rowsOf(d);
    expect({ kind: d?.kind, retarget: !!d?.retarget, first: rows[0], has: ["ai1", "ai3", "a3bear", "elf"].map((x) => rows.includes(x)), life: life(end) })
      .toEqual({ kind: "copy-targets", retarget: true, first: "keep:user", has: [true, true, true, true], life: { user: 40, ai1: 37, ai2: 40, ai3: 40 } });
  });

  it("⭐ ai1's Lightning Bolt at ai2 (not at the person): their Deflecting Swat still lets them choose — they send it at ai3", () => {
    const s = opponentCasts(pod({ hand: [{ id: "swat", ...DEFLECTING_SWAT }] }), "ai1", LIGHTNING_BOLT, "aibolt", "ai2");
    let r = passUntilAsked(cast(s, "swat", stackId(s, "Lightning Bolt")));
    if (r.decision?.kind === "optional-effect") r = passUntilAsked(applyPendingChoice(r.session, { kind: "optional-effect", take: true }));
    const d = r.decision;
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (d?.candidates || []).find((c) => ids(c.targets) === "ai3")?.id });
    const end = drain(r).session.state;
    expect({ kind: d?.kind, first: rowsOf(d)[0], life: life(end) }).toEqual({ kind: "copy-targets", first: "keep:ai2", life: { user: 40, ai1: 40, ai2: 40, ai3: 37 } });
  });
});

// ── round 3: the review's R2-F1, R2-F2 and R2-F3 ──
const SEAT_PFX = { user: "u", ai1: "a1", ai2: "a2", ai3: "a3" };
/**
 * Each seat's graveyard holds `n` cards (a number for every seat, or `{ seat: n }` — the rest empty), alternately Grizzly Bears and
 * Lightning Bolt: `<pfx>g0`, `<pfx>g1`, … — the same card at the same index every time, so a graveyard can be grown under a spell
 * already cast at its first cards.
 */
const withGraveyards = (s, n) => ({ ...s, players: Object.fromEntries(Object.entries(s.players).map(([pid, p]) => [pid, { ...p, graveyard: Array.from({ length: typeof n === "number" ? n : (n[pid] ?? 0) }, (_, i) => ({ id: `${SEAT_PFX[pid]}g${i}`, ...(i % 2 ? LIGHTNING_BOLT : GRIZZLY_BEARS) })) }])) });
/**
 * The driver stop `r` with every graveyard grown to twenty cards. The spell is cast while only the graveyard it names holds cards: the
 * cast offer itself is bounded (castSlots — on twenty-card graveyards it offers Memory's Journey two cards and Shred Memory one), and
 * the boards under test are the copy's.
 */
const grow = (r) => ({ ...r, session: { ...r.session, state: withGraveyards(r.session.state, N20) } });
/**
 * Answer each copy-targets question with the next of `picks` ("keep", or a row's target id), recording each question's slot, rows and the
 * time of one candidate computation at it (newTargetCandidates on the waiting object, as the raise and the settle run it). Stops at the
 * first stop that isn't a copy-targets question, or at a pick that isn't offered (recorded, so the row reads it — never a thrown expect).
 */
function chainAnswers(r, picks) {
  const qs = [];
  for (const want of picks) {
    r = passUntilAsked(r);
    if (r.decision?.kind === "optional-effect") r = passUntilAsked(applyPendingChoice(r.session, { kind: "optional-effect", take: true }));
    const d = r.decision;
    if (d?.kind !== "copy-targets") { qs.push({ kind: d?.kind ?? null }); break; }
    const s = r.session.state;
    const obj = s.stack.find((o) => o.awaitingCopyTargets);
    const ask = obj.awaitingCopyTargets;
    const t0 = performance.now();
    newTargetCandidates(s, obj, ask.positions, ask.chosen, ask.at);
    const ms = Math.round(performance.now() - t0);
    const rows = rowsOf(d);
    qs.push({ slot: d.slotNumber, of: d.slotCount, rows, ms });
    const c = (d.candidates || []).find((x) => (want === "keep" ? x.keep : !x.keep && ids(x.targets) === want));
    if (!c) { qs.push({ missing: want }); break; }
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: c.id });
  }
  return { r, qs };
}
const qShape = (qs) => qs.map((q) => (q.rows ? [q.slot, q.of, q.rows.length, q.rows[0]] : q));
const budgetLogs = (s) => (s.log || []).filter((e) => e.kind === "copy-targets-search-budget").length;
const gyIds = (s, pid) => s.players[pid].graveyard.map((c) => c.id);
const seatsIn = (rows) => [...new Set(rows.map((x) => x.replace(/^keep:/, "").replace(/g\d+$/, "")))];
const N20 = 20;
const T120 = 120_000;

describe("the review's R2-F1 — a joint-constraint atom is pruned at every target, so on ordinary graveyards every legal player and graveyard is offered and every target is asked (CR 707.10c, 115.7d, 601.2c)", () => {
  it("⭐ Twincast on the person's Memory's Journey (ai1 + three of ai1's cards), twenty cards in every graveyard: the player offers all four players; moved to ai3, only ai3's cards follow; the copy shuffles them in", () => {
    const start = withGraveyards(pod({ hand: [{ id: "mj", ...MEMORY_S_JOURNEY }, { id: "twin", ...TWINCAST }] }), { ai1: 3 });
    const mjCast = grow(castFrom(advanceUntilDecision(session(start)), "mj", "ai1+a1g0+a1g1+a1g2"));
    const { r, qs } = chainAnswers(castFrom(mjCast, "twin", stackId(mjCast.session.state, "Memory's Journey")), ["ai3", "a3g0", "a3g1", "a3g2"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME memorys-journey ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), players: qs[0]?.rows, cardSeats: qs[1]?.rows ? seatsIn(qs[1].rows) : null, gy: [gyIds(end, "ai1").length, gyIds(end, "ai3").length], lib3: end.players.ai3.library.length, budget: budgetLogs(end) };
    console.log(`  WITNESS r2f1-mj ${JSON.stringify(row)}`);
    expect(row).toEqual({ q: [[1, 4, 4, "keep:ai1"], [2, 4, 20, "a3g0"], [3, 4, 19, "a3g1"], [4, 4, 18, "a3g2"]], players: ["keep:ai1", "user", "ai2", "ai3"], cardSeats: ["a3"], gy: [17, 17], lib3: 9, budget: 0 });
  }, T120);

  it("⭐ ai1's Memory's Journey at the person (and three of their cards), twenty cards in every graveyard: the person's Deflecting Swat asks the player — never filled unasked — and they move it all to ai2", () => {
    const s = withGraveyards(opponentCasts(withGraveyards(pod({ hand: [{ id: "swat", ...DEFLECTING_SWAT }] }), { user: 3 }), "ai1", MEMORY_S_JOURNEY, "aimj", "user+ug0+ug1+ug2"), N20);
    const { r, qs } = chainAnswers(cast(s, "swat", stackId(s, "Memory's Journey")), ["ai2", "a2g0", "a2g1", "a2g2"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME swat-memorys-journey ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), players: qs[0]?.rows, gy: [gyIds(end, "user").length, gyIds(end, "ai2").length], budget: budgetLogs(end) };
    console.log(`  WITNESS r2f1-swat ${JSON.stringify(row)}`);
    // The person's graveyard: their twenty cards, untouched, and the Deflecting Swat.
    expect(row).toEqual({ q: [[1, 4, 4, "keep:user"], [2, 4, 20, "a2g0"], [3, 4, 19, "a2g1"], [4, 4, 18, "a2g2"]], players: ["keep:user", "ai1", "ai2", "ai3"], gy: [21, 17], budget: 0 });
  }, T120);

  it("⭐ Twincast on the person's Dwell on the Past (ai1 + four of ai1's cards), twenty cards in every graveyard: the player offers all four players, and the copy takes four of ai2's", () => {
    const start = withGraveyards(pod({ hand: [{ id: "dwell", ...DWELL_ON_THE_PAST }, { id: "twin", ...TWINCAST }] }), { ai1: 4 });
    const dwellCast = grow(castFrom(advanceUntilDecision(session(start)), "dwell", "ai1+a1g0+a1g1+a1g2+a1g3"));
    const { r, qs } = chainAnswers(castFrom(dwellCast, "twin", stackId(dwellCast.session.state, "Dwell on the Past")), ["ai2", "a2g4", "a2g5", "a2g6", "a2g7"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME dwell-on-the-past ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), players: qs[0]?.rows, gy: [gyIds(end, "ai1").length, gyIds(end, "ai2").length], budget: budgetLogs(end) };
    console.log(`  WITNESS r2f1-dwell ${JSON.stringify(row)}`);
    expect(row).toEqual({ q: [[1, 5, 4, "keep:ai1"], [2, 5, 20, "a2g0"], [3, 5, 19, "a2g0"], [4, 5, 18, "a2g0"], [5, 5, 17, "a2g0"]], players: ["keep:ai1", "user", "ai2", "ai3"], gy: [16, 16], budget: 0 });
  }, T120);

  it("⭐ Reverberate on the person's Stream of Consciousness (ai1 + four of ai1's cards), twenty cards in every graveyard: the player offers all four players, and the copy takes four of ai3's", () => {
    const start = withGraveyards(pod({ hand: [{ id: "stream", ...STREAM_OF_CONSCIOUSNESS }, { id: "rev", ...REVERBERATE }] }), { ai1: 4 });
    const streamCast = grow(castFrom(advanceUntilDecision(session(start)), "stream", "ai1+a1g0+a1g1+a1g2+a1g3"));
    const { r, qs } = chainAnswers(castFrom(streamCast, "rev", stackId(streamCast.session.state, "Stream of Consciousness")), ["ai3", "a3g16", "a3g17", "a3g18", "a3g19"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME stream-of-consciousness ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), players: qs[0]?.rows, gy: [gyIds(end, "ai1").length, gyIds(end, "ai3").length], lib3: end.players.ai3.library.length, budget: budgetLogs(end) };
    console.log(`  WITNESS r2f1-stream ${JSON.stringify(row)}`);
    expect(row).toEqual({ q: [[1, 5, 4, "keep:ai1"], [2, 5, 20, "a3g0"], [3, 5, 19, "a3g0"], [4, 5, 18, "a3g0"], [5, 5, 17, "a3g0"]], players: ["keep:ai1", "user", "ai2", "ai3"], gy: [16, 16], lib3: 10, budget: 0 });
  }, T120);

  it("⭐ Twincast on the person's Shred Memory (four of ai1's cards), twenty cards in every graveyard: the first card offers every graveyard's cards; moved to ai3's, only ai3's follow (a single graveyard), and the copy exiles them", () => {
    const start = withGraveyards(pod({ hand: [{ id: "shred", ...SHRED_MEMORY }, { id: "twin", ...TWINCAST }] }), { ai1: 4 });
    const shredCast = grow(castFrom(advanceUntilDecision(session(start)), "shred", "a1g0+a1g1+a1g2+a1g3"));
    const { r, qs } = chainAnswers(castFrom(shredCast, "twin", stackId(shredCast.session.state, "Shred Memory")), ["a3g5", "a3g6", "a3g7", "a3g8"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME shred-memory ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), firstSeats: qs[0]?.rows ? seatsIn(qs[0].rows) : null, nextSeats: qs[1]?.rows ? seatsIn(qs[1].rows) : null, exiled: [exiled(end, "ai1").length, exiled(end, "ai3")], budget: budgetLogs(end) };
    console.log(`  WITNESS r2f1-shred ${JSON.stringify(row)}`);
    // The first card: keep (a1g0) and the 79 other cards of the four graveyards (ai1's three other kept cards too — a kept duplicate is then changed).
    expect(row).toEqual({ q: [[1, 4, 80, "keep:a1g0"], [2, 4, 19, "a3g0"], [3, 4, 18, "a3g0"], [4, 4, 17, "a3g0"]], firstSeats: ["a1", "u", "a2", "a3"], nextSeats: ["a3"],
      exiled: [4, ["a3g5", "a3g6", "a3g7", "a3g8"]], budget: 0 });
  }, T120);

  it("control (the same on the base): Twincast on the person's Rapid Decay (three of ai1's cards), twenty cards in every graveyard — the first card offers every graveyard's cards", () => {
    const start = withGraveyards(pod({ hand: [{ id: "decay", ...RAPID_DECAY }, { id: "twin", ...TWINCAST }] }), { ai1: 3 });
    const decayCast = grow(castFrom(advanceUntilDecision(session(start)), "decay", "a1g0+a1g1+a1g2"));
    const { r, qs } = chainAnswers(castFrom(decayCast, "twin", stackId(decayCast.session.state, "Rapid Decay")), ["a2g3", "a2g4", "a2g5"]);
    const end = drain(r).session.state;
    console.log(`  WITNESS-TIME rapid-decay ${JSON.stringify(qs.map((q) => q.ms))}`);
    const row = { q: qShape(qs), firstSeats: qs[0]?.rows ? seatsIn(qs[0].rows) : null, exiled: exiled(end, "ai2") };
    console.log(`  WITNESS r2f1-decay ${JSON.stringify(row)}`);
    expect(row).toEqual({ q: [[1, 3, 80, "keep:a1g0"], [2, 3, 19, "a2g0"], [3, 3, 18, "a2g0"]], firstSeats: ["a1", "u", "a2", "a3"], exiled: ["a2g3", "a2g4", "a2g5"] });
  }, T120);

  it("control (the same on the base): Twincast on the person's Kolaghan's Command — every one of the 117 artifact × any-target pairs is reachable", () => {
    const start = pod({ hand: [{ id: "kc", ...KOLAGHANS_COMMAND }, { id: "twin", ...TWINCAST }], boards: { ai1: SIX("ai1", "a1"), ai2: SIX("ai2", "a2"), ai3: [...SIX("ai3", "a3"), P("a3pal", PALADIN_EN_VEC, "ai3")] } });
    const kcCast = castFrom(advanceUntilDecision(session(start)), "kc", "a1sol+ai1", kc);
    const r = passUntilAsked(castFrom(kcCast, "twin", stackId(kcCast.session.state, "Kolaghan's Command")));
    const pairs = [];
    for (const c1 of r.decision.candidates || []) {
      const r2 = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: c1.id });
      for (const c2 of r2.decision?.candidates || []) pairs.push(`${ids(c1.targets)}|${ids(c2.targets)}`);
    }
    expect({ pairs: pairs.length, distinct: new Set(pairs).size, paladin: pairs.some((p) => p.includes("a3pal")) }).toEqual({ pairs: 117, distinct: 117, paladin: false });
  });
});

/** The stack, bottom to top, as "<source name>:<controller>" (a triggered ability "<source>^:<controller>"). */
const stackRead = (s) => (s.stack || []).map((o) => `${o.source?.name ?? o.kind}${o.kind === "trigger" || o.kind === "triggered-ability" ? "^" : ""}:${o.controller}`);

describe("the review's R2-F2 — a person's copy keeps the resolution's triggers in ONE batch: what made the copy and what its targets triggered go on the stack together (CR 603.3b, 101.4)", () => {
  it("⭐ APNAP: ai1 is active, ai1's Bolt at the person's Bears, the person (Storm-Kiln Artist out) Twincasts it and re-aims the copy at ai1's Phantasmal Bear — ai1's Bear trigger goes on the stack first, below the person's Storm-Kiln trigger", () => {
    const base = pod({ hand: [{ id: "twin", ...TWINCAST }], boards: { user: [P("ubear", GRIZZLY_BEARS, "user"), P("ska", STORM_KILN_ARTIST, "user")], ai1: [P("a1pbear", PHANTASMAL_BEAR, "ai1")] } });
    const s = opponentCasts({ ...base, activePlayer: "ai1" }, "ai1", LIGHTNING_BOLT, "aibolt", "ubear");
    let r = passUntilAsked(cast(s, "twin", stackId(s, "Lightning Bolt")));
    const asked = r.decision?.kind;
    r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (r.decision?.candidates || []).find((c) => ids(c.targets) === "a1pbear")?.id });
    const st = r.session.state;
    const above = (st.stack || []).slice(2).map((o) => o.controller);
    const row = { asked, pending: r.decision?.kind ?? null, depth: st.stack.length, above };
    console.log(`  WITNESS r2f2-apnap ${JSON.stringify({ ...row, stack: stackRead(st) })}`);
    // Bottom to top: ai1's Bolt, the person's copy, ai1's Phantasmal Bear trigger (the active player's, first), the person's Storm-Kiln trigger.
    expect(row).toEqual({ asked: "copy-targets", pending: "ask", depth: 4, above: ["ai1", "user"] });
  });

  it("⭐ one order question: the person's Grapeshot with storm 2 (Storm-Kiln Artist out), copy 1 at ai1's Phantasmal Bear and copy 2 at their own Heartfire Hero — they order their two Storm-Kiln triggers and the valiant trigger together", () => {
    const start = pod({ hand: [{ id: "shot", ...GRAPESHOT }], spellsCast: 2, boards: { user: [P("ska", STORM_KILN_ARTIST, "user"), P("hero", HEARTFIRE_HERO, "user")], ai1: [P("a1pbear", PHANTASMAL_BEAR, "ai1")] } });
    let r = cast(start, "shot", "ai1");
    const seen = [];
    const picks = ["a1pbear", "hero"];
    let order = null;
    for (let k = 0; k < 12; k++) {
      r = passUntilAsked(r);
      const d = r.decision;
      if (d?.kind === "copy-targets" && picks.length) {
        seen.push("copy-targets");
        const want = picks.shift();
        r = applyPendingChoice(r.session, { kind: "copy-targets", candidateId: (d.candidates || []).find((c) => ids(c.targets) === want)?.id });
      } else if (d?.kind === "trigger-order") {
        const names = (d.candidates || []).map((c) => c.sourceName).sort();
        seen.push(`trigger-order:${names.join("+")}`);
        if (!picks.length) order = names;
        r = applyPendingChoice(r.session, { kind: "trigger-order", resolveOrder: (d.candidates || []).map((c) => c.id) });
      } else break;
    }
    const end = drain(r).session.state;
    const row = { seen, order, hero: counters(end, "user", "hero"), ai1: onBoard(end, "ai1"), treasures: end.players.user.battlefield.filter((p) => p.card?.name === "Treasure").length };
    console.log(`  WITNESS r2f2-order ${JSON.stringify(row)}`);
    // The cast's own pair (storm, Storm-Kiln's cast trigger), the two copies, then ONE question for the copies' batch.
    expect(row).toEqual({ seen: ["trigger-order:Grapeshot+Storm-Kiln Artist", "copy-targets", "copy-targets", "trigger-order:Heartfire Hero+Storm-Kiln Artist+Storm-Kiln Artist"],
      order: ["Heartfire Hero", "Storm-Kiln Artist", "Storm-Kiln Artist"], hero: 1, ai1: [], treasures: 3 });
  });
});

describe("the review's R2-F3 — Deflecting Swat's new targets become its targets, for every seat (CR 601.2c, 115.7d): Kira and Phantasmal Bear see them", () => {
  it("⭐ the person's Swat: ai1's Bolt at the person, Swatted onto ai2's Hill Giant under ai2's Kira — the Bolt is countered and the Giant lives", () => {
    const s = opponentCasts(pod({ hand: [{ id: "swat", ...DEFLECTING_SWAT }], boards: { ai2: [P("kira", KIRA_GREAT_GLASS_SPINNER, "ai2"), P("a2giant", HILL_GIANT, "ai2")] } }), "ai1", LIGHTNING_BOLT, "aibolt", "user");
    const { r, qs } = chainAnswers(cast(s, "swat", stackId(s, "Lightning Bolt")), ["a2giant"]);
    const end = drain(r).session.state;
    const giant = end.players.ai2.battlefield.find((p) => p.id === "a2giant");
    const row = { asked: qShape(qs).map((q) => q[0]), giant: !!giant, damage: giant?.damageMarked ?? null, life: life(end), countered: (end.log || []).some((e) => e.kind === "spell-effect" && e.effect === "counter" && e.cardName === "Lightning Bolt") };
    console.log(`  WITNESS r2f3-person ${JSON.stringify(row)}`);
    expect(row).toEqual({ asked: [1], giant: true, damage: 0, life: { user: 40, ai1: 40, ai2: 40, ai3: 40 }, countered: true });
  });

  it("⭐ the AI's Swat (the house branch): the person's Unsummon at ai1's Hill Giant, ai1 Swats it — the house moves it onto ai2's Phantasmal Bear, which is sacrificed, and the Unsummon has no target left", () => {
    const s0 = pod({ hand: [{ id: "uns", ...UNSUMMON }], boards: { ai1: [P("a1giant", HILL_GIANT, "ai1")], ai2: [P("a2pbear", PHANTASMAL_BEAR, "ai2")] } });
    const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "uns" && ids(x.targets) === "a1giant");
    expect(a, "the person's Unsummon at ai1's Giant is not offered").toBeTruthy();
    const s1 = dispatchAction(s0, a);
    const s = opponentCasts(s1, "ai1", DEFLECTING_SWAT, "aiswat", stackId(s1, "Unsummon"));
    const end = drain(advanceUntilDecision(session(s))).session.state;
    const retarget = (end.log || []).find((e) => e.effect === "retarget");
    const row = { to: retarget?.to ?? null, ai1: onBoard(end, "ai1"), ai2: onBoard(end, "ai2"), ai2gy: gyIds(end, "ai2"), ai2hand: end.players.ai2.hand.map((c) => c.id) };
    console.log(`  WITNESS r2f3-house ${JSON.stringify(row)}`);
    expect(row).toEqual({ to: ["Phantasmal Bear"], ai1: ["a1giant"], ai2: [], ai2gy: ["c-a2pbear"], ai2hand: [] });
  });
});
