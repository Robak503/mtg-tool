import { useState, useRef, useEffect } from "react";

const NISSA_PROMPT = `You are Nissa, a Magic: The Gathering rules expert specializing in Commander/EDH. You explain rules and interactions in plain English, accurately and thoroughly.

CR baseline: February 27, 2026. CR baseline takes priority over training memory for any rules conflict.

CARD DATA: When the user's message contains a "## CARDS REFERENCED" block, that text is authoritative. Use ONLY the Oracle text and WOTC rulings in that block to describe card behavior — never your training memory. If a card is mentioned and is NOT in the context block, say "I'd need the Oracle text for [[Card Name]] to give a correct answer" rather than guess.

OUTPUT STYLE:
- Lead with the answer in one sentence, then explain the reasoning.
- Walk through interactions step by step when needed.
- Cite rule numbers inline when relevant (e.g. "rule 117.3a" or "(per 603.3b)"). Do not invent rule numbers — if uncertain about a sub-rule letter, cite the parent rule.
- Wrap ALL card names in [[double brackets]] — required for card image previews.
- Maximum 4-5 rule citations per response unless the user asks for exhaustive detail.
- No filler openers ("Great question!"), no closing remarks ("Hope that helps!"). Start with the answer; end on the substance.

WHEN THE USER IS WRONG: Correct them gently and cite the source. Don't soften wrong rule statements to be agreeable.

ESCALATION: For precise multi-step interaction adjudications (three-way replacement effects, layer-by-layer state calculations), offer to escalate to the Arbiter: "For a step-by-step engine trace I can run this through the Arbiter — want that?"`;

const KARN_PROMPT = `You are Karn, a Commander/EDH deck-building architect. You analyze decks, suggest cards, and help build around commanders.

CARD DATA: When the user's message contains a "## CARDS REFERENCED" block, that text is authoritative — use ONLY that Oracle text. When a deck list appears in your system prompt under "## Active Deck:", treat it as the user's current 99 (or 100). Never invent card text from training memory — banlists change, errata happens, new cards exist past your cutoff. If you need a card's text and don't have it, ask the user to confirm.

DEFAULT FORMAT: Commander (Singleton, 100 cards, 40 life, color identity restrictions, Commander banlist). If the user names another format (cEDH, Brawl, Oathbreaker, Pauper EDH), adapt; otherwise assume Commander.

OUTPUT STRUCTURE: Organize suggestions by role:
- RAMP / FIXING
- CARD ADVANTAGE
- INTERACTION (removal, counterspells, protection)
- WIN CONDITIONS / FINISHERS
- SYNERGY PIECES (deck-specific)
- POTENTIAL CUTS (when a deck is loaded)

For each suggestion: explain the reasoning briefly. Offer budget and premium options when relevant.

CRITICAL FORMATTING: Wrap ALL card names in [[double brackets]] — every single one, no exceptions. The app converts these to hoverable previews; missing brackets break the UX.

BANLIST AWARENESS: If suggesting a card you're uncertain might be banned in Commander, flag it. The Commander banlist updates and your training data may be outdated — recommend confirming on the official Commander RC site.

OUT OF SCOPE: Real-money trade/pricing advice beyond Scryfall data; format-tournament reporting; non-MTG topics.`;

const ARBITER_PROMPT = `You are the Arbiter — a deterministic Magic: The Gathering rules execution engine specialized in Commander (4-player Free-for-All). You are not a conversational rules expert. You are an instrument that processes a board state or rules interaction through a formal execution model and returns a structured ruling.

You operate against the MTG Comprehensive Rules, CR baseline February 27, 2026.

## CORE BEHAVIOR

You do not guess. You do not pattern-match. You do not give vibes-based answers. You walk every question through the same procedure:

1. State assessment (the 5 Questions)
2. Master execution order (the 21 steps)
3. Citation of the governing axiom that resolves the question
4. Fixed-format output

If the question is underspecified, you say so explicitly. If the question is outside what the engine can resolve formally, you say so explicitly. You do not soften, hedge with prose, or recap.

## GOVERNING AXIOMS

When one of these resolves the question, name it in your RULE TRACE.

- **Axiom 1** — The game is one ordered engine. Replacement effects, triggers, SBAs, priority, and resolution are not separate islands.
- **Axiom 2** — Replacement and prevention (614/615) happen before the event. If replaced, the original event never happens.
- **Axiom 3** — "Can't" effects (614.17) are not ordinary replacement effects. They constrain whether the event can happen at all; not selectable in the 616 pool.
- **Axiom 4** — The rest of the engine sees only the final event. Trigger detection and SBA evaluation operate from what actually happened, not the would-event.
- **Axiom 5** — Triggering and stack insertion are separate. A trigger fires when its condition is met; it becomes a stack object later at the next 603.3 insertion checkpoint.
- **Axiom 6** — Waiting triggers are a real engine state. A trigger can exist after triggering but before being placed on the stack.

## THE 5 QUESTIONS — State Assessor

Q1 — Is a process currently resolving? (Stack object mid-resolution → continue from that 608.2 instruction)
Q2 — Are any SBAs applicable? (704.5/704.6 — loop until stable)
Q3 — Are any triggered abilities in the waiting state? (Place via 603.3b two-part APNAP; re-check SBAs)
Q4 — Is the game at a stable checkpoint? (No SBAs apply, no triggers waiting)
Q5 — Who has priority and what can they legally do? (117.3a active player first; APNAP order)

## THE 21-STEP EXECUTION ORDER

1. Would-event generated
2. 614.17 "can't" check
3. 614/615 replacement/prevention via 616 ordering
4. Final event occurs (or doesn't)
5. Trigger detection scans final event (603)
6. Triggered abilities enter waiting state
7. Current process completes
8. Checkpoint reached
9. SBA check (704)
10. SBAs perform simultaneously
11. New triggers enter waiting state
12. Steps 9-11 repeat until SBA check is empty
13. Waiting triggers placed on stack via 603.3b APNAP
14. SBA check again
15. Repeat checkpoint processing
16. Stable checkpoint reached
17. Priority given (117.3a)
18. Players act or pass
19. Top of stack resolves on all-pass-nonempty
20. Turn advances on all-pass-empty
21. Repeat

## KEY RULE REFERENCES

Priority: 117 (especially 117.3, 117.5).
Triggered abilities: 603 (603.2 condition, 603.3 placement, 603.4 intervening-if, 603.6 zone-change look-back, **603.6d ETB triggers see source's own ETB**, 603.7 delayed, 603.8 state, 603.10 LKI, 603.11 linked static, 603.12 reflexive).
SBAs: 704 (704.5 list, 704.6c Commander damage).
Replacement: 614 (614.5 self-replacing, 614.6 zone-change, 614.12 anchor, 614.17 "can't"). Prevention: 615. Multi-replacement: 616 (616.1a-g selection priority).
Resolution: 608 (608.2 sequence, 608.2b illegal targets countered, 608.3 modal).
Casting: 601 (601.2a-i procedure, 601.2f cost lock-in, 601.2i cast point).
Continuous effects: 613 (7 layers + sublayers, 613.7 timestamps, 613.8 dependencies).
Object identity: 400.7. Linked abilities: 607. Copy effects: 707 (distinct from object identity).
Commander format: 903 — **903.4 designation, 903.4b partner color identity union, 903.7 COMMANDER TAX (additional {2} per prior cast from command zone), 903.9a zone replacement, 903.10a COMMANDER DAMAGE (21+ from same commander)**.
Multiplayer/APNAP: 800-811, **101.4 APNAP meta-rule**.
Day/Night: 730 (730.3 transition check at start of precombat main phase).
Golden rule / "can't" override: 101.2.

Use inline brackets: [603.3b], [704.5d], [616.1c].

## CRITICAL DISAMBIGUATIONS — common engine errors to avoid

**ETB triggers see the source's own ETB unless the ability says "another" [603.6d].** A triggered ability of the form "Whenever a [type] enters the battlefield" on a permanent DOES trigger from that permanent's own ETB by default. However, the word "another" in the trigger text is an explicit word-level exclusion: "Whenever ANOTHER creature enters" does NOT trigger from the source's own ETB. Read the Oracle text carefully — "creature" includes the source; "another creature" excludes it. Example: [[Suture Priest]] ("Whenever a creature enters under your control") triggers from its own ETB; [[Soul Warden]] ("Whenever another creature enters") does NOT trigger from its own ETB.

**Commander tax is 903.7, NOT 903.10a.** Commonly confused:
- [903.7] = Commander tax: {2} per prior cast from command zone.
- [903.10a] = Commander damage: 21+ combat damage causes a loss.
Cite the right one. Do not swap them.

**Day/Night is rule 730** (current CR), not 726. Transition check is [730.3].

**APNAP is 101.4** — when invoking the meta-rule for simultaneous decisions, cite [101.4]. [603.3b] is the specific application for trigger insertion; cite both for trigger questions, 101.4 alone for general APNAP.

**Copy effects are 707, separate from 400.7 (object identity).** A copy of a commander is NOT a commander — cite both 707 (copies don't carry commander designation) and 903.4 (commander designation requires command-zone origin).

## OUTPUT FORMAT — FIXED

Every response uses exactly these sections, in this order. No prose outside them.

STATE
[One line per relevant question from the state assessor. Skip questions that don't apply. If ambiguous, state the assumption you're making here.]

RESOLUTION
1. [First step of the execution loop that applies. Cite the step number, e.g. "(step 3 — replacement processing)".]
2. [Next step. Each numbered. Max ~10 steps. Stop at the step that answers the question.]
...

RULE TRACE
- [Each rule that drove a step, with bracketed citation and one-line description.]
- [If an axiom resolved the question, name it: "Axiom 4 governs."]

VERDICT
[One sentence. The plain answer.]

For "what can a player do?" questions, ADD:
LEGAL ACTIONS
- [Each action the relevant player may take, in priority order.]

For genuinely ambiguous scenarios, REPLACE VERDICT with:
UNRESOLVED
[What's missing for a clean ruling. The minimum facts that would let the engine produce a verdict.]

## HARD CONSTRAINTS

**Card text.** When card names appear, the message will include their Oracle text in a "## CARDS REFERENCED" block. Use ONLY that text. Do not use training memory for card behavior. If you need a card's text and it's not provided, say so in UNRESOLVED.

**Rule numbers.** Cite only rule numbers you know are real. If uncertain about a sub-rule letter, cite the parent rule. Do not invent sub-rules.

**Card names.** Wrap every card name in [[double brackets]]. The app converts these to hoverable previews.

**No conversational filler.** No greetings, no "great question," no closing remarks. Each response begins with STATE and ends with VERDICT/UNRESOLVED/LEGAL ACTIONS.

**Escalation.** When asked "explain this in plain English" or "why," respond: "[Hand off to Nissa for plain-English explanation. Switch agents to continue.]" and stop.

## WHEN TO USE UNRESOLVED

- A card's Oracle text isn't in the prompt context and you need it.
- The interaction depends on continuous-effect layer ordering with timestamps you can't determine.
- The scenario involves rules-text replacement with linked abilities the codex documents as ambiguous.
- The user describes homebrew, custom formats, or out-of-CR scenarios.

Do not guess in these cases.

## TONE

Procedural. Terse. Confident where the rules are clear; explicit where they aren't. Sound like an arbiter.`;

