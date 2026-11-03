/**
 * combatCelebrant.test.js — COMBAT CELEBRANT (the play-weighted program, EDHREC #1007):
 *
 *   "If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you
 *    control and after this phase, there is an additional combat phase. (An exerted creature won't untap during your next untap step.)"
 *
 * Exert as it attacks (exertAttack.js; CR 701.43, 508.1g): an optional cost chosen as the creature is declared an attacker — offered as
 * the same attack with `exert: true`, for Celebrant only while it hasn't been exerted this turn. Exerted, it won't untap during its
 * controller's next untap step (CR 701.43a — `doesNotUntapNext` names the exerting player). Its linked "When you do" ability (CR
 * 701.43d, 607.2h) triggers as it's exerted and goes on the stack with the attack triggers when the declaration closes, so it resolves
 * before blockers: every other creature its controller controls untaps (attacking ones stay attacking, CR 506.4) and an additional
 * combat phase follows this one, with no main phase between (CR 500.8). Every bundled ruling witnessed. The same template's twins
 * ("You may exert this creature as it attacks. When you do, …") are native where their linked ability routes.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { closeAttackDeclaration, nextStep, resolveTopOfStack } from "./gameEngine.js";
import { untapAll } from "./gameState.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CELEBRANT = {"name":"Combat Celebrant","type":"Creature — Human Warrior","mana":"{2}{R}","oracle":"If this creature hasn't been exerted this turn, you may exert it as it attacks. When you do, untap all other creatures you control and after this phase, there is an additional combat phase. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"4","toughness":"1","loyalty":null,"keywords":["Exert"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1007
const CHAMPION = {"name":"Ahn-Crop Champion","type":"Creature — Human Warrior","mana":"{2}{G}{W}","oracle":"You may exert this creature as it attacks. When you do, untap all other creatures you control. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":4,"power":"4","toughness":"4","loyalty":null,"keywords":["Exert"],"colors":["G","W"],"colorIdentity":["G","W"]}; // EDHREC #24093
const GLORYBRINGER = {"name":"Glorybringer","type":"Creature — Dragon","mana":"{3}{R}{R}","oracle":"Flying, haste\nYou may exert this creature as it attacks. When you do, it deals 4 damage to target non-Dragon creature an opponent controls. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Haste","Exert"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #7432
const NAGA = {"name":"Watchful Naga","type":"Creature — Snake Wizard","mana":"{2}{G}","oracle":"You may exert this creature as it attacks. When you do, draw a card. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"2","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #26249
const ELITE = {"name":"Tah-Crop Elite","type":"Creature — Bird Warrior","mana":"{3}{W}","oracle":"Flying\nYou may exert this creature as it attacks. When you do, creatures you control get +1/+1 until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Flying","Exert"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #26398
const CRASHER = {"name":"Ahn-Crop Crasher","type":"Creature — Minotaur Warrior","mana":"{2}{R}","oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)\nYou may exert this creature as it attacks. When you do, target creature can't block this turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Haste","Exert"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #17285
const CROPMATE = {"name":"Devoted Crop-Mate","type":"Creature — Human Warrior","mana":"{2}{W}","oracle":"You may exert this creature as it attacks. When you do, return target creature card with mana value 2 or less from your graveyard to the battlefield. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #25474
const RHONAS = {"name":"Champion of Rhonas","type":"Creature — Jackal Warrior","mana":"{3}{G}","oracle":"You may exert this creature as it attacks. When you do, you may put a creature card from your hand onto the battlefield. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":["Exert"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #14203
const SCRAPPER = {"name":"Khenra Scrapper","type":"Creature — Jackal Warrior","mana":"{2}{R}","oracle":"Menace\nYou may exert this creature as it attacks. When you do, it gets +2/+0 until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"2","toughness":"3","loyalty":null,"keywords":["Menace","Exert"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #28234
const ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #9445
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WALL = {"name":"Wall of Stone","type":"Creature — Wall","mana":"{1}{R}{R}","oracle":"Defender (This creature can't attack.)","layout":"normal","cmc":3,"power":"0","toughness":"8","loyalty":null,"keywords":["Defender"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #21544
const WATCHING = {"name":"Always Watching","type":"Enchantment","mana":"{1}{W}{W}","oracle":"Nontoken creatures you control get +1/+1 and have vigilance.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #6512
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58

// THE OTHER UNCREDITED EXERT CARDS (the review of pw24, F1 — every bundled card with an exert line whose linked ability doesn't route).
const UNCREDITED_EXERT = [SCRAPPER,
  {"name":"Bitterblade Warrior","type":"Creature — Jackal Warrior","mana":"{1}{G}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+0 and gains deathtouch until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Clockwork Droid","type":"Artifact Creature — Robot","mana":"{2}","oracle":"You may exert this creature as it attacks. When you do, it can't be blocked this turn and you scry 1. (An exerted creature won't untap during your next untap step. To scry 1, look at the top card of your library. You may put that card on the bottom.)","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":["Exert","Scry"],"colors":[],"colorIdentity":[]},
  {"name":"Emberhorn Minotaur","type":"Creature — Minotaur Warrior","mana":"{3}{R}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+1 and gains menace until end of turn. (An exerted creature won't untap during your next untap step. A creature with menace can't be blocked except by two or more creatures.)","layout":"normal","cmc":4,"power":"4","toughness":"3","loyalty":null,"keywords":["Exert"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Glory-Bound Initiate","type":"Creature — Human Warrior","mana":"{1}{W}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+3 and gains lifelink until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":["Exert"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Gust Walker","type":"Creature — Human Wizard","mana":"{1}{W}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+1 and gains flying until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Hooded Brawler","type":"Creature — Snake Warrior","mana":"{2}{G}","oracle":"You may exert this creature as it attacks. When you do, it gets +2/+2 until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"3","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Hydra Trainer","type":"Creature — Human Warrior","mana":"{1}{G}","oracle":"You may exert this creature as it attacks. When you do, target creature gets +X/+X until end of turn, where X is the number of counters on permanents you control. (An exerted creature won't untap during your next untap step.)\n{2}{G}: Adapt 2. (If this creature has no +1/+1 counters on it, put two +1/+1 counters on it.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Adapt","Exert"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Nef-Crop Entangler","type":"Creature — Human Warrior","mana":"{1}{R}","oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nYou may exert this creature as it attacks. When you do, it gets +1/+2 until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"2","toughness":"1","loyalty":null,"keywords":["Trample","Exert"],"colors":["R"],"colorIdentity":["R"]},
  {"name":"Oketra's Avenger","type":"Creature — Human Warrior","mana":"{1}{W}","oracle":"You may exert this creature as it attacks. When you do, prevent all combat damage that would be dealt to it this turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"3","toughness":"1","loyalty":null,"keywords":["Exert"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Rhet-Crop Spearmaster","type":"Creature — Human Warrior","mana":"{2}{W}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+0 and gains first strike until end of turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":3,"power":"3","toughness":"1","loyalty":null,"keywords":["Exert"],"colors":["W"],"colorIdentity":["W"]},
  {"name":"Rhonas's Stalwart","type":"Creature — Human Warrior","mana":"{1}{G}","oracle":"You may exert this creature as it attacks. When you do, it gets +1/+1 until end of turn and can't be blocked by creatures with power 2 or less this turn. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Exert"],"colors":["G"],"colorIdentity":["G"]},
  {"name":"Sandstorm Crasher","type":"Creature — Minotaur Berserker Wizard","mana":"{3}{R}","oracle":"Trample\nYou may exert this creature as it attacks. When you do, create a tapped and attacking token that's a copy of target creature you control. Sacrifice the token at the beginning of the next end step. (An exerted creature won't untap during your next untap step.)","layout":"normal","cmc":4,"power":"3","toughness":"4","loyalty":null,"keywords":["Trample","Exert"],"colors":["R"],"colorIdentity":["R"]},
];
const CREDITED_EXERT = [CELEBRANT, CHAMPION, GLORYBRINGER, NAGA, ELITE, CRASHER, CROPMATE, RHONAS];
const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** `seat`'s declare attackers step (heads-up), `board` its battlefield. */
function attackStep({ seat = "user", board = [], oppBoard = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const opp = seat === "user" ? "ai" : "user";
  const players = { ...g.players,
    [seat]: { ...g.players[seat], battlefield: board, hand: [], library: [], graveyard: [] },
    [opp]: { ...g.players[opp], battlefield: oppBoard, hand: [], library: [], graveyard: [] } };
  return { ...g, turn: 6, phase: "combat", step: "declare-attackers", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players, combat: { attackers: [], blockers: [] } };
}
const attacksOf = (s, id, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker" && a.permanentId === id);
function declare(s, id, { exert = false, seat = "user" } = {}) {
  const a = attacksOf(s, id, seat).find((x) => !!x.exert === exert);
  expect(a, `${id}'s ${exert ? "exerted " : ""}attack is not offered`).toBeTruthy();
  return dispatchAction(s, a);
}
/** Close the declaration and resolve what it put on the stack. */
function close(s) {
  let n = closeAttackDeclaration(s).state, g = 0;
  while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n);
  expect((n.log || []).find((e) => e.kind === "stack-resolve-error")).toBeUndefined();
  return n;
}
const perm = (s, id) => Object.values(s.players).flatMap((p) => p.battlefield).find((p) => p.id === id);
const tapped = (s, ...ids) => Object.fromEntries(ids.map((id) => [id, !!perm(s, id)?.tapped]));
const attacking = (s) => (s.combat?.attackers || []).map((a) => a.permanentId).sort();

describe("the cards", () => {
  it("⭐ native: Combat Celebrant, and the template's twins whose linked ability reads", () => {
    expect([CELEBRANT, CHAMPION, GLORYBRINGER, NAGA, ELITE, CRASHER, CROPMATE, RHONAS].map((c) => classifyCard(c))).toEqual(Array(8).fill("native-trigger"));
  });
  it("⭐ control: a twin whose linked ability doesn't read is neither credited nor offered the exert (Khenra Scrapper's \"it gets +2/+0\" — the review of pw24, F1)", () => {
    const s = attackStep({ board: [on("user", "ks", SCRAPPER), on("user", "gb", BEARS)], oppBoard: [on("ai", "hg", GIANT)] });
    const ai = attackStep({ seat: "ai", board: [on("ai", "ks", SCRAPPER), on("ai", "gb", BEARS)], oppBoard: [on("user", "hg", GIANT)] });
    const aiPick = pickAction(ai, "ai", legalActionsForPlayer(ai, "ai"));
    const afterAi = aiPick?.permanentId === "ks" ? dispatchAction(ai, aiPick) : ai;
    expect({ tier: classifyCard(SCRAPPER), offers: attacksOf(s, "ks").map((a) => !!a.exert), aiExert: !!aiPick?.exert, noUntap: perm(afterAi, "ks").doesNotUntapNext ?? null })
      .toEqual({ tier: "body-only", offers: [false], aiExert: false, noUntap: null });
    expect(() => dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "ks", exert: true })).toThrow(/can't be exerted/);
  });
  it("⭐ the census (F1): of the 21 bundled exert cards, exactly the 8 credited are offered an exert; the other 13 attack plain, for the person and the AI", () => {
    const offered = (card) => attacksOf(attackStep({ board: [on("user", "x", card), on("user", "gb", BEARS)], oppBoard: [on("ai", "hg", GIANT)] }), "x").some((a) => a.exert);
    const aiExerts = (card) => {
      const st = attackStep({ seat: "ai", board: [on("ai", "x", card), on("ai", "gb", BEARS)], oppBoard: [on("user", "hg", GIANT)] });
      return legalActionsForPlayer(st, "ai").some((a) => a.kind === "declare-attacker" && a.exert);
    };
    expect({ total: CREDITED_EXERT.length + UNCREDITED_EXERT.length,
      credited: CREDITED_EXERT.filter(offered).map((c) => c.name), uncredited: UNCREDITED_EXERT.filter(offered).map((c) => c.name),
      tiers: [...new Set(UNCREDITED_EXERT.map((c) => classifyCard(c)))], aiOffered: UNCREDITED_EXERT.filter(aiExerts).map((c) => c.name) })
      .toEqual({ total: 21, credited: CREDITED_EXERT.map((c) => c.name), uncredited: [], tiers: ["body-only"], aiOffered: [] });
  });
});

