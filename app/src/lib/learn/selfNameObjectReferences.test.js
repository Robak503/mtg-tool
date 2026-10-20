/**
 * A LEGEND THAT NAMES ITSELF where the engine already reads "this creature" (CR 201.5: a card's name in its own text means that
 * object; CR 201.5c: a shortened name means the full name). Four printed shapes the self-name allowlists did not take,
 * each one a grammar the engine already plays for the "this <noun>" spelling:
 *   · The Gitrog Monster (EDHREC #906) — "At the beginning of your upkeep, sacrifice The Gitrog Monster unless you sacrifice a land."
 *     (the sac-unless-pay seam: Bog Elemental's "sacrifice this creature unless you sacrifice a land").
 *   · Abstergo Entertainment (#2060) — "{3}, {T}, Exile Abstergo Entertainment: Return up to one target historic card from your
 *     graveyard to your hand, then exile all graveyards." (the exile-self cost, "Exile this land").
 *   · Ruby, Daring Tracker (#2157) — "Whenever Ruby attacks while you control a creature with power 4 or greater, Ruby gets +2/+2
 *     until end of turn." (the attacks-while event condition, Pugnacious Hammerskull's lane).
 *   · Kona, Rescue Beastie (#2387) — "Survival — At the beginning of your second main phase, if Kona is tapped, you may put a
 *     permanent card from your hand onto the battlefield." (the self tap-state intervening-if, CR 603.4).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard); the rulings quoted are the bundled ones.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { checkAttackTriggers, checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { autoPickSacUnlessPay, resolveSacUnlessPayChoice, resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

beforeEach(() => _resetIdsForTests());

const THE_GITROG_MONSTER = {"name":"The Gitrog Monster","type":"Legendary Creature — Frog Horror","mana":"{3}{B}{G}","cmc":5,"power":"6","toughness":"6","keywords":["Deathtouch"],"colors":["B","G"],"oracle":"Deathtouch\nAt the beginning of your upkeep, sacrifice The Gitrog Monster unless you sacrifice a land.\nYou may play an additional land on each of your turns.\nWhenever one or more land cards are put into your graveyard from anywhere, draw a card."}; // body-only on 55eb7d63
const BOG_ELEMENTAL = {"name":"Bog Elemental","type":"Creature — Elemental","mana":"{3}{B}{B}","cmc":5,"power":"5","toughness":"4","keywords":["Protection"],"colors":["B"],"oracle":"Protection from white\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice a land."}; // native-trigger on 55eb7d63
const ABSTERGO_ENTERTAINMENT = {"name":"Abstergo Entertainment","type":"Legendary Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}: Add one mana of any color.\n{3}, {T}, Exile Abstergo Entertainment: Return up to one target historic card from your graveyard to your hand, then exile all graveyards. (Artifacts, legendaries, and Sagas are historic.)"}; // land-partial on 55eb7d63
const THE_STASIS_COFFIN = {"name":"The Stasis Coffin","type":"Legendary Artifact","mana":"{3}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{2}, {T}, Exile The Stasis Coffin: You gain protection from everything until your next turn."}; // body-only on 55eb7d63
const RUBY_DARING_TRACKER = {"name":"Ruby, Daring Tracker","type":"Legendary Creature — Human Scout","mana":"{R}{G}","cmc":2,"power":"1","toughness":"2","keywords":["Haste"],"colors":["G","R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)\nWhenever Ruby attacks while you control a creature with power 4 or greater, Ruby gets +2/+2 until end of turn.\n{T}: Add {R} or {G}."}; // body-only on 55eb7d63
const MOON_BOY = {"name":"Moon-Boy, Dino Rider","type":"Legendary Creature — Ape Human","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":"Dinosaur spells you cast cost {1} less to cast.\nWhenever Moon-Boy attacks while you control a Dinosaur, Moon-Boy gets +1/+1 until end of turn."}; // body-only on 55eb7d63
const KONA_RESCUE_BEASTIE = {"name":"Kona, Rescue Beastie","type":"Legendary Creature — Beast Survivor","mana":"{3}{G}","cmc":4,"power":"4","toughness":"3","keywords":["Survival"],"colors":["G"],"oracle":"Survival — At the beginning of your second main phase, if Kona is tapped, you may put a permanent card from your hand onto the battlefield."}; // body-only on 55eb7d63
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const REGISAUR_ALPHA = {"name":"Regisaur Alpha","type":"Creature — Dinosaur","mana":"{3}{R}{G}","cmc":5,"power":"4","toughness":"4","keywords":[],"colors":["G","R"],"oracle":"Other Dinosaurs you control have haste.\nWhen this creature enters, create a 3/3 green Dinosaur creature token with trample."};
const LIGHTNING_BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Lightning Bolt deals 3 damage to any target."};

const P = (id, card, controller = "user", over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const G = (id, card) => ({ ...card, id });
const LIB = (n, tag = "l") => Array.from({ length: n }, (_, i) => G(`${tag}${i}`, GRIZZLY_BEARS));
/** Resolve the stack, flushing what each resolution triggers; stops at a pending choice. */
function settle(s0) {
  let s = s0;
  for (let i = 0; i < 30; i++) {
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    if (!(s.stack || []).length || s.pendingChoice) break;
    s = resolveTopOfStack(s);
  }
  return s;
}
function pod(user, { step = "main", phase = "precombat-main", ai = [], userOver = {}, aiOver = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase, step, stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [], battlefield: user, library: LIB(6), ...userOver },
      ai1: { ...s0.players.ai1, battlefield: ai, ...aiOver } } };
}

