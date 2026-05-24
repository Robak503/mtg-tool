#!/usr/bin/env python3
"""
================================================================================
  MTG Test File Patcher — Citation Fixes + H2 Verdict Correction
================================================================================

Applies surgical fixes to META_test_cases.md based on findings from
mtg_ar_validate.py audit + the Soul Warden Forge verification:

  1. Citation fixes (11 tests):
     - C1: [707]      → [707.2]    (copy effects sub-rule)
     - J7: [117.9]    → [118.9]    (alternative costs moved to rule 118)
     - L3: [615][614] → [615.1][614.6]
     - L4: [614]      → [614.6]
     - L6: [614]      → [614.6]
     - N2: [510.5]    → [702.7]    (first-strike keyword)
     - N8: [614]      → [614.6]
     - O1: [614]      → [614.13]   (token entering replacement)
     - Q4: [114.6]    → [115.6]    (targets moved 114→115)
     - R5: [729]      → [729.6]    (merged permanents sub-rule)

  2. H2 verdict correction:
     The Forge lookup proves Soul Warden's trigger has "another creature"
     — explicit word-level exclusion. The Arbiter was correct that it does
     NOT trigger from its own ETB. The test's expected verdict was wrong.

     Updates H2 to reflect this: Soul Warden does NOT trigger from its own
     ETB (because of "another"), but DOES trigger from other creatures'
     ETB events.

USAGE:
  python mtg_patch_tests.py                          # Patches META_test_cases.md in place
  python mtg_patch_tests.py --input my_tests.md      # Specify input file
  python mtg_patch_tests.py --dry-run                # Show what would change without writing
  python mtg_patch_tests.py --backup                 # Save a .bak before editing

After patching, re-run the validator to confirm:
  python mtg_ar_validate.py META_test_cases.md --local-cr data\\cr\\cr_current.json
"""

import argparse
import re
import sys
import shutil
from pathlib import Path


# =============================================================================
# CITATION FIXES — exact replacements scoped per-test
# =============================================================================
# Each entry is: test_id → list of (old_citation, new_citation) tuples.
# We use scoped replacement (find test's block first) to avoid changing
# citations elsewhere in the file that happen to match.

CITATION_FIXES = {
    "C1":  [("[707]", "[707.2]")],
    "J7":  [("[117.9]", "[118.9]")],
    "L3":  [("[615]", "[615.1]"), ("[614]", "[614.6]")],
    "L4":  [("[614]", "[614.6]")],
    "L6":  [("[614]", "[614.6]")],
    "N2":  [("[510.5]", "[702.7]")],
    "N8":  [("[614]", "[614.6]")],
    "O1":  [("[614]", "[614.13]")],
    "Q4":  [("[114.6]", "[115.6]")],
    "R5":  [("[729]", "[729.6]")],
}


# =============================================================================
# H2 VERDICT REPLACEMENT
# =============================================================================
# The Forge encoding for Soul Warden uses ValidCard$ Creature.Other — the .Other
# filter means "not this card." Combined with "another" in the Oracle text, this
# definitively excludes self-triggering. Updating the test to reflect reality.

H2_NEW_VERDICT = """**Expected verdict:** Soul Warden does NOT trigger from its own ETB. Its Oracle text reads "Whenever ANOTHER creature enters" — the word "another" is an explicit word-level exclusion that overrides the general rule 603.6d. When [[Soul Warden]] itself enters, the trigger does not fire. However, when subsequent creatures enter the battlefield, Soul Warden's ability triggers normally for each one (gain 1 life per ETB)."""


def patch_test_block(text, test_id, fixes):
    """Within a test's block, apply citation fixes. Returns (new_text, changes_made)."""
    # Find the test's section: from "## X. Title" to the next "## " heading or top-level "# "
    pattern = re.compile(
        rf"^(## {re.escape(test_id)}\..*?)(?=^## [A-Z]+\d+|^# )",
        re.MULTILINE | re.DOTALL
    )
    match = pattern.search(text)
    if not match:
        return text, []

    block = match.group(1)
    changes = []
    for old, new in fixes:
        if old in block:
            block = block.replace(old, new)
            changes.append((old, new))
    if changes:
        text = text[:match.start()] + block + text[match.end():]
    return text, changes