describe("the person's Celebrant", () => {
  it("⭐ the offer: its attack plain and exerted; the others plain only", () => {
    const s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS)] });
    expect({ cel: attacksOf(s, "cel").map((a) => !!a.exert), gb: attacksOf(s, "gb").map((a) => !!a.exert) }).toEqual({ cel: [false, true], gb: [false] });
  });
  it("⭐ exerted with the Bears and the Giant: once declared, the linked ability untaps the Bears and the Giant, still attacking, not the Celebrant; an extra combat follows", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS), on("user", "hg", GIANT)] });
    s = declare(declare(s, "gb"), "hg");
    s = declare(s, "cel", { exert: true });
    const atDeclaration = { tapped: tapped(s, "cel", "gb", "hg"), stack: s.stack.length, exerted: perm(s, "cel").exertedTurn, noUntap: perm(s, "cel").doesNotUntapNext };
    s = close(s);
    expect({ atDeclaration, after: tapped(s, "cel", "gb", "hg"), attacking: attacking(s), extra: (s.extraPhases || []).length })
      .toEqual({ atDeclaration: { tapped: { cel: true, gb: true, hg: true }, stack: 0, exerted: 6, noUntap: "user" }, after: { cel: true, gb: false, hg: false }, attacking: ["cel", "gb", "hg"], extra: 1 });
  });
  it("⭐ its ruling — every creature you control untaps, not only the attackers: a tapped Llanowar Elves at home untaps too", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "elf", ELVES, { tapped: true })] });
    s = close(declare(s, "cel", { exert: true }));
    expect(tapped(s, "elf")).toEqual({ elf: false });
  });
  it("⭐ its ruling — no main phase between: after this combat, the next phase is the additional combat, where the untapped Bears may attack again", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS)] });
    s = close(declare(declare(s, "gb"), "cel", { exert: true }));
    const seen = [];
    let g = 0;
    while (g++ < 12 && !(seen.length > 1 && s.step === "declare-attackers")) { s = nextStep(s); seen.push(`${s.phase}/${s.step}`); }
    expect({ seen, bears: attacksOf(s, "gb").length > 0, celebrant: attacksOf(s, "cel").length })
      .toEqual({ seen: expect.arrayContaining(["combat/declare-attackers"]), bears: true, celebrant: 0 });
    expect(seen.some((x) => /main/.test(x))).toBe(false);
  });
  it("⭐ \"if this creature hasn't been exerted this turn\": a vigilant (untapped) Celebrant in the extra combat may attack again but isn't offered the exert", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT, { exertedTurn: 6 })] });
    expect(attacksOf(s, "cel").map((a) => !!a.exert)).toEqual([false]);
    s = { ...s, turn: 7 };
    expect(attacksOf(s, "cel").map((a) => !!a.exert)).toEqual([false, true]);
  });
  it("⭐ its ruling — the extra combat comes even if the Celebrant doesn't survive: it leaves before its ability resolves, the untap and the combat still happen", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS)] });
    s = declare(declare(s, "gb"), "cel", { exert: true });
    s = closeAttackDeclaration(s).state;
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "cel") } }, combat: { ...s.combat, attackers: s.combat.attackers.filter((a) => a.permanentId !== "cel") } };
    let g = 0;
    while (s.stack?.length && g++ < 10) s = resolveTopOfStack(s);
    expect({ gb: tapped(s, "gb"), extra: (s.extraPhases || []).length }).toEqual({ gb: { gb: false }, extra: 1 });
  });
  it("⭐ CR 701.43a — it doesn't untap during your next untap step; the Bears do", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS)] });
    s = close(declare(s, "cel", { exert: true }));
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: true })) } } };
    s = untapAll({ ...s, turn: 8, activePlayer: "user" }, { playerId: "user" });
    expect({ ...tapped(s, "cel", "gb"), flag: perm(s, "cel").doesNotUntapNext ?? null }).toEqual({ cel: true, gb: false, flag: null });
  });
  it("⭐ its ruling — exerted while borrowed, it untaps during its owner's untap step: the flag names the exerting player", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT, { owner: "ai" })] });
    s = close(declare(s, "cel", { exert: true }));
    expect(perm(s, "cel").doesNotUntapNext).toBe("user");
  });
  it("control: an attack declared plain exerts nothing — no stamp, no ability, no extra combat", () => {
    let s = attackStep({ board: [on("user", "cel", CELEBRANT), on("user", "gb", BEARS)] });
    s = close(declare(declare(s, "gb"), "cel"));
    expect({ exerted: perm(s, "cel").exertedTurn ?? null, gb: tapped(s, "gb"), extra: (s.extraPhases || []).length }).toEqual({ exerted: null, gb: { gb: true }, extra: 0 });
  });
  it("⛔ a creature with no exert line can't be exerted: the dispatcher refuses an exerted Bears attack", () => {
    const s = attackStep({ board: [on("user", "gb", BEARS)] });
    expect(() => dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "gb", exert: true })).toThrow(/can't be exerted/);
  });
});

