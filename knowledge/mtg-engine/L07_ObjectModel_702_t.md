# Magic: The Gathering — Keyword Abilities: Engine Taxonomy
## LAYER 7: OBJECT MODEL LAYER — Expansion (Rule 702)
## Effective February 27, 2026

---

SOURCES: L07_ObjectModel_702_v.md, L08_ContinuousEffects_611to613_t.md
FEEDS INTO: L04_Trigger_engine.md (triggered keywords), L05_StateEnforcement_704_t.md (deathtouch SBA), L06_PlayerAction_601_seg1_t.md (alternative cost keywords), L03_Event_614to616_t.md (keyword replacement effects), L00_Orchestration_game_engine.md

---

# 1. PURPOSE OF THIS FILE

`L07_ObjectModel_702_v.md` is the **reference dictionary** — look up what any keyword does there.

This file answers a different question: **when the engine encounters a keyword, which layer processes it?** Keywords are not monolithic — they are static abilities, triggered abilities, activated abilities, or alternative cost mechanisms, and each type routes through a different layer of the engine.

---

# 2. THE FRAMEWORK RULES (702.1)

Before the taxonomy, three meta-rules govern all keywords:

**702.1 — Keyword costs:** "A [keyword] cost" refers only to that keyword's variable costs. The activation cost of the full ability includes that cost plus any fixed components.

**702.1b — Dynamic variables in granted keywords:** If an effect grants a keyword with a variable defined by game state ("has echo {X}, where X is your life total"), the variable is continuously re-evaluated — it doesn't lock in when granted.

**702.1c — "The same is true for" grants:** When a static ability grants a batch of keywords conditionally, it grants every variant and every variable of those keywords that any controlled object has.

**702.1d — "With [keyword]" means "has a [keyword] ability":** These phrasings are interchangeable.

---

# 3. KEYWORD TAXONOMY BY ENGINE LAYER

## 3.1 → LAYER 5 (State Enforcement): Keywords That Modify SBAs

| Keyword | Rule | SBA Interaction |
|---|---|---|
| Deathtouch | 702.2 | Any damage from deathtouch source is lethal for SBA purposes (704.5g/h) |
| Indestructible | 702.12 | Creature survives lethal damage and "destroy" effects — bypasses 704.5g/h |
| Toxic | 702.164 | Poison counters → SBA 704.5c (10+ poison = lose game) |
| Infect | 702.90 | Damage as -1/-1 counters (creatures) or poison counters (players) → SBA implications |

## 3.2 → LAYER 6 (Player Action): Alternative and Additional Cost Keywords

These keywords modify the casting procedure at **601.2b** (cost announcement) or **601.2f** (cost determination). The `_v` file has the full definition of each.

**Alternative costs (replace mana cost):**
Flashback, Madness, Morph, Overload, Bestow, Dash, Escape, Foretell, Disturb, Disguise, Blitz, More Than Meets the Eye, Plot, Freerunning

**Additional costs (added on top of mana cost):**
Buyback, Kicker, Entwine, Replicate, Escalate, Casualty, Bargain, Gift, Spree, Cleave, Conspire

**Cost reduction keywords:**
Affinity, Convoke, Delve, Improvise, Undaunted, Assist, Emerge, Surge

**Other casting-method keywords:**
Cycling, Transmute, Retrace, Jump-Start, Aftermath, Embalm, Eternalize, Encore, Unearth (activated), Dredge (replacement), Suspend (special action), Epic, Ravenous, Squad, For Mirrodin!, Prototype, Craft, Saddle, Exhaust, Offspring, Impending

**Notes on route:**
- Keywords that let you cast from alternate zones (Flashback, Escape, Jump-Start) still follow 601.2a–i — the zone is different but the procedure is the same
- Companion (702.139) is a special action (116.2g) before casting, then normal casting
- Crew (702.122) is an activated ability that modifies a permanent's type, not a casting keyword

## 3.3 → LAYER 4 (Trigger): Triggered Keyword Abilities

These keywords generate triggered abilities that follow standard 603 insertion rules.

**Triggered on ETB:**
Amplify, Bloodthirst, Graft, Evoke, Persist, Devour, Undying, Unleash, Evolve, Tribute, Fabricate, Riot, Training, Backup, Offspring, Soulbond, Modular (LTB trigger also)

**Triggered on attack/combat:**
Exalted, Battle Cry, Dethrone, Melee, Mentor, Enlist, Provoke, Annihilator, Flanking, Bushido (on block), Afflict (on block), Myriad, Poisonous (on damage), Toxic (poison placement on damage)

**Triggered on cast/spell:**
Storm, Replicate (additional to cost keyword), Ripple, Prowess, Casualty (additional to cost), Gravestorm

**Triggered on LTB/death:**
Haunt, Recover, Afterlife, Soulshift, Decayed, Modular

