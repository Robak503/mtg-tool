/**
 * PRIORITY AFTER AN ACTIVATION — a rules-faithfulness fix, every case driven through the engine's own entry points
 * (legalActionsForPlayer → dispatchAction → passPriority / resolveTopOfStack).
 *
 *    CR 117.3c — "If a player has priority when they cast a spell, activate an ability, or take a special action, that player
 *                 receives priority afterward."
 *    CR 117.4  — "If all players pass in succession (that is, if all players pass without taking any actions in between
 *                 passing), the spell or ability on top of the stack resolves or, if the stack is empty, the phase or step ends."
 *    CR 702.122a — "Crew is an activated ability of Vehicle cards. "Crew N" means "Tap any number of other untapped creatures
 *                 you control with total power N or greater: This permanent becomes an artifact creature until end of turn.""
 *    CR 702.122d — "Whenever [this Vehicle] becomes crewed" means "Whenever a crew ability of [this Vehicle] resolves.""
 *
 * The bug: three dispatcher lanes left the pass count where it was. The graveyard self-return (Reassembling Skeleton) and the
 * exile-from-graveyard ability (Halo Scarab) put their ability on the stack without restarting the count, so an activation
 * taken after some players had passed resolved once the players after the activator passed — the players who had passed
 * before it never held priority with it on the stack. Crew restarted nothing either, and took effect at once instead of using
 * the stack: no player could respond to it before the Vehicle became a creature, and "whenever this Vehicle becomes crewed"
 * triggered on the activation rather than on the crew ability's resolution.
 *
 * Real oracle fixtures (bundled Scryfall data via cardIndex.publicCard, generated 2026-10-18; the trailing comment is the tier
 * at generation). Per-test instance ids only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentIsCreature } from "./layers.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ───────────────────────────────────────────────────────────────────────
const REASSEMBLING_SKELETON = {"name":"Reassembling Skeleton","type":"Creature — Skeleton Warrior","mana":"{1}{B}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"{1}{B}: Return this card from your graveyard to the battlefield tapped."}; // native-activated
const HALO_SCARAB = {"name":"Halo Scarab","type":"Artifact Creature — Insect","mana":"{2}","cmc":2,"power":"2","toughness":"1","keywords":["Treasure"],"colors":[],"oracle":"{2}, Exile this card from your graveyard: Create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // native-activated
const SLEEK_SCHOONER = {"name":"Sleek Schooner","type":"Artifact — Vehicle","mana":"{3}","cmc":3,"power":"4","toughness":"3","keywords":["Crew"],"colors":[],"oracle":"Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // native-body
const MOBILIZER_MECH = {"name":"Mobilizer Mech","type":"Artifact — Vehicle","mana":"{1}{U}","cmc":2,"power":"3","toughness":"4","keywords":["Flying","Crew"],"colors":["U"],"oracle":"Flying\nWhenever this Vehicle becomes crewed, up to one other target Vehicle you control becomes an artifact creature until end of turn.\nCrew 3 (Tap any number of creatures you control with total power 3 or more: This Vehicle becomes an artifact creature until end of turn.)"}; // native-trigger
const SCAVENGING_OOZE = {"name":"Scavenging Ooze","type":"Creature — Ooze","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"{G}: Exile target card from a graveyard. If it was a creature card, put a +1/+1 counter on this creature and you gain 1 life."}; // native-activated
const PRODIGAL_PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"{T}: This creature deals 1 damage to any target."}; // native-activated
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","cmc":2,"keywords":[],"colors":["R"],"oracle":"Destroy target artifact."}; // native-spell
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."}; // native-spell
const WANDERBRINE_PREACHER = {"name":"Wanderbrine Preacher","type":"Creature — Merfolk Cleric","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever this creature becomes tapped, you gain 2 life."}; // native-trigger
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const HILL_GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land

// ── boards ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...over });
const C = (id, card) => ({ id, ...card });

/** A two-seat game in the user's precombat main phase (the user holds priority, no pass yet). */
function duel({ user = [], ai = [], userHand = [], aiHand = [], userGy = [], aiGy = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    combat: { attackers: [], blockers: [] },
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: userHand, graveyard: userGy, library: [] },
      ai: { ...s0.players.ai, battlefield: ai, hand: aiHand, graveyard: aiGy, library: [] },
    },
  };
}
/** A four-seat Commander pod in the user's precombat main phase; `seats` maps a seat to { battlefield, hand, graveyard }. */
function pod(seats = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) {
    const z = seats[pid] || {};
    players[pid] = { ...players[pid], battlefield: z.battlefield || [], hand: z.hand || [], graveyard: z.graveyard || [], library: [] };
  }
  return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [], combat: { attackers: [], blockers: [] }, players };
}

