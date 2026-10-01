/**
 * flickerTargets.test.js — Brago, King Eternal and Thassa, Deep-Dwelling (shelf decks D21, 2026-09-30: Brago Blink), and the
 * trigger chooser's flicker pick they need.
 *
 *   • Brago: "exile any number of target nonland permanents you control, then return those cards to the battlefield under their
 *     owner's control" — the phase-out any-number bound on the blink atom. Thassa: the up-to-one flicker of ANOTHER creature
 *     you control, and "{3}{U}: Tap another target creature" (the notSource restriction).
 *   • Which permanents a flicker takes was the first correct-side candidate, and the expander orders subsets maximal-first — so
 *     an "up to one" flicker took whatever came first and Brago's "any number" would take everything you control, tokens
 *     included. The chooser now flickers what gains: an enters ability
 *     fires again, a tapped permanent returns untapped, an opponent's Aura falls off, −1/−1 counters go; not a token (CR 111.8),
 *     not what loses more than it gains (+1/+1 counters, your own Equipment on it, an Equipment coming off its creature).
 *   • Auras are not offered to a flicker until a returned Aura can choose what it enchants (CR 303.4f).
 *
 * Every board is built so the rule under test DECIDES its outcome (each factor flips a sign or a pick).
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { checkAttackTriggers, checkCombatDamageTriggers, checkStepTriggers, detectTriggers } from "./triggers.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const card = (name, type, mana, cmc, oracle, extra = {}) => ({ name, type, mana, cmc, keywords: [], oracle, ...extra });
const BRAGO = card("Brago, King Eternal", "Legendary Creature — Spirit Noble", "{2}{W}{U}", 4, "Flying\nWhenever Brago deals combat damage to a player, exile any number of target nonland permanents you control, then return those cards to the battlefield under their owner's control.", { power: "2", toughness: "4", keywords: ["Flying"], colors: ["W", "U"] });
const THASSA = card("Thassa, Deep-Dwelling", "Legendary Enchantment Creature — God", "{3}{U}", 4, "Indestructible\nAs long as your devotion to blue is less than five, Thassa isn't a creature.\nAt the beginning of your end step, exile up to one other target creature you control, then return that card to the battlefield under your control.\n{3}{U}: Tap another target creature.", { power: "6", toughness: "5", keywords: ["Indestructible"], colors: ["U"] });
const CIRCLE = card("Teleportation Circle", "Enchantment", "{3}{W}", 4, "At the beginning of your end step, exile up to one target artifact or creature you control, then return that card to the battlefield under its owner's control.", { colors: ["W"] });
const CLOSET = card("Conjurer's Closet", "Artifact", "{5}", 5, "At the beginning of your end step, you may exile target creature you control, then return that card to the battlefield under your control.", { colors: [] });
const VISIONARY = card("Elvish Visionary", "Creature — Elf Shaman", "{1}{G}", 2, "When this creature enters, draw a card.", { power: "1", toughness: "1", colors: ["G"] });
const BEAR = card("Grizzly Bears", "Creature — Bear", "{1}{G}", 2, "", { power: "2", toughness: "2", colors: ["G"] });
const GIANT = card("Hill Giant", "Creature — Giant", "{3}{R}", 4, "", { power: "3", toughness: "3", colors: ["R"] });
const ELF_TOKEN = card("Llanowar Elves", "Token Creature — Elf Druid", "", 0, "{T}: Add {G}.", { power: "1", toughness: "1", colors: ["G"], token: true });
const PACIFISM = card("Pacifism", "Enchantment — Aura", "{1}{W}", 2, "Enchant creature\nEnchanted creature can't attack or block.", { keywords: ["Enchant"], colors: ["W"] });
const BONESPLITTER = card("Bonesplitter", "Artifact — Equipment", "{1}", 1, "Equipped creature gets +2/+0.\nEquip {1}", { keywords: ["Equip"], colors: [] });
const DJINN = card("Tempest Djinn", "Creature — Djinn", "{U}{U}{U}", 3, "Flying\nThis creature gets +1/+0 for each basic Island you control.", { power: "0", toughness: "4", keywords: ["Flying"], colors: ["U"] });
const MANOWAR = card("Man-o'-War", "Creature — Jellyfish", "{2}{U}", 3, "When this creature enters, return target creature to its owner's hand.", { power: "2", toughness: "2", colors: ["U"] });
// The same two arms reach three more printed cards (the flip-diff's unaimed gains) — each verified in play below.
const PHOTON = card("Photon, Lady of Light", "Legendary Creature — Human Hero", "{3}{W}", 4, "Flying\nWhenever Photon attacks, exile up to one other target creature you control, then return that card to the battlefield under its owner's control.", { power: "3", toughness: "3", keywords: ["Flying"], colors: ["W"] });
const MARSHAL = card("Marshal of Zhalfir", "Creature — Human Knight", "{W}{U}", 2, "Other Knights you control get +1/+1.\n{W}{U}, {T}: Tap another target creature.", { power: "2", toughness: "2", colors: ["W", "U"] });
const GUILDMAGE = card("Legion Guildmage", "Creature — Human Wizard", "{R}{W}", 2, "{5}{R}, {T}: This creature deals 3 damage to each opponent.\n{2}{W}, {T}: Tap another target creature.", { power: "2", toughness: "2", colors: ["R", "W"] });

const perm = (id, c, controller, extra = {}) => ({ ...createPermanent({ id, card: { ...c, id: `c-${id}` }, controller, summoningSick: false }), ...extra });
function board({ user = [], ai = [], mana = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const lib = [BEAR, BEAR, BEAR, BEAR].map((c, i) => ({ ...c, id: `lib${i}` }));
  return { ...g, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user, library: lib, manaPool: { ...g.players.user.manaPool, ...mana } }, ai: { ...g.players.ai, battlefield: ai } } };
}
const resolveAll = (s) => { let n = s, g = 0; while (n.stack?.length && !n.pendingChoice && g++ < 20) n = resolveTopOfStack(n); return n; };
/** The real chooser, with the candidates it was offered captured. */
function chooser() {
  const seen = [];
  return { seen, chooseTargets: (cands, info) => { seen.push(...cands); return chooseTriggerTargets(cands, info); } };
}
const bragoHits = (s, ch = chooser()) => flushTriggers(checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "brago", attackingPlayer: "user", defender: "ai", amount: 2 }]), { chooseTargets: ch.chooseTargets });
const endStep = (s, ch = chooser()) => flushTriggers(checkStepTriggers({ ...s, phase: "ending", step: "end" }, "endStep"), { chooseTargets: ch.chooseTargets });
const chosen = (s) => (s.stack.at(-1)?.targets || []).map((t) => findPermanent(s, t.id)?.permanent.card?.name).sort();
const offered = (ch) => [...new Set(ch.seen.flatMap((c) => (c.targets || []).map((t) => t.id)))].sort();
const drawn = (s) => 4 - s.players.user.library.length;