describe("The Gitrog Monster — \"sacrifice The Gitrog Monster unless you sacrifice a land\"", () => {
  const upkeep = (user) => settle(checkStepTriggers(pod(user, { phase: "beginning", step: "upkeep" }), "upkeep"));

  it("⭐ the card plays its whole text (native); Bog Elemental, the \"this creature\" spelling, unchanged", () => {
    expect({ gitrog: classifyCard(THE_GITROG_MONSTER), bog: classifyCard(BOG_ELEMENTAL) }).toEqual({ gitrog: "native-mixed", bog: "native-trigger" });
  });

  it("⭐ a land on the battlefield: the upkeep asks for the land; paying sacrifices the Swamp, Gitrog stays, and its own land-to-graveyard trigger draws", () => {
    const s = upkeep([P("gitrog", THE_GITROG_MONSTER), P("sw", SWAMP)]);
    const pc = s.pendingChoice;
    const row = { kind: pc?.kind ?? null, cost: pc?.cost ?? null, source: pc?.sourceId ?? null, autoPays: pc ? autoPickSacUnlessPay(s, pc) : null };
    expect(row).toEqual({ kind: "sac-unless-pay", cost: { kind: "sacrifice", type: "land", count: 1 }, source: "gitrog", autoPays: true });
    const after = settle(resolveSacUnlessPayChoice(s, true));
    expect({ battlefield: after.players.user.battlefield.map((p) => p.id), graveyard: after.players.user.graveyard.map((c) => c.id), hand: after.players.user.hand.length })
      .toEqual({ battlefield: ["gitrog"], graveyard: ["c-sw"], hand: 1 });
  });

  it("⭐ no land: Gitrog is sacrificed (it goes to its owner's graveyard)", () => {
    const s = upkeep([P("gitrog", THE_GITROG_MONSTER), P("bears", GRIZZLY_BEARS)]);
    expect({ kind: s.pendingChoice?.kind ?? null, autoPays: s.pendingChoice ? autoPickSacUnlessPay(s, s.pendingChoice) : null }).toEqual({ kind: "sac-unless-pay", autoPays: false });
    const after = settle(resolveSacUnlessPayChoice(s, false));
    expect({ battlefield: after.players.user.battlefield.map((p) => p.id), graveyard: after.players.user.graveyard.map((c) => c.name) })
      .toEqual({ battlefield: ["bears"], graveyard: ["The Gitrog Monster"] });
  });

  it("control: Bog Elemental pays with its land exactly as before", () => {
    const s = upkeep([P("bog", BOG_ELEMENTAL), P("sw", SWAMP)]);
    const after = settle(resolveSacUnlessPayChoice(s, true));
    expect({ kind: s.pendingChoice?.kind, battlefield: after.players.user.battlefield.map((p) => p.id) }).toEqual({ kind: "sac-unless-pay", battlefield: ["bog"] });
  });
});

