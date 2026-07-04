import { lookupCard, oracleText, normalizeName } from "./cardIndex.js";
import { evaluateDeckSalt, lookupSalt } from "./edhrecSalt.js";
import { estimateBracket, findCombos } from "./spellbook.js";

// True fast mana — pieces that generate mana faster than their mana cost warrants and push
// toward cEDH-tier speed. Sol Ring and Ancient Tomb are NOT included here: they are ubiquitous
// staples that the ramp regex already catches, and counting them as "fast mana" would inflate
// power scores for virtually every deck. The scoring bonus for fastMana >= 2 is reserved for
// decks that have actual differential fast mana above the universal baseline.
const FAST_MANA = new Set([
  "mana crypt",
  "jeweled lotus",
  "mox diamond",
  "chrome mox",
  "mox opal",
  "mox amber",
  "lotus petal",
  "mana vault",
  "grim monolith",
]);

const FREE_INTERACTION = new Set([
  "force of will",
  "force of negation",
  "fierce guardianship",
  "deadly rollick",
  "deflecting swat",
  "flawless maneuver",
  "pact of negation",
  "mindbreak trap",
  "commandeer",
  "misdirection",
  "subtlety",
  "grief",
  "endurance",
  "snuff out",
]);

const PREMIUM_LANDS = new Set([
  "tropical island", "underground sea", "volcanic island", "taiga", "savannah",
  "scrubland", "bayou", "tundra", "badlands", "plateau",
  "breeding pool", "watery grave", "steam vents", "stomping ground", "overgrown tomb",
  "temple garden", "hallowed fountain", "blood crypt", "sacred foundry", "godless shrine",
  "polluted delta", "misty rainforest", "scalding tarn", "verdant catacombs", "windswept heath",
  "flooded strand", "wooded foothills", "bloodstained mire", "marsh flats", "arid mesa",
  "command tower", "mana confluence", "city of brass", "exotic orchard", "reflecting pool",
  "boseiju, who endures", "otawara, soaring city", "takenuma, abandoned mire",
]);

