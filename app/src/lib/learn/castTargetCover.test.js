/**
 * castTargetCover.test.js — THE OFFER OVER THE CAP (effects/targeting.js, 2026-11-03). A player announces a target for each
 * instance of "target" as they cast (CR 601.2c): any legal choice in every slot. The cast offer is a list of whole casts, capped
 * at MAX_CAST_EXPANSIONS (64) rows; it used to list the product's FIRST 64 rows — the first slot varying slowest, its options in
 * seat order, the user's seat first whoever cast — so on an ordinary Commander board a multi-target spell's first slot reached
 * only the first seats' permanents (the pw23 blind review's F3): Twisted Fealty stole only three of its caster's own Bears, Hungry
 * Flames and Angrath's Fury never reached the fourth seat, Rise of the Eldrazi destroyed only the first 16 permanents. A one-slot
 * spell past 64 targets (Swords to Plowshares beside a token army) reached only the first 64.
 *
 * Over the cap the offer is now a covering: the same first 64 rows, then every option of every slot beside each seat's first
 * option in the other slots, the same object, and no target. Played through the real paths: legalActionsForPlayer, the
 * dispatcher and the stack, and the default AI's pick (opponentAI.pickAction). Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, raiseTriggerTargetChoice, resolveTopOfStack } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { pickAction } from "./opponentAI.js";
import { expandCastChoices, _internals } from "./effects/targeting.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const TWISTED_FEALTY = {"name":"Twisted Fealty","type":"Sorcery","mana":"{2}{R}","oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn.\nCreate a Wicked Role token attached to up to one target creature. (If you control another Role on it, put that one into the graveyard. Enchanted creature gets +1/+1. When this token is put into a graveyard, each opponent loses 1 life.)","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":["Role token"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #8192
const ANGRATHS_FURY = {"name":"Angrath's Fury","type":"Sorcery","mana":"{3}{B}{R}","oracle":"Destroy target creature. Angrath's Fury deals 3 damage to target player or planeswalker. You may search your library and/or graveyard for a card named Angrath, Minotaur Pirate, reveal it, and put it into your hand. If you search your library this way, shuffle.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B","R"],"colorIdentity":["B","R"]}; // EDHREC #25004
const HUNGRY_FLAMES = {"name":"Hungry Flames","type":"Instant","mana":"{2}{R}","oracle":"Hungry Flames deals 3 damage to target creature and 2 damage to target player or planeswalker.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #22164
const RISE = {"name":"Rise of the Eldrazi","type":"Sorcery","mana":"{9}{C}{C}{C}","oracle":"This spell can't be countered.\nDestroy target permanent. Target player draws four cards. Take an extra turn after this one.\nExile Rise of the Eldrazi.","layout":"normal","cmc":12,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #2150
const ENTER_GOD_ETERNALS = {"name":"Enter the God-Eternals","type":"Sorcery","mana":"{2}{U}{U}{B}","oracle":"Enter the God-Eternals deals 4 damage to target creature and you gain life equal to the damage dealt this way. Target player mills four cards. Amass Zombies 4. (Put four +1/+1 counters on an Army you control. It's also a Zombie. If you don't control an Army, create a 0/0 black Zombie Army creature token first.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Amass","Mill"],"colors":["B","U"],"colorIdentity":["B","U"]}; // EDHREC #11587
const VIBRANT_OUTBURST = {"name":"Vibrant Outburst","type":"Instant","mana":"{U}{R}","oracle":"Vibrant Outburst deals 3 damage to any target. Tap up to one target creature.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","U"],"colorIdentity":["R","U"]}; // EDHREC #14938
const UNSTABLE_EXPERIMENT = {"name":"Unstable Experiment","type":"Instant","mana":"{1}{U}","oracle":"Target player draws a card, then up to one target creature you control connives. (Draw a card, then discard a card. If you discarded a nonland card, put a +1/+1 counter on that creature.)","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":["Connive"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #7964
const PREY_UPON = {"name":"Prey Upon","type":"Sorcery","mana":"{G}","oracle":"Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Fight"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #6480
const GURMAG = {"name":"Gurmag Rakshasa","type":"Creature — Demon","mana":"{4}{B}{B}","oracle":"Menace (This creature can't be blocked except by two or more creatures.)\nWhen this creature enters, target creature an opponent controls gets -2/-2 until end of turn and target creature you control gets +2/+2 until end of turn.","layout":"normal","cmc":6,"power":"5","toughness":"5","loyalty":null,"keywords":["Menace"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #21701
const DWELL = {"name":"Dwell on the Past","type":"Sorcery","mana":"{G}","oracle":"Target player shuffles up to four target cards from their graveyard into their library.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #23135
const FIRST_STAGE = {"name":"First Stage of Magic Design","type":"Instant","mana":"{W}{U}{B}{R}{G}","oracle":"You gain 3 life. Draw three cards. Add {B}{B}{B}. This spell deals 3 damage to any target. Target creature gets +3/+3 until end of turn.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["B","G","R","U","W"],"colorIdentity":["B","G","R","U","W"]}; // EDHREC #—
const SWINE = {"name":"Curse of the Swine","type":"Sorcery","mana":"{X}{U}{U}","oracle":"Exile X target creatures. For each creature exiled this way, its controller creates a 2/2 green Boar creature token.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #849
const LOREHOLD_COMMAND = {"name":"Lorehold Command","type":"Instant","mana":"{3}{R}{W}","oracle":"Choose two —\n• Create a 3/2 red and white Spirit creature token.\n• Creatures you control get +1/+0 and gain indestructible and haste until end of turn.\n• Lorehold Command deals 3 damage to any target. Target player gains 3 life.\n• Sacrifice a permanent, then draw two cards.","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R","W"],"colorIdentity":["R","W"]}; // EDHREC #10076
const CLASH = {"name":"Clash of Titans","type":"Instant","mana":"{3}{R}{R}","oracle":"Target creature fights another target creature. (Each deals damage equal to its power to the other.)","layout":"normal","cmc":5,"power":null,"toughness":null,"loyalty":null,"keywords":["Fight"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #20609
const SWORDS = {"name":"Swords to Plowshares","type":"Instant","mana":"{W}","oracle":"Exile target creature. Its controller gains life equal to its power.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #11
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":"3","keywords":["Mill"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #3557
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","oracle":"","layout":"normal","cmc":6,"power":"6","toughness":"4","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #22387
const ANGEL = {"name":"Serra Angel","type":"Creature — Angel","mana":"{3}{W}{W}","oracle":"Flying\nVigilance (Attacking doesn't cause this creature to tap.)","layout":"normal","cmc":5,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying","Vigilance"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #9445

const SEATS = ["user", "ai1", "ai2", "ai3"];
const OPPONENTS_OF = (seat) => SEATS.filter((s) => s !== seat);
const on = (seat, id, c, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
const bearsOf = (seat, n = 6) => Array.from({ length: n }, (_, i) => `${seat}-bear${i}`);
const ALL_BEARS = SEATS.flatMap((s) => bearsOf(s));
/**
 * The review's board: a four-seat pod, each seat with `bears` Grizzly Bears and `forests` Forests (a Jace Beleren too with `pw`),
 * `extra[seat]` more, the caster's hand and a pool that pays for anything here. The caster's precombat main, empty stack.
 */
