/**
 * aiActivatedBlink.test.js — the default AI activates a blink ability on its own creature whose enters trigger is worth firing
 * again (AI decision quality; the offer and the resolution are unchanged).
 *
 * The rules the choice sits on: CR 400.7 (a permanent that leaves the battlefield and returns is a new object — its enters
 * abilities trigger again, CR 603.6a, and it returns summoning-sick, CR 302.6), CR 110.5b (a permanent returned "tapped" enters
 * tapped), CR 111.8 (a token that leaves the battlefield ceases to exist) and CR 602.2 (an activated ability's costs are paid as
 * it is activated).
 *
 * Before this fix `opponentAI.pickTargetedActivation` had no blink arm and `pickSafeAbilityActivation` refuses every targeted
 * activation, so an AI seat never used Eldrazi Displacer, Distinguished Conjurer, Nephalia Smuggler, Lilysplash Mentor or Emiel
 * the Blessed (the five bundled cards whose activated ability parses to a blink — play-weighted #13's found-not-fixed (1)). The
 * fix reads an activated blink as the spell arm reads Cloudshift and Ephemerate (`pickTargetedSpell`): its own nontoken creature
 * that comes back to it, with no +1/+1 counter or attachment of its own to lose, whose enters trigger is worth firing again
 * (`entersTriggerWorthRebuy`) or that sheds an opponent's Aura — postcombat, or precombat when the creature would not attack.
 * A source whose cost taps it waits for the postcombat main when it would attack, and is held as the picker's other creature
 * taps are (under the life floor, or clearly behind on the board — it would miss its blocks); a blink that returns the creature
 * tapped takes only a creature that is tapped already (an untapped one would lose its blocks).
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle_cards.json), copied verbatim; the token object adds the
 * engine's `token: true` flag (a token is no card, CR 111.1).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { pickAction, POLICY_KEYS } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const CONJURER = {"name":"Distinguished Conjurer","type":"Creature — Human Wizard","mana":"{1}{W}","cmc":2,"power":"1","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever another creature you control enters, you gain 1 life.\n{4}{W}, {T}: Exile another target creature you control, then return it to the battlefield under its owner's control."}; // EDHREC #4523
const DISPLACER = {"name":"Eldrazi Displacer","type":"Creature — Eldrazi","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\n{2}{C}: Exile another target creature, then return it to the battlefield tapped under its owner's control. ({C} represents colorless mana.)"}; // EDHREC #3052
const EMIEL = {"name":"Emiel the Blessed","type":"Legendary Creature — Unicorn","mana":"{2}{W}{W}","cmc":4,"power":"4","toughness":"4","keywords":[],"colors":["W"],"oracle":"{3}: Exile another target creature you control, then return it to the battlefield under its owner's control.\nWhenever another creature you control enters, you may pay {G/W}. If you do, put a +1/+1 counter on it. If it's a Unicorn, put two +1/+1 counters on it instead. ({G/W} can be paid with either {G} or {W}.)"}; // EDHREC #2763
const SMUGGLER = {"name":"Nephalia Smuggler","type":"Creature — Human Rogue","mana":"{U}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["U"],"oracle":"{3}{U}, {T}: Exile another target creature you control, then return that card to the battlefield under your control."}; // EDHREC #13029
const MENTOR = {"name":"Lilysplash Mentor","type":"Creature — Frog Druid","mana":"{2}{G}{U}","cmc":4,"power":"4","toughness":"4","keywords":["Reach"],"colors":["G","U"],"oracle":"Reach\n{1}{G}{U}: Exile another target creature you control, then return it to the battlefield under its owner's control with a +1/+1 counter on it. Activate only as a sorcery."}; // EDHREC #4824
const MULLDRIFTER = {"name":"Mulldrifter","type":"Creature — Elemental","mana":"{4}{U}","cmc":5,"power":"2","toughness":"2","keywords":["Flying","Evoke"],"colors":["U"],"oracle":"Flying\nWhen this creature enters, draw two cards.\nEvoke {2}{U} (You may cast this spell for its evoke cost. If you do, it's sacrificed when it enters.)"}; // EDHREC #600
const VISIONARY = {"name":"Elvish Visionary","type":"Creature — Elf Shaman","mana":"{1}{G}","cmc":2,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, draw a card."}; // EDHREC #2306
const KAVU = {"name":"Flametongue Kavu","type":"Creature — Kavu","mana":"{3}{R}","cmc":4,"power":"4","toughness":"2","keywords":[],"colors":["R"],"oracle":"When this creature enters, it deals 4 damage to target creature."}; // EDHREC #13122
const MONITOR = {"name":"Brood Monitor","type":"Creature — Eldrazi Drone","mana":"{4}{G}{G}","cmc":6,"power":"3","toughness":"3","keywords":["Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nWhen this creature enters, create three 1/1 colorless Eldrazi Scion creature tokens. They have \"Sacrifice this token: Add {C}.\""}; // EDHREC #9334
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // EDHREC #1
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};

const lands = (card, n, prefix) => Array.from({ length: n }, (_, i) => [`${prefix}${i}`, card]);

/**
 * The AI's main phase (postcombat unless `phase` says otherwise), stack empty, two seats. `ai` / `user` = [[permId, card, opts]]
 * in battlefield order (untapped, not summoning-sick unless opts say so; opts.counters, opts.owner, opts.token). The AI's library
 * holds five Plains to draw.
 */
