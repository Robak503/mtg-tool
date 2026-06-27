/**
 * staticHexproofShroud.test.js — STATIC-HEXPROOF-SHROUD: admit hexproof + shroud to the static grant set
 * (GRANTABLE_STATIC_KEYWORDS), so the anthem / equipment / token paths can grant them.
 *
 * Enforcement is COMPLETE + layer-aware: canBeTargetedBy (spellEffects.js) reads permanentHasKeyword over
 * continuousEffects, so a GRANTED hexproof/shroud excludes the permanent from targeting exactly like a
 * printed one — and targeting-exclusion is the ENTIRETY of what these keywords do (no partial behavior,
 * no false-positive native). Flips (all body-only → native): anthems (Crystalline Sliver "All Slivers
 * have shroud", Asceticism/Privileged Position "have hexproof", Drogskol Captain/Lord of the Unreal/Scion
 * of Oona), equipment (Lightning Greaves, Mask of Avacyn), token-makers (Deeproot Waters, Jungleborn
 * Pioneer), and Angelic Overseer's GATED self-grant. A quoted-ability grant + an un-enforced keyword
 * (shadow) still route to the Arbiter (FN-safe).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { canBeTargetedBy } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── 1. Coverage flips ────────────────────────────────────────────────────────────
describe("static-hexproof-shroud — coverage flips", () => {
  it("shroud / hexproof anthems flip native-static", () => {
    expect(classifyCard({ type: "Creature — Sliver", name: "Crystalline Sliver", oracle: "All Slivers have shroud." })).toBe("native-static");
    expect(classifyCard({ type: "Enchantment", name: "Hanna's Custody", oracle: "All artifacts have shroud." })).toBe("native-static");
    expect(classifyCard({ type: "Enchantment", name: "Privileged Position", oracle: "Other permanents you control have hexproof." })).toBe("native-static");
    expect(classifyCard({ type: "Creature — Spirit Soldier", name: "Drogskol Captain", oracle: "Flying\nOther Spirit creatures you control get +1/+1 and have hexproof." })).toBe("native-static");
  });
  it("equipment + token-maker grants flip native", () => {
    expect(classifyCard({ type: "Artifact — Equipment", name: "Lightning Greaves", oracle: "Equipped creature has haste and shroud.\nEquip {0}" })).toBe("native-equipment");
    expect(classifyCard({ type: "Artifact — Equipment", name: "Mask of Avacyn", oracle: "Equipped creature gets +1/+2 and has hexproof.\nEquip {3}" })).toBe("native-equipment");
    expect(classifyCard({ type: "Creature — Merfolk Scout", name: "Jungleborn Pioneer", oracle: "When this creature enters, create a 1/1 blue Merfolk creature token with hexproof." })).toBe("native-trigger");
  });
  it("Angelic Overseer's GATED self-grant flips native-static", () => {
    expect(classifyCard({ type: "Creature — Angel", name: "Angelic Overseer", power: 5, toughness: 3, oracle: "Flying\nAs long as you control a Human, this creature has hexproof and indestructible." })).toBe("native-static");
  });
});

// ─── 2. Enforcement (layer-aware targeting) ────────────────────────────────────────
describe("static-hexproof-shroud — a granted instance is honored by canBeTargetedBy", () => {
  it("Asceticism anthem: your creature gains hexproof (opponent can't target; you can)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const asceticism = createPermanent({ id: "asc", card: { id: "asc", name: "Asceticism", type: "Enchantment", oracle: "Creatures you control have hexproof.\n{1}{G}: Regenerate target creature." }, controller: "user" });
    const bear = createPermanent({ id: "bear", card: { id: "bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [asceticism, bear] } } };
    expect(permanentHasKeyword(s, "bear", "Hexproof")).toBe(true);
    const cre = s.players.user.battlefield.find(p => p.id === "bear");
    expect(canBeTargetedBy(s, cre, "user", "ai")).toBe(false);   // opponent can't target
    expect(canBeTargetedBy(s, cre, "user", "user")).toBe(true);  // controller still can (hexproof, not shroud)
  });
  it("Crystalline Sliver: ALL Slivers (yours AND the opponent's) gain shroud (untargetable by anyone)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const crystalline = createPermanent({ id: "cry", card: { id: "cry", name: "Crystalline Sliver", type: "Creature — Sliver", power: 1, toughness: 1, oracle: "All Slivers have shroud." }, controller: "user" });
    const oppSliver = createPermanent({ id: "osl", card: { id: "osl", name: "Muscle Sliver", type: "Creature — Sliver", power: 2, toughness: 2 }, controller: "ai" });
    const oppBear = createPermanent({ id: "obr", card: { id: "obr", name: "Grizzly", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "ai" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [crystalline] }, ai: { ...s.players.ai, battlefield: [oppSliver, oppBear] } } };
    expect(permanentHasKeyword(s, "osl", "Shroud")).toBe(true);  // opponent's Sliver also has shroud
    expect(permanentHasKeyword(s, "obr", "Shroud")).toBe(false); // a non-Sliver does not
    const oppSl = s.players.ai.battlefield.find(p => p.id === "osl");
    expect(canBeTargetedBy(s, oppSl, "ai", "user")).toBe(false); // shroud → untargetable by anyone
  });
  it("Angelic Overseer GATE: no hexproof/indestructible without a Human; both WITH a Human", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const overseer = createPermanent({ id: "ov", card: { id: "ov", name: "Angelic Overseer", type: "Creature — Angel", power: 5, toughness: 3, oracle: "Flying\nAs long as you control a Human, this creature has hexproof and indestructible." }, controller: "user" });
    // alone (Overseer is an Angel, not a Human)
    let sA = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [overseer] } } };
    expect(permanentHasKeyword(sA, "ov", "Hexproof")).toBe(false);
    expect(permanentHasKeyword(sA, "ov", "Indestructible")).toBe(false);
    // + a Human → gate met
    const human = createPermanent({ id: "hu", card: { id: "hu", name: "Soldier", type: "Creature — Human Soldier", power: 1, toughness: 1 }, controller: "user" });
    let sB = { ...sA, players: { ...sA.players, user: { ...sA.players.user, battlefield: [overseer, human] } } };
    expect(permanentHasKeyword(sB, "ov", "Hexproof")).toBe(true);
    expect(permanentHasKeyword(sB, "ov", "Indestructible")).toBe(true);
  });
});

// ─── 3. CREED non-flips ────────────────────────────────────────────────────────────
describe("static-hexproof-shroud — CREED: un-enforced keyword / quoted ability stay Arbiter", () => {
  it("a quoted granted ability ('All Slivers have \"{T}: ...\"') stays body-only", () => {
    expect(classifyCard({ type: "Creature — Sliver", name: "Crypt Sliver", oracle: 'All Slivers have "{T}: Regenerate target Sliver."' })).toBe("body-only");
  });
  it("an un-enforced keyword (shadow) anthem stays body-only", () => {
    expect(classifyCard({ type: "Creature — Sliver", name: "Shadow Sliver", oracle: "All Sliver creatures have shadow." })).toBe("body-only");
  });
});
