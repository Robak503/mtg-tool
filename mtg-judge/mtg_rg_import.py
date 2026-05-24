#!/usr/bin/env python3
"""
================================================================================
  MTG Arbiter — Rules Guru Test Importer
================================================================================

Fetches judge-authored rules questions from rulesguru.org/api, converts each into
an Arbiter test scenario in META_test_cases.md format, and writes the result to
a file that the test harness can consume.

Why this matters:
  - Rules Guru questions are written and validated by certified judges
  - Each question has structured rule citations already attached
  - Each question has a verified answer (no guessing from me)
  - You can filter by Commander legality, by complexity, by rule, by card

This means: instead of me hand-authoring tests and possibly getting expected
verdicts wrong (see F1's 726 vs 730 confusion), you import 200-2000 tests with
empirically validated verdicts. The Arbiter is then measured against an actual
judge-authored answer key.

USAGE:
  python mtg_rg_import.py --count 200                    # Fetch 200 questions
  python mtg_rg_import.py --count 500 --legality Commander --complexity Complicated
  python mtg_rg_import.py --count 100 --level 3 Corner Case --output rg_hard.md
  python mtg_rg_import.py --merge META_test_cases.md     # Merge into existing file

RATE LIMIT:
  Rules Guru limits to 1 request per 2 seconds. Use --count to batch; one
  request with count=50 returns 50 questions and only counts as one request.
  500 questions = ~10 requests = ~20 seconds of waiting plus fetch time.

OUTPUT:
  Drops a META_test_cases_rg.md file in the current directory containing
  imported tests in category X (X = "RG" for Rules Guru). Each test gets a
  unique ID like RG1, RG2, ... up to the count fetched.
"""

import json
import sys
import re
import time
import argparse
import urllib.parse
import urllib.request
from pathlib import Path
from html import unescape


# =============================================================================
# CONFIG
# =============================================================================

API_URL = "https://rulesguru.org/api/questions/"
RATE_LIMIT_SLEEP = 2.1   # Slightly above the 2-second rate limit
MAX_BATCH = 50           # Max questions per request (server may cap lower)


# =============================================================================
# QUERY BUILDER
# =============================================================================

def build_query(count, level, complexity, legality, tags, rules, cards,
                expansions=None, playable_only=False, from_id=None, previous_id=None):
    """Build the JSON query parameter for Rules Guru API."""
    query = {
        "count": min(count, MAX_BATCH),
        "level": level or ["0", "1", "2", "3"],
        "complexity": complexity or ["Simple", "Intermediate", "Complicated"],
        "legality": legality or "Commander",
        "expansions": expansions or [],
        "playableOnly": playable_only,
        "tags": tags or ["Unsupported answers"],
        "tagsConjunc": "NOT",
        "rules": rules or [],
        "rulesConjunc": "OR",
        "cards": cards or [],
        "cardsConjunc": "OR",
        "from": "mtg-judge-engine-test-import",
    }
    if previous_id is not None:
        query["previousId"] = previous_id
    if from_id is not None:
        query["id"] = from_id

    encoded = urllib.parse.quote(json.dumps(query, separators=(",", ":")))
    return f"{API_URL}?json={encoded}"


def fetch_questions(count, local_data=None, **kwargs):
    """Fetch questions. If local_data is set, read from disk; else hit API."""
    if local_data:
        return _load_local_questions(count, local_data, **kwargs)
    return _fetch_remote_questions(count, **kwargs)


