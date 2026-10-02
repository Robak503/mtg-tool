/**
 * backgroundOwnerScope.test.js — "Commander creatures you OWN" scopes by owner, not controller (CR 108.3, 110.2).
 *
 * THE BUG. The commander-qualified group selector mapped both printed scopes — the Background cycle's "Commander creatures you
 * own have …" and Bastion Protector's "Commander creatures you control get …" — to controllerScope "you", on the documented
 * invariant that the engine had no native control-changing effect, so controller WAS owner. Native theft has since shipped
 * (Act of Treason, Control Magic; ownership is recorded through a control change since the 10-02 owner fix), so the two
 * differ: a commander an opponent stole took the THIEF's Backgrounds (the thief was offered Clan Crafter's granted
 * activation on someone else's commander) and lost its owner's (Flaming Fist's attack trigger stopped firing).
 *
 * THE FIX. "you own" parses to ownerScope "you": the candidate's effective owner (`owner ?? controller` — the engine stamps
 * `owner` only where it differs from the controller) must be the static's controller, on any battlefield. "you control" keeps
 * controllerScope "you".
 *
 * Every steal goes through a real Act of Treason cast (legal action → dispatch → resolve). Real oracle fixtures, generated
 * from the bundled Scryfall data; the trailing comment on each is its tier.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, creaturePower, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { checkAttackTriggers } from "./triggers.js";
import { permanentHasKeyword } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall data) ──────────────────────────────────────────────────────────────
const CLAN_CRAFTER = {"name":"Clan Crafter","type":"Legendary Enchantment — Background","mana":"{1}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Commander creatures you own have \"{2}, Sacrifice an artifact: Put a +1/+1 counter on this creature and draw a card.\""}; // native-static
const FLAMING_FIST = {"name":"Flaming Fist","type":"Legendary Enchantment — Background","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Commander creatures you own have \"Whenever this creature attacks, it gains double strike until end of turn.\""}; // native-static
const BASTION_PROTECTOR = {"name":"Bastion Protector","type":"Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["W"],"oracle":"Commander creatures you control get +2/+2 and have indestructible."}; // native-static
const ACT_OF_TREASON = {"name":"Act of Treason","type":"Sorcery","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Gain control of target creature until end of turn. Untap that creature. It gains haste until end of turn. (It can attack and {T} this turn.)"}; // native-spell
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"}; // native-body
const FALTHIS = {"name":"Falthis, Shadowcat Familiar","type":"Legendary Creature — Nightmare Cat","mana":"{2}{B}","cmc":3,"power":"2","toughness":"2","keywords":["Partner"],"colors":["B"],"oracle":"Commanders you control have menace and deathtouch.\nPartner (You can have two commanders if both have partner.)"}; // native-static

// ── harness ──────────────────────────────────────────────────────────────────────────
const P = (id, controller, card, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), enteredOnTurn: 1, ...over });
// The AI's commander: "commander" is a game-state designation (card.isCommander, stamped at seat build), not card text.
const AI_COMMANDER = () => P("cmdr", "ai", { ...ISAMARU, isCommander: true });
const POOL = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 };

/** A two-seat board in the user's precombat main phase; the user holds Act of Treason and plenty of mana. */
function board({ user = [], ai = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand: [{ id: "aot", ...ACT_OF_TREASON }], manaPool: { ...s.players.user.manaPool, ...POOL }, library: [{ id: "ul0", name: "Top Card" }] },
      ai: { ...s.players.ai, battlefield: ai, manaPool: { ...s.players.ai.manaPool, ...POOL } } } };
}
/** The user takes the AI's commander with a real Act of Treason cast, resolved off the stack. */
function steal(s) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "aot" && (x.targets || []).some((t) => t.id === "cmdr"));
  if (!a) throw new Error("no Act of Treason cast at the commander");
  const out = resolveTopOfStack(dispatchAction(s, a));
  expect(out.players.user.battlefield.some((p) => p.id === "cmdr")).toBe(true); // the steal really happened
  return out;
}
const granted = (s, pid) => legalActionsForPlayer(s, pid).filter((x) => x.kind === "activate-ability" && x.permanentId === "cmdr");