function pod({ caster = "user", hand = [], bears = 6, forests = 5, pw = false, extra = {} } = {}) {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of SEATS) {
    const bf = [];
    for (let i = 0; i < bears; i++) bf.push(on(seat, `${seat}-bear${i}`, BEARS));
    for (let i = 0; i < forests; i++) bf.push(on(seat, `${seat}-forest${i}`, FOREST));
    if (pw) bf.push(on(seat, `${seat}-jace`, JACE, { counters: { loyalty: 3 } }));
    for (const [id, c] of extra[seat] || []) bf.push(on(seat, id, c));
    const library = Array.from({ length: 8 }, (_, i) => ({ ...FOREST, id: `${seat}-lib${i}` }));
    players[seat] = { ...players[seat], life: 40, battlefield: bf, hand: [], library, graveyard: [], manaPool: { W: 5, U: 5, B: 5, R: 5, G: 5, C: 12 } };
  }
  players[caster] = { ...players[caster], hand: hand.map(([id, c]) => ({ ...c, id })) };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0, stack: [], players };
}
const castsOf = (s, seat, cardId) => legalActionsForPlayer(s, seat).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
/** The target a cast names in the slot of atom `atomIndex` (its id), or null when the cast leaves that slot without one. */
const slotTarget = (a, atomIndex) => (a.targets || []).find((t) => t.atomIndex === atomIndex)?.id ?? null;
/** Every id a slot reaches across the offered casts ("none" for a cast that leaves it without a target), sorted. */
const reach = (casts, atomIndex) => [...new Set(casts.map((a) => slotTarget(a, atomIndex) ?? "none"))].sort();
const sorted = (xs) => [...xs].sort();
const permanentsOf = (s, seat) => s.players[seat].battlefield.map((p) => p.id);

