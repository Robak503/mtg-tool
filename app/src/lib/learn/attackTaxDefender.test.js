/**
 * attackTaxDefender.test.js — an attack tax charges exactly the attacks its card names (CR 508.1h; the bundled rulings).
 *
 * The printed wordings name different defenders:
 *   · "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."
 *     (Propaganda, Ghostly Prison, Windborn Muse, Koskun Falls) — the PLAYER only. Rulings: "Unless some effect explicitly
 *     says otherwise, a creature that can't attack you can still attack a planeswalker you control." (Propaganda, Ghostly
 *     Prison, Koskun Falls, 2014-02-01); "Creatures may still attack planeswalkers you control without their controller
 *     paying a cost." (Windborn Muse, 2022-12-08).
 *   · "Creatures can't attack you or planeswalkers you control unless their controller pays … for each of those creatures."
 *     (Baird, Steward of Argive; Archon of Absolution; Sphere of Safety; Norn's Annex) — the player AND their planeswalkers.
 *   · "Creatures can't attack planeswalkers you control unless their controller pays {1} for each creature they control
 *     that's attacking a planeswalker you control." (Onakke Oathkeeper) — the planeswalkers only.
 * Until this fix every tax was keyed on the defending PLAYER (attackTax.attackTaxDetail / attackTaxToDeclare), so the "you"
 * printing also priced an attack on that player's planeswalker — withheld when unaffordable, charged when affordable —
 * and Onakke Oathkeeper's printing was not read at all.
 *
 * Card text: the bundled Scryfall oracle snapshot (scryfall-bulk/oracle_cards.json, synced 2026-10-01), copied verbatim.
 */
import { beforeEach, describe, expect, it } from "vitest";

import * as attackTax from "./attackTax.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { requiredAttackerIds } from "./attackRequirements.js";
import { pickAttackPlan } from "./opponentAI.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

const { attackTaxDetail, parseAttackTax, isAttackTaxClause } = attackTax;

beforeEach(() => _resetIdsForTests());

