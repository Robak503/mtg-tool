#!/usr/bin/env bash
#
# ============================================================================
#   MTG Arbiter Engine — Local Data Bootstrap
# ============================================================================
#
# One-shot setup that downloads Rules Guru questions, the Comprehensive Rules
# JSON, and Forge card scripts to local disk. After this runs you have:
#
#   ./data/rulesguru/                   — all RG questions (JSON files)
#   ./data/cr/cr_current.json           — current Comprehensive Rules
#   ./data/cr/cr_current.txt            — raw CR text
#   ./data/forge/cardsfolder/           — Forge's ~30K card scripts
#
# After bootstrap, the modified scripts use --local-data flags to read from
# these directories instead of hitting any network APIs. No rate limits, no
# repeated work, no waiting.
#
# REQUIREMENTS:
#   - git (for cloning repos)
#   - Node.js 18+ and npm (for the RG data fetcher)
#   - curl OR wget (for direct downloads)
#   - ~2GB free disk space (Forge is the bulk of it)
#
# USAGE:
#   chmod +x mtg_bootstrap_local.sh
#   ./mtg_bootstrap_local.sh                # everything
#   ./mtg_bootstrap_local.sh --skip-forge   # ~5MB instead of 2GB
#   ./mtg_bootstrap_local.sh --only-cr      # just the rules JSON
#

set -euo pipefail

# ----------------------------------------------------------------------------
# Config
# ----------------------------------------------------------------------------

DATA_DIR="${MTG_DATA_DIR:-./data}"
SKIP_RG=false
SKIP_CR=false
SKIP_FORGE=false

# Parse args
for arg in "$@"; do
  case "$arg" in
    --skip-rg)    SKIP_RG=true ;;
    --skip-cr)    SKIP_CR=true ;;
    --skip-forge) SKIP_FORGE=true ;;
    --only-rg)    SKIP_CR=true; SKIP_FORGE=true ;;
    --only-cr)    SKIP_RG=true; SKIP_FORGE=true ;;
    --only-forge) SKIP_RG=true; SKIP_CR=true ;;
    --help|-h)
      sed -n '/^# USAGE/,/^$/p' "$0" | sed 's/^# //'
      exit 0
      ;;
    *)
      echo "Unknown arg: $arg" >&2
      exit 1
      ;;
  esac
done

echo
echo "============================================================"
echo "  MTG Arbiter — Local Data Bootstrap"
echo "============================================================"
echo "  Target directory: $DATA_DIR"
echo

mkdir -p "$DATA_DIR"

# ----------------------------------------------------------------------------
# 1. Rules Guru — clone + run their data fetcher
# ----------------------------------------------------------------------------

if [ "$SKIP_RG" = false ]; then
  echo "[1/3] Rules Guru questions..."

  RG_DIR="$DATA_DIR/rulesguru-repo"
  if [ ! -d "$RG_DIR" ]; then
    echo "  Cloning github.com/KingSupernova31/RulesGuru..."
    git clone --depth 1 https://github.com/KingSupernova31/RulesGuru.git "$RG_DIR"
  else
    echo "  Repo exists; pulling latest..."
    git -C "$RG_DIR" pull --rebase
  fi

  echo "  Installing npm dependencies (may take a minute)..."
  pushd "$RG_DIR" > /dev/null
  npm install --silent --no-audit --no-fund || {
    echo "  ⚠ npm install failed — Node 18+ required."
    echo "  You can still proceed, but RG data files won't be generated."
    popd > /dev/null
    SKIP_RG_DATA=true
  }

  if [ -z "${SKIP_RG_DATA:-}" ]; then
    echo "  Running updateDataFiles.js (this downloads & processes all questions)..."
    node custom_modules/updateDataFiles.js || {
      echo "  ⚠ Data update script failed. RG repo is cloned but data files may be incomplete."
    }
  fi
  popd > /dev/null

  # Symlink the relevant data dir for the importer to find
  if [ -d "$RG_DIR/data" ]; then
    ln -sf "$(realpath "$RG_DIR/data")" "$DATA_DIR/rulesguru"
    echo "  ✓ Questions available at $DATA_DIR/rulesguru/"
  elif [ -d "$RG_DIR/public/data" ]; then
    ln -sf "$(realpath "$RG_DIR/public/data")" "$DATA_DIR/rulesguru"
    echo "  ✓ Questions available at $DATA_DIR/rulesguru/"
  else
    echo "  ⚠ Couldn't auto-locate data files. Look inside $RG_DIR for JSON files."
  fi
  echo
