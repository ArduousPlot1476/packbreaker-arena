---
name: codex-cycle
description: Use after pushing a remediation commit to a PR under Codex review — deciding whether to re-request review, polling for Codex's response, classifying findings, and tracking the 4-finding ceiling. Triggers include "push landed, re-request codex," "did codex respond yet," "check codex findings," "should this trip the ceiling," "is this the 4th finding," or any point where the next move might be either "just fix it" or "this needs a meta-audit." Does not apply to the initial auto-review on PR open or the draft-to-ready-for-review toggle — those fire without a manual trigger.
allowed-tools: Bash(curl:*), Bash(git rev-parse:*), Bash(git log:*), Read, Grep
---

# codex-cycle

Codex (`chatgpt-codex-connector[bot]`) auto-reviews on PR open and on the
draft→ready-for-review toggle. It does **not** auto-re-review on
subsequent pushes — every push after that requires an explicit
re-request, or the PR sits unreviewed while you assume it's covered.

## Opening the PR — first-time entry (gated on review sign-off)

Applies only when the PR does not exist yet (for a re-request on an
already-open PR, skip to Step 0). Creating the PR is what fires Codex's
automatic first review, so it is the entry point to this cycle. Open it via
the API with the repo-scoped fine-grained PAT (env var), **not** by hand in
the browser:

```
curl --ssl-no-revoke -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  https://api.github.com/repos/{owner}/{repo}/pulls \
  -d '{"title":"…","head":"<branch>","base":"main","body":"…"}'
```

`$GH_TOKEN` = the env var holding the repo-scoped fine-grained PAT
(Pull requests R/W, Issues R/W, Metadata R/O — substitute your configured
name). Smoke-test read access first (`GET /repos/{owner}/{repo}` → 200)
before any write.

**Hard precondition — this POST does not fire until BOTH hold:**
1. The PR body has cleared `handoff-verify` (every applicable category PASS).
2. Master-dev has signed off on the verbatim title + body text.

This step removes the manual browser copy-paste; it does **not** replace the
review gate. If either precondition is unmet, HALT and surface the title +
body for review first — never self-authorize the POST from the skill alone.

## Step 0 — Reconstruct round state before acting

Chat-carried round counts drift (same failure class Rule 10 exists for).
Before triggering or reporting anything:
1. `git log --oneline` the branch to confirm the current tip SHA.
2. Grep `decision-log.md` for this PR's prior Codex-round entries
   (branch name or PR number) to reconstruct: round number, cumulative
   confirmed-finding count, whether the ceiling has already tripped
   this PR, whether a meta-audit already ran.
3. If the log's round-state and any chat-carried claim disagree,
   **HALT** — surface both, do not average.

## Step 1 — Re-request review (only when actually needed)

Re-request only if commits landed since the last Codex review on this
PR. Do not re-trigger immediately after PR open or a draft→ready
toggle — those already queued an automatic review; a manual trigger
right after wastes a round and confuses the count.

**Trigger mechanics — both are hard rules, not preferences:**
1. Post a **new top-level** PR comment (`POST
   /repos/{owner}/{repo}/issues/{pr}/comments`) via the API with the same
   repo-scoped token (`-H "Authorization: Bearer $GH_TOKEN"`), **not** by
   hand in the browser. Body is **exactly** `@codex review` — nothing
   appended, nothing prepended.
2. **Never** reply inside an existing Codex review thread to
   re-trigger. A reply can spawn a task run instead of a review —
   wrong mechanism, wrong output. If the only path available is a
   thread reply, **HALT** and use the top-level comment endpoint
   instead.

## Step 2 — Poll both surfaces

Codex's response shape depends on outcome. A review WITH findings lands as a **PR review**
(`/pulls/{pr}/reviews`) with line-level comments. A **clean pass (zero findings) may instead land
as a plain top-level issue comment** from the same bot account — confirmed empirically on PR #30,
where a clean "Codex Review: ... Swish!" verdict landed via `/issues/{pr}/comments` while the
reviews endpoint stayed empty.