describe("the cards", () => {
  it("parse: Brago's any-number flicker (no Auras), Thassa's other-creature flicker and her tap; both read native", () => {
    const bragoAtom = parseEffectClause(detectTriggers(BRAGO)[0].effectClause, "Instant", { sourceScoped: true }).atoms[0];
    const thassaBlink = parseEffectClause(detectTriggers(THASSA).find((d) => d.event === "endStep").effectClause, "Instant", { sourceScoped: true }).atoms[0];
    expect({
      brago: [bragoAtom.op, bragoAtom.targetType, bragoAtom.returnTo, bragoAtom.minTargets, bragoAtom.maxTargets, bragoAtom.anyNumber, bragoAtom.restrictions],
      thassaBlink: [thassaBlink.op, thassaBlink.targetType, thassaBlink.maxTargets, thassaBlink.minTargets, thassaBlink.restrictions],
      thassaTap: parseEffectClause("Tap another target creature.", "Instant").atoms[0],
      tiers: [classifyCard(BRAGO), classifyCard(THASSA)],
    }).toEqual({
      brago: ["blink", "nonlandPermanent", "owner", 0, 99, true, [{ kind: "controller", who: "you" }, { kind: "typeNeg", type: "aura" }]],
      thassaBlink: ["blink", "creature", 1, 0, [{ kind: "controller", who: "you" }, { kind: "notSource" }]],
      thassaTap: { op: "tap", targetType: "creature", restrictions: [{ kind: "notSource" }] },
      tiers: ["native-trigger", "native-mixed"],
    });
  });
});