describe("from a person's seat — the review's board (6 Bears and 5 Forests a seat)", () => {
  it("⭐ Twisted Fealty steals any of the 24 Bears — every opponent's included — with the Role on any Bear, on the stolen one among them", () => {
    const casts = castsOf(pod({ hand: [["tf", TWISTED_FEALTY]] }), "user", "tf");
    // atom 0 — "Gain control of target creature"; atom 3 — "Create a Wicked Role token attached to up to one target creature" (the
    // Role reader takes its target as required — tokens.js's Role matcher drops the "up to one"; a pre-existing safe under-offer)
    expect(reach(casts, 0)).toEqual(sorted(ALL_BEARS));
    expect(reach(casts, 3)).toEqual(sorted(ALL_BEARS));
    for (const seat of OPPONENTS_OF("user")) for (const id of bearsOf(seat)) {
      expect(casts.some((a) => slotTarget(a, 0) === id && slotTarget(a, 3) === id), `steal ${id} with the Role on it`).toBe(true);
      expect(casts.some((a) => slotTarget(a, 0) === id && slotTarget(a, 3) === "user-bear0"), `steal ${id}, the Role on your first Bear`).toBe(true);
    }
    expect(casts.length).toBeLessThan(24 * 24); // a covering, not the 576-row product
  });

  it("⭐ Angrath's Fury and Hungry Flames reach every seat's Bears, each beside every player — the whole creature × player product", () => {
    for (const spell of [ANGRATHS_FURY, HUNGRY_FLAMES]) {
      const casts = castsOf(pod({ hand: [["x", spell]] }), "user", "x");
      expect(reach(casts, 0), spell.name).toEqual(sorted(ALL_BEARS));
      expect(reach(casts, 1), spell.name).toEqual(sorted(SEATS));
      for (const id of ALL_BEARS) for (const p of SEATS) {
        expect(casts.some((a) => slotTarget(a, 0) === id && slotTarget(a, 1) === p), `${spell.name}: ${id} and ${p}`).toBe(true);
      }
      expect(casts).toHaveLength(24 * 4);
    }
  });

  it("⭐ with a planeswalker a seat: every Bear and every player or planeswalker is reached; Rise of the Eldrazi destroys any of the 48 permanents beside every player", () => {
    const s = pod({ pw: true, hand: [["af", ANGRATHS_FURY], ["hf", HUNGRY_FLAMES], ["rise", RISE]] });
    for (const id of ["af", "hf"]) {
      const casts = castsOf(s, "user", id);
      expect(reach(casts, 0)).toEqual(sorted(ALL_BEARS));
      expect(reach(casts, 1)).toEqual(sorted([...SEATS, ...SEATS.map((p) => `${p}-jace`)]));
      // each planeswalker beside each seat's first Bear
      for (const p of SEATS) for (const q of SEATS) expect(casts.some((a) => slotTarget(a, 0) === `${q}-bear0` && slotTarget(a, 1) === `${p}-jace`)).toBe(true);
    }
    const rise = castsOf(s, "user", "rise");
    const every = SEATS.flatMap((p) => permanentsOf(s, p));
    expect(every).toHaveLength(48);
    expect(reach(rise, 0)).toEqual(sorted(every)); // atom 0 — "Destroy target permanent"
    for (const id of every) for (const p of SEATS) expect(rise.some((a) => slotTarget(a, 0) === id && slotTarget(a, 1) === p), `${id} / ${p} draws`).toBe(true);
    expect(rise).toHaveLength(48 * 4);
  });

  it("⭐ Vibrant Outburst deals its 3 to any creature or player with \"up to one\" left unchosen — the old rows left it unchosen beside the first three only", () => {
    const casts = castsOf(pod({ hand: [["vo", VIBRANT_OUTBURST]] }), "user", "vo");
    // atom 0 — "deals 3 damage to any target"; atom 1 — "Tap up to one target creature"
    expect(reach(casts, 0)).toEqual(sorted([...ALL_BEARS, ...SEATS]));
    for (const id of [...ALL_BEARS, ...SEATS]) expect(casts.some((a) => slotTarget(a, 0) === id && slotTarget(a, 1) === null), `${id}, nothing tapped`).toBe(true);
  });

  it("⭐ a cast past the old rows plays: Hungry Flames at ai3's last Bear and ai3's face — the Bear dies, ai3 goes to 38", () => {
    const s = pod({ hand: [["hf", HUNGRY_FLAMES]] });
    const cast = castsOf(s, "user", "hf").find((a) => slotTarget(a, 0) === "ai3-bear5" && slotTarget(a, 1) === "ai3");
    expect(cast, "the cast is offered").toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(permanentsOf(after, "ai3")).not.toContain("ai3-bear5");
    expect(after.players.ai3.life).toBe(38);
    expect(after.players.user.life).toBe(40);
  });
});

