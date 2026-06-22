/**
 * manifest.test.js — the manifest-dread effect atom (MKM, CR 701.62).
 *
 * Proves: top-2 → one face-down 2/2 on the battlefield + the other in the graveyard (library shrinks by 2);
 * the face-down reads 2/2 / no keywords EVEN when faceUpCard is a 5/5 flyer (no leak); a +1/+1 counter makes
 * it 3/3 (layers apply); a face-down DYING deposits the REAL card in the OWNER's graveyard (not a nameless
 * 2/2); 1-card and 0-card libraries behave; an ETB watcher (Soul Warden analog) fires on the face-down's
 * entry; a subtype-ETB scope (Pantlaza "Dinosaur enters") does NOT fire (the face-down has no subtypes);
 * and the parseEffectClause registration path yields the atom.
 */
import { describe, it, expect } from "vitest";

import { createGameState, creaturePower, creatureToughness, destroyLethalCreatures, findPermanent } from "../../gameState.js";
import { checkDiesTriggers } from "../../triggers.js";
import { applyManifestDread, manifestCard, manifestClauseParser } from "./manifest.js";
import { ATOM_RESOLVERS } from "../effectAtoms.js";
import { parseEffectClause, registerClauseParser } from "../parser.js";

// A minimal library card. moveCardToZone / manifestCard match by `id`, so every card needs a unique one.
function card(id, over = {}) {
  return { id, name: id, type: "Creature — Human", power: 1, toughness: 1, ...over };
}

// A standard 1v1 game with `user`'s library set to `lib`; `ai` gets a throwaway library.
function gameWith(lib) {
  return createGameState({ userDeck: lib, aiDeck: [card("ai-filler")] });
}

const CTX = { controller: "user" };

describe("manifest-dread — core disposition", () => {
  it("looks at the top 2: one becomes a face-down 2/2 on the battlefield, the other to graveyard; library shrinks by 2", () => {
    const lib = [card("a"), card("b"), card("c", { type: "Sorcery", power: undefined, toughness: undefined })];
    const state = gameWith(lib);
    const out = applyManifestDread(state, { op: "manifest-dread" }, CTX);

    const bf = out.players.user.battlefield;
    const faceDowns = bf.filter((p) => p.faceDown);
    expect(faceDowns).toHaveLength(1);
    expect(out.players.user.graveyard).toHaveLength(1);
    expect(out.players.user.library).toHaveLength(1); // 3 - 2 looked at = 1
    // The card left in library is "c" (the third card was never looked at).
    expect(out.players.user.library[0].id).toBe("c");

    const fd = faceDowns[0];
    expect(fd.card.name).toBe("");
    expect(fd.card.power).toBe(2);
    expect(fd.card.toughness).toBe(2);
    expect(fd.card.keywords).toEqual([]);
    // The two looked-at cards (a, b) are the manifested one + the milled one.
    const gyId = out.players.user.graveyard[0].id;
    expect(["a", "b"]).toContain(gyId);
    expect(["a", "b"]).toContain(fd.faceUpCard.id);
    expect(fd.faceUpCard.id).not.toBe(gyId);
  });

  it("manifests the first CREATURE card (auto-pick keeps a turn-face-up meaningful), milling the noncreature", () => {
    // Top card is a Sorcery, second is a Creature → the creature is manifested, the sorcery milled.
    const lib = [card("spell", { type: "Sorcery", power: undefined, toughness: undefined }), card("beast", { type: "Creature — Beast" })];
    const out = applyManifestDread(gameWith(lib), { op: "manifest-dread" }, CTX);
    const fd = out.players.user.battlefield.find((p) => p.faceDown);
    expect(fd.faceUpCard.id).toBe("beast");
    expect(out.players.user.graveyard.map((c) => c.id)).toEqual(["spell"]);
  });
});