def _load_local_questions(count, local_data, level=None, complexity=None,
                          legality=None, **kwargs):
    """Load questions from a local Rules Guru data directory (cloned repo)."""
    import os
    from pathlib import Path

    data_root = Path(local_data)
    if not data_root.exists():
        print(f"  ERROR: local data dir '{data_root}' not found.")
        sys.exit(1)

    print(f"  Reading local data from {data_root}...")

    # The RG repo's data file layout varies; look for any *.json that contains
    # an array of question objects. Common paths: data/questions.json, data/*.json
    candidates = sorted(data_root.rglob("*.json"))
    if not candidates:
        print(f"  ERROR: no JSON files under {data_root}")
        sys.exit(1)

    all_questions = []
    for path in candidates:
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            continue
        # Accept either a top-level array or an object with a 'questions' key
        if isinstance(data, list):
            qs = data
        elif isinstance(data, dict) and "questions" in data:
            qs = data["questions"]
        else:
            continue
        # Validate it looks like RG question shape (has questionSimple or questionHTML)
        if qs and isinstance(qs[0], dict) and (
            "questionSimple" in qs[0] or "questionHTML" in qs[0]
        ):
            print(f"    Found {len(qs)} questions in {path.name}")
            all_questions.extend(qs)

    if not all_questions:
        print(f"  ERROR: parsed {len(candidates)} JSON files but none had RG question shape.")
        sys.exit(1)

    print(f"  Loaded {len(all_questions)} total questions from disk.")

    # Apply filters that the API would normally apply
    filtered = _apply_filters(all_questions, level, complexity, legality, **kwargs)
    print(f"  After filtering: {len(filtered)} questions match criteria.")

    if len(filtered) > count:
        # Randomize selection so re-runs aren't always the same questions
        import random
        random.shuffle(filtered)
        filtered = filtered[:count]
        print(f"  Sampled {count} questions.")

    return filtered


def _apply_filters(questions, level=None, complexity=None, legality=None,
                   tags=None, rules=None, cards=None, **kwargs):
    """Apply Rules-Guru-equivalent filters to a local question list."""
    out = []
    for q in questions:
        # Level filter
        if level and q.get("level") not in level:
            continue
        # Complexity filter
        if complexity and q.get("complexity") not in complexity:
            continue
        # Legality filter — RG stores legalities as an object/array
        if legality and legality != "all":
            legs = q.get("legalities") or q.get("legality") or {}
            if isinstance(legs, dict):
                if not legs.get(legality.lower()) and not legs.get(legality):
                    continue
            elif isinstance(legs, list):
                if legality not in legs and legality.lower() not in legs:
                    continue
            elif isinstance(legs, str):
                if legs.lower() != legality.lower():
                    continue
        # Card filter — must mention at least one of the listed cards
        if cards:
            mentioned = {c.get("name", "").lower() for c in q.get("includedCards", [])}
            if not any(c.lower() in mentioned for c in cards):
                continue
        out.append(q)
    return out


def _fetch_remote_questions(count, **kwargs):
    """Original API-based fetch (used when --local-data is not provided)."""
    all_questions = []
    remaining = count
    last_id = None

    while remaining > 0:
        batch = min(remaining, MAX_BATCH)
        url = build_query(batch, previous_id=last_id, **kwargs)

        try:
            print(f"  Fetching {batch} questions...", end=" ", flush=True)
            req = urllib.request.Request(url, headers={"User-Agent": "mtg-judge-import/1.0"})
            with urllib.request.urlopen(req, timeout=30) as response:
                data = json.loads(response.read().decode("utf-8"))
        except Exception as e:
            print(f"\n  ERROR: {e}")
            print(f"  Stopping with {len(all_questions)} questions fetched.")
            break

        if not data or not isinstance(data, list):
            print(f"  Got empty/invalid response. Stopping.")
            break

        all_questions.extend(data)
        last_id = data[-1].get("id")
        remaining -= len(data)
        print(f"got {len(data)}. Total so far: {len(all_questions)}/{count}")

        if remaining > 0:
            time.sleep(RATE_LIMIT_SLEEP)

    return all_questions


# =============================================================================
# CONVERTERS — RG question shape → Arbiter test shape
# =============================================================================