describe("from an AI seat (ai2) — the same board", () => {
  it("⭐ Twisted Fealty, Angrath's Fury, Hungry Flames and Rise of the Eldrazi reach every seat in every slot", () => {
    const s = pod({ caster: "ai2", pw: true, hand: [["tf", TWISTED_FEALTY], ["af", ANGRATHS_FURY], ["hf", HUNGRY_FLAMES], ["rise", RISE]] });
    const tf = castsOf(s, "ai2", "tf");
    expect(reach(tf, 0)).toEqual(sorted(ALL_BEARS));
    expect(reach(tf, 3)).toEqual(sorted(ALL_BEARS));
    for (const id of ["af", "hf"]) {
      const casts = castsOf(s, "ai2", id);
      expect(reach(casts, 0)).toEqual(sorted(ALL_BEARS));
      expect(reach(casts, 1)).toEqual(sorted([...SEATS, ...SEATS.map((p) => `${p}-jace`)]));
    }
    const rise = castsOf(s, "ai2", "rise");
    expect(reach(rise, 0)).toEqual(sorted(SEATS.flatMap((p) => permanentsOf(s, p))));
    expect(reach(rise, 1)).toEqual(sorted(SEATS));
  });
});

describe("the default AI over the cap — it picks among more of the board", () => {
  // The review's board with a bigger threat past the old 64 rows: a Hill Giant at ai2, a Craw Wurm and a Serra Angel at ai3.
  const threats = { ai2: [["ai2-giant", GIANT]], ai3: [["ai3-wurm", WURM], ["ai3-angel", ANGEL]] };
  const pick = (caster, spell) => {
    const s = pod({ caster, hand: [["x", spell]], extra: threats });
    return pickAction(s, caster, legalActionsForPlayer(s, caster));
  };
  it("⭐ ai1's Hungry Flames kills ai2's Hill Giant and burns ai2 — before, only Bears were offered and it shot the user's first", () => {
    const p = pick("ai1", HUNGRY_FLAMES);
    expect(p?.kind).toBe("cast-spell");
    expect([slotTarget(p, 0), slotTarget(p, 1)]).toEqual(["ai2-giant", "ai2"]);
  });
  it("⭐ ai1's Enter the God-Eternals kills ai3's Craw Wurm (4 damage to a 6/4) and mills ai3", () => {
    const p = pick("ai1", ENTER_GOD_ETERNALS);
    expect([slotTarget(p, 0), slotTarget(p, 2)]).toEqual(["ai3-wurm", "ai3"]);
  });
  it("⭐ the default AI in the user's seat casts Vibrant Outburst at an opponent's creature — before, every row aimed at its own Bears and it held", () => {
    const p = pick("user", VIBRANT_OUTBURST);
    expect(p?.kind).toBe("cast-spell");
    const s = pod({ caster: "user", extra: threats });
    const t0 = p.targets.find((t) => t.atomIndex === 0);
    expect(t0.controller).not.toBe("user");
    expect(SEATS.some((seat) => seat !== "user" && permanentsOf(s, seat).includes(t0.id))).toBe(true);
  });
});

describe("the default AI's partner past the cap (the target-cap review's F2)", () => {
  it("⭐ First Stage of Magic Design from the user's seat: the 3 damage at an opponent's, the +3/+3 on its own creature — not the burned opponent's", () => {
    const s = pod({ caster: "user", hand: [["fs", FIRST_STAGE]], extra: { ai2: [["ai2-giant", GIANT]] } });
    const p = pickAction(s, "user", legalActionsForPlayer(s, "user"));
    expect(p?.kind).toBe("cast-spell");
    const burn = p.targets.find((t) => t.atomIndex === 3), pump = p.targets.find((t) => t.atomIndex === 4);
    expect(burn.type === "player" ? burn.id : burn.controller).not.toBe("user");
    expect(pump.controller).toBe("user");
  });
});