describe("manifest-dread — face-down hides the real card (no leak)", () => {
  it("a manifested 5/5 flyer reads as a 2/2 with no keywords on the battlefield", () => {
    const lib = [card("dragon", { type: "Creature — Dragon", power: 5, toughness: 5, keywords: ["flying"], oracle: "Flying" }), card("filler")];
    const out = applyManifestDread(gameWith(lib), { op: "manifest-dread" }, CTX);
    const fd = out.players.user.battlefield.find((p) => p.faceDown);
    // Effective (layer-resolved) P/T is 2/2, not the real card's 5/5.
    expect(creaturePower(fd, out)).toBe(2);
    expect(creatureToughness(fd, out)).toBe(2);
    expect(fd.card.keywords).toEqual([]);
    expect(fd.card.power).toBe(2);
    // The real card is reachable ONLY via faceUpCard — never via `card`.
    expect(fd.card.name).toBe("");
    expect(fd.faceUpCard.power).toBe(5);
    expect(fd.faceUpCard.keywords).toEqual(["flying"]);
  });

  it("a +1/+1 counter makes the face-down a 3/3 (CR 613 layer 7c applies to the 2/2 base)", () => {
    const lib = [card("x"), card("y")];
    let out = applyManifestDread(gameWith(lib), { op: "manifest-dread" }, CTX);
    const fdId = out.players.user.battlefield.find((p) => p.faceDown).id;
    // Add a +1/+1 counter directly to the permanent.
    out = {
      ...out,
      players: {
        ...out.players,
        user: {
          ...out.players.user,
          battlefield: out.players.user.battlefield.map((p) =>
            p.id === fdId ? { ...p, counters: { ...p.counters, "+1/+1": 1 } } : p),
        },
      },
    };
    const fd = findPermanent(out, fdId).permanent;
    expect(creaturePower(fd, out)).toBe(3);
    expect(creatureToughness(fd, out)).toBe(3);
  });
});

describe("manifest-dread — LTB unwrap (CR 701.40 / 110.5)", () => {
  it("a face-down that DIES deposits the REAL card in the owner's graveyard, never a nameless 2/2", () => {
    const lib = [card("hero", { type: "Creature — Soldier", power: 3, toughness: 3 }), card("filler")];
    let out = applyManifestDread(gameWith(lib), { op: "manifest-dread" }, CTX);
    const fdId = out.players.user.battlefield.find((p) => p.faceDown).id;
    // Mark lethal damage on the face-down (2 toughness) and run the lethal SBA.
    out = {
      ...out,
      players: {
        ...out.players,
        user: {
          ...out.players.user,
          battlefield: out.players.user.battlefield.map((p) =>
            p.id === fdId ? { ...p, damageMarked: 2 } : p),
        },
      },
    };
    const r = destroyLethalCreatures(out);
    out = checkDiesTriggers(r.state, r.dead);

    // The face-down is gone from the battlefield...
    expect(out.players.user.battlefield.find((p) => p.id === fdId)).toBeUndefined();
    // ...and the graveyard holds the REAL card (the milled "filler" + the unwrapped "hero"), NOT a nameless 2/2.
    const gyNames = out.players.user.graveyard.map((c) => c.name);
    expect(gyNames).toContain("hero");
    expect(gyNames).not.toContain("");
    const hero = out.players.user.graveyard.find((c) => c.name === "hero");
    expect(hero.power).toBe(3);     // the real card's P/T is restored
    expect(hero.toughness).toBe(3);
    expect(hero.faceDown).toBeUndefined(); // it's the printed card again, not the face-down snapshot
  });
});

describe("manifestCard (direct) — puts a specific card face down", () => {
  it("removes the chosen card from the library and manifests it face down (real card under faceUpCard)", () => {
    const lib = [card("top"), card("target", { type: "Creature — Beast", power: 7, toughness: 7 }), card("bottom")];
    const out = manifestCard(gameWith(lib), "user", lib[1]);
    const fd = out.players.user.battlefield.find((p) => p.faceDown);
    expect(fd.faceUpCard.id).toBe("target");
    expect(fd.card.power).toBe(2); // still a 2/2 face-down even though the real card is a 7/7
    // The target left the library; the other two stayed (manifestCard mills nothing).
    expect(out.players.user.library.map((c) => c.id)).toEqual(["top", "bottom"]);
    expect(out.players.user.graveyard).toHaveLength(0);
  });
});