// ── the bundled oracle (verbatim) ───────────────────────────────────────────────────────────────────────────────────────
const PROPAGANDA = {"name":"Propaganda","type":"Enchantment","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #112
const GHOSTLY_PRISON = {"name":"Ghostly Prison","type":"Enchantment","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #161
const WINDBORN_MUSE = {"name":"Windborn Muse","type":"Creature — Spirit","mana":"{3}{W}","cmc":4,"power":"2","toughness":"3","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nCreatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #999
const KOSKUN_FALLS = {"name":"Koskun Falls","type":"World Enchantment","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"At the beginning of your upkeep, sacrifice this enchantment unless you tap an untapped creature you control.\nCreatures can't attack you unless their controller pays {2} for each creature they control that's attacking you."}; // EDHREC #10682
const BAIRD = {"name":"Baird, Steward of Argive","type":"Legendary Creature — Human Soldier","mana":"{2}{W}{W}","cmc":4,"power":"2","toughness":"4","keywords":["Vigilance"],"colors":["W"],"oracle":"Vigilance\nCreatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures."}; // EDHREC #2575
const ARCHON = {"name":"Archon of Absolution","type":"Creature — Archon","mana":"{3}{W}","cmc":4,"power":"3","toughness":"2","keywords":["Flying","Protection"],"colors":["W"],"oracle":"Flying\nProtection from white (This creature can't be blocked, targeted, dealt damage, enchanted, or equipped by anything white.)\nCreatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures."}; // EDHREC #7562
const SPHERE = {"name":"Sphere of Safety","type":"Enchantment","mana":"{4}{W}","cmc":5,"keywords":[],"colors":["W"],"oracle":"Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control."}; // EDHREC #678
const ANNEX = {"name":"Norn's Annex","type":"Artifact","mana":"{3}{W/P}{W/P}","cmc":5,"keywords":[],"colors":["W"],"oracle":"({W/P} can be paid with either {W} or 2 life.)\nCreatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures."}; // EDHREC #1944
const ONAKKE = {"name":"Onakke Oathkeeper","type":"Creature — Ogre Spirit","mana":"{1}{W}","cmc":2,"power":"0","toughness":"4","keywords":[],"colors":["W"],"oracle":"Creatures can't attack planeswalkers you control unless their controller pays {1} for each creature they control that's attacking a planeswalker you control.\n{4}{W}{W}, Exile this card from your graveyard: Return target planeswalker card from your graveyard to the battlefield."}; // EDHREC #6717
const ARCHANGEL = {"name":"Archangel of Tithes","type":"Creature — Angel","mana":"{1}{W}{W}{W}","cmc":4,"power":"3","toughness":"5","keywords":["Flying"],"colors":["W"],"oracle":"Flying\nAs long as this creature is untapped, creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.\nAs long as this creature is attacking, creatures can't block unless their controller pays {1} for each of those creatures."}; // EDHREC #2170
const DAIN = {"name":"Dáin, Lord of the Iron Hills","type":"Legendary Creature — Dwarf Noble","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":["Vigilance","Storied"],"colors":["W"],"oracle":"Vigilance\nStoried (If you control three or more artifacts, legendaries, and/or Sagas, you have an enduring story for the rest of the game.)\nAs long as you have an enduring story, creatures can't attack you unless their controller pays {1} for each of those creatures."}; // EDHREC #9230
const JACE = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"loyalty":"3","keywords":["Mill"],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards."}; // EDHREC #3557
const CYCLOPS = {"name":"Bloodrock Cyclops","type":"Creature — Cyclops","mana":"{2}{R}","cmc":3,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":"This creature attacks each combat if able."}; // EDHREC #31053
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #8126
const SHINY = {"name":"Shiny Impetus","type":"Enchantment — Aura","mana":"{2}{R}","cmc":3,"keywords":["Goad","Treasure","Enchant"],"colors":["R"],"oracle":"Enchant creature\nEnchanted creature gets +2/+2 and is goaded. (It attacks each combat if able and attacks a player other than you if able.)\nWhenever enchanted creature attacks, you create a Treasure token. (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")"}; // EDHREC #1389
const WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""}; // EDHREC #22387
const ISLAND = {"name":"Island","type":"Basic Land — Island","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {U}.)"};
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const walker = (id, controller, loyalty = 3) => P(id, JACE, controller, { counters: { loyalty } });
const islands = (n, controller) => Array.from({ length: n }, (_, i) => P(`land${i}`, ISLAND, controller));

/** `seat`'s declare attackers step; `boards` maps seat → permanents. Two players (user, ai) unless `pod`. */
function game({ pod = false, seat = "user", boards = {}, life = 20 }) {
  const s0 = pod ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] }) : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [...(boards[pid] || [])], hand: [], graveyard: [], library: [], life };
  return { ...s0, players, turn: 5, activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, phase: "combat", step: "declare-attackers", combat: { attackers: [], blockers: [] } };
}
/** The user's Grizzly Bears (and `lands` Islands) against the AI's `defenders` (taxers) and Jace Beleren. */
const vsJace = (defenders, { lands = 0, life = 20 } = {}) =>
  game({ boards: { user: [P("bears", BEARS, "user"), ...islands(lands, "user")], ai: [...defenders.map((c, i) => P(`tax${i}`, c, "ai")), walker("jace", "ai")] }, life });

const attacks = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "declare-attacker");
const target = (a) => (a.defenderPlaneswalkerId ? `${a.defenderId}:${a.defenderPlaneswalkerId}` : (a.defenderId ?? "(lone)"));
const pairsFor = (s, seat, id) => attacks(s, seat).filter((a) => a.permanentId === id).map(target).sort();
const untapped = (s, seat = "user") => s.players[seat].battlefield.filter((p) => /Land/.test(p.card.type) && !p.tapped).length;
const taxEvents = (s) => (s.log || []).filter((e) => e.kind === "attack-tax-paid");
const atJace = { kind: "declare-attacker", playerId: "user", permanentId: "bears", name: "Grizzly Bears", defenderId: "ai", defenderPlaneswalkerId: "jace", targetName: "Jace Beleren" };
const atFace = { kind: "declare-attacker", playerId: "user", permanentId: "bears", name: "Grizzly Bears", defenderId: "ai" };

