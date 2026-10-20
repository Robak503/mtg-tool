/**
 * aiActivationWindows.test.js — the default AI's first activation windows outside its own main phase (AI decision quality; the
 * offer and the resolution are unchanged).
 *
 * Since 2026-10-20 every activated ability is offered whenever its controller holds priority (CR 117.1b, 602.1b), but the default
 * AI kept to the windows its pickers were measured in (opponentAI.inDefaultAIActivationWindow): an AI seat never answered a removal
 * with an activation, never pumped after blocks and never used a mana sink at an opponent's end step. Three windows open, each with
 * its own picker:
 *
 *   · A SAVE IN RESPONSE (opponentAI.pickSaveInResponse) — an opponent's spell or ability on the stack aims a destroy, an exile or
 *     bounce, lethal damage or a lethal -N/-N at its own permanent worth a card, and an offered activation defeats every harm aimed at
 *     it: indestructible against a destroy or lethal damage (CR 702.12b — Selfless Savior, Selfless Spirit), a regeneration shield
 *     against a destroy or lethal damage that allows one (CR 701.19a, 704.5g — Wolverine, Best There Is), protection from the colour of every
 *     source aiming a harm at it (CR 702.16b, 608.2b — Mother of Runes, whose colour is chosen as the grant resolves by
 *     choicePolicy.autoPickProtectionColor, read first). A source spent for it (sacrificed) only for a bigger threat than itself;
 *     one answer per harm.
 *   · PUMP AFTER BLOCKS (opponentAI.pickPumpAfterBlocks) — the declare blockers step once the block declaration has closed (CR 509.2:
 *     the active player receives priority, then each other player). A pump on its own creature in combat — Nylea, God of the Hunt's
 *     +2/+2, Kessig Wolf Run's +X/+0 and trample, Scourge of Valkas's +1/+0, Purphoros, God of the Forge's team +1/+0 — is activated
 *     when it changes the combat as declared: its attackers' damage now kills a defending player (an unblocked attacker deals its
 *     power, a blocked one nothing unless it has trample — CR 510.1b, 510.1c, 702.19b), or its creature now wins a one-on-one duel (survives
 *     where it died, or survives and kills — the spell arm's trick reading). A repeatable pump is read activated the fewest times
 *     that change the result; an X pump at the fewest X. Never when the result does not change, never while a fog prevents the
 *     combat damage (CR 615.1a), never on an opponent's creature.
 *   · THE END-STEP SINK (opponentAI.pickEndStepSink) — the end step of the player whose turn comes right before the AI's: its lands
 *     and creatures untap in its untap step a moment later (CR 502.3), so the mana is spent on what its main phase spends leftover
 *     mana on (a draw, a token, a scry, life — a mana cost and / or the source's tap): Archivist, Biogenic Ooze, Spectral Sailor.
 *     Only a gain for the AI alone (not Faerie Mastermind's "Each player draws a card"), never past a spell it holds up (the payment
 *     must leave the instant it could cast still payable), never at another player's end step, never at its own.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle-index.json), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const NYLEA = {"name":"Nylea, God of the Hunt","type":"Legendary Enchantment Creature — God","mana":"{3}{G}","cmc":4,"power":"6","toughness":"6","keywords":["Indestructible"],"colors":["G"],"oracle":"Indestructible\nAs long as your devotion to green is less than five, Nylea isn't a creature. (Each {G} in the mana costs of permanents you control counts toward your devotion to green.)\nOther creatures you control have trample.\n{3}{G}: Target creature gets +2/+2 until end of turn."};
const KESSIG_WOLF_RUN = {"name":"Kessig Wolf Run","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{X}{R}{G}, {T}: Target creature gets +X/+0 and gains trample until end of turn."};
const SCOURGE = {"name":"Scourge of Valkas","type":"Creature — Dragon","mana":"{2}{R}{R}{R}","cmc":5,"power":"4","toughness":"4","keywords":["Flying"],"colors":["R"],"oracle":"Flying\nWhenever this creature or another Dragon you control enters, it deals X damage to any target, where X is the number of Dragons you control.\n{R}: This creature gets +1/+0 until end of turn."};
const PURPHOROS = {"name":"Purphoros, God of the Forge","type":"Legendary Enchantment Creature — God","mana":"{3}{R}","cmc":4,"power":"6","toughness":"5","keywords":["Indestructible"],"colors":["R"],"oracle":"Indestructible\nAs long as your devotion to red is less than five, Purphoros isn't a creature.\nWhenever another creature you control enters, Purphoros deals 2 damage to each opponent.\n{2}{R}: Creatures you control get +1/+0 until end of turn."};
const CASTLE_EMBERETH = {"name":"Castle Embereth","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"This land enters tapped unless you control a Mountain.\n{T}: Add {R}.\n{1}{R}{R}, {T}: Creatures you control get +1/+0 until end of turn."};
const ARCHIVIST = {"name":"Archivist","type":"Creature — Human Wizard","mana":"{2}{U}{U}","cmc":4,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{T}: Draw a card."};
const BIOGENIC_OOZE = {"name":"Biogenic Ooze","type":"Creature — Ooze","mana":"{3}{G}{G}","cmc":5,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"When this creature enters, create a 2/2 green Ooze creature token.\nAt the beginning of your end step, put a +1/+1 counter on each Ooze you control.\n{1}{G}{G}{G}: Create a 2/2 green Ooze creature token."};
const SPECTRAL_SAILOR = {"name":"Spectral Sailor","type":"Creature — Spirit Pirate","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":["Flying","Flash"],"colors":["U"],"oracle":"Flash (You may cast this spell any time you could cast an instant.)\nFlying\n{3}{U}: Draw a card."};
const FAERIE_MASTERMIND = {"name":"Faerie Mastermind","type":"Creature — Faerie Rogue","mana":"{1}{U}","cmc":2,"power":"2","toughness":"1","keywords":["Flying","Flash"],"colors":["U"],"oracle":"Flash\nFlying\nWhenever an opponent draws their second card each turn, you draw a card.\n{3}{U}: Each player draws a card."};
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Counter target spell."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const SIEGE_MASTODON = {"name":"Siege Mastodon","type":"Creature — Elephant","mana":"{4}{W}","cmc":5,"power":"3","toughness":"5","keywords":[],"colors":["W"],"oracle":""};
const CHILD_OF_NIGHT = {"name":"Child of Night","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":["Lifelink"],"colors":["B"],"oracle":"Lifelink"};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."};
const SELFLESS_SAVIOR = {"name":"Selfless Savior","type":"Creature — Dog","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"Sacrifice this creature: Another target creature you control gains indestructible until end of turn. (Damage and effects that say \"destroy\" don't destroy it.)"};
const SELFLESS_SPIRIT = {"name":"Selfless Spirit","type":"Creature — Spirit Cleric","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nSacrifice this creature: Creatures you control gain indestructible until end of turn."};
const WOLVERINE = {"name":"Wolverine, Best There Is","type":"Legendary Creature — Mutant Berserker Hero","mana":"{1}{R}{G}","cmc":3,"power":"2","toughness":"2","keywords":["Heal","Regenerate","Unrivaled Lethality","Double"],"colors":["G","R"],"oracle":"Unrivaled Lethality — Double all damage Wolverine would deal.\nAt the beginning of each end step, if Wolverine dealt damage to another creature this turn, put a +1/+1 counter on him.\n{1}{G}: Regenerate Wolverine. (The next time he would be destroyed this turn, instead tap him, remove him from combat, and heal all damage on him.)"};
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."};
const GIVER_OF_RUNES = {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn."};
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."};
const TERMINATE = {"name":"Terminate","type":"Instant","mana":"{B}{R}","cmc":2,"keywords":[],"colors":["B","R"],"oracle":"Destroy target creature. It can't be regenerated."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","cmc":1,"keywords":[],"colors":["W"],"oracle":"Exile target creature. Its controller gains life equal to its power."};
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","cmc":1,"keywords":[],"colors":["U"],"oracle":"Return target creature to its owner's hand."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};
const OMNATH = {"name":"Omnath, Locus of Mana","type":"Legendary Creature — Elemental","mana":"{2}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"You don't lose unspent green mana as steps and phases end.\nOmnath gets +1/+1 for each unspent green mana you have."};
const TREASURE = {"name":"Treasure","type":"Token Artifact — Treasure","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}, Sacrifice this artifact: Add one mana of any color.","token":true};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...over });
const C = (id, card) => ({ id, ...card });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));
const library = (n) => Array.from({ length: n }, (_, i) => C(`lib${i}`, GRIZZLY_BEARS));

/** A two-seat game at `at` (whose turn, the phase and step, who holds priority — the active player by default). */
function duel({ user = [], ai = [], userHand = [], aiHand = [], userLife = 40, aiLife = 40 } = {}, at = {}) {
  const { active = "user", phase = "precombat-main", step = "main", holder = active } = at;
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase, step, activePlayer: active, priorityHolder: holder, consecutivePasses: holder === active ? 0 : 1, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: userLife, battlefield: user, hand: userHand, graveyard: [], library: library(5) },
      ai: { ...s0.players.ai, life: aiLife, battlefield: ai, hand: aiHand, graveyard: [], library: library(5) },
    },
  };
}