**Triggered on upkeep/beginning of step:**
Cumulative Upkeep, Echo, Fading, Vanishing

**Other triggers:**
Extort (whenever you cast), Cipher (on connecting), Daybound/Nightbound (day/night change), Boast (activated once per combat, but triggers involved), Level Up (triggered elements), Champion (ETB + LTB pair)

## 3.4 → LAYER 3 (Event/Replacement): Keywords That Replace Events

| Keyword | Rule | Replacement Event |
|---|---|---|
| Madness | 702.35 | Replaces discard to exile → cast opportunity |
| Dredge | 702.52 | Replaces card draw with mill + return |
| Recover | 702.59 | Replaces creature dying with return option |
| Phasing | 702.26 | Replaces beginning-of-untap actions |
| Shield counter | 122.1c | Replaces destruction/damage with counter removal |
| Stun counter | 122.1d | Replaces untap with counter removal |
| Finality counter | 122.1h | Replaces graveyard with exile |
| Ward | 702.21 | Generates triggered counter-or-pay when targeted |
| Protection | 702.16 | DEBT prevention: Damage, Enchanting, Blocking, Targeting |
| Bestow (ETB) | 702.103 | If no legal target, becomes creature instead |
| Companion (start-of-game) | 702.139 | Replacement for hand construction |

## 3.5 → LAYER 8 (Continuous Effects): Static Keyword Abilities

These generate continuous effects while the permanent is on the battlefield (or the object is in the appropriate zone).

**Evasion abilities** (restrict blockers — 509.1b):
Flying, Reach (enables blocking flyers), Landwalk, Shadow, Horsemanship, Intimidate, Fear, Menace, Skulk, Space Sculptor, Banding

**Protective statics:**
Hexproof, Shroud, Protection, Indestructible, Ward (generates trigger, but the base effect is static), Umbra Armor

**Combat statics:**
Deathtouch, Double Strike, First Strike, Lifelink, Trample, Wither, Infect, Absorb, Frenzy

**Timing/restriction statics:**
Flash, Haste, Vigilance, Defender, Split Second, Devoid (CDA), Changeling (CDA)

**Other statics:**
Enchant (defines legal targets for Aura), Equip instructions (602-based, but the "can equip" property is static), Phasing (phase-in/out is a TBA, but "has phasing" is static), Living Metal, Impending, Decayed (can't block is static)

---

# 4. KEYWORDS THAT SPAN MULTIPLE LAYERS

Some keywords involve multiple engine layers:

| Keyword | Layers involved |
|---|---|
| Modular | L4 (ETB trigger — enters with counters) + L4 (LTB trigger — move counters) |
| Champion | L4 (ETB exile trigger) + L4 (LTB return trigger) — linked via 607.2k |
| Mutate | L6 (alt cost) + L3 (replacement on resolution) + L4 (triggers) |
| Evoke | L6 (alt cost) + L4 (LTB trigger when cast for evoke cost) |
| Cascade | L6 (triggers on cast → reveals and casts another spell) crosses L4 |
| Daybound/Nightbound | L4 (triggers on day/night change) + L10 (Day/Night mechanic) |
| Ninjutsu | L6 (activated) + replaces an attacking creature |
| Living Weapon | L4 (creates token on ETB) + Equipment rule |

---

# 5. KEYWORD ABILITY vs. KEYWORD ACTION

Rule 702 defines **keyword abilities**. Rule 701 defines **keyword actions** (Destroy, Exile, Sacrifice, Counter, Tap, etc.). These are distinct:

- Keyword **abilities** are characteristics of objects that generate ongoing rules effects (Flying, Trample, Haste)
- Keyword **actions** are verbs used in effect text (destroy, exile, counter)

When adjudicating, check which rule the term comes from before routing through the engine.

---

# 6. KEYWORD COUNTERS (122.1b)

Keyword counters on a permanent grant that permanent the corresponding keyword ability. This is a **layer 6 ability-granting effect** (613.1f). The keywords that keyword counters can represent: flying, first strike, double strike, deathtouch, decayed, exalted, haste, hexproof, indestructible, lifelink, menace, reach, shadow, trample, vigilance, and their variants.

Keyword counters follow the same zone-change cessation rule as all other counters (122.2).

---

# 7. REMINDER TEXT IS NOT RULES TEXT

Reminder text (italicized text in parentheses on cards) summarizes a keyword ability for players but has no rules force. The complete rule for any keyword is in `L07_ObjectModel_702_v.md`. If reminder text and the CR rule text conflict, the CR wins.

---

FEEDS INTO: L04_Trigger_engine.md (§3 triggered keyword routing), L05_StateEnforcement_704_t.md (deathtouch/infect/toxic SBA interactions), L06_PlayerAction_601_seg1_t.md (alternative cost keywords at 601.2b/f), L03_Event_614to616_t.md (keyword replacement effects — Madness, Dredge, Protection, Ward)
