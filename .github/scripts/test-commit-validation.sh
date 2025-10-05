#!/bin/bash

# Test script for commit message validation
# This script tests the commit message validation logic from pr-check.yml

echo "🧪 Testing commit message validation logic"
echo "=========================================="
echo ""

# Define the exact regex from commit-convention.md
COMMIT_REGEX="^(revert: )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?!?: .{1,50}$"

# Test cases: [message, expected_result, description]
declare -a test_cases=(
  "feat(dev): add 'comments' option|PASS|Valid feature commit"
  "fix(dev): fix dev error|PASS|Valid fix commit"
  "perf(build)!: remove 'foo' option|PASS|Valid breaking change"
  "revert: feat(compiler): add 'comments' option|PASS|Valid revert commit"
  "docs: update README|PASS|Valid docs without scope"
  "style(ui): format code|PASS|Valid style with scope"
  "refactor: improve performance|PASS|Valid refactor without scope"
  "test(unit): add new tests|PASS|Valid test commit"
  "build: update dependencies|PASS|Valid build commit"
  "ci: fix GitHub Actions|PASS|Valid CI commit"
  "chore: update .gitignore|PASS|Valid chore commit"

  # Invalid cases
  "Added new feature|FAIL|Missing type"
  "feat add new feature|FAIL|Missing colon"
  "feat: |FAIL|Empty subject"
  "invalid(scope): test|FAIL|Invalid type"
  "feat: this is a very long commit message that exceeds fifty characters limit|FAIL|Subject too long"
  "FEAT: add feature|FAIL|Type must be lowercase"
  "feat(): empty scope|FAIL|Empty scope"
  "feat:(dev): wrong format|FAIL|Invalid scope format"
  " feat: leading space|FAIL|Leading space"
  "feat: Added new feature|WARN|Capitalized subject (style warning)"
  "feat: add new feature.|WARN|Period at end (style warning)"
  "feat: added new feature|WARN|Past tense (style warning)"
)

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Run tests
for test_case in "${test_cases[@]}"; do
  IFS='|' read -r message expected description <<< "$test_case"

  # Check against regex
  if echo "$message" | grep -qE "$COMMIT_REGEX"; then
    result="PASS"

    # Check for style warnings
    subject=$(echo "$message" | sed -E "s/^(revert: )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?!?: //")

    if echo "$subject" | grep -qE "^[A-Z]" || \
       echo "$subject" | grep -qE "\.$" || \
       echo "$subject" | grep -qE "^(added|changed|fixed|removed|updated|modified|created|deleted)"; then
      result="WARN"
    fi
  else
    result="FAIL"
  fi

  # Compare with expected result
  if [[ "$result" == "$expected" ]] || ([[ "$expected" == "WARN" ]] && [[ "$result" == "PASS" ]]); then
    echo -e "${GREEN}✓${NC} $description"
    echo "  Message: '$message'"
    echo "  Expected: $expected, Got: $result"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $description"
    echo "  Message: '$message'"
    echo "  Expected: $expected, Got: $result"
    ((FAILED++))
  fi
  echo ""
done

# Summary
echo "=========================================="
echo "Test Results:"
echo -e "${GREEN}Passed:${NC} $PASSED"
echo -e "${RED}Failed:${NC} $FAILED"

if [ $FAILED -eq 0 ]; then
  echo -e "\n${GREEN}✅ All tests passed!${NC}"
  exit 0
else
  echo -e "\n${RED}❌ Some tests failed!${NC}"
  exit 1
fi