/**
 * damageReplacements.js — the reusable DAMAGE-REPLACEMENT consult (CR 614, the
 * "deals double/triple/+N instead" replacement family — Wolverine, Furnace of
 * Rath, City on Fire, …).
 *
 * THE SEAM (and the original deferral's real reason). Damage and life PAYMENT
 * both flow through `loseLife`. A naive "double the damage" HOOK on that sink
 * would also double life *payments* — a false positive on already-correct game
 * actions (paying Phyrexian mana, "pay N life", Sylvan Library). So this is NOT
 * a hook on `loseLife`. It is a CONSULT placed at every point where a damage
 * AMOUNT is finalized, BEFORE it is handed to loseLife / markCombatDamage /
 * addPoison / adjustLoyalty. A life payment never constructs a damage-event, so
 * it is structurally immune.
 *
 * STORAGE MODEL (MUST-FIX 1 — synthesized-on-read). A "double all damage" static
 * ability of a permanent (CR 604.1) exists exactly while that permanent
 * is on the battlefield: no registration event, no duration, and it must VANISH
 * the instant the permanent leaves. So `isDamageReplacement` SCANS the
 * battlefield for permanents whose CARD carries the parsed doubler — the same
 * synthesized-on-read path anthems/lords use (layers.collectContinuousEffects),
 * never a stored `continuousEffect`, never an ETB/LTB removal hook. The doubler
 * appears and disappears with the permanent for free.
 *
 * THE OP IS A MULTIPLIER/ADDEND, NOT A BOOLEAN. `{op:"multiply",factor:2}` (not
 * "double=true") so triple, "+N", and a future `prevent-N` drop in without a
 * rewrite.
 *
 * 616.1 ORDERING. Multiple applicable replacements are applied in the affected
 * player/controller's chosen order (CR 616.1; deterministic default =
 * registration / battlefield order). Routed through the one 616-ordered helper
 * so partial-prevent can land later — never hard-coded "double always wins".
 *
 * 614.5 ONCE-PER-EVENT. A replacement applies at most once per event. The
 * applied-set is created FRESH per consult invocation (MUST-FIX 4), so a
 * double-striker — whose two combat-damage sub-steps are two separate consult
 * calls — correctly doubles in EACH step (never ×(step count) inside one call).
 *
 * Leaf module: imports only the layer/board readers (no gameState mutation, no
 * cycle). Pure — `applyDamageReplacements` returns `{ amount, prevented }` and
 * never mutates `state`.
 */

// ─── The doubler parser (verified oracle scope, never from memory) ──────────────
// Each entry: { op, scope }.
//   op    — { op:"multiply", factor:N } | (future) { op:"add", addend:N } | { op:"prevent" }
//   scope — { side:"source", controller?:"you" } reads the SOURCE permanent / its controller
//         | { side:"target" } reads the AFFECTED player / target (MUST-FIX 2)
// The doubler is read from the permanent's CARD oracle text so it is
// synthesized-on-read (vanishes when the card leaves). Wolverine's clause —
// "Unrivaled Lethality — Double all damage Wolverine would deal." — is
// SOURCE-SCOPED to that one permanent (the named self), so its filter matches
// only damage whose source IS this permanent.

/**
 * Parse the damage-replacement (doubling) clauses a single CARD carries, if any.
 * Returns [] for the overwhelming majority of cards (the gate stays byte-identical).
 * Scope is taken LITERALLY from the oracle (MUST-FIX 2):
 *   - "Double all damage <NAME> would deal"        → source-side, this-permanent-only
 *   - "If a source you control would deal damage…"  → source-side, controller-scoped
 *   - "If a source would deal damage to you/it…"    → target-side (affected player)
 */
