#!/usr/bin/env bash
#
# 本地测试 commit 验证脚本
# 用法: ./test-commit-validation.sh [base_ref]
#

set -euo pipefail

# 颜色定义
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# 配置
readonly COMMIT_REGEX="^(revert: )?(feat|fix|docs|style|refactor|perf|test|build|ci|chore)(\(.+\))?!?: .{1,50}$"
readonly VALID_TYPES="feat|fix|docs|style|refactor|perf|test|build|ci|chore"

# 函数
is_merge_commit() {
  local commit_hash="$1"
  local parent_count
  parent_count=$(git rev-list --parents -n 1 "$commit_hash" | awk '{print NF-1}')
  [ "$parent_count" -gt 1 ]
}

validate_commit_msg() {
  local msg="$1"
  echo "$msg" | grep -qE "$COMMIT_REGEX"
}

get_error_detail() {
  local msg="$1"
  
  if ! echo "$msg" | grep -qE "^(revert: )?($VALID_TYPES)"; then
    echo "Invalid type"
  elif ! echo "$msg" | grep -qE "^(revert: )?($VALID_TYPES)(\(.+\))?!?:"; then
    echo "Missing colon"
  elif echo "$msg" | grep -qE "^(revert: )?($VALID_TYPES)(\(.+\))?!?: .{51,}"; then
    echo "Subject too long (>50 chars)"
  elif echo "$msg" | grep -qE "^(revert: )?($VALID_TYPES)(\(.+\))?!?: *$"; then
    echo "Empty subject"
  else
    echo "Invalid format"
  fi
}

# 主逻辑
echo "🔍 Testing commit validation..."
echo ""

# 确定 commit 范围
BASE_REF="${1:-origin/main}"
if git rev-parse "$BASE_REF" >/dev/null 2>&1; then
  COMMIT_RANGE="$BASE_REF..HEAD"
  echo "📍 Range: $BASE_REF..HEAD"
elif git rev-parse HEAD~1 >/dev/null 2>&1; then
  COMMIT_RANGE="HEAD~1..HEAD"
  echo "📍 Range: HEAD~1..HEAD"
else
  COMMIT_RANGE="HEAD"
  echo "📍 Range: HEAD only"
fi
echo ""

# 获取 commits
mapfile -t commits < <(git log --format="%H %s" "$COMMIT_RANGE" 2>/dev/null || true)

if [ ${#commits[@]} -eq 0 ]; then
  echo -e "${YELLOW}⚠️  No commits found${NC}"
  exit 0
fi

echo "📊 Found ${#commits[@]} commit(s)"
echo ""

# 验证
declare -i invalid_count=0
declare -i valid_count=0
declare -i skip_count=0

for commit_line in "${commits[@]}"; do
  commit_hash="${commit_line%% *}"
  commit_msg="${commit_line#* }"
  short_hash="${commit_hash:0:8}"
  
  # 跳过 merge commits
  if is_merge_commit "$commit_hash"; then
    echo -e "⏭️  ${short_hash} (merge commit)"
    ((skip_count++))
    continue
  fi
  
  # 验证
  if validate_commit_msg "$commit_msg"; then
    echo -e "${GREEN}✅ ${short_hash}${NC}"
    ((valid_count++))
  else
    error_detail=$(get_error_detail "$commit_msg")
    echo -e "${RED}❌ ${short_hash}: ${error_detail}${NC}"
    echo "   $commit_msg"
    ((invalid_count++))
  fi
done

# 总结
echo ""
echo "═══════════════════════════════════════════════"
echo "Valid: $valid_count, Invalid: $invalid_count, Skipped: $skip_count"
echo "═══════════════════════════════════════════════"
echo ""

if [ $invalid_count -eq 0 ]; then
  echo -e "${GREEN}✅ All commits are valid!${NC}"
  exit 0
else
  echo -e "${RED}❌ Found $invalid_count invalid commit(s)${NC}"
  echo ""
  echo "Expected format: <type>(<scope>): <subject>"
  echo "Example: feat(api): add user endpoint"
  exit 1
fi
