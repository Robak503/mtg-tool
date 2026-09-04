/**
 * effects/programQueries.js — the program-shape query predicates (AI + routing).
 *
 * Extracted verbatim from parser.js (slice 3 of the parser.js decomposition,
 * 2026-07-18). Pure `program|atom → bool|number|string` readers of an ALREADY-BUILT
 * EffectProgram — no parsing, no state. Two consumer families:
 *   - ROUTING gates (gameEngine / triggerRouting / coverage): programNeedsChosenTarget,
 *     atomTargetIntent, programTriggerTargetsResolvable, modalChooseOneRoutable — the
 *     runtime⇄metric shared single-sources-of-truth for trigger-flush routing.
 *   - AI hold/cast heuristics (opponentAI): programContainsCounter / MassRemoval /
 *     CreatureMassRemoval / ChosenPermanentRemoval / TeamPump / Fog + teamPumpAmount +
 *     PERMANENT_TARGET_TYPES.
 *
 * programConfidence deliberately STAYS in parser.js: it leans on the parser-internal
 * validation set (KNOWN) + sequence gates (diceRollSequenceOk / revealTopSequenceOk /
 * fightAtomMisplaced) used throughout assembly — moving it would force a cycle.
 *
 * LEAF — imports only targetTypes.js (itself import-free); no cycle. parser.js
 * imports programNeedsChosenTarget back (7 internal call sites) and RE-EXPORTS the
 * whole family, so every existing consumer import path stays valid.
 */
import { isNonChosenTargetType, MASS_WIPE_SCOPES } from "../targetTypes.js";

/**
 * Does the program contain an atom that REQUIRES a chosen target (vs. self / each-*
 * atoms that resolve with no target)? The single source of truth for the
 * trigger-flush routing gate (gameEngine.triggerStackPayload) AND the coverage
 * classifier (coverage.permanentTriggersCovered) — kept here so the runtime and the
 * metric can never drift. eachOpponent/eachCreature resolve without a chosen target.
 */
export function programNeedsChosenTarget(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.targetType && !isNonChosenTargetType(a.targetType));
}

/**
 * Does the program contain a `counter` atom (P3.1)? The single source of truth for the
 * one place the counter atom must NOT route natively: the trigger-flush path
 * (gameEngine.buildTriggerStack). There, targets are auto-chosen by the default
 * first-legal chooser, which has no enemy-awareness and no self-exclusion — so an ETB
 * "counter target spell" (Mystic Snake) would silently counter the CONTROLLER'S OWN
 * spell when it's the first legal target on the stack (CLAUDE.md §1.2 — a confident
 * WRONG play, worse than the Arbiter route). Counter is SAFE on the cast path (the user
 * picks the target interactively; the AI holds counters) and the activated path (user-
 * picked; the AI doesn't activate), so the gate is narrow: trigger flush + the coverage
 * metric that mirrors it. Lift it once an enemy-aware/interactive flush chooser exists.
 */
export function programContainsCounter(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "counter");
}

// The chosen-target NON-CREATURE permanent-removal targetTypes (Disenchant / Stone Rain class). A
// SET so the parser, the trigger gate, and the enumerator can't drift on which types are covered.
export const PERMANENT_TARGET_TYPES = new Set([
  "artifact", "enchantment", "land", "permanent", "nonlandPermanent", "artifactOrEnchantment",
  "creatureOrEnchantment", "creatureOrLand", "creatureOrArtifact", "artifactOrLand", "enchantmentOrLand", // β-2 unions
  "planeswalker", "creatureOrPlaneswalker", // PW-7 — gate triggered destroy/exile-PW out of first-legal flush
  "artifactOrEnchantmentOrFlyingCreature", // BW-1 triple union (Broken Wings / Shoot Down) — chosen-permanent removal, same flush gate
]);

/**
 * Does the program contain a CHOSEN-TARGET non-creature permanent-removal atom (destroy/exile target
 * artifact/enchantment/land/permanent/…)? Gated OUT of the trigger flush (gameEngine.buildTriggerStack)
 * for the SAME reason as `counter`: the default first-legal flush chooser has no enemy-awareness, so a
 * trigger's "destroy target artifact" would silently destroy the CONTROLLER'S OWN permanent when it
 * sorts first — a confident WRONG play (CLAUDE.md §1.2). SAFE on the cast path (the user picks; the AI
 * holds non-creature removal), so the gate is narrow: the trigger flush + the coverage metric that
 * mirrors it. Lift it once an enemy-aware/interactive flush chooser exists. (CREATURE removal keeps
 * its existing trigger behavior — different targetType, unchanged by this gate.)
 */
export function programContainsChosenPermanentRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => (a.op === "destroy" || a.op === "exile") && PERMANENT_TARGET_TYPES.has(a.targetType));
}

