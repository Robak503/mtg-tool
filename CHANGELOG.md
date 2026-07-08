# Changelog

All notable changes to MTG Tool are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/). Full per-release notes and binaries live on
the [GitHub Releases](https://github.com/Robak503/mtg-tool/releases) page; this file
summarizes the notable changes.

## [Unreleased]

## [0.116.0] - 2026-07-08

### Added
- **The Disguise keyword now plays natively (+11).** Nightdrinker Moroii, Undercover
  Crocodelf, Museum Nightwatch, and others — the face-down-2/2 keyword (same as Morph, with
  ward); the app plays the card as its normal face-up self. This also fixed a latent bug: a
  card with a "when turned face up, until end of turn, whenever …" delayed ability (Mistway
  Spy) was wrongly treated as if that ability were always active — it now correctly does
  nothing on a normal cast, so it stays deferred rather than misplay.
- **The Dash alt-cast keyword now plays natively (+16).** Lightning Berserker, Riders of
  Rohan, the Mardu and Kolaghan aggro creatures — "Dash {cost}" lets you cast a creature
  cheaper for haste (it returns to hand at end of turn), but the app plays it as its normal
  self (the same handling as Sneak, Ninjutsu, and Morph).
- **The Sneak alt-cast keyword now plays natively (+8).** Foot Ninjas, Elektra, Splinter,
  Oroku Saki, and the four "Technique" spells — "Sneak {cost}" lets you cast a card cheaper
  by returning an attacker to hand, but it never changes what the card does, so the app
  plays it as its normal-cost self (the same handling as Convoke, Ninjutsu, and Morph).
- **"Whenever a creature you control is dealt damage" triggers now play natively (+1).**
  Rite of Passage — the non-self sibling of enrage. When any creature you control takes
  damage, the watcher fires on it (e.g. puts a +1/+1 counter on the damaged creature).
  Controller-gated (an opponent's creature taking damage doesn't fire it) and it stacks
  correctly with multiple watchers.
- **Morph and Megamorph creatures now play natively (+65).** War Behemoth, Sagu Mauler,
  Titanic Bulvox, Ponyback Brigade, and 61 others — the "Morph {cost}" / "Megamorph {cost}"
  line is now recognized. Every morph card also has a normal mana cost, so the app plays it
  as its printed face-up self (the optional face-down 2/2 entry is the only unmodeled part,
  the same way Cycling and Ninjutsu are handled). A morph card with a "when turned face up"
  effect stays deferred until that path is modeled.
- **"Ward—Pay N life" now plays natively (+3).** Owlin Shieldmage, Sire of Seven Deaths,
  and Dwarven Forge-Chanter — an opponent targeting these creatures must pay the life or
  their spell/ability is countered (the tax was already enforced; this teaches the coverage
  metric to recognize the em-dash cost form). Ward—Discard and Ward—Sacrifice stay deferred:
  paying those requires choosing a card/permanent to lose, which isn't modeled yet.
- **Reanimate's life payment now plays natively (+1).** "Put target creature card from a
  graveyard onto the battlefield under your control. You lose life equal to that card's
  mana value" (Reanimate) — the life loss is bound to the reanimated card's mana value,
  captured before it leaves the graveyard.
- **Non-creature artifact clones now play natively (+3).** Sculpting Steel ("copy of any
  artifact"), Copy Artifact, and Masterwork of Ingenuity ("copy of any Equipment") — the
  clone runtime already copied artifacts; this recognizes the non-creature clone *cards*.
- **Doubling a creature's power/toughness now plays natively (+3).** "Double the power
  and toughness of each creature you control" (Unnatural Growth), "double this creature's
  power and toughness" (Reckless Amplimancer), and "double [this creature]'s power" (Tifa
  Lockhart's Landfall) each give every affected creature a one-shot bonus equal to its own
  current power/toughness (CR 701.10), snapshotted as the effect resolves — so a later
  +1/+1 stacks on top rather than re-doubling.

## [0.115.0] - 2026-07-08

### Added
- **The STUN mechanic now plays natively (+11).** "Tap target creature and put a stun
  counter on it" (Gilded Scuttler, Grappling Kraken, Rowdy Snowballers, Splash Lasher,
  Utrom Scientists, …): the stunned creature is truly tap-locked — it skips its next
  untap and removes a stun counter instead, enforced on *every* untap path (the untap
  step, "untap target creature" effects, and Seedborn Muse / Murkfiend) per CR 122.1c.
- **Energy optional-pay triggers (+5)** — "Whenever this creature attacks, you may pay
  {E}{E}. If you do, create a 1/1 Servo" (Aether Poisoner, Swooper, Chaser, …). Completes
  the energy mechanic (gain + pay + optional-pay).
- **Exile from an opponent's graveyard (+5)** — Disposal Mummy, Leonin of the Lost Pride,
  Disruptor Wanderglyph, Ruin Rat, Scavenging Harpy: the exile correctly targets an
  opponent's graveyard, never your own.

## [0.114.0] - 2026-07-08

### Added
- **The ENERGY mechanic ({E}) now plays natively (+22 cards).** Energy is a real
  player resource: cards that say "you get {E}" bank energy counters, and abilities
  that cost "Pay {E}" are only usable when you actually have the energy to spend —
  and spending it is enforced. Newly native: Attune with Aether, Glimmer of Genius,
  Rogue Refiner, Longtusk Cub, Dynavolt Tower, Consulate Turret, Whirler Virtuoso,
  Aether Theorist, Solstice Zealot, and more. (Energy-*gated mana* dorks like
  Servant of the Conduit stay on the fallback for now — a follow-up.)
- **Two-target combat tricks (+6)** — "Target creature gets +X/+Y. Another target
  creature gets -X/-Y." (Leeching Bite, Consume Strength, Schismotivate, Rites of
  Reaping, Steal Strength, Drooling Groodion): the buff lands on your creature and
  the debuff on an opponent's, never friendly-fire.

### Fixed
- **Tokens now cease to exist when they leave the battlefield (CR 111.7)** — a
  bounced or exiled token no longer lingers as a phantom card in a hand or graveyard.
- **Combat-trick crash** — a pump-that-untaps trick whose target already left the
  battlefield no longer throws; it fizzles cleanly.
- **Mana accounting** — a land/rock with both a free mana ability and an energy-gated
  one (Aether Hub) is now counted for the free mana it actually makes, not the
  energy-gated bonus.

## [0.113.0] - 2026-07-08

### Added
- **+32 more cards play natively (overnight coverage grind, part 3).**
  - **Self-bounce-your-own** (+19) — the "return a[nother] permanent/creature you
    control to its owner's hand" drawbacks (Kor Skyfisher, Emancipation Angel,
    Cache Raiders, Roaring Primadox, Shrieking Drake, Invasive Species, Yarok's
    Wavecrasher, Time Wipe, and the "you may" / "up to one" optionals Ambrosia
    Whiteheart, Aviary Mechanic, Loyal Gryff, Stickytongue Sentinel, Exosuit
    Savior, Mischievous Pup, Flock Impostor, …). The engine returns the least-bad
    own permanent (a land you replay first), respects "another" and the optional
    "may bounce zero," and never touches an opponent's board. Verified by a
    4-way adversarial engine audit.
  - **"Another target creature you control gains [keyword]"** (+9) — Flesh
    Burrower, Starling, Trained Condor, Heavenly Qilin, and kin.

### Fixed
- **Combat-trick crash** — a pump-untap / untap-then-pump trick (Vines of the
  Recluse, Ornamental Courage, …) whose target left the battlefield before
  resolution no longer crashes; the departed target fizzles cleanly (CR 608.2b).

### Housekeeping
- Removed a stray debug probe from the repo root and added a `.gitignore` guard;
  dropped a stale hard-coded test count from the operating manual.

## [0.112.0] - 2026-07-08

### Added
- **+32 more cards play natively (overnight coverage grind, part 2).** Four clean
  parser levers on already-modeled effects, each flip-diff verified (only the
  intended cards gained, zero regressions):
  - **Pump-then-fight spells** — "Target creature you control gets +X/+Y until
    end of turn. It fights target creature you don't control" (Epic Confrontation,
    Ruthless Predation, Savage Smash, Swift Kick, Wild Instincts, Chelonian
    Tackle, Mage Duel): the buffed creature deals more and survives the return
    damage — a real fight, not a half-resolve. +7.
  - **Untap-then-pump spells** — "Untap target creature. It gets +X/+Y [and gains
    reach] until end of turn" (Ornamental Courage, Inspirit, Gerrard's Command,
    Spidery Grasp, Aim High, Steady Aim). +6.
  - **Target-opponent discard** — "target opponent discards N cards" (Ravenous
    Rats, Dirty Rat, Deadbridge Shaman, Deception, Purge the Profane, Mindculling,
    Psychic Symbiont, and more): the chosen opponent discards, you don't. +N.
  - **"Can't block" on an opponent's creature** — "target creature an opponent
    controls can't block this turn" (Clamor Shaman, Arena Athlete, Smelt-Ward
    Minotaur). Combined discard + can't-block: +19.

## [0.111.0] - 2026-07-07

