/**
 * interchangeablePayerKey.test.js — WHICH PAYERS OF A COUNTED COST ARE ONE CHOICE (legalChoices.interchangeablePayerKey, payerLabels):
 * a person pays a counted cost with the objects they choose (CR 601.2h, 602.2b), so two permanents are one offer only when nothing can
 * tell them apart. The round-3 recheck of pw28:
 *   · R3-F1 — a permanent a delayed trigger names only inside its sentinel string (Kiki-Jiki's copy, "[minted-leave sacrifice tok-2]",
 *     due to be sacrificed at the next end step — CR 603.7e) is not the same choice as an identical copy that stays;
 *   · R3-N1 — the transient last-mint stamp (`_lastMintedTokenIds`) is not a reference: the two Thopters one Whirler Rogue made are one;
 *   · R3-N2 — a label names what tells the payers apart (a token, what a stack object targets it with), and "summoning sick" only for a
 *     creature without haste (CR 302.6, 702.10b).
 * Real game states through the real actions; the Baral file holds the blocker and the clone (R2-F1). Card text: the bundled Scryfall
 * oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, passPriority, raiseTriggerTargetChoice, settleTriggerTargetChoice } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const KIKI = {"name":"Kiki-Jiki, Mirror Breaker","type":"Legendary Creature — Goblin Shaman","mana":"{2}{R}{R}{R}","oracle":"Haste\n{T}: Create a token that's a copy of target nonlegendary creature you control, except it has haste. Sacrifice it at the beginning of the next end step.","layout":"normal","cmc":5,"power":"2","toughness":"2","loyalty":null,"keywords":["Haste"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1268
const BUTCHER = {"name":"Dreadhorde Butcher","type":"Creature — Zombie Warrior","mana":"{B}{R}","oracle":"Haste\nWhenever this creature deals combat damage to a player or planeswalker, put a +1/+1 counter on this creature.\nWhen this creature dies, it deals damage equal to its power to any target.","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Haste"],"colors":["B","R"],"colorIdentity":["B","R"]}; // EDHREC #13123
const CRYPTBREAKER = {"name":"Cryptbreaker","type":"Creature — Zombie","mana":"{B}","oracle":"{1}{B}, {T}, Discard a card: Create a 2/2 black Zombie creature token.\nTap three untapped Zombies you control: You draw a card and lose 1 life.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1993
const GRAVECRAWLER = {"name":"Gravecrawler","type":"Creature — Zombie","mana":"{B}","oracle":"This creature can't block.\nYou may cast this card from your graveyard as long as you control a Zombie.","layout":"normal","cmc":1,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #669
const COUNTERPART = {"name":"Cackling Counterpart","type":"Instant","mana":"{1}{U}{U}","oracle":"Create a token that's a copy of target creature you control.\nFlashback {5}{U}{U} (You may cast this card from your graveyard for its flashback cost. Then exile it.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Flashback"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2901
const RAISE = {"name":"Raise the Alarm","type":"Instant","mana":"{1}{W}","oracle":"Create two 1/1 white Soldier creature tokens.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #4505
const WHIRLER = {"name":"Whirler Rogue","type":"Creature — Human Rogue Artificer","mana":"{2}{U}{U}","oracle":"When this creature enters, create two 1/1 colorless Thopter artifact creature tokens with flying.\nTap two untapped artifacts you control: Target creature can't be blocked this turn.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2263
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","oracle":"({T}: Add {R}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["R"]}; // EDHREC #—
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","oracle":"({T}: Add {U}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #—
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","oracle":"({T}: Add {W}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["W"]}; // EDHREC #—

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const many = (seat, prefix, card, n) => Array.from({ length: n }, (_, i) => on(seat, `${prefix}${i}`, card));
/** Heads-up, `active`'s precombat main on turn 5: each seat's board and hand (ids `<seat>-h<i>`); libraries of Islands. The person: user. */
function table({ active = "user", user = [], ai = [], userHand = [], aiHand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {};
  for (const [pid, pl] of Object.entries(g.players)) {
    players[pid] = { ...pl, graveyard: [], exile: [], battlefield: pid === "user" ? user : ai, hand: (pid === "user" ? userHand : aiHand).map((c, i) => ({ ...c, id: `${pid}-h${i}` })),
      library: Array.from({ length: 9 }, (_, i) => ({ ...ISLAND, id: `${pid}-l${i}` })), manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } };
  }
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}
const act = (s, seat, pred, what) => {
  const a = legalActionsForPlayer(s, seat).find(pred);
  expect(a, `${what} is not offered to ${seat}`).toBeTruthy();
  return dispatchAction(s, a);
};
const cast = (s, seat, name, targetId = null) => act(s, seat, (a) => a.kind === "cast-spell" && a.name === name && (targetId == null || (a.targets || []).some((t) => t.id === targetId)), name);
/** Resolve the stack and the pending triggers (each "may" yes), settled as the session settles it. */
function settle(s0) {
  let s = s0;
  const fin = (n) => (n.pendingChoice ? n : finalizeStackResolution(n));
  for (let g = 0; g < 100; g++) {
    const pc = s.pendingChoice;
    if (pc?.kind === "optional-effect") { s = fin(resolveOptionalChoice(s, true)); continue; }
    if (pc) throw new Error(`unexpected pause ${pc.kind}`);
    if (s.stack.some((o) => o.awaitingTargets)) { const q = raiseTriggerTargetChoice(s); s = settleTriggerTargetChoice(q, q.pendingChoice.candidates[0].id); continue; }
    if (!s.stack.length && !(s.pendingTriggers || []).length) break;
    s = passPriority(s);
  }
  expect((s.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return s;
}
const counted = (s, sourceId, targetId = null) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === sourceId && Array.isArray(a.tapCountIds)
  && (targetId == null || (a.targets || []).some((t) => t.id === targetId)));
const setKey = (ids) => [...ids].sort().join(",");
// An untapped Sol Ring beside the Thopters (put on the battlefield after the cast, so the cast's payment didn't tap it).
const withSolRing = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, on("user", "sol", SOL_RING)] } } });