describe("parse — own and control are different scopes", () => {
  it("'Commander creatures you own have …' → ownerScope; 'Commander creatures you control get …' → controllerScope", () => {
    const own = parseStaticAbilities(CLAN_CRAFTER);
    expect(own.length).toBeGreaterThanOrEqual(1);
    for (const d of own) {
      expect(d.affects.selector).toMatchObject({ ownerScope: "you", cardTypes: ["Creature"], commanderOnly: true });
      expect(d.affects.selector.controllerScope).toBeUndefined();
    }
    const control = parseStaticAbilities(BASTION_PROTECTOR);
    expect(control.length).toBeGreaterThanOrEqual(1);
    for (const d of control) {
      expect(d.affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], commanderOnly: true });
      expect(d.affects.selector.ownerScope).toBeUndefined();
    }
  });
  it("the bare 'Commanders you control have …' (Falthis) → controllerScope, no creature restriction", () => {
    const d = parseStaticAbilities(FALTHIS);
    expect(d.length).toBeGreaterThanOrEqual(1);
    for (const desc of d) expect(desc.affects.selector).toEqual({ controllerScope: "you", cardTypes: [], commanderOnly: true });
  });
  it("SYNTHETIC (labelled — no real card reaches this branch today: Disguise Agent's \"Commanders you own have disguise\" parses nothing, disguise is unmodeled) — the bare 'Commanders you own have …' → ownerScope, never controllerScope (a false-positive guard)", () => {
    const d = parseStaticAbilities({ name: "Synthetic Owner Grant", type: "Enchantment", oracle: "Commanders you own have hexproof." });
    expect(d).toHaveLength(1);
    expect(d[0].affects.selector).toEqual({ ownerScope: "you", cardTypes: [], commanderOnly: true });
  });
});

describe("runtime — a stolen commander keeps its owner's Backgrounds and never takes the thief's", () => {
  it("⭐ the THIEF's Clan Crafter grants nothing to the stolen commander (the thief is never offered the activation)", () => {
    const s = steal(board({ user: [P("cc", "user", CLAN_CRAFTER), P("orn", "user", ORNITHOPTER)], ai: [AI_COMMANDER()] }));
    expect(granted(s, "user")).toEqual([]);
  });

  it("the OWNER's Clan Crafter still grants it: offered to its owner while the owner controls it", () => {
    const s = board({ ai: [P("cc", "ai", CLAN_CRAFTER), P("orn", "ai", ORNITHOPTER), AI_COMMANDER()] });
    expect(granted({ ...s, activePlayer: "ai", priorityHolder: "ai" }, "ai")).toHaveLength(1);
  });

  it("⭐ the OWNER's Flaming Fist still grants its attack trigger to the commander the thief attacks with", () => {
    const stolen = steal(board({ ai: [P("ff", "ai", FLAMING_FIST), AI_COMMANDER()] }));
    const attacking = { ...stolen, phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "cmdr", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const fired = checkAttackTriggers(attacking);
    expect((fired.pendingTriggers || []).length).toBe(1);
    const resolved = resolveTopOfStack(flushTriggers(fired));
    expect(permanentHasKeyword(resolved, "cmdr", "Double strike")).toBe(true);
  });

  it("the THIEF's Flaming Fist grants no attack trigger to the stolen commander", () => {
    const stolen = steal(board({ user: [P("ff", "user", FLAMING_FIST)], ai: [AI_COMMANDER()] }));
    const attacking = { ...stolen, phase: "combat", step: "declare-attackers",
      combat: { attackers: [{ permanentId: "cmdr", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    expect((checkAttackTriggers(attacking).pendingTriggers || []).length).toBe(0);
  });

  it("'you control' still follows control: the thief's Bastion Protector pumps the stolen commander, the owner's does not", () => {
    const before = board({ user: [P("bp", "user", BASTION_PROTECTOR)], ai: [AI_COMMANDER()] });
    const cmdrBefore = before.players.ai.battlefield.find((p) => p.id === "cmdr");
    expect(creaturePower(cmdrBefore, before)).toBe(2);           // the user's Bastion doesn't reach the AI's commander
    const s = steal(before);
    const cmdr = s.players.user.battlefield.find((p) => p.id === "cmdr");
    expect(creaturePower(cmdr, s)).toBe(4);                      // under the user's control it gets +2/+2
    expect(permanentHasKeyword(s, "cmdr", "Indestructible")).toBe(true);
    const owners = steal(board({ ai: [P("bp", "ai", BASTION_PROTECTOR), AI_COMMANDER()] }));
    expect(creaturePower(owners.players.user.battlefield.find((p) => p.id === "cmdr"), owners)).toBe(2); // the owner's no longer does
  });
});
