# Changelog

All notable changes to MTG Tool are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/). Full per-release notes and binaries live on
the [GitHub Releases](https://github.com/Robak503/mtg-tool/releases) page; this file
summarizes the notable changes.

## [Unreleased]

### Fixed
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
