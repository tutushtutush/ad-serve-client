# Feature Specification: Fix the git branch skill's word splitting

**Feature Branch**: `016-fix-the-git`

**Created**: 2026-10-16

**Status**: Draft

**Input**: User description: "Fix the git branch skill's word splitting. The speckit-git-branch skill (the before_specify hook) builds the branch suffix from the first three words of the feature description with awk '{print $1, $2, $3}', but the skill runner substitutes $1, $2 and $3 in a skill's text with the words of the invocation arguments, so the command the agent actually sees is awk '{print <word1>, <word2>, <word3>}' and fails or prints nothing. Replace it with a form that has no positional tokens, keeping the rule: branch suffix is the first three whitespace-separated words as typed, normalized by the existing script. The same fix was made in adconfig (its spec 079) and is made in ad-serve-api through its own spec. Behavior of the branch naming does not change."

## Why this exists

Every feature starts with a branch hook that names the branch after the first three words of the feature description. The hook's instructions contain the shell command that picks those words, written with the usual positional names for "first, second and third word". The tool that runs skills replaces those names with the words of the description before the agent reads the text, so the agent is handed a command that is already broken (it prints the description's own words as if they were program variables). In practice the agent has noticed and worked around it by hand, which only works while someone is paying attention, and a description with a quote, an apostrophe, a dollar sign or a backtick in it is pasted straight into the command text and can break or alter it. The branch name is the first thing every feature depends on, so it must come out right every time.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The branch is named from the first three words, every time (Priority: P1)

Someone starts a feature with a description. The hook creates a branch named with the next feature number and the first three words of the description, with no manual correction.

**Why this priority**: It is the whole fix. A wrong or failing branch step stops the start of every feature.

**Independent Test**: Run the hook's word-picking step for a description whose words are known and check the three words and the resulting branch name, with the skill text read exactly as the skill runner presents it.

**Acceptance Scenarios**:

1. **Given** the description "Dayparting enforcement in the service", **When** the hook runs, **Then** the branch suffix words are "Dayparting enforcement in" and the branch is named from them by the existing numbering and normalizing script.
2. **Given** a description of fewer than three words, **When** the hook runs, **Then** the suffix uses however many words exist, as before.
3. **Given** extra spaces, tabs or a line break between words, **When** the hook runs, **Then** the first three whitespace-separated words are still the ones used.
4. **Given** the skill text as the skill runner presents it for any description, **When** it is read, **Then** the word-picking command is exactly the one written in the skill, never altered by the description.

---

### User Story 2 - A description cannot change the command (Priority: P1)

A description may contain quotes, apostrophes, dollar signs, backticks or parentheses (for example "Fix the skill's $1 handling `now`"). None of that may break the hook or run anything.

**Why this priority**: Pasting free text into a command is a standing hazard, and descriptions are written by people (and pasted from tickets and chats).

**Independent Test**: Run the hook steps with a description full of shell-special characters and confirm the words are picked correctly, no extra command runs and the branch name comes out as the rule says.

**Acceptance Scenarios**:

1. **Given** a description containing a double quote, a single quote, a dollar sign and a backtick, **When** the hook runs, **Then** it still picks the first three words and creates the branch.
2. **Given** a description containing a command substitution such as a dollar sign followed by parentheses, **When** the hook runs, **Then** the text is treated as plain words and nothing is executed.

---

### User Story 3 - Other skills are not affected (Priority: P2)

No other skill text in the repository relies on positional names that the skill runner would replace.

**Why this priority**: The same trap could be hiding elsewhere.

**Independent Test**: Search every skill text for positional shell names and find none outside this fix.

**Acceptance Scenarios**:

1. **Given** the repository's skill texts, **When** they are searched for positional names (first, second, third word or all arguments) used as shell variables, **Then** none remain.

## Edge Cases

- An empty description: the hook reports the existing error and stops, as before.
- A very long first word, or words made only of punctuation: normalization is unchanged, so the branch name is whatever the existing script makes of them.
- A description that already looks like a branch name or contains a slash: unchanged behaviour, the script normalizes it.
- Non-ASCII words: unchanged, the script decides what to keep.
- The branch-number logic, the up-to-date `main` rule and the rest of the hook are untouched.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The hook MUST take the first three whitespace-separated words of the feature description as typed, and pass them to the existing numbering and normalizing script, exactly as the rule says today.
- **FR-002**: The skill's text MUST contain no positional shell names (the first, second and third word, or all arguments) that the skill runner could replace before the agent reads it.
- **FR-003**: The description MUST reach the shell commands without being pasted inside quotes in the command text, so no character in it can end a quote, start a substitution or be executed.
- **FR-004**: A description with fewer than three words, extra whitespace, quotes, apostrophes, dollar signs, backticks or parentheses MUST give the same branch name the rule gives for its words.
- **FR-005**: The branch naming rule, numbering, the empty-description error and the rest of the hook MUST be unchanged.
- **FR-006**: The skill MUST be checked by a runnable test that covers the cases in the acceptance scenarios, so the trap cannot come back unnoticed.
- **FR-007**: The same fix MUST be made in all three repositories that carry the skill (adconfig through its spec 079, ad-serve-api and ad-serve-client), each through its own spec.

### Key Entities

- **Feature description**: free text typed or pasted by a person, passed to the hook.
- **Branch suffix words**: the first three whitespace-separated words of the description.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the cases in the acceptance scenarios (ordinary, short, spaced, and shell-special descriptions) give the branch name the rule gives, with no manual correction.
- **SC-002**: A search of all skill texts in the repository finds 0 positional shell names.
- **SC-003**: A description made of shell-special characters runs 0 commands and produces no error.
- **SC-004**: Starting a feature needs no manual workaround for the branch step in any of the three repositories.

## Assumptions

- The skill runner replaces positional names written like `$1` in a skill's text with the words of the invocation arguments before the agent sees it; the fix avoids the names rather than depending on how the runner treats them.
- The numbering and normalizing script (`create-new-feature.sh`) is correct and is not changed.
- The fix is a change to the skill text (the instructions the agent follows) plus a small checking script; no application code changes.
- adconfig fixed the same skill first (its spec 079, PR tutushtutush/adconfig#127) and the third repository (ad-serve-api) is fixed through its own spec; this repository copies the verified skill text and test.