1. Poll `GET /repos/{owner}/{repo}/pulls/{pr}/reviews`, filter for `user.login ==
   "chatgpt-codex-connector[bot]"` with `submitted_at` after the Step 1 trigger timestamp. Primary
   channel for finding-bearing reviews.
2. ALSO poll `GET /repos/{owner}/{repo}/issues/{pr}/comments`, filter for the same bot login, with
   `created_at` after the trigger timestamp. Do not assume this endpoint only ever carries the human
   trigger — it can also carry Codex's own clean-pass response. Check both endpoints every round.
3. If a hit on either surface references a commit SHA, confirm it matches the current branch tip
   before treating it as current — a match on a stale SHA is not a current response.
4. Once a review with findings is found, fetch line-level findings via `GET
   /repos/{owner}/{repo}/pulls/{pr}/reviews/{review_id}/comments`.
5. Typical response window: 5–10 minutes. If nothing appears by 15 on EITHER endpoint, re-check
   both before assuming Codex is slow or silent.

## Step 3 — Classify each finding

For every finding in the new review:
1. Read the actual referenced file/line yourself before trusting
   Codex's description. Codex has invented plausible-but-wrong
   specific symbol/helper names at least twice while the underlying
   architectural point was still correct — confirm the real names
   against the repo, don't relay Codex's naming verbatim.
2. Tag severity (P1/P2) as Codex marks it.
3. Tag surface: same failure class/same surface as an already-counted
   finding this cycle (tactical patch-loop candidate), or a distinct
   class (counts toward the raw total, evaluated on its own).
4. Tag shape: does this look tactical (local, single-surface fix) or
   structural (spans multiple call sites, touches an architectural
   assumption, would recur elsewhere if patched only here)?

## Step 4 — Gate on the ceiling (judgment calls HALT, arithmetic doesn't)

1. Increment the raw confirmed-finding count for this PR.
2. **Structural finding, ceiling not yet tripped:** HALT before the
   count reaches 4. Surface: "This finding looks structural, not a
   same-surface patch-loop instance — recommend bending the ceiling
   and running the meta-audit now rather than waiting for finding #4."
   This is master-dev's call to make, not this skill's to decide.
3. **Count reaches 4, ceiling not yet tripped:** HALT. Do not draft a
   4th incremental patch. Surface: "Ceiling tripped at finding #4 —
   recommend a comprehensive read-only meta-audit (Phase X.5g pattern)
   across the full surface, not another point-fix." Wait for
   ratification of the meta-audit's scope before touching code.
4. **Ceiling already tripped once this PR, meta-audit already run,
   more findings keep arriving:** do not auto-trigger a second
   meta-audit. Report the running total ("finding count since ceiling
   tripped: N") and surface the open question — same class recurring
   (second meta-audit cycle may be warranted) or different class /
   diminishing returns (candidate for master-dev to mark this round
   TERMINAL and proceed to merge after the current fix). Either way,
   this is a call to surface, not make.

## Step 5 — Round closure

1. A round with zero P1/P2 findings closes CLEAN.
2. On closure (CLEAN or TERMINAL), report the full tally: rounds run,
   raw finding count, ceiling state (never tripped / tripped-and-closed
   / bent-preemptively), meta-audit cycles run this PR.
3. This skill does not write to decision-log.md. Hand the tally to
   `decision-log-close` for the actual entry.

## Halt conditions

Chat-carried round state disagrees with the log · about to reply
inside a review thread instead of posting top-level · trigger string
is anything other than exactly `@codex review` · about to poll
`/issues/{pr}/comments` for Codex's response · raw count would reach 4
without a prior trip and the next planned action is a normal patch ·
a finding reads as structural before the count reaches 4 · ceiling
already tripped and it's unclear whether to run a second meta-audit
cycle or mark the round terminal. Every one of these surfaces to
master-dev; none of them get decided silently by this skill.
