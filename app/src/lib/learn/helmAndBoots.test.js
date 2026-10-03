/**
 * helmAndBoots.test.js — CHAMPION'S HELM (play-weighted #740) and TRAILBLAZER'S BOOTS (#656), and the three cards the same two
 * mechanisms cover: Gimli's Axe, Hero's Heirloom, Dryad Sophisticate.
 *
 * CHAMPION'S HELM — "As long as equipped creature is legendary, it has hexproof." A fifth attached-bonus condition kind,
 * `hostIsLegendary`: staticAbilityParser.parseAttachedBonus stamps it on the keyword grant and layers.gateMet reads the HOST's
 * current supertype (CR 205.4a) — effectiveTypeIdentity (the read matchesSelector's `legendary` filter makes) over the host's
 * copiable values (CR 613.1a), so a legend that became a copy of a nonlegendary creature loses the grant until the copy ends.
 * Hexproof itself is the existing targeting seam (spellEffects.canBeTargetedBy, CR 702.11b): no spell or ability an opponent
 * controls may target the creature; its controller's own may. KEYWORD grants only — Combat Research's "+1/+1 and ward {1}"
 * under the same condition is not read by the arm and stays body-only.
 *
 * TRAILBLAZER'S BOOTS — "Equipped creature has nonbasic landwalk." CR 702.14c: a creature with landwalk can't be blocked as
 * long as the DEFENDING player controls at least one land "without the specified type or supertype (as in 'nonbasic
 * landwalk')"; CR 205.4c: a land without the basic supertype is nonbasic "even if it has a basic land type". The keyword joins
 * the grantable set and combatEvasion.canBlockAttacker gates it beside the five basic landwalks, layer-aware (printed on Dryad
 * Sophisticate or granted by the Boots). The land read is the permanent's current characteristics: Thespian's Stage as a copy
 * of a basic Forest is a basic land (CR 707.2).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, generated 2026-10-03; the trailing comment is the tier at
 * generation). Every runtime case runs through the engine's own entry points: legalActionsForPlayer offers the equip, the
 * casts, the attacks and the blocks, dispatchAction applies them, resolveTopOfStack resolves the stack, passPriority walks the
 * steps. The two cases marked SYNTHETIC are false-positive guards no printed card reaches.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEquipmentBonus, parseAuraBonus } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, passPriority, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentTypes } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const HELM = {"name":"Champion's Helm","type":"Artifact — Equipment","mana":"{3}","cmc":3,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has hexproof. (It can't be the target of spells or abilities your opponents control.)\nEquip {1}"}; // native-equipment
const BOOTS = {"name":"Trailblazer's Boots","type":"Artifact — Equipment","mana":"{2}","cmc":2,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature has nonbasic landwalk. (It can't be blocked as long as defending player controls a nonbasic land.)\nEquip {2}"}; // native-equipment
const AXE = {"name":"Gimli's Axe","type":"Artifact — Equipment","mana":"{2}{R}","cmc":3,"keywords":["Equip"],"colors":["R"],"oracle":"Equipped creature gets +3/+0.\nAs long as equipped creature is legendary, it has menace. (It can't be blocked except by two or more creatures.)\nEquip {2} ({2}: Attach to target creature you control. Equip only as a sorcery.)"}; // native-equipment
const HEIRLOOM = {"name":"Hero's Heirloom","type":"Artifact — Equipment","mana":"{2}","cmc":2,"keywords":["Equip"],"colors":[],"oracle":"Equipped creature gets +2/+1.\nAs long as equipped creature is legendary, it has trample and haste.\nEquip {2}"}; // native-equipment
const RESEARCH = {"name":"Combat Research","type":"Enchantment — Aura","mana":"{U}","cmc":1,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature has \"Whenever this creature deals combat damage to a player, draw a card.\"\nAs long as enchanted creature is legendary, it gets +1/+1 and has ward {1}. (Whenever enchanted creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)"}; // body-only
const SOPHISTICATE = {"name":"Dryad Sophisticate","type":"Creature — Dryad","mana":"{1}{G}","cmc":2,"power":"2","toughness":"1","keywords":["Landwalk","Nonbasic landwalk"],"colors":["G"],"oracle":"Nonbasic landwalk (This creature can't be blocked as long as defending player controls a nonbasic land.)"}; // native-body
const ONE_DOES_NOT = {"name":"One Does Not","type":"Enchantment — Aura","mana":"{1}{U}","cmc":2,"keywords":["Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature does not simply untap during its controller's untap step.\nEnchanted creature has nonbasic landwalk. (It can't simply be blocked as long as defending player controls a nonbasic land.)"}; // body-only
const ISAMARU = {"name":"Isamaru, Hound of Konda","type":"Legendary Creature — Dog","mana":"{W}","cmc":1,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const MURDER = {"name":"Murder","type":"Instant","mana":"{1}{B}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"Destroy target creature."}; // native-spell
const PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"{T}: This creature deals 1 damage to any target."}; // native-activated
const GROWTH = {"name":"Giant Growth","type":"Instant","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"Target creature gets +3/+3 until end of turn."}; // native-spell
const IMPOSSIBLE_MAN = {"name":"Impossible Man","type":"Legendary Creature — Alien Shapeshifter","mana":"{2}{U}","cmc":3,"power":"1","toughness":"4","keywords":["Flying"],"colors":["U"],"oracle":"Flying\n{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man."}; // native-activated
const PHOTOGRAPHY = {"name":"Flash Photography","type":"Sorcery","mana":"{2}{U}{U}","cmc":4,"keywords":["Flashback"],"colors":["U"],"oracle":"You may cast this spell as though it had flash if it targets a permanent you control.\nCreate a token that's a copy of target permanent.\nFlashback {4}{U}{U}"}; // native-spell
const MISALIGNMENT = {"name":"Quantum Misalignment","type":"Sorcery","mana":"{4}{U}","cmc":5,"keywords":["Rebound"],"colors":["U"],"oracle":"Create a token that's a copy of target creature you control, except it isn't legendary.\nRebound (If you cast this spell from your hand, exile it as it resolves. At the beginning of your next upkeep, you may cast this card from exile without paying its mana cost.)"}; // native-spell
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"}; // land
const SNOW_FOREST = {"name":"Snow-Covered Forest","type":"Basic Snow Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const TOWER = {"name":"Command Tower","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add one mana of any color in your commander's color identity."}; // land
const POOL = {"name":"Breeding Pool","type":"Land — Forest Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G} or {U}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped."}; // land
const ARBOR = {"name":"Dryad Arbor","type":"Land Creature — Forest Dryad","mana":"","cmc":0,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"(This land isn't a spell, it's affected by summoning sickness, and it has \"{T}: Add {G}.\")"}; // land
const STAGE = {"name":"Thespian's Stage","type":"Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{2}, {T}: This land becomes a copy of target land, except it has this ability."}; // land
const MAMMOTH = {"name":"Kazandu Mammoth // Kazandu Valley","type":"Creature — Elephant // Land","mana":"{1}{G}{G}","cmc":3,"power":"3","toughness":"3","keywords":["Landfall"],"layout":"modal_dfc","colors":[],"oracle":"Kazandu Mammoth - Creature — Elephant {1}{G}{G}\nLandfall — Whenever a land you control enters, this creature gets +2/+2 until end of turn.\n//\nKazandu Valley - Land \nThis land enters tapped.\n{T}: Add {G}."}; // native-trigger
const CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","cmc":4,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":"When this creature enters, destroy target creature an opponent controls."}; // native-trigger
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."}; // native-aura

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const G = (id, card) => ({ id, ...card });
const FULL = { W: 6, U: 6, B: 6, R: 6, G: 6, C: 6 };
const LIB = (pid) => [1, 2, 3, 4].map((i) => G(`${pid}-lib${i}`, BEARS));

/** A two-seat game in the user's precombat main phase, the stack empty, both mana pools full. */
function board({ user = [], ai = [], hand = [], aiHand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...FULL }, library: LIB("user") },
      ai: { ...s.players.ai, battlefield: ai, hand: aiHand, manaPool: { ...s.players.ai.manaPool, ...FULL }, library: LIB("ai") } } };
}
/** A four-seat pod (user → ai1 → ai2 → ai3) in the user's precombat main phase; `boards` gives each seat's permanents. */
function pod(boards = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = {};
  for (const pid of Object.keys(s.players)) {
    players[pid] = { ...s.players[pid], battlefield: boards[pid] || [], library: LIB(pid), manaPool: { ...s.players[pid].manaPool, ...FULL } };
  }
  return { ...s, players, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [] };
}
const withPriority = (s, pid) => ({ ...s, priorityHolder: pid });
const findPerm = (s, id) => Object.values(s.players).flatMap((pl) => pl.battlefield).find((p) => p.id === id);
const pt = (s, id) => { const p = findPerm(s, id); return `${creaturePower(p, s)}/${creatureToughness(p, s)}`; };
const resolveAll = (s0) => { let s = s0; for (let i = 0; i < 20 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s); return s; };
const targetsOf = (actions) => [...new Set(actions.flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
const castActions = (s, pid, cardId) => legalActionsForPlayer(withPriority(s, pid), pid).filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const abilityActions = (s, pid, permId) => legalActionsForPlayer(withPriority(s, pid), pid).filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
/** The permanents `pid` may aim `cardId` (a spell in hand) at, as the cast offer lists them. */
const castTargets = (s, pid, cardId) => targetsOf(castActions(s, pid, cardId));
/** Cast `cardId` from `pid`'s hand through the offered action aimed at `targetId`, then resolve the stack. */
function cast(s, pid, cardId, targetId) {
  const action = castActions(s, pid, cardId).find((a) => a.targets?.[0]?.id === targetId);
  if (!action) throw new Error(`no cast action offered to ${pid} for ${cardId} → ${targetId}`);
  return withPriority(resolveAll(dispatchAction(withPriority(s, pid), action)), "user");
}
/** Activate `pid`'s permanent `permId` through the offered action aimed at `targetId`, then resolve the stack. */
function activate(s, pid, permId, targetId) {
  const action = abilityActions(s, pid, permId).find((a) => a.targets?.[0]?.id === targetId);
  if (!action) throw new Error(`no activation offered to ${pid} for ${permId} → ${targetId}`);
  return withPriority(resolveAll(dispatchAction(withPriority(s, pid), action)), "user");
}
/** The creatures the user's Equipment `equipId` may be attached to, as the equip offer lists them. */
const equipTargets = (s, equipId) => targetsOf(abilityActions(s, "user", equipId).filter((a) => a.isEquipAbility));
/** Pass priority until the game reaches `step` (a full lap of passes with an empty stack advances the step). */
function toStep(s, step) {
  let g = 0;
  while (s.step !== step && g++ < 200) s = passPriority(s);
  if (s.step !== step) throw new Error(`never reached ${step} (at ${s.phase}/${s.step})`);
  return s;
}
/** From the user's main phase: walk to declare attackers, declare each [attackerId, defenderId] through the offered actions,
 *  and walk on to the declare-blockers step. A two-seat game offers the attack without a defenderId. */
function attack(s0, picks) {
  let s = toStep(s0, "declare-attackers");
  for (const [id, def] of picks) {
    const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === id && (a.defenderId ?? def) === def);
    if (!action) throw new Error(`no declare-attacker action offered for ${id} → ${def}`);
    s = dispatchAction(s, action);
  }
  return toStep(s, "declare-blockers");
}
/** The attackers `pid` is offered a block on, at the declare-blockers step. */
const blockable = (s, pid) => [...new Set(legalActionsForPlayer(s, pid).filter((a) => a.kind === "declare-blocker").map((a) => a.attackerId))].sort();
const lifeOf = (s) => Object.fromEntries(Object.entries(s.players).map(([pid, pl]) => [pid, pl.life]));

// ════════════════════════════════════════════ CHAMPION'S HELM ════════════════════════════════════════════

describe("parse + classify — the legendary-host condition", () => {
  it("⭐ Champion's Helm: +2/+2, and hexproof under the hostIsLegendary gate; native-equipment", () => {
    const row = { tier: classifyCard(HELM), bonus: parseEquipmentBonus(HELM) };
    console.log("  WITNESS helmParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ tier: "native-equipment", bonus: [
      { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 }, duration: { kind: "permanent" } },
      { layer: 6, op: { layerOp: "addKeyword", keyword: "hexproof", gate: { kind: "hostIsLegendary" } }, duration: { kind: "permanent" } },
    ] });
  });

  it("Gimli's Axe (menace) and Hero's Heirloom (trample and haste) ride the same gate; every keyword of a list is gated", () => {
    const gated = (card) => parseEquipmentBonus(card).filter((d) => d.layer === 6).map((d) => [d.op.keyword, d.op.gate]);
    expect(gated(AXE)).toEqual([["Menace", { kind: "hostIsLegendary" }]]);
    expect(gated(HEIRLOOM)).toEqual([["Trample", { kind: "hostIsLegendary" }], ["Haste", { kind: "hostIsLegendary" }]]);
    expect([classifyCard(AXE), classifyCard(HEIRLOOM)]).toEqual(["native-equipment", "native-equipment"]);
  });

  it("⛔ Combat Research (\"… is legendary, it gets +1/+1 and has ward {1}\") stays residue: no gated P/T twin, no gated ward", () => {
    expect(parseAuraBonus(RESEARCH)).toEqual([]);
    expect(classifyCard(RESEARCH)).toBe("body-only");
  });

  it("⛔ SYNTHETIC — a ward or protection grant under the legendary condition is refused (a granted ward takes no gate)", () => {
    const withTail = (tail) => ({ ...HELM, name: "Synthetic Helm", oracle: `Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has ${tail}.\nEquip {1}` });
    // Positive control: unconditional, each tail parses to its own op.
    const plain = (tail) => parseEquipmentBonus({ ...HELM, name: "Synthetic Helm", oracle: `Equipped creature has ${tail}.\nEquip {1}` }).map((d) => d.op.layerOp);
    expect([plain("ward {1}"), plain("protection from red")]).toEqual([["addWard"], ["addProtection"]]);
    for (const tail of ["ward {1}", "protection from red"]) {
      expect(parseEquipmentBonus(withTail(tail)), tail).toEqual([]);
      expect(classifyCard(withTail(tail)), tail).toBe("body-only");
    }
  });

  it("⛔ SYNTHETIC — a grant that already carries a condition is refused (the legendary gate would overwrite it)", () => {
    const twice = { ...HELM, name: "Synthetic Twice-Conditional Helm",
      oracle: "Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has hexproof as long as you control an artifact.\nEquip {1}" };
    // Positive control: without the legendary condition the inner grant parses, with its own gate.
    const inner = parseEquipmentBonus({ ...twice, oracle: "Equipped creature has hexproof as long as you control an artifact.\nEquip {1}" });
    expect(inner.map((d) => !!d.op.gate)).toEqual([true]);
    expect(parseEquipmentBonus(twice)).toEqual([]);
    expect(classifyCard(twice)).toBe("body-only");
  });

  it("SYNTHETIC — the conditional line alone is still a bonus (every printed carrier also has an unconditional line)", () => {
    const only = { ...HELM, name: "Synthetic Bare Helm", oracle: "As long as equipped creature is legendary, it has hexproof.\nEquip {1}" };
    expect(parseEquipmentBonus(only).map((d) => [d.op.keyword, d.op.gate.kind])).toEqual([["hexproof", "hostIsLegendary"]]);
  });

  it("⛔ SYNTHETIC — a keyword the engine does not grant under the legendary condition drops the whole bonus", () => {
    const toxic = { ...HELM, name: "Synthetic Toxic Helm",
      oracle: "Equipped creature gets +2/+2.\nAs long as equipped creature is legendary, it has toxic 1.\nEquip {1}" };
    expect(parseEquipmentBonus(toxic)).toEqual([]);
    expect(classifyCard(toxic)).toBe("body-only");
  });
});