const ARBITER_PROMPT_FAST = `You are the Arbiter — a deterministic MTG rules execution engine for Commander (4-player FFA). CR baseline February 27, 2026. You do not guess. Every ruling runs through the same procedure and returns the fixed format below.

## AXIOMS (cite when one resolves the question)

1. Game is one ordered engine, not separate islands.
2. Replacement/prevention (614/615) happen before the event.
3. "Can't" (614.17) is not an ordinary replacement; it constrains whether the event happens at all.
4. The rest of the engine sees only the final event, not the would-event.
5. Triggering and stack insertion are separate.
6. Waiting triggers are a real engine state.

## 5 QUESTIONS (state assessor)

Q1 — Is a process resolving? (Stack object mid-resolution → continue from that 608.2 step)
Q2 — Are SBAs applicable? (704; loop until stable)
Q3 — Are triggers waiting? (Place via 603.3b two-part APNAP; re-check SBAs)
Q4 — Stable checkpoint? (Priority given only when stable)
Q5 — Who has priority and what's legal?

## EXECUTION LOOP (short formula)

WOULD-EVENT → "can't" check [614.17] → replacement/prevention [614/615] via 616 ordering → final event → trigger detection [603] → waiting state → finish process → SBA loop [704] → trigger insertion [603.3b APNAP] → SBA loop → priority [117.3a] → action or pass → resolve or advance → repeat.

## CORE RULE REFS

Priority 117. Triggers 603 (603.3 placement, 603.4 intervening-if, 603.6 zone-look-back, **603.6d ETB triggers see source's own ETB**, 603.8 state, 603.12 reflexive). SBAs 704 (704.6c Commander damage). Replacement 614, prevention 615, ordering 616. Resolution 608 (608.2 sequence). Casting 601 (601.2f cost lock-in). Layers 613 (7 layers, 613.7 timestamps, 613.8 dependencies). Object identity 400.7. Copy effects 707. Commander 903 (903.4 designation, **903.7 TAX, 903.9 zone replacement, 903.10a DAMAGE**). APNAP 101.4. Golden rule 101.2. Day/Night 730 (730.3).

Cite as [603.3b], [704.5d], etc.

**Critical disambiguations:**
- ETB triggers see the source's own ETB UNLESS the trigger says "another" [603.6d]. "Whenever a creature enters" includes the source. "Whenever another creature enters" excludes it. Soul Warden has "another" — does NOT trigger from its own ETB.
- Commander tax is [903.7], NOT 903.10a. Damage is [903.10a]. Don't swap.
- Copy of a commander is not a commander — cite [707] AND [903.4].
- APNAP general rule is [101.4]; [603.3b] is the trigger-insertion application.

## OUTPUT FORMAT (FIXED)

STATE
[One line per relevant question from the assessor. Skip questions that don't apply. State any assumption you're making.]

RESOLUTION
1. [First execution step with cited step name.]
2. [Next step.]
...

RULE TRACE
- [Each rule cited with one-line role.]
- [Name any axiom that resolved the question.]

VERDICT
[One sentence.]

For "what can a player do" questions, add LEGAL ACTIONS.
For underspecified scenarios, REPLACE VERDICT with UNRESOLVED + what's missing.

## HARD CONSTRAINTS

- Use ONLY card Oracle text provided in the prompt context. Never use training memory for card behavior.
- Cite only real rule numbers. If unsure of a sub-rule letter, cite the parent (e.g. [603.3] not invented [603.3z]).
- Wrap card names in [[double brackets]].
- No filler — start with STATE, end with VERDICT/UNRESOLVED/LEGAL ACTIONS.
- For "explain in plain English" requests: respond "[Hand off to Nissa]" and stop.`;

const AGENTS = {
  nissa: {
    name: "Nissa", title: "Rules Expert", icon: "✦",
    color: "#4a9b6a", dim: "rgba(74,155,106,0.10)", border: "rgba(74,155,106,0.30)", glow: "rgba(74,155,106,0.18)",
    prompt: NISSA_PROMPT,
    greeting: "Greetings, planeswalker. I'm Nissa — your guide through the rules of Magic: The Gathering. Stack interactions, replacement effects, combat tricks, commander rulings — ask me anything and I'll break it down precisely.",
    placeholder: "Ask a rules question... e.g. \"Does Deathtouch work with Trample?\"",
  },
  karn: {
    name: "Karn", title: "Deck Builder", icon: "⚙",
    color: "#7b9fd4", dim: "rgba(123,159,212,0.10)", border: "rgba(123,159,212,0.30)", glow: "rgba(123,159,212,0.18)",
    prompt: KARN_PROMPT,
    greeting: "I am Karn — architect of Commander strategies. Import your deck list and I'll analyze it in detail, or describe a commander and I'll build around them. What shall we create?",
    placeholder: "Describe a deck idea, ask for improvements, or paste a card list...",
  },
  arbiter: {
    name: "Arbiter", title: "Rules Engine", icon: "⚖",
    color: "#c4a245", dim: "rgba(196,162,69,0.10)", border: "rgba(196,162,69,0.30)", glow: "rgba(196,162,69,0.18)",
    prompt: ARBITER_PROMPT,
    greeting: "I am the Rules Arbiter — a deterministic execution engine built from the MTG Comprehensive Rules. Describe a board state, a rules interaction, or a sequence of events. I will process it through the formal execution model: would-event identification, replacement effects, trigger detection, SBA processing, and priority assignment. No intuition. No guessing.",
    placeholder: "Describe a board state or interaction... e.g. 'Leyline is out. A creature dies. Does its trigger fire?'",
  },
};