export function parseDamageReplacements(card) {
  // ⚠️ STATIC LINES ONLY (shelf D11, 2026-09-30). A replacement sentence is a static ability of the permanent only on its
  // own line. As the EFFECT of an activated ability ("{3}{R}, {T}: If a source you control would deal damage to an
  // opponent this turn, it deals double that damage to that player instead." — Goblin Goliath) or of a trigger, it is a
  // one-shot that applies when it resolves, for its stated duration — never merely because the permanent is on the
  // battlefield. This scan used to read the whole oracle, so Goliath doubled every source its controller controls from
  // the moment it entered, activated or not (measured: the only card in the corpus the line filter changes). Reminder
  // text is ignored for the colon check — a keyword's reminder may hold one.
  const oracle = String(card?.oracle ?? card?.oracle_text ?? "").split("\n")
    .filter((ln) => !/:\s/.test(ln.replace(/\([^)]*\)/g, "")) && !/^\s*(?:when|whenever|at)\b/i.test(ln))
    .join("\n");
  if (!oracle) return [];
  const name = String(card?.name ?? "");
  const shortName = name.split(",")[0].trim(); // "Wolverine, Best There Is" → "Wolverine"
  const out = [];

  // SOURCE-SCOPED, this-permanent-only: "Double all damage <NAME/shortName/this creature> would deal."
  // The literal self-name (or "this creature"/"it") makes the scope a single permanent (CR 614 self-source).
  const selfRe = new RegExp(
    `double all damage (?:that )?(?:${escapeRe(name)}|${escapeRe(shortName)}|this creature|this permanent|it) would deal`,
    "i",
  );
  if (shortName && selfRe.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true } });
  }

  // SOURCE-SCOPED, controller-wide: "If a source you control would deal damage, it deals double that damage
  // instead." / "Double the damage … sources you control would deal." (Furnace-of-Rath "you control" family.)
  if (/double (?:the )?damage[^.]*sources? you control would deal/i.test(oracle)
      || /if a source you control would deal damage[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you" } });
  }

  // TARGET-SCOPED (affected player): "If a source would deal damage to you, it deals double that damage
  // instead." (Furnace of Rath proper is symmetric-all; "to you" is the target-side shape.)
  if (/if a source would deal damage to you[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "target" } });
  }

  // SOURCE-SCOPED, controller-wide BUT gated to creatures that ENTERED THIS TURN (Neriv, Heart of the Storm):
  // "If a creature you control that entered this turn would deal damage, it deals twice that much damage instead."
  // This is NARROWER than the controller-wide Furnace shape above — only damage whose SOURCE is one of your
  // creatures that entered the battlefield THIS turn is doubled. Crediting it with the bare controller-wide scope
  // would over-fire (doubling damage from creatures out for several turns) — a FORBIDDEN over-application FP — so
  // it carries its own `enteredThisTurn` scope flag, consumed by buildSourceFilter (which re-reads the live source
  // permanent's enteredOnTurn). Anchored to the WHOLE unique templating ("twice that much", not "double that
  // damage") so it can't collide with the Furnace/Wolverine/Twinflame shapes; corpus-unique to Neriv.
  if (/if a creature you control that entered this turn would deal damage,? it deals twice that much damage instead/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", enteredThisTurn: true } });
  }

  // SYMMETRIC-ALL double (BLITZ CM-1 — Furnace of Rath / Dictate of the Twin Gods): "If a source would deal
  // damage to a permanent or player, it deals double that damage to that permanent or player instead." The
  // UN-scoped Furnace family — EVERY source's damage to EVERY permanent/player is doubled (both players, both
  // directions of combat). Distinct from the "you control" (source-scoped, above) and the "to you" (target-
  // scoped, above) shapes: the anchor "a source would deal damage to a permanent or player" carries no
  // controller/affected-player restriction, so its scope is {side:"any"} (buildSourceFilter → always applies).
  // A CR 614 replacement effect, so it rides the deal-time consult (correct trample: lethal is assigned off
  // normal toughness and only DEALT amounts are doubled) — NOT the CR 510.1a assignment seam (which would
  // double the ASSIGNED amount and mis-distribute trample — a forbidden FP).
  if (/if a source would deal damage to a permanent or player,? it deals double that damage/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "any" } });
  }

  // SOURCE-you-control TRIPLE (BLITZ CM-1 — Fiery Emancipation / City on Fire): the TRIPLE sibling of the
  // "source you control … double" shape above — same source-controller scope, factor 3. Anchored on "triple"
  // so it can't collide with the double shape (a card is one or the other, never both).
  if (/if a source you control would deal damage[^.]*deals? triple/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 3 }, scope: { side: "source", controller: "you" } });
  }

  // CREATURE-you-control double (BLITZ CM-1 — Gratuitous Violence): "If a creature you control would deal damage
  // to a permanent or player, it deals double that damage instead." NARROWER than the Furnace "source you
  // control" shape — only damage whose SOURCE is a CREATURE you control is doubled (your burn spells / noncreature
  // pingers are NOT), so it carries a sourceIsCreature flag consumed by buildSourceFilter (an inline live-source
  // type check). In combat every source is a creature, so this doubles all your creatures' combat damage; the
  // creature gate only bites on the noncombat path (keeping your Lightning Bolt un-doubled — an over-fire FP).
  if (/if a creature you control would deal damage[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true } });
  }

  // COUNTER-GATED creature doubler (SHELF-85 H11 — Uncivil Unrest, 2026-09-04): "If a creature you control WITH A +1/+1
  // COUNTER ON IT would deal damage to a permanent or player, it deals double that damage instead." The plain creature arm
  // above needs "you control would" contiguous, so this form is credited ONLY here; the filter reads the source's live
  // counter bag at damage time (a creature that lost its counters deals single damage — pinned).
  if (/if a creature you control with a \+1\/\+1 counter on it would deal damage[^.]*deals? double/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true, sourceHasCounter: "+1/+1" } });
  }

  // SELF combat-damage-to-a-player double (BLITZ CM-1 — Charging Tuskodon): "If this creature would deal combat
  // damage to a player, it deals double that damage to that player instead." Self-source, but scoped to COMBAT
  // damage dealt to a PLAYER only — its damage to blockers (creatures) and any noncombat damage are NOT doubled.
  // combatOnly + targetPlayerOnly flags gate buildSourceFilter's self predicate on event.isCombat &&
  // targetKind==="player". With trample this is the textbook CR 510.1c case: lethal is assigned to the blocker
  // off normal toughness (un-doubled), and only the excess SPILLED to the player is doubled at deal time.
  if (/if this creature would deal combat damage to a player,? it deals double that damage/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", self: true, combatOnly: true, targetPlayerOnly: true } });
  }
  // ===== SHELF D11 (2026-09-30) — five more printed scopes on the same consult =====
  // ANY-COUNTER creatures you control (Raphael, the Muscle): "Double all damage that creatures you control with counters
  // on them would deal." Any kind of counter, read live off the source at damage time (a creature that loses its last
  // counter deals single damage).
  if (/double all damage that creatures you control with counters on them would deal/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true, sourceHasCounter: "any" } });
  }
  // CREATURE SOURCES you control (Absorbing Man and Titania): "Double all damage that creature sources you control would
  // deal." — the Gratuitous Violence scope in "double all damage" words.
  if (/double all damage that creature sources you control would deal/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceIsCreature: true } });
  }
  // SUBTYPE SOURCES you control (Calamity Bearer): "If a Giant source you control would deal damage to a permanent or
  // player, it deals double that damage to that permanent or player instead." The capitalised noun is the subtype, read
  // off the live source permanent — a subtyped SPELL (a Kindred instant) is not on the battlefield and is not doubled
  // (a safe miss).
  const subtypeSource = oracle.match(/[Ii]f an? ([A-Z][a-z]+) source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead/);
  if (subtypeSource) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", controller: "you", sourceSubtype: subtypeSource[1].toLowerCase() } });
  }
  // TO AN OPPONENT (Fiendish Duo): "If a source would deal damage to an opponent, it deals double that damage to that
  // player instead." Target-side, players only: the affected player is not the replacement's controller.
  if (/if a source would deal damage to an opponent, it deals double that damage to that player instead/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "target", affectedOpponent: true } });
  }
  // THE HOST (Mjölnir, Hammer of Thor: "Double all damage equipped creature would deal."): the source must be the
  // permanent this Equipment is attached to — read live, so it follows a re-equip and stops the moment it's unattached.
  // (The Sound of Drums' enchanted-creature form is not credited here: an Aura's tier gates its own cast lane —
  // coverage.grantAuraCastHostType — so it needs the Aura block's own composition, a separate slice.)
  if (/double all damage equipped creature would deal/i.test(oracle)) {
    out.push({ op: { op: "multiply", factor: 2 }, scope: { side: "source", hostOfSelf: true } });
  }

  // TEMPLE ALTISAUR (2026-08-14) — the SUBTYPE-SCOPED PARTIAL prevention: "If a source would deal
  // damage to another <Subtype> you control, prevent all but N of that damage." Target-side with a
  // live subtype filter + the CR 109.5 "another" self-exclusion; the op is the module's
  // long-anticipated prevent-N — a CAP at N, never a zero (that's op:"prevent").
  const pab = oracle.match(/(?:^|[\n.;])\s*if a source would deal damage to another ([A-Z][a-z]+) you control, prevent all but (\d+|one) of that damage\s*(?:\.|$)/i);
  if (pab) {
    out.push({
      op: { op: "preventAllBut", floor: pab[2].toLowerCase() === "one" ? 1 : parseInt(pab[2], 10) },
      scope: { side: "target", targetSubtype: pab[1].toLowerCase(), excludeSelf: true },
    });
  }

  return out;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip the damage-replacement SENTENCE(S) this card carries — the whole sentence each
 * parseDamageReplacements regex anchors on, so a coverage classifier can confirm the rest of the card is
 * keyword-only. Mirrors parseDamageReplacements' three shapes EXACTLY (same anchors), extended to the whole
 * sentence (up to the terminating period) so the trailing "instead." / scope tail is removed too. Returns the
 * oracle with those sentences blanked; a no-op for the overwhelming majority of cards (no replacement clause).
 *
 * CREED: this strips ONLY a sentence parseDamageReplacements would have matched (so the runtime models it), and
 * the caller still validates the REMAINDER is keyword-only — a card with any other unmodeled clause keeps that
 * residue and stays body-only. Used by coverage.classifyDamageReplacementBody (Twinflame Tyrant et al.).
 */