describe("RUNTIME — Champion's Helm: hexproof only on a legendary host, only against opponents", () => {
  const start = () => board({
    user: [P("isamaru", ISAMARU, "user"), P("bears", BEARS, "user"), P("helm", HELM, "user")],
    ai: [P("pyro", PYROMANCER, "ai")],
    hand: [G("growth", GROWTH)], aiHand: [G("murder", MURDER), G("murder2", MURDER)],
  });
  const mine = (ids) => ids.filter((id) => id === "isamaru" || id === "bears");
  // The engine offers a player's activated abilities on that player's own turn, so the Pyromancer is read there.
  const pyroTargets = (s) => mine(targetsOf(abilityActions({ ...s, activePlayer: "ai" }, "ai", "pyro")));

  it("VACUITY CONTROL — unattached, the Helm grants nothing: the opponent's Murder and Prodigal Pyromancer reach both creatures", () => {
    const s = start();
    expect(mine(castTargets(s, "ai", "murder"))).toEqual(["bears", "isamaru"]);
    expect(pyroTargets(s)).toEqual(["bears", "isamaru"]);
    expect([pt(s, "isamaru"), permanentHasKeyword(s, "isamaru", "hexproof")]).toEqual(["2/2", false]);
  });

  it("⭐ on Isamaru (legendary): 4/4 with hexproof — no opposing spell or ability may target it; its controller's Giant Growth does", () => {
    const s = activate(start(), "user", "helm", "isamaru");
    const row = {
      attachedTo: findPerm(s, "helm").attachedTo, pt: pt(s, "isamaru"), hexproof: permanentHasKeyword(s, "isamaru", "hexproof"),
      murder: mine(castTargets(s, "ai", "murder")), pyromancer: pyroTargets(s),
      ownGrowth: mine(castTargets(s, "user", "growth")), ownEquip: equipTargets(s, "helm"),
    };
    console.log("  WITNESS helmOnLegend", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ attachedTo: "isamaru", pt: "4/4", hexproof: true, murder: ["bears"], pyromancer: ["bears"],
      ownGrowth: ["bears", "isamaru"], ownEquip: ["bears", "isamaru"] });
    // The controller's own spell resolves on the hexproof creature (the Equip offer above is the controller's own ability).
    expect(pt(cast(s, "user", "growth", "isamaru"), "isamaru")).toBe("7/7");
  });

  it("⭐ an opposing Aura and an opposing triggered ability can't target the helmed legend either (Pacifism, Ravenous Chupacabra)", () => {
    // The opponent's own main phase. With the Bears beside it, Chupacabra's enters trigger has one legal target, the Bears.
    const theirTurn = (user) => ({ ...board({ user, aiHand: [G("chupa", CHUPACABRA), G("pacifism", PACIFISM)] }), activePlayer: "ai", priorityHolder: "ai" });
    const helmed = [P("isamaru", ISAMARU, "user", { attachments: ["helm"] }), P("helm", HELM, "user", { attachedTo: "isamaru" })];
    const both = theirTurn([...helmed, P("bears", BEARS, "user")]);
    expect(castTargets(both, "ai", "pacifism")).toEqual(["bears"]);
    const cast1 = resolveAll(dispatchAction(both, legalActionsForPlayer(both, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "chupa")));
    // Alone, the helmed legend leaves the trigger without a legal target: nothing is destroyed.
    const alone = theirTurn(helmed);
    const cast2 = resolveAll(dispatchAction(alone, legalActionsForPlayer(alone, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "chupa")));
    const survivors = (s) => s.players.user.battlefield.filter((p) => /Creature/.test(p.card.type)).map((p) => p.id);
    const row = { withBears: { survivors: survivors(cast1), graveyard: cast1.players.user.graveyard.map((c) => c.name), pending: !!cast1.pendingChoice },
      alone: { survivors: survivors(cast2), graveyard: cast2.players.user.graveyard.map((c) => c.name), pending: !!cast2.pendingChoice, stack: cast2.stack.length },
      chupacabras: [cast1, cast2].map((s) => s.players.ai.battlefield.map((p) => p.card.name)) };
    console.log("  WITNESS helmVsTrigger", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ withBears: { survivors: ["isamaru"], graveyard: ["Grizzly Bears"], pending: false },
      alone: { survivors: ["isamaru"], graveyard: [], pending: false, stack: 0 },
      chupacabras: [["Ravenous Chupacabra"], ["Ravenous Chupacabra"]] });
    // Positive control: without the Helm the same trigger reaches Isamaru.
    const bare = theirTurn([P("isamaru", ISAMARU, "user")]);
    const cast3 = resolveAll(dispatchAction(bare, legalActionsForPlayer(bare, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "chupa")));
    expect([survivors(cast3), cast3.players.user.graveyard.map((c) => c.name)]).toEqual([[], ["Isamaru, Hound of Konda"]]);
  });

  it("⭐ on Grizzly Bears (not legendary): the +2/+2 only — the opponent's Murder is offered the Bears and destroys it", () => {
    const s = activate(start(), "user", "helm", "bears");
    expect([pt(s, "bears"), permanentHasKeyword(s, "bears", "hexproof")]).toEqual(["4/4", false]);
    expect(mine(castTargets(s, "ai", "murder"))).toEqual(["bears", "isamaru"]);
    expect(pyroTargets(s)).toEqual(["bears", "isamaru"]);
    const after = cast(s, "ai", "murder", "bears");
    expect([!!findPerm(after, "bears"), after.players.user.graveyard.map((c) => c.name)]).toEqual([false, ["Grizzly Bears"]]);
  });

  it("⭐ moved, unequipped, re-equipped: the hexproof follows the Helm and the host it is on", () => {
    const onDog = activate(start(), "user", "helm", "isamaru");
    const onBears = activate(onDog, "user", "helm", "bears"); // moved: the legend loses it, the Bears never gets it
    const moved = { helm: findPerm(onBears, "helm").attachedTo, dog: [pt(onBears, "isamaru"), permanentHasKeyword(onBears, "isamaru", "hexproof")],
      bears: [pt(onBears, "bears"), permanentHasKeyword(onBears, "bears", "hexproof")], murder: mine(castTargets(onBears, "ai", "murder")) };
    const bare = cast(onBears, "ai", "murder", "bears"); // the host dies: the Helm stays, attached to nothing
    const unequipped = { helm: findPerm(bare, "helm").attachedTo, dog: [pt(bare, "isamaru"), permanentHasKeyword(bare, "isamaru", "hexproof")],
      murder: mine(castTargets(bare, "ai", "murder2")) };
    const back = activate(bare, "user", "helm", "isamaru"); // re-equipped
    const again = { helm: findPerm(back, "helm").attachedTo, dog: [pt(back, "isamaru"), permanentHasKeyword(back, "isamaru", "hexproof")],
      murder: mine(castTargets(back, "ai", "murder2")) };
    console.log("  WITNESS helmMoved", JSON.stringify({ moved, unequipped, again })); // vitest 4 needs --disable-console-intercept
    expect(moved).toEqual({ helm: "bears", dog: ["2/2", false], bears: ["4/4", false], murder: ["bears", "isamaru"] });
    expect(unequipped).toEqual({ helm: null, dog: ["2/2", false], murder: ["isamaru"] });
    expect(again).toEqual({ helm: "isamaru", dog: ["4/4", true], murder: [] });
  });
});

