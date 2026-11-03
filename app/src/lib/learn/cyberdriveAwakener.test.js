/**
 * cyberdriveAwakener.test.js — CYBERDRIVE AWAKENER (the play-weighted program, EDHREC #989):
 *
 *   "Flying / Other artifact creatures you control have flying. / When this creature enters, each noncreature artifact you control
 *    becomes a 4/4 artifact creature until end of turn."
 *
 * The enters trigger is the animate atom over a group (effects/atoms/combat.animateClauseParser's group arm → the
 * eachNoncreatureArtifactYouControl scope, atoms/shared.atomTargets): every artifact the controller controls that is no creature as
 * the ability resolves — the set fixed then (CR 611.2c) — gets layer-4 Creature and a layer-7b base 4/4 until end of turn. "Becomes an
 * artifact creature" keeps every prior type and subtype (CR 205.1b): Seat of the Synod is a 4/4 artifact land creature, a Vehicle a
 * 4/4 Vehicle. The flying grant reaches them (layer 6 reads the layer-4 creature, CR 613). Anything it turns into a creature while
 * attached falls off (CR 704.5p — the attachment sweep in sba.js, pw21's): an Equipment, a reconfigure Equipment (the bundled Lizard
 * Blades ruling: "If a permanent with reconfigure is somehow still a creature after it becomes attached …, it immediately becomes
 * unattached"), and an Aura, which then goes to the graveyard (CR 303.4d). An artifact controlled since the turn began can attack; one
 * that entered this turn can't (CR 302.6).
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentIsCreature, permanentPower, permanentToughness, permanentTypes, expireContinuousEffects } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { checkAllStateBasedActions } from "./sba.js";

beforeEach(() => _resetIdsForTests());

const AWAKENER = {"name":"Cyberdrive Awakener","type":"Artifact Creature — Construct","mana":"{5}{U}","oracle":"Flying\nOther artifact creatures you control have flying.\nWhen this creature enters, each noncreature artifact you control becomes a 4/4 artifact creature until end of turn.","layout":"normal","cmc":6,"power":"4","toughness":"4","loyalty":null,"keywords":["Flying"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #989
const BONESPLITTER = {"name":"Bonesplitter","type":"Artifact — Equipment","mana":"{1}","oracle":"Equipped creature gets +2/+0.\nEquip {1}","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Equip"],"colors":[],"colorIdentity":[]}; // EDHREC #11010
const COPTER = {"name":"Smuggler's Copter","type":"Artifact — Vehicle","mana":"{2}","oracle":"Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)","layout":"normal","cmc":2,"power":"3","toughness":"3","loyalty":null,"keywords":["Flying","Crew"],"colors":[],"colorIdentity":[]}; // EDHREC #1913
const SEAT = {"name":"Seat of the Synod","type":"Artifact Land","mana":"","oracle":"{T}: Add {U}.","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["U"]}; // EDHREC #314
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","oracle":"{T}: Add {C}{C}.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #1
const COOKIE = {"name":"Tough Cookie","type":"Artifact Creature — Food Golem","mana":"{1}{G}","oracle":"When this creature enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\n{2}{G}: Until end of turn, target noncreature artifact you control becomes a 4/4 artifact creature.\n{2}, {T}, Sacrifice this creature: You gain 3 life.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":["Food"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #6777
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const BLADES = {"name":"Lizard Blades","type":"Artifact Creature — Equipment Lizard","mana":"{1}{R}","oracle":"Double strike\nEquipped creature has double strike.\nReconfigure {2} ({2}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Double strike","Reconfigure"],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #1470
const RANCOR = {"name":"Rancor","type":"Enchantment — Aura","mana":"{G}","oracle":"Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":["Enchant"],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #844
const COATING = {"name":"Liquimetal Coating","type":"Artifact","mana":"{2}","oracle":"{T}: Target permanent becomes an artifact in addition to its other types until end of turn.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":[]}; // EDHREC #3695
const MYR = {"name":"Darksteel Myr","type":"Artifact Creature — Myr","mana":"{3}","oracle":"Indestructible (Damage and effects that say \"destroy\" don't destroy this creature. If its toughness is 0 or less, it still dies.)","layout":"normal","cmc":3,"power":"0","toughness":"1","loyalty":null,"keywords":["Indestructible"],"colors":[],"colorIdentity":[]}; // EDHREC #6697

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), enteredOnTurn: 1, ...extra });
/** The user's precombat main on turn 5 with Cyberdrive Awakener in hand and {5}{U} floating; `user` / `ai` permanents. */
function table({ user = [], ai = [], hand = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const players = {
    ...g.players,
    user: { ...g.players.user, battlefield: user, hand: [{ ...AWAKENER, id: "h-awk" }, ...hand], graveyard: [], library: [], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 1, C: 8 } },
    ai: { ...g.players.ai, battlefield: ai, hand: [], graveyard: [], library: [] },
  };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, players };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 40) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  expect(crash, `a resolver crashed: ${crash?.error}`).toBeFalsy();
  return finalizeStackResolution(n);
}
function castAwakener(s) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-awk");
  expect(a, "Cyberdrive Awakener is not offered").toBeTruthy();
  return settle(dispatchAction(s, a));
}
const view = (s, id) => ({ creature: permanentIsCreature(s, id), pt: permanentIsCreature(s, id) ? `${permanentPower(s, id)}/${permanentToughness(s, id)}` : null, flying: permanentHasKeyword(s, id, "Flying") });
const board = () => ({
  user: [on("user", "sol", SOL, { tapped: true }), on("user", "seat", SEAT), on("user", "copter", COPTER), on("user", "bears", BEARS, { attachments: ["bone"] }), on("user", "bone", BONESPLITTER, { attachedTo: "bears" }), on("user", "myr", MYR)],
  ai: [on("ai", "aisol", SOL)],
});