describe("the shared reader — the defender each printed wording names", () => {
  it("⭐ \"can't attack you\" (Propaganda, Ghostly Prison, Windborn Muse, Koskun Falls): the player, not their planeswalkers", () => {
    const row = [PROPAGANDA, GHOSTLY_PRISON, WINDBORN_MUSE, KOSKUN_FALLS].map((c) => attackTax.readAttackTax?.(c)?.defends);
    expect(row).toEqual(Array(4).fill({ player: true, planeswalkers: false }));
  });
  it("⭐ \"can't attack you or planeswalkers you control\" (Baird, Archon of Absolution, Sphere of Safety, Norn's Annex): both", () => {
    const row = [BAIRD, ARCHON, SPHERE, ANNEX].map((c) => attackTax.readAttackTax?.(c)?.defends);
    expect(row).toEqual(Array(4).fill({ player: true, planeswalkers: true }));
  });
  it("⭐ \"can't attack planeswalkers you control\" (Onakke Oathkeeper): the planeswalkers only, {1} each", () => {
    const clause = ONAKKE.oracle.split("\n")[0].replace(/\.$/, "").toLowerCase();
    expect({ parse: parseAttackTax(ONAKKE), defends: attackTax.readAttackTax?.(ONAKKE)?.defends, clause: isAttackTaxClause(clause) })
      .toEqual({ parse: { generic: 1 }, defends: { player: false, planeswalkers: true }, clause: true });
  });
  it("control — the amounts are unchanged: {2}, {1}, the counted {X}, the Phyrexian pip", () => {
    expect([PROPAGANDA, KOSKUN_FALLS, BAIRD, SPHERE, ANNEX].map(parseAttackTax)).toEqual([
      { generic: 2 }, { generic: 2 }, { generic: 1 }, { countSource: { kind: "permanentsYouControl", cardType: "enchantment" } }, { phyrexian: "W" },
    ]);
  });
  it("control — the conditional printings stay unread (Archangel of Tithes' \"as long as this creature is untapped\", Dáin's enduring story)", () => {
    expect([ARCHANGEL, DAIN].map(parseAttackTax)).toEqual([null, null]);
  });
});

describe("the tax for one more attacker, per attack target (attackTaxDetail)", () => {
  it("⭐ Propaganda: {2} at the player, nothing at their planeswalker", () => {
    const s = vsJace([PROPAGANDA]);
    expect([attackTaxDetail(s, "ai"), attackTaxDetail(s, "ai", "jace")]).toEqual([{ generic: 2, phyrexian: [] }, { generic: 0, phyrexian: [] }]);
  });
  it("⭐ Onakke Oathkeeper: nothing at the player, {1} at their planeswalker", () => {
    const s = vsJace([ONAKKE]);
    expect([attackTaxDetail(s, "ai"), attackTaxDetail(s, "ai", "jace")]).toEqual([{ generic: 0, phyrexian: [] }, { generic: 1, phyrexian: [] }]);
  });
  it("⭐ Sphere of Safety beside Propaganda: X = 2 at both, Propaganda's {2} at the player only", () => {
    const s = vsJace([SPHERE, PROPAGANDA]);
    expect([attackTaxDetail(s, "ai").generic, attackTaxDetail(s, "ai", "jace").generic]).toEqual([4, 2]);
  });
  it("control — Baird: {1} at both; Norn's Annex: {W/P} at both", () => {
    const b = vsJace([BAIRD]);
    const n = vsJace([ANNEX]);
    expect([attackTaxDetail(b, "ai"), attackTaxDetail(b, "ai", "jace"), attackTaxDetail(n, "ai"), attackTaxDetail(n, "ai", "jace")]).toEqual([
      { generic: 1, phyrexian: [] }, { generic: 1, phyrexian: [] }, { generic: 0, phyrexian: ["W"] }, { generic: 0, phyrexian: ["W"] },
    ]);
  });
});

