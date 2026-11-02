/**
 * abilityLossLint.test.js — THE SOURCE LINT of the ability-loss program's S0b (docs/orchestration/ABILITY-LOSS-PROGRAM.md §5.5).
 *
 * A permanent that lost all its abilities (CR 613.1f) must read as one with none to every ability reader. The readers parse a CARD,
 * and the card a battlefield permanent carries (`perm.card`) is its PRINTED card: handing it to a reader directly reads the abilities
 * a loss removed. So a battlefield permanent's card reaches a reader only through the ability view — layers.withAbilityLoss /
 * abilityCardOf (abilityView.abilityViewOf in the modules layers.js imports), the look-back stamp, the entering side
 * (layers.enteringAbilityCard). This file reads the engine's source and fails on:
 *   1. a RAW READ — an ability reader called with a bare `<x>.card` / `<x>?.card` as its first argument — anywhere in src/lib/learn
 *      outside the allowlist below (each entry says why the card there is not a battlefield permanent's abilities);
 *   2. a CLASS VIEW read unwrapped — classLiveCard(…) outside layers.js / classLevels.js on a line that does not hand it to the
 *      ability view (the Class level view is a reader's base; the loss strips it);
 *   3. a STALE allowlist entry (one that no longer matches the source);
 *   4. a DIRECT TEXT READ — `<x>.card.oracle` / `<x>.card?.oracle_text` (a reader inlined at its call site: the block-trigger
 *      synthesizers, the hand-size and radiation scans) outside TEXT_ALLOWLIST.
 * A new reader of a permanent's text joins READERS; a new raw read either routes through the view or earns an entry with its reason.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEARN = path.dirname(fileURLToPath(import.meta.url));

// The ability readers: every function the engine uses to read a card's triggered, activated, mana, static or keyword abilities, its
// replacement and prevention text, its combat restrictions, and the board scanners' per-card reads.
const READERS = [
  "detectTriggers", "hasTriggerFor", "parseStaticAbilities", "parseActivatedAbilities", "parseGrantedActivatedAbilities", "parseGrantedTriggeredAbilities",
  "parseLoyaltyAbilities", "parseCrewCost", "crewPowerBonus", "manaProduction", "extraManaLineProducts", "manaActivationCost", "hasKeyword",
  "printedKeywordsOf", "parseProtectionColors", "parseProtectionClasses", "readPrintedWards", "looseWardCost", "parseWardCost",
  "cardSelfPreventsUntap", "groupNoUntapFiltersOf", "doublerProfile", "manaMultiplierProfile", "parseDamageReplacements", "graveyardExileSpecOf",
  "exilesCreaturesItDamaged", "exilesOpponentCreaturesOnDeath", "othersEnterWithCounters", "lifeFloorOf", "opponentLifeLossMultiplierOf",
  "auraHasTotemArmor", "grantsUmbraArmorToAuras", "lostManaBecomesColorless", "parseAuraLandManaBonus", "parseGlobalTapManaAugment",
  "parseSoulbondBond", "parseGroupWard", "readAttackTax", "annihilatorInstances", "isSeedbornUntap", "parseTypeFilteredUntap",
  "parseSelfOtherUntap", "parseUrDragonAttackTrigger", "parseVihaanCombatAnimate", "marksDamageToCreature", "isSelfCantBlock",
  "isSelfUnblockable", "minBlockerCountOf", "menaceTeamMinBlockersOf", "maxBlocksOf", "selfCantAttackBlockGate", "attachedExceptByOf",
  "groupBlockRestrictionOf", "teamPowerBlockGateOf", "groupPreventPutCountersOf", "attachedPreventPutCountersOf", "attachedPreventionOf",
  "lureFilterOf", "mustBeBlockedIfAble", "cantAttackAlone", "cantBlockAlone", "attackControllerRequirementOf", "attackDefenderRequirementOf",
  "selfDamagePrevention", "selfDamagePreventionBy", "counterShieldPrevention", "selfPreventPutCounters", "mayAssignAsUnblocked",
  "mustAttackUnlessOf", "selfMustAttack", "toxicValue", "hasUnleash", "isCanBlockOnlyFlyers", "parseAttackerRestrictions",
  "parseAttackerExceptions", "castNoncreatureLockLine", "abilitiesAsThoughHasteLock", "extraLandDropsOf", "everyPlayerExtraLandDropsOf",
  "artifactActivationLockOf", "opponentsEnterTappedTypesOf", "skipsDrawStepOf", "skipsOpponentExtraTurnsOf", "grantsWubrgAltCostOf",
  "oppEntersDontTriggerOf", "entersDontTriggerOf", "castOwnTurnOnlyLock", "flashCastPermissionsOf", "cantCastDescriptorOf",
  "castsPerTurnLimitOf", "noncreatureCastsPerTurnLimitOf", "castFromHandOnlyLockOf", "sacrificeDropsTrigger", "shufflesIntoLibraryInsteadOfGraveyard",
  "entersTapped", "conditionalEntersTapped", "paysLifeOrEntersTapped", "revealLandEntersTapped", "entersWithPlusCounters", "entersWithFadeCounters",
  "entersWithNamedCounters", "choosesColorOnEnter", "choosesCreatureTypeOnEnter", "parseFabricate", "parseTribute", "riotKeywordCount",
  "parseAttachedBonus", "parseAuraGrantedManaAbility", "flankingKeywordCount", "exaltedKeywordCount",
];

// THE ALLOWLIST — a raw `.card` into a reader where the card is not a battlefield permanent's abilities as they are now.
// { file, call (the matched text), reason }.
const ALLOWLIST = [
  { file: "layers.js", call: "hasKeyword(p.card", reason: "Changeling is a characteristic-defining ability applied in layer 4 (CR 702.73a, 613.3), before a layer-6 loss removes abilities; a later layer-4 effect overrides it (changelingOverridden — S0a)" },
  { file: "layers.js", call: "hasKeyword(candidate.card", reason: "the same Changeling read inside matchesSelector (CR 702.73a, 613.3 — layer 4, before the loss)" },
  { file: "manaModel.js", call: "manaProduction(a.card", reason: "tapCostPayerOrder: a payer-preference comparator with no state (a sort key; both orders are legal plays)" },
  { file: "manaModel.js", call: "manaProduction(b.card", reason: "tapCostPayerOrder (as above)" },
  { file: "triggers.js", call: "detectTriggers(ev.card", reason: "the gyEnterSelf event: a card that entered a GRAVEYARD (not a permanent — a loss applies on the battlefield only)" },
];

// THE TEXT ALLOWLIST — a direct `<holder>.card.oracle` read whose card is not a battlefield permanent's abilities as they are now.
const TEXT_ALLOWLIST = [
  { file: "boardEval.js", holder: "perm", reason: "isUntappedManaSource: the AI's development proxy with no state (an estimate of the board, never a rules read)" },
  { file: "gameState.js", holder: "permanent", reason: "recordLeaveEvent's sourceLki: whether to RECORD the leaving permanent's power for a later look-back (data kept, no ability applied)" },
  { file: "sba.js", holder: "perm", reason: "an Aura's Enchant restriction at the attachment state-based action (CR 303.4, 704.5m): an Aura that lost its abilities is the program's S5 (the Enchant union, backlog E6); the printed line keeps today's legality" },
];
// THE CLASS-VIEW CHOKEPOINTS — functions that read classLiveCard and hand it to the view themselves (on another line).
const CLASS_VIEW_HELPERS = [{ file: "triggers.js", fn: "liveTriggerCard", reason: "the trigger scans' one helper: the board test first, then withAbilityLoss over the Class view" }];

const RAW_TEXT = /\b([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*?)\??\.card\??\.(?:oracle|oracle_text)\b/g;

const RAW_READ = new RegExp(`\\b(${READERS.join("|")})\\(\\s*([A-Za-z_$][\\w$]*(?:\\??\\.[A-Za-z_$][\\w$]*)*\\??\\.card)(?=\\s*[),])`, "g");

function sources(dir = LEARN, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") sources(p, out); }
    else if (/\.js$/.test(e.name) && !/\.test\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(LEARN, p).split(path.sep).join("/");
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

function rawReads() {
  const hits = [];
  for (const file of sources()) {
    fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (isComment(line)) return;
      RAW_READ.lastIndex = 0;
      let m;
      while ((m = RAW_READ.exec(line))) hits.push({ file: rel(file), line: i + 1, call: `${m[1]}(${m[2]}` });
    });
  }
  return hits;
}

describe("the ability-loss source lint (ABILITY-LOSS-PROGRAM.md §5.5)", () => {
  it("every reader registered here exists in the engine's source (the lint reads real names)", () => {
    const all = sources().map((f) => fs.readFileSync(f, "utf8")).join("\n");
    const missing = READERS.filter((r) => !new RegExp(`\\b(?:function\\s+${r}\\b|const\\s+${r}\\s*=|${r}\\s*\\()`).test(all));
    expect(missing).toEqual([]);
  });

  it("no raw `<x>.card` reaches an ability reader outside the allowlist", () => {
    const bad = rawReads().filter((h) => !ALLOWLIST.some((a) => a.file === h.file && a.call === h.call)).map((h) => `${h.file}:${h.line}  ${h.call})`);
    expect(bad).toEqual([]);
  });

  it("every allowlist entry still matches the source (no stale exemption) and states its reason", () => {
    const hits = rawReads();
    const stale = ALLOWLIST.filter((a) => !hits.some((h) => h.file === a.file && h.call === a.call)).map((a) => `${a.file}: ${a.call}`);
    expect(stale).toEqual([]);
    expect(ALLOWLIST.every((a) => typeof a.reason === "string" && a.reason.length > 20)).toBe(true);
  });

  it("no direct `<x>.card.oracle` text read outside the text allowlist (the readers inlined at their call sites)", () => {
    const bad = [];
    const seen = new Set();
    for (const file of sources()) {
      const name = rel(file);
      fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (isComment(line)) return;
        RAW_TEXT.lastIndex = 0;
        let m;
        while ((m = RAW_TEXT.exec(line))) {
          const holder = m[1];
          const ok = TEXT_ALLOWLIST.find((a) => a.file === name && a.holder === holder);
          if (ok) seen.add(`${ok.file}|${ok.holder}`);
          else bad.push(`${name}:${i + 1}  ${holder}.card.oracle`);
        }
      });
    }
    expect(bad).toEqual([]);
    expect(TEXT_ALLOWLIST.filter((a) => !seen.has(`${a.file}|${a.holder}`)).map((a) => `${a.file}: ${a.holder}`)).toEqual([]); // none stale
  });

  it("a Class level view (classLiveCard) outside layers.js is always handed to the ability view", () => {
    const bad = [];
    for (const file of sources()) {
      const name = rel(file);
      if (name === "layers.js" || name === "classLevels.js") continue;
      let fn = null;
      fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const header = line.match(/^(?:export )?function ([A-Za-z0-9_$]+)\(/);
        if (header) fn = header[1];
        if (isComment(line) || !/\bclassLiveCard\(/.test(line) || /\bimport\b/.test(line)) return;
        if (CLASS_VIEW_HELPERS.some((h) => h.file === name && h.fn === fn)) return;
        if (!/\b(withAbilityLoss|abilityViewOf)\(/.test(line)) bad.push(`${name}:${i + 1}  ${line.trim().slice(0, 120)}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
