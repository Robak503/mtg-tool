# Play-ranked build backlog — coverage by real-deck impact

> **Regenerable** (`MTG_APP_ROOT=<main>/app node app/scripts/play-ranked-backlog.mjs`). Sorts the
> corpus by Commander play (Scryfall `edhrec_rank`), drops what we already cover, and buckets the
> rest by the SYSTEM each card needs. **Build the top bucket first** — it unblocks the most
> most-played cards per unit work. This is the corpus-wide successor to `thirteen-decks-to-100.md`.

**Play-weighted coverage today:** top 1000 = **50.7%** (507/1000) · top 2500 = **35.1%** (878/2500) · top 5000 = **26.6%** (1330/5000).

**Scope below:** the **3660** uncovered cards inside the **top 5000 most-played**, bucketed by system (largest = highest play-impact).

| # | System to build | Uncovered cards | Top-played examples (rank) |
|---|---|--:|---|
| 1 | ETB trigger | 629 | The One Ring (#89), Garruk's Uprising (#92), Tireless Provisioner (#180), Scute Swarm (#221), Animate Dead (#224), The Great Henge (#235) |
| 2 | Spell effect (other) | 444 | Chaos Warp (#30), Heroic Intervention (#31), Deflecting Swat (#79), Fierce Guardianship (#80), Teferi's Protection (#105), Propaganda (#118) |
| 3 | Upkeep/phase trigger | 337 | Arcane Denial (#56), Mana Drain (#115), Black Market Connections (#132), Herald's Horn (#141), Mana Vault (#144), Sylvan Library (#256) |
| 4 | Attacks/blocks trigger | 304 | Sword of the Animist (#243), Etali, Primal Storm (#260), Ragavan, Nimble Pilferer (#268), Toski, Bearer of Secrets (#381), Bident of Thassa (#410), Ohran Frostfang (#459) |
| 5 | Activated ability | 293 | Idol of Oblivion (#197), Professional Face-Breaker (#216), Sensei's Divining Top (#225), Faerie Mastermind (#327), Shadowspear (#330), Kami of Whispered Hopes (#406) |
| 6 | Cast/spell trigger | 210 | Rhystic Study (#43), Esper Sentinel (#76), Mystic Remora (#96), Storm-Kiln Artist (#209), Hullbreaker Horror (#267), Vanquisher's Banner (#353) |
| 7 | Other / unclassified | 199 | Toxic Deluge (#67), Roaming Throne (#133), Grand Abolisher (#249), Panharmonicon (#261), Phyrexian Metamorph (#305), Silence (#411) |
| 8 | Dies/LTB trigger | 181 | Skullclamp (#41), Syr Konrad, the Grim (#252), The Ozolith (#302), Enduring Vitality (#497), Marionette Apprentice (#556), Black Market (#652) |
| 9 | Static (aura/equip) | 131 | Swiftfoot Boots (#12), Lightning Greaves (#13), Wild Growth (#211), Whispersilk Cloak (#326), Blackblade Reforged (#339), Utopia Sprawl (#341) |
| 10 | TOKEN MAKER (spell) | 131 | Smothering Tithe (#62), Doubling Season (#198), Mirkwood Bats (#223), Academy Manufactor (#263), Anointed Procession (#358), Parallel Lives (#409) |
| 11 | Static anthem/buff | 128 | Return of the Wildspeaker (#175), Rhythm of the Wild (#207), Finale of Devastation (#331), Anger (#351), Mirari's Wake (#668), Rising of the Day (#682) |
| 12 | TARGETED REMOVAL (destroy/exile) | 104 | Feed the Swarm (#88), Vandalblast (#101), Deadly Rollick (#112), Pongify (#156), Rapid Hybridization (#210), Reality Shift (#273) |
| 13 | CARD DRAW / FILTER (spell) | 82 | Brainstorm (#71), Faithless Looting (#94), Frantic Search (#104), Ponder (#142), Explore (#234), Inspiring Call (#271) |
| 14 | TUTOR (library search) | 82 | Vampiric Tutor (#110), Enlightened Tutor (#122), Mystical Tutor (#147), Worldly Tutor (#165), Gamble (#236), Entomb (#323) |
| 15 | BOARD WIPE / MASS REMOVAL | 76 | Blasphemous Act (#22), Farewell (#161), Austere Command (#168), Ruinous Ultimatum (#638), Kindred Dominance (#725), Vanquish the Horde (#849) |
| 16 | REANIMATION (graveyard -> battlefield) | 56 | Reanimate (#57), Sevinne's Reclamation (#337), Living Death (#475), Dread Return (#521), Rise of the Dark Realms (#530), Splendid Reclamation (#866) |
| 17 | +1/+1 COUNTERS / PROLIFERATE | 54 | Hardened Scales (#188), Branching Evolution (#372), Snakeskin Veil (#470), Unbreakable Formation (#533), Yawgmoth, Thran Physician (#816), Terrasymbiosis (#984) |
| 18 | COST REDUCER (static) | 40 | Foundry Inspector (#255), Jet Medallion (#276), Ruby Medallion (#306), Urza's Incubator (#312), Sapphire Medallion (#383), Etherium Sculptor (#434) |
| 19 | COUNTERSPELL | 39 | Force of Will (#190), Mental Misstep (#451), Pyroblast (#457), Tibalt's Trickery (#587), Rewind (#996), Three Steps Ahead (#1102) |
| 20 | PLANESWALKER (loyalty abilities) | 39 | Elspeth, Storm Slayer (#839), Narset, Parter of Veils (#893), Jace, Wielder of Mysteries (#1073), Teferi, Time Raveler (#1130), Vraska, Betrayal's Sting (#1345), Ugin, the Spirit Dragon (#1571) |
| 21 | RITUAL (one-shot mana burst) | 32 | Dark Ritual (#34), Jeska's Will (#102), Deadly Dispute (#128), Mana Geyser (#316), Seething Song (#332), Cabal Ritual (#463) |
| 22 | Enters-as/replacement | 29 | Spark Double (#407), Wishclaw Talisman (#510), Metallic Mimic (#1077), Arwen, Weaver of Hope (#1880), Summon: Fenrir (#2276), Patrolling Peacemaker (#2401) |
| 23 | EXTRA TURN / COMBAT | 18 | Karlach, Fury of Avernus (#1030), Relentless Assault (#1544), Seize the Day (#1741), Overpowering Attack (#1842), Nexus of Fate (#2294), Expropriate (#2474) |
| 24 | BOUNCE (return to hand) | 11 | Cyclonic Rift (#51), Snap (#269), Reprieve (#639), Into the Flood Maw (#751), Chain of Vapor (#916), Brazen Borrower // Petty Theft (#2676) |
| 25 | BURN (targeted damage) | 10 | Boros Charm (#176), Mayhem Devil (#580), Grapeshot (#712), Mizzium Mortars (#2882), Naya Charm (#3001), Virtue of Courage // Embereth Blaze (#3865) |
| 26 | EQUIPMENT (equip + granted abilities/stats) | 1 | Masterwork of Ingenuity (#1675) |

## Per-system detail (top 12 buckets)

### 1. ETB trigger — 629 cards
`#89` The One Ring · `#92` Garruk's Uprising · `#180` Tireless Provisioner · `#221` Scute Swarm · `#224` Animate Dead · `#235` The Great Henge · `#240` Gray Merchant of Asphodel · `#242` Mithril Coat · `#254` Orcish Bowmasters · `#274` Avenger of Zendikar · `#288` Sun Titan · `#314` Guardian Project

### 2. Spell effect (other) — 444 cards
`#30` Chaos Warp · `#31` Heroic Intervention · `#79` Deflecting Swat · `#80` Fierce Guardianship · `#105` Teferi's Protection · `#118` Propaganda · `#127` Victimize · `#152` Windfall · `#163` Ghostly Prison · `#184` Flawless Maneuver · `#195` Akroma's Will · `#231` Sign in Blood

### 3. Upkeep/phase trigger — 337 cards
`#56` Arcane Denial · `#115` Mana Drain · `#132` Black Market Connections · `#141` Herald's Horn · `#144` Mana Vault · `#256` Sylvan Library · `#289` Braids, Arisen Nightmare · `#359` Pact of Negation · `#388` Underworld Breach · `#391` Land Tax · `#395` Forgotten Ancient · `#399` Helm of the Host

### 4. Attacks/blocks trigger — 304 cards
`#243` Sword of the Animist · `#260` Etali, Primal Storm · `#268` Ragavan, Nimble Pilferer · `#381` Toski, Bearer of Secrets · `#410` Bident of Thassa · `#459` Ohran Frostfang · `#544` Sword of Feast and Famine · `#555` Six · `#564` Beastmaster Ascension · `#576` The Reaver Cleaver · `#626` Mangara, the Diplomat · `#630` Trouble in Pairs

### 5. Activated ability — 293 cards
`#197` Idol of Oblivion · `#216` Professional Face-Breaker · `#225` Sensei's Divining Top · `#327` Faerie Mastermind · `#330` Shadowspear · `#406` Kami of Whispered Hopes · `#448` Walking Ballista · `#484` Maskwood Nexus · `#489` Vito, Thorn of the Dusk Rose · `#512` Mother of Runes · `#536` Conduit of Worlds · `#572` Strionic Resonator

### 6. Cast/spell trigger — 210 cards
`#43` Rhystic Study · `#76` Esper Sentinel · `#96` Mystic Remora · `#209` Storm-Kiln Artist · `#267` Hullbreaker Horror · `#353` Vanquisher's Banner · `#374` Aetherflux Reservoir · `#408` Lotho, Corrupt Shirriff · `#461` Sram, Senior Edificer · `#485` Birgi, God of Storytelling // Harnfel, Horn of Bounty · `#540` Displacer Kitten · `#642` Reflections of Littjara

### 7. Other / unclassified — 199 cards
`#67` Toxic Deluge · `#133` Roaming Throne · `#249` Grand Abolisher · `#261` Panharmonicon · `#305` Phyrexian Metamorph · `#411` Silence · `#437` Ramunap Excavator · `#474` Ghalta, Primal Hunger · `#481` Blind Obedience · `#524` Crypt Ghast · `#589` Crucible of Worlds · `#602` Realmwalker

### 8. Dies/LTB trigger — 181 cards
`#41` Skullclamp · `#252` Syr Konrad, the Grim · `#302` The Ozolith · `#497` Enduring Vitality · `#556` Marionette Apprentice · `#652` Black Market · `#700` Haywire Mite · `#718` Chasm Skulker · `#754` Kaya's Ghostform · `#769` Liliana, Dreadhorde General · `#792` Rancor · `#803` Enduring Innocence

### 9. Static (aura/equip) — 131 cards
`#12` Swiftfoot Boots · `#13` Lightning Greaves · `#211` Wild Growth · `#326` Whispersilk Cloak · `#339` Blackblade Reforged · `#341` Utopia Sprawl · `#520` Commander's Plate · `#537` Opposition Agent · `#551` Brotherhood Regalia · `#575` Darksteel Mutation · `#596` Curiosity · `#603` All That Glitters

### 10. TOKEN MAKER (spell) — 131 cards
`#62` Smothering Tithe · `#198` Doubling Season · `#223` Mirkwood Bats · `#263` Academy Manufactor · `#358` Anointed Procession · `#409` Parallel Lives · `#507` Adeline, Resplendent Cathar · `#579` Second Harvest · `#586` Voice of Victory · `#821` Inkshield · `#888` Grim Hireling · `#924` Rite of Replication

### 11. Static anthem/buff — 128 cards
`#175` Return of the Wildspeaker · `#207` Rhythm of the Wild · `#331` Finale of Devastation · `#351` Anger · `#668` Mirari's Wake · `#682` Rising of the Day · `#688` Banner of Kinship · `#757` Tyvar's Stand · `#777` Elspeth, Sun's Champion · `#782` Flowering of the White Tree · `#808` Elesh Norn, Grand Cenobite · `#831` Wonder

### 12. TARGETED REMOVAL (destroy/exile) — 104 cards
`#88` Feed the Swarm · `#101` Vandalblast · `#112` Deadly Rollick · `#156` Pongify · `#210` Rapid Hybridization · `#273` Reality Shift · `#296` Untimely Malfunction · `#324` Rakdos Charm · `#333` Putrefy · `#336` Damn · `#373` Nature's Claim · `#402` Despark

---

_Heuristic bucketing (oracle-text + type-line first-match); the OTHER bucket needs manual triage._
_Card text is bundled Scryfall data; ranks are `edhrec_rank`. Re-run to refresh after coverage lands._