export function stripDamageReplacementClauses(oracle, card) {
  let t = String(oracle ?? "");
  if (!t) return t;
  const name = String(card?.name ?? "");
  const shortName = name.split(",")[0].trim();
  // SOURCE-SCOPED self ("Double all damage <NAME>/this creature/it would deal …."), whole sentence.
  if (shortName) {
    t = t.replace(
      new RegExp(`double all damage (?:that )?(?:${escapeRe(name)}|${escapeRe(shortName)}|this creature|this permanent|it) would deal[^.]*\\.?`, "i"),
      " ",
    );
  }
  // SOURCE-SCOPED controller-wide (Furnace-of-Rath "you control" family), whole sentence — BOTH the
  // "if a source you control would deal damage … deals double …" shape and the "double the damage … sources you
  // control would deal" shape.
  t = t.replace(/if a source you control would deal damage[^.]*deals? double[^.]*\.?/i, " ");
  t = t.replace(/double (?:the )?damage[^.]*sources? you control would deal[^.]*\.?/i, " ");
  // TARGET-SCOPED (affected player), whole sentence.
  t = t.replace(/if a source would deal damage to you[^.]*deals? double[^.]*\.?/i, " ");
  // SOURCE-SCOPED entered-this-turn (Neriv), whole sentence — mirrors the parse anchor above.
  t = t.replace(/if a creature you control that entered this turn would deal damage,? it deals twice that much damage instead[^.]*\.?/i, " ");
  // CM-1 SYMMETRIC-ALL double (Furnace of Rath / Dictate), whole sentence.
  t = t.replace(/if a source would deal damage to a permanent or player[^.]*\.?/i, " ");
  // CM-1 SOURCE-you-control TRIPLE (Fiery Emancipation / City on Fire), whole sentence.
  t = t.replace(/if a source you control would deal damage[^.]*deals? triple[^.]*\.?/i, " ");
  // CM-1 CREATURE-you-control double (Gratuitous Violence), whole sentence.
  t = t.replace(/if a creature you control would deal damage[^.]*deals? double[^.]*\.?/i, " ");
  t = t.replace(/if a creature you control with a \+1\/\+1 counter on it would deal damage[^.]*deals? double[^.]*\.?/i, " "); // H11 Uncivil Unrest
  // TEMPLE ALTISAUR subtype-scoped partial prevention, whole sentence — mirrors the parse anchor.
  t = t.replace(/if a source would deal damage to another [A-Z][a-z]+ you control, prevent all but (?:\d+|one) of that damage\.?/i, " ");
  // CM-1 SELF combat-to-player double (Charging Tuskodon), whole sentence.
  t = t.replace(/if this creature would deal combat damage to a player[^.]*\.?/i, " ");
  // SHELF D11 — the five new scopes, whole sentences (mirroring their parse anchors exactly).
  t = t.replace(/double all damage that creatures you control with counters on them would deal\.?/i, " ");
  t = t.replace(/double all damage that creature sources you control would deal\.?/i, " ");
  t = t.replace(/[Ii]f an? [A-Z][a-z]+ source you control would deal damage to a permanent or player, it deals double that damage to that permanent or player instead\.?/, " ");
  t = t.replace(/if a source would deal damage to an opponent, it deals double that damage to that player instead\.?/i, " ");
  t = t.replace(/double all damage equipped creature would deal\.?/i, " ");
  return t;
}

