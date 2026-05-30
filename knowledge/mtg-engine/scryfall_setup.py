# =============================================================================
#  SCRYFALL SETUP SCRIPT
#  Downloads and prepares all card data and official rulings for mtg_judge_v5.py
#
#  Run this whenever you want to refresh your card data (e.g. after a new set).
#  It does everything in one go:
#    1. Downloads the latest Scryfall Oracle card data (~100MB)
#    2. Filters to Commander-legal cards only
#    3. Splits into 3 upload-sized files (scryfall_AH/IP/QZ.json)
#    4. Downloads the official WotC rulings (~25MB)
#    5. Filters rulings to Commander cards only
#    6. Splits into 3 upload-sized files (scryfall_rulings_1/2/3.json)
#    7. Cleans up all raw downloads
#
#  OUTPUT FILES (put all of these in your MTG ENGINE folder):
#    scryfall_AH.json        Cards A-H
#    scryfall_IP.json        Cards I-P
#    scryfall_QZ.json        Cards Q-Z
#    scryfall_rulings_1.json Official rulings chunk 1
#    scryfall_rulings_2.json Official rulings chunk 2
#    scryfall_rulings_3.json Official rulings chunk 3
#
#  SETUP:
#    No extra libraries needed — uses only Python standard library.
#    Windows CMD: python scryfall_setup.py
# =============================================================================

import json
import os
import sys
import urllib.request
import urllib.error
from datetime import datetime

# Output directory = same folder as this script
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# Headers required by Scryfall API
HEADERS = {
    "User-Agent": "MTGJudgeEngine/1.0",
    "Accept": "application/json",
}

# Temporary raw download paths (deleted after processing)
RAW_CARDS_FILE   = os.path.join(SCRIPT_DIR, "_raw_cards.json")
RAW_RULINGS_FILE = os.path.join(SCRIPT_DIR, "_raw_rulings.json")

# Final output paths
OUTPUT_CARDS = [
    (os.path.join(SCRIPT_DIR, "scryfall_AH.json"), "AH", "A through H"),
    (os.path.join(SCRIPT_DIR, "scryfall_IP.json"), "IP", "I through P"),
    (os.path.join(SCRIPT_DIR, "scryfall_QZ.json"), "QZ", "Q through Z"),
]
OUTPUT_RULINGS = [
    os.path.join(SCRIPT_DIR, "scryfall_rulings_1.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_2.json"),
    os.path.join(SCRIPT_DIR, "scryfall_rulings_3.json"),
]

# Fields to keep per card (everything mtg_judge_v5 needs)
KEEP_FIELDS = {
    "id", "oracle_id", "name", "mana_cost", "cmc",
    "color_identity", "colors", "type_line", "oracle_text",
    "keywords", "power", "toughness", "loyalty", "defense",
    "legalities", "reserved", "layout", "card_faces",
    "set", "set_name", "released_at", "rarity",
}

# Fields to keep within each face of a DFC/split card
FACE_FIELDS = {
    "name", "mana_cost", "type_line", "oracle_text",
    "colors", "color_indicator", "power", "toughness",
    "loyalty", "defense", "keywords",
}

# Maximum rulings per card included in output (keeps file sizes reasonable)
MAX_RULINGS_PER_CARD = 10


# =============================================================================
#  NETWORK HELPERS
# =============================================================================

