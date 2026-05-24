"""
================================================================================
  MTG COMMANDER JUDGE v5
================================================================================

SETUP:
  1. pip install anthropic
  2. Get key: https://console.anthropic.com/api-keys
  3. Windows CMD: set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
  4. python mtg_judge_v5.py

FILES NEEDED IN SAME FOLDER:
  scryfall_AH.json, scryfall_IP.json, scryfall_QZ.json
"""

import os, sys, json, re

try:
    import anthropic
except ImportError:
    print("Run: pip install anthropic")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CARD_FILES = [
    os.path.join(SCRIPT_DIR, "scryfall_AH.json"),
    os.path.join(SCRIPT_DIR, "scryfall_IP.json"),
    os.path.join(SCRIPT_DIR, "scryfall_QZ.json"),
]

# Official WotC rulings files (optional — tool works without them)
RULING_FILES = [
    os.path.join(SCRIPT_DIR, "scryfall_rulings_1.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_2.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_3.json"),
]

MAX_RULINGS_PER_CARD = 5  # Cap so prompts don't get too long
MODEL = "claude-sonnet-4-6"
MAX_CARDS = 8


RULES_PROMPT = """You are an expert Magic: The Gathering judge specializing in Commander (4-player Free-for-All).

CRITICAL DATA RULE: When card data is provided above, you MUST use ONLY that Oracle text.
Do NOT use your training memory of how a card works. The Oracle text provided is authoritative.
If the card data says "charge counters" do not say "lightning counters".
If the card data says "two charge counters" do not say "+1 damage".
Read the exact text. Use the exact text.

CRITICAL STYLE RULES — never break these:
- No parentheticals. Never write "(her controller)" or "(the caster)" or similar.
- No redundant clarifications. If you stated who gains life in the RULING, do not restate it in RESULT.
- No explanations of why something is true. Just state what happens.
- Maximum two sentences in RESULT. Often one is enough.

OUTPUT FORMAT:

RULING: [One clear sentence. No parentheticals. No redundant attribution.]

Only include RESULT if an opponent's spell or ability is on the stack
targeting or affecting the player or their permanents. Skip it entirely for:
- Rules questions ("does X work", "what happens if", "can I")
- Situations where the player is the one casting or activating
- State-of-the-game questions with no active threat on the stack

RESULT:
[One to two sentences. What happens as a result. No redundant clarifications.]

If the player asked what they can do, also include:

YOUR OPTIONS:
[Every option that needs a card: "If you have a [type of effect]: [what it does]"
No exceptions — every option needs the qualifier. End with "Pass and let it resolve".]


================================================================================
  MTG COMMANDER JUDGE v5
================================================================================

SETUP:
  1. pip install anthropic
  2. Get key: https://console.anthropic.com/api-keys
  3. Windows CMD: set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE
  4. python mtg_judge_v5.py

FILES NEEDED IN SAME FOLDER:
  scryfall_AH.json, scryfall_IP.json, scryfall_QZ.json
"""

import os, sys, json, re

try:
    import anthropic
except ImportError:
    print("Run: pip install anthropic")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CARD_FILES = [
    os.path.join(SCRIPT_DIR, "scryfall_AH.json"),
    os.path.join(SCRIPT_DIR, "scryfall_IP.json"),
    os.path.join(SCRIPT_DIR, "scryfall_QZ.json"),
]

# Official WotC rulings files (optional — tool works without them)
RULING_FILES = [
    os.path.join(SCRIPT_DIR, "scryfall_rulings_1.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_2.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_3.json"),
]

MAX_RULINGS_PER_CARD = 5  # Cap so prompts don't get too long
MODEL = "claude-sonnet-4-6"
MAX_CARDS = 8


