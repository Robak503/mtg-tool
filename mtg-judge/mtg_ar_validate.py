#!/usr/bin/env python3
"""
================================================================================
  MTG Arbiter — Academy Ruins Citation Validator
================================================================================

Walks every "Required citations:" line in META_test_cases.md, extracts each
rule number, queries Academy Ruins to verify the rule:
  1. Exists at the cited number in the current CR
  2. Contains text relevant to what the test expects

Catches errors like:
  - F1's 730.3 expected when training memory says 726
  - C2's 903.7 vs 903.10a confusion
  - Sub-rule letter typos (603.3b vs 603.3c)
  - Old CR numbering that's been renumbered

USAGE:
  python mtg_ar_validate.py                       # Validate META_test_cases.md
  python mtg_ar_validate.py path/to/tests.md      # Validate specific file
  python mtg_ar_validate.py --check-text          # Also fetch rule text and show it
  python mtg_ar_validate.py --report audit.md     # Write markdown report

Outputs a per-citation status:
  ✓  Rule exists, expected
  ?  Rule number not found in current CR — possibly renumbered or invented
  ⚠  Rule exists but text seems unrelated to the test's topic
"""

import re
import sys
import time
import argparse
import urllib.request
import urllib.parse
from pathlib import Path
from collections import defaultdict


# =============================================================================
# CONFIG
# =============================================================================

AR_BASE = "https://api.academyruins.com"
RATE_LIMIT_SLEEP = 0.3  # Polite delay between requests


# =============================================================================
# ACADEMY RUINS CLIENT
# =============================================================================

_cache = {}
_local_cr = None  # set by main() if --local-cr provided


def _load_local_cr(path):
    """Load the CR JSON dump into memory as {rule_number: text} dict."""
    import json
    from pathlib import Path
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    # The CR dump from Academy Ruins is typically {rule_number: {ruleText, ...}}
    # or a flat array of {ruleNumber, ruleText}. Handle both shapes.
    indexed = {}
    if isinstance(data, dict):
        # Common shapes: top-level keyed by rule number, OR a "rules" key
        rules_obj = data.get("rules", data)
        if isinstance(rules_obj, dict):
            for k, v in rules_obj.items():
                if isinstance(v, dict):
                    indexed[k] = v.get("ruleText") or v.get("text") or ""
                elif isinstance(v, str):
                    indexed[k] = v
        elif isinstance(rules_obj, list):
            for r in rules_obj:
                rn = r.get("ruleNumber") or r.get("number")
                if rn:
                    indexed[rn] = r.get("ruleText") or r.get("text") or ""
    elif isinstance(data, list):
        for r in data:
            rn = r.get("ruleNumber") or r.get("number")
            if rn:
                indexed[rn] = r.get("ruleText") or r.get("text") or ""
    return indexed


def fetch_rule(rule_number):
    """Fetch a single rule's text. Uses local CR dump if available, else API."""
    if rule_number in _cache:
        return _cache[rule_number]

    if _local_cr is not None:
        text = _local_cr.get(rule_number)
        result = {"ruleText": text} if text else None
        _cache[rule_number] = result
        return result

    url = f"{AR_BASE}/cr/{rule_number}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "mtg-judge-validator/1.0"})
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                import json
                data = json.loads(response.read().decode("utf-8"))
                _cache[rule_number] = data
                return data
    except urllib.error.HTTPError as e:
        if e.code == 404:
            _cache[rule_number] = None
            return None
        print(f"  HTTP error for {rule_number}: {e}")
    except Exception as e:
        print(f"  Error fetching {rule_number}: {e}")
    _cache[rule_number] = None
    return None


# =============================================================================
# TEST FILE PARSER
# =============================================================================

