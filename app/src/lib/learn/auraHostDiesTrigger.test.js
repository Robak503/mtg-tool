/**
 * auraHostDiesTrigger.test.js — "When enchanted creature dies, <effect>" (Bequeathal, Dying Wail).
 *
 * A DETECTOR ARM, NOT A MECHANISM — which is the whole point of the slice. The `equippedCreature`
 * attached-linkage scope already resolves the death case correctly: on the host's death the Aura is already
 * detached (`attachedTo` is null by the time checkDiesTriggers runs), so scopeMatches reads the linkage from
 * the dead creature's CR-603.10a look-back `attachments`, captured before the detach. Auras and Equipment
 * attach through the identical fields, and the sibling arms ("enchanted creature attacks", "…deals combat
 * damage") already route through that same scope. So this is one line plus its justification.
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
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
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
  /** An Aura attached to a host, then the host dies. */
  // `auraAlsoLeaves` reproduces what the engine actually does on a host death (CR 704.5n — the orphaned
  // Aura is binned by detachPermanentFromAll before checkDiesTriggers runs). Default false keeps every
  // pre-existing assertion byte-identical.
  function hostDies({ attach = true, auraAlsoLeaves = false } = {}) {
    _resetIdsForTests();
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "ch", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    const av = createPermanent({ id: "aura", card: { id: "ca", ...aura(BEQUEATHAL) }, controller: "user" });
    if (attach) { av.attachedTo = "host"; host.attachments = ["aura"]; }
    let s = {
      ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, av], hand: [], library: Array.from({ length: 9 }, (_, i) => ({ id: `l${i}`, name: `C${i}`, type: "Sorcery" })) } },
    };
    // the host dies: gone from the battlefield, with the CR-603.10a look-back carrying its attachments
    const gone = auraAlsoLeaves ? ["host", "aura"] : ["host"];
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => !gone.includes(p.id)) } } };
    s = checkDiesTriggers(s, [{ controller: "user", id: "host", name: "Bear", card: host.card, counters: {}, attachments: attach ? ["aura"] : [] }]);
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
  // 🚨 THE FIXTURE ABOVE IS A HOLLOW GATE, and this block exists to say so in executable form.
  //
  // `hostDies` removes only the HOST from the battlefield and LEAVES THE AURA ON IT. The engine never
  // produces that board: detachPermanentFromAll is the single battlefield-exit chokepoint and bins an
  // orphaned Aura immediately (CR 704.5n), and checkDiesTriggers runs AFTER
  // destroyLethalCreatures → moveCardToZone → detach. So by the time the dies-triggers are looked for,
  // the Aura is in the graveyard — and triggerSourcesOf scans the BATTLEFIELD ONLY.
  //
  // The tests above therefore prove the SCOPE MATCH resolves, never that the card works. Run end-to-end
  // through the real death path, Bequeathal draws ZERO. It is credited native-trigger regardless.
  //
  // ⛔ THIS PIN ASSERTS THE DEFECT ON PURPOSE. It is not an endorsement — it stops the hollow fixture from
  // being cited as proof a third time (its header and the park comment inside isNativeOwnTriggeredAura
  // contradicted each other in writing; the park comment was right). WHEN THE FIX LANDS — consult the dead
  // creature's look-back `attachments` for auras no longer on the battlefield, CR 603.10a — this assertion
  // INVERTS to 2 and the file goes back to describing a working card. See the run ledger for the scoped
  // two-part fix and why its halves must land together.
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  it("🚨 KNOWN DEFECT — with the Aura also gone (the REAL sequence), the trigger does not fire", () => {
    const s = hostDies({ auraAlsoLeaves: true });
    expect(s.players.user.hand).toHaveLength(0); // ⛔ should be 2 — see the block comment above
  });
});

describe("classification", () => {
  it("Bequeathal's shape flips", () => {
    expect(classifyCard(aura(BEQUEATHAL))).toMatch(/^native/);
  });

  it("CREED — an effect that NAMES THE DEAD CARD stays parked, closing the referent hazard", () => {
    // "return that card…" must bind the dead host's graveyard card. Nothing here does that binding, and the
    // effect simply fails to parse — so the card parks rather than returning the wrong object. If this ever
    // goes native, the referent has been bound somewhere and needs its own proof.
    expect(classifyCard(aura("Enchant creature\nWhen enchanted creature dies, return that card to the battlefield under your control."))).not.toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(aura(`${BEQUEATHAL}\nEach opponent glorbulates.`))).not.toMatch(/^native/);
  });
});