### Added
- **+33 more cards play natively (overnight coverage grind, Joe's shelf).**
  Six clean parser/tier levers, each flip-diff verified (only the intended cards
  gained, zero regressions):
  - **Modal equipment attack triggers** — Pip-Boy 3000 and its family: the
    "choose one" attack trigger on equipment now resolves natively (+6).
  - **Top-of-library router** — Zoologist / Coiling Oracle and siblings: reveal
    the top card and route it (hand / battlefield / graveyard) with the no-else,
    draw, OR, and scry-compose shapes all modeled (+7 across two passes).
  - **Reveal-top-drain-by-mana-value (the "you lose" variant)** — Dark Confidant
    and kin: reveal the top card, put it in hand, *you* lose life equal to its
    mana value (the controller-drain sibling of Yuriko's each-opponent drain) (+4).
  - **Clone cost-keyword pre-strip** — copy-clause creatures carrying a
    cost-only keyword (Plot / Convoke / Affinity), e.g. Visage Bandit, now read
    as clones (+2 of the batch).
  - **Optional own-side +1/+1 counter** — "put a +1/+1 counter on up to one
    target creature you control" (Essence Capture family) (+3 of the batch).
  - **Spells-cast-this-turn intervening-if** — "if you've cast N or more spells
    this turn" (Loan Shark) reads the per-turn spell counter, plus creature
    bounce with a controller restriction ("return target creature you control /
    an opponent controls," Chulane family) (+11).

## [0.110.0] - 2026-07-07

### Added
- **The crown completes (CR 725)** — "Whenever you become the monarch" abilities
  now fire on both crown paths: Custodi Lich edicts an opponent the moment he
  takes the throne, and Regal Behemoth's "while you're the monarch" bonus mana
  genuinely flows (one of any color per land tap — only while you hold the
  crown). Also newly native: Gatekeeper of Malakir (kicked edict), Badgermole
  Cub, and Leyline of Abundance. +5 native, no regressions.

### Fixed
- Stale rulebook citations in engine comments (CR 720 is Omen cards) now point
  at the real rules: control-change = CR 613.1b, cast-restriction statics =
  CR 604.2.

## [0.109.0] - 2026-07-07

### Added
- **THE MONARCH (CR 725)** — "you become the monarch" now plays natively: the
  crown changes hands on combat damage, and the monarch draws at their end
  step. Newly native: Palace Sentinels, Crimson Fleet Commodore, Staunch
  Throneguard, Thorn of the Black Rose, Feast of Succession.
- **Legendary short-name self-references** — legends that refer to themselves
  by their short name now classify AND enforce: Toski, Bearer of Secrets is
  forced to attack, Huang Zhong's block cap holds, Red Ghost is genuinely
  unblockable, and more (8 cards). +13 native total, no regressions.

### Fixed
- **"Another target creature" triggers no longer target their own source** —
  a corpus-wide fix: Prowler, Roalesk, Sterling Supplier, Loxodon Battle
  Priest and every card of this shape previously put their counters on
  themselves when convenient.
- Short-name evasion clauses (19 legends incl. Etrata, Bilbo, Tahngarth,
  Norin) are now genuinely enforced at the block gates.

## [0.108.0] - 2026-07-07

### Added
- **Native coverage — Sword of War and Peace** — the full sword now plays
  natively: on connect it zaps the damaged player for their hand size and
  gains you life for yours. +1 native, no regressions.

## [0.107.0] - 2026-07-06

### Added
- **Native coverage — cost-tax statics (the Thalia hatebears)** — "spells cost
  {N} more to cast" effects now genuinely raise cast prices for every player
  at the table: Thalia, Guardian of Thraben, Thorn of Amethyst, Sphere of
  Resistance, Vryn Wingmare, Glowrider, Lodestone Golem, Feroz's Ban, Squeeze,
  Grand Arbiter Augustin IV, and God-Pharaoh's Statue all play natively. The
  AI pays the tax too, and spells it can't afford under tax aren't offered.
  +10 native, no regressions.

## [0.106.0] - 2026-07-05

### Added
- **Native coverage — "up to one target" returns** — Cormela, Glamour Thief,
  Sword of Light and Shadow, Lethal Protection, True Ancestry, and Walk with
  the Ancestors now play natively (including Walk's Discover 4). +5 native,
  no regressions.

### Fixed
- **"Up to N target" triggered abilities now actually do something.** Every
  such trigger previously resolved by silently choosing zero targets — Baloth
  Null returned nothing, Gavony Silversmith countered nothing, tap effects
  tapped nothing. The auto-chooser now picks the largest correct-side set
  (enemy effects hit only enemies, your effects help only your side), so
  those cards genuinely act in Academy and self-play games.

## [0.105.0] - 2026-07-05

### Added
- **Native coverage — restricted attack triggers + spelled-out referents** —
  Reyav, Master Smith now plays natively and honestly: his trigger fires only
  for attackers that are actually enchanted or equipped (the engine previously
  couldn't check that restriction at all), and "that creature gets/gains …"
  payoffs now bind to the attacking/entering creature the same way "it" does.
  Also newly native: Ogre Battledriver, Primal Forcemage, Ardoz, Cobbler of War.
- **Native coverage — Sword of Feast and Famine** — the full sword now plays
  natively: the damaged player chooses a discard and your lands untap. +5 native
  total this release, no regressions.

### Fixed
- A loose attack-trigger matcher could silently ignore printed restrictions on
  "a creature you control … attacks" abilities; it is now exact, so unmodeled
  restrictions correctly route to the Arbiter instead of risking wrong fires.

## [0.104.0] - 2026-07-05

### Added
- **Native coverage — "one or more creatures with <keyword>" combat triggers** —
  Quartzwood Crasher's batch trigger now plays natively and correctly: it fires
  once per damaged player, counts only damage dealt by matching (e.g. trampling)
  creatures — including keyword grants from equipment — and mints the X/X token
  at the right size. Multi-subtype batch lists ("Ninja or Rogue creatures") now
  parse too: Prosperous Thief plays natively. +3 native, no regressions.

## [0.103.0] - 2026-07-05

### Added
- **Native coverage — compound "keyword + granted trigger" lines** — an Aura or
  Equipment line like Power Fist's *"Equipped creature has trample and 'Whenever
  this creature deals combat damage to a player, put that many +1/+1 counters on
  it.'"* now plays natively: the keyword/P-T half applies through the layer engine
  while the quoted triggered ability fires on the equipped/enchanted creature.
  Newly native: Power Fist, Web-Shooters, Take Flight, Staggering Insight,
  Eternal Thirst, Cathar's Call, Commanding Presence. +7 native, no regressions.

## [0.102.0] - 2026-07-04

### Added
- **Native coverage — Leyline opening-hand pre-strip** — cards with the CR 103.6
  "you may begin the game with this on the battlefield" line now model natively
  (Leyline Axe, Leyline of Anticipation, Leyline of Lifeforce, Leyline of Vitality).
  +4 native, no regressions.
- **Native coverage — Equip legendary creature** — equipment whose Equip cost is
  restricted to legendary creatures now models natively, mirroring the existing
  Equip-commander handling (Excalibur, Blackblade Reforged). +2 native, no regressions.

## [0.101.0] - 2026-07-04

### Added
- **Post-game debrief** — after a game in the Academy, the result screen shows how
  your own plays compared to the engine's suggested play ("You matched the suggested
  play N/M times") and lists the turns where you diverged (P3).
- **Replay scrubber** — open a finished game in Table Records and step through it
  turn by turn (Prev / Next / jump-to-turn pills); each play renders the same way the
  live game shows it (P7).
- **Puzzle mode** — capture any live position in the Academy as a puzzle
  ("Save as puzzle"), then load it later from the Puzzles list and try to solve it.
  The v1 goal is win-this-turn — find the line before the turn passes (P9).
- **Durable color tags** — your custom card color-tag definitions now live with your
  profile on disk instead of only in the browser, so they survive a reinstall and
  follow the profile (E4).

### Fixed
- **Table Records log** — a finished game's log now renders as readable play-by-play
  (it previously showed "[object Object]"), and each record keeps the full narrated
  tail rather than only the last few lines (P7).

### Changed
- Internal: swept the last legacy Aether design-token aliases to the LEYLINE
  `--ley-*` set and removed the dead alias block; no visual change (Q4).

## [0.100.0] - 2026-07-04

### Added
- **Reality report** — a "Run reality check" button in the deck view plays your
  deck against itself locally and shows how it *actually* plays: dead-turn rate,
  spells and lands per game, mulligan rate, and average X paid (P5).
- **Flavor text** on the card inspector, when the local card data carries it (K9).
- **Token & meld details** on the card inspector — the tokens a card makes and its
  meld partners, shown as chips (K4).
- **Combo steps** on the Forge shelf — each combo you own (or are one card away
  from) now shows a short "how it works" description (K5).

### Fixed
- **Earthbend returns its land** — a land animated by earthbend that dies or is
  exiled now comes back tapped, as the card says, firing landfall on the way in.
  Toph, Earthbending Master and the other earthbend cards play correctly (E1).

## [0.99.0] - 2026-07-04

Cards look like cards, and you record exactly the copy you own. Also folds in the
pod-tools work that shipped in parallel (cross-profile ratings, matchup ledger,
mulligan lab) — all present in this build.

### Added
- **Pod ratings persist for the whole pod** — a rating computed for another
  player's deck in Pod Balance saves into that deck's owning profile (E5).
- **Matchup ledger** — deck-vs-deck records in Pod Balance from every self-play
  run: overall win rates + a head-to-head heat table (P4).
- **Mulligan lab** — deal a seeded opening 7 in the deck view, call keep/ship,
  and see the engine's verdict + your agreement rate (P8).
- **Finish checkboxes on add** — after picking the exact printing (set name ·
  set code · collector number), check the finish(es) your copy is. Only
  finishes that exist in paper for that printing are offered, with special
  treatments named (Etched, Surge Foil, Galaxy Foil, Ripple Foil, …).
  Checking several adds one stack per finish in a single step.
- **Change printing** — the card drawer can re-point a row at a different
  printing of the same card ("my Sol Ring is actually the LCI one"); guarded
  server-side so you can never move onto a different card or a finish that
  printing was never printed in. If you already own the target printing, the
  rows fold together.
- **Deck card editing** — hover a decklist row for −/+/× steppers: adjust
  copies or remove a card without re-importing the list.

### Changed
- **Full-card frames everywhere** — The Stacks grid, card drawer, add-modal
  search, Trophy Case, Vault door thumbnails, Academy card pickers, and the
  chat hover preview now show the whole card (frame, name, text box) like it
  looks on the table, not just the art crop — all through the local image
  cache, so everything keeps working offline once seen.
- The binder and the collection grid now render the exact printing you own
  (by Scryfall id), not the first printing of that name.
- Stack finish menus in the card drawer only offer finishes the row's
  printing exists as in paper.

### Fixed
- Scryfall's image CDN began rejecting requests without a User-Agent, which
  broke fetching any not-yet-cached card image; both image proxies now
  identify themselves. Already-cached images were unaffected.

## [0.98.0] - 2026-07-04

### Added
- **Mulligan lab** — a deck-view trainer: deal a seeded opening 7, call keep or
  ship, then see the engine's own verdict and your running agreement rate.

## [0.97.0] - 2026-07-04

### Added
- **Matchup ledger** — Pod Balance now shows deck-vs-deck records built from
  every self-play run: overall win rates plus a head-to-head heat table (row
  deck's win rate vs each column deck). Fills in as you run self-play.

## [0.96.0] - 2026-07-04

### Added
- **Pod ratings persist for the whole pod** — a machine power rating computed for
  another player's deck in Pod Balance now saves into that deck's owning
  profile, so it sticks across sessions instead of recomputing each time.

## [0.95.1] - 2026-07-04

Release cut at the backlog-push handoff — no app code change since 0.95.0
(the delta is the WAKE-REPORT rotation + UPGRADE-BACKLOG STATUS handoff docs).
Rolls up the full v0.89→v0.95 backlog push into one tagged build.

## [0.95.0] - 2026-07-04

### Added
- **Practice this deck** — a button on the deck view opens the Academy with the
  deck already selected, so you can jump straight into a game against the engine.
- **Cost basis** — record what you paid per copy in the card drawer, and the
  Ledger shows total paid vs current value with unrealized gain/loss.

## [0.94.0] - 2026-07-04

### Added
- **Binder view** — a grid/binder toggle in The Stacks flips your collection to
  9-pocket pages of full card images, paged like a real binder.
- **Continue where you left off** — the landing screen shows quick chips to jump
  back into your most recent chat and your active deck.

## [0.93.0] - 2026-07-04

Stop bouncing to the browser; jump anywhere.

### Added
- **Local card inspector** — clicking a card (in a decklist or a chat) now opens
  a panel right here: full image, oracle text, mana, legality, official rulings,
  and every printing — all from local data. Scryfall is still one click away.
- **Command palette** — press Ctrl/⌘+K to jump to any area, deck, chat, or
  agent, run a quick action, or search a card, all from the keyboard.

### Fixed
- The card-drawer artist autofill read the wrong field from the printings API
  and never populated; fixed (also powers the new inspector's Printings tab).

## [0.92.0] - 2026-07-04

Knowledge features + collection depth.

### Added
- **Judge Trials** — a rules quiz over ~500 verified judge questions (bundled
  RulesGuru corpus): pick a difficulty, read the scenario, reveal the cited
  ruling, self-grade, watch your streak. A new Proving Grounds door.
- **The Library** — a new area: search the Comprehensive Rules and the engine
  explainers by keyword or rule number, plus official card rulings by name.
  All of it was already indexed locally; it was just Arbiter-only until now.
- **Formatted chat** — Karn/Tibalt/Jace replies now render headings, bold,
  bullets, and inline code instead of raw markdown glyphs.
- **Universal shopping list** (The Forge) — one deduped buy list across every
  deck you still need cards for, your wishlist, and price alerts, each tagged
  with why and priced; copy it as a decklist.
- **By-finish breakdown** (the Ledger) — nonfoil / foil / etched counts across
  your physical copies.

## [0.91.0] - 2026-07-04

The Gallery, Table Records, and the rest of the quick-win wave.

### Added
- **The Gallery** — a fifth Vault door: your collection as an art wall, grouped
  by the artist of the exact printing you own ("Alayna Danner — 4 pieces
  owned"), with honest fallbacks until the artist-aware printings index from
  v0.90.0's sync lands. The card drawer's signed editor gains one-click
  **"Use printing artist"**.
- **Table Records** — a fourth Proving Grounds door. Finished Academy games are
  no longer thrown away at game over: every game keeps its result, turns,
  decks, and the full narrated tail, browsable list → detail.
- **Prove the Pod** — Pod Balance can now run 20 real engine games over the
  compared decks and show the empirical win rates (with confidence intervals)
  beside the ratings: "rated 6.8 · wins 55%".
- **Sim Center win tables** — win rate by deck, by turn-order seat, and
  on-the-play (the engine computed these all along; now you can see them).
- **Post-import "deck ready" moment** — importing a deck now confirms the save,
  streams the machine rating in as it computes, and offers next steps (view /
  Karn plan / Tibalt roast / Pod Balance) instead of dumping you into chat.
- **Per-message chat actions** — Copy on every reply; save THIS Karn plan /
  Tibalt roast / Jace note (not just the newest), guarded so a locked-deck chat
  can never write into the wrong deck.
- **Pod Balance → Sim Center handoff** — "Run this pod in the Sim Center"
  opens the Sim pre-loaded with the same decks.

### Changed
- The last hand-hexed palette (main shell constants) now composes from LEYLINE
  tokens.

## [0.90.0] - 2026-07-04

The Trophy Case.

### Added
- **The Trophy Case** — your signed cards, alters, artist proofs, and grails are
  first-class now. Every collection card's drawer has a **Provenance** section:
  mark it Signed (artist, date, event, in-person), Altered, or Artist proof, and
  pin it with **Showcase ★** — pinned cards appear as a hero strip of art tiles
  at the top of The Stacks with their provenance caption ("Signed — Chase Stone
  (in person) · MagicCon Vegas"). All user data, fully local, additive — old
  collection files load untouched.
- **Printings index carries collector metadata** (artist, full-art, border,
  Story Spotlight) from the next data sync onward — this powers the upcoming
  Gallery/artist-shelf features and artist autofill.

## [0.89.0] - 2026-07-04

The Vault overhaul (wave V core) + wave Q quick wins.

### Added
- **The Vault front door** — the tab strip is gone. The Vault now opens on four
  LIVE door-panes: **The Stacks** (browse/manage; card counts + your latest
  pickups as art tiles), **The Ledger** (owned value + 30-day movement; Finance
  and Stats merged into one scrolling dashboard), **The Atlas** (sets, with your
  closest-to-complete set as a progress bar), **The Forge** (buildable
  commanders + deck costs) — plus a **Pulse strip**: cards added this week, your
  top owned mover, price alerts hit, cross-deck conflicts, each jumping straight
  to its surface.
- **Ledger value chart** — a real area chart of collection value over time
  (30d/90d/1y/all ranges, hover for exact date + value) replaces the old tiny
  sparkline.
- **Atlas completion** — every set row shows a completion bar and %, and a set's
  detail view shows **~cost to complete** at current prices.
- **The Forge combo shelf** — combos you can assemble from cards you already
  own, plus "one card away" combos priced by their missing piece (bundled
  Commander Spellbook data; fully offline).
- **Machine power rating everywhere** — the auto-computed deck rating now shows
  on the deck view's Power card and in the deck menu ("6.8 · B3"), and the
  agents (Jace/Karn/Tibalt) see it in locked-deck context.
- **Escape closes every modal** — one consistent behavior across Updates,
  Settings, profiles, and all Vault dialogs (typing in a field is never
  interrupted; the Updates modal holds while an app update runs).
- **Chat filter** — filter your chat sessions by name or locked deck.
- **Pod misery meter** — Pod Balance now shows each deck's EDHREC salt total and
  its three saltiest cards.

### Changed
- All four Vault sub-views restyled from flat panels to LEYLINE glass.

## [0.88.0] - 2026-07-04

### Added
- **The kiosk landing screen.** The app now opens onto three big doors — **The Agents**,
  **The Proving Grounds**, and **The Vault** — with hand-made pixel-art icons, and a bottom
  area bar to hop between them from anywhere. Areas are registry-driven:
  `docs/HOW-TO-ADD-AN-AREA.md` shows how to add one with no AI help.
- **The Agents front door:** three big squares with pixel portraits (blue Jace, silver Karn,
  red Tibalt) — one tap into that agent's chat. Deck loading moved into a **Decks ▾** header
  menu (the old navigation sidebar is retired on desktop).
- **The Proving Grounds** now houses everything about play: The Academy, the Sim Center, and
  **Pod Balance as a full surface** (was a modal) that sees **every profile's decks**, grouped
  by owner. Compare up to 4 for a fairness verdict; decks without a rating get a **Rate**
  button, and **newly imported decks auto-rate** in the background. Ratings live on the deck
  (power level, official bracket, when rated).

### Fixed
- **Power ranking: X spells no longer count as free.** A deck's curve, ramp/cantrip buckets,
  and combo costs previously evaluated {X} as 0 mana; X now floors at 1 everywhere the ranker
  prices a card (and the "what would you actually pay" model for card impact keeps its
  smarter 3–5 estimate). Also fixed in the audit: "each opponent" in rules text no longer
  wrongly inflates an X-spell's assumed cost, double-faced cards no longer double-count a
  back-face {X}, an interaction-axis tier that could never score its top value now does, and
  `Commander:` headers with colons parse correctly in deck lists.
- The local write-protection now accepts same-origin requests on any loopback port (dev
  servers on auto-assigned ports were 403'd); foreign origins are still blocked.

## [0.87.0] - 2026-07-03

### Changed
- **LEYLINE — a full UI/UX overhaul (the third Fable 5 pass).** The entire app moved from the
  Aether cyan theme to LEYLINE: green energy through dark glass. True-black surfaces, phosphor-green
  accents, glass panels, and glow-as-hierarchy (only primary actions, live states, and focus glow).
  The whole pass is UI-only — the game engine is untouched and fence-proven (tier fingerprint
  0-diff; trajectory hash byte-identical to the v0.86.0 anchor, twice).
  - **One button system everywhere.** The audit found 166 distinct hand-rolled button treatments;
    they're now four variants (primary / secondary / ghost / danger) in three sizes with real
    disabled, loading, and keyboard-focus states. One glowing primary action per screen. Every
    label says what happens.
  - **Kiosk shell:** navigation now shows where you ARE (green active states — previously nothing
    highlighted), bigger targets, tracked-caps section labels, and the window title carries the
    running version. The loading screen got the phosphor treatment.
  - **Every surface converted:** chat (Jace/Karn/Tibalt), the Academy game board and all 14
    decision side-sheets, Sim Center, the Vault (collection/build/stats/sets/finance + all 8
    modals), deck views, import, updates/settings/onboarding/profiles/feedback. Empty states now
    lead somewhere (no dead ends).
  - **Agent identity sharpened:** system chrome is always green; each agent's color lives only on
    identity moments — and Jace is now arcane blue (the old cyan was the app's accent, not his).
  - Display face: Space Grotesk (was Playfair). A hidden `/styleguide` route documents the system.

## [0.86.0] - 2026-07-03

### Improved
- **Play-harness + AI overhaul (the second Fable 5 pass).** The headless self-play system and the
  practice AI got a verified deep pass — 10 battery-gated waves, 62 scan findings dispositioned,
  suite 7,503 → 7,661. Highlights:
  - **The AI uses its whole deck now:** equipment gets equipped (activations 0→16 in the equipment
    pod, which finishes ~15 turns faster), board wipes fire when clearly behind, fogs stop lethal
    swings, auras cast on-intent, team pumps fire exactly when they flip a swing to lethal, and
    alternative costs are actually PAID — Fierce Guardianship pitches free, Snuff Out pays life
    (16 carriers offered; 15 risky ones pinned never-offered). Head-to-head vs the previous AI:
    60/40 with dead turns 0.33 → 0.03.
  - **No more wasted cards:** the AI stops casting spells the engine can't resolve (pod census
    spell-unresolved entries 4 → 0) and never aims kicked spells at its own permanents.
  - **A 100×-class perf fix:** a combinatorial explosion in X-target enumeration (Candelabra-style
    'untap X lands') could allocate 7-8GB in one call and stall or OOM cEDH mirrors (~315s) — now
    bounded at the cap with provably identical decisions (4-game mirror: 13.4s incl. richer games).
  - **Training data you can trust:** losing pod seats are no longer labeled winners, mulligans are
    ON for batches (unkeepable hands kept: 9 → 0), seeds are stamped on every banked row, seat/deck
    rotation de-confounds attribution, and every batch reports win tables by seat position and deck
    with confidence intervals.
  - **The pilot seam is fully honest:** caller-driven games keep their instrumentation across act()
    calls, the play-API contract now documents the real 20 pending-choice kinds with per-kind answer
    shapes and a written versioning discipline (PLAY_API_VERSION 1.2.0), policy A/B is reachable from
    the session layer, and an off-turn cascade/discover ask can no longer hard-wedge a game.
  - **Tests can never pollute real data again:** a P0 test-isolation hole (env override defeating
    tmp-dir isolation) was closed with a scrub + tripwire after it filled the dev tree with ~90
    fixture profiles.
- **Coverage riders (from the overnight grind, previously unreleased):** +250 native card flips
  across 9 PRs — Slivers 99% / Omnath 95% / Vihaan 92% / Koma 92% / Zaxara ~90% / Rograkh ~78%
  native, plus new subsystems (becomes-target events, activated-cost reduction, token-count
  replacement, totem armor, proper Rebound, and more).

### Method
- The pass's replication guide ships at docs/orchestration/PLAY-HARNESS-OVERHAUL-PLAYBOOK.md
  (verification recipes, proof levels, anchor-lineage discipline, incident log) with the full
  wave-by-wave evidence in play-harness-overhaul-log.md.


## [0.85.0] - 2026-07-02

### Improved
- **Engine overhaul (Fable 5 pass): ~6× self-play throughput on identical behavior.** The CR-613 layer
  engine and mana model now memoize per card/state (static-ability parses, permanent/keyword indexes,
  manaProduction): the standard 3-game Commander pod batch went 7.0s → ~1.1s with byte-identical
  decisions (trajectory-hash proven), and the corpus classify sweep is unchanged. parseExtendedAtom was
  fully drained into the CLAUSE_PARSERS registry and deleted; the three duplicated mana-commit
  implementations became one (`commitPaymentPlan`), unifying a real drift between them.
- **The practice AI plays measurably better.** Land sequencing (untapped-first, color-aware), a real
  block plan (value/trade/lethal-chump/decline — no more reflexive chump-blocking), legality-aware
  attacks (no more suiciding into deathtouch or holding evasive attackers), right-sized X-spells, an
  opt-in mulligan, and casting held counterspells at threatening enemy spells. Measured head-to-head
  over 120 seeded games: the new policy wins **59.2% vs 40.8%** against the old one, with dead turns
  down 0.68 → 0.03 per game.
- **Commander Spellbook: the FULL combo dataset ships (95,001 combos).** The sync is bulk-first against
  Spellbook's official nightly export (stream-parsed in seconds) with the old paged crawl as fallback —
  releases had been capped at ~10% of the dataset by API rate limits. The strict bundle guard now also
  requires the combo index and card flags, so a gutted combo feature can never ship green.

### Fixed
- **Mirror commanders no longer share a 21-damage tracker.** Two seats running the same commander
  collapsed into one entry (11+10 across two mirror commanders was a false death, and eliminating one
  twin erased the live twin's progress) — damage is now keyed per seat instance (CR 903.10a).
- **Resolved instants/sorceries now reach the graveyard** (CR 608.2m) — they used to vanish, so
  graveyard counts, thresholds, and reanimation targets under-read; storm copies correctly cease to
  exist, fizzled Auras are binned (CR 608.3b), and a countered adventure puts the full card in the
  graveyard (CR 715.4).
- **Adventure commanders (e.g. Kellan, the Fae-Blooded) are castable from the command zone again** —
  each half casts separately with the commander tax (CR 715.2b + 903.8).
- **The Academy no longer soft-locks** on optional mana/sacrifice payment choices (the panels existed
  server-side but had no UI), and any future unhandled choice kind reports engine-stuck honestly
  instead of spinning.
- **11 phantom mana sources removed** (Equipment/conditional/spend-restricted quoted grants —
  Summoning Materia, Rishkar, Battery Bearer class) and 5 over-counted classifications corrected
  (corpus 8,650 → 8,645 native = accuracy up); a chosen sacrifice victim can no longer be cracked for
  the very mana paying its own cost; cost-time battlefield exits fire their leave-triggers in the
  right order (CR 603.3b); mandatory clones can no longer be declined (CR 707.9).
- **Pod games read like pod games:** correct grammar and per-seat names in narration ("Opponent 2",
  never a raw engine id), combat choices name the defender/attacker, non-combat deaths and
  commander damage (with the lethal-21 warning) are logged, and stale rule citations were corrected
  against the bundled Comprehensive Rules.

### Added
- **The play-API v1** (`gameApi.js`, versioned) — external pilots can drive complete games including
  every resolution-time choice; the contract is locked in `docs/orchestration/PLAY-API-CONTRACT.md`
  with an in-gate canary, and `self-play.mjs --export-trajectories` emits trust-gated, pilot-tagged
  training data (the engine→Omnath hook).
- **Method docs for future sessions:** OVERHAUL-PLAYBOOK.md (verification recipes + proof levels),
  OVERHAUL-SESSION-NARRATIVE.md (the full pass, written to be mimicked), and the overhaul evidence
  ledger. Full gate: 6,587 tests green.


## [0.84.0] - 2026-07-01

### Fixed
- **Consolidation pass (Fable 5): 5 phantom-mana false-positive classes removed.** A quoted *group-grant* mana
  ability ("Creatures you control have `{T}: Add …`") was credited as the granter's OWN mana — the engine tapped
  Cryptolith Rite, Chromatic Lantern, Goldspan Dragon, Paradise Mantle, and the Eldrazi-Scion makers for fabricated
  mana every turn. Now stripped unless the card self-includes in the grant scope (Gemhide still self-produces).
  Mana Vault's unmodeled "doesn't untap" restriction routes it out of the standing mana model. "Permanents you
  control have <keyword>" now grants to every permanent (was a dead selector that granted to nobody — Privileged
  Position). Irregular/invariant plural subtypes (Pegasus/Mice/Detectives) and invariant basic-land intervening-ifs
  ("two or more Plains") now resolve correctly. Corpus native 8673→8650 (−23 FPs = accuracy correction); flip-diff
  LOST=23 / GAINED=0.
- **Engine runtime: 9 real bugs.** A creature regenerated mid-combat was silently removed from ALL future combats
  (phantom combatant); the starting player wrongly skipped their first draw in 4-player games (CR 103.8c); a human's
  chosen action could dispatch as a *different* legal action (wrong attack target); a stuck `pendingFreeCast` could
  livelock a game and mint a fake win/loss under time pressure; the AI never cast from exile (cascade always
  declined); trample over a protection-prevented blocker let full power through (CR 510.1c-d); adventure cards were
  double-offered as a combined card at instant speed; timeouts were mis-bucketed in the breakage report; two
  locale-dependent tie-breaks could diverge across machines.
- **Server / .exe: 10 fixes.** Card/rules index paths were captured at module load so an in-app sync silently no-op'd
  in the packaged .exe (now resolved per call); the profiles registry wrote non-atomically and could orphan ALL user
  data on a torn write (now atomic + rebuilds from the profile folders on loss); added an Origin guard against
  localhost drive-by writes; removed a hardcoded developer path; export-all now records per-section readability;
  tibalt surfaces the real provider error; the Ollama model pull resolves an absolute binary path; deleted the dead
  `/api/spellbook` route, the superseded symbolic-engine trio, the chats v1 shim, and buildSeedDeck.
- **Client: 15 fixes.** The Arbiter auto-retry rebuilt the chat from a stale closure and *destroyed* the user's
  question + first reply (now threads fresh state); switching decks left the previous deck's analytics live; the dead
  "Load from Project" flow fabricated success; a profile switch destroyed custom color tags; Jace's canned rules
  primer waited on the full Arbiter pipeline; the chat stream had no abort/timeout (a wedged model disabled the
  composer forever); the background update-check result never surfaced; the busy state bled across sessions; plus
  stacked-tile targeting, card-search race, snapshot-compare default, message-id, and dead-code fixes.
- **Release pipeline.** ~68 releases had shipped with ZERO Commander Spellbook combos (the refdata cache handoff never
  worked cross-OS/cross-tag) — restored a bounded, resumable combo sync + a strict bundle guard that refuses to ship a
  gutted .exe; bundled the missing cardkingdom-prices sync script; switched the release caches to restore-only to stop
  ~840 MB/release of quota churn; made the sync scripts write atomically; fixed a build-rules-index crash path and the
  RELEASE.md rollback procedure.

### Added
- **Architecture scaffolds.** `docs/orchestration/PROJECT-SCAFFOLD.md` (the whole system) and
  `docs/orchestration/ENGINE-SCAFFOLD.md` (the rules engine + a "how to safely add a new mechanic" recipe) — durable
  maps written during the consolidation pass so future sessions can navigate the project without re-deriving it.

### Changed
- Archived two build-status docs that were being served as rules content; refreshed CLAUDE.md's stale paths/numbers
  and resume pointer; bannered superseded handoff docs. Full gate 6,371 tests green, lint clean.


## [0.83.0] - 2026-06-30

### Improved
- **Counter-riders (+7 native).** Counter + zone-redirect (Remand → hand, Memory Lapse → library top) and counter +
  draw (Dream Fracture, Introduction to Annihilation, Dissipate, Lapse of Certainty, Assert Authority). Soft "counter
  unless pay {X}" (Mana Leak) confirmed already native + runtime-resolved. Flip-diffed both directions (7 gained, 0
  lost), full gate (6,324 tests) green, 0 false positives.


## [0.82.0] - 2026-06-30

### Improved
- **Mana-value-filtered exile/destroy removal (+13 native).** "Exile/destroy target <type> with mana value N or
  greater/less" (Despark, Eliminate, Epic Downfall, Smother, Tyrant's Scorn, Fragmentize, Natural State…), with the
  MV/restriction filter now enforced at target enumeration (only legal-MV targets are offered). Base exile-removal +
  Swords/Path-style riders were already native. Flip-diffed both directions (13 gained, 0 lost), full gate (6,311
  tests) green, 0 false positives.


## [0.81.0] - 2026-06-30

### Improved
- **Cross-deck counter spell-filters + causative single-target pump (+30 native — biggest wave since kicker).**
  Hard-counters gated by a spell filter — type (Dispel, Annul), mana-value compare (Disdainful Stroke, Spell Snare),
  color (Gainsay, Ceremonious Rejection) — plus activated/modal/adventure counters; and the causative "have target
  creature get ±N/±N" pump (Fourth Bridge Prowler → Yuriko 52%, Blightcaster, Painsmith…). Confirmed the counter
  RUNTIME genuinely resolves (cast → counter a stacked spell → graveyard). Flip-diffed both directions (30 gained, 0
  lost, deterministic), full gate (6,297 tests) green, 0 false positives.

### Fixed
- **Counter-target enumeration** now threads the spell's mana-value / color restrictions into the cast-path target
  spec, so a filtered counter ("counter target spell with mana value 3 or less") is never offered an illegal target.


## [0.80.0] - 2026-06-30

### Improved
- **Variable-X mana augments (+2 native).** "Whenever you tap a land/creature for mana, add {X}" (Groundchuck &
  Dirtbag) and "{T}: Add X mana of any one color, where X is <a modeled board count>" (Sanctum Weaver → Mothman
  54→55%). Deck-mover surveys confirmed Kinnan (cEDH) is at its clean Arbiter ceiling — its tail is
  counterspells/tutors/Rhystic-tax, all Arbiter-domain. Flip-diffed both directions (2 gained, 0 lost,
  deterministic), full gate (6,269 tests) green, 0 false positives.


## [0.79.0] - 2026-06-30

### Improved
- **Deck-movers — Toph + Pantlaza (+10 native).** A card-type creature anthem ("Artifact/Enchantment/Land creatures
  you control get/have …" — Tempered Steel, Master of Etherium, Chief of the Foundry, Earthbending Student) and a
  count-scaled attack self-pump ("gets +N/+N until end of turn for each …" — Rampaging Brontodon, Timbermaw Larva,
  Creeping Trailblazer). Moves Toph and Pantlaza. Flip-diffed both directions (10 gained, 0 lost, deterministic),
  full gate (6,250 tests) green, 0 false positives.


## [0.78.0] - 2026-06-30

### Improved
- **Deck-movers — Ur-Dragon 72→73, Zaxara 79→80 (+2 native).** Balefire Dragon (combat-damage mass-sweep to the
  damaged player's creatures) and Primordial Hydra (self-counter-gated trample at ten counters). Flip-diffed both
  directions (2 gained, 0 lost, deterministic), full gate (6,223 tests) green.

### Fixed
- **Deterministic tier classification + flip-diff gate.** Locked classifyCard's determinism for the RAMP-MULTI-X
  ramp tutors (Boundless Realms, Traverse the Outlands) with a 200×-plus cross-card-state regression test, and
  hardened `tier-fingerprint.mjs` to emit one deterministic tier per card NAME (native-wins) — eliminating phantom
  GAINED/LOST flip-diff entries from the few multi-printing cards whose printings classify to different tiers
  (Everythingamajig, Red Herring, Unquenchable Fury).

## [0.77.0] - 2026-06-30

### Improved
- **Deck-mover wave — Omnath 75→76, Koma 81→82 (+4 native).** RAMP-MULTI-X land tutors (Traverse the Outlands,
  Boundless Realms — fetch count drawn from a board source) and mass-bounce (Whelming Wave, with its Kraken/
  Leviathan/Octopus/Serpent exclusion, + Evacuation) — targeting the two decks' own non-native tails. Flip-diffed
  both directions (4 gained, 0 lost, verified deterministic across 3 fresh runs), full gate (6,201 tests) green, 0
  false positives.

## [0.76.0] - 2026-06-30

### Improved
- **Fight-another + destroy-damage riders (+8 native).** Source-bound "[this] fights another target creature"
  (Nessian Wilds Ravager, Territorial Allosaurus, Atzocan Archer) and destroy-target + "deals N damage to that
  permanent's controller" (Smash to Smithereens, Destructive Revelry, Molten Rain, Poison the Well…). Flip-diffed
  both directions (8 gained, 0 lost), full gate (6,183 tests) green, 0 false positives.

## [0.75.0] - 2026-06-30

### Improved
- **Typed sacrifice edicts + Tribute (+17 native).** "Each opponent / target player sacrifices a land / artifact /
  enchantment" (Tribute to the Wild, Pharika's Libation, Shattergang Brothers commander…) and the Tribute keyword's
  enter-with-an-opponent's-choice ETB (Snake of the Golden Grove, Pharagax Giant, Fanatic of Xenagos…). Flip-diffed
  both directions (17 gained, 0 lost), full gate (6,161 tests) green, 0 false positives.

## [0.74.0] - 2026-06-30

### Improved
- **Destroy-target permanent atoms + kicked-spell-effects (+23 native).** "Destroy target nonbasic land / noncreature
  permanent" (Sinkhole, Fulminator Mage, Bramblecrush…) — which also completes the kicker land-destroyers (Goblin
  Ruinblaster, Mold Shambler) — plus kicked payoffs on instants/sorceries (Runic Shot, Blink of an Eye, Dismantling
  Blow, Phyrexian Espionage…). Flip-diffed both directions (23 gained, 0 lost), full gate (6,109 tests) green, 0
  false positives.

## [0.73.0] - 2026-06-30

### Improved
- **Cascade + kicker kicked-ETB-triggers (+45 native).** The Cascade keyword (on cast, dig to the first cheaper
  nonland card and cast it free — 18 cards) and kicker payoffs that fire an ETB trigger when kicked (Heartstabber
  Mosquito, Torch Slinger, Goblin Bushwhacker, Kor Sanctifiers, Nullpriest of Oblivion… — 27 cards). Flip-diffed
  both directions (45 gained, 0 lost), full gate (6,070 tests) green, 0 false positives.

## [0.72.0] - 2026-06-30

### Improved
- **Emerge + subtype-batch combat triggers (+12 native).** The Emerge alt-cast (Wretched Gryff, Decimator of the
  Provinces, Vexing Scuttler…) and "whenever one or more [outlaws / artifact creatures / …] you control deal combat
  damage" triggers — which flips **Olivia, Opulent Outlaw** native (Vihaan deck 83→84%). Flip-diffed both directions
  (12 gained, 0 lost), full gate (6,017 tests) green, 0 false positives.

## [0.71.0] - 2026-06-30

### Improved
- **Kicker + sac-cost / sorcery-restricted activated abilities (+60 native — the biggest wave).** The Kicker
  keyword (Academy Drake, Llanowar Elite, Stronghold Confessor…) and activated abilities gated by a "Sacrifice N
  Treasures/Clues/Food" cost or an "activate only as a sorcery" timing rider (Ruthless Knave, Tamiyo's Journal,
  Greta, Dimir Guildmage, the Skullbomb cycle, +40 more). Flip-diffed both directions (60 gained, 0 lost), full
  gate (5,978 tests) green, 0 false positives.

## [0.70.0] - 2026-06-30

### Improved
- **Modal multi-sentence modes + chosen-type anthems (+14 native).** "Choose one —" modes that span sentences
  now parse fully (Maestros Charm, Supreme Will, Agate Assault, Poison the Waters…) and chosen-type flat anthems
  (Rally the Ranks, Obelisk of Urd, Shared Triumph, Cover of Darkness, Steely Resolve). Flip-diffed both directions
  (14 gained, 0 lost), full gate (5,917 tests) green, 0 false positives.

## [0.69.0] - 2026-06-30

### Improved
- **Bestow + controller-life-threshold conditions (+19 native).** The Theros bestow mechanic — enchantment
  creatures castable as an Aura, both modes end-to-end (the Nyxborn cycle, Hopeful Eidolon, Boon Satyr,
  Chromanticore + more) — and "if you have N or less/more life" upkeep conditions (Convalescent Care,
  Convalescence). Flip-diffed both directions (19 gained, 0 lost), full gate (5,879 tests) green, 0 false positives.

## [0.68.0] - 2026-06-30

### Improved
- **Targeted-Storm copies + half-X-create-tokens (+9 native).** Storm now copies targeted spells with per-copy
  target choice (Grapeshot, Tendrils of Agony, Scattershot, Hindering Touch, Temporal Fissure, Astral Steel,
  Reaping the Graves, Volcanic Awakening) and The Goose Mother flips native (half-X Food tokens; ETB triggers now
  thread the cast's X). Flip-diffed both directions (9 gained, 0 lost), full gate (5,858 tests) green, 0 false positives.

## [0.67.0] - 2026-06-30

### Improved
- **Qualified-ETB keyword-grant + Storm (+8 native).** "Whenever a creature with [keyword] you control enters,
  [grant]" (Dragon Tempest for Ur-Dragon, Waterkin Shaman) and the Storm keyword (Empty the Warrens, Chatterstorm,
  Weather the Storm, Radstorm, Sprouting Vines, Hunting Pack). Flip-diffed both directions (8 gained, 0 lost),
  full gate (5,840 tests) green, 0 false positives.

## [0.66.0] - 2026-06-30

### Improved
- **Mana-multiplier + Annihilator (+3 native).** Tap-for-mana ×N replacement (Mana Reflection, Nyxbloom Ancient
  for Omnath) and the Annihilator keyword (Ulamog's Crusher). Flip-diffed both directions (3 gained, 0 lost),
  full gate (5,798 tests) green, 0 false positives.

## [0.65.0] - 2026-06-30

### Improved
- **Adventure mechanic + deaths-this-turn count (+35 native).** 34 Adventure cards now play both halves
  end-to-end (Brazen Borrower, Beanstalk Giant, Faerie Guidemother, the Adventure Dragon cycle…) and a
  deaths-this-turn counter (Mahadi, Body Count + corpus aristocrats). Flip-diffed both directions (35 gained
  native, 0 lost), full gate (5,753 tests) green, 0 false positives.

## [0.64.0] - 2026-06-30

### Improved
- **Reanimate-from-any-graveyard + reflexive-sac-by-subtype (+5 native).** "Put target creature card from a/an
  opponent's graveyard onto the battlefield under your control" (Hymn of Rebirth, Ashen Powder, Endless Obedience,
  Vat Emergence) and "you may sacrifice a Food/Treasure/Blood; if you do, [effect]" (Wedding Security). Flip-diffed
  both directions, 0 regressions, full gate (5,714 tests) green, 0 false positives.

## [0.63.0] - 2026-06-30

### Improved
- **God-devotion + self-cast-trigger subsystems (+7 native).** The Theros Gods' devotion creature-gate (Nylea,
  Heliod, Purphoros, Thassa, Karametra) and "when you cast this spell" triggers (Hydroid Krasis, Desolation Twin).
  Flip-diffed both directions, 0 regressions, full gate (5,684 tests) green, 0 false positives.

## [0.62.0] - 2026-06-30

### Improved
- **One-shot extra-land + half-X subsystems (+5 native).** "Play an additional land this turn" (Explore, Summer
  Bloom, Urban Evolution, Scale the Heights) and half-of-a-value amounts (Contaminated Drink — "half X, rounded").
  Flip-diffed both directions, 0 regressions, full gate (5,663 tests) green, 0 false positives.

## [0.61.0] - 2026-06-29

### Improved
- **Two more cross-deck subsystems (+17 native).** Double-X cost ({X}{X} now correctly charges 2X — Walking
  Ballista, Gelatinous Genesis; also closed a latent under-pay on Cryptic Trilobite) and characteristic-defining
  P/T-by-board-count (Dakkon Blackblade, Molimo, Dungrove Elder, Nightmare + more "power/toughness = lands/
  creatures you control"). Flip-diffed both directions, 0 regressions, full gate (5,629 tests) green, 0 false positives.

## [0.60.0] - 2026-06-29

### Improved
- **Cross-deck subsystems + deck cleanup (+18 native).** Pantlaza permanent-edict (Silverclad Ferocidons),
  library-tutor-to-battlefield (Wargate, Nature's Rhythm, Chord of Calling), and subtype-restricted targeting
  (Otepec Huntmaster, Human Frailty + 10 corpus tribal cards — Krosan Groundshaker, Veteran Cathar, Firewake
  Sliver…). Flip-diffed both directions, 0 regressions, full gate (5,594 tests) green, 0 false positives.

## [0.59.0] - 2026-06-29

### Improved
- **Deck-driven cleanup — Toph 67→69%, Ur-Dragon 70→71% (+5 native).** A sacrifice-a-land ramp atom (Roiling
  Regrowth, Cycle of Renewal + corpus: Foul Spirit, Ruinous Minotaur) and Neriv, Heart of the Storm (doubles
  damage from creatures that entered this turn). Flip-diffed both directions, 0 regressions, full gate (5,560
  tests) green, 0 false positives.

## [0.58.0] - 2026-06-29

### Improved
- **Deck-driven cleanup — Zaxara 73→75%, Omnath 71→72% (+3 native).** Pongify + Rapid Hybridization (a
  destroy-and-replace-with-a-token matcher, correcting an old regeneration-era carve-out) and Seedborn Muse
  (untap your permanents on every other player's untap step). Flip-diffed both directions, 0 regressions, full
  gate (5,542 tests) green, 0 false positives.

## [0.57.0] - 2026-06-29

### Improved
- **Aristocrats death-trigger + copy-rider subsystems (+5 native).** New death-dispatch infrastructure —
  planeswalker death + leaves-the-battlefield / put-into-graveyard watchers — lights up Cruel Celebrant,
  Nadier's Nightblade, and Tablet of Epityr (reusable across every aristocrats deck). Plus copy-with-rider
  clones: Spark Double (copy a creature or planeswalker + conditional counter) and Second Harvest (copy each
  token you control). Flip-diffed both directions, 0 regressions, full gate (5,523 tests) green, 0 false positives.

## [0.56.0] - 2026-06-29

### Improved
- **Deck-driven cleanup + two reusable alt-cast levers.** Koma 76→77% (Irenicus's Vile Duplication — token-copy
  with a keyword-grant rider) and Vihaan 77→79% (Damn, Exalted Sunborn). The Overload (CR 702.96) and Warp
  (CR 702.176) cast-keyword strips also flipped **+22 more corpus cards** (Cyclonic Rift, Mizzium Mortars,
  Vandalblast, Nova Hellkite, Starbreach Whale…) — **+24 native total**. Flip-diffed both directions, 0
  regressions, full gate (5,489 tests) green, zero false positives.

## [0.55.0] - 2026-06-29

### Improved
- **+13 more cards native** across the priority decks, via three effect-modeling waves: attack-trigger life-drain
  (Silent Skimmer, Leeching Sliver, Agate-Blade Assassin, Campaign of Vengeance), a draw-equal-to-target's-power
  scaler (Soul's Majesty), and ETB "intervening if" board conditions (Linvala the Preserver, Knight of the White
  Orchid, Loyal Warhound, Dwynen's Elite, Ghitu Journeymage, Apothecary Geist…). Every wave flip-diffed both
  directions for 0 regressions, full gate (5,472 tests) green, zero false positives.

## [0.54.0] - 2026-06-29

### Added
- **Both TIER-2 commanders now play natively.** Vihaan, Goldwaker (begin-combat mass-animate of your Treasures into
  3/3 creatures + an outlaw anthem) and Omnath, Locus of Mana (green mana doesn't empty as steps/phases end +
  Omnath grows +1/+1 for each unspent green) — the two commanders parked in 0.53 are now fully modeled.
- **New engine subsystems** (unblock cards across every deck): **free-cast** ("cast a spell from your hand without
  paying its mana cost" — the Expertise cycle, Omnispell Adept), **put-from-hand-onto-battlefield** (Ghalta, Last
  March of the Ents, Elvish Piper, Quicksilver Amulet, Dramatic Entrance…), **landfall-composite** (cards mixing a
  landfall trigger with a static or activated ability — Bristly Bill, Aesi, Storm-Kiln Artist, Archon of Sun's
  Grace…), and **board-wide +1/+1 counter doubling** (Kalonian Hydra).

### Improved
- **+22 cards native this release**, including the two commanders. Every wave flip-diffed both directions for 0
  regressions, full gate (5,425 tests) green, zero false positives.

## [0.53.0] - 2026-06-29

### Improved
- **TIER-2 decks more native** (toward the next self-play pod): Vihaan 74%→76% and Omnath 63%→66%, plus
  cross-corpus gains — Cavern-Hoard Dragon, Smaug the Magnificent (a "first-word self-reference" fix for
  legendary `<Name> the <Epithet>` cards), Arbor Elf, Surrak and Goreclaw, Avenger of Zendikar, and more.
  +13 cards native this release, every wave flip-diffed for 0 regressions + gated, zero false positives.

### Notes
- The Vihaan and Omnath commanders are parked pending engine subsystems (animate-Treasures / mana-retention +
  characteristic-defining-ability) — a prioritization decision; the rest of each deck plays natively.

## [0.52.0] - 2026-06-29

### Added
- **The first self-play pod is ready.** All four decks of a diverse first pod — Slivers, Koma, Zaxara, and
  The Ur-Dragon — now play natively, **commanders included**, so the simulator can run a full 4-deck game with
  real archetype variety (tribal / ramp / X-spells / Dragons) instead of mirrors.
- **The pilot decision seam is complete** — the simulator's pilots now make *every* in-game decision (main plays,
  attacks, blocks, X-costs, modal, mulligan, and tutor/scry/sacrifice/edict choices), not just the obvious ones.

### Improved
- **~150 more cards play natively** (toward 100% on the test decks): three commanders modeled (Yuriko — reveal→
  mana-value drain; Zaxara — X-cast Hydras; Koma — subtype sacrifice-cost / modal abilities / tap-permanent),
  the optional-mana-payment effect ("you may pay {cost}: draw" — Mind's Eye, Spellbombs, Lifecrafter's Bestiary…),
  Convoke/Affinity cost handling, power-conditional triggers, combat-damage discard, and more. Colton's 6 personal
  decks were added to the test set.
- **Accurate mana.** "Add two/three mana of any color" (Black Lotus, Jeweled Lotus, Gilded Lotus, Goldspan Dragon,
  Zaxara…) now produces the right amount in the simulator (was always 1); removed phantom mana from sacrifice-cost
  abilities; counterspells are no longer cast at an empty stack.

### Internal
- Every wave flip-diffed for 0 regressions + gated; **zero false positives**. The learn-to-play flywheel
  (pilots → self-play game → trajectory → mode-tagged case memory) is validated end-to-end; this release makes the
  first real 4-deck pod self-play-trustworthy.

## [0.51.0] - 2026-06-29

### Improved
- **~33 more cards play natively in the simulator** (toward 100% on the test decks): power-qualified
  intervening-if conditions (Garruk's Uprising across 4 decks), combat-damage discard (Specters / Larceny),
  **Ninjutsu** (a dozen ninja creatures — the Yuriko deck rose 49% → 51%), Phoenix-style return-on-death,
  "put a counter on this creature" triggers, and count-scaled damage (Scourge of Valkas). Every wave
  flip-diffed for 0 regressions + gated, **zero false positives shipped** — and 2 latent false positives
  (counter-back-reference spells mis-read as combat-referent) were caught and closed.

## [0.50.0] - 2026-06-29

### Added
- **Mulligan in self-play** — pilots can make London mulligan keep/ship decisions (opt-in; normal Academy games unchanged).

### Fixed
- **Cleaner self-play simulation — better training data for the future "play-to-win" model:**
  - The simulator no longer offers casting a counterspell with nothing on the stack (an illegal play it would otherwise waste, CR 601.2c) — covers Remand / Cryptic Command / Force of Will and similar.
  - Removed phantom mana: an ability like "Sacrifice a creature: Add mana" is no longer treated as free, always-available mana (58 such phantom sources corrected; real mana dorks/filters untouched).
  - Self-play now alternates which player is on the play, so batch training data isn't seat-position-biased; each game records who led.
  - Trajectory recording no longer silently failed on actions with empty fields, and the game result now reports the winning seat consistently.

### Improved
- **~9 more cards play natively** (Phoenix-style return-on-death triggers; "put a counter on this creature" abilities).

### Internal
- Learn-to-play seam hardening from end-to-end validation: the flywheel (pilots → self-play game → trajectory → mode-tagged case memory) is running. Holistic regression check across the session: +147 native, 0 regressions.

## [0.49.0] - 2026-06-29

### Added
- **Self-play "pilot" engine seam — the learn-to-play foundation.** The self-play loop can now be driven by
  external decision modules ("pilots"): a stable play-API (legal moves / apply-action / game-status / observe)
  plus a pluggable decision hook at every enumerated decision point (main plays, attacks, blocks, X-costs,
  modal choices) and full per-decision trajectory recording. This is the foundation for teaching the simulator
  to play to win. Fully opt-in — default self-play and your normal Academy games are byte-identical to before.
- **Decisive self-play games (opt-in time-pressure).** A stalled self-play game now resolves to a real
  win/loss via an escalating clock past a *generous* soft cap (turn 60 — above the longest natural game)
  instead of dragging to a draw, producing clean training labels. A game that still times out is honestly
  tagged and excluded from training — never a fabricated winner. Off by default; your games are unaffected.
- **Varied self-play repeats (seeded shuffle).** Running multiple self-play games of the same matchup now
  produces genuinely different games (seeded library shuffle), so the Sim Center can generate real data volume.

### Improved
- **~90 more cards play natively in the simulator** (toward 100% on the test decks): a cost-reduction-sentence
  parser fix that unblocked ~59 already-modeled counterspells/board-wipes/burn (Vanquish the Horde, Mystical
  Dispute, Titanic Brawl…), plus filtered mass-counter & subtype-scoped triggers (aristocrats/tribal: Cordial
  Vampire, Indulgent Aristocrat…), Putrefy, Blasphemous Act, Smell Fear, and more — every wave flip-diffed for
  0 regressions + gated, **zero false positives shipped**.

### Internal
- Learn-to-play division of labor locked with the strategy side: the pilot decision modules + offline
  memory-mining live outside the app and inject through the new self-play seam.

## [0.48.0] - 2026-06-28

### Added
- **Sim Center** — a new top-level section (Sidebar → TRAIN, beside The Academy) for stress-testing your
  decks. Pick decks across profiles, run the engine against itself **entirely offline** (no network, no
  cloud), and get a ranked per-card report of what the simulator can't fully model yet. Save reports, browse
  past runs, and optionally bank training data. Powered by a new headless self-play runner + breakage report.

### Improved
- **~200 more cards now play natively in the simulator.** New/extended mechanics include cost-reduction,
  Sliver tribal (group-evasion / can't-be-countered / group-triggered-grant / group-ward), two-target fight,
  Treasure economy, dynamic counts, plot, modal & reflexive triggers, land-economy, X-spells (Exsanguinate,
  Biomass Mutation…), team-pump scopes, and more. The 13 test decks' native-play coverage rose ~33% → ~40%,
  with **zero false positives shipped** (every wave flip-diffed for 0 regressions + gated).
- Closed two latent false-positive classes in card resolution (mis-event referent triggers; optional-reflexive
  partial-resolves) and removed a do-nothing native (Mardu Warshrieker).

### Internal
- Learn-to-play groundwork: a self-play **trajectory recorder** (board state → eventual outcome) that lets
  every self-play game double as training data for a future "play to win" model. Opt-in, fully offline.

## [0.47.0] - 2026-06-27

- **Coverage engine — 29 clean recognition/reuse waves (+439 cards native; corpus 20.8% → 22.1%, 7,113 →
  7,552 / 34,160).** A sustained orchestrated pass that grew the local rules engine's native coverage with
  zero false positives and zero regressions (every wave gated by a 0-OUT tier-fingerprint flip-diff, oracle
  verification of every flipped card, and a dedicated test). New card behaviors that now play natively in the
  simulator include: the full vacuous alternate-cast keyword family (flashback / jump-start / retrace /
  escape / madness / spectacle / prowl / surge / miracle / awaken); X-pumps (symmetric and asymmetric
  +X/+0); bounded and board-count damage division; deal-damage / draw / gain-life / token counts scaled by a
  board or zone count; "exile target card from a graveyard"; "create a token that's a copy of target creature
  you control"; combat tricks that untap; "can't be blocked this turn"; switch power and toughness;
  count-scaled soft counters ("unless its controller pays {N} for each …"); "draws N cards and loses M
  life"; and the wheel ("each player discards their hand, then draws N") — **Wheel of Fortune, Reforge the
  Soul, and Wheel of Fate now resolve natively.** Effects that need a still-unbuilt subsystem (granted quoted
  abilities, multi-target enumeration, becomes-blocked triggers, must-attack, floating damage-replacement)
  continue to route safely to the Arbiter.

- **General intervening-if conditional triggers (CR 603.4):** a new strict board-query evaluator
  (`interveningIf.js`) lets a conditional trigger ("When this enters, **if you control an artifact**, draw
  a card") play natively. It reads the controller's-board conditions the corpus most often gates on —
  "you control a/an/N <type/subtype>", tapped/untapped/token filters, "you control no <type>", and
  graveyard card-counts. `gameEngine.buildTriggerStack` evaluates the condition at flush (drops the trigger
  if false — CR 603.4 first check) and `resolvers` re-check at resolution (second check), mirroring the
  existing win-game intervening-if machinery. This also fixes a latent runtime fail-open (these triggers
  previously fired unconditionally). Flips 31 permanents to native-trigger (Scholar of Stars, Saruli
  Gatekeepers, Gixian Skullflayer, Dundoolin Weaver, Shoreline Salvager, …). Turn-event history ("a
  creature died this turn"), power comparisons, color/state-flag conditions, and designations ("you control
  a commander" — not a card type) stay on the Arbiter, strictly never fail-open. **+31 native-trigger.**
- **"Target creature can't block this turn" (CANT-BLOCK):** a new `cant-block` atom grants the target
  creature a layer-6 end-of-turn "cantBlock" restriction, enforced by `combatEvasion.canBlockAttacker`
  (layer-aware, so it wears off at cleanup like a combat-trick keyword grant). Enemy-side intent — the
  trigger-flush chooser picks an opponent's creature, since you disable a blocker to push damage. Flips 17
  permanents to native-trigger (Goblin Shortcutter, Crossway Vampire, Mardu Roughrider, Fervent Cathar,
  Voldaren Duelist, Unstoppable Ogre, …). Activated-ability cant-block, optional "pay then" riders,
  restricted/mass targets, and auras with extra text stay on the Arbiter. **+17 native-trigger.**
- **Explore keyword action (EXPLORE, CR 701.44):** the Ixalan-block explore family now plays natively.
  A new `explore` atom + resolver reveals the top card of the exploring creature's controller's library;
  a land goes to their hand, otherwise a +1/+1 counter is put on the creature and the card is kept on top
  (the engine resolves the "back or graveyard" choice deterministically to keep-on-top — a legal option;
  an interactive picker is a future refinement). detectTriggers rewrites the pronoun "it explores" → the
  source ("this creature explores") for a self trigger or the triggering creature for a non-self enters
  watcher (Path of Discovery); Jadelight Ranger's "then it explores again" becomes two explore atoms.
  Flips 20 permanents to native-trigger (Merfolk Branchwalker, Jadelight Ranger, Emperor's Vanguard,
  Path of Discovery, Seekers' Squire, Queen's Agent, Siren Lookout, Ixalli's Diviner, …). The variable
  "explores X times" (Jadelight Spelunker), explore-watchers, and complex riders (Deepfathom Echo's copy
  clause) stay on the Arbiter. **+20 native-trigger.**
- **ETB-TARGETED triggered intent fix:** `atomTargetIntent` in the parser now classifies
  bounce/tuck triggers (non-own target) as **enemy** and discard-target-player triggers as
  **enemy**, draw-target-player as **own**, regenerate-target-creature as **own**. The
  trigger-flush chooser picks the correct side automatically for the whole ETB-removal family:
  Man-o'-War, Aether Adept, Voidwielder, Separatist Voidmage, Kiri-Onna, Dispersal Technician,
  Glowing Anemone, Vedalken Dismisser (tuck), Rottenheart Ghoul, Kemuri-Onna, Saltwater Stalwart,
  Horizon Seed. **+12 native-trigger.**
- **Reminder-text trigger count fix (TRIG-REMINDER-STRIP):** `allTriggerSentencesModeled` now strips
  reminder text (CR 207.2 — no rules meaning) before counting trigger-shaped sentences. A keyword's
  reminder can contain a "When …" clause — earthbend's "(… When it dies or is exiled, return it to the
  battlefield tapped.)" — that the count regex saw as a shaped sentence but `detectTriggers` correctly
  rejected, inflating the shaped count above the detected count and forcing a false body-only. Stripping
  the reminder can only lower the shaped count (a real trigger is never printed only in reminder parens),
  so it's strictly false-negative-safe. Flips Earth Village Ruffians, Haru Hidden Talent, and Toph
  Earthbending Master to native-trigger. **+3 native-trigger.**
- **Metalcraft / equipped / combined control-gate statics (GATED-ARTIFACT):** three extensions to the
  existing gated-static machinery: (1) the `Metalcraft —` ability-word label is now stripped before
  parsing, so pure P/T and keyword Metalcraft cards (Ghalma's Warden, Snapsail Glider, Auriok Edgewright,
  Spiraling Duelist, Vedalken Infiltrator, Chrome Steed, Ardent Recruit, Carapace Forger, Razorfield
  Rhino, Ezuri's Brigade, Auriok Sunchaser) route through the existing GATED-SELFBUFF / GATED-KEYWORD
  machinery. (2) A new combined form `"gets +P/+T and has <kw> as long as you control …"` (prefix and
  suffix) routes through `emitGatedEffect`, adding creature-subtype gates (Beast, Bird, Dinosaur,
  Dragon, Faerie, Giant) and artifact / enchantment control gates (Aerial Engineer, Goblin Tomb Raider,
  Gravblade Heavy, Scrapyard Mongrel, Dhund Operative, Skirk Outrider, Thrash of Raptors, Kithkin
  Greatheart, Dragonloft Idol, Boggart Sprite-Chaser, Blood-Cursed Knight, Cloudreach Cavalry).
  (3) A new `{ kind:"isEquipped" }` gate type — `gateMet` scans the battlefield for an Equipment with
  `attachedTo === this permanent` — handles `Skyhunter Cub`, `Dwarfhold Champion`, `Leonin Den-Guard`,
  `Kor Duelist`, `Auriok Glaivemaster`, `Kitesail Apprentice`, `Sunspear Shikari`, `Leonin Lightbringer`.
  The Metalcraft strip is gated to permanent (creature) statics only — an instant/sorcery using the
  Metalcraft label (Galvanic Blast) stays body-only/Arbiter. Menace is now grantable + enforced at combat
  (GATED-GY-EXT #343), so a gated menace grant flips native; a non-grantable keyword (hexproof) still
  drops the whole clause → LOW per CREED. **+31 cards.**
- **"It" pronoun in non-self trigger effects (TRIG-PRONOUN-IT):** a non-self trigger that acts on the
  TRIGGERING permanent via the pronoun "it" — "Whenever a creature you control attacks, **it** gets +2/+2
  until end of turn" (Fervent Charge), "…enters, **it** gets +2/+0 and gains haste…" (In the Web of War),
  plus "sacrifice **it**" / "return **it** to its owner's hand" — now routes natively. Built ON the WAVE-3b
  COUNTERS-ON-EVENT substrate (no fork): `detectTriggers` rewrites the non-self pronoun → the sentinel
  "the triggering creature" (gated to the non-self triggering scopes), and parser.js models that sentinel
  as `target:"thatCreature"` → `ctx.triggeringPermanentId` (the same referent the counter form uses; pump
  and bounce now resolve it through `atomTargets`, sacrifice through an `applySacrifice` early-exit). The
  counter form itself is unchanged (still served by `counterClausesParser`). **CREED — the sentinel gate:**
  "the triggering creature" appears in ZERO printed oracle text, so a SPELL's anaphoric "it"/"that creature"
  (Big Play, Puncture Bolt, Miraculous Recovery) is NEVER rewritten and stays on the Arbiter — closing the
  false positive the earlier bare-"it" parser approach would have opened. Self-scope "it" (Brazen Wolves)
  is untouched (still the "this creature" self path). Un-grantable keywords (hexproof) still drop to LOW.
  Modest yield — most non-self "it" triggers are exalted "attacks alone", which the sole-attacker guard
  keeps on the Arbiter: **+4 cards** (Fervent Charge, In the Web of War, Atarka World Render, Kragma
  Warcaller), with a leave-one-out flip-diff confirming **zero** regressions.

- **Plain cycling credited as native (KW-CYCLING):** "Cycling {cost}" is a fully-enforced activated
  ability (actionDispatcher.applyCycle — CR 702.29: pay the mana cost, discard the card, draw a card).
  The credit is tightened to **"cycling {cost}"** (the keyword followed by a brace mana cost), mirroring
  the engine's `parseCyclingCost` exactly — so a line merely *starting* with "cycling " that is NOT an
  activated cycling ability stays body-only. In particular **Fluctuator** ("Cycling abilities you
  activate cost {2} less to activate" — a static cost-reducer) and cycle-trigger cards are correctly
  NOT credited. Typecycling variants (landcycling/plainscycling/…) and cycle-trigger residue also stay
  body-only (safe false-negative). **+33 cards** (Sandbar Serpent, Yoked Plowbeast, Primoc Escapee,
  Wasteland Scorpion, Macetail Hystrodon, Darkwatch Elves, Lava Serpent, and more).
- **Enters-tapped credit + non-combat damage trigger (TRIG-MISC):** two coverage gaps closed.
  (1) Cards whose only non-keyword text is an unconditional "enters tapped" sentence — Shambling
  Ghoul, Custodian of the Trove, Daring Thunder-Thief, and ~16 others — now classify **native-body**;
  the engine already handles enters-tapped in `actionDispatcher.entersTapped()`. The strip also
  propagates through all downstream checks (trigger / activated / static / mixed), unlocking cards
  like Spare Supplies (enters tapped + draws on ETB → **native-trigger**) and mana-dork artifacts.
  Re-guard (CREED): `entersTapped()` now rejects a same-sentence "and …"/"then …" rider (e.g. "enters
  tapped **and** you lose 1 life") so the `tapRe` strip can't silently drop an unmodeled rider — such
  cards stay body-only. (2) "Whenever this creature deals damage to a player / an opponent" — the
  non-combat form (Vedalken Heretic, Thieving Magpie, Thieving Otter, Looter il-Kor, Lu Xun, …) is now
  a recognised trigger mapped to `combatDamageToPlayer`; in the simulator all creature damage is combat
  damage so the event fires correctly. **+28 cards total**.

- **Self-referential bounce + sacrifice trigger effects (TRIG-EFFECT-ATOMS):** two new non-targeted
  self-reference atoms for trigger effects — **SELF-BOUNCE** ("return this creature to its owner's
  hand" → `op:"bounce", target:"self"`) and **SELF-SACRIFICE** ("sacrifice this creature" →
  `op:"sacrifice", target:"self"`). `atomTargets → selfTargets → ctx.sourceId` (no chosen target;
  routes natively on every trigger path). `applySacrifice` early-exits for `target:"self"` via
  `sacrificeCreatureEffect(ctx.controller, ctx.sourceId)`. Both forms are fully anchored — any rider
  or qualifier fails `$` → null → Arbiter. The large yield (+164 cards) is amplified by PUMP-TGT-CTRL
  (already in master) having opened many formerly multi-gap cards to single-gap. **+164 cards**.

- **General-corpus coverage batch (7 slices):** drained the parked Cindy backlog after the lane
  reopened — **COUNTER-TARGET-OWN** ("put a ±1/±1 counter on target creature you control", own-only
  target enumeration incl. Baleful Ammit's −1/−1), **TOKEN-BARE-MULTICOLOR** (bare multi-color token
  clauses like "a green and white Citizen" no longer mis-split), **TAP-TARGET-CREATURE** ("tap target
  creature" with controller / power / toughness / mana-value / flying restrictions; riders bounce to
  the Arbiter), **GATED-GY-EXT** (graveyard-typed-count gates incl. Descend "permanent card" + Fear
  added / menace un-stale-d as grantable combat keywords, both enforced via `permanentHasKeyword`),
  **CAST-HEROIC** (heroic CR 702.35 + magecraft's cast half CR 702.173), **TRIG-COND-ETB-SUBTYPE**
  ("another &lt;subtype&gt; you control enters" tribal ETB, denylist-guarded), **PUMP-TGT-CTRL**
  (controller-qualified "target creature you control/an opponent controls gets +N/+N and gains KW").
  All anchored, all-or-nothing, un-grantable keywords (hexproof/indestructible) still route to the
  Arbiter. CREED-verified (Clyde spot-review + a 9-agent adversarial pass); KW-CYCLING + TRIG-MISC
  held out for a false-positive fix.

- **"Each opponent discards a card" trigger effect modeled (EACHOP-DISCARD):** non-targeted mass
  discard aimed at all opponents (Burglar Rat, Noxious Toad, Cackling Fiend, Liliana's Specter,
  Elderfang Disciple, Elvish Doomsayer, Virus Beetle, + more) is now a first-class effect atom
  (`who:"eachOpponent"`) in the parser and `applyDiscard`. Routes natively with no chosen target
  (parallel to "each opponent loses N life" / "each opponent mills N cards"). The existing "each
  **player** discards" (Delirium Skeins) is unaffected. **+15 cards**.

- **Artifact-ETB / Constellation triggers fire (PERM-ENTERS):** "Whenever an **artifact** you
  control enters, …" (Reckless Fireweaver, Salivating Gremlins, Thopter Architect, Contraband Kingpin)
  and "Whenever an **enchantment** you control enters, …" (Setessan Champion, Nexus Wardens, Favored
  of Iroas, Triton Waverider) are now modeled trigger events (`permanentEnters`). The "**Constellation
  —**" ability-word label is stripped so payoffs like Setessan Champion and Favored of Iroas detect
  cleanly; "**Eerie —**" compound events (enchantment-ETB *and* room-unlock) remain on the Arbiter.
  An Artifact Creature entering fires artifact-ETB watchers (type-line substring per CR 205.2). **+14
  cards**.

- **Enchantress / improvise cast triggers fire (CAST-FILTER):** "Whenever you cast an **enchantment** spell, …"
  and "…an **artifact** spell, …" are now modeled cast-trigger filters (joining instant/sorcery/creature/
  noncreature). The whole **enchantress** archetype plays — Argothian / Mesa / Verduran Enchantress, Satyr
  Enchanter, Enchantress's Presence, Sythis (draw on enchantment cast) — plus artifact-cast payoffs (Patchwork
  Automaton, Efficient Construction). **18 cards** for a two-line filter add. An Artifact/Enchantment Creature
  spell correctly counts (type-line substring); color/subtype/historic filters stay on the Arbiter.

- **Living weapon / For Mirrodin! equipment play (LIVING-WEAPON):** an Equipment with **Living weapon** (CR
  702.91) or **For Mirrodin!** (CR 702.157) now enters, **creates its token** (a 0/0 black Phyrexian Germ /
  a 2/2 red Rebel) and **attaches itself to it** — so it's a real creature from turn one (the +X/+Y is applied
  the same instant, so a 0/0 Germ never dies to the 0-toughness check). **14 cards** (Batterbone, Flayer Husk,
  Skinwing, Strandwalker, Mirran Bardiche, Vulshok Splitter…). A complex equipped-creature ability (Mortarpod's
  granted sacrifice) still stays on the Arbiter (CREED).

- **Blocker-qualifier evasion enforced (EVASION-QUALIFIER):** "can't be blocked by [qualifier]" restrictions
  on individual attackers now parse and enforce at the pair level in `canBlockAttacker`. Qualifiers supported:
  **color** (Dauthi Horror, Sootwalkers, Wandering Mind — can't be blocked by white/blue/…), **keyword**
  (Gnat Alley Creeper — flying; Zuo Ci — horsemanship), **power threshold** (Giltgrove Stalker — power 2 or
  less; Lydia Frye — power 3 or greater), **subtype** (Bog Rats — Walls; Rubblebelt Runner — creature tokens;
  dinosaur/human/saproling variants), and **token** identity. These clauses now count toward native-body
  classification in the coverage metric. Safety boundary: "more than one creature" (Charging Rhino) is
  set-level combat enforcement (like menace) and stays on the Arbiter; compound "A or B" qualifiers, team-grant
  forms ("creatures you control can't be blocked by…"), conditional clauses ("as long as / until"), and
  dynamic "greater power" (no integer anchor) are all excluded. **+30 cards**.

- **Landfall triggers fire (LANDFALL — foundation):** "Landfall — Whenever a land you control enters, &lt;payoff&gt;"
  is now a real engine event — playing a land fires it, and the clean payoffs resolve natively (Tatyova's
  gain-life + draw, Rampaging Baloths' Beast token, Jaddi Offshoot's lifegain, the Zendikar landfall family).
  **45 cards** flip corpus-wide. The "Landfall —" ability-word label is stripped identically in trigger
  detection and the coverage metric. Controller-scoped (your lands only). Payoffs the compiler doesn't yet
  model — landfall MANA (Lotus Cobra), copy-token (Scute Swarm), or a complex commander — stay on the Arbiter
  (CREED); 4 mana-landfall cards that master over-claimed as native (their landfall never fired) are corrected
  to Arbiter. The ramp/fetch land-entry path fires landfall in a follow-up slice (a missed trigger there is a
  safe under-fire).

## [0.46.0] - 2026-06-20

_The keyword-enforcement + first deck-playability wave. **Every interim-FP keyword is now honestly enforced** —
ward (targeting tax), protection (combat block/damage + targeting immunity), infect/wither/toxic (poison +
−1/−1 routing), fading/vanishing, shadow, cycling — plus **regeneration shields** (and removal-from-combat).
The **trunk statics** play live: enters-with-counters, taplands-enter-tapped (correct mana timing), count- and
control-gated self-buffs, graveyard threshold/delirium buffs. And the **real-deck push begins** — aristocrats
death-drains (the Blood Artist family), **Zaxara's X-spell commander** (X-creatures enter at real P/T and spawn
their Hydra tokens), multi-land ramp, "its controller" rider removal/counters, and typed-basic fetch. The
13-deck realism gate climbed ~49% → 51%._

- **Single-target drains play correctly (DEATH-DRAIN-TARGETED):** "Target player/opponent loses N life [and
  you gain N life]" now resolves natively across the whole drain family — spells (Sovereign's Bite, Soul Feast,
  Absorb Vis, Last Caress), enters triggers (Vampire Sovereign, Highway Robber, Bloodhunter Bat), death
  triggers (**Blood Artist**, Falkenrath Noble, Vengeful Bloodwitch), draw triggers (Queza), activated
  abilities (Bloodrite Invoker, Cackling Imp), and lands (Piranha Marsh). **34 cards.** Targeted life-loss is
  enemy-side like targeted damage — the AI always drains an opponent, never itself. Vihaan's realism gate
  **58% → 59%** (Blood Artist). A scaled drain ("loses life equal to …") stays on the Arbiter (CREED).

- **Aristocrats death-drains play correctly (DEATH-DRAIN):** "Whenever this creature or another creature
  [you control] dies, …" (Zulaport Cutthroat, Butcher of Malakir, Warteye Witch) now fires natively — that
  compound subject is the union { self } ∪ { other creatures [you control] } = exactly "a creature [you
  control] dies", so it resolves on the same path Bastion of Remembrance / Dictate of Erebos already use.
  Plus "each **other player** sacrifices a creature" ≡ "each opponent sacrifices" (Grave Pact's death-edict).
  Vihaan's realism gate (non-land native) **56% → 58%** (+2 of its drains). The TARGETED drain ("target player
  loses N life" — Blood Artist) and the "or planeswalker" union (Cruel Celebrant) stay on the Arbiter for a
  follow-up slice (CREED — never a partial fire).

- **Graveyard-gated buffs play correctly (GATED-GY — threshold & delirium):** "This creature gets +X/+Y
  [and has &lt;keyword&gt;] as long as there are seven or more cards in your graveyard" (**threshold** — Krosan
  Beast, Nimble Mongoose, Springing Tiger…) and "…four or more card types among cards in your graveyard"
  (**delirium** — Grim Flayer, Gnarlwood Dryad, Inquisitor's Ox, Dragon's Rage Channeler…) now resolve as a
  **live, layer-correct** buff/keyword that turns on and off as the graveyard fills — instead of being treated
  as a vanilla body. The flavor ability-word label ("Threshold —"/"Delirium —") is stripped; both clause orders
  parse. 25 cards. Delirium counts **card types only** (CR 205.2a — supertypes like Legendary/Snow don't count;
  kindred ≡ tribal). A typed count ("creature cards", "mana values among cards"), a rider ("and can't block",
  menace, a quoted triggered ability), or a non-grantable keyword stays on the Arbiter (CREED — no silent partial).

- **Conditional keyword grants play correctly (GATED-KEYWORD):** "This creature has &lt;keyword&gt; as long as
  you control a/another/N &lt;type&gt;" (Markov Crusader haste, Snapsail Glider flying, Pterodon Knight, Kargan
  Dragonrider…) now grants the keyword **live**, only while the gate holds — in both templating orders
  ("… has X as long as Y" and "As long as Y, … has X"). The same fix teaches the #301 P/T gate the leading-
  "as long as" order too. Only engine-enforced grantable keywords flip; a non-keyword rider, a color/compound
  gate, or a non-grantable keyword (menace) stays on the Arbiter.

- **Regeneration removes the creature from combat (REGEN fix, CR 701.15a):** a creature that regenerates in
  the first-strike combat-damage step is now correctly **removed from combat**, so it can't deal (or take)
  combat damage again in the regular step. Previously a regen-shielded attacker that survived a first-strike
  blocker would go on to deal its damage a second time — killing a blocker that should have lived and
  trampling the defender. (Completes the REGEN slice.)

- **Conditional self-buffs play correctly (GATED-SELFBUFF):** "This creature gets +X/+Y as long as you
  control a/another/N &lt;type&gt;" (Wild Nacatl, Loam Lion, Mire Kavu, Flinthoof Boar, Drover of the Mighty,
  Court Homunculus…) now resolves as a **live, layer-correct** fixed buff that turns on and off as the board
  changes — instead of being treated as a vanilla body. 24 cards. ("another &lt;type&gt;" excludes the creature
  itself; a color/compound/negated gate — "a blue creature", "no untapped lands" — stays on the Arbiter.)

- **Regeneration works (REGEN, CR 701.15):** "{cost}: Regenerate this creature" and "Regenerate target
  creature" (Troll Ascetic, Ranger en-Vec, Death Ward, Ghost Ship…) now set up a real regeneration shield —
  the next time the creature would be **destroyed** this turn (lethal combat damage, deathtouch, or a Destroy
  spell), it instead survives: damage cleared, tapped (CR 701.15a). **85 cards** play correctly. The shield
  does NOT save from 0-toughness, sacrifice, or exile (those aren't destruction), and a filtered/off-type or
  unmodeled-cost regen (discard-to-regenerate, "regenerate target artifact") stays on the Arbiter.

- **Creatures enter with their +1/+1 counters (TRUNK-ENTERSCOUNTERS, CR 614.1c + 122.6a):** "~ enters with N +1/+1
  counters on it" (Kavu Primarch, Baloth Gorger, Llanowar Elite, Academy Drake…) now adds those counters as
  the creature enters, so it has the **right power/toughness from the moment it hits the battlefield** — 94
  creatures that used to enter as their printed (too-small) body now play correctly. (Conditional/kicker/"for
  each" variants stay on the Arbiter — only the fixed, unconditional form is modeled.)

- **Taplands enter tapped (TRUNK-ENTERSTAPPED, CR 614.1c):** "~ enters tapped" (Temples, Triomes, karoos,
  bounce lands, tapped duals — and a few tapped artifacts/creatures like Moss Diamond) now actually enters
  the battlefield **tapped**, so it can't be tapped for mana the turn it's played. 579 cards now have correct
  mana timing — which the goldfish/cEDH sims depend on. (Check / fast / reveal / shock / creature-lands whose
  tap is *conditional* are left untapped — the gate isn't evaluated, the safe direction; they stay on the
  Arbiter.)

- **Count-scaled self-buffs play correctly (TRUNK-SELFBUFF):** "This creature gets +X/+Y for each
  &lt;permanent type&gt; you control" (Nim Lasher, Earth Servant…) now resolves as a live, layer-correct static
  bonus that tracks the board (the P/T updates as the count changes), instead of being treated as a vanilla
  body. Generalizes the layer engine's dynamic-P/T hook to data-driven board counts, and recognizes a
  creature's own name as a self-reference. (Foundational layer infra; flips a small single-line subset
  native today — the larger static-buff family is multi-line and stays gated until the other clauses model.)

- **Cracking a Treasure triggers your sacrifice payoffs (SAC-TREASURE, CR 701.21):** sacrificing a Treasure
  or Gold for mana now correctly fires "Whenever you sacrifice an artifact / a permanent" — so **Korvold**,
  **Mayhem Devil**, and **Pitiless Plunderer** finally pay off when you crack a Treasure, on every mana path
  (casting a spell, an explicit crack, or paying a generic cost). The Treasure-aristocrats archetype now
  plays faithfully. (Gameplay-faithfulness fix — those cards were already recognized; they just weren't
  firing on the mana-crack sacrifice.)

## [0.45.0] - 2026-06-19

**The trigger compiler picks up speed — a coverage wave of payoff hooks.** Four new event hooks light up on
the proven trigger-compiler pattern: drawing a card, drawing your second card, casting your second spell,
and sacrificing a permanent now all fire their payoffs natively — the engine behind draw-matters,
spellslinger, and aristocrats decks. Each enforces its condition exactly (right type, right count, right
player) and defers the tricky variants to the Arbiter. Suite ~2,790 green, lint clean; native coverage 17.5%.

- **"Whenever you sacrifice a …" triggers fire (TRIG-SACRIFICE, CR 701.21):** sacrificing a permanent now
  fires your sac-matters payoffs — **Gixian Infiltrator** and **Pirate Peddlers** grow, **Smothering
  Abomination** draws, **Havoc Jester** and **Ruthless Deathfang** punish. It enforces the sacrificed
  thing's type exactly: a "sacrifice a **creature**" trigger never fires when you sacrifice an artifact (and
  vice-versa), and "another" excludes the source itself. Fires from both the effect/edict sac and the
  sacrifice-as-a-cost path. ~7 cards flip to fully native; subtype subjects (Clue/Food/Treasure) stay on
  the Arbiter.

- **"Whenever you draw a card" triggers fire (TRIG-DRAW, CR 121.1/121.2):** the second trigger-compiler
  event hook, on the card-draw chokepoint. Drawing — your draw step, a cantrip, any spell — now fires your
  draw-matters payoffs: **Lorescale Coatl** and **Oneirophage** grow, **Psychic Corrosion** mills each
  opponent, **Horizon Chimera** gains you life. Cards are drawn one at a time (CR 121.2), so a "draw two"
  fires the trigger twice (two counters); a decked-out draw fires only for cards actually drawn. ~8 cards
  flip to fully native; "draw your second card each turn" and scaled variants stay on the Arbiter for now.
- **"Draw your second card each turn" triggers fire (TRIG-DRAW2, CR 121):** the draw-doubler payoffs now
  fire — **Loxodon Eavesdropper** and **Knights of Dol Amroth** grow, **Irencrag Pyromancer** and **Mad
  Ratter** pay you off for the second draw. It fires on the second draw of the turn only (not the first or
  third) and resets every turn — and faithfully counts off-turn draws (the per-turn draw counter now resets
  for every seat, not just the active player). ~15 cards flip to fully native.
- **"Cast your second spell each turn" triggers fire (TRIG-CAST2, CR 601):** the magecraft-second-spell
  payoffs now fire — **Jori En, Ruin Diver** and **Sunstar Lightsmith** draw, **Clarion Spirit** and
  **Thunder Drake** make tokens/grow when you cast your second spell of the turn. Fires on the second cast
  only, resets each turn, and counts off-turn instants faithfully (a new per-seat spell counter mirroring
  the draw counter). ~8 cards flip to fully native.

## [0.44.0] - 2026-06-19

**The entire Commander format now plays natively — and the trigger compiler opens.** Companions and
partners land on top of cast / return / 21-damage, completing the full command-zone lifecycle. Alongside
it, Shadow and Cycling join the enforced-keyword set and the general "trigger compiler" takes its first
slice (lifegain payoffs). Suite ~2,761 green, lint clean; native coverage 17.3%.

- **Companions play from outside the game (CR 702.139a):** a deck's companion now starts *outside the
  game* — revealed, but in no zone — and The Academy offers the once-per-game special action: **pay {3},
  at sorcery speed, to put it into your hand**, after which it's cast like any ordinary card. A companion
  is **not** your commander, so there's no commander tax. Decks imported from Moxfield carry their
  companion across (its own "Companion" section). This is the **last piece of the commander framework**:
  cast → command-zone return → 21-damage loss → partners → companions all now play natively.
- **Two-commander pods — partners, Backgrounds, Friends forever (CR 903.3):** both commanders seat in the
  command zone, each with its **own {2} cast tax** and its **own 21-combat-damage clock** (two partners
  aren't summed); either can be cast, and both return when they die. Partner support — huge in EDH — now
  plays natively.
- **"Whenever you gain life" triggers fire (TRIG-LIFEGAIN, CR 119.3):** the first slice of the general
  trigger compiler on a brand-new event hook. Gaining life — from a spell, an ability, or combat lifelink —
  now fires your lifegain payoffs natively: **Ajani's Pridemate** and friends grow, **Archangel of Thune**
  pumps the team, **Cliffhaven Vampire** / **Epicure of Blood** drain each opponent. ~16 cards flip to fully
  native; conditional ("the first time each turn") and rider-laden variants correctly stay on the Arbiter.
- **Shadow evasion enforced (EVADE-2, CR 702.28b):** a creature with shadow can block or be blocked by
  only creatures with shadow — the symmetric exclusion is enforced at the block-legality chokepoint, so the
  ~10 shadow creatures count honestly native.
- **Cycling from hand (KW-CYCLING, CR 702.29):** pay the cycling cost and discard the card to draw one —
  offered for ~46 cycling spells whose body is otherwise modeled. A card carrying a "when you cycle" trigger
  correctly stays on the Arbiter, so no trigger is ever silently dropped.

## [0.43.0] - 2026-06-19

**The commander rules are complete — and the coverage number is now honest.** Building on castable
commanders (v0.42.0), The Academy now handles the full command-zone lifecycle plus the multiplayer
loss rule, animated lands swing in combat, and the native-coverage metric was corrected downward to
stop over-claiming. Suite ~2,733 green, lint clean.

- **Commander lifecycle, end to end (CR 903.9 / 903.10a):** a commander that dies, is exiled, or is
  put into hand/library can be **returned to the command zone** instead — and **21 combat damage from a
  single commander** now makes that player lose, tracked **per commander** (so two partner commanders
  count separately). With the v0.42.0 cast-from-command-zone + {2} tax, the heart of multiplayer
  Commander now plays correctly. _(Engine-verified via the test suite; a live commander-game dogfood is
  still recommended.)_
- **Man-lands attack and block (WALT-ANIMATE PR2+PR3):** "this land becomes a 3/3 creature until end of
  turn" (Treetop Village, Faerie Conclave, Mishra's Factory, the Restless cycle…) now resolves through
  the layer system — correct color, subtypes, added card types (artifact creature), granted keywords,
  P/T — and the animated land counts as a creature everywhere the engine checks (combat, edict math, AI
  blocker counts). Exotic riders (changeling, infect, "can't be blocked") route to the Arbiter.
- **Honest coverage metric (FIX-MANA-OVERCLAIM):** the native-mana tier is now all-or-nothing like every
  other tier — a mana source with an unmodeled trigger or level structure (Mana Crypt's coin-flip,
  Sorcerer Class's levels) no longer counts as fully modeled. This is an internal metric correction (no
  user-facing behavior change); it lowers the reported native-coverage headline to its true value.

## [0.42.0] - 2026-06-19

**Commanders are castable.** The headline: The Academy can now cast your commander from the command
zone, with the escalating commander tax — the heart of the format finally works. Plus a wave of
count-scaling and mass-effect coverage. Suite ~2,691 green, lint clean.

- **Cast your commander (CR 903.3 / 903.8):** cast from the command zone for its printed cost, with the
  **{2}-per-prior-cast tax** that grows each time (counted even if the cast is later countered).
  Commander designation rides the card across zones; a *copy* of a commander isn't a commander. The AI
  casts its commander too. _(Engine-verified via the test suite; a live commander-game dogfood is
  recommended.)_
- **Count-scaling effects, fuller:** "damage / draw / gain life / make a token **for each** X you
  control" — now across controller-permanents, basic-land and tribal/typed subtypes (Goblins, Elves…),
  and a target player's hand (Sudden Impact). Opponent-permanent counts and exotic sources stay on the
  Arbiter.
- **Mass non-creature destruction:** "destroy all artifacts / enchantments / lands" board wipes resolve
  natively (and a central targeting-helper fix hardens symmetric burn).
- **More removal/utility:** symmetric burn ("deals N to each creature and each player"), tuck (put a
  permanent on top/bottom of its owner's library).
- **Foundation:** a layer-aware creature framework so animated permanents (man-lands) attack/block/die
  as creatures (no cards flipped yet — groundwork).

## [0.41.0] - 2026-06-18

**The trigger-effect compiler and count-scaling coverage wave.** Building on v0.40.0's enforcement work,
this release teaches the engine a batch of trigger and count-derived effects natively — the
highest-leverage frontier of the coverage climb. Native corpus coverage ~17.5% → **17.7%**; suite ~2,651
green, lint clean. The Arbiter remains the fail-safe for anything not modeled.

- **Trigger-effect compiler — new events fire natively:** "whenever this/a creature you control deals
  combat damage to a player" (e.g. Treasure makers), prowess (a noncreature-cast self-pump), and
  "whenever this creature attacks/dies, put a +1/+1 counter on it."
- **Count-scaling effects:** "deals damage equal to the number of X you control," "draw a card / gain N
  life for each X," and "create a token for each X" (Avenger of Zendikar class) now resolve natively —
  the count is read from your board at resolution, controller-scoped, with opponent-scoped and exotic
  counts safely left to the Arbiter.
- **Ability-carrying tokens:** tokens with mana abilities (sac-for-mana) play correctly.
- **Enforcement completed:** prowess is the last of the previously display-only keywords to become a
  real, enforced rule — 9 of 11 now play by the rules (only ward's tax and protection's full subsystem
  remain on the Arbiter, by design).

## [0.40.0] - 2026-06-18

**The planeswalker subsystem completes, and "enforce, don't drop" lands.** This release finishes
planeswalkers in The Academy and turns a wave of long-standing display-only keywords into real,
enforced rules — coverage rises by *building the enforcement*, not by claiming it.

- **Planeswalkers, complete (PW-1 → PW-8):** play end-to-end with a real loyalty system; **static +
  triggered emblem ultimates** fire (#251, #254); planeswalkers are **killable by burn/removal** —
  damage removes loyalty, destroy/exile works (#253).
- **Combat evasion is enforced (EVADE, #258):** a **menace** creature now needs two blockers, an
  **unblockable** creature truly can't be blocked, a **Wall (defender) can't attack**, and
  basic-landwalk / skulk / fear / intimidate / horsemanship are honored — via one layer-aware
  `canBlock` chokepoint. ~140 creatures play correctly that previously didn't.
- **Targeting restrictions enforced (KW-UNTARGET, #260):** **hexproof** (untargetable by opponents)
  and **shroud** (untargetable by anyone) now block illegal targets.
- **Ability-carrying tokens (#259):** tokens with mana abilities (e.g. sac-for-mana) work, and a
  fake-mana-source false positive is fixed.
- **Honest coverage:** the keyword over-claims are now enforced rather than faked; native corpus
  coverage stands at **~17.5%** with the Arbiter as the fail-safe for anything not modeled. Suite
  ~2,619 green, lint clean.

## [0.39.0] - 2026-06-18

**Planeswalkers come to The Academy**, alongside the largest single wave of spell/ability coverage
yet — the parallel-coverage push lifting native corpus coverage from ~16.1% to **17.0%**. Suite
~2,533 green, lint clean. The Arbiter remains the fail-safe for anything not modeled natively
(false-negative-safe by design — nothing is ever faked or silently dropped).

### Added
- **Planeswalkers are now playable** (full subsystem, PW-1 through PW-4). A walker enters with its
  starting loyalty, ticks up/down (one ability per turn, sorcery speed, can't pay below 0), can be
  attacked directly (combat damage removes loyalty counters), and dies at 0 — **184 planeswalkers
  play end-to-end**. Modeled loyalty abilities resolve natively; anything not yet modeled is
  adjudicated by the Arbiter *at activation* (the loyalty cost is still paid — never fabricated). The
  AI pilots its walkers (activates a beneficial ability each turn; swings a clean attack to remove a
  dangerous enemy walker), and a beginner-mode teaching layer pre-empts the common loyalty
  misconceptions (once-per-turn, sorcery speed, summoning-sick walkers can still activate, direct
  attacks, no redirect).
- **Land ramp** (RAMP-1) — "search your library for a basic land, put it onto the battlefield" now
  plays natively across spells, enters-the-battlefield triggers, dies-triggers, and activated
  abilities (Rampant Growth, Farhaven Elf, Sakura-Tribe Elder, Wayfarer's Bauble, Solemn Simulacrum).
- **Soft counterspells** (SOFT-CNT) — "counter unless its controller pays {N}" (Mana Leak, Force
  Spike, Censor); in multiplayer the targeted opponent gets the pay-or-be-countered choice.
- **Looting** (LOOT-1) — self-discard and "draw N, then discard M" (Faithless Looting, Careful Study).
- **Investigate** (KWACT-INVEST) — the keyword action mints real Clue tokens (Thraben Inspector,
  Deduce, Confirm Suspicions).
- **Divide damage / distribute counters among any number of targets** (MT-1) — Rolling Thunder,
  Pyrotechnics, Hail of Arrows.
- A broad wave of further coverage: each-player draw / discard / life-loss / mill (EP-2, EP-3),
  edicts (ED-2), team +1/+1 and −1/−1 counter distribution, named artifact tokens (Treasure / Clue /
  Food / Gold + X-count creature tokens), keyword creature tokens, self keyword-grant abilities
  (ACT-KW-GRANT), vacuous cast-keyword stripping (KWSTRIP-1), graveyard-recursion filters (REG-1),
  impulse/reveal dig (DIG-1), Fog effects (FOG-1), and pay-life / discard / sacrifice additional cast
  costs (ADDCOST).
- **Trigger-effect compiler pilot** (TRIG-PUMP-1) — "whenever this attacks, it gets +N/+N" compiles to
  a native program, proving the path for the corpus's largest coverage lever.

### Fixed
- **CREED hardening** — ~93 trigger-tier false positives (compound/restricted subjects, self-block
  triggers, over-broad conditions) routed back to the Arbiter so nothing plays incorrectly; reminder
  text is stripped before the mana / native-coverage checks (no phantom mana sources).

## [0.38.0] - 2026-06-18

The Academy opens its **δ (subsystem) phase** — two new interactive mechanics that play out at
resolution with a real in-game picker, built on the same pending-choice engine as tutoring and scry.
The Arbiter remains the fail-safe for anything the engine doesn't model natively. Suite ~2,170 green,
lint clean; corpus native coverage ~16.1%.

### Added
- **Hand disruption now plays in The Academy** (Duress, Thoughtseize, Inquisition of Kozilek, Coercion,
  Despise, Divest, Harsh Scrutiny, and friends). You target an opponent, *their* hand is revealed, and
  you choose a card for them to discard — and it's faithful in a 4-player pod: you commit to one
  opponent first and only ever see *that* hand (no peeking at everyone's hand at once). The AI plays its
  discard too, taking your most expensive card. (#208, #209)
- **Impulse-dig** (Anticipate, Strategic Planning, Impulse, Commune with Evil, Shimmer of Possibility,
  Ransack the Lab, Glimpse the Future). "Look at the top N cards of your library, keep one, the rest go
  to the bottom or your graveyard" — a real pick-one picker shows the cards; the AI keeps the best. (#210)

### Notes
- Variants outside the exact modeled templates (a hand-disruption spell that *exiles* the card, an
  optional "you may" branch, a 3-way dig split like Telling Time, a filtered/multi-pick dig) continue to
  route to the Arbiter rather than risk a wrong resolution.

## [0.37.0] - 2026-06-18

Academy native-coverage batch. Each item shipped as its own slice behind the full
gate: a REAL-parser sweep over the whole card corpus (0 false-positives), a 3-lens
adversarial review on Opus, and live real-enrichment QA in a running game. The
Arbiter remains the fail-safe for any text the engine doesn't model natively. The
clean single-atom frontier is now exhausted — corpus-wide native coverage stands at
~16% (5,377 / 33,540 real cards), up from ~14.8% at the start of this batch. Suite
~2,115 green, lint clean.

### Added
- **Indestructible now works** (CR 702.12). "Destroy" and lethal combat damage no
  longer remove an indestructible permanent in The Academy, closing a class of
  false-positive removals. (#194)
- **Enemy/own-aware trigger targeting.** A trigger that must choose a target now picks
  an *enemy* permanent for a harmful effect and *your own* for a beneficial one,
  instead of mis-targeting or over-routing to the Arbiter — plus a "you may" wrapper so
  optional triggers are handled correctly. (#198, #199)
- **Activated-ability costs.** Pay-life, sacrifice-this, sacrifice-a(nother)-creature,
  exile-this, and remove-a-counter are now understood as activation costs. (#201, #202, #203)
- **Creature-target restrictions.** "Destroy target nonblack / non-Angel / attacking
  creature" now respects the restriction when offering legal targets. (#204)
- **Compound permanent-type targets.** "Destroy / exile target artifact or enchantment"
  style union targets resolve natively. (#205)
- **Bounce a permanent.** "Return target permanent to its owner's hand" for non-creature
  permanents. (#206)
- **Reanimation.** "Return target creature card from your graveyard to the battlefield" —
  the card enters as a permanent and fires its enter-the-battlefield triggers. (#207)

### Changed
- Corpus-wide native coverage (`npm run coverage`, ~33,540 real cards) is now the headline
  metric, replacing the small per-deck sample as the primary signal. (#195, #197)
- Vacuous "this spell can't be countered" riders are stripped so the rest of the spell
  still resolves natively instead of routing the whole card to the Arbiter. (#200)

## [0.36.0] - 2026-06-17

### Added
- **Artifact / enchantment / land destruction now works in The Academy.** *"Destroy target
  artifact"* (Shatter), *"Destroy target artifact or enchantment"* (Disenchant / Naturalize),
  *"Destroy target enchantment"* (Demystify), *"Destroy target land"* (Stone Rain), *"Destroy
  target permanent"* (Vindicate), and the *exile* versions (*Utter End*, *Anguished Unmaking*) now
  let you pick a legal target and remove it — including modal cards whose other half was already
  modeled (*Abrade*). ~55 removal spells play natively. For now this is a card you *cast* (where
  you choose the target); a creature whose ability *triggers* one of these is still handed to the
  Arbiter, so it can never auto-destroy your own permanent.
- **Mill now works in The Academy.** *"Mill three cards"* / *"Each opponent mills two cards"* —
  on a spell, an enters/dies/attacks trigger, or an activated ability — now puts the top cards of
  the right library into the graveyard. ~24 clean mill cards play natively (graveyard/dredge
  staples). A *"target player mills"* spell is still handed to the Arbiter for now.
- **More "do X, then Y" cards now work in The Academy.** The parser now reads a *", then"*
  sequence as two steps, so cantrips like *Preordain* (*"Scry 2, then draw a card"*), *Foresee*,
  and *Read the Bones* resolve their scry/surveil **and** their draw — your scry actually decides
  what you draw. (Improves any *"X, then Y"* card, not just these.)
- **Scry and surveil now work in The Academy.** Cast *"Scry 2"* / *"Surveil 1"* — or trigger one
  from a creature, an activated ability, or a *"Scry 1, draw a card"* cantrip (*Opt*, *Serum
  Visions*) — and a panel opens showing the top cards of your library: keep the ones you want on
  top (reorder them with ▲▼) and send the rest to the bottom (scry) or your graveyard (surveil).
  Then the spell finishes — so a *"scry, then draw"* actually lets your scry decide what you draw.
  ~260 cards now resolve their scry/surveil natively. (The opponent AI keeps everything on top for
  now; you get the real choice.)
- **"Whenever a creature you control / an opponent controls enters or dies" triggers now work in
  The Academy.** Aristocrats and lifegain-matters staples — *Corpse Knight*, *Malakir Cullblade*,
  *The Meathook Massacre*, *Liliana, Dreadhorde General*, *Purphoros, God of the Forge*, *Healer
  of the Pride* — now fire on **exactly the right creatures**: a *"you control"* trigger only on
  your own, an *"an opponent controls"* trigger only on your opponents'. ~60 more permanents play
  their enter/dies trigger natively. (A condition we still can't check precisely — *"a creature
  **with flying** dies"* — is left for the Arbiter rather than firing on the wrong creatures.)
- **Firebreathing and self-pumps now work in The Academy.** A creature whose own ability pumps
  *itself* — *"{R}: This creature gets +1/+0 until end of turn"* (firebreathing), *"Whenever this
  creature attacks, it gets +2/+0"*, or *"…put a +1/+1 counter on this creature"* — now actually
  grows when you activate it or when the trigger fires (and the +1/+1 counters stick around).
  This is one of the most common ability shapes in Magic, so it quietly lights up hundreds of
  creatures: roughly **390** firebreathers and self-growing creatures now resolve their own
  ability natively instead of pausing for a ruling. (The opponent AI doesn't activate these yet —
  you do.)
- **Clones now work in The Academy.** Cast *Clone* or *Mirror Image* (*"You may have this
  creature enter as a copy of any creature on the battlefield"*) and a picker opens: choose
  which creature on the table to copy, and your clone enters with that creature's power,
  toughness, abilities, and keywords — and its *"when this enters"* trigger even fires, because
  your clone *is* that creature as it arrives. Decline (or copy nothing available) and it
  enters as a 0/0 and dies. When it later leaves the battlefield it goes to the graveyard as
  the original card again, per the rules. Clones with an *"except …"* twist (*Spark Double*,
  *Phyrexian Metamorph*), copies of a specific creature type, or copies of non-creatures are
  still handed to the Arbiter — the foundation is in, and those build on it next.
- **Graveyard recursion now works in The Academy.** Cast *"Return target creature card from
  your graveyard to your hand"* (*Raise Dead*, *Disentomb*, *Wildwood Rebirth*) or the
  any-card *"Return target card from your graveyard to your hand"* (*Regrowth*, *Recollect*,
  *Elven Cache*) and pick one of your own graveyard cards to take back to hand — including as
  one mode of a charm (*Darigaaz's Charm*, *Evolution Charm*) or alongside a draw (*Recover*).
  Only your *own* graveyard is offered, tokens aren't (they're not cards), and the creature
  version lists only creature cards. A version that returns *up to two* cards, a different
  filter (*instant/sorcery*, *artifact*), one from *any* graveyard, or one to the
  *battlefield* (reanimation) is handed to the Arbiter rather than guessing. ~11 common
  recursion spells now play natively.

### Fixed
- **Triggers with a follow-up sentence no longer half-resolve.** A trigger whose effect spanned two
  sentences — *"each opponent loses 2 life. You gain 2 life and draw a card."* (Shroudstomper),
  *"create a 0/0 token. Put a +1/+1 counter on it."* (Recon Craft Theta), *"mill a card. If a land
  was milled this way, you gain 2 life."* (Loafing Giant) — used to fire only the *first* sentence
  and silently drop the rest. Recon Craft Theta even left a 0/0 token that immediately died. The
  Academy now reads a trigger's whole single-line effect: if every part is modeled it resolves in
  full (Shroudstomper drains, gains, **and** draws); if any part isn't, the whole trigger is handed
  to the Arbiter rather than doing half of it. Verified against the full card corpus — zero triggers
  fire a partial effect. (This protects every trigger effect, not just mill.)

## [0.35.0] - 2026-06-16

### Fixed
- **Granted keywords now actually work in combat.** A creature given *vigilance* by an
  Aura, Equipment, or anthem now stays untapped when it attacks (it was tapping anyway,
  because the attack step read the printed card instead of the live keyword); a mana
  creature granted *haste* can now tap for mana the turn it arrives. *Menace*, which the
  engine doesn't yet enforce, is no longer offered as a grantable keyword — an Aura/Equipment
  whose only trick is granting menace is handed to the Arbiter rather than silently doing
  nothing. (Found by the Aura review.)
- **Creatures are no longer secretly 0/0 in The Academy.** The bundled slim card index
  dropped each card's power/toughness (plus colors, loyalty, and produced-mana), so every
  creature loaded into a learn-game enriched to 0/0 — combat dealt no damage and pumps/auras
  built off a 0/0 base. The index now carries those fields, so creatures play at their
  printed stats. (Surfaced by live real-card verification of the new Aura mechanic.)

### Added
- **Team pumps now work in The Academy.** Cast *"Creatures you control get +N/+N until end
  of turn"* (*Inspired Charge*, *Charge*, *Glorious Charge*) or the Overrun-style *"…get
  +N/+N and gain trample until end of turn"* (*Overrun*, *Overcome*, *For the Emperor!*) and
  every creature **you** control gets the boost — and the granted keyword — at once, while
  your opponents' creatures stay untouched. The set is locked when the spell resolves (a
  creature you play afterward doesn't get the buff), and it wears off at end of turn. Modal
  cards whose other mode was already understood (*Fortify*, *Engineered Might*, *Goblin
  Surprise*) now play natively too. A *filtered* team pump ("**other** creatures you
  control", "**white** creatures you control", "creatures you control **with flying**") or
  one that grants an unenforced keyword is handed to the Arbiter rather than buffing the
  wrong creatures. ~29 common team pumps now play natively.
- **Combat tricks now work in The Academy.** Cast a pump that also grants a keyword —
  *"Target creature gets +2/+2 and gains trample until end of turn"*, *"…gains flying"*,
  *"…gains first strike and lifelink"* — or a pure keyword trick (*"Target creature gains
  haste until end of turn"*), and the creature gets the boost **and** the keyword through the
  layer engine, so it actually flies / tramples / strikes first in combat that turn (and the
  effect wears off at end of turn). Only keywords the engine truly enforces can be granted; a
  trick that grants *hexproof*, *indestructible*, *menace*, or *protection* (which aren't
  enforced yet) is handed to the Arbiter rather than faking it. ~70 common combat tricks now
  play natively.
- **Board wipes now work in The Academy.** Cast *"Destroy all creatures"* (*Day of
  Judgment*, *Wrath of God* / *Damnation* — the *"can't be regenerated"* clause is handled),
  *"Exile all creatures"*, or *"All creatures get -X/-X until end of turn"* (*Infest*,
  *Languish*) and every creature on every battlefield is hit at once — destroyed, exiled, or
  shrunk (with the ones that drop to 0 toughness dying). A *filtered* wipe ("…with flying",
  "…you don't control", "all non-Dragon creatures") or a variable one (*Toxic Deluge*) is
  handed to the Arbiter rather than wiping the wrong set. The opponent AI holds symmetric
  wipes for now (it won't nuke its own board). 14 common board wipes now play natively.
- **Auras now work in The Academy.** Cast an Aura that says *"Enchant creature"* with a
  *"Enchanted creature gets +X/+Y"* and/or *"has [keyword]"* bonus — *Unholy Strength*,
  *Flight*, *Rancor*-style buffs, or a debuff like *Weakness* / *Dead Weight* on an
  opponent's creature — and it enters attached to the creature you target, granting the
  bonus through the same layer engine Equipment uses. When the enchanted creature leaves
  the battlefield the Aura goes to the graveyard (it doesn't linger like Equipment). An
  Aura whose bonus we can't fully model (a triggered ability, a non-creature enchant, an
  unmodeled rider) is handed to the Arbiter rather than entering as a do-nothing permanent.
  The opponent AI holds its Auras for now (you cast them). ~50 common Auras now play
  natively.
- **Equipment now works in The Academy.** An Equipment with *"Equip {cost}"* and a
  *"Equipped creature gets +X/+Y"* and/or *"has [keyword]"* bonus can now be equipped:
  on your main phase, pay the equip cost, pick one of your creatures, and it gains the
  bonus — bigger, or with flying / trample / deathtouch / lifelink / vigilance / first
  strike / etc. The bonus follows the equipment (move it to another creature, and it
  leaves the first); it falls off the instant the equipment or the creature leaves the
  battlefield. Equipment whose bonus we can't fully model (a protection/hexproof grant,
  an unmodeled rider, a "whenever equipped creature …" trigger) is left for the Arbiter
  rather than partially applied. The opponent AI doesn't equip yet (you do). ~66 common
  equipment now play natively.
- **Tutors now open a real library picker in The Academy.** When you cast a *"Search
  your library for a … card, put it into your hand, then shuffle"* — including an
  *unfiltered* *Demonic Tutor* — the game pauses and shows you a card-browser side-sheet:
  your matching library cards with their real art, click one (or "Find nothing"), and it
  goes to your hand and your library is shuffled. Works as a spell (*Demonic Tutor*,
  *Fabricate*, *Idyllic Tutor*, *Eladamri's Call*), an enters-the-battlefield ability
  (*Trophy Mage*), or an activated ability (*Captain Sisay*). On Expert, and for your
  opponents, the engine auto-picks a sensible card with no panel (and an opponent's pick
  stays hidden from you). The library shuffle is fully deterministic, so saving and
  resuming a game mid-search reproduces exactly. Tutors that put a card onto the
  battlefield (*Rampant Growth*), a creature-type tribal tutor, or a multi-card search
  still route to the Arbiter for now.
- **Counterspells now work in The Academy (Frontier B begins).** Cast a *"Counter
  target spell"* in response to a spell on the stack and it actually counters it — the
  target spell is removed from the stack and put into its owner's graveyard without
  resolving. The three common shapes are modeled: *Counterspell* (any spell), *Negate*
  (noncreature), and *Essence Scatter* (creature), plus counters that ride a second
  modeled effect (*Dismiss* counter-and-draw, *Absorb* counter-and-gain-life,
  *Summoner's Bane* counter-and-make-a-token, *Suffocating Blast* counter-and-burn, and
  *Dromar's Charm*'s modal counter). A tax or conditional counter (*Mana Leak*'s
  *"unless its controller pays {3}"*, *Cryptic Command*'s "choose two", filters we don't
  model like *"artifact or enchantment spell"*) still routes to the Arbiter rather than
  firing wrong. The opponent AI holds its counterspells for now (it never counters its
  own spell). Corpus-wide this makes 17 instant/sorcery counters play natively.

### Added
- **Creatures with simple enter/dies/attack value abilities now resolve in The Academy.**
  A *"When this creature enters, draw a card"*, *"…create a 1/1 token"*, *"…each opponent
  loses 2 life"*, or *"Whenever this attacks, you gain 1 life"* now fires and resolves in-game
  instead of pausing for a manual ruling. (Targeted versions and the rest below build on this.)
- **Creatures with targeted enter/attack/dies abilities now resolve in The Academy.**
  An ability like *"When this creature enters, destroy target creature an opponent
  controls"* or *"Whenever this attacks, it deals 2 damage to any target"* used to pause
  the game for a manual ruling. The engine now picks a legal target as the ability goes
  on the stack and resolves it in-game — and, per the rules, correctly removes the
  ability when there's no legal target to choose. Restricted targets are honoured (a
  *"...an opponent controls"* removal only ever hits an opponent's creature).
- **You can now use activated abilities in The Academy.** Permanents with a
  *"{cost}: do something"* ability — a `{T}` pinger, a tapper, a `{2}, {T}: Draw a card`,
  a token-maker, a pump — now offer that ability as a play on your main phase. It pays
  the cost (tapping the permanent and auto-paying the mana), goes on the stack, and
  resolves through the same engine your spells use. Abilities whose cost the engine
  can't model yet (sacrifice, pay-life, {X}) are simply not offered rather than played
  wrong; mana abilities still tap the normal way.
- **More lords and anthems work in The Academy.** Static buffs like *"Other creatures you
  control get +1/+1"* (the classic lord), *"All creatures have haste"*, and combined buffs
  like *"…get +1/+1 and have vigilance"* now actually change the board — your team gets
  bigger and gains the keywords, applied through the rules layer system so combat and the
  AI see the real numbers. (Tribal lords and "creatures you control" anthems already
  worked; this fills in the common shapes they were missing.) Level-up and Class cards,
  whose buffs only apply at the right level, are correctly left alone.
- **"Whenever you cast a spell" triggers now fire in The Academy.** Spellslinger payoffs
  like *"Whenever you cast an instant or sorcery spell, this deals 1 damage to each
  opponent"* (or a creature/noncreature spell, or *"whenever an opponent casts a spell"*)
  now trigger when a spell is cast — the trigger goes on the stack above your spell and
  resolves first. Effects we don't model yet (like *"unless they pay {4}"*) still route to
  the Arbiter rather than firing wrong, and a trigger with an unmodeled restriction
  (*"…a spell that targets a creature"*) is left for a manual ruling.

### Fixed
- Mobile bottom tab bar now shows its icons, and several controls picked up accessibility
  labels for screen readers. Internal dead-code cleanup.

## [0.33.0] - 2026-06-07

### Changed
- **The Academy opponent now plays to win.** The AI used to develop a board but
  rarely close, so games drifted to a turn-limit stalemate. It now follows a
  "competent racer" policy: it takes free damage when you're open, holds back
  creatures that would die for nothing (no dumb trades — and it now respects
  first-strike blockers), and recognizes and commits a lethal alpha strike. It
  attacks to actually end the game while protecting its own board. This also
  upgrades the "recommended move" hint you see at Beginner/Intermediate.

### Added
- **Game over, rulings, and errors now stay on the board instead of kicking you
  to a text screen.** When a game ends, the result appears as a scrim *over* the
  final board, with a "Review board" peek to inspect the end state and a "New
  game" button. A draw or turn-limit stalemate is now correctly labelled
  "Draw." / "Stalemate." (previously every non-win mislabelled as "You lost.").
  When a spell needs the Arbiter mid-game, the ruling slides in as a
  non-blocking side-sheet — the board stays visible and you keep playing.
- **Manual mana, for learning.** Your mana pool now shows on the board, and in
  Beginner (or via the "Manual mana" toggle) you can click your lands to tap
  them for mana and watch the pool fill before you cast. Dual lands ask which
  colour. Casting still auto-pays whatever you don't tap yourself, so it never
  gets in the way.

## [0.32.0] - 2026-06-07

### Added
- **More cards play natively in The Academy.** The engine now models a new family of
  effects directly instead of handing them to the Arbiter: **gain/lose life** ("you gain
  3 life", "each opponent loses 2 life"), **tap / untap target creature**, **bounce**
  (return target creature to its owner's hand), **exile target creature**, **+1/+1 and
  −1/−1 counters**, and **token creation** (go-wide tokens like Raise the Alarm, Hordeling
  Outburst, Captain's Call). Crucially, this unlocks dozens of common multi-clause spells
  whose second half used to stall the whole card — Lightning Helix (damage **+ gain
  life**), Night's Whisper (draw **+ lose life**), Moment of Craving (−2/−2 **+ gain
  life**), and the like — which now resolve end-to-end.

### Verified
- Adversarial corpus review: ran the real effect parser over all 7,595 bundled
  instants/sorceries. Every one of the 73 newly-recognized cards decomposes into
  faithfully-modeled steps — no card silently drops part of its text, and a
  targeting restriction (e.g. "destroy target **tapped** creature") is still enforced
  even when a life-gain rider is what made the card recognizable. Anything outside the
  modeled shapes (keyword-granting tokens, multicolor tokens, conditional riders) stays
  routed to the Arbiter rather than guessed at.

## [0.31.0] - 2026-06-07

### Added
- **The Academy is now a clickable board, not a text list.** Instead of reading your
  options as a numbered list, you see the actual game: your hand fanned at the bottom
  (toggle it up/down), the battlefield in the center with **real Magic cards** (full
  frames, art, P/T, tapped sideways, token stacks), your life / commander / commander-tax
  / library-graveyard-exile piles on the left, and your opponents on the right. Click a
  playable card to play it, click a target to aim a spell, click any card to enlarge it,
  and a single **context-aware button** always tells you the next move ("Pass → next
  phase", "Let it resolve", "End turn"). Click an opponent to spotlight *their* board in
  the center and inspect it like your own. (Built for Commander 4P; works in 1v1 too.)

### Fixed
- The commander no longer also appears in your library (it was being added twice).


### Added
- **X-spells work in The Academy.** Spells whose cost includes `{X}` — Blaze, Fireball-style
  burn, Mind Spring, Untamed Might (+X/+X) — now resolve natively. When you cast one, you pick
  X from the values your available mana can actually pay for, the cost auto-taps for the fixed
  cost plus X, and the spell deals/draws/pumps exactly X. Modal X-spells (Invoke the Firemind)
  and "deals X damage to each creature" (Savage Twister) work too. An adversarial pass over the
  whole card corpus confirmed zero spells resolve the *wrong* amount; anything with an unmodeled
  rider still hands off to the Arbiter rather than guessing.

## [0.29.0] - 2026-06-06

### Fixed
- **The Academy now plays with real cards.** Decks were reaching the game engine
  blank — no mana cost, no card type, no rules text — so every spell was castable
  for free on turn one, nothing was recognized as a creature or land, and none of
  the spell effects ever fired. Cards are now filled in from the local card index
  before a game starts, so mana actually gates what you can cast, lands and
  creatures are recognized, and the whole effect/combat/mana engine (everything
  built in v0.22–v0.28) finally comes alive in a real game. (Found by playing the
  game, not by a test — the unit tests build full cards directly.)

### Added
- **Multi-effect and "choose one" spells work in The Academy.** Spells that do more
  than one thing now resolve natively: "deal 2 damage to target creature, then draw
  a card", pump-and-draw cantrips (Defiant Strike), multi-target buffs (Agony Warp,
  Bounty of Might), and "Choose one —" modal spells (you get one choice per mode,
  each targeting legally). Each clause targets independently — clause one can hit a
  creature while clause two draws. Anything with a clause the engine can't model
  (a counter, lifegain, an exile — coming in later slices) still hands the whole
  spell to the Arbiter rather than half-resolving it.

### Changed
- The spell parser graduated from a single-effect matcher to a real multi-atom
  parser (Phase-2 P2.5). An adversarial pass over all 7,595 real instants/sorceries
  caught and fixed eight ways the parser could have confidently done the *wrong*
  thing (qualified mass damage like "each creature without flying", "another target",
  tiered/bulleted spells, delayed draws, "creature or planeswalker" wrongly allowing
  a player target, …) — each pinned in the test corpus so it can't come back.

## [0.28.0] - 2026-06-06

### Added
- **Removal targets correctly in The Academy.** Spells that restrict their target —
  "destroy target creature an opponent controls", "destroy target tapped creature",
  "destroy target creature with power 2 or less" — now resolve natively and only
  offer the creatures they can legally hit, so you can't aim a one-sided removal at
  your own board and the AI plays them correctly. Restrictions the engine doesn't
  model yet (color, type, "attacking", keyword) still route to the Arbiter for a ruling.

## [0.27.0] - 2026-06-06

### Added
- **Pump and "-X/-X" spells work in The Academy.** "+X/+X until end of turn"
  combat tricks (Giant Growth and friends) now actually buff the targeted
  creature — through the real layers engine, so the bonus counts in combat and
  wears off at end of turn — and "-X/-X" removal (Disfigure, Last Gasp, …)
  correctly kills a creature whose toughness it drops to 0.

### Changed
- **The Academy's spell engine is now a general effect interpreter** (Phase 2 of
  the engine rebuild). Instants and sorceries resolve through an ordered,
  serializable program of "atoms" instead of a hard-coded handful of effects.
  Today's burn / removal / draw behave exactly as before — the difference is that
  the parser is deliberately conservative ("incomplete but never wrong"): it only
  resolves a spell natively when it cleanly matches a modeled pattern, and routes
  anything with a rider, a restriction (e.g. "target tapped creature"), a second
  clause ("…and you gain 3 life"), or any text it can't fully model to the Arbiter
  for a ruling (the v0.26.0 seam) instead of silently resolving the wrong thing.

## [0.26.0] - 2026-06-06

### Added
- **No more silent no-ops — the Academy asks the judge.** When you cast a spell
  the simulator can't fully model yet, it used to quietly do *nothing* and never
  tell you. Now it pauses, hands the card to the Arbiter (the local, Ollama-only
  rules engine) for a verified ruling, and shows it to you as a teaching moment —
  read the ruling, apply it on your board, then continue. This is the permanent
  fail-safe the rest of Phase 2 builds on: the engine is allowed to be incomplete,
  but it's never silently wrong.
  - Beginner/Intermediate pause on *your own* unmodeled spell (a teaching moment);
    Expert autopilot and an opponent's unmodeled spell don't block — they're shown
    in the "Recent actions" feed so you're always told, never left guessing.
  - Mid-game save/resume carries the pause across a restart, so you don't lose the
    ruling if you close the app.

### Changed
- First slice of **Phase 2 (Depth)** of the engine rebuild
  (`docs/phase7-engine-rebuild.md` §4) — growing how much of a real game the
  simulator resolves natively, with the Arbiter absorbing the long tail.

## [0.25.0] - 2026-06-06

### Added
- **Anthems, tribal lords, and granted keywords in The Academy.** The simulator
  now has a real continuous-effects engine (Magic's "layers", CR 613), so static
  abilities actually change the board:
  - **Anthems** ("Creatures you control get +1/+1", "White creatures you control
    get +1/+1") buff your team's power and toughness.
  - **Tribal lords** ("Other Slivers you control get +1/+1") buff their kind and
    correctly skip themselves — your Sliver decks finally play like Slivers.
  - **Granted keywords** ("Creatures you control have flying", a Sliver granting
    flying to your other Slivers) now count in combat: a granted flyer can't be
    chump-blocked by a ground creature, granted deathtouch/first strike/trample
    resolve, and granted haste lets a creature attack the turn it arrives.
  - **Until-end-of-turn pump** wears off at the cleanup step, the way it should.
  - The opponent AI now evaluates the *buffed* board (not printed stats), so it
    no longer misjudges combat against an anthem.

### Changed
- **Engine internals: a CR 613 layer engine is now the single source of truth for
  power/toughness/keywords.** Effective stats are derived by applying every
  continuous effect (counters, anthems, lords, Omnath, pump) in proper layer
  order. The change is behavior-preserving for boards without such effects
  (proven by an exhaustive equivalence test before the switch). Part of the
  Phase 7 engine rebuild (`docs/phase7-engine-rebuild.md`) — this completes the
  Phase-1 Foundation.

## [0.24.0] - 2026-06-06

### Added
- **Triggered abilities in The Academy.** Cards that say "when/whenever/at…" now
  actually do their thing while you play:
  - **Enters-the-battlefield** triggers (e.g. "When this creature enters, draw a
    card"; Soul-Warden-style "whenever another creature enters, gain 1 life").
  - **Dies** triggers (e.g. "when this dies…"; Blood-Artist-style "whenever a
    creature dies, each opponent loses 1 life") — firing off combat deaths,
    burn, and removal alike.
  - **Upkeep / draw / end-step** triggers ("at the beginning of your upkeep,
    draw a card"), correctly gated to your own turn.
  - **Attack** triggers ("whenever this attacks…").
  - The simulator reads the card's actual oracle text; anything it isn't sure how
    to resolve is handed to the Arbiter rather than guessed. Part of the Phase 7
    engine rebuild (`docs/phase7-engine-rebuild.md`).

### Changed
- Triggered abilities are placed on the stack in proper APNAP order (active
  player first) across all seats, including the 4-player Commander pod.

## [0.23.0] - 2026-06-06

### Added
- **Save and resume a game in The Academy.** Games now autosave as you play, so
  you can close the app mid-game, reopen it, and pick up exactly where you left
  off. The start screen shows a "Continue a game" list (deck, format, turn,
  difficulty) with Resume and Delete. Saves are per-profile and survive a
  restart. This is the first piece of the Phase 7 engine rebuild — see
  `docs/phase7-engine-rebuild.md`.

### Changed
- **Engine internals: the stack is now fully serializable.** Under the hood the
  rules engine stopped storing live functions on the stack and switched to a
  data-driven resolver registry (`{ resolver, params }`). This is what makes
  save/resume possible and is the foundation the upcoming triggered-abilities and
  CR 613 layers systems build on. Permanent/stack ids are now deterministic
  (`state.idSeq`), so a restored game is byte-identical to the original.

### Fixed
- Corrected a stale Comprehensive Rules citation in the learn engine (commander
  damage is CR 903.10a / 704.6c, not the non-existent 903.14a).

## [0.22.0] - 2026-06-05

### Added
- **The Academy is actually playable now.** The learn-to-play simulator used to
  stall before a real game could start — it would spin until a safety cap and
  show "engine got stuck." The whole play loop is now wired together:
  - **Mana works.** Lands, mana rocks (Sol Ring, Signets…), and mana dorks tap
    for mana, so spells finally get cast. Beginner mode teaches tapping; higher
    difficulties auto-tap to pay.
  - **Floating mana.** You can tap for more mana than you spend and hold it.
    [[Omnath, Locus of Mana]] grows +1/+1 for each unspent green and keeps its
    green between phases — so a board floated full of green swings for it.
  - **Combat happens.** Attackers tap (vigilance excepted), the AI actually
    attacks and blocks, and damage resolves — creatures trade and players lose
    life until someone wins.
  - **Games end.** Wins, losses, eliminations, and a turn-limit draw instead of
    a scary error. Plays end-to-end in both 1v1 and 4-player Commander at
    Beginner / Intermediate / Expert.
- **Combat keywords.** Combat now plays like real Magic: **flying / reach**
  (a flyer can only be blocked by flying or reach), **first strike** and
  **double strike** (resolved in their own damage step), **trample** (excess
  spills to the defender), **deathtouch** (any damage is lethal), and
  **lifelink** (gain life equal to damage dealt). Evasion and trample let
  games actually close instead of stalemating.
- **Spells that do things.** Instants and sorceries used to fizzle to nothing;
  now the common ones work — **burn** ("deals N damage to any target"),
  **removal** ("destroy target creature"), and **card draw** — with proper
  targeting (you pick the target; the AI aims removal at the biggest threat
  and never at its own creatures). Unrecognized spells still resolve safely as
  a no-op rather than guessing.

### Fixed
- **"Engine got stuck: safety cap (1000 ticks) hit."** Root cause: nothing ever
  produced mana, so no spell was castable, the user was never prompted, and the
  engine auto-piloted empty turns until the cap. Fixed by building the mana,
  combat-orchestration, and termination layers the simulator was missing.
- **Card art loading is more robust.** The local art proxy now times out a slow
  upstream, caps the response size, and rejects non-image responses — so a flaky
  CDN can't hang a card image or cache a junk file. Failures fall back to the
  card-name placeholder as before.
- **The profiles migration self-heals.** If the one-time migration couldn't
  delete the old combined deck file (a transient Windows file lock), it now
  retries on later launches. The leftover was always inert — the app only reads
  the per-profile copies — this just tidies it up.

## [0.21.0] - 2026-06-04

### Added
- **Local multi-user profiles.** Decks, the Vault collection, chats, games, and
  agent notes are now scoped per profile, so more than one person can share a
  single install without mixing libraries. Pick or switch profiles from the
  header; your existing data is migrated automatically (decks are split by owner
  into their own profiles on first launch, and ownerless data stays with the
  primary profile). Fully local — no accounts, no passwords, no servers.

### Changed
- Renamed the internal `/api/engine` route to `/api/rules-retrieval` to match its
  job and disambiguate it from `/api/symbolic-engine` (no user-visible change).
- Project structure cleanup: the four Vault sub-tabs now share a `Vault*` name,
  the deck-domain modules are grouped under `lib/deck/`, and server-only code
  moved into `lib/server/`. Internal only — no behavior change.

### Fixed
- **Multi-user data isolation.** The support bundle, the Tibalt collection-roast
  log, and the first-launch import now read/write the *active* profile instead of
  a shared global location, and new decks are attributed to the current profile
  rather than always "Colton".
- The 20-second anti-flake test timeout now actually applies — a duplicate Vitest
  config had been silently shadowing it, so CI was running on the 5s default.
- Trimmed the bundled rules codex: a roadmap doc was being shipped into the `.exe`
  and indexed as rule-retrieval noise; it no longer is.

## [0.20.0] - 2026-06-02

### Changed
- **Aether visual redesign.** The whole app moves from the warm "Obsidian & Gold"
  serif theme to **Aether** — near-black Material surfaces, an electric-cyan hero
  accent, frosted-glass panels, and a new type system (Playfair Display headings,
  Inter body, JetBrains Mono for data labels and numbers). Fonts are bundled
  locally via `next/font`, so the app still runs fully offline. The **deck view**
  was rebuilt into a glass-panel dashboard (ribbon header, stat cards, and an
  art-bleed decklist) with all functionality preserved; every other screen — chat,
  the Vault, Settings, the Academy, onboarding — was re-skinned to match. Agent
  accents were retuned (Jace cyan, Karn steel, Tibalt red, Arbiter gold) and the
  sidebar's section icons are now crisp inline SVGs.

## [0.19.0] - 2026-06-02

### Added
- **Data freshness warnings.** The header now flags when your **card data** or the
  **Comprehensive Rules** have gone stale (alongside the existing combos/salt
  chips), and every freshness chip is now a one-click shortcut into Data &
  Updates to refresh it.
- **"Jace is reasoning…" while you wait.** When you send a message, the local
  model's first-token lag now reads as the agent *thinking* — a "{agent} is
  reasoning…" state shows until the first words arrive, instead of a silent
  spinner that looks frozen.
- **Rules-grounded trust badge.** Jace's rules answers now wear a small badge:
  green **"✓ Rules-grounded · N CR citations"** when the Arbiter engine verified
  the answer against the local Comprehensive Rules, or amber **"⚠ Unverified"**
  when it couldn't (with the existing detail note + the Arbiter trace right
  below). Makes the never-fabricate grounding visible at a glance.

## [0.18.0] - 2026-06-02

### Security
- **Content-Security-Policy is now enforced.** The app window previously ran with
  no CSP. It now restricts content to the app itself — no external scripts,
  network connections, plugins, or framing — while still allowing the local card-art
  proxy and the model providers. Hardens the desktop window against injected
  external content. (Also sets `X-Content-Type-Options` and `Referrer-Policy`.)

### Added
- **Guided first-run setup.** The first time you open MTG Tool, a short welcome
  wizard walks you through it: pick how to run the AI (private local model via
  Ollama, or the cloud API right now), set up the model (or skip and use the API
  while it downloads), and get a deck in (restore a previous install or import
  from a URL). Replaces the scattered first-launch + Ollama banners with one
  flow, and you can skip any step.
- **Karn's suggested adds show what you already own.** Each "Add" chip on Karn's
  suggestions is now tagged from your collection — **owned** (and how many of your
  decks already use it) or **wishlist** — so you can see at a glance which upgrades
  are free from cards you have on hand. Local, no API cost.
- **Collection import has update modes + a change preview.** When you import a
  Deckbox/Moxfield CSV you now choose how it applies: **Merge** (add quantities),
  **Add only** (never touch existing counts), **Replace** (set to the file's
  quantity), or **Reconcile** (make your collection match the file — also removes
  owned cards not in it). A preview shows exactly what will be added, changed, and
  removed before you commit, and reconcile's removals are spelled out in red.

## [0.17.0] - 2026-06-01

### Added
- **Feature maturity labels.** Features that are still rough now wear a small
  badge so you know what to expect: **Preview** on The Academy (learn-to-play),
  **Beta** on Pod Balance and the Garfield goldfish. Stable features are
  unlabeled.
- **Always-visible deck context in chat.** Every chat now shows whether a deck is
  bound to it: the existing "🔒 Locked to …" banner, or a new **"○ No deck locked"**
  chip when it isn't — with a one-click way to start a new chat that locks your
  loaded deck (or a pointer to load one). No more guessing what context an agent
  is using.
- **Chat now via the API while Ollama sets up.** When Ollama is installing or a
  model is downloading, the setup banner now says so and offers a **"Chat now via
  API"** button — so you can start using the app immediately instead of waiting on
  a multi-GB download, then switch back to Local when it's ready.
- **Deck version history.** The deck view's Snapshots section is now **Version
  History**: every saved version captures the full deck (not just a summary), so
  you can **restore the deck to any saved version** — not only undo a Karn edit.
  Name a version when you save it ("after game night") and **rename** any version
  later; each still shows what you've added and cut since. All local.
- **Compare any two deck versions.** A **Compare** panel in Version History diffs
  any saved version against another (or against the current deck), quantity-aware:
  cards added, cards removed, and quantity changes (e.g. "Forest 1→3") — not the
  paired add/remove a string compare would show. Local, instant.

### Fixed
- **"Prep Arbiter Question" no longer opens an empty box.** Triggering it from the
  deck view while another agent (e.g. Karn) was active switched you to Jace but
  dropped the pre-filled rules question; the prompt now survives the switch.

## [0.16.0] - 2026-06-01

### Added
- **Settings screen.** A new **⚙ Settings** button in the header opens one place
  for everything that used to be scattered: the **AI model tier** (Fast / Deep /
  API) with plain-English notes on what each does, a **Display** summary, a
  **Privacy** section spelling out exactly what does and doesn't leave your
  machine (and how to export or delete your data), a launcher into **Data &
  Updates**, and an **About & Legal** section with the version, the
  source-available license, and the Unofficial Fan Content notice.
- **Build From Vault.** A new **Build** tab in the Vault lists the legendary
  commanders you already own, ranked by how many of your cards are legal in each
  one's colors — a quick read on what you could build right now. Pick one and it
  opens a fresh Karn chat, ready to build a deck around it from your collection.
  All local, from your collection joined with the bundled card index.
- **Karn builds from your Vault.** When Karn analyzes a deck he now sees how many
  of its cards you already own and the in-color upgrade pool sitting in your
  collection, so his suggested adds prefer cards you can apply at no cost — pairs
  with one-click Apply. Bounded + local.

## [0.15.0] - 2026-06-01

### Added
- **Cost-to-finish in the deck view.** Each deck now shows how much of it you own
  from your collection and what it'd cost to finish (e.g. "own 87/99 · $24 to
  finish"), updating live as you apply Karn's adds.
- **Deal radar.** The Finance tab now surfaces owned/grail cards sitting near a
  recent low (and meaningfully down from their window high) — buy-the-dip
  candidates among the cards you actually care about. Local, from your price
  history; fills in as history accrues.
- **Karn applies edits.** When Karn suggests cuts and adds, each one now has a
  one-click **Apply** chip right in the chat — it edits the locked deck for you
  and **takes a snapshot first**, so any change is one click from undo. The deck
  view's Deck Snapshots now has a **Restore** button to roll back an applied
  change losslessly.

## [0.14.0] - 2026-06-01

### Added
- **Set Browser.** A new **Sets** tab in the Vault lists every set (newest first,
  searchable) with how many of its cards you own; open a set to see every
  printing as a value list — owned cards flagged (and "other printing" when you
  own a different version), sortable by value / collector number / owned, each
  price linking to Scryfall. All local from the printings index.

### Changed
- **"Worth getting" now shows cards actually worth getting.** The Finance
  staples suggestions are filtered to $50+ and sorted by value (richest first),
  so the list is chase cards you don't own — no more a $1 Sol Ring at the top.

### Added
- **Updates panel: two more syncable sources.** The data-sync list now includes
  **Card Kingdom fallback prices** and the **collection printings index** (the
  Vault's card data), each individually refreshable or via "Refresh all." Every
  sync writes permanently to your data files and refreshes the in-memory caches
  so it takes effect immediately.

### Fixed
- **Chat no longer yanks you to the bottom while reading.** The message view only
  auto-follows a streaming reply if you're already near the bottom — scroll up to
  read earlier text and it stays put.
- **Agents keep working when you leave the chat.** The response keeps streaming in
  the background while you browse the Vault or other views, and the active agent
  now shows a "thinking" pulse in the sidebar so you can see it's still going.

### Changed
- **Tibalt reveals his roast all at once.** Instead of slow token-by-token text,
  Tibalt shows a progress bar while he works, then drops the finished roast in one
  shot (local models can take a while; the half-written version landed worse).
- **Grails are $50+ only.** The "+ Grail" button now appears only for cards worth
  at least $50 — no more being offered a 50-cent "grail."

### Added
- **Bulk edit in the Vault.** A new **Select** mode lets you pick multiple cards
  (or "Select all" the filtered view) and then **assign a color tag** or
  **remove** them all at once, instead of one card at a time.
- **Collection value over time.** The Stats tab now charts your collection's
  value across the daily price snapshots (your current holdings valued at each
  past day's prices), alongside the existing 30/90/365-day deltas. Fills in as
  history accrues.
- **Collection stats dashboard.** A new **Stats** tab in the Vault breaks your
  collection down by card type, color identity, rarity, and mana curve, with
  your top sets and most-valuable cards. All local — type/color come from the
  bundled card index, value from stored prices. (Rarity appears once the
  printings index is rebuilt to carry it.)

## [0.13.0] - 2026-05-31

### Added
- **Price alerts.** Set a target price on any card in the detail drawer —
  "notify when it drops to ≤ $X" (a buy signal) or "rises to ≥ $X" (a
  sell/spike signal). The daily price snapshot flags an alert when the card
  crosses your target, and the Vault's Finance tab shows a "🔔 N hit" badge plus
  the full alert list. Re-arms automatically, so a price that dips, recovers,
  then dips again fires again. All local — no API cost.
- **Per-card price sparklines.** The card detail drawer shows a small price-trend
  line (first → latest) for any card with at least two days of local price
  history. Built from data the app already collects — no API cost. (Fills in as
  history accrues, like the Finance movers.)

## [0.12.0] - 2026-05-31

### Added
- **Deck Report in the deck view.** A new **Deck Report** section (next to
  Recommendations) generates one complete, local report for the active deck —
  power level + WotC bracket, role counts, Commander legality + color-identity
  check, in-deck and one-card-away combos, EDHREC salt, and cost-to-finish from
  your collection — plus a copy-paste **Rule 0 card** for the table. Toggle
  between the full report and the Rule 0 pitch, and copy either to the
  clipboard. Runs entirely off local data — no API cost.
- **Export your collection to CSV** from the Vault — a Deckbox-style sheet of
  your owned cards that re-imports cleanly into MTG Tool, Deckbox, or Moxfield.
- **Back up & restore all your data** from the Updates panel — export everything
  (decks, chats, collection, grails, games) to one JSON file and restore it on
  another machine. A safety backup of your current data is saved before a restore
  overwrites anything.
- **Copy support info** (Updates panel) — a redacted diagnostics summary for bug
  reports (version, OS, data freshness, content counts) with no secrets and no
  deck/chat content.
- **Export a deck's shopping list** from the Vault's Decks panel — the cards
  you're still missing as a paste-ready Moxfield / Archidekt decklist.

## [0.11.0] - 2026-05-31

### Fixed
- **Your chats keep their state across a restart.** The deck-gate "Chat without
  a deck" choice, plus each answer's retry button and its grounding / Arbiter
  metadata, were silently dropped when chats were saved — so they vanished on
  the next launch (Karn and Tibalt would re-prompt for a deck every time). They
  now persist.
- **Streaming answers can't hang forever.** Local (Ollama) and API (Anthropic)
  streamed responses now have an idle timeout that covers the whole response,
  not just the initial connection — a stalled model surfaces a clear error you
  can retry instead of a frozen "…".
- **In-app data syncs take effect immediately.** After a sync from the Updates
  panel, the app now drops its stale in-memory caches, so refreshed cards,
  combos, salt scores, prices, and rules are used right away without restarting.

### Added
- **Price history accrues on app launch**, not only when you open the Vault — so
  the Finance tab's movers and "finance plays" fill in reliably even if you
  rarely open your collection.

### Security
- **A mistyped model provider can no longer spend API credits.** Provider
  selection is now a strict allowlist that defaults to the local model; only the
  explicit API tier reaches Anthropic.
- **Hardened feedback-bundle import** against a path-traversal attempt hidden in
  a malicious bundle's timestamp.

## [0.10.0] - 2026-05-31

### Added
- **MTG Finance in the Vault.** The Vault has a new **Finance** tab — a local,
  MTGStocks-style price watch built entirely from the app's own daily price
  snapshots (no external finance API, no cost):
  - **Your collection** — total value with 30 / 90 / 365-day change, plus your
    cards' biggest price risers and fallers.
  - **Finance plays** — the biggest movers across everything the app tracks.
  - **Worth getting** — EDHREC staples (across all of Commander, not just your
    colors) you don't own, and combo pieces you're one card away from, each with
    its current price; one click adds any of them to your Grails.
  - **Grails** — a personal price watchlist: search any card to track it, and
    the app charts its price movement over time.
  Movement starts empty on a fresh install and fills in over the first week or
  two as daily snapshots accrue — there's no free way to back-fill historical
  prices, and the UI says so rather than faking it. The daily snapshot now also
  records your grails and the top ~200 staples so their movers build up too.

## [0.9.0] - 2026-05-30

### Added
- **Combos tab in the right panel.** Pick any deck and the new **Combos** tab
  shows the Commander Spellbook combos already in it *and* the ones you're a
  single card away from — with the missing piece called out. Runs entirely off
  your local Spellbook snapshot (no network calls).
- **Color-identity guardrail in the Legal tab.** Alongside the ban check, the
  Legal tab now flags any card whose color identity falls outside your
  commander's — the cards that are illegal in the deck even though they're
  Commander-legal — and tells you which colors are off.
- **"Buildable only" filter in the Vault's Decks panel.** A toggle (plus a
  running "X of Y decks buildable now" count) hides everything except the decks
  you can build end-to-end from cards you already own.
- **Deck snapshots.** A new section in the deck view lets you snapshot a deck on
  demand; each saved snapshot shows exactly what you've added and cut since you
  took it ("+4 / −3 since"), so you can track how a deck drifts over time.
- **Pod Balance.** A new sidebar tool (Library → Pod Balance) compares up to four
  saved decks side by side: each deck's official WotC **bracket (1–5)**, power
  level, CRISPI axes, and the **Game Changers** it runs (the official 53-card
  list, detected from the bundled Commander Spellbook data) — plus a one-line
  verdict on whether the table is balanced or lopsided. Select a single deck to
  use it as a quick bracket + Game Changers readout. All local, no API cost.
- **Recommendations (local, free) in the deck view.** A new section gives
  instant, deterministic add/cut guidance without spending a model call: the
  roles your deck is short on (ramp / draw / removal / wipes / protection)
  filled with color-identity-legal staples ranked by play rate, the combos
  you're one card away from completing, and weak- or salty-card cut candidates.
  Hover any suggestion to preview the card. Karn's Upgrade Plan still does the
  deep, deck-specific reasoning; this is the fast first pass.

### Fixed
- **Card popularity is back in the local card index.** The slim Oracle index was
  dropping each card's `edhrec_rank`, so play-rate never factored into local
  card search or the deck power/impact scoring (both were written to use it).
  Restoring it makes search surface real staples first and tightens the power
  ranker's impact model — which also resolved a long-standing calibration drift.
- **Karn and Tibalt no longer answer with no deck.** Starting a chat with the
  deck-builder (Karn) or roaster (Tibalt) when no deck was loaded let them reply
  from generic card-search context — recommending cuts of cards that aren't in
  any of your decks. Those two agents now require a deck before the first
  message: a pop-out forces you to pick a saved deck, import one, or explicitly
  choose "Chat without a deck" (build-from-scratch). Jace is unaffected — it
  still answers general rules questions with no deck loaded.
- **The Vault grid no longer logs a console error on load.** The collection
  card was a button that contained the +/- quantity steppers (also buttons),
  which a browser can't nest — React flagged it as a hydration error. The card
  is now a regular clickable element with keyboard support (Enter / Space),
  steppers still adjust quantity without opening the card, and the console is
  clean.

## [0.8.0] - 2026-05-30

### Added
- **The Vault tells you what it costs to finish your decks.** A new **Decks**
  panel lists every saved deck with how much of it you already own and the
  cheapest price to complete it — planned (partly-owned) decks sort to the top.
  Expand a deck for the shopping list of cards you're short, cheapest first;
  **Add** opens the card picker pre-filled so you choose the printing you bought
  and it counts as owned. Basic lands are free; sideboards are ignored.
- **Learn-to-Play is now its own section: The Academy.** It moved out of the
  agent list into its own sidebar area (Train → The Academy), a home for both
  Standard 1v1 and Commander 4P training.
- **Ask Jace, in real time, mid-game.** A floating tutor pop-out in any Academy
  game: ask "what can I play?", "is it safe to attack?", "what does this step
  do?" and Jace answers grounded in the actual board — your hand, everyone's
  life and board, the current step. Runs on the local model (no API credits).

- **No more nil card values in the Vault.** When TCGPlayer (via Scryfall) has no
  market price for a printing — which happens when it lacks recent sales even
  though copies are listed — the value now falls back to **Card Kingdom's actual
  retail price** for that exact printing (matched by scryfall_id, synced + cached
  locally like the rest of the data). CardSphere and Star City Games were
  evaluated but render prices in JavaScript with no public API, so they can't be
  read from a desktop app; Card Kingdom's bulk pricelist covers the gap.
- **"↻ Prices" button in the Vault** re-pulls live Scryfall prices for any cards
  whose stored price is still null, in case TCGPlayer computed a market price
  since the last sync. Bounded, throttled, user-triggered.

## [0.7.0] - 2026-05-30

### Added
- **Play Learn-to-Play as a 4-player Commander game.** The Learn-to-Play setup
  has a format picker — Standard 1v1 or **Commander 4P** (you plus three AI
  opponents). The game screen now shows a table strip across the top: every seat's
  life, hand / board / graveyard counts, commander damage, and whose turn it is.
  When you attack in Commander, each option says which opponent it targets
  (e.g. "Attack → AI 2").

## [0.6.0] - 2026-05-30

### Added
- **Learn-to-Play combat now resolves.** In Garfield's Learn-to-Play mode, the
  combat-damage step is no longer a no-op: creatures deal and take damage,
  lethally-damaged creatures die, and unblocked attackers reduce the defending
  player's life. Multi-defender groundwork landed too (Commander attackers can
  target any opponent, the AI picks a sensible target, and the trap warnings
  account for every opponent's possible swing-back). _Simplified for now: no
  first strike, trample, or deathtouch._

## [0.5.0] - 2026-05-30

### Added
- **Import a deck from a Moxfield or Archidekt URL.** Open Import Deck, paste a deck link,
  and hit Fetch — the deck is pulled, every card resolved against your local data, and a
  preview shows the name, card count, commander, and any cards not found in your snapshot.
  Save to library and it's yours. (One user-triggered fetch, stored locally — same posture
  as the data syncs. Pasted decklists and project loads still work as before.)

## [0.4.0] - 2026-05-30

### Added
- **The Vault — pick the exact printing and finish you own.** Adding a card lists every
  printing as a row — **full set name · set code · collector number · price** — newest
  first, each with a button per available treatment: **Normal**, **Foil**, and special
  foils named from the card data (Surge, Galaxy, Confetti, Oil Slick, Ripple, Step-and-
  Compleat, Halo, Gilded, Textured, and more). The printings index is now built from the
  full Scryfall `default_cards` set, so art-reuse reprints (e.g. the Commander Masters
  Sliver Hivelord that shares M15 art) are selectable too — not just one printing per
  artwork. Only treatments that exist on real paper cards are shown (digital-only MTGO /
  Arena printings are excluded).
- **Quantity steppers everywhere.** Every owned card has a `− N +` control on the grid
  and per-stack steppers in the detail drawer. Dropping the last copy removes the card
  (delete-at-zero). Owned value and counts track the quantity live.
- **Color tags that act.** Tag cards with custom color labels whose behavior reflects
  onto the card: *Have* marks it owned, *Getting* / *Considering* move it to the wishlist
  (kept out of owned value), and *Swap* feeds the card to Karn so he suggests
  replacements. The drawer shows what each tag will do before you apply it; tagged cards
  get a color stripe on the grid.

### Changed
- Consolidated the two root rules-knowledge dirs under one `knowledge/` folder
  (`knowledge/mtg-engine` + `knowledge/mtg-judge`), removing the space from the old
  `MTG ENGINE/` path. Internal layout only — no change to app behavior.

### Removed
- Two citation-audit QA reports (`cite_audit*.md`) that had been leaking "rule not
  found" rows into rules retrieval, plus 6 unused local data-build scripts.

## [0.3.0] - 2026-05-29

### Added
- Source-available `LICENSE`, plus `CONTRIBUTING.md`, `ARCHITECTURE.md`, `SECURITY.md`,
  `.gitattributes`, and this changelog.
- First tests for the `spellbook` and `edhrecSalt` modules, and a POST-with-rules test
  for `/api/engine`.
- **Midnight Codex** visual theme (indigo-black base, copper accent) across the whole
  app, plus a real-card-art blend on the chat view: the active commander's art backs the
  window behind frosted-glass panels, a commander portrait crowns the right panel, and
  inline card-art plates render on `[[card]]` mentions.
- `/api/art-crop` accepts `?name=` to resolve card art by name via the bundled printings
  index (disk-cached, offline-safe after first view).

### Changed
- README rewritten for outside readers (the desktop `.exe` build path is now
  documented; stale version/count facts removed).
- Repo root decluttered — 19 AI session-handoff docs moved to `docs/archive/`.
- Licensing reconciled to source-available (was contradictory across docs).
- Agent accent colors are now distinct identities: Jace blue, Karn silver, Tibalt deep
  red, Arbiter copper.
- All card art (backdrop, portrait, plates) routes through the local `/api/art-crop`
  proxy — no direct Scryfall CDN calls at runtime, honoring the local-first mandate.

### Fixed
- `/api/engine` returned 500 on POST rules queries (an undefined `TOOL_ROOT`).
- `spellbook` / `edhrecSalt` ignored `MTG_REFERENCE_DIR` and the writable AppData
  override in the packaged `.exe` (they used raw `__dirname`); now resolved through
  `paths.js`.

## Earlier

The project shipped its first phases — knowledge layer, Ollama integration, agent
rewiring, session-manager UI, and the archetype-aware Garfield goldfish — followed by
the Tauri desktop shell with signed auto-update, a card-collection feature, and in-app
data sync. See the git history and GitHub Releases for details.
