/**
 * roleTokens.test.js — ROLE TOKENS phase 1 (CR 303.4 Auras, Wilds of Eldraine).
 *
 * "Create a <Role> Role token attached to target creature you control." A Role is an AURA token: it enters
 * ATTACHED, and its entire effect flows from that attachment.
 *
 * ⭐ WHY THIS WAS TRACTABLE: the runtime was proven BEFORE any code was written. A hand-built Aura token
 * carrying `attachedTo` already derived correctly on its host (Monster → 3/3 + trample; Cursed → base 1/1; the
 * same token unattached → nothing). So phase 1 is a registry + a parse arm + an attach on mint, not new layers.
 *
 * ⛔ THE REFUSALS ARE HALF THE SLICE, and they are two DIFFERENT refusals:
 *   • Wicked / Young Hero — defined in the bundled data, but their bodies are unmodeled (both classify
 *     body-only as Auras). Minting them would hand the player a token whose ability silently does nothing —
 *     the phantom-mana mistake in a new costume, which is the bar NAMED_TOKENS sets for itself.
 *   • Chef / Questing / Huntsman — cards ASK for them, but NO definition exists in the bundled data, so their
 *     text cannot be written at all (CLAUDE.md §1.2). Permanent refusal until the data carries them.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { NAMED_TOKENS, applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { deriveCharacteristics } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = { name: "Probe", type: "Sorcery", mana: "{1}{G}" };
const tierOf = (oracle) => classifyCard({ ...SORCERY, mana: "{1}{G}", oracle });

/**
 * ⚠️ WHY THE DATA-PINNING CHECK IS NOT IN THIS FILE.
 * The vitest suite is HERMETIC: `allCards()` THROWS in here (verified — cardIndex has no corpus in the test
 * environment). So a "registry matches the bundled token objects byte-for-byte" assertion cannot live in a
 * unit test; writing one that silently skips when the corpus is absent would be a hollow gate.
 * It lives instead as a corpus-backed GATE: `node scripts/verify-role-token-data.mjs` (needs MTG_APP_ROOT).
 * That script already earned its keep — it caught Royal's missing ward reminder on its first run.
 * What IS hermetic and therefore tested here: registry shape, body executability, the parse arms, the
 * refusals, and the runtime attachment.
 */

describe("⭐ the registry's shape and executability (hermetic half)", () => {
  const REGISTERED = ["cursed", "monster", "royal", "sorcerer", "virtuous"];

  it("every registered Role is an Aura token whose BODY the engine can execute", () => {
    // The registry's own bar: minting a token must hand over a permanent the engine actually drives.
    for (const key of REGISTERED) {
      const spec = NAMED_TOKENS[key];
      expect(spec.aura).toBe(true);
      expect(spec.type).toMatch(/Aura Role/);
      expect(isNativeTier(classifyCard({ name: spec.name, type: spec.type, mana: "", oracle: spec.oracle }))).toBe(true);
    }
  });

  it("⛔ the five UNREGISTERED Roles are absent, for two different reasons", () => {
    // Wicked / Young Hero: defined in the data but their bodies are unmodeled (checked in the gate script).
    // Chef / Questing / Huntsman: no bundled definition exists at all, so their text cannot be written.
    const names = Object.values(NAMED_TOKENS).map((s) => s.name);
    for (const n of ["Wicked", "Young Hero", "Chef", "Questing", "Huntsman"]) expect(names).not.toContain(n);
  });

  it("⛔ and their bodies really are non-native — asserted on the PRINTED text, not on absence alone", () => {
    // Absence proves nothing on its own (ABSENCE ≠ VALUE). These two strings are the printed Role bodies; if a
    // future slice models either one, THIS test fails and tells the next builder to register that Role.
    const wicked = "Enchant creature\nEnchanted creature gets +1/+1.\nWhen this Aura is put into a graveyard from the battlefield, each opponent loses 1 life.";
    const youngHero = 'Enchant creature\nEnchanted creature has "Whenever this creature attacks, if its toughness is 3 or less, put a +1/+1 counter on it."';
    for (const [n, body] of [["Wicked", wicked], ["Young Hero", youngHero]]) {
      expect(isNativeTier(classifyCard({ name: n, type: "Token Enchantment — Aura Role", mana: "", oracle: body })), `${n} body became native — register it`).toBe(false);
    }
  });
});