function table({ ai = [], user = [], phase = "postcombat-main", life = 40 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (controller) => ([id, c, o = {}]) => ({
    ...createPermanent({ id, controller, summoningSick: !!o.sick, tapped: !!o.tapped, card: { ...c, id: `c-${id}`, ...(o.token ? { token: true } : {}) } }),
    counters: { ...(o.counters || {}) }, ...(o.owner ? { owner: o.owner } : {}), ...(o.token ? { token: true } : {}),
  });
  return { ...s0, turn: 6, phase, step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, stack: [],
    combat: { attackers: [], blockers: [] },
    players: { ...s0.players,
      ai: { ...s0.players.ai, life, landsPlayedThisTurn: 1, battlefield: ai.map(P("ai")), hand: [], library: lands(PLAINS, 5, "lib").map(([id, c]) => ({ ...c, id })) },
      user: { ...s0.players.user, life: 40, landsPlayedThisTurn: 1, battlefield: user.map(P("user")), hand: [] } } };
}
const offered = (s, permId) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const aiPick = (s, opts) => pickAction(s, "ai", legalActionsForPlayer(s, "ai"), opts);
const blinkOf = (a, permId) => (a?.kind === "activate-ability" && a.permanentId === permId ? a : null);
const targetOf = (a) => a?.targets?.[0]?.id;
function resolveStack(s) {
  let g = 0;
  while (s.stack.length && g++ < 200) s = passPriority(s);
  return s;
}
const named = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name);

