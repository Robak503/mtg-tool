# Real-Deck Unlock — the targeted backlog that makes the SIM play Colton's & Joe's decks

> **Hans (Scout), 2026-06-19.** The corpus % (17.5%) is the WRONG steering metric for the cEDH-sim goal.
> What matters is **can the Academy play the decks we actually own.** I measured native coverage on all
> **15 local decks** (Colton's 6 + Joe's 9, from the profile store). The realism gate is **low** and that —
> not gameplay-depth — is the current bottleneck for a faithful self-play sim.

## The realism-gate finding (non-land native % — the cards that actually play vs route to the Arbiter)

| Owner | Decks | Non-land native | Read |
|---|---|---|---|
| **Colton** | 6 | **23%** (87/382) | Sliver Hivelord 30% · Koma 26% · Vihaan 24% · Omnath 21% · Rograkh/Thrasios 21% · Zaxara 14% |
| **Joe** | 9 | **15%** (86/588) | Kinnan 32% · Yuriko 20% · Cap America 16% · Pantlaza 16% · Kellan 13% · Toph 11% · Ur-Dragon 10% · Mothman 6% · Wolverine 6% |
| **ALL 15** | 15 | **18%** (173/970) | **82% of non-land cards route to the Arbiter today.** |

(Land slots are ~38/deck and always native, so overall % runs ~45-56% — the **non-land** number is the honest
realism gate.) **Steer by THIS number** (18% → up), not the corpus %. Modeling a card in 8 decks beats modeling
8 random corpus cards.

## The backlog writes itself — 646 distinct unmodeled cards across the 15 decks, but they CLUSTER

Cards appearing in **3+ decks** (model these first — each lifts several decks at once):

### 🟢 SLICE 1 — RAMP-TYPED ⭐ THE #1 LEVER (Nature's Lore in **8 decks**)
"Search your library for a basic land / a Forest|Plains|Island|Swamp|Mountain card, put it onto the battlefield
[tapped], shuffle." Extends the shipped RAMP resolver (battlefield-destination) to **typed-basic** search.
- **Cards:** Nature's Lore (8), Farseek (5), Skyshroud Claim (5), Three Visits (5), Growth Spiral (3, land + draw).
- **Landmines:** Skyshroud Claim fetches **two** (honor count + tapped); Nature's Lore/Three Visits are untapped;
  Farseek is a typed-basic (not "basic land"). End-anchored, reject extra riders.

### 🟢 SLICE 2 — RIDER-REMOVAL (premium exile removal, 3 decks each)
"Exile target creature. Its controller {searches for a basic land tapped | gains life equal to its power}."
Exile is modeled; add the **controller-rider** (ramp/lifegain to the TARGET's controller, not the caster).
- **Cards:** Path to Exile (3), Swords to Plowshares (3), Beast Within (2), Assassin's Trophy (2).
- **Landmine:** "its controller" = the target's controller (the documented RIDER-CTRL-LIFE trap).

### 🟡 SLICE 3 — SOFT-COUNTER + RIDERS (the cEDH interaction package, 5+ decks)
The counter atom is modeled (P3.1) + SOFT-CNT (#243, "unless pay {N}"). Extend to the staple riders/soft-counters.
- **Cards:** Fierce Guardianship (5), An Offer You Can't Refuse (3, "unless pay {2}, they make a Treasure"),
  Swan Song (3, "counter; controller makes a 2/2 Bird"), Mana Drain (3), Flusterstorm/Force of Will/Force of
  Negation/Mental Misstep/Mindbreak Trap (3 each).
- **Landmine:** the **alt-cast costs** (FoW "exile a blue card + 1 life", Fierce Guardianship "free w/ commander")
  need the cast-cost path (Wave-C infra). **Start with the clean soft-counter riders** (An Offer / Swan Song /
  the "unless pay" family); defer the free-counter alt-costs until the cast-cost subsystem lands.

### 🟡 SLICE 4 — GREEN ETB / STATIC PAYOFFS (effect-atom widening, 3-4 decks)
Cindy's "effect-atom widening" pivot, aimed at these. Body-only creatures whose static/ETB is modeled-able.
- **Cards:** Garruk's Uprising (4, ETB-draw + trample anthem), Branching Evolution (4, counter-DOUBLING —
  replacement, **defer**), Inspiring Call (4), Return of the Wildspeaker (4, draw = power), Rishkar's Expertise
  (4), Finale of Devastation (4), Overwhelming Stampede (3), Craterhoof Behemoth (3), Ghalta (3), The Great
  Henge (3, cost-reduction + ETB-draw static).
- **Landmine:** the counter-doubling / cost-reduction replacements are hard — cherry-pick the ETB-draw + plain
  static-anthem + overrun-style ones; route replacements to the Arbiter.

### 🟡 SLICE 5 — UPKEEP-TAX DRAW ENGINES (blue staples, 3 decks)
- **Cards:** Rhystic Study (3) / Mystic Remora (3) — "Whenever an opponent casts a spell, unless they pay {N},
  draw a card" (a new **opponent-casts** trigger event + the "unless pay" soft-gate → draw). Seedborn Muse (3,
  untap-all on each other player's untap step — a new untap-all trigger).
- **Landmine:** new trigger events; model the per-opponent "unless pay" choice (4P-faithful) or stay LOW.

**Also in 3+ decks (body-only value, fold into SLICE 4/5):** Wan Shi Tong, Mockingbird, Badgermole Cub,
Heroic Intervention (3, "permanents you control gain hexproof+indestructible until EOT" — a team-grant).

## Expected impact
SLICE 1 alone touches ~8 decks. SLICES 1-3 are the clean high-density core and should lift the 15-deck non-land
native % from **18% toward ~30-35%** — a real game with these decks goes from "mostly Arbiter" to "mostly native."
Re-measure after each slice with the per-deck tool (the realism gate is the acceptance test, not the corpus %).

## Methodology (re-runnable)
Decks live in the profile store: `%APPDATA%/com.colton.mtg-tool/data/profiles/<id>/decks.local.json`
(Colton = `prof_a981996c…`, Joe = `prof_b1412fcc…`). Classify each card via `lookupCard`→`publicCard`→
`classifyCard` with `MTG_APP_ROOT` pointed at the dev tree (for the oracle index). The 646-card full list +
per-deck breakdown regenerate from that scan.