// ─── Synthesized-on-read scan ──────────────────────────────────────────────────

/**
 * Does this permanent (its card) carry a damage-replacement static ability?
 * Synthesized-on-read from the card oracle — no stored entry, no removal hook.
 */
export function isDamageReplacement(permanent) {
  return parseDamageReplacements(permanent?.card).length > 0;
}

/**
 * Every active damage-replacement entry on the battlefield, each tagged with the
 * permanent that grants it (for the source-side `self` filter). Pure scan; the
 * entries vanish the instant a permanent leaves (it's re-scanned per call).
 */
export function collectDamageReplacements(state) {
  const out = [];
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      for (const entry of parseDamageReplacements(perm.card)) {
        out.push({ ...entry, permanentId: perm.id, permanentController: pid });
      }
    }
  }
  return out;
}

/**
 * Fast gate: is there ANY damage-replacement on the board? Call sites gate the
 * whole consult on this so a no-doubler board runs the byte-identical path it
 * does today (the CREED negative-test guarantee).
 */
/**
 * COMBAT-DAMAGE-UNPREVENTABLE (SG-11, 2026-09-03 — Frenzied Baloth, CR 615.12): "Combat damage can't be
 * prevented." A board-wide static (any controller — the sentence names no player): while ANY battlefield
 * permanent prints it, every combat-damage prevention effect (a fog latch, a creature's printed or attached
 * prevent wall, a counter shield, a prevent / prevent-all-but replacement op) does nothing to COMBAT damage.
 * Noncombat prevention is untouched. Read off the exact sentence, own line.
 */