/**
 * The intended target SIDE for one atom — the basis for the α1 trigger-flush allowlist + the
 * enemy/own chooser (gameEngine.chooseTriggerTargets).
 *   "enemy"     — removal / disruption / damage aimed at an opponent's permanent / spell / the
 *                 opponent (deal-damage, destroy, exile, counter, tap, a negative -X/-X pump, a
 *                 -1/-1 counter).
 *   "own"       — a buff / utility the controller aims at their own side (a positive pump, a +1/+1
 *                 counter, untap, return-a-card-from-your-graveyard).
 *   "ambiguous" — could go either way (bounce), or any unknown targeting atom → NEVER auto-routed
 *                 on a trigger (the flush gates it to the Arbiter rather than risk a wrong target).
 * Returns null for a NON-targeting atom (no targetType, or an each/mass scope; self/team pumps carry
 * no targetType so they land here too) — those never need a chosen target.
 */
export function atomTargetIntent(atom) {
  if (!atom) return null;
  const tt = atom.targetType;
  if (!tt || isNonChosenTargetType(tt)) return null;
  switch (atom.op) {
    case "optional-mana-payment": {
      // OPTIONAL-MANA-PAYMENT (CR 603.7c) — the wrapper does NO targeting of its own. Its `targetType` is
      // copied up from the single chosen target type of its PAYOFF atoms (parser.matchOptionalManaPayment), and
      // the payoff is what actually targets. So the wrapper's intent IS the payoff's intent — DELEGATE rather
      // than classify a second time, which is what keeps the two from drifting as payoff ops are added.
      //
      // ⛔ DISAGREEMENT OR EMPTINESS → "ambiguous", the refusing direction. Two payoff atoms wanting opposite
      // sides cannot be expressed by one intent (the same reason fight-pair reports ambiguous below), and an
      // empty inner list means we could not read an intent at all. Either way the trigger flush declines to
      // auto-target and hands the card to the Arbiter instead of risking a wrong target (CREED).
      const inner = [...new Set((atom.effectAtoms || []).map((a) => atomTargetIntent(a)).filter((v) => v != null))];
      return inner.length === 1 ? inner[0] : "ambiguous";
    }
    case "fight-pair":
    case "damage-target-power":
    case "pump-pair":
      // FIGHT-PAIR / DAMAGE-TARGET-POWER / PUMP-PAIR (the TWO-CHOSEN-TARGET fight) — a SINGLE atom that needs BOTH an
      // "own" creature (the fighter/dealer) AND an "enemy" creature (the target). The intent model is ONE
      // value per atom, which can't express two opposite sides, so report "ambiguous" — that gates the
      // shape OUT of the auto-target paths that assume one side per atom: the trigger flush
      // (programTriggerTargetsResolvable → false → Arbiter) and the loyalty-AI safety check (rejects
      // ambiguous). The shape is handled explicitly on the CAST path (opponentAI two-target chooser) where
      // each role gets its own side; a human picks both interactively. CREED — never a blind mis-target.
      return "ambiguous";
    case "deal-damage":
    case "destroy":
    case "exile":
    case "counter":
    case "detain": // DETAIN (CR 701.29, ④-AZ) — you detain an OPPONENT's permanent; enemy-side like goad
    case "goad": // GOAD (CR 701.38, ④-AI) — you goad an OPPONENT's creature; the flush chooser places it enemy-side
    case "fight":
      // ETB-FIGHT — the target is "target creature you DON'T control" (enemy-side). LOAD-BEARING for the
      // trigger path: every fight card is an ETB/Enrage TRIGGER, so without this the HIGH-parsing fight
      // program would have an ambiguous-intent atom → programTriggerTargetsResolvable false → the trigger
      // silently routes to the Arbiter (a forbidden no-op fabrication path) instead of firing natively.
      return "enemy";
    case "delayed-blink":
      // DELAYED-RETURN BLINK (Otherworldly Journey / Long Road Home) — "exile target creature … return it with
      // a +1/+1 counter." Legality stays wide ("target creature" is any creature — a political blink of an
      // opponent's is printed-legal), but the rational use is YOUR OWN creature: protect it (dodge a removal
      // spell in response) and grow it (+1/+1). Intent "own" so a chooser never hands an opponent a free
      // counter. Load-bearing only for a future trigger carrier; on the cast path the AI reads the same side.
      return "own";
    case "adapt-ignore-counters":
      // ADAPT-IGNORES-COUNTERS (Biomancer's Familiar) — you spend this on YOUR OWN creature, to let it adapt
      // a second time. Legality stays wider than intent ("target creature" really is any creature); intent is
      // "own" so a chooser never spends the tap enabling an opponent's adapt.
      return "own";
    case "move-all-counters-to-target":
      // MOVE-ALL-COUNTERS (The Ozolith, W2) — the banked pile is a pump you aim at YOUR OWN creature.
      // Legality stays wider ("target creature" really is any creature — a political dump onto an enemy is
      // printed-legal); intent is "own" so the flush chooser never gifts the pile across the table.
      return "own";
    case "look-at-hand":
      // LOOK AT A HAND (CR 701.20e) — "look at target player's hand" is information you want about an
      // OPPONENT; looking at your own hand tells you nothing you don't know. Same shape as cant-block
      // below: enumeration stays legal-wide ("target player" really is any player), intent is enemy so
      // the α1 chooser can place it. LOAD-BEARING for the trigger path exactly like the fight note above
      // — Ingenious Thief's ETB is the whole reason this case exists; without it the HIGH-parsing program
      // has an ambiguous atom and the trigger routes to the Arbiter instead of firing.
      return "enemy";
    case "make-uncounterable":
      // GRANT UNCOUNTERABILITY (Vexing Shusher) -- you protect YOUR OWN spell with this. It can legally
      // target any spell on the stack, but no chooser would ever spend it shielding an opponent's, so the
      // trigger-flush / AI side is "own". Legality (enumeration) stays wider than intent (choice) on
      // purpose: narrowing enumeration to own-side would be a false negative on a legal target.
      return "own";
    case "cant-block-source": // PAIRWISE CANT-BLOCK (④-BA) — the same offensive intent, scoped to the source
    case "cant-block":
      // CANT-BLOCK — "target creature can't block this turn" disables an OPPONENT's blocker so your
      // attacker connects (offensive). The trigger-flush chooser picks an opponent's creature; you'd never
      // disable your own blocker by choice.
      return "enemy";
    case "cant-be-blocked":
      // CANT-BE-BLOCKED — "target creature can't be blocked this turn" makes YOUR attacker unblockable to
      // push damage (own-side), the mirror of cant-block. A trigger-flush chooser picks the controller's
      // own creature; making an opponent's creature unblockable would be self-defeating.
      return "own";
    case "tap":
      // TAP-TARGET-CREATURE: "you control" restriction targets own creatures (e.g. Magus of the Arena);
      // all other tap forms (opponent controls, defending player, power/toughness, flying) target an
      // enemy creature. The restriction check mirrors the add-counter you-control override pattern.
      if (atom.restrictions?.some(r => r.kind === "controller" && r.who === "you")) return "own";
      return "enemy";
    case "lose-life":
      // DEATH-DRAIN-TARGETED — "target player/opponent loses N life" is enemy-side like targeted damage:
      // draining yourself is strictly bad, so the trigger-flush chooser always picks an opponent (no
      // self-drain hazard — unlike the edict's "target player", which could self-sac). Non-targeted lose-life
      // (each/controller) has no targetType and already returned null above.
      return "enemy";
    case "rad":
      // RAD (CR 728) — "target player/opponent gets N rad counters" is enemy-side: rad mills + drains its
      // holder, so you never rad yourself by choice → the flush chooser always picks an opponent (parallel to
      // targeted lose-life). Non-targeted rad (each/controller) has no targetType and already returned null.
      return "enemy";
    case "sacrifice":
      // An edict — "target player/opponent sacrifices a creature" — is unambiguously enemy-side: you never
      // edict yourself, and the sacrificer (the chosen player) picks their own victim, so there's no
      // friendly-fire risk in the creature choice. The enemy-aware flush chooser (chooseTriggerTargets)
      // picks an opponent; a chooser-less path falls back to firstLegalChoice — the SAME exposure the
      // already-"enemy" deal-damage / lose-life "target player" ops carry, and the live flush sites all
      // pass chooseTriggerTargets. The old "target player" = ambiguous carve-out predated that enemy-aware
      // chooser and needlessly kept edict TRIGGERS (Custodi Lich's become-monarch payoff) on the Arbiter.
      return "enemy";
    case "pump":
      return (atom.ptDelta && ((atom.ptDelta.p || 0) < 0 || (atom.ptDelta.t || 0) < 0)) ? "enemy" : "own";
    case "source-power-fanout":
      // SOURCE-POWER-FANOUT (Chandra's Ignition) — the CHOSEN target is "creature YOU CONTROL" (the damage
      // source); the harmful fan-out hits OTHER creatures + opponents automatically. So the chosen target is
      // own-side (you point it at your own biggest creature). No fanout card is a trigger today; this future-
      // proofs the trigger-flush chooser to pick the controller's own creature, never an enemy's.
      return "own";
    case "add-counter":
      // COUNTER-TARGET-OWN: "you control" restriction overrides the counterType heuristic so that
      // Baleful Ammit's "-1/-1 on target creature you control" still picks the controller's own creature
      // (not an opponent's, as bare -1/-1 would). The restriction is authoritative; counterType is a
      // fallback for the UNFILTERED "target creature" form only.
      if (atom.targetType === "creatureYouControl") return "own";
      return (typeof atom.counterType === "string" && atom.counterType.trim().startsWith("-")) ? "enemy" : "own";
    case "untap":
      return "own";
    case "copy-ability": // SHELF-85 V6 — "copy target … ability YOU CONTROL": the pool is own-side by enumeration
      return "own";
    case "double-all-counters": // SHELF-85 V8 (Arcade Cabinet) — doubling a creature's counters is a gift: own side
      return "own";
    case "explore":
      // CHOSEN-TARGET EXPLORE (BLITZ EX-1) — "target creature you control explores" (Miner's Guidewing's dies
      // trigger, Enter the Unknown, the Map token). The ONLY targeted explore form the parser emits carries
      // targetType "creatureYouControl" (own creatures only); exploring is beneficial (a land to hand or a
      // +1/+1 counter on YOUR creature), so the trigger-flush chooser stays own-side and a dies/ETB trigger
      // routes natively picking the controller's own creature. (Self / thatCreature explore forms carry no
      // targetType and returned null at the top of this function — this case is reached only for the chosen form.)
      return "own";
    case "connive":
      // CHOSEN-TARGET CONNIVE (BLITZ EK-1, CR 701.50a) — the ONLY targeted connive form the parser emits is
      // "target creature you control connives" (Mob Lookout, Scorpion's end-step form): an OWN-side pool
      // (conniving is a draw-discard-counter benefit aimed at your own creature), so the trigger-flush
      // chooser stays own-side — the EX-1 chosen-target explore pattern verbatim. (Self / thatCreature
      // connive forms carry no targetType and returned null at the top of this function.)
      return "own";
    case "suspect":
      // SUSPECT (BLITZ EK-1, CR 701.60) — side-provable pools only: a "you control" pool is own-side
      // (Rune-Brand Juggler), an "an opponent controls" restriction is enemy-side (Absolving Lammasu's
      // dies rider, Hot Pursuit's clause — the pool holds only opponents' creatures, so any pick is
      // correct-side). The BARE "target creature" form (J. Jonah Jameson) is genuinely board-dependent —
      // menace helps the creature attack while can't-block hurts its defense, and the pool spans every
      // side — so it stays "ambiguous" → a TRIGGER routes to the Arbiter (a SAFE FN); the cast path
      // (Reasonable Doubt) is unaffected (the caster picks interactively / by AI).
      if (tt === "creatureYouControl") return "own";
      if (atom.restrictions?.some(r => r.kind === "controller" && r.who === "opponent")) return "enemy";
      return "ambiguous";
    case "return-from-graveyard":
      // The target is a card in the CASTER'S OWN graveyard — own-side, so a recursion TRIGGER
      // ("When this enters, return target creature card from your graveyard to your hand") routes
      // natively (programTriggerTargetsResolvable → true; the chooser's only candidates are own-gy cards).
      // GY-TO-BOTTOM (AR-1): the anyGraveyard form ("put target card from a graveyard on the bottom of
      // its owner's library") enumerates across EVERY player's graveyard — the one-value-per-atom intent
      // model can't promise the flush chooser a provably-correct side, so report "ambiguous" → such a
      // TRIGGER (Nantuko Tracer / Vessel of Endless Rest ETBs) routes to the Arbiter (a SAFE FN) —
      // exactly the reanimate / exile-from-graveyard discipline below. Activated/cast paths unaffected.
      return (atom.anyGraveyard || atom.opponentGraveyard) ? "ambiguous" : "own";
    case "optional-exile-self-payment":
      // OPTIONAL-EXILE-SELF (Undead Butler): the wrapper's lifted targetType is its PAYOFF's — a
      // return-from-graveyard over the caster's OWN graveyard (the parser only ever lifts a
      // graveyardCard payoff here, and the arm stamps excludeTriggeringCard). Own-side, same as the
      // bare return-from-graveyard entry above.
      return "own";
    case "reanimate":
      // OWN-graveyard reanimate ("from your graveyard") is own-side, so a reanimation TRIGGER routes
      // natively. But the REANIMATE-FROM-ANY forms ("from a graveyard" / "from an opponent's graveyard")
      // enumerate across other players' graveyards — the one-value-per-atom intent model can't promise the
      // flush chooser a provably-correct side, so report "ambiguous" → such a TRIGGER routes to the Arbiter
      // (a SAFE false-negative). The cast path is unaffected (it enumerates + picks interactively / by AI).
      // DAMAGED-PLAYER reanimate (BLITZ SB-2 — "from that player's graveyard", Ink-Eyes / Scion of Darkness)
      // IS side-provable: the pool holds only the just-combat-damaged player's cards, and a combat-damaged
      // player is always an opponent of the attacker's controller (CR 506.2a) → "enemy" (the same rationale
      // as the SB-1 damagedPlayerGraveyard exile below), so the saboteur trigger routes natively.
      if (atom.damagedPlayerGraveyard) return "enemy";
      return (atom.anyGraveyard || atom.opponentGraveyard) ? "ambiguous" : "own";
    case "exile-from-graveyard":
      // OPPONENT's-graveyard exile ("exile target card from an opponent's graveyard" — Disposal Mummy, Leonin
      // of the Lost Pride, Disruptor Wanderglyph) is unambiguously ENEMY-side (the only candidates are cards in
      // opponents' graveyards), so an ETB/attack TRIGGER routes natively. DAMAGED-PLAYER's-graveyard exile
      // (BLITZ SB-1 — "from that player's graveyard", Skullsnatcher / Zombie Cannibal) is enemy-side too: the
      // only candidates are cards in the just-combat-damaged player's graveyard, and a combat-damaged player is
      // always an opponent of the attacker's controller (CR 506.2a — a defending player is always one of the
      // attacking player's opponents).
      // "from a graveyard" (anyGraveyard) can't promise a side → ambiguous → Arbiter (a SAFE false-negative);
      // a caster-only form is own. Cast path (Coffin Purge / Cremate) is unaffected — it enumerates + picks
      // interactively / by AI.
      return (atom.opponentGraveyard || atom.damagedPlayerGraveyard) ? "enemy" : atom.anyGraveyard ? "ambiguous" : "own";
    case "self-attach":
      // ETB-EQUIP-ATTACH — the Equipment attaches to "target creature YOU CONTROL", so the trigger-flush
      // chooser stays on the controller's own side (the host is always friendly; never an enemy creature).
      return "own";
    case "attach-to-self":
      // EQUIP-AUTO-ATTACH (WAVE 4) — the REVERSE of self-attach: the source is a CREATURE (Captain America)
      // and the chosen target is "target Equipment YOU CONTROL", attached onto the source. Own-side (you
      // attach your own equipment to your own creature), so Cap's combat-begin "Catch" trigger routes
      // natively and the chooser only ever picks the controller's own equipment.
      return "own";
    case "animate":
      // WALT-ANIMATE — you animate your OWN land into a creature to attack/block (own-side buff). No
      // animate card is a trigger today, so this only future-proofs the trigger-flush chooser; the cast
      // path picks the target interactively.
      return "own";
    case "win-game":
      // UPKEEP-WIN — "target player loses the game" (Door to Nothingness) is unambiguously enemy-side:
      // you'd never make yourself lose. (The "you win the game" form is non-targeted → null above.) No
      // win-game card is a TRIGGER with a chosen target today (the upkeep-win family wins the CONTROLLER,
      // no target), so this future-proofs the trigger-flush chooser; the cast/activated path picks the
      // target interactively.
      return "enemy";
    case "bounce":
    case "tuck":
      // ETB-BOUNCE / ETB-TUCK — triggered bounce and tuck effects target an OPPONENT's permanent.
      // "YouControl" forms (rare) bounce own permanents (self-protective). Bare "creature" / "artifact" /
      // "land" / "permanent" targets are offensive (Man-o'-War, Aether Adept, Vedalken Dismisser,
      // Dispersal Technician, Glowing Anemone). The trigger-flush chooser picks an opponent's permanent
      // for non-own targets, which is correct for the entire ETB-removal family.
      if (tt.includes("YouControl") || tt.includes("youControl") || tt === "self") return "own";
      return "enemy";
    case "blink":
      // BLINK (2026-08-14 — Displacer Kitten, the family's first TRIGGER carrier): every corpus blink
      // arm prints "you control" (the restriction enforces legality), and blinking your own permanent
      // for value/ETB re-use is the card's entire purpose — own-side, never a mis-target. The spell
      // carriers (Displace, Ghostly Flicker) never consulted intent; this case exists for the flush.
      return "own";
    case "bounce-spell-or-permanent":
      // VENSER — the STACK∪BATTLEFIELD union bounce. Same enemy-side tempo intent as the ETB-bounce
      // family above (bounce their spell as a pseudo-counter, or their permanent as tempo — the
      // Man-o'-War logic with a wider pool). Enumeration stays legal-wide (own permanents and own
      // spells remain legal picks for a human); intent narrows only the auto-chooser's side.
      return "enemy";
    case "transfer-counters":
      // COUNTER-TRANSFER (census slice 37) — "put its counters on target creature you control": the printed
      // subject is already restricted to your own creatures, and moving a dead creature's counters onto one
      // of them is purely beneficial. Unambiguously own-side; there is no enemy reading of it at all.
      return "own";
    case "discard":
    case "discard-chosen":
      // "target player/opponent discards" — harmful, enemy-side (Rottenheart Ghoul, Kemuri-Onna).
      // The controller never targets themselves with a discard trigger.
      if (tt === "player" || tt === "opponent") return "enemy";
      return "ambiguous";
    case "exile-graveyard-pick": // ④-P — "target player exiles a card from their graveyard": graveyard hate, enemy-side like mill
      if (tt === "player" || tt === "opponent") return "enemy";
      return "ambiguous";
    case "mill":
      // TARGET-MILL (BLITZ TM-1 — Tome Scour / Millstone / Returned Centaur class): "target player/
      // opponent mills N cards" is harmful, enemy-side like targeted discard — the flush chooser always
      // picks an opponent, which structurally closes the self-mill data-poisoning hazard this class was
      // deferred over. (Milling YOURSELF for graveyard synergy is a play-quality refinement for the
      // pilots, never a correctness requirement — the enemy pick is always legal, never fabricated.
      // The half-library form shares this atom shape; no half-library TRIGGER exists in the corpus, so
      // the case only tightens its intent from ambiguous → enemy, correct if one is ever printed.)
      if (tt === "player" || tt === "opponent") return "enemy";
      return "ambiguous";
    case "prevent-next-damage":
      // PREVENT-NEXT-DAMAGE (BLITZ PV-1 — Samite Healer class): protective — you shield your OWN
      // creature/planeswalker/face. The trigger-flush chooser stays own-side (no prevention card is a
      // trigger today; this future-proofs it), and the cast/activated AI aims at its own side.
      return "own";
    case "gain-life":
      // "target player gains N life" (Titan of Industry's ETB mode, Perrie, various charms) — life gain is
      // purely BENEFICIAL, so the controller always targets THEMSELVES on a trigger flush (targeting an opponent
      // would only help them — never the play). Own-side, mirroring the "target player draws" case below. The
      // applyGainLife who:"target" resolver already gains life for whoever is in ctx.targets, and the flush
      // chooser (chooseTriggerTargets) resolves "own" to the controller — so this routes faithfully, never a
      // wrong target. A non-"player" gain-life target has no card in the corpus → the ambiguous default.
      if (tt === "player") return "own";
      return "ambiguous";
    case "draw":
      // "target player draws N cards" (Saltwater Stalwart: combatDamage → target player draws) —
      // beneficial draw, own-side: the controller always targets themselves to draw.
      if (tt === "player") return "own";
      // DRAW-BY-TARGET-POWER ("draw cards equal to the power of target creature you control" — Soul's
      // Majesty): the chosen CREATURE is the controller's own (the "you control" restriction) and the draw
      // is beneficial, so the target side is unambiguously "own" — mirroring the tap / add-counter "you
      // control" overrides. This future-proofs the trigger-flush chooser (no such card is a trigger today;
      // the cast path picks interactively / the AI aims at its own biggest creature). The BARE "target
      // creature" form (no restriction, none in the corpus) stays "ambiguous" → Arbiter on a trigger, a safe
      // FN: which creature's power you'd want is genuinely board-dependent without the own-side restriction.
      if (tt === "creature" && atom.restrictions?.some(r => r.kind === "controller" && r.who === "you")) return "own";
      return "ambiguous";
    case "regenerate":
      // "Regenerate target creature" (Horizon Seed: cast Spirit/Arcane → regenerate target creature) —
      // protective, own-side: you regenerate your own creatures.
      return "own";
    case "tutor":
      // PARTNER-WITH NAMED TUTOR (CR 702.124j) — "target player may search their library for a card named X".
      // Own-side: you play the creature to fetch YOUR OWN partner, and no chooser would ever hand the search
      // to an opponent (it would fetch a card into THEIR hand — the searcher is the target, see applyTutor).
      // Legality deliberately stays wider than intent, the make-uncounterable / adapt-ignore-counters pattern:
      // "target player" really is any player, so a human keeps the full legal choice; only the automatic
      // chooser is pointed at the obvious side.
      //
      // ⚠️ LOAD-BEARING FOR THE TRIGGER PATH, which is the only path this shape has. Partner-with is an ETB
      // trigger, so without a decided intent the atom reads "ambiguous" → programTriggerTargetsResolvable
      // false → the trigger routes to the Arbiter instead of firing, and the card never plays natively.
      //
      // NARROWLY GATED ON PURPOSE. Every other tutor in the corpus is untargeted (targetType null, caught by
      // the `!tt` guard at the top), so this case is reached only by the targeted named form. A future
      // targeted tutor of some other shape must decide its own side rather than inherit this one.
      if (tt === "player" && atom.searcherIsTarget) return "own";
      return "ambiguous";
    case "grant-flashback": // ④-G (Snapcaster) — a card in the CASTER's own graveyard: always an own-side pick
      return "own";
    case "create-token": // ④-F (Forbidden Orchard / the Hunted cycle) — the CREATURE-token sibling of the named-token arm: the same "target opponent creates" creator stamp, the same enemy-side pick. Falls through.
    case "create-named-token":
      // TARGET-OPPONENT-CREATES — "target opponent creates a tapped Treasure token" (Generous Plunderer's
      // reflexive). The targetType is "opponent" (whoCreates:"target"), so the ONLY legal targets are the
      // controller's opponents — the flush chooser picks any opponent (always a legal, provably-correct
      // "enemy"-side pick; there is no self-target hazard because a controller can never be their own
      // opponent). Every OTHER create-named-token form is non-targeted (targetType null → null above), so
      // this case is reached ONLY for the opponent-creates shape.
      return "enemy";
    case "become-copy":
      // BECOME-COPY (CR 613.1a / 707.9) — "~ becomes a copy of another target creature until end of turn".
      // AMBIGUOUS ON PURPOSE, and stated here rather than left to the default so the decision is visible.
      //
      // The value of a copy is the QUALITY of the body, not whose it is: copying an opponent's fattest
      // attacker is the classic line, and copying your own is equally common. There is no side the chooser
      // can prove correct from the atom, so a TRIGGER routes to the Arbiter (a safe FN) exactly like the
      // bare `suspect` form above. The cast/activated path is unaffected — Impossible Man's activated
      // ability plays natively because its target is picked at activation, not by the flush chooser.
      //
      // ⛔ DO NOT "FIX" THIS BY DECLARING A SIDE. Tilonalli's Skinshifter looks own-side (during your own
      // attack every attacker is yours), but that is a property of its ATTACKING restriction, which the
      // atom does not carry — becomeCopy's noun map flattens "another target nonlegendary attacking
      // creature" to "creature". Making it own-side here would mis-target every other member of the family.
      // The honest route is a distinct attacking-creature targetType the enumerator supports, which is a
      // real build for one rank-22835 card — not the one-liner an earlier ledger note called it.
      return "ambiguous";
    default:
      return "ambiguous";
  }
}