const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
const abilitiesOf = (s, pid, permId) => offered(s, pid, "activate-ability").filter((a) => a.permanentId === permId);
const aiPick = (s, policy = null) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { policy });
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid} at ${s.step}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
/** The declaring seat attacks with each id, then passes once — the pass that closes the attack declaration. */
const attackWith = (s, seat, ids) => pass(ids.reduce((cur, id) => act(cur, seat, "declare-attacker", (a) => a.permanentId === id), s));
function toBlockers(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.step !== "declare-blockers"; g++) cur = pass(cur);
  if (cur.step !== "declare-blockers") throw new Error(`never reached declare-blockers (at ${cur.step})`);
  return cur;
}
/** Each seat in `blocks` declares its blocks when it first holds priority; every other priority is passed, until the declaration
 *  has closed and `seat` holds priority. */
function blocksDeclaredThen(s, blocks, seat) {
  let cur = s;
  const done = new Set();
  for (let g = 0; g < 20; g++) {
    if (cur.step !== "declare-blockers") throw new Error(`left declare-blockers (at ${cur.step})`);
    const h = cur.priorityHolder;
    if (!cur.combat?.blockDeclarationOpen && h === seat) return cur;
    if (blocks[h] && !done.has(h)) {
      done.add(h);
      for (const [blockerId, attackerId] of blocks[h]) cur = act(cur, h, "declare-blocker", (a) => a.permanentId === blockerId && a.attackerId === attackerId);
    }
    cur = pass(cur);
  }
  throw new Error("the block declaration never closed");
}
/**
 * Play the rest of combat out: the AI takes its default pick each time it holds priority (recorded), the user passes, until the
 * combat phase is over. Returns the final state and the AI's activations.
 */
