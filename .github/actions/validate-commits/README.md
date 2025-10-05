# Commit Message Validation Action

验证 commit 消息是否符合项目规范的 GitHub Action。

## ✨ 特性

- ✅ **符合 Conventional Commits 规范**
- 🚀 **高性能**：使用 Bash 原生功能，无需额外依赖
- 🛡️ **稳定可靠**：完善的错误处理和边界情况处理
- 📊 **清晰反馈**：详细的错误信息和验证摘要
- 🔧 **灵活配置**：支持严格模式和自定义选项

## 📖 使用方法

### 基础用法

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0

- name: Validate commits
  uses: ./.github/actions/validate-commits
```

### 高级配置

```yaml
- name: Validate commits (strict)
  uses: ./.github/actions/validate-commits
  with:
    base_ref: origin/main # 比较的基准分支
    strict_mode: true # 严格模式（样式警告也会失败）
    skip_merge_commits: true # 跳过 merge commits（默认）
```

## 🔧 输入参数

| 参数 | 说明 | 必需 | 默认值 |
| --- | --- | --- | --- |
| `base_ref` | 比较的基准引用 | 否 | `origin/${{ github.base_ref }}` |
| `strict_mode` | 是否启用严格模式 | 否 | `false` |
| `skip_merge_commits` | 是否跳过 merge commits | 否 | `true` |

## 📤 输出

| 输出            | 说明                                    |
| --------------- | --------------------------------------- |
| `valid`         | 是否所有 commits 有效（`true`/`false`） |
| `invalid_count` | 无效 commits 数量                       |
| `warning_count` | 样式警告数量                            |

## 📝 Commit 消息格式

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### 支持的 Types

- `feat`: 新功能
- `fix`: 错误修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行）
- `refactor`: 重构
- `perf`: 性能优化
- `test`: 测试相关
- `build`: 构建系统
- `ci`: CI 配置
- `chore`: 其他杂项

### 规则

- **Subject 长度**: 1-50 字符
- **Subject 格式**: 小写开头，无句号结尾
- **动词时态**: 使用祈使语气（`add` 而非 `added`）
- **Scope**: 可选，用括号包裹
- **Breaking Change**: 在 type 后添加 `!`

### 示例

✅ **正确**:

```
feat(auth): add JWT authentication
fix(api): handle null response
docs: update installation guide
refactor(core)!: change API interface
```

❌ **错误**:

```
Added new feature               # 缺少 type
feat:Add feature               # 缺少空格，首字母大写
feat(api): This is a very long commit message that exceeds fifty characters  # 太长
fix(bug): fixed the bug.       # 过去式，句号结尾
```

## 🧪 本地测试

使用提供的测试脚本在本地验证 commits：

```bash
# 测试当前分支相对于 origin/main 的 commits
.github/scripts/test-commit-validation.sh

# 指定其他基准分支
.github/scripts/test-commit-validation.sh origin/develop
```

## 🎯 优化亮点

### 相比原版本的改进

1. **代码简化**

   - 从 276 行减少到 ~200 行（-27%）
   - 使用函数模块化，提高可维护性
   - 移除冗余的调试输出

2. **性能优化**

   - 使用 `mapfile` 代替多次子进程调用
   - 使用 `awk` 替代 `wc | tr` 组合
   - 减少重复的 git 命令执行

3. **稳定性增强**

   - 统一使用 `set -euo pipefail` 严格模式
   - 所有输出通过 `set_output` 函数统一管理
   - 改进的错误处理和边界情况处理

4. **可读性提升**

   - 清晰的函数命名和职责分离
   - 简化的输出格式
   - 一致的代码风格

5. **最佳实践**
   - 使用 `readonly` 声明常量
   - 使用局部变量（`local`）避免污染
   - 使用环境变量传递 GitHub Context
   - 添加 `--no-tags --prune` 优化 fetch 操作

## 🔍 故障排查

### Commits 未被验证

确保 checkout action 使用了足够的 `fetch-depth`：

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0 # 获取完整历史
```

### Base reference 找不到

对于 PR，action 会自动 fetch base 分支。如果仍有问题，请检查：

```yaml
- name: Debug
  run: |
    git branch -r
    git log --oneline -10
```

## 📚 相关资源

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Angular Commit Guidelines](https://github.com/angular/angular/blob/master/CONTRIBUTING.md#commit)
- [Semantic Versioning](https://semver.org/)

## 📄 许可

与项目主许可证相同