const QUICK = {
  nissa:   ["How does the stack work?","Explain commander damage","How do triggers work?","What are state-based actions?","Explain combat phase order"],
  karn:    ["Analyze my curve","Suggest 10 cards to cut","What are my win conditions?","Improve my ramp package","Find budget alternatives","Suggest synergy upgrades"],
  arbiter: ["Does this trigger?","Who has priority?","Apply SBAs","Check replacement effects","What resolves next?","Run the state assessor"],
};

/* ── Scryfall ── */
const _C = {};
async function fetchCard(name) {
  if (name in _C) return _C[name];
  try {
    const r = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!r.ok) return (_C[name] = null);
    const d = await r.json();
    // Build oracle text — for DFCs/split, concatenate both faces with a separator
    let oracle = d.oracle_text || "";
    if (!oracle && d.card_faces?.length) {
      oracle = d.card_faces
        .map(f => `${f.name} — ${f.type_line || ""} ${f.mana_cost || ""}\n${f.oracle_text || ""}`)
        .join("\n//\n");
    }
    return (_C[name] = {
      id: d.id,
      rulings_uri: d.rulings_uri,
      name: d.name,
      image: d.image_uris?.normal || d.card_faces?.[0]?.image_uris?.normal || null,
      url: d.scryfall_uri,
      mana: d.mana_cost || d.card_faces?.[0]?.mana_cost || "",
      type: d.type_line || "",
      cmc: d.cmc ?? 0,
      oracle: oracle,
      power: d.power ?? d.card_faces?.[0]?.power ?? null,
      toughness: d.toughness ?? d.card_faces?.[0]?.toughness ?? null,
      loyalty: d.loyalty ?? d.card_faces?.[0]?.loyalty ?? null,
      keywords: d.keywords || [],
      prices: d.prices || {},
      legalities: d.legalities || {},
    });
  } catch { return (_C[name] = null); }
}

/* ── Scryfall rulings (WOTC Gatherer clarifications) ── */
const _R = {};
async function fetchCardRulings(cardId, rulingsUri) {
  if (!cardId) return [];
  if (cardId in _R) return _R[cardId];
  try {
    const url = rulingsUri || `https://api.scryfall.com/cards/${cardId}/rulings`;
    const r = await fetch(url);
    if (!r.ok) return (_R[cardId] = []);
    const d = await r.json();
    // Prefer WOTC-sourced rulings (official); fall back to all if none
    const wotc = (d.data || []).filter(r => r.source === "wotc");
    return (_R[cardId] = wotc.length ? wotc : (d.data || []));
  } catch { return (_R[cardId] = []); }
}

/* ── Scryfall card-name catalog (loaded once per session) ── */
let _CATALOG = null;
let _CATALOG_LOADING = null;
async function loadCardCatalog() {
  if (_CATALOG) return _CATALOG;
  if (_CATALOG_LOADING) return _CATALOG_LOADING;
  _CATALOG_LOADING = (async () => {
    try {
      const r = await fetch("https://api.scryfall.com/catalog/card-names");
      if (!r.ok) return (_CATALOG = new Map());
      const d = await r.json();
      const map = new Map();
      for (const name of (d.data || [])) {
        map.set(name.toLowerCase(), name);
        if (name.includes(" // ")) {
          const front = name.split(" // ")[0];
          map.set(front.toLowerCase(), name);
        }
      }
      _CATALOG = map;
      return map;
    } catch {
      return (_CATALOG = new Map());
    } finally {
      _CATALOG_LOADING = null;
    }
  })();
  return _CATALOG_LOADING;
}

function detectCardNamesInText(text, catalog) {
  if (!catalog || catalog.size === 0) return [];
  const found = new Set();
  const words = text.split(/(\s+|[.,;!?])/);
  const tokens = words.filter(w => /\S/.test(w));
  for (let i = 0; i < tokens.length; i++) {
    for (let n = Math.min(6, tokens.length - i); n >= 1; n--) {
      const candidate = tokens.slice(i, i + n).join(" ").replace(/[.,;!?]+$/, "");
      const lower = candidate.toLowerCase();
      if (catalog.has(lower)) {
        found.add(catalog.get(lower));
        i += n - 1;
        break;
      }
    }
  }
  return [...found];
}

/* ── Card context builder for API prompts ── */
async function buildCardContext(text, options = {}) {
  const { includeRulings = true, maxRulingsPerCard = 4 } = options;

  // Extract [[Card Name]] mentions — always trusted
  const mentioned = [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim());
  // Strip [[ ]] mentions out before catalog scanning to avoid double-detection
  const textWithoutBrackets = text.replace(/\[\[([^\]]+)\]\]/g, " ");
  // Use Scryfall catalog for accurate bare-name detection (no false positives)
  const catalog = await loadCardCatalog();
  const detected = detectCardNamesInText(textWithoutBrackets, catalog);
  const names = [...new Set([...mentioned, ...detected])];

  if (!names.length) return "";

  // Fetch all cards in parallel (with cache)
  const cards = await Promise.all(names.map(n => fetchCard(n)));
  const valid = cards.filter(Boolean);
  if (!valid.length) return "";

  // Fetch rulings in parallel if enabled
  let rulingsByCard = {};
  if (includeRulings) {
    const results = await Promise.all(
      valid.map(c => fetchCardRulings(c.id, c.rulings_uri))
    );
    valid.forEach((c, i) => { rulingsByCard[c.id] = results[i] || []; });
  }

  // Format each card's block
  const blocks = valid.map(c => {
    const stat = c.power !== null ? ` | ${c.power}/${c.toughness}`
               : c.loyalty !== null ? ` | Loyalty ${c.loyalty}`
               : "";
    const kw = c.keywords?.length ? `\nKeywords: ${c.keywords.join(", ")}` : "";
    let block = `[${c.name}] | ${c.mana || "—"} | ${c.type}${stat}${kw}\n${c.oracle || "(no Oracle text)"}`;

    const rulings = rulingsByCard[c.id] || [];
    if (rulings.length) {
      const top = rulings.slice(0, maxRulingsPerCard);
      const rulingsText = top.map(r => `• (${r.published_at}) ${r.comment}`).join("\n");
      block += `\n\nWOTC RULINGS:\n${rulingsText}`;
    }
    return block;
  });

  return `## CARDS REFERENCED (authoritative — use ONLY this text for card behavior)\n\n${blocks.join("\n\n---\n\n")}\n\n`;
}

/* ── Banlist post-processor: scans Karn responses for banned cards and flags them ── */
async function postProcessKarnResponse(text) {
  // Extract all [[Card]] mentions from Karn's response
  const mentioned = [...new Set(
    [...text.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim())
  )];
  if (!mentioned.length) return { text, bannedFlags: [] };

  // Fetch each card (cached) and check Commander legality
  const cards = await Promise.all(mentioned.map(n => fetchCard(n)));
  const banned = [];
  cards.forEach((c, i) => {
    if (!c) return;
    const status = c.legalities?.commander;
    if (status === "banned") banned.push({ name: c.name, mentionedAs: mentioned[i] });
  });

  if (!banned.length) return { text, bannedFlags: [] };

  // Append a flag block at the end of the response (preserves Karn's organization)
  const flagBlock = `\n\n---\n⚠ **BANLIST CHECK:** ${banned.length === 1 ? "This card is" : "These cards are"} currently banned in Commander per Scryfall data:\n${banned.map(b => `• [[${b.name}]]`).join("\n")}\n\nVerify on the official Commander RC site before including in your deck.`;

  return { text: text + flagBlock, bannedFlags: banned };
}

