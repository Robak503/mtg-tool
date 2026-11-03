/**
 * tarriansSoulcleaver.test.js — TARRIAN'S SOULCLEAVER (the play-weighted program, EDHREC #1182):
 *
 *   "Equipped creature has vigilance."
 *   "Whenever another artifact or creature is put into a graveyard from the battlefield, put a +1/+1 counter on equipped creature."
 *   "Equip {2}"
 *
 * The watcher (triggers.js — the any-controller artifact-or-creature PiG scope): any player's artifact or creature put into a graveyard
 * from the battlefield, tokens included (a token is put into a graveyard before it ceases to exist, CR 111.7, 700.4), never the
 * Soulcleaver itself ("another") and never a permanent exiled or returned to a hand. A leaves-the-battlefield ability looks back in time
 * (CR 603.10a): artifacts destroyed with the Soulcleaver trigger it. The counter (effects/atoms/counters.js — "equipped creature", a fixed
 * referent): the creature the Equipment is attached to as the ability resolves; one that has left the battlefield is read as it last
 * existed (CR 608.2h — the creature it was attached to then). Unattached, there is no equipped creature: nothing. The twin, Ghost Lantern //
 * Bind Spirit, reads the same counter. Witnessed through real game states.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CLEAVER = {"name":"Tarrian's Soulcleaver","type":"Legendary Artifact — Equipment","mana":"{1}","oracle":"Equipped creature has vigilance.\nWhenever another artifact or creature is put into a graveyard from the battlefield, put a +1/+1 counter on equipped creature.\nEquip {2}","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #1182
const LANTERN = {"name":"Ghost Lantern // Bind Spirit","type":"Artifact — Equipment // Instant — Adventure","mana":"{B} // {1}{B}","oracle":"Ghost Lantern - Artifact — Equipment {B}\nWhenever a creature you control dies, put a +1/+1 counter on equipped creature.\nEquip {1}\n//\nBind Spirit - Instant — Adventure {1}{B}\nReturn target creature card from your graveyard to your hand. (Then exile this card. You may cast the artifact later from exile.)","layout":"adventure","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #8235
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const SHATTER = {"name":"Shatter","type":"Instant","mana":"{1}{R}","oracle":"Destroy target artifact.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #14015
const STORM = {"name":"Shatterstorm","type":"Sorcery","mana":"{2}{R}{R}","oracle":"Destroy all artifacts. They can't be regenerated.","layout":"normal","cmc":4,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #17027
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11
const THOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","oracle":"Flying","layout":"normal","cmc":0,"power":"0","toughness":"2","loyalty":null,"keywords":["Flying"],"colors":[],"colorIdentity":[]}; // EDHREC #782
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","oracle":"Return target creature to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2928

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const SOLDIER = { name: "Soldier", type: "Token Creature — Soldier", mana: "", oracle: "", power: "1", toughness: "1", colors: ["W"], keywords: [], token: true };
/** The person's precombat main: the Soulcleaver (attached to `equipped`, else unattached), the person's Grizzly Bears and Llanowar Elves, the AI's `foes`; `hand`, `pool`. */
function table({ equipped = "bears", hand = [], foes = [], board = [], pool = { W: 1, U: 1, R: 4, C: 2 }, cleaver = CLEAVER } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: [on("user", "cleaver", cleaver), on("user", "bears", BEARS), on("user", "elves", ELVES), ...board],
        hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), graveyard: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, battlefield: foes, hand: [], graveyard: [], library: [], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
    } };
  return equipped ? attachPermanent(s, { equipId: "cleaver", targetId: equipped }) : s;
}
/** Resolve everything: the stack and every waiting trigger. */
function drain(n) {
  let g = 0;
  while (g++ < 60) {
    if (n.pendingChoice) break;
    if (n.stack?.length) { n = resolveTopOfStack(n); continue; }
    if (n.pendingTriggers?.length) { n = flushTriggers(n, { chooseTargets: chooseTriggerTargets }); continue; }
    break;
  }
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return finalizeStackResolution(n);
}
/** The person casts hand card `cardId` (at `targetId` when it targets) and everything resolves. */
function cast(s, cardId, targetId = null) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId && (!targetId || (x.targets || []).some((t) => t.id === targetId)));
  expect(a, `${cardId} is not offered${targetId ? ` at ${targetId}` : ""}`).toBeTruthy();
  return drain(dispatchAction(s, a));
}
const plus = (s, id) => {
  for (const p of Object.values(s.players)) { const perm = p.battlefield.find((x) => x.id === id); if (perm) return perm.counters?.["+1/+1"] ?? 0; }
  return null;
};

