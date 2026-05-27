const fs = require("node:fs");

const MEREN_EDHPOWERLEVEL_URL = "https://edhpowerlevel.com/?d=1+Abundance~1+Accursed+Marauder~1+Altar+of+Dementia~1+Beacon+of+Unrest~1+Birds+of+Paradise~1+Bojuka+Bog~1+Buried+Alive~1+Cabal+Coffers~1+Cabal+Ritual~1+Cankerbloom~1+Carpet+of+Flowers~1+Carrion+Feeder~1+Cascading+Cataracts~1+Cavern+of+Souls~1+Command+Tower~1+Corrupted+Conviction~1+Crop+Rotation~1+Crypt+of+Agadeem~1+Culling+the+Weak~1+Deathreap+Ritual~1+Decree+of+Pain~1+Demonic+Tutor~1+Dictate+of+Erebos~1+Doomsday+Excruciator~1+Elven+Chorus~1+Ensnaring+Bridge~1+Eternal+Witness~1+Evolutionary+Leap~1+Exotic+Orchard~1+Farhaven+Elf~1+Fauna+Shaman~1+Fierce+Empath~9+Forest~1+Golgari+Thug~1+Gray+Merchant+of+Asphodel~1+Haywire+Mite~1+Heroic+Intervention~1+High+Market~1+Honest+Rutstein~1+Hour+of+Promise~1+Journey+to+Eternity~1+Lightning+Greaves~1+Living+Death~1+Loaming+Shaman~1+Midnight+Reaper~1+Night+Incarnate~1+Nurturing+Peatland~1+Overgrown+Tomb~1+Oversold+Cemetery~1+Phyrexian+Tower~1+Plaguecrafter~1+Ravenous+Chupacabra~1+Reclaim~1+Regrowth~1+Reliquary+Tower~1+Riftsweeper~1+Sakura-Tribe+Elder~1+Satyr+Wayfinder~1+Seasons+Past~1+Sheoldred%2C+Whispering+One~1+Shriekmaw~1+Skullclamp~1+Sol+Ring~1+Solemn+Simulacrum~1+Somberwald+Sage~1+Soul+of+the+Harvest~1+Spore+Frog~1+Stitcher%27s+Supplier~10+Swamp~1+Sylvan+Library~1+Tainted+Wood~1+Timeless+Witness~1+Traverse+the+Ulvenwald~1+Twilight+Mire~1+Urborg%2C+Tomb+of+Yawgmoth~1+Veil+of+Summer~1+Victimize~1+Vilis%2C+Broker+of+Blood~1+Village+Rites~1+Viscera+Seer~1+Wood+Elves~1+Woodland+Cemetery~~1+Meren+of+Clan+Nel+Toth~Z~";

function commanderNames(deck) {
  return deck.cards
    .filter(card => String(card.section).toLowerCase() === "commander")
    .map(card => card.name);
}

function parseEdhPowerLevelUrl(url) {
  const encoded = new URL(url).searchParams.get("d") || "";
  const raw = decodeURIComponent(encoded.replace(/\+/g, " "));
  const entries = raw
    .split("~")
    .filter(Boolean)
    .map(part => part.match(/^(\d+)\s+(.+)$/))
    .filter(Boolean)
    .map(match => ({ qty: Number(match[1]) || 1, name: match[2], section: "Mainboard" }))
    .filter(entry => entry.name !== "Z");

  const commander = entries.pop();
  if (commander) entries.push({ ...commander, section: "Commander" });
  return entries;
}

function assertRange(label, value, min, max) {
  if (value < min || value > max) {
    throw new Error(`${label}: expected ${min}-${max}, got ${value}`);
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

(async () => {
  const { rankDeckPower } = await import("../src/lib/server/powerRanker.js");
  const library = JSON.parse(fs.readFileSync("data/decks.local.json", "utf8")).decks;
  const byName = new Map(library.map(deck => [deck.name, deck]));
  const checks = [];

  function checkSavedDeck(name, fn) {
    const deck = byName.get(name);
    if (!deck) throw new Error(`Missing calibration deck: ${name}`);
    const result = rankDeckPower({ cards: deck.cards, commanderNames: commanderNames(deck), maxAlmost: 5 });
    fn(result);
    checks.push({ name, power: result.powerLevel, bracket: result.bracket, archetype: result.archetype.primary });
  }

  checkSavedDeck("Kinnan, Bonder Prodigy", result => {
    assertEqual("Kinnan bracket", result.bracket, 5);
    assertRange("Kinnan power", result.powerLevel, 9.2, 10);
  });

  checkSavedDeck("Yuriko, the Tiger's Shadow", result => {
    assertEqual("Yuriko bracket", result.bracket, 5);
    assertRange("Yuriko power", result.powerLevel, 9.2, 10);
  });

  checkSavedDeck("Zaxara, the Exemplary", result => {
    assertEqual("Zaxara bracket", result.bracket, 3);
    assertRange("Zaxara power", result.powerLevel, 6.0, 7.0);
    assertRange("Zaxara speed rating", result.attributeRatings.speed, 6.5, 7.5);
    assertRange("Zaxara consistency rating", result.attributeRatings.consistency, 6.5, 7.5);
    assertRange("Zaxara interaction rating", result.attributeRatings.interaction, 5.5, 6.8);
    assertRange("Zaxara tipping point", result.efficiencyMetrics.tippingPoint, 4, 6);
    assertRange("Zaxara impact/efficiency curve", result.efficiencyMetrics.scorePowerLevel, 6.5, 7.5);
  });

  checkSavedDeck("Sliver Hivelord", result => {
    assertRange("Sliver power", result.powerLevel, 4.5, 6.3);
    assertRange("Sliver bracket", result.bracket, 2, 3);
  });

  checkSavedDeck("The Ur-Dragon", result => {
    assertEqual("Ur-Dragon bracket", result.bracket, 3);
    assertRange("Ur-Dragon power", result.powerLevel, 6.0, 7.4);
  });

  checkSavedDeck("Pantlaza, Sun-Favored", result => {
    assertEqual("Pantlaza bracket", result.bracket, 3);
    assertRange("Pantlaza power", result.powerLevel, 5.0, 6.4);
    assertRange("Pantlaza draw-the-game loops", result.spellbook.completeCombos.filter(combo => combo.drawTheGame).length, 1, 1);
    assertRange("Pantlaza deterministic wins", result.spellbook.completeCombos.filter(combo => combo.deterministic).length, 0, 0);
  });

  const merenCards = parseEdhPowerLevelUrl(MEREN_EDHPOWERLEVEL_URL);
  const meren = rankDeckPower({ cards: merenCards, commanderNames: ["Meren of Clan Nel Toth"], maxAlmost: 8 });
  assertEqual("Meren bracket", meren.bracket, 3);
  assertRange("Meren power", meren.powerLevel, 6.3, 7.8);
  checks.push({ name: "Meren EDHPowerLevel sample", power: meren.powerLevel, bracket: meren.bracket, archetype: meren.archetype.primary });

  console.table(checks);
  console.log(`Power-ranker calibration passed (${checks.length} decks).`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