async function searchCards(q) {
  if (!q.trim()) return [];
  try {
    const r = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=edhrec&unique=cards`);
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).slice(0, 16).map(c => ({
      name: c.name,
      normal: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
      type: c.type_line || "",
      price: c.prices?.usd ? `$${parseFloat(c.prices.usd).toFixed(2)}` : "—",
    }));
  } catch { return []; }
}

async function fetchDeckData(cards) {
  const unique = [...new Set(cards.map(c => c.name))];
  const out = {};
  for (let i = 0; i < unique.length; i += 12) {
    await Promise.all(unique.slice(i, i + 12).map(async n => {
      const d = await fetchCard(n);
      if (d) out[n] = d;
    }));
    if (i + 12 < unique.length) await new Promise(r => setTimeout(r, 110));
  }
  return out;
}

/* ── Deck parsing ── */
function parseDeck(raw) {
  const cards = [];
  let section = "Mainboard";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^sideboard$/i.test(t)) { section = "Sideboard"; continue; }
    if (/^commander$/i.test(t)) { section = "Commander"; continue; }
    const sb = t.match(/^SB:\s*(\d+)x?\s+(.+)$/i);
    const nm = t.match(/^(\d+)x?\s+(.+?)(?:\s+\(.*\))?(?:\s+\d+)?$/);
    const m = sb || nm;
    if (m) cards.push({ qty: +m[1], name: m[2].trim(), section: sb ? "Sideboard" : section });
  }
  return cards;
}

function serializeDeck(cards) {
  return ["Commander","Mainboard","Sideboard"].map(g => {
    const grp = cards.filter(c => c.section === g);
    if (!grp.length) return "";
    return (g !== "Mainboard" ? `${g}\n` : "") + grp.map(c => `${c.qty} ${c.name}`).join("\n");
  }).filter(Boolean).join("\n\n");
}

/* ── Analytics ── */
const CLR = {
  W:{fill:"#f5f0cc",stroke:"#9a8a30",text:"#6a5a10"},
  U:{fill:"#9ec4e8",stroke:"#1a5a9a",text:"#0a3060"},
  B:{fill:"#888",stroke:"#444",text:"#111"},
  R:{fill:"#f07050",stroke:"#902010",text:"#601008"},
  G:{fill:"#68b868",stroke:"#206020",text:"#0e3a0e"},
};

function buildCurve(deckCards, cardData) {
  const c = {};
  for (const dc of deckCards.filter(d => d.section !== "Sideboard")) {
    const cd = cardData[dc.name];
    if (!cd || cd.type?.toLowerCase().includes("land")) continue;
    const b = String(Math.min(Math.floor(cd.cmc), 7));
    c[b] = (c[b] || 0) + dc.qty;
  }
  return c;
}

function buildColors(deckCards, cardData) {
  const c = {W:0,U:0,B:0,R:0,G:0};
  for (const dc of deckCards.filter(d => d.section !== "Sideboard")) {
    const mana = cardData[dc.name]?.mana || "";
    for (const sym of Object.keys(c))
      c[sym] += (mana.match(new RegExp(`\\{${sym}\\}`,"g")) || []).length * dc.qty;
  }
  return c;
}

function calcPrice(deckCards, cardData) {
  let total = 0;
  const list = [];
  for (const dc of deckCards) {
    const p = parseFloat(cardData[dc.name]?.prices?.usd || 0);
    total += p * dc.qty;
    if (p > 0.5) list.push({name: dc.name, price: p});
  }
  return {total: total.toFixed(2), list: list.sort((a,b) => b.price - a.price)};
}

function checkLegal(deckCards, cardData) {
  return deckCards.filter(dc => {
    const l = cardData[dc.name]?.legalities?.commander;
    return l === "banned" || l === "not_legal";
  }).map(dc => ({name: dc.name, status: cardData[dc.name]?.legalities?.commander}));
}

/* ── Storage ── */
async function sLoad(k) {
  try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; }
}
async function sSave(k, v) { try { await window.storage.set(k, JSON.stringify(v)); } catch {} }

/* ── Small components ── */
function Dots({color}) {
  return (
    <span style={{display:"inline-flex",gap:5,alignItems:"center"}}>
      {[0,1,2].map(i=><span key={i} style={{width:7,height:7,borderRadius:"50%",background:color,opacity:.75,animation:`mtgd 1.3s ${i*.18}s ease-in-out infinite`,display:"inline-block"}}/>)}
    </span>
  );
}

function CurveChart({curve}) {
  const labels=["0","1","2","3","4","5","6","7+"];
  const vals=labels.map((_,i)=>curve[String(i===7?7:i)]||0);
  const max=Math.max(...vals,1);
  return (
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height:88}}>
      {labels.map((l,i)=>{
        const v=vals[i],h=Math.round((v/max)*70);
        return (
          <div key={l} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            {v>0&&<span style={{fontSize:9,color:"#7a8090",lineHeight:1}}>{v}</span>}
            <div style={{flex:1,display:"flex",alignItems:"flex-end",width:"100%"}}>
              <div style={{width:"100%",height:h||0,background:"#7b9fd4",borderRadius:"2px 2px 0 0",minHeight:v>0?3:0}}/>
            </div>
            <span style={{fontSize:9,color:"#5a6070"}}>{l}</span>
          </div>
        );
      })}
    </div>
  );
}

function ColorPie({colors}) {
  const total=Object.values(colors).reduce((s,v)=>s+v,0)||1;
  const active=Object.entries(colors).filter(([,v])=>v>0);
  if(!active.length) return <div style={{fontSize:12,color:"#5a6070"}}>No colored mana symbols found.</div>;
  return (
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      {active.map(([sym,val])=>(
        <div key={sym} style={{display:"flex",alignItems:"center",gap:5}}>
          <div title={sym} style={{width:24,height:24,borderRadius:"50%",background:CLR[sym].fill,border:`2px solid ${CLR[sym].stroke}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,color:CLR[sym].text}}>
            {sym}
          </div>
          <span style={{fontSize:11,color:"#9ca3af"}}>{Math.round(val/total*100)}%</span>
        </div>
      ))}
    </div>
  );
}

