---
name: handoff-verify
description: Use before any artifact that makes claims about repo/decision-log state leaves this session or gets acted on — opening a PR, pasting a PR body into GitHub, executing a Phase prompt pasted in from the master-dev chat, drafting a merge commit message, or drafting a closing report. Also use before merging, before requesting Codex review, or whenever text says "verified," "confirmed," "N closed," or states a counter/total. Does NOT apply to decision-log.md appends themselves — use decision-log-close for those. Never accept a factual or quantitative claim in a pasted artifact at face value; check it against the live repo first.
allowed-tools: Read, Grep, Bash(git log:*), Bash(git diff:*), Bash(git show:*)
---

# handoff-verify

Master-dev chat cannot read the live repo — its view of decision-log.md is
whatever project knowledge last indexed, which lags real commits by weeks.
Every claim it hands you in a prompt, PR body, or closing draft is a claim
to check, not a fact to relay. This skill is the checkpoint: nothing pasted
in or about to be pasted out gets used until it clears all categories that
apply to it.

Search-silence is inconclusive, not evidence of absence. If a grep for
something expected to exist comes back empty, that means "escalate and
look harder," not "confirmed not present."

## Step 0 — Classify the artifact

Read the pasted text and tag which categories below actually apply.
Not every artifact triggers every category — a Phase prompt with no
quantitative claims skips 2/3; a PR body with no "verified" language
skips 5. Do not skip a category because checking it is inconvenient;
skip it only because the artifact makes no claim in that category.

## Step 1 — CF closure-claim text vs decision-log

For every claim of the form "CF N closed / resolved / fixed / done":
1. `grep -n "CF N" decision-log.md` (or Read + search) for every prior
   mention — confirm no existing explicit closure entry already covers it.
   No implicit retirement: absence of a closure entry means it is still open.
2. Confirm CF N appears in the current canonical open-CF enumeration at
   all. Closing something not tracked as open is a HALT, not a formality.
3. Confirm the artifact's own body contains the actual closure evidence
   (what changed, where) — not just the assertion that it's closed.

## Step 2 — Quantitative baselines vs latest closing entry

1. Extract every stated number: counter lines (`N/N/N/N/N`), "X open
   CFs," "N catches," any baseline the artifact treats as current.
2. Read the actual tip of decision-log.md — the most recent entry
   carrying a counter line or table.
3. Compare exactly. Any mismatch → HALT, report both values verbatim,
   do not average or assume one is right.

## Step 3 — Summary arithmetic vs current enumeration

1. Wherever the artifact states a total derived from a list (files
   changed, deltas, CFs opened/closed this PR), recompute the total by
   counting the actual list — in the artifact, or via `git diff --stat`
   / `git log` against the live repo, whichever the claim is about.
2. Stated total ≠ recomputed total → HALT.

## Step 4 — Bare-#N auto-link scan

1. Regex-scan the full artifact text for `#[0-9]+` NOT preceded by `\`.
   Covers PR body, merge commit message text, quoted decision-log text,
   table cells — everywhere, not just prose paragraphs.
2. Any match → HALT, list each occurrence, require escaping to `\#N`
   before the artifact is used.

## Step 5 — Verbatim output presence vs structural summary

1. Flag every claim of the form "verified X," "confirmed Y," "tests
   pass," "ran N times," "gate green."
2. For each, check whether the artifact carries the actual supporting
   output alongside it — command output, diff, rendered value, payload —
   or only a prose assertion of the outcome.
3. Prose-only, no attached evidence → HALT. Either fetch and attach the
   real output (Bash/Read against the live repo) or flag that the
   artifact needs it before it can be trusted. Config or report
   inspection alone is never sufficient — this is the same failure
   shape as the dashboard defects invisible to config review.

## Report format

Output a table, one row per category that applied at Step 0:

| Category | Applies? | Result | Evidence |
|---|---|---|---|
| 1 — CF closure | yes/no | PASS/HALT | grep result or citation |
| 2 — Baseline match | yes/no | PASS/HALT | tip value vs claimed value |
| 3 — Arithmetic | yes/no | PASS/HALT | recomputed vs stated |
| 4 — Bare-#N | yes/no | PASS/HALT | line-level list of hits |
| 5 — Verbatim evidence | yes/no | PASS/HALT | what's attached, if anything |

Any HALT row blocks the artifact. Report the mismatch and stop — do not
silently correct and proceed; the correction is master-dev's or Trey's
call, not this skill's.

## Out of scope

- Decision-log.md append mechanics (position, dating, insertion-only
  diff) — that's `decision-log-close`.
- The Codex review loop itself (re-request timing, 4-finding ceiling) —
  that's the not-yet-built `codex-cycle`.
- Fixing what it finds. This skill verifies and halts; it does not edit.