const offered = (s, pid, kind) => legalActionsForPlayer(s, pid).filter((a) => a.kind === kind);
/** Dispatch the first OFFERED action of `kind` for `pid` that satisfies `pred`; throws when none is offered (setup only). */
function act(s, pid, kind, pred = () => true) {
  const action = offered(s, pid, kind).find(pred);
  if (!action) throw new Error(`no ${kind} offered to ${pid} at ${s.step}`);
  return dispatchAction(s, action);
}
const pass = (s) => act(s, s.priorityHolder, "pass-priority");
/**
 * Pass priority until the stack is no deeper than `depth` (the object on top resolved) or `limit` passes. One row per window:
 * who held priority, the pass count, and the stack's depth.
 */
function passUntilResolved(s, depth, limit = 12) {
  let cur = s;
  const windows = [];
  for (let g = 0; g < limit && cur.stack.length > depth; g++) {
    windows.push({ holder: cur.priorityHolder, passes: cur.consecutivePasses, stack: cur.stack.length });
    cur = pass(cur);
  }
  return { state: cur, windows };
}
const holdersWhile = (windows) => windows.map((w) => w.holder);

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("the graveyard self-return (GY-1) — the activator gets priority and the count restarts (CR 117.3c, 117.4)", () => {
  const skeletonDuel = (extra = {}) => duel({ ai: [P("sw1", SWAMP, "ai"), P("sw2", SWAMP, "ai")], aiGy: [C("rsk", REASSEMBLING_SKELETON)], ...extra });

  it("the AI activates Reassembling Skeleton after the user passed: the AI holds priority with the pass count at 0", () => {
    let s = pass(skeletonDuel());
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["ai", 1]);
    s = act(s, "ai", "activate-gy-recursion");
    expect(s.stack).toHaveLength(1);
    expect(s.priorityHolder).toBe("ai");
    expect(s.consecutivePasses).toBe(0);
  });

  it("the user, who had passed before the activation, holds priority with the ability on the stack and can exile the card in response", () => {
    let s = pass(skeletonDuel({ user: [P("ooze", SCAVENGING_OOZE, "user"), P("f1", FOREST, "user")] }));
    s = act(s, "ai", "activate-gy-recursion");
    s = pass(s); // the AI passes with its ability on the stack
    expect(s.stack).toHaveLength(1);
    expect(s.priorityHolder).toBe("user");
    // Scavenging Ooze exiles the Skeleton from the AI's graveyard in response.
    const exile = offered(s, "user", "activate-ability").find((a) => a.permanentId === "ooze" && JSON.stringify(a.targets || []).includes("rsk"));
    expect(exile).toBeTruthy();
    s = dispatchAction(s, exile);
    const { state: after } = passUntilResolved(s, 0);
    expect(after.players.ai.battlefield.some((p) => p.card?.id === "rsk")).toBe(false);
    expect(after.players.ai.exile.some((c) => c.id === "rsk")).toBe(true);
    expect((after.log || []).some((e) => e.effect === "gy-self-return" && e.fizzled)).toBe(true);
  });

  it("in a pod: every seat — the active player included — holds priority while the ability waits on the stack", () => {
    let s = pass(pod({ ai1: { battlefield: [P("sw1", SWAMP, "ai1"), P("sw2", SWAMP, "ai1")], graveyard: [C("rsk", REASSEMBLING_SKELETON)] } }));
    s = act(s, "ai1", "activate-gy-recursion");
    const { state: after, windows } = passUntilResolved(s, 0);
    expect(holdersWhile(windows)).toEqual(["ai1", "ai2", "ai3", "user"]);
    expect(after.players.ai1.battlefield.some((p) => p.card?.id === "rsk" && p.tapped)).toBe(true);
    // After the resolution the active player receives priority with the count restarted (CR 117.3b) — unchanged.
    expect([after.priorityHolder, after.consecutivePasses]).toEqual(["user", 0]);
  });
});