export function combatDamageUnpreventable(state) {
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      const o = String(perm?.card?.oracle || perm?.card?.oracle_text || "");
      if (/(?:^|\n)\s*combat damage can't be prevented\.?\s*(?:\n|$)/i.test(o)) return true;
    }
  }
  return false;
}

export function boardHasDamageReplacement(state) {
  for (const pid of Object.keys(state?.players || {})) {
    for (const perm of state.players[pid].battlefield || []) {
      if (isDamageReplacement(perm)) return true;
    }
  }
  return false;
}

// ─── Filters (source-side AND target-side — MUST-FIX 2) ─────────────────────────

/**
 * Build the applicability predicate for one replacement entry. Supports BOTH a
 * source-side scope (matches on the damage SOURCE / its controller) and a
 * target-side scope (matches on the AFFECTED player / target controller). The
 * predicate takes the damage `event` and returns true iff this replacement
 * applies to it.
 */
export function buildSourceFilter(entry, _state) {
  const scope = entry?.scope || {};
  // SYMMETRIC-ALL (CM-1 — Furnace of Rath / Dictate): no source/target restriction — every damage event is
  // doubled. Checked first so the un-scoped shape can't fall through to the source-side branches below.
  if (scope.side === "any") {
    return () => true;
  }
  if (scope.side === "target") {
    // TARGET-SUBTYPE (Temple Altisaur): the AFFECTED CREATURE must carry the subtype (live front-face
    // read), be controlled by the replacement's controller ("you control"), and — CR 109.5 "another" —
    // not be this permanent itself. A target off the battlefield can't be verified → no match (FN-safe).
    if (scope.targetSubtype) {
      return (event) => {
        if (event?.targetKind !== "creature" || event.targetId == null) return false;
        if (scope.excludeSelf && event.targetId === entry.permanentId) return false;
        for (const pid of Object.keys(_state?.players || {})) {
          const tgt = (_state.players[pid].battlefield || []).find((p) => p.id === event.targetId);
          if (tgt) {
            if (pid !== entry.permanentController) return false;
            const type = String(tgt.card?.type_line ?? tgt.card?.type ?? "").toLowerCase();
            return new RegExp(`\\b${scope.targetSubtype}\\b`).test(type);
          }
        }
        return false;
      };
    }
    // TO AN OPPONENT (Fiendish Duo, shelf D11): a player other than the replacement's controller is being dealt to.
    // Players only — "to an opponent" names no permanent.
    if (scope.affectedOpponent) {
      return (event) => event?.targetKind === "player" && event.targetId != null && event.targetId !== entry.permanentController;
    }
    // Affected-player scoped: the replacement's controller is the player being dealt to.
    return (event) => event?.targetKind === "player"
      && event?.targetId === entry.permanentController;
  }
  // Source-side (default).
  // THE HOST (shelf D11 — Mjölnir's "equipped creature"): the source must be the permanent this Equipment is attached to,
  // read live off the Equipment (a pure battlefield scan, like the branches below).
  if (scope.hostOfSelf) {
    return (event) => {
      if (event?.sourceId == null) return false;
      for (const pid of Object.keys(_state?.players || {})) {
        const self = (_state.players[pid].battlefield || []).find((p) => p.id === entry.permanentId);
        if (self) return self.attachedTo != null && self.attachedTo === event.sourceId;
      }
      return false;
    };
  }
  if (scope.self) {
    // This-permanent-only (Wolverine / Charging Tuskodon): the damage source must BE this permanent. CM-1 adds
    // two OPTIONAL gates — combatOnly (event.isCombat) and targetPlayerOnly (targetKind==="player") — so a self
    // doubler scoped to "combat damage to a player" (Charging Tuskodon) doesn't double its damage to blockers or
    // any noncombat damage. Wolverine (neither flag set) is byte-identical: both gates are skipped.
    return (event) => {
      if (event?.sourceId == null || event.sourceId !== entry.permanentId) return false;
      if (scope.combatOnly && !event.isCombat) return false;
      if (scope.targetPlayerOnly && event.targetKind !== "player") return false;
      return true;
    };
  }
  if (scope.controller === "you") {
    // Controller-wide: any source the entry's controller controls. When the entry is gated to creatures that
    // ENTERED THIS TURN (Neriv), additionally require the live SOURCE permanent to have entered on the current
    // turn — re-read from state (an inline battlefield scan, mirroring collectDamageReplacements; keeps this a
    // pure leaf with no gameState import). A source whose enteredOnTurn !== state.turn (or that can't be found —
    // e.g. an already-left source) is NOT doubled, so the replacement can never over-fire on a stale creature.
    if (scope.enteredThisTurn) {
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        const turn = _state?.turn;
        let src = null;
        for (const pid of Object.keys(_state?.players || {})) {
          src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) break;
        }
        return !!src && src.enteredOnTurn === turn;
      };
    }
    if (scope.sourceIsCreature) {
      // CM-1 (Gratuitous Violence): controller-wide, but the live SOURCE permanent must be a CREATURE — re-read
      // from state (an inline battlefield scan, mirroring the enteredThisTurn branch; keeps this a pure leaf with
      // no gameState import). A noncreature source you control (a burn spell, an artifact pinger) is NOT doubled;
      // a source not on the battlefield (a spell — never a permanent) can't be found → not doubled. In combat
      // every source IS a creature, so this doubles all your creatures' combat damage.
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        let src = null;
        for (const pid of Object.keys(_state?.players || {})) {
          src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) break;
        }
        if (!src) return false;
        const type = String(src.card?.type_line ?? src.card?.type ?? "").toLowerCase();
        if (!/\bcreature\b/.test(type)) return false;
        // Uncivil Unrest's +1/+1 gate; "any" (Raphael, shelf D11) = at least one counter of any kind.
        if (scope.sourceHasCounter === "any" && !Object.values(src.counters || {}).some((n) => Number(n) > 0)) return false;
        if (scope.sourceHasCounter && scope.sourceHasCounter !== "any" && !((src.counters?.[scope.sourceHasCounter] || 0) > 0)) return false;
        return true;
      };
    }
    if (scope.sourceSubtype) {
      // SUBTYPE SOURCES you control (Calamity Bearer, shelf D11): the live source permanent carries the subtype
      // (word-bounded type-line read, like Temple Altisaur's target-side check). A source off the battlefield — a spell —
      // can't be read, so it isn't doubled.
      return (event) => {
        if (event?.sourceController == null || event.sourceController !== entry.permanentController) return false;
        if (event.sourceId == null) return false;
        for (const pid of Object.keys(_state?.players || {})) {
          const src = (_state.players[pid].battlefield || []).find((p) => p.id === event.sourceId);
          if (src) return new RegExp(`\\b${scope.sourceSubtype}\\b`).test(String(src.card?.type_line ?? src.card?.type ?? "").toLowerCase());
        }
        return false;
      };
    }
    return (event) => event?.sourceController != null
      && event.sourceController === entry.permanentController;
  }
  return () => false;
}