describe("the card", () => {
  it("⭐ native: every line plays", () => {
    expect(isNativeTier(classifyCard(CLEAVER))).toBe(true);
  });
});

describe("whenever another artifact or creature is put into a graveyard from the battlefield", () => {
  it("⭐ the AI's Hill Giant dies to Lightning Bolt: a +1/+1 counter on the equipped Bears", () => {
    const s = cast(table({ hand: [BOLT], foes: [on("ai", "giant", GIANT)] }), "h0", "giant");
    const fired = (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "add-counter").map((e) => e.targets); // each resolution of its trigger
    expect({ giant: plus(s, "giant"), bears: plus(s, "bears"), elves: plus(s, "elves"), fired }).toEqual({ giant: null, bears: 1, elves: 0, fired: [["bears"]] });
  });
  it("⭐ an artifact (the AI's Sol Ring, Shattered): a counter", () => {
    const s = cast(table({ hand: [SHATTER], foes: [on("ai", "sol", SOL)] }), "h0", "sol");
    expect({ sol: plus(s, "sol"), bears: plus(s, "bears") }).toEqual({ sol: null, bears: 1 });
  });
  it("⭐ a creature token is put into a graveyard too: a counter", () => {
    const s = cast(table({ hand: [BOLT], foes: [on("ai", "tok", SOLDIER)] }), "h0", "tok");
    expect({ tok: plus(s, "tok"), bears: plus(s, "bears") }).toEqual({ tok: null, bears: 1 });
  });
  it("⭐ an artifact creature (Ornithopter) is one permanent: one counter", () => {
    const s = cast(table({ hand: [BOLT], foes: [on("ai", "thopter", THOPTER)] }), "h0", "thopter");
    expect(plus(s, "bears")).toBe(1);
  });
  it("⭐ your own creature counts too: the Elves Bolted — a counter on the Bears", () => {
    const s = cast(table({ hand: [BOLT] }), "h0", "elves");
    expect({ elves: plus(s, "elves"), bears: plus(s, "bears") }).toEqual({ elves: null, bears: 1 });
  });
  it("⭐ two deaths, two counters", () => {
    const s1 = cast(table({ hand: [BOLT, SHATTER], foes: [on("ai", "giant", GIANT), on("ai", "sol", SOL)] }), "h0", "giant");
    const s = cast(s1, "h1", "sol");
    expect(plus(s, "bears")).toBe(2);
  });
  it("⭐ the counter follows the Equipment: equipped to the Elves, the Elves get it", () => {
    const s = cast(table({ equipped: "elves", hand: [BOLT], foes: [on("ai", "giant", GIANT)] }), "h0", "giant");
    expect({ bears: plus(s, "bears"), elves: plus(s, "elves") }).toEqual({ bears: 0, elves: 1 });
  });
  it("⭐ Shatterstorm takes the Soulcleaver with Sol Ring and Ornithopter: it sees both (CR 603.10a), and the counters go on the creature it was attached to (CR 608.2h)", () => {
    const s = cast(table({ hand: [STORM], foes: [on("ai", "sol", SOL), on("ai", "thopter", THOPTER)] }), "h0");
    expect({ cleaver: plus(s, "cleaver"), sol: plus(s, "sol"), thopter: plus(s, "thopter"), bears: plus(s, "bears"), elves: plus(s, "elves") })
      .toEqual({ cleaver: null, sol: null, thopter: null, bears: 2, elves: 0 });
  });
});