describe("the card", () => {
  it("⭐ native: the flying grant and the enters trigger both read", () => {
    expect(classifyCard(AWAKENER)).toMatch(/^native-/);
  });
});

describe("the enters trigger", () => {
  it("⭐ each noncreature artifact you control becomes a 4/4 artifact creature with flying (Awakener's grant): Sol Ring (tapped), Seat of the Synod, Smuggler's Copter (4/4, not 3/3), Bonesplitter", () => {
    const s = castAwakener(table(board()));
    expect(Object.fromEntries(["sol", "seat", "copter", "bone"].map((id) => [id, view(s, id)]))).toEqual({
      sol: { creature: true, pt: "4/4", flying: true }, seat: { creature: true, pt: "4/4", flying: true },
      copter: { creature: true, pt: "4/4", flying: true }, bone: { creature: true, pt: "4/4", flying: true },
    });
  });
  it("⭐ an artifact creature becomes an artifact creature keeping its other types (CR 205.1b): Seat of the Synod is an artifact land creature, the Copter still a Vehicle", () => {
    const s = castAwakener(table(board()));
    expect({ seat: [...permanentTypes(s, "seat").types].sort(), copter: permanentTypes(s, "copter").subtypes }).toEqual({ seat: ["Artifact", "Creature", "Land"], copter: ["Vehicle"] });
  });
  it("⭐ the Equipment that became a creature falls off its creature (CR 704.5p): the Bears are a 2/2 again, Bonesplitter attached to nothing", () => {
    const s = castAwakener(table(board()));
    const bone = s.players.user.battlefield.find((p) => p.id === "bone"), bears = s.players.user.battlefield.find((p) => p.id === "bears");
    expect({ attachedTo: bone?.attachedTo ?? null, bearsAttachments: bears?.attachments ?? [], bears: `${permanentPower(s, "bears")}/${permanentToughness(s, "bears")}` })
      .toEqual({ attachedTo: null, bearsAttachments: [], bears: "2/2" });
  });
  it("⭐ an artifact creature isn't animated (Darksteel Myr keeps 0/1) but gains the flying grant; the opponent's Sol Ring isn't animated", () => {
    const s = castAwakener(table(board()));
    expect({ myr: view(s, "myr"), aisol: view(s, "aisol") }).toEqual({ myr: { creature: true, pt: "0/1", flying: true }, aisol: { creature: false, pt: null, flying: false } });
  });
  it("⭐ until end of turn: after the cleanup they are noncreature artifacts again, and Bonesplitter stays unattached", () => {
    const s = castAwakener(table(board()));
    const e = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect({ sol: view(e, "sol"), copter: view(e, "copter"), bone: e.players.user.battlefield.find((p) => p.id === "bone")?.attachedTo ?? null }).toEqual({
      sol: { creature: false, pt: null, flying: false }, copter: { creature: false, pt: null, flying: true }, bone: null,
    });
  });
  it("⭐ the set is fixed as it resolves (CR 611.2c): a Sol Ring cast afterwards stays a noncreature artifact", () => {
    let s = castAwakener(table({ user: [on("user", "seat", SEAT)], hand: [{ ...SOL, id: "h-sol" }] }));
    s = settle(dispatchAction(s, legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-sol")));
    const newSol = s.players.user.battlefield.find((p) => p.card?.name === "Sol Ring");
    expect({ seat: view(s, "seat").creature, newSol: permanentIsCreature(s, newSol.id) }).toEqual({ seat: true, newSol: false });
  });
  it("⭐ an artifact you've controlled since the turn began can attack; one that entered this turn can't (CR 302.6)", () => {
    let s = castAwakener(table({ user: [on("user", "seat", SEAT), on("user", "sol", SOL, { enteredOnTurn: 5 })] }));
    s = { ...s, phase: "combat", step: "declare-attackers", priorityHolder: "user" };
    const attackers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    expect({ seat: attackers.includes("seat"), sol: attackers.includes("sol") }).toEqual({ seat: true, sol: false });
  });
});

describe("the fall-off under another animate (sba.js — CR 704.5p)", () => {
  it("⭐ Tough Cookie's {2}{G} on an attached Bonesplitter: it becomes a 4/4 and falls off the Bears", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 }, battlefield: [on("user", "cookie", COOKIE), on("user", "bears", BEARS, { attachments: ["bone"] }), on("user", "bone", BONESPLITTER, { attachedTo: "bears" })] } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cookie" && (a.targets || []).some((t) => t.id === "bone"));
    expect(act, "Tough Cookie's animate at Bonesplitter").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ bone: view(s, "bone").pt, attachedTo: s.players.user.battlefield.find((p) => p.id === "bone")?.attachedTo ?? null, bears: permanentPower(s, "bears") }).toEqual({ bone: "4/4", attachedTo: null, bears: 2 });
  });
});

