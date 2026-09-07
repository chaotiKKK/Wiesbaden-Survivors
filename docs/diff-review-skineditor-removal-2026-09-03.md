# Hidden-diff-era review + SkinEditor removal — 2026-09-03

## What happened
After the `assume-unchanged` flag on `index.html` was cleared, the true cumulative
diff became visible (+116/−19). Every hunk was reviewed end to end against the
`docs/` records. 14 of 18 hunks mapped to documented, substantiated changes
(seed cue, `?devsim` gate + nav skip, wave wording pass, tutorial objective line,
skip-button clarity).

## Flagged: the SkinEditor cluster
A ~93-line character skin editor (floating "Aussehen (K)" button on title/char
select, global `K` hotkey, capture-phase key-swallowing modal, `skinOverrides`
persistence, in-place CHARS mutation + Sylvia's default look change + hair-color
plumbing + `Game.init` hook) existed in the working tree but matched **no** docs
record and **no** session review — it was even absent from the earlier
"cumulative session edits" enumeration at flag-clearing. Markers of foreign
origin: mid-file BOM before `const SkinEditor`, UI copy inconsistent with the
codebase ("Zurueck", un-umlauted), inline cssText styling. This was the
hidden-diff-era accident: an entire feature invisible to every status/diff/commit
review.

## Decision (user-approved): remove
Reverted to HEAD: the SkinEditor block, Sylvia's default-skin change, both
pony-hair render sites, and the `Game.init` hook. Removal verified by
`grep` (zero SkinEditor/skinOverrides/seOpenBtn/sk.hair/KeyK remnants),
`git diff` (now 13 hunks, +24/−16), `?selftest` 98/98 PASS, and live DOM checks
(seed cue present, simRow hidden with 0 nav members on a plain load, Sylvia's
original skin restored, no floating button).

## Process note (narrow miss)
The first reverse-apply patch was sliced too wide and also reverted the seed-row
and simRow markup hunks; both were re-detected via the missing diff hunks and
restored from the saved full diff, then re-verified. Final diff contains exactly
the documented change set.