RULES_PROMPT = """You are an expert Magic: The Gathering judge specializing in Commander (4-player Free-for-All).

CRITICAL DATA RULE: When card data is provided above, you MUST use ONLY that Oracle text.
Do NOT use your training memory of how a card works. The Oracle text provided is authoritative.
If the card data says "charge counters" do not say "lightning counters".
If the card data says "two charge counters" do not say "+1 damage".
Read the exact text. Use the exact text.

CRITICAL STYLE RULES — never break these:
- No parentheticals. Never write "(her controller)" or "(the caster)" or similar.
- No redundant clarifications. If you stated who gains life in the RULING, do not restate it in RESULT.
- No explanations of why something is true. Just state what happens.
- Maximum two sentences in RESULT. Often one is enough.

OUTPUT FORMAT — always use exactly this structure:

Do NOT include a YOUR OPTIONS section unless the player explicitly asks
"what are my options", "what can I do", "how do I respond", or similar.
If they just ask what happens, only show RULING and RESULT.


RULING: [One clear sentence stating what happens]

RESULT:
[One to two sentences. What resolves and the key result. Who gains/loses what.]

YOUR OPTIONS: (only include this section if the player asked what they can do)
[List options with "If you have a [type]:" prefix for anything requiring a specific card.
Always available options (like sacrificing with a sacrifice outlet) still need the qualifier.]

YOUR OPTIONS:
[List each category of response available. Every option that requires having a
specific type of card must start with "If you have a [type of effect]:" followed
by what it does. Only skip this prefix for options that are always available to
any player regardless of cards (like passing priority or sacrificing your own permanent).

Good examples:
  - If you have a counterspell: counter the spell
  - If you have a hexproof or shroud effect: protect the creature before it resolves
  - If you have a bounce effect: return the creature to your hand in response
  - If you have a sacrifice outlet: sacrifice the creature in response to deny the effect
  - Pass and let it resolve

Never list an option that is impossible for the player. For example:
  - Do NOT suggest "return to hand" unless a bounce effect exists as an option
  - Do NOT suggest targeting your own creature if it has shroud
  - Do NOT suggest countering a spell if it says it can't be countered]

RESULT:
[One to two sentences maximum. State what resolves and the key result.
Assume the player knows how Magic works — no need to explain basic concepts.
Be precise about who gains life, who loses life, who draws cards, etc.
Never say "your opponent gains life" when you mean "the caster gains life" —
always specify which player the effect benefits or harms.]

---
Only include rule numbers if the player specifically asks for clarification.
No preamble. No closing remarks. No card suggestions. Under 120 words total.
Assume the player is an experienced Magic player. Keep it clean and direct.

---

RULES REFERENCE:

PRIORITY & STACK: Last-in-first-out. Both players pass priority before anything resolves.

CASTING (601): Cost locked in before payment (601.2f).
Cost reducers (like Baral, Chief of Compliance) reduce GENERIC mana costs only.
They cannot reduce colored mana symbols. A spell with no generic mana in its cost
gets no benefit from generic cost reducers. Example: {1}{U}{U} reduced by {1} = {U}{U}.
Example: {U}{U} is not reduced at all — there is no generic mana to remove.

TARGETS (115): "Target" keyword required for hexproof/shroud to apply.
All targets illegal on resolution = spell countered.
Some targets illegal = resolves for remaining legal targets.

TRIGGERS (603): Wait, then go on stack at next priority. APNAP order for simultaneous triggers.
Intervening-if condition checked at trigger AND resolution.

STATE-BASED ACTIONS (704): Checked whenever a player would get priority. All applicable
happen simultaneously. Key: lethal damage (704.5g), deathtouch (704.5h), 0 life (704.5a),
0 toughness (704.5f), 0 loyalty (704.5i), legend rule (704.5j).

DAMAGE (120): Marked on creatures. Lifelink simultaneous with damage, not a trigger.
Deathtouch = any nonzero damage is lethal for SBA.

LAYER SYSTEM (613): Copy → Control → Text → Type → Color → Abilities → P/T (7a-7d).
Timestamp order within each layer.

REPLACEMENT EFFECTS (614): "If X would, instead Y" — intercepts before event.

EMINENCE (triggered ability — official WotC ruling):
- Works while commander is in the command zone OR on the battlefield
- Commander must be in one of those two zones BOTH when the trigger fires AND when it resolves
- If commander moves zones between triggering and resolving, ability does nothing
- Example: Edgar Markov eminence triggers, then Edgar dies → trigger resolves but does nothing

COMMANDER RULES (903):
- 40 starting life
- Commander tax: +{2} per previous cast from command zone
- Commander to graveyard/exile: SBA offers command zone return — dies triggers still fire
- Commander to hand/library: replacement effect → command zone, never arrives in hand
- Commander damage: 21+ cumulative COMBAT damage from same commander = lose (704.6c)
  Never resets. Partners track separately. Ability damage does NOT count.

KEYWORDS:
- Hexproof: can't be targeted by opponents
- Shroud: can't be targeted by anyone including controller
- Protection from X: blocks Damage + Enchanting + Blocking + Targeting from X.
  Does NOT stop global effects, "choose", or sacrifice.
- Indestructible: survives destroy and lethal damage. Dies to -X/-X to 0, exile, sacrifice.
- Flash: cast any time you have priority
- Haste: attack and use {T} immediately
- Summoning sickness: can't attack or use {T}/{Q} unless controlled since start of your last turn
- Lifelink: damage causes life gain for the controller of the source, simultaneously
- Deathtouch: any nonzero damage this deals destroys the creature via SBA
- Trample: excess combat damage beyond lethal hits the player

PRECISION RULES FOR LIFE GAIN/LOSS:
- Always state which player gains or loses life
- "The controller of [card]" not "you" or "your opponent" when ambiguous
- Swords to Plowshares: the CONTROLLER OF THE EXILED CREATURE gains life equal to its power (not the caster)
- Soul's Fire, Fling, etc: the controller of the spell gains life or deals damage, not the target's controller

GOLDEN RULE (101.2): "Can't" unconditionally overrides "can"."""


