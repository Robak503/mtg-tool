/**
 * animateDeadGate.js — the "Enchant creature card in a graveyard" reanimation Aura (the play-weighted program, P·12 — Animate
 * Dead, EDHREC #224; CR 303.4, 704.5m). A ZERO-IMPORT leaf: triggers, coverage, legalChoices, the dispatcher and the resolver
 * all read this one gate, so the cast offer, the resolution, the synthesized triggers and the coverage tier cannot drift.
 *
 *   "Enchant creature card in a graveyard
 *    When this Aura enters, if it's on the battlefield, it loses "enchant creature card in a graveyard" and gains "enchant
 *    creature put onto the battlefield with this Aura." Return enchanted creature card to the battlefield under your control
 *    and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.
 *    Enchanted creature gets -1/-0."
 *
 * The gate is the EXACT printed text: Dance of the Dead shares the frame but puts the card in tapped and adds a doesn't-untap
 * static and an upkeep untap payment, so it stays out (a safe under-claim).
 */
const ANIMATE_DEAD_ORACLE = [
  "Enchant creature card in a graveyard",
  "When this Aura enters, if it's on the battlefield, it loses \"enchant creature card in a graveyard\" and gains \"enchant creature put onto the battlefield with this Aura.\" Return enchanted creature card to the battlefield under your control and attach this Aura to it. When this Aura leaves the battlefield, that creature's controller sacrifices it.",
  "Enchanted creature gets -1/-0.",
].join("\n");

const normalize = (s) => String(s || "").replace(/[’]/g, "'").replace(/[“”]/g, "\"").replace(/\r/g, "").trim();

/** Is this the exact Animate Dead text (any printing's name)? */
export function isGraveyardReanimateAura(card) {
  return /\bAura\b/.test(String(card?.type || card?.type_line || "")) && normalize(card?.oracle ?? card?.oracle_text) === ANIMATE_DEAD_ORACLE;
}

/**
 * The card AS THE LAYER ENGINE READS IT once attached: "Enchant creature" + its bonus line. That is what the card says it becomes
 * (it "gains enchant creature put onto the battlefield with this Aura"), and the attached-bonus parse is all-or-nothing over the
 * whole oracle, so the trigger sentences would otherwise hide the -1/-0. Only the gated card gets this view.
 */
const ANIMATE_DEAD_ATTACHED_VIEW = "Enchant creature\nEnchanted creature gets -1/-0.";
export function animateDeadBonusView(card) {
  return { ...card, oracle: ANIMATE_DEAD_ATTACHED_VIEW, oracle_text: ANIMATE_DEAD_ATTACHED_VIEW };
}

/**
 * The card's two triggered abilities, synthesized whole (its printed sentences carry an "it loses … and gains …" enchant
 * rewrite and a "that creature" referent no generic parser reads): the ETB returns the enchanted card and attaches the Aura;
 * the leave trigger has the animated creature's controller sacrifice it. Sentinels only effects/atoms/animateDead.js reads.
 */
export function animateDeadDescriptors() {
  return [
    { event: "etb", scope: "self", whose: "any", effect: null, effectClause: "[animate-dead] return the enchanted creature card to the battlefield attached", // comma- and and-free: the clause splitter hands it over whole
      interveningIf: null, optional: false, sourceText: "When this Aura enters, if it's on the battlefield, …" },
    { event: "leavesSelf", scope: "self", whose: "any", effect: null, effectClause: "[animate-dead] the animated creature's controller sacrifices it",
      interveningIf: null, optional: false, sourceText: "When this Aura leaves the battlefield, that creature's controller sacrifices it." },
  ];
}

/**
 * NECROMANCY (the play-weighted program, #1023; CR 603.4, 704.5m) — the enchantment that becomes the reanimation Aura as its own enters
 * trigger resolves:
 *
 *   "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the
 *    permanent it becomes sacrifices it at the beginning of the next cleanup step.
 *    When this enchantment enters, if it's on the battlefield, it becomes an Aura with "enchant creature put onto the battlefield with
 *    Necromancy." Put target creature card from a graveyard onto the battlefield under your control and attach this enchantment to it.
 *    When this enchantment leaves the battlefield, that creature's controller sacrifices it."
 *
 * The gate is the EXACT printed text on an Enchantment. The flash line is the self-flash permission the engine never takes (its cast is
 * offered at sorcery speed only — textNormalize.stripFlashPermissionLine), so its cleanup sacrifice can't arise. Its two triggered
 * abilities come whole from here (its "it becomes an Aura with …" and "that creature" are read by no generic parse): the enters trigger
 * TARGETS a creature card in any graveyard as it goes on the stack and, resolving, makes this permanent an Aura attached to the creature it
 * puts onto the battlefield (effects/atoms/animateDead.js); the leave trigger is Animate Dead's — that creature's controller sacrifices it.
 */
const NECROMANCY_ORACLE = [
  "You may cast this spell as though it had flash. If you cast it any time a sorcery couldn't have been cast, the controller of the permanent it becomes sacrifices it at the beginning of the next cleanup step.",
  "When this enchantment enters, if it's on the battlefield, it becomes an Aura with \"enchant creature put onto the battlefield with Necromancy.\" Put target creature card from a graveyard onto the battlefield under your control and attach this enchantment to it. When this enchantment leaves the battlefield, that creature's controller sacrifices it.",
].join("\n");

/** Is this the exact Necromancy text (any printing's name) on an Enchantment that isn't an Aura? */
export function isNecromancy(card) {
  const type = String(card?.type || card?.type_line || "");
  return /\bEnchantment\b/.test(type) && !/\bAura\b/.test(type) && normalize(card?.oracle ?? card?.oracle_text) === NECROMANCY_ORACLE;
}

/** Necromancy's two triggered abilities, synthesized whole (sentinels only effects/atoms/animateDead.js reads). */
export function necromancyDescriptors() {
  return [
    { event: "etb", scope: "self", whose: "any", effect: null, effectClause: "[necromancy] put target creature card from a graveyard onto the battlefield under your control attached", // comma- and and-free: the clause splitter hands it over whole
      interveningIf: null, optional: false, sourceText: "When this enchantment enters, if it's on the battlefield, …" },
    { event: "leavesSelf", scope: "self", whose: "any", effect: null, effectClause: "[animate-dead] the animated creature's controller sacrifices it",
      interveningIf: null, optional: false, sourceText: "When this enchantment leaves the battlefield, that creature's controller sacrifices it." },
  ];
}