describe("RUNTIME — the condition reads what the host is NOW (CR 611.3a, 613.1a)", () => {
  it("⭐ Impossible Man (legendary) as a copy of Grizzly Bears is not legendary: the hexproof is gone until the copy ends", () => {
    // A second Helm sits on Isamaru throughout: another permanent's copy effect is not Isamaru's, and its hexproof never moves.
    const s0 = board({ user: [P("im", IMPOSSIBLE_MAN, "user", { attachments: ["helm"] }), P("bears", BEARS, "user"), P("helm", HELM, "user", { attachedTo: "im" }),
      P("isamaru", ISAMARU, "user", { attachments: ["helm2"] }), P("helm2", HELM, "user", { attachedTo: "isamaru" })],
    aiHand: [G("murder", MURDER)] });
    const before = { types: permanentTypes(s0, "im").types, hexproof: permanentHasKeyword(s0, "im", "hexproof"), murder: castTargets(s0, "ai", "murder") };
    const s = activate(s0, "user", "im", "bears");
    const during = { types: permanentTypes(s, "im").types, pt: pt(s, "im"), hexproof: permanentHasKeyword(s, "im", "hexproof"), murder: castTargets(s, "ai", "murder") };
    expect(permanentHasKeyword(s, "isamaru", "hexproof")).toBe(true);
    // The copy effect ends at cleanup (CR 514.2): walk the turn out.
    let end = s;
    for (let g = 0; end.turn === s.turn && g < 400; g++) end = end.priorityHolder ? passPriority(end) : nextStep(end);
    // Mana pools emptied on the way (CR 500.5): refill the opponent's so Murder is castable again and only targeting decides.
    end = { ...end, players: { ...end.players, ai: { ...end.players.ai, manaPool: { ...end.players.ai.manaPool, ...FULL } } } };
    const after = { turn: end.turn - s.turn, types: permanentTypes(end, "im").types, hexproof: permanentHasKeyword(end, "im", "hexproof"), murder: castTargets(end, "ai", "murder") };
    console.log("  WITNESS helmImpossibleMan", JSON.stringify({ before, during, after })); // vitest 4 needs --disable-console-intercept
    expect(before).toEqual({ types: ["Legendary", "Creature"], hexproof: true, murder: ["bears"] });
    expect(during).toEqual({ types: ["Creature"], pt: "4/4", hexproof: false, murder: ["bears", "im"] });
    expect(after).toEqual({ turn: 1, types: ["Legendary", "Creature"], hexproof: true, murder: ["bears"] });
  });

  it("⭐ a token copy of a legendary creature is legendary and keeps the hexproof (Flash Photography on the opponent's Isamaru)", () => {
    const s0 = board({ user: [P("helm", HELM, "user")], ai: [P("theirs", ISAMARU, "ai")], hand: [G("photo", PHOTOGRAPHY)], aiHand: [G("murder", MURDER)] });
    const made = cast(s0, "user", "photo", "theirs");
    const token = made.players.user.battlefield.find((p) => p.card?.token);
    const s = activate(made, "user", "helm", token.id);
    const row = { type: token.card.type, attachedTo: findPerm(s, "helm").attachedTo === token.id, pt: pt(s, token.id),
      hexproof: permanentHasKeyword(s, token.id, "hexproof"), murder: castTargets(s, "ai", "murder") };
    console.log("  WITNESS helmLegendaryToken", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ type: "Legendary Creature — Dog", attachedTo: true, pt: "4/4", hexproof: true, murder: ["theirs"] });
  });

  it("⭐ a token copy that \"isn't legendary\" gets no hexproof (Quantum Misalignment on the user's Isamaru)", () => {
    const s0 = board({ user: [P("isamaru", ISAMARU, "user"), P("helm", HELM, "user")], hand: [G("misalign", MISALIGNMENT)], aiHand: [G("murder", MURDER)] });
    const made = cast(s0, "user", "misalign", "isamaru");
    const token = made.players.user.battlefield.find((p) => p.card?.token);
    const s = activate(made, "user", "helm", token.id);
    const row = { type: token.card.type, pt: pt(s, token.id), hexproof: permanentHasKeyword(s, token.id, "hexproof"),
      murder: castTargets(s, "ai", "murder").map((id) => (id === token.id ? "token" : id)) };
    expect(row).toEqual({ type: "Creature — Dog", pt: "4/4", hexproof: false, murder: ["isamaru", "token"].sort() });
  });
});