def parse_mana_cost(mana_cost):
    """
    Parse a mana cost string like {1}{U}{U} and return a plain English breakdown.
    This helps the engine understand which parts are generic vs colored.
    Example: {1}{U}{U} -> "1 generic + UU colored (total CMC 3)"
    Example: {U}{U}    -> "UU colored, no generic (total CMC 2)"
    """
    import re
    if not mana_cost:
        return ""
    symbols = re.findall(r'[{]([^}]+)[}]', mana_cost)
    generic = 0
    colored = []
    for sym in symbols:
        if sym.isdigit():
            generic += int(sym)
        elif sym == 'X':
            colored.append('X')
        elif sym == 'C':
            colored.append('C')  # colorless
        else:
            colored.append(sym)
    parts = []
    if generic:
        parts.append(f"{generic} generic")
    if colored:
        parts.append(f"{''.join(colored)} colored")
    if not parts:
        return "(no cost)"
    total = generic + len([c for c in colored if c != 'X'])
    return f"{', '.join(parts)} (CMC {total})"


class CardDatabase:
    def __init__(self):
        self.index = {}

    def load(self):
        missing = [f for f in CARD_FILES if not os.path.exists(f)]
        if missing:
            print("ERROR: Missing card files:")
            for f in missing: print(f"  {f}")
            print("\nPut scryfall_AH.json, scryfall_IP.json, scryfall_QZ.json in the same folder.")
            sys.exit(1)

        print("Loading card database...", end="", flush=True)
        for fpath in CARD_FILES:
            with open(fpath, encoding="utf-8") as f:
                data = json.load(f)
            for card in data["cards"]:
                name = card.get("name", "")
                if name:
                    self.index[name.lower()] = card
                    for face in card.get("card_faces", []):
                        fn = face.get("name", "")
                        if fn and fn.lower() != name.lower():
                            self.index[fn.lower()] = card
        print(f" {len(self.index):,} cards ready.")

        # Load official rulings if available
        self.rulings = {}
        ruling_files_found = [f for f in RULING_FILES if os.path.exists(f)]
        if ruling_files_found:
            print("Loading official rulings...", end="", flush=True)
            for fpath in ruling_files_found:
                with open(fpath, encoding="utf-8") as f:
                    chunk = json.load(f)
                self.rulings.update(chunk)
            print(f" {len(self.rulings):,} cards with rulings.")
        else:
            print("  (No rulings files found — add scryfall_rulings_1/2/3.json for official WotC rulings)")
        print()

    def lookup(self, name):
        return self.index.get(name.strip().lower())

    def format_for_prompt(self, card):
        lines = [f"[{card['name']}]"]
        faces = card.get("card_faces")
        if faces:
            for face in faces:
                stat = ""
                if face.get("power") is not None: stat = f" | {face['power']}/{face['toughness']}"
                elif face.get("loyalty"): stat = f" | Loyalty: {face['loyalty']}"
                kw = ", ".join(face.get("keywords", []))
                raw_cost = face.get('mana_cost','')
                parsed = parse_mana_cost(raw_cost)
                cost_str = f"{raw_cost} [{parsed}]" if parsed else raw_cost
                lines.append(f"  {face.get('name','')} | {cost_str} | {face.get('type_line','')}{stat}")
                if kw: lines.append(f"  Keywords: {kw}")
                if face.get("oracle_text"): lines.append(f"  {face['oracle_text']}")
        else:
            stat = ""
            if card.get("power") is not None: stat = f" | {card['power']}/{card['toughness']}"
            elif card.get("loyalty"): stat = f" | Loyalty: {card['loyalty']}"
            elif card.get("defense"): stat = f" | Defense: {card['defense']}"
            kw = ", ".join(card.get("keywords", []))
            raw_cost = card.get('mana_cost','')
            parsed = parse_mana_cost(raw_cost)
            cost_str = f"{raw_cost} [{parsed}]" if parsed else raw_cost
            lines.append(f"  {cost_str} | {card.get('type_line','')}{stat}")
            if kw: lines.append(f"  Keywords: {kw}")
            if card.get("oracle_text"): lines.append(f"  {card['oracle_text']}")
        ci = "".join(card.get("color_identity", [])) or "Colorless"
        legal = card.get("legalities", {}).get("commander", "unknown")
        lines.append(f"  [Commander: {legal} | Color identity: {{{ci}}}]")

        # Append official WotC rulings if available
        oracle_id = card.get("oracle_id", "")
        card_rulings = self.rulings.get(oracle_id, [])
        if card_rulings:
            lines.append(f"  Official rulings:")
            for ruling in card_rulings[:MAX_RULINGS_PER_CARD]:
                lines.append(f"    • {ruling}")

        return "\n".join(lines)


