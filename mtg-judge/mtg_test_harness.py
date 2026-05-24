"""
================================================================================
  MTG ARBITER ENGINE — Test Harness
================================================================================

Automated regression testing for the Arbiter agent. Loads test scenarios from
META_test_cases.md, runs each through the Anthropic API with the Arbiter system
prompt, parses the structured response, and checks for required rule citations.

USAGE:
  pip install anthropic
  set ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE  (Windows CMD)
  export ANTHROPIC_API_KEY=sk-ant-YOUR-KEY-HERE  (bash)

  python mtg_test_harness.py                  # Run all tests
  python mtg_test_harness.py --category A     # Run a specific category
  python mtg_test_harness.py --test A1        # Run a single test
  python mtg_test_harness.py --verbose        # Show full responses
  python mtg_test_harness.py --report report.md  # Save markdown report

  Optional Scryfall data files for card text injection (same as CLI):
    scryfall_AH.json, scryfall_IP.json, scryfall_QZ.json
    scryfall_rulings_1.json, scryfall_rulings_2.json, scryfall_rulings_3.json

  If absent, the harness runs without local card injection and relies on the
  Arbiter prompt's "use ONLY provided card text" discipline.

CR baseline: February 27, 2026 | Engine prompt: v1.0
"""

import os
import re
import sys
import json
import time
import argparse
from pathlib import Path
from dataclasses import dataclass, field

try:
    import anthropic
except ImportError:
    print("Run: pip install anthropic")
    sys.exit(1)

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR = Path(__file__).resolve().parent
TEST_FILE = SCRIPT_DIR / "META_test_cases.md"
MODEL = "claude-sonnet-4-6"
MAX_TOKENS = 2500
RATE_LIMIT_SLEEP = 1.0  # seconds between API calls to stay polite

# Embedded Arbiter system prompt (derived from META_engine_system_prompt.md)
# Kept inline so the harness is self-contained.
ARBITER_SYSTEM_PROMPT = """You are the Arbiter — a deterministic Magic: The Gathering rules execution engine specialized in Commander (4-player Free-for-All). You are not a conversational rules expert. You are an instrument that processes a board state or rules interaction through a formal execution model and returns a structured ruling.

You operate against the MTG Comprehensive Rules, CR baseline February 27, 2026.

## CORE BEHAVIOR

You do not guess. You do not pattern-match. You do not give vibes-based answers. You walk every question through the same procedure:

1. State assessment (the 5 Questions)
2. Master execution order (the 21 steps)
3. Citation of the governing axiom that resolves the question
4. Fixed-format output

If the question is underspecified, you say so explicitly.

## GOVERNING AXIOMS

When one of these resolves the question, name it in your RULE TRACE.

- **Axiom 1** — The game is one ordered engine.
- **Axiom 2** — Replacement and prevention (614/615) happen before the event.
- **Axiom 3** — "Can't" effects (614.17) are not ordinary replacement effects.
- **Axiom 4** — The rest of the engine sees only the final event.
- **Axiom 5** — Triggering and stack insertion are separate.
- **Axiom 6** — Waiting triggers are a real engine state.

## THE 5 QUESTIONS — State Assessor

Q1 — Is a process currently resolving?
Q2 — Are any SBAs applicable?
Q3 — Are any triggered abilities in the waiting state?
Q4 — Is the game at a stable checkpoint?
Q5 — Who has priority and what can they legally do?

## THE 21-STEP EXECUTION ORDER

WOULD-EVENT → "can't" check → replacement/prevention → final event → trigger detection → waiting state → finish process → SBA loop → trigger insertion → SBA loop → priority → action or pass → resolve or advance → repeat.

## KEY RULE REFERENCES

Priority: 117. Triggers: 603 (603.3 placement, 603.4 intervening-if, 603.6 zone look-back, **603.6d ETB triggers see source's own ETB**, 603.8 state, 603.10 LKI, 603.12 reflexive). SBAs: 704 (704.6c Commander). Replacement: 614 (614.6 zone-change, 614.17 "can't"). Multi-replacement: 616. Resolution: 608. Casting: 601 (601.2f cost lock-in). Continuous effects: 613 (7 layers, 613.7 timestamps). Object identity: 400.7. Linked: 607. Copy effects: 707. Commander: 903 — **903.4 designation, 903.4b partner color identity, 903.7 TAX, 903.9a zone replacement, 903.10a DAMAGE**. Multiplayer: 800-811, **101.4 APNAP**. Day/Night: 730 (730.3 transition). Golden rule: 101.2.

Use inline brackets: [603.3b], [704.5d], [616.1c].

## CRITICAL DISAMBIGUATIONS — common errors

- **ETB triggers see source's own ETB UNLESS the trigger says "another" [603.6d].** "Whenever a creature enters" includes the source; "Whenever another creature enters" excludes it. Read the Oracle text precisely: Soul Warden says "another creature" — does NOT trigger on its own ETB. Suture Priest says just "a creature" — does trigger on its own.
- **Commander tax = [903.7], NOT 903.10a.** Damage = [903.10a]. Don't swap.
- **Day/Night is rule 730**, not 726.
- **APNAP general rule is [101.4]**; [603.3b] is the trigger-insertion application.
- **Copy of a commander is NOT a commander** — cite [707] AND [903.4].

## OUTPUT FORMAT — FIXED

STATE
[One line per relevant question.]

RESOLUTION
1. [Step with cited step number.]
2. [Next step.]
...

RULE TRACE
- [Each rule cited.]
- [Axioms invoked.]

VERDICT
[One sentence answer.]

For "legal actions" questions, add a LEGAL ACTIONS section.
For underspecified scenarios, REPLACE VERDICT with UNRESOLVED.

## HARD CONSTRAINTS

- Use ONLY provided card text. If a card is mentioned without Oracle text provided, note this in UNRESOLVED.
- Cite only real rule numbers. Cite parent rule if uncertain about sub-rule letter.
- Wrap card names in [[double brackets]].
- No filler. Begin with STATE; end with VERDICT/UNRESOLVED/LEGAL ACTIONS.
- For "explain this" requests, respond "[Hand off to Nissa]" and stop.

## TONE

Procedural. Terse. Confident where rules are clear; explicit where they aren't."""