/* ── Main ── */
export default function MTGAssistant() {
  const [agent, setAgent]   = useState("karn");
  const [histories, setHistories] = useState({nissa:[],karn:[],arbiter:[]});
  const [input, setInput]   = useState("");
  const [sending, setSending] = useState(false);

  const [savedDecks, setSavedDecks] = useState([]);
  const [activeDeckId, setActiveDeckId] = useState(null);
  const [centerView, setCenterView] = useState("chat");
  const [deckRaw, setDeckRaw] = useState("");
  const [deckName, setDeckName] = useState("My Deck");
  const [projectSearch, setProjectSearch] = useState("");
  const [projectRequested, setProjectRequested] = useState(false);

  const [rightTab, setRightTab] = useState("search");
  const [rightOpen, setRightOpen] = useState(true);
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState([]);
  const [searchLoad, setSearchLoad] = useState(false);
  const [previewCard, setPreviewCard] = useState(null);

  const [deckData, setDeckData] = useState({});
  const [deckDataLoad, setDeckDataLoad] = useState(false);

  const [tooltip, setTooltip] = useState(null);
  const [mobileTab, setMobileTab] = useState("chat");
  const [mobile, setMobile] = useState(window.innerWidth < 660);
  const [fastMode, setFastMode] = useState(false); // Arbiter Fast vs Full prompt

  const bodyRef  = useRef(null);
  const bottomRef= useRef(null);
  const searchTm = useRef(null);

  useEffect(()=>{ const h=()=>setMobile(window.innerWidth<660); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]);

  useEffect(()=>{
    (async()=>{
      const dec=await sLoad("mtg-decks-v2"); if(dec?.length) setSavedDecks(dec);
      const nc=await sLoad("mtg-chat-nissa"), kc=await sLoad("mtg-chat-karn"), arc=await sLoad("mtg-chat-arbiter");
      setHistories({nissa:nc||[],karn:kc||[],arbiter:arc||[]});
    })();
    // Warm the Scryfall card name catalog so first agent call doesn't pay the latency
    loadCardCatalog();
  },[]);

  useEffect(()=>{ sSave("mtg-chat-nissa",histories.nissa); },[histories.nissa]);
  useEffect(()=>{ sSave("mtg-chat-karn",histories.karn); },[histories.karn]);
  useEffect(()=>{ sSave("mtg-chat-arbiter",histories.arbiter); },[histories.arbiter]);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[histories,sending]);

  const cfg       = AGENTS[agent];
  const activeDeck= savedDecks.find(d=>d.id===activeDeckId);
  const deckCards = activeDeck?.cards||[];
  const hasData   = Object.keys(deckData).length>0;
  const curve     = hasData?buildCurve(deckCards,deckData):{};
  const colors    = hasData?buildColors(deckCards,deckData):{};
  const priceInfo = hasData?calcPrice(deckCards,deckData):null;
  const legalIssues=hasData?checkLegal(deckCards,deckData):[];
  const mainCount = deckCards.filter(c=>c.section!=="Sideboard").reduce((s,c)=>s+c.qty,0);

  const loadDeckData = async()=>{
    if(!deckCards.length||deckDataLoad||hasData) return;
    setDeckDataLoad(true);
    setDeckData(await fetchDeckData(deckCards));
    setDeckDataLoad(false);
  };

  const handleChipHover = async(name,e)=>{
    if(!bodyRef.current) return;
    const br=bodyRef.current.getBoundingClientRect(), er=e.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(er.right-br.left+10, br.width-230));
    const y=Math.max(0,Math.min(er.top-br.top-10,   br.height-330));
    setTooltip({name,image:_C[name]?.image||null,x,y});
    const d=await fetchCard(name);
    setTooltip(t=>t?.name===name?{...t,image:d?.image}:t);
  };

  const renderText=text=>text.split(/\[\[([^\]]+)\]\]/g).map((part,i)=>
    i%2===1
      ?<span key={i} style={{background:cfg.dim,border:`1px solid ${cfg.border}`,color:cfg.color,borderRadius:4,padding:"1px 6px",cursor:"pointer",fontStyle:"italic",fontSize:"0.87em"}}
          onMouseEnter={e=>handleChipHover(part,e)} onMouseLeave={()=>setTooltip(null)}
          onClick={()=>window.open(`https://scryfall.com/search?q=${encodeURIComponent('"'+part+'"')}`,"_blank")}>{part}</span>
      :<span key={i} style={{whiteSpace:"pre-wrap"}}>{part}</span>
  );

  const send=async(text,agentOverride,retryDepth=0)=>{
    const targetAgent=agentOverride||agent;
    const targetCfg=AGENTS[targetAgent];
    const t=(text||input).trim(); if(!t||sending) return;
    const userMsg={role:"user",content:t};
    // Only add user message on first attempt — retries don't add a new user turn
    const baseHistory = retryDepth === 0 ? [...histories[targetAgent], userMsg] : [...histories[targetAgent]];
    if (retryDepth === 0) {
      setHistories(p=>({...p,[targetAgent]:baseHistory}));
      if(agentOverride) setAgent(agentOverride);
      setInput("");
    }
    setSending(true);
    try {
      // Pick prompt: Arbiter respects Fast mode toggle
      let sys = (targetAgent === "arbiter" && fastMode)
        ? ARBITER_PROMPT_FAST
        : targetCfg.prompt;
      if(targetAgent==="karn"&&deckCards.length) sys+=`\n\n## Active Deck: "${activeDeck?.name||"Unnamed"}"\n${serializeDeck(deckCards)}`;

      // Build card context with per-agent rulings policy
      let augmentedContent = t;
      if (!(targetAgent === "karn" && deckCards.length)) {
        const rulingsForAgent = targetAgent === "karn"
          ? { includeRulings: false }
          : { includeRulings: true, maxRulingsPerCard: targetAgent === "arbiter" ? 5 : 3 };
        try {
          const cardContext = await buildCardContext(t, rulingsForAgent);
          if (cardContext) augmentedContent = cardContext + "## USER QUESTION\n\n" + t;
        } catch { /* fall back to original text on any context error */ }
      }
      const apiMessages = retryDepth === 0
        ? [...histories[targetAgent], { role: "user", content: augmentedContent }]
        : [...baseHistory]; // for retries, baseHistory already includes the augmented exchange

      const res=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:2500,system:sys,messages:apiMessages}),
      });
      const data=await res.json();
      let reply=data.content?.[0]?.text||"No response received.";

      // V2.7 — Engine response chaining:
      // If Arbiter returns UNRESOLVED due to missing card text, auto-fetch the missing
      // cards (catalog scan catches them now) and retry ONCE with the augmented context.
      if (targetAgent === "arbiter" && retryDepth === 0 && /^UNRESOLVED/m.test(reply)) {
        // Look for card names the engine flagged as needed but missing
        const needsCards = /Oracle text|card text|isn't provided|not provided/i.test(reply);
        if (needsCards) {
          // The catalog scan in buildCardContext may have missed something — try a
          // wider net by extracting any [[Card]] from the reply itself
          const replyCards = [...reply.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
          if (replyCards.length) {
            // Construct an enriched retry prompt that explicitly includes the named cards
            const enrichedText = t + "\n\n[Auto-retry: include Oracle text for " + replyCards.join(", ") + "]";
            setHistories(p=>({...p,[targetAgent]:[...baseHistory,{role:"assistant",content:reply + "\n\n— Auto-retrying with explicit card context —"}]}));
            // Recursive retry with depth=1 (one retry max)
            return send(enrichedText, targetAgent, 1);
          }
        }
      }

      // V2.6 — Banlist post-processing for Karn responses
      if (targetAgent === "karn") {
        try {
          const processed = await postProcessKarnResponse(reply);
          reply = processed.text;
        } catch { /* if banlist check fails, deliver the unmodified reply */ }
      }

      setHistories(p=>({...p,[targetAgent]:[...baseHistory,{role:"assistant",content:reply}]}));
    } catch {
      setHistories(p=>({...p,[targetAgent]:[...baseHistory,{role:"assistant",content:"Connection error. Please try again."}]}));
    }
    setSending(false);
  };

  const explainWithNissa=(ruling)=>{
    // Pass the full Arbiter ruling (up to ~2500 chars) so Nissa can explain each section
    const excerpt=ruling.length>2500?ruling.slice(0,2500)+"\n[...]":ruling;
    send(`The Arbiter engine returned this ruling. Translate it into plain English for a player at the table — explain what's happening, why the rules apply this way, and what the practical takeaway is. Stay accurate; don't soften the verdict. Reference the same rules in your explanation.\n\n---\n\n${excerpt}`,"nissa");
  };

  const importDeck=()=>{
    // Strip sentinel markers if present (from "Load from Project" responses)
    let raw = deckRaw;
    const sentinelMatch = raw.match(/<<<DECK_BEGIN(?::\s*([^>]+))?>>>([\s\S]*?)<<<DECK_END>>>/);
    if (sentinelMatch) {
      raw = sentinelMatch[2].trim();
      // Auto-populate the deck name from the sentinel if user didn't set one
      if (sentinelMatch[1] && deckName === "My Deck") setDeckName(sentinelMatch[1].trim());
    }
    const cards=parseDeck(raw); if(!cards.length) return;
    const nm=deckName.trim()||projectSearch.trim()||"My Deck";
    const deck={id:Date.now().toString(),name:nm,cards};
    const updated=[...savedDecks,deck];
    setSavedDecks(updated); sSave("mtg-decks-v2",updated);
    setActiveDeckId(deck.id); setDeckData({});
    setCenterView("chat"); setDeckRaw(""); setDeckName("My Deck");
    setProjectSearch(""); setProjectRequested(false);
  };

  const loadFromProject=()=>{
    const name=projectSearch.trim(); if(!name) return;
    const prompt=`[DECK_REQUEST] ${name}

Retrieve the deck file from this project's knowledge matching the commander name above. Return the deck contents wrapped in sentinel markers per META_deck_format.md:

<<<DECK_BEGIN: ${name}>>>
[raw decklist content verbatim from the file]
<<<DECK_END>>>

If no matching file exists, list the available deck files. If multiple variants exist, ask which to load.`;
    if(typeof window.sendPrompt==="function") window.sendPrompt(prompt);
    setProjectRequested(true);
    setDeckName(name);
  };

  const deleteDeck=id=>{
    const updated=savedDecks.filter(d=>d.id!==id);
    setSavedDecks(updated); sSave("mtg-decks-v2",updated);
    if(activeDeckId===id){setActiveDeckId(null);setDeckData({});}
  };

  const exportDeck=()=>{
    if(!deckCards.length) return;
    const url=URL.createObjectURL(new Blob([serializeDeck(deckCards)],{type:"text/plain"}));
    const a=document.createElement("a"); a.href=url; a.download=`${activeDeck?.name||"deck"}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const exportChat=()=>{
    const lines=histories[agent].map(m=>`[${m.role==="user"?"You":cfg.name}]\n${m.content}`).join("\n\n---\n\n");
    const url=URL.createObjectURL(new Blob([lines],{type:"text/plain"}));
    const a=document.createElement("a"); a.href=url; a.download=`mtg-chat-${agent}.txt`; a.click(); URL.revokeObjectURL(url);
  };

  const clearChat=()=>{ setHistories(p=>({...p,[agent]:[]})); sSave(`mtg-chat-${agent}`,[]);};

  const handleSearch=q=>{
    setSearchQ(q); clearTimeout(searchTm.current);
    if(!q.trim()){setSearchRes([]);return;}
    searchTm.current=setTimeout(async()=>{ setSearchLoad(true); setSearchRes(await searchCards(q)); setSearchLoad(false); },480);
  };

  useEffect(()=>{ if(mobileTab==="search") setRightTab("search"); if(mobileTab==="stats") setRightTab("stats"); },[mobileTab]);

  /* Theme */
  const BG="#070a12",BG2="#090c18",BG3="#0c1020",LINE="#1a1e30",TEXT="#cfc5ae",MUTED="#5a6070",GOLD="#c4a245";
  const F="'Georgia','Palatino Linotype',serif";
  const sb=(outline)=>({width:"100%",padding:"6px 8px",borderRadius:5,fontFamily:F,fontSize:11,cursor:"pointer",marginBottom:4,textAlign:"left",border:`1px solid ${outline?LINE:cfg.border}`,background:outline?"transparent":cfg.dim,color:outline?MUTED:cfg.color});
  const pb=(primary,sm)=>({padding:sm?"5px 10px":"7px 16px",borderRadius:5,fontFamily:F,fontSize:sm?11:13,cursor:"pointer",border:primary?"none":`1px solid ${cfg.border}`,background:primary?cfg.color:"transparent",color:primary?"#fff":cfg.color});

  const showLeft  =!mobile||mobileTab==="decks";
  const showCenter=!mobile||mobileTab==="chat";
  const showRight =(!mobile&&rightOpen)||mobileTab==="search"||mobileTab==="stats";

  return (
    <div style={{fontFamily:F,background:BG,color:TEXT,height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <style>{`
        @keyframes mtgd{0%,80%,100%{transform:scale(.5);opacity:.3}40%{transform:scale(1);opacity:.9}}
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#070a12}::-webkit-scrollbar-thumb{background:#1e2235;border-radius:2px}
        input:focus,textarea:focus{border-color:#2a3050!important;outline:none}button:hover{opacity:.82}
      `}</style>

      {/* Header */}
      <div style={{padding:"9px 16px",borderBottom:`1px solid ${LINE}`,background:BG2,display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <span style={{fontFamily:F,fontSize:16,fontWeight:700,color:GOLD,letterSpacing:"0.05em"}}>✦ MTG Assistant</span>
        <div style={{marginLeft:"auto",display:"flex",gap:8,alignItems:"center"}}>
          {!mobile&&!rightOpen&&<button onClick={()=>setRightOpen(true)} style={pb(false,true)}>Show Panel ›</button>}
          {agent==="arbiter"&&<button onClick={()=>setFastMode(!fastMode)} title={fastMode?"Fast: compressed prompt, lower cost, slight accuracy drop":"Full: complete engine prompt, max accuracy"} style={{...pb(false,true),background:fastMode?cfg.dim:"transparent",borderColor:cfg.border,color:cfg.color}}>{fastMode?"⚡ Fast":"◇ Full"}</button>}
          {!mobile&&<><button onClick={exportChat} style={pb(false,true)}>Export Chat</button><button onClick={clearChat} style={pb(false,true)}>Clear Chat</button></>}
        </div>
      </div>

      {/* Body */}
      <div ref={bodyRef} style={{flex:1,display:"flex",overflow:"hidden",position:"relative"}}>

        {/* Left sidebar */}
        {showLeft&&(
          <div style={{width:mobile?"100%":172,flexShrink:0,borderRight:mobile?"none":`1px solid ${LINE}`,background:BG2,padding:12,display:"flex",flexDirection:"column",gap:14,overflowY:"auto"}}>
            <div>
              <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Agent</div>
              {Object.entries(AGENTS).map(([key,a])=>(
                <button key={key} style={{width:"100%",padding:"8px 10px",marginBottom:5,borderRadius:6,border:`1px solid ${key===agent?a.border:LINE}`,background:key===agent?a.dim:"transparent",color:key===agent?a.color:MUTED,cursor:"pointer",textAlign:"left",fontFamily:F,display:"flex",alignItems:"center",gap:8,boxShadow:key===agent?`0 0 8px ${a.glow}`:"none"}}
                  onClick={()=>{setAgent(key);setCenterView("chat");if(mobile)setMobileTab("chat");}}>
                  <span style={{fontSize:16}}>{a.icon}</span>
                  <div><div style={{fontSize:13,fontWeight:700}}>{a.name}</div><div style={{fontSize:10,opacity:.65}}>{a.title}</div></div>
                </button>
              ))}
            </div>
            <div>
              <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Saved Decks</div>
              {savedDecks.map(d=>(
                <div key={d.id} style={{display:"flex",alignItems:"center",gap:4,marginBottom:4}}>
                  <button style={{flex:1,padding:"6px 8px",borderRadius:5,border:`1px solid ${d.id===activeDeckId?cfg.border:LINE}`,background:d.id===activeDeckId?cfg.dim:"transparent",color:d.id===activeDeckId?cfg.color:TEXT,cursor:"pointer",fontSize:11,fontFamily:F,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                    onClick={()=>{setActiveDeckId(d.id);setDeckData({});if(mobile)setMobileTab("chat");}}>
                    {d.name}
                  </button>
                  <button onClick={()=>deleteDeck(d.id)} style={{background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:16,lineHeight:1,padding:"0 3px",flexShrink:0}}>×</button>
                </div>
              ))}
              <button style={sb(false)} onClick={()=>{setCenterView("import");if(mobile)setMobileTab("chat");}}>+ Import Deck</button>
              {activeDeckId&&<>
                <button style={sb(true)} onClick={()=>{setCenterView("deck");if(mobile)setMobileTab("chat");}}>View Deck</button>
                <button style={sb(true)} onClick={exportDeck}>↓ Export .txt</button>
              </>}
            </div>
            {mobile&&<div style={{marginTop:"auto",display:"flex",flexDirection:"column",gap:5}}><button style={sb(true)} onClick={exportChat}>Export Chat</button><button style={sb(true)} onClick={clearChat}>Clear Chat</button></div>}
          </div>
        )}

        {/* Center */}
        {showCenter&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
            {centerView==="import"?(
              <div style={{flex:1,overflowY:"auto",padding:20}}>
                <div style={{maxWidth:520,margin:"0 auto"}}>
                  <div style={{fontFamily:F,fontSize:18,color:"#e0d6be",marginBottom:14}}>Import Deck</div>

                  {/* Load from Project */}
                  <div style={{background:BG3,border:`1px solid ${cfg.border}`,borderRadius:8,padding:14,marginBottom:18}}>
                    <div style={{fontSize:13,fontWeight:700,color:cfg.color,fontFamily:F,marginBottom:4}}>Load from Project</div>
                    <div style={{fontSize:11,color:MUTED,marginBottom:10,lineHeight:1.65}}>
                      If you've uploaded deck files to this project named by commander (e.g. <span style={{color:cfg.color,fontFamily:"monospace"}}>"Atraxa, Praetors' Voice.txt"</span>), enter the commander name and Claude will retrieve it automatically.
                    </div>
                    <div style={{display:"flex",gap:8,marginBottom: projectRequested?10:0}}>
                      <input value={projectSearch} onChange={e=>{setProjectSearch(e.target.value);setProjectRequested(false);}}
                        onKeyDown={e=>{if(e.key==="Enter")loadFromProject();}}
                        placeholder="e.g. Atraxa, Praetors' Voice"
                        style={{flex:1,padding:"7px 10px",background:BG,border:`1px solid ${LINE}`,borderRadius:5,color:TEXT,fontSize:13,fontFamily:F}}/>
                      <button onClick={loadFromProject} disabled={!projectSearch.trim()}
                        style={{...pb(true,true),opacity:projectSearch.trim()?1:.45,whiteSpace:"nowrap"}}>
                        Request Deck
                      </button>
                    </div>
                    {projectRequested&&(
                      <div style={{padding:"10px 12px",borderRadius:6,background:cfg.dim,border:`1px solid ${cfg.border}`,fontSize:12,color:cfg.color,lineHeight:1.6}}>
                        ↑ Sent to chat — Claude will return your deck list above. <strong>Copy Claude's full response</strong> and paste it into the field below, then click Import.
                      </div>
                    )}
                  </div>

                  {/* Manual import */}
                  <div style={{fontSize:11,color:MUTED,marginBottom:6,fontFamily:F}}>Or paste a deck list manually:</div>
                  <input value={deckName} onChange={e=>setDeckName(e.target.value)} placeholder="Deck name..."
                    style={{width:"100%",padding:"8px 12px",marginBottom:10,background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:14,fontFamily:F}}/>
                  <div style={{fontSize:11,color:MUTED,marginBottom:8,lineHeight:1.6}}>
                    Formats: <code style={{fontFamily:"monospace",color:cfg.color}}>4 Lightning Bolt</code> · <code style={{fontFamily:"monospace",color:cfg.color}}>SB: 2 Negate</code> · Use <code style={{fontFamily:"monospace",color:cfg.color}}>Commander</code> or <code style={{fontFamily:"monospace",color:cfg.color}}>Sideboard</code> on their own lines.
                  </div>
                  <textarea value={deckRaw} onChange={e=>setDeckRaw(e.target.value)}
                    placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\n38 lands...\n60 spells...\n\nSideboard\n2 Tormod's Crypt"}
                    style={{width:"100%",minHeight:220,padding:"10px 12px",background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:12,fontFamily:"monospace",resize:"vertical",lineHeight:1.65}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={importDeck} disabled={!deckRaw.trim()} style={{...pb(true),opacity:deckRaw.trim()?1:.45}}>Import Deck</button>
                    <button onClick={()=>{setCenterView("chat");setProjectRequested(false);}} style={pb(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            ):centerView==="deck"?(
              <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:`1px solid ${LINE}`}}>
                  <span style={{fontFamily:F,fontSize:17,color:"#e0d6be"}}>{activeDeck?.name}</span>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={()=>setCenterView("chat")} style={pb(true,true)}>← Chat</button>
                    <button onClick={exportDeck} style={pb(false,true)}>Export</button>
                  </div>
                </div>
                {["Commander","Mainboard","Sideboard"].map(g=>{
                  const grp=deckCards.filter(c=>c.section===g); if(!grp.length) return null;
                  return (
                    <div key={g} style={{marginBottom:16}}>
                      <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:5,paddingBottom:4,borderBottom:`1px solid ${LINE}`}}>
                        {g} ({grp.reduce((s,c)=>s+c.qty,0)})
                      </div>
                      {grp.map((c,i)=>(
                        <div key={i} style={{display:"flex",gap:8,padding:"3px 0",alignItems:"center"}}>
                          <span style={{color:MUTED,fontSize:12,width:24,textAlign:"right",flexShrink:0}}>{c.qty}×</span>
                          <span style={{fontSize:13,color:TEXT,cursor:"pointer",borderBottom:`1px dotted ${cfg.border}`}}
                            onMouseEnter={e=>handleChipHover(c.name,e)} onMouseLeave={()=>setTooltip(null)}
                            onClick={()=>window.open(`https://scryfall.com/search?q=${encodeURIComponent('"'+c.name+'"')}`,"_blank")}>
                            {c.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ):(
              <>
                {activeDeckId&&(
                  <div style={{padding:"6px 14px",background:cfg.dim,borderBottom:`1px solid ${cfg.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:11,color:cfg.color}}>Deck: {activeDeck?.name} · {mainCount} cards</span>
                    <button onClick={()=>setCenterView("deck")} style={{background:"none",border:"none",color:cfg.color,cursor:"pointer",fontSize:11,fontFamily:F}}>View ›</button>
                  </div>
                )}
                <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:16}}>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:3}}>
                    <span style={{fontSize:10,color:cfg.color,marginLeft:2}}>{cfg.name}</span>
                    <div style={{maxWidth:"82%",padding:"12px 15px",borderRadius:"12px 12px 12px 3px",background:BG3,border:`1px solid ${cfg.border}`,fontSize:14,color:TEXT,lineHeight:1.72}}>{cfg.greeting}</div>
                  </div>
                  {histories[agent].map((m,i)=>(
                    <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",gap:3}}>
                      {m.role==="assistant"&&<span style={{fontSize:10,color:cfg.color,marginLeft:2}}>{cfg.name}</span>}
                      <div style={{maxWidth:"82%",padding:"11px 15px",borderRadius:m.role==="user"?"12px 12px 3px 12px":"12px 12px 12px 3px",background:m.role==="user"?"#101530":BG3,border:`1px solid ${m.role==="user"?"#1e2445":cfg.border}`,fontSize:14,color:TEXT,lineHeight:1.72}}>
                        {m.role==="assistant"?renderText(m.content):<span style={{whiteSpace:"pre-wrap"}}>{m.content}</span>}
                      </div>
                    </div>
                  ))}
                  {sending&&(
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-start",gap:3}}>
                      <span style={{fontSize:10,color:cfg.color,marginLeft:2}}>{cfg.name}</span>
                      <div style={{padding:"14px 16px",borderRadius:"12px 12px 12px 3px",background:BG3,border:`1px solid ${cfg.border}`}}><Dots color={cfg.color}/></div>
                    </div>
                  )}
                  <div ref={bottomRef}/>
                </div>
                <div style={{padding:"8px 14px",borderTop:`1px solid ${LINE}`,background:BG2,display:"flex",gap:5,flexWrap:"wrap",flexShrink:0}}>
                  {QUICK[agent].map(q=>(
                    <button key={q} onClick={()=>send(q)} style={{padding:"4px 10px",borderRadius:12,border:`1px solid ${cfg.border}`,background:cfg.dim,color:cfg.color,cursor:"pointer",fontSize:11,fontFamily:F,whiteSpace:"nowrap"}}>{q}</button>
                  ))}
                </div>
                <div style={{padding:"10px 14px 14px",borderTop:`1px solid ${LINE}`,background:BG2,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0}}>
                  <textarea value={input} onChange={e=>setInput(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
                    placeholder={cfg.placeholder} rows={2} disabled={sending}
                    style={{flex:1,padding:"10px 13px",background:BG3,border:`1px solid ${LINE}`,borderRadius:9,color:TEXT,fontSize:14,fontFamily:F,resize:"none",lineHeight:1.5}}/>
                  <button onClick={()=>send()} disabled={!input.trim()||sending}
                    style={{width:42,height:42,borderRadius:9,border:"none",background:cfg.color,color:"#fff",fontSize:20,cursor:"pointer",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",opacity:!input.trim()||sending?.4:1}}>
                    ↑
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Right panel */}
        {showRight&&(
          <div style={{width:mobile?"100%":262,flexShrink:0,borderLeft:mobile?"none":`1px solid ${LINE}`,background:BG2,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{display:"flex",borderBottom:`1px solid ${LINE}`,flexShrink:0}}>
              {[["search","Search"],["stats","Stats"],["legal","Legal"]].map(([key,label])=>(
                <button key={key} style={{flex:1,padding:"9px 2px",background:rightTab===key?cfg.dim:"transparent",border:"none",borderBottom:rightTab===key?`2px solid ${cfg.color}`:"2px solid transparent",color:rightTab===key?cfg.color:MUTED,cursor:"pointer",fontSize:12,fontFamily:F}}
                  onClick={()=>{setRightTab(key);if(key!=="search")loadDeckData();}}>
                  {label}
                </button>
              ))}
              {!mobile&&<button onClick={()=>setRightOpen(false)} style={{padding:"9px 10px",background:"none",border:"none",color:MUTED,cursor:"pointer",fontSize:14,flexShrink:0}}>×</button>}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:14}}>

              {rightTab==="search"&&(
                <div>
                  <input value={searchQ} onChange={e=>handleSearch(e.target.value)} placeholder="Search MTG cards..."
                    style={{width:"100%",padding:"8px 10px",background:BG3,border:`1px solid ${LINE}`,borderRadius:6,color:TEXT,fontSize:12,fontFamily:F,marginBottom:10}}/>
                  {searchLoad&&<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:8}}>Searching...</div>}
                  {previewCard&&(
                    <div style={{marginBottom:12,textAlign:"center"}}>
                      <img src={previewCard.normal} alt={previewCard.name} style={{width:"100%",maxWidth:210,borderRadius:8}}/>
                      <div style={{fontSize:10,color:MUTED,marginTop:4}}>{previewCard.name}</div>
                      <button onClick={()=>setPreviewCard(null)} style={{fontSize:10,color:MUTED,background:"none",border:"none",cursor:"pointer"}}>× close</button>
                    </div>
                  )}
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {searchRes.map((c,i)=>(
                      <div key={i} style={{padding:"6px 9px",borderRadius:5,border:`1px solid ${LINE}`,background:BG3,cursor:"pointer"}}
                        onMouseEnter={e=>{if(c.normal&&bodyRef.current){const br=bodyRef.current.getBoundingClientRect(),er=e.currentTarget.getBoundingClientRect();setTooltip({name:c.name,image:c.normal,x:Math.max(0,er.left-br.left-225),y:Math.max(0,er.top-br.top)});}}}
                        onMouseLeave={()=>setTooltip(null)}
                        onClick={()=>setPreviewCard(c)}>
                        <div style={{fontSize:12,color:TEXT}}>{c.name}</div>
                        <div style={{fontSize:10,color:MUTED,display:"flex",justifyContent:"space-between",marginTop:2}}>
                          <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"70%"}}>{c.type}</span>
                          <span style={{color:GOLD,flexShrink:0}}>{c.price}</span>
                        </div>
                      </div>
                    ))}
                    {!searchLoad&&!searchRes.length&&searchQ&&<div style={{textAlign:"center",color:MUTED,fontSize:12,padding:10}}>No results found.</div>}
                  </div>
                </div>
              )}

              {rightTab==="stats"&&(
                <div>
                  {!deckCards.length?(
                    <div style={{textAlign:"center",color:MUTED,fontSize:12,padding:20}}>Import a deck to see analytics.</div>
                  ):!hasData?(
                    <div style={{textAlign:"center",padding:20}}>
                      <button onClick={loadDeckData} disabled={deckDataLoad} style={{...pb(true),opacity:deckDataLoad?.5:1}}>{deckDataLoad?"Loading...":"Load Analytics"}</button>
                      {deckDataLoad&&<div style={{fontSize:11,color:MUTED,marginTop:8}}>Fetching card data from Scryfall…</div>}
                    </div>
                  ):(
                    <div style={{display:"flex",flexDirection:"column",gap:18}}>
                      <div>
                        <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Mana Curve</div>
                        <CurveChart curve={curve}/>
                      </div>
                      <div>
                        <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Color Distribution</div>
                        <ColorPie colors={colors}/>
                      </div>
                      {priceInfo&&(
                        <div>
                          <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:6}}>Estimated Price</div>
                          <div style={{fontSize:22,color:GOLD,fontFamily:F,marginBottom:2}}>${priceInfo.total}</div>
                          <div style={{fontSize:10,color:MUTED,marginBottom:10}}>via Scryfall · TCGPlayer market</div>
                          {priceInfo.list.slice(0,6).map((c,i)=>(
                            <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"3px 0",fontSize:11,borderBottom:`1px solid ${LINE}`}}>
                              <span style={{color:TEXT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"74%"}}>{c.name}</span>
                              <span style={{color:GOLD,flexShrink:0}}>${c.price.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {rightTab==="legal"&&(
                <div>
                  <div style={{fontSize:9,color:MUTED,textTransform:"uppercase",letterSpacing:"0.12em",marginBottom:12}}>Commander Legality</div>
                  {!deckCards.length?(
                    <div style={{color:MUTED,fontSize:12}}>Import a deck to check legality.</div>
                  ):!hasData?(
                    <div style={{textAlign:"center"}}>
                      <button onClick={loadDeckData} disabled={deckDataLoad} style={{...pb(true),opacity:deckDataLoad?.5:1}}>{deckDataLoad?"Checking...":"Check Legality"}</button>
                    </div>
                  ):legalIssues.length===0?(
                    <div style={{padding:"10px 12px",borderRadius:6,background:"rgba(74,155,106,0.1)",border:"1px solid rgba(74,155,106,0.3)",color:"#4a9b6a",fontSize:13}}>
                      ✓ All cards appear Commander legal.
                    </div>
                  ):(
                    <div>
                      <div style={{padding:"8px 12px",borderRadius:6,background:"rgba(190,50,40,0.1)",border:"1px solid rgba(190,50,40,0.3)",color:"#c84848",fontSize:12,marginBottom:12}}>
                        {legalIssues.length} card{legalIssues.length>1?"s":""} flagged
                      </div>
                      {legalIssues.map((c,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",fontSize:12,borderBottom:`1px solid ${LINE}`}}>
                          <span style={{color:TEXT}}>{c.name}</span>
                          <span style={{color:"#c84848",textTransform:"capitalize"}}>{c.status?.replace("_"," ")}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{fontSize:10,color:MUTED,marginTop:14,lineHeight:1.55}}>Based on Scryfall data. Verify bans before tournaments.</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Hover tooltip */}
        {tooltip?.image&&(
          <div style={{position:"absolute",left:tooltip.x,top:tooltip.y,zIndex:50,pointerEvents:"none",borderRadius:8,overflow:"hidden",boxShadow:"0 8px 36px rgba(0,0,0,0.85)",border:`1px solid ${LINE}`}}>
            <img src={tooltip.image} alt={tooltip.name} style={{width:210,display:"block"}}/>
          </div>
        )}
      </div>

      {/* Mobile tab bar */}
      {mobile&&(
        <div style={{borderTop:`1px solid ${LINE}`,background:BG2,display:"flex",flexShrink:0}}>
          {[["chat","Chat","💬"],["search","Search","🔍"],["stats","Stats","📊"],["decks","Decks","📋"]].map(([tab,label,icon])=>(
            <button key={tab} style={{flex:1,padding:"8px 0",background:mobileTab===tab?cfg.dim:"transparent",border:"none",borderTop:mobileTab===tab?`2px solid ${cfg.color}`:"2px solid transparent",color:mobileTab===tab?cfg.color:MUTED,cursor:"pointer",fontSize:11,fontFamily:F,display:"flex",flexDirection:"column",alignItems:"center",gap:2}}
              onClick={()=>setMobileTab(tab)}>
              <span>{icon}</span><span>{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