describe("an exact-count subset slot past the cap (the target-cap review's F3a)", () => {
  it("⭐ Curse of the Swine among 80 creatures: at X = 2 and X = 3 every cast exiles exactly X distinct creatures, and every creature is offered", () => {
    const s = pod({ bears: 20, forests: 0, hand: [["swine", SWINE]] });
    const all = SEATS.flatMap((p) => bearsOf(p, 20));
    for (const x of [2, 3]) {
      const casts = castsOf(s, "user", "swine").filter((a) => a.xValue === x);
      expect(casts.length, `X = ${x}`).toBeGreaterThan(64);
      for (const a of casts) expect(new Set(a.targets.map((t) => t.id)).size, `X = ${x}: ${a.targets.map((t) => t.id)}`).toBe(x);
      expect(sorted(new Set(casts.flatMap((a) => a.targets.map((t) => t.id)))), `X = ${x}`).toEqual(sorted(all));
    }
  });
});

describe("over the cap the first 64 rows are the capped offer's (the target-cap review's F3c / F4)", () => {
  const rows = (casts, ...atoms) => casts.slice(0, 64).map((a) => atoms.map((i) => slotTarget(a, i) ?? "none").join(">"));
  it("⭐ an \"up to one\" slot the cap cut short: Unstable Experiment beside 72 creatures of yours — the user draws, beside its first 63 creatures, then no target", () => {
    const s = pod({ bears: 0, forests: 0, hand: [["ue", UNSTABLE_EXPERIMENT]], extra: { user: Array.from({ length: 72 }, (_, i) => [`ub${i}`, BEARS]) } });
    expect(rows(castsOf(s, "user", "ue"), 0, 1)).toEqual([...Array.from({ length: 63 }, (_, i) => `user>ub${i}`), "user>none"]);
  });
  it("two required slots: Twisted Fealty — your first Bear beside all 24, your second beside all 24, your third beside the first 16", () => {
    const casts = castsOf(pod({ hand: [["tf", TWISTED_FEALTY]] }), "user", "tf");
    expect(rows(casts, 0, 3)).toEqual(["user-bear0", "user-bear1"].flatMap((b) => ALL_BEARS.map((t) => `${b}>${t}`)).concat(ALL_BEARS.slice(0, 16).map((t) => `user-bear2>${t}`)));
  });
  it("a target beside an \"up to one\" slot: Vibrant Outburst — your first two Bears beside every Bear and no target, your third beside the first 14", () => {
    const casts = castsOf(pod({ hand: [["vo", VIBRANT_OUTBURST]] }), "user", "vo");
    const tap = [...ALL_BEARS, "none"];
    expect(rows(casts, 0, 1)).toEqual(["user-bear0", "user-bear1"].flatMap((b) => tap.map((t) => `${b}>${t}`)).concat(tap.slice(0, 14).map((t) => `user-bear2>${t}`)));
  });
  it("a mode combination: Lorehold Command's token and 3-damage modes — the first 16 creatures, each beside every player gaining 3", () => {
    const casts = castsOf(pod({ hand: [["lc", LOREHOLD_COMMAND]] }), "user", "lc").filter((a) => JSON.stringify(a.chosenMode) === "[0,2]");
    const first16 = [...bearsOf("user"), ...bearsOf("ai1"), ...bearsOf("ai2", 4)];
    expect(rows(casts, 1, 2)).toEqual(first16.flatMap((b) => SEATS.map((p) => `${b}>${p}`)));
  });
  it("a player and cards from that player's graveyard: Dwell on the Past — the user's 64 shuffles of up to three of its seven cards, the largest first", () => {
    const s = pod({ bears: 1, forests: 0, hand: [["dwell", DWELL]] });
    for (const seat of SEATS) s.players[seat] = { ...s.players[seat], graveyard: Array.from({ length: seat === "user" ? 7 : 2 }, (_, i) => ({ ...BEARS, id: `${seat}-gy${i}` })) };
    const first = castsOf(s, "user", "dwell").slice(0, 64);
    expect(first.every((a) => a.targets[0].id === "user")).toBe(true);
    expect(first.map((a) => a.targets.length - 1)).toEqual([...Array(35).fill(3), ...Array(21).fill(2), ...Array(7).fill(1), 0]);
  });
});

