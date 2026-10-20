/**
 * "PUT A -1/-1 COUNTER ON THIS CREATURE" AS A COST — Devoted Druid (EDHREC #967): "{T}: Add {G}. / Put a -1/-1 counter on this creature:
 * Untap this creature."; Cinderhaze Wretch and Barrenton Medic carry the same untap line; Sinking Feeling grants it ("Enchanted creature
 * has \"{1}, Put a -1/-1 counter on this creature: Untap this creature.\""). A cost is paid as the ability is activated (CR 601.2h via
 * 602.2b), so the counter is on the creature before the ability resolves, and a creature it takes to 0 toughness is put into its
 * owner's graveyard by the state-based action (CR 704.5f) before the untap — the bundled rulings: "You put the -1/-1 counter on Devoted
 * Druid as a cost to activate its ability, not when it resolves. If paying the cost causes Devoted Druid to have 0 toughness, it's put
 * into your graveyard before you can untap it and before you can even pay the cost again." The cost has no {T}, so a summoning-sick
 * Druid may pay it (CR 302.6 restricts only {T} / {Q} costs). The default AI never spends it: the counter only shrinks its creature.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creatureToughness, findPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseAbilityCost } from "./effects/abilities.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const DEVOTED_DRUID = {"name":"Devoted Druid","type":"Creature — Elf Druid","mana":"{1}{G}","cmc":2,"power":"0","toughness":"2","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}.\nPut a -1/-1 counter on this creature: Untap this creature."}; // body-only on 0fbdec14
const CINDERHAZE_WRETCH = {"name":"Cinderhaze Wretch","type":"Creature — Elemental Shaman","mana":"{4}{B}","cmc":5,"power":"3","toughness":"2","keywords":[],"colors":["B"],"oracle":"{T}: Target player discards a card. Activate only during your turn.\nPut a -1/-1 counter on this creature: Untap this creature."}; // body-only on 0fbdec14
const BARRENTON_MEDIC = {"name":"Barrenton Medic","type":"Creature — Kithkin Cleric","mana":"{4}{W}","cmc":5,"power":"0","toughness":"4","keywords":[],"colors":["W"],"oracle":"{T}: Prevent the next 1 damage that would be dealt to any target this turn.\nPut a -1/-1 counter on this creature: Untap this creature."}; // body-only on 0fbdec14
const SINKING_FEELING = {"name":"Sinking Feeling","type":"Enchantment — Aura","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nEnchanted creature has \"{1}, Put a -1/-1 counter on this creature: Untap this creature.\""}; // body-only on 0fbdec14
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller, o = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: !!o.sick, tapped: !!o.tapped }), counters: { ...(o.counters || {}) }, ...(o.extra || {}) });
function table({ user = [], ai1 = [], active = "user", mana = {} } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s0, turn: 4, activePlayer: active, priorityHolder: active, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(active === "user" ? mana : {}) } },
      ai1: { ...s0.players.ai1, battlefield: ai1, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...(active === "ai1" ? mana : {}) } } } };
}
const untapOffers = (s, pid, permId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "activate-ability" && a.permanentId === permId && a.putCounter);
const perm = (s, id) => findPermanent(s, id)?.permanent || null;
/** Pay the one offered put-counter activation of `permId` for `pid` — asserted offered first. */
function payUntap(s, pid, permId) {
  const offers = untapOffers(s, pid, permId);
  expect(offers.length, `the untap of ${permId} is offered to ${pid}`).toBe(1);
  return dispatchAction(s, offers[0]);
}

describe("the reader", () => {
  it("⭐ the three creatures and the Aura play their whole text", () => {
    expect({ druid: classifyCard(DEVOTED_DRUID), wretch: classifyCard(CINDERHAZE_WRETCH), medic: classifyCard(BARRENTON_MEDIC), feeling: classifyCard(SINKING_FEELING) })
      .toEqual({ druid: "native-mana", wretch: "native-activated", medic: "native-activated", feeling: "native-activated" });
  });

  it("⭐ the cost item: a -1/-1 counter on the source; another creature, another kind of counter or a +1/+1 counter stay unread", () => {
    const c = (s) => parseAbilityCost(s);
    expect({
      druid: c("Put a -1/-1 counter on this creature")?.putCounter ?? null,
      sinking: c("{1}, Put a -1/-1 counter on this creature")?.putCounter ?? null,
      another: c("Put a -1/-1 counter on a creature you control"),
      page: c("{T}, Put a page counter on this artifact"),
      plus: c("Put a +1/+1 counter on this creature"),
      two: c("Put two -1/-1 counters on this creature"),
    }).toEqual({ druid: { type: "-1/-1", count: 1 }, sinking: { type: "-1/-1", count: 1 }, another: null, page: null, plus: null, two: null });
  });
});

