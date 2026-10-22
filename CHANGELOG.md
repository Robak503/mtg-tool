# Changelog

All notable changes to MTG Tool are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/). Full per-release notes and binaries live on
the [GitHub Releases](https://github.com/Robak503/mtg-tool/releases) page; this file
summarizes the notable changes.

## [Unreleased]

### Added
- **Sokenzan, Crucible of Defiance**, **Hedge Shredder**, **Lindblum, Industrial Regency**, **Ishgard, the Holy See**, **Gift of the Viper**, **Legion Warboss**, **Hero's Blade**, **Circle of Power** and **Qarsi Revenant** now play their whole text, along with **Krenko, Baron of Tin Street**, **Howlsquad Heavy**, **Cornered by Black Mages**, **Mysidian Elder**, **Queen Brahne**, **Scholar of the Ages**, **Champion of Dusan**, **Unexpected Fangs**, **Sai of the Shinobi**, **Stormrider Rig**, **Ronin Warclub**, **Inventor's Goggles**, **Quintessential Katana**, **Burn Down the House**, **Artistic Process** and **Stingerquill Charm**. Sokenzan's Channel makes two Spirits that have haste this turn, and so do the tokens Krenko, Burn Down the House, Artistic Process and Stingerquill Charm make. Legion Warboss's and Howlsquad Heavy's Goblin must attack in the combat it was made in — you can't finish declaring attackers without it — but not in an extra combat later that turn. Hedge Shredder puts every land you mill onto the battlefield tapped (it isn't your land drop). Lindblum's Mage Siege, Circle of Power, Cornered by Black Mages, Mysidian Elder and Queen Brahne make a 0/1 Wizard that deals 1 damage to each opponent whenever you cast a noncreature spell. Ishgard's Faith & Grief returns up to two artifact and/or enchantment cards from your graveyard, and Scholar of the Ages up to two instants and/or sorceries. Gift of the Viper, Unexpected Fangs and the renew abilities of Qarsi Revenant and Champion of Dusan put all their counters on the creature at once. Hero's Blade can be attached to a legendary creature you control as it enters (Sai of the Shinobi, Stormrider Rig and Ronin Warclub to any creature you control, Inventor's Goggles to an Artificer, Quintessential Katana to a Ninja); the computer opponents attach an Equipment that isn't on a creature yet and leave one that is.
- **Drinker of Sorrow**, **Olivia's Attendants**, **Angel of Deliverance**, **Stir the Pride**, **Ceremonial Knife**, **Sword of Kaldra**, **Matsu-Tribe Sniper**, **Kiyomaro, First to Stand** and **Pit Spawn** now play their whole text. A "whenever this creature deals damage" ability now triggers whatever it does, not only when it says "you gain that much life": Drinker of Sorrow makes you sacrifice a permanent when it deals combat damage, Olivia's Attendants creates a Blood token for each point of damage it deals (its own 1-damage ability included), Angel of Deliverance exiles an opponent's creature when you have delirium, and Kiyomaro gains you 7 life when you hold seven or more cards. The same ability given by an Equipment or a spell triggers too: Ceremonial Knife's Blood token and Stir the Pride's life gain on each of your creatures (only the ones you had when it resolved). Damage dealt to several creatures and players at once triggers the ability once, with the total — Drinker of Sorrow blocked by two creatures makes you sacrifice one permanent, not two. "Deals damage to a creature" abilities now trigger on any damage, not only combat damage: Sword of Kaldra exiles a creature its equipped creature damages and Pit Spawn one it damages (one that died to the damage stays in the graveyard), and Matsu-Tribe Sniper's ping taps the flyer it hits and keeps it tapped. Also fixed: abilities that trigger when a creature deals damage "to a player" or "to an opponent" — **Curiosity**, **Keen Sense**, **Niv-Mizzet, Dracogenius** — now trigger on damage outside combat too, such as an activated ability's ping or a fight; and Curiosity or Keen Sense on an opponent's creature no longer draws you a card when that creature damages you. **Syr Carah, the Bold** was counted as fully played while its ability fired only for Syr Carah and never for your instant and sorcery spells; it now goes to the Arbiter.
- **Genji Glove**, **Mirrormade**, **Archfiend of Ifnir**, **Staff of Compleation**, **Diamond Pick-Axe**, **Sticky Fingers**, **Terrain Generator**, **Black Sun's Zenith**, **Grinding Station** and **Two-Handed Axe** now play their whole text, along with **Soul Snuffers**, **Darkness Descends**, **Harbinger of Night**, **Carnifex Demon**, **Liliana's Influence**, **Curious Inquiry**, **Creeping Crystal Coating**, **Iconic Shield**, **Despotic Scepter**, **Tel-Jilad Stylus**, **Leonin Elder**, **Battered Golem**, **Vermiculos**, **Karstoderm**, **Elvish Pioneer** and **Firebrand Ranger**. Diamond Pick-Axe's +1/+1 and Sticky Fingers' menace now apply — the reminder text after their quoted ability had hidden them (Curious Inquiry, Creeping Crystal Coating and Iconic Shield too). Two-Handed Axe doubles the equipped creature's power when it attacks; Genji Glove untaps it in the first combat and adds another combat phase. Archfiend of Ifnir puts a -1/-1 counter on each creature your opponents control whenever you cycle or discard another card, and can now be cycled itself; Black Sun's Zenith, Darkness Descends, Soul Snuffers and Harbinger of Night put -1/-1 counters on every creature (the computer opponents hold the two sorceries like any board wipe). Mirrormade enters as a copy of an artifact or an enchantment. Staff of Compleation and Despotic Scepter destroy a permanent you own, and Tel-Jilad Stylus puts one on the bottom of your library — one an opponent has taken from you included. Grinding Station, Leonin Elder, Battered Golem, Vermiculos and Karstoderm trigger when any player's artifact enters. Terrain Generator, Elvish Pioneer and Firebrand Ranger put a basic land from your hand onto the battlefield. **Drinker of Sorrow**, **Olivia's Attendants**, **Angel of Deliverance** and **Stir the Pride**'s second mode were counted as fully played while their "whenever this creature deals damage" ability never triggered; they now go to the Arbiter.
- **Disrupt Decorum**, **Devoted Druid**, **Shalai, Voice of Plenty**, **Triumph of the Hordes**, **Fracture**, **Brass's Bounty**, **Persist**, **Bulk Up**, **Unmarked Grave**, **Unleash Fury** and **Time Warp** now play their whole text, along with **Zuko's Exile**, **Moogles' Valor**, **Beacon of Tomorrows**, **Titanic Ultimatum**, **Mr. Orfeo, the Boulder**, **Angelic Purge**, **Unbreakable Bond**, **Cinderhaze Wretch**, **Barrenton Medic**, **Status // Statue**, **Sinking Feeling** and **Ragnarok, Divine Deliverance**. Disrupt Decorum goads every creature the other players control. Devoted Druid (and Cinderhaze Wretch, Barrenton Medic, and a creature under Sinking Feeling) can put a -1/-1 counter on itself to untap — the counter goes on as you activate, so the second one kills a Druid before it untaps; the computer opponents never spend it. Shalai gives you, your planeswalkers and your other creatures hexproof. Triumph of the Hordes and Titanic Ultimatum pump and grant their keywords to your whole team (infect makes Triumph's damage to players poison). Fracture destroys an artifact, enchantment or planeswalker; Angelic Purge, Zuko's Exile and Statue exile or destroy an artifact, creature or enchantment. Brass's Bounty makes a Treasure for each land you control, and Moogles' Valor a Moogle for each creature, then makes your creatures — the new Moogles too — indestructible. Persist returns only a nonlegendary creature card, with a -1/-1 counter on it; Unbreakable Bond's creature returns with a lifelink counter. Unmarked Grave finds any nonlegendary card. Bulk Up, Unleash Fury and Mr. Orfeo double a creature's power. Time Warp and Beacon of Tomorrows give an extra turn to the player you choose. Also fixed: after an extra turn taken after someone else's turn (Nexus of Fate cast in an opponent's turn, an extra turn given to another player), the turn order now continues where it left off instead of giving the next turn to the wrong player.

### Changed
- **The automatic payment now keeps Cavern of Souls, Mech Hangar and the other lands with a restricted mana ability untapped until last.** When a spell or ability can't use the land's special mana — a creature that isn't the type Cavern of Souls named, anything but a Pilot or Vehicle with Mech Hangar, anything but a colorless Eldrazi with Eldrazi Temple — the automatic payment used to tap that land's colorless mana first. It now pays with your other lands, artifacts and creatures first and taps the land only when nothing else can pay, so the land is still untapped for the spell it is for: a Slivers deck that pays for a sorcery with its other lands can still cast a Sliver off **Secluded Courtyard** that turn. Spells the land's special mana is for use it as before, and nothing you could cast before becomes uncastable. This covers 28 cards, including **Plaza of Heroes**, **Secluded Courtyard**, **Unclaimed Territory**, **Sliver Hive**, **Maelstrom of the Spirit Dragon**, **Turtle Lair**, the villages from Bloomburrow and **Tablet of Discovery**'s red mana, for you and for the computer opponents alike. Keeping the land back has a cost the payment can't yet weigh: it can leave a later spell without a color it needs when the land kept back can't make that color for that spell, and it may tap **City of Brass** or a painland, which cost life, before the land.
- The app's bundled Node.js runtime moves to **Node 24**: **v24.22.1**, the newest Node 24 LTS release (it was v22.23.3). Node 22 reaches end of life on 2027-04-30; Node 24 is supported until 2028-04-30. Importing decks from Moxfield works as before, and games play out exactly as they did on Node 22.
- **The app's four typefaces (Space Grotesk, Inter, JetBrains Mono and Cinzel) now ship inside the app's own source** instead of being downloaded from Google Fonts each time the app is built, so building MTG Tool needs no font download and a release can no longer fail on one (v0.164.0 and v0.165.0 each needed a second build attempt for that reason). They are the same font files the app already displayed, each with its SIL Open Font License. Only their basic Latin character set is included, so a letter outside it, such as the "ō" in Hamato Ninpō, now displays in the system fallback font.

### Fixed
- **A computer opponent playing The Unbeatable Squirrel Girl no longer doubles its Squirrels over and over at the end of the turn before its own until the game stops.** Since the computer opponents began spending leftover mana at the end of the turn right before theirs, the Squirrel Girl seat used "I LOVE Squirrels!" there even with lethal already on the battlefield — in one seeded game four times in a row, making 160, then 320, 640 and 1,280 Squirrels, until one player controlled more than 2,000 permanents and the game stopped with "The engine got stuck". The rule its main phase already followed — build only until the board is lethal, by combat or by a sacrifice outlet like Altar of Dementia or Goblin Bombardment, then stop and finish — now holds at every moment it can act: short of lethal it still builds at that end step, and once there is enough it waits and attacks on its turn.
- **Academy games are saved as you play again, and a save that fails now tells you.** Since v0.161.0 the app never wrote an Academy game to disk: saving stopped at the engine build stamp, which could not read the app's version once the app was bundled, and the failure was silently ignored. A game in progress was lost when the app restarted, no new game appeared in the "Continue a game" list, **Save as puzzle** failed, and the Crucible's in-app grind stopped as soon as it started. Every move is saved again. If a save ever fails, your game goes on and a small notice under the life totals says "Autosave failed — your game may not survive a restart." (a finished game whose record can't be kept says so too); close it with ×.
- **Protection now stops an ability whose source is gone, and Giver of Runes' protection from colorless now does something.** An ability whose source had left the battlefield — **Executioner's Capsule**, sacrificed to activate it, or a **Royal Assassin** destroyed in response — was treated as colorless when it resolved, so protection never stopped it: Executioner's Capsule destroyed a creature that had gained protection from black in response. Now the game remembers the color the source had as it left (and whether it was a creature) — a colorless **Neurok Replica** made red by **Crimson Wisps** is red — and protection from that color makes the ability do nothing to that creature; **Perilous Myr**'s dies trigger can no longer target a creature with protection from creatures. Protection from colorless — **Giver of Runes**' extra choice — is now enforced like a color: colorless spells and abilities (**Rod of Ruin**, **Aether Spellbomb**) can't target the creature and a colorless Equipment (**Bonesplitter**) can't be attached to it, damage from colorless sources (**Matter Reshaper**, **Surtland Frostpyre**) is prevented, and colorless creatures (**Ornithopter**) can't block it. A black Executioner's Capsule still destroys a creature with protection from colorless — it was black as it left. Mother of Runes and Giver of Runes, yours and the computer's, now answer these threats with the color that stops them: black against the Capsule, colorless against Rod of Ruin. An Aura or Equipment already attached to a creature that gains the protection still stays attached.
- **A blocked creature without trample now deals all of its combat damage to the creatures blocking it.** It used to deal each blocker only the damage that destroys it and lose the rest, so a 5/5 with lifelink blocked by a 2/2 gained you 2 life instead of 5 — the ruling for **Vampiric Link** says "If you put this on a 5/5 and it is blocked by a 1/1, you still gain 5 life." Lifelink, **Exalted Angel**, **Spirit Link**, **Vampiric Link**, the Blood tokens of **Olivia's Attendants** and every other "that much" damage ability now count the full amount, and a blocker that survives the damage or answers it (**Spitemare**, **Boros Reckoner**, an indestructible creature) is dealt all of it. When two or more creatures block, each still gets the damage that destroys it first, in the order they blocked, and the rest goes to the last of them whose damage isn't prevented by protection, a shield counter or a prevention effect. Trample works as before: the rest goes to the player. A blocker that is assigned no damage no longer loses its shield counter.
- **Essence Sliver now gains life for all the damage a Sliver deals.** "Whenever a Sliver deals damage, its controller gains that much life." only counted combat damage dealt to a player: a Sliver's damage to a creature blocking it or blocked by it, and its damage in a fight, gained nothing. Now any Sliver's damage gains its controller that much life, once for everything that Sliver deals at the same time.
- **A payment that sacrifices a mana source and also taps it for another mana ability no longer stops the game with an error.** When the automatic payment used a permanent that sacrifices itself for mana without tapping — **Rith's Attendant** and the other Attendants ("{1}, Sacrifice this creature"), **Wild Cantor**, **Verdant Eidolon**, a **Gold** token, an **Eldrazi Spawn** — and also tapped that same permanent to pay for another mana ability — **Urza, Lord High Artificer**'s "Tap an untapped artifact you control: Add {U}.", **Springleaf Drum**, **Loam Dryad**, **Supportive Parents** — it could sacrifice the permanent first and then not find it to tap, and the game ended in an error (a Gold token and Urza paying for **Baleful Strix**, Wild Cantor and Springleaf Drum paying for **Yavimaya Barbarian**). Now the permanent is tapped for the other ability first and sacrificed after, the way you would do it at the table, and the payment goes through. Which costs you can pay is unchanged.
- **You now choose the color for "protection from the color of your choice" — as it resolves, with the threat's color suggested — and the computer opponents pick the color of the spell or ability they are protecting against.** **Mother of Runes**, **Giver of Runes**, **Benevolent Bodyguard**, **Moonlit Strider**, **Armored Guardian**, **Sygg, River Guide**, **Gods Willing**, **Shelter**, **Blessed Breath**, **Center Soul**, **Emerge Unscathed** and **Sejiri Shelter** picked the color for you, and for the computer, as the color most common among the opponents' permanents: in response to a red **Lightning Bolt**, Mother of Runes could give your creature protection from green, and it died. The color is chosen as the ability or spell resolves, knowing what is on the stack. In the Academy you now pick it from the five colors (Giver of Runes adds colorless), and the color of an opponent's spell or ability that targets your creature or would deal damage to it — Lightning Bolt, **Pyroclasm**, **Prodigal Pyromancer**'s ability — is marked as the suggestion. A computer opponent takes that color itself, and the board's most common color only when nothing on the stack threatens the creature. A threat that protection doesn't stop in the game is never suggested and never answered (colorless threats and abilities whose source was sacrificed are stopped since the protection fix above). **Midvast Protector** and **Sejiri Steppe** still don't use their enters ability.
- **A payment no longer taps the same permanent twice.** When a payment combined a mana ability that taps another permanent you control — **Urza, Lord High Artificer**'s "Tap an untapped artifact you control: Add {U}.", **Supportive Parents**, **Survivors' Encampment**, **Springleaf Drum** — with a source that needs mana to activate, like a **Signet**, **Rumble Arena** or **Loot, the Pathfinder**'s exhaust, the automatic payment could tap a permanent it had already tapped earlier in the same payment: Urza tapped the **Gruul Signet** the payment had just used, so a Mountain, a Gruul Signet and Urza looked able to pay {G}{U}, and Urza could even tap the Signet to pay the Signet's own {1}. Spells and abilities were offered — to you in the Academy and to the computer opponents — that the board couldn't actually pay for. Now each permanent is tapped at most once per payment, so those costs are no longer offered, and a payment never taps a permanent that is already tapped. On a few boards the payment could still be made by having a different permanent pay for Urza or Springleaf Drum; the automatic payment doesn't find that choice yet, but you can still tap your sources by hand first.
- **"Until your next turn" now lasts exactly until a departed player's turn would have begun, and the turns around a departure come in the right order.** When the player who cast **Reflector Mage** left the game, its lock on casting the returned creature never ended; when **Lightning, Army of One**'s controller left, its damage doubling stopped at once. Both now last until the turn that player would have taken would have begun, like a detain or a goad. That moment now follows extra turns: an extra turn the next player takes first (**Time Warp**) no longer ends a departed player's detain or goad early, and an extra turn already coming to the player who left counts as their next turn. When the active player leaves while another player's extra turn is waiting, that extra turn now comes next instead of the next seat's turn, and no player gets two turns in a row after someone leaves during an extra turn; if the player whose turn the extra turns followed leaves, play resumes with the seat after theirs. A creature goaded by a permanent's ability (**Jeering Homunculus**) keeps avoiding the player who goaded it after another player takes control of that permanent.
- **The computer opponents now use their activated abilities in response to your removal, after blockers are declared, and at the end of the turn before theirs.** When you aim removal at one of their creatures, a computer opponent answers with an ability that saves it: **Selfless Savior** or **Selfless Spirit** giving indestructible against **Murder**, **Wolverine, Best There Is** regenerating, **Mother of Runes** or **Giver of Runes** when the color it will choose is the removal's color (it still picks the color most common among its opponents' permanents, so it holds the ability when that color wouldn't help). It sacrifices a creature for this only to save a bigger one, or when the one it sacrifices is about to die anyway; never against a bounce or an exile indestructible can't stop, and answers each removal once. After blockers are declared, it pumps a creature in combat when that changes the fight: **Nylea, God of the Hunt**'s +2/+2 on a blocker that then survives and kills the attacker, **Kessig Wolf Run** at the smallest X that tramples over for lethal (counting the life a lifelink blocker gains), **Scourge of Valkas** breathing fire, **Purphoros, God of the Forge** or **Castle Embereth** only as many times as the result needs; never when nothing changes, and it keeps the mana for an instant it's holding unless the pump wins the game. And at the end of the turn right before its own, it spends the mana that untaps a moment later on a draw or a token (**Archivist**, **Spectral Sailor**, **Biogenic Ooze**), but not on an ability that gives every player a card, not by sacrificing Treasures, and not when that would leave a **Counterspell** in its hand without mana.
- **"Until your next turn" now ends as that turn begins.** Detain, goad, **Kardur, Doomscourge**'s attack rule and **Savage Order**'s indestructible lasted until the end of their controller's next turn instead of ending as it began. A creature detained by **Azorius Arrester**, **Lyev Skyknight** or **Martial Law** could not block on the detainer's own turn, and its activated abilities stayed locked; a goaded creature stayed goaded; Savage Order's Dinosaur stayed indestructible through your whole next turn. Now each ends as its controller's next turn begins, before anything untaps. If that player leaves the game, the effect lasts until the turn they would have taken would have begun; before, it never ended.
- **Paying for a spell or ability no longer taps your creatures for mana when your other mana sources can pay.** The automatic payment tapped sources largely in the order they came onto the battlefield, so a creature that makes mana was tapped as readily as a land: a computer opponent paid for **Preposterous Proportions** with five Forests it had turned into creatures — 42 power it meant to attack with — while nine plain lands sat untapped, and a **Fanatic of Rhonas** paid for a creature spell and then couldn't attack. Now the payment uses your lands, artifacts and other sources first and taps a creature — a mana creature like **Llanowar Elves**, a land that has become a creature, a creature **Springleaf Drum** taps — only for what nothing else can make: **Birds of Paradise** still pays for a white spell when your other land is a Forest, and a creature that makes colorless mana, like **Palladium Myr**, is no longer tapped ahead of your lands. A creature whose mana can only be spent on certain spells — **Codsworth, Handy Helper**'s mana for Auras and Equipment — still pays for those spells as before, keeping your lands free for everything else. This applies to your own casts in the Academy and to the computer opponents alike, and it changes only which sources are tapped: everything you could pay for before you still can, and nothing new becomes payable.
- The computer opponent now counts trample and double strike when it defends. It used to think a blocked creature dealt it nothing and a double striker hit once, so it chump-blocked a **Colossal Dreadmaw** with a 1/1 that kept off a single point of damage while the **Hill Giant** beside it dealt the lethal rest, let a **Wrecking Ogre** through at a life total its two hits take, and held its **Fog** while your trampler trampled over its blocker for the kill. Now each chump is worth the damage it actually keeps off, and it chumps where that saves it. It also stops keeping creatures home that can't save it: when one opponent's next attack would kill it however it blocks, it attacks with them instead of waiting.
- **The computer opponents no longer pump an attack with mana from the creatures that were going to attack, and they now use their blink abilities.** Before combat, a computer opponent casts a pump spell only when it makes its attack lethal, but it counted the creatures its own payment would tap: with **Thrun, Breaker of Silence**, **Birds of Paradise** and **Fanatic of Rhonas** out, it cast **Tyvar's Stand** paying for X with the Birds and the Fanatic, and Thrun attacked alone, 1 short. Now it judges the attack the cast leaves behind: it picks an X that keeps the attacker it needs untapped (X=2 from three Forests with a **Paradise Druid** still attacking, where X=3 would tap the Druid), and keeps the pump when no X is enough. It also counts trample and double strike for these pumps, as it already did for its attacks. And it now activates **Distinguished Conjurer**, **Eldrazi Displacer**, **Nephalia Smuggler**, **Lilysplash Mentor** and **Emiel the Blessed** on its own creature when that creature's enters ability is worth repeating — **Mulldrifter**'s two cards, **Flametongue Kavu**'s 4 damage to one of your creatures — after combat, or before it on a creature that wasn't going to attack; never a token, a creature that would lose its +1/+1 counters, or one that would go back to you, and each creature at most once a turn.

## [0.168.0] - 2026-10-20

### Added
- **The Gitrog Monster**, **Prismari Command**, **Elixir of Immortality**, **Eldrazi Monument**, **Rites of Flourishing**, **Drana, Liberator of Malakir**, **Abstergo Entertainment**, **Diregraf Colossus**, **Fierce Empath**, **Ruby, Daring Tracker** and **Kona, Rescue Beastie** now play their whole text, along with **Golgari Grave-Troll**, **Golgari Raiders**, **Treasure Mage**, **Brigid's Command**, **Gravedig**, **Fuss // Bother**, **The Stasis Coffin**, **The Echoverse Fulcrum**, **Moon-Boy, Dino Rider** and **Kirk, Enterprising Captain**. The Gitrog Monster asks for a land at your upkeep and is sacrificed if you don't give one (the land it takes draws you a card). Prismari Command's, Brigid's Command's and Gravedig's "target player creates …" can give the token to any player, under that player's control. Elixir of Immortality shuffles itself and your graveyard into your library (itself into its owner's, if you took it from someone). Eldrazi Monument makes you sacrifice a creature each upkeep, and sacrifices itself only when you have none. Rites of Flourishing lets every player play an extra land each turn. Drana puts a +1/+1 counter on each creature still attacking after her first-strike damage, so the others hit harder in the regular damage step. Diregraf Colossus and Golgari Grave-Troll enter with a counter for each Zombie card (a changeling counts) or creature card in your graveyard — returned from the graveyard, they count themselves. Fierce Empath and Treasure Mage find only cards of mana value 6 or more. Abstergo Entertainment, The Stasis Coffin and The Echoverse Fulcrum can be exiled to pay for their last ability, Ruby and Moon-Boy get their bonus only if you control the right creature as they attack, and Kona's survival works only while Kona is tapped.
- **Restoration Angel**, **Felidar Guardian**, **Soulherder**, **Flicker of Fate** and **Planar Incision** now play their whole text, along with **Wispweaver Angel**, **Spaceshift**, **Eldrazi Displacer**, **Distinguished Conjurer**, **Nephalia Smuggler** and **Lilysplash Mentor**. Restoration Angel blinks only a non-Angel creature you control (never a changeling, which is every creature type). Felidar Guardian can blink any other permanent you control, a land or an artifact included. Flicker of Fate and Planar Incision can blink any player's creature (and enchantment, or artifact): it comes back under its owner's control as a new object, so its counters and damage are gone and an Aura on it falls off; an Aura blinked this way chooses what it enchants as it returns. Planar Incision's +1/+1 counter is put on as the card returns, so Hardened Scales adds one more. Eldrazi Displacer's creature comes back tapped. Soulherder gets a +1/+1 counter whenever any creature is exiled from the battlefield — including by its own end-step blink, a token, or a creature that would die under Rest in Peace — but not when a creature dies or is returned to a hand.
- **Creeping Bloodsucker**, **Bane of Progress**, **Disciple of Bolas**, **Twilight Prophet**, **Swarmyard** and **Accursed Duneyard** now play their whole text, along with **Corrupt**, **Rite of Consumption**, **Enter the God-Eternals**, **Syphon Soul**, **Whiptongue Hydra**, **Fracturing Gust**, **Paraselene**, **Multani's Decree**, **Righteous Fury**, **Animal Sanctuary**, **Mirkwood**, **Corsairs of Umbar**, **Undead Slayer** and **Slayer of the Wicked**. "You gain life equal to the damage dealt this way" gains the damage that was actually dealt — damage that was prevented gains nothing, and damage that was doubled or moved to another creature counts in full. Bane of Progress grows by the number of artifacts and enchantments it actually destroyed (not an indestructible one). Disciple of Bolas must sacrifice another creature if you control one, and gains life and draws by its power. Twilight Prophet's upkeep drain needs the city's blessing. Swarmyard, Accursed Duneyard and the other cards that name a list of creature types ("target Insect, Rat, Spider, or Squirrel") are offered only creatures of those types. Also fixed: an ability that targets "a Beast creature you control", "a Merfolk you control" and the like (Advocate of the Beast, Sygg, River Guide, Jade Bearer, Stromkirk Mentor and others) could target any creature you control.
- **Rooftop Storm**, **Dracogenesis**, **Darksteel Monolith** and **As Foretold** now play their whole text. Rooftop Storm lets you cast Zombie creature spells for {0} instead of their mana cost, Dracogenesis your Dragon spells, Darksteel Monolith one colorless spell from your hand each turn, and As Foretold one spell each turn whose mana value is no more than its time counters (it gets one each upkeep). The cheaper cast is offered beside the normal one, from your hand. A card that makes spells cost more still applies — under Sphere of Resistance the {0} is {1} — and a spell with {X} in its cost isn't offered it (X would have to be 0).
- **Lord Skitter, Sewer King**, **Song of Totentanz**, **White Sun's Twilight**, **Skrelv's Hive**, **Bitterbloom Bearer**, **The Locust God**, **Liesa, Forgotten Archangel** and **Stormfist Crusader** now play their whole text, along with 17 cards that make the same tokens (**Voracious Vermin**, **Basilica Shepherd**, **Crawling Chorus**, **Mirrex**, **Rat Out**, **Charge of the Mites**, **Infested Fleshcutter** and others). A token created "with 'This token can't block.'" — the Rats, Satyrs and Fungi, and the Phyrexian Mite with toxic 1 — is never offered as a blocker, and an unblocked Mite gives the player it damages a poison counter. Song of Totentanz gives haste to the creatures you control as it resolves, its Rats included, but not to creatures that arrive later that turn. White Sun's Twilight gains you X life before making its Mites, and at X of 5 or more destroys every creature except those Mites. Skrelv's Hive gives your creatures with toxic lifelink while an opponent has three or more poison counters. Bitterbloom Bearer and Skrelv's Hive make you lose 1 life and then create their token at your upkeep. The Locust God returns to its owner's hand at the beginning of the next end step after it dies (that turn's, if it died before the end step), and Liesa does the same for your other nontoken creatures that die; a card that has left the graveyard by then stays where it is. Stormfist Crusader makes each player draw a card and then lose 1 life at your upkeep.
- **Helm of Awakening**, **Defense Grid**, **Aura of Silence**, **Temur Battlecrier**, **It That Heralds the End**, **Animar, Soul of Elements**, **Krosan Drover**, **Spectacle Mage**, **Herald of War**, **Mindsplice Apparatus**, **Sami, Wildcat Captain** and **Sokka, Swordmaster** now play their whole text. Helm of Awakening makes every player's spells cost {1} less, not only its controller's. Defense Grid makes each spell cost {3} more except on its caster's own turn, and Aura of Silence makes opponents' artifact and enchantment spells cost {2} more (an artifact enchantment pays it once). It That Heralds the End, Krosan Drover and Spectacle Mage discount spells by their mana value ("mana value 7 or greater", and so on), reading the spell's mana value rather than the cost being paid. Animar, Herald of War and Mindsplice Apparatus discount by the counters on them, Temur Battlecrier by your creatures with power 4 or greater (on your turn only), Sokka by your Allies, and Sami gives your spells affinity for artifacts. Every discount lowers only generic mana, and the cost is fixed before you pay, so Animar's own counter for a creature spell lowers only the next one.

### Fixed
- **Activated abilities can be used at instant speed, as the rules allow.** An activated ability can be activated whenever you have priority unless its text says otherwise, but the game only offered them in your own main phase. Now, in the Academy, you can sacrifice a creature to **Viscera Seer** in response to removal on your opponent's turn, give a creature protection with **Mother of Runes** in response to a **Lightning Bolt**, pump an attacker with **Kessig Wolf Run** after blockers are declared, cycle a card at the end of your opponent's turn, crew a Vehicle to block, and move **Cranial Plating** at instant speed. Abilities that say otherwise keep their timing: "Activate only as a sorcery", Equip and Reconfigure, level up, transmute and loyalty abilities stay in your main phase with an empty stack; "Activate only during your turn" (**Vona, Butcher of Magan**) is now checked on its own and stays off your opponents' turns; "before attackers are declared" also opens in your upkeep and draw step; and nothing is offered while blockers are being declared. During the turn of a player who controls **Grand Abolisher** or **Myrel, Shield of Argive**, that player's opponents are offered no activated abilities (the cards forbid those of artifacts, creatures and enchantments; for now a land's abilities and cycling are held back too). The computer opponents still decide their activations in the same moments as before.
- **The computer opponents no longer aim a spell or ability where a ward will counter it, and a copy of a spell or ability now pays the ward on its targets.** A computer opponent used to aim its removal at the biggest creature even when that creature's ward would counter the spell: **Murder** went at a **Vein Ripper** (its ward — sacrifice a creature — is a cost the game can't take yet, so the spell is countered) with a **Grizzly Bears** beside it; with four Swamps it cast Murder at a **Leonin Lightbringer** whose {2} it could no longer pay once Murder was paid for; **Ob Nixilis Reignited** spent three loyalty on a −3 the ward countered. Now it checks whether it can still pay the ward after paying for the spell or ability itself, takes another target when it can't, and keeps the card when every target would counter it; a ward it can pay is still paid when that target is the best one. And a copy — **Twincast** or **Reverberate** with a new target or the same one, a storm copy, a copy made by **Illusionist's Bracers** or **Strionic Resonator** — is a new spell or ability aimed at those permanents, so an opponent's ward now asks its controller to pay for the copy too (before, the copy resolved for free).
- The computer opponent now counts trample and double strike when it works out how much damage an attack deals. It used to count a blocked creature as dealing nothing and a double striker as hitting once, so it missed lethal attacks — a **Colossal Dreadmaw** trampling over a chump blocker, a **Skyspear Cavalry** hitting twice — and judged its own safety without the trampler or double striker you could swing back with next turn, sometimes sending creatures it needed at home. It still never counts on more damage than your best blocks would let through: a first striker that kills a trampler before it deals damage stops all of it. When it considers attacking one of your planeswalkers, a trampler's excess now reaches the planeswalker, and a small deathtouch blocker that would trade with one of its attackers no longer rules that attacker out — the computer weighs the trade against what the planeswalker is worth, as it already did for attacks on you.
- In the Academy you now choose the order of your own triggered abilities when several trigger at once. They used to go on the stack in the order they triggered, so with **Cathars' Crusade** out, **Attended Knight**'s Soldier token always arrived before the Crusade's counters and got two of them; now a panel lists your abilities in the order they will resolve, the top one first, and you move them with ▲▼ and press Done (Done alone keeps the order they triggered in). When some of them need targets, you choose the order first and then the targets, ability by ability. Identical copies of one ability — **Panharmonicon** making **Soul Warden** trigger twice — ask nothing, the opponents' abilities still go on the stack in turn order around yours, and Expert (where the game plays your seat) and the computer opponents order theirs as before.
- **Ward is finished: every ward is asked, every ward cost is read as printed, and paying it no longer costs you priority.** A planeswalker's loyalty ability aimed at an opponent's ward creature now asks for the ward — **Chandra, Torch of Defiance**'s −3 at a **Leonin Lightbringer** has to pay {2} or it is countered (the same for **Diffusion Sliver**). A spell aimed at two ward permanents asks for both at once — **Into the Void** at a Leonin Lightbringer and an **Owlin Shieldmage** costs {2} and 3 life, or it is countered; before, it went through for free. The costs read as printed: **Titania, Rugged Rumbler**'s "discard a card or pay {2}" lets you choose either (a button for each), **Alpharael, Stonechosen**'s "discard a card at random" discards at random, **Captain Howler, Sea Scourge**'s "{2}, Pay 2 life" takes both, **Phyrexian Fleshgorger** asks life equal to its power, **Minthara, Merciless Soul**'s ward {X} counts the experience counters, **Iymrith, Desert Doom** has ward only while untapped and **The Tarrasque** only when it was cast, and a ward an Equipment grants (**Plate Armor**) is asked as well as the creature's own. A ward cost the game can't take yet — a sacrifice (**Vein Ripper**), poison counters, collect evidence — now counters the spell or ability, as not paying does, instead of letting it through for free. A spell redirected onto an opponent's ward permanent (**Misdirection**) is asked for that ward. After you pay a ward on a spell you cast in an opponent's turn, you still hold priority, as you do after casting any spell; before, the active player got to act first. And the question now says "Ravenous Chupacabra's ability will be countered" for an ability, not "Ravenous Chupacabra will be countered".
- **A spell cast without paying its mana cost now pays the tax on it, and a tax on a target no longer eats your discounts.** Casting a spell for free — from **discover** or **cascade**, an Expertise card, a plotted card — or for an alternative cost that uses no mana, like **Fireblast**'s two Mountains, **Gush**'s two Islands or **Force of Will**'s pitch, still counts the cost increases on the table, as the rules say: under **Thalia, Guardian of Thraben** or **Sphere of Resistance** it costs {1}. The game used to take that cast away entirely; now it is offered with the {1} to pay, and taken away only when you can't pay it (you may tap a Mountain for it before sacrificing it to Fireblast). The cast option now says what it costs ("pay {1}"). **Boreal Elemental**, **Sphinx of New Prahv** and **Syr Elenora**'s "{2} more" now counts before your cost reductions, as Boreal Elemental's ruling says, so **Unsummon** aimed at Boreal Elemental with two **Goblin Electromancers** out costs {U}, not {2}{U}; a free spell aimed at one now pays the {2} instead of not being offered. And the computer opponents now cast a spell for the cheapest cost they are offered: a Dragon for nothing with **Dracogenesis** out (it used to pay the full price), a big spell for **Fist of Suns**' five colors when that is cheaper, and **Darksteel Monolith**'s once-a-turn free cast on the most expensive spell it can use it for.
- The computer opponent no longer treats a deathtouch blocker as a free kill of a bigger attacker. A deathtouch creature that blocks a bigger creature usually dies too, and it can block only one attacker, so the computer now weighs each possible block as a trade — what it would lose against what you would lose: two Zombie tokens now attack past a lone **Typhoid Rats**, and a big creature such as **Old Gnawbone** or **Avenger of Zendikar** joins a wide attack into a single **Atraxa, Praetors' Voice** when the damage that gets through is worth the trade. It still keeps a valuable creature home when a small deathtouch blocker would trade with it for little.
- The computer opponents no longer have some of their moves silently undone. A guard that stops the game from repeating a move that does nothing judged moves by a short list of counts, so a move that changed the board without touching any of them was thrown away: turning a manifested creature face up by tapping lands, a second block by a creature that can block more than one (**Palace Guard** blocking two attackers took the second hit instead), and finishing **Etali, Primal Storm**'s free casts — when Etali exiled only cards the computer chose not to cast, its choice never closed, and from then on nobody could do anything but cast those exiled cards. The guard now compares the whole game before and after the move.
- **Ward now applies to triggered abilities too.** When an opponent's triggered ability targets a permanent with ward — **Ravenous Chupacabra**'s "destroy target creature an opponent controls" aimed at a **Leonin Lightbringer** — its controller has to pay the ward cost or the ability is countered, as the rules say and as the game already did for spells and activated abilities. Before, a triggered ability went through for free. Every ward the game handles counts: mana (Ward {2}), life (**Owlin Shieldmage**'s "pay 3 life") and discard (**Spectral Snatcher**). When your own triggered ability targets an opponent's ward permanent you are asked whether to pay, after you've chosen the targets of everything that triggered with it; your abilities that target your own permanents are never taxed. A spell and its cast trigger aimed at the same ward creature now ask for both payments. The computer opponents no longer aim a triggered ability at a ward permanent they can't pay for when another target is available.
- **Crewing a Vehicle now uses the stack, and every player gets a chance to respond to an ability activated from a graveyard.** Crew used to turn the Vehicle into a creature the moment the crew was tapped, so nobody could answer it before it was one, and **Mobilizer Mech**'s "whenever this Vehicle becomes crewed" triggered as the crew tapped. Now the crew taps as the cost, the crew ability goes on the stack, and every player gets priority — an opponent can **Shatter** the Vehicle in response, and the crew stays tapped — before the Vehicle becomes a creature as the ability resolves, which is also when Mobilizer Mech's ability triggers. **Reassembling Skeleton**'s return and **Halo Scarab**'s Treasure, activated after some players had already passed, used to resolve without those players getting priority again; now, as after any other activated ability, the player who activated it gets priority back and every other player gets priority before it resolves.
- In the Academy you now choose the targets of your own triggered abilities. When an ability of yours triggers and needs a target — **Ravenous Chupacabra**'s "destroy target creature an opponent controls", **Twinshot Sniper**'s 2 damage to any target — the game asks you which target, instead of choosing for you; an "up to one" target (**Chomping Changeling**) can be left empty, and a modal ability (**Knight of Autumn**) lets you choose its mode. When several of your abilities trigger at once you are asked for each in the order they go on the stack. An ability with only one legal choice still goes on the stack without a question, Expert (where the game plays your seat) is unchanged, and the computer opponents choose for their own abilities as before.
- A spell's total cost is now worked out in the order the rules give: start from its mana cost (or the alternative cost you're paying), add kicker and other additional costs, the commander tax and anything that makes it cost more, and only then take off the reductions. Reductions used to come off first, so one bigger than the spell's generic mana was lost: **Burst Lightning** kicked under **Helm of Awakening** cost {4}{R} instead of {3}{R}, **Everflowing Chalice** kicked twice cost {4} instead of {3}, Spark Harvest's "pay {3}{B}", strive and Spree modes paid in full, and an {X} spell paid its whole X — **Gargos, Vicious Watcher** now takes {4} off every Hydra's X, and **Goblin Anarchomancer** reaches **Tyvar's Stand**'s. "Spells with mana value N or greater" (**Spectacle Mage**, **It That Heralds the End**, **Krosan Drover**) now count the X you choose, as their rulings say, and a larger X they make cheaper is offered even when a smaller one isn't affordable. Alternative costs — **Fist of Suns**' five colors, a Bringer's, a Trap's, bestow, emerge — now get the reductions as well as the increases. And never cheaper than the rules allow: a flashback spell's discount is judged on its own mana value, not its flashback cost (**Moan of the Unhallowed** was {1} cheaper under Spectacle Mage); emerge pays the increases (**Elder Deep-Fiend** under **Sphere of Resistance**); a spell cast without paying its mana cost (discover, cascade) is no longer cast bestowed, or with an extra mana payment or a second strive target it never paid for, and is not offered at all while something like **Thalia, Guardian of Thraben** makes it cost {1}, nor is **Fireblast**'s sacrifice; and Fist of Suns' five colors no longer replace an extra cost the spell still owes.
- **After blockers are declared, the attacking player now gets to act.** The game used to move on toward combat damage as soon as the defending player finished blocking, so the attacker never had a chance to cast a trick like **Giant Growth** on a blocked or unblocked creature once it could see the blocks, and in a four-player game the players seated before the defender never saw the blocks either. Now, as the rules say, the blocks are declared first, abilities that trigger on them go on the stack, and the attacking player gets priority, then each other player in turn. Nobody can cast spells while blockers are being declared any more (the attacker could before any block existed, and the defender in the middle of its own blocks), and no creature can be added as a blocker after the blocks are done. In simulated games the computer now casts its combat tricks as the attacker too — **Crumb and Get It**, **Tamiyo's Safekeeping**, **Tyvar's Stand**, **Blacksmith's Skill**, **Divine Resilience** and **Ephemeral Shields** were each cast on a blocked attacker in the test batch.
- The computer opponent no longer keeps its whole board home because one of your creatures could block any one of its attackers. Each creature blocks only one attacker, so a wide board — a pile of tokens, say — now attacks together when the damage that gets through is worth more than the creatures your blockers can kill: in a simulated game it had kept thirteen creatures home against a single untapped Atraxa. It still sends its cheapest creatures first and keeps its commander and its valuable creatures out of a block that would kill them, still keeps blockers home when the counterattack would be lethal, and still attacks with only as many creatures as it can pay a Ghostly Prison-style tax for.

## [0.167.0] - 2026-10-18

### Added
- **Clock of Omens**, **Cryptbreaker**, **Lathril, Blade of the Elves**, **Whirler Rogue**, **Endbringer** and **Resplendent Angel** now play their whole text. A cost that taps other permanents of a kind — "Tap two untapped artifacts you control", "Tap three untapped Zombies you control", "Tap ten untapped Elves you control", "Tap another untapped Merfolk you control" — is paid with permanents of that kind as they are now (a changeling counts as every creature type, and creatures that came under your control this turn can pay); the card itself can be one of them unless its cost also taps it, and the engine picks a summoning-sick creature first and a mana source last. **Shimmer Dragon**, **Azami, Lady of Scrolls**, **Kumena, Tyrant of Orazca**, **Sunshot Militia**, **Gravespawn Sovereign**, **Sigil Tracer**, **Patron Wizard**, **Galecaster Colossus**, **Voice of the Woods**, **Catapult Master**, **Skirk Fire Marshal**, **Baylen, the Haymaker** and more play too. Lathril makes an Elf Warrior for each point of combat damage it deals to a player, as do **Living Hive**, **Elsha, Threefold Master**, **Tana, the Bloodsower**, **Shroofus Sproutsire**, **Scepter of Celebration** and **Pollenbright Wings** with their tokens; **Prosperous Bandit** makes that many tapped Treasures, and **Hornet Nest** makes an Insect for each point of damage dealt to it, even lethal damage. Endbringer, **Thundersong Trumpeter**, **Alchemist's Vial** and **Off Balance** stop the target creature from attacking or blocking for the turn (a creature already attacking or blocking stays in combat), and Resplendent Angel's ability gives it +2/+2 and lifelink until end of turn.
- **Marionette Master**, **Disciple of the Vault** and **Quill-Slinger Boggart** now play their whole text. Marionette Master makes the opponent you target lose life equal to its power whenever an artifact you control is put into a graveyard — including when the Master goes to the graveyard at the same time (a board wipe), or is removed before the ability resolves, using the power it last had. Disciple of the Vault lets you have the opponent you target lose 1 life whenever any artifact is put into a graveyard, even one destroyed together with it, and Quill-Slinger Boggart does the same whenever a player casts a Kithkin spell.
- **Raise the Palisade**, **Crippling Fear**, **Fumigate**, **Decree of Pain**, **Martial Coup**, **Army of the Damned**, **Fractured Sanity** and **Crackling Doom** now play their whole text. Raise the Palisade and Crippling Fear choose a creature type as they resolve (the type that spares the caster's creatures most, as Kindred Dominance does) and return to their owners' hands, or give -3/-3 until end of turn to, every creature not of that type; Fumigate gains you 1 life and Decree of Pain draws you a card for each creature it actually destroys (an indestructible or regenerated creature doesn't count, one exiled instead by Rest in Peace does); Martial Coup makes X Soldiers and, if X is 5 or more, destroys every other creature; Army of the Damned makes thirteen tapped Zombies; Fractured Sanity mills each opponent fourteen; Crackling Doom deals 2 damage to each opponent and each opponent sacrifices its creature with the greatest power (a tie is that player's choice). Instants and sorceries whose "When you cycle this card" trigger the engine plays now play natively too: Decree of Pain's -2/-2 and Fractured Sanity's mill of four when cycled, and **Renewed Faith**, **Stir the Sands**, **Solar Blast**, **Complicate**, **Primal Boost**, **Death Pulse**, **Deem Worthy**, **Sunfire Balm**, **Choking Tethers**, **Decree of Savagery**, **Resounding Wave**, **Resounding Thunder**, **Resounding Roar** and **Resounding Scream**. The same counts reach **Necrotic Hex** (six Zombies) and **Symbiotic Wurm** (seven Insects), Fumigate's text reaches **Avenge**, and Crackling Doom's sacrifice reaches **Consumed by Greed**. The AI now casts a spell that makes each opponent sacrifice a creature whenever an opponent has one, and holds the type sweeps and Fumigate-style wipes until it is clearly behind on the board.

### Fixed
- Damage and toughness changes from a spell or ability are now judged after it has finished resolving, as the rules say, instead of halfway through it. **Lightning Bolt** at a 2/3 **Tarmogoyf** no longer kills it when there is no instant in any graveyard: the Bolt is in the graveyard by the time the game checks, so Tarmogoyf is 3/4 and survives with 3 damage (its official ruling) — the same goes for **Polygoyf**, **Barrowgoyf**, **Pyrogoyf**, **The Duke of Midrange** and **Chimney Goyf**, for **Cognivore** and **Magnivore** when the spell is the kind they count, and for a spell that shrinks it, such as **Last Gasp**. The later parts of the same spell or ability now see the creature too: **Marauding Raptor** gets its +2/+0 when its 2 damage kills an entering Dinosaur, **Swift Demise**'s second step destroys the creature its 1 damage hit, and **Ember Shot** at your own **Psychosis Crawler** draws its card before the damage is checked. Creatures that should die still die, right after the spell or ability resolves, with their death triggers.
- The computer opponents now cast the targeted spells they used to keep in hand. Apart from damage spells and spells that destroy a creature, they never cast a spell that needed a target: **Swords to Plowshares**, **Path to Exile**, **Generous Gift**, **Beast Within**, **Assassin's Trophy**, **Anguished Unmaking**, **Vindicate**, **Nature's Claim** and **Dismember** sat in hand all game, and so did **Tamiyo's Safekeeping**, **Tyvar's Stand**, **Leap**, **Ephemerate** and **Cloudshift**. Now their removal goes at your most threatening nonland permanent that is worth a card — never a land, never a permanent the token it hands you back outweighs (**Beast Within** won't trade your Mind Stone for a 3/3), and on their own turn only in their main phase, so the mana their creatures need isn't spent in the upkeep. A protection spell or a blink answers your removal aimed at their creature, a blocker gets a pump when that wins the fight, flying or "can't be blocked" goes on an attacker you could otherwise block, a pump that makes the attack lethal is cast before combat, a token copy copies their best creature that isn't legendary, and a blink after combat re-buys a creature's enters ability. None of these is ever aimed at the wrong side.
- The computer opponent now attacks a planeswalker when taking it out is worth more than the damage those creatures would have dealt to a player. It used to attack a planeswalker only when the planeswalker's controller had no untapped creature at all, and then it threw its whole attack at one of them. Now a flyer that can't be blocked, an attack with more creatures than there are blockers, or a creature it was keeping home goes after a planeswalker it can finish even if its controller blocks; it attacks two planeswalkers in one combat when it can kill both; and a planeswalker that could use its ultimate on its controller's next turn is attacked to knock it below that cost even when it can't be killed. It still attacks the player when the attack would win, when the planeswalker isn't worth the damage, or when an attack tax (**Onakke Oathkeeper**, **Sphere of Safety**) can't be paid for every attack it would take.
- **Planeswalkers work again in game decks.** A planeswalker cast from a deck in the Academy or a simulated game resolved as nothing: the deck loader dropped its printed loyalty, so the game refused to put it onto the battlefield. It now enters with its loyalty and its abilities can be used.
- Creatures whose power and toughness are set by their own text — **Lumra, Bellow of the Woods**, **Tarmogoyf**, **Master of Etherium**, **Boneyard Wurm**, **Dakkon Blackblade**, **Crusader of Odric**, **Ulvenwald Hydra** and the other "*" creatures the game can count — now die like any other creature: lethal damage destroys them, and toughness 0 puts them into the graveyard. They used to survive any amount of damage (a Lumra carried 190) and stay on the battlefield as 0/0s. A "*" creature whose count the game can't read yet (**Treefolk Seedlings**, **Plague Rats**) is still never destroyed by a toughness it doesn't really have.
- **Voltaic Key**, **Manifold Key**, **Sonic Screwdriver**, **Filigree Sages**, **Galvanic Key** and **Voltaic Servant** now untap the artifact they target. "Untap target artifact" reported untapping a Sol Ring, a Mind Stone or an artifact creature while it stayed tapped.
- A card that taxes attacks now charges only the attacks its text names. **Propaganda**, **Ghostly Prison**, **Windborn Muse** and **Koskun Falls** say creatures can't attack *you*, so attacking a planeswalker their controller controls is free, as the cards' rulings say — it used to cost {2}, and without the mana the attack wasn't offered at all (a creature that must attack now attacks that planeswalker instead of staying home). **Baird, Steward of Argive**, **Archon of Absolution**, **Sphere of Safety** and **Norn's Annex**, which say "you or planeswalkers you control", still tax both. **Onakke Oathkeeper** now plays its whole text: attacking a planeswalker its controller controls costs {1} per creature, and attacking the player costs nothing.
- **Apex Altisaur** no longer fights forever. "Fights up to one target creature" lets its controller choose no target, and now it does whenever the fight gains nothing: Apex Altisaur, **Kogla, the Titan Ape** and the other "up to one" fighters fight only a creature the fight kills while they survive — or, for Apex Altisaur, one its enrage keeps fighting until it dies first (two fights finish **Unhallowed Phalanx**). An indestructible Apex Altisaur used to fight the same creature it could not kill thousands of times in one turn and stall the game, and an ordinary one fought a bigger creature and died to it. And once any triggered ability has resolved 300 times in one turn, its next target choice ends the loop — an optional target is skipped, otherwise a player is chosen over a creature — so two indestructible **Spitemare**s no longer send the damage back and forth forever.
- A card that triggers whenever something is put into a graveyard from the battlefield, or leaves the battlefield, now triggers for everything that leaves at the same time as it does, as the rules say. **Marionette Apprentice** destroyed by a board wipe together with an artifact creature drained nothing; it now drains for each of your other creatures and artifacts that went with it. The same goes for **Fangren Marauder**, **Moriok Rigger**, **Molder Beast**, **Summoning Station**, **Tablet of Epityr**, **Charforger**, **Exuberant Fuseling**, **Necrosquito**, **Forgehammer Centurion**, **Vat of Rebirth**, the enchantment watchers (**Wicked Visitor**, **Ashiok's Reaper**, **Knight of Doves**, **Savior of the Sleeping**, **Starfield Mystic**, **Neva, Stalked by Nightmares**), **Titania, Protector of Argoth**, and the "leaves the battlefield" watchers (**Nadier's Nightblade**, **Boomer Scrapper**, **Ninth Bridge Patrol**, **Flaming Fist Officer**, **The Ozolith**, **Rat King, Pale Piper**, **Splinter, the Mentor**, **Tokka & Rahzar, Unsupervised**) — Rat King returned to your hand with another creature now makes a Rat for each. A permanent that is flickered back is a new object that didn't see anything leave: **Ghostly Flicker** on Ninth Bridge Patrol and another creature used to give the returned Patrol two counters, and now gives it none. An Aura that falls off a creature bounced with the watcher still isn't counted, since it goes to the graveyard after the watcher has left.

## [0.166.0] - 2026-10-18

### Added
- **Hero of Bladehold**, **Elenda, the Dusk Rose**, **Elenda's Hierophant**, **Threefold Thunderhulk**, **Soul-Guide Lantern**, **Scavenging Ooze** and **Diregraf Captain** now play their whole text. Hero of Bladehold's two Soldiers enter tapped and attacking the player Hero attacks (they were never declared, so nothing that triggers on attacking sees them), as do the tokens from **Skyknight Vanguard**, **Hanweir Garrison**, **Mardu Ascendancy**, **Suki, Kyoshi Warrior**, **Captain's Claws**, **Falconer Adept**, **Carefree Swinemaster**, **Militia's Pride**, **Inexorable Blob** and **Launch the Fleet**. Elenda and Elenda's Hierophant make one lifelink Vampire for each point of power they had when they died (**Nested Shambler** its Squirrels, tapped), and Threefold Thunderhulk makes Gnomes equal to its power when it enters or attacks. Soul-Guide Lantern's enters trigger exiles a card from an opponent's graveyard — or, with only your own graveyard stocked, your least valuable card there — as do **Stonecloaker**, **Offalsnout**, **Ashnod's Harvester**, **Armored Scrapgorger** (and **Grixis Sojourners**, if you choose to). Scavenging Ooze exiles any graveyard card and grows and gains you life only when it exiled a creature card (likewise **Diregraf Scavenger**, **Raven Eagle** and **Ignis Scientia**), and Diregraf Captain drains an opponent whenever another Zombie you control dies, even one dying with it (also **Plague Belcher**, **Tegwyll, Duke of Splendor** and **Boggart Cursecrafter**). **Wickersmith's Tools** plays its whole text too (its sacrifice ability makes a tapped Scarecrow for each charge counter it had).
- **Dolmen Gate**, **Iroas, God of Victory**, **Crystal Barricade**, **Thalia, Heretic Cathar**, **Archon of Emeria**, **Harvester of Souls**, **Ogre Slumlord**, **Weftstalker Ardent**, **Haliya, Guided by Light** and **Glaring Fleshraker** now play their whole text. Dolmen Gate prevents all combat damage to your attacking creatures (a deathtouch blocker no longer kills them and a lifelink blocker gains nothing); Iroas prevents all damage to your attacking creatures, combat or not; Crystal Barricade and **Tajic, Legion's Edge** prevent noncombat damage to your other creatures — a sweeper that kills the Barricade still spares the rest — and **Mark of Asylum**, **Inner Sanctum**, **Bubble Matrix** and **Light of Sanction** work the same way. Each of these is applied in the order that leaves the least damage when another effect (such as Torbran) changes the same damage, and does nothing to combat damage while **Frenzied Baloth** says it can't be prevented. Thalia and Archon of Emeria make your opponents' nonbasic lands enter tapped (basic lands, snow basics included, still enter untapped). Harvester of Souls and Ogre Slumlord trigger whenever another nontoken creature dies, whoever controlled it — not on a token. Weftstalker Ardent and Haliya trigger on a creature or an artifact entering under your control (once for an artifact creature), and Glaring Fleshraker and **Flayer Drone** on another colorless creature entering, including the Eldrazi Spawn Fleshraker makes.
- **Burgeoning**, **Horn of Greed**, **Heliod, Sun-Crowned**, **Destiny Spinner**, **Ayara, First of Locthwain** and **Jhoira's Familiar** now play their whole text. Burgeoning lets you put a land card from your hand onto the battlefield whenever an opponent plays a land — only when they play one, not when an effect puts a land onto the battlefield — and Horn of Greed has whoever plays a land draw a card (the same trigger works on **Dirtcowl Wurm** and **Pangosaur**). Heliod puts a +1/+1 counter on a creature or enchantment you control whenever you gain life, and for {1}{W} gives another creature lifelink until end of turn (the same "another target creature gains …" works on **Trailblazing Historian**, **Hotfoot Gnome**, **Torch Courier**, **Gravity Negator**, and **Attended Healer** for another Cleric). Destiny Spinner keeps your creature and enchantment spells from being countered (**Sphinx of the Final Word** does the same for your instants and sorceries) and turns a land you control into an X/X Elemental creature with trample and haste until end of turn, X fixed as the ability resolves (also **Vastwood Animist**). Ayara drains each opponent for 1 whenever it or another black creature enters under your control, and draws a card when you tap it and sacrifice another black creature (**Homarid Spawning Bed** reads "sacrifice a blue creature" the same way); the same colored-creature trigger now works on **Ivy Lane Denizen**, **Sylvan Anthem**, **Court Street Denizen**, **Foundry Street Denizen**, **Sage's Row Denizen** and **Shadow Alley Denizen**. Jhoira's Familiar makes your artifact, legendary and Saga spells cost {1} less.
- Eight heavily played value creatures now play their whole text. **Wurmcoil Engine** dies into a 3/3 deathtouch Wurm and a 3/3 lifelink Wurm, created together (with Peregrin Took that's one extra Food, and a token doubler doubles each kind); the same "create this token and that token" wording works on **Triplicate Titan**, **Wurmcoil Larva**, **Trostani's Summoner**, **Somberwald Beastmaster**, **Specimen Collector**, **Forbidden Friendship**, **Mascot Exhibition** and **Bestial Menace**. **Archon of Cruelty** — on entering and on attacking, the opponent it targets sacrifices a creature or planeswalker, discards a card and loses 3 life, in that order, and you draw a card and gain 3 life; **Scarring Memories**, **Geth's Verdict** and **Umbral Juke** use the same reading. **Noxious Gearhulk** — you may destroy another creature, and you gain life equal to its toughness only if it was destroyed (not against indestructible; still yes if Rest in Peace exiles it). **Angel of the Ruins** (and **Sylvan Reclamation**) exile up to two artifacts and/or enchantments. **Portal to Phyrexia** — each opponent sacrifices three creatures, and each upkeep you put a creature card from any graveyard onto the battlefield as a Phyrexian. **Combustible Gearhulk** and **Risk Factor** let the targeted opponent choose — your draws or the damage — and **Charismatic Conqueror** lets the opponent tap their newly entered artifact or creature or give you a 1/1 lifelinking Vampire; a computer opponent takes damage only while it stays at 10 life or more, always hands over draws you can't make from your library, and taps a permanent only when that costs it nothing this turn. **Kardur, Doomscourge** — until your next turn your opponents' creatures, including new ones, attack each combat and attack someone other than you if they can, and whenever any attacking creature dies, each opponent loses 1 life and you gain 1.
- **Throne of Eldraine**, **Caged Sun** and **Forsaken Monument** — Throne of Eldraine chooses a color as it enters and taps for four mana of that color, spent only on monocolored spells of that color; mana a spell leaves unspent keeps that limit for the rest of the step instead of becoming ordinary mana, and its "{3}, {T}: Draw two cards" is paid only with mana of the chosen color. Caged Sun adds one more mana of the chosen color whenever a land of yours makes that color, and Forsaken Monument one more {C} whenever you tap a permanent for {C} (Sol Ring makes three). The extra mana comes only from a tap that made the right color: under a green Caged Sun, Breeding Pool taps for {G}{G} or a single {U}. **High Tide** and **Bubbling Muck** now work (until end of turn, every player's Islands or Swamps make an extra {U} or {B}), and so do **Gauntlet of Power**, **Vernal Bloom**, **Gauntlet of Might**, **Lavaleaper** and **Hall of Triumph**.

### Fixed
- Creatures that must attack now follow their rules for every player, you included. A goaded creature (**Shiny Impetus**, **Disrupt Decorum**, **Agitator Ant** and the other goad cards) and a creature under **Kardur, Doomscourge**'s rule attack a player other than the one who goaded it whenever they can without paying a cost — not that player, and not a planeswalker; goaded by every opponent, it attacks one of them rather than a planeswalker. The computer opponents used to send such a creature at a planeswalker they wanted to finish off, and your own goaded creatures were offered every target. A creature that must attack (**Bloodrock Cyclops**, a goaded creature, Kardur's rule, **Bident of Thassa**'s turn) now has to be declared before you can finish declaring attackers, unless every attack it could make costs mana (**Propaganda**) — nobody has to pay that, and the computer opponents no longer pay it to make an attack that loses the creature. Under **Silent Arbiter** or **Dueling Grounds**, the one attack goes to the creature that must attack.
- A creature that counts its own power for an ability now uses the power it last had when it leaves the battlefield before that ability resolves. **Krenko, Tin Street Kingpin** removed in response to its attack trigger used to make no Goblins; it now makes as many as its last power (its counter still isn't placed), the way the card's ruling says.
- The Sim Center's breakage table now names a card whose effect failed while resolving; it used to list every such failure as "(unknown card)".
- A double-faced card in your hand, library, graveyard or exile, or being cast, is now the color of its front face (or of the face you cast it as) — it used to count as colorless. **Mystic Forge** no longer lets you cast **Delver of Secrets** or **Invasion of Vryn** from the top of your library, **Forsaken Monument** no longer gains you life when you cast one, **Shrine of the Forsaken Gods** no longer pays for one, **Skittering Cicada** and **Liberator, Urza's Battlethopter** no longer give them flash, and **Journey to Eternity** (black and green) can no longer enchant **Stonecoil Serpent** (protection from multicolored). They now count as their colors: **Sapphire Medallion** discounts Invasion of Vryn, **Yeva, Nature's Herald** gives **Kessig Prowler** flash, **Kor Firewalker** sees **Village Messenger** as a red spell, **Force of Will** can exile Delver of Secrets, **Gainsay** can counter it, **Throne of Eldraine**'s blue mana pays for Invasion of Vryn, **Chrome Mox** imprinting Delver makes blue mana, **Summoner's Pact** finds Kessig Prowler and **Guildmages' Forum** gives **Edgar, Charmed Groom** its +1/+1 counter. **Allosaurus Shepherd** no longer makes devoid green spells such as **Brood Monitor** uncounterable (devoid cards are colorless). And **Kismet** no longer makes **Growing Rites of Itlimoc** enter tapped, nor **Imposing Sovereign** an entering **Westvale Abbey** — only the front face's card types count.
- A double-faced card you cast is now only the face you cast it as (its front face) when another card asks what kind of spell it is — its back face no longer counts. **Foundry Inspector** and the other "artifact spells cost less" cards no longer discount **Invasion of New Capenna**, **Invasion of Vryn** or **Edgar, Charmed Groom**; **The Ur-Dragon**, **Dragonspeaker Shaman**, **Urza's Incubator**, **Herald's Horn** and **Morophon, the Boundless** no longer discount **Invasion of Tarkir**; **Prowling Serpopard**, **Rhythm of the Wild** and the other "creature spells can't be countered" cards no longer protect **Invasion of Ikoria**, and **Thalia, Guardian of Thraben** now taxes it; **Sally Sparrow** and the other "creature spells as though they had flash" cards no longer let you cast it at instant speed, **Garruk's Horde**, **Eladamri, Korvecdal** and **Elven Chorus** no longer cast it from the top of your library, and **Cavern of Souls** naming Dinosaur no longer pays for it; **Mishra's Workshop** no longer pays for Invasion of Vryn, and **Rivaz of the Claw** no longer casts Invasion of Tarkir from your graveyard. **Malevolent Hermit** and **Goldbug, Humanity's Ally** can now be countered (only their back faces say otherwise), and **Mystic Forge** casts only the artifact face of **Birgi, God of Storytelling** (Harnfel, Horn of Bounty) from the top of your library.
- **City of Traitors** now triggers once when you play another land, even with **Ancient Greenwarden** or **Yarok, the Desecrated** out (it triggered twice), and an opponent's **Elesh Norn, Mother of Machines** no longer stops it: playing a land isn't a permanent entering, so those cards don't touch it.
- Mana that can only be spent on certain spells no longer turns into ordinary mana when floating mana pays part of a cost: with a floating {R}, Mishra's Workshop paying the rest of Darksteel Ingot left an unrestricted {C} behind; that {C} now stays artifact-only.
- The computer opponents now use their targeted activated abilities on their own turn. Before, apart from Equip and abilities aimed at attacking or blocking creatures, they never activated one. Now a pinger or removal ability kills one of your creatures when it can — the biggest threat first (**Walking Ballista** spends a counter only when it survives, **Steelbane Hydra** destroys your artifacts and enchantments, **Ulvenwald Tracker** sends in a fighter that wins and survives). After combat, a damage ability that can't kill anything hits a planeswalker or the opponent with the least life, unless the creature using it is needed to block. **Deathrite Shaman** exiles your instants, sorceries and creature cards from your graveyard to drain you or gain life. **Simic Ascendancy** and **Mutagen** tokens put +1/+1 counters on the opponent's own creatures. Before combat, **Otepec Huntmaster** gives a new Dinosaur haste and **Manifold Key** or **Rogue's Passage** makes an attacker unblockable. They never aim a harmful ability at their own permanents, and they never pay life or sacrifice anything they need for one
- Stealing a creature that was already stolen now follows the rules: the most recent control effect decides who controls it. **Act of Treason** and then **Control Magic** (or **Mind Control**, **Treachery** and the other "You control enchanted creature" Auras) on the same creature keeps it under the Aura's controller after the turn ends; it used to go back to its owner at end of turn. A creature taken with Control Magic and then taken back with Act of Treason returns to the Control Magic player at end of turn, not to its owner. Act of Treason and then **Sliver Overlord**'s steal keeps the creature for good. With two control Auras on one creature, losing the newer one hands the creature to the older Aura's controller instead of sending it home, and if a control Aura is destroyed while an Act of Treason is still in effect, the Act of Treason player keeps the creature until end of turn. When **Illusory Gains** moves onto an opponent's new creature, the creature it held goes back to its controller, and the same goes for a control Aura moved by **Codsworth, Handy Helper**; the first creature used to stay stolen for good
- A player who is eliminated in a multiplayer game now leaves it the way the rules say. A creature they had stolen goes back: one taken with **Control Magic**, **Mind Control** or **Act of Treason** returns to its owner (or to whoever else still holds it by a control effect), and one taken for good with **Sliver Overlord** goes home too; before, it vanished with them. Their own cards that another player had stolen leave the game with them (the stealing Aura goes to its owner's graveyard), and a creature they had reanimated from another player's graveyard is exiled to its owner's exile instead of vanishing. Their Auras and Equipment come off other players' creatures, and other players' Auras and Equipment come off theirs. A creature their **Banishing Light** held comes back (one held by an **Oblivion Ring**-style card stays exiled, as the rules have it). A card of theirs that someone else is casting leaves the stack, and another player's card they were casting is exiled to its owner. The monarch passes to the active player, and an extra turn they had queued is skipped.
- Damage dealt by a permanent's own ability now carries that permanent's lifelink, deathtouch, colors and controller, as the rules say for any damage — not only combat damage. **Basilisk Collar** on **Prodigal Pyromancer** or **Walking Ballista** destroys any creature it pings and gains you the life; **Brion Stoutarm**, **Merciless Enforcers**, **Sanguinary Priest**, **Cat-Gator** and the other lifelink creatures with a damage ability gain life when that ability deals damage; **Pestilence** no longer damages **White Knight** (protection from black), and a creature's ability no longer damages a creature with protection from creatures. A pinger destroyed in response, a **Mogg Fanatic** sacrificed for its own ability, a **Walking Ballista** that spends its last counter, or a creature whose own dies trigger deals damage still deals it the way it last was — with the deathtouch, lifelink or infect it had. A red spell's damage is now prevented by protection from red (**Pyroclasm** no longer kills **Paladin en-Vec**). With **Rakdos Charm**'s "each creature deals 1 damage to its controller", a lifelink creature gains life for its own controller, not for the player who cast the Charm. The extra damage from **Super State** and **Kediss, Emberclaw Familiar** is dealt by the creature that dealt the combat damage, so that creature's lifelink applies to it too.

## [0.165.0] - 2026-10-18

### Added
- **Torbran, Thane of Red Fell** — red sources you control deal 2 more damage to an opponent or a permanent an opponent controls: your red creatures in combat, your red spells (Lightning Bolt deals 5), your red creatures' abilities, even one sacrificed to pay for its own ability (Mogg Fanatic) or dying (Mudbutton Torchrunner's last 3 becomes 5). The color is read as it is right then. **Gisela, Blade of Goldnight** — damage to an opponent or a permanent an opponent controls is doubled, from any source; damage to you or a permanent you control has half of it prevented, rounded up. **Solphim, Mayhem Dominus** — noncombat damage from your sources to an opponent or their permanents is doubled, and {1}{R/P}{R/P}, Discard two cards puts an indestructible counter on it. **Bloodletter of Aclazotz** — on your turn, an opponent who would lose life loses twice that much (the damage itself is unchanged, so lifelink and commander damage count the original). **Lightning, Army of One** — after it deals combat damage to a player, that player and their permanents are dealt double damage from any source until your next turn. Also **Mechanized Warfare** (red or artifact sources +1), **Thor, Asgard's Avenger** (your other sources +1), **Tomik, Izzet Sparkmage** (noncombat +1), **Hawkeye, Young Avenger** (noncombat plus its power), **Goldnight Castigator** (damage to it is doubled too), **Inquisitor's Flail** (the equipped creature's combat damage, and combat damage another creature deals to it, doubled), **Zombie Infestation** and **Latulla, Keldon Overseer** ("Discard two cards" as a cost). When two or more of these apply to the same damage, the player being dealt it (or the controller of the permanent) gets the order that leaves the least damage — Torbran with Fiery Emancipation makes 2 into 8, not 12 — and damage that's fully prevented gets nothing added. Fixed: **Twinflame Tyrant** no longer doubles damage your sources deal to you or your own creatures; **Anthem of Rakdos** no longer doubles anything while you have cards in hand; **Cackling Witch** can no longer be activated without discarding a card
- **Riveteers Overlook**, **Cabaretti Courtyard**, **Maestros Theater**, **Brokers Hideout** and **Obscura Storefront** — when one enters, it's sacrificed and you search your library for a basic land of one of its three types, put it onto the battlefield tapped, shuffle and gain 1 life (found or not). If the land has left the battlefield before its trigger resolves, nothing is searched and no life is gained. When choosing which land to play, the computer opponents count the colors one can fetch toward the colors their hand needs. **Castle Locthwain** — {1}{B}{B}, {T}: draw a card, then lose life equal to the number of cards in your hand (counted after the draw); the computer opponents use it only while the loss leaves them at 10 life or more. The same draw-then-lose-life now works on **Vislor Turlough**'s end step. **Oran-Rief, the Vastwood** — {T}: put a +1/+1 counter on each green creature that entered the battlefield this turn, any player's; the same for **Novijen, Heart of Progress** (every creature that entered this turn) and **Raucous Entertainer** (creatures you control). The computer opponents tap Oran-Rief for it in their second main phase (a creature cast later would miss its counter), and only when more of their own creatures get a counter than their opponents' do
- **Deathrite Shaman** — its first ability now works: {T}, exile target land card from any graveyard, and add one mana. It uses the stack like any other ability (it isn't a mana ability, because it targets), so it can't pay for a spell you're already casting, and if the land card is gone when it resolves you get no mana. **Archaeomancer's Map** — whenever a land an opponent controls enters, if that player now controls more lands than you, you may put a land card from your hand onto the battlefield (checked again as it resolves). The same "a land an opponent controls enters" trigger now works on **Polluted Bonds**, **Nightshade Harvester**, **Shattered Angel**, **Sire of Stagnation** and **Spectrum Sentinel** (nonbasic lands only). **Hellkite Tyrant** — when it deals combat damage to a player, you gain control of all artifacts that player controls (an Equipment you take stays on the creature it equips until you pay to move it). **Gilded Goose** — {T}, sacrifice a Food: one mana of any color, used by automatic payment only when nothing else pays (any Food counts, including Tough Cookie). **Danitha Capashen, Paragon** — Aura and Equipment spells you cast cost {1} less, once per spell; the same reading now works on **Starnheim Courser** (artifact and enchantment spells)
- **Spree** — **Requisition Raid**, **Insatiable Avarice**, **Explosive Derailment**, **Phantom Interference**, **Trash the Town** and **Three Steps Ahead** now play fully: choose one or more modes as you cast, pay the spell's cost plus each chosen mode's "+" cost, pick targets for the modes that need them, and the modes happen in printed order (Insatiable Avarice's searched card is the first of the three drawn). Only mode sets you can pay for are offered, a mode whose target isn't available can't be chosen, and a cost increase like Thalia's applies to the total. Three Steps Ahead's copy mode makes a token copy of an artifact or creature you control. The computer opponents choose a set where every mode is worth it: Explosive Derailment's damage and its artifact destruction only on an opponent's permanents, Phantom Interference's counter only at an opponent's spell worth countering (otherwise just the Spirit). A Spree spell can't be cast "without paying its mana cost" yet, and it isn't offered for Fist of Suns' five-color cost. The other fifteen Spree cards (Great Train Heist, Return the Favor, Final Showdown, Lively Dirge, Smuggler's Surprise …) still go to the Arbiter, each for a mode the engine doesn't play yet
- **Brash Taunter** — whenever it's dealt damage, it deals that much damage to target opponent: in a fight, from a burn spell, or in combat (blocked by two creatures, it's one trigger for the total). The damage is the Taunter's own, so its lifelink applies. The same trigger now works on **Boros Reckoner**, **Spitemare** and **Klement, Tempest Acolyte** (any target), **Truefire Captain** (target player), **Coalhauler Swine** (each player), **Jackal Pup** and **Shinka Gatekeeper** (you); one the damage kills still deals it. **Ichor Wellspring**, **Prized Statue**, **Mycosynth Wellspring**, **Servo Schematic**, **Nimblewright Schematic** and **Mephitic Draught** — "when this artifact enters or is put into a graveyard from the battlefield" now works both ways (destroyed or sacrificed, not exiled or returned to hand). **Chasm Skulker** and **Hangarback Walker** — when they die they make one Squid with islandwalk / Thopter with flying for each +1/+1 counter they had; the same counted tokens with a keyword now work on **Jötun Owl Keeper**, **Hallowed Spiritkeeper**, **Assemble the Legion** and **Spider Spawning**. **Metallic Mimic** — each other creature you control of the chosen type enters with an additional +1/+1 counter. **Heraldic Banner** — creatures you control of the chosen color get +1/+0
- **Ozolith, the Shattered Spire** — {1}{G}, {T}: put a +1/+1 counter on target artifact or creature you control, as a sorcery (with Ozolith's own replacement, the counter becomes two); **Shared Animosity** — whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it (a changeling shares every type)
- **Chromatic Lantern** (and **Joiner Adept**) — lands you control have "{T}: Add one mana of any color": a Forest beside the Lantern taps for green or any other color, a Wastes for colorless or any color, once per untap, and a painland's colored mana through the Lantern is painless. An opponent's lands don't gain it. (A land whose own mana ability does more than make one mana — Ancient Tomb, Gaea's Cradle, Command Tower, Mana Confluence — still taps only for its own mana for now.)
- **Relic of Legends** — besides its own "{T}: Add one mana of any color", tap an untapped legendary creature you control for one mana of any color, even one that came under your control this turn, and even while the Relic is already tapped. A creature tapped to pay a cost like Springleaf Drum's can no longer also tap for its own mana in the same payment (Springleaf Drum beside a lone Llanowar Elves used to pay for a two-mana spell)
- **Mox Diamond** — when it would enter the battlefield you discard a land card, or it goes to the graveyard instead (it never enters, so it never makes mana). It applies however it would enter: cast, searched or returned onto the battlefield, a Sculpting Steel copying it, a token copy from Flash Photography or Second Harvest. The land is chosen automatically, the same way for every seat: one is discarded only when you hold a land card and have already played your land this turn, or hold two or more (a basic land first). The AI no longer casts it when it would just go to the graveyard
- **Bender's Waterskin** (and **Thousand Moons Infantry**) — untaps during each other player's untap step as well as yours, so it can make mana on every turn. A stun counter still keeps it tapped there; "doesn't untap during its controller's untap step" effects (Inertia Bubble) don't, as the card's ruling says. Under Seedborn Muse or Unwinding Clock it still untaps only once per step
- **Midnight Clock** — when the twelfth hour counter is put on it (from its each-upkeep trigger or its {2}{U} ability), you shuffle your hand and graveyard into your library, draw seven cards and exile the Clock. It used to keep collecting hour counters and never go off. If the Clock has left the battlefield by then, you still shuffle and draw, and it isn't exiled
- **Curse of Opulence** — whenever the enchanted player is attacked, you create a Gold token, and so does each opponent attacking that player (once per combat however many creatures attack; an attack on only that player's planeswalker doesn't count; an attacker that has left combat by then gets nothing). The AI casts it on the opponent it attacks itself (the lowest life, then the fewest untapped creatures). The same for **Curse of Verbosity** (draw a card), **Curse of Disturbance** (a 2/2 black Zombie) and **Curse of Vitality** (gain 2 life)
- **Cursed Mirror** — as it enters you may have it become a copy of any creature on the battlefield, yours or an opponent's, until end of turn, with haste: it can attack the turn it comes down, and the copied creature's enters abilities work. At the end of the turn it is Cursed Mirror again and taps for {R} (while it is a copy it doesn't). Something that copies it in the meantime (a Clone) stays that creature. When you cast it you pick the creature or decline; when an effect puts it onto the battlefield (Whir of Invention) the choice is made automatically. The AI copies the best creature when the copy can attack or block well that turn, and otherwise keeps it as a mana rock
- **Firespitter Whelp** — whenever you cast a noncreature or Dragon spell (a changeling creature counts as a Dragon), it deals 1 damage to each opponent. The same "A or B" / "A, B, or C" spell wording now works on **April O'Neil, Human Element**, **Snake Pit**, **Mold Adder**, **God-Pharaoh's Faithful**, **Umara Wizard**, **Windrider Wizard**, **Alela, Artful Provocateur**, **Rockslide Sorcerer** and **Umara Mystic**
- **Visions of Beyond** — draws one card, or three instead if any player's graveyard (yours included) holds twenty or more cards as it resolves
- **Overmaster** and **Insist** — the next instant or sorcery spell (Overmaster) or creature spell (Insist) you cast this turn can't be countered, and you draw a card. A spell of another type cast first doesn't use the protection up
- **Vigor** — damage that would be dealt to your other creatures, in combat or not, is prevented and they get that many +1/+1 counters instead. Vigor itself isn't protected, and combat damage still lands while a "Combat damage can't be prevented" card (Frenzied Baloth) is on the battlefield
- **Find // Finality** — now plays either half: Find returns up to two creature cards from your graveyard to your hand; Finality may put two +1/+1 counters on a creature you control (your highest-power one), then gives all creatures -4/-4 until end of turn (declining the counters still shrinks everything). The same untargeted "put a +1/+1 counter on a creature you control" now works on **Humiliate** and **Sword of Truth and Justice**

### Fixed
- **Phyrexian mana is paid now.** Each Phyrexian symbol in a spell's or an ability's cost — **Dismember**, **Gitaxian Probe**, **Mental Misstep**, **Mutagenic Growth**, **Gut Shot**, **Noxious Revival**, **Phyrexian Metamorph**, **Vault Skirge**, **Birthing Pod**, **Norn's Annex**, the Souleaters, the Dominuses, **Lashwrithe**'s equip and the rest — costs one mana of its colour or 2 life. They used to be free: Dismember cost {1}, Gitaxian Probe nothing. Automatic payment uses mana when you have it and life when you don't, never more life than leaves you at 1 and none while your life total can't change; the spell or ability says how much life it will take. The hybrid symbols on the compleated planeswalkers (**Tamiyo, Compleated Sage**'s {G/U/P}) can be paid with life too. The AI pays Phyrexian life only while it stays at 10 life or more
- The computer opponents choose their land drop and their land searches better. A fetch land is judged by the land it will fetch: **Evolving Wilds**, **Terramorphic Expanse** and **Fabled Passage** bring in a tapped land, so an untapped land goes down first when its mana casts a spell that turn; a fetch they can't use (nothing left to find, or a life cost that would take them under 10) counts as a land that makes nothing; **Riveteers Overlook** and the other Streets of New Capenna fetch lands count as the tapped basic they become. When no land's mana would cast anything that turn, a land that brings a missing color goes down ahead of an untapped land of a color they already have. And every land search they make for themselves — **Rampant Growth**, **Cultivate**, **Kodama's Reach**, **Farseek**, **Sakura-Tribe Elder**, the Streets of New Capenna fetch lands and the rest — takes the land of the color their hand and commander need most, instead of the alphabetically first one
- Abilities with {X} in their cost now pay the rest of that cost too. **Fiend Artisan** sacrifices another creature when it activates (and isn't offered without one), and **Alquist Proft, Master Sleuth** sacrifices a Clue (and isn't offered without one); both used to activate without the sacrifice. The creature sacrificed for the cost can't also be sacrificed to make the mana for it (an Eldrazi Spawn cracked for mana, or a Phyrexian Altar's victim). The {X} abilities of **Cackling Witch**, **Cinder Elemental**, **Goblin Dynamo**, **Pain Kami**, **Jiwari, the Earth Aflame** and **Latulla, Keldon Overseer** also can no longer target a creature with protection from creatures
- **Molt Tender** and **Rubble Rouser** each need their own graveyard card now: two of them with one card in your graveyard no longer make mana twice, the card is exiled before the mana is added, and with no card left there is no mana. Molt Tender also can't exile a spell you're casting from your graveyard (flashback) or a card whose graveyard ability you're activating. Mana abilities that cost life (**Mana Confluence**, **Treasonous Ogre**, **Boseiju, Who Shelters All**, **Horizon Canopy** and the rest) can't together spend more life than you have — automatic payment keeps at least 1 life — and pay no life at all while your life total can't change (**Teferi's Protection**). An ability is no longer offered when the only way to pay for it is feeding its own creature to **Phyrexian Altar** (**Anaba Shaman**), and **Purple Pentapus**'s return no longer taps the creature its cost taps for mana too (**Cryptolith Rite**)
- The computer opponents now crack their fetch lands — **Evolving Wilds**, **Terramorphic Expanse**, **Fabled Passage**, **Prismatic Vista**, **Escape Tunnel**, **Vibrant Cityscape** and the Zendikar fetches (**Verdant Catacombs**, **Polluted Delta**, **Flooded Strand** and the rest). They used to leave them on the battlefield as lands that made nothing. They crack one on their own turn before casting spells, only when the library still holds a land it can find and, for a fetch that costs life, only while they stay at 10 life or more; the search takes the land that makes the color their hand and commander need most (a dual land covering two missing colors over either basic) instead of the alphabetically first one
- **Smoke Bomb** works now. Its upkeep trigger sacrifices it, and the follow-up ("When you do, target creature you control can't be blocked this turn") picks its creature after the sacrifice, once Smoke Bomb's shroud is gone. Before, the trigger was dropped for lack of a target and nothing happened. Fixing it means any "When you do" ability that targets now picks its target when it goes on the stack, after the first part has happened. That also fixes four other cards. **Primal Witchstalker** and **Yathan Roadwatcher** now mill even when there's nothing in your graveyard to return, and they can return a card they just milled. **Dream Eater** now surveils even when no opponent controls a nonland permanent. **Faebloom Trick** can now be cast when no opponent controls a creature. **Red Hulk**'s damage and **The Royal Scions**' −8 damage are now separate abilities that players can respond to
- Mana abilities that sacrifice another permanent — **Phyrexian Altar**, **Ashnod's Altar**, **Phyrexian Tower**, **Lazotep Quarry** and **Thermopod** (sacrifice a creature) and **Gilded Goose** (sacrifice a Food) — each need their own victim now. Two Altars and a single creature used to make mana twice from one sacrifice (and two Geese twice from one Food); now each sacrifice pays for exactly one activation, the creature or Food is sacrificed before the mana is added, and an ability with nothing left to sacrifice makes no mana. A creature you tap or sacrifice for a spell's or ability's own cost (emerge, **Purple Pentapus**'s "tap an untapped creature") can't also be fed to an Altar to pay for it
- A creature cast for its bestow cost is an Aura spell, not a creature spell, and its cost now reflects that: Aura discounts (**Danitha Capashen, Paragon**, **Transcendent Envoy**) apply to it, creature discounts (**Marauding Raptor**) no longer do, and **Thalia, Guardian of Thraben**'s tax on noncreature spells now does
- **Deadeye Duelist**, **Kindlespark Duo**, **Burning Fields**, **Jeskai Charm**, **Vampiric Touch**, **Shocking Sharpshooter**, **Shalai and Hallar**, **Casey Jones, Back Alley Brute** and the other cards that deal damage to "target opponent" (57 in all, including the "target opponent or planeswalker" ones and the "enters tapped, deals 1 damage to target opponent" dual lands) can no longer be aimed at their own controller. With every opponent untargetable (Leyline of Sanctity) the spell or ability isn't offered, and a trigger does nothing instead of hitting you. The "or planeswalker" cards can't target a planeswalker yet. **Assassin Den** — "It can't be blocked this turn" now applies to the creature that got the +1/+1 counter, not to the Den itself
- **Sign in Blood**, **Blood Pact**, **Painful Lesson**, **Harrowing Journey**, **Bloodgift Demon**, **Vault Plunderer** and the other "target player draws N cards and loses N life" cards now target one player, who both draws and loses the life. They used to choose a player for the draw and another for the life loss, so a trigger like Bloodgift Demon's drew the card for its controller while an opponent lost the life
- **The filter lands** — **Rugged Prairie**, **Cascade Bluffs**, **Flooded Grove**, **Fetid Heath**, **Twilight Mire**, **Graven Cairns**, **Mystic Gate**, **Sunken Ruins**, **Fire-Lit Thicket** and **Wooded Bastion** — now make their two-mana combinations: pay the hybrid mana and get, say, {R}{R}, {R}{W} or {W}{W}. Automatic payment picks the combination the spell needs, and tapping by hand offers each one. Before, they only ever tapped for {C}
- Lands with a second mana ability that never worked now make that mana, paying its cost: "{1}, {T}: Add one mana of any color" (**Talon Gates of Madara**, **Planar Nexus**, **Hidden Grotto**, **Conduit Pylons**, **Capital City**, **Unknown Shores** and the rest, plus **School of the Unseen** and **Henge of Ramos** for {2}), the Homelands keeps (**Koskun Keep**, **Castle Sengir** …), **Crystal Quarry**, **Crypt of the Eternals**; **Phyrexian Tower** (sacrifice a creature: {B}{B}), **Spire of Industry** (1 life for any color, with an artifact) and the deserts' 1-life color (**Hashep Oasis**, **Ramunap Ruins**, **Shefet Dunes**, **Ipnu Rivulet**); **Opal Palace** (a color of your commander's identity for {1}; your commander cast with it enters with an extra +1/+1 counter for each time it's been cast from the command zone) and **Guildmages' Forum** (a multicolored creature cast with it enters with a +1/+1 counter); **Muraganda Raceway** ({C}{C} at max speed); **Murmuring Bosk** ({W} or {B}, 1 damage); **Grove of the Burnwillows** ({R} or {G}, each opponent gains 1 life); **The Grey Havens** (a color among legendary creature cards in your graveyard); and the spend-restricted mana of **Power Depot**, **Tournament Grounds**, **Maelstrom of the Spirit Dragon** (Dragon or Omen spells) and **Brotherhood Headquarters** (Assassin spells and spells with freerunning). Before, each made only its plain {C}
- Tapping a land by hand now offers its other mana abilities for the colors its plain one can't make, each paying its cost (Starting Town's 1 life, a Vivid land's charge counter, Talon Gates' {1}); a filter land's choices are labeled by their combination
- **Crumbling Vestige** and **Branch of Vitu-Ghazi** no longer tap for any color (only their one-shot triggers make colored mana); **Artist Alley**, **Reflective Gate**, **The Big Top**, **Paliano, the High City** and **Blustering Barnyard** no longer make free any-color mana from a color the engine can't read. The coverage numbers no longer count Artist Alley, Reflective Gate and The Big Top as fully modeled
- **Hardened Scales**, **Branching Evolution**, **Primal Vigor**, **Corpsejack Menace**, **The Earth Crystal**, **Conclave Mentor** and the other "+1/+1 counters on a creature" replacements no longer add counters to a noncreature permanent (an artifact, an uncrewed Vehicle, The Ozolith); **Loading Zone** and **Lae'zel, Vlaakith's Champion** act only on the permanents they name
- **Winding Constrictor** and **Ozolith, the Shattered Spire** now add their extra counter to a creature or artifact that enters with counters (a Hydra cast for X, a modular creature, Zaxara's Hydra token, an amassed Army)
- **Stocking the Pantry** and **Terrasymbiosis** no longer count a +1/+1 counter put on a noncreature artifact as one put on a creature
- **Lunar Mystic** — "whenever you cast an instant spell" no longer triggers on sorceries
- **Paradox Haze**, **Curse of Bounty** and the 41 other Auras that enchant a player but weren't fully modeled (39 "Enchant player" and 4 "Enchant opponent" cards in all) are now cast targeting a player, and enter enchanting that player; they used to be offered with no target, cast that way by the computer opponents, and vanish when they resolved. An "Enchant opponent" Aura (Psychic Possession, Archnemesis) can target only an opponent, and with no legal player it can't be cast. The computer opponents put a Curse on the opponent they attack and Paradox Haze or Shadow of the Second Sun on themselves; the text of one the engine doesn't play yet stays inactive while it sits on its player
- **Angelic Destiny**, **Spectra Ward**, **Darksteel Mutation**, **Reality Acid**, **On Thin Ice** and about 600 other Auras that enchant a creature, land, artifact or other permanent but weren't fully modeled are now cast targeting something their Enchant line allows (a creature, a land, "a snow land you control", "a creature an opponent controls" …) and enter attached to it; they used to be offered with no target, cast that way by the computer opponents, and vanish when they resolved. With nothing to enchant one can't be cast, and an X Aura (Endless Scream) is cast for the X you choose. The text the engine doesn't play yet stays inactive while the Aura sits on its host. The computer opponents put such an Aura on their own best creature when it only helps, on an opponent's biggest creature when it only hurts, and keep it in hand when they can't tell. About 40 Auras whose Enchant line the engine can't read yet (the planeswalker Talents, "Enchant creature card in a graveyard" …) and Grafted Identity (its sacrifice isn't paid yet) are no longer offered at all
- **Accursed Witch**, **Faithbound Judge**, **Binding Geist** and the other cards with a creature front and an Aura back now enter the battlefield as the creature when cast; they used to vanish
- The computer opponents now read an Aura's text sentence by sentence to decide where it goes, and no longer keep in hand every Aura whose bonus the engine doesn't fully play: **Angelic Destiny**, **Spectra Ward**, **Benevolent Blessing**, **Chains of Custody** and **Sheltered by Ghosts** go on their own best creature, **Darksteel Mutation**, **Swift Reconfiguration**, **Kenrith's Transformation** and **Lignify** on an opponent's biggest creature, **Cursed Land** on an opponent's land, **On Thin Ice** on their own snow land — about 330 more Auras in all (289 of the 623 Auras the engine casts without fully modeling them, up from 49). An Aura whose text both helps and hurts (Psychic Impetus's +2/+2 and goad) or that they can't read (Pariah) is still kept in hand, and the same reading picks the host when such an Aura enters without being cast. Only where and whether they cast it changed: the text the engine doesn't play yet stays inactive
- **Pacifism** and every other Aura can no longer be cast on, or resolve onto, a creature with protection from enchantments such as **Azorius First-Wing**, or a permanent that can't be enchanted (a land with **Consecrate Land**); bestowed creatures, mana Auras (**Wild Growth**) and Auras that grant an ability (**Squirrel Nest**) included; a bestowed creature whose host gains such protection before it resolves enters as a creature instead
- **Holdout Settlement** no longer taps for any color without tapping a creature: it taps for {C}, or for one mana of any color while you also tap an untapped creature you control (one that came under your control this turn may be tapped). **Survivors' Encampment** and **Scene of the Crime** now offer that same any-color ability (before, they only made {C})
- **Leafkin Druid**, **Raucous Audience**, **Ilysian Caryatid** and **Tower Worker** now make their bigger amount when its condition holds — {G}{G} with four or more creatures, {G}{G} or two of one color with a creature of power 4 or greater (counters and pumps count), {C}{C}{C} beside a Mine Worker and a Power Plant Worker — instead of always their base mana
- **Rhystic Cave** no longer taps for {C} (a color it can never make); its "unless any player pays {1}" ability isn't modeled yet, so it makes no mana in the Academy
- The coverage numbers no longer count as fully modeled **Rhystic Cave**, **Vorinclex, Monstrous Raider**, **Lae'zel, Vlaakith's Champion** and **Doc Samson, Super Psychiatrist**: the engine doesn't yet track who puts counters (Vorinclex's halving of an opponent's counters, the "If you would put" bonus only on your own) or counters put on a player, and a mana creature whose "instead" condition it can't read no longer counts as fully modeled either
- **Crypt of Agadeem** taps for {B} again (it made colorless behind a {2}), and its "{2}, {T}: Add {B} for each black creature card in your graveyard" now pays costs. The second mana abilities of **Cabal Stronghold** ({3}: {B} for each basic Swamp you control), **Urza's Workshop** (metalcraft: {C} for each Urza's land you control), **Baldur's Gate** ({2}: X mana of one color, X = your other Gates), **Cascading Cataracts** ({5}: five mana in any combination of colors) and **Baxter Building** ({4}: four) now pay costs too; before, each made only its plain {C}. **Nykthos, Shrine to Nyx** now makes its devotion mana ({2}: mana of the color you choose equal to your devotion to it), **Plaza of Harmony** a type a Gate you control could produce, and **City of Shadows** {C} for each storage counter on it (none without counters). Automatic payment uses these abilities; tapping by hand still offers the plain one
- **Gem Bazaar**, **Cryptic Spires**, **Forsaken Crossroads** and **Captivating Crossroads** no longer tap for {C}, a mana they can't make (their abilities aren't modeled yet, so they make no mana in the Academy); **Fabled Path of Searo Point** taps for {R} as the Mountain it is, not {C}
- The coverage numbers no longer count **Great Hall of the Citadel** and **Sunken Citadel** as fully modeled: the engine doesn't make their spend-restricted mana yet
- When the game taps your lands to pay a generic cost, it no longer spends a land with a bigger mana ability on a single colorless mana ahead of your other lands. **Nykthos, Shrine to Nyx**, **Three Tree City**, the filter lands (**Graven Cairns**, **Mystic Gate** …) and the "{1}, {T}: Add one mana of any color" lands (**Planar Nexus**, **Talon Gates of Madara** …) were tapped for {C} first, leaving their other ability unusable that turn; **Crystal Vein**, **Phyrexian Tower** and storage lands holding counters were treated the same way. They now wait their turn like any other land, and **Sol Ring**, **Wastes** and other plain colorless sources are still used first. What you can afford doesn't change. The AI and simulated games pay the same way

## [0.164.0] - 2026-10-17

### Added
- **The Arkenstone** and **Horn of Valhalla** — Adventures whose permanent half is an artifact: cast the Adventure (Seek the Heart searches for a legendary creature card; Ysgard's Call makes X 1/1 Soldiers) and the card waits in exile, then cast the artifact from there later — or cast the artifact straight from your hand
- **Jidoor, Aristocratic Capital** and **Value Town** — Adventures whose permanent half is a land: cast the Adventure (Overture mills half an opponent's library; Take a Trip to… draws two and deals 2 to each opponent) and the card waits in exile, then play the land from there later as your land for the turn — or play it straight from your hand as a land
- **Virtue of Persistence**, **Virtue of Knowledge** and **Virtue of Loyalty** (and **An Unexpected Party**) — Adventures whose permanent half is an enchantment: cast the Adventure (Locthwain Scorn, Vantress Visions, Ardenvale Fealty, At the Door) and the card waits in exile, then cast the enchantment from there later — or cast the enchantment straight from your hand
- **"Whenever a permanent is turned face up" abilities now work.** Turning a manifested creature face up (paying its mana cost) triggers them: **Aven Farseer**, **Aphetto Runecaster**, **Bonethorn Valesk**, **Unblinking Bleb**, **Pine Walker**, **Experiment Twelve**, **Salt Road Ambushers**, **Sumala Sentry**, **Pyrotechnic Performer**, **True Identity**, **Mastery of the Unseen**, **Fatal Mutation**, **Projektor Inspector** and **Perimeter Enforcer**, and **Deathmist Raptor** returns from your graveyard, face up. The turned-face-up abilities of **Trail of Mystery**, **Secret Plans**, **Roshan, Hidden Magister** and **Case of the Pilfered Proof** trigger too (their other abilities aren't supported yet)
- **Academy Rector** — when it dies, you may exile it to search your library for an enchantment card and put it onto the battlefield; an Aura found this way enters enchanting something, and the search offers an Aura only when there is something it can enchant
- **Retether** — returns each Aura card from your graveyard to the battlefield, each onto a creature; an Aura that can't enchant a creature on the battlefield stays in your graveyard
- When an Aura of yours enters the battlefield without being cast — **Brago, King Eternal** or **Displacer Kitten** blinks it, **Sun Titan** or **Replenish** returns it from your graveyard, **Academy Rector** finds it, **Flash Photography** copies it — and more than one permanent could hold it, the Academy now asks you what it enchants. Every legal choice is listed, yours and your opponents' (nothing is targeted, so hexproof doesn't stop it; protection does), and when several of your Auras return together you choose for each. The AI still places its own Auras itself, exactly as before
- **Springbloom Druid** (and **Excavating Anurid**) — when it enters, you may sacrifice a land for its payoff (two basic lands onto the battlefield tapped; a card for the Anurid); **Loyal Apprentice** and **Siege-Gang Lieutenant** — at the beginning of combat on your turn, if you control your commander, make tokens that gain haste until end of turn; **Warstorm Surge** — whenever a creature you control enters, it deals damage equal to its power to any target (the creature is the source: its lifelink and deathtouch apply)
- **Narset's Reversal** — copy target instant or sorcery spell, then return it to its owner's hand, with new targets for the copy; **Dualcaster Mage** — flash; when it enters, copy target instant or sorcery spell, with new targets for the copy; **Imp's Mischief** — change the target of target spell with a single target, and lose life equal to that spell's mana value
- **Tribute to the World Tree** — whenever a creature you control enters, draw a card if its power is 3 or greater, otherwise put two +1/+1 counters on it; **Goreclaw, Terror of Qal Sisma** — creature spells you cast with power 4 or greater cost {2} less, and when it attacks each creature you control with power 4 or greater gets +1/+1 and trample; **Mentor of the Meek** — whenever another creature you control with power 2 or less enters, you may pay {1} to draw a card; also **Serra Redeemer**, **Inspiring Commander**, **Snarling Gorehound**, **Vicious Clown**, **Marketwatch Phantom** and **Neighborhood Guardian**
- **Kindred Dominance** (and **Kindred Judgment**) — choose a creature type, then destroy every creature that isn't of that type; **Eldritch Evolution** — sacrifice a creature as you cast it, search for a creature card with mana value up to 2 more than the sacrificed creature's, put it onto the battlefield, and exile Eldritch Evolution
- **Champion's Helm** — equipped creature gets +2/+2 and has hexproof while it is legendary; **Trailblazer's Boots** — equipped creature has nonbasic landwalk (it can't be blocked while the defending player controls a nonbasic land); also **Gimli's Axe**, **Hero's Heirloom** and **Dryad Sophisticate**

### Changed
- The app's bundled Node.js runtime is updated to **v22.23.3**, the newest Node 22 LTS patch (it was v22.23.2).
- When the AI picks a land to fill a color it is missing, it judges a modal double-faced card by the face it would play: each face of a Pathway counts for its own color (both used to count as the front face's)
- **Copy Enchantment**, **Clever Impersonator** and **Sakashima's Protege** can now copy an Aura: the copy enchants something as it enters (copying an opponent's **Control Magic** takes one of their creatures), and a Copy Enchantment spell whose copy has nothing to enchant goes to your graveyard, as the rules say
- **Banishing Light**, **Oblivion Ring** and the other "exile it until this leaves the battlefield" cards can now exile an Aura: when they leave, it returns under its owner's control enchanting something that was already on the battlefield (never a card returning at the same moment), or stays exiled if there is nothing it can enchant
- **Flickerwisp** and **Glimmerpoint Stag** can now exile an Aura: it comes back at the beginning of the next end step under its owner's control, enchanting something (it stays exiled if there is nothing it can enchant)
- **Flash Photography** and **Caretaker's Talent** can now copy an Aura: the token enchants something as it is created (copying an opponent's **Pacifism** gives you one for their creature), and is not created when there is nothing it can enchant. A copied Role never goes on a creature that already has one of your Roles
- **Mole Module**: an Aura among the milled cards can now be put onto the battlefield too, enchanting something as it enters (it is offered only when there is something it can enchant)
- **Replenish** and **Resurgent Belief** now return your Aura cards too: each Aura comes back enchanting something that was already on the battlefield (an opponent's permanent if that is the only legal choice), and one with nothing to enchant stays in your graveyard. They used to leave every Aura behind. Enchantments returned together also see each other enter now (a returning **Eidolon of Blossoms** draws a card for each)
- The Academy calls the other players "Opponent 1", "Opponent 2" and "Opponent 3" everywhere, as the board does; the turn line, the seat list, the attack choices and Ask Jace's answers used to call them "AI 1" to "AI 3"
- Declaring attackers on a very wide board (hundreds of creatures) is about four times faster: the game no longer re-reads every card's rules text for each possible blocker
- **The Unbeatable Squirrel Girl** (AI): the combo line now also finishes through the sacrifice outlets on the battlefield — it keeps making Squirrels until **Blasting Station**'s untaps cover every opponent's life, or the tokens cover every library for **Altar of Dementia**, or **Altar of the Brood** has emptied the libraries, then does nothing else until that kill is done, and sacrifices no more than it needs
- Simulated games run about 2.4 times faster (the Sim Center's grind, the Crucible and Learn games against the AI): each card's rules text is now read once and reused instead of being re-read at every priority window. Results are unchanged — the same seeds play out move for move
- The AI now uses **Candelabra of Tawnos** and **Magus of the Candelabra** the way the decks that play them do: it taps Gaea's Cradle (or a land with mana enchantments on it), untaps it, and casts the big spell it could not otherwise pay for — and only when the untap nets mana. It left both cards unused before
- **Brago, King Eternal**: the AI now blinks every permanent it has no reason to keep home (it used to blink only the ones that gained something). It still leaves tokens, permanents with +1/+1 counters, equipped creatures and their Equipment, and a planeswalker above its starting loyalty
- The AI now puts its land mana enchantments (Wild Growth, Fertile Ground and the like) on the same land instead of spreading them out
- The choices offered for "untap X target lands" list your own tapped lands first, most mana first
- **Brago, King Eternal** and **Displacer Kitten** can now blink Auras: the AI uses it to move your Pacifism-style Aura onto an opponent's bigger creature. An Aura the game can't yet place when it returns (a Curse, Animate Dead) is still not offered
- Contributors: `npm run lint` now also fails a keyword-section citation ("CR 701.N" / "CR 702.N") whose comment names a different keyword than the cited section (`scripts/check-cr-keywords.cjs`; `node scripts/fix-cr-keyword-citations.cjs` rewrites the unambiguous ones)

### Fixed
- **Torment of Hailfire** and **Braids, Arisen Nightmare** now let every opponent choose first, starting with the player whose turn it is, and then everything they chose happens at once: the permanents they sacrifice are sacrificed together, and each repetition of Torment of Hailfire is done separately. A "whenever one or more creatures die" ability (**Great Fierce Bee**) triggers once per repetition when two opponents sacrifice creatures; it used to trigger once per opponent. **Blood Artist** still triggers for each creature. A permanent sacrificed to Torment of Hailfire no longer sees another opponent lose life or discard in the same repetition (**Exquisite Blood**, **Mindcrank**, **Megrim**), and a **Rest in Peace** sacrificed in the same repetition still exiles a discarded card. The opponents are asked in turn order from the player whose turn it is; when someone other than the first player cast Torment of Hailfire or controlled Braids, they used to be asked starting from the first seat
- **Urza's Tower**, **Urza's Mine** and **Urza's Power Plant** make their full mana once you control all three ({C}{C}{C} from the Tower, {C}{C} from each of the others; **Planar Nexus** counts as any of them). They always made a single {C}. **River of Tears** makes {B} instead of {U} after you've played a land this turn (it made {U} all turn). **Command Mine** makes two mana beside a **Command Tower** and a **Command Power Plant**, and **Incubation Druid** makes three while it has a +1/+1 counter. **A-Town** now makes only {C}: it used to make any color
- **Meteor Crater** makes one mana of a color of a permanent you control, and nothing when you control no colored permanent (it made {C})
- **Lavinia, Foil to Conspiracy** can be tapped for mana only during an opponent's turn, as printed (she could be tapped on your own turn)
- **Sphere of the Suns**, **Spell Satchel** and **Channeler Initiate** can now be tapped for mana, removing one of their counters each time, and **Sphere of the Suns** enters tapped with its three charge counters. **Mana Bloom** makes one mana of any color once each turn by removing a charge counter
- The computer opponent no longer casts a creature whose enters ability would have to hit its own side: **Man-o'-War** with no opposing creature (it bounced its own creature or itself), **Mystic Snake** with only its own spell on the stack (it countered it), **Flametongue Kavu** with only its own creatures to burn. It casts them once the ability has a target on the other side
- When an ability has no target on the other side and must hit its controller's own (an enters or dies ability with no opposing creature), it now picks one that survives if it can: **Fire Imp**'s 2 damage goes to your Craw Wurm instead of killing your Grizzly Bears, **Farbog Boneflinger**'s -2/-2 likewise, and **Network Disruptor** taps a land that is already tapped
- The computer opponent casts **Ice Over**, **Coma Veil**, **Claustrophobia** and the other Auras that keep a creature from untapping on its opponent's best creature; it used to never cast them
- The Academy's game logs now read as words. The board's Game Log, the replay in Table Records and the Recent actions list name each player ("You", "Opponent 1") and say what they did the way its button does — "Opponent 1 · Activate Prodigal Pyromancer: This creature deals 1 damage to any target → You ({T})", "Opponent (auto) · Play Mountain" — instead of the engine's names ("ai1 · activate-ability · Prodigal Pyromancer"). An opponent's graveyard or hand ability names their graveyard or hand, not yours
- The beginner explanation under the Academy board now describes every choice. Crewing a Vehicle names the creature it taps, and suspend, a card's discard ability, the graveyard and hand abilities and **Doubling Cube** read as themselves instead of "Take action". Costs are written in mana symbols: a free spell is cast for {0} and **Street Wraith** cycles for 2 life, where both used to say "for 0"; a free cast or an alternative cost no longer claims a mana cost, and kicker, X and the other cast choices are named. An activated ability names its cost and its target, and its text no longer ends in two full stops; a loyalty ability aimed at a player names that player; two permanents of the same name are told apart by whose they are ("your Prodigal Pyromancer", "Opponent's Prodigal Pyromancer"); declining a cascade names the card, and a discover whose card stays in exile (**The Key to the Vault**) says so instead of "put it into your hand"
- A split card cast as one half, or an Adventure, now has only that half's color. **Fire** from **Fire // Ice** is red only: **Gainsay** and **Pyroblast** can no longer counter it, **Kor Firewalker** no longer gains life when **Ice** is cast, and **Ice** can now tap a creature with protection from red. **Blow Off Steam** (the Adventure of the blue **Frolicking Familiar**) is red: **Hydroblast** counters it and **Gainsay** doesn't, it can no longer target a creature with protection from red, and "whenever a player casts a red spell" abilities now see it. The same goes for every half whose color differs from its card's (**Steam Clean**, **Can't Wake Up**, **Consign** …)
- Cards with two halves are no longer cast as one spell paying both halves' costs. The Omen dragons (**Marang River Regent**, **Whirlwing Stormbrood**, **Stonehide Ancient** …) and the preparation creatures (**Adventurous Eater**, **Emeritus of Truce**, **Abigale, Poet Laureate** …) are now cast as the creature, at its own cost and timing — a legendary one from the command zone too; their Omen and prepare spells aren't offered yet. Marang River Regent used to cost ten, even on an opponent's turn. Rooms (**Bottomless Pool // Locker Room** …), the three-half split cards and **Twice Upon a Time** are not offered for now; they used to be offered for every half's cost added together
- When every player (or every opponent) sacrifices a permanent of their choice, all of them now choose first, starting with the player whose turn it is, and then everything chosen is sacrificed at once, as the rules say: **Innocent Blood**, **Fleshbag Marauder**, **Grave Pact**, **Dictate of Erebos**, **Silverclad Ferocidons** and **Flare of Malice**. A "whenever one or more creatures die" ability (**Great Fierce Bee**, **Spectacle of Destruction**) triggers once; it used to trigger once per player. **Blood Artist** still triggers for each creature. Annihilator works the same way: the defending player chooses the permanents for **Kozilek, Butcher of Truth** or **Ulamog's Crusher**, then they are sacrificed together (two attacking Crushers are still two separate sacrifices). When you are the one sacrificing, the Academy still asks you which permanent; nothing leaves the battlefield until the last choice is made
- **Planar Engineering** with three or more lands sacrificed only one land when you chose which; it now sacrifices the two lands you choose, together
- **Gemstone Mine** and the depletion lands (**Hickory Woodlot**, **Peat Bog**, **Remote Farm**, **Sandstone Needle**, **Saprazzan Skerry**) make mana again, and now pay for it: each use removes one of their counters, and the land is sacrificed when the last one is gone. The **Vivid** lands, **Tendo Ice Bridge** and **Mirrodin's Core** can spend a charge counter for one mana of any color (they used to make only their plain mana). **Wall of Roots** makes {G} again by putting a -0/-1 counter on itself, once each turn, even while tapped or on the turn it comes into play
- Mana abilities that don't use {T} no longer tap their permanent: **Ashnod's Altar** and **Phyrexian Altar** can be used again while you have a creature to sacrifice, **Birchlore Rangers** taps only the two Elves it pays with, and **Kozilek's Translator** stays untapped. They work while tapped, too. Automatic payment uses **Treasonous Ogre**'s life only when nothing else can pay. Their printed limits now hold every turn: **Kozilek's Translator** and the other "once each turn" mana creatures (the Devotees, **Shire Scarecrow**, **Gravestone Strider**, **Salvaged Manaworker** and more) once per turn, **Manaforge Cinder**, **Initiates of the Ebon Hand** and **Farrelite Priest** three times, and **Vivi Ornitier** once, during your turn only. Vivi now makes mana equal to her power; she used to make one mana even at 0 power
- **Kinnan, Bonder Prodigy** no longer adds an extra mana when you sacrifice a creature to **Ashnod's Altar** or sacrifice an **Eldrazi Spawn** for mana. Only tapping a nonland permanent for mana counts
- A double-faced card on the battlefield now has only its front face's abilities. Its back face's keywords, abilities and effects used to come along: **Westvale Abbey** had Ormendahl's flying, lifelink, indestructible and haste (about 150 cards borrowed a keyword this way, among them **Tony Stark**'s flying and haste, **Bruce Banner**'s reach and trample and **King T'Challa**'s double strike); **Chalice of Life** could make a player lose 5 life, **Treasure Map** could draw like Treasure Cove, and **Halvar, God of Battle** and **Neglected Heirloom** offered their other face's Equip; **Bloodline Keeper** gave your other Vampires +2/+2, **Duskwatch Recruiter** made creature spells cheaper, **Heliod, the Radiant Dawn** let you cast spells as though they had flash, **Emet-Selch, Unsundered** exiled every card headed to your graveyard and **Liliana's Other Contract** kept you from losing the game; **Lambholt Elder** drew a card when it dealt combat damage, and **Tangleclaw Werewolf** had to be blocked
- **Hostile Hostel** can tap for mana the turn it is played, like any land (it was treated as a summoning-sick creature)
- A double-faced card is judged by its front face everywhere: **Treasure Map**, **Growing Rites of Itlimoc** and the **Ojer** gods entering no longer trigger landfall (**Lotus Cobra**), **Halvar** entering no longer counts as an artifact entering, two **Westvale Abbeys** no longer fall to the legend rule, an Enchant-land Aura on a **Treasure Map** is put into the graveyard, and **Captain America**'s Catch and **Codsworth** no longer offer **Halvar** or **Dorothea** as an Equipment or Aura to attach. In a graveyard, a double-faced card counts only as its front face: a **Westvale Abbey** is a land card and not a creature card (**Tarmogoyf**, **Boneyard Wurm**, **Gnaw to the Bone**, delirium), and a modal card such as **Agadeem's Awakening** is a sorcery card, not a land card
- An Equipment that can't equip a creature right now (a crewed **Rover Blades**) no longer offers its Equip ability, which was paid for and then did nothing
- **Kiki-Jiki, Mirror Breaker**, **Tempestra, Dame of Games**, **Orthion, Hero of Lavabrink** and **The Fire Crystal**: when a token doubler (**Doubling Season**, **Parallel Lives**, **Anointed Procession**) turns the copy into two tokens, or **Orthion** makes five, they are all sacrificed at the end step at once, so a "whenever one or more creatures die" ability (**Vengeful Townsfolk**) triggers once; it used to trigger once per token. **Blood Artist** and **Korvold, Fae-Cursed King** still trigger for each token. **Stormsplitter**'s doubled copies are exiled together the same way
- A cost that sacrifices several permanents now sacrifices them all at once: **Tooth and Claw**, **Sai, Master Thopterist**, **Mondrak, Glory Dominus**, **Zopandrel, Hunger Dominus**, **Bankrupt in Blood**, a number of Treasures or Foods (**Olivia, Opulent Outlaw**, **Grim Hireling**, **Samwise Gamgee**) and **Pulverize**'s two Mountains. So do **Cosmic Larva**'s two lands and **Planar Engineering**'s two lands when you have no other lands to choose from, and **Gush**'s two Islands return to your hand together. A "one or more creatures die" or "leave the battlefield" ability (**Vengeful Townsfolk**, **Dour Port-Mage**) triggers once for the group instead of once per permanent
- Adventure cards whose permanent half is an artifact (**Monster Manual**, **Two-Handed Axe**, **Glamdring, Foe-hammer**, **My Precious**, **Ghost Lantern**, **Altar of Bhaal**) are now cast as the artifact, at its own cost and only when you could cast a sorcery. They used to be offered as one combined spell costing both halves added together (Two-Handed Axe even on an opponent's turn), and a Monster Manual cast that way was handed to the rules Arbiter instead of entering the battlefield. Their Adventure halves are not offered yet
- The Final Fantasy Town lands with an Adventure (**Midgar, City of Mako**, **Ishgard, the Holy See**, **Lindblum, Industrial Regency**, **Zanarkand, Ancient Metropolis**) now enter the battlefield as the land alone; they used to carry their Adventure's name and text onto the battlefield with them
- A spell's mana value on the stack now counts the X it was cast for, and a split card or an Adventure counts only the half that was cast. **Hungering Hydra** cast for X = 5 has mana value 6: **Thoughtbind** can no longer counter it and **Disdainful Stroke** now can. **Fire** from **Fire // Ice** has mana value 2 (for **Spell Snare**, not **Disdainful Stroke**), and **Fertile Footsteps** has mana value 3, not **Beanstalk Giant**'s 7. Triggers that check a spell's mana value read the same number: **Eidolon of the Great Revel** and **Pyrostatic Pillar** no longer punish a big X spell but do punish **Fire**, **Up the Beanstalk** draws for an X spell cast for 5 or more, and **Kellan, the Kid** and **Rashmi, Eternities Crafter** compare against the X spell's full mana value. **Bolas's Citadel** now charges the life of the face you cast (**Harnfel, Horn of Bounty** costs 5 life, not **Birgi**'s 3), and **Mana Drain** on **Monster Manual** adds 4 mana, not 7
- A planeswalker's loyalty ability that adds mana was used as a free mana source: **Chandra, Torch of Defiance** paid {R}{R} and **The Aetherspark** ten mana of one color toward any spell, with no loyalty spent and at any time, even on an opponent's turn, and **Liliana of the Dark Realms** paid {B}{B}{B}{B} from an emblem she had never made. Loyalty abilities no longer pay for spells or abilities (25 planeswalkers, among them **Sarkhan, Fireblood**, **Ugin, Eye of the Storms**, **Xenagos, the Reveler**, **Koth of the Hammer** and **Lukka, Bound to Ruin**)
- Cards made mana that belongs to something else, that depends on a condition, or whose cost was skipped. **Roxanne, Starfall Savant** tapped for any color like her Meteorite tokens; **Deathrite Shaman** made mana with no land card in any graveyard; **Soulbright Flamekin** and **Soulbright Seeker** made {R}{R}{R}{R} or more on every activation; **Selvala, Explorer Returned** made {G} without revealing anything; **Springjack Pasture** made any color without sacrificing Goats (it now makes {C}); **Thornvault Forager** made two mana of any colors without foraging (now {G}); **Evendo, Waking Haven** and **Uthros, Titanic Godcore** made their station mana with no charge counters (now one {G} / {U}); **Gemstone Mine** and the depletion lands (**Hickory Woodlot**, **Peat Bog**, **Remote Farm**, **Sandstone Needle**, **Saprazzan Skerry**) never ran out. These, and **Deranged Assistant**, **Millikin**, **Cryptex**, **Wall of Roots**, **Pili-Pala**, **Witch Engine**, **Red Death, Shipwrecker**, **Old-Growth Troll**, **Harold and Bob, First Numens**, **Glorious Sunrise**, **Princess Yue** and **Hydro-Man, Fluid Felon**, now make no mana from those abilities until they are supported
- A permanent sacrificed by its own **Fading** or **Vanishing** at your upkeep (**Blastoderm**, **Waning Wurm**, **Rejuvenation Chamber**) now leaves like any other sacrifice. Under **Rest in Peace**, or with an opponent's **Misery's Shadow** in play, it is exiled and does not count as dying; it used to trigger **Blood Artist** and count a death. "Whenever you sacrifice" and "whenever a player sacrifices" abilities (**Korvold, Fae-Cursed King**, **Mayhem Devil**) now trigger for it; they never did
- The Warrior tokens **Mobilize** makes (**Voice of Victory**) are now really sacrificed at the end step. They used to leave with no trigger at all. Now they die (**Blood Artist**, **Syr Konrad, the Grim**), count as sacrificed (**Korvold, Fae-Cursed King**, **Mayhem Devil**), and trigger a "one or more creatures die" ability once for the whole group. Under **Rest in Peace** they are exiled and do not die
- An **Urza's Saga** that is a creature when it is sacrificed after chapter III (made one by **Living Plane** or earthbend) now dies as a creature, so **Blood Artist** and other death abilities trigger. Under **Rest in Peace** it is exiled without dying
- A planeswalker that is sacrificed (to a cost such as **Claws of Gix** or **Spark Reaper**, or to an effect such as **Sheoldred's Edict**), or that the legend rule puts into the graveyard, now triggers "creature or planeswalker you control dies" abilities (**Cruel Celebrant**). Before, only a planeswalker that was destroyed, ran out of loyalty or was sacrificed alongside others did
- The AI judged some cards by what it paid for them instead of their mana value: a kicked **Kavu Titan** counted as a five-drop rather than a two-drop, a bestowed **Boon Satyr** as a five-drop, **Everflowing Chalice** kicked three times as a six-drop, and a strive spell such as **Rouse the Mob** grew with each extra target. Cards with {2/W}-style symbols counted at about half their mana value (**Spectral Procession**, **Flame Javelin** and **Reaper King** as half-price spells, **Wildgrowth Archaic** as a two-drop). The AI now ranks every cast by the card's mana value, which kicker, bestow and strive don't change. Counterspells that check mana value (**Spell Snare**, **Thoughtbind**, **Disdainful Stroke**) and **Mana Drain** already read the right number and are unchanged
- Every choice in a Learn game now reads as words. An activated ability names its card, its text, its target and its cost ("Activate Mind Stone: Draw a card ({1}, {T}, sacrifice it)"), a crew names the Vehicle and how many creatures it taps, a cycle names its cost ("Cycle Street Wraith (pay 2 life)"), and a loyalty ability names its planeswalker and loyalty cost ("Activate Liliana of the Veil -2: Target player sacrifices a creature → Opponent"); they used to read "activate ability", "crew vehicle", "cycle" and "activate loyalty". Suspend, plot, turning a card face up, the graveyard and hand abilities, the companion and the free-cast choices got the same treatment. The choice list shown without the board read "pass-priority" and dropped a spell's target; it now uses the board's wording. An attack with only one defender lost its double space ("Attack  with"), and hovering a button shows its full label instead of the engine's name for it
- Seats are named the way the board names them. Ask Jace's view of the game said "You's turn" on your turn (now "your turn"); an opponent's board read "ai's Battlefield" and its back button "viewing ai", and a hand you make an opponent reveal read "ai's hand is revealed" — now "Opponent's Battlefield", "viewing Opponent" and "Opponent's hand is revealed"
- A creature sacrificed to pay for an ability or a spell (**Carrion Feeder**, **Viscera Seer**, **Village Rites**) that **Rest in Peace** or a "die → exile it instead" effect exiles, or that shuffles itself away (**Blightsteel Colossus**), now shows in the game log as exiled or shuffled instead of dying, as one sacrificed for mana (**Ashnod's Altar**) already did. A Treasure or another permanent sacrificed for mana now puts its triggered abilities on the stack in the same order as one sacrificed for an ability: beside **Disciple of the Vault** and **Korvold, Fae-Cursed King**, Korvold's ability now resolves first for a Treasure too, as it already did for a Clue
- **Ancient Tomb** now deals 2 damage to you each time it taps for {C}{C}, whether you tap it yourself or it pays for a spell; it used to make the mana for free. **Tomb of Urami** now deals its 1 damage when you don't control an Ogre (it never did)
- Mana that can only be some colors no longer makes any color. **Command Tower**, **Arcane Signet**, **Commander's Sphere**, **Path of Ancestry** and **Hidden Hideout** make only colors in your commander's color identity, and no mana at all in a game where you have no commander. **Mox Amber** makes only colors among the legendary creatures and planeswalkers you control (none: no mana). **Exotic Orchard**, **Fellwar Stone**, **Quirion Explorer** and **Sylvok Explorer** make only colors that an opponent's lands could make, **Harvester Druid** only colors your lands could make, and **Star Compass** only colors your basic lands could make. All of these used to make any of the five colors, and so did **Reflecting Pool** and **Incubation Druid** beside a Command Tower, which now make your commander's colors
- An ability that lasts "this turn" was played as an ability of the card itself. **Maeve, Insidious Singer** drew a card every time Maeve attacked (the draw belongs to the creature she goads), **Pharika's Spawn** raised its "when it enters this way" trigger on every entry, not only when it escaped, and **Whirlwind, Killer Cyclone**, **Shelob, Child of Ungoliant** and **Whippoorwill** each raised a trigger when they themselves attacked or died. These abilities now do nothing until they are supported; none of the 26 cards involved was counted as supported, so coverage is unchanged
- A creature could carry two Roles from the same player, both granting their bonus: **Doubling Season** (or any card that doubles tokens) doubled a Role, and a second Role from the same player (**Splashy Spellcaster**, **Giant Inheritance**, **Charmed Clothier**, **Eriette's Whisper** and the rest) never replaced the first. Now only the newest of a player's Roles on a permanent stays and the others are put into the graveyard, so a replaced **Wicked** Role makes each opponent lose 1 life. Roles from different players on the same creature all stay
- Tapping a permanent for mana by hand on the Learn board skipped its cost. **Ashnod's Altar** added {C}{C} without sacrificing a creature, **Mox Opal** tapped without three artifacts, **Birchlore Rangers** tapped without tapping two Elves, **Springleaf Drum** without tapping a creature, **Molt Tender** without exiling a card, and **Mana Confluence**, the Horizon lands and painlands such as **Adarkar Wastes** made colored mana without the life. A manual tap is now offered only when its cost can be paid and pays exactly what automatic payment pays. It also makes what automatic payment makes: double under **Mana Reflection**, only the colors **Plaza of Heroes** or **Incubation Druid** can make right now, and a land's colors from **Urborg, Tomb of Yawgmoth** or **Yavimaya, Cradle of Growth**
- Mana that can only be spent on certain spells (**Mishra's Workshop**, **Ancient Ziggurat**) or that adds an effect when it is spent (**Path of Ancestry**) is no longer offered as a manual tap, because mana floating in your pool can't keep the restriction or the effect. Casting still uses those lands automatically
- Three lands were counted as fully supported because of a mana ability they give to other cards, which the game does not apply yet: the other Caves beside **Forgotten Monument**, your lands while **Riftstone Portal** is in your graveyard, and the Command Towers beside **Command Power Plant** never gain it. Those three now count as not yet supported; how every card plays is unchanged, and each still taps for its own mana
- The AI cast some Auras on its own side: **Fraying Sanity** on itself; **Petrify**, **Suppression Bonds**, **Stasis Cocoon**, **Secure Detention** and **Planar Disruption** on its own artifact or creature, which then could not attack, block or use its abilities; **Aether Meltdown** and **Mists of Littjara** on its own creature; **Nahiri's Binding** on its own planeswalker. An Aura that enchants a player, an artifact, a Vehicle or a planeswalker now goes on an opponent's when it hurts and on the AI's own when it helps (**Relic Ward**), and **Ice Over** and **Coma Veil** are held for now. **Animate Dead** returns the biggest creature card in any graveyard instead of an arbitrary one
- Damage from a fight or a bite (**Prey Upon**, **Rabid Bite**, **Ram Through**, **Justice Strike**, **Kogla, the Titan Ape**'s enters fight and the like) skipped every rule that applies to damage. It now counts as ordinary damage: **Dawn Elemental**, prevention shields and protection stop it, **Furnace of Rath** doubles it, lifelink gains life, infect and wither deal -1/-1 counters (and **Blightsteel Colossus**'s Ram Through excess gives poison), **Sengir Vampire** grows and **Kumano's Pupils** exiles what it fought to death, **Wolverine, Best There Is** doubles its fight damage and counts the fight for its end-step counter, and "whenever this creature is dealt damage / deals damage" abilities trigger
- **Bite Down**, **Hard-Hitting Question**, **Horrific Assault** and **Master's Rebuke** aimed at a planeswalker did nothing; the creature's damage now removes the planeswalker's loyalty
- **The Last Agni Kai** no longer adds red mana for damage that was prevented
- A creature with deathtouch that deals its damage as -1/-1 counters (infect or wither — for example **Glistener Elf** wearing **Basilisk Collar**) now destroys the creature it damages, in a fight and in combat
- 88 double-faced cards made mana their face that is up doesn't have: a land on the back face made the front a land, and a back face's mana ability counted as the front's. **Storm the Vault** tapped for {U} for each artifact and sacrificed itself, **Golden Guardian** tapped for two mana of any one color, **Growing Rites of Itlimoc** tapped for {G} for each creature you control, the **Ojer** gods tapped like their temples, a **Tamiyo, Inquisitive Student** returned with **Reanimate** made mana of any color without tapping, and a returned **Drowner of Truth** could sacrifice itself for mana. A double-faced card on the battlefield now makes only its front face's mana; a land played from its back face (**Drowned Jungle**, the Pathways) taps for its own mana as before
- Cards that tap for mana were counted as fully supported even when they also print a rule the game does not play yet: **Chromatic Lantern**'s lands never gain its any-color ability, **Mox Diamond** enters without its discard, **Devoted Druid**'s untap is never offered, **Phial of Galadriel**'s replacements never apply, and 37 more. Those 41 now count as not yet supported (corpus coverage 44.7% → 44.6%); how every card plays is unchanged
- The game no longer sacrifices a creature or spends a one-use mana source to pay a cost that your untapped lands and artifacts can pay. **Dark Ritual** with a Swamp beside **Blood Pet** or **Basal Sliver** used to sacrifice the creature whenever it had come into play first, an **Eldrazi Spawn** paid for a colorless symbol beside an untapped **Sol Ring**, **Ashnod's Altar** sacrificed a creature for a generic cost, and a **Simian Spirit Guide** was exiled from hand beside an untapped dual land. They are now used only when nothing else can pay the cost. The AI and simulated games pay the same way
- When the game taps your lands and artifacts to pay a generic cost, it now uses a colorless source such as **Sol Ring** before a colored land. Activating a {2}{R} ability with three Mountains and a Sol Ring used to tap all three Mountains whenever they had been played before the Ring, so a **Lightning Bolt** cast next could not be paid for; it now taps the Ring and one Mountain. A source that costs something more to use — life, a sacrifice, stored counters, or a **Mana Vault** or **Basalt Monolith** that stays tapped — is not moved ahead, and a Treasure is still used last. The AI and simulated games pay the same way
- A Sliver that used the ability **Basal Sliver** gives it ("Sacrifice this permanent: Add {B}{B}") was tapped instead of sacrificed, so it made {B}{B} again every turn (four under **Mana Reflection**) and could not be used the turn it entered. It is now sacrificed, makes {B}{B} once, and can be used the turn it enters, as the ability has no {T}. A Food under **Ninja Pizza** had the same fault — it tapped for one mana every turn — and is now sacrificed when used
- A creature sacrificed for mana — an **Eldrazi Spawn** token, **Basal Sliver**, a Treasure that **Vihaan, Goldwaker** made a creature, a creature fed to **Ashnod's Altar** — now dies as far as every other card is concerned: **Blood Artist** and other "whenever a creature dies" cards trigger, an opponent's included, and it counts as a creature that died this turn. Spawn tokens cracked for mana used to trigger none of them. A creature fed to an Altar under **Rest in Peace** is exiled instead and no longer triggers them or counts as a death, and **Korvold, Fae-Cursed King** and the other "whenever you sacrifice" cards now see a creature fed to an Altar
- **Lion's Eye Diamond** and **Overeager Apprentice** made their three mana without the discard their cost requires (the Diamond's whole hand, the Apprentice's one card), so a simulated game could pay for a spell with the Diamond and keep the rest of its hand. Until that discard is played out for real, neither card makes mana in the game engine. **Oddric, Lunar Marquis** could also sacrifice himself for {C}, an ability he only has while another of your creatures does; he no longer can
- **Virtue of Strength**, **Virtue of Courage** and **Promise of Aclazotz** were offered only as one combined card — both halves' costs added together, and Virtue of Courage even at instant speed on an opponent's turn; each now casts as its enchantment at the enchantment's own cost and timing (their Adventures are not offered yet)
- **Kaust, Eyes of the Glade** drew a card whenever it dealt combat damage to a player itself; its ability is about creatures that were turned face up this turn, so it no longer triggers that way
- A manifested **Gadget Technician** (and **Ponyback Brigade**, **Efreet Weaponmaster**, **Offender at Large**, **Rakish Scoundrel**, **Concert Kaboomist**, **Flavor Disaster**, **Crowd-Control Warden**) could be turned face up, but its "enters or is turned face up" ability then did nothing; like other cards whose own turned-face-up ability isn't supported yet, it is no longer offered the turn-up
- Abilities that trigger when a manifested creature is turned face up — including dies abilities, if it dies right away — now go on the stack immediately, before you act again
- A Theros God below its devotion (and a bestowed Aura, an attached reconfigure Equipment such as **Lizard Blades**, or a slumbering **Arixmethes**) is no longer treated as a creature: it can't be sacrificed to **Viscera Seer**, **Ashnod's Altar** or **Deadly Dispute**, targeted by **Putrefy**, copied by **Clone**, hit by **Chaos Maw** or exiled by **Farewell**'s creature mode, and it no longer counts for **Gaea's Cradle**, **Battle Squadron**, **Return of the Wildspeaker**, **Ghalta** or "if you control a creature with power 4 or greater" (**Garruk's Uprising**); **Soul Warden** and **Panharmonicon** ignore it entering, and **Renata** and **Rhythm of the Wild** give it no counter or riot
- A land or artifact that is a creature right now (animated, or a crewed Vehicle) is no longer a legal "noncreature permanent" target (**Bramblecrush**), and sacrificing it to pay a cost counts as a creature dying
- **Crux of Fate** ("non-Dragon") and **Fiery Cannonade** ("non-Pirate") spare a **Metallic Mimic** that named that type; **Winds of Rath** spares a creature enchanted only by a bestowed Aura
- More effects see only the front face of a double-faced card on the battlefield: **Armageddon** no longer destroys **Ojer Taq, Deepest Foundation** (its back face is a land), **Sword of Feast and Famine**'s "untap all lands you control" no longer untaps it, **Lunarch Veteran** isn't a Spirit for **Essence Flux**, and **Ashnod's Altar** and **Springleaf Drum** can't use a **Westvale Abbey** or a **Fable of the Mirror-Breaker** as a creature
- **Cabal Coffers** and the other mana and spell effects that count "each Swamp (Forest, …) you control" now count the land types **Urborg, Tomb of Yawgmoth** and **Dryad of the Ilysian Grove** give your lands
- Double-faced cards whose front face is not a creature but whose back face is — **Westvale Abbey**, **Heirloom Mirror**, **Hostile Hostel**, **Soulcipher Board**, **Sidequest: Raise a Chocobo** and 15 more — went to the graveyard the moment they entered the battlefield, read as a 0/0 creature. They now stay, as their front face: a double-faced card on the battlefield has only its front face's card types and subtypes, so **Treasure Map** is not a land, and **Delver of Secrets** and **Lunarch Veteran** don't count as their back faces' creature types for tribal effects. A back face's Aura or Equipment no longer attaches the front face to a creature (the Equip of **Sidequest: Play Blitzball** or **Idol of the Deep King**, **Codsworth, Handy Helper** moving **Dorothea, Vengeful Victim**)
- An "enters" (or other triggered) ability that must target something now takes a target even when the only legal ones are your own: **Man-o'-War** with no other creature on the battlefield returns itself to your hand, **Flametongue Kavu** alone deals 4 damage to itself, **Nekrataal** beside only your own nonblack creature destroys it, and **Mystic Snake** with only your own spells on the stack counters one. These abilities used to do nothing at all, for you and for the AI. When the ability has to land on your side it takes your least valuable permanent, and its damage never goes to your face while that could kill you and another target is legal. An optional ability ("you may") is still declined in that case, and the game log now says why
- An Aura put onto the battlefield without being cast — blinked, returned by **Sun Titan** or another reanimation, put onto the battlefield from your library — now enchants something as it enters, as the rules say: a harmful Aura such as **Pacifism** goes on an opponent's biggest creature, a helpful one on its controller's best. Hexproof doesn't stop it, protection does. With nothing it can enchant it stays where it was (exiled, in the graveyard). It used to come back attached to nothing and sit on the battlefield doing nothing. You choose for your own Auras (see Added)
- The choices on the **change the target** panel (**Misdirection** and the like) and on the panel for picking a card from among the ones you just milled could not be read — black text on the dark board — and didn't react to the mouse; they now read clearly and light up under the cursor
- An Aura attached to nothing is now put into its owner's graveyard, as the rules say
- The AI cast **Pacifism**, **Arrest** and the other "can't attack or block" Auras on its own best creature; it now casts them on an opponent's (and **Crippling Blight** and **Cast into Darkness**, which it used to hold, on an opponent's too)
- On the Academy board, every way to cast a card can now be picked. A card with more than one — kicked or not, teamwork, a mode, a value for X, an alternative cost, or an additional cost such as which creature to sacrifice — opens a small chooser that lists each one by what sets it apart, and a player or a spell on the stack gets its own target button. Before, clicking a target always cast the first option aimed at it, and a card whose options take no target (or target a player) left nothing to click
- The action bar under the Academy board no longer hides the legal actions past the sixth — a "+N more" list holds the rest — and its labels now name each cast's mode, X, kicker and costs, and show players as "You" / "Opponent 1" rather than an internal id. Clicking your commander in the command zone now offers to cast it
- Counting what your opponents control (**Dockside Extortionist**, **Mana Geyser**, **Dragon's Desire**, **Riot Control**) also counted the back face of a double-faced card: an opponent's **Edgar, Charmed Groom** made Dockside a Treasure as if it were an artifact, a tapped **Ojer Taq** gave Mana Geyser mana as if it were a land, and **Fable of the Mirror-Breaker** gave Riot Control life as if it were a creature. These counts now see only the face that is up, as your own counts already did
- Paying a generic cost with mana already in your pool now spends colorless mana first. Activating a {2}{R} ability with three red and two colorless floating used to spend all three red and keep the colorless, so a **Lightning Bolt** cast next could not be paid for; the red now stays in the pool. The AI and simulated games pay the same way
- **Blightsteel Colossus**, **Darksteel Colossus** and **Progenitus**, which are shuffled into their owner's library instead of going to the graveyard, were recorded as dying (or, under **Rest in Peace**, as exiled): the deck reality report counted them as combat deaths and the Crucible play-by-play said they died. The play-by-play now says each was shuffled into its owner's library instead, and it also shows a creature exiled instead of dying (Rest in Peace, Misery's Shadow, Lava Coil), which used to disappear without a line
- An opponent's creature sacrificed in the same event as your **Dauthi Voidwalker** (Barter in Blood, Living Death) went to the graveyard instead of into exile with a void counter, because Dauthi left first; it is now exiled, as it already was when the two were destroyed together
- The AI could spend a whole turn re-equipping **Lightning Greaves** onto a **Lizard Blades** that was itself attached to a creature (it is not a creature while attached), ending the game as stuck. Equipment can now only be attached to something that is a creature at that moment — which also means a crewed Vehicle or an animated land can be equipped
- A spell or ability with "any target" could not be aimed at a player when more than 64 creatures were on the battlefield (the target list was cut off before the players); players are now always offered
- A loop nobody can stop (**Polyraptor** beside **Marauding Raptor**) now ends the game in a draw, as the rules say, after about a hundred copies; it used to run until the game froze and was abandoned
- **Pantlaza, Sun-Favored** asked "discover?" again for every Dinosaur that entered after its once-each-turn discover was used; it now asks once
- **Commander's Plate** gave protection from all five colors, the commander's own included; it now protects only from the colors outside your commander's color identity
- The AI could spend a whole turn re-activating a free Equip (Puresteel Paladin) that never attached, ending the game as stuck: an Equipment is no longer offered onto a creature with protection from its color, and the AI no longer activates the Equip of an Equipment that is currently a creature (**Halvar, God of Battle**)
- **Terror of the Peaks** and **Verdant Sun's Avatar** now use the entering creature's last known power or toughness when it has left the battlefield before their ability resolves; they used 0
- "If you control your commander" (the Lieutenant ability word) no longer counts an opponent's commander you have taken control of
- A copy made by **Reverberate**, **Twincast**, **Reiterate**, **Flare of Duplication** or **Force of Rowan** can now take new targets, triggers "whenever you cast or copy" abilities, and is not made of a spell that can't be copied
- **Mana Drain** counts a split card's or an Adventure's own half, and counts {X}{X} twice
- Change-target spells (Swerve, Misdirection, Deflection and the like) no longer offer a permanent with protection from the spell's colours as the new target
- **Welcoming Vampire** and **Enduring Innocence** now check the entering creature's power as it is on the battlefield (anthems and other effects counted), not the number printed on the card
- A spell that reads "the sacrificed creature" (Fling and the like) now keeps that creature's values even if another sacrifice happens in response; "sacrifice a creature" as a spell's cost now reads what is a creature at that moment (an animated land can be sacrificed; a bestowed Aura cannot)
- Simulated games with **The Unbeatable Squirrel Girl** no longer hang. The AI used to activate her Squirrel-doubling ability on top of itself without end; it now makes Squirrels only until it has enough to win, stops everything else, and attacks every opponent in one combat
- A game could end in an error when **Phyrexian Altar** or **Ashnod's Altar** helped pay a cost alongside creatures that tap for mana (Cryptolith Rite, Enduring Vitality): the Altar could sacrifice a creature the same payment still needed. It now takes its victim last, never one the spell's or ability's own cost needs, and is not counted when no other creature could feed it
- A long but legitimate turn (hundreds of triggers resolving one after another) is no longer mistaken for an endless loop and cut off
- A game could freeze for minutes on one decision when a spell or ability with "X target …" could choose nearly every legal target (seen with a large board late in a game); listing those choices is now instant
- A simulated game whose board or stack grows out of control (more than 2,000 permanents under one player, or more than 500 objects on the stack) now ends as a stuck game in seconds instead of running for minutes

## [0.163.0] - 2026-10-02

### Added
- **Abrupt Decay**, **Chain Reaction**, **Priest of Titania** (and **Wirewood Channeler**)
- **Plaguecrafter** (and **Demon's Disciple**) — each player sacrifices a creature or planeswalker; each player who can't discards a card
- **Class enchantments** — gain the next level as a sorcery to add its ability: **Caretaker's Talent**, **Wizard Class**, **Ranger Class**, **Stormchaser's Talent**; also **Esika's Chariot** and **Three Blind Mice** (copy a token you control)
- **Mangara, the Diplomat** — draws when an opponent attacks you and/or your planeswalkers with two or more creatures; **Trouble in Pairs** — opponents skip their extra turns, and you draw when an opponent attacks you with two or more creatures, draws their second card or casts their second spell each turn; also **Everett K. Ross, Hapless Attaché**
- **Liquimetal Torque**, **Liquimetal Coating**, **Myr Landshaper** and **Argent Mutation** — make a permanent an artifact until end of turn ("nonartifact" removal can no longer target it; artifact removal can)
- **Culling Ritual** — destroy each nonland permanent with mana value 2 or less; add {B} or {G} for each permanent destroyed this way
- **Saw in Half** — destroy target creature; if it dies this way, its controller gets two token copies with half its power and toughness, rounded up
- **Cloud Key** — as it enters, choose artifact, creature, enchantment, instant or sorcery; spells you cast of that type cost {1} less
- **Talon Gates of Madara** — pay {4} to put it from your hand onto the battlefield at instant speed (not a land drop); its enters trigger phases out up to one creature
- **Reprieve** — return target spell to its owner's hand (an uncounterable one too), then draw a card; also **Bilbo's Gambit** (without the gift) and **Spellscorn Coven // Take It Back**
- **Necropotence** — skip your draw step; cards you discard are exiled; pay 1 life to exile the top card of your library face down and put it into your hand at your next end step
- **Valakut Awakening** — put any number of cards from your hand on the bottom of your library, then draw that many plus one
- **Unbreakable Formation** — your creatures gain indestructible; cast in your main phase, each of them also gets a +1/+1 counter and vigilance (a copy, or a cast during combat, gets only the indestructible)
- **Champion of Lambholt** — creatures with less power than it can't block creatures you control (checked as blockers are declared, with every pump and counter counted)
- **Blasphemous Edict, Barter in Blood, Tergrid's Shadow, Taste of Death, Rankle's Prank and Abyssal Gorestalker** — "each player sacrifices N creatures" works: each player chooses their own, in turn order, and they are all sacrificed at once; Blasphemous Edict costs {B} while thirteen or more creatures are on the battlefield
- **Planar Collapse** — at the beginning of your upkeep, if there are four or more creatures on the battlefield, it is sacrificed and destroys all creatures
- **Rise of the Dark Realms** and **Liliana Vess** — "put all creature cards from all graveyards onto the battlefield under your control" works: they enter together under your control, and each still goes to its owner's graveyard when it dies
- **Adeline, Resplendent Cathar** — whenever you attack, a 1/1 white Human enters tapped and attacking each opponent
- **Massacre Wurm** — whenever a creature an opponent controls dies, that player loses 2 life, including the creatures its own -2/-2 kills
- **Maskwood Nexus** — your creatures are every creature type, and so are your creature spells and the creature cards you own in your hand, library, graveyard and command zone: tribal tutors, cost reducers, cast triggers, Cavern of Souls and Path of Ancestry all see them; its {3}, {T} ability makes a 2/2 Shapeshifter
- **Mirror Entity, Mutavault and Faceless Haven** — "all creature types" works: tribal lords, triggers, counts and costs treat the creature as every creature type until end of turn, and Mirror Entity's X/X reaches an animated land too
- **Birgi, God of Storytelling // Harnfel, Horn of Bounty** — cast either face: Birgi (each spell you cast adds {R} that stays in your pool until end of turn; your creatures can boast twice each turn) or Harnfel (discard a card to exile the top two cards of your library; you may play them this turn)
- **Savage Ventmaw, Brazen Collector and Sakura-Tribe Springcaller** — the mana they add stays in your pool until end of turn instead of emptying between steps
- **Disciple of Freyalise** — when it enters, you may sacrifice another creature; if you do, you gain life and draw cards equal to that creature's power
- **Living Death and Living End** — each player exiles the creature cards from their graveyard, sacrifices all creatures they control, then puts the exiled cards onto the battlefield

### Fixed
- "Deals damage to each creature" (Pyroclasm, Chain Reaction) now hits animated lands and no longer hits bestowed Auras or Gods below their devotion; Gaea's Cradle and Elf counts no longer count the back face of a double-faced card
- A spell or ability whose target became illegal before it resolved (gained protection, hexproof or shroud, changed controller, stopped being a creature) no longer affects that target, and does nothing if all its targets are illegal — protection in response to Swords to Plowshares now works
- A wrath no longer kills a creature its Umbra (umbra armor) or another protection should save when the protecting Aura happens to be processed first; destruction is now simultaneous
- A creature that is exiled or shuffled away instead of dying (Progenitus, Rest in Peace) no longer triggers "whenever a creature dies", and a destroyed animated land or crewed Vehicle now does
- Attack triggers ("whenever this attacks …", annihilator, mobilize, the Ur-Dragon) now resolve before blockers are declared, so a creature an attack trigger says can't block really can't, and tokens an attack trigger makes exist before blocks
- A creature removed from combat (destroyed, bounced, stolen, regenerated) after attacking can no longer be blocked, and the combat steps no longer get skipped when the only declared attacker died
- Class enchantments' level 2 and level 3 triggered abilities no longer work while the Class is still level 1
- A plotted or suspended card that was cast from exile, and later exiled again (Swords to Plowshares), could be cast for free a second time; it no longer can
- A commander an opponent steals keeps its owner's Backgrounds ("Commander creatures you own have …") and no longer gains the thief's
- **Crush** and **Bramblecrush** could destroy creatures (they read "noncreature" as "creature"), and **Bedevil** could target only creatures; **Stone by Sunlight** now makes its target an artifact (it was filed as a creature type)
- "Nonblack"-style removal, protection from a colour, colour-counting cards and colour-paying costs now see a permanent's current colours (after a colour-changing effect such as Cerulean Wisps or Singe), and double-faced permanents have their front face's colours instead of none
- **Plunder the Trollshaws** cast with flashback now draws two cards; it drew one
- A copy that sets its own power and toughness no longer keeps the original's power/toughness-defining ability (Quicksilver Gargantuan copying Tarmogoyf stays 7/7)
- An attacking creature that phases out is now removed from combat; the defending player could still block it
- A countered or returned split, modal double-faced or adventure spell now goes to its zone as the whole card; a flashback spell that is countered or bounced is exiled as flashback says (it used to return to hand, castable again); a countered copy of a spell no longer leaves a card behind
- An Adventure that fizzles now goes to the graveyard instead of being exiled on its adventure, and a copy of an Adventure no longer puts an extra card into exile
- A permanent put onto the battlefield without being cast (reanimated, searched up, blinked, put from your hand) now enters the way its card says: tapped, with its counters, with its choices made, and with others' "enters with" effects applied; it used to enter as if those lines weren't there (a reanimated Spike Feeder died with no counters, a fetched shockland or check land came in untapped for free)
- A creature you stole (Act of Treason, Control Magic …) now goes to its owner's graveyard, hand, library or exile when it leaves the battlefield, and undying/persist return it under its owner; it used to go to the thief's
- The cleanup step's hand-size discard now triggers "whenever you discard" abilities, and triggers that happen during cleanup resolve in that turn's cleanup instead of the next turn
- Paying life to activate an ability is no longer allowed while your life total can't change (Teferi's Protection); Necropotence and Yawgmoth's Bargain activated for free there
- Tokens are the colors their card says (they were all colorless): protection from a color now stops a token of that color, color anthems pump tokens, and "nonblack"-style removal can target tokens of other colors
- **Steel Overseer** put its counter on changelings that aren't artifacts (and on creatures made every creature type); it now counters artifact creatures only
- Modal double-faced spells (Valakut Awakening, Fell the Profane, Birgi …) are their face's colors; they were cast colorless, so "colorless spell" triggers and counters wrongly saw them
- Alternative costs (the Bringers' {W}{U}{B}{R}{G}, Fist of Suns, the Traps' conditional costs) now pay cost increases such as Thalia, Guardian of Thraben's; they were offered without the tax
- A creature returned from a graveyard (Tormod, Syr Konrad) no longer triggers for its own return or for the cards returned with it
- Endless Foot Assault's Ninja tokens are black (they were colorless)
- **Merfolk Wayfinder** and **Elder Pine of Jukai** now put the Island cards / land cards they reveal into your hand (they took none), and a changeling is no longer taken as an Island card
- **Overlord of the Balemurk** could return a changeling as a "non-Avatar creature card"; a changeling is every creature type, so it no longer can
- Changeling cards count as every creature type in your hand, library and graveyard too: Goblin Matron finds one as a Goblin card, Boggart Birth Rite returns one, Vengeful Firebrand sees one as a Warrior card; For the Ancestors now chooses only among creature types
- A changeling could block a creature that "can't be blocked by Walls", and "Spacecraft creatures you control get +3/+3"-style effects pumped it; every creature type now means creature types only
- Amass created a second Army token when you controlled a changeling (a changeling is an Army); it now puts the counters on the changeling
- Creatures that only make changeling tokens (Belonging, Springleaf Parade) were counted as changelings by tribal counts and "non-Human" effects; real changelings now also trigger "another Elf enters"-style abilities and count for Sliver Legion and similar
- **Tato Farmer** keeps its milled-land ability under Scryfall's updated wording ("tapped under your control"); the next card-data update would otherwise have turned it off
- Blood Artist, Zulaport Cutthroat, Morbid Opportunist and other death watchers triggered only for their own death when they died together with other creatures (a board wipe, a combat trade); they now trigger for each creature that died with them

## [0.162.0] - 2026-10-01

### Added
- **Cabal Ritual and Thermal Blast** — threshold: with seven or more cards in your graveyard, Cabal Ritual adds five black instead of three and Thermal Blast deals 5 damage instead of 3
- **Selvala, Heart of the Wilds** — whenever another creature enters, its controller may draw a card if its power is greater than every other creature's
- **Silence** — your opponents can't cast spells this turn
- **Helm of the Host and Followed Footsteps** — each turn, a token copy of the equipped (or enchanted) creature; Helm's copy isn't legendary and has haste
- **Underworld Breach** — each nonland card in your graveyard can be cast from there by paying its mana cost and exiling three other cards from your graveyard; an escaped instant or sorcery goes back to the graveyard, and an escaped Uro or Phlage stays on the battlefield
- **Dauthi Voidwalker** — a card that would be put into an opponent's graveyard is exiled with a void counter instead; sacrifice it to play one of those cards this turn without paying its mana cost
- **Rest in Peace and Leyline of the Void** — a card (for Rest in Peace, a card or token) that would be put into a graveyard is exiled instead; a creature or planeswalker exiled this way never dies
- **Shifting Woodland** — with delirium, it becomes a copy of a permanent card in your graveyard until end of turn
- **Dawn's Truce and Lazotep Plating** — you and permanents you control gain hexproof until end of turn
- **Anger, Wonder, Brawn, Filth and Valor** — while in your graveyard, with the matching basic land type under your control, your creatures have haste, flying, trample, swampwalk or first strike
- **Sevinne's Reclamation** — cast with flashback, you may copy it, and the copy returns a different permanent card
- **Mana Geyser, Battle Hymn, Songs of the Damned, Brightstone Ritual, Inner Fire and Dragon's Desire** — add one mana for each thing counted (tapped lands your opponents control, creatures you control, creature cards in your graveyard, Goblins, cards in your hand, your opponents' artifacts)
- **Black Market, Altar of Shadows and Giant-Man, Gargantuan Genius** — at the beginning of your first main phase, add mana for each charge counter (Giant-Man: each creature you control with power 4 or greater)
- **Dryad of the Ilysian Grove and Prismatic Omen** — lands you control are every basic land type, so each of them taps for any color
- **Braids, Arisen Nightmare** — at your end step you may sacrifice an artifact, creature, enchantment, land or planeswalker; each opponent then sacrifices a permanent that shares a card type with it, or loses 2 life while you draw a card
- **Turning a manifest face up** — a face-down manifested creature card can be turned face up any time you have priority by paying its mana cost; manifest dread creatures can flip too
- **Reality Shift, Soul Summons, Sultai Emissary, Soul-Strike Technique and Qarsi High Priest** — manifest the top card of a library
- **Hullbreaker Horror, Dreamshackle Geist and Sawblade Slinger** — "choose up to one" modes: the ability can choose none, and Hullbreaker returns an opponent's spell or nonland permanent to its owner's hand
- **Bolas's Citadel** — cast spells from the top of your library by paying life equal to their mana value; tap and sacrifice ten nonland permanents to make each opponent lose 10 life
- **"Sacrifice two artifacts"-style costs** — Sai, Master Thopterist, Mondrak, Zopandrel, Breya, Time Sieve and nine more: the least valuable permanents of the class are sacrificed, and the action names them
- **Etali, Primal Storm** — when it attacks, exile the top card of each player's library and cast any number of the spells among them for free, opponents' cards included
- **Multikicker** — Everflowing Chalice, Gnarlid Pack, Wolfbriar Elemental, Lightkeeper of Emeria and the other multikicker cards the engine plays can be kicked any number of times; Everflowing Chalice enters with a charge counter per kick and taps for {C} per counter
- **Malakir Rebirth** — choose a creature and lose 2 life; until end of turn, when it dies it returns to the battlefield tapped
- **Gray Merchant of Asphodel, Kokusho, Malakir Bloodwitch and six more** — each opponent loses life (a printed amount, your devotion to black, or the number of Vampires you control) and you gain the life lost
- **Animate Dead** — return a creature card from any graveyard under your control, -1/-0; it is sacrificed if Animate Dead leaves
- **Idol of Oblivion and Bennie Bracks, Zoologist** — draw a card if you created a token this turn
- **Hideaway** — Mosswort Bridge, Windbrisk Heights and Clive's Hideaway hide a card as they enter and cast it free once their condition is met
- **Tireless Provisioner and Ant-Man's Army** — create a Food or a Treasure token (the autopilot takes the Treasure)
- **Three Tree City** — {2}, {T}: add mana of one color equal to the number of creatures you control of the chosen type
- **War Room** — {3}, {T}, pay life equal to the number of colors in your commanders' color identity: draw a card
- **Victimize** — sacrifice a creature to return two creature cards from your graveyard to the battlefield tapped
- **Urza's Saga** — plays as your land drop: taps for {C} after chapter I, makes Constructs after chapter II, and fetches an artifact with mana cost {0} or {1} at chapter III
- **Digsite Engineer** — pay {2} when you cast an artifact spell to create a Construct that grows with your artifacts
- **Feed the Swarm** — destroy a creature or enchantment an opponent controls; you lose life equal to its mana value
- **Myriad Landscape** — sacrifice it to fetch up to two basic lands that share a land type
- **Bloodrush** — Rubblebelt Maaka, Ghor-Clan Rampager and nine more: discard one from your hand during combat to pump an attacking creature
- **Pearl-Ear, Imperial Advisor** — enchantment spells you cast have affinity for Auras, and casting an Aura at a modified permanent you control draws a card
- **Umbra Mystic** — Auras attached to permanents you control have umbra armor
- **With Great Power . . ., Pariah, Pariah's Shield, Empyrial Archangel, Protector of the Crown** — damage that would be dealt to you is dealt to the enchanted, equipped or named creature instead
- **Mantle of the Ancients** — when it enters, returns any number of Aura and Equipment cards from your graveyard attached to the enchanted creature
- **Celestial Mantle** — when the enchanted creature deals combat damage to a player, its controller's life total doubles
- **Eiganjo Castle** — {W}, {T}: prevent the next 2 damage to a target legendary creature this turn
- **Fblthp, Lost on the Range** — plot the top card of your library for its mana cost, then cast it free on a later turn
- **Eladamri, Korvecdal** — tap it and two creatures to reveal a creature from your hand or the top of your library and put it onto the battlefield
- **Sakashima's Protege** — enters as a copy of any permanent that entered this turn (its Flash and Cascade work as printed)
- **One with the Multiverse, Zaffai and the Tempests, Vision, Spectral Synthezoid and Omniscience** — cast a spell without paying its mana cost (once each turn, or freely with Omniscience), at the normal time for that spell

### Fixed
- A second "can't cast" effect on a player in the same turn (Ranger-Captain of Eos, Permission Denied) erased that player's own Irencrag Feat limit, so they could cast more spells than it allows; both now hold
- The graveyard-exile pick from Relic of Progenitus, Scrabbling Claws, Graveyard Shovel and Merrow Bonegnawer was headed "Take a card?"; it now asks the player to exile a card from their graveyard
- A permanent that became a copy of another (Thespian's Stage) kept tapping for its own printed mana; it now has only the copy's mana abilities
- Copying an instant or sorcery (Reverberate, Twincast, Flare of Duplication) put a second copy of the original card into its owner's graveyard when the copy resolved
- Landwalk and land-type conditions ignored land types granted by an effect (Urborg, Tomb of Yawgmoth; Yavimaya, Cradle of Growth): a swampwalker or forestwalker could be blocked by a player whose lands had gained that type, and "When you control no Swamps, sacrifice this creature" could fire while such a land was out
- Bolas's Citadel let the top card of your library be cast by paying its mana cost; it now costs life equal to the spell's mana value, as printed
- The AI never cast spells from the top of its library (Future Sight, Mystic Forge and the like); it does now
- Exsanguinate and the other each-opponent drains gained life for an opponent whose life total couldn't change; you now gain only the life actually lost
- Gemstone Caverns tapped for any color without a luck counter; it makes {C} until it has one
- Signets, the {1} filter lands (Darkwater Catacombs and kin), Cabal Coffers, Chromatic Star and every other mana ability with a mana cost now pay that cost — they used to tap for free, so a lone Signet could pay for spells
- Tapping a karoo land or a Signet by hand adds both of its colors, not two of one
- Commander's Plate gave your commander protection from all five colors (its own included) once the commander was cast; it now protects from exactly the colors outside your commander's color identity
- Lands that enter with counters (the Vivid lands, the depletion lands, Gemstone Mine) got four times their counters under Doubling Season instead of twice
- Song of Freyalise, Huatli, Poet of Unity and Welcome to . . . no longer tap for mana themselves (the mana in a Saga's chapter text was read as the card's own ability)

## [0.161.0] - 2026-09-30

### Added
- **The Reality Chip** — while it is attached to a creature, you may play lands and cast spells from the top of your library
- **Katsumasa, the Animator** — animates a noncreature artifact you control into a flier (a Vehicle keeps its printed size, anything else is 1/1), and feeds +1/+1 counters to up to three noncreature artifacts each upkeep
- **Mu Yanling, Wind Rider, Aeronaut Admiral and Wish Good Luck** — the 3/2 crew-1 Vehicle token, and "Vehicles you control have flying" (crewed or not)
- **The Indomitable and Gravecrawler** — castable from your graveyard while their condition holds (three tapped Pirates and/or Vehicles; a Zombie)
- **Tend the Sprigs** — makes its Treefolk when you control seven or more lands and/or Treefolk
- **Emry, Lurker of the Loch and Silas Renn, Seeker Adept** — choose an artifact card in your graveyard; you may cast it this turn
- **Thespian's Stage and Mizzium Transreliquat** — become a lasting copy of a land or artifact while keeping the ability that did it
- **Shameless Charlatan** — your commander can become a copy of another creature, and keeps the ability to do it again
- **Subterfuge** — when it enters, one of your creatures gains flying and draws a card per combat damage it deals to a player this turn
- **Overlord of the Balemurk** — when it enters or attacks it mills four, then you may return a non-Avatar creature or a planeswalker card to your hand
- **Colossal Grave-Reaver** — when creature cards are milled from your library, one of them is put onto the battlefield (you choose which)
- **Kiki-Jiki, Mirror Breaker, Tempestra, Dame of Games, Orthion, Hero of Lavabrink and The Fire Crystal** — copy a creature you control as a hasty token that is sacrificed at the beginning of the next end step
- **Stormsplitter** — each instant or sorcery you cast makes a copy of it, exiled at the next end step
- **Together Forever** — {1}: choose a creature with a counter on it; if it dies this turn, it returns to its owner's hand
- **"When that creature dies this turn, …"** — Blessed Defiance, Make Your Mark, Otherworldly Outburst, Scarblade's Malice, Felonious Rage and Grim Javelineer now pay off when the creature they touched dies that turn
- **Foot Chopper** — when the equipped creature connects you may sacrifice it to draw cards equal to its power
- **"You may sacrifice it. If you do, …"** — Impaler Shrike, Haunted Cadaver and Cacophony Scamp can now cash themselves in after they connect
- **Bebop, Skull & Crossbones** — when Bebop connects you may draw a card per counter on him, losing that much life only if you do
- **"Draw X cards, where X is …"** — Liliana's Standard Bearer, Brilliant Spectrum, Surrakar Spellblade and Barrin's Codex now draw their count
- **Heroes in a Half Shell** — when your Mutants, Ninjas and Turtles connect, each of the ones that dealt damage gets a +1/+1 counter and you draw a card
- **Brago, King Eternal** — when Brago deals combat damage to a player, flicker any number of your nonland permanents: the ones worth it (creatures with enters abilities, tapped permanents, creatures an opponent's Aura holds), never tokens
- **Thassa, Deep-Dwelling** — flickers another creature you control at your end step, and taps another target creature
- **Elesh Norn, Mother of Machines** — permanents entering no longer trigger abilities of permanents your opponents control (their enters abilities, watchers and landfall stay quiet; emblems still work)
- **Dour Port-Mage** and **Sally Sparrow** — "whenever one or more other creatures you control leave the battlefield" triggers once per batch; Port-Mage counts only creatures that leave without dying
- **Ingenious Prodigy** — at your upkeep, while it has a +1/+1 counter, you may remove one to draw a card (the same "remove a counter. If you do" choice now works wherever a card's text is otherwise supported)
- **Roaming Throne** — triggered abilities of your other creatures of the chosen type trigger an additional time
- **Veil of Summer** — draws when an opponent has cast a blue or black spell this turn, makes your spells uncounterable for the rest of the turn (including ones already on the stack), and gives you and your permanents hexproof from blue and black until end of turn
- **Traps** — Ricochet, Mindbreak, Pitfall, Needlebite, Runeflare, Ravenous, Lethargy and Slingbow Trap (and Admiral's Order) offer their cheap alternative cost exactly when its condition is met this turn; Mindbreak Trap exiles any number of spells, even ones that can't be countered
- **Teamwork** — HULK SMASH!, Go Nuts!, Widow's Bite, Murdock's Crusade, Crossover Collaboration, Cruel Alliance and Helicarrier Strike can be cast with teamwork: the game taps the creatures that pay it (naming them on the button) and the spell gets its upgrade — both modes for the "choose both" spells
- **Wolverine, Claws Out** — each Mutant you attack with doubles its power, and Wolverine can assign his combat damage as though he weren't blocked
- **Redirect spells** — Misdirection, Deflection, Shunt, Swerve, Bolt Bend, Redirect Lightning and Untimely Malfunction change the target of a single-target spell or ability; when there's more than one place it could go, you choose. The AI uses them to pull your removal off its creatures
- **Choose what to sacrifice** — Iron Man, Titan of Innovation, Ironclad Revolutionary and Benthic Criminologists let you pick which artifact to sacrifice (or decline); Iron Man fetches an artifact one mana value higher
- **Pod tutors** — Birthing Pod, Prime Speaker Vannifar, Oswald Fiddlebender and Repurposing Bay trade a sacrificed permanent for a card exactly one mana value higher
- **More damage doublers** — Raphael, the Muscle, Mjölnir, Hammer of Thor (with its Equip worthy), Absorbing Man and Titania, Fiendish Duo and Calamity Bearer
- **Hydroelectric Specimen** — flash it in and pull an instant or sorcery's single target onto it
- **Crime** — targeting an opponent, anything they control, or a card in their graveyard is a crime; Patrolling Peacemaker, Raven of Fell Omens, Marauding Sphinx, Magda, Blood Hustler, Slickshot Vault-Buster, Omenport Vigilante and six more now play
- **Kicked spells that change their target** — Galadriel's Dismissal (a creature, or every creature a player controls when kicked), Bloodchief's Thirst, Tear Asunder, Highly Illogical, Divine Resilience and Probe; plus Field Research, Wild Onslaught and Bold Defense
- **Targeted phasing** — Clever Concealment, Vodalian Illusionist and Brokers Confluence can phase permanents out; Auras and Equipment go with them and come back attached
- **"When you cycle this card" triggers** — Agonasaur Rex, Krosan Tusker, Titanoth Rex, Splendor Mare, the Sojourners and more can now be cycled, and their trigger resolves before you draw
- **Ascend and the city's blessing** — control ten or more permanents with an Ascend card out and you get the blessing for the rest of the game; Arch of Orazca, Wayward Swordtooth, Skymarcher Aspirant, Dusk Charger and ten more now play
- **Vibrance, Catharsis, Emptiness, Wistfulness, Gruul Scrapper, Steamcore Weird and three more** — "if {R}{R} was spent to cast it" enter triggers now check the mana you actually paid
- **Ragavan, Nimble Pilferer** — when it connects, you get the Treasure and can cast the card it exiles from your opponent's library that turn; the card stays theirs and goes back to their graveyard
- **Nesting Grounds** — move a counter from one of your permanents onto another permanent
- **Avengers Tower, Director Nick Fury, Courageous Outrider, Kolaghan Warmonger, Commune with Dinosaurs and two more** —
  "look at the top cards … reveal a Hero (Human, Dragon, Dinosaur …) card" now plays; the printed capital used to park
  every tribal version
- **Stone Calendar, Highspire Bell-Ringer, Uthros Psionicist** — your spells cost less (Highspire and Uthros: only your
  second spell each turn)
- **Wizened Snitches, Field of Dreams** — players play with the top card of their libraries revealed
- **Clear the Mind, Reminisce, Learn from the Past, Blessed Respite, Thran Foundry, Cranial Archive** — target player
  shuffles their graveyard into their library
- **Griffnaut Tracker, Arashin Sunshield, Qutrub Forayer, Digsite Conservator, Famished Ghoul, Shred Memory** — exile up
  to two (or four) cards from a single graveyard; the enters triggers aim at an opponent's graveyard
- **Empyrial Storm, Hatut Zeraze Strike Force** — copied once for each time you've cast your commander from the command
  zone this game
- **Ivory Mask, True Believer** — you have shroud: no spell or ability can target you, yours included
- **Myojin of Life's Web, Myojin of Infinite Rage** — cast from your hand, they enter with a divinity counter (and are
  indestructible until you spend it); any other way in, they enter without one
- **Ransack, the Lab, Rampant, Growth** — the "Spell commander" sorceries play from hand
- **Gallowbraid, Morinfen** — cumulative upkeep paid in life: 1 more life each upkeep, or the creature is sacrificed
- **Sphinx of New Prahv, Boreal Elemental, Syr Elenora, the Discerning** — spells your opponents cast that target them
  cost {2} more
- **Fool's Demise, Shade's Form, False Demise, Minion's Return, Unhallowed Pact** — when the enchanted creature dies,
  it comes back under your control (even an opponent's creature)
- **Rubblebelt Rioters, Orcish Siegemaster, Vile Deacon, Imaryll, Hellkite Igniter, Sokenzan Spellblade, Kitsune
  Loreweaver, Graverobber Spider** — "gets +X/+0 (or +X/+X, +0/+X) where X is …" now counts, on attack or on activation
- **Debtors' Knell, Teneb, the Harvester** — bring a creature back from any graveyard under your control
- **Flickerwisp, Glimmerpoint Stag** — exile another permanent that comes back at the next end step (a land returns
  untapped; a token doesn't return)
- **Pentad Prism, Gemstone Array, Crystalline Crawler, Morselhoarder, Workhorse, Druids' Repository** — remove a
  counter for a mana, as many times as there are counters, without tapping
- **Shriekmaw, Bone Shredder, Nekrataal, Terror, Expunge, Feast or Famine** — "destroy target nonartifact, nonblack
  creature" now plays; the regeneration riders hold
- **Canopy Cover, Shielding Plax** — your opponents' spells and abilities can't target the enchanted creature
- **Brass Squire, Auriok Windwalker** — tap to move one of your Equipment onto one of your creatures
- **High Ground, Brave the Sands** — each of your creatures can block one more attacker, and they stack
- **Quirion Ranger, Scryb Ranger** — return a Forest you control to untap a creature, once each turn
- **"Whenever a creature you control becomes blocked"** — Grazilaxx, Illithid Scholar, Cunning Evasion, Somberwald Alpha,
  Unstoppable Ash, Close Quarters
- **Nevinyrral's Disk, Akroma's Vengeance, Magus of the Disk** — destroy all artifacts, creatures, and enchantments
- **Protection from two colours** — Akroma, Angel of Wrath, Akroma, Angel of Fury, Mirran Crusader, Sphinx of the Steel
  Wind, Auriok Champion and six more
- **Eighteen "sacrifice an artifact or creature" abilities** — Umbral Collar Zealot, Bartolomé del Presidio, Dockside Chef,
  Baron Bertram Graywater, Old Flitterfang, Kingpin's Enforcers and more
- **Raid Bombardment, Cavalcade of Calamity** — your small attackers (by their current power) each deal 1 to what they
  attack
- **Hellrider, Scorch Spitter, Rakdos Roustabout** — damage to the player or planeswalker the creature is attacking
- **Murderous Rider, Fell Horseman** — when the creature dies, it goes to the bottom of its owner's library
- **Embercleave, Ancient Stone Idol, Static Snare** — cost {1} less for each attacking creature (Embercleave: each
  of yours); flash them in mid-combat
- **Fiend Hunter, Leonin Relic-Warder** — you may exile the target until the creature leaves the battlefield
- **Horizon Stone, Kruphix, God of Horizons** — mana you would lose as a step ends stays in your pool, as colorless
- **Blood Seeker, Suture Priest** — when an opponent's creature enters, you may have that player lose 1 life
- **Stone of Erech, Misery's Shadow** — an opponent's creature that would die is exiled instead
- **Phlage, Titan of Fire's Fury, Uro, Titan of Nature's Wrath** — cast from your hand, they do their enter trigger and
  are sacrificed, as printed (escape casting isn't offered yet)
- **Kozilek, Butcher of Truth, Ulamog, the Infinite Gyre, Worldspine Wurm** — put into a graveyard from anywhere (milled,
  discarded, killed), they trigger: the titans shuffle their owner's graveyard into their library, the Wurm shuffles itself back
- **Feldon's Cane, Archangel's Light** — "shuffle your graveyard into your library"
- **Legion Conquistador, Gathering Throng, Battalion Foot Soldier** — the enters trigger finds every copy you choose, as
  many as the library holds
- **Clockwork Beetle, Clockwork Condor, Clockwork Vorrac, Clockwork Dragon** — after attacking or blocking they lose a
  +1/+1 counter at end of combat, once their damage is dealt; a Clockwork left at 0/0 dies
- **Trumpeting Armodon, Matsu-Tribe Decoy, Tangle Angler, Rampant Elephant, Burning-Tree Bloodscale, Maraleaf Rider,
  Lurking Arynx** — "target creature blocks this creature this turn if able": the AI opponent now blocks as required (with a
  second creature against menace when it has one)
- **Illusory Angel, Skyshroud Condor, Hewed Stone Retainers** — castable once you've cast another spell this turn,
  and not before
- **Insatiable Skittermaw, Kavaron Skywarden, Interceptor Mechan, Voidforged Titan, Elegy Acolyte, Decode
  Transmissions** — Void works: the end-step bonus (or Decode Transmissions' better mode) applies on any turn a nonland
  permanent left the battlefield, anyone's, a token included
- **Ali from Cairo, Sustaining Spirit, Fortune Thief, Worship** — damage can't take their controller below 1 life
  (Worship: while you control a creature). The damage still counts in full for lifelink; losing or paying life still can
- **True-Faith Censer, Silver-Inlaid Dagger, Heavy Mattock, Sharpened Pitchfork, Butcher's Cleaver, Bladed Bracers, Hope
  Against Hope, Equestrian Skill** — the extra bonus for a Human host (Bladed Bracers: a Human or an Angel) now applies, and only
  while the creature it's attached to is that type. A Changeling counts as every creature type
- **Incendiary Oracle, Kumano's Pupils, Frostwielder, Kumano, Master Yamabushi** — a creature one of them dealt damage to
  this turn is exiled instead of dying, as long as the card that dealt the damage is still on the battlefield
- **Minotaur Explorer, Pillaging Horde, Balduvian Horde** — when one enters, discard a card at random or sacrifice it
- **Fireblast, Thunderclap, Crash, Mine Collapse, Mogg Alarm, Pulverize, Dark Triumph** — cast them by sacrificing
  Mountains (or, for Dark Triumph, a creature while you control a Swamp) instead of paying mana. Your tapped Mountains
  go first; Mine Collapse's option is there only on your own turn
- **"Exile up to one target card from a graveyard" works everywhere it's printed** — Soul-Guide Gryff, Ambush Wolf,
  Crossroads Candleguide, Mechanical Mobster (and it connives), Wreck Remover, Startled Relic Sloth, Ascendant
  Dustspeaker, Restless Cottage's attack, Heritage Reclamation, Rise of Extus, and Jack-o'-Lantern's sacrifice ability.
  A trigger aims at an opponent's graveyard, and takes nothing rather than one of your own cards
- **The colour bounce-back creatures** — Horned Kavu, Shivan Wurm, Silver Drake, Steel Leaf Paladin, Fleetfoot Panther,
  Sparkcaster, Marsh Crocodile, Lava Zombie, Cavern Harpy and Razing Snidd as they enter; Skull Collector, Stampeding
  Serow, Stampeding Wildebeests, Trusted Advisor, Eiganjo Free-Riders and Oni of Wild Places each upkeep — return a
  creature of the named colour you control to your hand (the card itself, when it's the only one)
- **Rishadan Cutpurse, Rishadan Footpad, Rishadan Brigand** — when one enters, each opponent pays {1} / {2} / {3}
  or sacrifices a permanent of their choice. The pay-or-else prompt now says plainly what declining costs you
  (Phyrexian Tyranny's used to read as if the other player got the effect)
- **Shimmering Glasskite, Jetting Glasskite, Glyph Keeper** — the first spell or ability to target one of them each turn is
  countered (a spell that can't be countered still resolves)
- **Your party counts** — Shatterskull Minotaur, Journey to Oblivion, Sea Gate Colossus, Deadly Alliance and Spoils of
  Adventure cost {1} less for each creature in your party (a Cleric, a Rogue, a Warrior and a Wizard — a creature with
  several of those types fills just one spot, counted the way that helps you most), and Ravager's Mace gives the equipped
  creature +1/+0 for each creature in your party, plus menace
- **Ramosian Rally, Orim's Cure** — if you control a Plains, cast them by tapping an untapped creature you control
  instead of paying mana (a creature that just came in counts)
- **Strive works** — Rouse the Mob, Blinding Flare, Aerial Formation, Phalanx Formation, Cruel Feeding, Desperate Stand, Ajani's Presence, Colossal Heroics, Harness by Force, Consign to Dust and Kiora's Dismissal
- **The Laccolith cycle plays** — "you may have it deal damage equal to its power to target creature; if you do, it assigns no combat damage this turn" (Laccolith Titan / Whelp / Grunt / Warrior), plus Flametongue Yearling's ETB and Sinstriker's Will's granted tap ability
- **City of Traitors** — sacrifices itself when you play another land, and only when you play one
- **Shrine of the Forsaken Gods, Eldrazi Temple** — mana that may only cast colourless spells now pays for exactly that
- **Stratadon** and the domain cost reducers — cheaper for each basic land type you control
- **Secluded Courtyard** — its chosen-type mana now also pays that type's abilities
- **Powerstone tokens** (Koilos Roc, Stone Retrieval Unit and kin) — the token exists and its mana pays artifacts and abilities only
- **Jasmine Dragon Tea Shop, Base Camp, Villainous Hideout, Brotherhood Headquarters** — tribal mana also pays that tribe's abilities
- **Turtle Lair, Sliver Hive** — mana that may only cast a creature type now pays for exactly that
- **Bringer of the Blue / Green / White / Black Dawn** — cast for {W}{U}{B}{R}{G} instead of nine
- **Frenetic Ogre, Ogre Shaman, Pyromania, Sonic Burst and kin** — "discard a card at random" as a cost
- **Raging Spirit, Ancient Kavu** — "becomes colorless until end of turn"
- **Fist of Suns, Jodah, Archmage Eternal** — cast any spell for {W}{U}{B}{R}{G}
- **Wild Wasteland, Yawgmoth's Bargain, Dragon Appeasement, Symbiotic Deployment** — "Skip your draw step" skips it
- **Patrician Geist, Gravebreaker Lamia** — spells cast from your graveyard cost {1} less
- **Torpor Orb, Hushwing Gryff, Tocatli Honor Guard** — creatures entering trigger nothing
- **Teferi's Ageless Insight, Alhammarret's Archive, Bard, King of Dale** — every draw after the draw step's first becomes two
- **Incubation Druid** — taps for any type your lands could make
- **Treebeard, Gracious Host** and every "target <creature type>" card — "Destroy target Elf" and its kin now play natively
- **Field-Tested Frying Pan** — the equipped creature grows by the life you just gained
- **Razorkin Needlehead** — first strike on your turn; an opponent's draw costs them 1
- **Solid Footing** — a vigilant enchanted creature hits with its toughness
- **Molten Psyche** — everyone wheels; with metalcraft each opponent takes damage equal to their own draws this turn
- **Wheel and Deal** — pick any opponents to discard their hands and draw seven; you draw one
- **Xenagos, God of Revels** — at the start of your combat, another creature gains haste and grows by its own power
- **Desert** — pings an attacker, but only in the end of combat step as printed
- **Endurance** — its arrival tucks a player's whole graveyard to the bottom of their library
- **Sentinel's Mark** — its Addendum lifelink lands only when you cast it in your main phase
- **Daybreak Coronet** — only a creature already wearing an Aura can take it
- **Enter the Avatar State** — your creature becomes an Avatar with flying, first strike, lifelink and hexproof for the turn
- **Shielded by Faith / Brilliant Wings** — the Aura hops onto a creature as it enters (Wings for {1})
- **Face of Divinity / Shardmage's Rescue** — Aura bonuses that switch on with a second Aura, or only on the turn the Aura arrived
- **Karametra's Blessing** — +2/+2, and hexproof + indestructible when the target wears an Aura or is an enchantment creature
- **Drannith Magistrate** — your opponents may cast only from their hands (their commanders included)
- **Deafening Silence** — one noncreature spell per player per turn, creatures unaffected
- **Endless Foot Assault** — every attack sends a tapped Ninja at each opponent
- **Fast Forward** — cheaper for every opponent you swung at this turn, then goads every creature they control
- **Mole Module** — its combat hit mills four and can drop a milled permanent straight onto the battlefield
- **Raphael, Fiendish Savior** — the end-step Devil arrives whenever a creature card hit your graveyard this turn, from anywhere
- **Exploding Barrel** — its blast gets cheaper for every pressure counter it has built up
- **Mutational Advantage** — your countered permanents gain hexproof and indestructible, shrug off all damage this turn, then proliferate
- **Arena Rector** — exile it as it dies to fetch a planeswalker straight onto the battlefield (Greenwarden of Murasa's "If you do" return rides along)
- **Gauntlets of Light** — the enchanted creature gets +0/+2 and hits with its toughness
- **Greater Auramancy** — your enchanted creatures have shroud
- **Winds of Rath** — destroys every creature without an Aura
- **Baxter, Fly in the Ointment** — your creatures with counters gain flying when he enters or attacks
- **Big Apple, 3 a.m.** — a Rat per opponent (and "for each opponent you have" everywhere)
- **Donatello, the Brains** — your token batches bring a Mutagen along
- **Swift Demise** — pings, then destroys each opponent's creature dealt damage this turn
- **Lita, Little Orphan Amphibian** — the alliance modal picks a different mode each time this turn
- **Casey Jones, Back Alley Brute** — counters you place become that much damage to an opponent
- **Ray Fillet, Wave Warrior** — a creature you control with a counter on it connecting draws a card
- **Tokka & Rahzar, Unsupervised**, **Splinter, the Mentor** — "another nontoken creature you control leaves the battlefield" (and Splinter's own leave)
- **Gift spells** — Long River's Pull, Peerless Recycling, Wear Down (and the other gift instants and sorceries) resolve in their un-promised mode
- **Dueling Grounds**, **Silent Arbiter** — one attacker and one blocker per combat
- **Norn's Annex** — attackers pay {W} or 2 life each
- **Deploy the Gatewatch** — up to two planeswalkers from the top seven onto the battlefield
- **Teferi, Hero of Dominaria** — the −3 tucks a nonland permanent third from the top
- **Oath of Gideon** — your planeswalkers enter with an extra loyalty counter
- **Sphere of Safety** — attackers pay {X} each, X = your enchantments (counted live)
- **Garruk, Unleashed** — the −2's loyalty counter on Garruk himself (when an opponent has more creatures)
- **Feasting Hobbit** — Devour Food 3 (and the Devour artifact / Devour land printings): the creature you get when you sacrifice nothing
- **Sam, Loyal Attendant** — Foods' abilities cost {1} less (and the lands / artifact-token printings of the same line)
- **Kwain, Itinerant Meddler** — each player may draw; those who do gain a life
- **Lembas** — shuffles itself back into its owner's library when it leaves for the graveyard
- **Continue?** — returns up to four creatures that died this turn
- **Study the Classics** — a counter, doubled, and life equal to the result
- **Samwise Gamgee** — returns a historic card (artifact, legendary, or Saga) from the graveyard
- **Hot Soup** — the equipped creature is destroyed when it's dealt damage
- **Elanor Gardner** — the end-step land search fires only in a turn you sacrificed a Food
- **Shoreline Looter** — the Threshold discard is skipped at seven cards; **Night of the Sweets' Revenge** — the Food-count team pump
- **Wave Goodbye** — bounces every creature without a +1/+1 counter; **Riot Control** — life per opponent creature and no damage to you this turn
- **Heaped Harvest**, **Carrot Cake** — "when you sacrifice it" fires from the Food's own sacrifice
- **Academy Manufactor** — a Clue, Food, or Treasure becomes one of each (two Manufactors: three of each)
- **Staff of the Storyteller** — a story counter per batch of creature tokens you create
- **Inti, Seneschal of the Sun** — a discard of any size fires once; the exiled card stays playable until your next end step
- **Otharri, Suns' Glory** (the self-return), **Purple Pentapus** — "tap an untapped <X> you control" as a cost to return the card from the graveyard
- **Tithe** — a second Plains when the targeted opponent controls more lands than you (declinable)
- **Reroute Systems**, **Loran's Escape** — keyword grants on an artifact OR a creature (either side)
- **Hour of Reckoning** — destroys every nontoken creature; tokens survive
- **Blacksmith's Skill** — hexproof and indestructible on any permanent; the +2/+2 lands only on an artifact creature (an animated artifact counts)
- **Glimmer Lens** — draws when the equipped creature attacks alongside another
- **Minas Tirith** — draws only after you attacked with two or more creatures
- **Solitude** — exile another creature as it enters (its controller gains life equal to its power), and evoke it by exiling a white card
- **Moon-Circuit Hacker, Satoru, the Infiltrator** — a fresh ninja keeps its looted card; Satoru draws when creatures arrive uncast or for free, once per batch
- **Flare of Malice, Contagion** — each opponent sacrifices their biggest creature or planeswalker; -2/-1 counters now shrink creatures properly (every P/T counter counts per axis)
- **Force of Despair, Sea Gate Restoration** — destroy only what entered this turn; draw your hand plus one and keep every card at cleanup for the rest of the game
- **Demonic Consultation, Tainted Pact** — name a card (or none) and dig until it; exile-until-named with the take-or-continue loop and the duplicate-name stop
- **Wan Shi Tong, Librarian** — enters for X with X counters and half-X cards, and grows whenever an opponent searches their library
- **Sink into Stupor** — bounces an opponent's spell or nonland permanent (the land side was already playable)
- **Treasure Vault, Moonsilver Key, Cephalid Coliseum** — X Treasures for XX, the mana-rock-or-basic tutor, and the threshold draw-three-discard-three
- **Flash Photography, Imposter Mech** — a token copy of any permanent, and a Vehicle that enters as a copy of an opponent's creature with Crew 3
- **Clever Impersonator, Copy Enchantment** — clones may now enter as a copy of any nonland permanent or any enchantment, and a copied anthem pumps your team
- **Thassa's Oracle** — the Kinnan / Believe it! win: devotion read as it resolves, the win checked against the library, otherwise a keep-one-on-top look
- **Not of This World** — counters a spell or an ability aimed at your permanent, free when that target is your 7-power creature (also Diplomatic Escort, Siren Stormtamer)
- **Carpet of Flowers** — adds mana once a turn at either main phase, counting the targeted opponent's Islands
- **Full Throttle** — two extra combats, with your attackers untapping at the start of each
- **Avoid Fate** — counters an instant or Aura aimed at your permanent, natively
- **Grim Reaper's Sprint** — its morbid discount and its extra-combat entry now work natively
- **Overpowering Attack** — untaps only the creatures that attacked and grants its extra combat only from your main phase
- **Savage Beating** — castable natively, and only during combat on your turn
- **Open the Omenpaths** — its two-colour mana mode now resolves natively, spendable only on creature and enchantment spells
- **Geosurge** — its seven red now resolve natively and can only be spent on artifact or creature spells
- **Irencrag Feat** and **Rite of Flame** — the red rituals now resolve natively, including Irencrag's one-more-spell limit
- **Guttural Response**, **Pyroblast**, **Hydroblast** — the colour-hate counters are now cast natively
- **Port Razer** — its extra combats now respect "can't attack a player it has already attacked this turn"
- **Chaos Warp** — shuffles the target into its owner's library and flips their top card onto the battlefield if it's a permanent
- **Kami of Celebration** — exiles a playable card when a modified creature attacks, and grows a creature when you cast from exile
- **Uncivil Unrest** — your creatures with +1/+1 counters now deal double damage
- **Kutzil, Malamet Exemplar** — draws when your pumped or countered creatures connect
- **Arwen, Weaver of Hope** and **Bramblewood Paragon** — your other creatures now enter with the extra +1/+1 counters they grant
- **Hajar, Loyal Bodyguard** — sacrifice it to pump and shield only your legendary creatures
- **Spider-Man, Miles Morales** — entering or attacking grows each other creature you control and gives them trample
- **Yoshimaru, Ever Faithful** and **Gimli of the Glittering Caves** — grow when another legendary permanent or creature of yours enters
- **Krenko, Tin Street Kingpin**, **Jacked Rabbit**, **Royal Talon Fighter Jet** — attack triggers that make tokens equal to their power or counters
- **Rampant Rejuvenator** — its death trigger now fetches lands equal to the power it had as it died; **Big Mother Mouser** makes its Robots on death
- **Damning Verdict** — destroys every creature without a counter
- **Step Between Worlds** — each player chooses whether to shuffle up and draw seven
- **Ellie and Alan, Paleontologists** — exile a creature from your graveyard to discover for its mana value
- **Rashmi, Eternities Crafter** — your first spell each turn reveals the top card, and a cheaper one can be cast free
- **Mystic Forge** and **Precognition Field** — cast the named kinds of spells off the top of your library; Forge's exile-top activation works
- **The Key to the Vault** — look at as many cards as the damage dealt, exile a nonland one, and cast it free or leave it
- **Fblthp, the Lost** — draws two when it comes from the library, and shuffles away when a spell targets it; **Alabaster Dragon**, **Angel of Fury**, **Cavalier of Gales** shuffle themselves back on death; **Livewire Lash** fires when the equipped creature is targeted
- **Make Your Own Luck** — look at three, plot a nonland card, keep the rest
- **Doc Aurlock, Grizzled Genius** — spells from your graveyard or exile cost two less, and plotting costs two less
- **Savvy Trader** and **Sage of the Beyond** — exile a permanent from your graveyard and keep playing it; spells cast from exile or the graveyard cost less
- **Lock and Load** — draws one, plus one per other instant or sorcery cast this turn
- **Recurring Insight** — draws for the target opponent's hand size, then rebounds
- **Planar Nexus** — counts as every nonbasic land type on the table
- **Padeem, Consul of Innovation** and **Leonin Abunas** — your artifacts, creature or not, can't be targeted by opponents; Padeem's upkeep draw checks the biggest artifact on the table
- **Kotori, Pilot Prodigy** — Vehicles you control crew for 2 while Kotori is out
- **Plaza of Heroes** — its legendary-only mana no longer makes free colours; the exile-to-protect ability works; **Shizo**, **Shinka**, **Daily Bugle Building** grant to legendary creatures; **Untaidake** makes its restricted mana
- **Mech Hangar** — its Pilot-or-Vehicle mana and its animate-any-Vehicle ability, as printed
- **Permission Denied** and **Ranger-Captain of Eos** — your opponents can't cast noncreature spells this turn, as printed
- **Mobilizer Mech** — crewing it animates another Vehicle you control, as printed
- **Prodigy's Prototype** — a Pilot whenever your Vehicles attack, once per combat, as printed
- **Shorikai, Genesis Engine** — the commander's loot works, and its Pilot tokens crew as though their power were 2 greater
- **Peacewalker Colossus** — animates another Vehicle you control; **Dispatch** — taps, and exiles under metalcraft, as printed
- **Thunderhawk Gunship** — your attackers gain flying; **Parhelion II** and **Leonin Warleader** — the tokens enter attacking; **Surgehacker Mech** and **Jet, Freedom Fighter** — count-scaled damage on an opponent's creature
- **Teferi's Puzzle Box** — each draw step, that player tucks their hand and redraws; wheel draws (Dark Deal too) now trigger draw watchers like Sheoldred
- **Peer into the Abyss** — the target draws half their library and loses half their life, rounded up
- **Phyrexian Tyranny** and **Isolation Cell** — pay {2} or lose 2, on the right player; **Painful Quandary** — discard or lose 5, as printed
- **Dark Deal** and **Incendiary Command** — everyone discards their hand and draws that many (minus one for Dark Deal), as printed
- **Sheoldred, the Apocalypse** — an opponent's draws cost them 2 life, as printed; **Forced Fruition** — the caster draws seven; **Bedevil** — destroys an artifact, creature or planeswalker
- **Reflector Mage** — the bounced creature's owner can't recast it until your next turn, as printed
- **Cryogen Relic** — sacrifice it to stun a tapped creature, as printed (it skips its next untap)
- **Loran of the Third Path**, **Secret Rendezvous**, **Sky Crier** — "you and target opponent each draw" deals both seats their cards
- **Protection from creatures** works — Unquestioned Authority, Holy Mantle, Spirit Mantle grant it; Beloved Chaplain, Commander Eesha and Teysa's printed protection is now enforced (unblockable by creatures, no combat damage, untargetable by creatures' abilities)
- **Teleportation Circle** and **Against All Odds** — blink an artifact or creature you control, as printed
- **Recruiter of the Guard** and **Imperial Recruiter** — the search respects the toughness / power cap as printed
- **Tolaria West** and every transmute card — transmute works from your hand as printed: discard it, search for a card with the same mana value, sorcery speed
- **Tasigur, the Golden Fang** — mills two, then an opponent picks the nonland card you get back (the AI hands back the cheapest); "nonland" now reads in graveyard returns
- **Demolition Field** — destroys a nonbasic land and gives both players their basic-land search, as printed
- **Titania, Protector of Argoth** — makes her 5/3 Elemental whenever one of your lands hits the graveyard from the battlefield
- **Boggart Trawler, Bojuka Bog** — their "exile target player's graveyard" triggers now aim at an opponent and resolve natively
- **Field of the Dead** — makes its Zombie once you control seven or more differently named lands
- **Chains of Custody, Sheltered by Ghosts, Detainment Spell** — the two detain an opponent's permanent until the Aura leaves (with their ward and lifelink grants live); Detainment Spell can be moved onto any creature
- **Gingerbrute, Resilient Roadrunner** — only haste creatures may block them after their evasion ability; **Tough Cookie, Alloy Animist** — animate one of your noncreature artifacts into a 4/4 for the turn
- **Maze of Ith** — untaps an attacker and shields it from dealing or taking combat damage this turn; the AI points it at your attackers
- **Final Fortune, Last Chance, Warrior's Oath** — take the extra turn and lose at its end step, as printed; the opponent AI never gambles on them
- **Path of Ancestry** — spending its mana on a creature that shares a type with your commander now scries, as printed
- **Scythecat Cub** — its second landfall each turn doubles the counters instead of adding one, as printed
- **Valley Floodcaller** — each noncreature spell pumps and untaps your Birds, Frogs, Otters and Rats
- **Arcade Cabinet** — sacrifice a token to double every kind of counter on a creature
- **Rosie Cotton of South Lane** — every token you create grows another of your creatures, never Rosie herself
- **Tap-N-creatures costs** — Kirol, Attentive First-Year, Tradewind Rider, Siege Zombie, Nullmage Shepherd, Sandsower, Skaab Wrangler, Diversionary Tactics, Larder Zombie, Root-Kin Ally, Skirsdag High Priest, Prosperous Partnership and Grove of the Guardian pay their "tap two/three/four untapped creatures" cost for real; the AI leaves those activations to you
- **Peter Parker's Camera, Strionic Resonator, Adric** — copy one of your own triggered (or, for the Camera and Adric, activated) abilities while it waits on the stack; the activation is offered whenever such an ability is stacked, on any turn
- **Proft's Eidetic Memory and Thundering Djinn** — count the cards you've drawn this turn: Proft's grows a creature at combat after a second draw, the Djinn's attack damage scales with the count
- **Orcish Bowmasters and Leela, Sevateem Warrior** — trigger on an opponent's extra draws but not the first draw of their draw step, as printed
- **Fixed: compound triggers kept their follow-up** — "When this enters and whenever …, discard. If you do, draw" no longer discards for nothing on the enters half (Flaring Cinder, Giott, King of the Dwarves)
- **Minamo, School at Water's Edge and Patriar's Seal** — their untap abilities target only legendary permanents, as printed
- **Starting Town** — enters untapped through your third turn and tapped after; taps for colourless free or any colour for 1 life, and never offers the colour for free
- **Modal double-faced creatures cast their front** — Witch Enchanter, Glasspool Mimic, Kazandu Mammoth, Skyclave Cleric, Pinnacle Monk and four more enter as their creature face and return to hand or graveyard as the whole card
- **Modal double-faced spells cast their front** — Fell the Profane, Bridgeworks Battle, Sundering Eruption, Sejiri Shelter, Bala Ged Recovery and fourteen more cast as the spell or drop as the land
- **Modal double-faced lands choose a face** — the ten Pathways play as either side; a spell//land's back plays as itself (with its own enter clause); transform cards with a land back are no longer offered as land drops
- **Urborg, Tomb of Yawgmoth and Yavimaya, Cradle of Growth work** — every land on the table gains the basic type and taps for its colour (Blanket of Night too)
- **Arcane Denial works** — the countered spell's controller may draw up to two cards at the next upkeep; you draw one
- **Aetherflux Reservoir's storm lifegain** — "you gain 1 life for each spell you've cast this turn"
- **"Whenever this creature blocks a creature, return that creature to its owner's hand at end of combat"** — Wall of Tears, Aether Membrane, Kaijin of the Vanishing Touch
- **"Target creature can't block this creature this turn"** — Spin Engine, Screeching Griffin, Duct Crawler, Kozilek's Pathfinder, Fearsome Temper
- **Detain works** — Azorius Arrester, Isperia's Skywatch, Soulsworn Spirit, Lyev Skyknight, Martial Law, New Prahv Guildmage, Inaction Injunction
- **"Draw an additional card" at the beginning of your draw step** — Grafted Skullcap, Avaricious Dragon, Overbeing of Myth
- **End-of-combat self-sacrifice and self-bounce** — "When this creature attacks or blocks, sacrifice it / return it to its owner's hand at end of combat" (Mardu Blazebringer, Runaway Carriage, Fog Elemental, Crumbling Colossus, Stoic Ephemera, Windscouter, Phantom Whelp, Quicksilver Behemoth, Wall of Junk); unblocked poison (Crypt Cobra, Swamp Mosquito, Suq'Ata Assassin)
- **The Fling bodies play** — "Sacrifice this creature: It deals damage equal to its power to any target" reads the creature's power as it last existed (Skarrgan Skybreaker, Ghitu Fire-Eater, Flame Elemental, Cinder Shade, Minotaur Illusionist, Aerie Ouphes, Voldaren Thrillseeker), plus the live-source pingers (Spikeshot Goblin / Elder, Rust Harvester, Burning Anger, Murderous Redcap, Captain Ripley Vance)
- **Three more combat statics enforced** — "can't be blocked by artifact creatures" (Argothian Sprite, Fen Hauler, Audacious Infiltrator), "can't block creatures with power N or greater" (Ironclaw Orcs, Ironclaw Buzzardiers, Brassclaw Orcs) and "when this creature enters, tap all other creatures" (Shrieking Mogg, Thundermare, Timbermare)
- **"Attacks and isn't blocked" fires at the right moment** — after blockers are declared, only for unblocked attackers (Abyssal Nightstalker, Merchant Ship, Dwarven Vigilantes, Wildfire Eternal, Eternal of Harsh Truths previously fired on the attack declaration) charge their extra cost per extra target, and offer only what you can pay.
- **"Up to two / three target creatures" works** — Abandon the Post, Unearthly Blizzard, Markov Warlord, Glarewielder and Deadly Designs let you pick any number up to the printed count.
- **"Up to one target creature" works** — Plunge into Winter, War Machine, Nebelgast Intruder, Moonsnare Specialist, Key to the City and more let you pick a creature or none.
- **The AI shoots attackers and pumps its own creatures in combat** — abilities like D'Avenant Archer's and Infantry Veteran's are now used by the opponent, on the right side.
- **X-cost activated abilities that scale with X work** — Silklash Spider, Cinder Elemental, Kessig Wolf Run, Ballista Squad, Goblin Dynamo, Oracle of Nectars and more offer every affordable X; and "you gain X life" works, so Sphinx's Revelation, Death Grasp and Overrule play.
- **"Whenever one or more creatures you control deal combat damage to a player" now triggers once per player hit** — a swing into two opponents fires twice, as the rules say; Alela, Cunning Conqueror and Popular Entertainer goad the right player's creature.
- **Baird, Steward of Argive and Archon of Absolution tax attacks** — the "you or planeswalkers you control" printing of the attack tax is read like Ghostly Prison's.
- **Thirty-four Universes Beyond creatures work** — the Warhammer 40,000 and Dungeons & Dragons flavor words (Fire Breath, Rosarius, Phalanx Commander, Keen Senses …) no longer hide the trigger behind them.
- **Converge spells work** — Unified Front and Infuse with the Elements count the colors of mana spent; every ability word the Comprehensive Rules name is now read past.
- **Goad works** — Jeering Homunculus, Taunting Kobold, Goblin Racketeer, Coveted Peacock, Taunting Sliver, Glóin, Oceanus Dragon and Bjorna goad a creature until your next turn: it must attack, and not you.
- **"Target creature defending player controls" on attack triggers works** — Spring Splasher and Skymark Roc pick from the attacked player's board.
- **"Target creature with power 5 or greater" (and toughness / mana value bounds) works** — the Behemoth cycle, Goblin Smuggler, Wrangle, Claim the Firstborn, Eternal Isolation, Silkwrap and more read the bound off the creature's live stats.
- **"Another target attacking creature" and "target creature with / without flying" work** — the Pegasus cycle, Herald of the Sun, Forced Landing, Stinging Shot, Quicksand and more offer exactly the creatures the card names.
- **"Target attacking creature" and "target blocking creature" work** — Run Amok, Righteousness, Outflank, Most Valuable Slayer, Infantry Veteran, Serra Advocate and more only offer creatures in that combat role.
- **Combat-time activated abilities** — abilities that target an attacking or blocking creature (D'Avenant Archer, Kithkin Shielddare, Harpoon Sniper and their kin) can now be activated during combat, by either player, instead of only in a main phase where they had no legal target.
- **"Target creature with a +1/+1 counter on it" works** — the graft cycle's grants, Razorfin Abolisher, Crumbling Ashes, Hidden Hideout, Liliana, Death Wielder, Steppe Glider, Ollenbock Escort and more only offer creatures that actually carry the counter.
- **City of Brass works** — tapping it for mana deals you the damage.
- **"Return a card from your graveyard to your hand" works** — Corpse Churn, Grapple with the Past, Takenuma's
  channel and their kin let you pick the card as the spell resolves.
- **The Opus cycle works** — Thunderdrum Soloist, Tackle Artist, Spectacular Skywhale, Elemental Mascot, Deluge
  Virtuoso and Colorstorm Stallion upgrade their payoff when five or more mana was spent on the spell.
- **Aria of Flame works** — every opponent gains 10 on entry, and the verse counters burn as before.
- **Command Beacon works** — sacrifice it to put your commander into your hand from the command zone.
- **Prowler's Helm, Invisibility and Seeker work** — the creature wearing them can only be blocked by what the
  card names.
- **Thrun, Breaker of Silence and Gaea's Revenge work** — nongreen spells and abilities can't target them (Thrun's
  shield only stops your opponents'). Thrun Voltron reaches 90/100.
- **Palinchron and Great Whale work** — entering untaps up to seven of your lands.
- **Graveyard abilities with a target work** — Gravestone Strider, Helica Glider, Rubblebelt Maverick, Placid Rottentail, Venom, Beetle, Bonebind Orator, Eerie Soultender, Soul of Innistrad and the four Renew cards: pay the cost from the graveyard and pick the target.
- **Uneasy Alliance and Path to Redemption work** — sacrifice the Aura to exile the creature and get the token.
- **Abzan Devotee and Buried Treasure work** — mana on the battlefield, the graveyard ability from the graveyard.
- **Choking Restraints, Phantom Wings, Thrull Retainer, Stamina, Carapace and Briar Shield work** — sacrificing
  the Aura still exiles, bounces, regenerates or pumps the creature it was on.
- **Relic of Progenitus, Scrabbling Claws and Merrow Bonegnawer work** — the targeted player picks which
  card of their graveyard to exile (you get a picker when it's aimed at you).
- **Break Ties, Fowl Strike, Hunting Triad and Earthbrawn work** — cast as printed (the reinforce option
  is simply not offered).
- **Cooped Up, Dreadful Apathy, Redemption Arc, Sun Clasp, Sigarda's Imprisonment, Ghostly Wings and
  Caught in the Brights work** — the Aura's own ability (or Vehicle-attack trigger) exiles or bounces the
  creature it enchants.
- **Artisan of Kozilek and Nulldrifter work** — the cast trigger and annihilator both fire.
- **Melancholy, Thirst, Binding Grasp and Vapor Snare work** — the Aura asks for its upkeep payment each
  turn and is sacrificed if you decline (a stolen creature goes home).
- **Hypnotic Siren works, bestowed** — bestow it on an opponent's creature and the creature is yours, a
  flier with +1/+1, until the Siren leaves.
- **Bubble Snare works, kicked** — the Aura lane offers the kicked cast when you can pay it, and the kicked
  Snare taps the creature it lands on.
- **Savage Firecat works** — enters with its seven counters and sheds one each time you tap a land for
  mana; Spike Hatcher and Phantom Nishoba enter with their counters too.
- **The en-Kor cycle works** — Warrior, Nomads, Lancers, Spirit and Outrider en-Kor redirect the next damage
  they'd take to a creature you choose, in combat and out of it.
- **Snapcaster Mage works** — the instant or sorcery you pick in your graveyard gains flashback for the turn at
  its own mana cost, and is exiled after you cast it. Stingcaster Mage, Slickshot Lockpicker, Katilda and Lier,
  Lost in Memories and the spell Flashback ride the same grant.
- **The Hunted cycle and Forbidden Orchard work** — Hunted Troll, Dragon, Lammasu, Bonebrute and Phantasm hand
  their tokens to the opponent you pick; Forbidden Orchard gives an opponent a Spirit each time it's tapped for
  mana; Ox Drover too. (Hunted Horror's protection rider is still on the Arbiter.)
- **Nikya of the Old Ways works** — you can't cast noncreature spells while she's out; opponents can.
- **Zhur-Taa Druid and Vorinclex, Voice of Hunger work** — tapping the Druid for mana pings each opponent;
  Vorinclex locks an opponent's land that was tapped for mana out of its next untap.
- **Kinnan, Bonder Prodigy works** — his dig looks at the top five, puts a non-Human creature straight onto the
  battlefield and bottoms the rest in a random order. Web of Life and Destiny and Ureni of the Unwritten use the
  same dig.
- **"When this creature dies, it deals damage equal to its power" works** — Heartfire Hero, Flaming Tyrannosaurus,
  Balduvian Berserker, Juri, Dreadhorde Butcher and Fireblade Charger deal the power they had as they died.
- **Mind Harness works** — steal a red or green creature, pay the growing upkeep each turn or hand it back.
- **Shang-Chi, Master of Kung Fu works** — your creatures can use their abilities the turn they arrive, and his two
  mana of one colour pay only for creature abilities. Thousand-Year Elixir rides along.
- **The One Ring works** — cast it and you have protection from everything until your next turn (your life still
  moves), it taps for a burden counter and that many cards, and the burden costs you that much life each upkeep.
  Fourteen cards that count their own charge, oil, age, verse, lore, soul or pressure counters ride along
  (Heliophial, Magma Mine, Culling Dais, Insight Engine, Mind Unbound, Golden Urn, Clearwater Goblet, Torch Song,
  Midsummer Revel, Ravenous Amulet, Watchful Blisterzoa, Revered Unicorn, Arctic Nishoba, Phyrexian Etchings) —
  including the ones that sacrifice themselves or die first, which read the counters they had.
- **Tempt with Discovery works** — you search for a land, each opponent is asked whether they'll search for one
  too (the AI decides by whether it's behind on lands; you get a real prompt when you're asked), and you search
  once more for every opponent who accepted.
- **Archdruid's Charm works** — all three modes: the creature-or-land search (a land enters tapped, a creature goes
  to your hand), the +1/+1 counter and bite (the counter lands first, so the bite hits for one more), and the
  artifact-or-enchantment exile.
- **Cavern of Souls works** — it chooses a creature type as it enters (a land played from hand included), taps
  for {C} for anything and for any colour only toward a creature of that type, and a creature paid with that
  mana can't be countered. **Unclaimed Territory** and **Pillar of Origins** ride the same machinery.
- **Illusionist's Bracers works** — an ability of the equipped creature that isn't a mana ability is copied when
  it's activated; the copy resolves first and keeps the original's targets. The same machinery makes
  **Battlemage's Bracers**, **Rings of Brighthearth** and **Kurkesh, Onakke Ancient** (pay to copy — paying spends
  the mana, declining copies nothing), **Crackdown Construct** and **Ceaseless Searblades** play natively.
- **Teferi's Protection is fully native** — the whole card, not a half: until your next turn your life total
  can't change (losses and gains both hold), you have protection from everything (nothing another player
  controls can target you, and all damage to you is prevented, combat included), all your permanents phase
  out (they leave the battlefield untouched — tapped stays tapped, counters stay — and phase back in before
  you untap on your next turn, re-attaching to hosts that are still there), and the spell exiles itself.
  Phasing is a new engine subsystem; the shield and the phase-out expire together at your next untap step.

### Fixed
- **Reconfigure** no longer offers an Equipment as its own target — the attach paid its cost and fell straight off
- **"Becomes a copy of another target nonlegendary attacking creature"** now offers only what the card allows — never itself, a legend, or a creature that isn't attacking
- **"It gains haste" after a token copy** now means the token, not the creature it copied
- **Delayed "when that creature dies this turn" text** is no longer read as a printed trigger — Together Forever and Sandals of Abdallah lost a phantom "when this dies" trigger, and Grim Javelineer's attack trigger keeps its second half
- **Flicker triggers** (Displacer Kitten, Teleportation Circle, Conjurer's Closet and the like) now flicker the permanent worth flickering instead of whichever came first; Displacer Kitten no longer flickers an Aura, which came back enchanting nothing
- **"Whenever this creature attacks a battle"** no longer fires on every attack (Thrashing Frontliner pumped when it attacked a player); battles can't be attacked yet, so these cards wait for that
- **Deflecting Swat** no longer turns a Counterspell aimed at your spell onto the Counterspell itself — with nowhere legal to send it, it leaves the target alone
- **"The sacrificed creature's …" abilities** (Altar of Dementia and friends) use the creature they actually sacrificed, even when another sacrifice happens in response
- **Goblin Goliath** no longer doubles your damage just by being on the battlefield — only its activated ability does that
- **Burst Lightning and other "deals more instead" kicker spells** — a cast no longer targets a second thing it doesn't affect (which could sacrifice a Phantasmal creature or make the AI hit its own creature)
- **Teferi's Protection** — an equipped creature now comes back still equipped, and an opponent's Aura on your creature phases out with it instead of being destroyed
- **Seven-Tail Mentor, Grafted Growth, Light the Way, Perilous Snare** — their +1/+1 counter on a creature or Vehicle now actually lands
- **Temur Elevator** now costs you 1 life when you tap it without the city's blessing
- **Curses respect a protected player** — Fraying Sanity and the other "Enchant player" Auras can no longer be cast
  at a player with hexproof (Leyline of Sanctity), shroud or Teferi's Protection
- **Terror of the Peaks' life tax applies to free casts** — a spell cast for free (cascade, discover, "cast without
  paying its mana cost") that targets it now costs the 3 life too
- **"When enchanted creature dies" fires however it dies** — Elephant Guide and every Aura or Equipment like it only
  triggered when its creature died to damage; destroy spells, sacrifices and fading now count too (and so do "dealt damage
  by this creature this turn" payoffs like Sengir Vampire's)
- **"You may pay … If you do, <target>" aims only where the card says** — Veinwitch Coven could return any card from
  your graveyard, Consul's Shieldguard and Conduit Goblin could pick creatures the card excludes, Jubilant Mascot could
  pick itself; thirteen cards in all now offer exactly their printed targets
- **An Equipment that is also a creature stays put** — a crewed Rover Blades could be attached by its own Equip or moved
  by Codsworth, Handy Helper; the rules forbid it unless the Equipment has reconfigure (Lizard Blades still moves)
- **Codsworth, Handy Helper moves an Aura only where it could enchant** — a Wild Growth could leave its land for a
  creature; now each Aura's own "Enchant …" line decides
- **Printed protection no longer vanishes because of a later line** — Blood Baron of Vizkopa, Spirit of the Night and five
  more lost their protection when a following line said "as long as"
- **Flash works** — creatures and other permanents with Flash can be cast any time you could cast an instant; they
  used to wait for your main phase
- **Horizon Stone and Kruphix no longer keep your floating mana's colours** — games kept the mana with its colours;
  both cards turn it colorless, and restricted mana keeps its restriction
- **"Exile it instead" now holds when the creature is destroyed or sacrificed** — Lava Coil's rider and Incendiary Oracle /
  Kumano's Pupils only exiled a creature that died to damage; destroyed or sacrificed, it went to the graveyard
- **Mistform creatures lose the old creature type** — Lord of the Unreal (and any Illusion lord) kept pumping a Mistform
  Dreamer after it became another type, and a second activation in one turn kept the first choice as well. A new choice
  now replaces the creature's current creature types, and nothing else
- **Payment prompts name the cost** — Apathy's "discard a card at random" and the energy costs read "Pay {0}"; they now
  say "Discard a card at random" and "Pay {E}"
- **Jack-o'-Lantern's graveyard mana ability is no longer offered** — it charged {1} and exiled the card, and no mana
  arrived. The engine doesn't make mana from the graveyard yet, so the ability is left to the rules assistant
- **"Can't be countered" now holds against every counter** — Kira, Great Glass-Spinner, the cast-trigger
  counters (Vexing Bauble, Lunar Force), ward and Diffusion Sliver used to counter a spell that can't be
  countered, and a counterspell still countered a spell made uncounterable in response (Vexing Shusher).
  Now the spell stays. Whatever else the counterspell does still happens — Swan Song's Bird, An Offer You
  Can't Refuse's Treasures, Mana Drain's mana — and ward no longer asks you to pay for a counter that can't
  happen
- **App updates now bring fresh card data** — once you had synced data in the Updates panel, the app kept
  reading that sync forever and ignored the newer card data every later update shipped (one install was
  still on its July snapshot in late September, missing every set since). Now the newer of the two wins:
  an update's data replaces an older sync, and a sync you run after an update still replaces the update's.
  Your own data — decks, collection price history, play notes — is never touched.
- **Control Auras with a bonus now grant it** — Spirit Away, Yavimaya's Embrace and Corrupted Conscience
  stole the creature but never gave it the +2/+2, flying, trample or infect; they do now. The AI also
  casts control Auras on the biggest enemy creature instead of holding them.
- **Steelswarm Operator no longer spends its activation-only mana on artifact spells** — the card is routed to the
  Arbiter until per-line restrictions land (it used to be credited with a looser restriction than printed).
- **Pay-life lands charge the life** — Horizon Canopy, Silent Clearing, the whole Horizon cycle and Mana
  Confluence used to make their colours for free; now they cost the printed life and aren't offered at 1 life.
  **The Tempest "doesn't untap" duals** (Mogg Hollows and kin) tap for their colours and skip the next untap
  step; **Grand Coliseum**'s any-colour tap costs its 1 damage.
- **Storage lands and Mana Batteries actually spend their counters** — Mage-Ring Network, Fountain of Cho,
  Subterranean Hangar and their kin tap for one mana per storage counter removed; the five Mana Batteries
  tap for one plus one per charge counter. The counters really come off when you pay.
- **Lands with two mana abilities tap for both** — the Tainted lands, the Verges, the Gathering Place cycle,
  the free colourless tap beside an any-colour line, and the "Sacrifice this land" rituals now offer their
  second line (gated exactly as printed), and a land is never tapped twice through two lines. Four wrong taps
  fixed on the way: Ancient Spring's and Spawning Bed's plain taps no longer sacrifice the land, Grand
  Coliseum no longer hands out a painless any-colour mana, Hall of Oracles no longer gives its {1}-costed
  any-colour for free, and a double-faced land's back face never taps on the front.
- **Clash works** (Nath's Elite, Oaken Brawler, Paperfin Rascal, Bog Hoodlums, Adder-Staff Boggart and their
  kin) — you and an opponent reveal your top cards, the greater mana value wins, and the "if you win" payoff
  follows; a tie wins for nobody, and both cards stay on top. **"Whenever you clash and win"** (Sylvan
  Echoes) fires too — for whichever of the two clashing players actually won.
- **Boseiju, Who Endures works** — channel it to destroy an opponent's artifact, enchantment, or nonbasic land;
  they may fetch a land with a basic land type; each legendary creature you control knocks {1} off the cost.
- **Sylvan Library works** — at your draw step you may draw two extra cards, then for each of them pay 4 life
  to keep it or put it back on top; the Academy asks you one card at a time, and the autopilot pays only
  while it keeps a life buffer.
- **The Alchemy Gates work** (Gate to Manorborn and its four siblings) — "Seek a nonland card" pulls a random
  nonland card from your library into your hand, and the ability really is once per game.
- **Allosaurus Shepherd works** — your green spells can't be targeted by counters while it's out, and its
  {4}{G}{G} turns every Elf you control into a 5/5 Dinosaur Elf until end of turn.
- **Vexing Bauble works** — a spell cast for no mana at all (a free cast, a {0} spell) is countered; a paid
  spell is left alone, and an alternative-cost cast the engine can't judge is never countered on a guess.
- **Peregrin Took works** — every batch of tokens you make brings one extra Food along (once per batch, never
  for an opponent's tokens).
- **Frenzied Baloth works** — while it's out, nothing prevents combat damage: not a Fog, not a printed
  prevention wall, not a "prevent all but 1" cap. Noncombat prevention is untouched.
- **Evolutionary Leap works** — sacrifice a creature, reveal until a creature card, it goes to your hand, the
  rest to the bottom in random order.
- **Homeward Path works** — every stolen creature goes home to its owner, on both sides of the table.
- **Altar of Dementia works** — the creature you sacrifice sets how many cards the targeted player mills.
- **Dosan the Falling Leaf works** — while it's out, nobody (you included) casts spells on another player's
  turn; your own turn is untouched.
- **Elvish Spirit Guide and Simian Spirit Guide work** — exiled from your hand for a mana; never usable from
  the battlefield.
- **The Invasion lairs work** (Darigaaz's Caldera, Treva's Ruins, Dromar's Cavern, Rith's Grove, Crosis's
  Catacombs) — return a non-Lair land or lose the lair; another lair never pays for it.
- **Geier Reach Sanitarium and Lore Broker work** — every player draws a card, then discards a card.
- **Jaheira, Friend of the Forest works.** Your tokens — Squirrels included — tap for green under her.
- **Ashnod's Altar and Phyrexian Altar work** (and Thermopod): sacrificing a creature for mana now actually
  sacrifices your cheapest other creature, its death triggers fire, and the ability is only offered while
  you have a creature to feed it. Molt Tender's planned taps now really exile a graveyard card.
- **Skullclamp works** — and Lead Pipe, Sylvok Lifestaff and every "whenever equipped creature dies" card
  with a modeled payoff. **Woodland Bellower** fetches a nonlegendary green creature (never Toski).
  **Altar of the Brood** mills each opponent when another permanent of yours enters, never on its own.
- **The Unbeatable Squirrel Girl works.** Her enters-or-attacks Squirrel and her "I LOVE Squirrels!" X
  ability (one token per Squirrel you control, herself included) both resolve natively; Drey Keeper's
  Squirrel count rides along. Flavor labels ending in "?" or "!" no longer hide a card's triggers.
- **Choose-a-color lands and rocks work.** The Thriving lands, the Baldur's Gate Gates, Night Market,
  Uncharted Haven, Coldsteel Heart, Sol Grail and their kin now actually choose a color as they enter (the
  color your hand needs most, never one the card forbids) and tap for it.
- **Storage lands work.** Saltcrusted Steppe, Dreadship Reef, Calciform Pools, Molten Slagheap, Fungal
  Reaches, Mage-Ring Network, Fountain of Cho and their kin can now actually put storage counters on
  themselves (their remove-counters mana abilities already worked).
- **The Karoos and the "unless you pay {1}" lands work.** Karoo, Coral Atoll, Everglades, Dormant Volcano
  and Jungle Basin now ask you to return an untapped land of the right type or lose them; Archway Commons,
  Rupture Spire, Transguild Promenade and Gateway Plaza ask for the {1}.
- **Lands that enter with counters work.** The Vivid lands, the depletion lands, Gemstone Mine and Tendo Ice
  Bridge now actually arrive with their charge, depletion or mining counters when you play them.
- **The reveal-lands work — all nineteen.** The Snarls, Game Trail, Port Town, Fortified Village and their
  kin, and the Lorwyn tribal lands (Secluded Glen, Gilt-Leaf Palace, Murmuring Bosk …) now enter untapped
  when you hold a card of the named type and tapped when you don't, instead of always entering untapped.
- **Landscapes and Panoramas fetch the right land.** "Search for a basic Plains, Swamp, or Forest card"
  now means a basic land of one of those types — the ten Landscapes, the five Panoramas and Quandrix
  Cultivator search correctly (a nonbasic Swamp is never offered; a Snow-Covered Swamp is).
- **Channel works.** Otawara, Eiganjo, the Ghost-Lit cycle, the Shinen, Twinshot Sniper and more can now be
  channeled from your hand; the legendary lands cost {1} less for each legendary creature you control,
  priced from the board at the moment you activate. Otawara bounces exactly an artifact, creature,
  enchantment or planeswalker — never a land or a battle.
- **Mistrise Village works.** "The next spell you cast this turn can't be countered" now actually shields
  your next spell from counters, and only that one.
- **Abilities that exile cards from your graveyard as a cost work.** Mines of Moria, Grim Lavamancer,
  Graveyard Marshal, Psychatog, Cabal Surgeon, Hostile Desert and two dozen more now actually pay that
  cost — the right number of cards, of the right type, leave your graveyard before the ability resolves,
  and the ability is only offered when you can pay it. Cabal Surgeon never exiles the card it's returning.
- **Cards that sacrifice themselves by name work.** Inventors' Fair, Lunatic Pandora, Potatoes, Hakoda,
  Major Teroh, Toe-Breaking Helmet and their kin — abilities whose cost reads "Sacrifice <this card's name>"
  now actually pay that cost when activated.
- **"Historic" searches work.** Monumental Henge, Weatherlight and Board the Weatherlight now offer exactly
  the legendary, artifact and Saga cards from the cards you look at, instead of being skipped.
- **Shocklands work.** Sacred Foundry, Steam Vents, Hallowed Fountain and the rest of the ten now ask you
  whether to pay 2 life when you play one — pay and it enters untapped, decline and it enters tapped — and
  you're never asked when you can't afford it. A shockland put onto the battlefield by an effect pays when
  you're at 10 or more life and actually charges the 2; the AI seats decide the same way.
- **"Enters tapped unless …" lands work — 83 of them.** Fast lands, slow lands, the check lands and Castles,
  the "two or more opponents" Commander cycle, the "13 or less life" cycle, Rivendell and its legendary-gated
  kin, and more now actually check their condition when they enter — untapped when it holds, tapped when it
  doesn't — instead of always entering untapped. A fast land correctly doesn't count itself.
- **Platoon Dispenser works.** Its end-step draw now correctly counts your OTHER creatures.
- **Codsworth, Handy Helper works.** His tap ability now actually moves an Aura or Equipment you control
  onto a creature you control — including pulling one off whatever it was attached to.
- **Sword of Hearth and Home works.** Connecting now blinks a creature you own — including one an opponent
  has stolen from you, which comes back under your control — and fetches a basic land onto the battlefield.
- **Captain America, First Avenger works.** His "Throw" ability now actually unattaches an Equipment as its
  cost — the Equipment stays on the battlefield — and he deals damage equal to that Equipment's mana value,
  divided among up to three targets. His "Catch" attach trigger already worked.
- **Forked Lightning works**, and every "divided as you choose among one, two, or three targets" spell now
  actually respects its target limit — the picker won't let you spread damage over more targets than the
  card allows, and the AI won't either.
- **Puresteel Paladin works.** While you control three or more artifacts, your Equipment can be equipped for
  free — the discount now actually shows up on the equip you're offered, and switches off when you drop
  below three.
- **Buster Sword works.** When the equipped creature connects you draw a card and may then cast a spell from
  your hand free, capped at the damage that was actually dealt — as printed.
- **Trigger-doubling by source works.** Katara, the Fearless, Harmonic Prodigy, Cloud, Midgar Mercenary, and
  Annie Joins Up now make the abilities they name trigger an additional time — Cloud only while it's
  equipped, and Harmonic Prodigy correctly never doubles its own.
- **Panther Habit works.** Damage to the equipped creature is prevented and it grows by that many +1/+1
  counters instead — in combat and from burn alike, as printed.
- **Ironscale Hydra works.** Combat damage from a creature is prevented and the Hydra grows by one +1/+1
  counter. Noncombat damage still gets through, exactly as printed.
- **Primal Might works.** It now pumps your creature by +X/+X and then fights, so the X you pay actually
  swings the fight, as printed.
- **"Untap target creature or land" works.** Saryth, the Viper's Fang, Civic Gardener, and Initiate's
  Companion can now untap either a creature or a land, as printed.
- **Natural Order works.** It now correctly requires sacrificing a green creature as you cast it, then tutors
  a green creature straight onto the battlefield.
- **Lion Umbra works.** It can now only enchant a modified creature (one with a counter, Equipment, or Aura),
  as printed, and grants its +3/+3, vigilance, reach, and totem armor.
- **Indomitable Might works.** It now gives the enchanted creature +3/+3 and lets it deal its full combat
  damage to the defending player even when blocked, as printed.
- **"Can't be blocked" gear works.** Whispersilk Cloak, Cloak of Mists, Protective Bubble, Aqueous Form, and
  Silver Shroud Costume now make the equipped/enchanted creature unblockable (and grant shroud where printed).
- **Voyager Staff works.** Its "{2}, Sacrifice" ability now exiles a creature and returns it at the next end
  step — a repeatable blink for re-triggering enter abilities.
- **Eerie Interlude and Ghostway work.** Their team-wide flicker — exile your creatures now, return them all
  at the next end step — now resolves, dodging a board wipe as printed.
- **Turn to Mist and Mistmeadow Witch work.** Their delayed flicker — exile now, return at the next end
  step — now resolves, including Mistmeadow Witch's repeatable "{2}{W}{U}" blink.
- **Otherworldly Journey and Long Road Home work.** They now exile the creature and return it at the next
  end step with a +1/+1 counter — the full delayed flicker, timed correctly.
- **Conjurer's Closet blinks on your end step.** Its optional end-step "exile then return" now works — you
  can flicker one of your creatures each turn to re-trigger its enter ability, as printed.
- **Essence Flux rewards Spirits.** Its blink now returns the creature and, if it's a Spirit, brings it back
  with a +1/+1 counter — as printed, and nothing extra for a non-Spirit.
- **Simic Ascendancy builds toward its win.** When +1/+1 counters land on your creatures it now banks that
  many growth counters — and at twenty, on your upkeep, you win the game, exactly as printed.
- **Winds of Change works.** Every player now shuffles their hand into their library and draws that many
  cards back — a full hand refresh that leaves graveyards untouched, completing the wheel family.
- **Thunderfoot Baloth's Lieutenant bonus works.** While you control your commander, it now gives itself and
  your other creatures +2/+2 and grants them trample — and correctly gives nothing while your commander is
  gone, tracking live as it leaves and re-enters.
- **Court of Garenbrig grows your team.** Its upkeep now distributes its two +1/+1 counters among up to two
  of your creatures and — while you're the monarch — doubles every +1/+1 counter you control, as printed.
- **Rishkar, Peema Renegade turns your counters into mana.** Creatures you control that have a counter now
  correctly gain "{T}: Add {G}" — and creatures without a counter don't.
- **Kederekt Parasite's optional ping works.** When an opponent draws and you control a red permanent, it
  now offers to deal its 1 damage, instead of the whole ability falling through.
- **Aurelia, the Law Above triggers off any player's attack.** Her draw and her damage/lifegain now fire
  when anyone — you or an opponent — attacks with enough creatures, as printed.
- **Sage's Reverie counts its auras.** Its draw and its buff now scale with the Auras you control that are
  attached to a creature — counting exactly those, not auras sitting on lands or artifacts.

## [0.160.0] - 2026-08-16

### Fixed
- **Ancestral Mask counts correctly.** "+2/+2 for each other enchantment on the battlefield" now excludes
  the Mask itself, so it grants the right bonus instead of over-counting by one.
- **Triskaidekaphile can win.** Holding exactly thirteen cards in hand at your upkeep now wins the game,
  as printed (and twelve or fourteen correctly don't).
- **Aura/Equipment that scale AND grant a keyword now work.** Ethereal Armor, Glaive of the Guildpact,
  and six more give both their "+X/+X for each …" bonus and their granted keyword (first strike, flying,
  vigilance, ward…), instead of dropping the whole bonus.
- **"Whenever a player draws a card" punishers work.** Spiteful Visions now deals its damage on every
  draw — yours and your opponents' — not just opponents', matching the printed symmetric wording.
- **Shalai and Hallar's ping works.** When +1/+1 counters land on your creatures, she now deals that
  much damage to an opponent — the deck's whole counters-to-damage engine, live.
- **Artifact-creature combat pumps work.** Cards that pump "target artifact creature you control" at
  combat — Weldfast Engineer, Aethershield Artificer, Baxter Stockman — now resolve their buff (and any
  granted keyword) on a real, correctly-restricted target instead of falling through.
- **"Tapped and attacking" tokens really attack.** Kessig Cagebreakers (and cards like it) now make
  their Wolf tokens that enter tapped-and-attacking actually join the attack and deal damage, one per
  creature card in your graveyard — not enter and sit there.
- **"Protection from the color of your choice" is a real choice.** Mother of Runes, Giver of Runes,
  Gods Willing, Shelter, and six more now grant genuine protection with a sensibly chosen color (the
  most-threatening color on your opponents' boards), and Giver can pick colorless as printed.
- **The Last Agni Kai converts the overkill.** The fight really pays excess damage out as red mana,
  and that red genuinely survives every step and phase until end of turn — then empties at cleanup
  like the card says.
- **Raph & Mikey cause proper trouble.** Their attack trigger fires (the duo's plural wording was the
  whole blocker), digs to the first creature in your library, puts it in tapped *and attacking* the
  same player, and bottoms the rest at random — exactly as printed.
- **Prowess tokens are real, and Cori-Steel Cutter's attach is a real choice.** Monk and Goblin Wizard
  tokens "with prowess" now actually grow on your noncreature spells (Monastery Mentor's whole engine
  works), and the Cutter's "you may attach" is a genuine decision — the practice AI attaches a free
  Cutter but never strips its current wearer, and the mandatory attach cards (Auxiliary Boosters)
  attach every time as printed.
- **Brotherhood Regalia grants everything it says.** The equipped creature really has ward {2} (the
  tax applies), really becomes an Assassin (subtype-matters cards see it), and really can't be
  blocked — all three lift the moment the Equipment comes off.
- **Meltstrider's Resolve (and friends) do what auras say.** The enters-fight really makes the
  *enchanted creature* fight (never the aura, and declining is allowed), and "can't be blocked by
  more than one creature" now works as an aura or equipment grant — it holds while attached and
  lifts the moment the attachment leaves. Pitiless Fists, Warbriar Blessing, and Wolfrider's Saddle
  ride the same fixes.
- **Well Rested wakes up properly.** The enchanted creature's untap trigger really fires — two
  counters on the creature itself, two life, a card — once each turn as printed.
- **Canopy Gargantuan counts each creature separately.** The upkeep really gives every *other*
  creature you control counters equal to its own toughness — the 0/5 wall gets five while the 1/1
  gets one, existing counters raise the count, and the Gargantuan itself gets none.
- **Warden of the Grove's endure X works as printed.** Each other nontoken creature you play endures
  X — X really counts every counter on the Warden, the counters land on the creature that entered
  (not on the Warden), and if that creature's already gone you get the X/X white Spirit instead.
- **Kodama of the West Tree knows what "modified" means.** The land-fetch really fires only when a
  modified creature you control connects — a counter, any Equipment, or an Aura *you* control counts;
  an opponent's Pacifism doesn't — and the same definition drives the trample grant, so the two can
  never disagree. SP//dr, Piloted by Peni's draw works the same way.
- **The Ozolith remembers.** When a creature you control leaves the battlefield with counters on it —
  killed, bounced, or exiled — those exact counters (every kind) really land on The Ozolith, and at the
  start of your combat you can move the whole banked pile onto a creature: it all arrives (a doubler
  doubles what lands), the Ozolith empties by exactly what was banked, and declining is a real choice.
- **Forgotten Ancient actually moves its counters.** The upkeep ability really moves any number of
  +1/+1 counters onto other creatures — they leave the Ancient and land where you put them (a doubler
  doubles what lands, never what leaves), moving none is a real choice, and the practice-game AI banks
  the pile then dumps it on your strongest other creature instead of never using the ability.
- **"Choose one that hasn't been chosen this turn" remembers.** Teval's Judgment, Breeches, Gala
  Greeters, Monument to Endurance, and Galadriel all track their picks — the same mode is never
  offered twice in a turn, and once all modes are spent the trigger correctly does nothing until
  next turn.
- **Toxic Deluge costs what it says.** You choose X when you cast it, pay exactly that much life —
  never more than you can afford — and every creature gets -X/-X. Hatred's pay-X-life pump works the
  same way.
- **Court of Cunning knows who wears the crown.** The enters-trigger makes you the monarch, and the
  upkeep mill really checks the crown at resolution — two cards without it, ten with it, and an
  opponent's crown never upgrades your mill.
- **Dredger's Insight digs properly.** The enters-mill really offers an artifact, creature, or land
  from among exactly the milled four, and the lifegain watches for artifact and creature cards
  leaving your graveyard — both as printed. Eerie Gravestone's sacrifice dig works the same way.
- **Ripples of Undeath completes its loop.** The first-main mill really offers the pay-{1}-and-3-life
  follow-up, both halves of the cost are charged together or not at all, and the card you fish back
  comes from exactly the three just milled — never something older in the graveyard. Miara, Thorn of
  the Glade's pay-and-draw works the same way.
- **Bloodghast comes back.** Every land you play really offers the Vampire back from your graveyard
  to the battlefield — and it never phantom-triggers while it's already in play.
- **Tapped tokens enter tapped.** Tormod, the Desecrator's Zombies, Liliana's Reaver's, Girder
  Goons', Shadow Summoning's Spirits, and eight more token-makers now put their tokens onto the
  battlefield tapped exactly as printed — no free blockers, no phantom mana taps.
- **Undead Butler's last service works.** When it dies you really choose whether to exile it from
  your graveyard, and only a real exile fetches the creature card back to your hand — if the Butler
  slipped out of the graveyard first, there's no free return. Paramecia Coloniex's identical trick
  works too.
- **Molt Tender pays its way.** The second tap really exiles a card from your graveyard for its
  any-color mana — it's never offered with an empty graveyard, and the exile actually happens (which
  also feeds Teval's Zombie trigger, as printed).
- **Teval, the Balanced Scale runs her whole engine.** The attack trigger mills three and really
  offers the land back onto the battlefield tapped, and every batch of cards leaving your graveyard
  makes the 2/2 Zombie Druid — including the batch her own land return creates.
- **"Discard a creature card" costs are real costs.** Tortured Existence, Survival of the Fittest,
  Fauna Shaman, Seismic Assault, Molten Vortex, Lotleth Troll, and ten more now offer their abilities
  only when a matching card is in hand, pitch exactly the card type printed, and never accept a land
  where a creature is required.
- **Herd Heirloom's second tap works.** Point it at your power-4-or-greater creature and it really
  gains trample plus the combat-damage card draw until end of turn — smaller creatures and opposing
  creatures are never offered as targets.

## [0.159.0] - 2026-08-15

### Fixed
- **Tribal graveyard recursion works by name.** "Return target Dinosaur card from your graveyard to
  your hand" (Atzocan Seer) and its whole family — Goblin, Zombie, Myr, Spirit, Knight, Villain, and
  Mercenary returns on cards like Lord of the Undead, Myr Reservoir, Wort, Boggart Auntie, and Angel
  of Flight Alabaster — now target exactly the right creature type, never anything else.
- **Rith, Liberated Primeval watches for overkill.** Her end-step trigger really checks whether an
  opponent's creature was dealt excess damage this turn — exact lethal doesn't count, overkill does —
  and pays out the 4/4 Dragon. "Other Dragons you control have ward {2}" is now a real, enforced ward,
  and the same fix lights up ward grants on Bronze Guardian, Giant Ankheg, Star Whale, Radagast, and
  Flowering of the White Tree.
- **Rivaz of the Claw does everything on the card.** The tap really makes two any-color mana that
  only Dragon creature spells can spend, once each of your turns you can cast a Dragon creature
  straight from your graveyard, and a Dragon recurred that way is exiled when it dies — no
  double-dipping. Smokebraider and Flamebraider's Elemental mana comes along for the ride.
- **The coverage dashboard stopped over-counting mana rocks.** Cards like the Keyrunes and Monuments
  were counted fully-supported while their second ability (animation, sac effects) wasn't modeled —
  and two rocks were making mana without charging their activation cost. The counts are honest now;
  the mana side of those cards still works exactly as before.
- **Sarkhan, Fireblood plays all three abilities.** The rummage +1, the Dragon-mana +1 (two mana of
  any colors that really spend only on Dragon spells — and vanish at step's end, as printed), and the
  −7's four 5/5 Dragons all resolve natively now. Desolation of Smaug rides along: sweep the
  non-Dragons, bank four Dragon-only mana. Planeswalkers in the deck coverage dashboard also stopped
  under-reporting — a dropped loyalty field made every walker read as unmodeled there.
- **Deflecting Swat actually swats.** Cast it free with your commander out (or pay the {2}{R}) and it
  re-aims a spell or ability on the stack: removal pointed at your creature gets deflected onto
  something of its own caster's, and when there's nothing better to point it at, the targets simply
  stay as printed — exactly how the card's "may" works. Uncounterable spells are fair game; a
  retarget was never a counter.
- **Klauth fuels the alpha strike.** His attack trigger really adds mana equal to your total
  attacking power — pumped attackers count — and it lasts until end of turn as printed. The mana
  spends only on spells, never on abilities, and Rivaz of the Claw's Dragon-only mana now pays
  Dragon spells too.
- **Summon: Bahamut runs its whole Saga.** Chapters I and II snipe a nonland permanent each, III
  draws two, and Mega Flare hits every opponent for the total mana value of your other permanents —
  never counting Bahamut itself. Its Flying line no longer confuses the Saga reader.
- **Hellkite Courser lends you your commander.** Its enters trigger really borrows your commander
  from the command zone — it arrives with haste, swings, and goes home at the next end step. If it
  dies first, nothing comes back from nowhere.
- **Terror of the Peaks taxes your removal.** Opponents pay 3 life to aim spells at it — and if they
  can't afford the life, they can't cast it at all. Its damage trigger on your entering creatures
  already worked; the whole card now plays.
- **Korvold feasts properly.** His enters-and-attacks trigger sacrifices another permanent — never
  himself, even as the last permanent standing — and every sacrifice grows him a counter and draws a
  card. Kraum, Shabraz, Trelasarra, Neva, Black Widow, General Traag, and Abomination (Irradiated
  Brute) wake up on the same fix.
- **Power-up works — the Gamma legends flex.** Hulk Gamma Goliath, She-Hulk, and Abomination's
  power-up abilities activate once per game as printed, and Goliath really discounts the other
  Gammas' power-ups by {3} (never his own). Fourteen more cards ride the same fixes, including
  Prayer of Binding, Arcanis the Omnipotent, Hercules, and Markov Enforcer.
- **Red Hulk hits back — and eleven friends wake up with him.** Taking damage grows him a counter,
  then he unloads damage equal to his counters at anything else — never at himself. The same fixes
  bring Mockingbird, Mycoloth, Preyseizer Dragon, Fireblade Artist, Falkenrath Exterminator, Cornered
  Crook, Scarlet Spider, Zuko, Servant of the Scale, Canopy Crawler, and Pyroclastic Hellion to life.
- **Hulk, Strongest There Is gets angrier.** He enters with his +1/+1 counter, and each upkeep every
  Gamma creature you control doubles its own counters — your non-Gamma creatures correctly sit it out.
- **Caltrops punishes every attack.** It pings each attacking creature for 1 no matter whose turn it
  is — including when the opponent swings into you, which is the whole point. Righteous Cause's
  gain-a-life-per-attacker works the same way.
- **Strength of Will grants the full package.** Your creature really gains indestructible plus the
  damage-to-counters ability until end of turn — it shrugs off lethal damage, grows by exactly the
  damage taken, and both gifts wear off together at cleanup. Infuse with Vitality, Pain 101, and Run
  Wild ride the same new wording.
- **Force of Vigor pitches and sweeps.** On an opponent's turn you can exile a green card instead of
  paying mana, and the spell destroys up to two artifacts or enchantments in any mix — including
  choosing just one, or none.
- **Escape to the Wilds plays out fully.** The top five exile with their play window lasting through
  the end of your next turn — the same two-turn window Light Up the Stage uses — plus the extra land
  drop, all in the simulator.
- **Betor, Kin to All climbs the ladder.** Each end step it checks your creatures' real total
  toughness — buffs and counters included — drawing at 10, untapping your team at 20, and halving
  every opponent's life at 40, in the printed order.
- **Jeska's Will works — both modes.** The red mana counts the targeted opponent's actual hand, the
  exile-three grants its play-this-turn window, and controlling your commander unlocks choosing both.
- **Savage Order works — every clause.** The cost really demands a 4-power creature (a pumped 3-drop
  counts, a shrunken 4-drop doesn't), the fetched Dinosaur arrives on the battlefield, and it keeps
  its indestructible through your opponents' turns as printed. Shadow-Rite Priest's black-creature
  fetch and Garruk, Caller of Beasts ride the same machinery.
- **Bonehoard Dracosaur works.** Each upkeep it exiles two cards you can play that turn — and the
  bonuses read what was actually exiled: a land among them mints the 3/1 Dinosaur, a nonland pumps
  the Dracosaur, both when the two cards split.
- **Temple Altisaur shields the herd.** Any damage to another Dinosaur you control is cut to 1 —
  but never to the Altisaur itself, never to non-Dinosaurs, and never to an opponent's Dinosaurs.
- **Throne of the God-Pharaoh works.** Each end step it counts your tapped creatures — attackers,
  tapped mana dorks, all of them, read live — and drains each opponent for that much. Black Widow's
  combat-damage drain and Harvest Season's tapped-count land search work off the same counting.
- **The self-mill diggers work.** Malevolent Rumble, Grisly Salvage, Scout the Borders, Commune with
  the Gods and Satyr Wayfinder reveal their cards, offer the printed keep, and put the rest into your
  graveyard — not the bottom of your library — feeding every graveyard payoff as intended.
- **Ouroboroid works.** Each combat on your turn it reads its own current power — pumps and counters
  included — and puts that many +1/+1 counters on every creature you control, itself included, so it
  snowballs exactly as printed.
- **Kishla Skimmer works.** A card leaving your graveyard on your turn draws you a card — once each
  turn, never on an opponent's turn, and never off someone else's graveyard.
- **Stubborn Denial works — both halves.** With a 4-power creature on your board it counters outright;
  without one, the opponent gets the printed chance to pay {1}. Exactly four is the line.
- **X-cost pump tricks with keyword grants work.** Tyvar's Stand delivers its +X/+X AND the hexproof
  and indestructible; Pedal to the Metal, Frantic Confrontation and Lunar Frenzy deliver +X/+0 with
  first strike (and trample). The X landed before this fix, but the keywords were silently lost.
- **Marauding Raptor works — and honestly.** Each creature you play takes its 2 damage, and the Raptor
  only grows when a Dinosaur was actually dealt the damage: a prevention shield that soaks the hit means
  no pump, exactly as printed. Aether Flash's enters-damage works the same way.

## [0.158.0] - 2026-08-14

### Added
- **The AI understands every card's role.** Cards the simulator can't fully model are no longer
  invisible to the AI's decisions: every card now carries a derived play role (wipe, ramp, tutor,
  finisher…) the opponents use to sequence their turns — control decks now hold and cast board wipes
  like board wipes. A per-card hints ledger (card-play-hints.json) lets hand-written guidance override
  the derivation, and `scripts/warm-play-hints.mjs` builds it for your saved decks.

### Fixed
- **"Attacks while…" triggers work.** Pugnacious Hammerskull stuns itself only when it attacks as your
  lone Dinosaur — a second Dinosaur (but not a Bear) silences it. Brazen Blademaster, Seasoned
  Warrenguard, Hand That Feeds and Courageous Goblin get their attack bonuses under the same printed
  conditions, checked at the moment of attack as the cards say.
- **Displacer Kitten works.** Casting a noncreature spell lets you flicker one of your nonland
  permanents — your choice, including choosing nothing; a land or an opponent's permanent is never a
  legal pick, and the flickered permanent always comes back.
- **"Return two target creatures" means two.** Step Through, Undo and Essence Fracture bounce exactly
  two creatures — with only one creature on the battlefield the spell correctly can't be cast, rather
  than half-resolving. Cards with a typecycling line (Step Through's Wizardcycling, Lórien Revealed's
  Islandcycling) no longer sit out the simulator because of it.
- **Noxious Revival works.** Any graveyard's card goes on top of its owner's library — an opponent's
  card tops their deck, not yours.
- **Discard-to-activate abilities can aim.** Trumpeting Carnosaur's "discard this card: 3 damage to a
  creature or planeswalker" and Steel Wrecking Ball's "destroy target artifact" now work from your
  hand — the target is chosen when you activate, and with no legal target the ability simply isn't
  offered, so the card is never thrown away for nothing.
- **Venser, Shaper Savant works.** His flash entrance returns any spell or permanent to its owner's
  hand — including a spell that "can't be countered," because returning isn't countering. The bounced
  spell goes to its owner's hand, never the graveyard.
- **Mana Drain pays out.** The counter half always worked through the assistant; now the countered
  spell's mana value — including a cast X — really arrives as {C} at the beginning of your next main
  phase, ready to spend that phase. A countered 0-cost spell correctly pays nothing, and a Drain that
  fizzles (its target left the stack) schedules no mana.
- **Decking out is real, and Laboratory Maniac works.** Drawing from an empty library now loses the
  game as the rules say — previously the draw silently fizzled and nobody ever decked out. With
  Laboratory Maniac on your battlefield that same draw wins you the game instead, unless something says
  you can't win (Abyssal Persecutor), in which case the draw is still replaced and the game goes on.
- **Ghostly Flicker works.** Exactly two of your artifacts, creatures and/or lands blink out and come
  back under your control — an enchantment is never a legal pick, and with only one legal permanent the
  spell correctly cannot be cast at all.
- **The flash-payoff watchers work.** Wavebreak Hippocamp, Nymris, Dreamstalker Manticore, Mischievous
  Chimera and Arena Trickster now trigger on your first spell during each opponent's turn — and stay
  silent on your own.
- **Vedalken Aethermage works.** The flash ETB bounces a Sliver — and only a Sliver.
- **Displace works.** Both blinked creatures leave and come back — never the half-card that exiled them
  for good.
- **X-cost permanents deliver their X.** Triceraton Commander, The Meathook Massacre, Rocco, Springleaf
  Parade and Spiteful Banditry now read the X you cast them for — and correctly do nothing extra when
  blinked back without a cast.
- **Palani's Hatcher hatches.** The combat trigger sacrifices an Egg — and only an Egg — then delivers
  the 3/3 Dinosaur.
- **Karlach, Fury of Avernus works** — first combat of the turn only: untaps the attackers, grants
  first strike, and queues her extra combat (which correctly can't re-trigger her). Headlong Rush, Akki
  Coalflinger, Chieftain en-Dal and Fangren Pathcutter ride the same attacking-batch grant. Extra
  combat phases also now fire beginning-of-combat triggers properly.
- **Extra combat steps work.** Relentless Assault, Aggravated Assault, Seize the Day, Waves of
  Aggression and Response // Resurgence now really grant their additional combat phase after your main
  phase — untapping the right creatures on the way in.
- **Halana and Alena work.** The combat trigger now gifts X +1/+1 counters equal to their live power to
  another creature you control and hastes it — and the gift grows when Halana and Alena do.
- **Flow State works.** The cantrip digs three, keeps one — or keeps two once your graveyard holds both
  an instant and a sorcery. This puts the Veyran Cantrips deck fully into simulator-playable territory.
- **Entish Restoration pays its cost.** With a power-4 creature on board, the spell was searching three
  basic lands without sacrificing a land first — the sacrifice is unconditional on the printed card and
  now always happens.
- **Spell mastery bonuses land.** Unholy Hunger, Dark Petition and Gideon's Phalanx now check your
  graveyard at resolution and deliver their bonus — the life, the {B}{B}{B}, the indestructible blanket —
  only when two or more instant or sorcery cards are really there.
- **Graveblade Marauder and Emissary of Despair drain correctly.** Marauder's saboteur hit counts the
  creature cards in its controller's graveyard; Emissary counts the artifacts the damaged player
  controls — each card reads the seat it prints.
- **Paralyze, Apathy and Mind Whip work.** The enchanted creature's controller gets the printed upkeep
  offer — pay or suffer the card's consequence — with the payment, the untap and Mind Whip's damage all
  landing on the right player.
- **Slow Motion works.** The enchanted creature's controller chooses each upkeep: pay {2} or sacrifice
  the creature — the choice, the payment and the sacrifice all belong to the right player.
- **Punisher auras tick.** Stab Wound, One Thousand Lashes, Soul Bleed, Wanderlust, Parasitic Bond,
  Maddening Wind, Super Intelligence and Unstable Mutation now fire at the upkeep of the enchanted
  creature's controller — the right player's upkeep, even when the aura's owner is someone else.
- **Half-life effects work.** Quietus Spike, Scytheclaw, Virtus the Veiled, Radioactive Man, Ebonblade
  Reaper, Havoc Festival, Infernal Contract and Cruel Bargain now halve the right player's life total at
  resolution, rounding the way each card prints it.
- **Conditional protection is no longer always-on.** Cards whose protection lives behind a condition
  ("As long as this creature is untapped…" — Pristine Angel; threshold cards like Mystic Familiar) were
  granting their protection unconditionally in the simulator — a tapped Pristine Angel could not be
  targeted or damaged. The condition is now respected, and Mystic Familiar's threshold bonus
  (+1/+1 and protection from black at seven cards in graveyard) is fully modeled.
- **Bounce-a-land upkeep costs work.** Waterspout Djinn and Living Tsunami now offer their printed
  upkeep choice: return a land you control to your hand (the Djinn insists on an untapped Island) or
  sacrifice the creature. The returned land goes to your hand, not the graveyard.
- **Upkeep "rent" paid with permanents works.** Bog Elemental, Cosmic Larva and Endless Wurm now offer
  their printed upkeep choice: sacrifice a land (or two lands, or an enchantment) to keep the creature,
  or let it go. The cost is all-or-nothing — one land against a two-land cost pays nothing.
- **The Masticore upkeep prompt now names its real cost.** The choice panel read "Pay {0}" for
  discard-to-keep upkeep costs; it now says "Discard a card".
- **The Masticore upkeep cost works.** Masticore, Razormane Masticore and Coral Net now offer the printed
  choice each upkeep: discard a card to keep the permanent, or let it go. Previously the simulator could
  not read the discard option and skipped these cards entirely.
- **Costs that sacrifice a nontoken permanent work.** Thopter Foundry, Infernal Tribute, Knight of the
  Last Breath and Korozda Guildmage now pay their sacrifice costs correctly — and a token can never be
  used to pay a cost that says "nontoken", so Thopter Foundry cannot eat its own Thopters.
- **Additional costs with a choice on either side of "or pay" work.** Annihilating Glare, Deadly
  Precision, Betrayer's Bargain and Final Payment offer both ways to pay — sacrificing a permanent of
  either printed type, or paying the mana or life alternative.
- **The tribal reveal-or-pay cards work.** Silvergill Adept, Wren's Run Vanquisher, Daring Buccaneer,
  Goldmeadow Stalwart, Squeaking Pie Sneak, Sadistic Skymarcher, Thunderherd Migration, Flamekin
  Bladewhirl and Surtland Elementalist can be cast by revealing a matching card from your hand or by
  paying the extra mana. A card can no longer reveal itself to pay its own discount.
- **Removal that names a keyword works.** Clear a Path, Ogre Gatecrasher, Deface and Smash to Dust destroy
  a creature with defender; Shadowstorm and Faceless Devourer hit creatures with shadow. The simulator
  previously understood only "with flying" and skipped these cards.
- **"Destroy target artifact creature" works.** Chandler, Molten Frame, Hearth Charm and Leonin Iconoclast
  (which hits an enchantment creature) did nothing in the simulator, which could not read a positive card
  type on a target. They now correctly hit only creatures of that type.
- **Bouncing a tapped or attacking creature works.** Galestrike, Harbinger of the Tides, Select for
  Inspection, Surrakar Banisher, Selkie Hedge-Mage, Spellweaver Duo, Champion's Victory and Remove did
  nothing in the simulator, which could not read "target tapped creature" or "target attacking creature".
- **A malformed combat requirement no longer offers every creature.** An unrecognized combat qualifier was
  treated as satisfied by everything rather than by nothing; it now offers no targets.
- **"Destroy target creature or Vehicle" works.** Daring Demolition, Spin Out, Ride's End and Scrap
  Compactor did nothing in the simulator. They now correctly hit creatures and Vehicles — including a
  Vehicle that has not been crewed, which these cards exist to answer.
- **"Destroy target creature that was dealt damage this turn" works.** Seventeen cards built around
  finishing off a damaged creature — Fatal Blow, Rooftop Assassin, Vraska's Finisher, Ogre Siegebreaker,
  Witch's Mist, Opportunist, Crushing Pain, Hooded Assassin, Lurking Deadeye, Stingblade Assassin,
  Final-Sting Faerie, Downwind Ambusher, Unsparing Boltcaster, Fathom Fleet Cutthroat, You Are Already
  Dead, Mirrodin Avenged and Jarl of the Forsaken — did nothing in the simulator, because it could not
  tell which creatures had been dealt damage. They now correctly offer only damaged creatures, including
  ones hit by infect or wither.
- **Fry aims only at white and blue.** Fry printed "target creature or planeswalker that's white or blue",
  but the simulator dropped the colour requirement and would let it burn a green creature. It now respects
  what the card says.
- **Surge of Righteousness works.** It destroys an attacking or blocking black or red creature; the
  simulator could not read the "that's attacking or blocking" wording and skipped the card entirely.
- **Cards that shoot "a creature or planeswalker an opponent controls" respect whose it is.** Skysovereign,
  Consul Flagship, Careless Celebrant and Iroas's Blessing now fire in the simulator, and they can no longer
  be pointed at your own planeswalker.
- **Combat-damage snipe triggers work.** Snapping Thragg, Skirk Commando and Spark Mage shoot a creature
  controlled by the player they just hit. The simulator could not tell which player "that player" meant in
  a targeting clause, so the triggers did nothing — they now aim at the right player's board.
- **Shockmaw Dragon works.** Its combat-damage trigger burns every creature the player it hit controls —
  the simulator could not express "that player controls" for creatures, so the trigger did nothing.
- **"Its controller" payoffs hit the right player.** Poisonbelly Ogre, Fate Foretold and Parasitic Impetus
  act on the controller of the creature that triggered them — the one that entered, died or attacked. The
  simulator could not tell whose creature it was, so these cards did nothing; they now charge the right
  player rather than their own controller.

## [0.157.0] - 2026-08-07

> Section reconstructed 2026-08-14: v0.157.0 was tagged while CHANGELOG.md was doubled (see the
> repair note in the run ledger), so its notes had been stranded in [Unreleased]. These are the
> bullets that actually shipped in it.

### Fixed
- **Costs that sacrifice "a creature or enchantment" (or planeswalker, or land) work.** Heartfire, Final
  Flare, Final Vengeance, Merciless Resolve, Ragamuffyn, Ertai the Corrupted, Blood Aspirant, Spark Reaper,
  Dreadmalkin and Diversion Specialist all pay with either half of their printed choice; the simulator
  previously understood only single-type sacrifices, so all ten did nothing.
- **Spells with an "or pay" additional cost work.** Spark Harvest, Eaten Alive, Lash of the Balrog,
  Morkrut Behemoth, Bayou Groff, Lightning Axe, Pumpkin Bombardment and Soaring Stoneglider let you choose
  between paying the listed cost or paying extra mana. The simulator understood every option except the
  mana one, so it skipped all eight cards. Both ways to pay are now offered, and each is charged correctly.
- **Tribal tutors for more creature types work.** Giant Harbinger and Forerunner of the Coalition search
  for a Giant or a Pirate card; the simulator knew a handful of creature types and not these.
- **Pumps that scale with a board count work on a chosen target.** Primal Bellow, Might of the Masses,
  Hunger of the Nim, Confront the Unknown, Defile, Irradiate and Friendly Neighborhood count your Forests,
  Clues, artifacts or creatures and buff the target by that much.
- **Shrinking effects that scale with a board count now actually shrink.** Any "-1/-1 until end of turn for
  each …" was being applied as zero, so cards like Defile and Irradiate did nothing at all. 19 cards print
  that wording.
- **"Return a land you control" works.** Tazeem Raptor, Sutina, Wayward Guide-Beast, Noggle Bridgebreaker
  and Zell Dincht return one of your lands to hand; the simulator understood only the creature and
  permanent wordings, so all five did nothing. It returns a land you have already tapped for mana, which
  is the sensible choice.
- **Reanimation that returns a permanent tapped works.** Writ of Return, Gravewaker, Undergrowth Recon,
  Dr. Madison Li and Scaretiller bring a card back from your graveyard tapped; the simulator could not read
  the "tapped" wording and skipped all five. They now return the permanent, correctly tapped.
- **Graveyard hate that names a card type works.** Shamble Back, Vile Rebirth, Thraben Heretic, Cemetery
  Reaper, Selesnya Eulogist, Necrogenesis, Conversion Chamber and Grave Robbers exile a creature (or
  artifact) card from a graveyard. The simulator could only read the unfiltered wording, so all eight did
  nothing; they now offer only cards of the type the card names.
- **Bouncing a Vehicle works.** Bounce Off and Roadside Blowout return a creature or a Vehicle to its
  owner's hand — including an uncrewed Vehicle, which is the case these cards exist for.
- **Legendary-only removal works.** Hero's Demise and Tsabo Tavoc destroy a legendary creature; the
  simulator could not read "legendary" as a target requirement and skipped both cards.
- **Counters on "target creature or Vehicle" work.** Seven-Tail Mentor, Grafted Growth, Light the Way and
  Perilous Snare put a +1/+1 counter on a creature or a Vehicle — including a Vehicle that has not been
  crewed, which is the case these cards are printed for. The ones that say "you control" can no longer be
  pointed at an opponent's Vehicle.

## [0.156.0] - 2026-08-05

### Fixed
- **Attack triggers that hit the defender's creatures work.** Mage-Ring Responder, Hellkite Whelp,
  Heart-Piercer Bow, Gouged Zealot, Swathcutter Giant, Ronin Cliffrider, Scalding Salamander and Colossal
  Whale all act on creatures the defending player controls. The simulator understood "an opponent
  controls" but not "defending player controls" — and in a multiplayer game those differ, so these now
  reach only the player being attacked.
- **More attack and block payoffs work.** Falkenrath Perforator and Simian Sling damage the defending
  player; Thresher Beast makes them sacrifice a land. The triggers were recognised but their effects were
  not, so nothing happened — each now hits the player being attacked or blocking, and only that player.
- **Attack and block discard triggers work.** Abyssal Nightstalker, The Haunt of Hightower, Shrieking
  Specter, Alley Grifters, Slate Street Ruffian and Corrupt Official make the defending player discard.
  The triggers were recognised but the victim was not, so nothing happened — the player being attacked or
  blocking now discards, and nobody else does.
- **Combat-damage edicts work.** Demon of Loathing, Cabal Executioner, Destructive Urge and Akki
  Underminer make the player they hit sacrifice a creature, land or permanent. The trigger was recognised
  but the victim was not, so nothing happened — the damaged player now loses exactly what the card says,
  and no one else does.
- **Combat-damage payoffs that say "an opponent" work.** Coastal Piracy, Hydra Omnivore, Mindscour Dragon
  and Joven and Chandler trigger when your creature connects. The simulator recognised the wording "deals
  combat damage to a player" but not "to an opponent", so these cards did nothing at all — their triggers
  now fire exactly as printed.
- **A few more opponent-targeting cards work.** Fiery Justice, Bargain and Armistice give an opponent life
  or a card draw. The simulator understood "target player gains/draws" but not "target opponent", so these
  sat out — and each now targets only opponents, never its own controller.
- **Draw-punisher and opponent-upkeep cards work.** Fate Unraveler, Underworld Dreams, Scrawling Crawler
  and Nekusar punish whoever drew the card; Gibbering Fiend, Sheoldred and Manic Scribe act on the opponent
  whose upkeep it is. Both families understood their trigger but not who "that player" meant, so they sat
  out — and each now hits the right player rather than an arbitrary opponent.
- **Spell-punisher cards work.** Eidolon of the Great Revel, Pyrostatic Pillar, Aether Sting, Spellshock,
  Ishi-Ishi, Ruric Thar, Scalding Viper, Cindervines, Kambal, Soot Imp and Yawgmoth's Edict all punish
  whoever cast the spell. The simulator understood the trigger but not who "that player" referred to, so
  the cards sat out — and they now hit the player who actually cast, never a different opponent.
- **Hand-peeking cards work.** Sorcerous Sight, Telepathic Spies, Wanderguard Sentry, Talas Explorer and
  Wu Scout look at an opponent's hand. The simulator understood the wording "target player's hand" but not
  "target opponent's hand", so these sat out — and they now show you only an opponent's hand, never your own.
- **Two-colour removal and Auras work.** Deathmark, Wallop, Rending Volley, Celestial Purge, Slithery
  Stalker, Lightwielder Paladin, Controlled Instincts and Encase in Ice all read "target green or white
  creature" and the like. The simulator had no way to express "either colour", so these cards sat out
  entirely — they now offer exactly the colours they print, and nothing else.
- **More binding Auras are playable.** Suppression Bonds, Nahiri's Binding and Planar Disruption shut down
  the permanent they enchant — they print the same text as Petrify, and were held back only by which kinds
  of permanent they are allowed to target.
- **Auras that enchant artifacts and Vehicles are playable.** Ice Over, Coma Veil, Secure Detention, Petrify,
  Stasis Cocoon, Relic Ward, Aether Meltdown and Mists of Littjara were held back only by their "Enchant"
  line — the simulator could offer them a creature or nothing at all. They now target the permanents they
  actually enchant, and an Aura on an uncrewed Vehicle stays attached instead of falling off.
- **"Its activated abilities can't be activated" now shuts off the whole permanent.** Arrest, Lawmage's
  Binding, Demotion, Stupefying Touch, Detainment Spell and Koma's lock stopped a permanent's ordinary
  abilities but still let it be tapped for mana, crewed, or used for a mana-doubling ability. An arrested
  mana creature is now genuinely silenced.
- **Counters-on-itself payoffs work.** Marketback Walker, Bloodtracker and Hooded Hydra draw or make tokens
  for each +1/+1 counter they had when they left the battlefield; Embalmed Brawler, Kilnmouth Dragon and
  Goblin Razerunners read the counters they currently have.
- **Multikicker creatures are playable.** Skitter of Lizards, Quag Vampires, Enclave Elite, Gnarlid Pack,
  Apex Hawks, Wolfbriar Elemental and Lightkeeper of Emeria were held back by their "for each time it was
  kicked" line. They now play correctly as hard-cast creatures — with no bonus counters, which is exactly
  right, since the simulator does not yet offer the multikicker payment itself.
- **Converge spells scale off the colors you paid with.** Radiant Flames and Kaleidoscorch deal damage equal
  to the number of colors of mana spent — three mana of one color is one damage, as printed.
- **Converge creatures enter at the right size.** Skyrider Elf, Woodland Wanderer, Tajuru Stalwart,
  Rancorous Archaic and Glinting Creeper count the colors of mana you paid with — and Glinting Creeper
  correctly gets two counters per color rather than one.
- **Sunburst counts the colors you actually spent.** Solarion, Suncrusher, Skyreach Manta, Suntouched Myr,
  Etched Oracle and Baton of Courage enter with a counter for each color of mana paid — the simulator had
  no way to ask what colors a spell was paid with. Creatures get +1/+1 counters and other artifacts get
  charge counters, as printed.
- **Exhaust abilities work, and only once.** Pacesetter Paragon, Greenbelt Guardian, Skystreak Engineer,
  Prowcatcher Specialist, Keen Buccaneer and five more were unreadable. Their once-per-game restriction is
  enforced, so the ability is offered a single time and never comes back on a later turn.
- **Discard triggers fire on cycling and on discards paid as a cost.** Liliana's Caress, Megrim, Raiders'
  Wake and every "whenever you/an opponent discards a card" card were silently doing nothing whenever the
  discard came from cycling, an additional cost, or an ability's cost — the most common ways cards get
  discarded. They now fire as printed.

## [0.155.0] - 2026-08-05

### Fixed
- **"Whenever you discard a card" triggers fire.** Grisly Survivor, Hekma Sentinels, Flameblade Adept,
  Drake Haven, Faith of the Devoted, Curator of Mysteries, Lazotep Chancellor and nine more only ever
  watched *opponents'* discards — your own did nothing. Cycling counts as a discard, as it should, and
  discards paid as a cost count too.
- **Morph and disguise creatures are playable.** 75 of them — Willbender, Brine Elemental, Stormwing Dragon,
  Echo Tracer, Nantuko Vigilante and the rest — were held back by their "when turned face up" ability. The
  simulator has no way to play a creature face down, so that ability can never fire; these now play normally
  as the hard-cast creatures they are, exactly as the morph cost line has always been treated.
- **"Is all colors" is applied.** Transguild Courier and Sphinx of the Guildpact were being treated as their
  printed colors, so protection, non-color removal and every color-matters check saw the wrong thing.
- **"During your turn" equipment works.** Javelin of Lightning, Quick-Draw Katana, Hook Swords, Knife,
  Hookblade, Jousting Lance and Hexgold Halberd grant their bonus only on your own turn — the simulator
  didn't understand the timing clause at all, so none of them did anything.

## [0.154.0] - 2026-08-05

### Fixed
- **Platinum Angel works — and Abyssal Persecutor's drawback finally binds.** "You can't lose the game"
  and "your opponents can't win the game" were being read as flavor: the simulator killed you at 0 life
  with the Angel on the battlefield, and let an Abyssal Persecutor controller win outright — the one
  thing that card exists to prevent. Herald of Eternal Dawn is covered by the same fix.
- **Hand-size limits are enforced again.** Any card mentioning maximum hand size used to switch the
  end-of-turn discard off for *everyone* — so a Cursed Rack gave its own controller an unlimited hand.
  Thought Eater, Thought Nibbler, Thought Devourer and Minamo Scrollkeeper now change your limit properly.
- **Mirror Gallery works.** Its one line — turning off the legend rule — wasn't being applied at all, so
  the card did nothing. Mirror Box, Council of Reeds and Cadric's scoped versions work too, and each only
  covers what it says (Mirror Gallery helps everyone; Mirror Box helps only you).
- **Miirym, Sentinel Wyrm works.** Her Dragon token copies were being destroyed the moment they arrived —
  the token was legendary and died to the legend rule alongside the Dragon it copied, so the card did
  nothing. The tokens are correctly not legendary now.
- **Spark Double no longer kills what it copies.** Copying your own commander (or any legend) was
  destroying one of the pair to the legend rule — the exact thing the card says doesn't happen. The copy is
  correctly not legendary now.
- **Ward—Discard a card is no longer free.** Graveyard Trespasser, Mighty Servant of Leuk-o, Tragedy
  Feaster and nine others were being targeted at no cost; now you're asked to discard, and if your hand is
  empty the spell is countered.

### Added
- **Escape creatures are playable.** Phoenix of Ash, Ox of Agonas, Underworld Charger, Woe Strider, Tizerus
  Charger, Underworld Rage-Hound, Voracious Typhon and Loathsome Chimera were held back by their
  "escapes with a +1/+1 counter" line — a bonus that only applies when you cast them from your graveyard,
  which the simulator doesn't offer. They now play normally from hand.
- **Self-shielding and artifact-shielding creatures work.** Revered Elder, Ordruun Commando, Ethereal
  Champion and Ursine Fylgja prevent damage to *themselves*; Argivian Blacksmith and Abuna Acolyte protect
  artifact creatures specifically. Neither wording was understood before.
- **Protective counterspells work.** Turn Aside, Keep Safe, Rebuff the Wicked, Hindering Light, Intervene,
  Confound, Dawn Charm, Outwit, Cerulean Drake, Hydromorph Gull, Hydromorph Guardian and Vigilant Martyr all
  read "counter target spell that targets …" — the simulator could ask what a spell *was*, but never what it
  was *aiming at*, so none of them could be cast. Each now offers exactly the spells it's allowed to answer.
- **"Untap another target permanent you control" works.** Breaching Hippocamp, Dauntless Aven, Kelpie Guide
  and Tenth District Veteran were unreadable; now they untap one of your other permanents, and never the
  opponent's or themselves.
- **Scoped "put on top of library" effects work.** Whisk Away, Aethertow, Azorius Charm and Warrant now hit
  attacking or blocking creatures, and Nightscape Apprentice, Sunscape Apprentice, Civic Guildmage and
  Shadow Guildmage can bounce a creature you control back onto your library — both wordings were previously
  unreadable, and each now offers only the creatures the card actually allows.
- **"Put any number of cards from your graveyard on top of your library" works.** Footbottom Feast, Bone
  Harvest, Forever Young, Gravepurge and Frantic Salvage now resolve, and the "take all of them" option is
  always offered — the option list used to fill up with small selections and crowd it out.
- **"Put up to N cards from your graveyard on top of your library" works.** Meldweb Curator, Biblioplex
  Assistant, Reinforcements and Treason of Isengard only understood the single-card wording before.
- **Lead Golem and Apes of Rath stay down after attacking.** Their drawback — not untapping on your next
  turn after they attack — was never applied, so both were playing better than printed.
- **The Kamigawa Snake Warriors work.** Kashi-Tribe Warriors, Kashi-Tribe Reaver, Orochi Ranger and
  Matsu-Tribe Birdstalker tap what they damage in combat and keep it down for a turn — that trigger was
  never firing. Frostwalk Bastion's version fires now too.
- **Wall of Frost actually freezes things now.** "Whenever this creature blocks a creature, that creature
  doesn't untap during its controller's next untap step" was never firing — the simulator only knew the
  plain "whenever this creature blocks" wording, so Wall of Frost was a vanilla 0/7. Labyrinth Minotaur and
  Cleric of Chill Depths work too, and blocking two attackers freezes both.
- **Tap-down locks that don't tap now work.** Barl's Cage, Elvish Hunter, House Guildmage and Sleeper Dart
  say a creature doesn't untap next turn *without* tapping it — the simulator only understood the version
  that taps first, so these did nothing. They keep a creature down without touching it, as printed.
- **Creatures that come in damaged now do.** Bloodied Ghost, Wickerbough Elder, Deity of Scars and Etched
  Monstrosity enter with their −1/−1 counters, so they show up at the size the card actually prints.
- **The graveyard recyclers work.** Barkform Harvester, Epitaph Golem, Tomb Trawler and Transplant
  Theorist put a card from your graveyard on the bottom of your library, exactly where it belongs.
- **Lifegain hate works.** Giant Cindermaw, Rampaging Ferocidon and Forsaken Wastes stop *everyone* gaining
  life — including you, as printed — while Erebos and Knight of Dusk's Shadow stop only your opponents. It
  beats life-doublers too.
- **Leyline of Sanctity actually protects you.** Leyline of Sanctity, Aegis of the Gods, Spirit of the
  Hearth and Metropolis Reformer stop opponents targeting you with spells and abilities — while you can
  still target yourself, exactly as printed.
- **The Elder Dragons keep their upkeep bargain.** Palladia-Mors, Chromium, Vaevictis Asmadi, Arcades
  Sabboth and Kuro, Pitlord ask you to pay at upkeep — pay and they stay and the mana is spent, decline and
  they're sacrificed.
- **Squadron Hawk fetches its friends.** Squadron Hawk, Nesting Wurm, Skyshroud Sentinel and Howling Wolf
  search up to three more copies of themselves into your hand, and correctly stop at three.
- **Walls that can buy their way into an attack now can.** Mirror Wall, Returned Phalanx, Wall of One
  Thousand Cuts, Krotiq Nestguard, Glade Watcher and Hightide Hermit can pay to attack for the turn, and
  Skyclave Squid, Steelclad Spirit and Prismari Pledgemage get the same off their triggers. It lasts the
  turn and no longer, and they stay defenders for everything else that cares.

## [0.153.0] - 2026-08-05

### Added
- **The Cohort and Scarecrow cycles work.** Ballynock, Briarberry, Crabapple, Mudbrawler and Ashenmoor
  Cohort get their bonus when you control *another* creature of the right colour — and correctly don't
  count themselves. Watchwing, Blazethorn and Thornwatch Scarecrow, Gearsmith Guardian, Minotaur Tactician,
  Toxic Iguanar, Abzan Kin-Guard and Cliffrunner Behemoth all switch on the same way.
- **The draw-two payoffs work.** Trench Stalker, Spinehorn Minotaur, Eyekite, Tome Anima, Gnarled Sage,
  Foggy Swamp Hunters, Messenger Hawk, Evangel of Synthesis and June the Bounty Hunter all switch on once
  you've drawn your second card of the turn — and switch back off next turn.
- **Monstrous creatures get what they paid for.** Fleecemane Lion gains hexproof and indestructible once
  it's monstrous, and Chillerpillar, Sinuous Vermin and Skittering Crustacean pick up flying, menace and
  hexproof the same way.
- **Goad works.** Shiny Impetus and Coercive Impetus now do what they say: the enchanted creature has to
  attack every combat, and it has to attack somebody *other than you* — unless you're the only target left,
  in which case it comes for you after all.
- **Auras and Equipment that force a creature to attack now do.** Bloodshed Fever, Furor of the
  Bitten, Guise of Fire, Uncontrollable Anger, Mogis's Warhound and Tormentor's Trident all make the
  creature they're attached to swing every combat — and it stops the moment they come off.
- **High Alert, Rolling Stones and Guardians of Oboro turn your Walls loose**, and they keep defender for
  everything else — High Alert still hands them its toughness-for-power damage. Rolling Stones unlocks
  *every* Wall on the table, including your opponents', exactly as it's printed.
- **Walls that are allowed to attack can finally attack.** Ogre Jailbreaker with a Gate out, Skyclave
  Sentinel with a +1/+1 counter, Spire Serpent with three artifacts, Slithering Shade with an empty hand,
  and Geist of the Lonely Vigil, Platypus-Bear, Scuttlegator and Pillar of War when their condition is met.
  They keep defender for everything else that cares about it — Arcades and High Alert still see them as
  defenders and still hand them the toughness-damage bonus.
- **Threshold creatures that give something up now actually give it up.** Childhood Horror, Putrid Imp,
  Dirty Wererat and Frightcrawler get their bonus once you have seven cards in the graveyard *and* stop
  being able to block, exactly as printed. On the other side, Vortex Runner, Nightwhorl Hermit, Jace's
  Sentinel, Cephalid Inkmage and Ichor Synthesizer become unblockable when their condition is met.
- **Graft creatures enter at the right size.** Vigean Hydropon and Simic Initiate are printed 0/0 — the
  graft counters *are* their body — so they now arrive with those counters on them instead of dying the
  moment they hit the battlefield.
- **Act of Treason and every "steal a creature for the turn" card work.** Seventeen of them — Act of
  Treason, Turn Against, Traitorous Blood, Bloody Betrayal, Limits of Solidarity, Portent of Betrayal,
  Sarkhan Vol's −2 and more. You take the creature untapped and hasty, swing with it, and it goes home at
  end of turn exactly as printed.
- **The planeswalker-partner tutors work.** Twenty-six cards — Niambi, Ashiok's Forerunner, Sorin's Guide,
  Visage of Bolas, Angrath's Fury, Tower Winder and the rest — search your library **and your graveyard**
  for the card they name, exactly as printed. Searching only the library would have missed half the card.
- **Goblin Ringleader and friends work.** Reveal the top four, take every Goblin (or Elf, or Zombie, or
  Kavu), bottom the rest — Sylvan Messenger, Grave Defiler, Enlistment Officer, Merfolk Wayfinder and more.
  A Changeling counts as the named type, as it should.
- **Battalion works.** Fourteen cards — Legion Loyalist, Firemane Avenger, Tajic, Daring Skyjek, Haazda
  Marshal — trigger when they attack alongside two others, and correctly do *not* trigger when they stay
  home or bring too few friends. "Whenever you attack with N or more creatures" works too.
- **Inspired works.** King Macar, Pain Seer, Servant of Tymaret and ten more trigger when they untap.
- **Populate works.** Trostani, Growing Ranks, Wayfaring Temple, Sundering Growth and nine more copy one of
  your creature tokens.
- **Learn works.** Fourteen Strixhaven cards can now discard a card to draw one, as the rule allows.
- **Journey to Nowhere and Oblivion Ring work**, along with Faceless Butcher — the creature comes back when
  the enchantment leaves, exactly once.
- **Deathtouch-style fighters work.** Voracious Cobra, Stinkweed Imp and Dripping Dead destroy what they
  damage in combat.
- **Damage-prevention on a creature works.** Squee's Toy, Kei Takahashi, Field Surgeon, Martyrs' Tomb,
  Anoint, Recuperate, Abuna's Chant and Stand // Deliver all say "prevent the next N damage that would be
  dealt to target creature" — the wording the engine didn't take, even though the "any target" version has
  always worked. The shield now absorbs exactly what it should and is spent once used.
- **Blasphemous Act costs what it should.** "This spell costs {1} less to cast for each…" was reducing
  nothing, so Blasphemous Act was asking for its full {8}{R} instead of the {R} it usually costs with a
  board full of creatures. Vanquish the Horde and Overwhelming Remorse were overcharged the same way.
- **Sacrifice-yourself artifacts with a leave trigger work.** Experimental Synthesizer and Mouser
  Foundry can now be played fully: cracking them for their ability also fires their "when this leaves
  the battlefield" trigger, so you get both halves — exactly as printed.
- **Suspend works for the free artifacts.** Lotus Bloom, Sol Talisman and Mox Tantalite — cards with
  no mana cost at all — can finally be played the only way they ever could: suspend them, tick down a
  time counter at each of your upkeeps, and cast them free when the last one goes.
- **Brainstorm works.** The iconic draw-three-put-two-back — and its whole family (Brainsurge,
  Riverwise Augur, Conch Horn, Brainstone, Survivor of the Unseen) — now plays for real: you pick
  which cards go back, one at a time, with later picks landing on top so you control the final
  order. The put-back is not a discard: nothing touches your graveyard and no discard triggers fire.
- **Two-in-one combat tricks work.** Crimson Wisps ("becomes red AND gains haste") and Pym Particles
  ("gains vigilance AND can't be blocked") now apply BOTH halves to the target — they were being
  refused because the shared "until end of turn" got lost between the two effects.
- **Start your engines! works.** The Aetherdrift speed mechanic is real: an engines permanent
  entering gives you speed 1, your speed climbs once on each of your turns when an opponent loses
  life (max 4), and "Max speed —" abilities — mana, battlefield, and graveyard — only switch on at
  speed 4. Six cards (the Surveyor cycle, Hour of Victory) become fully playable, and a real bug
  dies with it: Endrider Catalyzer and friends were handing out their max-speed mana with no speed
  at all.
- **"Return another…" recursion works.** Myr Retriever, Junk Diver, Workshop Assistant, Dutiful
  Attendant, Carrion Thrash, Deadwood Treefolk and Corpse Hauler now correctly return ANOTHER card
  from your graveyard — never themselves. A retriever dying into an empty graveyard simply gets no
  target, exactly as the card reads.
- **Karn knows what you've already committed.** When a deck is locked to a Karn chat, he now sees
  which of its cards you already run in your OTHER saved decks ("Sol Ring — in 4 other decks"), so
  his cut/keep advice can weigh real physical contention, not just what you own.
- **Tibalt's gremlin mode (opt-in, off by default).** When enabled in Settings → Models, Tibalt may
  drop ONE uninvited jab after a deck save or import — and only when the deck's real numbers back the
  criticism (low lands, thin draw, weak ramp…). Hard limits: once per session, six hours between jabs,
  three per week, never the same complaint twice until the stat actually changes, never in the
  Academy, never on a rules answer, never at anyone's first deck, and dismissable with one click. He
  reads the room: ignored jokes make him space himself out further on his own.
- **"That player" spells work.** Five cards — Recoil, Ozai's Cruelty, Compelling Deterrence,
  Frightful Delusion and Dinrova Horror — now correctly figure out who "that player" is: the owner
  of the bounced permanent, the controller of the countered spell, or the player who was just dealt
  damage. Compelling Deterrence's "if you control a Zombie" condition is honored (no Zombie, no
  discard), and a stolen permanent goes home to its real owner, who does the discarding.
- **Voltron creatures know how big they are.** Any creature that grows with what's attached to it now
  plays at its real size — Uril the Miststalker, Kor Spiritdancer, Champion of the Flame, Goblin
  Gaveleer, Loxodon Punisher, Myr Adapter, Rabid Wombat, Graceblade Artisan, Gatherer of Graces and
  Golem-Skin Gauntlets. Auras an opponent put on your creature count too, exactly as the card reads.
- **Creatures that scale off your hand and graveyard work.** Empyrial Armor, Empyrial Plate, All That
  Glitters, Liliana's Elite, Wight of the Reliquary, Salvage Slasher, Madame Hydra, Nettlecyst and
  Benalish Honor Guard now read the right pile — and so do the drawback creatures that get SMALLER as
  your hand fills (Dread Slag, Grim Strider, Stingerback Terror, Geralf's Masterpiece).
- **The Phyrexian oil creatures come down alive.** Necrosquito, Trawler Drake, Evolving Adaptive and
  Exuberant Fuseling are printed 0/0s whose whole body is their oil counters. They now enter at the
  right size and grow as counters land.

### Fixed
- **Auras you put on an OPPONENT's creature now count YOUR permanents.** "For each Swamp you control"
  on an Aura meant the enchanted creature's controller, not yours — so Quag Sickness, the removal Aura
  you play on someone else's creature, was counting THEIR Swamps and doing nothing at all. Same bug on
  Blanchwood Armor, Sigil of the Nayan Gods, Raised by Wolves, Cranial Plating, Pennon Blade and
  Blackblade Reforged. Auras and Equipment on your own creatures were never affected.

## [0.150.1] - 2026-08-02

### Fixed
- **Moxfield deck import works again.** Moxfield's edge (Cloudflare) began refusing the app's bundled
  Node runtime by its TLS handshake, so every Moxfield URL failed with a 403 in the packaged app while
  the same links worked everywhere else. The bundled runtime is upgraded (Node v22.12.0 → v22.23.2,
  current LTS), which restores imports. Archidekt imports were never affected (verified).
- **Import errors stop guessing.** A failed deck fetch no longer tells you to "check the link is
  public" regardless of what actually happened. A 404 points at the link (private, deleted, or
  mistyped); a 403 says plainly that the provider refused the app — and that the link is probably fine.

Also ships the 42 engine cards banked since v0.150.0 (multi-keep impulse digs, the parseEffectClause
bug-class closure, and the slices recorded in the run ledger).

## [0.150.0] - 2026-08-01

### Added
- **The Colossus cycle works.** Darksteel Colossus, Blightsteel Colossus, Progenitus, Legacy Weapon and Nexus of Fate now shuffle themselves back into your library instead of going to the graveyard — and because they never actually die, cards like Blood Artist correctly see nothing.
- **Eight old combat tricks work.** Defiant Stand, Rally the Troops, Scorching Winds, Assassin's Blade and four more can finally be cast — and only when the card allows it: during declare attackers, and only if you were the one attacked.
- **Training, Dethrone, Firebending and Soulshift creatures work alongside their other abilities.** Eleven cards — Parish-Blade Trainee, Rural Recruit, Marchesa's Infiltrator, Tundra Tank, Azula and more — were being held back by a counting mistake, not a missing rule. Three others that were quietly credited while carrying an ability the engine cannot perform have been corrected.
- **Auras with a bonus AND a trigger work.** Elephant Guide, Griffin Guide, Most Wanted, Failed Conversion, Sleeper's Robe, Elder Mastery and five more now do BOTH halves — the buff really applies to the creature, and the trigger really fires. They were doing neither.
- **Aura death triggers work.** Bequeathal and Dying Wail now actually do their thing when the enchanted creature dies — they were silently doing nothing.
- **Graveyard sweeps work.** Wisdom of Ages and Crystal Chimes return every matching card from your graveyard to your hand.
- **Mass graveyard recursion works.** Splendid Reclamation, Replenish, Resurgent Belief, World Shaper,
  Will of the Sultai, Aftermath Analyst and Lumra all return every matching card from your graveyard to the
  battlefield, tapped when the card says tapped. Auras with nothing to enchant stay in the graveyard, exactly
  as Replenish's own reminder text promises. **This takes the Earth Bent deck across the 90% mark.**
- **"Partner with" creatures fetch their partner.** Sixteen cards — Lore Weaver, Ley Weaver, Silvar and
  Trynn, Pir, Cazur, Jenny Flint and the rest — now do what their keyword promises when they enter: the
  targeted player may search their library for the named partner and put it into their hand. The search
  happens in that player's library, and declining to search, or searching and taking nothing, are both
  allowed. (Using a partner pair as two commanders is a deck-building rule, not something that happens on
  the battlefield, so it is unchanged.)
- **Ability-word SPELLS work too.** Seventeen more cards — Kirtar's Wrath, Descend upon the Sinful,
  Traverse the Ulvenwald, Shamanic Revelation and others — whose flavour label hid the spell itself.
- **Cards that can be cast "as though they had flash" work.** Fourteen cards — Rout, Ghitu Fire, Spider
  Climb, Mystic Veil, Soar, Timely Ward, Parapet and more — were held back by a line offering a faster
  way to cast them. The engine plays them at normal speed, which is exactly what it was already doing,
  so the rest of each card now works as printed.
- **Sengir Vampire and friends grow again.** Six creatures — Sengir Vampire, Sengir Bats, Vampiric
  Dragon, Vampiric Sliver, Predator Ooze and Blood Cultist — now remember which creatures they damaged,
  so when one of those creatures dies they get their counter. The memory lasts exactly one turn, as
  printed, and a creature that dies without being damaged by them gives them nothing.
- **Graveyard returns that name two card types work.** Cards returning, say, creature *and* land cards
  from your graveyard now bring back both, instead of only the first kind named.
- **Mass returns to hand work.** Spells returning every matching card from your graveyard to your hand
  now do so.


## [0.149.23] - 2026-07-30

### Added
- **Tamiyo's Safekeeping works.** Targeting one of your own artifacts, enchantments or lands really does
  give it hexproof and indestructible for the turn — it now survives a Disenchant or a wrath.
- **Rally, Morbid, Ferocious, Survival, Hellbent and eight more label styles work.** Another 41 cards
  whose ability the engine could not see — the flavour word in front of it hid the trigger.
- **Alliance, Delirium, Metalcraft and Threshold cards work.** Twenty-one cards whose ability was
  invisible to the engine — the flavour label in front of it hid the trigger — now play as printed.
- **Power-up abilities work.** Fourteen Marvel creatures can now use their power-up — once per game,
  as printed, not once every turn.
- **Reconfigure Equipment works.** Lizard Blades, Rabbit Battery and six more can attach to your
  creatures — and correctly stop being creatures themselves while attached, so they no longer attack
  and equip at the same time.
- **Level Up works.** The enchanted creature's +1/+1 counters really double when it attacks, and the
  bonus card is drawn only when its power actually reaches 10 after that doubling.
- **Byrke, Long Ear of the Law works.** When a creature with a +1/+1 counter attacks, its counters really
  double — the attacker's, not Byrke's.
- **Abhorrent Oculus works.** "Exile six cards from your graveyard" is now paid properly — exactly six,
  and the card stays uncastable with five or fewer in the yard.
- **"Return a land you control" counterspells work.** Deprive, Disappearing Act, Familiar's Ruse,
  Devour in Flames and Fear of Isolation let you pick which permanent goes back to your hand — and stay
  uncastable when you have nothing to return.
- **Spells whose extra cost the engine cannot model are no longer castable for free.** Goblin Grenade,
  Fire Covenant, Firestorm and ~150 others were being cast without paying their additional cost at all.
  They now sit in hand until the engine learns that cost. Costs you *may* decline are unaffected.
- **Creatures with "as an additional cost, sacrifice a creature" no longer cast for free.** Demon of
  Catastrophes, Makeshift Mauler, Stitched Drake and 12 more were being cast without paying their
  additional cost at all. They now charge it, and are not offered when you have no way to pay.
- **"Sacrifice an artifact **or** discard a card" spells work.** Demand Answers, Bitter Triumph and Bone
  Shards now offer you each way to pay and charge exactly the one you pick — and stay uncastable when you
  can afford neither.
- **Topiary Stomper respects its own restriction.** It is not offered as an attacker or blocker until
  you actually control seven lands, and the seventh land frees it the moment you play it.
- **Cards that grant convoke, improvise or prowl now play natively.** Chief Engineer, Inspiring Statuary,
  Ironheart, Clever Champion and Hunting Velociraptor — the engine still hard-casts at full price, so the
  grant only ever added a cheaper option it never takes.
- **Sensei's Divining Top works.** Tapping it draws a card and puts the Top back on top of your library,
  the way it actually plays. Thalakos Mistfolk, Fencer Clique, Wayward Soul and Soaring Hope came with it.
- **Shadowspear works.** Its {1} ability really does strip hexproof and indestructible off your
  opponents' permanents for the turn — so the creature you could not touch becomes targetable and
  killable. Bonds of Mortality does the same for creatures.
- **"During your turn" team buffs now switch on and off correctly.** Anara, Wolvid Familiar, Bedrock
  Tortoise, Bayek of Siwa and Sokka's Charge — your creatures gain the keyword on your turn and lose it
  on everyone else's, exactly as printed.
- **More Auras that do two things now do both.** Ocular Halo, Nurturing Presence and Weirding Wood — the
  Aura's own ability and the one it grants your creature both work at the same time.
- **Auras that both buff and grant now do both.** Pillory of the Sleepless, Compulsory Rest and Utopia
  Vow were silently losing their "can't attack or block" half — the creature they were supposed to pin
  down could attack freely. It applies now, alongside the ability they grant.
- **Rhythm of the Wild grants riot for real.** Your nontoken creatures now enter with the +1/+1 counter or
  the haste, exactly as printed, instead of the enchantment sitting there doing nothing.


## [0.149.22] - 2026-07-30

### Fixed
- **You could put an instant onto the battlefield.** Cards reading "put a permanent card from your hand
  onto the battlefield" — The Ur-Dragon's attack trigger, Flood of Tears, Selvala's Stampede, Kona, Rescue
  Beastie — were offering every card in hand, instants and sorceries included. They now offer only real
  permanents.

### Added
- **Colour-changing spells now work.** Cerulean Wisps, Singe, Fylamarid and Metathran Transport — the
  creature really does turn that colour for the turn, which matters for the "can't be blocked by blue"
  abilities those cards are built around.
- **Protection-granting creatures now work.** Obsidian Acolyte, Crimson Acolyte and Keeper of Kookus — the
  creature you point them at really does gain protection from that colour for the turn.
- **Ninjas with a second ability now play natively.** Sakashima's Student enters as a copy of a creature
  through the engine's own clone path, and Silver-Fur Master's Ninja/Rogue anthem applies, instead of both
  cards handing off to the Arbiter.
- **Artifacts that untap themselves now really untap.** Mana Vault, Staff of Domination, Retrofitter
  Foundry, Summoning Station and Blasting Station — paying the cost actually untaps the artifact, so Mana
  Vault's pay-{4} upkeep escape works and the Station engines can loop.
- **"Gets +1/+1 for each Equipment/Gate/Goblin you control" now counts.** Swordsman's Steel, Militant
  Inquisitor, Gatebreaker Ram, Adelbert Steiner and Raised by Wolves size themselves off the board and
  grow or shrink live, instead of sitting at their printed stats.
- **Regenerating an artifact works.** Welding Jar, Metallurgeon, Loxodon Mender, Pteron Ghost and Reknit
  — the shield really saves the artifact from a Disenchant or a board wipe, once, exactly as printed.
- **Whir of Invention works.** The X-capped search now fetches an artifact card onto the battlefield, the
  same way it already did for creature and permanent fetches.
- **Stoneforge Mystic, Goblin Lackey and Warren Instigator now play natively.** Putting a named-subtype card
  from your hand onto the battlefield — an Equipment, a Goblin permanent, a Goblin creature — works.


## [0.149.21] - 2026-07-30

### Added
- **Panther Pounce and Fateful Absence now work.** The Clue goes to the player the card names, not to you.
- **Poison-counter spells now work.** Prologue to Phyresis, Infectious Inquiry, Infectious Bite, Pistus
  Strike and Ichor Rats — the counters land on the right players and count toward the ten that lose the game.
- **"Its controller" spells now work.** Vapor Snag, Nature's Claim, Last Breath, Assassin's Strike and
  five more — the life loss, life gain or discard lands on whoever controlled the thing you targeted, even
  when that thing is already gone.
- **The Cabbage Merchant now works.** It makes Food off your opponents' spells and loses one when a creature connects with you, as printed.
- **Gluttonous Guest now works.** Its "whenever you sacrifice a Blood token" trigger fires as printed.
- **Creatures that pump themselves and then gain a keyword now work.** Ten more, including Bristling Hydra,
  Fearless Fledgling, Bloodsky Berserker and Syndicate Trafficker — the "it" gets applied to the creature
  itself, as printed.
- **"Untap them" now works too.** Rallying Roar, War Flare, Rally to Battle, Join Shields and Flying Crane
  Technique — the team-wide versions that buff your creatures and then untap the same ones.
- **"Untap it" now works.** Fourteen more cards where a spell buffs a creature and then untaps that same
  creature — Savage Surge, Stony Strength, Vault Skyward, Veteran's Reflexes and friends.
- **"That creature can't block this turn" now works.** Mugging, Blindblast, Duel Tactics, Wrap in Flames
  and Sparkmage's Gambit — including the ones that hit several creatures at once, where every creature the
  spell damaged is the one that can't block.
- **Cards that say "that creature" now follow through.** Seventeen of them, including Rile, Eutropia the
  Twice-Favored, and eight Equipment that attach and then grant a keyword (Coral Sword, Squire's Lightblade,
  Quick-Draw Dagger). The bonus lands on the creature the spell just acted on, and only that one.
- **Hexing Squelcher and Hag of Mage's Doom now work.** The ward they hand out to your other creatures is
  real: an opponent targeting one of them pays 2 life or the spell is countered.


## [0.149.20] - 2026-07-30

### Added
- **Life gain that doubles or adds now works.** Rhox Faithmender, Boon Reflection and The Wind Crystal
  double every life you gain; Angel of Vitality, Heron of Hope, Honor Troll and Knight of Dawn's Light add
  one. With both out, the two combine the way they should.
- **Vexing Shusher now works.** Its "{R/G}: Target spell can't be countered" ability actually protects
  the spell you point it at — the engine already understood printed and board-wide uncounterability, but
  not a one-shot grant.
- **"Whenever you cast a red spell" and its colour siblings now work.** Fifty-two cards, including the
  Talisman / Horn / Tooth / Sphere artifact cycles, Aragorn the Uniter, Warmth, Kor Firewalker,
  Sol'kanar the Swamp King, Nettle Sentinel and Balefire Liege. Colourless spells are handled too, and
  correctly do NOT set off a coloured trigger.
- **Cost reducers with two-part filters now work.** The Banneret cycle (Brighthearth, Ballyrush,
  Frogtosser, Stonybrook, Bosk) discounts both of the tribes it names — and a spell that is both gets
  the discount once, not twice. "Noncreature spells you cast cost {1} less" works too (Longshot,
  Iron Lad, Valeria Richards).
- **Borne Upon a Wind works.** Spells that let you cast at instant speed for the rest of the turn now
  grant that permission properly, and it correctly expires at your next untap step.
- **"Sacrifice a permanent" and its siblings now work.** Drinker of Sorrow, Perilous Research and
  Lorehold Command sacrifice the right kind of thing — previously only "sacrifice a creature" was
  understood when the card asked YOU to sacrifice.
- **Keyword counters can be placed.** Recycla-bird's flying counter works. A counter for a keyword the
  engine cannot actually grant is refused rather than placed, so a card never looks played while doing
  nothing.
- **Conditions that exclude a type now work.** Wildwood Tracker, Fathom Fleet Captain, Reclusive Wight
  and Iron Man read "another non-Human creature", "a nonland permanent" and "an artifact creature"
  correctly — and "nonblue" correctly includes colorless permanents.
- **Planeswalker-specific payoffs work.** Ajani's Comrade, Vraska's Conquistador, Jace's Triumph and
  eight more correctly check whether you control a planeswalker of the RIGHT name — an Ajani card no
  longer counts a Teferi.


## [0.149.19] — 2026-07-30

**92 more cards play natively.** This release batches eight engine slices rather than shipping one per
change. The through-line: wherever two parts of the engine described the same thing in different words,
they now share one vocabulary — board wipes, burn, bounce and removal all read the same creature filters,
and trigger, spell and activated-ability conditions all read the same board questions.

### Added
- **The Desert cycle works.** Sand Strangler, Wretched Camel, Gilded Cerodon, Desert's Hold and four more
  correctly check whether you control a Desert OR have one in your graveyard — the engine now understands
  conditions joined by "or", and "there is a <kind> card in your graveyard".
- **Mass bounce with a filter now works.** Aetherize, Inundate and Part the Veil return exactly the
  creatures the card names — all attacking creatures, all nonblue creatures, all creatures you control.
- **Board wipes that only hit some creatures now work.** Nineteen cards, including Plague Wind, Cleanse,
  Perish, Whirlwind, Sunblast Angel, Extinguish All Hope, Mass Calcify and Planar Outburst. "Destroy all
  creatures you don't control", "destroy all black creatures", "destroy all tapped creatures" and
  "destroy all creatures with flying" now destroy exactly what the card says — previously only
  unfiltered wipes and a few specific filters were understood.
- **One-sided sweeps now work.** Goblin Chainwhirler, End the Festivities, Tectonic Hazard and Wildfire
  Cerberus hit each opponent and everything they control — and correctly leave you and your board alone.
- **Board wipes that also hit planeswalkers now work.** Star of Extinction, Storm's Wrath, Magmaquake and
  Dragonback Assault deal their damage to every creature and remove that much loyalty from every
  planeswalker — and correctly leave players alone.
- **"Non-<type>" removal and sweeps now work.** Thirteen cards in total, including Fiery Cannonade,
  Breath Weapon, Vampires' Vengeance, Walk the Plank, Eyeblight's Ending and Rend Flesh. "Each non-Pirate
  creature" and "target non-Merfolk creature" spare exactly the named type, as printed.
- **Abilities that check a count — your hand, your life, your library, an empty board — now work.**
  Twenty-two cards, including Battle of Wits, Thumbscrews, Scalding Tongs, Emperor Crocodile,
  Lone Revenant, Near-Death Experience, Thopter Assembly and Survival Cache. The engine already understood
  "if you have no cards in hand"; it now also reads "if you have seven or more cards in hand", "if you have
  three or fewer cards in hand", "if you have exactly 1 life", "if you have 200 or more cards in your
  library", "if you control no other creatures", "if your opponents control no creatures" and "if you have
  more life than an opponent".
- **Abilities gated on what happened earlier in the turn now work.** Ten cards, including Nightpack Ambusher,
  Curious Obsession, Seeker of Insight and Mercadian Atlas. Conditions like "if you've cast a noncreature
  spell this turn", "if you didn't attack with a creature this turn", "if you didn't play a land this turn"
  and "if you gained or lost life this turn" are read correctly now.
- **Abilities that check what you control now understand more kinds of "what".** Thirteen cards work, including
  Heidar, Rimewind Master, Rimewind Cryomancer, Celestial Enforcer, Mirror-Sigil Sergeant and Parasitic Strix.
  Conditions like "if you control a creature with flying", "if you control a blue permanent", "if you control
  an artifact or enchantment" and "if you control four or more snow permanents" are read correctly now — and
  the same improvement applies whether the condition sits on a trigger, a spell, or an activated ability.

## [0.149.18] — 2026-07-30

### Added
- **Sweeping damage spells that only hit *some* creatures now work.** Twenty-five cards play properly, including
  **Hurricane**, **Earthquake**, **Squall Line**, **Fault Line**, **Cloudthresher** and **Whipflare**. Previously
  the engine only understood a handful of specific phrasings ("each creature with flying", "each creature your
  opponents control"); it now reads the same filters it already understood for single-target removal, so
  "each nonartifact creature", "each attacking creature", "each untapped creature", "each Human creature",
  "each nonwhite creature" and combinations like "each attacking creature without flying" all resolve.
- Cards that damage every creature **and** every player at once — Hurricane and Earthquake being the famous ones
  — now correctly spare the creatures the card says to spare, while still hitting every player including you.
- Dragons like **Scourge of Kher Ridges** and **Harbinger of the Hunt**, whose ability wipes every *other*
  creature of a given kind, no longer risk hitting themselves.

## [0.149.17] — 2026-07-30

### Added
- **"You may pay {1}. If you do, [do something to a target]" works now.** Twenty-one cards that ask you to pay a
  small optional cost and then hit a target play properly: Surgespanner, Equilibrium, Genesis, Kalastria
  Highborn, Shu Yun, Serene Steward, Frenzied Goblin, Embersmith and more. The target is chosen when the ability
  goes on the stack, as the rules require, and declining the payment simply does nothing.


## [0.149.16] — 2026-07-30

### Added
- **Role tokens work.** Cards that hand a creature a Monster, Royal, Cursed, Sorcerer or Virtuous Role now
  actually create it and attach it, and the creature gets what the Role gives it. Seven cards play properly as
  a result, including Charmed Clothier, Living Lectern and Splashy Spellcaster. If there's no legal creature to
  attach to, no Role is created — as the rules require. The Wicked Role is still set aside until its ability is
  modelled.
- **Young Hero Roles work too.** The creature grows only while its toughness is still 3 or less, exactly as
  printed — once it's big enough, the Role stops feeding it. Cut In, Embereth Veteran and Protective Parents
  play fully as a result.
- **Wicked Roles work, and so do Auras that do something when they hit the graveyard.** All seven Roles the
  game knows about are now playable. Fixing the underlying trigger also freed four unrelated Auras that pay
  off as they die — Audacity, Chime of Night, Mantle of the Wolf and Reach for the Sky — plus Charming
  Scoundrel, Eriette's Whisper and Shatter the Oath. Eighteen cards across the whole Role feature.

## [0.149.15] — 2026-07-29

### Added
- **Adapt creatures play properly — ten of them.** Aeromunculus, Sharktocrab, Skitter Eel, Trollbred Guardian,
  Temperamental Oozewagg, Evolution Witness, Skatewing Spy, Dreamdrinker Vampire, Knighted Myr and Sauroform
  Hybrid can all adapt now. The game respects the catch, too: a creature that already has a +1/+1 counter gains
  nothing when you pay again, and one whose counters have been removed can adapt a second time.
- **Pyrohemia and Pestilence now play themselves.** Both sacrifice themselves at end of turn once the board
  is empty of creatures, and the game now checks that properly — across *everyone's* creatures, not just
  yours, so neither one leaves early while an opponent still has something out.
- **Anthems that skip your tokens work correctly.** Always Watching and Thraben Watcher buff your real
  creatures and leave your token creatures alone, exactly as printed — the game previously couldn't read
  "nontoken" at all and set both cards aside.
- **"Modified creatures you control…" is understood.** The game now knows a creature is modified when it has
  a counter on it, is equipped, or is enchanted by one of *your* Auras — an opponent's Aura doesn't count, as
  the rules require. Envoy of the Ancestors plays fully, and six other cards carrying the same line (Kodama of
  the West Tree, Artillery Enthusiast, Invigorating Hot Spring and others) now only need one remaining piece.

## [0.149.14] — 2026-07-29

### Fixed
- **Refreshing card data works again.** Scryfall changed how it publishes its card database — a new address,
  and the file is now compressed with one card per line. The app's sync didn't understand the new format and
  quietly downloaded *nothing* instead of saying so, which broke "Refresh data" in the app and stopped the
  0.149.13 release from ever being built. Card, ruling and price refreshes all work again.
- **A sync that downloads nothing is now an error, not a success.** That was the actual bug: the old code
  skipped past files it couldn't find a download link for and reported everything as fine. It now stops
  immediately and says which piece of Scryfall's data moved, so the next change upstream takes minutes to
  diagnose instead of an afternoon.

> v0.149.13 was tagged but never published — its build failed on the sync above. Everything listed under
> 0.149.13 ships in this release.

## [0.149.13] — 2026-07-29

### Added
- **Mana sources whose cost is more than tapping now work.** Springleaf Drum, Jaspera Sentinel, Loam Dryad,
  Heritage Druid, Birchlore Rangers and Baylen ask you to tap another creature; Staff of Compleation, Standing
  Stones, Blood Celebrant and Vesper Ghoul ask you to pay life. The game used to refuse all of them rather than
  hand out mana it hadn't paid for. It now pays the real cost — it taps the creature, or loses the life — and
  won't offer the source at all when you can't afford it.
- **Jeweled Lotus, Herd Heirloom and 32 other restricted-mana cards are playable.** Their mana is earmarked
  ("spend this only to cast your commander"), and the game now honours that instead of setting the card aside.
  It also refuses to launder the restriction — three commander-only mana can't be spent on a one-mana creature
  to leave two general mana floating.
- **Removal that drains now drains.** Hideous End, Sip of Hemlock, Certain Death, Despoil, Undermine,
  Countersquall and nine others: the removal always worked, the "its controller loses 2 life" half was what
  stopped the card.
- **Kicked spells that get bigger.** Burst Lightning, Shivan Fire, Roil Eruption, Might of Murasa and Gift of
  Growth now deal or pump the kicked amount *instead* of the printed one, rather than both.
- **Aftermath split cards** (Claim // Fame, Farm // Market, Never // Return and four more), **outlast**
  creatures (Abzan Falconer, Ainok Bond-Kin and six others), and **escalate** spells (the Borrowed cycle,
  Collective Resistance).
- **Spells that exile themselves** — Temporal Trespass, Time Reversal, Treasured Find, Game Plan and three
  more. They go to exile now, not the graveyard, which matters for everything that counts your graveyard.
- **Tribal lords that name several creature types at once** — Death-Priest of Myrkul, Ultron, The Swarmweaver,
  Master Trinketeer — plus April O'Neil and Valley Mightcaller, whose triggers watch a list of types.
- **Bounce spells can now target planeswalkers**, and Sever Soul / Divine Offering / Serene Offering pay you
  the life they promise.

### Fixed
- **Squad creatures no longer stall the game with an ability they don't have.** Roadkill Rodney, Wasteland
  Raider and Securitron Squadron were being read as though the explanatory text in brackets were real rules
  text, so the game kept handing their arrival off to the rules engine for a token-copying ability that only
  exists if you actually pay the squad cost.

## [0.149.12] — 2026-07-28

### Added
- **Auras that do something when the creature they're on dies now work.** Elephant Guide, Griffin Guide,
  Bequeathal, Dying Wail and friends — the game simply wasn't noticing the death.
- **Auras that both buff a creature AND have a triggered ability are now understood as a whole.** Cards like
  Elder Mastery, Sleeper's Robe, Recumbent Bliss and Mark of Fury each had both halves working individually,
  but the game refused the combination and handed the card off. Twelve more Auras are playable.

## [0.149.11] — 2026-07-28

### Added
- **Creatures that react to getting +1/+1 counters now work.** Herd Baloth, Scurry Oak, Generous Pup and
  Dusk Legion Duelist were all sitting idle — the game never noticed counters landing on them. It now does,
  including counters a creature is given *as it enters the battlefield*, which the rules count the same way.
- **Abilities that trigger only once per turn are recognized.** Cards reading "this ability triggers only
  once each turn" were stuck on that one sentence even though the game already enforced the limit correctly.

### Notes
- Two of these cards can, together, form a genuine endless loop — that's a real Magic interaction (the rules
  call such a game a draw), not a bug in the card. No saved deck holds both.

## [0.149.10] — 2026-07-28

### Fixed
- **Tokens that come with an ability now actually get it.** Eldrazi Scion and Spawn tokens, the Devil tokens
  that ping when they die, and Llanowar Mentor's Elf Druid — the game was creating these as blank bodies, so
  a Scion could never be sacrificed for mana and the AI never ramped off one. 16 more cards are playable.
- **A card that made one of those tokens could be misread as a mana source.** If the token's own ability said
  "Add", the game mistook that for the card's ability and then couldn't use the card at all.

### Notes
- One card (Drowner of Hope) was briefly credited as fully playable while still carrying an ability the
  engine doesn't model. Caught and corrected in the same session — it's back with the Arbiter, where it
  belongs. A card the engine skips is safe; a card it plays wrongly is not.

## [0.149.9] — 2026-07-28

### Added
- **Lander, Mutagen and Junk tokens now work.** Cards that make one were previously stuck — the game knew
  the six older tokens (Treasure, Clue, Food, Gold, Blood, Map) but not these three, so 18 cards sat unplayable
  over a token it couldn't mint. Each now enters as a real artifact you can actually use: Lander fetches a
  basic land, Mutagen puts a +1/+1 counter on a creature, Junk exiles the top card of your library to play.
- **"Whenever a commander you control deals combat damage to an opponent" now triggers.** Kediss, Emberclaw
  Familiar works — and it correctly checks that the creature that connected *is* your commander, rather than
  firing off any creature you control.

### Changed
- **Deck coverage rose to 1,259 of 1,597 slots** across the saved decks.

### Notes
- A Powerstone token is still deliberately left unsupported. Its mana can't be spent on nonartifact spells,
  and the game can't yet track that restriction — so rather than hand you mana that ignores the card's own
  rule, cards that make one are routed to the Arbiter.

## [0.149.8] — 2026-07-28

### Fixed
- **Mana Vault, Basalt Monolith and Grim Monolith were completely dead.** Not mis-costed — the game offered
  no ability on them at all, so three of the most recognizable fast-mana artifacts in the format sat on the
  battlefield doing nothing. A guard meant for lands that don't untap was catching them too.
- **Abilities that say "activate only before attackers are declared" were being offered after combat.** The
  game's activation window covered both main phases, and the second one is, by definition, after attackers.
  Those abilities are now restricted to the first main phase, as printed.

### Added
- **Boast abilities now work** — the ones reading "activate only if this creature attacked this turn." They
  correctly track *which* creature attacked, not merely whether you attacked at all, so boasting is limited
  to the creature that actually went in.
- **"Activate only if ..." conditions are now read live off the board.** Seven cards in your graveyard, a
  creature having died this turn, an empty hand, an opponent's poison counters, four card types in your
  graveyard, your creatures' total power, and whether you control the biggest creature on the table.
- A condition the game cannot read still hands the card to the Arbiter rather than guessing at it. A card
  the engine skips is safe; a card it plays wrongly is not.

### Changed
- **Deck coverage rose from 78% to 79%** across the saved decks — Wolverine, Hulk Smash and Halfshell heroes
  each gained ground.

## [0.149.7] — 2026-07-28

### Fixed
- **A tutor that finds nothing no longer ends the game.** Searching your library and coming up empty is a
  perfectly legal outcome — you reveal, shuffle, and carry on. Instead, the game was asking you to pick a
  card from an empty list, which you can't answer and can't escape: the game simply stopped. It was
  happening in roughly one game in sixteen. Found by playing 150 games start to finish and looking at
  every one that didn't reach an ending.

### Added
- **Tibalt can now be allowed to interject uninvited** — off by default, per profile. He only speaks after
  something finishes (a deck saved, an import completed), never while you're mid-question, never in the
  Academy while you're learning, never on a rules answer, never after a game you just lost, and never on
  someone's first deck. He also won't make the same joke twice about a problem you haven't fixed, and if
  you ignore him he gets quieter on his own.

## [0.149.6] — 2026-07-28

The guides sound like themselves now, and the keeper has a name.

### Added
- **Digby.** The gentleman who minds the front hall has a name and a voice — warm, weathered, dryly
  funny, and still purely a concierge: he asks what you're trying to do and shows you to the right
  wing. He never answers a Magic question himself.
- **Every guide shares one set of house rules.** Karn, Jace, Teferi, Vihaan and Tibalt each speak in
  their own register but inherit the same conduct: never invent card behaviour, a rule number, or a
  number of any kind; say plainly when the data isn't there; correct you when you're wrong rather than
  agreeing to be pleasant. One shared core, so the faces can't drift apart into contradicting each other.
- **Cards can be marked as candidates rather than committed.** Groundwork for the bench: a card can sit
  in a deck as "considering" without counting toward your 100. Existing decks are completely unaffected —
  everything you already own counts exactly as it did before.

### Fixed
- **Mana Vault, Basalt Monolith and Grim Monolith were doing nothing.** The game offered them no ability
  at all — you couldn't tap them for mana. They work now, and correctly stay tapped instead of untapping
  each turn.
- **Four guides no longer point you at a room that's being removed.** Their "that's not my lane" replies
  named the old Agents room; they now name the bench directly.

## [0.149.5] — 2026-07-27

### Fixed
- **Creatures that do something on the battlefield *and* something from your graveyard now play natively.**
  Magma Phoenix, Teacher's Pest, Valiant Veteran, the Soul cycle and others were being handed off purely
  because they had one ability of each kind — each ability worked on its own, but the two together were
  read as too much for the game to handle. They aren't: the battlefield half works while the creature is
  in play, the graveyard half works from the graveyard, and they can never both apply at once.

## [0.149.4] — 2026-07-27

### Changed
- **Devour and amplify creatures play natively.** Both let you sacrifice or reveal cards as they arrive to
  get counters — and choosing to do neither is a real, legal play, which is what the simulator does.
- **Split cards with fuse now play.** Both halves are offered from your hand, exactly as on any other
  split card.

### Fixed
- **Aftermath cards no longer get handed off wholesale.** The front half plays from your hand as printed,
  and the aftermath half is correctly never offered from hand — it's a graveyard-only cast, and offering
  it would have been an illegal play.

## [0.149.3] — 2026-07-27

Another ~60 cards play themselves, and two combat keywords that were being ignored now work.

### Changed
- **More keywords stop being a reason to hand a card off.** Enlist, extort, assist, casualty, provoke and
  ripple all offer you something you can simply decline — and declining is a real, complete play. The
  simulator plays those cards at full price, which is exactly what happens when you don't take the option.

### Fixed
- **Unleash creatures can't block once they carry a +1/+1 counter.** The restriction is checked against the
  creature's counters as blockers are declared, so it applies no matter where the counter came from — not
  just the one the card offers you on the way in.
- **Training works.** A creature with training now gets its +1/+1 counter when it attacks alongside a
  bigger creature — and correctly gets nothing when the bigger creature stays home.

## [0.149.2] — 2026-07-27

More of your deck plays itself. Around 60 more cards are handled natively instead of being handed off,
and three rules the game was printing but ignoring are now enforced.

### Changed
- **Keywords that only ever *cost* you something are no longer a reason to hand a card off.** Delve,
  replicate, fuse, squad and myriad all give you an option you can simply decline — and declining is a
  real, complete play. The simulator plays those cards at full price, which is exactly what the card
  says happens when you don't take the option.
- **Crucible of Worlds and friends work.** "You may play lands from your graveyard" is now offered as a
  real play. It still costs your land drop for the turn and still needs to be your main phase — the
  permission changes where the land comes from, nothing else.

### Fixed
- **"Creatures your opponents control enter tapped" now applies to the right things.** Cards like
  Imposing Sovereign and Manglehorn name a specific kind of permanent (creatures, or artifacts), and the
  game now respects that instead of treating every such effect as covering everything.
- **Dethrone works, and works correctly in a multiplayer pod.** The creature only gets its counter when
  you attack the player who's actually ahead — if *you're* the one on the throne, nobody gets dethroned.
- **A creature that can't be blocked by smaller creatures is now actually hard to block.** "Creatures
  with power less than this creature's power can't block it" was being ignored. The comparison uses
  current power on both sides, so counters, Auras and Equipment all count.

## [0.149.1] — 2026-07-27

A grind release: more of your deck plays itself correctly, and the coverage number got more honest
rather than bigger.

### Changed
- **More of your deck plays correctly in the simulator.** Several hundred more cards are handled natively
  instead of being handed off, including the mobilize, backup, renown, bloodthirst, dredge, firebending
  and split second keywords,
  delayed "at the beginning of the next end step" abilities, and creatures that sacrifice themselves when a
  condition stops holding.
- **The coverage number is stricter, and lower, on purpose.** A card only counts as a native mana source now
  if the game can actually produce its mana. Around 140 cards that said "Add {G}" in their text but whose
  mana the engine could never reach — ones needing a sacrifice, a chosen colour, or an amount that varies —
  no longer count. Nothing about your decks changed; the number simply stopped over-promising.
- **Faster first card lookup after launch.** The card and rulings indexes now warm up in the
  background right after the app starts, so the first thing that needs them (a chat, opening a deck,
  the coverage view) doesn't pay the load. Non-blocking — it never delays the window from appearing.

### Fixed
- **The simulator was casting some cards for free.** Cards with no printed mana cost, meant to be played
  only through a special mechanic — Ancestral Visions, Crashing Footfalls, Wheel of Fate, Profane Tutor and
  their kin — could be cast with no lands at all, repeatedly, on any turn. They are correctly uncastable now.
- **An animated land could attack but could never be targeted.** A land turned into a creature could attack
  every turn while no removal in the game could point at it — an attacker nothing could answer. Targeting now
  agrees with combat about what counts as a creature, which also fixes a family of effects that silently did
  nothing to such creatures (counters, shields, explore, and several "that creature" effects).
- **An Aura that returns itself to your hand now actually does.** Cards like Mark of Fury reached their end
  step, the ability resolved, and the Aura just stayed put.
- **Mana that's meant to last through combat now does.** Attacking with a firebending creature makes red
  mana the card says lasts until end of combat — it now survives to the end of combat instead of
  disappearing the moment the attack step ends, and it correctly disappears after.
- **A spell with split second now actually stops responses.** While one is on the stack, nobody can cast
  spells or activate abilities that aren't mana abilities — including you. Previously the restriction was
  printed on the card and ignored by the game.
- **"Creatures with power less than this creature's power can't block it" is now respected.** Attackers
  carrying that line were being blocked by creatures too small to legally block them. The comparison uses
  current power on both sides, so counters, Auras and Equipment all count.
- **A single "Scryfall bulk" data sync now rebuilds its derived indexes.** Refreshing just the
  Scryfall bulk data (rather than "everything") used to leave the slim oracle index and the
  collection printings index pointing at the old data until the next full sync. That single-action
  sync now rebuilds both automatically, and reports a clear failure if a rebuild doesn't complete
  instead of quietly claiming success.

## [0.149.0] — 2026-07-23

The game finally lets you mulligan. Free-play in the Academy now opens with your seven cards and a
real keep-or-ship call — the one thing a proving ground can't be missing.

### Added
- **Mulligan on the human path (free-play London mulligan).** Starting a game in the Academy's
  Learn-to-Play now deals your opening seven and lets you decide before the game begins: keep it,
  or ship it back for a fresh hand (CR 103.5 London). When you keep after mulliganing, you choose
  exactly which cards go to the bottom — a real fanned hand with a tap-to-pick bottom step, not an
  automatic guess. Closes the one real playability gap from the first live 4-player session (a dead
  opening hand with no recourse). Fully local; the AI seats keep their sevens.
- **Turn-1 draw note in 4-player games.** A one-line reminder now appears on your first turn of a
  Commander game: in games with more than two players the starting player *does* draw on turn 1
  (CR 103.8c), so an 8-card opening hand is correct — not a bug.

### Changed
- **Eliminated players now read "☠ Eliminated"** in the seat strip instead of a raw negative life
  total (e.g. "-4 life") while a dead seat lingers in a free-for-all before it's cleared.
- **The "Expert" difficulty is now labelled "Autopilot"** with clearer copy — the engine plays the
  whole game itself and you review afterward — so it no longer reads as a harder version of manual play.

## [0.148.0] — 2026-07-19

The whole app moves into one visual and structural language — "jewel & machine" — with a room
guide riding every zone. This is the release where the house becomes a house.

### Added
- **The Vault dashboard, rebuilt twice over.** The collection's front door is now a live room:
  unique-printings / vault-value / weekly winner-and-loser tiles with honest empty states, a
  DAILY grail case (one big-dollar chase standing center, four provenance picks flanking it,
  rotating every day, with real mirror-floor reflections under the cards), a gridded value chart
  with first/peak/now margins, and a full-width collection ledger: full set names (long ones read
  qualifier-first, e.g. "Special Guests - Lost Caverns"), exact collector numbers, one line per
  owned finish — and every foil named for what it really is (Surge Foil, Halo Foil, Oil Slick…)
  straight off the printings data, never guessed.
- **Room guides — an AI rail in every zone.** Vihaan keeps the Vault (value, movers, grails),
  Teferi keeps the Crucible's records, Jace teaches in the Academy, and Karn runs the Foundry
  bench — each with their real card art, live room data grounding their answers, and strict lane
  discipline: a deck question asked in the Vault gets walked to Karn, not answered out of lane.
- **THE KEEPER.** The front hall has a butler now — a non-Magic gentleman who greets you on the
  landing, knows what's in every wing (live numbers ride the zone doors themselves), and walks
  lost visitors to the right room. He never answers Magic questions; he knows whose job that is.
- **THE FOUNDRY — a new zone for building decks.** Karn's workshop: the bench lists every work in
  progress with its color pie, commander, and locked-card count toward 100 (the commander is
  always lock #1), one green "Start a new deck" button, and URL import verified working against
  live Archidekt lists.
- **OMNATH'S ZONE.** The old Agents page is gone; its slot in the bottom bar now belongs to
  Omnath — one tap opens a straight conversation with the house's companion (Hearth register by
  default, Roil when the game demands), and the app now boots into his chat.
- **Today's Trial** in the Academy: one real judge case per day (verdict sealed until you take
  it), beside the 500-case corpus and its difficulty ladder.
- **The Crucible's front door is a dashboard**: games recorded, last table, win rate with the
  actual W–L, and the recent-tables ledger — all off the real archive.

### Changed
- **Every room wears the same machined register**: chrome room titles in a new engraved display
  face, machined glass panels with corner brackets and baked specular light, card faces that glow
  before their art loads (a card is never a black rectangle), and a strict motion law — nothing
  in the interface blinks, pulses, or loops; motion only answers your hand or plays once on entry.
- **Halls, not Rooms**: each zone's inner spaces live in a "Halls ▾" switcher in its masthead
  (and the dropdown no longer hides behind the tiles).
- **The landing icons are green scans of real objects** — crossed swords, an open book, a real
  anvil, a bank-vault door — replacing the pixel art.

### Internal
- The jewel & machine kit is now LEYLINE system CSS with an enforced decorative-loop allowlist;
  the rail is one config-driven component (`RoomRail`) every guide rides; render gates pin each
  room's masthead, guide, material, and zero-loop invariants.
- **The engine can no longer quietly grow roots into the Windows shell.** A new structural guard
  (`src/lib/enginePortability.test.js`) walks the durable engine surface — the rules/play engine,
  the server-side data layer, the API routes, and everything they transitively import — and fails
  the build if any of it reaches Tauri, either by importing `@tauri-apps/*` or by touching the
  `window.__TAURI__` / `__TAURI_INTERNALS__` / `tauri://` globals. That boundary was already clean,
  but only by accident; it is now enforced, so the app stays portable to a non-Windows box instead
  of drifting one PR at a time. The engine/shell line is written down in
  [PROJECT-SCAFFOLD §2.3](docs/orchestration/PROJECT-SCAFFOLD.md).

## [0.147.0] — 2026-07-18

### Fixed
- **The Academy play loop no longer freezes.** Playing against the engine could stop dead at the end
  of your first turn with nothing on screen to click. The rules engine had correctly started asking
  you to discard down to your maximum hand size (CR 514.1), but the app had no way to show you that
  question — so the game simply waited forever for an answer you couldn't give. Because that check
  happens every single turn, it hit essentially every game.
- **Seven more decision types could freeze a game the same way** and are now playable: choosing a land
  to put onto the battlefield, distributing counters among your creatures, optional draw-then-discard,
  paying a discard as a cost, "sacrifice this unless you pay", paying a tax on an opponent's spell
  (Rhystic Study and friends), and choosing how to pay an edict. Each one now gets a proper prompt.
  The "sacrifice unless you pay" prompt deliberately names what you lose on the decline button, since
  that is the one where a misread costs you a permanent.
- **Tokens created by a triggered ability keep the abilities they were printed with.** A trigger
  reading *create a token — it has "…"* was dropping the quoted ability, so the game made a plain
  vanilla token instead: Eldrazi Scions and Spawn couldn't be sacrificed for mana (so the AI never
  ramped off them), and Deathpact Angel's token silently lost the reanimation that is the whole point
  of the card. 22 cards now play as printed; anything whose granted ability still can't be modeled
  now routes to the Arbiter instead of quietly playing it wrong.

### Added
- **The Academy gains "Mulligan Reps"** — a hall for practising the call that starts every game. It
  deals you a real opening seven from your own decks, fanned like a held hand, and you call Keep or
  Ship with no hint from the engine. Hands outside two-to-five lands are silently re-dealt so you
  never burn a rep on an auto-ship, there's a note box for your reasoning, a flag for hands that
  shouldn't have been dealt at all, and a running count of how many you've judged.

### Changed
- Coverage reporting now prints every tier it can classify. Two internal tier lists had drifted apart,
  which meant one whole category never appeared in any breakdown.

## [0.146.0] — 2026-07-17

### Added
- **+398 more cards join native rules coverage** (corpus 32.85% → 34.01% — 11,619 of 34,161),
  from a day-long census-driven grind: a fresh whole-corpus body-only census ranked the veins,
  then 23 engine slices mined them in parallel, each desk-audited with a tier-fingerprint flip-diff
  proving zero native regressions. The headline additions, grouped:
  - **"As long as" conditional statics** — live board-condition gates re-evaluated every derive:
    group anthems (Divine Sacrament, Jetmir) and self-buffs (Serra Ascendant, Adanto Vanguard,
    Tarmogoyf-kin thresholds) keyed to life totals, hand/graveyard counts, poison, metalcraft,
    attach state, your-turn, and planeswalker-type — 100+ cards across the two halves.
  - **Characteristic-defining power/toughness** — the `*/*` creatures (Tarmogoyf, Maro, Lhurgoyf,
    Multani) now compute their real P/T in the correct layer sublayer, with counters and pumps
    stacking on top; this also closed a latent bug where they classified native but played as 0/0.
  - **Trigger scopes** — each-player's-upkeep, blocks/becomes-blocked, attacks-alone, the end step,
    artifact-into-graveyard, and cast-quality filters (historic, multicolored).
  - **The aura program** — the enchant→attach→grant→falls-off pipeline extended across pump+keyword
    riders (Runemark cycle), pacifism-locks and can't-activate restrictions (Arrest — closing a
    mana-tap leak), aura-own regeneration, and aura-own triggered abilities (Curiosity, Sigil of Sleep).
  - **Combat** — set-level "can't be blocked by fewer than N" (fixing a menace two-blocker wedge),
    multi-block with correct CR 510.1d damage division, must/can't-attack-unless, static damage
    prevention (Fog Bank takes and deals zero and survives blocking a 6/6).
  - **Counters & keywords** — remove-N-counters activation costs (the Thallid tribe), enters-with
    counter-kind and conditional (morbid/raid) extensions, proliferate count generalization,
    connive and suspect, kicked keyword grants.
  - **Tokens** — quoted dies-triggers and plural mana-token boundaries.
  - **Spells** — count-scaled magnitudes ("deal/gain equal to the number of…"), and a flashback
    graveyard-recast + mandatory-exile capability (runtime foundation for jump-start/retrace).
- **Fixed a full-suite test flake** — a self-play seating test that failed only under parallel
  load. Root-caused as a spurious timeout under multi-suite CPU contention (the engine was proven
  deterministic by a 960-game same-seed probe); removed the last entropy source from the id path
  and added load-independent determinism pins.

## [0.145.0] — 2026-07-17

### Added
- **+674 more cards join native rules coverage** (corpus 30.87% → 32.85% — 11,221 of 34,161),
  harvested from an overnight fleet of build agents and finished slice-by-slice at the desk —
  53 engine mechanics, every one audited line-by-line with a tier-fingerprint flip-diff proving
  zero native regressions (a card that already played correctly never started playing wrong).
  The headline additions, grouped:
  - **New subsystems** — **Soulbond** (real pairing state with ETB auto-pair, a layer-driven
    bond grant, and teardown closed on both leave and control-change); **Level up** (level
    counters with banded characteristics per level); **Sliver group grants**; the **Ordeal**
    attack→counter→threshold-sacrifice→payoff cycle; **Modular** (dies, move its +1/+1 counters).
  - **Combat math** — double/triple combat damage (modeled on the CR 614 replacement seam so
    trample still distributes correctly); toughness-assigns-damage (the Doran family); saboteur
    combat-damage-to-a-player payoffs; the "can't be blocked **except by** flying/color" evasion
    inverse; single-sided can't-attack/block-alone.
  - **Anthems & statics** — anthem **subject-filters** (legendary / colorless / multicolored /
    non-⟨color⟩ / tapped / untapped, layer-aware with a live tap-state read); **global
    each-creature** anthems and debuffs (Bad Moon, Crusade, Ascendant Evincar's two-sided
    buff/debuff); source-gated group anthems (level bands, hellbent); equipment/aura grants
    including ward {N}.
  - **Triggers** — a becomes-tapped self event; dies/leaves-the-battlefield scopes;
    attacks-triggers with non-self attacker scopes; cast/copy/draw-count triggers (**magecraft's
    copy half** now fires, Flurry's second-spell, typal cast-draw); ETB support-N and
    source-excluding board sweeps; intervening-if conditions (monarch, opponent-lost-life,
    hellbent, a creature died under your control).
  - **Library, graveyard & loyalty** — reorder-top and impulse-exile with duration-first
    anchors; reveal-top-conditional and look-at-top dig; top-card take-or-leave (Dryad
    Greenseeker, Domri +1); filtered graveyard reanimation; damaged-player reanimation
    (saboteur graveyard theft); planeswalker loyalty abilities (reanimate-by-MV, untap-N-lands,
    destroy-by-power).
  - **Counters, keywords & mana** — counter-predicate dies/attacks payoffs; counter
    multiplication (self-scope, Mowu); bolster-N and endure-N; a life-gained-this-turn ledger;
    the nonland mana doubler (Kinnan-class); snow {S} mana from snow sources.
  - **Random effects** — a **seeded RNG primitive** underpinning random discard, so shuffle- and
    coin-flip-adjacent effects resolve deterministically and reproducibly instead of parking.
  - **Spell riders** — conditional "if ⟨board⟩" riders in both leading and trailing positions.

## [0.144.0] — 2026-07-16

### Added
- **+27 more cards join native rules coverage** (corpus 30.8% → 30.87% — 10,547 of 34,161).
  Five engine mechanics, harvested from the overnight build agents and finished at the desk:
  the **Gustcloak escape** (all five Gustcloaks — "Whenever this creature becomes blocked, you
  may untap it and remove it from combat", with its blockers correctly stranded dealing
  nothing), the bare **controller edict** ("sacrifice a creature" as an ability's effect —
  Inevitable End, Smothering Abomination, Daemogoth Titan and 11 kin, including the
  "you may sacrifice… When you do…" reflexive forms where declining correctly cancels the
  payoff), **Mana Flare** and its three twins (every player's land taps produce one extra
  mana of the same type — a dual under Mana Flare makes WW or UU, never one of each),
  **lifegain-scaled counters** (Sunbond / Light of Promise / Ageless Entity), and a
  reminder-text fix that admits **Oracle's Insight**. Every addition passed a by-name audited
  flip-diff with zero coverage regressions.

## [0.143.0] — 2026-07-16

### Added
- **+729 more cards join native rules coverage** (corpus 28.7% → 30.8% — 10,520 of
  34,161 cards now resolve natively), capping a one-day, 66-slice engine campaign of
  +937 total that includes the overnight pass below. The headline mechanics:
  **extra turns** (Time Walk / Temporal Manipulation / Second Chance), **madness**
  credited on permanents and auras (+21), **lure** and its this-turn/targeted
  variants (the long-parked block-requirements lane — blockers are now
  force-assigned to a lured attacker), **riot**, **mentor**, **afterlife**,
  **devoid**, the first **end-of-combat delayed-trigger queue** (Deathgazer's
  basilisk touch), same-name mass pump/debuff (Bile Blight kin),
  graveyard-to-bottom and graveyard-shuffle-in recursion, land tuck, power-filtered
  exile, mass land animation (Nature's Revolt), single-target base-P/T sets
  (Diminish), until-end-of-turn quoted-ability grants (Feign Death), Null Rod's
  full activated-ability lockdown, and Vivien Reid running as a native planeswalker.
  Every slice passed the full gate before landing: suite green, lint clean, and a
  by-name audited flip-diff with zero coverage regressions.
- **+208 cards join native rules coverage** (corpus 28.05% → 28.7%) across 14 engine
  mechanics shipped in one overnight pass: targeted mill (Tome Scour / Millstone / Jace
  Beleren's ultimate), the Rebel/Mercenary recruiter tutors + Zur the Enchanter,
  Background grants to commanders (+ Bastion Protector), soulshift, Syncopate-style
  soft-counter-with-exile + counterspell mill riders, the sea-monster "can't attack
  unless defending player controls an Island" restriction, Goblin Tunneler-style
  power-capped unblockability, Orcish Artillery self-hit pingers, Rabid Elephant
  per-blocker pumps, the Pacifism aura class, the modern "Activate only once each turn"
  limiter (Rootwalla frame), exalted, graveyard-activated self-recursion (Reassembling
  Skeleton class — the engine's first graveyard-zone activated ability), and
  "During your turn" self-buffs. Every addition passed a by-name audited flip-diff with
  zero coverage regressions.
- **The Showpiece Shelf** — The Stacks finally feels like a vault. A shelf of your treasure
  opens the surface: every provenance-flagged card (signed, artist proof, altered, or
  showcase-pinned) plus your top few cards by value, rendered large under the glow. In the
  grid below, flagged cards carry a glow ring and a ★ chip so your showpieces stand out from
  bulk at a glance. Bulk stays exactly as compact as before.
- **The Trophy Page** — a showpiece opens full-page instead of in the edit drawer: hero art
  banner, the card large, provenance rendered as a plaque (who signed it, where, when), current
  worth with the price trend, your physical copies with paid/acquired, and your notes. "Edit
  details" opens the familiar drawer right beside it; the drawer's ★ Showcase toggle is still
  the promotion pin.
- **The Census** — the Ledger split in two. The Ledger keeps the money (value, movement,
  movers, alerts); the new Census door holds the counts (composition, mana curve, rarity, top
  sets, most-valuable, the value chart). The Vault kiosk now has six doors, and the Census
  door's pane shows your biggest color share live.

### Changed
- **The Stacks header slimmed down** — only "+ Add card" and "Import CSV" stay top-level;
  everything else (binder view, select mode, color tags, CSV export, the roast) lives in one
  ⋯ menu. Deliberately reversible: what you use earns its way back.
- **The Gallery joined the family** — it now rides the same Vault shell as every other door
  (header, counts, back button) instead of being its own standalone page.

## [0.142.0] — 2026-07-15

### Added
- **The Reflecting Pool** — The Post-Mortem grew into the full per-deck review dossier and took
  its true name. Pick a deck off the shelf and read its whole story on one card: the record up
  top, a key-facts strip (typical game length, what turn its wins end, what turn it dies, how it
  usually closes, how often the commander comes down), and two honest mirrors side by side —
  **what wins you games** and **what loses you games**. The win side is new: the same lift
  honesty as the loss miner, sign flipped (a pattern genuinely more common in wins than losses
  is a winning line worth leaning into — commander down early, a kept seven, a fast close, a
  signature finish). Both rates shown on every bar; a column with no clear pattern says so
  instead of inventing one. Live on the full grind history.
- **Deck-version stamp in the grind record** (foundation for living deck history). Every new
  grind game now records an exact-to-the-card fingerprint of each deck in the pod — every copy,
  basics included, commanders and companion — so a future update can show how a deck's results
  changed after you swapped a card. Forward-only: old games simply carry no stamp.
- **▶ Watch the highlight.** The Crucible's post-run highlight reel grew a play button: facts tied
  to one specific game — the fastest close, the longest grind — now carry **▶ Watch it**, which
  re-runs that exact game (same seeds, so it's the identical game, cross-checked against the
  recorded result) and opens a turn-by-turn play-by-play you can step through: mulligans, land
  drops, casts, the 25-creature alpha strike, who died to what. The narration filters the
  bookkeeping and names decks, not seat numbers. Aggregate facts (the crown, the win-con mix)
  have no single game behind them, so they honestly don't get a button.
- **The Living History** — the payoff of the version stamp, live in each Reflecting Pool dossier.
  Every version of your deck the grind has seen becomes an era: its exact card changes by name
  ("+ Last March of the Ents · − Noxious Newt"), its record, and — only when the numbers can
  honestly back it — how the win rate and the win/loss patterns moved after the change. Honesty
  is structural: a delta only appears between two tracked versions when both carry enough games
  and the change is bigger than sampling noise, and the era before version tracking (a mix of
  old engine versions and pilots) never anchors a comparison. Games played before this update
  still show as their own "before version tracking" era with their record intact.

### Changed
- Generic "damage" finishes no longer masquerade as a win pattern: the real data showed the
  unspecified-damage bucket topping every deck at 80–97%, which coaches nothing. It now lives
  honestly in the facts row ("damage / drains"); only specifically-stamped finishes (commander
  damage, poison, decking, a win-the-game effect, burn, combat) can earn a pattern line.
- **The A/B bench now tells you when a card isn't fully modeled.** A card the sim can't fully
  play (its rules text never fires — it still attacks and blocks as a body) used to read as
  "no effect", which looked like a verdict on the card. The bench now checks both cards up
  front and shows a plain warning naming the not-fully-modeled one, framing the result as a
  partial read instead of letting the silence lie.
- Grind-store hardening: the pattern miners now collapse a double-written game record
  (a rare concurrent-writer race) instead of counting it twice. An audit found zero such
  records in the existing history — this is insurance, not a repair.

## [0.141.0] — 2026-07-15

### Added
- **The Post-Mortem** (a new room in The Crucible) — reads your grind history and tells you,
  per deck, *why* it loses: the recurring patterns that show up more in your losses than your
  wins, each with a plain-English tip for fixing it. Honest by design — a reason only appears
  when it's genuinely more common in losses than in wins (so a deck that mulligans a lot in its
  wins too won't get "you mulligan too much" pinned on it), it shows both rates side by side,
  and a deck with no clear pattern says so rather than inventing one. Live on your real grind
  history; sharpens as the model trains.

## [0.140.0] - 2026-07-14

### Added
- **A/B a card — bench one swap and see if it actually helps.** In the Sim Center, pick a 4-deck pod and hit
  **⚗ A/B a card**: choose a deck, pull one card, bench a replacement in, and the pod runs *both ways on the
  same seeds* so draw and seat luck cancel out. You get the target deck's win-rate change with a 95% confidence
  band — a real read, not a vibe. A live legality check on the "bench in" field means the bench can never test
  an illegal swap: banned cards, off-color-identity cards, and cards already in the deck are refused as you type.
- **The bench tells you WHY, in plain English — not just a percentage.** A finished run reads out the reasons,
  drawn only from what the games actually recorded: whether the deck hit mana screw less often, landed its
  commander sooner, closed games faster, and how the games that flipped to wins were actually won. Each line
  only appears when the shift is real — a big enough sample, and enough games that genuinely differed — so it
  never dresses up noise as a reason. When a swap changes nothing the sim ever casts, it says so honestly
  instead of inventing an effect.

## [0.139.0] - 2026-07-14

### Added
- **The pod results tell you HOW each deck wins.** The Crucible's highlights reel and per-game log now split a
  life-total kill into **combat damage** vs **noncombat (spell/ability) damage** — so a line reads "won most
  often by combat damage" instead of a flat "damage." Commander damage, poison, decking, and assembled combos
  stay their own categories, and a kill from a drain or paid life honestly stays generic rather than being
  guessed as combat or burn.
- **Foil shimmer on the podium.** A commander you own in **foil** (or etched) gets a rainbow sheen and a cool
  halo on the results podium — the same bling cue as the Vault, drawn only for cards you actually own foil
  (never a foil printing that merely exists, never a wishlist entry).

### Changed
- **Saving a pod read is instant.** Ticking "also feed the learning model" used to make the save wait out a
  full replay of the whole pod; the report now saves immediately and the model-feed replay runs in the
  background with live progress ("feeding the model… 34/100 — safe to close").

## [0.138.1] - 2026-07-14

### Fixed
- **The grind no longer freezes the app — or runs the machine out of memory.** A small fraction of
  self-play games reached a state where the AI loops an action that *produces* something each pass
  (mana, a token) without ever advancing toward a win. Because that changes the board, it slipped
  past the existing anti-loop guard and ground a single turn all the way to the engine's 50000-tick
  backstop — which, running on the app's main process, meant tens of seconds (up to minutes) of a
  frozen window plus a runaway memory balloon that could crash the machine. A **per-turn tick
  budget** now catches such a stall in a fraction of a second: no real turn was ever measured over
  ~400 ticks (a whole game totals under 3000), so a turn that burns 2000 without advancing is by
  definition a non-terminating loop. It ends that one game as "engine-stuck" — exactly as before,
  just immediately — while every real game plays out completely untouched (verified against the full
  test suite and 24k recorded games).

## [0.138.0] - 2026-07-13

### Added
- **The Crucible — the Sim Center, reborn.** The number of decks you select now drives everything: pick
  exactly four and one button runs a **pod** (a fixed batch, fast and in-memory); pick five or more — or
  none — and it runs an **endless grind** until you stop it. A pod opens a single live window that streams
  each game as it resolves, with running average tiles (turns per game, games per minute, clean-finish rate,
  average kill-turn) and a filling progress bar, then lands on results: a **podium ranked by average finish**
  (each deck's commander shown in full card art, partners overlaid), a separate **most-wins** callout (best
  average and most wins aren't always the same deck), a **highlights reel** of real mined moments, and the
  full **leaderboard + per-game logs** — with one-click "save this read."
- **Honest combo win-condition tags.** When a pod game is won by assembling a known Commander Spellbook
  combo, the result names it — but only when the winner actually cast every piece *and* the combo's output
  matches how the game ended. Anything ambiguous stays untagged rather than guessed.
- **Persona pilots — Generalist, Specialist, and Mix.** Run your decks under a chosen playstyle; a fresh
  pod defaults to Specialist (each deck piloted at its expert line, for the truest power read), and the
  endless grind rotates all three.
- **Pod opt-in training bank.** "Save this read" writes a report by default; feeding the games to the
  learning model is a separate, explicit tick — so a four-fixed-deck pod never biases the model by accident.
- **The Academy — a new room for learning.** Learn to Play (against the engine), Judge Trials (the rules
  quiz), and Rules & Rulings (the former Library, folded in) now live together.
- **Vault import + acquisition tracking.** Paste or type a decklist to import instead of building a CSV, a
  two-keystroke quick-add in search, per-stack acquisition date and per-row language, and bulk
  condition-set / wishlist→owned actions.

### Changed
- **Navigation is now four rooms — Agents · The Crucible · The Academy · The Vault.** (The Proving Grounds
  became The Crucible; the Library moved into the Academy.)
- Segmented controls are reactive and equal-width (LEYLINE polish).

### Fixed
- **Pod and self-play reports name the winner and how they won.** A report used to say "ai-wins" without
  naming the winning deck or its win condition; every game now names both.
- **The pod results window centers on the whole window** instead of rendering trapped inside the Sim Center
  panel.
- **The account dropdown renders on top** of page content again (a glass backdrop had created a stacking
  context that let content cover the menu).
- **Vault backups carry their color-tag definitions,** so restoring a backup no longer orphans every row's
  tag.

## [0.137.0] - 2026-07-11

### Added
- **Split cards play natively** (CR 709) — Fire // Ice, Dead // Gone, Wax // Wane and the rest of the
  plain-split class: cast either half from your hand at that half's own cost, with the whole card going to
  the graveyard. Fuse and Aftermath splits (which have extra casting rules) remain deferred to the Arbiter
  rather than played half-right.
- **Flashback cards with a non-mana flashback cost** — Dread Return, Lava Dart, Battle Screech, Deep
  Analysis and more now play natively when cast from hand (the graveyard flashback re-cast, like other
  alternate casting options, isn't offered but nothing is lost — the from-hand cast does the whole card).

### Changed
- Coverage grew by ~19 more cards, all verified against the rules with no regressions.

### Fixed
- **Rules-correctness wave (the CR-first remediation project, batches B1-B4).** A whole-engine audit
  against the Comprehensive Rules closed fifteen confirmed gaps; the headline fixes:
  - **Blocking is seat-correct in multiplayer** (CR 509.1a): in a 4-player pod, your creatures can no
    longer block an attacker that isn't attacking you — previously any seat could block any attacker.
  - **Dying in a 4-player Academy game no longer ends the game** (CR 104.2a): the pod correctly plays
    on to a real winner instead of instantly declaring an arbitrary opponent "the winner".
  - **Winning and dying at the same moment is a loss** (CR 104.3f), as the rules require — win-the-game
    cards no longer save a player who is simultaneously at lethal.
  - **Responding at instant speed keeps your priority** (CR 117.3c): after you cast a spell in response,
    you keep the window to act again instead of priority snapping back to the turn player.
  - **A spell whose every target disappeared now fizzles entirely** (CR 608.2b) — trailing riders like
    "…you gain 2 life" no longer execute on a fizzled spell.
- **Sim Center "Games banked" now shows the real number.** The tile read a different (empty) data lane
  and could show 0 next to a store holding 50,000+ games; it now reads the grind store itself.

### Added
- **The legend rule** (CR 704.5j — previously unimplemented), a **comprehensive state-based-action
  sweep** run as the rules' own repeat-until-stable fixpoint (CR 704.3) covering chain-reaction deaths,
  attachment legality and +1/+1//-1/-1 counter annihilation, **maximum hand size** (CR 514.1 — players
  now discard to 7 at cleanup; Reliquary Tower-style effects exempt), and correct skipping of the
  blocker/damage steps on no-attack turns (CR 508.8).
- **Sagas are natively playable** (CR 714): lore counters at entry and each draw step, chapters firing
  exactly on their crossed numbers (Doubling Season correctly skips ahead), and the finished Saga
  sacrificing itself — Vault 12: The Necropolis, History of Benalia, Binding the Old Gods and more play
  whole; 13 sagas the old metric wrongly counted as "mana sources" are now honestly routed to the
  Arbiter instead.

## [0.135.1] - 2026-07-11

### Fixed
- **The "decks under the wrong profile" screen — actually fixed, at the source.** The final root cause
  was outside the app: Windows silently gives containerized helper tooling a private copy-on-write
  mirror of the app data folder, so past repairs kept landing in a mirror while the installed app read
  the real disk. The real on-disk profile registry has been repaired (Colton and Joe correctly mapped,
  all 15 decks visible under the right names) with a timestamped backup left beside it.

### Added
- **World-identity armor.** `/api/health` now reports the data root and the registry file identity,
  and a new `scripts/check-data-world.mjs` lets any helper process verify in one command whether it
  sees the same filesystem as the running app — mirrored tooling can never silently "fix" the wrong
  world again.

## [0.135.0] - 2026-07-11

### Changed
- **LEYLINE v5.3 — the whole app re-skinned.** Near-pure-black background, black glass panels ringed
  by a green aura glow, and a more electric phosphor green everywhere. Designed live with mockups
  and rolled out through the token system so every screen changed together. All text/contrast pairs
  are WCAG-AA verified.
- **Sim Center rebuilt.** Live Standings while a grind runs (games / wins / win % per deck with
  confidence intervals, sorted, scrollable for big pools), a games selector (×1–×50 plus **∞ endless**,
  which turns the main button into "Grind endless"), luminous gel progress meters, and spacing that
  holds at every window size.
- **The page now tells on itself.** A green "All Systems" pill checks the server version, profile
  registry, and data freshness every 30 seconds; any mismatch turns it amber, says "Stale data
  detected — restart to repair", and disables launching sims — stale data can render but can't run.
- **The bottom navigation glows alive.** The active-area pill now physically springs between buttons
  as you hover (CSS anchor positioning with a spring curve; quiet fallback on older engines).
- **Jace, Karn, and Tibalt got real pixel-art portraits** (24×24 busts — glowing eyes, Urza-red
  tabard, toothed grin and fur coat) replacing the old 12×12 marks.

### Added
- `/api/health` now reports version + profile-registry identity for the freshness check (the old
  readiness contract is unchanged).

## [0.134.0] - 2026-07-10

### Fixed
- **Auto-updates now relaunch the app.** The Windows updater could rewrite the installed files while
  the open window kept running the old code — you'd see the new version number in the banner but old
  behavior (including the recurring "decks under the wrong profile" screen, whose data on disk was
  actually fine). Updates now restart the app the moment they finish installing. One note: the update
  INTO this version can show the old behavior one last time — just close and reopen the app after it.

### Added
- Syr Konrad, the Grim and Vulturous Zombie play natively (the new graveyard-event watcher subsystem).

## [0.133.0] - 2026-07-10

### Fixed
- **The recurring "decks under the wrong profile" screen — final root cause found and armored.**
  The auto-updater had been replacing the app shell while silently leaving the bundled server
  months out of date, so every prior fix never actually reached the installed app. The app now
  verifies at every launch that its server payload matches the shell version; a half-applied
  update raises an unmissable warning with one-minute repair instructions instead of silently
  running ancient code. (If you ever see that warning: download and run the latest installer
  from the Releases page once — a full install rewrites everything.)

### Added
- Raul, Trouble Shooter plays natively (cast a spell milled this turn from your graveyard,
  once per turn), and Mesmeric Orb is fully live (a new becomes-untapped engine event —
  every untap, including Seedborn-style extra untaps, now mills correctly).

## [0.132.0] - 2026-07-10

### Added
- **60 more cards play natively** since 0.131.0, headlined by five new engine subsystems:
  - **Undying** (Butcher Ghoul, Young Wolf, Geralf's Messenger, Strangleroot Geist, Vorapede + 8 more) —
    dies-with-no-counters returns the creature with a +1/+1 counter, loop-terminating and
    Doubling-Season-aware.
  - **The "or another ... dies" aristocrats class** (The Ghoul, Headless Rider, Undead Augur,
    Omnath Locus of Rage, Pashalik Mons, Midnight Entourage) — self-or-another death watchers
    with token/subtype filters.
  - **Graveyard-functioning triggers** (Infesting Radroach — the Bloodghast-style zone shape) —
    triggers that fire while the card sits in the graveyard.
  - **Wheels and big mill** — Timetwister/Echo of Eons (shuffle-in, draw 7) and
    Kitsune's Technique/Traumatize (mill half the library).
  - **The instant-or-sorcery counterspell family** (Flusterstorm, Muddle the Mixture, Disrupt,
    Miscast, Cursecatcher, Judge's Familiar + more) plus flashback/transmute/sneak cast lines
    no longer blocking otherwise-modeled cards.
- Ledger commanders now fully native: Hancock (counter-keyed anthem), Lily Bowen
  (upkeep double-or-reset), Jason Bright (power-changed death draws), Kellan the Kid
  (free-cast chains), Tetsuko (small-creature unblockable), Contagion Engine, Akroma's Will
  (commander-gated choose-both), Cathedral Acolyte (counter-gated ward grants — enforced as a
  real targeting tax), Winding Constrictor (counter additives, including counters YOU get),
  Tato Farmer (recurring lands milled this turn), Railway Brawler (power-scaled counters).

### Fixed
- Winding Constrictor's permanent-counter bonus no longer over-applies to lands/planeswalkers
  (it is now correctly artifact/creature-only).
- Boast, Exhaust and Power-up abilities are correctly parked (never offered as free repeatable
  activations); flavor-word labels (the CLB Invokers, Jason Bright) no longer block their cards.
- Self-play tooling: swap-bench logs slow pairs the moment they finish (--slow-ms, --verbose,
  --clock=off), pilot flag arms (--candidate-flags=recall-on) now actually reach
  buildPilots-style personas, and staged-pack pilot paths (omnath-v4-staged/...) load.

## [0.131.0] - 2026-07-10

### Fixed
- **Every self-play/grind commander was secretly a blank 0/0 with no abilities** — a stub card
  slipped past deck enrichment, so commanders entered play with no power, toughness, or rules text
  (no eminence, no radiation, nothing). Commander-centric decks' win rates were partially measuring
  "how does this deck do with a blank commander." Commanders now enter as their real cards.
  Grind data recorded before this fix should be treated as a separate (compromised) era.

### Added
- **18 more cards play natively** since 0.130.0, including the self-counter commander class
  (Marwyn, Yahenni, Thanos, Ishai + 10 more), Strong's radiation life-gain replacement,
  Vexing Radgull's rad-or-proliferate branch, Galvanic Blast's metalcraft upgrade, Street
  Wraith's pay-life cycling, Shadow of Mortality's life discount, Bureau Headmaster's equip
  discount, and Vega, the Watcher (a new cast-from-anywhere-but-hand trigger event).

## [0.130.0] - 2026-07-10

### Added
- **32 more cards play natively — headlined by "enters or attacks" / "enters or dies" compound
  triggers finally firing on BOTH events**: The Wise Mothman (fully native at last — rad on entry
  AND attack, plus his counter distribution), Grave Titan, Primeval Titan, Inferno Titan, Ashen
  Rider, Stitcher's Supplier and 22 more of those two families. Also: Mindcrank (a new
  life-loss event — damage counts, as printed), Street Wraith's pay-2-life cycling, Shadow of
  Mortality's life-difference discount (the 15/15 really gets cheap when you're hurt), and Bureau
  Headmaster's equip-cost discount.
- **Self-play pool games now carry the full v2 headers** (start seat, turn order, decision count,
  pilot version) — the in-app grind and the pool write through one shared builder so they can't
  drift again — and a new `swap-bench` tool measures pilot upgrades with paired-seed A/B games.

### Fixed
- A double-writer incident window in the self-play store was reconciled (11 lost-payload header
  lines removed, evidence preserved in a sidecar).

## [0.129.0] - 2026-07-10

### Fixed
- **The "my decks show under the wrong profile" bug is dead (defense in depth).** Root-caused to
  four compounding defects: test/dev processes could silently operate on the real user data
  (now refused loudly), a transient registry read failure could trigger a destructive registry
  rebuild (now retried, then failed loud — never rebuilt over live data), a stale process could
  overwrite the profile registry (writes that would drop a registered profile are now rejected),
  and a window re-opened from the tray could show days-old profile/deck groupings as current
  (the app now refreshes on focus). Live data was repaired and verified; a one-line boot
  diagnostic in the server log makes any recurrence a one-line diagnosis.

### Added
- **28 more cards play natively in the simulator** (the shelf run, all verified whole-card):
  the Snakeskin Veil "counter + protection" family (15 cards incl. Angelfire Ignition, Gaea's
  Gift, Take Up the Shield), Plan the Heist + the sequencing-"Then" parser class (+4 more),
  Ram Through's trample-excess, Ancient Animus, Paradise Mantle, Bruvac the Grandiloquent
  (opponent mills are truly doubled — radiation included), Mirelurk Queen + the "only once each
  turn" trigger class (Academy Wall, Flying Octobot), Screeching Scorchbeast's milled-count
  Zombies, and The Wise Mothman's signature counter distribution now fires in games.
- **Self-play headers record who was on the play** (start seat + full turn order), a per-seat
  mulligan summary, decision counts, and per-seat mana-health windows that finally count each
  player's OWN turns (the old global-turn read flagged nearly every seat as mana-screwed).

## [0.128.0] - 2026-07-09

### Fixed
- **Five engine correctness bugs from the full-codebase audit (2 HIGH).** A creature exiled
  instead of dying no longer fires "dies" triggers (no more phantom Blood Artist drains in
  self-play; exile-removals get their own log event) · mass "each opponent's creatures" effects
  (Scourge of Fleets class) actually resolve at the trigger flush instead of being silently
  dropped · conditional upkeep-win triggers whose condition isn't met no longer pollute the
  engine's breakage queue · a storm spell with combat-referent text is no longer over-claimed
  as natively playable · two additional-cost cast paths re-check mana affordability.
- **Grind data-trust cluster (7 fixes).** Win rates count only decisive games (a stuck game is
  neither a loss nor a draw) · a run's disk cap no longer silently becomes the store's
  permanent budget · a crash can no longer duplicate a game index (self-healing writes +
  read-side dedupe) · the parallel pool survives store errors cleanly · mid-game shuffles
  require the seeded rng (replay determinism) · one shared source for all seed math ·
  server-side clamp on one-shot batch sizes.
- **The Arbiter no longer teaches wrong rules.** Four CR citations fixed against the bundled
  Comprehensive Rules (commander tax 903.8, shield counters 122.1c, destroy 701.8, Day/Night
  731) with a permanent test that verifies every prompt citation against the bundled CR.

### Added
- **Every deck now mulligans like a player.** Playbook-parameterized keep/ship policies (land
  windows, color-aware "can I cast anything by turn 3", interaction/threat/line requirements,
  per-playbook mulligan floors — combo digs to 4) replace the old land-count-only filter for
  all persona seats, and London bottoming now bottoms the WORST cards (excess lands first)
  instead of the last ones drawn. Policy version stamped on every recorded game.
- **cEDH pool gate.** Rograkh/Thrasios and Kinnan are tagged cedh and never sit in mixed
  pods; a pool selector next to the Grind button (records carry the pool; a future cEDH grind
  is a flag flip).
- **Epoch-2 recorded-game instrumentation (schema v3).** Per-seat finish ranks (1–4) +
  elimination turns + mana-health telemetry, a win-condition taxonomy per game, richer decision
  rows (the offered action set, choice rank, stack depth, forced-choice flag), a per-card
  cast×outcome evidence table, a replay-determinism canary (which immediately caught that
  persona temperament assignment was random — the per-game seed is now provided so personas
  can become fully replayable), and readout honesty: Wilson 95% CIs, seat-skew flags, and a
  correct "player-turns (~rounds)" label.

### Removed
- Dead weight, all verified unreferenced: pre-Tauri launcher scripts, the html-export
  snapshots, formatDetection, artCrop, generate-card-names, dead mana-pool helpers and npm
  aliases ("lean and clean; waste destroys haste").

## [0.117.0 – 0.127.0] - 2026-07-09

> Eleven releases shipped across 2026-07-08/09 (the sim-center + data-trust burst); their notes below were drafted release-by-release in this section and are kept as one dated block — per-release binaries + exact notes live on the GitHub Releases page.

### Fixed
- **4-player self-play winners are now REAL winners.** A read-only pathology hunt proved the
  old semantics fabricated them: the pod ended the instant the *user seat* died and the "win"
  was stamped on the first *surviving seat in turn order* — 70.7% of ai-wins were crowned with
  2–3 opponents still alive, manufacturing a 52/15/6 ai-seat split (the seat that actually
  survived the most recorded the fewest "wins"). Commander pods now play **FFA to the sole
  survivor**: a dead user is an elimination like any other, the pod plays on, and the last
  player standing wins — whichever seat it is. The Academy (human play) keeps its
  user-centric flow unchanged, and a `legacyUserPivot` pin reproduces the old behavior
  byte-for-byte for lineage/A-B. Trajectory anchor re-anchored once, documented
  (`ab524e20…` → `53614053…`); win-label data recorded before this fix should be treated as
  unreliable for ai-wins (decision rows are unaffected).
- **A stale reader can no longer kill a live grind.** On Windows, renaming the store manifest
  while another process held it open (e.g. a standings read) threw EPERM and stopped the
  grind loop; the atomic writer now retries transient share-violations briefly and cleans up
  its temp file on real failures.

### Added
- **Parallel grind pool + compressed store (HARNESS-DATA waves 1–2).** `scripts/grind-pool.mjs`
  runs the walk-away grind on half your cores (measured **218.7 games/min vs 34 single-process
  — 6.4×**), with the parent as the store's only writer and lanes splitting one deterministic
  seed sequence (a 1-worker pool reproduces the single-process stream byte-for-byte — gated).
  Game files are now written gzip (**43.7× smaller on a real game**, lossless — round-trip
  byte-equality gated); old plain-JSON games stay readable. Every stored game is stamped with
  `schemaVersion` + feature-vector version and validated at write; non-decisive games
  (engine-stuck/timeout) are indexed into `stuck-triage.jsonl` with a one-command repro
  (`scripts/repro-grind-game.mjs` — a real stuck game reproduced exactly in verification), and
  grind status/results now report stuck counts and per-deck seat-fairness evidence.
- **The app can no longer silently attach to a stale server ("ghost registry" bug).** The shell
  used to treat port 3000 as ready the moment *anything* answered on it — so a leftover server
  from an older build (surviving a crash or force-kill) could squat on the port and every fresh
  launch would silently show ITS stale data: old profiles, missing decks, an empty persona list,
  even writes into a deleted profile. Root-caused by reproduction: a fake squatter on :3000
  produced the exact symptoms. Three-layer fix: **(1)** every launch now generates a random
  nonce and requires the new `/api/health` endpoint to echo it back before the port counts as
  ready — a foreign listener is detected, logged loudly (`port 3000 server identity = Foreign`),
  and answered by **(2)** an automatic reap-and-respawn: the stale-server sweep now matches any
  MTG-bundled node (old installs and local builds included, not just the current install's exact
  path), and **(3)** the loading screen only redirects once it can *read* an `ok:true` from
  `/api/health` — old-build zombies (no health route) leave it waiting with an honest error
  instead of rendering wrong data.

### Added
- **Grind now has a results readout.** The walk-away Grind used to only show a live counter —
  no standings, no way to see who won. There's now a **Grind results** panel in the Sim Center:
  total games logged, average turns, the winner-seat split, personas + engine versions seen, and
  a **per-deck table** (games / wins / win %). It refreshes automatically while grinding and on a
  manual button. To make the per-deck table possible, each grind game now records **which deck sat
  at each seat** (games logged before this update still count in the totals but not the per-deck
  table). The data was always being saved (one JSON file per game under the profile's
  `self-play/grind/` store); this just surfaces it.

### Fixed
- **The Grind button now works without hand-picking decks, and pilots each deck by its
  matrix persona.** It was disabled unless you manually selected at least a full pod (4 decks
  for Commander) — backwards for a walk-away "grind everything" button. It now enables as soon
  as a pod's worth of decks *exists* and, with no selection, grinds the **whole shelf** in
  random balanced pods; selecting a subset narrows it to those decks, and the hint shows
  exactly what will run. The persona dropdown also auto-selects the installed pilot, so every
  deck in every pod is played by its deck-appropriate playbook/temperament (Omnath's matrix
  classifier — Vihaan→aristocrats, Rograkh→combo, Omnath→ramp, …) with a specialist/generalist
  mix, right out of the box.
- **Your decks can no longer be lost to a crash mid-save.** A torn write (the app dying while
  saving `decks.local.json`) used to leave a corrupt file, and on the next launch the store
  served an *empty* library — which is how a real deck shelf got silently replaced with junk
  once. Three hardenings: (1) every save now fsyncs to disk before the atomic rename, so a
  crash can never promote a half-written file; (2) each save first rolls the current good file
  into a bounded ring of 10 auto-backups; (3) on load, a corrupt **or** suspiciously
  empty/placeholder deck file auto-restores from the newest good backup (preserving the bad
  file for inspection) instead of resetting to empty. The same crash-safe write now protects
  the profile registry, game logs, learn saves, and grind records. Regression-tested.

### Added
- **Grind records now tag each seat's `pilotType` + carry the real engine version.** Every
  recorded self-play/grind row now stamps `pilotType` ("specialist" | "generalist") alongside
  `{playbook, temperament}`, so the training data splits cleanly into expert-baseline vs
  generalist/stress runs with no post-hoc lookup. Separately, the running server now reports
  the actual release version (package.json is synced from the tag at build time), so every
  grind record's `engineVersion` attributes the data to the right engine instead of a stale
  number. Both are byte-neutral to the hashed trajectory anchor (verified via A/B).
- **Play from the top of your library now works (+3).** Future Sight, Magus of the Future,
  Goblin Spy — "you may play lands and cast spells from the top of your library" is a real,
  enforced permission now: the app can actually cast the top card (at full cost) or play the
  top land while such a permanent is out. Foundation for the filtered variants (Mystic Forge,
  The Reality Chip, Eladamri) next.
- **Joe-deck grind (+2 in-deck so far).** "Spells you control can't be countered" (Chimil,
  the Inner Sun) now plays natively — enforced: your spells can't be chosen as counter
  targets while it's out. "Put +1/+1 counters on each land creature you control" (Bumi,
  Eclectic Earthbender) now correctly buffs the lands his earthbend animated into creatures.
- **Singular "has" counter-payoff grants now play natively (+7).** Duskshell Crawler,
  Pridemalkin, Crowned Ceratok, Sapphire Drake, the Hagra Constrictors — "Each creature you
  control with a +1/+1 counter on it **has** trample/…" now works (the parser previously only
  matched the plural "have"). Uses the existing enforced counter-gated keyword grant.
- **Four more alt-cast keywords now play natively (+25).** Foretell, Blitz, Freerunning,
  and Prototype — like Morph/Sneak/Dash, each is just a cheaper optional way to cast a card
  that never changes what the card does, so the app plays it as its normal-cost self.
  (Doomskar Titan, Workshop Warchief, Merciless Harlequin, Goring Warplow, and 21 others.)

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
