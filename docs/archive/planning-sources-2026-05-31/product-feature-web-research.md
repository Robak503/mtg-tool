# MTG Tool Feature Research From Public Tool Requests

Research date: 2026-05-31

Scope: review public web resources where MTG players ask for, compare, or praise features in deck builders, collection managers, scanners, playtesters, life trackers, and Commander analysis tools. This report maps those requests to feature ideas that make sense for MTG Tool.

No code or build work was performed for this research pass.

## Executive Summary

The strongest opportunity is not to copy every MTG app. MTG Tool's advantage is local-first AI plus deck, collection, rules, and play history in one desktop workspace. The feature asks that best fit this tool cluster around six themes:

1. Collection-aware deckbuilding: users want to brew from the cards they actually own, with exact printings, binders, deck allocation, and missing-card shopping lists.
2. Safer deck editing: undo/history, versioning, diffs, refresh-from-source, and one-click rollback are repeatedly requested.
3. Better organization: subcategories, saved filters, folders/tags, custom formats/banlists, and role-based deck sections.
4. Playtest and game-history intelligence: players want playtesting, real-game stats, win rates, matchups, commander damage/counters, and "what cards underperformed?" insights.
5. Search and recommendation usability: Scryfall/EDHREC/Spellbook-style power is valuable, but users need it wrapped in simpler filters, natural language, and deck-aware suggestions.
6. Import/export and sync: players move between Moxfield, Archidekt, ManaBox, Delver Lens, TCGplayer, Deckstats, spreadsheets, and CSV. Friction here is a constant pain.

Recommended next product additions:

1. Deck Report + Action Plan
2. Collection-aware deck builder and "build from owned cards"
3. Deck version history, undo, and diff
4. Missing-card shopping list export
5. Collection export/import/update/merge
6. Binder/location and card allocation system
7. Advanced search builder with saved filters
8. Role/subcategory deck organization
9. Real-game tracker and playgroup stats
10. Academy/Goldfish replay and post-game analysis

## Sources Reviewed

This review used more than 30 sources across feature-voting boards, product docs, app listings, Reddit discussions, and official Commander/MTG data resources.

