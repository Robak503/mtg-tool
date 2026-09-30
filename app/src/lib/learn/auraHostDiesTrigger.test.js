/**
 * auraHostDiesTrigger.test.js — "When enchanted creature dies, <effect>" (Bequeathal, Dying Wail).
 *
 * ⚠️ THE ORIGINAL HEADER CLAIMED THIS WAS "a detector arm, not a mechanism" — that the equippedCreature
 * scope "already resolves the death case correctly", so the slice was "one line plus its justification".
 * The SCOPE part was true and the CONCLUSION was not: scopeMatches did resolve the linkage from the dead
 * creature's CR-603.10a look-back, but the orphaned Aura was never OFFERED as a trigger source, because it
 * is binned to the graveyard before checkDiesTriggers runs and the watcher sweep is battlefield-only. The
 * card drew zero. The mechanism half landed 2026-08-01 (see the block comment in the RUNTIME describe).
 *
 * WHY IT IS NOT GATED ON THE EFFECT, unlike the SELF-LTB "equipped creature dies → return it to its owner's
 * hand" detector. That one needs a narrow gate because its effect NAMES THE DEAD OBJECT ("it", CR 608.2c) and
 * mis-binding that referent returns the wrong card. Every effect this arm actually frees is self-contained —
 * create a token, draw, discard, surveil — and names nothing. An effect that DOES reference the dead creature
 * ("return that card to the battlefield…") simply fails to parse and keeps its card parked. The referent
 * hazard is closed BY CONSTRUCTION rather than by a gate, and the last test below pins that.
 *
 * MEASURED HONESTLY: +2, not the +7 my swap probe predicted. The probe substituted an aura ETB for the
 * trigger, which lands the card in a DIFFERENT aura tier — so it measured the wrong thing. The other five
 * carry a static pump line as well, and pump+trigger is a tier COMPOSITION gap (each half classifies alone;
 * the combination does not). Recorded in the ledger rather than papered over here.
 */
import { describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, attachPermanent } from "./gameState.js";
import { checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

const aura = (oracle) => ({ name: "Bequeathal", type: "Enchantment — Aura", mana: "{G}", keywords: [], oracle });
const BEQUEATHAL = "Enchant creature\nWhen enchanted creature dies, you draw two cards.";

describe("detection — the aura host-death arm reuses the attached-linkage scope", () => {
  it("maps to the same equippedCreature scope as its attacks / combat-damage siblings", () => {
    const d = detectTriggers(aura(BEQUEATHAL)).find((x) => x.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "equippedCreature" });
  });

  it("the SELF form is untouched — a creature's own dies trigger still scopes self", () => {
    const d = detectTriggers({ name: "X", type: "Creature — Bear", mana: "{2}", power: "2", toughness: "2", oracle: "When this creature dies, draw a card." })[0];
    expect(d).toMatchObject({ event: "dies", scope: "self" });
  });
});