# =============================================================================
# TEST CASE PARSING
# =============================================================================

@dataclass
class TestCase:
    id: str
    category: str
    title: str
    scenario: str
    expected_verdict: str
    required_citations: list[str] = field(default_factory=list)
    why_matters: str = ""


def parse_test_cases(md_path: Path) -> list[TestCase]:
    """Parse META_test_cases.md into a list of TestCase objects."""
    if not md_path.exists():
        print(f"ERROR: Test cases file not found at {md_path}")
        print("Make sure META_test_cases.md is in the same directory as this harness.")
        sys.exit(1)

    text = md_path.read_text(encoding="utf-8")
    tests = []

    # Find all test case headers: "## X.N. Title" or "## X.N.M. Title"
    # Each test runs until the next "## " or "# " header
    test_pattern = re.compile(
        r"^## ([A-Z]\d+(?:\.\d+)?)\. (.+?)$",
        re.MULTILINE
    )

    headers = list(test_pattern.finditer(text))
    if not headers:
        print(f"WARNING: No test cases found in {md_path}. Check the file format.")
        return []

    for i, match in enumerate(headers):
        test_id = match.group(1).strip()
        title = match.group(2).strip()
        category = test_id[0]

        # Determine the block for this test
        start = match.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        block = text[start:end]

        # Stop at the next top-level section if encountered
        stop = re.search(r"^# [A-Z]", block, re.MULTILINE)
        if stop:
            block = block[:stop.start()]

        scenario = _extract_block_field(block, r"\*\*Scenario:\*\*")
        expected = _extract_block_field(block, r"\*\*Expected verdict:\*\*")
        # Accept both plural and singular labels
        citations_raw = (
            _extract_block_field(block, r"\*\*Required citations:\*\*")
            or _extract_block_field(block, r"\*\*Citations?:\*\*")
        )
        why = _extract_block_field(block, r"\*\*Why this test matters:\*\*")

        citations = _parse_citations(citations_raw)

        if scenario and expected:
            tests.append(TestCase(
                id=test_id,
                category=category,
                title=title,
                scenario=scenario,
                expected_verdict=expected,
                required_citations=citations,
                why_matters=why,
            ))

    return tests


def _extract_block_field(block: str, label_pattern: str) -> str:
    """Pull the text following a bold-label field until the next bold-label or section break."""
    pattern = re.compile(
        label_pattern + r"\s*(.*?)(?=\n\*\*[A-Z]|\n---|\Z)",
        re.DOTALL | re.IGNORECASE
    )
    m = pattern.search(block)
    if not m:
        return ""
    raw = m.group(1).strip()
    # Strip leading quote block markers and tidy whitespace
    raw = re.sub(r"^\s*>\s*", "", raw, flags=re.MULTILINE)
    return raw.strip()