1. Archidekt Feature Voting: https://archidekt.com/features/
2. Moxfield feedback: deck undo/history request: https://moxfield.nolt.io/1479
3. Moxfield feature wiki mirror: https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features
4. Reddit: advanced collection search while deckbuilding on Moxfield: https://www.reddit.com/r/Moxfield/comments/vf9a95/advance_search_in_collection_while_deck_building/
5. Reddit: Moxfield collection features and owned-card visibility: https://www.reddit.com/r/Moxfield/comments/1dlqpit/is_there_a_good_article_or_video_somewhere_that/
6. Reddit: Moxfield binder/deck mass assignment pain: https://www.reddit.com/r/Moxfield/comments/1s445wo/collection_binders_deckpack_mass_assign/
7. Reddit: unused collection cards not already in Commander decks: https://www.reddit.com/r/magicTCG/comments/11aut08/does_moxfield_have_a_way_to_know_which_cards_in/
8. Reddit: Moxfield collection update/sync workflow: https://www.reddit.com/r/Moxfield/comments/1rtxhly/update_collection/
9. Deckstats proxy feature request: https://deckstats.net/forum/index.php?topic=65657.0
10. Deckstats proxy/signed card release: https://deckstats.net/forum/index.php?topic=66276.0
11. Deckstats visual deckbuilder release: https://deckstats.net/forum/index.php?topic=63394.0
12. Deckstats token detection release: https://deckstats.net/forum/index.php?topic=66649.0
13. Deckstats collection "actively used" request: https://deckstats.net/forum/index.php?topic=69920.0
14. ManaBox homepage: https://manabox.app/
15. ManaBox collection guide: https://manabox.app/guides/collection/getting-started/
16. ManaBox collection FAQ: https://www.manabox.app/guides/collection/faq/
17. ManaBox decks-in-collection guide: https://manabox.app/guides/decks/collection-decks/
18. ManaBox scanner guide: https://manabox.app/guides/scanner/getting-started/
19. Dragon Shield MTG Scanner app listing: https://apps.apple.com/us/app/mtg-scanner-dragon-shield/id1460657155
20. Dragon Shield Card Manager feature update: https://about.dragonshield.com/gaming-inspiration/new-features-now-available-on-card-manager/
21. Delver Lens homepage/docs: https://www.delverlab.com/
22. Reddit: scanner app with wishlist: https://www.reddit.com/r/magicTCG/comments/vz3z8m/scanner_app_with_wishlist/
23. Reddit: scanner/export/data-loss concerns: https://www.reddit.com/r/mtgfinance/comments/1esc3p3/delver_lens_crashed_and_lost_all_my_data_for_the/
24. Reddit: TCGplayer scanner collection export/import pain: https://www.reddit.com/r/mtgfinance/comments/hsx2nt/
25. Eldwyn app: https://eldwyn.app/
26. Dragon Counter: https://dragoncounter.com/
27. Lifetap: https://getlifetap.com/
28. Gauntlet app: https://gauntletapp.com/
29. Playgroup.gg Live: https://playgroup.gg/playgroup-live
30. Playgroup.gg FAQ: https://playgroup.gg/faqs
31. Reddit: Playgroup.gg user asks for guest/manual tracking: https://www.reddit.com/r/EDH/comments/1dl5goq/does_anyone_use_playgroupgg/
32. Reddit: Playgroup.gg device sync and Rule 0 matchup screen: https://www.reddit.com/r/EDH/comments/1m0o493/our_life_tracker_app_now_syncs_across_devices/
33. Reddit: EDH stat tracker spreadsheet pain: https://www.reddit.com/r/magicTCG/comments/f20c5o/making_a_stat_tracker_for_my_edh_playgroup_using/
34. EDHREC Archidekt guide/playtester section: https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site
35. Reddit: Moxfield vs Archidekt deck category comparison: https://www.reddit.com/r/EDH/comments/1e4dpd4/moxfield_v_archidekt/
36. Reddit: Archidekt/Moxfield workflow comparison: https://www.reddit.com/r/EDH/comments/16wcj6f/building_your_edh_decks_with_archidekt_or_moxfield/
37. Reddit: Deckstats-style side-by-side builder preference: https://www.reddit.com/r/EDH/comments/1s1uzl3/deckbuilding_sites_and_how_you_deck_build/
38. EDHREC digital deckbuilding guide: https://edhrec.com/articles/digital-deckbuilding-the-how-to-guide-to-building-a-commander-deck-using-edhrec-archidekt-and-commander-spellbook
39. EDHREC usage guide: https://edhrec.com/guides/how-to-use-edhrec
40. EDHREC Scryfall syntax guide: https://edhrec.com/guides/guide-to-scryfall-syntax
41. Commander Spellbook: https://commanderspellbook.com/
42. Commander Spellbook syntax guide: https://commanderspellbook.com/syntax-guide/
43. Wizards Commander Brackets Beta: https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta
44. Wizards Commander Brackets Beta Update: https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025/
45. Rate My Decks Commander Analyzer: https://www.ratemydecks.com/
46. MTG Master features: https://mtgmaster.app/features
47. TableCommander deck management docs: https://tablecommander.com/docs/decks
48. BinderBrew Moxfield workflow: https://binderbrew.com/moxfield-deck-builder
49. BuildMyDeck: https://buildmydeck.app/
50. Bulk Commander: https://www.bulkcommander.com/

## Research Findings And Feature Ideas

## 1. Collection-Aware Deckbuilding

What users are asking for:

- Search only within owned cards while brewing.
- Know how many copies are owned while building.
- Prefer exact owned printings when adding cards.
- Show whether a card is available, already in another deck, or missing.
- Build a deck from the collection instead of from the global card pool.
- Keep missing-card buy lists separate from owned-card deck lists.

Evidence:

- Archidekt feature voting has high-point requests to prioritize collection-owned card versions and make imports default to editions already owned.
- Moxfield users explicitly complain that they cannot brew effectively without collection-aware search or exact printing/count visibility.
- ManaBox treats binders and registered decks as part of the same collection system, so it can show where deck cards physically are.
- BinderBrew positions itself as a "build from owned collection, then export to Moxfield" workflow.
- Eldwyn advertises exporting only missing cards from decklists/wishlists.