describe("twins", () => {
  it("⭐ Watchful Naga exerted: you draw a card as the declaration closes", () => {
    let s = attackStep({ board: [on("user", "naga", NAGA)] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ ...BEARS, id: "l1" }] } } };
    s = close(declare(s, "naga", { exert: true }));
    expect(s.players.user.hand.map((c) => c.id)).toEqual(["l1"]);
  });
  it("⭐ Glorybringer exerted: it deals 4 to the opponent's non-Dragon creature (the Giant dies)", () => {
    let s = attackStep({ board: [on("user", "glory", GLORYBRINGER)], oppBoard: [on("ai", "hg", GIANT)] });
    s = close(declare(s, "glory", { exert: true }));
    expect({ giant: !!perm(s, "hg"), aiYard: s.players.ai.graveyard.map((c) => c.name) }).toEqual({ giant: false, aiYard: ["Hill Giant"] });
  });
});

describe("the default AI", () => {
  /** The AI's first declare-attacker pick on its board (`board`), the person's board `opp`: "<id>" plain, "<id>!" exerted. */
  const aiFirstAttack = (board, opp = []) => {
    const st = attackStep({ seat: "ai", board, oppBoard: opp });
    const p = pickAction(st, "ai", legalActionsForPlayer(st, "ai"));
    return p?.kind === "declare-attacker" ? `${p.permanentId}${p.exert ? "!" : ""}` : p?.kind ?? null;
  };
  it("⭐ (F3) it doesn't exert for a linked ability that would do nothing: Glorybringer with no non-Dragon creature to hit, a lone Celebrant, a lone Ahn-Crop Champion — each attacks plain", () => {
    expect([aiFirstAttack([on("ai", "glory", GLORYBRINGER)]), aiFirstAttack([on("ai", "cel", CELEBRANT)]), aiFirstAttack([on("ai", "champ", CHAMPION)])])
      .toEqual(["glory", "cel", "champ"]);
  });
  it("⭐ (F3) and exerts when it would act: Glorybringer facing the person's Hill Giant, Champion of Rhonas with a creature card in hand", () => {
    const rho = (() => {
      const st = attackStep({ seat: "ai", board: [on("ai", "rho", RHONAS)] });
      const s2 = { ...st, players: { ...st.players, ai: { ...st.players.ai, hand: [{ ...GIANT, id: "h-giant" }] } } };
      const p = pickAction(s2, "ai", legalActionsForPlayer(s2, "ai"));
      return `${p?.permanentId}${p?.exert ? "!" : ""}`;
    })();
    expect([aiFirstAttack([on("ai", "glory", GLORYBRINGER)], [on("user", "hg", GIANT)]), rho, aiFirstAttack([on("ai", "rho", RHONAS)])])
      .toEqual(["glory!", "rho!", "rho"]);
  });
  it("⭐ (R1) it exerts only when the act helps: Combat Celebrant and Ahn-Crop Champion beside an untapped Wall of Stone attack plain (nothing to untap; the Wall can't attack in an extra combat); beside a tapped Grizzly Bears, each exerts", () => {
    expect([aiFirstAttack([on("ai", "cel", CELEBRANT), on("ai", "wall", WALL)]), aiFirstAttack([on("ai", "champ", CHAMPION), on("ai", "wall", WALL)]),
      aiFirstAttack([on("ai", "cel", CELEBRANT), on("ai", "gb", BEARS, { tapped: true })]), aiFirstAttack([on("ai", "champ", CHAMPION), on("ai", "gb", BEARS, { tapped: true })])])
      .toEqual(["cel", "champ", "cel!", "champ!"]);
  });
  it("⭐ (R1) Watchful Naga with an empty library attacks plain — the draw would lose the game (CR 704.5b, 121.4); with a card to draw, it exerts", () => {
    const naga = (library) => {
      const st = attackStep({ seat: "ai", board: [on("ai", "naga", NAGA)] });
      const s2 = { ...st, players: { ...st.players, ai: { ...st.players.ai, library } } };
      const p = pickAction(s2, "ai", legalActionsForPlayer(s2, "ai"));
      return `${p?.permanentId}${p?.exert ? "!" : ""}`;
    };
    expect([naga([]), naga([{ ...BEARS, id: "lib-gb" }])]).toEqual(["naga", "naga!"]);
  });
  it("⭐ (R1) a vigilant Combat Celebrant alone exerts: the additional combat has an attacker — itself, still untapped (Always Watching); there it attacks again, not offered the exert", () => {
    let s = attackStep({ seat: "ai", board: [on("ai", "cel", CELEBRANT), on("ai", "aw", WATCHING)] });
    const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    s = close(dispatchAction(s, p));
    let g = 0;
    const seen = [];
    while (g++ < 12 && !(seen.length > 1 && s.step === "declare-attackers")) { s = nextStep(s); seen.push(`${s.phase}/${s.step}`); }
    expect({ pick: `${p?.permanentId}${p?.exert ? "!" : ""}`, step: s.step, offers: attacksOf(s, "cel", "ai").map((a) => !!a.exert) })
      .toEqual({ pick: "cel!", step: "declare-attackers", offers: [false] });
  });
  it("⭐ (R1) in a pod, Ahn-Crop Crasher's \"can't block\" wants a creature that could block this combat: attacking the creatureless person while only ai3 has a creature, ai1 attacks plain; exerted at ai3 with the person's and ai3's Bears in play, its target is ai3's", () => {
    const pod = (boards) => {
      const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
      const players = Object.fromEntries(Object.entries(g.players).map(([pid, p]) => [pid, { ...p, battlefield: boards[pid] || [], hand: [], library: [], graveyard: [] }]));
      return { ...g, turn: 6, phase: "combat", step: "declare-attackers", activePlayer: "ai1", priorityHolder: "ai1", consecutivePasses: 0, players, combat: { attackers: [], blockers: [] } };
    };
    const s1 = pod({ ai1: [on("ai1", "cr", CRASHER)], ai3: [on("ai3", "b3", BEARS)] });
    const p1 = pickAction(s1, "ai1", legalActionsForPlayer(s1, "ai1"));
    let s2 = pod({ ai1: [on("ai1", "cr", CRASHER)], user: [on("user", "bu", BEARS)], ai3: [on("ai3", "b3", BEARS)] });
    const exertAtAi3 = legalActionsForPlayer(s2, "ai1").find((a) => a.kind === "declare-attacker" && a.exert && a.defenderId === "ai3" && !a.defenderPlaneswalkerId);
    expect(exertAtAi3, "ai1's Crasher exerted at ai3 is offered").toBeTruthy();
    s2 = dispatchAction(s2, exertAtAi3);
    s2 = closeAttackDeclaration(s2).state;
    expect({ first: `${p1?.permanentId}${p1?.exert ? "!" : ""}@${p1?.defenderId}`, target: (s2.stack || []).map((o) => (o.targets || []).map((t) => t.id)) })
      .toEqual({ first: "cr@user", target: [["b3"]] });
  });
  it("⭐ attacking with its Celebrant, it exerts it; the linked ability untaps its Bears and an extra combat follows", () => {
    let s = attackStep({ seat: "ai", board: [on("ai", "cel", CELEBRANT), on("ai", "gb", BEARS), on("ai", "angel", ANGEL)] });
    let g = 0;
    const picks = [];
    while (g++ < 6) {
      const p = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
      if (p?.kind !== "declare-attacker") break;
      picks.push(`${p.permanentId}${p.exert ? "!" : ""}`);
      s = dispatchAction(s, p);
    }
    s = close(s);
    expect({ celExerted: picks.includes("cel!"), gb: picks.includes("gb") ? tapped(s, "gb") : "held", extra: (s.extraPhases || []).length })
      .toEqual({ celExerted: true, gb: picks.includes("gb") ? { gb: false } : "held", extra: 1 });
  });
});