// ─── The 616-ordered consult ────────────────────────────────────────────────────

/**
 * Apply the op of one replacement entry to a running amount. Multiplier/addend —
 * NEVER a boolean. Unknown ops are a no-op (safe false-negative).
 */
function applyOp(amount, op) {
  if (!op) return { amount, prevented: false };
  if (op.op === "multiply") return { amount: amount * (op.factor ?? 1), prevented: false };
  if (op.op === "add") return { amount: amount + (op.addend ?? 0), prevented: false };
  if (op.op === "prevent") return { amount: 0, prevented: true };
  // TEMPLE ALTISAUR — "prevent all but N": a CAP, never a floor-up (an amount already ≤ N is untouched,
  // so a 1-damage ping still deals 1 — the printed behaviour, not a fabricated raise).
  if (op.op === "preventAllBut") return { amount: Math.min(amount, Math.max(0, op.floor ?? 1)), prevented: false };
  return { amount, prevented: false };
}

/**
 * The damage-amount-finalization CONSULT. Given the pre-replacement damage
 * `event`, returns `{ amount, prevented }` — the amount to actually deal (after
 * every applicable replacement, in 616.1 order) and whether it was prevented to
 * a no-op.
 *
 * @param {object} state
 * @param {object} event - { sourceId, sourceController, amount, targetKind:"player"|"creature"|"planeswalker", targetId, isCombat }
 */