describe("at or under the cap nothing changed", () => {
  it("a product within the cap is offered whole, in its order: Hungry Flames in a duel, each creature beside each player", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [on("user", "u1", BEARS)], hand: [{ ...HUNGRY_FLAMES, id: "hf" }], manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } },
        ai: { ...g.players.ai, battlefield: [on("ai", "a1", BEARS), on("ai", "a2", GIANT)] } } };
    const rows = castsOf(s, "user", "hf").map((a) => [slotTarget(a, 0), slotTarget(a, 1)]);
    expect(rows).toEqual([["u1", "user"], ["u1", "ai"], ["a1", "user"], ["a1", "ai"], ["a2", "user"], ["a2", "ai"]]);
  });
  it("a product of exactly 64 (16 creatures × 4 players) is the whole product, in its order", () => {
    const s = pod({ bears: 4, forests: 0, hand: [["hf", HUNGRY_FLAMES]] });
    const rows = castsOf(s, "user", "hf").map((a) => `${slotTarget(a, 0)}>${slotTarget(a, 1)}`);
    expect(rows).toEqual(SEATS.flatMap((q) => bearsOf(q, 4)).flatMap((b) => SEATS.map((p) => `${b}>${p}`)));
  });
  it("over the cap the first 64 rows are the capped product's, as they were: the first 16 creatures, each beside every player", () => {
    const s = pod({ hand: [["hf", HUNGRY_FLAMES]] });
    const first = castsOf(s, "user", "hf").slice(0, 64).map((a) => `${slotTarget(a, 0)}>${slotTarget(a, 1)}`);
    const old = [...bearsOf("user"), ...bearsOf("ai1"), ...bearsOf("ai2", 4)].flatMap((b) => SEATS.map((p) => `${b}>${p}`));
    expect(first).toEqual(old);
  });
});

describe("the offer stays bounded", () => {
  it("a hundred Bears a seat: Twisted Fealty's product is 400 × 400 rows; its offer is at most 64 + (4 seats + 2) × 800, and Hungry Flames' is 400 × 4", () => {
    const s = pod({ bears: 100, forests: 0, hand: [["tf", TWISTED_FEALTY], ["hf", HUNGRY_FLAMES]] });
    const tf = castsOf(s, "user", "tf");
    expect(tf.length).toBeLessThanOrEqual(64 + 6 * (400 + 400));
    expect(tf.length).toBeLessThan((400 * 400) / 30);
    expect(castsOf(s, "user", "hf").length).toBeLessThanOrEqual(64 + 6 * (400 + 4));
  });
  it("⭐ and on it every Bear is still reachable in both of Twisted Fealty's slots, and in Hungry Flames' beside every player", () => {
    const s = pod({ bears: 100, forests: 0, hand: [["tf", TWISTED_FEALTY], ["hf", HUNGRY_FLAMES]] });
    const bears = SEATS.flatMap((p) => bearsOf(p, 100));
    const tf = castsOf(s, "user", "tf");
    expect(reach(tf, 0)).toEqual(sorted(bears));
    expect(reach(tf, 3)).toEqual(sorted(bears));
    const hf = castsOf(s, "user", "hf");
    expect(hf).toHaveLength(400 * 4);
  });
});

describe("one slot past the cap", () => {
  it("⭐ Swords to Plowshares beside seventy of its caster's own Bears reaches an opponent's Serra Angel — it reached the first 64 only", () => {
    const s = pod({ bears: 0, forests: 0, hand: [["stp", SWORDS]], extra: { user: Array.from({ length: 70 }, (_, i) => [`ub${i}`, BEARS]), ai3: [["ai3-angel", ANGEL]] } });
    const casts = castsOf(s, "user", "stp");
    expect(casts.map((a) => slotTarget(a, 0))).toContain("ai3-angel");
    expect(casts).toHaveLength(71); // one cast per legal target, in board order
  });
  it("⭐ an \"up to one\" slot past the cap names every creature, and still offers no target", () => {
    const s = pod({ bears: 20, forests: 0 }); // 80 creatures
    const casts = expandCastChoices(s, "user", parseEffectProgram({ type: "Instant", oracle: "Tap up to one target creature." }));
    const ids = casts.map((c) => c.targets[0]?.id ?? "none");
    expect(sorted(new Set(ids))).toEqual(sorted([...SEATS.flatMap((p) => bearsOf(p, 20)), "none"]));
  });
  it("⭐ Vibrant Outburst's \"tap up to one target creature\" past the cap reaches an opponent's creature", () => {
    const s = pod({ bears: 20, forests: 0, hand: [["vo", VIBRANT_OUTBURST]] });
    expect(reach(castsOf(s, "user", "vo"), 1)).toContain("ai3-bear19");
  });
});