describe("a permanent a delayed trigger names (R3-F1)", () => {
  it("⭐ Kiki-Jiki's copy of Dreadhorde Butcher (sacrificed at the next end step) beside Cackling Counterpart's copy: Cryptbreaker's 'Tap three untapped Zombies' offers sets that differ only in which copy taps", () => {
    let s = table({ user: [on("user", "kiki", KIKI), on("user", "db", BUTCHER), on("user", "cb", CRYPTBREAKER), on("user", "gc", GRAVECRAWLER), ...many("user", "is", ISLAND, 3), ...many("user", "pl", PLAINS, 2)],
      userHand: [COUNTERPART, RAISE] });
    s = settle(act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "kiki" && (a.targets || []).some((t) => t.id === "db"), "Kiki-Jiki at the Butcher"));
    const doomed = s.players.user.battlefield.find((p) => p.card?.token && p.card?.name === "Dreadhorde Butcher")?.id;
    expect((s.delayedTriggers || []).some((r) => String(r.effectClause).includes(doomed)), "the copy's end-step sacrifice is scheduled").toBe(true);
    s = settle(cast(s, "user", "Cackling Counterpart", "db"));
    const stays = s.players.user.battlefield.find((p) => p.card?.token && p.card?.name === "Dreadhorde Butcher" && p.id !== doomed)?.id;
    s = settle(cast(s, "user", "Raise the Alarm"));
    const rows = counted(s, "cb");
    const sets = new Set(rows.map((a) => setKey(a.tapCountIds)));
    // Two offers alike but for the copy: one taps the doomed copy, the other the copy that stays.
    const swapped = rows.some((a) => a.tapCountIds.includes(doomed) && !a.tapCountIds.includes(stays) && sets.has(setKey(a.tapCountIds.map((id) => (id === doomed ? stays : id)))));
    const copyLabels = [...new Set(rows.flatMap((a) => a.tapCountNames || []).filter((n) => /^Dreadhorde Butcher \(/.test(n)))].sort();
    expect({ swapped, copyLabels: copyLabels.map((n) => n.replace(/ \[[^\]]+\]$/, " [id]")) })
      .toEqual({ swapped: true, copyLabels: ["Dreadhorde Butcher (token) [id]", "Dreadhorde Butcher (token) [id]"] });
  });
});