export function applyDamageReplacements(state, event) {
  const raw = Math.max(0, Number(event?.amount) || 0);
  // 614.5 — a FRESH applied-set PER consult invocation (MUST-FIX 4). Keyed by the entry's permanentId so each
  // distinct replacement applies at most once within THIS event; a separate combat sub-step is a separate
  // call → a separate set → the doubler fires again (correct double-strike doubling, never ×step-count).
  const applied = new Set();
  if (raw <= 0) return { amount: raw, prevented: false };
  const skipPrevention = !!event?.isCombat && combatDamageUnpreventable(state);

  // Collect every applicable entry (both filter sides), then apply in 616.1 order. Deterministic default =
  // battlefield/registration order (collectDamageReplacements order); the affected controller's choice hook
  // can reorder later without changing this contract. Routed through the ordered loop NOW — never "double wins".
  const entries = collectDamageReplacements(state)
    .filter((entry) => buildSourceFilter(entry, state)(event));

  let amount = raw;
  let prevented = false;
  for (const entry of entries) {
    if (applied.has(entry.permanentId)) continue; // 614.5 once-per-event-per-replacement
    // SG-11 (Frenzied Baloth): a prevention op is inert against COMBAT damage while the board says it can't
    // be prevented (CR 615.12). Multipliers / addends still apply — only prevention is switched off.
    if (skipPrevention && (entry.op?.op === "prevent" || entry.op?.op === "preventAllBut")) continue;
    applied.add(entry.permanentId);
    const res = applyOp(amount, entry.op);
    amount = res.amount;
    if (res.prevented) { prevented = true; break; }
  }
  return { amount: Math.max(0, amount), prevented };
}

/**
 * Convenience for the call sites: returns the (possibly doubled) amount for a
 * damage event, or the raw amount unchanged when the board has no replacement
 * (the byte-identical gate). `prevented` collapses to 0.
 */
export function consultDamageAmount(state, event) {
  if (!boardHasDamageReplacement(state)) return Math.max(0, Number(event?.amount) || 0);
  const { amount, prevented } = applyDamageReplacements(state, event);
  return prevented ? 0 : amount;
}