def _parse_citations(citations_raw: str) -> list[str]:
    """Extract individual rule citations like [603.3b], [704.5d], or 'Axiom 4'.

    Axioms are stored as 'Axiom-N' to keep them distinct from rule numbers
    so the validator doesn't false-match against the digit alone (e.g. matching
    'Axiom 4' against the '4' in 'step 4').
    """
    if not citations_raw:
        return []
    citations = []
    # Bracketed rule citations: [603.3b], [101.2], etc.
    citations.extend(re.findall(r"\[(\d+(?:\.\d+[a-z]?)?)\]", citations_raw))
    # Axiom references: stored as 'Axiom-N' for distinct matching
    for n in re.findall(r"Axiom\s*(\d+)", citations_raw, re.IGNORECASE):
        citations.append(f"Axiom-{n}")
    return list(set(citations))


# =============================================================================
# CARD CONTEXT (optional — only if local Scryfall data is present)
# =============================================================================

def load_card_db():
    """Try to load local Scryfall data. Returns dict or None if unavailable."""
    card_files = [
        SCRIPT_DIR / "scryfall_AH.json",
        SCRIPT_DIR / "scryfall_IP.json",
        SCRIPT_DIR / "scryfall_QZ.json",
    ]
    if not all(f.exists() for f in card_files):
        return None
    db = {}
    for path in card_files:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            for c in (data if isinstance(data, list) else data.get("data", [])):
                name = c.get("name", "")
                if name and name not in db:
                    db[name] = c
        except Exception as e:
            print(f"WARNING: Couldn't load {path.name}: {e}")
    return db


def extract_card_names(text):
    """Extract [[Card Name]] mentions from a scenario."""
    return list(set(re.findall(r"\[\[([^\]]+)\]\]", text)))


def build_card_context(scenario: str, card_db) -> str:
    """Build a CARDS REFERENCED block from local Scryfall data if available."""
    if not card_db:
        return ""
    names = extract_card_names(scenario)
    if not names:
        return ""
    blocks = []
    for name in names:
        # Fuzzy match: exact first, then case-insensitive substring
        card = card_db.get(name)
        if not card:
            for db_name, db_card in card_db.items():
                if db_name.lower() == name.lower() or name.lower() in db_name.lower():
                    card = db_card
                    break
        if not card:
            continue
        oracle = card.get("oracle_text", "")
        if not oracle and card.get("card_faces"):
            oracle = "\n//\n".join(
                f"{f.get('name','')} — {f.get('type_line','')} {f.get('mana_cost','')}\n{f.get('oracle_text','')}"
                for f in card["card_faces"]
            )
        cost = card.get("mana_cost", "—")
        ttype = card.get("type_line", "")
        pt = ""
        if card.get("power") is not None:
            pt = f" | {card.get('power')}/{card.get('toughness')}"
        elif card.get("loyalty") is not None:
            pt = f" | Loyalty {card.get('loyalty')}"
        blocks.append(f"[{card.get('name', name)}] | {cost} | {ttype}{pt}\n{oracle}")
    if not blocks:
        return ""
    return "## CARDS REFERENCED (authoritative — use ONLY this text for card behavior)\n\n" + "\n\n---\n\n".join(blocks) + "\n\n"


# =============================================================================
# ARBITER API CALL
# =============================================================================

def call_arbiter(client, scenario: str, card_context: str = "") -> str:
    """Send a scenario to the Arbiter and return the response text."""
    user_content = card_context + "## USER QUESTION\n\n" + scenario if card_context else scenario
    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=ARBITER_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}]
    )
    return response.content[0].text


# =============================================================================
# RESPONSE VALIDATION
# =============================================================================

@dataclass
class TestResult:
    test_id: str
    title: str
    passed: bool
    arbiter_response: str
    failures: list[str]
    citations_found: list[str]
    citations_missing: list[str]
    has_state: bool
    has_resolution: bool
    has_rule_trace: bool
    has_verdict: bool
    duration_sec: float