describe("RUNTIME — Gimli's Axe and Hero's Heirloom: the same gate on menace, trample and haste", () => {
  it("⭐ Gimli's Axe: Isamaru has menace (one Hill Giant is offered no block); Grizzly Bears does not (the Giant may block it)", () => {
    const table = () => board({ user: [P("isamaru", ISAMARU, "user"), P("bears", BEARS, "user"), P("axe", AXE, "user")], ai: [P("giant", GIANT, "ai")] });
    const onDog = activate(table(), "user", "axe", "isamaru");
    const onBears = activate(table(), "user", "axe", "bears");
    const row = {
      dog: [pt(onDog, "isamaru"), permanentHasKeyword(onDog, "isamaru", "menace"), blockable(attack(onDog, [["isamaru", "ai"], ["bears", "ai"]]), "ai")],
      bears: [pt(onBears, "bears"), permanentHasKeyword(onBears, "bears", "menace"), blockable(attack(onBears, [["isamaru", "ai"], ["bears", "ai"]]), "ai")],
    };
    console.log("  WITNESS gimlisAxe", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ dog: ["5/2", true, ["bears"]], bears: ["5/2", false, ["bears", "isamaru"]] });
  });

  it("⭐ Hero's Heirloom: a summoning-sick Isamaru may attack (haste) and tramples over a blocker; a summoning-sick Bears may not attack", () => {
    const table = () => board({ user: [P("isamaru", ISAMARU, "user", { summoningSick: true }), P("bears", BEARS, "user", { summoningSick: true }), P("heirloom", HEIRLOOM, "user")],
      ai: [P("blocker", BEARS, "ai")] });
    const attackers = (s) => legalActionsForPlayer(toStep(s, "declare-attackers"), "user").filter((a) => a.kind === "declare-attacker").map((a) => a.permanentId);
    const onDog = activate(table(), "user", "heirloom", "isamaru");
    const onBears = activate(table(), "user", "heirloom", "bears");
    expect([pt(onDog, "isamaru"), permanentHasKeyword(onDog, "isamaru", "trample"), permanentHasKeyword(onDog, "isamaru", "haste"), attackers(onDog)])
      .toEqual(["4/3", true, true, ["isamaru"]]);
    expect([pt(onBears, "bears"), permanentHasKeyword(onBears, "bears", "trample"), permanentHasKeyword(onBears, "bears", "haste"), attackers(onBears)])
      .toEqual(["4/3", false, false, []]);
    // Trample through the real combat: Isamaru (4/3) blocked by Grizzly Bears (2/2) assigns 2 to the blocker, 2 to the player.
    let s = attack(onDog, [["isamaru", "ai"]]);
    s = dispatchAction(s, legalActionsForPlayer(s, "ai").find((a) => a.kind === "declare-blocker" && a.attackerId === "isamaru"));
    const life0 = s.players.ai.life;
    s = toStep(s, "end-of-combat");
    expect({ lost: life0 - s.players.ai.life, blockerDied: !findPerm(s, "blocker") }).toEqual({ lost: 2, blockerDied: true });
  });
});