describe("a re-buy of its own creature's enters trigger", () => {
  it("⭐ Distinguished Conjurer blinks Mulldrifter in the postcombat main — two more cards, the Conjurer's 1 life", () => {
    const s = table({ ai: [...lands(PLAINS, 4, "p"), ...lands(ISLAND, 1, "i"), ["conj", CONJURER], ["mull", MULLDRIFTER]], user: [["ub", BEARS]] });
    expect(offered(s, "conj").map(targetOf)).toEqual(["mull"]);
    const a = blinkOf(aiPick(s), "conj");
    expect(targetOf(a)).toBe("mull");
    const after = resolveStack(dispatchAction(s, a));
    expect(after.players.ai.hand.length).toBe(2);
    expect(after.players.ai.life).toBe(41);
    expect(named(after, "ai", "Mulldrifter").length).toBe(1);
    expect(named(after, "ai", "Distinguished Conjurer")[0].tapped).toBe(true);
  });

  it("⭐ Emiel the Blessed blinks its summoning-sick Elvish Visionary in the precombat main (it would not attack anyway)", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["vis", VISIONARY, { sick: true }]], user: [["ub", BEARS]], phase: "precombat-main" });
    const a = blinkOf(aiPick(s), "emiel");
    expect(targetOf(a)).toBe("vis");
    const after = resolveStack(dispatchAction(s, a));
    expect(after.players.ai.hand.length).toBe(1);
  });

  it("control: in the precombat main Emiel leaves a Mulldrifter that would attack alone (the blink would make it summoning-sick)", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mull", MULLDRIFTER]], user: [["ub", BEARS]], phase: "precombat-main" });
    expect(offered(s, "emiel").map(targetOf)).toEqual(["mull"]);
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });

  it("control: in the precombat main a Conjurer that would attack keeps its tap for the attack — the re-buy waits for the postcombat main", () => {
    const s = table({ ai: [...lands(PLAINS, 4, "p"), ...lands(ISLAND, 1, "i"), ["conj", CONJURER], ["vis", VISIONARY, { sick: true }]], user: [], phase: "precombat-main" });
    expect(offered(s, "conj").map(targetOf)).toEqual(["vis"]);
    expect(blinkOf(aiPick(s), "conj")).toBeNull();
  });

  it("⭐ Flametongue Kavu's re-buy deals 4 to the user's Grizzly Bears", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["kavu", KAVU]], user: [["ub", BEARS]] });
    const a = blinkOf(aiPick(s), "emiel");
    expect(targetOf(a)).toBe("kavu");
    const after = resolveStack(dispatchAction(s, a));
    expect(named(after, "user", "Grizzly Bears").length).toBe(0);
    expect(named(after, "ai", "Flametongue Kavu").length).toBe(1);
  });

  it("control: with no opposing creature the Kavu's trigger would be forced onto the AI's own Emiel or itself — held", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["kavu", KAVU]] });
    expect(offered(s, "emiel").map(targetOf)).toEqual(["kavu"]);
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });
});

describe("what a blink would cost", () => {
  it("control: a creature with no enters trigger (Grizzly Bears) is left alone", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["bear", BEARS]] });
    expect(offered(s, "emiel").map(targetOf)).toEqual(["bear"]);
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });

  it("control: a Mulldrifter with a +1/+1 counter keeps it — held", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mull", MULLDRIFTER, { counters: { "+1/+1": 1 } }]] });
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });

  it("control: a token copy of Mulldrifter would cease to exist — held", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["tok", MULLDRIFTER, { token: true }]] });
    expect(offered(s, "emiel").map(targetOf)).toEqual(["tok"]);
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });

  it("control: a Mulldrifter the user owns would go home under Emiel's \"under its owner's control\" — held", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mull", MULLDRIFTER, { owner: "user" }]] });
    expect(offered(s, "emiel").map(targetOf)).toEqual(["mull"]);
    expect(blinkOf(aiPick(s), "emiel")).toBeNull();
  });

  it("⭐ the same Mulldrifter under Nephalia Smuggler's \"under your control\" stays the AI's — blinked", () => {
    const s = table({ ai: [...lands(ISLAND, 4, "i"), ["smug", SMUGGLER], ["mull", MULLDRIFTER, { owner: "user" }]] });
    const a = blinkOf(aiPick(s), "smug");
    expect(targetOf(a)).toBe("mull");
    const after = resolveStack(dispatchAction(s, a));
    expect(named(after, "ai", "Mulldrifter").length).toBe(1);
    expect(after.players.ai.hand.length).toBe(2);
  });

  // Five opposing Grizzly Bears against two creatures: clearly behind on the board (three creatures down).
  const FIVE_BEARS = Array.from({ length: 5 }, (_, i) => [`ub${i}`, BEARS]);

  it("control: clearly behind on the board, the Conjurer keeps its tap — it is a blocker through the opponents' turns", () => {
    const s = table({ ai: [...lands(PLAINS, 4, "p"), ...lands(ISLAND, 1, "i"), ["conj", CONJURER], ["mull", MULLDRIFTER]], user: FIVE_BEARS });
    expect(offered(s, "conj").map(targetOf)).toEqual(["mull"]);
    expect(blinkOf(aiPick(s), "conj")).toBeNull();
  });

  it("⭐ clearly behind on the board, Emiel — whose cost taps nothing — still blinks Mulldrifter", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mull", MULLDRIFTER]], user: FIVE_BEARS });
    expect(targetOf(blinkOf(aiPick(s), "emiel"))).toBe("mull");
  });
});