describe("Devoted Druid", () => {
  it("⭐ tapped: the untap is offered; paying puts the counter on it before the ability resolves (0/1 with the ability on the stack), and it resolves untapped", () => {
    const s0 = table({ user: [P("druid", DEVOTED_DRUID, "user", { tapped: true })] });
    const paid = payUntap(s0, "user", "druid");
    const s = resolveTopOfStack(paid);
    expect({
      onStack: paid.stack.length,
      counterAsPaid: perm(paid, "druid")?.counters?.["-1/-1"] ?? 0,
      tappedAsPaid: perm(paid, "druid")?.tapped,
      toughnessAsPaid: creatureToughness(perm(paid, "druid"), paid),
      tappedAfter: perm(s, "druid")?.tapped,
      counterAfter: perm(s, "druid")?.counters?.["-1/-1"] ?? 0,
    }).toEqual({ onStack: 1, counterAsPaid: 1, tappedAsPaid: true, toughnessAsPaid: 1, tappedAfter: false, counterAfter: 1 });
  });

  it("⭐ its ruling — the second counter takes it to 0 toughness: it is in the graveyard before the untap resolves, and the ability then does nothing", () => {
    const s0 = table({ user: [P("druid", DEVOTED_DRUID, "user", { tapped: true, counters: { "-1/-1": 1 } })] });
    const paid = payUntap(s0, "user", "druid");
    const s = resolveTopOfStack(paid);
    expect({
      onBattlefieldAsPaid: !!perm(paid, "druid"),
      graveyardAsPaid: paid.players.user.graveyard.map((c) => c.id),
      onStack: paid.stack.length,
      afterStack: s.stack.length,
      graveyardAfter: s.players.user.graveyard.map((c) => c.id),
    }).toEqual({ onBattlefieldAsPaid: false, graveyardAsPaid: ["c-druid"], onStack: 1, afterStack: 0, graveyardAfter: ["c-druid"] });
  });

  it("⭐ no {T} in the cost: a summoning-sick Druid may pay it; an opponent may not activate it", () => {
    const s0 = table({ user: [P("druid", DEVOTED_DRUID, "user", { tapped: true, sick: true })] });
    expect({ sick: untapOffers(s0, "user", "druid").length, opponent: untapOffers({ ...s0, priorityHolder: "ai1" }, "ai1", "druid").length })
      .toEqual({ sick: 1, opponent: 0 });
  });

  it("⭐ the default AI never spends the counter on an ability it would otherwise take: a {1} draw paid with a -1/-1 counter is offered, and it passes", () => {
    // A synthetic shape, not a printed card: "draw a card" is an op the AI's untargeted picker takes for a mana cost, so the cost is
    // the only thing holding this activation back — the gate under test.
    const PROBE = { name: "Probe Diviner", type: "Creature — Human Wizard", mana: "{2}{U}", cmc: 3, power: "1", toughness: "3", keywords: [], colors: ["U"], oracle: "{1}, Put a -1/-1 counter on this creature: Draw a card." };
    const s0 = table({ ai1: [P("probe", PROBE, "ai1")], active: "ai1", mana: { C: 1 } });
    const actions = legalActionsForPlayer(s0, "ai1");
    const pick = pickAction(s0, "ai1", actions);
    expect({ offered: actions.filter((a) => a.putCounter).length, pick: pick?.kind }).toEqual({ offered: 1, pick: "pass-priority" });
  });

  it("⭐ the default AI never spends the counter: with its own Druid tapped and nothing else to do, it passes", () => {
    const s0 = table({ ai1: [P("druid", DEVOTED_DRUID, "ai1", { tapped: true })], active: "ai1" });
    const actions = legalActionsForPlayer(s0, "ai1");
    const pick = pickAction(s0, "ai1", actions);
    expect({ offered: actions.filter((a) => a.putCounter).length, pick: pick?.kind }).toEqual({ offered: 1, pick: "pass-priority" });
  });
});

describe("the twins", () => {
  it("⭐ Barrenton Medic, tapped: the untap costs a -1/-1 counter (0/3) and untaps it", () => {
    const s0 = table({ user: [P("medic", BARRENTON_MEDIC, "user", { tapped: true })] });
    const s = resolveTopOfStack(payUntap(s0, "user", "medic"));
    expect({ tapped: perm(s, "medic")?.tapped, toughness: creatureToughness(perm(s, "medic"), s) }).toEqual({ tapped: false, toughness: 3 });
  });

  it("⭐ Sinking Feeling: the enchanted creature's controller pays {1} and a -1/-1 counter ON THAT CREATURE to untap it; the Aura's controller is offered nothing", () => {
    const bears = P("bears", GRIZZLY_BEARS, "ai1", { tapped: true, extra: { attachments: ["feel"] } });
    const feeling = P("feel", SINKING_FEELING, "user", { extra: { attachedTo: "bears" } });
    const s0 = table({ user: [feeling], ai1: [bears], active: "ai1", mana: { C: 1 } });
    const offers = untapOffers(s0, "ai1", "bears");
    const paid = payUntap(s0, "ai1", "bears");
    const s = resolveTopOfStack(paid);
    expect({
      offers: offers.length,
      generic: offers[0]?.cost?.generic ?? null,
      auraOwnerOffers: legalActionsForPlayer({ ...s0, activePlayer: "user", priorityHolder: "user" }, "user").filter((a) => a.putCounter).length,
      counterAsPaid: perm(paid, "bears")?.counters?.["-1/-1"] ?? 0,
      tappedAfter: perm(s, "bears")?.tapped,
      toughnessAfter: creatureToughness(perm(s, "bears"), s),
    }).toEqual({ offers: 1, generic: 1, auraOwnerOffers: 0, counterAsPaid: 1, tappedAfter: false, toughnessAfter: 1 });
  });
});