describe("twins — their linked abilities and the exert rulings", () => {
  it("⭐ Ahn-Crop Champion exerted: the other attackers untap, still attacking; it doesn't, and there is no extra combat", () => {
    let s = attackStep({ board: [on("user", "champ", CHAMPION), on("user", "gb", BEARS)] });
    s = close(declare(declare(s, "gb"), "champ", { exert: true }));
    expect({ ...tapped(s, "champ", "gb"), attacking: attacking(s), extra: (s.extraPhases || []).length }).toEqual({ champ: true, gb: false, attacking: ["champ", "gb"], extra: 0 });
  });
  it("⭐ its ruling — two Ahn-Crop Champions exerted untap each other", () => {
    let s = attackStep({ board: [on("user", "c1", CHAMPION), on("user", "c2", CHAMPION)] });
    s = close(declare(declare(s, "c1", { exert: true }), "c2", { exert: true }));
    expect(tapped(s, "c1", "c2")).toEqual({ c1: false, c2: false });
  });
  it("⭐ its ruling — all attackers are chosen at once: once the declaration has closed, a creature the Champion untapped isn't offered an attack", () => {
    let s = attackStep({ board: [on("user", "champ", CHAMPION), on("user", "home", BEARS, { tapped: true })] });
    s = close(declare(s, "champ", { exert: true }));
    expect({ home: tapped(s, "home"), offered: attacksOf(s, "home").length }).toEqual({ home: { home: false }, offered: 0 });
  });
  it("⭐ Tah-Crop Elite exerted: creatures you control get +1/+1 until end of turn", async () => {
    const { permanentPower, permanentToughness } = await import("./layers.js");
    let s = attackStep({ board: [on("user", "elite", ELITE), on("user", "gb", BEARS)] });
    s = close(declare(declare(s, "gb"), "elite", { exert: true }));
    expect([permanentPower(s, "gb"), permanentToughness(s, "gb"), permanentPower(s, "elite")]).toEqual([3, 3, 3]);
  });
  it("⭐ Ahn-Crop Crasher exerted: the opponent's creature can't block this turn", async () => {
    const { legalActionsForPlayer: lap } = await import("./legalChoices.js");
    let s = attackStep({ board: [on("user", "crash", CRASHER)], oppBoard: [on("ai", "hg", GIANT)] });
    s = close(declare(s, "crash", { exert: true }));
    s = { ...s, step: "declare-blockers", priorityHolder: "ai" };
    expect(lap(s, "ai").filter((a) => a.kind === "declare-blocker" && a.permanentId === "hg").length).toBe(0);
  });
  it("⭐ Devoted Crop-Mate exerted: returns a creature card with mana value 2 or less (Grizzly Bears, not Hill Giant); its ruling — the returned creature isn't attacking and can't be declared", () => {
    let s = attackStep({ board: [on("user", "mate", CROPMATE)] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [{ ...BEARS, id: "g-bears" }, { ...GIANT, id: "g-giant" }] } } };
    s = close(declare(s, "mate", { exert: true }));
    const bears = s.players.user.battlefield.find((p) => p.card.name === "Grizzly Bears");
    expect({ bears: !!bears, giantInYard: s.players.user.graveyard.some((c) => c.id === "g-giant"), attacking: attacking(s), offered: bears ? attacksOf(s, bears.id).length : -1 })
      .toEqual({ bears: true, giantInYard: true, attacking: ["mate"], offered: 0 });
  });
  it("⭐ Champion of Rhonas exerted: asked, the person puts Hill Giant from their hand onto the battlefield — not attacking (its ruling)", async () => {
    const { resolveOptionalChoice, resolveTutorChoice } = await import("./effects/runProgram.js");
    let s = attackStep({ board: [on("user", "rho", RHONAS)] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [{ ...GIANT, id: "h-giant" }, { ...BEARS, id: "h-bears" }] } } };
    s = close(declare(s, "rho", { exert: true }));
    const asked = s.pendingChoice?.kind;
    s = resolveOptionalChoice(s, true);
    const offered = (s.pendingChoice?.candidates || []).map((c) => c.id);
    s = resolveTutorChoice(s, "h-giant");
    expect({ asked, offered, giant: s.players.user.battlefield.some((p) => p.card.name === "Hill Giant"), attacking: attacking(s) })
      .toEqual({ asked: "optional-effect", offered: ["h-giant", "h-bears"], giant: true, attacking: ["rho"] });
  });
  it("⭐ Combat Celebrant's ruling — two Celebrants exerted in one combat: two additional combat phases", () => {
    let s = attackStep({ board: [on("user", "c1", CELEBRANT), on("user", "c2", CELEBRANT)] });
    s = close(declare(declare(s, "c1", { exert: true }), "c2", { exert: true }));
    expect((s.extraPhases || []).length).toBe(2);
  });
  it("⭐ its ruling — exerted with no legal target for the linked ability: Glorybringer may still be exerted; the ability is removed", () => {
    let s = attackStep({ board: [on("user", "glory", GLORYBRINGER)], oppBoard: [] });
    expect(attacksOf(s, "glory").map((a) => !!a.exert)).toEqual([false, true]);
    s = close(declare(s, "glory", { exert: true }));
    expect({ exerted: perm(s, "glory").exertedTurn, stack: s.stack.length }).toEqual({ exerted: 6, stack: 0 });
  });
});