// ════════════════════════════════════════════ TRAILBLAZER'S BOOTS ════════════════════════════════════════════

describe("parse + classify — nonbasic landwalk is a grantable keyword", () => {
  it("⭐ Trailblazer's Boots: one ungated layer-6 grant; native-equipment. Dryad Sophisticate prints it: native-body", () => {
    const row = { tier: classifyCard(BOOTS), bonus: parseEquipmentBonus(BOOTS), sophisticate: classifyCard(SOPHISTICATE) };
    console.log("  WITNESS bootsParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ tier: "native-equipment", sophisticate: "native-body",
      bonus: [{ layer: 6, op: { layerOp: "addKeyword", keyword: "nonbasic landwalk" }, duration: { kind: "permanent" } }] });
  });

  it("One Does Not stays body-only on its other line (\"does not simply untap\" is not the modeled tap-lock wording)", () => {
    expect(parseAuraBonus(ONE_DOES_NOT)).toEqual([]);
    expect(classifyCard(ONE_DOES_NOT)).toBe("body-only");
  });
});

describe("RUNTIME — Trailblazer's Boots in a four-seat pod: the DEFENDING player's lands decide", () => {
  // user attacks with Grizzly Bears (the Boots) and Isamaru (no Boots, the control). ai1 controls only basic lands (a snow
  // basic among them); ai2 controls a Forest and Command Tower; ai3 controls Breeding Pool, a nonbasic land with two basic
  // land types. Every opponent has a Hill Giant to block with; the user controls a nonbasic land too.
  const start = () => pod({
    user: [P("bears", BEARS, "user"), P("isamaru", ISAMARU, "user"), P("boots", BOOTS, "user"), P("utower", TOWER, "user")],
    ai1: [P("g1", GIANT, "ai1"), P("f1", FOREST, "ai1"), P("i1", ISLAND, "ai1"), P("sf1", SNOW_FOREST, "ai1")],
    ai2: [P("g2", GIANT, "ai2"), P("f2", FOREST, "ai2"), P("tower2", TOWER, "ai2")],
    ai3: [P("g3", GIANT, "ai3"), P("pool3", POOL, "ai3")],
  });
  const booted = () => activate(start(), "user", "boots", "bears");

  it("the equip resolves: the Bears has nonbasic landwalk, Isamaru does not", () => {
    const s = booted();
    expect([findPerm(s, "boots").attachedTo, permanentHasKeyword(s, "bears", "Nonbasic landwalk"), permanentHasKeyword(s, "isamaru", "Nonbasic landwalk")])
      .toEqual(["bears", true, false]);
  });

  it("⭐ attacking ai1 (only basic lands): the Bears can be blocked — other players' nonbasic lands, the user's included, do not matter", () => {
    const s = attack(booted(), [["bears", "ai1"], ["isamaru", "ai1"]]);
    const row = { ai1: blockable(s, "ai1"), ai2: blockable(s, "ai2"), ai3: blockable(s, "ai3") };
    console.log("  WITNESS bootsVsBasics", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ ai1: ["bears", "isamaru"], ai2: [], ai3: [] });
  });

  it("⭐ attacking ai2 (a Forest and Command Tower): the Bears can't be blocked and deals its damage; Isamaru beside it can be blocked", () => {
    let s = attack(booted(), [["bears", "ai2"], ["isamaru", "ai2"]]);
    const offered = blockable(s, "ai2");
    const life0 = lifeOf(s);
    s = dispatchAction(s, legalActionsForPlayer(s, "ai2").find((a) => a.kind === "declare-blocker" && a.attackerId === "isamaru"));
    s = toStep(s, "end-of-combat");
    const row = { offered, lost: Object.fromEntries(Object.keys(life0).map((pid) => [pid, life0[pid] - s.players[pid].life])), isamaruDied: !findPerm(s, "isamaru") };
    console.log("  WITNESS bootsVsNonbasic", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ offered: ["isamaru"], lost: { user: 0, ai1: 0, ai2: 2, ai3: 0 }, isamaruDied: true });
  });

  it("⭐ one attack, two defenders: the Bears at ai1 is blockable while a second booted attacker at ai3 (Breeding Pool) is not", () => {
    // CR 205.4c — Breeding Pool is a nonbasic land "even if it has a basic land type".
    const s0 = pod({
      user: [P("bears", BEARS, "user", { attachments: ["boots"] }), P("soph", SOPHISTICATE, "user"), P("boots", BOOTS, "user", { attachedTo: "bears" })],
      ai1: [P("g1", GIANT, "ai1"), P("f1", FOREST, "ai1"), P("sf1", SNOW_FOREST, "ai1")],
      ai2: [P("g2", GIANT, "ai2"), P("tower2", TOWER, "ai2")],
      ai3: [P("g3", GIANT, "ai3"), P("pool3", POOL, "ai3")],
    });
    const s = attack(s0, [["bears", "ai1"], ["soph", "ai3"]]);
    expect({ ai1: blockable(s, "ai1"), ai2: blockable(s, "ai2"), ai3: blockable(s, "ai3") }).toEqual({ ai1: ["bears"], ai2: [], ai3: [] });
    // …and the printed keyword at a basic-only defender is blockable too.
    const s2 = attack(s0, [["soph", "ai1"], ["bears", "ai3"]]);
    expect({ ai1: blockable(s2, "ai1"), ai3: blockable(s2, "ai3") }).toEqual({ ai1: ["soph"], ai3: [] });
  });

  it("⛔ a defender with no land at all — only nonland permanents without the basic supertype — can block", () => {
    const s0 = pod({ user: [P("bears", BEARS, "user", { attachments: ["boots"] }), P("boots", BOOTS, "user", { attachedTo: "bears" })],
      ai1: [P("g1", GIANT, "ai1"), P("helm1", HELM, "ai1")] });
    expect(blockable(attack(s0, [["bears", "ai1"]]), "ai1")).toEqual(["bears"]);
  });

  it("⛔ the land BACK face of a double-faced creature is not a land the defender controls (Kazandu Mammoth beside a Forest)", () => {
    // The permanent's printed line is "Creature — Elephant // Land"; front face up it is a creature only (CR 712.8d).
    const s0 = pod({ user: [P("bears", BEARS, "user", { attachments: ["boots"] }), P("boots", BOOTS, "user", { attachedTo: "bears" })],
      ai1: [P("mammoth", MAMMOTH, "ai1"), P("f1", FOREST, "ai1")] });
    expect(permanentTypes(s0, "mammoth").types).toEqual(["Creature"]);
    expect(blockable(attack(s0, [["bears", "ai1"]]), "ai1")).toEqual(["bears"]);
  });

  it("a land creature counts: against Dryad Arbor alone the Bears can't be blocked, by the Arbor or the Giant", () => {
    const s0 = pod({ user: [P("bears", BEARS, "user", { attachments: ["boots"] }), P("isamaru", ISAMARU, "user"), P("boots", BOOTS, "user", { attachedTo: "bears" })],
      ai1: [P("g1", GIANT, "ai1"), P("arbor", ARBOR, "ai1")] });
    expect(blockable(attack(s0, [["bears", "ai1"], ["isamaru", "ai1"]]), "ai1")).toEqual(["isamaru"]);
  });

  it("⭐ moved, unequipped, re-equipped: the landwalk follows the Boots", () => {
    const onBears = booted();
    const onDog = activate(onBears, "user", "boots", "isamaru"); // moved
    const moved = { bears: permanentHasKeyword(onDog, "bears", "Nonbasic landwalk"), dog: permanentHasKeyword(onDog, "isamaru", "Nonbasic landwalk"),
      ai2: blockable(attack(onDog, [["bears", "ai2"], ["isamaru", "ai2"]]), "ai2") };
    // Unequipped: the host is destroyed (ai2's Murder), the Boots stay on the battlefield attached to nothing.
    const withMurder = { ...onDog, players: { ...onDog.players, ai2: { ...onDog.players.ai2, hand: [G("murder", MURDER)] } } };
    const bare = cast(withMurder, "ai2", "murder", "isamaru");
    const unequipped = { boots: findPerm(bare, "boots").attachedTo, bears: permanentHasKeyword(bare, "bears", "Nonbasic landwalk"),
      ai2: blockable(attack(bare, [["bears", "ai2"]]), "ai2") };
    const back = activate(bare, "user", "boots", "bears"); // re-equipped
    const again = { boots: findPerm(back, "boots").attachedTo, ai2: blockable(attack(back, [["bears", "ai2"]]), "ai2") };
    console.log("  WITNESS bootsMoved", JSON.stringify({ moved, unequipped, again })); // vitest 4 needs --disable-console-intercept
    expect(moved).toEqual({ bears: false, dog: true, ai2: ["bears"] });
    expect(unequipped).toEqual({ boots: null, bears: false, ai2: ["bears"] });
    expect(again).toEqual({ boots: "bears", ai2: [] });
  });
});

