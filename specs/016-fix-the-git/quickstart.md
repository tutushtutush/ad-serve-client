# Quickstart: validating the fix

1. `npm test -- gitBranchSkill`: the table of descriptions (ordinary, two words, one word, extra spaces and tabs, a line break, quotes and apostrophes, a dollar sign, a backtick, `$(...)`) gives the expected three words, the dry-run branch name matches the existing rule, and the search for positional names across all skills finds none.
2. Reproduce the old failure: check out the old skill text in a scratch copy and run the test against it; it fails on the positional names and on the quoted descriptions.
3. Run `/speckit-specify` with a description containing an apostrophe and a dollar sign; the branch is created without manual help.
4. `npm run lint`, `npx tsc --noEmit`, full unit suite.