fi

# ----------------------------------------------------------------------------
# 2. Comprehensive Rules — fetch current JSON
# ----------------------------------------------------------------------------

if [ "$SKIP_CR" = false ]; then
  echo "[2/3] Comprehensive Rules JSON..."

  CR_DIR="$DATA_DIR/cr"
  mkdir -p "$CR_DIR"

  # The Academy Ruins API exposes the structured CR as JSON. We hit it once and
  # save the entire ruleset locally so the validator never needs to query the API.
  CR_URL="https://api.academyruins.com/cr"

  if command -v curl > /dev/null; then
    echo "  Downloading current CR JSON from Academy Ruins..."
    curl -sSL "$CR_URL" -o "$CR_DIR/cr_current.json" || echo "  ⚠ CR JSON download failed"
  elif command -v wget > /dev/null; then
    wget -q "$CR_URL" -O "$CR_DIR/cr_current.json"
  else
    echo "  ⚠ Neither curl nor wget found; skipping CR download."
  fi

  if [ -s "$CR_DIR/cr_current.json" ]; then
    SIZE=$(wc -c < "$CR_DIR/cr_current.json")
    echo "  ✓ CR JSON downloaded ($SIZE bytes) to $CR_DIR/cr_current.json"
  fi
  echo
fi

# ----------------------------------------------------------------------------
# 3. Forge — sparse-clone just the card scripts directory
# ----------------------------------------------------------------------------

if [ "$SKIP_FORGE" = false ]; then
  echo "[3/3] Forge card scripts..."

  FORGE_DIR="$DATA_DIR/forge"
  if [ ! -d "$FORGE_DIR" ]; then
    echo "  Sparse cloning Card-Forge/forge (cardsfolder + rules docs only)..."
    git clone --depth 1 --filter=blob:none --sparse \
      https://github.com/Card-Forge/forge.git "$FORGE_DIR"

    pushd "$FORGE_DIR" > /dev/null
    git sparse-checkout init --cone
    git sparse-checkout set forge-gui/res/cardsfolder forge-game/src/test docs
    popd > /dev/null
  else
    echo "  Forge repo exists; pulling latest..."
    git -C "$FORGE_DIR" pull --rebase
  fi

  # Create a flat symlink to make script paths simpler
  if [ -d "$FORGE_DIR/forge-gui/res/cardsfolder" ]; then
    ln -sf "$(realpath "$FORGE_DIR/forge-gui/res/cardsfolder")" "$DATA_DIR/forge-cardsfolder"
    CARD_COUNT=$(find "$DATA_DIR/forge-cardsfolder" -name "*.txt" 2>/dev/null | wc -l)
    echo "  ✓ $CARD_COUNT card scripts available at $DATA_DIR/forge-cardsfolder/"
  fi
  echo
fi

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------

echo "============================================================"
echo "  Bootstrap complete"
echo "============================================================"
echo
echo "  Data root: $DATA_DIR"
echo
echo "  Run scripts with the --local-data flag to read from disk:"
echo "    python mtg_rg_import.py --local-data $DATA_DIR/rulesguru --count 200"
echo "    python mtg_ar_validate.py META_test_cases.md --local-cr $DATA_DIR/cr/cr_current.json"
echo "    python mtg_forge_lookup.py 'Soul Warden' --data-dir $DATA_DIR/forge-cardsfolder"
echo