describe("every option of every slot is offered in some cast (the slots as castSlots builds them, before combining)", () => {
  const { castSlots, DECLINE } = _internals;
  const NONE = "(none)";
  const keyOf = (ts) => (ts.length ? ts.map((t) => String(t.id)).sort().join("+") : NONE);
  const optKey = (o) => (o === DECLINE ? NONE : Array.isArray(o) ? keyOf(o) : String(o.id));
  /** For each slot, its options none of `casts` names in that slot (a two-target atom's slots told apart by role). */
  function unreached(s, seat, spell) {
    const program = parseEffectProgram(spell);
    const slots = castSlots(s, seat, program.atoms, spell.colors, { sourceColorsKnown: true });
    const casts = expandCastChoices(s, seat, program, spell.colors, { sourceColorsKnown: true });
    const { perAtom, slotAtom } = slots;
    const roleOf = (j) => perAtom[j].find((o) => o !== DECLINE && !Array.isArray(o))?.role ?? null;
    return perAtom.map((options, j) => {
      const a = slotAtom[j];
      const second = slotAtom.indexOf(a) !== j;
      const twoSlot = slotAtom.lastIndexOf(a) !== slotAtom.indexOf(a);
      const r2 = roleOf(slotAtom.lastIndexOf(a));
      const seen = new Set(casts.map((c) => keyOf((c.targets || []).filter((t) => t.atomIndex === a && (!twoSlot || (second ? t.role === r2 : t.role !== r2))))));
      return options.map(optKey).filter((k) => !seen.has(k));
    });
  }
  it("⭐ on the review's board with a planeswalker a seat, from the user's seat and ai2's: nothing unreached for the review's cards", () => {
    expect(typeof castSlots).toBe("function");
    for (const seat of ["user", "ai2"]) {
      const s = pod({ caster: seat, pw: true, bears: 8 });
      for (const spell of [TWISTED_FEALTY, ANGRATHS_FURY, HUNGRY_FLAMES, RISE, ENTER_GOD_ETERNALS, VIBRANT_OUTBURST, UNSTABLE_EXPERIMENT, PREY_UPON, CLASH]) {
        const left = unreached(s, seat, spell);
        expect({ spell: spell.name, seat, left }).toEqual({ spell: spell.name, seat, left: left.map(() => []) });
      }
    }
  });
});

describe("a person's triggered ability past the cap (the trigger-target question, CR 603.3d)", () => {
  it("⭐ Gurmag Rakshasa's enters trigger offers every opponent's Bear for -2/-2 — the fourth seat's included — beside each of yours for +2/+2", () => {
    const s0 = { ...pod({ extra: { user: [["gurmag", GURMAG]] } }), humanSeats: ["user"], pendingTriggers: [] };
    const gurmag = s0.players.user.battlefield.find((p) => p.id === "gurmag");
    const asked = raiseTriggerTargetChoice(flushTriggers(checkEnterTriggers(s0, gurmag), { chooseTargets: chooseTriggerTargets }));
    expect(asked.pendingChoice?.kind).toBe("trigger-target");
    const cands = asked.pendingChoice.candidates;
    const shrunk = new Set(cands.map((c) => c.targets[0].id)), grown = new Set(cands.map((c) => c.targets[1].id));
    expect(sorted(shrunk)).toEqual(sorted(OPPONENTS_OF("user").flatMap((p) => bearsOf(p))));
    expect(sorted(grown)).toEqual(sorted([...bearsOf("user"), "gurmag"]));
    // each option beside each seat's first in the other slot: ai3's last Bear beside your first; Gurmag beside ai3's first Bear
    expect(cands.some((c) => c.targets[0].id === "ai3-bear5" && c.targets[1].id === "user-bear0")).toBe(true);
    expect(cands.some((c) => c.targets[0].id === "ai3-bear0" && c.targets[1].id === "gurmag")).toBe(true);
  });
});

