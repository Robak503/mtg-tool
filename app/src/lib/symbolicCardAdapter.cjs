const fs = require("node:fs");
const path = require("node:path");

const APP_ROOT = process.cwd();
const ORACLE_FILE = path.join(APP_ROOT, "data", "scryfall.oracle.local.json");

const CARD_TYPES = new Set([
  "Artifact",
  "Battle",
  "Creature",
  "Enchantment",
  "Instant",
  "Kindred",
  "Land",
  "Planeswalker",
  "Sorcery",
  "Tribal",
]);

let oracleCache = null;

function normalizeName(name) {
  return String(name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function loadOracleRepository() {
  if (oracleCache) return oracleCache;
  const payload = JSON.parse(fs.readFileSync(ORACLE_FILE, "utf8"));
  const cards = Array.isArray(payload.cards) ? payload.cards : [];
  const byName = new Map();
  const isPlayableOracle = card =>
    card &&
    card.layout !== "art_series" &&
    card.type_line &&
    !/^Card(?:\s*\/\/\s*Card)?$/i.test(card.type_line);
  const setOnce = (name, card) => {
    const key = normalizeName(name);
    if (!key) return;
    const existing = byName.get(key);
    if (!existing || (!isPlayableOracle(existing) && isPlayableOracle(card))) byName.set(key, card);
  };

  for (const card of cards) {
    if (card.name) setOnce(card.name, card);
    if (card.name?.includes(" // ")) {
      setOnce(card.name.split(" // ")[0], card);
    }
  }

  for (const card of cards) {
    for (const face of card.card_faces || []) {
      if (face.name) setOnce(face.name, card);
    }
  }

  oracleCache = {
    generatedAt: payload.generatedAt,
    scryfallUpdatedAt: payload.scryfallUpdatedAt,
    count: cards.length,
    cards,
    byName,
  };
  return oracleCache;
}

function findOracleCard(name) {
  const repo = loadOracleRepository();
  return repo.byName.get(normalizeName(name)) || null;
}

function oracleText(card) {
  if (!card) return "";
  if (card.oracle_text) return card.oracle_text;
  return (card.card_faces || [])
    .map(face => face.oracle_text || "")
    .filter(Boolean)
    .join("\n");
}

function frontFace(card) {
  return card?.card_faces?.[0] || card || {};
}

function parseNumber(value) {
  if (value == null || value === "*" || String(value).includes("*")) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseTypeLine(typeLine = "") {
  const [main, subtypesRaw = ""] = String(typeLine).split(/\s+(?:-|--|\u2014)\s+/);
  const supertypes = [];
  const types = [];

  for (const part of main.split(/\s+/).filter(Boolean)) {
    if (CARD_TYPES.has(part)) types.push(part);
    else supertypes.push(part);
  }

  const subtypes = subtypesRaw
    .split(/\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  return { supertypes, types, subtypes };
}

function compactText(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function inferSymbolicAbilities(card) {
  const text = compactText(oracleText(card));
  const name = normalizeName(card?.name);
  const abilities = new Set();

  if (/if (a |one or more )?(card|cards|card or token|cards and tokens|permanent|permanents).+would be put into (a |an |their |its |your |opponent's |opponents' )?graveyard.+exile (it|them|that card|those cards) instead/.test(text)) {
    if (/opponent/.test(text)) abilities.add("graveyard-to-exile-opponents");
    else abilities.add("graveyard-to-exile-all");
  }

  if (/if .*opponent'?s nontoken creature.*would die|if .*nontoken creature an opponent controls.*would die|if .*creature card would be put into an opponent'?s graveyard/.test(text)) {
    abilities.add("opponent-nontoken-creature-graveyard-to-exile");
  }

  if (/whenever (this creature|[^.]+) or another creature you control dies/.test(text) ||
    /whenever (this creature|[^.]+) or another creature or planeswalker you control dies/.test(text) ||
    /whenever a creature you control dies/.test(text)
  ) {
    abilities.add("dies-trigger:creature-you-control");
  } else if (/whenever .*another creature dies|whenever .*creature dies|whenever .*creature.*dies/.test(text)) {
    abilities.add("dies-trigger:any-creature");
  } else if (/whenever .*dies|when .*dies/.test(text)) {
    abilities.add("dies-trigger");
  }

  if (/whenever another creature you control enters/.test(text)) {
    abilities.add("etb-trigger:another-creature-you-control");
  } else if (/whenever a creature you control enters/.test(text)) {
    abilities.add("etb-trigger:creature-you-control");
  } else if (/whenever another creature enters/.test(text)) {
    abilities.add("etb-trigger:any-other-creature");
  } else if (/whenever a creature enters/.test(text)) {
    abilities.add("etb-trigger:any-creature");
  } else if (/when .* enters\b|whenever .* enters\b/.test(text)) {
    abilities.add("own-etb-trigger");
  }

  if (/at the beginning of each upkeep/.test(text)) {
    abilities.add("beginning-upkeep-trigger:each-upkeep");
  } else if (/at the beginning of your upkeep/.test(text)) {
    abilities.add("beginning-upkeep-trigger:your-upkeep");
  }

  if (/if .* would be dealt damage or destroyed, remove a shield counter/.test(text)) {
    abilities.add("mentions-shield-counter-replacement");
  }

  if (/this spell can't be countered/.test(text) || /this spell can'?t be countered/.test(text)) {
    abilities.add("spell-static:cant-be-countered");
  }

  if (name === "rest in peace") abilities.add("graveyard-to-exile-all");
  if (name === "leyline of the void") abilities.add("graveyard-to-exile-opponents");
  if (name === "anafenza the foremost") abilities.add("opponent-nontoken-creature-graveyard-to-exile");
  if (name === "blood artist" || name === "zulaport cutthroat" || name === "cruel celebrant") {
    abilities.delete("dies-trigger:any-creature");
    if (name === "blood artist") abilities.add("dies-trigger:any-creature");
    else abilities.add("dies-trigger:creature-you-control");
  }

  if (/target player loses 1 life and you gain 1 life/.test(text)) {
    abilities.add("effect:target-player-loses-1-controller-gains-1");
  }
  if (/each opponent loses 1 life and you gain 1 life/.test(text)) {
    abilities.add("effect:each-opponent-loses-1-controller-gains-1");
  }
  if (/you gain 1 life/.test(text) && /whenever another creature enters/.test(text)) {
    abilities.add("effect:controller-gains-1");
  }
  if (/deals 1 damage to each opponent/.test(text)) {
    abilities.add("effect:deal-1-each-opponent");
  }
  if (/deals 2 damage to each opponent/.test(text)) {
    abilities.add("effect:deal-2-each-opponent");
  }
  if (/create a 3\/3 blue serpent creature token named koma'?s coil/.test(text)) {
    abilities.add("effect:create-koma-coil");
  }

  if (/counter target spell/.test(text)) {
    abilities.add("spell-effect:counter-target-spell");
  }
  if (/destroy target creature/.test(text)) {
    abilities.add("spell-effect:destroy-target-creature");
  }
  if (/exile target creature/.test(text) && /its controller gains life equal to its power/.test(text)) {
    abilities.add("spell-effect:exile-target-creature-controller-gains-power-life");
  } else if (/exile target creature/.test(text)) {
    abilities.add("spell-effect:exile-target-creature");
  }
  if (/deals 3 damage to any target/.test(text)) {
    abilities.add("spell-effect:deal-3-any-target");
  }

  if (name === "swords to plowshares") abilities.add("spell-effect:exile-target-creature-controller-gains-power-life");
  if (name === "path to exile") abilities.add("spell-effect:exile-target-creature");
  if (name === "murder") abilities.add("spell-effect:destroy-target-creature");
  if (name === "counterspell") abilities.add("spell-effect:counter-target-spell");
  if (name === "lightning bolt") abilities.add("spell-effect:deal-3-any-target");

  for (const keyword of card?.keywords || []) {
    abilities.add(`keyword:${normalizeName(keyword).replace(/\s+/g, "-")}`);
  }

  return [...abilities].sort();
}

function symbolicObjectFromCard(nameOrCard, overrides = {}) {
  const card = typeof nameOrCard === "string" ? findOracleCard(nameOrCard) : nameOrCard;
  if (!card) {
    return {
      name: typeof nameOrCard === "string" ? nameOrCard : "Unknown Card",
      types: [],
      subtypes: [],
      abilities: [],
      metadata: { adapterStatus: "missing-card" },
      ...overrides,
    };
  }

  const face = frontFace(card);
  const parsedType = parseTypeLine(card.type_line || face.type_line || "");
  const abilities = new Set([
    ...inferSymbolicAbilities(card),
    ...(overrides.abilities || []),
  ]);

  return {
    ...overrides,
    name: card.name,
    manaCost: card.mana_cost || face.mana_cost || "",
    manaValue: Number(card.cmc ?? 0),
    types: overrides.types || parsedType.types,
    subtypes: overrides.subtypes || parsedType.subtypes,
    abilities: [...abilities].sort(),
    power: overrides.power ?? parseNumber(card.power ?? face.power),
    toughness: overrides.toughness ?? parseNumber(card.toughness ?? face.toughness),
    metadata: {
      ...(overrides.metadata || {}),
      oracleId: card.oracle_id,
      scryfallId: card.id,
      typeLine: card.type_line || face.type_line || "",
      oracleText: oracleText(card),
      supertypes: parsedType.supertypes,
      adapterStatus: "hydrated",
    },
  };
}

function hydrateZoneObjects(objects = []) {
  return objects.map(object => {
    if (!object || typeof object !== "object") return object;
    if (object.cardName) {
      const { cardName, ...overrides } = object;
      return symbolicObjectFromCard(cardName, overrides);
    }
    if (object.hydrateCard !== false && object.name && (!object.types || !object.metadata?.oracleText)) {
      return symbolicObjectFromCard(object.name, object);
    }
    return object;
  });
}

function hydrateStateInput(input = {}) {
  const stateInput = input.state ? { ...input.state } : { ...input };
  const zones = { ...(stateInput.zones || {}) };
  const cardZones = stateInput.cardZones || input.cardZones || {};

  for (const [zone, entries] of Object.entries(cardZones)) {
    zones[zone] = [...(zones[zone] || []), ...hydrateZoneObjects(entries)];
  }

  if (input.hydrateCards || stateInput.hydrateCards || stateInput.cardZones || input.cardZones) {
    for (const [zone, entries] of Object.entries(zones)) {
      zones[zone] = hydrateZoneObjects(entries);
    }
  }

  return {
    ...stateInput,
    zones,
    cardZones: undefined,
  };
}

function hydrateExecutionInput(input = {}) {
  return {
    ...input,
    state: hydrateStateInput(input.state ? input.state : input),
  };
}

module.exports = {
  findOracleCard,
  hydrateExecutionInput,
  hydrateStateInput,
  inferSymbolicAbilities,
  loadOracleRepository,
  oracleText,
  parseTypeLine,
  symbolicObjectFromCard,
};
