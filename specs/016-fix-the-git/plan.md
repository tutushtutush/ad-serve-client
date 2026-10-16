# Implementation Plan: Fix the git branch skill's word splitting

**Branch**: `016-fix-the-git` | **Date**: 2026-10-16 | **Spec**: [spec.md](spec.md)

## Summary

Rewrite steps 2 and 3 of `.claude/skills/speckit-git-branch/SKILL.md` so the description reaches the shell through a quoted here-document read straight into a variable (`read -d ''`, not a command substitution) (no description text inside a quoted command string) and the first three words are read with `read` into named variables (no positional shell names). Add a jest test that reads the skill text the way the skill runner presents it (positional names and the arguments placeholder replaced by the description's words), runs the extracted commands with bash, and checks the words, the branch name from the existing script (dry run), and a search of every skill for positional names. adconfig's spec 079 made the same change first and is the reference; this repository carries a copy of the verified skill text and test.

## Technical Context

**Language/Version**: Markdown skill text with bash snippets; test in TypeScript (jest, node environment)

**Primary Dependencies**: none new; `child_process` in the test

**Storage**: N/A

**Testing**: `npm test` (jest); `tests/unit/scripts/gitBranchSkill.test.ts`

**Target Platform**: the agent's shell (bash or zsh on macOS and Linux CI)

**Project Type**: single service repository (the change touches only tooling text and one test)

**Constraints**: the branch naming rule, numbering, empty-description error and the rest of the hook unchanged (FR-005); snippet must work in both bash and zsh (the agent's shell is zsh on this machine); no application code changes

**Scale/Scope**: one skill file and one test file

## Constitution Check

| Principle | Result |
|---|---|
| I Clean code | Pass. Comments only where the trap is non-obvious (why no positional names). |
| II to VII (layers, services, UI, platform) | Not affected: tooling text and a test only. |
| Workflow | Pass. Spec, plan, tasks, analyze, implement, converge run as commands; decisions recorded in `research.md`; merge only on the owner's word. |

No violations; Complexity Tracking: none.

## Project Structure

```text
specs/016-fix-the-git/{spec.md, plan.md, research.md, quickstart.md, tasks.md}
.claude/skills/speckit-git-branch/SKILL.md      # steps 2 and 3 rewritten
tests/unit/scripts/gitBranchSkill.test.ts       # new: simulates the runner, runs the snippets
```

**Structure Decision**: no new directories; the test lives with the other script tests.

## Phases

- **Phase 0** research: [research.md](research.md).
- **Phase 1** design: no data model and no contracts (internal tooling); validation in [quickstart.md](quickstart.md).
- Reference: adconfig spec 079; the other repository carrying the skill has its own spec.