def html_to_text(html_str):
    """Best-effort HTML-to-plain-text. RG's HTML is fairly clean."""
    if not html_str:
        return ""
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", "", html_str)
    # Decode HTML entities
    text = unescape(text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_rule_citations(text):
    """Extract rule numbers like 123.4, 123.4a from text."""
    return re.findall(r"\b(\d{3}(?:\.\d+[a-z]?)?)\b", text)


def card_names_to_bracketed(text, cards):
    """Wrap mentioned card names in [[double brackets]] for the test scenario."""
    if not cards:
        return text
    for card in cards:
        name = card.get("name", "")
        if not name:
            continue
        # Bracket only whole-word matches; avoid bracketing already-bracketed names
        pattern = re.compile(r"(?<!\[)\b" + re.escape(name) + r"\b(?!\])", re.IGNORECASE)
        text = pattern.sub(f"[[{name}]]", text)
    return text


def convert_question(q, test_id):
    """Convert one Rules Guru question to an Arbiter test scenario dict."""
    scenario_html = q.get("questionHTML", "") or q.get("questionSimple", "")
    answer_html = q.get("answerHTML", "") or q.get("answerSimpleCited", "")

    scenario = html_to_text(scenario_html)
    expected = html_to_text(answer_html)

    cards = q.get("includedCards", [])
    scenario = card_names_to_bracketed(scenario, cards)

    # Build required citations from structured citedRules + any inline rule mentions
    cited_rules_objs = q.get("citedRules", [])
    cited_from_structure = []
    for r in cited_rules_objs:
        # Academy Ruins rule objects have a "ruleNumber" or similar
        # Try common field names
        rn = r.get("ruleNumber") or r.get("rule_number") or r.get("number") or ""
        if rn:
            cited_from_structure.append(rn)

    # Also extract rule numbers mentioned inline in the answer
    cited_from_text = extract_rule_citations(expected)
    all_citations = list(dict.fromkeys(cited_from_structure + cited_from_text))[:6]  # cap at 6

    # Build category and complexity tags
    complexity = q.get("complexity", "?")
    level = q.get("level", "?")
    tags = q.get("tags", [])
    why = f"Imported from Rules Guru #{q.get('id', '?')} — Level {level}, {complexity}"
    if tags:
        why += f". Tagged: {', '.join(tags[:3])}"

    return {
        "id": test_id,
        "title": _generate_title(scenario, q.get("id", "?")),
        "scenario": scenario,
        "expected": expected,
        "citations": all_citations,
        "why": why,
        "url": q.get("url", ""),
        "rg_id": q.get("id"),
        "level": level,
        "complexity": complexity,
        "tags": tags,
    }


def _generate_title(scenario, rg_id):
    """Generate a short title from the first words of the scenario."""
    # Take first sentence, trim to ~70 chars
    first = re.split(r"[.?!]", scenario)[0] if scenario else f"RG question {rg_id}"
    first = first.strip()
    if len(first) > 70:
        first = first[:67] + "..."
    return first or f"RG question {rg_id}"


# =============================================================================
# OUTPUT FORMAT
# =============================================================================

def format_test_markdown(tests, category_name="RG", category_letter="Z"):
    """Format converted tests as a markdown section ready to insert into META_test_cases.md."""
    lines = []
    lines.append("")
    lines.append(f"# CATEGORY {category_letter} — {category_name} (Imported from Rules Guru)")
    lines.append("")
    lines.append("These tests are imported from rulesguru.org — judge-authored questions with verified answers and structured rule citations. Each test's expected verdict and citations come from the original Rules Guru entry, not from authoring guesswork.")
    lines.append("")
    lines.append("Use these as the gold-standard regression set. If the Arbiter disagrees with a Rules Guru answer, that's almost always an engine error worth investigating — judges may occasionally disagree on edge cases, but the baseline reliability is much higher than hand-authored tests.")
    lines.append("")
    lines.append("---")
    lines.append("")

    for t in tests:
        # Test header
        lines.append(f"## {t['id']}. {t['title']}")
        lines.append("")
        # Scenario block
        lines.append("**Scenario:**")
        lines.append("")
        lines.append(f"> {t['scenario']}")
        lines.append("")
        # Expected verdict
        lines.append("**Expected verdict:** " + t['expected'])
        lines.append("")
        # Required citations
        if t['citations']:
            cites = ", ".join(f"`[{c}]`" for c in t['citations'])
            lines.append(f"**Required citations:** {cites}.")
        else:
            lines.append("**Required citations:** (none specified by source)")
        lines.append("")
        # Why this matters
        lines.append(f"**Why this test matters:** {t['why']}")
        if t.get('url'):
            lines.append("")
            lines.append(f"Source: <{t['url']}>")
        lines.append("")
        lines.append("---")
        lines.append("")

    return "\n".join(lines)


def merge_into_existing(rg_section, existing_path):
    """Insert the RG section into an existing META_test_cases.md before the SCORING section."""
    if not existing_path.exists():
        print(f"ERROR: {existing_path} doesn't exist for merging.")
        sys.exit(1)
    text = existing_path.read_text(encoding="utf-8")
    marker = "# SCORING THE ARBITER"
    idx = text.find(marker)
    if idx < 0:
        print(f"WARNING: '{marker}' not found in {existing_path}. Appending to end.")
        merged = text + "\n\n" + rg_section
    else:
        merged = text[:idx] + rg_section + "\n\n---\n\n" + text[idx:]
    existing_path.write_text(merged, encoding="utf-8")
    print(f"  Merged into {existing_path}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Import Rules Guru questions as Arbiter tests")
    parser.add_argument("--count", type=int, default=50, help="How many questions to fetch")
    parser.add_argument("--level", nargs="+", default=["1", "2", "3"],
                        help="RG difficulty levels (0, 1, 2, 3, 'Corner Case')")
    parser.add_argument("--complexity", nargs="+", default=["Simple", "Intermediate", "Complicated"],
                        help="RG complexity tiers")
    parser.add_argument("--legality", default="Commander", help="Format filter (default: Commander)")
    parser.add_argument("--tags", nargs="+", default=None, help="RG tags to include")
    parser.add_argument("--rules", nargs="+", default=None, help="RG rule filters")
    parser.add_argument("--cards", nargs="+", default=None, help="Specific cards to include")
    parser.add_argument("--output", default="META_test_cases_rg.md", help="Output filename")
    parser.add_argument("--category", default="RG", help="Category label (default: RG)")
    parser.add_argument("--category-letter", default="Z", help="Category letter (default: Z)")
    parser.add_argument("--merge", help="Path to existing META_test_cases.md to merge into")
    parser.add_argument("--id-prefix", default="RG", help="Test ID prefix (default: RG)")
    parser.add_argument("--start-num", type=int, default=1, help="Starting test number")
    parser.add_argument("--local-data", default=None,
                        help="Path to local Rules Guru data dir (from bootstrap script). "
                             "When set, reads from disk instead of API — no rate limit.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be fetched without API call")
    args = parser.parse_args()

    print()
    print("=" * 72)
    print("  MTG Arbiter — Rules Guru Test Importer")
    print("=" * 72)
    print(f"  Target: {args.count} questions")
    print(f"  Level: {args.level}")
    print(f"  Complexity: {args.complexity}")
    print(f"  Legality: {args.legality}")
    print()

    if args.dry_run:
        print("  Dry run — building URL but not fetching.")
        url = build_query(args.count, args.level, args.complexity, args.legality,
                          args.tags, args.rules, args.cards)
        print(f"  Sample URL: {url[:200]}...")
        return

    # Fetch (or load from disk)
    questions = fetch_questions(
        count=args.count,
        local_data=args.local_data,
        level=args.level,
        complexity=args.complexity,
        legality=args.legality,
        tags=args.tags,
        rules=args.rules,
        cards=args.cards,
    )

    if not questions:
        print("  No questions fetched. Exiting.")
        sys.exit(1)

    print(f"\n  Fetched {len(questions)} questions. Converting to test format...")

    # Convert
    tests = []
    for i, q in enumerate(questions):
        test_id = f"{args.id_prefix}{args.start_num + i}"
        try:
            test = convert_question(q, test_id)
            tests.append(test)
        except Exception as e:
            print(f"  ⚠ Failed to convert RG#{q.get('id', '?')}: {e}")

    print(f"  Converted {len(tests)}/{len(questions)} successfully.")

    # Format and write
    md = format_test_markdown(tests, args.category, args.category_letter)
    out_path = Path(args.output)
    out_path.write_text(md, encoding="utf-8")
    print(f"\n  Wrote {out_path}")
    print(f"  Tests can now be run with: python mtg_test_harness.py --report rg_results.md")

    # Optionally merge
    if args.merge:
        merge_into_existing(md, Path(args.merge))

    print()
    print(f"  Estimated cost to run all {len(tests)} tests:")
    print(f"    Full Arbiter:  ~${len(tests) * 0.018:.2f}")
    print(f"    Fast Arbiter:  ~${len(tests) * 0.013:.2f}")
    print()


if __name__ == "__main__":
    main()