def get_json(url, label=""):
    """Fetch a URL and return the parsed JSON. Shows progress label."""
    if label:
        print(f"  Fetching {label}...", end="", flush=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as r:
        data = json.loads(r.read())
    if label:
        print(" done.")
    return data


def download_file(url, dest_path, label="file"):
    """
    Download a large file with a progress indicator.
    Shows percentage and MB downloaded as it goes.
    """
    print(f"  Downloading {label}...")

    def progress(count, block, total):
        if total > 0:
            pct  = min(100, count * block * 100 // total)
            done = count * block / 1_000_000
            tot  = total / 1_000_000
            print(f"\r    {pct:3d}%  ({done:.1f} / {tot:.1f} MB)", end="", flush=True)

    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as response:
        total_size = int(response.headers.get("Content-Length", 0))
        downloaded = 0
        block_size = 65536
        with open(dest_path, "wb") as f:
            while True:
                chunk = response.read(block_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                progress(downloaded // block_size, block_size, total_size)

    size_mb = os.path.getsize(dest_path) / 1_000_000
    print(f"\r    100%  ({size_mb:.1f} MB) — complete.        ")


def get_bulk_url(data_type):
    """
    Get the current download URL for a Scryfall bulk data type.
    data_type is one of: "oracle_cards", "rulings"
    """
    manifest = get_json("https://api.scryfall.com/bulk-data", "bulk data manifest")
    for entry in manifest["data"]:
        if entry["type"] == data_type:
            size_mb = entry.get("size", 0) / 1_000_000
            print(f"    Name:    {entry['name']}")
            print(f"    Updated: {entry['updated_at'][:10]}")
            print(f"    Size:    ~{size_mb:.0f} MB")
            return entry["download_uri"]
    raise ValueError(f"Bulk data type '{data_type}' not found in Scryfall manifest.")


# =============================================================================
#  CARD PROCESSING
# =============================================================================

def should_keep_card(card):
    """
    Return True if this card should be included.
    Keeps Commander-legal and Commander-banned cards in English.
    Excludes tokens, art cards, schemes, planes, etc.
    """
    # English only
    if card.get("lang", "en") != "en":
        return False

    # Skip non-gameplay layouts
    skip_layouts = {
        "token", "double_faced_token", "art_series",
        "reversible_card", "vanguard", "scheme", "planar", "phenomenon"
    }
    if card.get("layout", "normal") in skip_layouts:
        return False

    # Keep Commander-legal and Commander-banned (banned is still useful for rulings)
    status = card.get("legalities", {}).get("commander", "not_legal")
    return status in ("legal", "banned")


def slim_card(card):
    """Strip a card to only the fields mtg_judge_v5 needs."""
    result = {}
    for field in KEEP_FIELDS:
        if field not in card:
            continue
        val = card[field]
        # For DFC/split cards, also slim each face
        if field == "card_faces" and isinstance(val, list):
            result[field] = [
                {k: v for k, v in face.items() if k in FACE_FIELDS}
                for face in val
            ]
        else:
            result[field] = val
    return result


def get_card_bucket(name):
    """Assign a card to a split bucket based on first letter."""
    first = name[0].upper() if name else "A"
    if first <= "H":
        return "AH"
    elif first <= "P":
        return "IP"
    else:
        return "QZ"


def process_cards():
    """Download, filter, and split card data into 3 output files."""
    print()
    print("─" * 50)
    print("  STEP 1: CARD DATA")
    print("─" * 50)

    # Get download URL
    print()
    print("  Getting download URL:")
    url = get_bulk_url("oracle_cards")
    print()

    # Download raw data
    download_file(url, RAW_CARDS_FILE, "Oracle card data (~100 MB)")
    print()

    # Load and filter
    print("  Parsing JSON (may take ~30 seconds)...", end="", flush=True)
    with open(RAW_CARDS_FILE, encoding="utf-8") as f:
        all_cards = json.load(f)
    print(f" {len(all_cards):,} cards total.")

    print("  Filtering to Commander cards...")
    kept = [slim_card(c) for c in all_cards if should_keep_card(c)]
    legal  = sum(1 for c in kept if c.get("legalities", {}).get("commander") == "legal")
    banned = sum(1 for c in kept if c.get("legalities", {}).get("commander") == "banned")
    print(f"    Legal:  {legal:,}")
    print(f"    Banned: {banned:,}")
    print(f"    Total:  {len(kept):,}")

    # Build oracle_id set for rulings filtering later
    commander_oracle_ids = {c["oracle_id"] for c in kept if c.get("oracle_id")}

    # Split into 3 buckets by card name
    buckets = {"AH": [], "IP": [], "QZ": []}
    for card in kept:
        buckets[get_card_bucket(card.get("name", ""))].append(card)

    # Write output files
    print()
    print("  Writing card files:")
    meta_base = {
        "generated":    datetime.utcnow().isoformat() + "Z",
        "source":       "Scryfall Oracle Cards bulk data",
        "total_cards":  len(kept),
        "legal_count":  legal,
        "banned_count": banned,
    }

    for path, key, label in OUTPUT_CARDS:
        chunk = buckets[key]
        out = {
            "meta": {**meta_base, "split": label, "card_count": len(chunk)},
            "cards": chunk,
        }
        with open(path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
        mb = os.path.getsize(path) / 1_000_000
        fname = os.path.basename(path)
        print(f"    {fname}: {len(chunk):,} cards | {mb:.1f} MB")

    # Clean up raw file
    os.remove(RAW_CARDS_FILE)
    print()
    print("  Raw card data deleted.")

    return commander_oracle_ids


# =============================================================================
#  RULINGS PROCESSING
# =============================================================================

def process_rulings(commander_oracle_ids):
    """Download, filter, and split official WotC rulings into 3 output files."""
    print()
    print("─" * 50)
    print("  STEP 2: OFFICIAL RULINGS")
    print("─" * 50)

    # Get download URL
    print()
    print("  Getting download URL:")
    url = get_bulk_url("rulings")
    print()

    # Download raw rulings
    download_file(url, RAW_RULINGS_FILE, "Official rulings (~25 MB)")
    print()

    # Load and build oracle_id → rulings dict
    print("  Parsing rulings JSON...", end="", flush=True)
    with open(RAW_RULINGS_FILE, encoding="utf-8") as f:
        all_rulings = json.load(f)
    print(f" {len(all_rulings):,} rulings total.")

    # Group by oracle_id, filter to Commander cards only
    print("  Filtering to Commander cards...")
    from collections import defaultdict
    by_oracle = defaultdict(list)
    for ruling in all_rulings:
        oid = ruling.get("oracle_id", "")
        if oid in commander_oracle_ids:
            by_oracle[oid].append(ruling["comment"])

    total_kept = sum(len(v) for v in by_oracle.values())
    print(f"    Cards with rulings: {len(by_oracle):,}")
    print(f"    Rulings kept:       {total_kept:,}")

    # Cap rulings per card
    if MAX_RULINGS_PER_CARD:
        by_oracle = {k: v[:MAX_RULINGS_PER_CARD] for k, v in by_oracle.items()}

    # Split into 3 roughly equal chunks
    items = list(by_oracle.items())
    third = len(items) // 3
    chunks = [
        dict(items[:third]),
        dict(items[third:third*2]),
        dict(items[third*2:]),
    ]

    # Write output files
    print()
    print("  Writing rulings files:")
    for i, (path, chunk) in enumerate(zip(OUTPUT_RULINGS, chunks), 1):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(chunk, f, ensure_ascii=False, separators=(",", ":"))
        mb = os.path.getsize(path) / 1_000_000
        fname = os.path.basename(path)
        rulings_count = sum(len(v) for v in chunk.values())
        print(f"    {fname}: {len(chunk):,} cards | {rulings_count:,} rulings | {mb:.1f} MB")

    # Clean up raw file
    os.remove(RAW_RULINGS_FILE)
    print()
    print("  Raw rulings data deleted.")


# =============================================================================
#  MAIN
# =============================================================================

def main():
    print()
    print("=" * 50)
    print("  MTG Judge Engine — Scryfall Setup")
    print("=" * 50)
    print()
    print(f"  Output folder: {SCRIPT_DIR}")
    print()
    print("  This will download ~125 MB total and produce 6 files.")
    print("  Takes about 3-5 minutes depending on your connection.")
    print()

    try:
        # Step 1: Process card data
        # Returns oracle_ids of commander cards — needed for rulings filtering
        commander_oracle_ids = process_cards()

        # Step 2: Process rulings using the oracle_ids from step 1
        process_rulings(commander_oracle_ids)

        # Summary
        print()
        print("=" * 50)
        print("  ALL DONE!")
        print("=" * 50)
        print()
        print("  Copy these 6 files to your MTG ENGINE folder:")
        print()
        for path, _, _ in OUTPUT_CARDS:
            print(f"    {os.path.basename(path)}")
        for path in OUTPUT_RULINGS:
            print(f"    {os.path.basename(path)}")
        print()
        print("  Then run:  python mtg_judge_v5.py")
        print()

    except urllib.error.URLError as e:
        print(f"\n  ERROR: Cannot reach Scryfall — {e}")
        print("  Check your internet connection and try again.")
        for f in [RAW_CARDS_FILE, RAW_RULINGS_FILE]:
            if os.path.exists(f): os.remove(f)
        sys.exit(1)

    except KeyboardInterrupt:
        print("\n\n  Cancelled.")
        for f in [RAW_CARDS_FILE, RAW_RULINGS_FILE]:
            if os.path.exists(f): os.remove(f)
        sys.exit(0)

    except Exception as e:
        print(f"\n  ERROR: {e}")
        import traceback
        traceback.print_exc()
        for f in [RAW_CARDS_FILE, RAW_RULINGS_FILE]:
            if os.path.exists(f): os.remove(f)
        sys.exit(1)


if __name__ == "__main__":
    main()
