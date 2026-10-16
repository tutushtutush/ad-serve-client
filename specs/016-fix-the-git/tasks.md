# Tasks: Fix the git branch skill's word splitting

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [quickstart.md](quickstart.md)

Tests are included (FR-006). No application code changes. Merge only when the owner says "merge".

## Phase 1: Foundational

- [X] T001 Create `tests/unit/scripts/gitBranchSkill.test.ts` (`@jest-environment node`) per research D4: read `.claude/skills/speckit-git-branch/SKILL.md`; a helper applies the skill runner's substitution (every positional shell name and the arguments placeholder replaced by the description's words or text, as the runner does) and extracts the fenced bash snippets of steps 2 and 3; run them under each of `/bin/bash` (3.2 on macOS), `bash` and `zsh` that exist on the machine, in a temporary directory that has a copy of `.specify/scripts/bash/` and `specs/` (so the dry-run script sees real numbering); assert the words and the branch name. Cases: ordinary description; two words; one word; extra spaces, tabs and a line break; apostrophe and double quote; a dollar sign; a backtick; a dollar-parenthesis substitution that would create a marker file (the file must not exist afterwards); an empty description gives the script's existing error. Also a test that every `SKILL.md` under `.claude/skills/` contains no positional shell names (`$1` to `$9`, `$@`, `$*`) outside this check's allowed list (none).
- [X] T002 Confirm T001 fails on the current skill text (positional names found, quoted descriptions break), recording the failures in `research.md` under "Reproduced".

## Phase 2: User Stories 1, 2 and 3 (the fix)

- [X] T003 [US1] [US2] Rewrite steps 2 and 3 of `.claude/skills/speckit-git-branch/SKILL.md` per research D2 and D3: put the description in a variable with `IFS= read -r -d '' DESCRIPTION <<'SPECKIT_DESCRIPTION_END' || true` and a quoted-delimiter here-document (the arguments placeholder appears once, inside it; no command substitution around it, research D2), pick the words with `read -r W1 W2 W3 _ <<<"$DESCRIPTION"` and build `FIRST_THREE` with `printf` and `sed`, pass `"$DESCRIPTION"` to `create-new-feature.sh` in step 3, and add a short comment on why positional names and pasting the description into quotes are avoided. Leave every other step as it is.
- [X] T004 [US3] Search the repository's other skills and scripts for positional shell names that the runner would replace (the T001 scan covers skill texts); fix any found in a skill text, and record the result. Done by the scan in T001's test: no positional shell names remain in any skill text in this repository. Done by the scan in T001's test: no positional shell names remain in any skill text here.

## Phase 3: Polish

- [X] T005 Run `npm run lint`, `npx tsc --noEmit` and the full unit suite.
- [X] T006 Check by hand that `/speckit-specify` for a description with an apostrophe, a dollar sign and a backtick creates the branch without help (quickstart step 3), then delete that scratch branch and spec folder; record the result in `research.md`. Done by running the real hook text as the skill runner presented it for a description with an apostrophe, a dollar sign, backticks, quotes and an open parenthesis (steps 2 and 3, the changed part); steps 4 to 6 are unchanged and were not run so as not to switch branches with uncommitted work. See research.md. Done by running the new skill text's steps 2 and 3 for a description with an apostrophe, a dollar sign, backticks, quotes and an open parenthesis against this repository's `create-new-feature.sh`; the words and the dry-run branch were right and nothing executed. Steps 4 to 6 are unchanged.
- [ ] T007 Note in `research.md` that the other repositories carrying the skill are fixed in their own specs and link their PRs. ad-serve-api and ad-serve-client get the same change through their own specs; PR links are added there when they exist.

## Dependencies

T001 first; T002 after T001; T003 after T002; T004 beside T003; T005 and T006 after T003; T007 last.

## Implementation strategy

One pass: write the test, watch it fail, fix the skill, watch it pass. The other two repositories reuse the same test and skill text.