/**
 * Can every chosen-target atom in this program have its target placed on a provably-correct side by
 * the α1 trigger chooser? True when no targeting atom is "ambiguous" (every one is enemy- or
 * own-intent, or is non-targeting). The single source of truth for the trigger-flush ALLOWLIST:
 * gameEngine.buildTriggerStack routes a targeted trigger natively only when this holds, and
 * coverage.triggerRoutesNatively MIRRORS it so the metric can't claim a routing the engine won't do.
 */
export function programTriggerTargetsResolvable(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.every(a => atomTargetIntent(a) !== "ambiguous");
}

/**
 * CHOOSE-ONE PARTIAL-RESOLVABILITY (BLITZ ML-1, CR 700.2b). For a "Choose one —" modal TRIGGER the
 * controller chooses exactly ONE mode as the ability is put on the stack, and "if one of the modes would be
 * illegal (due to an inability to choose legal targets, for example), that mode can't be chosen" — so a mode
 * whose target the α1 flush chooser can't place on a provably-correct side (an "ambiguous" atom — bounce, an
 * exile-from-ANY-graveyard, a reanimate-from-any) is simply DECLINED, exactly as the controller would decline
 * an illegal mode. The card still routes natively as long as AT LEAST ONE mode is fully resolvable (all its
 * atoms enemy/own/non-targeting). This is STRICTLY narrower than programTriggerTargetsResolvable (which
 * demands EVERY mode resolvable): it only relaxes the SINGLE-pick "choose one" form — never "choose two /
 * one or both / one or more", where more than one mode must resolve and an ambiguous mode can't be dodged, so
 * those keep the every-mode-resolvable gate (a SAFE false-negative). The flush chooser (gameEngine.
 * chooseTriggerTargets) skips the ambiguous-mode candidates and picks a resolvable mode; the metric
 * (triggerRoutesNatively) and the runtime (buildTriggerStack) consult THIS same helper so they can't drift.
 * Declining a mode the AI can't safely target is a play-QUALITY false-negative on that one mode, never a
 * wrong-mode / mis-targeted resolution (CREED — false-positive forbidden). Pure.
 */