describe("the exile-from-graveyard ability (GY-2) — the activator gets priority and the count restarts (CR 117.3c, 117.4)", () => {
  it("the AI activates Halo Scarab after the user passed: the AI holds priority with the count at 0, then the user does, before the Treasure exists", () => {
    let s = pass(duel({ ai: [P("sw1", SWAMP, "ai"), P("sw2", SWAMP, "ai")], aiGy: [C("hsc", HALO_SCARAB)] }));
    s = act(s, "ai", "activate-gy-exile");
    expect(s.players.ai.exile.some((c) => c.id === "hsc")).toBe(true); // the exile is a cost, paid on activation
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["ai", 0]);
    s = pass(s);
    expect(s.priorityHolder).toBe("user");
    expect(s.stack).toHaveLength(1);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Treasure")).toBe(false);
    s = pass(s);
    expect(s.stack).toHaveLength(0);
    expect(s.players.ai.battlefield.some((p) => p.card?.name === "Treasure")).toBe(true);
  });

  it("in a pod: every seat holds priority while the ability waits on the stack", () => {
    let s = pass(pod({ ai1: { battlefield: [P("sw1", SWAMP, "ai1"), P("sw2", SWAMP, "ai1")], graveyard: [C("hsc", HALO_SCARAB)] } }));
    s = act(s, "ai1", "activate-gy-exile");
    const { state: after, windows } = passUntilResolved(s, 0);
    expect(holdersWhile(windows)).toEqual(["ai1", "ai2", "ai3", "user"]);
    expect(after.players.ai1.battlefield.some((p) => p.card?.name === "Treasure")).toBe(true);
  });
});

describe("crew — an activated ability that uses the stack (CR 702.122a, 117.3c)", () => {
  const schoonerDuel = (extra = {}) => duel({ user: [P("veh", SLEEK_SCHOONER, "user"), P("gb", GRIZZLY_BEARS, "user")], ...extra });

  it("activating crew taps the crew at once (the cost) and puts the ability on the stack; the Vehicle is not a creature yet and the activator holds priority", () => {
    let s = schoonerDuel();
    const crew = offered(s, "user", "crew-vehicle");
    expect(crew).toHaveLength(1);
    s = dispatchAction(s, crew[0]);
    expect(s.players.user.battlefield.find((p) => p.id === "gb").tapped).toBe(true);
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0]).toMatchObject({ kind: "activated-ability", controller: "user" });
    expect(permanentIsCreature(s, "veh")).toBe(false);
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["user", 0]);
  });

  it("the opponent can respond before the Vehicle becomes a creature: Shatter destroys it, the crew ability does nothing and the crew stays tapped", () => {
    let s = schoonerDuel({ ai: [P("m1", MOUNTAIN, "ai"), P("m2", MOUNTAIN, "ai")], aiHand: [C("sh", SHATTER)] });
    s = act(s, "user", "crew-vehicle");
    s = pass(s);
    expect(s.priorityHolder).toBe("ai");
    expect(permanentIsCreature(s, "veh")).toBe(false);
    s = act(s, "ai", "cast-spell", (a) => a.name === "Shatter" && (a.targets || []).some((t) => t.id === "veh"));
    const { state: after } = passUntilResolved(s, 0);
    expect(after.players.user.battlefield.some((p) => p.id === "veh")).toBe(false);
    expect(after.players.user.graveyard.some((c) => c.name === "Sleek Schooner")).toBe(true);
    expect(after.players.user.battlefield.find((p) => p.id === "gb").tapped).toBe(true);
    expect((after.continuousEffects || []).some((e) => (e.affects?.permanentIds || []).includes("veh"))).toBe(false);
  });

  it("crew taken with a pass already counted (the AI's Lightning Bolt on the stack, the AI passed): the count restarts, so the AI gets priority before the crew ability resolves", () => {
    let s = pass(schoonerDuel({ ai: [P("m1", MOUNTAIN, "ai")], aiHand: [C("lb", LIGHTNING_BOLT)] }));
    s = act(s, "ai", "cast-spell", (a) => a.name === "Lightning Bolt");
    s = pass(s); // the AI passes with its Bolt on the stack: the user holds priority, one pass counted
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["user", 1]);
    s = act(s, "user", "crew-vehicle");
    expect([s.priorityHolder, s.consecutivePasses, s.stack.length]).toEqual(["user", 0, 2]);
    const { state: after, windows } = passUntilResolved(s, 1);
    expect(holdersWhile(windows)).toEqual(["user", "ai"]);
    expect(permanentIsCreature(after, "veh")).toBe(true);
    expect(after.stack.map((o) => o.source?.name)).toEqual(["Lightning Bolt"]);
  });

  it("in a pod: every seat holds priority before the Vehicle becomes a creature; on resolution it is one, ready to attack", () => {
    let s = pod({ user: { battlefield: [P("veh", SLEEK_SCHOONER, "user"), P("gb", GRIZZLY_BEARS, "user")] } });
    s = act(s, "user", "crew-vehicle");
    const seen = [];
    for (let g = 0; g < 12 && s.stack.length; g++) {
      seen.push([s.priorityHolder, permanentIsCreature(s, "veh")]);
      s = pass(s);
    }
    expect(seen).toEqual([["user", false], ["ai1", false], ["ai2", false], ["ai3", false]]);
    expect(permanentIsCreature(s, "veh")).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "veh").summoningSick).toBe(false);
    expect([s.priorityHolder, s.consecutivePasses, s.step]).toEqual(["user", 0, "main"]);
  });

  it("CR 702.122d — Mobilizer Mech's becomes-crewed trigger waits for the crew ability to resolve", () => {
    let s = duel({ user: [P("mm", MOBILIZER_MECH, "user"), P("hg", HILL_GIANT, "user")] });
    s = act(s, "user", "crew-vehicle", (a) => a.permanentId === "mm");
    const mechTrigger = (st) => st.stack.some((o) => o.kind === "triggered-ability" && (o.source?.name === "Mobilizer Mech" || o.source === "Mobilizer Mech"))
      || (st.pendingTriggers || []).length > 0;
    expect(mechTrigger(s)).toBe(false);
    s = pass(pass(s)); // both players pass: the crew ability resolves
    expect(permanentIsCreature(s, "mm")).toBe(true);
    expect(mechTrigger(s)).toBe(true);
  });

  it("CR 117.5 — a trigger the crew cost raised (Wanderbrine Preacher becomes tapped) goes on the stack above the crew ability before the activator gets priority, so it resolves first", () => {
    let s = duel({ user: [P("veh", SLEEK_SCHOONER, "user"), P("wp", WANDERBRINE_PREACHER, "user")] });
    s = act(s, "user", "crew-vehicle");
    expect(s.stack.map((o) => o.kind)).toEqual(["activated-ability", "triggered-ability"]);
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["user", 0]);
    const life = s.players.user.life;
    s = pass(pass(s)); // the trigger resolves first: 2 life, the Vehicle still not a creature
    expect([s.players.user.life - life, permanentIsCreature(s, "veh"), s.stack.length]).toEqual([2, false, 1]);
    s = pass(pass(s));
    expect([permanentIsCreature(s, "veh"), s.stack.length]).toEqual([true, 0]);
  });

  it("control (both trees): while a Vehicle's crew ability is pending, crew is not offered for it again", () => {
    let s = schoonerDuel({ user: [P("veh", SLEEK_SCHOONER, "user"), P("gb", GRIZZLY_BEARS, "user"), P("gb2", GRIZZLY_BEARS, "user")] });
    s = act(s, "user", "crew-vehicle");
    expect(offered(s, "user", "crew-vehicle").filter((a) => a.permanentId === "veh")).toHaveLength(0);
  });
});

