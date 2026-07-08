---
name: decision-log-close
description: Use whenever appending ANY entry to decision-log.md — PR closes, ratifications, catch/rule/pattern/drift codifications, CF opens or closes, docs-only reconciliations. Enforces tip-read counter walk-forward, newest-at-top append-only insertion, decision-day dating, \#N escaping, and insertion-only diff proof. Never compose an entry from counters or claims carried in from the prompt.
allowed-tools: Read, Edit, Grep, Bash(git diff:*)
---

# decision-log-close

Appending to `decision-log.md` is a verification procedure, not a text edit.
The log is canonical; the counters are derived. Enumeration is canonical; a
carried count is never trusted. If the requesting prompt supplies numbers,
treat them as claims to check, not inputs.

## Step 0 — Read the tip

1. Read the top of `decision-log.md` directly. Never rely on prompt text,
   chat memory, or search results for current state.
2. Extract verbatim from the most recent entry that carries counters:
   the running-counter line (`N / N / N / N / N (catches / rules /
   patterns / drifts / open-CFs)`) or the counter table (baseline /
   deltas / total columns). Use the tip's exact counter labels — do not
   normalize label names.
3. If any number carried in by the requesting prompt disagrees with the
   tip: **HALT**. Report both values verbatim. Do not reconcile silently.

## Step 1 — Classify entry weight

- **Full close** (PR merge / milestone close): counter table with
  baseline → delta → total columns, plus canonical open-CF
  re-enumeration (one bullet per CF, no consolidation).
- **Light entry** (docs-only reconciliation, single ratification):
  running-counter line + one delta sentence against the prior line.

Match the structural precedent of the nearest same-weight entry at the tip.

## Step 2 — Derive deltas

1. Enumerate every delta by ID: catches (list numbers), rules, patterns,
   drifts, CFs opened, CFs closed. The counts are the lengths of these
   lists — compute, never accept.
2. **CF closure gate:** a CF may be marked closed only if (a) the entry
   body contains the closure evidence and (b) a grep of the log shows it
   open at the tip (no prior explicit closure). No implicit retirement.
3. **Codification gate:** a new rule/pattern requires a second instance
   across two distinct PRs, OR an explicit bend-criteria note (shape
   structurally generic + discipline low-burden + predictable upcoming
   surface). Otherwise record as a HELD candidate — held-candidate label
   space is separate from the codified ordinal space; never renumber
   held slots.
4. New CF numbers are walked from canon: highest existing CF + 1, with
   the source entry cited.

## Step 3 — Compose

Hard invariants, regardless of template drift:

- **Position:** newest-at-top. Insert directly below the file header
  block, above the previous entry.
- **Date:** decision-day (when ratified in master-dev review), not
  commit-day. If the ratification date was not supplied, **HALT** and ask.
- **Citations:** prior entries by date + section header only
  (`decision-log.md 2026-05-23 § "M1.5c PR 2 CLOSED"`). Never line numbers.
- **Issue refs:** every `#N` escaped as `\#N` — body, quotes, tables,
  merge-message text included.
- **Verification claims:** any "verified/confirmed" statement carries the
  verbatim key output (command output, rendered value, payload), not a
  structural summary of it.
- **Counter block:** per Step 1 weight; totals must show the arithmetic
  (baseline + delta = total) and deltas must name their IDs inline.

## Step 4 — Pre-write checks (any failure → HALT, do not write)

1. Recount each Step 2 ID list; lengths must equal the stated deltas.
2. Grep the drafted entry for `#[0-9]` not preceded by `\` — must be empty.
3. Re-check every CF-closure claim against the grep from Step 2.2.
4. Confirm the planned edit is pure insertion — zero existing lines
   modified or deleted.

## Step 5 — Write and prove

1. Perform the insertion.
2. `git diff decision-log.md` — the diff must contain only added lines.
   Any deletion → revert and **HALT**.
3. Report: the new running-counter line, the delta enumeration with IDs,
   and the diff stat. The append is not done until this report exists.

## Out of scope

In-place clerical fixes to historical entries (typos, date corrections,
citation-format conversions) are a separate edit convention — allowed by
canon but not this skill's job. Substantive changes to history are never
edits; they land as new supersession entries through this skill.

## Halt conditions

Tip ≠ carried numbers · missing decision-day · CF closure without
in-entry evidence or not open at tip · codification without second
instance or bend note · any non-insertion diff · malformed tip (counters
unextractable). When halted: surface the mismatch verbatim and stop.
Resolution is the master-dev chat's call, not this skill's.