def validate_response(test: TestCase, response: str) -> TestResult:
    """Check the Arbiter's response against test expectations."""
    failures = []

    # Structural checks
    has_state = bool(re.search(r"^STATE\b", response, re.MULTILINE | re.IGNORECASE))
    has_resolution = bool(re.search(r"^RESOLUTION\b", response, re.MULTILINE | re.IGNORECASE))
    has_rule_trace = bool(re.search(r"^RULE TRACE\b", response, re.MULTILINE | re.IGNORECASE))
    has_verdict = bool(re.search(r"^(VERDICT|UNRESOLVED|LEGAL ACTIONS)\b", response, re.MULTILINE | re.IGNORECASE))

    if not has_state:
        failures.append("Missing STATE section")
    if not has_resolution:
        failures.append("Missing RESOLUTION section")
    if not has_rule_trace:
        failures.append("Missing RULE TRACE section")
    if not has_verdict:
        failures.append("Missing VERDICT (or UNRESOLVED/LEGAL ACTIONS) section")

    # Citation checks
    citations_found = []
    citations_missing = []
    # Rule citations: [603.3b], etc. — bracketed in the response
    response_rule_citations = re.findall(r"\[(\d+(?:\.\d+[a-z]?)?)\]", response)
    # Axiom references in the response — stored with the same 'Axiom-N' prefix
    response_axioms = [f"Axiom-{n}" for n in re.findall(r"Axiom\s*(\d+)", response, re.IGNORECASE)]
    all_response_refs = set(response_rule_citations + response_axioms)

    for required in test.required_citations:
        if required in all_response_refs:
            citations_found.append(required)
        elif required.startswith("Axiom-"):
            # Axiom must be cited exactly — no partial credit
            citations_missing.append(required)
        else:
            # Rule numbers: allow parent-rule citation as partial credit
            # e.g. [603.3] in the response satisfies a required [603.3b]
            partial_match = None
            for found in all_response_refs:
                if found.startswith("Axiom-"):
                    continue
                if required.startswith(found) or found.startswith(required):
                    partial_match = found
                    break
            if partial_match:
                citations_found.append(f"{required} (partial: {partial_match})")
            else:
                citations_missing.append(required)

    if citations_missing:
        failures.append(f"Missing required citations: {', '.join(citations_missing)}")

    # Overall pass/fail
    passed = (has_state and has_resolution and has_rule_trace and has_verdict
              and not citations_missing)

    return TestResult(
        test_id=test.id,
        title=test.title,
        passed=passed,
        arbiter_response=response,
        failures=failures,
        citations_found=citations_found,
        citations_missing=citations_missing,
        has_state=has_state,
        has_resolution=has_resolution,
        has_rule_trace=has_rule_trace,
        has_verdict=has_verdict,
        duration_sec=0.0,
    )


# =============================================================================
# REPORTING
# =============================================================================

def print_progress(test: TestCase, result: TestResult, idx: int, total: int):
    """Concise per-test progress line."""
    status = "PASS" if result.passed else "FAIL"
    bar = "✓" if result.passed else "✗"
    print(f"  [{idx}/{total}] {bar} {test.id}: {test.title[:50]:<50} ({result.duration_sec:.1f}s) {status}")
    if not result.passed:
        for f in result.failures:
            print(f"          → {f}")


def print_summary(results: list[TestResult]):
    """Final summary block."""
    total = len(results)
    passed = sum(1 for r in results if r.passed)
    failed = total - passed
    print()
    print("=" * 70)
    print(f"  SUMMARY: {passed}/{total} passed | {failed} failed")
    print("=" * 70)

    # Category breakdown
    by_category = {}
    for r in results:
        cat = r.test_id[0]
        by_category.setdefault(cat, {"pass": 0, "fail": 0})
        if r.passed:
            by_category[cat]["pass"] += 1
        else:
            by_category[cat]["fail"] += 1

    print()
    print("  By category:")
    for cat in sorted(by_category):
        b = by_category[cat]
        total_cat = b["pass"] + b["fail"]
        print(f"    Category {cat}: {b['pass']}/{total_cat}")

    # Score interpretation
    print()
    if passed == total:
        print("  Score: All tests passed. Engine prompt is working as intended.")
    elif passed >= total * 0.85:
        print("  Score: Strong. Engine works for the vast majority of cases.")
        print("        Review failed cases — usually citation gaps that can be tightened.")
    elif passed >= total * 0.65:
        print("  Score: Mixed. Engine has specific blind spots.")
        print("        Identify failure categories and revise the prompt to add explicit handling.")
    elif passed >= total * 0.4:
        print("  Score: Concerning. Multiple systematic failures.")
        print("        The engine prompt may not be implementing the formal procedure.")
    else:
        print("  Score: Failing. Major prompt revision needed.")
        print("        Verify the model is following the structured-output requirement.")