export function modalChooseOneRoutable(program) {
  if (!program || program.structure !== "modal") return false;
  if ((program.modal?.chooseCount || 1) !== 1) return false; // choose-TWO/one-or-both/one-or-more excluded
  if (program.modal?.upTo || program.modal?.atLeastOne) return false; // "one or both/more" (chooseCount 1 never set with these, belt)
  const modes = program.modal?.modes || [];
  // ≥1 mode with NO ambiguous atom is the fully-resolvable fallback the chooser can always pick.
  return modes.length > 0 && modes.some(m => (m.atoms || []).every(a => atomTargetIntent(a) !== "ambiguous"));
}

/**
 * Does the program contain a MASS removal atom — destroy / exile / -X-X scoped to a whole permanent
 * class on every battlefield (`eachCreature` board wipe, or MASS-NC's `eachArtifact` / `eachEnchantment`
 * / `eachLand` / `eachArtifactOrEnchantment`)? The AI HOLDS these (opponentAI.pickCastAction): the engine
 * resolves a symmetric wipe correctly, but the AI can't yet weigh whether nuking the board helps or hurts
 * it — an indiscriminate Wrath into its own developed board, or an Armageddon into its own mana base,
 * plays terribly. The player casts wipes normally. Narrow + deferred — lift it once a board-state-aware
 * wipe heuristic exists. (Mass DAMAGE, e.g. Pyroclasm, is intentionally NOT gated here — it's a
 * pre-existing cast and small symmetric burn is often a fine aggressive play.)
 * MASS_WIPE_SCOPES lives in targetTypes.js since 2026-07-18 (imported above) — it and the non-wipe
 * scopes now BUILD the central non-chosen set, so a new mass type can't skip its hold classification.
 */