describe("the last-mint stamp is not a reference (R3-N1)", () => {
  it("⭐ the two Thopters one Whirler Rogue made, beside a Sol Ring: 'Tap two untapped artifacts' is two offers — two Thopters, or a Thopter and the Sol Ring", () => {
    let s = settle(cast(table({ user: many("user", "is", ISLAND, 4), userHand: [WHIRLER] }), "user", "Whirler Rogue"));
    s = withSolRing(s);
    expect((s._lastMintedTokenIds || []).length, "the mint stamp names the two Thopters").toBe(2);
    const whirler = s.players.user.battlefield.find((p) => p.card?.name === "Whirler Rogue").id;
    const rows = counted(s, whirler, whirler);
    const named = rows.map((a) => [...(a.tapCountNames || [])].sort().join(" + ")).sort();
    expect(named).toEqual(["Sol Ring + Thopter (token, summoning sick)", "Thopter (token, summoning sick) + Thopter (token, summoning sick)"]);
  });
});

describe("the labels tell the payers apart (R3-N2)", () => {
  it("⭐ the AI's Lightning Bolt targets one of the two Thopters: three offers, the targeted one named for it", () => {
    let s = settle(cast(table({ user: many("user", "is", ISLAND, 4), userHand: [WHIRLER], ai: [on("ai", "mt", MOUNTAIN)], aiHand: [BOLT] }), "user", "Whirler Rogue"));
    s = withSolRing(s);
    const whirler = s.players.user.battlefield.find((p) => p.card?.name === "Whirler Rogue").id;
    const [a, b] = s.players.user.battlefield.filter((p) => p.card?.name === "Thopter").map((p) => p.id);
    s = { ...s, turn: 6, activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0, _lastMintedTokenIds: undefined };
    s = cast(s, "ai", "Lightning Bolt", a);
    s = s.priorityHolder === "user" ? s : passPriority(s);
    const rows = counted(s, whirler, whirler);
    const named = rows.map((r) => [...(r.tapCountNames || [])].sort().join(" + ")).sort();
    expect({ n: rows.length, b: !!b, named }).toEqual({ n: 3, b: true, named: [
      "Sol Ring + Thopter (token, summoning sick)",
      "Sol Ring + Thopter (token, targeted by Lightning Bolt, summoning sick)",
      "Thopter (token, summoning sick) + Thopter (token, targeted by Lightning Bolt, summoning sick)",
    ] });
  });
  it("⭐ haste: the hasty Butcher copies are not labelled summoning sick (CR 702.10b), though both entered this turn", () => {
    let s = table({ user: [on("user", "kiki", KIKI), on("user", "db", BUTCHER), on("user", "cb", CRYPTBREAKER), on("user", "gc", GRAVECRAWLER), ...many("user", "is", ISLAND, 3)], userHand: [COUNTERPART] });
    s = settle(act(s, "user", (a) => a.kind === "activate-ability" && a.permanentId === "kiki" && (a.targets || []).some((t) => t.id === "db"), "Kiki-Jiki at the Butcher"));
    s = settle(cast(s, "user", "Cackling Counterpart", "db"));
    const copies = s.players.user.battlefield.filter((p) => p.card?.token && p.card?.name === "Dreadhorde Butcher");
    const labels = [...new Set(counted(s, "cb").flatMap((a) => a.tapCountNames || []).filter((n) => /^Dreadhorde Butcher/.test(n)))];
    expect({ sick: copies.map((p) => p.summoningSick), labelled: labels.some((n) => /summoning sick/.test(n)) }).toEqual({ sick: [true, true], labelled: false });
  });
});
