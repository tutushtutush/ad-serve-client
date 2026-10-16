# Research: Fix the git branch skill's word splitting

## D1 The real cause

**Finding**: the skill file already says `awk '{print $1, $2, $3}'`. The skill runner replaces `$1`, `$2` and `$3` anywhere in a skill's text with the words of the invocation arguments before the agent reads it, so the agent saw `awk '{print schedule, for, campaigns}'` (spec 077's run). The file is right; the text is not safe from the runner.

**Decision**: remove every positional name from the skill text. Do not rely on escaping (`\$1`), because how the runner treats escapes is not documented here and may change.

## D2 How the description reaches the shell

**Decision** (revised, see below): the skill puts the description (placed there by the runner's arguments placeholder) in a here-document with a quoted delimiter, read straight into a variable; everything after uses `"$DESCRIPTION"` and never the placeholder again.

```bash
IFS= read -r -d '' DESCRIPTION <<'SPECKIT_DESCRIPTION_END' || true
$ARGUMENTS
SPECKIT_DESCRIPTION_END
```

**Why**: inside a here-document with a quoted delimiter the shell does no expansion, so quotes, apostrophes, dollar signs, backticks and parentheses in the description are literal. The old text pasted the description inside double quotes twice, where a quote or a command substitution in it could break or run something.

**Alternatives considered**
- Keep `"$ARGUMENTS"` and ask the agent to escape: relies on the agent noticing, which is the failure this fixes.
- Single quotes around the placeholder: an apostrophe in the description ends them.
- Tell the agent to pass the description through a temporary file: more steps for the same safety.

**Residual**: a description containing a line that is exactly the delimiter would end the here-document early; the delimiter is long and specific so it cannot occur in a real description (a test covers the realistic cases, not a deliberate attack on the delimiter).

## D3 Picking the first three words

**Decision**: `read -r W1 W2 W3 _ <<<"$DESCRIPTION"`, then `FIRST_THREE=$(printf '%s %s %s' "$W1" "$W2" "$W3" | sed 's/[[:space:]]*$//')`.

**Why**: `read` splits on whitespace into named variables (any run of spaces, tabs; the first line only), works the same in bash and zsh, and needs no positional names. The `sed` drops the trailing spaces left when there are fewer than three words, so a short description still gives exactly its words.

**Alternatives considered**
- `awk '{print $1, $2, $3}'`: the bug.
- `cut -d' ' -f1-3`: splits on single spaces only, so extra spaces or tabs change the result.
- bash arrays (`read -a`, `${words[@]:0:3}`): zsh uses different syntax (`read -A`, one-based), the agent's shell here.
- `awk -v` with named fields or `$NF`-style: still positional.

**Note**: only the first line is used; a multi-line description keeps its first three words from line one, as the old pipeline did (awk read the first line's fields for the first record, then continued per line, so the old command printed three words per line; the new rule is clearer and what the spec states).

## D4 Test design

**Decision**: `gitBranchSkill.test.ts` reads `SKILL.md`, applies the runner's substitution as it works (positional names and the arguments placeholder replaced by the description's words, which is what broke the old text), extracts the fenced bash snippets of steps 2 and 3, runs them with `bash`, and checks the words and the dry-run branch name. It also scans all skill texts for positional names.

**Why**: it reproduces the failure on the old text and proves the new text survives the same substitution; it runs in CI so the trap cannot return.

## Rejected or reversed approaches

- **Wrapping the here-document in a command substitution** (`DESCRIPTION=$(cat <<'EOF' ... EOF )`), which this plan first used. Reversed during `/speckit-analyze` after trying it in the shells on this machine: macOS's bash 3.2 mis-parses quotes inside a here-document nested in `$( )`, so any description with an apostrophe fails with "unexpected EOF". `read -r -d ''` has no nesting, works in bash 3.2, current bash and zsh, and executed nothing in any of them for a description holding quotes, a backtick, a dollar sign, a command substitution and an unbalanced parenthesis.


## Reproduced (T002)

The test is the one written for adconfig's spec 079 (the skill text was identical here). Against the old skill text it failed 31 of 34 cases (Tests:       31 failed, 3 passed, 34 total); only the three empty-description cases passed.

## Found while implementing

adconfig's spec 079 found and recorded two things that this copy already includes: the here-document must not be wrapped in a command substitution (macOS bash 3.2 mis-parses it) and its closing line must be at column 0, so the block sits at the left margin; and the test compares the branch with what this repository's own `create-new-feature.sh` makes of the same three words rather than guessing its slug rules.

## Result

Tests:       34 passed, 34 total: 34 of 34 cases pass under macOS's bash 3.2, bash and zsh against this repository's script. Run by hand with a description holding `$1`, backticks, quotes and an open parenthesis, steps 2 and 3 gave the words "Test the skill's" and a dry-run branch, with nothing executed.