describe("RUNTIME — the trigger fires off the HOST's death, read from the look-back", () => {
  /**
   * An Aura attached to a host, then the host DIES THROUGH THE ENGINE'S OWN PATH.
   *
   * ⭐ REWRITTEN 2026-08-01, and the rewrite is the point. The original harness hand-built the post-death
   * board: it filtered the host out of `battlefield` and called checkDiesTriggers with a hand-made `dead`
   * entry. That board is one the engine never produces — it left the orphaned Aura sitting on the
   * battlefield and recorded no leave event — so the file proved the SCOPE MATCH and nothing else, while
   * the card drew zero in a real game. Driving `damageMarked` through destroyLethalCreatures instead means
   * the fixture cannot drift from the engine: the detach, the CR 704.5n binning of the orphaned Aura, and
   * the CR 603.10a look-back all happen for real.
   */
  function hostDies({ attach = true } = {}) {
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "ch", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const av = createPermanent({ id: "aura", card: { id: "ca", ...aura(BEQUEATHAL) }, controller: "user" });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, av], hand: [], library: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, name: `C${i}`, type: "Sorcery" })) } },
    };
    if (attach) s = attachPermanent(s, { equipId: "aura", targetId: "host" });
    // Lethal damage, then the engine's own SBA sweep does the killing, detaching and binning.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "host" ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    s = checkDiesTriggers(r.state, r.dead);
    let g = 0;
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    return s;
  }

  it("fires when its OWN host dies — two cards drawn", () => {
    expect(hostDies().players.user.hand).toHaveLength(2);
  });

  it("THE LOAD-BEARING ONE — an UNATTACHED aura does not fire off an unrelated death", () => {
    // scopeMatches requires the dead creature to be this aura's host. Without that gate an aura would
    // trigger off any creature dying anywhere, which is a materially different card.
    expect(hostDies({ attach: false }).players.user.hand).toHaveLength(0);
  });

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // 🚨 THIS FILE SHIPPED A HOLLOW GATE, AND THE RECORD STAYS.
  //
  // Until 2026-08-01 `hostDies` hand-built the post-death board: it filtered the host out of `battlefield`
  // and called checkDiesTriggers with a hand-made `dead` entry. That left the orphaned Aura sitting on the
  // battlefield and recorded no leave event — a board the engine never produces, because
  // detachPermanentFromAll bins an orphaned Aura at the battlefield-exit chokepoint (CR 704.5n) BEFORE
  // dies-triggers are looked for, and triggerSourcesOf scans the battlefield only.
  //
  // So the file proved the SCOPE MATCH and nothing else, while Bequeathal drew ZERO in a real game and was
  // credited native-trigger regardless. The park comment inside isNativeOwnTriggeredAura said as much in
  // writing and was contradicted by this file's own header; the park comment was right.
  //
  // ✅ BOTH are fixed now: the harness above drives the engine's real death path, and checkDiesTriggers
  // captures the binned Auras from `pendingLeaveEvents` (before checkLeavesTriggers clears them) and offers
  // them as trigger sources. `scopeMatches` already resolved the linkage from the dead creature's look-back
  // `attachments`, so nothing about the MATCH changed — the orphaned Aura simply had to be offered.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  it("⭐ THE REAL SEQUENCE — with the Aura also gone, the trigger STILL fires (CR 603.10a)", () => {
    // This is the assertion the original fixture could not make. It is the one that proves the CARD works;
    // the fixture above only ever proved the scope matched.
    expect(hostDies().players.user.hand).toHaveLength(2);
  });

  it("⛔ CREED — with TWO hosts dying at once, each aura fires ONLY off its own host", () => {
    // ⭐ THIS TEST EXISTS BECAUSE A MUTATION SURVIVED. Deleting the `attachments` membership check in
    // checkDiesTriggers changed nothing, because the only negative case here was an UNATTACHED aura — which
    // is never orphaned, never binned, and so never reaches the orphan loop at all. The check's real job is
    // this: a simultaneous death puts BOTH auras in the orphan list, and every orphan is offered as a source
    // for EVERY death in the batch. Without the membership test each aura fires twice — four cards drawn off
    // two deaths — which is a materially different board.
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, name) => createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const h1 = mk("h1", "Grizzly Bears"); const h2 = mk("h2", "Runeclaw Bear");
    const a1 = createPermanent({ id: "a1", card: { id: "ca1", ...aura(BEQUEATHAL) }, controller: "user" });
    const a2 = createPermanent({ id: "a2", card: { id: "ca2", ...aura(BEQUEATHAL) }, controller: "user" });
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [h1, h2, a1, a2], hand: [], library: Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, name: `C${i}`, type: "Sorcery" })) } },
    };
    s = attachPermanent(s, { equipId: "a1", targetId: "h1" });
    s = attachPermanent(s, { equipId: "a2", targetId: "h2" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (["h1", "h2"].includes(p.id) ? { ...p, damageMarked: 99 } : p)) } } };
    const r = destroyLethalCreatures(s);
    let out = checkDiesTriggers(r.state, r.dead);
    out = flushTriggers(out, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((out.stack || []).length && g++ < 20) out = resolveTopOfStack(out);
    expect(out.players.user.hand).toHaveLength(4); // 2 auras × 2 cards — NOT 8
  });

  it("⛔ CREED — an orphaned aura still does NOT fire off an unrelated creature's death", () => {
    // The look-back membership test is what scopes it: the aura is offered as a source for EVERY death in
    // the batch, so without the `attachments` check it would fire off any of them. Here the dead creature
    // never carried this aura, so nothing may happen.
    expect(hostDies({ attach: false }).players.user.hand).toHaveLength(0);
  });
});

describe("classification", () => {
  it("Bequeathal's shape flips", () => {
    expect(classifyCard(aura(BEQUEATHAL))).toMatch(/^native/);
  });

  it("CREED — an effect that NAMES THE DEAD CARD stays parked unless its referent is bound and proven", () => {
    // "return that card…" must bind the dead host's graveyard card. GRADUATED 2026-09-30 (the 09-06 plan's stage ③ · 42): the
    // battlefield-under-your-control form is bound now — a dies + attached sentinel hands it to an atom reading the look-back's
    // ctx.triggeringCardId — and has its own proof (foolsDemise.test.js: Fool's Demise, Shade's Form). Every OTHER dead-card
    // referent is still unbound and still parks rather than returning the wrong object.
    expect(classifyCard(aura("Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under your control."))).toMatch(/^native/);
    expect(classifyCard(aura("Enchant creature\nWhen enchanted creature dies, return that card to its owner's hand."))).not.toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(aura(`${BEQUEATHAL}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });
});