def write_report(results: list[TestResult], tests: list[TestCase], path: Path):
    """Write a detailed markdown report."""
    by_id = {t.id: t for t in tests}
    lines = []
    lines.append("# Arbiter Engine — Test Report")
    lines.append(f"\nGenerated: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Model: `{MODEL}` | Engine prompt: v1.0 | CR baseline: 2026-02-27")
    lines.append("")
    passed = sum(1 for r in results if r.passed)
    lines.append(f"**{passed}/{len(results)} passed**")
    lines.append("")

    lines.append("## Per-test results\n")
    lines.append("| Test | Title | Pass | Citations Found | Citations Missing | Duration |")
    lines.append("|---|---|---|---|---|---|")
    for r in results:
        t = by_id.get(r.test_id)
        pass_str = "✓" if r.passed else "✗"
        found = ", ".join(r.citations_found) or "—"
        missing = ", ".join(r.citations_missing) or "—"
        lines.append(f"| {r.test_id} | {r.title[:60]} | {pass_str} | {found} | {missing} | {r.duration_sec:.1f}s |")

    lines.append("\n## Failed tests — detail\n")
    for r in results:
        if r.passed:
            continue
        t = by_id.get(r.test_id)
        lines.append(f"### {r.test_id} — {r.title}")
        if t:
            lines.append(f"\n**Scenario:**\n```\n{t.scenario}\n```")
            lines.append(f"\n**Expected:** {t.expected_verdict[:300]}")
        lines.append(f"\n**Failures:**")
        for f in r.failures:
            lines.append(f"- {f}")
        lines.append(f"\n**Arbiter response:**\n```\n{r.arbiter_response[:2000]}\n```")
        lines.append("")

    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"  Report written: {path}")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Arbiter engine test harness")
    parser.add_argument("--category", help="Run only tests in this category (A-I)")
    parser.add_argument("--test", help="Run a single test by ID (e.g. A1, B2.1)")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show full Arbiter responses")
    parser.add_argument("--report", help="Write markdown report to this path")
    parser.add_argument("--no-cards", action="store_true", help="Skip local card data injection")
    parser.add_argument("--dry-run", action="store_true", help="Parse tests but don't call API")
    args = parser.parse_args()

    print()
    print("=" * 70)
    print("  MTG Arbiter Engine — Test Harness")
    print("=" * 70)
    print()

    # Load test cases
    print(f"  Loading tests from {TEST_FILE.name}...")
    tests = parse_test_cases(TEST_FILE)
    print(f"  Parsed {len(tests)} test cases.")

    # Filter
    if args.category:
        tests = [t for t in tests if t.category == args.category.upper()]
        print(f"  Filtered to category {args.category.upper()}: {len(tests)} tests")
    if args.test:
        tests = [t for t in tests if t.id == args.test.upper()]
        print(f"  Filtered to test {args.test.upper()}: {len(tests)} tests")

    if not tests:
        print("  No tests to run after filtering.")
        return

    if args.dry_run:
        print()
        for t in tests:
            print(f"  {t.id}: {t.title}")
            print(f"     Citations: {', '.join(t.required_citations) or 'none'}")
            print(f"     Scenario length: {len(t.scenario)} chars")
        return

    # API key check
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("  ERROR: ANTHROPIC_API_KEY environment variable not set.")
        sys.exit(1)

    # Card data (optional)
    card_db = None if args.no_cards else load_card_db()
    if card_db:
        print(f"  Loaded {len(card_db)} cards from local Scryfall data.")
    else:
        print("  No local card data — relying on Arbiter's 'no training memory' discipline.")

    print()
    client = anthropic.Anthropic()
    results = []

    print(f"  Running {len(tests)} tests against {MODEL}...")
    print()
    for i, test in enumerate(tests, 1):
        card_context = build_card_context(test.scenario, card_db)
        t0 = time.time()
        try:
            response = call_arbiter(client, test.scenario, card_context)
            result = validate_response(test, response)
            result.duration_sec = time.time() - t0
        except Exception as e:
            result = TestResult(
                test_id=test.id, title=test.title, passed=False,
                arbiter_response=f"API ERROR: {e}",
                failures=[f"API call failed: {e}"],
                citations_found=[], citations_missing=test.required_citations,
                has_state=False, has_resolution=False, has_rule_trace=False, has_verdict=False,
                duration_sec=time.time() - t0,
            )
        results.append(result)
        print_progress(test, result, i, len(tests))

        if args.verbose:
            print()
            print("    Response:")
            for line in result.arbiter_response.split("\n"):
                print(f"      {line}")
            print()

        # Polite rate limit
        if i < len(tests):
            time.sleep(RATE_LIMIT_SLEEP)

    print_summary(results)

    if args.report:
        write_report(results, tests, Path(args.report))


if __name__ == "__main__":
    main()
