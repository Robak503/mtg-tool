/**
 * resolverKeys.js — the canonical resolver-key contract, a zero-import LEAF.
 *
 * It moved out of resolvers.js (which re-exports it, so every importer is unchanged) for the reason
 * markPendingArbiter did: the effect atoms need it and cannot import resolvers.js (resolvers → runProgram →
 * effectAtoms would cycle). The first atom to need it builds a fresh spell copy on the stack (P·23 —
 * Sevinne's Reclamation's self-copy).
 *
 * Frozen + exported so every producer (cast path, triggers, effect interpreter) references the same strings.
 * W5: the dead Phase-1 lanes were DELETED — SPELL_EFFECT ("spell.effect", the single-descriptor legacy spell
 * resolver) and ACTIVATED_EFFECT ("activated.effect", a never-emitted stub) had ZERO production emitters;
 * everything live resolves via EFFECT_PROGRAM / PERMANENT_ETB / AURA_ETB / ATTACH / SPELL_NOOP / MANUAL.
 * (parseSpellEffect — the PARSE half — stays: the AI scorer and the parser's legacyToAtom fallback still
 * consume it.)
 */
export const RESOLVER_KEYS = Object.freeze({
  PERMANENT_ETB: "spell.permanent",     // a permanent spell entering the battlefield
  SPELL_NOOP: "spell.noop",             // a recognized-but-unhandled instant/sorcery — log + pop
  TRIGGER_EFFECT: "trigger.effect",     // DEPRECATED (W4): retired zombie lane — resolves as manual; key kept for serialized saves
  MANUAL: "manual",                     // Arbiter escape valve — surfaces an "unresolved" log
  EFFECT_PROGRAM: "effect-program",     // the P2.2 multi-atom interpreter (the live spell/trigger/ability lane)
  ATTACH: "attach",                     // Equip/Aura attach — sets attachedTo + attachments
  AURA_ETB: "spell.aura",               // an Aura spell resolving: enter + attach to its target
  GY_SELF_RETURN: "gy.self-return",     // GY-1 — "Return this card from your graveyard to your hand / the battlefield [tapped]"
  HAND_SELF_PUT: "hand.self-put",       // play-weighted #570 — "{N}: Put this card from your hand onto the battlefield." (Talon Gates of Madara)
});