describe("the Equipment leaves while its ability waits (CR 608.2h)", () => {
  it("⭐ the Giant dies, and the Soulcleaver is Shattered in response: the counter goes on the creature it was attached to", () => {
    const s0 = table({ hand: [BOLT, SHATTER], foes: [on("ai", "giant", GIANT)] });
    const bolt = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h0" && (x.targets || []).some((t) => t.id === "giant"));
    expect(bolt, "Lightning Bolt at the Giant is not offered").toBeTruthy();
    let n = resolveTopOfStack(dispatchAction(s0, bolt));
    n = flushTriggers(n, { chooseTargets: chooseTriggerTargets });
    expect((n.stack || []).map((o) => o.source?.name ?? o.source), "the Soulcleaver's trigger is not on the stack").toContain("Tarrian's Soulcleaver");
    const shatter = legalActionsForPlayer({ ...n, priorityHolder: "user" }, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h1" && (x.targets || []).some((t) => t.id === "cleaver"));
    expect(shatter, "Shatter at the Soulcleaver is not offered in response").toBeTruthy();
    const s = drain(dispatchAction({ ...n, priorityHolder: "user" }, shatter));
    expect({ cleaver: plus(s, "cleaver"), bears: plus(s, "bears"), elves: plus(s, "elves") }).toEqual({ cleaver: null, bears: 1, elves: 0 });
  });
});

describe("nothing to put it on, or nothing that counts", () => {
  it("unattached: the Giant dies — no creature gets a counter", () => {
    const s = cast(table({ equipped: null, hand: [BOLT], foes: [on("ai", "giant", GIANT)] }), "h0", "giant");
    expect({ bears: plus(s, "bears"), elves: plus(s, "elves") }).toEqual({ bears: 0, elves: 0 });
  });
  it("the equipped Bears die: it is unattached as the trigger resolves — no counter on anything", () => {
    const s = cast(table({ hand: [BOLT] }), "h0", "bears");
    expect({ bears: plus(s, "bears"), elves: plus(s, "elves"), attached: s.players.user.battlefield.find((p) => p.id === "cleaver")?.attachedTo ?? null })
      .toEqual({ bears: null, elves: 0, attached: null });
  });
  it("\"another\": the Soulcleaver itself Shattered — no counter", () => {
    const s = cast(table({ hand: [SHATTER] }), "h0", "cleaver");
    const fired = (s.log || []).filter((e) => e.kind === "spell-effect" && e.effect === "add-counter").map((e) => e.targets); // each resolution of its trigger
    expect({ cleaver: plus(s, "cleaver"), bears: plus(s, "bears"), fired }).toEqual({ cleaver: null, bears: 0, fired: [] });
  });
  it("exiled or returned to hand is not put into a graveyard: Swords to Plowshares and Unsummon — no counter", () => {
    const s1 = cast(table({ hand: [SWORDS, UNSUMMON], foes: [on("ai", "giant", GIANT), on("ai", "thopter", THOPTER)] }), "h0", "giant");
    const s = cast(s1, "h1", "thopter");
    expect({ giant: plus(s, "giant"), thopter: plus(s, "thopter"), bears: plus(s, "bears") }).toEqual({ giant: null, thopter: null, bears: 0 });
  });
  it("equipped creature has vigilance: the Bears attack and stay untapped", () => {
    const s = { ...table(), phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
    const atk = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "bears");
    expect(atk, "the Bears' attack is not offered").toBeTruthy();
    const after = dispatchAction(s, atk);
    expect(after.players.user.battlefield.find((p) => p.id === "bears")?.tapped).toBe(false);
  });
});

describe("the twin: Ghost Lantern — \"Whenever a creature you control dies, put a +1/+1 counter on equipped creature.\"", () => {
  it("⭐ native: both halves play", () => {
    expect(isNativeTier(classifyCard(LANTERN))).toBe(true);
  });
  it("⭐ the person's Elves die: a counter on the equipped Bears", () => {
    const s = cast(table({ cleaver: LANTERN, hand: [BOLT] }), "h0", "elves");
    expect(plus(s, "bears")).toBe(1);
  });
  it("an opponent's creature dies: no counter", () => {
    const s = cast(table({ cleaver: LANTERN, hand: [BOLT], foes: [on("ai", "giant", GIANT)] }), "h0", "giant");
    expect(plus(s, "bears")).toBe(0);
  });
});
