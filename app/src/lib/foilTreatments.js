/**
 * foilTreatments.js — paper foil/treatment catalog for the printing picker.
 *
 * Scryfall encodes a card's base finishes in `finishes` (nonfoil / foil /
 * etched) and its SPECIAL foil treatment in `promo_types` (surgefoil,
 * galaxyfoil, confettifoil, oilslick, …). A special-foil card is usually its
 * own printing (distinct collector number) whose `finishes` is just ["foil"];
 * the treatment name lives in promo_types. This module turns a printing's
 * (finishes, foilTypes) into the ordered set of selectable treatment buttons
 * the Add modal renders: Normal first, then the (possibly special) Foil, then
 * Etched.
 *
 * Paper-only: the printings index excludes digital (MTGO/Arena) cards entirely,
 * so every foilType reaching this module is a real, ownable paper treatment.
 *
 * The `isFoilTreatment` rule (suffix "foil" + the extras set) is mirrored in
 * scripts/build-collection-printings-index.cjs, which uses it to populate the
 * index's `foilTypes` field. Keep the extras set in sync between the two.
 */

// promo_types that are a foil treatment but don't end in "foil".
const FOIL_TREATMENT_EXTRAS = new Set([
  "oilslick", "stepandcompleat", "gilded", "textured", "neonink",
  "doublerainbow", "invisibleink",
]);

// Display names for the foil treatments present in Scryfall's paper data.
// Anything not listed falls back to a humanized "<Stem> Foil".
const FOIL_TREATMENT_NAMES = {
  surgefoil: "Surge Foil",
  galaxyfoil: "Galaxy Foil",
  confettifoil: "Confetti Foil",
  oilslick: "Oil Slick Foil",
  stepandcompleat: "Step-and-Compleat Foil",
  halofoil: "Halo Foil",
  ripplefoil: "Ripple Foil",
  manafoil: "Mana Foil",
  doublerainbow: "Double Rainbow Foil",
  rainbowfoil: "Rainbow Foil",
  silverfoil: "Silver Foil",
  raisedfoil: "Raised Foil",
  gilded: "Gilded Foil",
  textured: "Textured Foil",
  neonink: "Neon Ink",
  fracturefoil: "Fracture Foil",
  firstplacefoil: "First-Place Foil",
  invisibleink: "Invisible Ink",
  dazzlefoil: "Dazzle Foil",
  dragonscalefoil: "Dragon Scale Foil",
  chocobotrackfoil: "Chocobo Track Foil",
  singularityfoil: "Singularity Foil",
  cosmicfoil: "Cosmic Foil",
  facetfoil: "Facet Foil",
  moonlitfoil: "Moonlit Foil",
};

// Treatments that merely describe a foil's substrate rather than name a finish
// (e.g. a card is "oil slick" AND "raised foil"); the more specific one wins.
const GENERIC_FOILS = new Set(["raisedfoil", "silverfoil", "rainbowfoil"]);

/** True when a Scryfall promo_type names a special foil treatment. */
export function isFoilTreatment(promo) {
  return typeof promo === "string" && (promo.endsWith("foil") || FOIL_TREATMENT_EXTRAS.has(promo));
}

/** Human-facing label for a single foil promo_type. */
export function foilTreatmentLabel(promo) {
  if (FOIL_TREATMENT_NAMES[promo]) return FOIL_TREATMENT_NAMES[promo];
  if (typeof promo === "string" && promo.endsWith("foil")) {
    const stem = promo.slice(0, -4);
    return `${stem.charAt(0).toUpperCase()}${stem.slice(1)} Foil`;
  }
  if (typeof promo === "string" && promo.length) {
    return promo.charAt(0).toUpperCase() + promo.slice(1);
  }
  return "Foil";
}

/**
 * Pick the most descriptive foil treatment from a printing's foilTypes.
 * Prefers a specific named treatment over a generic substrate descriptor.
 */
export function bestFoilTreatment(foilTypes) {
  const list = (Array.isArray(foilTypes) ? foilTypes : []).filter(isFoilTreatment);
  if (list.length === 0) return null;
  return list.find(p => !GENERIC_FOILS.has(p)) || list[0];
}

/**
 * Display label for one OWNED finish line (the Vault ledger's Finish column —
 * Colton, 2026-07-19: "basic foil just label being foil… but we also have halo
 * foil, surge foil, mana foil, oil slick"). Plain finishes stay plain; a foil
 * line is upgraded to the printing's special treatment name when its foilTypes
 * name one. Unknown/absent foilTypes degrade to "Foil" — never invented.
 */
export function finishDisplayLabel(finish, foilTypes) {
  if (finish === "etched") return "Etched";
  if (finish !== "foil") return "Normal";
  const special = bestFoilTreatment(foilTypes);
  return special ? foilTreatmentLabel(special) : "Foil";
}

/**
 * Ordered, selectable treatment buttons for one printing.
 * Returns [{ finish, label, treatment }] — Normal first, then the (special or
 * plain) Foil, then Etched — driven by the printing's `finishes`. The foil
 * button's label is upgraded to the special-foil name when promo_types name one.
 */
export function treatmentButtons(finishes, foilTypes) {
  const present = new Set(
    Array.isArray(finishes) && finishes.length ? finishes : ["nonfoil"],
  );
  const special = bestFoilTreatment(foilTypes);
  const out = [];
  if (present.has("nonfoil")) out.push({ finish: "nonfoil", label: "Normal", treatment: null });
  if (present.has("foil")) {
    out.push({ finish: "foil", label: special ? foilTreatmentLabel(special) : "Foil", treatment: special });
  }
  if (present.has("etched")) out.push({ finish: "etched", label: "Etched", treatment: null });
  return out;
}