def extract_card_names(text):
    found = re.findall(r'\[([^\]]+)\]', text)
    return list(dict.fromkeys(found))


def get_ruling(client, situation, card_blocks, show_options=False):
    parts = []
    if card_blocks:
        parts.append("CARD DATA:\n")
        for block in card_blocks:
            parts.append(block)
            parts.append("")
    parts.append("SITUATION:\n" + situation)

    user_content = "\n".join(parts)

    # Detect opponent action vs rules question
    opponent_action = any(phrase in situation.lower() for phrase in [
        "my opponent casts", "my opponent activates", "my opponent targets",
        "my opponent destroys", "my opponent exiles", "opponent casts",
        "opponent targets", "opponent destroys", "opponent exiles",
        "targeting it", "targeting me", "targeting my",
        "in response to", "on the stack"
    ])

    if show_options:
        user_content += "\n\nInclude YOUR OPTIONS section. Include RESULT section."
    elif opponent_action:
        user_content += "\n\nDo NOT include YOUR OPTIONS section. Include RESULT section."
    else:
        user_content += "\n\nInclude RESULT section. Do NOT include YOUR OPTIONS section."

    response = client.messages.create(
        model=MODEL,
        max_tokens=600,
        system=RULES_PROMPT,
        messages=[{"role": "user", "content": user_content}]
    )
    text = response.content[0].text

    # Post-process: strip common redundant phrases the model keeps adding
    import re
    # Strip parenthetical controller notes e.g. "(Atraxa's controller)" "(her controller)"
    text = re.sub(r"\s*\([^)]*controller[^)]*\)", "", text, flags=re.IGNORECASE)
    # Strip "— not the opponent..." clarifications
    text = re.sub(r"\s*[—-]+\s*not (the|your) opponent[^.]*\.", ".", text, flags=re.IGNORECASE)
    # Strip "As her/its/the commander..." sentences that restate the same thing
    text = re.sub(r"\s*As (her|his|its|the|your) (controller|commander)[^.]*\.", "", text, flags=re.IGNORECASE)
    # Strip "You receive the life gain..." sentences
    text = re.sub(r"\s*You receive the life gain[^.]*\.", "", text, flags=re.IGNORECASE)
    # Clean up any double spaces or leading/trailing whitespace per line
    text = re.sub(r"  +", " ", text)
    text = "\n".join(line.strip() for line in text.splitlines())

    return text.strip()


def main():
    print()
    print("=" * 56)
    print("  MTG Commander Judge v5")
    print("=" * 56)
    print()
    print("  Put card names in [brackets].")
    print("  Type 'quit' to exit.")
    print()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.")
        print("  Windows CMD: set ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    db = CardDatabase()
    db.load()
    client = anthropic.Anthropic(api_key=api_key)

    while True:
        try:
            print("-" * 56)
            situation = input("Situation: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nGoodbye.")
            break

        if not situation:
            continue
        if situation.lower() in ("quit", "exit", "q"):
            print("Goodbye.")
            break

        # Detect if player is asking for options — used both for API call and follow-up logic
        asking_for_options = any(phrase in situation.lower() for phrase in [
            "what are my options", "what can i do", "how can i respond",
            "can i respond", "what do i do", "how do i stop", "what should i do",
            "do i have options", "any options", "options"
        ])

        card_names = extract_card_names(situation)
        card_blocks = []
        not_found = []

        if card_names:
            print(f"  Cards: {', '.join(card_names)}")
            for name in card_names[:MAX_CARDS]:
                card = db.lookup(name)
                if card:
                    card_blocks.append(db.format_for_prompt(card))
                else:
                    not_found.append(name)
            if not_found:
                print(f"  Not found: {', '.join(not_found)}")

        print()
        try:
            ruling = get_ruling(client, situation, card_blocks, show_options=asking_for_options)
            print(ruling)
            print()

            if not asking_for_options:
                follow = input("See your options? (y/n): ").strip().lower()
                if follow in ("y", "yes"):
                    options_ruling = get_ruling(client, situation, card_blocks, show_options=True)
                    print()
                    print(options_ruling)

        except anthropic.AuthenticationError:
            print("ERROR: Invalid API key.")
        except anthropic.RateLimitError:
            print("ERROR: Rate limit. Wait a moment and retry.")
        except anthropic.APIConnectionError:
            print("ERROR: No connection.")
        except Exception as e:
            print(f"ERROR: {e}")
        print()


if __name__ == "__main__":
    main()