describe("the offer and the payment (a person's declaration: legalChoices + actionDispatcher)", () => {
  it("⭐ Propaganda and Jace, no mana: the attack at Jace is offered (it costs nothing), the attack at the player is not", () => {
    expect(pairsFor(vsJace([PROPAGANDA]), "user", "bears")).toEqual(["ai:jace"]);
  });
  it("⭐ Ghostly Prison and Jace, two Islands: declaring at Jace pays nothing — both Islands stay untapped", () => {
    const s = vsJace([GHOSTLY_PRISON], { lands: 2 });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai", "ai:jace"]);
    const after = dispatchAction(s, attacks(s).find((a) => a.defenderPlaneswalkerId === "jace"));
    expect({ declared: after.combat.attackers.map((a) => a.defenderPlaneswalkerId), untapped: untapped(after), taxPaid: taxEvents(after).length })
      .toEqual({ declared: ["jace"], untapped: 2, taxPaid: 0 });
  });
  it("control — Ghostly Prison and Jace, two Islands: declaring at the player pays {2}", () => {
    const s = vsJace([GHOSTLY_PRISON], { lands: 2 });
    const after = dispatchAction(s, attacks(s).find((a) => !a.defenderPlaneswalkerId));
    expect({ untapped: untapped(after), taxPaid: taxEvents(after).map((e) => e.generic) }).toEqual({ untapped: 0, taxPaid: [2] });
  });
  it("⭐ a direct declaration at Jace behind Windborn Muse with no mana is not refused as an unpaid tax", () => {
    const s = vsJace([WINDBORN_MUSE]);
    expect(() => dispatchAction(s, atJace)).not.toThrow();
    expect(dispatchAction(s, atJace).combat.attackers.map((a) => a.defenderPlaneswalkerId)).toEqual(["jace"]);
  });
  it("control — a direct declaration at the player behind Windborn Muse with no mana is refused (ATTACK_TAX_UNPAID)", () => {
    expect(() => dispatchAction(vsJace([WINDBORN_MUSE]), atFace)).toThrow(/attack tax is unpayable/);
  });
  it("⭐ Onakke Oathkeeper and Jace, no mana: the attack at the player is offered, the attack at Jace is not", () => {
    expect(pairsFor(vsJace([ONAKKE]), "user", "bears")).toEqual(["ai"]);
  });
  it("⭐ Onakke Oathkeeper and Jace, one Island: declaring at Jace taps it for the {1}", () => {
    const s = vsJace([ONAKKE], { lands: 1 });
    const after = dispatchAction(s, attacks(s).find((a) => a.defenderPlaneswalkerId === "jace"));
    expect({ untapped: untapped(after), taxPaid: taxEvents(after).map((e) => e.generic) }).toEqual({ untapped: 0, taxPaid: [1] });
  });
  it("control — Onakke Oathkeeper and Jace, one Island: declaring at the player pays nothing", () => {
    const s = vsJace([ONAKKE], { lands: 1 });
    const after = dispatchAction(s, attacks(s).find((a) => !a.defenderPlaneswalkerId));
    expect({ untapped: untapped(after), taxPaid: taxEvents(after).length }).toEqual({ untapped: 1, taxPaid: 0 });
  });
  it("control — Baird and Jace, no mana: neither attack is offered; one Island: declaring at Jace taps it", () => {
    expect(pairsFor(vsJace([BAIRD]), "user", "bears")).toEqual([]);
    const s = vsJace([BAIRD], { lands: 1 });
    const after = dispatchAction(s, attacks(s).find((a) => a.defenderPlaneswalkerId === "jace"));
    expect(untapped(after)).toBe(0);
  });
  it("control — Norn's Annex and Jace, no mana, 20 life: declaring at Jace pays 2 life", () => {
    const s = vsJace([ANNEX]);
    const after = dispatchAction(s, attacks(s).find((a) => a.defenderPlaneswalkerId === "jace"));
    expect(after.players.user.life).toBe(18);
  });
  it("⭐ Commander: ai2's Propaganda and Jace, no mana — Jace is offered beside the untaxed ai1 and ai3", () => {
    const s = game({ pod: true, boards: { user: [P("bears", BEARS, "user")], ai2: [P("prop", PROPAGANDA, "ai2"), walker("jace", "ai2")] } });
    expect(pairsFor(s, "user", "bears")).toEqual(["ai1", "ai2:jace", "ai3"]);
  });
});

