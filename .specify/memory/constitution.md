<!--
Sync Impact Report
- Version change: (initial) → 1.0.0
- Modified principles: none (first ratification)
- Added sections: Core Principles (I-V), Technology & Architecture Constraints,
  Development Workflow, Governance
- Removed sections: none
- Follow-up TODOs: none
-->

# Ad Serve Client Constitution

## Core Principles

### I. Clean, Readable Code

Code MUST prioritize clarity over cleverness. Names MUST say what they mean;
functions and modules MUST each do one clear thing; structure MUST be
obvious to a new reader without relying on comments to explain what the code
itself should already make clear. Comments MUST be reserved for non-obvious
rationale — a hidden constraint, a workaround, a surprising edge case — never
for restating what well-named code already shows. Every change MUST pass the
project's linter and type checker before it is considered done.

Rationale: ad-serve-client runs embedded on other companies' production
websites, not in an environment we control. A contributor changing it cannot
see every host-page context it will actually run in, so the code itself must
carry that context clearly rather than relying on tribal knowledge.

### II. Layered Architecture

The codebase MUST maintain a clear separation between five parts, each
depending only on what's listed below it: **Loader** (the tiny, hand-authored
inline snippet publishers paste onto their page — establishes the global
namespace/command queue, e.g. `window.adServe = window.adServe || {q: []}`,
and async-loads the real bundle; deliberately kept outside the bundler/build
so it stays small enough to inline directly in HTML), **Orchestrator**
(business logic — validates slot/placement config, decides what to request
and when, drains the command queue once the bundle loads), **API Client** (a
thin wrapper around `fetch` calls to ad-serve-api's decision/batch-decision
endpoints, with no business logic of its own — just request shaping and
response parsing), **Renderer** (takes a winning ad candidate and renders it
into a sandboxed `<iframe>` in the host page's DOM — no decision logic of its
own), and **Utility** (generic, stateless helpers — DOM queries, debounce,
viewability detection — with no business meaning). Dependencies MUST flow
Loader → Orchestrator → (API Client, Renderer) and MUST NOT point upward or
skip a layer: the Orchestrator MUST NOT build DOM directly (it MUST go
through the Renderer) or call `fetch` directly (it MUST go through the API
Client). Utility MUST NOT depend on any of the other four layers and MAY be
used by any of them — see Principle IV.

Rationale: separating "what to request" (Orchestrator) from "how to ask
ad-serve-api" (API Client) and "how to paint the result" (Renderer) keeps
each piece independently testable and lets any one of them change — a new
ad-serve-api endpoint shape, a different rendering sandbox strategy — without
rewriting the others. Keeping the Loader outside the build is what lets
publishers paste a few lines directly into their HTML instead of depending
on the bundle loading successfully just to start queuing calls.

### III. Testable Layers via Dependency Injection

Orchestrator, API Client, and Renderer code MUST receive their collaborators
— the `fetch` implementation, `window`/`document` references — via injected
parameters rather than reaching for global `fetch`/`document` internally.
Every Orchestrator, API Client, and Renderer module MUST have unit tests that
exercise its logic in isolation, using injected fakes in place of real
network calls and real DOM globals (Jest or Vitest with jsdom). A change to
any of the three layers MUST NOT be merged without unit tests covering its
main behavior and its significant edge cases.

Rationale: Dependency injection is what makes Principle II's layering
testable in practice — network calls and DOM manipulation are exactly the
kind of side effects that make code slow and flaky to test if reached for
directly, and this SDK's core value (does it request and render the right
ad) has to be verifiable without a real browser tab or a real ad-serve-api
instance running.

### IV. Dedicated Utility & Client Modules

Utility code (generic, stateless helpers with no business meaning) and API
Client code (the thin wrapper around calls to ad-serve-api) MUST each live in
their own dedicated location, separate from Loader, Orchestrator, and
Renderer code. A utility module MUST NOT contain business/domain logic. An
API Client module MUST NOT contain business logic of its own — once it
starts deciding *whether* to request or *what* to do with a response beyond
parsing it, that logic MUST move to the Orchestrator instead of staying in
the Client.