describe("parse — only the MEASURED targeted phrasings", () => {
  it("the four targeted forms all classify native", () => {
    expect(isNativeTier(tierOf("Create a Monster Role token attached to target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Cursed Role token attached to up to one target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Royal Role token attached to another target creature you control."))).toBe(true);
    expect(isNativeTier(tierOf("Create a Sorcerer Role token attached to up to one target creature."))).toBe(true);
  });

  it("⛔ an UNREGISTERED Role never parses — it must not mint a do-nothing token", () => {
    for (const role of ["Wicked", "Young Hero", "Chef", "Questing", "Huntsman"]) {
      expect(isNativeTier(tierOf(`Create a ${role} Role token attached to target creature you control.`))).toBe(false);
    }
  });

  it("⛔ the REFERENT forms stay unmatched (they need a self-reference) — a safe false negative", () => {
    expect(isNativeTier(tierOf("Create a Monster Role token attached to that creature."))).toBe(false);
    expect(isNativeTier(tierOf("Create a Monster Role token attached to it."))).toBe(false);
  });
});

describe("⛔⭐ runtime — the token enters ATTACHED, with BOTH sides of the link", () => {
  const boardWithBear = () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "bear", card: { id: "cb", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
  };
  const mint = (state, token, targets) => applyCreateNamedToken(state, { op: "create-named-token", token, count: 1 }, { controller: "user", targets });

  it("⭐ both link directions are set, and the host actually gets the buff", () => {
    // Stamping `attachedTo` by hand would pass a one-sided check while staying invisible to every reader that
    // walks the HOST's `attachments` (the ATTACHED-watcher scan in combat triggers, for one). Assert both.
    const after = mint(boardWithBear(), "monster", [{ type: "creature", id: "bear" }]);
    const role = after.players.user.battlefield.find((p) => p.card?.name === "Monster");
    const host = findPermanent(after, "bear").permanent;
    expect(role).toBeTruthy();
    expect(role.attachedTo).toBe("bear");
    expect(host.attachments).toContain(role.id);

    const d = deriveCharacteristics(after, "bear");
    expect(d.power).toBe(3);
    expect(d.toughness).toBe(3);
    const kws = (Array.isArray(d.keywords) ? d.keywords : d.keywords instanceof Set ? [...d.keywords] : Object.keys(d.keywords || {})).map((x) => String(x).toLowerCase());
    expect(kws).toContain("trample");
  });

  it("Cursed sets the host's BASE P/T (a different layer than a +1/+1 bonus)", () => {
    const after = mint(boardWithBear(), "cursed", [{ type: "creature", id: "bear" }]);
    const d = deriveCharacteristics(after, "bear");
    expect(d.power).toBe(1);
    expect(d.toughness).toBe(1);
  });

  it("⛔⭐ NO legal object to enchant → the token is NOT created (CR 303.4)", () => {
    // THE guard. Minting unattached would put a permanent on the battlefield the rules say shouldn't exist,
    // whose buff applies to nobody. Covers the legal zero-target choice on "up to one …" forms.
    const none = mint(boardWithBear(), "monster", []);
    expect(none.players.user.battlefield).toHaveLength(1);
    expect(none.players.user.battlefield[0].card.name).toBe("Bear");
  });

  it("⛔ a target that has LEFT the battlefield also creates nothing", () => {
    const gone = mint(boardWithBear(), "monster", [{ type: "creature", id: "vanished" }]);
    expect(gone.players.user.battlefield).toHaveLength(1);
  });

  it("⛔ the ARTIFACT named tokens are untouched — still free-standing, no attachment", () => {
    const after = mint(boardWithBear(), "treasure", []);
    const treasure = after.players.user.battlefield.find((p) => p.card?.name === "Treasure");
    expect(treasure).toBeTruthy();
    expect(treasure.attachedTo).toBeFalsy(); // createPermanent seeds it null, not undefined
  });
});