describe("⭐ Brago, King Eternal", () => {
  it("⭐ flickers what gains — the Visionary (it draws again), the Bear their Pacifism holds, the Giant with a -1/-1 counter, tapped Brago himself — never the tapped token, not the plain Bear", () => {
    const s0 = board({
      user: [perm("brago", BRAGO, "user", { tapped: true }), perm("vis", VISIONARY, "user"), perm("held", BEAR, "user", { attachments: ["pac"] }),
        perm("minus", GIANT, "user", { counters: { "-1/-1": 1 } }), perm("plain", BEAR, "user"), perm("tok", ELF_TOKEN, "user", { tapped: true })],
      ai: [perm("pac", PACIFISM, "ai", { attachedTo: "held" })],
    });
    const s1 = bragoHits(s0);
    const targets = chosen(s1);
    const s2 = resolveAll(s1);
    const row = {
      targets,
      drew: drawn(s2),
      tokenKept: !!findPermanent(s2, "tok"),
      plainKept: !!findPermanent(s2, "plain"),
      bragoUntapped: s2.players.user.battlefield.some((p) => p.card?.name === BRAGO.name && !p.tapped),
      pacifismHolds: s2.players.user.battlefield.some((p) => (p.attachments || []).length > 0),
    };
    console.log(`WITNESS bragoFlicker ${JSON.stringify(row)}`);
    expect(row).toEqual({ targets: ["Brago, King Eternal", "Elvish Visionary", "Grizzly Bears", "Hill Giant"], drew: 1, tokenKept: true, plainKept: true, bragoUntapped: true, pacifismHolds: false });
  });
  it("what loses weighs against: four +1/+1 counters outweigh the Visionary's draw (two don't); a tapped Bear carrying your Bonesplitter, and the tapped Bonesplitter itself, stay", () => {
    const pick = (visCounters) => chosen(bragoHits(board({ user: [perm("brago", BRAGO, "user"), perm("vis", VISIONARY, "user", { counters: { "+1/+1": visCounters } }),
      perm("eqBear", BEAR, "user", { tapped: true, attachments: ["bs"] }), perm("bs", BONESPLITTER, "user", { tapped: true, attachedTo: "eqBear" })] })));
    expect({ four: pick(4), two: pick(2) }).toEqual({ four: [], two: ["Elvish Visionary"] });
  });
  it("Auras are not offered: your Pacifism is no candidate (a returned Aura must choose a host, CR 303.4f); Brago is", () => {
    const ch = chooser();
    bragoHits(board({ user: [perm("brago", BRAGO, "user"), perm("myPac", PACIFISM, "user", { attachedTo: "theirs" })], ai: [perm("theirs", BEAR, "ai", { attachments: ["myPac"] })] }), ch);
    expect(offered(ch)).toEqual(["brago"]);
  });
});

describe("⭐ Thassa, Deep-Dwelling", () => {
  it("⭐ at your end step she flickers your Elvish Visionary; with only a plain Bear, nothing; with no other creature, nothing", () => {
    const vis = resolveAll(endStep(board({ user: [perm("thassa", THASSA, "user"), perm("vis", VISIONARY, "user"), perm("bear", BEAR, "user")] })));
    const onlyBear = endStep(board({ user: [perm("thassa", THASSA, "user"), perm("bear", BEAR, "user")] }));
    const alone = endStep(board({ user: [perm("thassa", THASSA, "user")] }));
    expect({ visDrew: drawn(vis), onlyBear: chosen(onlyBear), alone: chosen(alone) }).toEqual({ visDrew: 1, onlyBear: [], alone: [] });
  });
  it("a creature at devotion five, she is never offered as her own target — not for the flicker, not for her tap", () => {
    const s = board({ user: [perm("thassa", THASSA, "user"), perm("djinn", DJINN, "user"), perm("mow", MANOWAR, "user")], mana: { U: 4 } });
    const ch = chooser();
    endStep(s, ch);
    const taps = legalActionsForPlayer({ ...s, phase: "precombat-main", step: "main" }, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "thassa").map((a) => a.targets?.[0]?.id);
    expect({ thassaIsCreature: permanentIsCreature(s, "thassa"), flickerOffered: offered(ch), tapTargets: [...new Set(taps)].sort() })
      .toEqual({ thassaIsCreature: true, flickerOffered: ["djinn", "mow"], tapTargets: ["djinn", "mow"] });
  });
});

