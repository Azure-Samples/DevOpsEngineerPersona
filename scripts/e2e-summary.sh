#!/usr/bin/env bash
# ============================================================================
# E2E Test Summary Generator
# ============================================================================
# Generates a GitHub Actions step summary from Playwright JSON results.
#
# Usage:
#   scripts/e2e-summary.sh [TITLE] [TESTED_URL] [ARTIFACT_NAME]
#
# Arguments:
#   TITLE         - Summary heading (default: "E2E Test Results")
#   TESTED_URL    - URL that was tested (optional, shown in summary)
#   ARTIFACT_NAME - Name of the artifact containing the full report
#
# Expects playwright-report/results.json to exist in the working directory.
# ============================================================================

set -euo pipefail

TITLE="${1:-E2E Test Results}"
TESTED_URL="${2:-}"
ARTIFACT_NAME="${3:-playwright-report}"

echo "## 🎭 ${TITLE}" >> "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"

if [ -n "$TESTED_URL" ]; then
  echo "**Tested URL:** ${TESTED_URL}" >> "$GITHUB_STEP_SUMMARY"
  echo "" >> "$GITHUB_STEP_SUMMARY"
fi

if [ ! -f playwright-report/results.json ]; then
  echo "❌ E2E tests may have failed. Check the logs above." >> "$GITHUB_STEP_SUMMARY"
  echo "" >> "$GITHUB_STEP_SUMMARY"
  echo "📊 **Full Report:** Download the \`${ARTIFACT_NAME}\` artifact for detailed HTML report." >> "$GITHUB_STEP_SUMMARY"
  exit 0
fi

# Parse results from JSON
TOTAL=$(jq '.stats.expected + .stats.unexpected + .stats.flaky + .stats.skipped' playwright-report/results.json)
PASSED=$(jq '.stats.expected' playwright-report/results.json)
FAILED=$(jq '.stats.unexpected' playwright-report/results.json)
FLAKY=$(jq '.stats.flaky' playwright-report/results.json)
SKIPPED=$(jq '.stats.skipped' playwright-report/results.json)
DURATION=$(jq '.stats.duration' playwright-report/results.json)
DURATION_SEC=$(echo "scale=2; $DURATION / 1000" | bc)

if [ "$FAILED" -eq 0 ]; then
  echo "### ✅ All Tests Passed" >> "$GITHUB_STEP_SUMMARY"
else
  echo "### ❌ Some Tests Failed" >> "$GITHUB_STEP_SUMMARY"
fi
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "| Metric | Count |" >> "$GITHUB_STEP_SUMMARY"
echo "|--------|-------|" >> "$GITHUB_STEP_SUMMARY"
echo "| ✅ Passed | $PASSED |" >> "$GITHUB_STEP_SUMMARY"
echo "| ❌ Failed | $FAILED |" >> "$GITHUB_STEP_SUMMARY"
echo "| ⚠️ Flaky | $FLAKY |" >> "$GITHUB_STEP_SUMMARY"
echo "| ⏭️ Skipped | $SKIPPED |" >> "$GITHUB_STEP_SUMMARY"
echo "| **Total** | **$TOTAL** |" >> "$GITHUB_STEP_SUMMARY"
echo "" >> "$GITHUB_STEP_SUMMARY"
echo "⏱️ **Duration:** ${DURATION_SEC}s" >> "$GITHUB_STEP_SUMMARY"

# List failed tests if any
if [ "$FAILED" -gt 0 ]; then
  echo "" >> "$GITHUB_STEP_SUMMARY"
  echo "### Failed Tests" >> "$GITHUB_STEP_SUMMARY"
  echo "" >> "$GITHUB_STEP_SUMMARY"
  jq -r '.suites[].suites[]?.specs[]? | select(.ok == false) | "- ❌ \(.title)"' playwright-report/results.json >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true
  jq -r '.suites[].specs[]? | select(.ok == false) | "- ❌ \(.title)"' playwright-report/results.json >> "$GITHUB_STEP_SUMMARY" 2>/dev/null || true
fi

echo "" >> "$GITHUB_STEP_SUMMARY"
echo "📊 **Full Report:** Download the \`${ARTIFACT_NAME}\` artifact for detailed HTML report." >> "$GITHUB_STEP_SUMMARY"

# ---------------------------------------------------------------------------
# Accessibility violation summary (populated by e2e/accessibility.spec.ts)
# Each scanned page writes its axe-core violations to
# playwright-report/a11y/<page>.json as a JSON array.
# ---------------------------------------------------------------------------
if ls playwright-report/a11y/*.json 1>/dev/null 2>&1; then
  echo "" >> "$GITHUB_STEP_SUMMARY"
  echo "### ♿ Accessibility Violations (axe-core)" >> "$GITHUB_STEP_SUMMARY"
  echo "" >> "$GITHUB_STEP_SUMMARY"

  # Count violations by impact level across all scanned pages.
  # Use jq -s to read all files at once; default to 0 if parsing fails so the
  # summary step doesn't fail the whole job.
  sum_impact() {
    local impact="$1"
    jq -s --arg impact "$impact" '[.[].[] | select(.impact == $impact)] | length' playwright-report/a11y/*.json || echo 0
  }

  CRITICAL=$(sum_impact critical)
  SERIOUS=$(sum_impact serious)
  MODERATE=$(sum_impact moderate)
  MINOR=$(sum_impact minor)
  TOTAL=$((CRITICAL + SERIOUS + MODERATE + MINOR))

  if [ "$TOTAL" -eq 0 ]; then
    echo "✅ No accessibility violations found across scanned pages." >> "$GITHUB_STEP_SUMMARY"
  else
    echo "| Severity | Count |" >> "$GITHUB_STEP_SUMMARY"
    echo "|----------|-------|" >> "$GITHUB_STEP_SUMMARY"
    echo "| 🔴 Critical | $CRITICAL |" >> "$GITHUB_STEP_SUMMARY"
    echo "| 🟠 Serious  | $SERIOUS  |" >> "$GITHUB_STEP_SUMMARY"
    echo "| 🟡 Moderate | $MODERATE |" >> "$GITHUB_STEP_SUMMARY"
    echo "| 🔵 Minor    | $MINOR    |" >> "$GITHUB_STEP_SUMMARY"
    echo "| **Total**   | **$TOTAL** |" >> "$GITHUB_STEP_SUMMARY"
    echo "" >> "$GITHUB_STEP_SUMMARY"
    echo "> Critical and serious violations fail the accessibility tests. Download the \`${ARTIFACT_NAME}\` artifact for full axe-core details." >> "$GITHUB_STEP_SUMMARY"
  fi
fi