describe("manifest-dread — boundary libraries", () => {
  it("a 1-card library manifests it with no mill and no error", () => {
    const out = applyManifestDread(gameWith([card("solo")]), { op: "manifest-dread" }, CTX);
    expect(out.players.user.battlefield.filter((p) => p.faceDown)).toHaveLength(1);
    expect(out.players.user.graveyard).toHaveLength(0);
    expect(out.players.user.library).toHaveLength(0);
  });

  it("a 0-card library is a logged no-op (nothing manifested, no throw)", () => {
    const state = gameWith([]);
    const out = applyManifestDread(state, { op: "manifest-dread" }, CTX);
    expect(out.players.user.battlefield).toHaveLength(0);
    expect(out.players.user.graveyard).toHaveLength(0);
    const last = out.log[out.log.length - 1];
    expect(last.effect).toBe("manifest-dread");
    expect(last.manifested).toBe(false);
    expect(last.looked).toBe(0);
  });
});

describe("manifest-dread — ETB trigger scoping", () => {
  it("a Soul-Warden-analog ETB watcher fires when the face-down enters", () => {
    const lib = [card("m1"), card("m2")];
    let state = gameWith(lib);
    // Put a Soul Warden ("Whenever another creature enters, you gain 1 life") on the user's battlefield.
    const watcher = {
      id: "sw-1",
      card: { id: "sw-1", name: "Soul Warden", type: "Creature — Human Cleric", power: 1, toughness: 1, oracle: "Whenever another creature enters, you gain 1 life." },
      controller: "user",
      tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, enteredOnTurn: 1,
    };
    state = { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [watcher] } } };
    const out = applyManifestDread(state, { op: "manifest-dread" }, CTX);
    // The face-down entered → Soul Warden's ETB trigger is enqueued (the watcher fired for "another creature").
    const fired = (out.pendingTriggers || []).filter((t) => t.source?.name === "Soul Warden");
    expect(fired.length).toBeGreaterThanOrEqual(1);
  });

  it("a subtype-ETB scope (Pantlaza 'Dinosaur enters') does NOT fire — the face-down has no subtypes", () => {
    const lib = [card("d1", { type: "Creature — Dinosaur" }), card("d2", { type: "Creature — Dinosaur" })];
    let state = gameWith(lib);
    // Pantlaza watches "another Dinosaur you control enters". The MANIFESTED card is a Dinosaur underneath, but
    // the FACE-DOWN permanent's type line is bare "Creature" — so the subtype scope must NOT match.
    const pantlaza = {
      id: "pant-1",
      card: { id: "pant-1", name: "Pantlaza, Sun-Favored", type: "Creature — Dinosaur", power: 4, toughness: 4, oracle: "Whenever Pantlaza or another Dinosaur you control enters, you may discover X." },
      controller: "user",
      tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, enteredOnTurn: 1,
    };
    state = { ...state, players: { ...state.players, user: { ...state.players.user, battlefield: [pantlaza] } } };
    const out = applyManifestDread(state, { op: "manifest-dread" }, CTX);
    const fired = (out.pendingTriggers || []).filter((t) => t.source?.name === "Pantlaza, Sun-Favored");
    expect(fired).toHaveLength(0);
  });
});

describe("manifest-dread — parser registration smoke", () => {
  it("the registered clause parser yields the atom and the resolver is known", () => {
    registerClauseParser(manifestClauseParser);
    const program = parseEffectClause("Manifest dread.", "Creature");
    expect(program).toBeTruthy();
    expect(Array.isArray(program.atoms)).toBe(true);
    expect(program.atoms.some((a) => a.op === "manifest-dread")).toBe(true);
    expect(typeof ATOM_RESOLVERS["manifest-dread"]).toBe("function");
  });

  it("the pure parser is anchored — it matches only the exact phrase", () => {
    expect(manifestClauseParser("manifest dread")).toEqual({ op: "manifest-dread" });
    expect(manifestClauseParser("MANIFEST DREAD")).toEqual({ op: "manifest-dread" });
    expect(manifestClauseParser("then manifest dread twice")).toBeNull();
    expect(manifestClauseParser("manifest")).toBeNull();
  });
});