Rationale: Segregating generic helpers and the ad-serve-api wrapper keeps
them easy to find and swap, and stops both "utils" and "client" from
becoming a dumping ground for logic that actually belongs in the
Orchestrator — which would quietly undermine Principle II's layering.

### V. Fail-Silent, Never Break the Host Page

Because this code executes inside a third-party page the SDK does not own,
an uncaught exception anywhere in the Loader, Orchestrator, API Client, or
Renderer MUST NOT propagate and break the host page's own script execution.
Every entry point invoked from host-page or queued code MUST be wrapped so
that failures — network errors, malformed or unexpected ad-serve-api
responses, a missing DOM target for a slot — are caught, MAY be reported or
logged, and MUST degrade to simply not rendering an ad for that slot. An
uncaught, propagating error is NEVER an acceptable outcome, no matter how
unexpected the underlying failure.

Rationale: This is the deliberate inverse of ad-serve-api's Fail-Fast
Dependency Wiring principle, and that contrast is the point. Fail-fast is
right for a backend service we own and operate: we want a misconfigured
dependency to be a loud, immediate boot-time failure caught in a deploy log.
Here the code runs on infrastructure we don't own — someone else's website —
where a loud, uncaught failure means breaking a page we have no right to
break. The correct failure mode is silent degradation: the publisher simply
doesn't get an ad for that slot, rather than a broken page.

## Technology & Architecture Constraints

ad-serve-client is a TypeScript codebase with **no UI framework** — it runs
inside arbitrary, unknown host pages (React sites, WordPress, plain HTML)
and cannot assume or impose a framework of its own without risking version
conflicts or bloating the bundle. Source is bundled with **esbuild** into a
single vanilla-JS IIFE for distribution.

Distribution follows the standard ad-industry loader-snippet + command-queue
pattern (as used by Google Publisher Tag, Prebid.js, and similar): a tiny
hand-authored inline snippet publishers paste onto their page creates a
global namespace and command queue, then async-loads the real bundle from a
CDN; calls made before the bundle finishes loading are queued and drained
once it's ready (see Principle II).

Ad creatives are rendered inside a **sandboxed `<iframe>`**, never injected
directly into the host page's DOM, for style and security isolation from the
host page.

ad-serve-client is the browser-side counterpart to **ad-serve-api**: on page
load it calls ad-serve-api's decision (or batch decision) endpoint with the
placement/targeting details needed to retrieve the winning ad candidate(s),
then renders the result. It owns no ad-serving logic or data of its own —
that lives in ad-serve-api.

## Development Workflow

Features flow through the spec-kit lifecycle (`/speckit-constitution` →
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`)
on a dedicated branch per feature (see the `speckit-git-branch` extension).

## Governance

This constitution supersedes ad-hoc or undocumented conventions wherever the
two conflict. Amendments are made via `/speckit-constitution`, require an
updated Sync Impact Report, and follow semantic versioning: MAJOR for
backward-incompatible governance or principle removals/redefinitions, MINOR
for a new principle or materially expanded guidance, PATCH for
clarifications or wording fixes. All specs and plans produced by the
spec-kit workflow, and all code review, must verify compliance with the Core
Principles above; any deliberate deviation or added complexity that doesn't
fit them must be justified explicitly (in the plan's Complexity Tracking
section, or the PR description) rather than silently overriding a principle.

**Feature Branch Provenance**: Every new feature branch MUST be cut from an
up-to-date local `main` — `git fetch origin` and fast-forwarding/merging
local `main` to `origin/main` MUST complete before the branch-creation step
(the `speckit-git-branch` `before_specify` hook, or the equivalent manual
`git checkout -b` workflow) runs. Branching from whatever branch currently
happens to be checked out (e.g., a prior feature branch, an unsynced local
`main`) MUST NOT be used as a substitute, since it silently carries that
branch's unmerged or stale history into the new feature.

**Version**: 1.0.0 | **Ratified**: 2026-09-17 | **Last Amended**: 2026-09-17