describe("controls — the lanes that were already right (pass on both trees)", () => {
  /** The user passes in its main phase, the AI casts Lightning Bolt at the user and passes: the user holds priority, one pass counted. */
  const boltOnTheStack = (user) => {
    let s = pass(duel({ user, ai: [P("m1", MOUNTAIN, "ai")], aiHand: [C("lb", LIGHTNING_BOLT)] }));
    s = act(s, "ai", "cast-spell", (a) => a.name === "Lightning Bolt");
    return { cast: s, held: pass(s) };
  };

  it("a spell (Lightning Bolt) after the user passed: the AI holds priority with the count at 0, the user gets priority before it resolves", () => {
    const { cast, held } = boltOnTheStack([]);
    expect([cast.priorityHolder, cast.consecutivePasses]).toEqual(["ai", 0]);
    expect([held.priorityHolder, held.consecutivePasses, held.stack.length]).toEqual(["user", 1, 1]);
  });

  it("a normal activated ability (Prodigal Pyromancer) taken with one pass counted: the activator holds priority with the count at 0, the AI gets priority before it resolves", () => {
    let s = boltOnTheStack([P("pp", PRODIGAL_PYROMANCER, "user")]).held;
    s = act(s, "user", "activate-ability", (a) => a.permanentId === "pp");
    expect([s.priorityHolder, s.consecutivePasses, s.stack.length]).toEqual(["user", 0, 2]);
    s = pass(s);
    expect([s.priorityHolder, s.stack.length]).toEqual(["ai", 2]);
  });

  it("a mana ability does not restart the count (it doesn't use the stack — left as the prior slice decided)", () => {
    let s = boltOnTheStack([P("f1", FOREST, "user")]).held;
    s = act(s, "user", "tap-for-mana");
    expect([s.priorityHolder, s.consecutivePasses]).toEqual(["user", 1]);
  });
});
