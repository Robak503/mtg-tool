/**
 * controlAura.test.js — "You control enchanted creature." (CR 613.1b), NEXT-QUEUE B1.
 *
 * ⛔ THE FAILURE MODE IS PERMANENT CONTROL THEFT, and it is unusually dangerous because a stolen-forever
 * creature is a LEGAL-LOOKING BOARD. No test crashes, no game wedges, no coverage number moves — the sim
 * just quietly plays on with the wrong player holding the creature. That is why the queue demanded "a test
 * that kills the Aura by EVERY route" before this was allowed to ship, and why the revert hangs off the one
 * verified battlefield-exit chokepoint rather than off each individual removal effect.
 *
 * ⭐ THE PREREQUISITE WAS VERIFIED BY MEASUREMENT BEFORE ANY CODE WAS WRITTEN, not assumed from reading:
 *   ATTACH  → gameState.attachPermanent is the only function that forms an attachment link
 *   DETACH  → gameState.detachPermanentFromAll has exactly ONE call site (the battlefield-exit path), and
 *             probing an attached Aura out to graveyard / exile / hand / library cleared the host's
 *             attachments every time
 * The control MOVE mirrors effects/atoms/control.js's applyGainControl: an array splice rather than
 * moveCardToZone, so the creature never LEAVES the battlefield — no dies/LTB fires, identity and tapped
 * state and counters and attachments all survive, and it is summoning-sick under its new controller
 * (CR 702.10c).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { isControlAura } from "./controlAura.js";
import { createGameState, createPermanent, attachPermanent, moveCardToZone, findPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MIND_CONTROL = { id: "ca", name: "Mind Control", type: "Enchantment — Aura", oracle: "Enchant creature\nYou control enchanted creature." };
const PACIFISM = { id: "cp", name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block." };
const BONESPLITTER = { id: "cb", name: "Bonesplitter", type: "Artifact — Equipment", oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const HOST = { id: "ch", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

function board(auraCard, { hostExtra = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const aura = createPermanent({ id: "A", controller: "user", card: auraCard });
  // ⚠️ hostExtra is applied AFTER construction on purpose: createPermanent drops `counters` from its opts
  // bag, so passing it in would silently produce a counter-less permanent and the survival assertion below
  // would pass for the wrong reason (nothing to preserve). Harness bug, not engine bug — but it would have
  // read as a green test either way.
  const host = Object.assign(createPermanent({ id: "H", controller: "ai", card: HOST }), hostExtra);
  return {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: [aura] }, ai: { ...s.players.ai, battlefield: [host] } },
  };
}
const controllerOf = (st, id) => findPermanent(st, id)?.controller ?? "GONE";
const attached = (auraCard, opts) => attachPermanent(board(auraCard, opts), { equipId: "A", targetId: "H" });

describe("recognition", () => {
  it("⭐ the exact printed line on an Aura", () => {
    expect(isControlAura(MIND_CONTROL)).toBe(true);
  });

  it("⛔ a non-control Aura and an Equipment are not", () => {
    expect(isControlAura(PACIFISM)).toBe(false);
    expect(isControlAura(BONESPLITTER)).toBe(false);
  });

  it("⛔ the same sentence on a NON-Aura does not count", () => {
    // The line only means "while attached" on an Aura. Anywhere else it is a different card that this
    // mechanism would mis-serve, so it stays unrecognised → Arbiter.
    expect(isControlAura({ name: "X", type: "Enchantment", oracle: "You control enchanted creature." })).toBe(false);
  });
});

describe("⭐ ATTACH — control moves", () => {
  it("⭐ the host changes controller", () => {
    expect(controllerOf(board(MIND_CONTROL), "H")).toBe("ai");     // before
    expect(controllerOf(attached(MIND_CONTROL), "H")).toBe("user"); // after
  });

  it("⛔ it is summoning-sick under its new controller (CR 702.10c)", () => {
    expect(findPermanent(attached(MIND_CONTROL), "H").permanent.summoningSick).toBe(true);
  });

  it("⛔ the permanent's OWN `.controller` field moves too — not just which array it sits in", () => {
    // ⚠️ THIS ASSERTION EXISTS BECAUSE A WITNESS CAUGHT ITS ABSENCE. findPermanent reports the ARRAY the
    // permanent is in, not its `.controller` field, so every control test here passed while reading only
    // half the truth: breaking the shared mover so the field never flipped left the ENTIRE 12,276-test suite
    // green. The two can silently disagree, and ~628 sites in this engine read the FIELD — a split-brain
    // there is exactly the legal-looking-board failure this whole slice is built to avoid.
    const st = attached(MIND_CONTROL);
    expect(findPermanent(st, "H").controller).toBe("user");            // the array
    expect(findPermanent(st, "H").permanent.controller).toBe("user");  // the field
  });

  it("⛔ and it moves BACK on revert, field included", () => {
    const st = moveCardToZone(attached(MIND_CONTROL), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "A" });
    expect(findPermanent(st, "H").permanent.controller).toBe("ai");
  });

  it("⛔ and it never LEFT the battlefield — tapped state and counters survive", () => {
    // The move is an array splice, not moveCardToZone. If it ever became a zone change, dies/LTB triggers
    // would fire on a creature that only changed hands.
    const st = attached(MIND_CONTROL, { hostExtra: { tapped: true, counters: { "+1/+1": 2 } } });
    const h = findPermanent(st, "H").permanent;
    expect(h.tapped).toBe(true);
    expect(h.counters["+1/+1"]).toBe(2);
  });

  it("⛔ CONTROL — a non-control Aura and an Equipment move nothing", () => {
    // The gate. Without it every attachment in the game would steal its host.
    expect(controllerOf(attached(PACIFISM), "H")).toBe("ai");
    expect(controllerOf(attached(BONESPLITTER), "H")).toBe("ai");
  });
});

describe("⛔ REVERT — the host goes home by EVERY route the Aura can leave", () => {
  // The assertion the whole slice exists for. Each of these is a different removal effect in play:
  // destroy/sacrifice → graveyard · exile effects → exile · bounce → hand · shuffle-in → library.
  for (const zone of ["graveyard", "exile", "hand", "library"]) {
    it(`⭐ aura → ${zone}`, () => {
      const st = moveCardToZone(attached(MIND_CONTROL), { playerId: "user", fromZone: "battlefield", toZone: zone, cardId: "A" });
      expect(controllerOf(st, "H")).toBe("ai");
    });
  }

  it("⛔ and the stash is cleared, so a later re-steal starts clean", () => {
    const gone = moveCardToZone(attached(MIND_CONTROL), { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "A" });
    const h = findPermanent(gone, "H").permanent;
    expect(h.controlStolenBy).toBeUndefined();
    expect(h.controlOriginal).toBeUndefined();
  });

  it("⛔ a SECOND control Aura on the same host leaving does not undo the FIRST one's theft", () => {
    // ⚠️ THIS TEST WAS HOLLOW AND A MUTATION CAUGHT IT. The first version put an unattached second Aura on
    // the battlefield and killed it — but revertControlAura returns early when `attachedTo` is unset, so the
    // controlStolenBy guard was never reached and M145 (drop that guard) survived. The guard only matters
    // when a DIFFERENT aura is genuinely attached to the same host, which is what this now does.
    let st = attached(MIND_CONTROL);                                   // user takes H from ai
    const second = createPermanent({ id: "A2", controller: "user", card: { ...MIND_CONTROL, id: "ca2", name: "Second Control" } });
    st = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [...st.players.user.battlefield, second] } } };
    st = attachPermanent(st, { equipId: "A2", targetId: "H" });        // same controller → no further move
    expect(controllerOf(st, "H")).toBe("user");
    st = moveCardToZone(st, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "A2" });
    expect(controllerOf(st, "H")).toBe("user");   // the FIRST aura still holds it — A2 never took it
  });
});

describe("⚠️ KNOWN SIMPLIFICATION — pinned, not hidden", () => {
  it("two control Auras: removing the second sends the host all the way HOME, not to the first", () => {
    // The stash is single-level: the host remembers only its ORIGINAL controller. CR would hand it to the
    // remaining Aura's controller. Rare enough to defer, wrong enough to write down — if this test ever
    // starts failing because someone made the stash a stack, that is an improvement, not a regression.
    let st = attached(MIND_CONTROL);                       // user steals from ai
    const second = createPermanent({ id: "A2", controller: "ai", card: { ...MIND_CONTROL, id: "ca2", name: "Second Control" } });
    st = { ...st, players: { ...st.players, ai: { ...st.players.ai, battlefield: [...st.players.ai.battlefield, second] } } };
    st = attachPermanent(st, { equipId: "A2", targetId: "H" });   // ai steals it back
    expect(controllerOf(st, "H")).toBe("ai");
    st = moveCardToZone(st, { playerId: "ai", fromZone: "battlefield", toZone: "graveyard", cardId: "A2" });
    expect(controllerOf(st, "H")).toBe("ai");               // home is the ORIGINAL owner, not the first thief
  });
});