describe("Abstergo Entertainment — \"{3}, {T}, Exile Abstergo Entertainment: …\"", () => {
  const board = () => pod([P("abs", ABSTERGO_ENTERTAINMENT)], {
    userOver: { manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 3 }, graveyard: [G("gy-sol", SOL_RING), G("gy-ruby", RUBY_DARING_TRACKER), G("gy-bears", GRIZZLY_BEARS)] },
    aiOver: { graveyard: [G("ai-bolt", LIGHTNING_BOLT)] },
  });
  const exileActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "abs" && a.exileSelf);

  it("⭐ the card is covered (a land whose every ability plays); The Stasis Coffin's \"Exile The Stasis Coffin\" cost reads too", () => {
    expect({ abstergo: classifyCard(ABSTERGO_ENTERTAINMENT), coffin: classifyCard(THE_STASIS_COFFIN) }).toEqual({ abstergo: "land", coffin: "native-activated" });
  });

  it("⭐ offered with an exile-self cost on each historic card in your graveyard (an artifact, a legendary) or none; never the Bears", () => {
    const offered = exileActs(board()).map((a) => (a.targets || []).map((t) => t.id).join(",") || "none").sort();
    expect(offered).toEqual(["gy-ruby", "gy-sol", "none"]);
  });

  it("⭐ resolves: Abstergo is exiled as the cost (not a death), the Sol Ring returns to hand, then every graveyard is exiled", () => {
    const s0 = board();
    const act = exileActs(s0).find((a) => (a.targets || []).some((t) => t.id === "gy-sol"));
    expect(act, "the Sol Ring activation is offered").toBeTruthy();
    const paid = dispatchAction(s0, act);
    const s = settle(paid);
    expect({
      paidExile: paid.players.user.exile.map((c) => c.id), paidGraveyard: paid.players.user.graveyard.map((c) => c.id).sort(),
      hand: s.players.user.hand.map((c) => c.id), userGraveyard: s.players.user.graveyard.length, aiGraveyard: s.players.ai1.graveyard.length,
      userExile: s.players.user.exile.map((c) => c.id).sort(), aiExile: s.players.ai1.exile.map((c) => c.id),
    }).toEqual({ paidExile: ["c-abs"], paidGraveyard: ["gy-bears", "gy-ruby", "gy-sol"], hand: ["gy-sol"], userGraveyard: 0, aiGraveyard: 0,
      userExile: ["c-abs", "gy-bears", "gy-ruby"], aiExile: ["ai-bolt"] });
  });

  it("⭐ the ruling — a chosen target that is gone as it resolves: nothing happens, no graveyard is exiled (CR 608.2b)", () => {
    const s0 = board();
    const act = exileActs(s0).find((a) => (a.targets || []).some((t) => t.id === "gy-sol"));
    expect(act).toBeTruthy();
    const paid = dispatchAction(s0, act);
    const gone = { ...paid, players: { ...paid.players, user: { ...paid.players.user, graveyard: paid.players.user.graveyard.filter((c) => c.id !== "gy-sol"), exile: [...paid.players.user.exile, G("gy-sol", SOL_RING)] } } };
    const s = settle(gone);
    expect({ hand: s.players.user.hand.length, userGraveyard: s.players.user.graveyard.map((c) => c.id).sort(), aiGraveyard: s.players.ai1.graveyard.length })
      .toEqual({ hand: 0, userGraveyard: ["gy-bears", "gy-ruby"], aiGraveyard: 1 });
  });

  it("⭐ the ruling — no target chosen: the graveyards are still exiled", () => {
    const s0 = board();
    const act = exileActs(s0).find((a) => !(a.targets || []).length);
    expect(act).toBeTruthy();
    const s = settle(dispatchAction(s0, act));
    expect({ hand: s.players.user.hand.length, userGraveyard: s.players.user.graveyard.length, aiGraveyard: s.players.ai1.graveyard.length }).toEqual({ hand: 0, userGraveyard: 0, aiGraveyard: 0 });
  });
});

