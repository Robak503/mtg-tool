/**
 * protectionLastKnownColorless.test.js — two coupled faults in protection (CR 702.16), one fix:
 *
 *   (A) An ability whose source has LEFT the battlefield was judged as colourless at the CR 608.2b re-check: the engine kept no
 *       last known information for it, so protection never made its target illegal. Executioner's Capsule — sacrificed to activate
 *       it — destroyed a creature that had gained protection from black in response.
 *   (B) Protection from COLORLESS (Giver of Runes, Angelic Intervention) was enforced nowhere: a colourless source has no colour
 *       letter to match.
 *   THE COUPLING: a departed source read as colourless + protection from colorless enforced would let protection from colorless
 *   stop that black Capsule — so (A) comes first, and a source whose colours the engine can't tell is never read as colourless.
 *
 * The rules, read in knowledge/mtg-judge/data/cr/cr_current.json:
 *   · CR 608.2b — "If the source of an ability has left the zone it was in, its last known information is used during this process."
 *   · CR 113.7a — once activated, an ability exists independently of its source; if the source is no longer in the zone it's expected
 *     to be in, its last known information is used.
 *   · CR 601.2c (via 602.2b) — targets are announced before costs are paid (601.2h): the Capsule chooses its target while it is on
 *     the battlefield, black.
 *   · CR 105.2c — "A colorless object has no color."
 *   · CR 702.16b / c / d / e / f — protection: can't be targeted, enchanted, equipped; damage prevented; can't be blocked.
 *
 * Engine paths: the activation, cast and resolution through legalChoices + actionDispatcher (the CR 608.2b re-check is
 * effects/targeting.resolutionTargetVerdicts), combat through combatEvasion.canBlockAttacker and combatResolution.resolveCombatDamage.
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, read 2026-10-21).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";
import { createGameState, createPermanent, findPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentColors, permanentProtectionColors } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { protectionApplies } from "./protection.js";
import { resolveScryChoice } from "./effects/runProgram.js";
import { advanceUntilDecision } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim, cardIndex.publicCard) ─────────────────────────────────────────────────────────────────────
const MOTHER_OF_RUNES = {"name":"Mother of Runes","type":"Creature — Human Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Target creature you control gains protection from the color of your choice until end of turn."};
const GIVER_OF_RUNES = {"name":"Giver of Runes","type":"Creature — Kor Cleric","mana":"{W}","cmc":1,"power":"1","toughness":"2","keywords":[],"colors":["W"],"colorIdentity":["W"],"oracle":"{T}: Another target creature you control gains protection from colorless or from the color of your choice until end of turn."};
const EXECUTIONERS_CAPSULE = {"name":"Executioner's Capsule","type":"Artifact","mana":"{B}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"{1}{B}, {T}, Sacrifice this artifact: Destroy target nonblack creature."};
const WHITE_KNIGHT = {"name":"White Knight","type":"Creature — Human Knight","mana":"{W}{W}","cmc":2,"power":"2","toughness":"2","keywords":["First strike","Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"First strike (This creature deals combat damage before creatures without first strike.)\nProtection from black (This creature can't be blocked, targeted, dealt damage, or enchanted by anything black.)"};
const NEUROK_REPLICA = {"name":"Neurok Replica","type":"Artifact Creature — Wizard","mana":"{3}","cmc":3,"power":"1","toughness":"4","keywords":[],"colors":[],"colorIdentity":["U"],"oracle":"{1}{U}, Sacrifice this creature: Return target creature to its owner's hand."};
const CRIMSON_WISPS = {"name":"Crimson Wisps","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Target creature becomes red and gains haste until end of turn. (It can attack and {T} this turn.)\nDraw a card."};
const AETHER_SPELLBOMB = {"name":"Aether Spellbomb","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["U"],"oracle":"{U}, Sacrifice this artifact: Return target creature to its owner's hand.\n{1}, Sacrifice this artifact: Draw a card."};
const ROD_OF_RUIN = {"name":"Rod of Ruin","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":[],"oracle":"{3}, {T}: This artifact deals 1 damage to any target."};
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":["Equip"],"colors":[],"colorIdentity":[],"oracle":"Equipped creature gets +2/+0.\nEquip {1}"};
const MATTER_RESHAPER = {"name":"Matter Reshaper","type":"Creature — Eldrazi","mana":"{2}{C}","cmc":3,"power":"3","toughness":"2","keywords":[],"colors":[],"colorIdentity":[],"oracle":"({C} represents colorless mana.)\nWhen this creature dies, reveal the top card of your library. You may put that card onto the battlefield if it's a permanent card with mana value 3 or less. Otherwise, put that card into your hand."};
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"colorIdentity":[],"oracle":"Flying"};
const SURTLAND_FROSTPYRE = {"name":"Surtland Frostpyre","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":["Scry"],"colors":[],"colorIdentity":["R","U"],"oracle":"This land enters tapped.\n{T}: Add {R}.\n{2}{U}{U}{R}, {T}, Sacrifice this land: Scry 2. This land deals 2 damage to each creature. Activate only as a sorcery."};
const PREY_UPON = {"name":"Prey Upon","type":"Sorcery","mana":"{G}","cmc":1,"power":null,"toughness":null,"keywords":["Fight"],"colors":["G"],"colorIdentity":["G"],"oracle":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)"};
const PYROCLASM = {"name":"Pyroclasm","type":"Sorcery","mana":"{1}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Pyroclasm deals 2 damage to each creature."};
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"{T}: This creature deals 1 damage to any target."};
const TERMINATE = {"name":"Terminate","type":"Instant","mana":"{B}{R}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B","R"],"colorIdentity":["B","R"],"oracle":"Destroy target creature. It can't be regenerated."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"colorIdentity":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};
const PERILOUS_MYR = {"name":"Perilous Myr","type":"Artifact Creature — Phyrexian Myr","mana":"{2}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":[],"colorIdentity":[],"oracle":"When this creature dies, it deals 2 damage to any target."};
const ROYAL_ASSASSIN = {"name":"Royal Assassin","type":"Creature — Human Assassin","mana":"{1}{B}{B}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["B"],"colorIdentity":["B"],"oracle":"{T}: Destroy target tapped creature."};
const BELOVED_CHAPLAIN = {"name":"Beloved Chaplain","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"1","toughness":"1","keywords":["Protection"],"colors":["W"],"colorIdentity":["W"],"oracle":"Protection from creatures"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":""};
const LLANOWAR_ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"colorIdentity":["G"],"oracle":"{T}: Add {G}."};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["U"],"oracle":"({T}: Add {U}.)"};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["B"],"oracle":"({T}: Add {B}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["R"],"oracle":"({T}: Add {R}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"colorIdentity":["G"],"oracle":"({T}: Add {G}.)"};
// A Grizzly Bears printed black: what the automatic colour pick reads off the board ("the most common colour among your opponents'
// nonland permanents") — so Mother of Runes takes black (or red) by the same read on every tree.
const BLACK_BEAR = { ...GRIZZLY_BEARS, name: "Black Bear", colors: ["B"] };
const RED_BEAR = { ...GRIZZLY_BEARS, name: "Red Bear", colors: ["R"] };

// ── boards ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1 });
const C = (id, card) => ({ id, ...card });
const lands = (prefix, card, n, controller) => Array.from({ length: n }, (_, i) => P(`${prefix}${i + 1}`, card, controller));
const LIB = (pid) => Array.from({ length: 6 }, (_, i) => C(`${pid}-lib${i}`, GRIZZLY_BEARS));

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
const activateAt = (s, pid, sourceId, targetId) => act(s, pid, "activate-ability", (a) => a.permanentId === sourceId && targetsIt(targetId)(a));
/** Both seats pass until the stack is empty. */
function resolveAll(s) {
  let cur = s;
  for (let g = 0; g < 20 && cur.stack.length; g++) cur = pass(cur);
  return cur;
}
/** The permanent ids `pid`'s `sourceId` is offered to target (any activation of it), sorted. */
const offeredTargets = (s, pid, sourceId) => [...new Set(offered({ ...s, priorityHolder: pid }, pid, "activate-ability")
  .filter((a) => a.permanentId === sourceId).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
const alive = (s, id) => !!findPermanent(s, id);
const prot = (s, id) => [...permanentProtectionColors(s, id)].sort();
const inHand = (s, pid, name) => (s.players[pid].hand || []).some((c) => c.name === name);
const dmg = (s, id) => findPermanent(s, id)?.permanent?.damageMarked ?? null;

/** The AI (active) gives `targetId` protection with its Mother or Giver of Runes `giverId` (the automatic pick — the board read), resolved; then the user holds priority, the stack empty. */
function aiGrantsFirst(s0, giverId, targetId) {
  return pass(resolveAll(activateAt(s0, "ai", giverId, targetId)));
}

describe("protectionApplies — protection from colorless is a source with no colour, never an unread one (CR 105.2c, 702.16)", () => {
  it("an empty list is colourless; null is a source the caller can't read; a coloured source is not colourless", () => {
    const C_ONLY = new Set(["C"]);
    expect({
      colourless: protectionApplies(C_ONLY, []),
      unread: protectionApplies(C_ONLY, null),
      black: protectionApplies(C_ONLY, ["B"]),
      blackVsBlack: protectionApplies(new Set(["B"]), ["B"]),
      redVsColourless: protectionApplies(new Set(["R"]), []),
    }).toEqual({ colourless: true, unread: false, black: false, blackVsBlack: true, redVsColourless: false });
  });
});

describe("(A) a departed ability source is judged by its last known information (CR 608.2b, 113.7a)", () => {
  it("⭐ Executioner's Capsule, sacrificed to activate it, aimed at Grizzly Bears that gain protection from black in response (Mother of Runes): its last known colour is black, so the target is illegal and the destroy does nothing", () => {
    const s0 = duel({ user: [P("cap", EXECUTIONERS_CAPSULE, "user"), ...lands("us", SWAMP, 2, "user"), P("ub1", BLACK_BEAR, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const capsule = pass(activateAt(s0, "user", "cap", "gb"));
    const afterMother = pass(pass(activateAt(capsule, "ai", "mor", "gb")));
    const done = resolveAll(afterMother);
    const row = { capsuleGone: !alive(capsule, "cap"), record: capsule.stack[0]?.payload?.params?.context?.abilitySourceLki?.colors ?? null, protection: prot(afterMother, "gb"), bearsAlive: alive(done, "gb") };
    console.log(`  WITNESS capsule-in-response ${JSON.stringify(row)}`);
    expect(row).toEqual({ capsuleGone: true, record: ["B"], protection: ["B"], bearsAlive: true });
  });

  it("⭐ the record rides the ability, not the shared stamp: a second sacrifice in response (Aether Spellbomb's draw) leaves the Capsule black as it last existed, and protection from black still stops it", () => {
    const s0 = duel({ user: [P("cap", EXECUTIONERS_CAPSULE, "user"), P("asb", AETHER_SPELLBOMB, "user"), ...lands("us", SWAMP, 3, "user"), P("ub1", BLACK_BEAR, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const capsule = pass(activateAt(s0, "user", "cap", "gb"));
    const mother = pass(activateAt(capsule, "ai", "mor", "gb"));
    const drawn = act(mother, "user", "activate-ability", (a) => a.permanentId === "asb" && !(a.targets || []).length);
    const done = resolveAll(drawn);
    const row = { stack: drawn.stack.map((o) => o.source?.name), sharedStamp: drawn.sacrificedSelfLki?.permanentId ?? null, protection: prot(done, "gb"), bearsAlive: alive(done, "gb") };
    console.log(`  WITNESS capsule-second-sacrifice ${JSON.stringify(row)}`);
    expect(row).toEqual({ stack: ["Executioner's Capsule", "Mother of Runes", "Aether Spellbomb"], sharedStamp: "asb", protection: ["B"], bearsAlive: true });
  });

  it("⭐ a source that leaves WHILE its ability waits: Royal Assassin's destroy at the tapped Bears, the Assassin Bolted in response and the Bears given protection from black — its last known colour (stamped as it left) makes the target illegal", () => {
    const tappedBears = { ...P("gb", GRIZZLY_BEARS, "ai"), tapped: true };
    const s0 = duel({ user: [P("ra", ROYAL_ASSASSIN, "user"), P("ub1", BLACK_BEAR, "user")], ai: [...lands("am", MOUNTAIN, 1, "ai"), P("mor", MOTHER_OF_RUNES, "ai"), tappedBears], aiHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const assassin = pass(activateAt(s0, "user", "ra", "gb"));
    const mother = activateAt(assassin, "ai", "mor", "gb");
    const bolted = act(mother, "ai", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("ra")(a));
    const afterBolt = pass(pass(bolted));
    const done = resolveAll(afterBolt);
    const row = { assassinGone: !alive(afterBolt, "ra"), record: afterBolt.stack[0]?.payload?.params?.context?.abilitySourceLki?.colors ?? null, bearsAlive: alive(done, "gb") };
    console.log(`  WITNESS assassin-leaves-waiting ${JSON.stringify(row)}`);
    expect(row).toEqual({ assassinGone: true, record: ["B"], bearsAlive: true });
  });

  it("control: protected from black BEFORE the activation — White Knight's printed protection, or the Bears' grant from Mother of Runes — the Capsule can't target it at all (CR 601.2c: the target is chosen while the Capsule is on the battlefield, black)", () => {
    const knight = duel({ user: [P("cap", EXECUTIONERS_CAPSULE, "user"), ...lands("us", SWAMP, 2, "user")], ai: [P("wk", WHITE_KNIGHT, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const granted = aiGrantsFirst(duel({ active: "ai", user: [P("cap", EXECUTIONERS_CAPSULE, "user"), ...lands("us", SWAMP, 2, "user"), P("ub1", BLACK_BEAR, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai"), P("le", LLANOWAR_ELVES, "ai")] }), "mor", "gb");
    const row = { knight: offeredTargets(knight, "user", "cap"), grantedProtection: prot(granted, "gb"), granted: offeredTargets(granted, "user", "cap") };
    console.log(`  WITNESS capsule-before ${JSON.stringify(row)}`);
    expect(row).toEqual({ knight: ["gb"], grantedProtection: ["B"], granted: ["le", "mor"] });
  });

  it("⭐ a colourless source turned red before it left is red as it last existed: Neurok Replica made red by Crimson Wisps, then sacrificed to bounce the Bears — protection from red gained in response stops it", () => {
    const s0 = duel({ user: [P("nr", NEUROK_REPLICA, "user"), ...lands("ui", ISLAND, 2, "user"), ...lands("um", MOUNTAIN, 1, "user"), P("ub1", RED_BEAR, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-wisps", CRIMSON_WISPS)] });
    const red = resolveAll(act(s0, "user", "cast-spell", (a) => a.name === "Crimson Wisps" && targetsIt("nr")(a)));
    const replica = pass(activateAt(red, "user", "nr", "gb"));
    const afterMother = pass(pass(activateAt(replica, "ai", "mor", "gb")));
    const done = resolveAll(afterMother);
    const row = { replicaColours: permanentColors(red, "nr"), replicaGone: !alive(replica, "nr"), protection: prot(afterMother, "gb"), bearsOnBattlefield: alive(done, "gb"), bearsInHand: inHand(done, "ai", "Grizzly Bears") };
    console.log(`  WITNESS replica-red ${JSON.stringify(row)}`);
    expect(row).toEqual({ replicaColours: ["R"], replicaGone: true, protection: ["R"], bearsOnBattlefield: true, bearsInHand: false });
  });

  it("control (the same last known red): Neurok Replica made red bounces Bears that have protection from COLORLESS — it was not colourless as it last existed", () => {
    const s0 = duel({ active: "ai", user: [P("nr", NEUROK_REPLICA, "user"), P("orn", ORNITHOPTER, "user"), ...lands("ui", ISLAND, 2, "user"), ...lands("um", MOUNTAIN, 1, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-wisps", CRIMSON_WISPS)] });
    const colourlessGrant = aiGrantsFirst(s0, "gor", "gb");
    const red = pass(resolveAll(act(colourlessGrant, "user", "cast-spell", (a) => a.name === "Crimson Wisps" && targetsIt("nr")(a))));
    const done = resolveAll(pass(activateAt(red, "user", "nr", "gb")));
    const row = { protection: prot(colourlessGrant, "gb"), replicaColours: permanentColors(red, "nr"), bearsInHand: inHand(done, "ai", "Grizzly Bears") };
    console.log(`  WITNESS replica-red-vs-colourless ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], replicaColours: ["R"], bearsInHand: true });
  });

  it("⭐ a departed source is a creature as it last existed: Perilous Myr dies to Lightning Bolt, and its trigger (\"it deals 2 damage to any target\") is not offered Beloved Chaplain — protection from creatures (CR 702.16b; the death look-back)", () => {
    const s0 = duel({ humans: ["user"], active: "ai", user: [P("myr", PERILOUS_MYR, "user")], ai: [...lands("am", MOUNTAIN, 1, "ai"), P("chap", BELOVED_CHAPLAIN, "ai"), P("gb", GRIZZLY_BEARS, "ai")], aiHand: [C("h-bolt", LIGHTNING_BOLT)] });
    const died = pass(pass(act(s0, "ai", "cast-spell", (a) => a.name === "Lightning Bolt" && targetsIt("myr")(a))));
    const asked = advanceUntilDecision({ status: "active", state: died, difficulty: "beginner", decisionLog: [] }).decision;
    const row = { myrGone: !alive(died, "myr"), asked: asked?.kind ?? null, offered: (asked?.candidates || []).flatMap((c) => (c.targets || []).map((t) => t.id)).sort() };
    console.log(`  WITNESS myr-dies ${JSON.stringify(row)}`);
    expect(row).toEqual({ myrGone: true, asked: "trigger-target", offered: ["ai", "gb", "user"] });
  });
});

describe("(B) protection from colorless (Giver of Runes) stops a colourless source (CR 105.2c, 702.16b–f)", () => {
  it("⭐ targeting, the source on the battlefield: Rod of Ruin aimed at Llanowar Elves that gain protection from colorless in response — the ping does nothing", () => {
    const s0 = duel({ user: [P("rod", ROD_OF_RUIN, "user"), P("orn", ORNITHOPTER, "user"), ...lands("um", MOUNTAIN, 3, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const rod = pass(activateAt(s0, "user", "rod", "le"));
    const afterGiver = pass(pass(activateAt(rod, "ai", "gor", "le")));
    const done = resolveAll(afterGiver);
    const row = { protection: prot(afterGiver, "le"), elvesAlive: alive(done, "le"), elvesDamage: dmg(done, "le") };
    console.log(`  WITNESS rod-in-response ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], elvesAlive: true, elvesDamage: 0 });
  });

  it("⭐ the AI's own choice: its Giver of Runes answers Rod of Ruin's ping at its Llanowar Elves — protection from colorless saves them — and the Elves live", () => {
    const s0 = duel({ user: [P("rod", ROD_OF_RUIN, "user"), P("orn", ORNITHOPTER, "user"), ...lands("um", MOUNTAIN, 3, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const rod = pass(activateAt(s0, "user", "rod", "le"));
    const first = pickAction(rod, "ai", legalActionsForPlayer(rod, "ai"));
    let cur = dispatchAction(rod, first);
    for (let g = 0; g < 20 && cur.stack.length; g++) cur = cur.priorityHolder === "ai" ? dispatchAction(cur, pickAction(cur, "ai", legalActionsForPlayer(cur, "ai"))) : pass(cur);
    const row = { first: [first?.kind, first?.permanentId ?? null, first?.targets?.[0]?.id ?? null], elvesAlive: alive(cur, "le") };
    console.log(`  WITNESS ai-giver-rod ${JSON.stringify(row)}`);
    expect(row).toEqual({ first: ["activate-ability", "gor", "le"], elvesAlive: true });
  });

  it("⭐ the offer: a creature with protection from colorless can't be targeted by Rod of Ruin, nor equipped with Bonesplitter (CR 702.16b, 702.16d)", () => {
    const s0 = duel({ user: [P("gor", GIVER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user"), P("bs", BONESPLITTER, "user"), ...lands("um", MOUNTAIN, 1, "user")], ai: [P("rod", ROD_OF_RUIN, "ai"), P("orn", ORNITHOPTER, "ai"), ...lands("am", MOUNTAIN, 3, "ai")] });
    const s = resolveAll(activateAt(s0, "user", "gor", "gb"));
    const equip = offered(s, "user", "activate-ability").filter((a) => a.permanentId === "bs").map((a) => a.targets?.[0]?.id).sort();
    const row = { protection: prot(s, "gb"), equip, rodTargetsBears: offeredTargets(s, "ai", "rod").includes("gb"), rodTargetsGiver: offeredTargets(s, "ai", "rod").includes("gor") };
    console.log(`  WITNESS colourless-offers ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], equip: ["gor"], rodTargetsBears: false, rodTargetsGiver: true });
  });

  it("⭐ combat: Bears with protection from colorless block Matter Reshaper (an Eldrazi) and are dealt no damage; attacking, they can't be blocked by Ornithopter (an artifact creature) — a green Elves still can (CR 702.16e, 702.16f)", () => {
    const s0 = duel({ active: "ai", user: [P("mr", MATTER_RESHAPER, "user"), P("orn", ORNITHOPTER, "user"), P("ule", LLANOWAR_ELVES, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const s = aiGrantsFirst(s0, "gor", "gb");
    const blocked = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "mr", attackingPlayer: "user", defender: "ai" }], blockers: [{ blockerId: "gb", blockingPlayer: "ai", attackerId: "mr" }] } }, { firstStrikeStep: false });
    const row = {
      protection: prot(s, "gb"),
      bearsAlive: alive(blocked, "gb"), bearsDamage: dmg(blocked, "gb"),
      ornithopterBlocks: canBlockAttacker(s, "orn", "gb", "user"), elvesBlock: canBlockAttacker(s, "ule", "gb", "user"),
    };
    console.log(`  WITNESS colourless-combat ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], bearsAlive: true, bearsDamage: 0, ornithopterBlocks: false, elvesBlock: true });
  });

  it("⭐ a colourless source that has LEFT: Aether Spellbomb, sacrificed to bounce the Bears, is colourless as it last existed — protection from colorless gained in response stops it", () => {
    const s0 = duel({ user: [P("asb", AETHER_SPELLBOMB, "user"), P("orn1", ORNITHOPTER, "user"), P("orn2", ORNITHOPTER, "user"), ...lands("ui", ISLAND, 1, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const bomb = pass(activateAt(s0, "user", "asb", "gb"));
    const afterGiver = pass(pass(activateAt(bomb, "ai", "gor", "gb")));
    const done = resolveAll(afterGiver);
    const row = { bombGone: !alive(bomb, "asb"), protection: prot(afterGiver, "gb"), bearsOnBattlefield: alive(done, "gb"), bearsInHand: inHand(done, "ai", "Grizzly Bears") };
    console.log(`  WITNESS spellbomb-departed ${JSON.stringify(row)}`);
    expect(row).toEqual({ bombGone: true, protection: ["C"], bearsOnBattlefield: true, bearsInHand: false });
  });

  it("⭐ damage that doesn't target, from a colourless source that has LEFT: Surtland Frostpyre, sacrificed, deals 2 to each creature — none to the Bears with protection from colorless", () => {
    const s0 = duel({ active: "ai", user: [P("sf", SURTLAND_FROSTPYRE, "user"), P("orn1", ORNITHOPTER, "user"), P("orn2", ORNITHOPTER, "user"), ...lands("ui", ISLAND, 2, "user"), ...lands("um", MOUNTAIN, 3, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const s = aiGrantsFirst(s0, "gor", "gb");
    // "Activate only as a sorcery": the user activates it in their own main phase, the protection still in force (until end of turn).
    const userTurn = { ...s, activePlayer: "user", priorityHolder: "user" };
    const scrying = resolveAll(act(userTurn, "user", "activate-ability", (a) => a.permanentId === "sf"));
    // Its Scry 2 pauses for the controller; both cards kept on top (the driver's own default), and the program resumes into the damage.
    const done = resolveAll(resolveScryChoice(scrying, (scrying.pendingChoice?.cards || []).map((c) => c.id)));
    const row = { protection: prot(s, "gb"), scry: scrying.pendingChoice?.kind ?? null, frostpyreGone: !alive(done, "sf"), bearsAlive: alive(done, "gb"), bearsDamage: dmg(done, "gb"), giverAlive: alive(done, "gor") };
    console.log(`  WITNESS colourless-sweep ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], scry: "scry-surveil", frostpyreGone: true, bearsAlive: true, bearsDamage: 0, giverAlive: false });
  });

  it("⭐ a fight: the Bears with protection from colorless fight Matter Reshaper (Prey Upon) — the Eldrazi deals them no damage, and they deal it theirs", () => {
    const s0 = duel({ user: [P("gor", GIVER_OF_RUNES, "user"), P("gb", GRIZZLY_BEARS, "user"), ...lands("uf", FOREST, 1, "user")], ai: [P("mr", MATTER_RESHAPER, "ai"), P("orn", ORNITHOPTER, "ai")], userHand: [C("h-prey", PREY_UPON)] });
    const s = resolveAll(activateAt(s0, "user", "gor", "gb"));
    const done = resolveAll(act(s, "user", "cast-spell", (a) => a.name === "Prey Upon" && targetsIt("gb")(a) && targetsIt("mr")(a)));
    const row = { protection: prot(s, "gb"), bearsAlive: alive(done, "gb"), bearsDamage: dmg(done, "gb"), reshaperAlive: alive(done, "mr") };
    console.log(`  WITNESS colourless-fight ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], bearsAlive: true, bearsDamage: 0, reshaperAlive: false });
  });
});

describe("controls — the same judgments on every tree", () => {
  it("THE COUPLING: Bears with protection from colorless are destroyed by a black Executioner's Capsule whose source has left — its last known colour is black, never colourless", () => {
    const s0 = duel({ active: "ai", user: [P("cap", EXECUTIONERS_CAPSULE, "user"), P("orn1", ORNITHOPTER, "user"), P("orn2", ORNITHOPTER, "user"), ...lands("us", SWAMP, 2, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const s = aiGrantsFirst(s0, "gor", "gb");
    const done = resolveAll(activateAt(s, "user", "cap", "gb"));
    const row = { protection: prot(s, "gb"), bearsAlive: alive(done, "gb"), capsuleGone: !alive(done, "cap") };
    console.log(`  WITNESS coupling ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], bearsAlive: false, capsuleGone: true });
  });

  it("a departed source with NO record kept is never read as colourless: Aether Spellbomb's ability stripped of its last known information bounces Bears that gained protection from colorless in response", () => {
    const s0 = duel({ user: [P("asb", AETHER_SPELLBOMB, "user"), P("orn1", ORNITHOPTER, "user"), P("orn2", ORNITHOPTER, "user"), ...lands("ui", ISLAND, 1, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")] });
    const bomb = pass(activateAt(s0, "user", "asb", "gb"));
    const strip = (o) => {
      const { abilitySourceLki: _gone, ...context } = o.payload.params.context || {};
      return { ...o, payload: { ...o.payload, params: { ...o.payload.params, context } } };
    };
    const unread = { ...bomb, sacrificedSelfLki: null, stack: bomb.stack.map(strip) };
    const afterGiver = pass(pass(activateAt(unread, "ai", "gor", "gb")));
    const done = resolveAll(afterGiver);
    const row = { protection: prot(afterGiver, "gb"), bearsInHand: inHand(done, "ai", "Grizzly Bears") };
    console.log(`  WITNESS unread-source ${JSON.stringify(row)}`);
    expect(row).toEqual({ protection: ["C"], bearsInHand: true });
  });

  it("a source still on the battlefield: Prodigal Pyromancer's ping at Llanowar Elves that gain protection from red in response does nothing", () => {
    const s0 = duel({ user: [P("pyro", PRODIGAL_PYROMANCER, "user"), P("ub1", RED_BEAR, "user")], ai: [P("mor", MOTHER_OF_RUNES, "ai"), P("le", LLANOWAR_ELVES, "ai")] });
    const afterMother = pass(pass(activateAt(pass(activateAt(s0, "user", "pyro", "le")), "ai", "mor", "le")));
    const done = resolveAll(afterMother);
    expect({ protection: prot(afterMother, "le"), elvesAlive: alive(done, "le") }).toEqual({ protection: ["R"], elvesAlive: true });
  });

  it("protection from a colour against a multicoloured source: Terminate (black and red) can't target White Knight (protection from black), and can target the Bears", () => {
    const s0 = duel({ user: [...lands("us", SWAMP, 1, "user"), ...lands("um", MOUNTAIN, 1, "user")], ai: [P("wk", WHITE_KNIGHT, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-term", TERMINATE)] });
    const targets = [...new Set(offered(s0, "user", "cast-spell").filter((a) => a.name === "Terminate").flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
    expect(targets).toEqual(["gb"]);
  });

  it("no protection: the Capsule destroys the Bears; Rod of Ruin pings the Elves; and protection from colorless doesn't stop a red Pyroclasm", () => {
    const capsule = resolveAll(activateAt(duel({ user: [P("cap", EXECUTIONERS_CAPSULE, "user"), ...lands("us", SWAMP, 2, "user")], ai: [P("gb", GRIZZLY_BEARS, "ai")] }), "user", "cap", "gb"));
    const rod = resolveAll(activateAt(duel({ user: [P("rod", ROD_OF_RUIN, "user"), ...lands("um", MOUNTAIN, 3, "user")], ai: [P("le", LLANOWAR_ELVES, "ai")] }), "user", "rod", "le"));
    const shielded = aiGrantsFirst(duel({ active: "ai", user: [P("orn1", ORNITHOPTER, "user"), P("orn2", ORNITHOPTER, "user"), ...lands("um", MOUNTAIN, 2, "user")], ai: [P("gor", GIVER_OF_RUNES, "ai"), P("gb", GRIZZLY_BEARS, "ai")], userHand: [C("h-pyro", PYROCLASM)] }), "gor", "gb");
    // Pyroclasm is a sorcery: the user casts it in their own main phase, the protection still in force (until end of turn).
    const userTurn = { ...shielded, activePlayer: "user", priorityHolder: "user" };
    const pyroclasm = resolveAll(act(userTurn, "user", "cast-spell", (a) => a.name === "Pyroclasm"));
    expect({ capsuleBears: alive(capsule, "gb"), rodElves: alive(rod, "le"), protection: prot(shielded, "gb"), pyroclasmBears: alive(pyroclasm, "gb") })
      .toEqual({ capsuleBears: false, rodElves: false, protection: ["C"], pyroclasmBears: false });
  });
});