export function programContainsMassRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  // BLOOD-MONEY — mass-destroy-treasure-per-nontoken is a symmetric board wipe too (it destroys all creatures);
  // include it so the AI HOLDS it like Wrath (the Treasure upside doesn't make a blind self-wipe a good play).
  return atoms.some(a => MASS_WIPE_SCOPES.has(a.targetType) && ["destroy", "exile", "pump", "mass-destroy-treasure-per-nontoken"].includes(a.op));
}

/**
 * W7c (AI-F4) — does the mass-removal program hit CREATURES? The AI's "cast a held wipe when
 * clearly behind" heuristic is a CREATURE-board metric (creature counts + power), so it may only
 * unlock wipes that actually answer a creature board: destroy/exile/negative-pump scoped
 * `eachCreature`, plus Blood Money's mass-destroy (it destroys all creatures). A NON-creature
 * mass removal (Armageddon's eachLand, a Vandalblast-class eachArtifact) stays under the
 * unconditional hold — casting Armageddon because you're behind on CREATURES is exactly the
 * blind self-wipe the hold exists to prevent. A positive symmetric pump ("all creatures get
 * +1/+1", targetType eachCreature) is NOT a wipe the behind-metric should unlock either — it
 * helps the bigger board most — so the pump op qualifies only when its delta is negative (or
 * X-scaled, e.g. Black Sun's Zenith, where the AI sizes X against the board it answers).
 */