describe("the slot shapes past the cap", () => {
  it("⭐ an \"up to one\" own-creature slot beside a player: Unstable Experiment — any player draws, any of twenty creatures of yours connives, or none", () => {
    const s = pod({ bears: 20, forests: 0, hand: [["ue", UNSTABLE_EXPERIMENT]] });
    const casts = castsOf(s, "user", "ue");
    expect(reach(casts, 0)).toEqual(sorted(SEATS));
    expect(reach(casts, 1)).toEqual(sorted([...bearsOf("user", 20), "none"]));
    for (const p of SEATS) expect(casts.some((a) => slotTarget(a, 0) === p && slotTarget(a, 1) === "user-bear19"), `${p} draws, the last Bear connives`).toBe(true);
    for (const a of casts) for (const t of a.targets) expect(typeof t.id).toBe("string"); // a subset spread into its targets, never nested
  });
  it("⭐ a player and cards from that player's graveyard: Dwell on the Past reaches every player and every card, though its caster's graveyard holds seven", () => {
    const s = pod({ bears: 1, forests: 0, hand: [["dwell", DWELL]] });
    for (const seat of SEATS) {
      const n = seat === "user" ? 7 : 2;
      s.players[seat] = { ...s.players[seat], graveyard: Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${seat}-gy${i}` })) };
    }
    const casts = castsOf(s, "user", "dwell");
    expect(sorted(new Set(casts.map((a) => a.targets.find((t) => t.type === "player").id)))).toEqual(sorted(SEATS));
    const cards = new Set(casts.flatMap((a) => a.targets.filter((t) => t.type === "graveyardCard").map((t) => t.id)));
    expect(sorted(cards)).toEqual(sorted(SEATS.flatMap((seat) => s.players[seat].graveyard.map((c) => c.id))));
    for (const a of casts) { // a card only from the chosen player's own graveyard (CR 601.2c — "their graveyard")
      const p = a.targets.find((t) => t.type === "player").id;
      for (const t of a.targets.filter((x) => x.type === "graveyardCard")) expect(t.id.startsWith(`${p}-gy`)).toBe(true);
    }
    expect(casts.some((a) => a.targets.length === 5 && a.targets[0].id === "ai3")).toBe(false); // ai3 has two cards: never four
    expect(casts.some((a) => a.targets.length === 3 && a.targets.some((t) => t.id === "ai3"))).toBe(true); // ai3 and both its cards
  });

  it("⭐ a two-target fight: Prey Upon's fighter is any of your creatures, its target any opponent's, never one creature twice", () => {
    const s = pod({ bears: 12, forests: 0, hand: [["prey", PREY_UPON]] });
    const casts = castsOf(s, "user", "prey");
    const fighters = new Set(), victims = new Set();
    for (const a of casts) {
      const f = a.targets.find((t) => t.role === "fighter"), v = a.targets.find((t) => t.role !== "fighter");
      expect(f.id).not.toBe(v.id);
      fighters.add(f.id); victims.add(v.id);
    }
    expect(sorted(fighters)).toEqual(sorted(bearsOf("user", 12)));
    expect(sorted(victims)).toEqual(sorted(OPPONENTS_OF("user").flatMap((p) => bearsOf(p, 12))));
  });
  it("⭐ one pool for both: Clash of Titans with seventy creatures, all its caster's — each one fights and is fought, never itself", () => {
    // ("Target creature fights another target creature" — two distinct objects, CR 115.3): the first creature's own rows pair it with
    // itself until a row moves the other half to the next creature; the first 64 rows name it in the second slot only against itself.
    const s = pod({ bears: 0, forests: 0, hand: [["clash", CLASH]], extra: { user: Array.from({ length: 70 }, (_, i) => [`ub${i}`, BEARS]) } });
    const casts = castsOf(s, "user", "clash");
    const first = new Set(), second = new Set();
    for (const a of casts) {
      expect(a.targets).toHaveLength(2);
      expect(a.targets[0].id).not.toBe(a.targets[1].id);
      first.add(a.targets[0].id); second.add(a.targets[1].id);
    }
    const all = Array.from({ length: 70 }, (_, i) => `ub${i}`);
    expect(sorted(first)).toEqual(sorted(all));
    expect(sorted(second)).toEqual(sorted(all));
  });
});
