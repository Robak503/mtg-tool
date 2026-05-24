# MTG Judge Engine — Phone App Roadmap
## Goal: Personal Commander ruling app, clean mobile UI
## From current state to working phone app

---

# WHAT WE HAVE

- 91-file judge engine codex (complete rules coverage)
- 30,732 Commander card database (Oracle text, color identity, type line, keywords)
- Query router and layer index

---

# WHAT THE APP DOES

You open it on your phone, type:
> "Atraxa, Praetors' Voice attacks. The defending player controls a creature with deathtouch. Does Atraxa die?"

The app:
1. Detects card names in your question
2. Fetches Oracle text for each card from Scryfall
3. Sends your question + card text + relevant rules to Claude API
4. Returns a clear ruling with reasoning

---

# TECHNOLOGY STACK (recommended)

| Layer | Technology | Why |
|---|---|---|
| Phone UI | React PWA | Runs in phone browser, installable to home screen, no App Store needed |
| Hosting | Vercel (free tier) | One command to deploy, free, handles serverless functions |
| Backend API | Vercel serverless function | Keeps your Claude API key secret, handles requests |
| Card data | Live Scryfall API | Always current, no file to maintain |
| Rules engine | Claude API (claude-sonnet) | The actual ruling logic |
| Rules context | Compressed codex system prompt | The judge engine compressed to ~20KB |

**PWA = Progressive Web App.** It's a website that behaves like an app. You visit it in Safari/Chrome on your phone, tap "Add to Home Screen," and it gets an icon like a real app. No App Store, no approval process, works on iPhone and Android.

---

# THE BUILD ROADMAP

## Phase 1 — Working prototype (1-2 sessions)
**Goal:** Type a question on your computer, get a ruling back in the terminal.

Steps:
1. Get a Claude API key from console.anthropic.com
2. Build `judge.py` — a Python script that:
   - Takes your question as input
   - Detects card names and fetches Oracle text from Scryfall
   - Builds a prompt using the rules codex as context
   - Calls Claude API
   - Prints the ruling
3. Test with 5-10 real Commander scenarios

**Deliverable:** Working command-line ruling tool

---

## Phase 2 — Web interface (1 session)
**Goal:** A webpage you can use on your computer browser.

Steps:
1. Build a single React page (text input + ruling output)
2. Add a Vercel serverless function to handle the Claude API call
3. Deploy to Vercel (free, takes ~5 minutes)
4. Test in browser

**Deliverable:** Working web app at a URL like `your-app.vercel.app`

---

## Phase 3 — Mobile UI (1-2 sessions)
**Goal:** Clean phone interface, feels like a real app.

Steps:
1. Make the React UI mobile-first (large text, thumb-friendly buttons)
2. Add PWA configuration (app icon, offline support, "Add to Home Screen")
3. Card name auto-detection with visual chips
4. Ruling displayed in clean card format
5. History of recent rulings

**Deliverable:** App icon on your phone, works offline for card lookup

---

## Phase 4 — Quality of life (ongoing)
- Board state mode: add multiple cards with their positions (attacking, blocking, etc.)
- Format selector (Commander, cEDH, Brawl)
- Favorite rulings / bookmark system
- Share a ruling as an image
- Confidence indicator (how certain is the ruling)

---

# WHAT YOU NEED BEFORE STARTING

1. **Claude API key** — go to console.anthropic.com, sign up, create a key
   - Cost: ~$0.003 per ruling (fraction of a cent)
   - Recommended: set a $5/month spending limit to start

2. **Node.js** — for React and Vercel (download from nodejs.org)
   - You already have Python and VS Code so this is the only new install

3. **Vercel account** — free, sign up at vercel.com (use your GitHub account)

---

# NEXT IMMEDIATE STEP

Build Phase 1: the Python ruling script.

Once you have your Claude API key, paste it here and we build `judge.py` — the core engine that everything else is built on top of.

---

# THE SYSTEM PROMPT PLAN

The full codex is 91 files / ~450KB — too large to send with every query.

The plan is to compress the most critical rules into a ~20KB system prompt:
- The complete SBA list (L05)
- The casting procedure (L06 601)
- The priority/stack rules (L06 117)
- The layer system (L08 613)
- Commander-specific rules (L10 903)
- Keyword routing index (L07 702_t)

For edge cases, the app can fetch the specific codex file as additional context.

This compression pass is a separate build session — it produces `system_prompt.md`, the core of the ruling engine.

---

*Roadmap recorded: March 30, 2026*
*Current status: Phase 0 complete (codex + card data ready)*
*Next: Phase 1 — Python ruling script (needs Claude API key)*