describe("a blink that returns the creature tapped (Eldrazi Displacer)", () => {
  it("⭐ the Displacer blinks its own tapped Mulldrifter (it returns as it was), never the user's Grizzly Bears", () => {
    const s = table({ ai: [["p0", PLAINS], ["sol", SOL_RING], ["disp", DISPLACER], ["mull", MULLDRIFTER, { tapped: true }]], user: [["ub", BEARS]] });
    expect(offered(s, "disp").map(targetOf).sort()).toEqual(["mull", "ub"]);
    const a = blinkOf(aiPick(s), "disp");
    expect(targetOf(a)).toBe("mull");
    const after = resolveStack(dispatchAction(s, a));
    expect(after.players.ai.hand.length).toBe(2);
    expect(named(after, "ai", "Mulldrifter")[0].tapped).toBe(true);
  });

  it("control: an untapped Mulldrifter is left alone — it would come back tapped and miss its blocks", () => {
    const s = table({ ai: [["p0", PLAINS], ["sol", SOL_RING], ["disp", DISPLACER], ["mull", MULLDRIFTER]], user: [["ub", BEARS]] });
    expect(blinkOf(aiPick(s), "disp")).toBeNull();
  });
});

describe("a blink that returns it with a +1/+1 counter (Lilysplash Mentor)", () => {
  it("⭐ the Mentor blinks Mulldrifter once; the counter it comes back with is then kept", () => {
    const s = table({ ai: [...lands(FOREST, 3, "f"), ...lands(ISLAND, 3, "i"), ["mentor", MENTOR], ["mull", MULLDRIFTER]] });
    const a = blinkOf(aiPick(s), "mentor");
    expect(targetOf(a)).toBe("mull");
    const after = resolveStack(dispatchAction(s, a));
    const mull = named(after, "ai", "Mulldrifter")[0];
    expect(mull.counters?.["+1/+1"]).toBe(1);
    expect(after.players.ai.hand.length).toBe(2);
    expect(offered(after, "mentor").map(targetOf)).toEqual([mull.id]);
    expect(blinkOf(aiPick(after), "mentor")).toBeNull();
  });
});

describe("a repeatable blink ends", () => {
  it("⭐ Emiel blinks Brood Monitor once; the three Scions could pay for another, but a creature back from exile this turn is not blinked again", () => {
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mon", MONITOR]] });
    const a = blinkOf(aiPick(s), "emiel");
    expect(targetOf(a)).toBe("mon");
    const after = resolveStack(dispatchAction(s, a));
    const mon = named(after, "ai", "Brood Monitor")[0];
    expect(named(after, "ai", "Eldrazi Scion").length).toBe(3);
    expect(offered(after, "emiel").map(targetOf)).toContain(mon.id);
    expect(blinkOf(aiPick(after), "emiel")).toBeNull();
  });
});

describe("policy", () => {
  it("blink is a policy key; 'v1' recovers the old skip", () => {
    expect(POLICY_KEYS).toContain("blink");
    const s = table({ ai: [...lands(PLAINS, 3, "p"), ["emiel", EMIEL], ["mull", MULLDRIFTER]] });
    expect(blinkOf(aiPick(s, { policy: { blink: "v1" } }), "emiel")).toBeNull();
  });
});