Recommended MTG Tool feature:

Add a "Build From Vault" mode.

Core behavior:

- Start with a commander or deck idea.
- Let Karn suggest cards from:
  - owned cards first
  - wishlist second
  - external recommendations third
- Show each candidate as:
  - Owned and available
  - Owned but allocated to another deck
  - Owned but different printing
  - Missing
  - Proxy allowed
- Generate:
  - final deck list
  - owned cards to pull
  - cards currently in other decks
  - missing shopping list
  - cheapest-printing alternative list

Why it fits MTG Tool:

The Vault already tracks collection data and deck-cost gaps. Karn already produces deck advice. The next product step is making Karn's advice inventory-aware by default.

Priority: P0.

## 2. Deck Version History, Undo, And Diff

What users are asking for:

- Undo accidental deck edits.
- Full deck change history.
- Version control for decklists.
- Compare current list against prior list or imported source.

Evidence:

- Moxfield feedback labels undo/version control as highly requested.
- The request specifically came from accidental visual deck editing where cards moved between columns and the user had to manually compare 100 cards.
- MTG Tool's own deck imports and Karn action prompts would benefit from a safer edit trail.

Recommended MTG Tool feature:

Add deck versions.

Core behavior:

- Every saved deck mutation creates a lightweight version entry.
- Version stores:
  - timestamp
  - source action
  - cards added
  - cards removed
  - section changes
  - owner/notes/tags changed
- UI supports:
  - compare versions
  - restore version
  - name milestone
  - "before Karn plan" snapshot
  - "after game night" snapshot

Why it fits:

This pairs beautifully with AI. If Karn suggests 12 changes, the user needs a safe way to apply, test, and roll back.

Priority: P0.

## 3. Deck Role Categories And Subcategories

What users are asking for:

- Custom subcategories inside deck sections.
- Automatic role categories such as ramp, draw, removal, wipes, win conditions, synergy.
- Template categories for repeat deckbuilding workflows.
- Visual organization by function, not just card type.

Evidence:

- Archidekt feature voting lists subcategories as a high-ranking builder request.
- Reddit comparisons often praise Archidekt for custom categories and functional card organization.
- Moxfield users in comparison threads wish for easier functional categorization.

Recommended MTG Tool feature:

Add "Role View" and "Role Templates."

Core behavior:

- Deck sections can include role tags:
  - Commander
  - Lands
  - Ramp
  - Draw
  - Removal
  - Board wipes
  - Protection
  - Tutors
  - Combo
  - Win conditions
  - Synergy
  - Flex
  - Maybeboard
  - Tokens
- Karn can auto-classify cards.
- User can override roles.
- Role counts feed Deck Report.
- Role templates can be saved per archetype.

Why it fits:

Karn already thinks this way in prompts. Make the model's invisible analysis visible and editable.

Priority: P0.

## 4. Missing-Card Shopping Lists And Cost-To-Finish

What users are asking for:

- Know exactly which cards are missing.
- Export only missing cards.
- Separate buy list from full deck list.
- Use cheapest printing when desired.
- Avoid accidentally buying cards already owned.

Evidence:

- Moxfield users ask to see "I already own X cards; I need to buy Y."
- BinderBrew separates full decklist from missing-card buy list.
- Eldwyn promotes cheapest-version optimization and exporting only missing cards.
- MTG Tool already has a Vault deck-cost panel, so this is a natural extension.

Recommended MTG Tool feature:

Add Shopping List Export.

Core behavior:

- For any deck:
  - show missing cards
  - show cheapest printing
  - show preferred printing
  - show current selected printing
  - show available owned substitute
- Export formats:
  - CSV
  - plain text
  - Moxfield import
  - Archidekt import
  - TCGplayer/Card Kingdom style list if feasible
- Add "do not buy basics" and "exclude proxies" toggles.

Priority: P0.

## 5. Binder, Box, And Physical Location Tracking

What users are asking for:

- Know where cards physically are.
- Track binders, boxes, decks, and other locations.
- Use location data when building decks.
- Move cards from binder to deck registration.