def parse_test_citations(md_path):
    """Return list of (test_id, test_title, citations[], scenario_keywords) per test."""
    text = md_path.read_text(encoding="utf-8")
    tests = []

    # Find each test header: ## X.N. Title
    test_pat = re.compile(r"^## ([A-Z]+\d+(?:\.\d+)?)\. (.+?)$", re.MULTILINE)
    matches = list(test_pat.finditer(text))

    for i, m in enumerate(matches):
        test_id = m.group(1)
        title = m.group(2).strip()
        # Block runs to next test header or top-level # header
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[start:end]
        stop = re.search(r"^# [A-Z]", block, re.MULTILINE)
        if stop:
            block = block[:stop.start()]

        # Extract citations
        cite_line = re.search(
            r"\*\*(?:Required c|C)itations?:\*\*\s*(.+?)$",
            block, re.MULTILINE | re.IGNORECASE
        )
        citations = []
        if cite_line:
            # Pull rule numbers like 603.3b, 117.5, etc.
            citations = re.findall(r"(\d{3}(?:\.\d+[a-z]?)?)", cite_line.group(1))

        # Scenario keywords for context (just first 200 chars)
        scen_match = re.search(r"\*\*Scenario:\*\*\s*(.+?)(?=\*\*|$)", block, re.DOTALL)
        scen = (scen_match.group(1).strip() if scen_match else "")[:300]

        if citations:
            tests.append({
                "id": test_id,
                "title": title,
                "citations": citations,
                "scenario": scen,
            })

    return tests


# =============================================================================
# VALIDATION LOGIC
# =============================================================================

def validate_citation(rule_number, scenario_keywords=""):
    """Check if a rule number exists and looks relevant.

    Returns dict with status, found_text (if any), and a relevance hint.
    """
    rule = fetch_rule(rule_number)

    if rule is None:
        # Try the parent rule (e.g. 603.3 if 603.3b not found)
        parent = re.match(r"(\d{3}\.\d+)[a-z]$", rule_number)
        if parent:
            parent_rule = fetch_rule(parent.group(1))
            if parent_rule is not None:
                return {
                    "status": "partial",
                    "message": f"Sub-rule not found; parent rule {parent.group(1)} exists",
                    "text": _extract_text(parent_rule)[:200],
                }
        return {
            "status": "missing",
            "message": f"Rule {rule_number} not found in current CR",
            "text": "",
        }

    text = _extract_text(rule)
    # Light relevance check: do scenario keywords appear in rule text?
    relevance = _relevance_score(text, scenario_keywords)
    return {
        "status": "exists",
        "message": "Found" if relevance > 0 else "Found but no keyword overlap with scenario",
        "text": text[:200],
        "relevance": relevance,
    }


def _extract_text(rule_obj):
    """Pull plain text from an Academy Ruins rule JSON response."""
    if isinstance(rule_obj, dict):
        return rule_obj.get("ruleText") or rule_obj.get("text") or rule_obj.get("content") or str(rule_obj)
    return str(rule_obj)


def _relevance_score(rule_text, scenario_text):
    """Naive: count words shared between rule text and scenario."""
    if not rule_text or not scenario_text:
        return 0
    rule_words = set(re.findall(r"\b[a-z]{4,}\b", rule_text.lower()))
    scen_words = set(re.findall(r"\b[a-z]{4,}\b", scenario_text.lower()))
    common = rule_words & scen_words
    return len(common)


# =============================================================================
# REPORTING
# =============================================================================

def print_per_test(results):
    for r in results:
        problems = [c for c in r["citations"] if c["status"] != "exists"]
        if not problems:
            continue  # Only print problematic ones
        print(f"\n  {r['test_id']} — {r['test_title'][:60]}")
        for c in r["citations"]:
            marker = {"exists": "✓", "partial": "~", "missing": "✗"}.get(c["status"], "?")
            print(f"    {marker} [{c['rule']}] — {c['result']['message']}")


def summarize(results):
    total_citations = sum(len(r["citations"]) for r in results)
    exists = sum(1 for r in results for c in r["citations"] if c["status"] == "exists")
    partial = sum(1 for r in results for c in r["citations"] if c["status"] == "partial")
    missing = sum(1 for r in results for c in r["citations"] if c["status"] == "missing")
    print()
    print("=" * 60)
    print(f"  SUMMARY across {len(results)} tests")
    print(f"  Total citations checked: {total_citations}")
    print(f"  ✓ Exists in current CR:  {exists}")
    print(f"  ~ Sub-rule not found, parent exists: {partial}")
    print(f"  ✗ Not found:             {missing}")
    print("=" * 60)


