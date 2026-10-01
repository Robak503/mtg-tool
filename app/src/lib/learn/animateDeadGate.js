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