describe("Ruby, Daring Tracker — \"Whenever Ruby attacks while you control a creature with power 4 or greater\"", () => {
  const attack = (user, prep = (s) => s) => {
    const s0 = { ...pod(user, { phase: "combat", step: "declare-attackers" }), combat: { attackers: [{ permanentId: user[0].id, attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    return settle(prep(checkAttackTriggers(s0)));
  };
  const pt = (s, id) => { const p = findPermanent(s, id).permanent; return `${creaturePower(p, s)}/${creatureToughness(p, s)}`; };

  it("⭐ Ruby and Moon-Boy play their whole text", () => {
    expect({ ruby: classifyCard(RUBY_DARING_TRACKER), moonBoy: classifyCard(MOON_BOY) }).toEqual({ ruby: "native-mana", moonBoy: "native-mixed" });
  });

  it("⭐ attacking beside a Craw Wurm (power 6): +2/+2 until end of turn", () => {
    expect(pt(attack([P("ruby", RUBY_DARING_TRACKER), P("wurm", CRAW_WURM)]), "ruby")).toBe("3/4");
  });

  it("⭐ beside only a Grizzly Bears: no trigger", () => {
    const s0 = { ...pod([P("ruby", RUBY_DARING_TRACKER), P("bears", GRIZZLY_BEARS)], { phase: "combat", step: "declare-attackers" }), combat: { attackers: [{ permanentId: "ruby", attackingPlayer: "user", defender: "ai1" }], blockers: [] } };
    expect({ fired: (checkAttackTriggers(s0).pendingTriggers || []).length, pt: pt(attack([P("ruby", RUBY_DARING_TRACKER), P("bears", GRIZZLY_BEARS)]), "ruby") }).toEqual({ fired: 0, pt: "1/2" });
  });

  it("⭐ the ruling — checked as she attacks only: the Wurm gone before it resolves, she still gets +2/+2", () => {
    const withoutWurm = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "wurm") } } });
    expect(pt(attack([P("ruby", RUBY_DARING_TRACKER), P("wurm", CRAW_WURM)], withoutWurm), "ruby")).toBe("3/4");
  });

  it("⭐ Moon-Boy attacking beside a Dinosaur: +1/+1; without one, nothing", () => {
    expect({ withDino: pt(attack([P("moon", MOON_BOY), P("dino", REGISAUR_ALPHA)]), "moon"), alone: pt(attack([P("moon", MOON_BOY)]), "moon") }).toEqual({ withDino: "3/3", alone: "2/2" });
  });
});

describe("Kona, Rescue Beastie — \"if Kona is tapped, you may put a permanent card from your hand onto the battlefield\"", () => {
  const secondMain = (kona, prep = (s) => s) => {
    const s0 = pod([kona], { phase: "postcombat-main", step: "main", userOver: { hand: [G("h-wurm", CRAW_WURM), G("h-bolt", LIGHTNING_BOLT)] } });
    return settle(prep(checkStepTriggers(s0, "secondMain")));
  };

  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(KONA_RESCUE_BEASTIE)).toBe("native-trigger");
  });

  it("⭐ tapped: the trigger asks, then offers the permanent cards in hand (never the Bolt); the Wurm enters", () => {
    const asked = secondMain(P("kona", KONA_RESCUE_BEASTIE, "user", { tapped: true }));
    expect(asked.pendingChoice?.kind).toBe("optional-effect");
    const choosing = resolveOptionalChoice(asked, true);
    const candidates = (choosing.pendingChoice?.candidates || []).map((c) => c.id ?? c.cardId ?? c).sort();
    const s = settle(resolveTutorChoice(choosing, "h-wurm"));
    expect({ candidates, battlefield: s.players.user.battlefield.map((p) => p.card.name).sort(), hand: s.players.user.hand.map((c) => c.id) })
      .toEqual({ candidates: ["h-wurm"], battlefield: ["Craw Wurm", "Kona, Rescue Beastie"], hand: ["h-bolt"] });
  });

  it("⭐ untapped as the second main phase begins: nothing goes on the stack", () => {
    const s0 = pod([P("kona", KONA_RESCUE_BEASTIE)], { phase: "postcombat-main", step: "main", userOver: { hand: [G("h-wurm", CRAW_WURM)] } });
    expect((flushTriggers(checkStepTriggers(s0, "secondMain"), { chooseTargets: chooseTriggerTargets }).stack || []).length).toBe(0);
  });

  it("⭐ the ruling — untapped as it begins to resolve: it does nothing (CR 603.4)", () => {
    const untap = (s) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, tapped: false })) } } });
    const s0 = pod([P("kona", KONA_RESCUE_BEASTIE, "user", { tapped: true })], { phase: "postcombat-main", step: "main", userOver: { hand: [G("h-wurm", CRAW_WURM)] } });
    const fired = checkStepTriggers(s0, "secondMain");
    const s = settle(untap(flushTriggers(fired, { chooseTargets: chooseTriggerTargets })));
    expect({ fired: (fired.pendingTriggers || []).length, pause: s.pendingChoice?.kind ?? null, battlefield: s.players.user.battlefield.map((p) => p.id), hand: s.players.user.hand.map((c) => c.id) })
      .toEqual({ fired: 1, pause: null, battlefield: ["kona"], hand: ["h-wurm"] });
  });
});