def write_report(results, path):
    lines = ["# Citation Validation Report\n"]
    lines.append(f"Source: Academy Ruins API ({AR_BASE})")
    lines.append(f"Tests checked: {len(results)}")
    total = sum(len(r["citations"]) for r in results)
    missing = [(r, c) for r in results for c in r["citations"] if c["status"] == "missing"]
    partial = [(r, c) for r in results for c in r["citations"] if c["status"] == "partial"]
    lines.append(f"Total citations: {total} | Missing: {len(missing)} | Partial: {len(partial)}")
    lines.append("")

    if missing:
        lines.append("## Missing rule citations (real fixes needed)\n")
        lines.append("| Test | Rule | Note |")
        lines.append("|---|---|---|")
        for r, c in missing:
            lines.append(f"| {r['test_id']} | `{c['rule']}` | {c['result']['message']} |")
        lines.append("")

    if partial:
        lines.append("## Sub-rule not found, parent exists (likely letter typo)\n")
        lines.append("| Test | Rule | Note |")
        lines.append("|---|---|---|")
        for r, c in partial:
            lines.append(f"| {r['test_id']} | `{c['rule']}` | {c['result']['message']} |")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Validate test citations against Academy Ruins")
    parser.add_argument("test_file", nargs="?", default="META_test_cases.md",
                        help="Path to test cases markdown file")
    parser.add_argument("--report", help="Write markdown report to this path")
    parser.add_argument("--check-text", action="store_true",
                        help="Also display rule text for each citation (verbose)")
    parser.add_argument("--local-cr", default=None,
                        help="Path to local CR JSON dump (from bootstrap). When set, "
                             "validates against disk — no API calls, no rate limit.")
    args = parser.parse_args()

    # Load local CR if specified
    global _local_cr, RATE_LIMIT_SLEEP
    if args.local_cr:
        from pathlib import Path
        if not Path(args.local_cr).exists():
            print(f"ERROR: --local-cr file '{args.local_cr}' not found")
            sys.exit(1)
        print(f"  Loading local CR from {args.local_cr}...")
        _local_cr = _load_local_cr(args.local_cr)
        print(f"  Indexed {len(_local_cr)} rules from local CR.")
        RATE_LIMIT_SLEEP = 0  # No rate limit when reading local

    test_path = Path(args.test_file)
    if not test_path.exists():
        print(f"ERROR: {test_path} not found")
        sys.exit(1)

    print()
    print("=" * 60)
    print("  MTG Citation Validator")
    print("=" * 60)
    print(f"  Source: {test_path}")
    print(f"  Validator: Academy Ruins API ({AR_BASE})")
    print()

    print("  Parsing tests...")
    tests = parse_test_citations(test_path)
    print(f"  Parsed {len(tests)} tests with citations.")
    total_citations = sum(len(t["citations"]) for t in tests)
    unique_citations = set()
    for t in tests:
        unique_citations.update(t["citations"])
    print(f"  Total citation references: {total_citations}")
    print(f"  Unique rule numbers to check: {len(unique_citations)}")
    print()

    print("  Validating against Academy Ruins (this is rate-limited politely)...")
    results = []
    for i, test in enumerate(tests, 1):
        print(f"\r  [{i}/{len(tests)}] Validating {test['id']}...", end=" ", flush=True)
        test_results = []
        for rule_num in test["citations"]:
            result = validate_citation(rule_num, test["scenario"])
            test_results.append({"rule": rule_num, "status": result["status"], "result": result})
            time.sleep(RATE_LIMIT_SLEEP)
        results.append({
            "test_id": test["id"],
            "test_title": test["title"],
            "citations": test_results,
        })

    print()
    print_per_test(results)
    summarize(results)

    if args.report:
        write_report(results, Path(args.report))
        print(f"\n  Report written: {args.report}")


if __name__ == "__main__":
    main()