export function programContainsCreatureMassRemoval(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a =>
    a.op === "mass-destroy-treasure-per-nontoken" ||
    (a.targetType === "eachCreature" && (
      a.op === "destroy" || a.op === "exile" ||
      (a.op === "pump" && (a.amountX || (a.ptDelta?.p ?? 0) < 0 || (a.ptDelta?.t ?? 0) < 0))
    )));
}

/**
 * Does the program contain a controller-scoped TEAM pump (`scope:"youControl"`, an Overrun /
 * Trumpet Blast / Inspired Charge "creatures you control get +N/+N [and gain KW] until end of
 * turn")? The AI HOLDS these unless the pump flips this turn's swing to lethal
 * (opponentAI.pickCastAction, W7d): a team pump only earns its value cast pre-combat into a
 * profitable attack. Holding is SAFE (the buff is the AI's own, so a miss only costs tempo,
 * never a wrong play); the player casts it normally.
 */
export function programContainsTeamPump(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "pump" && a.scope === "youControl");
}

/**
 * W7d (AI-F7) — the FLAT power bonus of a PLAIN whole-team pump ("creatures you control get
 * +N/+N [and gain KW] until end of turn"), or null when the AI can't evaluate it. Anchored to
 * the SAME atom shape programContainsTeamPump matches, so the two can never disagree about
 * which cast is a team pump. Null (→ keep holding, the safe direction) for every scaled or
 * partial form: a dynamic per-board delta (ptDeltaCount — Overrun-scale "+X/+X where X is …"),
 * an {X}-cost pump (amountX), a subtype-filtered pump (only Dinosaurs get it — applying it to
 * every attacker would overcount), a subtype-negated or source-excluding pump. The keyword
 * rider (Trample etc.) is intentionally ignored by the caller — a safe underestimate.
 */
export function teamPumpAmount(program) {
  if (!program) return null;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  const pump = atoms.find(a => a.op === "pump" && a.scope === "youControl");
  if (!pump) return null;
  if (pump.ptDeltaCount || pump.amountX || pump.subtypeFilter || pump.subtypeNegate || pump.excludeSource) return null;
  const p = pump.ptDelta?.p;
  return Number.isInteger(p) ? p : null;
}

/**
 * Does the program contain a FOG atom ("prevent all combat damage this turn", FOG-1)? The AI HOLDS it
 * (opponentAI.pickCastAction): fog is a purely DEFENSIVE reaction (cast when you're being attacked),
 * and the AI can't yet time it — casting it in its own main phase would set the turn-latch and wipe out
 * ITS OWN attackers' damage (actively self-defeating, worse than not casting). Holding is SAFE (a fog
 * the AI never casts only costs it a defensive option); the player casts it normally. Narrow + deferred
 * — lift it once a "fog when under lethal attack" heuristic exists.
 */
export function programContainsFog(program) {
  if (!program) return false;
  const atoms = program.structure === "modal"
    ? (program.modal?.modes || []).flatMap(m => m.atoms || [])
    : (program.atoms || []);
  return atoms.some(a => a.op === "fog");
}