describe("the unaimed gains, in play", () => {
  it("Photon, Lady of Light: when she attacks she flickers your Elvish Visionary — never herself", () => {
    const s0 = { ...board({ user: [perm("photon", PHOTON, "user"), perm("vis", VISIONARY, "user"), perm("bear", BEAR, "user")] }), phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "photon", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const ch = chooser();
    const s1 = flushTriggers(checkAttackTriggers(s0), { chooseTargets: ch.chooseTargets });
    const row = { tier: classifyCard(PHOTON), offered: offered(ch), chosen: chosen(s1), drew: drawn(resolveAll(s1)) };
    console.log(`WITNESS photonFlicker ${JSON.stringify(row)}`);
    expect(row).toEqual({ tier: "native-trigger", offered: ["bear", "vis"], chosen: ["Elvish Visionary"], drew: 1 });
  });
  it("Marshal of Zhalfir and Legion Guildmage tap another target creature — they are never offered as their own target", () => {
    const tapOf = (id, c, mana) => {
      const s = { ...board({ user: [perm(id, c, "user"), perm("bear", BEAR, "user")], ai: [perm("giant", GIANT, "ai")], mana }), phase: "precombat-main", step: "main" };
      const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === id && a.targets?.length);
      const tapGiant = acts.find((a) => a.targets[0].id === "giant");
      const after = resolveAll(dispatchAction(s, tapGiant));
      return { targets: [...new Set(acts.map((a) => a.targets[0].id))].sort(), giantTapped: !!findPermanent(after, "giant")?.permanent.tapped };
    };
    expect({ marshal: tapOf("marshal", MARSHAL, { W: 1, U: 1 }), guildmage: tapOf("gm", GUILDMAGE, { W: 1, C: 2 }), tiers: [classifyCard(MARSHAL), classifyCard(GUILDMAGE)] }).toEqual({
      marshal: { targets: ["bear", "giant"], giantTapped: true },
      guildmage: { targets: ["bear", "giant"], giantTapped: true },
      tiers: ["native-mixed", "native-activated"],
    });
  });
});

describe("the chooser", () => {
  it("Teleportation Circle now flickers the creature worth it at your end step (it used to take the first on offer — the Bear)", () => {
    expect(drawn(resolveAll(endStep(board({ user: [perm("circle", CIRCLE, "user"), perm("bear", BEAR, "user"), perm("vis", VISIONARY, "user")] }))))).toBe(1);
  });
  it("a MANDATORY target (Conjurer's Closet) takes the best on offer even at no gain — the plain Bear over the one whose counter it would lose", () => {
    const s = endStep(board({ user: [perm("closet", CLOSET, "user"), perm("big", BEAR, "user", { counters: { "+1/+1": 1 } }), perm("plain", BEAR, "user")] }));
    expect(s.stack.at(-1)?.targets?.[0]?.id).toBe("plain");
  });
  it("only a lone blink is ranked by gain: a program that also targets an opponent's creature keeps the default pick", () => {
    const s = board({ user: [perm("bear", BEAR, "user"), perm("vis", VISIONARY, "user")], ai: [perm("theirs", BEAR, "ai")] });
    const blink = parseEffectClause("exile up to one other target creature you control, then return that card to the battlefield under your control", "Instant", { sourceScoped: true }).atoms[0];
    const bolt = parseEffectClause("Lightning Bolt deals 3 damage to any target.", "Instant").atoms[0];
    const cand = (own) => ({ targets: [{ id: own, type: "creature", controller: "user", atomIndex: 0 }, { id: "theirs", type: "creature", controller: "ai", atomIndex: 1 }] });
    const picked = chooseTriggerTargets([cand("bear"), cand("vis")], { state: s, trigger: { controller: "user" }, program: { atoms: [blink, bolt] } });
    expect(picked.targets[0].id).toBe("bear");
  });
});