Evidence:

- ManaBox collection docs explicitly center binders as physical organization and use them to determine whether a deck can be built.
- ManaBox's deck registration flow can show where cards are and move them from binders or other decks into a registered deck.
- Reddit users describe large-binder workflows and frustration when tools cannot bulk assign or pull cards from binders/decks.

Recommended MTG Tool feature:

Add physical locations to The Vault.

Core behavior:

- Locations:
  - Binder
  - Box
  - Deck
  - Trade binder
  - Wishlist
  - Sold
  - Missing
  - Proxy
- Optional fields:
  - binder name
  - page
  - row/slot
  - box label
  - notes
- Deck completion shows:
  - "Pull these from Binder A"
  - "These are in Deck B"
  - "These are missing"

Priority: P0.

## 6. Bulk Collection Operations And Sync/Merge

What users are asking for:

- Bulk assign cards to binders/decks/lists.
- Update collection from a scanner export without deleting/re-importing everything.
- Merge new scan CSVs into existing collections.
- Select all in filtered collection views.
- Bulk edit location, tag, condition, finish, wishlist state.

Evidence:

- Reddit users describe deleting and re-importing collections to update Moxfield from ManaBox.
- Users request mass assignment from decks/packs to collection binders.
- Dragon Shield and ManaBox both support richer collection operations like folders, sorting, grouping, and bulk edit.

Recommended MTG Tool feature:

Add "Collection Import Update Mode."

Core behavior:

- Import options:
  - Add only new cards
  - Replace selected location
  - Merge quantities
  - Reconcile differences
  - Mark absent cards as removed
- Preview diff:
  - new cards
  - quantity changed
  - printing changed
  - location changed
  - conflicts
- Bulk select in Vault:
  - assign tag
  - set location
  - move to wishlist
  - mark for trade
  - export selected

Priority: P0.

## 7. Collection Export And Backups

What users are asking for:

- Export collection data to CSV.
- Make regular hard-copy backups.
- Avoid data loss.
- Move between apps.

Evidence:

- Dragon Shield advertises CSV/text export for backups and trades.
- Delver Lens documentation emphasizes exports to other sites and CSV.
- Reddit scanner users repeatedly mention export format and backup concerns.
- One user praised ManaBox's CSV export as a safe backup path after data-loss concerns with another scanner.

Recommended MTG Tool feature:

Add "Export Vault."

Formats:

- MTG Tool JSON backup
- CSV
- Deckbox CSV
- Moxfield-compatible CSV if feasible
- Archidekt-compatible CSV if feasible
- plain text owned-card list

Also add:

- scheduled local backup
- "open backup folder"
- restore from backup
- backup before sync/import toggle

Priority: P0.

## 8. Scanner Integration

What users are asking for:

- Fast physical collection entry.
- Camera scanner.
- Wishlist hit detection.
- Buzz/ding when scanned card is needed.
- Export scanner lists into deck/collection tools.

Evidence:

- ManaBox, Dragon Shield, Delver Lens, Eldwyn, and Cardivore all emphasize scanning.
- Reddit users ask specifically for scanner apps with wishlist/missing-card detection.
- Scanner users care heavily about export and import compatibility.

Recommended MTG Tool feature:

Do not build a scanner first. Instead add scanner import compatibility first.

Phase 1:

- Import Delver Lens CSV.
- Import ManaBox CSV.
- Import Dragon Shield CSV.
- Import TCGplayer app CSV.
- Detect source format automatically.

Phase 2:

- "Scan inbox" workflow:
  - import scanner export as a temporary list
  - review matches
  - assign location
  - merge into Vault
  - highlight wishlist hits

Phase 3:

- Optional local webcam scanner only if there is a strong reason.

Priority: P1.

## 9. Advanced Search Builder And Saved Filters

What users are asking for:

- Search by price range.
- Search within collection.
- Save deck filters.
- Easier Scryfall-style search for non-technical users.
- Search by role, oracle text, legality, tags, bracket impact, set, language, finish, and price.

Evidence:

- Archidekt feature voting includes price-range search and saved deck filters.
- EDHREC's guides lean heavily on advanced filtering to narrow recommendations.
- Scryfall syntax is powerful enough that users write guides and helper tools for less technical players.
- Reddit threads show users want Scryfall-like power without memorizing syntax.

Recommended MTG Tool feature:

Add a "Search Builder."

Core behavior:

- Visual filter rows:
  - color identity
  - card type
  - mana value
  - oracle text
  - price
  - owned/missing
  - location
  - role
  - commander legality
  - game changer
  - salt score
  - combo piece
  - set/printing/language
- Natural-language prompt:
  - "cheap red board wipes I own"
  - "green ramp under 3 mana not already in decks"
  - "cards that make Treasure and are legal in Commander"
- Show generated query for advanced users.
- Save filters.

Priority: P1.

## 10. Commander Bracket / Rule 0 Readiness

What users are asking for:

- Better way to discuss power level.
- Bracket-aware analysis.
- Identify play patterns that do not match casual expectations.
- Show why a deck received a bracket.

Evidence:

- Wizards introduced Commander Brackets Beta as a structured power/matchmaking system.
- The April 2025 update emphasizes that play patterns such as heavy Stax can require bracketing up even when a deck technically dodges specific listed cards.
- Modern Commander analyzers advertise bracket, power, strengths/weaknesses, and reasoning panels.
- Playgroup.gg added a Rule 0 matchup screen that estimates win odds and helps balance tables.

Recommended MTG Tool feature:

Add "Rule 0 Card" to every Deck Report.

Core behavior:

- Bracket estimate
- Game Changers count
- Tutors count
- Extra turns
- Mass land denial
- Stax/prison signals
- Two-card combos
- Fast mana
- Expected goldfish turn
- Salt/friction warnings
- Plain-language table introduction:
  - "This is a bracket 3-ish graveyard deck with one compact combo and moderate tutors."
- "Power mismatch" comparison between selected decks.

Priority: P1.

## 11. Combo Discovery And Combo Risk

What users are asking for:

- Find combos in decks.
- Search combos by commander, result, legality, and variants.
- Group combo variants.
- Understand whether a combo is in-deck or one card away.

Evidence:

- Commander Spellbook exists specifically as an EDH combo search engine.
- Its syntax supports searching by commander, legality, results, and variants.
- Community posts praise combo variants and grouped variants as useful.
- BuildMyDeck and MTG Tool already use Commander Spellbook-style data.

Recommended MTG Tool feature:

Add Combo Lens.

Core behavior:

- Combos in deck
- One-card-away combos
- Two-card-away combos
- Required commander combos
- Combo result:
  - infinite mana
  - infinite tokens
  - draw deck
  - win game
  - damage loop
- Bracket impact
- Salt impact
- "Add missing combo piece to wishlist"
- "Remove combo to lower bracket"

Priority: P1.

## 12. Real-Game Tracking And Playgroup Stats

What users are asking for:

- Track games, wins, losses, matchups, decks, win conditions, and player/deck stats.
- Use stats to decide whether a deck needs to be powered up or down.
- Track guest players without requiring every person to create an account.
- Track games with minimal manual input.

Evidence:

- Archidekt feature voting includes deck meta stat tracking.
- Playgroup.gg centers per-deck stats, ELO, history, achievements, and playgroup stats.
- Reddit users describe spreadsheet trackers and ask for apps combining life tracking with deck/player stats.
- A Playgroup.gg user specifically requested guest/manual tracking for LGS/random players.

Recommended MTG Tool feature:

Add Game Night Tracker.

Core behavior:

- Players:
  - saved player names
  - guest players
  - playgroups
- Game fields:
  - date
  - decks
  - winner
  - placement
  - turn count
  - win condition
  - notes
  - bracket/power snapshot
- Stats:
  - deck win rate
  - player win rate
  - matchup matrix
  - deck vs deck performance
  - average game length
  - "too strong / too weak for pod" signal
- Feed stats into Karn/Tibalt/Jace.

Priority: P1.

## 13. Life Tracker Integration

What users are asking for:

- Commander damage.
- Poison, energy, experience, initiative, monarch, storm, treasure, commander tax.
- 2-6 players.
- Saved profiles.
- Game timers.
- Device sync.
- Slow-turn ping.