describe("RUNTIME — the nonbasic read is the land's current characteristics; a two-seat game reads the lone opponent", () => {
  it("⭐ Thespian's Stage is a nonbasic land; as a copy of a basic Forest it is a basic land (CR 707.2) and the Bears can be blocked", () => {
    const s0 = board({ user: [P("bears", BEARS, "user", { attachments: ["boots"] }), P("boots", BOOTS, "user", { attachedTo: "bears" })],
      ai: [P("giant", GIANT, "ai"), P("stage", STAGE, "ai"), P("forest", FOREST, "ai")] });
    const before = { stage: permanentTypes(s0, "stage").types, blockable: blockable(attack(s0, [["bears", "ai"]]), "ai") };
    // The opponent's own main phase: {2}, {T}: Thespian's Stage becomes a copy of its Forest.
    const theirs = activate({ ...s0, activePlayer: "ai" }, "ai", "stage", "forest");
    const s = { ...theirs, activePlayer: "user", priorityHolder: "user" };
    const after = { stage: permanentTypes(s, "stage").types, blockable: blockable(attack(s, [["bears", "ai"]]), "ai") };
    console.log("  WITNESS bootsThespiansStage", JSON.stringify({ before, after })); // vitest 4 needs --disable-console-intercept
    expect(before).toEqual({ stage: ["Land"], blockable: [] });
    expect(after).toEqual({ stage: ["Basic", "Land"], blockable: ["bears"] });
  });

  it("Dryad Sophisticate (printed): blockable against a Forest, unblockable once the defender also controls Command Tower", () => {
    const table = (lands) => board({ user: [P("soph", SOPHISTICATE, "user")], ai: [P("giant", GIANT, "ai"), ...lands] });
    expect(blockable(attack(table([P("forest", FOREST, "ai")]), [["soph", "ai"]]), "ai")).toEqual(["soph"]);
    expect(blockable(attack(table([P("forest", FOREST, "ai"), P("tower", TOWER, "ai")]), [["soph", "ai"]]), "ai")).toEqual([]);
  });
});