def patch_h2_verdict(text):
    """Replace H2's expected verdict with the corrected Soul Warden ruling."""
    # Match the H2 block and find its **Expected verdict:** line through to the next ** or section
    pattern = re.compile(
        r"(## H2\..*?\*\*Expected verdict:\*\*).*?(?=\*\*[A-Z]|\n## )",
        re.DOTALL
    )
    match = pattern.search(text)
    if not match:
        return text, False
    # Replace just the verdict portion
    replacement = H2_NEW_VERDICT + "\n\n"
    new_text = text[:match.start()] + replacement + text[match.end():]
    return new_text, True


def main():
    parser = argparse.ArgumentParser(description="Patch META_test_cases.md based on validator findings")
    parser.add_argument("--input", default="META_test_cases.md", help="Test file to patch")
    parser.add_argument("--output", default=None, help="Where to write (default: in-place)")
    parser.add_argument("--dry-run", action="store_true", help="Show changes without writing")
    parser.add_argument("--backup", action="store_true", help="Save .bak file before editing")
    parser.add_argument("--skip-h2", action="store_true", help="Don't touch H2 verdict (only fix citations)")
    args = parser.parse_args()

    path = Path(args.input)
    if not path.exists():
        print(f"ERROR: {path} not found")
        sys.exit(1)

    text = path.read_text(encoding="utf-8")
    original_text = text

    print()
    print("=" * 64)
    print("  MTG Test File Patcher")
    print("=" * 64)
    print(f"  Input:  {path}")
    print(f"  Size:   {len(text):,} chars")
    print()

    # Apply citation fixes
    print("CITATION FIXES:")
    print("-" * 64)
    total_changes = 0
    for test_id, fixes in CITATION_FIXES.items():
        new_text, changes = patch_test_block(text, test_id, fixes)
        if changes:
            for old, new in changes:
                print(f"  {test_id}: {old:<12} → {new}")
                total_changes += 1
            text = new_text
        else:
            # The fix didn't apply — citation already correct, or test missing
            for old, new in fixes:
                if old not in text:
                    print(f"  {test_id}: {old:<12} → (not found in file; already fixed?)")
                else:
                    print(f"  {test_id}: {old:<12} → (test block not located)")

    print()
    print(f"Citation changes applied: {total_changes}")
    print()

    # Apply H2 verdict fix
    if not args.skip_h2:
        print("H2 VERDICT FIX:")
        print("-" * 64)
        new_text, applied = patch_h2_verdict(text)
        if applied:
            print("  ✓ H2 expected verdict rewritten to reflect Forge encoding of Soul Warden.")
            print("    (Old verdict said Soul Warden triggers from own ETB — that was wrong.")
            print("     New verdict says it does NOT, because 'another' is an exclusion.)")
            text = new_text
        else:
            print("  ⚠ H2 block not found or already in expected state.")
        print()

    # Write
    if args.dry_run:
        print(f"DRY RUN — no file written.")
        print(f"Total changes that would be applied: {total_changes + (1 if not args.skip_h2 else 0)}")
        return

    if text == original_text:
        print("No changes needed. File is already up to date.")
        return

    out_path = Path(args.output) if args.output else path
    if args.backup:
        bak = out_path.with_suffix(out_path.suffix + ".bak")
        shutil.copy2(out_path, bak)
        print(f"Backup written: {bak}")

    out_path.write_text(text, encoding="utf-8")
    print(f"Wrote: {out_path} ({len(text):,} chars)")
    print()
    print("Next step: re-run the validator to confirm fixes:")
    print("  python mtg_ar_validate.py META_test_cases.md --local-cr data\\cr\\cr_current.json")


if __name__ == "__main__":
    main()