Evidence:

- Lifetap and Dragon Counter emphasize Commander counters, custom player counts, profiles, and ease-of-use.
- Playgroup.gg added multi-device sync and slow-turn pings.
- These features overlap with MTG Tool's learn/play tracking but are not its current main strength.

Recommended MTG Tool feature:

Do not try to beat dedicated mobile life trackers immediately.

Instead add:

- Manual game logging first.
- Optional "table tracker" desktop mode later:
  - life totals
  - commander damage
  - poison
  - commander tax
  - turn timer
  - event log
- Export game log into deck stats.

Priority: P2.

## 14. Playtester And Sandbox Improvements

What users are asking for:

- Visual playtester.
- Sample hands.
- Drag/drop card movement.
- Tokens.
- Counters.
- Copy permanents.
- Dice.
- Hotkeys.
- Practice decks before buying.

Evidence:

- Moxfield feature documentation lists sample hands, game sandbox, hotkeys, tokens, counters, dice, life/energy/poison.
- EDHREC's Archidekt guide calls playtesting a way to test decks without owning physical cards.
- Archidekt feature voting includes playtester counter customization.

Recommended MTG Tool feature:

Upgrade Garfield/Audience Academy with "Sandbox Mode."

Core behavior:

- Draw sample hand.
- Mulligan practice.
- Play lands/spells manually.
- Add/remove counters.
- Create/copy tokens.
- Track commander damage and life.
- Hotkeys.
- "Ask Jace about board."
- "Let Garfield continue from here."

Priority: P1/P2.

## 15. Goldfish And Post-Game Insights

What users are asking for:

- Test consistency and early-game behavior.
- Know dead draws, cast-on-curve, and cards that pull their weight.
- Use real-game and simulated data to cut weak cards.

Evidence:

- Playgroup.gg advertises card insights such as dead draw detection and cast-on-curve analysis.
- MTG Master advertises mana/consistency insights and playtesting tools.
- MTG Tool already stores goldfish and game records, which makes this unusually achievable.

Recommended MTG Tool feature:

Add "Card Performance Insights."

Core behavior:

- From simulations:
  - drawn but not cast
  - stuck in hand
  - cast on curve
  - contributed to score
  - mulligan liability
- From real games:
  - cards mentioned in notes
  - win condition cards
  - cards removed after poor performance
- Agent usage:
  - Karn recommends cuts based on data, not vibes.
  - Tibalt roasts repeated underperformers.

Priority: P1.

## 16. Custom Formats, Banlists, And House Rules

What users are asking for:

- Custom format legality options.
- Custom banlists.
- Better use of deck "game type."
- Hidden sections in public decks.

Evidence:

- Archidekt feature voting includes custom format legality, custom banlists, and better use of game type.
- Commander is a Rule 0-heavy format, and Wizards' bracket system explicitly keeps Rule 0 relevant.

Recommended MTG Tool feature:

Add House Rules profiles.

Core behavior:

- Named profiles:
  - My pod
  - LGS casual night
  - Precon league
  - No proxies
  - Proxies allowed if owned
  - No fast mana
  - Budget cap
  - No Game Changers
- Each profile can define:
  - banned cards
  - allowed proxies
  - budget limit
  - bracket target
  - card categories to warn on
- Deck Report can say:
  - legal for profile
  - warnings
  - required swaps

Priority: P2.

## 17. Proxies, Signed Cards, Altered Cards, Serialization, And Collector Metadata

What users are asking for:

- Mark proxies.
- Mark signed cards.
- Track altered/misprint/serialized cards.
- Track languages.
- Track custom art.

Evidence:

- Deckstats users requested proxy marking, and Deckstats later shipped proxy/signed card support.
- Archidekt feature voting includes serialization fields, non-English versions, and custom card art.
- Dragon Shield and ManaBox both include language/condition/purchase/custom metadata in collection workflows.

Recommended MTG Tool feature:

Add collector metadata fields.

Fields:

- proxy
- signed
- altered
- misprint
- serialized number
- language
- custom art note
- purchase price
- purchase date
- source/acquired from
- for trade
- not for trade

Priority: P2.