describe("Onakke Oathkeeper — the planeswalker-only printing, read", () => {
  it("⭐ the tier: both its lines are played (its tax was the unread line)", () => {
    expect(classifyCard(ONAKKE)).toMatch(/^native/);
  });
  it("control — its graveyard ability: {4}{W}{W}, exile it from the graveyard, Jace Beleren returns", () => {
    const s0 = game({ seat: "user", boards: { user: Array.from({ length: 6 }, (_, i) => P(`pl${i}`, PLAINS, "user")) } });
    let s = { ...s0, phase: "precombat-main", step: "main", combat: null,
      players: { ...s0.players, user: { ...s0.players.user, graveyard: [{ id: "c-onakke", ...ONAKKE }, { id: "c-jace", ...JACE }] } } };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-gy-exile" && a.targets?.[0]?.name === "Jace Beleren"));
    for (let k = 0; k < 4 && s.stack.length; k++) s = dispatchAction(s, legalActionsForPlayer(s, s.priorityHolder).find((a) => a.kind === "pass-priority"));
    expect({ battlefield: s.players.user.battlefield.filter((p) => !/Land/.test(p.card.type)).map((p) => p.card.name), exile: (s.players.user.exile || []).map((c) => c.name), tapped: s.players.user.battlefield.filter((p) => p.tapped).length })
      .toEqual({ battlefield: ["Jace Beleren"], exile: ["Onakke Oathkeeper"], tapped: 6 });
  });
});

describe("attack requirements and the AI's attack planner read the same per-target tax", () => {
  // Two players: the AI's Bloodrock Cyclops (attacks each combat if able) against the user's Propaganda and Jace, no mana.
  const cyclopsBoard = (taxer) => game({ seat: "ai", boards: { ai: [P("cyclops", CYCLOPS, "ai")], user: [P("tax", taxer, "user"), walker("jace", "user")] } });

  it("⭐ the attack at Jace costs nothing, so the Cyclops must attack: it is required and the declaration can't close", () => {
    const s = cyclopsBoard(PROPAGANDA);
    const offered = legalActionsForPlayer(s, "ai");
    expect({ pairs: pairsFor(s, "ai", "cyclops"), required: [...requiredAttackerIds(s, "ai", attacks(s, "ai"))], pass: offered.some((a) => a.kind === "pass-priority") })
      .toEqual({ pairs: ["user:jace"], required: ["cyclops"], pass: false });
  });
  it("⭐ the AI planner sends the Cyclops at Jace", () => {
    const s = cyclopsBoard(PROPAGANDA);
    expect(pickAttackPlan(s, "ai", attacks(s, "ai")).map(target)).toEqual(["user:jace"]);
  });
  it("⭐ with two Mountains and a Craw Wurm behind the user, the Cyclops is still forced in (the attack at Jace is free; the racer alone would hold it)", () => {
    const s = game({ seat: "ai", boards: { ai: [P("cyclops", CYCLOPS, "ai"), P("m1", MOUNTAIN, "ai"), P("m2", MOUNTAIN, "ai")], user: [P("tax", PROPAGANDA, "user"), walker("jace", "user"), P("wurm", WURM, "user")] } });
    expect(pickAttackPlan(s, "ai", attacks(s, "ai")).map((a) => a.permanentId)).toEqual(["cyclops"]);
  });
  it("control — behind Baird every attack costs {1}: nothing is offered, nothing required, the pass stays", () => {
    const s = cyclopsBoard(BAIRD);
    expect({ pairs: pairsFor(s, "ai", "cyclops"), pass: legalActionsForPlayer(s, "ai").some((a) => a.kind === "pass-priority") }).toEqual({ pairs: [], pass: true });
  });

  // Goad (CR 701.15b and the goad rulings — "If the creature can't attack any of those players but could otherwise attack, it
  // must attack a planeswalker an opponent controls, a battle an opponent controls, or a player who goaded it."): the user's
  // Bears, goaded by ai1, with ai2 behind Propaganda (and holding Jace) and ai3 behind Propaganda, no mana.
  const goadBoard = (ai2Taxer) => {
    const bears = P("bears", BEARS, "user", { attachments: ["impetus"] });
    return game({ pod: true, boards: { user: [bears], ai1: [P("impetus", SHINY, "ai1", { attachedTo: "bears" })], ai2: [P("tax2", ai2Taxer, "ai2"), walker("jace", "ai2")], ai3: [P("tax3", PROPAGANDA, "ai3")] } });
  };
  it("⭐ goaded, the other players taxed: ai2's planeswalker (free under Propaganda) is offered beside the goader", () => {
    expect(pairsFor(goadBoard(PROPAGANDA), "user", "bears")).toEqual(["ai1", "ai2:jace"]);
  });
  it("control — goaded, ai2 behind Baird (which covers Jace): only the goader is offered", () => {
    expect(pairsFor(goadBoard(BAIRD), "user", "bears")).toEqual(["ai1"]);
  });
});