function playOutCombat(s) {
  let cur = s;
  const aiActs = [];
  for (let g = 0; g < 60 && cur.phase === "combat"; g++) {
    if (cur.priorityHolder === "ai") {
      const a = aiPick(cur);
      if (a?.kind === "activate-ability") aiActs.push(a);
      cur = dispatchAction(cur, a);
    } else cur = pass(cur);
  }
  return { state: cur, aiActs };
}
const onBattlefield = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const untappedCount = (s, pid, prefix) => s.players[pid].battlefield.filter((p) => p.id.startsWith(prefix) && !p.tapped).length;
const isActivation = (a, permId) => a?.kind === "activate-ability" && a.permanentId === permId;
const targetOf = (a) => a?.targets?.[0]?.id;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("pump after blocks — a pump that changes the combat as declared", () => {
  /** The user attacks with `attackerIds`; the AI declares `aiBlocks`; the AI holds priority once the declaration has closed. */
  const aiDefends = (board, attackerIds, aiBlocks) =>
    blocksDeclaredThen(toBlockers(attackWith(duel(board, { phase: "combat", step: "declare-attackers" }), "user", attackerIds)), { ai: aiBlocks }, "ai");
  /** The AI attacks with `attackerIds`; the user declares `userBlocks`; the AI (the active player) holds priority after the close. */
  const aiAttacks = (board, attackerIds, userBlocks = []) =>
    blocksDeclaredThen(toBlockers(attackWith(duel(board, { active: "ai", phase: "combat", step: "declare-attackers" }), "ai", attackerIds)), { user: userBlocks }, "ai");

  it("⭐ Nylea's +2/+2 on its Grizzly Bears blocking the user's Hill Giant: the Bears live and the Giant dies", () => {
    const s = aiDefends({ user: [P("hg", HILL_GIANT, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai")] }, ["hg"], [["gb", "hg"]]);
    expect(abilitiesOf(s, "ai", "ny").map(targetOf).sort()).toEqual(["gb", "hg"]);
    const a = aiPick(s);
    expect(isActivation(a, "ny")).toBe(true);
    expect(targetOf(a)).toBe("gb");
    const { state: after, aiActs } = playOutCombat(s);
    expect(aiActs.length).toBe(1);
    expect(onBattlefield(after, "user", "hg")).toBe(false);
    expect(onBattlefield(after, "ai", "gb")).toBe(true);
  });

  it("⭐ Scourge of Valkas blocking a Siege Mastodon (3/5) breathes fire once: +1/+0 kills the Mastodon, and the second {R} stays", () => {
    const s = aiDefends({ user: [P("sm", SIEGE_MASTODON, "user")], ai: [P("sv", SCOURGE, "ai"), ...lands("am", MOUNTAIN, 3, "ai")] }, ["sm"], [["sv", "sm"]]);
    expect(isActivation(aiPick(s), "sv")).toBe(true);
    const { state: after, aiActs } = playOutCombat(s);
    expect(aiActs.length).toBe(1);
    expect(onBattlefield(after, "user", "sm")).toBe(false);
    expect(onBattlefield(after, "ai", "sv")).toBe(true);
    expect(untappedCount(after, "ai", "am")).toBe(2);
  });

  it("⭐ Kessig Wolf Run at X=2 on its Hill Giant blocked by a Grizzly Bears: trample puts the last 3 through the user at 3 (X=1 would leave 2)", () => {
    const s = aiAttacks({ ai: [P("hg", HILL_GIANT, "ai"), P("kwr", KESSIG_WOLF_RUN, "ai"), ...lands("am", MOUNTAIN, 2, "ai"), ...lands("af", FOREST, 3, "ai")], user: [P("ub", GRIZZLY_BEARS, "user")], userLife: 3 }, ["hg"], [["ub", "hg"]]);
    expect(abilitiesOf(s, "ai", "kwr").filter((a) => targetOf(a) === "hg").map((a) => a.xValue).sort()).toEqual([1, 2, 3]);
    const a = aiPick(s);
    expect(isActivation(a, "kwr")).toBe(true);
    expect([targetOf(a), a.xValue]).toEqual(["hg", 2]);
    const { state: after } = playOutCombat(s);
    expect(after.players.user.life).toBeLessThanOrEqual(0);
  });

  it("⭐ Kessig Wolf Run through a lifelink blocker: the Child of Night's 2 life counts, so X=3 (5 through into 3 + 2), not X=1", () => {
    const s = aiAttacks({ ai: [P("hg", HILL_GIANT, "ai"), P("kwr", KESSIG_WOLF_RUN, "ai"), ...lands("am", MOUNTAIN, 2, "ai"), ...lands("af", FOREST, 3, "ai")], user: [P("cn", CHILD_OF_NIGHT, "user")], userLife: 3 }, ["hg"], [["cn", "hg"]]);
    const a = aiPick(s);
    expect([targetOf(a), a.xValue]).toEqual(["hg", 3]);
    const { state: after } = playOutCombat(s);
    expect(after.players.user.life).toBeLessThanOrEqual(0);
  });

  it("⭐ Nylea's pump on its blocking Bears with Counterspell in hand: four Forests pay {3}{G} and leave both Islands for it", () => {
    const s = aiDefends({ user: [P("hg", HILL_GIANT, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai"), ...lands("ai", ISLAND, 2, "ai")], aiHand: [C("cs", COUNTERSPELL)] }, ["hg"], [["gb", "hg"]]);
    expect(targetOf(aiPick(s))).toBe("gb");
  });

  it("control: the same pump is held when {3}{G} would take an Island the Counterspell it holds needs (three Forests, two Islands)", () => {
    const s = aiDefends({ user: [P("hg", HILL_GIANT, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 3, "ai"), ...lands("ai", ISLAND, 2, "ai")], aiHand: [C("cs", COUNTERSPELL)] }, ["hg"], [["gb", "hg"]]);
    expect(abilitiesOf(s, "ai", "ny").length).toBeGreaterThan(0);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: the combat is read on the board the payment leaves — Nylea's {3}{G} paid from three floating green and a Forest shrinks Omnath, Locus of Mana back to 1/1, so +2/+2 on the Bears is no longer lethal into 7 — held", () => {
    const board = { ai: [P("om", OMNATH, "ai"), P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), P("af1", FOREST, "ai")], userLife: 7 };
    const s0 = duel(board, { active: "ai", phase: "combat", step: "declare-attackers" });
    const s1 = { ...s0, players: { ...s0.players, ai: { ...s0.players.ai, manaPool: { ...s0.players.ai.manaPool, G: 3 } } } };
    const s = blocksDeclaredThen(toBlockers(attackWith(s1, "ai", ["om", "gb"])), { user: [] }, "ai");
    expect(permanentPower(s, "om")).toBe(4);
    expect(abilitiesOf(s, "ai", "ny").map(targetOf).sort()).toEqual(["gb", "om"]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("⭐ Purphoros once: two unblocked Grizzly Bears (4) into the user at 5 — +1/+0 on each makes it 6", () => {
    const s = aiAttacks({ ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("pur", PURPHOROS, "ai"), ...lands("am", MOUNTAIN, 3, "ai")], userLife: 5 }, ["gb1", "gb2"]);
    expect(isActivation(aiPick(s), "pur")).toBe(true);
  });

  it("⭐ Purphoros twice: two unblocked Grizzly Bears (4) into the user at 8 — each +1/+0 adds 2, so two make it 8", () => {
    const s = aiAttacks({ ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("pur", PURPHOROS, "ai"), ...lands("am", MOUNTAIN, 6, "ai")], userLife: 8 }, ["gb1", "gb2"]);
    expect(isActivation(aiPick(s), "pur")).toBe(true);
    const { state: after, aiActs } = playOutCombat(s);
    expect(aiActs.map((a) => a.permanentId)).toEqual(["pur", "pur"]);
    expect(after.players.user.life).toBeLessThanOrEqual(0);
  });

  it("⭐ Castle Embereth's team +1/+0 on three unblocked Grizzly Bears (6) puts the user at 7 dead", () => {
    const s = aiAttacks({ ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("gb3", GRIZZLY_BEARS, "ai"), P("ce", CASTLE_EMBERETH, "ai"), ...lands("am", MOUNTAIN, 3, "ai")], userLife: 7 }, ["gb1", "gb2", "gb3"]);
    expect(isActivation(aiPick(s), "ce")).toBe(true);
    const { state: after } = playOutCombat(s);
    expect(after.players.user.life).toBeLessThanOrEqual(0);
  });

  it("control: a pump that only trades — its Bears blocking a Craw Wurm (6/4): +2/+2 kills the Wurm, but the Bears still die — is held", () => {
    const s = aiDefends({ user: [P("cw", CRAW_WURM, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai")] }, ["cw"], [["gb", "cw"]]);
    expect(abilitiesOf(s, "ai", "ny").length).toBeGreaterThan(0);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: a block it wins already — its Bears blocking Llanowar Elves — gets no pump", () => {
    const s = aiDefends({ user: [P("le", LLANOWAR_ELVES, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai")] }, ["le"], [["gb", "le"]]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: Scourge of Valkas against a Craw Wurm (6/4): +1/+0 changes nothing it survives — no fire breathed", () => {
    const s = aiDefends({ user: [P("cw", CRAW_WURM, "user")], ai: [P("sv", SCOURGE, "ai"), ...lands("am", MOUNTAIN, 3, "ai")] }, ["cw"], [["sv", "cw"]]);
    expect(abilitiesOf(s, "ai", "sv").length).toBeGreaterThan(0);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: the Kessig Wolf Run swing short of lethal at every X it can pay (X ≤ 2, the user at 4) and the Giant already beats the Bears — held", () => {
    const s = aiAttacks({ ai: [P("hg", HILL_GIANT, "ai"), P("kwr", KESSIG_WOLF_RUN, "ai"), P("am1", MOUNTAIN, "ai"), ...lands("af", FOREST, 3, "ai")], user: [P("ub", GRIZZLY_BEARS, "user")], userLife: 4 }, ["hg"], [["ub", "hg"]]);
    expect(abilitiesOf(s, "ai", "kwr").filter((a) => targetOf(a) === "hg").map((a) => a.xValue).sort()).toEqual([1, 2]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: lethal already — two unblocked Bears into the user at 4 — no Purphoros", () => {
    const s = aiAttacks({ ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("pur", PURPHOROS, "ai"), ...lands("am", MOUNTAIN, 3, "ai")], userLife: 4 }, ["gb1", "gb2"]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: under a fog (every combat damage prevented this turn — CR 615.1a) the lethal Purphoros pump is held", () => {
    // The same board without the fog is the Purphoros witness above (one +1/+0 on two unblocked Bears: 6 into 5).
    const s0 = aiAttacks({ ai: [P("gb1", GRIZZLY_BEARS, "ai"), P("gb2", GRIZZLY_BEARS, "ai"), P("pur", PURPHOROS, "ai"), ...lands("am", MOUNTAIN, 3, "ai")], userLife: 5 }, ["gb1", "gb2"]);
    expect(abilitiesOf(s0, "ai", "pur").length).toBe(1);
    const fogged = { ...s0, preventCombatDamageTurn: s0.turn };
    expect(aiPick(fogged)?.kind).toBe("pass-priority");
  });

  it("control: never the opponent's attacker, never a creature out of combat — Nylea with only the user's unblocked Hill Giant and its own Bears at home", () => {
    const s = aiDefends({ user: [P("hg", HILL_GIANT, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai")] }, ["hg"], []);
    expect(abilitiesOf(s, "ai", "ny").map(targetOf).sort()).toEqual(["gb", "hg"]);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("the policy seam: `afterBlocks` is a POLICY_KEYS subsystem, and `afterBlocks: \"v1\"` restores the pass", () => {
    expect(POLICY_KEYS).toContain("afterBlocks");
    const s = aiDefends({ user: [P("hg", HILL_GIANT, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai"), P("ny", NYLEA, "ai"), ...lands("af", FOREST, 4, "ai")] }, ["hg"], [["gb", "hg"]]);
    expect(aiPick(s, { afterBlocks: "v1" })?.kind).toBe("pass-priority");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("the end-step sink — the end step of the player right before the AI's turn", () => {
  const OPP_END = { active: "user", phase: "ending", step: "end", holder: "ai" };

  it("⭐ Archivist draws at the user's end step (it untaps in the AI's untap step a moment later)", () => {
    const s = duel({ ai: [P("arch", ARCHIVIST, "ai")] }, OPP_END);
    const a = aiPick(s);
    expect(isActivation(a, "arch")).toBe(true);
  });

  it("⭐ Biogenic Ooze makes a token with each {1}{G}{G}{G} its eight Forests pay — two tokens, then it passes", () => {
    let s = duel({ ai: [P("ooze", BIOGENIC_OOZE, "ai"), ...lands("af", FOREST, 8, "ai")] }, OPP_END);
    const acts = [];
    for (let g = 0; g < 30 && s.step === "end"; g++) {
      if (s.priorityHolder === "ai") {
        const a = aiPick(s);
        if (a?.kind === "activate-ability") acts.push(a.permanentId);
        s = dispatchAction(s, a);
      } else s = pass(s);
    }
    expect(acts).toEqual(["ooze", "ooze"]);
    expect(s.players.ai.battlefield.filter((p) => p.card?.name === "Ooze").length).toBe(2);
  });

  it("⭐ Spectral Sailor draws when the payment still leaves Counterspell's {U}{U} (six Islands)", () => {
    const s = duel({ ai: [P("ss", SPECTRAL_SAILOR, "ai"), ...lands("ai", ISLAND, 6, "ai")], aiHand: [C("cs", COUNTERSPELL)] }, OPP_END);
    expect(isActivation(aiPick(s), "ss")).toBe(true);
  });

  it("control: Spectral Sailor is held when its {3}{U} would leave the Counterspell it holds unpayable (four Islands)", () => {
    const s = duel({ ai: [P("ss", SPECTRAL_SAILOR, "ai"), ...lands("ai", ISLAND, 4, "ai")], aiHand: [C("cs", COUNTERSPELL)] }, OPP_END);
    expect(abilitiesOf(s, "ai", "ss").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: Spectral Sailor is held when only Treasures would pay for it (each is sacrificed — no untap step gives it back)", () => {
    const s = duel({ ai: [P("ss", SPECTRAL_SAILOR, "ai"), ...lands("tr", TREASURE, 4, "ai")] }, OPP_END);
    expect(abilitiesOf(s, "ai", "ss").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: Faerie Mastermind's \"Each player draws a card\" is not a sink (the opponent draws too)", () => {
    const s = duel({ ai: [P("fm", FAERIE_MASTERMIND, "ai"), ...lands("ai", ISLAND, 4, "ai")] }, OPP_END);
    expect(abilitiesOf(s, "ai", "fm").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: at its own end step Archivist stays untapped (the opponents' turns come first)", () => {
    const s = duel({ ai: [P("arch", ARCHIVIST, "ai")] }, { active: "ai", phase: "ending", step: "end" });
    expect(abilitiesOf(s, "ai", "arch").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: before its opponent's end step — the opponent's postcombat main — Archivist stays untapped", () => {
    const s = duel({ ai: [P("arch", ARCHIVIST, "ai")] }, { active: "user", phase: "postcombat-main", step: "main", holder: "ai" });
    expect(abilitiesOf(s, "ai", "arch").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: with an extra turn waiting for the user, its end step is not the one before the AI's turn", () => {
    const s = { ...duel({ ai: [P("arch", ARCHIVIST, "ai")] }, OPP_END), extraTurns: [{ player: "user" }] };
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("⭐ four seats: ai1 draws with Archivist at the end step of the user (whose turn comes right before ai1's), not at ai3's", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    expect(s0.turnOrder).toEqual(["user", "ai1", "ai2", "ai3"]);
    const at = (active) => ({
      ...s0, turn: 9, phase: "ending", step: "end", activePlayer: active, priorityHolder: "ai1", consecutivePasses: 1, stack: [], pendingTriggers: [],
      combat: { attackers: [], blockers: [] },
      players: { ...s0.players, ai1: { ...s0.players.ai1, battlefield: [P("arch", ARCHIVIST, "ai1")], hand: [], library: library(5) } },
    });
    const pick = (s) => pickAction(s, "ai1", legalActionsForPlayer(s, "ai1"));
    expect(isActivation(pick(at("user")), "arch")).toBe(true);
    expect(pick(at("ai3"))?.kind).toBe("pass-priority");
    expect(pick(at("ai2"))?.kind).toBe("pass-priority");
  });

  it("the policy seam: `endStep` is a POLICY_KEYS subsystem, and `endStep: \"v1\"` restores the pass", () => {
    expect(POLICY_KEYS).toContain("endStep");
    const s = duel({ ai: [P("arch", ARCHIVIST, "ai")] }, OPP_END);
    expect(aiPick(s, { endStep: "v1" })?.kind).toBe("pass-priority");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
describe("a save in response — an opponent's removal on the stack aimed at its own permanent", () => {
  /** The user (the active player, in its main phase) casts `name` at the AI's `targetId` and passes: the AI holds priority. */
  function userCastsAt(board, name, targetId) {
    const s0 = duel(board);
    const s = pass(act(s0, "user", "cast-spell", (a) => a.name === name && (a.targets || []).some((t) => t.id === targetId)));
    expect([s.priorityHolder, s.stack.length]).toEqual(["ai", 1]);
    return s;
  }
  /** The AI takes its default pick each time it holds priority, the user passes, until the stack is empty. */
  function playOutStack(s) {
    let cur = s;
    const aiActs = [];
    for (let g = 0; g < 40 && cur.stack.length; g++) {
      if (cur.priorityHolder === "ai") {
        const a = aiPick(cur);
        if (a?.kind === "activate-ability") aiActs.push(a);
        cur = dispatchAction(cur, a);
      } else cur = pass(cur);
    }
    return { state: cur, aiActs };
  }
  const swamps = (n) => lands("usw", SWAMP, n, "user");
  const mountains = (n) => lands("umt", MOUNTAIN, n, "user");

  it("⭐ Selfless Savior gives its Craw Wurm indestructible against the user's Murder: the Savior goes, the Wurm stays", () => {
    const s = userCastsAt({ user: swamps(3), ai: [P("sav", SELFLESS_SAVIOR, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-murder", MURDER)] }, "Murder", "cw");
    const a = aiPick(s);
    expect([isActivation(a, "sav"), targetOf(a)]).toEqual([true, "cw"]);
    const { state: after, aiActs } = playOutStack(s);
    expect(aiActs.length).toBe(1);
    expect(onBattlefield(after, "ai", "cw")).toBe(true);
    expect(onBattlefield(after, "ai", "sav")).toBe(false);
  });

  it("⭐ Wolverine regenerates against Murder", () => {
    const s = userCastsAt({ user: swamps(3), ai: [P("wol", WOLVERINE, "ai"), ...lands("af", FOREST, 2, "ai")], userHand: [C("h-murder", MURDER)] }, "Murder", "wol");
    expect(isActivation(aiPick(s), "wol")).toBe(true);
    const { state: after } = playOutStack(s);
    expect(onBattlefield(after, "ai", "wol")).toBe(true);
  });

  it("⭐ Mother of Runes protects its Grizzly Bears from a Lightning Bolt when the colour its choice takes is red (the user's Hill Giant)", () => {
    const s = userCastsAt({ user: [...mountains(1), P("uhg", HILL_GIANT, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] }, "Lightning Bolt", "gb");
    const a = aiPick(s);
    expect([isActivation(a, "mor"), targetOf(a)]).toEqual([true, "gb"]);
    const { state: after, aiActs } = playOutStack(s);
    expect(aiActs.length).toBe(1);
    expect(onBattlefield(after, "ai", "gb")).toBe(true);
  });

  it("⭐ Selfless Spirit against Murder on its Craw Wurm: its team gains indestructible", () => {
    const s = userCastsAt({ user: swamps(3), ai: [P("spi", SELFLESS_SPIRIT, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-murder", MURDER)] }, "Murder", "cw");
    expect(isActivation(aiPick(s), "spi")).toBe(true);
    const { state: after } = playOutStack(s);
    expect(onBattlefield(after, "ai", "cw")).toBe(true);
  });

  it("control: Mother of Runes is held when its choice would be green (the user's board is a Grizzly Bears) and the Bolt is red", () => {
    const s = userCastsAt({ user: [...mountains(1), P("ugb", GRIZZLY_BEARS, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] }, "Lightning Bolt", "gb");
    expect(abilitiesOf(s, "ai", "mor").map(targetOf)).toContain("gb");
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: Wolverine does not regenerate against Terminate (\"It can't be regenerated.\") or Swords to Plowshares (an exile)", () => {
    const t = userCastsAt({ user: [...swamps(1), ...mountains(1)], ai: [P("wol", WOLVERINE, "ai"), ...lands("af", FOREST, 2, "ai")], userHand: [C("h-term", TERMINATE)] }, "Terminate", "wol");
    expect(abilitiesOf(t, "ai", "wol").length).toBe(1);
    expect(aiPick(t)?.kind).toBe("pass-priority");
    const x = userCastsAt({ user: lands("upl", PLAINS, 1, "user"), ai: [P("wol", WOLVERINE, "ai"), ...lands("af", FOREST, 2, "ai")], userHand: [C("h-stp", SWORDS)] }, "Swords to Plowshares", "wol");
    expect(aiPick(x)?.kind).toBe("pass-priority");
  });

  it("control: indestructible does not save from Unsummon (a bounce) — Selfless Savior stays", () => {
    const s = userCastsAt({ user: lands("uis", ISLAND, 1, "user"), ai: [P("sav", SELFLESS_SAVIOR, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-uns", UNSUMMON)] }, "Unsummon", "cw");
    expect(abilitiesOf(s, "ai", "sav").map(targetOf)).toContain("cw");
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: a removal it survives (Lightning Bolt at its Craw Wurm, 3 into 4 toughness) is no harm — Selfless Savior stays", () => {
    const s = userCastsAt({ user: mountains(1), ai: [P("sav", SELFLESS_SAVIOR, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] }, "Lightning Bolt", "cw");
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("⭐ a source that is doomed itself costs nothing: Murder on its Selfless Spirit and Murder on its Llanowar Elves (a smaller threat than the Spirit) — the Spirit goes, and the Elves live", () => {
    const s0 = duel({ user: lands("usw", SWAMP, 6, "user"), ai: [P("spi", SELFLESS_SPIRIT, "ai"), P("le", LLANOWAR_ELVES, "ai")], userHand: [C("h-m1", MURDER), C("h-m2", MURDER)] });
    const one = act(s0, "user", "cast-spell", (a) => a.cardId === "h-m1" && (a.targets || []).some((t) => t.id === "le"));
    const s = pass(act(one, "user", "cast-spell", (a) => a.cardId === "h-m2" && (a.targets || []).some((t) => t.id === "spi")));
    expect([s.priorityHolder, s.stack.length]).toEqual(["ai", 2]);
    expect(isActivation(aiPick(s), "spi")).toBe(true);
    const { state: after } = playOutStack(s);
    expect(onBattlefield(after, "ai", "le")).toBe(true);
    expect(onBattlefield(after, "ai", "spi")).toBe(false);
  });

  it("control: a source that would only be bounced is not doomed — Unsummon on its Selfless Spirit, Murder on its Llanowar Elves: the Spirit goes back to its hand, so it is not sacrificed for the smaller Elves", () => {
    const s0 = duel({ user: [...lands("usw", SWAMP, 3, "user"), ...lands("uis", ISLAND, 1, "user")], ai: [P("spi", SELFLESS_SPIRIT, "ai"), P("le", LLANOWAR_ELVES, "ai")], userHand: [C("h-m1", MURDER), C("h-uns", UNSUMMON)] });
    const one = act(s0, "user", "cast-spell", (a) => a.cardId === "h-m1" && (a.targets || []).some((t) => t.id === "le"));
    const s = pass(act(one, "user", "cast-spell", (a) => a.cardId === "h-uns" && (a.targets || []).some((t) => t.id === "spi")));
    expect([s.priorityHolder, s.stack.length]).toEqual(["ai", 2]);
    expect(abilitiesOf(s, "ai", "spi").length).toBe(1);
    expect(aiPick(s)?.kind).toBe("pass-priority");
  });

  it("control: Selfless Spirit is not sacrificed when the Murder is aimed at the Spirit itself", () => {
    const own = userCastsAt({ user: swamps(3), ai: [P("spi", SELFLESS_SPIRIT, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-murder", MURDER)] }, "Murder", "spi");
    expect(abilitiesOf(own, "ai", "spi").length).toBe(1);
    expect(aiPick(own)?.kind).toBe("pass-priority");
  });

  it("⭐ one answer: the protection is activated once — with its own ability already above the Bolt, the other Runes is not used too", () => {
    const s = userCastsAt({ user: [...mountains(1), P("uhg", HILL_GIANT, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-bolt", LIGHTNING_BOLT)] }, "Lightning Bolt", "gb");
    const first = aiPick(s);
    expect(first?.kind).toBe("activate-ability");
    const answered = dispatchAction(s, first);
    expect(answered.priorityHolder).toBe("ai");
    expect(answered.stack.length).toBe(2);
    expect(abilitiesOf(answered, "ai", first.permanentId === "mor" ? "gor" : "mor").length).toBeGreaterThan(0);
    expect(aiPick(answered)?.kind).toBe("pass-priority");
  });

  it("the policy seam: `inResponse` is a POLICY_KEYS subsystem, and `inResponse: \"v1\"` restores the pass", () => {
    expect(POLICY_KEYS).toContain("inResponse");
    const s = userCastsAt({ user: swamps(3), ai: [P("sav", SELFLESS_SAVIOR, "ai"), P("cw", CRAW_WURM, "ai")], userHand: [C("h-murder", MURDER)] }, "Murder", "cw");
    expect(aiPick(s, { inResponse: "v1" })?.kind).toBe("pass-priority");
  });
});

// The pumped Giant's power after the Wolf Run resolves (a check of the fixture's reading, not of the AI): +X/+0 on 3 power.
describe("fixture check", () => {
  it("Kessig Wolf Run at X=2 makes the Hill Giant 5 power", () => {
    const s = duel({ ai: [P("hg", HILL_GIANT, "ai"), P("kwr", KESSIG_WOLF_RUN, "ai"), ...lands("am", MOUNTAIN, 2, "ai"), ...lands("af", FOREST, 2, "ai")] }, { active: "ai" });
    const a = abilitiesOf(s, "ai", "kwr").find((x) => x.xValue === 2 && targetOf(x) === "hg");
    let cur = dispatchAction(s, a);
    for (let g = 0; g < 6 && cur.stack.length; g++) cur = pass(cur);
    expect(permanentPower(cur, "hg")).toBe(5);
  });
});
