# QUESTIONS FOR COLTON — running side file

> Questions that surfaced during playbook writing (and later, during
> execution) that did NOT stop the work. Each got a working default so
> the lane keeps moving; your answer confirms or flips it. Newest
> first. Mark answered items ✅ and fold the answer into the affected
> doc + `14-decision-log.md`.

---

## Open

### Q4 — Giftable builds: what inference do they get?
The spec locks the giftable split (no Omnath, no owner data) but is
silent on the inference plane for a gifted phone: they have no Mac hub.
**Working default:** giftable = standalone tiers only — T0 retrieval +
T2 on-device (if built) + T3 with THEIR OWN Anthropic key entered in
settings; no hub pairing UI in the giftable flavor v1.
**Decide by:** M5.1. *(Affects `04 §1.6`, `11 §2`, `12 §M5`.)*

### Q3 — If self-hosted push proves unlivable, is opt-in FCM acceptable?
V9 explores notification delivery without any public service. If every
closed-system mechanism fails Android's Doze reality, the pragmatic
fallback is Google's FCM — a third-party relay carrying "you have a
notification" (content can stay local-fetched). That's a (small,
metadata-only) crack in the closed-system posture, so it's your call,
not a build decision.
**Working default:** in-app badge inbox only (no FCM) until you say
otherwise.
**Decide by:** M4.2. *(Affects `07 §1.5`, V9.)*

### Q2 — Initiative counter in the life tracker?
Your spec'd counter list (life · cmdr dmg · poison · energy ·
experience · monarch · day/night) doesn't include the initiative /
Undercity mechanic. It's cheap to add alongside monarch (same
single-holder pattern).
**Working default:** OUT (spec-as-written); trivially addable at M4
polish.
**Decide by:** M4.4. *(Affects `06 §1.2`.)*

### Q1 — Phone stays dark-only (LEYLINE true-black)?
Chosen for OLED battery + brand coherence (`10 §1`). Re-open only if
daylight legibility annoys you at a real table.
**Working default:** dark-only.
**Decide by:** whenever dogfood says otherwise; no deadline.

---

## Answered

*(none yet — answers land here with date + where they were folded in)*
