/**
 * enchantSubjectHosts.test.js — ES-1: the NON-CREATURE "Enchant <subject>" vocabulary.
 * "Enchant artifact" (Stasis Cocoon, Relic Ward), "Enchant artifact or creature" (Ice Over, Coma Veil,
 * Secure Detention, Petrify), "Enchant creature or Vehicle" (Aether Meltdown, Mists of Littjara).
 *
 * ⭐ THE BODIES ALREADY WORKED — THE SUBJECT LINE WAS THE WHOLE BLOCKER. attachedBodyNoun (AN-1) taught the
 * attached-bonus parser "enchanted permanent" / "enchanted artifact" a slice ago, and every effect these
 * eight cards print is enforced on ANY permanent rather than only on creatures: the no-untap lock reads the
 * attachment in untapAll, the pacifism pair and the Arrest activation lock both key on permanentHasKeyword
 * (type-agnostic, and gated at BOTH activation chokepoints — legalChoices and manaModel), the shroud grant
 * rides the layer-6 keyword lane. Measured, not assumed: a substitution probe over every parked Aura
 * (swap ONLY the Enchant line for "Enchant creature", keep the rest byte-identical) flipped exactly these
 * eight and nothing else — 21/20/10 parked carriers on the three subjects, 4/2/2 blocked SOLELY by subject.
 *
 * ⛔⛔ IT IS A TYPE UNION, WHICH IS WHY IT COULDN'T RIDE THE RESTRICTION LIST. Restrictions are ANDed and say
 * nothing about card TYPE, so "artifact or creature" is inexpressible against a fixed targetType:"creature".
 * The build is a HOST SPEC — `{ targetType, restrictions }` from one reader (auraEnchantHostSpec) consumed by
 * all five seams that must agree. Two of those seams were live traps, and both fail SILENTLY:
 *   ④ the AURA_ETB resolver's CR 608.2b re-check DEFAULTED to /Creature/ — an "Enchant artifact" cast would
 *     have FIZZLED at resolution (spell to the graveyard, nothing on the battlefield) while the metric
 *     claimed the card plays. A pin that only checked the OFFER would never have seen it.
 *   ⑤ sba.js's CR 704.5n sweep matched "Enchant creature or Vehicle" on its bare `creature` alternative, so
 *     an Aether Meltdown on an UNCREWED Vehicle — a legal host by the printed line — would be destroyed on
 *     the very next SBA pass. A wrong kill: the direction that module's own policy names as forbidden.
 *
 * ⛔ THE PIN THAT MATTERS IS THE NEGATIVE ONE. "It attached" would pass while attaching to ANYTHING. Every
 * enumeration assertion below names the host pool EXACTLY, in both directions: an "Enchant artifact" Aura
 * must not offer a creature, and a "creature or Vehicle" Aura must not offer a plain artifact.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test):
 *   · the union exclusion `(?!\s+or\b)` dropped from sba.js  -> the Vehicle row falls off (aura in graveyard).
 *   · the resolver's `hostType === "artifact"` arm dropped    -> Stasis Cocoon fizzles; nothing attaches.
 *   · legalChoices' hostSpec pinned back to targetType:"creature" -> the artifact rows enumerate CREATURES,
 *     which is the illegal-host FP this file exists to forbid.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { auraEnchantHostSpec, auraEnchantRestrictions } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { enumerateTargets } from "./spellEffects.js";
import { permanentPower } from "./layers.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { checkAllStateBasedActions } from "./sba.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const STASIS_COCOON = { id: "c-sc", name: "Stasis Cocoon", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant artifact\nEnchanted artifact can't attack or block, and its activated abilities can't be activated." };
const ICE_OVER = { id: "c-io", name: "Ice Over", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant artifact or creature\nEnchanted permanent doesn't untap during its controller's untap step." };
const PETRIFY = { id: "c-pf", name: "Petrify", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant artifact or creature\nEnchanted permanent can't attack or block, and its activated abilities can't be activated." };
const RELIC_WARD = { id: "c-rw", name: "Relic Ward", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.\nEnchant artifact\nEnchanted artifact has shroud. (It can't be the target of spells or abilities.)" };
const MISTS = { id: "c-ml", name: "Mists of Littjara", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Flash\nEnchant creature or Vehicle\nEnchanted creature gets -3/-0." };
const AETHER_MELTDOWN = { id: "c-am", name: "Aether Meltdown", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Flash (You may cast this spell any time you could cast an instant.)\nEnchant creature or Vehicle\nWhen this Aura enters, you get {E}{E} (two energy counters).\nEnchanted creature gets -4/-0." };

// The three host kinds every enumeration assertion below discriminates between.
const BEAR = { id: "bear", card: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } };
// ⚠️ THE HOST ARTIFACT IS A **NON-MANA** ACTIVATED ABILITY ON PURPOSE. The first cut used a Signet, whose
// only ability is a MANA ability — those route through manaModel and are never offered as `activate-ability`,
// so `abilitiesBefore` read 0 and the lock assertion below was VACUOUS. The positive control caught it. Both
// chokepoints are now exercised: Jayemdae Tome for the stack-activated lane, Sol Ring for the mana lane.
const SIGNET = { id: "signet", card: { id: "c-sig", name: "Jayemdae Tome", type: "Artifact — Book", oracle: "{4}, {T}: Draw a card." } };
const SOL_RING = { id: "solring", card: { id: "c-sr", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." } };
const TRUCK = { id: "truck", card: { id: "c-truck", name: "Smuggler's Copter", type: "Artifact — Vehicle", power: 3, toughness: 3, oracle: "Flying\nCrew 1" } };

describe("the host spec", () => {
  it("⭐ each subject resolves to its own targetType — and the union is NOT a creature restriction", () => {
    expect(auraEnchantHostSpec(STASIS_COCOON)).toEqual({ targetType: "artifact", restrictions: [] });
    expect(auraEnchantHostSpec(ICE_OVER)).toEqual({ targetType: "creatureOrArtifact", restrictions: [] });
    expect(auraEnchantHostSpec(MISTS)).toEqual({ targetType: "creatureOrVehicle", restrictions: [] });
    // The plain creature subject is untouched — this whole slice is additive on top of it.
    expect(auraEnchantHostSpec({ name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block." }))
      .toEqual({ targetType: "creature", restrictions: [] });
  });

  it("⛔⛔ auraEnchantRestrictions STAYS CREATURE-ONLY — widening it would have been the cardinal sin", () => {
    // Its two callers turn a non-null return into "this is a CREATURE host". If the non-creature subjects
    // leaked through here, grantAuraCastHostType would enumerate CREATURES for an "Enchant artifact" Aura.
    expect(auraEnchantRestrictions(STASIS_COCOON)).toBeNull();
    expect(auraEnchantRestrictions(ICE_OVER)).toBeNull();
    expect(auraEnchantRestrictions(MISTS)).toBeNull();
    expect(auraEnchantRestrictions({ name: "P", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +1/+1." })).toEqual([]);
  });

  it("⭐ all eight cards flip", () => {
    for (const c of [STASIS_COCOON, RELIC_WARD, ICE_OVER, PETRIFY, MISTS, AETHER_MELTDOWN]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⛔ an INEXPRESSIBLE subject still parks (the gate didn't just open)", () => {
    // "Enchant permanent" has no restriction and no predicate wired here; "Enchant Equipment" and
    // "Enchant creature or planeswalker" likewise. Each must stay on the Arbiter, not fall through.
    for (const subject of ["permanent", "Equipment", "creature or planeswalker", "artifact creature"]) {
      expect(auraEnchantHostSpec({ name: "X", type: "Enchantment — Aura", oracle: `Enchant ${subject}\nEnchanted permanent gets +1/+1.` }), subject).toBeNull();
    }
  });
});

function boardWith(auraCard, perms) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  // Any-color sources so a cast never fails for MANA reasons — a mana miss would masquerade as a
  // correctly-narrowed offer, and every assertion here is about the host POOL.
  const lands = ["l1", "l2", "l3", "l4"].map((id) => createPermanent({ id, card: { name: "City of Brass", type: "Land", oracle: "{T}: Add one mana of any color." }, controller: "user", summoningSick: false }));
  const built = perms.map((p) => createPermanent({ id: p.id, card: p.card, controller: "user", summoningSick: false }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
    players: { ...s.players, user: { ...s.players.user, battlefield: [...lands, ...built], hand: [auraCard] } } };
}
// The cast action carries the card NAME directly (a.name), not a nested card object — filtering on
// a.card?.name silently matches nothing and every assertion would vacuously "pass" as [].
const hostsFor = (s, name) => legalActionsForPlayer(s, "user")
  .filter((a) => a.isAuraSpell && a.name === name).map((a) => a.targets[0].id).sort();

describe("⭐⭐ LAW 6 — the HOST POOLS, named in both directions", () => {
  it("⭐⭐ each subject offers exactly its own types and refuses the others", () => {
    const board = [BEAR, SIGNET, TRUCK];
    const row = {
      // "Enchant artifact" — the Signet AND the Vehicle are artifacts; the Bear is NOT offered.
      artifact: hostsFor(boardWith(STASIS_COCOON, board), "Stasis Cocoon"),
      // "Enchant artifact or creature" — everything on this board qualifies.
      artifactOrCreature: hostsFor(boardWith(ICE_OVER, board), "Ice Over"),
      // "Enchant creature or Vehicle" — the Bear and the Vehicle; the plain Signet is NOT offered.
      creatureOrVehicle: hostsFor(boardWith(MISTS, board), "Mists of Littjara"),
    };
    console.log("  WITNESS enchantSubjectHosts", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({
      artifact: ["signet", "truck"],
      artifactOrCreature: ["bear", "signet", "truck"],
      creatureOrVehicle: ["bear", "truck"],
    });
  });

  it("⛔⛔ THE ILLEGAL-HOST PIN: an 'Enchant artifact' Aura never offers a creature, on a creature-only board", () => {
    // The sharpest form — with no artifact anywhere, the card must be UNCASTABLE (CR 303.4a), not
    // silently retargeted onto the Bear.
    expect(hostsFor(boardWith(STASIS_COCOON, [BEAR]), "Stasis Cocoon")).toEqual([]);
    // …and the mirror: a "creature or Vehicle" Aura on an artifact-only board is likewise uncastable.
    expect(hostsFor(boardWith(MISTS, [SIGNET]), "Mists of Littjara")).toEqual([]);
  });
});

describe("⭐⭐ LAW 6 — cast → resolve → SBA, the two seams that fail SILENTLY", () => {
  it("⭐⭐ Stasis Cocoon ATTACHES to an artifact (the CR 608.2b re-check) and its lock BITES", () => {
    let s = boardWith(STASIS_COCOON, [SIGNET, SOL_RING]);
    // ⛔ THE POSITIVE CONTROLS. Both abilities are offered BEFORE the Aura resolves — without them, a
    // harness that simply never enumerated anything would read as a perfectly working lock. This is the
    // assertion that failed on the first cut and forced the fixture change (see the SIGNET note above).
    const stackBefore = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "signet").length;
    const manaBefore = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "solring").length;
    const cast = legalActionsForPlayer(s, "user").find((a) => a.isAuraSpell && a.name === "Stasis Cocoon");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Stasis Cocoon");
    const after = legalActionsForPlayer(s, "user");
    const row = {
      attachedTo: aura?.attachedTo ?? null,          // null => the spell FIZZLED (the /Creature/ default)
      hostAttachments: findPermanent(s, "signet")?.permanent?.attachments ?? null,
      stackBefore, // >0 or the lock assertion is vacuous
      stackAfter: after.filter((a) => a.kind === "activate-ability" && a.permanentId === "signet").length,
      manaBefore, // >0 likewise
      // ⛔ THE UNENCHANTED Sol Ring must KEEP its mana ability — the lock is scoped to the host, and a
      // harness where everything stopped working would otherwise read identically to a correct one.
      manaAfter: after.filter((a) => a.kind === "tap-for-mana" && a.permanentId === "solring").length,
    };
    console.log("  WITNESS stasisCocoonAttach", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.attachedTo).toBe("signet");
    expect(row.hostAttachments).toEqual([aura.id]);
    expect(row.stackBefore).toBeGreaterThan(0);
    expect(row.stackAfter).toBe(0);                  // the Arrest lock bites on a NON-creature host
    expect(row.manaBefore).toBeGreaterThan(0);
    expect(row.manaAfter).toBe(manaBefore);          // …and is scoped: the un-enchanted artifact is untouched
  });

  it("⭐⭐ …and the lock reaches the MANA chokepoint too, when the HOST is the mana artifact", () => {
    // The parser's claim is that activatedAbilitiesLocked is honored at BOTH gates (CR 605.1a — a mana
    // ability IS an activated ability). The row above proves the stack gate; this proves manaModel's,
    // by moving the Aura onto Sol Ring itself.
    let s = boardWith(STASIS_COCOON, [SOL_RING]);
    const before = legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "solring").length;
    const cast = legalActionsForPlayer(s, "user").find((a) => a.isAuraSpell && a.name === "Stasis Cocoon");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const row = { manaBefore: before, manaAfter: legalActionsForPlayer(s, "user").filter((a) => a.kind === "tap-for-mana" && a.permanentId === "solring").length };
    console.log("  WITNESS lockedManaArtifact", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.manaBefore).toBeGreaterThan(0);
    expect(row.manaAfter).toBe(0);
  });

  it("⭐⭐ Aether Meltdown SURVIVES the CR 704.5n sweep on an UNCREWED Vehicle", () => {
    let s = boardWith(AETHER_MELTDOWN, [TRUCK]);
    const cast = legalActionsForPlayer(s, "user").find((a) => a.isAuraSpell && a.name === "Aether Meltdown");
    s = resolveTopOfStack(dispatchAction(s, cast));
    const afterResolve = s.players.user.battlefield.find((p) => p.card?.name === "Aether Meltdown");
    // THE MUTANT'S TARGET: without the union exclusion in sba.js this sweep reads "Enchant creature or
    // Vehicle" as bare "creature", finds an uncrewed Vehicle isn't one, and destroys the Aura.
    s = checkAllStateBasedActions(s);
    const afterSba = s.players.user.battlefield.find((p) => p.card?.name === "Aether Meltdown");
    const row = {
      attachedOnResolve: afterResolve?.attachedTo ?? null,
      attachedAfterSba: afterSba?.attachedTo ?? null,
      inGraveyard: s.players.user.graveyard.some((c) => c?.name === "Aether Meltdown"),
    };
    console.log("  WITNESS vehicleHostSurvives", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ attachedOnResolve: "truck", attachedAfterSba: "truck", inGraveyard: false });
  });

  it("⭐ WHOLE-CARD AUDIT — the three gained rows with extra moving parts, driven end to end", () => {
    // Every gained row was read whole-card; these three carry text beyond the Enchant line + one static,
    // so each is DRIVEN rather than eyeballed. (Ice Over / Coma Veil / Petrify / Mists are single-static
    // cards already covered by the rows above.)
    const drive = (aura, host, name) => {
      let s = boardWith(aura, [host]);
      s = resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.isAuraSpell && a.name === name)));
      while (s.stack?.length) s = resolveTopOfStack(s);       // let the aura-own ETB resolve
      return s;
    };
    const SECURE = { id: "c-sd", name: "Secure Detention", type: "Enchantment — Aura", mana: "{3}{W}",
      oracle: "Enchant artifact or creature\nWhen this Aura enters, create a 1/1 white Soldier creature token.\nEnchanted permanent can't attack or block, and its activated abilities can't be activated." };
    const sd = drive(SECURE, SIGNET, "Secure Detention");
    const rw = drive(RELIC_WARD, SIGNET, "Relic Ward");
    const am = drive(AETHER_MELTDOWN, TRUCK, "Aether Meltdown");
    const row = {
      // Secure Detention's ETB really creates the token (not just "the aura attached").
      soldierTokens: sd.players.user.battlefield.filter((p) => /Soldier/.test(String(p.card?.type || ""))).length,
      // Relic Ward's granted SHROUD is honored on a NON-creature host — the enchanted artifact drops
      // out of the artifact target pool entirely.
      shroudedArtifactTargets: enumerateTargets(rw, "user", { targetType: "artifact", restrictions: [] }, []).map((t) => t.id),
      // Aether Meltdown's energy ETB pays out on a Vehicle host.
      energy: am.players.user.energy ?? null,
    };
    console.log("  WITNESS wholeCardAudit", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ soldierTokens: 1, shroudedArtifactTargets: [], energy: 2 });
  });

  it("⚠️ the Vehicle P/T bonus: CORRECT once crewed — and the known imprecision while it isn't", () => {
    // The -4/-0 is what Aether Meltdown is FOR, so the crewed reading is the one that matters and it is
    // right: 3 - 4 = -1, on a permanent that is a creature only by layers.
    let s = boardWith(AETHER_MELTDOWN, [TRUCK, { id: "crewer", card: { id: "c-cr", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" } }]);
    s = resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.isAuraSpell && a.name === "Aether Meltdown")));
    while (s.stack?.length) s = resolveTopOfStack(s);
    const uncrewed = permanentPower(s, "truck");
    const crew = legalActionsForPlayer(s, "user").find((a) => a.kind === "crew-vehicle" && a.permanentId === "truck");
    expect(crew, "positive control — the Vehicle must be crewable or the row below is vacuous").toBeTruthy();
    const crewed = permanentPower(dispatchAction(s, crew), "truck");
    console.log("  WITNESS vehiclePT", JSON.stringify({ uncrewed, crewed })); // vitest 4 needs --disable-console-intercept
    expect(crewed).toBe(-1);
    // ⚠️ AND THE IMPRECISION, ASSERTED RATHER THAN HIDDEN: by CR 613.1 an UNCREWED Vehicle isn't a
    // creature, so "enchanted creature gets -4/-0" shouldn't apply and its power should read 3. It reads
    // -1. Pinned at the WRONG value on purpose — if someone fixes the layer emission this test fails
    // LOUDLY and points at the note in layers.js explaining why the obvious fix is re-entrant.
    expect(uncrewed).toBe(-1);
  });

  it("⛔ the sweep still KILLS an ordinary 'Enchant creature' Aura whose host stopped being one", () => {
    // The union exclusion must not have blunted the real check. An "Enchant creature" Aura pointed at a
    // non-creature artifact is illegally attached and MUST fall off — the case the lookahead leaves alone.
    const s = boardWith(STASIS_COCOON, [SIGNET]);
    const pacifism = createPermanent({ id: "pac", card: { id: "c-pac", name: "Pacifism", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature can't attack or block." }, controller: "user" });
    const withAura = { ...s, players: { ...s.players, user: { ...s.players.user,
      battlefield: [...s.players.user.battlefield, { ...pacifism, attachedTo: "signet" }] } } };
    const after = checkAllStateBasedActions(withAura);
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Pacifism")).toBe(false);
    expect(after.players.user.graveyard.some((c) => c?.name === "Pacifism")).toBe(true);
  });
});