## 18. Trade Tools

What users are asking for:

- Compare trade value.
- Wishlists and trade lists.
- Friends/social collection visibility.

Evidence:

- Dragon Shield advertises trade-value comparison, wishlists, tradelists, and social/friend collection sharing.
- ManaBox and similar tools position collection tracking as useful for trading.

Recommended MTG Tool feature:

Add local trade sheet, not social network.

Core behavior:

- Mark cards "for trade."
- Build trade proposal:
  - my cards
  - their cards
  - price difference
  - notes
- Export as text/CSV.
- Optional "print trade binder list."

Priority: P3.

## 19. News, Set Release, And New Cards For My Deck

What users are asking for:

- News feed.
- New cards relevant to specific commanders.
- Set completion.
- See upgrades after new releases.

Evidence:

- ManaBox includes news feeds.
- EDHREC and related tools emphasize new cards, commander pages, recommendations, and Game Changer pages.
- Reddit users ask for more/new-card filtering for commanders.

Recommended MTG Tool feature:

Add "New Cards For My Decks."

Core behavior:

- After Scryfall sync:
  - show new cards by set
  - match against saved commanders and deck themes
  - show "likely upgrade" and "maybe"
  - show price and owned status
  - add to wishlist
  - ask Karn why it matters

Priority: P2.

## 20. Public Sharing And Export

What users are asking for:

- Share private deck links.
- Public profiles.
- Embed deck views.
- Export deck images/text.
- Primers.

Evidence:

- Archidekt feature voting includes embeds and hidden public deck sections.
- Moxfield supports detailed primers with Markdown and generated table of contents.
- Gauntlet advertises deck exports as image/text and sharing profile links.
- TableCommander includes deck privacy levels and shareable URLs.

Recommended MTG Tool feature:

Because MTG Tool is local-first, do export-first sharing instead of hosted sharing.

Core behavior:

- Export deck report as Markdown.
- Export deck image/summary card.
- Export Rule 0 card.
- Export primer.
- Export "Karn plan" as Markdown.
- Copy formatted decklist for Moxfield/Archidekt.

Priority: P2.

## 21. Onboarding, Support, And Documentation Gaps

What users are indirectly asking for:

- Clear collection tutorials.
- Understand how ownership circles/states work.
- Avoid confusing import/export workflows.
- Know what data is local, synced, or uploaded.

Evidence:

- Reddit users ask for collection feature tutorials.
- Moxfield users misunderstand ownership/availability indicators.
- Many scanner and collection threads become "which export format works where?"

Recommended MTG Tool feature:

Add in-app "Workflow Guides."

Guides:

- Import first deck.
- Import collection from ManaBox/Dragon Shield/Delver Lens.
- Build from owned cards.
- Finish a deck shopping list.
- Run a Rule 0 report.
- Practice a deck in Academy.
- Back up and restore data.

Priority: P1.

## 22. AI-Specific Opportunities Other Tools Cannot Easily Match

MTG Tool should use AI where it has a real product advantage, not as decoration.

High-value AI features:

1. Natural-language search builder.
2. Karn plan converted into structured deck edits.
3. "Why is this card in my deck?" explanation.
4. "What is my deck trying to do?" summary.
5. "What do I already own that fits this strategy?"
6. "What should I cut if I buy this card?"
7. "Make this deck bracket 2/3/4."
8. "Make this deck cheaper without changing the plan."
9. "Explain this opening hand."
10. "Teach me this deck over ten games."
11. "Make a Rule 0 pitch."
12. "Find cards in my collection that fill the same role."

Priority: P0/P1 depending on integration complexity.

## Recommended Backlog

## P0: Build Next

### 1. Deck Report

Create a unified deck report that consolidates what is currently scattered across Karn, Garfield, Vault, legality, and right-panel stats.

Must include:

- commander and identity
- strategy summary
- role counts
- mana curve
- color distribution
- legality
- bracket estimate
- game changers
- combo signals
- salt/friction signals
- owned/missing cards
- cost to finish
- top cuts
- top adds
- export Markdown

### 2. Collection-Aware Karn

Karn should default to asking:

