import { lookupCard, oracleText, normalizeName } from "./cardIndex.js";
import { evaluateDeckSalt } from "./edhrecSalt.js";
import { estimateBracket, findCombos } from "./spellbook.js";

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
  "sol ring",
  "ancient tomb",
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

function cardManaValue(name) {
  const card = lookupCard(name);
  return Number(card?.cmc ?? 0);
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
  const subtypeText = String(typeLine).split(/[—-]/).slice(1).join(" ");
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
    if (/^(commander|mainboard|deck|sideboard|maybeboard|tokens?)$/i.test(line)) {
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
  const manaValue = Number(card?.cmc ?? 0);
  const isLand = /\bland\b/i.test(typeLine);
  const isCreature = /\bcreature\b/i.test(typeLine);
  const isArtifact = /\bartifact\b/i.test(typeLine);
  const isInstant = /\binstant\b/i.test(typeLine);
  const isSorcery = /\bsorcery\b/i.test(typeLine);

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
    isLand,
    isCreature,
    isArtifact,
    isInstant,
    isSorcery,
  };
}

function has(info, regex) {
  return regex.test(info.search);
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
  if (FAST_MANA.has(info.nameKey)) return info.manaValue <= 1 ? 1 : 0.9;
  if (LAND_RAMP.test(info.search)) {
    if (info.manaValue <= 2) return 0.85;
    if (info.manaValue === 3) return 0.65;
    return 0.45;
  }
  if (/treasure token/i.test(info.search)) {
    if (/\bwhenever\b|\bat the beginning\b|\battack/i.test(info.search)) return 0.35;
    return 0.55;
  }
  if (info.manaValue <= 1) return 0.85;
  if (info.manaValue === 2) return 0.7;
  if (info.manaValue === 3) return 0.45;
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
  return !info.isLand && info.manaValue <= 2 && DRAW_TEXT.test(info.search);
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
      mvTotal += info.manaValue * qty;
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

function analyzeCombos(combos) {
  const complete = combos.included.map(combo => {
    const totalManaValue = round1((combo.cards || []).reduce((sum, name) => sum + cardManaValue(name), 0));
    const compactness = combo.cardCount <= 2 ? "compact" : combo.cardCount === 3 ? "medium" : "large";
    const producesText = (combo.produces || []).join(" ").toLowerCase();
    const nearInfinite = producesText.includes("near-infinite");
    const hasInfinite = /\b(infinite|win|lock)\b/.test(producesText);
    const hasPayoff = /\b(mana|damage|mill|draw|token|lifegain|life loss|lose the game|wins? the game|storm|combat|death trigger)\b/.test(producesText);
    const deterministic = !nearInfinite && hasInfinite && hasPayoff;
    const early = deterministic && combo.cardCount <= 2 && totalManaValue <= 7;
    return { ...combo, totalManaValue, compactness, deterministic, nearInfinite, valueLoop: hasInfinite && !hasPayoff, early };
  });

  return {
    complete,
    early: complete.filter(combo => combo.early),
    compact: complete.filter(combo => combo.deterministic && combo.cardCount <= 2),
    deterministic: complete.filter(combo => combo.deterministic),
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
  const compactCombos = spellbook.comboAnalysis.compact.length;
  const colorShortfall = colorSourceShortfall(counts, commanderColors);

  const speed = clamp(
    (earlyCombos ? 3 : 0) ||
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
  const interaction = clamp(
    (counts.freeInteraction >= 3 ? 3 : counts.freeInteraction >= 1 ? 2 : 0) ||
    (interactionTotal >= 14 ? 3 : interactionTotal >= 9 ? 2 : interactionTotal >= 6 ? 1 : 0),
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
  const oppressiveFriction = friction >= 7 && (counts.massLandDenial > 0 || counts.extraTurns >= 2 || counts.stax >= 4);
  if (gameChangers >= 4 || counts.massLandDenial > 0 || earlyCombos > 0 || power >= 8.1 || oppressiveFriction) {
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

  const combos = findCombos(uniqueMainNames, { maxAlmost: input.maxAlmost || 12 });
  const bracket = estimateBracket(uniqueMainNames, commanderNames);
  const comboAnalysis = analyzeCombos(combos);
  const commander = commanderProfile(commanderNames);
  const archetype = inferDeckArchetype(infos, commanderNames, counts, comboAnalysis);
  const axes = scoreAxes(counts, { comboAnalysis, bracket }, commanderColors);
  const land = landAssessment(counts, vlc, commanderColors);
  const salt = evaluateDeckSalt([...uniqueMainNames, ...commanderNames]);
  const friction = frictionScore(counts, bracket, salt);
  const rawAxes = axes.speed + axes.consistency + axes.interaction + axes.resilience + axes.manaQuality;

  let power = 2.6 +
    axes.speed * 0.65 +
    axes.consistency * 0.6 +
    axes.interaction * 0.45 +
    axes.resilience * 0.35 +
    axes.manaQuality * 0.45;
  const gameChangerCount = Math.max(bracket.gameChangers.length, counts.gameChangers);
  power += Math.min(1.2, gameChangerCount * 0.25);
  power += comboAnalysis.complete.length ? 0.35 : 0;
  power += comboAnalysis.compact.length ? 0.35 : 0;
  power += comboAnalysis.early.length ? 0.55 : 0;
  power += counts.fastMana >= 4 ? 0.45 : counts.fastMana >= 2 ? 0.25 : 0;
  power += counts.freeInteraction >= 3 ? 0.35 : 0;
  power += commander.partnerBoost ? 0.25 : 0;
  power += archetype.focusScore * 0.75;
  power += friction >= 7 ? 0.3 : 0;
  power -= land.issues.length ? Math.min(1.1, land.issues.length * 0.25) : 0;
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
    `CRISPI Axes: Consistency ${result.axes.consistency}/3 | Resilience ${result.axes.resilience}/3 | Interaction ${result.axes.interaction}/3 | Speed ${result.axes.speed}/3 | Mana ${result.axes.manaQuality}/3`,
    `Inventory: ${inv.lands} lands | ${inv.ramp} mana/ramp cards (${inv.rampWeight} weighted) | ${inv.draw} draw | ${inv.removal} removal | ${inv.wipes} wipes | ${inv.counters} counters | ${inv.protection} protection | ${inv.tutors} tutors | ${inv.recursion} recursion | ${inv.fastMana} fast mana`,
    `Mana Math: virtual land count ${result.virtualLandCount}; average nonland MV ${inv.averageManaValue}; slow-land weight ${inv.slowLandWeight}; color sources ${result.commanderColors.map(color => `${color}:${inv.colorSources[color] || 0}`).join(" ") || "n/a"}`,
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
