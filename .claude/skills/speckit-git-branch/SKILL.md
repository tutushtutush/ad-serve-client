---
name: "speckit-git-branch"
description: "Create or switch to a git feature branch named after the next/current spec-kit feature number, using the first three words of the feature description. Invoked automatically as the before_specify hook by /speckit-specify; can also be run standalone."
argument-hint: "Feature description (same text passed to /speckit-specify)"
compatibility: "Requires spec-kit project structure with .specify/ directory and a git repository"
metadata:
  author: "local (hand-rolled equivalent of the upstream spec-kit git extension)"
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## Purpose

This is the `before_specify` hook registered in `.specify/extensions.yml`. It gives each
feature its own git branch instead of everything landing on whatever branch `/speckit-specify`
happened to run on. It must complete and print `BRANCH_NAME`/`FEATURE_NUM` before
`/speckit-specify` proceeds to create the spec directory.

Naming rule: the branch suffix is the **first three whitespace-separated words** of the raw
feature description, taken as typed (no stop-word filtering) — e.g. "home page hosts events..."
→ `home-page-hosts`. This intentionally differs from `/speckit-specify`'s own 2-4 word LLM-chosen
short name used for the spec directory; only the numeric prefix is guaranteed to match between
the two (see Notes).

## Execution

1. Confirm this is a git repository (`git rev-parse --is-inside-work-tree`). If not, report an
   error and stop — do not attempt branch creation outside a repo.

2. Extract the first three whitespace-separated words from `$ARGUMENTS`, preserving them as
   typed (punctuation and casing get normalized in the next step):

   ```bash
   FIRST_THREE=$(printf '%s' "$ARGUMENTS" | awk '{print $1, $2, $3}')
   ```

   If the description has fewer than three words, this naturally yields however many exist.

3. Compute the branch name deterministically, reusing `/speckit-specify`'s own numbering logic
   (scans `specs/` for the highest existing `NNN-` prefix and adds one) but overriding the
   suffix with the first-three-words rule via `--short-name`. This is a dry run — it does **not**
   create any directories:

   ```bash
   .specify/scripts/bash/create-new-feature.sh --json --dry-run --short-name "$FIRST_THREE" "$ARGUMENTS"
   ```

   Parse `BRANCH_NAME` and `FEATURE_NUM` from the JSON output. If the script errors (e.g. empty
   description), surface the error and stop.

4. Determine the current branch (`git branch --show-current`).
   - If it already equals `BRANCH_NAME`, nothing to do — skip to step 6.
   - Otherwise continue.

5. Create or switch to the branch:
   - If a local branch named `BRANCH_NAME` already exists, check it out: `git checkout "$BRANCH_NAME"`
     (reusing an existing branch does not require re-syncing `main` — that requirement applies to
     new-branch creation, not to resuming work already in progress).
   - Otherwise, this is a **new** branch, which per the constitution's "Feature branch provenance"
     governance rule MUST be cut from an up-to-date local `main`, not from whatever happens to be
     checked out:
     1. Sync local `main` with `origin`:
        - If the current branch (from step 4) is `main`: `git pull --ff-only origin main`. A plain
          `git fetch origin main:main` fails here — git refuses to update the ref of the branch
          that's currently checked out.
        - Otherwise: `git fetch origin main:main`, which fast-forwards local `main` to match
          `origin/main` (creating it locally if it doesn't exist yet) without checking it out.
        Either way, if it fails (network error, or local `main` has diverged and can't
        fast-forward), report the git error verbatim and stop — do not force-update `main` or
        branch off a stale one.
     2. Create the feature branch from `main`: `git checkout -b "$BRANCH_NAME" main`.
   - If checkout fails (e.g. uncommitted changes that conflict), report the git error verbatim
     and stop — do not force/discard anything.

6. Output the result as compact JSON on its own line, matching the contract `/speckit-specify`
   expects from this hook:

   ```json
   {"BRANCH_NAME":"<branch-name>","FEATURE_NUM":"<NNN>"}
   ```

## Notes

- This hook only creates/switches branches. It never creates the `specs/<NNN-name>/` directory
  or `spec.md` — that remains `/speckit-specify`'s job. Its directory name is chosen
  independently (an LLM-picked 2-4 word summary), so it may read differently from this branch's
  first-three-words suffix even though both share the same `NNN` number.
- Never force-push, force-checkout (`-f`), or discard local changes to make the switch succeed.
  If the working tree isn't clean enough for a plain `git checkout -b`, stop and report why.