const TAP_LAND_HINTS = /\b(enters tapped|gain 1 life|scry 1|gate\b|guildgate|thriving|temple of|refuge|cove|campus)\b/i;
const LAND_RAMP = /\b(search your library for (a|up to|two|three).*land|put .* land card .* battlefield|basic landcycling)\b/i;
const MANA_TEXT = /\b(add|create).*({[wubrgc0-9]}|mana|treasure)|{t}: add|treasure token/i;
const DRAW_TEXT = /\bdraw (a card|cards|x cards|two cards|three cards)|whenever .* draw|look at the top .* put .* into your hand|impulse draw|exile .* play .* this turn/i;
const COUNTER_TEXT = /\bcounter target|counter .* spell|unless its controller pays/i;
const PROTECTION_TEXT = /\b(hexproof|indestructible|protection from|phase out|phases out|regenerate|ward|prevent all damage|can't be the target)\b/i;
const TUTOR_TEXT = /\bsearch your library\b/i;
const RECURSION_TEXT = /\b(return .* from your graveyard|return target .* graveyard|reanimate|escape|flashback|unearth|disturb|from your graveyard to the battlefield)\b/i;
const STAX_TEXT = /\b(players can't|opponents can't|each opponent can't|can't cast spells|skip .* step|players .* don't untap|opponents .* don't untap|only any time they could cast a sorcery|rule of law|each player can't cast more than one|abilities .* can't be activated)\b/i;
const MASS_LAND_TEXT = /\b(destroy all lands|exile all lands|sacrifice all lands|armageddon|ravages of war|jokulhaups|obliterate|decree of annihilation|boom \/\/ bust)\b/i;
const EXTRA_TURN_TEXT = /\btake an extra turn|extra turn after this one/i;

const LAND_TYPES = ["Plains", "Island", "Swamp", "Mountain", "Forest"];
const COLOR_SYMBOLS = ["W", "U", "B", "R", "G"];
const GENERIC_TRIBAL_TYPES = new Set([
  "advisor", "ally", "artificer", "citizen", "cleric", "druid", "human", "monk",
  "noble", "pilot", "rebel", "rogue", "scout", "shaman", "soldier", "warrior",
  "wizard",
]);

const COMMANDER_PROFILES = new Map([
  ["kinnan bonder prodigy", { powerFloor: 8.2, bracketFloor: 4, reason: "Kinnan doubles nonland mana and is inherently combo-oriented." }],
  ["yuriko the tiger s shadow", { powerFloor: 8.0, bracketFloor: 4, reason: "Yuriko is a low-cost commander with built-in card advantage and table-wide pressure." }],
  ["thrasios triton hero", { powerFloor: 7.0, bracketFloor: 3, reason: "Thrasios is a cheap partner mana sink and card-advantage engine." }],
  ["tymna the weaver", { powerFloor: 7.0, bracketFloor: 3, reason: "Tymna is a cheap partner draw engine." }],
  ["rograkh son of rohgahh", { powerFloor: 6.6, bracketFloor: 3, reason: "Rograkh enables free commander, Mox Amber, Springleaf Drum, and partner pressure." }],
  ["najeela the blade blossom", { powerFloor: 8.0, bracketFloor: 4, reason: "Najeela naturally supports compact infinite-combat lines." }],
  ["urza lord high artificer", { powerFloor: 8.0, bracketFloor: 4, reason: "Urza turns artifacts into mana and is inherently high-powered." }],
  ["the ur dragon", { powerFloor: 6.2, bracketFloor: 3, reason: "The Ur-Dragon has eminence cost reduction and high ceiling tribal payoffs." }],
  ["koma cosmos serpent", { powerFloor: 5.8, bracketFloor: 3, reason: "Koma is expensive but dominates fair tables once resolved." }],
  ["zaxara the exemplary", { powerFloor: 6.4, bracketFloor: 3, reason: "Zaxara is a commander-based mana engine with compact aura combo potential." }],
]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

// ---- X-cost helpers -------------------------------------------------------
// Scryfall's `cmc` treats {X} as 0, but you essentially never cast an X spell
// for X=0, so the ranker deliberately keeps TWO distinct cost models:
//   - manaValueFloorX(): "minimum real cost" — base cmc + 1 per {X} symbol.
//     Used everywhere a COST is evaluated: averageManaValue / curve, ramp
//     tiers, the cheap-cantrip gate, and combo total mana value.
//   - effectiveManaValue(): "what you'd typically pay" — base cmc + an
//     assumed X of 3-5 based on the payoff. Used for impact/playability
//     estimates, where realistic sunk mana matters more than the minimum.

// Front-face mana cost only: joining every face's cost (see manaCostText)
// would double-count a back-face {X} on MDFCs when counting X symbols.
function frontFaceManaCost(card) {
  if (Array.isArray(card?.card_faces) && card.card_faces.length) {
    return card.card_faces[0]?.mana_cost || card?.mana_cost || "";
  }
  return card?.mana_cost || "";
}

function countXSymbols(card) {
  return (frontFaceManaCost(card).match(/\{X\}/g) || []).length;
}

function manaValueFloorX(card) {
  return Number(card?.cmc ?? 0) + countXSymbols(card);
}

function cardManaValue(name) {
  const card = lookupCard(name);
  return manaValueFloorX(card);
}

function colorIdentityForNames(names = []) {
  const colors = new Set();
  for (const name of names) {
    const card = lookupCard(name);
    for (const color of card?.color_identity || []) colors.add(color);
  }
  return [...colors].sort((a, b) => COLOR_SYMBOLS.indexOf(a) - COLOR_SYMBOLS.indexOf(b));
}

function commanderProfile(commanderNames = []) {
  const profiles = commanderNames
    .map(name => COMMANDER_PROFILES.get(normalizeName(name)))
    .filter(Boolean);
  const partnerBoost = commanderNames.length > 1
    ? { powerFloor: 0, bracketFloor: 0, reason: "Partner / multiple-commander access increases flexibility and consistency." }
    : null;
  return {
    powerFloor: profiles.reduce((max, profile) => Math.max(max, profile.powerFloor || 0), 0),
    bracketFloor: profiles.reduce((max, profile) => Math.max(max, profile.bracketFloor || 0), 0),
    reasons: [
      ...profiles.map(profile => profile.reason),
      ...(partnerBoost ? [partnerBoost.reason] : []),
    ],
    partnerBoost: Boolean(partnerBoost),
  };
}

function subtypeTokens(typeLine = "") {
  const subtypeText = String(typeLine).split(/[\u2014-]/).slice(1).join(" ");
  return subtypeText
    .split(/\s+/)
    .map(token => token.replace(/[^A-Za-z]/g, ""))
    .filter(token => token.length > 2)
    .map(token => token.toLowerCase())
    .filter(token => !GENERIC_TRIBAL_TYPES.has(token));
}

function inferDeckArchetype(infos, commanderNames, counts, comboAnalysis) {
  const commanderCards = commanderNames.map(name => lookupCard(name)).filter(Boolean);
  const commanderTypes = new Set(commanderCards.flatMap(card => subtypeTokens(card.type_line)));
  const nonCommanderInfos = infos.filter(info => !isCommanderSection(info.section));
  const nonlandNoncommanders = nonCommanderInfos.filter(info => !info.isLand);
  const creatureInfos = nonCommanderInfos.filter(info => info.isCreature);

  const tribalHits = commanderTypes.size
    ? creatureInfos.filter(info => subtypeTokens(info.typeLine).some(type => commanderTypes.has(type))).length
    : 0;
  const equipmentCount = nonlandNoncommanders.filter(info => /\bEquipment\b/i.test(info.typeLine)).length;
  const auraCount = nonlandNoncommanders.filter(info => /\bAura\b/i.test(info.typeLine)).length;
  const tokenCount = nonlandNoncommanders.filter(info => /\bcreate .* token|token(s)?\b/i.test(info.search)).length;
  const sacrificeCount = nonlandNoncommanders.filter(info => /\bsacrifice\b/i.test(info.search)).length;
  const graveyardCount = nonlandNoncommanders.filter(info => /\bgraveyard\b/i.test(info.search)).length;
  const counterCount = nonlandNoncommanders.filter(info => /\+1\/\+1 counter|proliferate|counter on/i.test(info.search)).length;
  const spellCount = nonlandNoncommanders.filter(info => info.isInstant || info.isSorcery).length;

  let primary = "Goodstuff / Fair Midrange";
  let focusScore = 0.15;
  const reasons = [];

  if (comboAnalysis.early.length || comboAnalysis.deterministic.length >= 2) {
    primary = "Combo";
    focusScore = comboAnalysis.early.length ? 0.75 : 0.55;
    reasons.push(`${comboAnalysis.deterministic.length} deterministic Spellbook combo line(s)`);
  }

  if (primary !== "Combo" && (counts.gameChangers >= 6 || (counts.fastMana >= 5 && counts.tutors >= 5))) {
    primary = "Optimized Value / cEDH Shell";
    focusScore = 0.75;
    reasons.push(`${counts.gameChangers} game changer(s), ${counts.fastMana} fast mana, ${counts.tutors} tutor(s)`);
  }

  if (primary === "Goodstuff / Fair Midrange" && tribalHits >= 12 && tribalHits >= equipmentCount + auraCount) {
    primary = "Tribal";
    focusScore = Math.max(focusScore, clamp(0.35 + tribalHits / 40, 0.45, 0.85));
    reasons.push(`${tribalHits} creature(s) share commander tribe(s): ${[...commanderTypes].slice(0, 3).join(", ")}`);
  }

  if (primary === "Goodstuff / Fair Midrange" && equipmentCount + auraCount >= 8 && counts.protection >= 4) {
    primary = "Voltron / Equipment";
    focusScore = Math.max(focusScore, clamp(0.35 + (equipmentCount + auraCount + counts.protection) / 45, 0.45, 0.8));
    reasons.push(`${equipmentCount} equipment, ${auraCount} aura(s), ${counts.protection} protection piece(s)`);
  }

  if (primary === "Goodstuff / Fair Midrange" && sacrificeCount >= 5 && graveyardCount >= 5) {
    primary = "Aristocrats / Graveyard";
    focusScore = Math.max(focusScore, 0.65);
    reasons.push(`${sacrificeCount} sacrifice references and ${graveyardCount} graveyard references`);
  }

  if (tokenCount >= 10) {
    primary = primary === "Goodstuff / Fair Midrange" ? "Tokens" : primary;
    focusScore = Math.max(focusScore, 0.5);
    reasons.push(`${tokenCount} token-production/support card(s)`);
  }

  if (counterCount >= 10) {
    primary = primary === "Goodstuff / Fair Midrange" ? "Counters" : primary;
    focusScore = Math.max(focusScore, 0.5);
    reasons.push(`${counterCount} counter/proliferate card(s)`);
  }

  if (spellCount >= 22) {
    primary = primary === "Goodstuff / Fair Midrange" ? "Spellslinger / Control" : primary;
    focusScore = Math.max(focusScore, 0.45);
    reasons.push(`${spellCount} instant/sorcery card(s)`);
  }

  if (!reasons.length) reasons.push("No dense archetype cluster detected; score leans on generic construction quality.");

  return {
    primary,
    focusScore: round1(focusScore),
    tribalHits,
    equipmentCount,
    auraCount,
    tokenCount,
    sacrificeCount,
    graveyardCount,
    counterCount,
    spellCount,
    reasons,
  };
}

function parseDeckText(deckText = "") {
  const entries = [];
  let section = "Mainboard";

  for (const rawLine of String(deckText || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    // Optional trailing colon: "Commander:" headers are common in exports —
    // the replace() below always intended to handle them, but the old regex
    // (no `:?`) could never match a colon-suffixed line in the first place.
    if (/^(commander|mainboard|deck|sideboard|maybeboard|tokens?):?$/i.test(line)) {
      section = line.replace(/:$/, "");
      continue;
    }
    const csv = line.match(/^(\d+)\s*,\s*"?(.+?)"?$/);
    const plain = line.match(/^(\d+)\s+(.+)$/);
    const match = csv || plain;
    if (!match) continue;
    const qty = Number(match[1]) || 1;
    const name = match[2].replace(/^"|"$/g, "").trim();
    if (!name) continue;
    entries.push({ qty, name, section });
  }

  return entries;
}

function normalizeEntries({ entries, cards, cardNames, deckText }) {
  if (Array.isArray(entries) && entries.length) {
    return entries.map(entry => ({
      qty: Number(entry.qty) || 1,
      name: String(entry.name || "").trim(),
      section: entry.section || "Mainboard",
    })).filter(entry => entry.name);
  }

  if (Array.isArray(cards) && cards.length) {
    return cards.map(card => ({
      qty: Number(card.qty) || 1,
      name: String(card.name || "").trim(),
      section: card.section || "Mainboard",
    })).filter(entry => entry.name);
  }

  const parsed = parseDeckText(deckText);
  if (parsed.length) return parsed;

  return [...new Set(cardNames || [])]
    .map(name => ({ qty: 1, name: String(name || "").trim(), section: "Mainboard" }))
    .filter(entry => entry.name);
}

function isExcludedSection(section) {
  return /sideboard|maybeboard|token/i.test(String(section || ""));
}

function isCommanderSection(section) {
  return /^commander$/i.test(String(section || ""));
}

function cardInfo(entry) {
  const card = lookupCard(entry.name);
  const typeLine = card?.type_line || "";
  const text = oracleText(card);
  const nameKey = normalizeName(entry.name);
  // Raw Scryfall mana value ({X} counts as 0) — kept for reporting and as the
  // base of effectiveManaValue(). Cost evaluation uses manaValueFloored.
  const manaValue = Number(card?.cmc ?? 0);
  const manaValueFloored = manaValueFloorX(card);

  // For MDFCs (type_line like "Sorcery // Land"), use the front face type for
  // classification so spell//land cards aren't mistakenly treated as pure lands
  // and lose all their spell-role flags (ramp, draw, interaction, etc.).
  // Front face is card_faces[0]; fall back to the part before " // " in type_line.
  const frontTypeLine = card?.card_faces?.[0]?.type_line
    || typeLine.split(" // ")[0]
    || typeLine;

  const isLand = /\bland\b/i.test(frontTypeLine);
  const isCreature = /\bcreature\b/i.test(typeLine);
  const isArtifact = /\bartifact\b/i.test(typeLine);
  const isInstant = /\binstant\b/i.test(frontTypeLine);
  const isSorcery = /\bsorcery\b/i.test(frontTypeLine);

  return {
    entry,
    card,
    found: Boolean(card),
    name: card?.name || entry.name,
    nameKey,
    qty: Number(entry.qty) || 1,
    section: entry.section || "Mainboard",
    typeLine,
    text,
    search: `${entry.name}\n${typeLine}\n${text}`,
    manaValue,
    manaValueFloored,
    isLand,
    isCreature,
    isArtifact,
    isInstant,
    isSorcery,
  };
}


function isRamp(info) {
  if (info.isLand) return false;
  if (FAST_MANA.has(info.nameKey)) return true;
  if (LAND_RAMP.test(info.search)) return true;
  if (MANA_TEXT.test(info.search) && (info.isArtifact || info.isCreature || /enchantment/i.test(info.typeLine) || /treasure/i.test(info.search))) return true;
  return false;
}

function rampWeight(info) {
  if (!isRamp(info)) return 0;
  // Cost tiers use the X-floored mana value: an {X} ramp spell is never truly
  // castable at X=0, so it must not qualify for the cheap-ramp tiers.
  if (FAST_MANA.has(info.nameKey)) return info.manaValueFloored <= 1 ? 1 : 0.9;
  if (LAND_RAMP.test(info.search)) {
    if (info.manaValueFloored <= 2) return 0.85;
    if (info.manaValueFloored === 3) return 0.65;
    return 0.45;
  }
  if (/treasure token/i.test(info.search)) {
    if (/\bwhenever\b|\bat the beginning\b|\battack/i.test(info.search)) return 0.35;
    return 0.55;
  }
  if (info.manaValueFloored <= 1) return 0.85;
  if (info.manaValueFloored === 2) return 0.7;
  if (info.manaValueFloored === 3) return 0.45;
  return 0.25;
}

function isTutor(info) {
  if (!TUTOR_TEXT.test(info.search)) return false;
  if (LAND_RAMP.test(info.search)) return false;
  if (/\b(basic land|land card|forest card|island card|swamp card|mountain card|plains card)\b/i.test(info.search)) {
    return false;
  }
  return /\b(any card|creature card|artifact card|enchantment card|instant card|sorcery card|legendary card|planeswalker card|card with mana value|card with different names)\b/i.test(info.search);
}

function isCheapCantrip(info) {
  // X-floored: "{X}{X}{U} draw X cards" is not a cheap cantrip at any real X.
  return !info.isLand && info.manaValueFloored <= 2 && DRAW_TEXT.test(info.search);
}

function landSlowWeight(info) {
  if (!info.isLand) return 0;
  const name = info.nameKey;
  const text = info.search;
  const lowerName = name.toLowerCase();

  if (/\bbasic land\b/i.test(info.typeLine)) return 0;
  if (/\bAs this land enters, you may pay [23] life\. If you don't, it enters tapped\b/i.test(text)) return 0;
  if (/\benters tapped unless you have two or more opponents\b/i.test(text)) return 0;
  if (/\benters tapped unless you control two or more other lands\b/i.test(text)) return 0.25;
  if (/\benters tapped unless you control (a|an) (Plains|Island|Swamp|Mountain|Forest)\b/i.test(text)) return 0.3;
  if (/\bAs this land enters, you may reveal\b/i.test(text)) return 0.35;
  if (/pathway/.test(lowerName)) return 0;
  if (/\bthis land enters tapped\b/i.test(text) && /\bcycling\b/i.test(text)) return 0.75;
  if (/\bthis land enters tapped\b/i.test(text) && /\bsurveil 1\b/i.test(text)) return 0.75;
  if (/undercity sewers|hedge maze|monumental henge/.test(lowerName)) return 0.75;
  if (/jungle shrine|opulent palace|seaside citadel|path of ancestry|evolving wilds|terramorphic expanse|thriving /.test(lowerName)) return 0.85;
  if (/^temple of /.test(lowerName) && /\bscry 1\b/i.test(text)) return 0.85;
  if (info.card?.layout === "modal_dfc" && /\bAs this land enters, you may pay 3 life/i.test(text)) return 0.2;
  if (/\b(this land|it) enters tapped\b/i.test(text)) return 1;
  if (TAP_LAND_HINTS.test(text)) return 0.6;
  return 0;
}

function producedColors(info) {
  const colors = new Set(info.card?.produced_mana || []);
  const text = info.search;

  for (const type of LAND_TYPES) {
    if (new RegExp(`\\b${type}\\b`, "i").test(info.typeLine)) {
      const color = ({ Plains: "W", Island: "U", Swamp: "B", Mountain: "R", Forest: "G" })[type];
      if (color) colors.add(color);
    }
  }

  if (/\bany color\b/i.test(text)) {
    for (const color of COLOR_SYMBOLS) colors.add(color);
  }

  return [...colors].filter(color => COLOR_SYMBOLS.includes(color));
}

function isRemoval(info) {
  if (info.isLand) return false;
  const text = info.search;
  return /\b(destroy|exile|return) target (creature|artifact|enchantment|planeswalker|permanent|nonland permanent|spell)/i.test(text) ||
    /\btarget .* gets -x\/-x|target .* gets -\d+\/-\d+/i.test(text) ||
    /\bdeal[s]? \d+ damage to (any target|target creature|target planeswalker|target opponent)/i.test(text) ||
    /\b(target creature .* fight|fight[s]? target creature|fights? up to one target creature)/i.test(text) ||
    /\beach opponent sacrifices? (a|an) (creature|artifact|enchantment|permanent|planeswalker)/i.test(text) ||
    /\bexile target spell\b/i.test(text);
}

function isBoardWipe(info) {
  if (info.isLand) return false;
  const text = info.search;
  return /\b(destroy|exile|return) all (creatures|artifacts|enchantments|nonland permanents|permanents)/i.test(text) ||
    /\ball creatures get -\d+\/-\d+|all creatures get -x\/-x/i.test(text) ||
    /\bdeal[s]? \d+ damage to each creature/i.test(text) ||
    /\beach creature\b.*\b(damage|destroyed|sacrifices?|exile)/i.test(text) ||
    /\boverload\b[\s\S]*return each nonland permanent/i.test(text);
}

function roleFlags(info) {
  return {
    land: info.isLand,
    ramp: isRamp(info),
    draw: !info.isLand && DRAW_TEXT.test(info.search),
    removal: isRemoval(info),
    wipe: isBoardWipe(info),
    counter: !info.isLand && COUNTER_TEXT.test(info.search),
    protection: !info.isLand && PROTECTION_TEXT.test(info.search),
    tutor: !info.isLand && isTutor(info),
    recursion: !info.isLand && RECURSION_TEXT.test(info.search),
    stax: !info.isLand && STAX_TEXT.test(info.search),
    massLandDenial: !info.isLand && MASS_LAND_TEXT.test(info.search),
    extraTurn: !info.isLand && EXTRA_TURN_TEXT.test(info.search),
    fastMana: FAST_MANA.has(info.nameKey),
    freeInteraction: FREE_INTERACTION.has(info.nameKey),
    cheapCantrip: isCheapCantrip(info),
    premiumLand: info.isLand && PREMIUM_LANDS.has(info.nameKey),
    slowLand: info.isLand && landSlowWeight(info) > 0,
    gameChanger: Boolean(info.card?.game_changer),
  };
}

function addCount(counts, key, qty) {
  counts[key] = (counts[key] || 0) + qty;
}

function countRoles(infos) {
  const counts = {
    lands: 0,
    nonlands: 0,
    ramp: 0,
    rampWeight: 0,
    draw: 0,
    removal: 0,
    wipes: 0,
    counters: 0,
    protection: 0,
    tutors: 0,
    recursion: 0,
    stax: 0,
    massLandDenial: 0,
    extraTurns: 0,
    gameChangers: 0,
    fastMana: 0,
    freeInteraction: 0,
    cheapCantrips: 0,
    premiumLands: 0,
    slowLands: 0,
    slowLandWeight: 0,
    tapLands: 0,
    creatures: 0,
    artifacts: 0,
    averageManaValue: 0,
    colorSources: Object.fromEntries(COLOR_SYMBOLS.map(color => [color, 0])),
  };

  let mvTotal = 0;
  let mvCards = 0;
  const samples = {};

  for (const info of infos) {
    const flags = roleFlags(info);
    const qty = info.qty;
    counts.rampWeight += rampWeight(info) * qty;
    const slowWeight = landSlowWeight(info) * qty;
    counts.slowLandWeight += slowWeight;
    for (const color of producedColors(info)) {
      counts.colorSources[color] += qty;
    }
    if (flags.land) addCount(counts, "lands", qty);
    else {
      addCount(counts, "nonlands", qty);
      // X floors at 1 per {X} symbol — averageManaValue drives the curve,
      // speed, and efficiency axes, and an X spell is never cast for X=0.
      mvTotal += info.manaValueFloored * qty;
      mvCards += qty;
    }
    if (info.isCreature) addCount(counts, "creatures", qty);
    if (info.isArtifact) addCount(counts, "artifacts", qty);

    for (const key of Object.keys(flags)) {
      if (!flags[key]) continue;
      const countKey = ({
        land: null,
        wipe: "wipes",
        counter: "counters",
        fastMana: "fastMana",
        freeInteraction: "freeInteraction",
        cheapCantrip: "cheapCantrips",
        premiumLand: "premiumLands",
        slowLand: "slowLands",
        gameChanger: "gameChangers",
        tutor: "tutors",
      })[key] || key;
      if (!countKey) continue;
      addCount(counts, countKey, qty);
      if (!samples[countKey]) samples[countKey] = [];
      if (samples[countKey].length < 8) samples[countKey].push(info.name);
    }
  }

  counts.averageManaValue = mvCards ? round1(mvTotal / mvCards) : 0;
  counts.rampWeight = round1(counts.rampWeight);
  counts.slowLandWeight = round1(counts.slowLandWeight);
  counts.tapLands = counts.slowLands;
  if (samples.slowLands && !samples.tapLands) samples.tapLands = samples.slowLands;
  return { counts, samples };
}

function virtualLandCount(infos) {
  let vlc = 0;
  for (const info of infos) {
    const flags = roleFlags(info);
    if (flags.land) {
      vlc += info.qty;
    } else if (flags.ramp) {
      vlc += rampWeight(info) * info.qty;
    } else if (flags.cheapCantrip) {
      vlc += 0.12 * info.qty;
    }
  }
  return round1(vlc);
}

// All-faces mana cost text — used only for requiredColors, where needing the
// colors of either face is the safe assumption. X counting must NOT use this
// (a back-face {X} would inflate the front cost); see frontFaceManaCost().
function manaCostText(card) {
  if (card?.mana_cost) return card.mana_cost;
  return (card?.card_faces || []).map(face => face.mana_cost || "").join("");
}

// X spells whose realistic X is game-ending — matched by card NAME only.
// These used to be text patterns alongside "each opponent", which made every
// X card that merely mentions "each opponent" price as assumedX 5.
const X_HEAVY_STAPLES = new Set([
  "torment of hailfire",
  "exsanguinate",
  "walking ballista",
  "villainous wealth",
  "finale of devastation",
]);

// "What you'd typically pay" model for impact/playability — assumes a
// realistic X of 3-5 by payoff. Distinct from manaValueFloorX() (minimum real
// cost, X>=1), which is what curve/efficiency/combo costing uses.
function effectiveManaValue(info) {
  const base = Number(info.manaValue || 0);
  const xSymbols = countXSymbols(info.card);
  if (!xSymbols) return base;

  const text = `${info.name} ${info.typeLine} ${info.search}`;
  let assumedX = 3;
  if (/\b(draw X|X cards|X target|X damage|loses X life|lose X life|enters with X|X \+1\/\+1 counters|create an X\/X|mana value X|power is X|toughness is X)\b/i.test(text)) {
    assumedX = 4;
  }
  if (X_HEAVY_STAPLES.has(info.nameKey) || /\bwin the game\b/i.test(text)) {
    assumedX = 5;
  }

  return round1(base + assumedX * xSymbols);
}

function requiredColors(info) {
  const colors = new Set();
  const cost = manaCostText(info.card);
  for (const match of cost.matchAll(/\{([WUBRG])(?:\/[WUBRG])?\}/g)) {
    colors.add(match[1]);
  }
  return [...colors];
}

function cardImpact(info, flags, comboCardSet, saltEntry) {
  if (info.isLand) return 0;

  const effectiveMv = effectiveManaValue(info);
  const rank = Number(info.card?.edhrec_rank || 0);
  const popularity = rank ? clamp(7 - Math.log10(rank) * 1.15, 0.5, 6.5) : 2.2;
  let impact = 1.8 + popularity;

  if (flags.gameChanger) impact += 3.6;
  if (flags.fastMana) impact += 2.7;
  if (flags.freeInteraction) impact += 2.4;
  if (flags.tutor) impact += 1.8;
  if (flags.ramp) impact += 0.8;
  if (flags.draw) impact += 0.65;
  if (flags.removal || flags.counter || flags.wipe) impact += 0.65;
  if (flags.protection) impact += 0.45;
  if (flags.recursion) impact += 0.45;
  if (comboCardSet.has(info.nameKey)) impact += 1.6;
  if (saltEntry?.salt) impact += Math.min(1.1, saltEntry.salt * 0.35);
  if (effectiveMv >= 7 && !flags.gameChanger) impact -= 0.7;

  return round1(clamp(impact, 0.5, 18));
}

function cardPlayability(info, counts, commanderColors = []) {
  if (info.isLand) return null;
  const mv = Math.max(1, effectiveManaValue(info));
  const required = requiredColors(info);
  const colorTarget = commanderColors.length >= 4 ? 9 : commanderColors.length === 3 ? 10 : 11;
  const colorScore = required.length
    ? required.reduce((sum, color) => sum + clamp((counts.colorSources?.[color] || 0) / colorTarget, 0, 1), 0) / required.length
    : 1;

  const manaAccess = counts.lands + counts.rampWeight * 0.65 + counts.cheapCantrips * 0.12;
  const curveTarget = 28 + mv * 3.2;
  const curveScore = clamp(manaAccess / curveTarget, 0.35, 1);
  const slowPenalty = clamp(counts.slowLandWeight / 22, 0, 0.22);
  const score = (curveScore * 0.62 + colorScore * 0.38 - slowPenalty) * 100;
  return round1(clamp(score, 15, 100));
}

function deckEfficiencyMetrics(infos, counts, comboAnalysis, salt, commanderColors = []) {
  const comboCardSet = new Set(
    comboAnalysis.complete.flatMap(combo => combo.cards || []).map(normalizeName)
  );
  const nonlandCards = [];

  for (const info of infos) {
    if (info.isLand) continue;
    const flags = roleFlags(info);
    const saltEntry = salt?.ready ? lookupSalt(info.name) : null;
    const impact = cardImpact(info, flags, comboCardSet, saltEntry);
    const playability = cardPlayability(info, counts, commanderColors);
    for (let i = 0; i < info.qty; i++) {
      nonlandCards.push({
        name: info.name,
        manaValue: info.manaValue,
        effectiveManaValue: effectiveManaValue(info),
        impact,
        playability,
      });
    }
  }

  const totalImpact = round1(nonlandCards.reduce((sum, card) => sum + card.impact, 0));
  const averageImpact = nonlandCards.length ? round1(totalImpact / nonlandCards.length) : 0;
  const sortedByCurve = [...nonlandCards].sort((a, b) => a.effectiveManaValue - b.effectiveManaValue || b.impact - a.impact);
  let cumulative = 0;
  let tippingPoint = 0;
  for (const card of sortedByCurve) {
    cumulative += card.impact;
    tippingPoint = Math.max(tippingPoint, card.effectiveManaValue);
    if (totalImpact && cumulative / totalImpact >= 0.65) break;
  }

  const averageMana = counts.averageManaValue || 0;
  const efficiency = round1(clamp(
    10 - Math.max(0, averageMana - 2.2) * 1.1 - Math.max(0, tippingPoint - 4) * 0.85 + Math.min(1.2, counts.rampWeight / 10),
    1,
    10
  ));
  const playability = nonlandCards.length
    ? round1(nonlandCards.reduce((sum, card) => sum + (card.playability ?? 0), 0) / nonlandCards.length)
    : 0;
  const score = round1(clamp(averageImpact * efficiency * 1.1, 0, 100));
  const scorePowerLevel = round1(clamp(1 + score / 11, 1, 10));
  const dedupedByName = [...nonlandCards]
    .filter((card, index, cards) => cards.findIndex(other => other.name === card.name) === index);
  const topImpactCards = [...dedupedByName]
    .sort((a, b) => b.impact - a.impact || a.effectiveManaValue - b.effectiveManaValue)
    .slice(0, 10);
  // Lowest-impact nonland cards — the deterministic cut-candidate signal the
  // deck recommender surfaces (weakest payoff per slot first).
  const lowImpactCards = [...dedupedByName]
    .sort((a, b) => a.impact - b.impact || b.effectiveManaValue - a.effectiveManaValue)
    .slice(0, 12);

  return {
    tippingPoint,
    efficiency,
    impact: totalImpact,
    averageImpact,
    score,
    scorePowerLevel,
    playability,
    topImpactCards,
    lowImpactCards,
  };
}

function analyzeCombos(combos, commanderNames = []) {
  const commanderSet = new Set(commanderNames.map(normalizeName));
  const complete = combos.included.map(combo => {
    const totalManaValue = round1((combo.cards || []).reduce((sum, name) => sum + cardManaValue(name), 0));
    const compactness = combo.cardCount <= 2 ? "compact" : combo.cardCount === 3 ? "medium" : "large";
    const producesText = (combo.produces || []).join(" ").toLowerCase();
    const comboInfos = (combo.cards || []).map(name => cardInfo({ name, qty: 1, section: "Mainboard" }));
    const commanderInvolved = (combo.cards || []).some(name => commanderSet.has(normalizeName(name)));
    const auraUntap = comboInfos.some(info => /\bAura\b/i.test(info.typeLine) && /\buntap enchanted creature\b/i.test(info.search));
    const tapCreatureInvolved = comboInfos.some(info => info.isCreature && /\{T\}: Add|tap.*add/i.test(info.search));
    const nearInfinite = producesText.includes("near-infinite");
    const drawTheGame = producesText.includes("draw the game");
    const hasInfinite = /\b(infinite|win|lock)\b/.test(producesText);
    const hasPayoff = /\b(mana|damage|mill|draw|token|lifegain|life loss|lose the game|wins? the game|storm|combat|death trigger)\b/.test(producesText);
    const deterministic = !nearInfinite && !drawTheGame && hasInfinite && hasPayoff;
    const fragile = commanderInvolved || auraUntap || tapCreatureInvolved;
    const early = deterministic && combo.cardCount <= 2 && totalManaValue <= 7;
    return {
      ...combo,
      totalManaValue,
      compactness,
      deterministic,
      nearInfinite,
      drawTheGame,
      valueLoop: hasInfinite && !hasPayoff,
      fragile,
      commanderInvolved,
      auraUntap,
      tapCreatureInvolved,
      early,
    };
  });

  return {
    complete,
    early: complete.filter(combo => combo.early),
    fragileEarly: complete.filter(combo => combo.early && combo.fragile),
    robustEarly: complete.filter(combo => combo.early && !combo.fragile),
    compact: complete.filter(combo => combo.deterministic && combo.cardCount <= 2),
    deterministic: complete.filter(combo => combo.deterministic),
    drawTheGame: complete.filter(combo => combo.drawTheGame),
    oneCardAway: combos.almostIncluded,
  };
}

function colorSourceShortfall(counts, commanderColors = []) {
  if (!commanderColors.length) return 0;
  const target = commanderColors.length >= 4 ? 9 : commanderColors.length === 3 ? 10 : 11;
  return commanderColors.filter(color => (counts.colorSources?.[color] || 0) < target).length;
}

function scoreAxes(counts, spellbook, commanderColors = []) {
  const earlyCombos = spellbook.comboAnalysis.early.length;
  const robustEarlyCombos = spellbook.comboAnalysis.robustEarly.length;
  const compactCombos = spellbook.comboAnalysis.compact.length;
  const colorShortfall = colorSourceShortfall(counts, commanderColors);

  const speed = clamp(
    (robustEarlyCombos && (counts.freeInteraction >= 2 || counts.tutors >= 4 || counts.fastMana >= 4) ? 3 : 0) ||
    (earlyCombos ? 2 : 0) ||
    (compactCombos ? 1 : 0) ||
    (counts.fastMana >= 3 ? 2 : 0) ||
    (counts.rampWeight >= 8 && counts.averageManaValue <= 3.2 ? 2 : 0) ||
    (counts.rampWeight >= 6 ? 1 : 0),
    0,
    3
  );

  const consistency = clamp(
    (counts.tutors >= 8 ? 3 : counts.tutors >= 5 ? 2 : counts.tutors >= 2 ? 1 : 0) +
    (counts.draw >= 10 ? 1 : 0) +
    (spellbook.comboAnalysis.complete.length >= 2 ? 1 : 0),
    0,
    3
  );

  const interactionTotal = counts.removal + counts.counters + counts.wipes;
  // 14+ total interaction is the top tier (was a `? 2 : ... ? 2` typo that
  // made 14+ and 9+ identical). Math.max instead of `||` so one free
  // interaction piece (tier 2) can't short-circuit and UNDERCUT a deck that
  // also clears the 14+ density tier (tier 3).
  const interaction = clamp(
    Math.max(
      counts.freeInteraction >= 3 ? 3 : counts.freeInteraction >= 1 ? 2 : 0,
      interactionTotal >= 14 ? 3 : interactionTotal >= 9 ? 2 : interactionTotal >= 6 ? 1 : 0
    ),
    0,
    3
  );

  const resilience = clamp(
    (counts.protection >= 6 ? 2 : counts.protection >= 3 ? 1 : 0) +
    (counts.recursion >= 5 ? 1 : 0) +
    (counts.draw >= 12 ? 1 : 0),
    0,
    3
  );

  const manaQuality = clamp(
    (counts.fastMana >= 4 ? 2 : counts.fastMana >= 2 ? 1 : 0) +
    (counts.premiumLands >= 10 ? 2 : counts.premiumLands >= 5 ? 1 : 0) +
    (counts.lands >= 34 && counts.lands <= 39 ? 1 : 0) -
    (counts.slowLandWeight >= 8 ? 1 : 0) -
    (colorShortfall ? 1 : 0),
    0,
    3
  );

  return { speed, consistency, interaction, resilience, manaQuality };
}

function landAssessment(counts, vlc, commanderColors = []) {
  const issues = [];
  const strengths = [];
  const sourceTarget = commanderColors.length >= 4 ? 9 : commanderColors.length === 3 ? 10 : 11;
  const shortColors = commanderColors.filter(color => (counts.colorSources?.[color] || 0) < sourceTarget);

  if (counts.lands < 34) issues.push(`${counts.lands} lands is dangerously low for Commander unless the curve is tiny and ramp is extreme.`);
  else if (counts.lands <= 35 && counts.ramp < 10) issues.push(`${counts.lands} lands with ${counts.ramp} ramp pieces is likely to stumble.`);
  else if (counts.lands >= 36 && counts.lands <= 38) strengths.push(`${counts.lands} lands is in the normal Commander band.`);
  else if (counts.lands >= 39) strengths.push(`${counts.lands} lands supports landfall, high curves, or expensive commanders.`);

  if (counts.averageManaValue > 3.4 && counts.lands < 37) issues.push(`Average mana value ${counts.averageManaValue} wants more lands or cheaper ramp.`);
  if (counts.ramp < 8) issues.push(`${counts.ramp} ramp pieces is below the usual functional floor.`);
  if (counts.draw < 8) issues.push(`${counts.draw} draw pieces is below the safe floor; the deck may run out of gas.`);
  if (counts.slowLandWeight >= 8) issues.push(`Slow-land weight ${counts.slowLandWeight} will slow early development.`);
  else if (counts.slowLandWeight >= 5) issues.push(`Slow-land weight ${counts.slowLandWeight} is noticeable but not fatal.`);
  if (vlc >= 43 && vlc <= 49) strengths.push(`Virtual land count ${vlc} is in a functional range.`);
  if (vlc < 42) issues.push(`Virtual land count ${vlc} is lean; opening hands may be fragile.`);
  if (vlc > 52 && counts.averageManaValue < 3.2) issues.push(`Virtual land count ${vlc} may flood for a low-curve deck.`);
  if (shortColors.length) {
    issues.push(`Color-source shortfall on ${shortColors.join("/")}: target ${sourceTarget}+ sources per commander color.`);
  } else if (commanderColors.length) {
    strengths.push(`Color sources meet the rough ${sourceTarget}+ source target for ${commanderColors.join("/")}.`);
  }

  return { strengths, issues };
}

function attributeRatings(counts, comboAnalysis, land, commanderColors = []) {
  const hasFragileEarly = comboAnalysis.fragileEarly.length > 0;
  const hasRobustEarly = comboAnalysis.robustEarly.length > 0;
  const supportDense = counts.fastMana >= 4 || counts.freeInteraction >= 3 || counts.tutors >= 4;
  const colorShortfall = colorSourceShortfall(counts, commanderColors);

  let speed = 3 + Math.min(3, counts.rampWeight * 0.35) - Math.max(0, counts.averageManaValue - 3) * 0.5;
  if (comboAnalysis.deterministic.length) speed = Math.max(speed, 6);
  if (hasFragileEarly) speed = Math.max(speed, supportDense ? 8 : 7);
  if (hasRobustEarly) speed = Math.max(speed, supportDense ? 9 : 8);
  if (counts.fastMana >= 5 && counts.averageManaValue <= 2.7) speed = Math.max(speed, 9);

  let consistency = 3;
  consistency += counts.draw >= 12 ? 2.2 : counts.draw >= 10 ? 1.8 : counts.draw >= 8 ? 1.2 : counts.draw >= 5 ? 0.6 : 0;
  consistency += counts.tutors >= 8 ? 2.5 : counts.tutors >= 5 ? 2 : counts.tutors >= 3 ? 1.4 : counts.tutors >= 1 ? 0.7 : 0;
  consistency += comboAnalysis.deterministic.length >= 2 ? 0.7 : comboAnalysis.deterministic.length ? 0.4 : 0;
  consistency += counts.rampWeight >= 8 ? 0.7 : counts.rampWeight >= 6 ? 0.4 : 0;

  const interactionTotal = counts.removal + counts.counters + counts.wipes;
  let interaction = interactionTotal >= 14 ? 6.5 : interactionTotal >= 9 ? 6 : interactionTotal >= 6 ? 5 : interactionTotal >= 3 ? 3.5 : 2;
  interaction += counts.freeInteraction >= 5 ? 3 : counts.freeInteraction >= 3 ? 2.3 : counts.freeInteraction >= 1 ? 1.1 : 0;
  if (!counts.freeInteraction) interaction = Math.min(interaction, 6.5);

  let resilience = 4;
  resilience += counts.protection >= 6 ? 1.6 : counts.protection >= 3 ? 1 : counts.protection >= 1 ? 0.4 : 0;
  resilience += counts.recursion >= 5 ? 1.3 : counts.recursion >= 2 ? 0.7 : 0;
  resilience += counts.draw >= 12 ? 0.8 : counts.draw >= 9 ? 0.5 : 0;
  resilience += counts.counters >= 4 ? 0.7 : counts.counters >= 2 ? 0.4 : 0;
  if (hasFragileEarly) resilience -= 0.5;

  let mana = 4.5;
  mana += counts.lands >= 34 && counts.lands <= 39 ? 0.7 : 0;
  mana += counts.rampWeight >= 10 ? 1.5 : counts.rampWeight >= 8 ? 1.2 : counts.rampWeight >= 6 ? 0.8 : 0;
  mana += counts.premiumLands >= 10 ? 1.3 : counts.premiumLands >= 5 ? 0.8 : counts.premiumLands >= 2 ? 0.3 : 0;
  mana += counts.fastMana >= 4 ? 1 : counts.fastMana >= 2 ? 0.5 : counts.fastMana >= 1 ? 0.2 : 0;
  mana -= counts.slowLandWeight >= 8 ? 0.9 : counts.slowLandWeight >= 5 ? 0.4 : 0;
  mana -= colorShortfall ? 0.8 : 0;

  return {
    speed: round1(clamp(speed, 1, 10)),
    consistency: round1(clamp(consistency, 1, 10)),
    interaction: round1(clamp(interaction, 1, 10)),
    resilience: round1(clamp(resilience, 1, 10)),
    mana: round1(clamp(mana, 1, 10)),
  };
}

function competitiveSupportScore(counts, comboAnalysis, commander, commanderColors = []) {
  let score = 0;
  if (counts.gameChangers >= 6) score += 1;
  if (counts.fastMana >= 5) score += 1;
  if (counts.freeInteraction >= 4) score += 1;
  if (counts.tutors >= 6) score += 1;
  if (comboAnalysis.robustEarly.length >= 2) score += 1;
  else if (comboAnalysis.early.length >= 2 && counts.freeInteraction >= 2) score += 0.5;
  if (commander.bracketFloor >= 4) score += 1;
  if (counts.averageManaValue <= 2.5 && counts.interactionTotal >= 10 && counts.rampWeight >= 9) score += 1;
  if (commanderColors.length >= 4 && counts.premiumLands >= 12) score += 1;
  return score;
}

function frictionScore(counts, bracket, salt) {
  let score = 0;
  score += Math.min(4, Math.max(bracket.gameChangers.length, counts.gameChangers));
  score += counts.massLandDenial * 3;
  score += counts.extraTurns >= 2 ? 3 : counts.extraTurns;
  score += Math.min(3, counts.stax);
  score += counts.freeInteraction >= 3 ? 2 : counts.freeInteraction >= 1 ? 1 : 0;
  if (salt?.ready) {
    score += Math.min(2, salt.sum / 18);
    if (salt.topCards?.some(card => card.salt >= 2.4)) score += 1;
  }
  return round1(clamp(score, 0, 10));
}

function cedhMarkers(power, counts, spellbook, commander, commanderColors = []) {
  const gameChangers = Math.max(spellbook.bracket.gameChangers.length, counts.gameChangers);
  const earlyCombos = spellbook.comboAnalysis.early.length;
  const compactCombos = spellbook.comboAnalysis.compact.length;
  const markers = [];

  if (power >= 9.2) markers.push("power score at cEDH range");
  if (gameChangers >= 6) markers.push(`${gameChangers} game changers`);
  if (counts.fastMana >= 5) markers.push(`${counts.fastMana} fast-mana pieces`);
  if (counts.freeInteraction >= 4) markers.push(`${counts.freeInteraction} free interaction pieces`);
  if (counts.tutors >= 6) markers.push(`${counts.tutors} real tutors`);
  if (earlyCombos >= 2) markers.push(`${earlyCombos} compact early combo lines`);
  else if (earlyCombos === 1 && compactCombos >= 2) markers.push("compact combo package");
  if (commander.bracketFloor >= 4) markers.push("commander has inherent optimized/cEDH pressure");
  if (counts.averageManaValue <= 2.5 && counts.interactionTotal >= 10 && counts.rampWeight >= 9) markers.push("low curve with dense mana and interaction");
  if (commanderColors.length >= 4 && counts.premiumLands >= 12) markers.push("premium multicolor mana base");

  return {
    count: markers.length,
    markers,
    gameChangers,
    earlyCombos,
    earlyFragileCombos: spellbook.comboAnalysis.fragileEarly.length,
    earlyRobustCombos: spellbook.comboAnalysis.robustEarly.length,
    compactCombos,
  };
}

function capPowerForSupport(power, counts, markers) {
  let cap = 10;
  const reasons = [];

  if (markers.count < 4) {
    cap = Math.min(cap, 8.8);
    reasons.push("below the support threshold for true cEDH");
  }
  if (counts.freeInteraction === 0 && markers.gameChangers <= 3 && counts.tutors < 3) {
    cap = Math.min(cap, 8.3);
    reasons.push("combo pressure lacks the free interaction/tutor shell that makes it cEDH");
  }
  if (counts.interactionTotal < 6 && markers.gameChangers < 4) {
    cap = Math.min(cap, 7.8);
    reasons.push("low interaction density caps practical power");
  }
  if (markers.earlyFragileCombos > 0 && markers.count < 3 && counts.freeInteraction === 0 && counts.tutors < 3) {
    cap = Math.min(cap, 7.0);
    reasons.push("early combo is fragile and lacks the free-interaction/tutor shell for higher power");
  }
  if (counts.lands < 30 && counts.rampWeight < 12 && markers.count < 5) {
    cap = Math.min(cap, 8.5);
    reasons.push("lean land count without enough acceleration");
  }

  const original = round1(power);
  const cappedPower = round1(Math.min(power, cap));
  return {
    original,
    power: cappedPower,
    cap,
    applied: cappedPower < original,
    reasons: cappedPower < original ? reasons : [],
  };
}

function bracketFromScore(power, counts, spellbook, friction, markers) {
  const gameChangers = Math.max(spellbook.bracket.gameChangers.length, counts.gameChangers);
  const earlyCombos = spellbook.comboAnalysis.early.length;
  const combosFound = spellbook.comboAnalysis.complete.length;

  if (power >= 9.2 && markers.count >= 4) {
    return { bracket: 5, label: "cEDH / Ruthless", reason: `Multiple cEDH markers: ${markers.markers.slice(0, 5).join("; ")}.` };
  }
  const supportedEarlyCombo = earlyCombos > 0 && !(markers.earlyFragileCombos === earlyCombos && counts.freeInteraction === 0 && counts.tutors < 3 && power <= 7.3);
  const oppressiveFriction = friction >= 7 && (counts.massLandDenial > 0 || counts.extraTurns >= 2 || counts.stax >= 4);
  if (gameChangers >= 4 || counts.massLandDenial > 0 || supportedEarlyCombo || power >= 8.1 || oppressiveFriction) {
    return { bracket: 4, label: "Optimized", reason: "Crosses Bracket 3 limits through game changers, early combos, oppressive effects, or raw speed." };
  }
  if (gameChangers > 0 || combosFound > 0 || power >= 6.0) {
    return { bracket: 3, label: "Upgraded", reason: "Has tuned construction, game changers, or late-game combo pressure but avoids hard Bracket 4 triggers." };
  }
  if (power >= 3.8) {
    return { bracket: 2, label: "Core", reason: "Functional deck construction without game changers or compact combo pressure." };
  }
  return { bracket: 1, label: "Exhibition", reason: "Low-pressure or precon-level construction." };
}

function confidence(unresolvedCount, totalCards, spellbookReady) {
  const missingRatio = totalCards ? unresolvedCount / totalCards : 1;
  if (!spellbookReady || missingRatio > 0.18) return "low";
  if (missingRatio > 0.05) return "medium";
  return "high";
}

function summarizeDrivers({ counts, axes, spellbook, land, archetype }) {
  const drivers = [];
  const constraints = [];

  if (archetype?.focusScore >= 0.45) drivers.push(`${archetype.primary} focus (${archetype.reasons[0]})`);
  if (axes.speed >= 2) drivers.push(`speed ${axes.speed}/3 from ramp, fast mana, or compact combo pressure`);
  if (axes.consistency >= 2) drivers.push(`consistency ${axes.consistency}/3 from ${counts.tutors} tutors and ${counts.draw} draw pieces`);
  if (axes.interaction >= 2) drivers.push(`interaction ${axes.interaction}/3 from ${counts.removal + counts.counters + counts.wipes} answer pieces and ${counts.freeInteraction} free interaction`);
  if (spellbook.bracket.gameChangers.length || counts.gameChangers) drivers.push(`${Math.max(spellbook.bracket.gameChangers.length, counts.gameChangers)} local game changer(s)`);
  if (spellbook.comboAnalysis.complete.length) drivers.push(`${spellbook.comboAnalysis.complete.length} complete Spellbook combo(s)`);
  if (counts.fastMana) drivers.push(`${counts.fastMana} fast-mana piece(s)`);

  constraints.push(...land.issues.slice(0, 4));
  if (counts.interactionTotal < 6) constraints.push("low interaction density");
  if (!spellbook.comboAnalysis.complete.length && spellbook.comboAnalysis.oneCardAway.length) {
    constraints.push(`${spellbook.comboAnalysis.oneCardAway.length} one-card-away combo(s) are upgrade paths, not current wins`);
  }
  if (spellbook.comboAnalysis.drawTheGame?.length) {
    constraints.push(`${spellbook.comboAnalysis.drawTheGame.length} combo loop(s) can draw the game without a break/payoff`);
  }

  return {
    drivers: drivers.length ? drivers : ["No single high-power marker dominates; score comes from aggregate construction."],
    constraints: constraints.length ? constraints : ["No major structural constraint detected by the deterministic pass."],
  };
}

export function rankDeckPower(input = {}) {
  const entries = normalizeEntries(input).filter(entry => !isExcludedSection(entry.section));
  const infos = entries.map(cardInfo);
  const totalCards = infos.reduce((sum, info) => sum + info.qty, 0);
  const unresolved = infos.filter(info => !info.found);
  const commanderNames = input.commanderNames?.length
    ? input.commanderNames
    : infos.filter(info => isCommanderSection(info.section)).map(info => info.name);
  const commanderColors = colorIdentityForNames(commanderNames);
  const mainNames = infos
    .filter(info => !isCommanderSection(info.section))
    .flatMap(info => Array.from({ length: info.qty }, () => info.name));
  const uniqueMainNames = [...new Set(mainNames)];

  const { counts, samples } = countRoles(infos);
  counts.interactionTotal = counts.removal + counts.counters + counts.wipes;
  const vlc = virtualLandCount(infos);

  const comboNames = [...new Set([...uniqueMainNames, ...commanderNames])];
  const combos = findCombos(comboNames, { maxAlmost: input.maxAlmost || 12 });
  const bracket = estimateBracket(uniqueMainNames, commanderNames);
  const comboAnalysis = analyzeCombos(combos, commanderNames);
  const commander = commanderProfile(commanderNames);
  const archetype = inferDeckArchetype(infos, commanderNames, counts, comboAnalysis);
  const axes = scoreAxes(counts, { comboAnalysis, bracket }, commanderColors);
  const ratings = attributeRatings(counts, comboAnalysis, null, commanderColors);
  const land = landAssessment(counts, vlc, commanderColors);
  const salt = evaluateDeckSalt([...uniqueMainNames, ...commanderNames]);
  const efficiencyMetrics = deckEfficiencyMetrics(infos, counts, comboAnalysis, salt, commanderColors);
  const friction = frictionScore(counts, bracket, salt);
  const rawAxes = axes.speed + axes.consistency + axes.interaction + axes.resilience + axes.manaQuality;

  let power =
    ratings.speed * 0.28 +
    ratings.consistency * 0.24 +
    ratings.interaction * 0.18 +
    ratings.resilience * 0.16 +
    ratings.mana * 0.14;
  const gameChangerCount = Math.max(bracket.gameChangers.length, counts.gameChangers);
  const supportScore = competitiveSupportScore(counts, comboAnalysis, commander, commanderColors);
  power += Math.min(0.6, gameChangerCount * 0.08);
  power += comboAnalysis.deterministic.length ? 0.15 : 0;
  power += comboAnalysis.robustEarly.length ? 0.25 : 0;
  power += counts.fastMana >= 4 ? 0.25 : counts.fastMana >= 2 ? 0.12 : 0;
  power += counts.freeInteraction >= 3 ? 0.25 : 0;
  power += commander.partnerBoost ? 0.25 : 0;
  power += archetype.focusScore * 0.3;
  power += Math.min(1.1, supportScore * 0.2);
  power += friction >= 7 && (counts.massLandDenial > 0 || counts.extraTurns >= 2 || counts.stax >= 4) ? 0.2 : 0;
  if (comboAnalysis.fragileEarly.length && counts.freeInteraction === 0) power -= 0.3;
  if (comboAnalysis.deterministic.length && counts.freeInteraction === 0 && counts.tutors < 3) power -= 0.25;
  power -= land.issues.length ? Math.min(0.7, land.issues.length * 0.14) : 0;
  if (commander.powerFloor) power = Math.max(power, commander.powerFloor);
  power = round1(clamp(power, 1, 10));

  const markers = cedhMarkers(power, counts, { comboAnalysis, bracket }, commander, commanderColors);
  const capped = capPowerForSupport(power, counts, markers);
  power = capped.power;

  let bracketDecision = bracketFromScore(power, counts, { comboAnalysis, bracket }, friction, markers);
  if (commander.bracketFloor && bracketDecision.bracket < commander.bracketFloor) {
    bracketDecision = {
      ...bracketDecision,
      bracket: commander.bracketFloor,
      label: commander.bracketFloor === 4 ? "Optimized" : commander.bracketFloor === 3 ? "Upgraded" : bracketDecision.label,
      reason: `${commander.reasons[0]} ${bracketDecision.reason}`,
    };
  }
  const { drivers, constraints } = summarizeDrivers({ counts, axes, spellbook: { comboAnalysis, bracket }, land, archetype });

  const result = {
    ready: true,
    powerLevel: power,
    bracket: bracketDecision.bracket,
    bracketLabel: bracketDecision.label,
    bracketReason: bracketDecision.reason,
    confidence: confidence(unresolved.length, totalCards, combos.ready && bracket.ready),
    axes,
    attributeRatings: ratings,
    efficiencyMetrics,
    competitiveSupportScore: supportScore,
    cEDHMarkers: markers,
    powerCap: capped,
    rawAxes,
    inventory: counts,
    archetype,
    samples,
    virtualLandCount: vlc,
    landAssessment: land,
    friction: {
      score: friction,
      label: friction >= 7 ? "high" : friction >= 4 ? "medium" : "low",
    },
    salt,
    spellbook: {
      completeCombos: comboAnalysis.complete,
      oneCardAway: combos.almostIncluded,
      gameChangers: [...new Set([
        ...bracket.gameChangers,
        ...infos.filter(info => roleFlags(info).gameChanger).map(info => info.name),
      ])],
      massLandDenial: bracket.massLandDenial,
      extraTurns: bracket.extraTurns,
      earlyGameCombos: comboAnalysis.early.length,
    },
    commanderProfile: commander,
    drivers,
    constraints,
    unresolvedCards: unresolved.map(info => info.name),
    totalCards,
    commanderNames,
    commanderColors,
  };

  result.formatted = formatPowerRankingForPrompt(result);
  return result;
}

export function formatPowerRankingForPrompt(result) {
  if (!result?.ready) return "";
  const inv = result.inventory;
  const spellbook = result.spellbook;
  const comboLine = spellbook.completeCombos.length
    ? `${spellbook.completeCombos.length} complete (${spellbook.completeCombos.slice(0, 3).map(combo => `${combo.cards.join(" + ")} [MV ${combo.totalManaValue ?? "?"}]`).join("; ")})`
    : `0 complete; ${spellbook.oneCardAway.length} one-card-away upgrade path(s)`;
  const oneAway = spellbook.oneCardAway.slice(0, 5)
    .map(combo => `  - ${combo.cards.filter(name => normalizeName(name) !== normalizeName(combo.missingCard)).join(" + ")} + [${combo.missingCard}]`)
    .join("\n");

  return [
    "## LOCAL POWER RANKING (deterministic - no API cost)",
    `Power Level: ${result.powerLevel}/10`,
    `Commander Bracket: ${result.bracket} - ${result.bracketLabel}`,
    `Confidence: ${result.confidence}`,
    `Detected Archetype: ${result.archetype.primary} (focus ${result.archetype.focusScore}/1)`,
    `Attribute Ratings: Speed ${result.attributeRatings.speed}/10 | Consistency ${result.attributeRatings.consistency}/10 | Resilience ${result.attributeRatings.resilience}/10 | Interaction ${result.attributeRatings.interaction}/10 | Mana ${result.attributeRatings.mana}/10`,
    `CRISPI Axes: Consistency ${result.axes.consistency}/3 | Resilience ${result.axes.resilience}/3 | Interaction ${result.axes.interaction}/3 | Speed ${result.axes.speed}/3 | Mana ${result.axes.manaQuality}/3`,
    `Inventory: ${inv.lands} lands | ${inv.ramp} mana/ramp cards (${inv.rampWeight} weighted) | ${inv.draw} draw | ${inv.removal} removal | ${inv.wipes} wipes | ${inv.counters} counters | ${inv.protection} protection | ${inv.tutors} tutors | ${inv.recursion} recursion | ${inv.fastMana} fast mana`,
    `Mana Math: virtual land count ${result.virtualLandCount}; average nonland MV ${inv.averageManaValue}; slow-land weight ${inv.slowLandWeight}; color sources ${result.commanderColors.map(color => `${color}:${inv.colorSources[color] || 0}`).join(" ") || "n/a"}`,
    `Tipping Point: ${result.efficiencyMetrics.tippingPoint} mana to access 65% of modeled nonland impact`,
    `Efficiency Metrics: efficiency ${result.efficiencyMetrics.efficiency}/10 | impact ${result.efficiencyMetrics.impact} | score ${result.efficiencyMetrics.score}/100 | impact-curve power ${result.efficiencyMetrics.scorePowerLevel}/10 | playability ${result.efficiencyMetrics.playability}%`,
    `Top Impact Cards: ${result.efficiencyMetrics.topImpactCards.slice(0, 5).map(card => `${card.name} ${card.impact}`).join(", ") || "none"}`,
    `Spellbook Combos: ${comboLine}`,
    oneAway ? `One-card-away highlights:\n${oneAway}` : "",
    `Game Changers: ${spellbook.gameChangers.length ? spellbook.gameChangers.join(", ") : "none"}`,
    `cEDH Markers: ${result.cEDHMarkers.markers.length ? result.cEDHMarkers.markers.join("; ") : "none"}`,
    result.powerCap?.reasons?.length ? `Power Cap Applied: ${result.powerCap.reasons.join("; ")}` : "",
    result.salt?.ready ? `EDHREC Salt: ${result.salt.sum} total across ${result.salt.count} matched salty card(s); top ${result.salt.topCards.slice(0, 5).map(card => `${card.name} ${card.salt}`).join(", ") || "none"}` : "EDHREC Salt: local salt data not synced",
    `Salt/Friction: ${result.friction.label} (${result.friction.score}/10)`,
    `Drivers: ${result.drivers.join("; ")}`,
    `Limits: ${result.constraints.join("; ")}`,
    `Bracket Reason: ${result.bracketReason}`,
    result.unresolvedCards.length ? `Unresolved local card matches: ${result.unresolvedCards.slice(0, 12).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}