describe("an attached creature falls off (CR 704.5p) — the review's F1 rows", () => {
  const blades = () => [on("user", "bears", BEARS, { attachments: ["lb"] }), on("user", "lb", BLADES, { attachedTo: "bears" })];
  const dbl = (s, id) => permanentHasKeyword(s, id, "Double strike");
  it("⛔ the control: an attached Lizard Blades with no animate stays attached and is no creature (CR 702.151b); the Bears have double strike", () => {
    const s = checkAllStateBasedActions(table({ user: blades() }));
    expect({ attachedTo: s.players.user.battlefield.find((p) => p.id === "lb")?.attachedTo ?? null, creature: permanentIsCreature(s, "lb"), dbl: dbl(s, "bears") }).toEqual({ attachedTo: "bears", creature: false, dbl: true });
  });
  it("⭐ Cyberdrive Awakener enters: the attached Lizard Blades (a noncreature artifact while attached) becomes a 4/4 creature and falls off — the Bears lose double strike", () => {
    const s = castAwakener(table({ user: blades() }));
    expect({ attachedTo: s.players.user.battlefield.find((p) => p.id === "lb")?.attachedTo ?? null, bears: s.players.user.battlefield.find((p) => p.id === "bears")?.attachments ?? [], lb: view(s, "lb"), dbl: dbl(s, "bears") })
      .toEqual({ attachedTo: null, bears: [], lb: { creature: true, pt: "4/4", flying: true }, dbl: false });
  });
  it("⭐ Tough Cookie's {2}{G} at the attached Lizard Blades: the same — it falls off, the Bears lose double strike", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players, user: { ...g.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 1, C: 2 }, battlefield: [on("user", "cookie", COOKIE), ...blades()] } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "cookie" && (a.targets || []).some((t) => t.id === "lb"));
    expect(act, "Tough Cookie's animate at Lizard Blades").toBeTruthy();
    s = settle(dispatchAction(s, act));
    expect({ attachedTo: s.players.user.battlefield.find((p) => p.id === "lb")?.attachedTo ?? null, lb: view(s, "lb").pt, dbl: dbl(s, "bears") }).toEqual({ attachedTo: null, lb: "4/4", dbl: false });
  });
  it("⭐ an Aura made a creature: Liquimetal Coating makes the person's Rancor an artifact, the Awakener animates it — it falls off and goes to the graveyard (CR 303.4d), and its trigger returns it to the hand; the Bears are 2/2 without trample", () => {
    let s = table({ user: [on("user", "bears", BEARS, { attachments: ["ran"] }), on("user", "ran", RANCOR, { attachedTo: "bears" }), on("user", "coat", COATING)] });
    const coat = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "coat" && (a.targets || []).some((t) => t.id === "ran"));
    expect(coat, "Liquimetal Coating at Rancor").toBeTruthy();
    s = settle(dispatchAction(s, coat));
    expect({ rancorAttached: s.players.user.battlefield.find((p) => p.id === "ran")?.attachedTo ?? null, bears: permanentPower(s, "bears") }).toEqual({ rancorAttached: "bears", bears: 4 }); // an artifact Aura, still on
    s = castAwakener(s);
    expect({ onBf: s.players.user.battlefield.some((p) => p.card?.name === "Rancor"), inHand: s.players.user.hand.some((c) => c.name === "Rancor"), bears: `${permanentPower(s, "bears")}/${permanentToughness(s, "bears")}`, trample: permanentHasKeyword(s, "bears", "Trample") })
      .toEqual({ onBf: false, inHand: true, bears: "2/2", trample: false });
  });
});