- What do you own?
- What are you missing?
- What cards are already in other decks?
- What budget/printing constraints exist?

Output should classify recommendations as:

- Owned and available
- Owned but allocated
- Wishlist
- Missing
- Budget substitute

### 3. Deck Versioning And Diff

Add snapshots and diff for deck edits, imports, and AI-applied changes.

### 4. Vault Export And Update/Merge Import

Add export first, then merge import.

### 5. Shopping List Export

Turn deck-cost findings into something actionable outside the app.

## P1: Build Soon

### 6. Physical Location Tracking

Binder/box/deck location is the key missing piece for large collections.

### 7. Role View And Auto-Categorization

Make deck function visible and editable.

### 8. Search Builder And Saved Filters

Expose local card/search power without requiring Scryfall syntax fluency.

### 9. Game Night Tracker

Capture real Commander game results and feed them back into deck analysis.

### 10. Academy Sandbox / Better Playtest UI

Bring Garfield and Academy closer to the playtester workflows users already value.

## P2: Build After Core Workflow

### 11. House Rules Profiles

Support custom banlists, proxy rules, budget caps, bracket targets, and LGS/playgroup presets.

### 12. New Cards For My Decks

After each data sync, surface new set cards relevant to saved decks and commanders.

### 13. Combo Lens

Show in-deck combos, near combos, bracket impact, and cards to add/remove.

### 14. Collector Metadata

Signed, altered, proxy, serialized, language, purchase price/date, source.

### 15. Exportable Primer / Rule 0 Card

Generate shareable Markdown or image cards from local deck analysis.

## P3: Defer

### 16. Native Card Scanner

Good idea eventually, but importing scanner CSVs is a much better first step.

### 17. Social Profiles / Hosted Sharing

Conflicts with local-first scope. Prefer export-first sharing.

### 18. Full Life Tracker

Useful, but dedicated mobile apps already do this very well. Start with game logging and optional desktop table tracker.

### 19. Trade Network

Local trade sheet is fine; social trading network is not needed.

### 20. Multi-Device Sync

Potentially valuable, but it complicates the local-first promise. Consider after data export/backup is excellent.

## Feature Fit Matrix

| Feature | Fit For MTG Tool | Why |
|---|---:|---|
| Deck Report | Very high | Consolidates existing strengths |
| Collection-aware deckbuilding | Very high | AI + Vault is the product moat |
| Deck versioning/undo | Very high | Makes AI edits safe |
| Shopping list export | Very high | Turns analysis into action |
| Binder/location tracking | Very high | Solves real physical collection pain |
| Bulk collection sync/merge | Very high | Common cross-app pain |
| Role categories/subcategories | High | Matches Karn's analysis style |
| Search builder | High | Local Scryfall data becomes more usable |
| Game Night Tracker | High | Feeds real data into agents |
| Combo Lens | High | Already aligned with Spellbook integration |
| Academy Sandbox | High | Extends existing learn/goldfish work |
| House Rules profiles | Medium-high | Commander pods need this |
| Scanner CSV import | Medium-high | Big value without building camera tech |
| Native scanner | Medium | Expensive and mobile-oriented |
| Social sharing/profiles | Low-medium | Local-first conflict |
| Full life tracker | Low-medium | Better as integration/logging than core |
| News feed | Low-medium | Useful, but not core |

## Final Product Direction

The market signal is clear: players are tired of stitching together many tools. A typical workflow crosses Moxfield, Archidekt, ManaBox, Delver Lens, EDHREC, Commander Spellbook, Scryfall, Deckstats, Playgroup.gg, spreadsheets, and store carts.

MTG Tool should not become another generic deckbuilder. It should become the local-first Commander workbench that connects:

- what I own
- what I am building
- what I am missing
- how my deck plays
- how strong it is
- what my pod will think
- what I should change next
- how to practice it

The best next feature bundle is:

1. Deck Report
2. Collection-aware Karn
3. Deck versions/diffs
4. Shopping list export
5. Vault import/export/merge
6. Binder/location tracking

That combination directly answers the most repeated public pain points while leaning into what MTG Tool already does better than ordinary web deckbuilders: private local data plus AI reasoning over decks, collection, games, and rules.

