#!/usr/bin/env python3
"""
================================================================================
  MTG Arbiter — Forge Card Script Lookup
================================================================================

Given a card name, retrieve Forge's encoded script for that card from a local
clone of Card-Forge/forge. Useful when an Arbiter ruling involves a specific
card and you want to verify the card's actual behavior against an
implementation rather than trusting training memory or my expected verdict.

Forge's card scripts encode rules logic explicitly. Example for Soul Warden:

  Name:Soul Warden
  ManaCost:W
  Types:Creature Human Cleric
  PT:1/1
  T:Mode$ ChangesZone | Origin$ Any | Destination$ Battlefield | ValidCard$ Creature | TriggerZones$ Battlefield | Execute$ TrigGainLife | TriggerDescription$ Whenever another creature enters, you gain 1 life.
  SVar:TrigGainLife:DB$ GainLife | Defined$ You | LifeAmount$ 1
  Oracle:Whenever another creature enters, you gain 1 life.

The "ValidCard$ Creature" plus "TriggerZones$ Battlefield" plus the wording
"Whenever ANOTHER creature enters" tells you whether Soul Warden triggers on
its own ETB. The presence of "another" determines whether it sees itself.

USAGE:
  python mtg_forge_lookup.py "Soul Warden"
  python mtg_forge_lookup.py "Atraxa, Praetors' Voice" --data-dir ./data/forge-cardsfolder
  python mtg_forge_lookup.py "Cyclonic Rift" --raw       # print full script unparsed
  python mtg_forge_lookup.py --search "trample"          # find all cards with trample
"""

import argparse
import re
import sys
from pathlib import Path


def normalize_filename(card_name):
    """Forge's card files use lowercase, underscores, no punctuation."""
    name = card_name.lower()
    # Replace punctuation/spaces with underscores
    name = re.sub(r"[',\.]", "", name)
    name = re.sub(r"[\s\-]+", "_", name)
    return name


def find_card_file(data_dir, card_name):
    """Locate the .txt file for a given card name."""
    norm = normalize_filename(card_name)
    # Forge organizes files in subfolders by first letter
    if norm:
        first_letter = norm[0]
        candidates = [
            Path(data_dir) / first_letter / f"{norm}.txt",
            Path(data_dir) / f"{norm}.txt",
        ]
        for path in candidates:
            if path.exists():
                return path
    # Fall back to brute-force search if exact path doesn't match
    matches = list(Path(data_dir).rglob(f"{norm}.txt"))
    if matches:
        return matches[0]
    return None


def parse_card_script(text):
    """Parse a Forge card script into a structured dict."""
    result = {
        "name": None,
        "mana_cost": None,
        "types": None,
        "pt": None,
        "abilities": [],
        "svars": [],
        "oracle": None,
        "raw": text,
    }
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("Name:"):
            result["name"] = line[5:].strip()
        elif line.startswith("ManaCost:"):
            result["mana_cost"] = line[9:].strip()
        elif line.startswith("Types:"):
            result["types"] = line[6:].strip()
        elif line.startswith("PT:"):
            result["pt"] = line[3:].strip()
        elif line.startswith("Oracle:"):
            result["oracle"] = line[7:].strip()
        elif line.startswith(("A:", "T:", "S:", "R:", "K:")):
            result["abilities"].append(line)
        elif line.startswith("SVar:"):
            result["svars"].append(line)
    return result


def print_card(parsed, raw=False):
    if raw:
        print(parsed["raw"])
        return

    print()
    print(f"  Name:       {parsed['name']}")
    if parsed.get("mana_cost"):
        print(f"  Mana cost:  {parsed['mana_cost']}")
    if parsed.get("types"):
        print(f"  Types:      {parsed['types']}")
    if parsed.get("pt"):
        print(f"  P/T:        {parsed['pt']}")
    if parsed.get("oracle"):
        print(f"\n  Oracle text:")
        for line in parsed["oracle"].split("\\n"):
            print(f"    {line}")
    if parsed.get("abilities"):
        print(f"\n  Forge encoding ({len(parsed['abilities'])} ability entries):")
        for ab in parsed["abilities"]:
            # Print first 100 chars to keep terminal output manageable
            display = ab if len(ab) <= 100 else ab[:97] + "..."
            print(f"    {display}")
    if parsed.get("svars"):
        print(f"\n  Sub-abilities (SVars): {len(parsed['svars'])} defined")
    print()


def search_cards(data_dir, pattern, limit=20):
    """Grep across all card files for a regex pattern."""
    pat = re.compile(pattern, re.IGNORECASE)
    matches = []
    for path in Path(data_dir).rglob("*.txt"):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if pat.search(text):
            # Extract card name
            name_match = re.search(r"^Name:\s*(.+)$", text, re.MULTILINE)
            name = name_match.group(1).strip() if name_match else path.stem
            matches.append((name, path))
            if len(matches) >= limit:
                break
    return matches


def main():
    parser = argparse.ArgumentParser(description="Look up Forge card scripts")
    parser.add_argument("card_name", nargs="?", help="Card name to look up")
    parser.add_argument("--data-dir", default="./data/forge-cardsfolder",
                        help="Path to Forge cardsfolder (default: ./data/forge-cardsfolder)")
    parser.add_argument("--raw", action="store_true", help="Print raw script unparsed")
    parser.add_argument("--search", help="Search all cards for a pattern (e.g. 'trample')")
    parser.add_argument("--limit", type=int, default=20, help="Max results for --search")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"ERROR: --data-dir '{data_dir}' not found.")
        print(f"Run mtg_bootstrap_local.sh to download Forge data.")
        sys.exit(1)

    if args.search:
        print(f"Searching {data_dir} for pattern '{args.search}'...")
        results = search_cards(data_dir, args.search, args.limit)
        print(f"Found {len(results)} matches (limit {args.limit}):")
        for name, path in results:
            print(f"  {name}  ({path.relative_to(data_dir)})")
        return

    if not args.card_name:
        parser.print_help()
        sys.exit(1)

    path = find_card_file(data_dir, args.card_name)
    if path is None:
        print(f"  ✗ No file found for '{args.card_name}'")
        print(f"  Normalized name searched: {normalize_filename(args.card_name)}")
        sys.exit(1)

    print(f"  ✓ Found: {path}")
    text = path.read_text(encoding="utf-8", errors="ignore")
    parsed = parse_card_script(text)
    print_card(parsed, raw=args.raw)


if __name__ == "__main__":
    main()
