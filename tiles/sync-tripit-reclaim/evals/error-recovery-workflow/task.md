# Write a Troubleshooting Guide for Failed Timezone Syncs

## Problem Description

The TripIt-to-Reclaim timezone sync tool at `/Users/jbaruch/Projects/reclaim-tripit-timezones-sync` is used regularly before international travel. However, occasionally the process fails partway through — perhaps a page element wasn't found, a network issue occurred, or a timezone mapping couldn't be resolved.

When this happens, the user is left in an uncertain state: they don't know which timezones were added, which were deleted, and whether Reclaim's settings are now in a partially-updated or broken state. The team needs a clear, actionable troubleshooting guide that any team member can follow when the sync fails mid-run. The guide should explain how to investigate the failure, understand what happened, and restore Reclaim to a correct state.

## Output Specification

Produce the following files:

1. `troubleshooting-guide.md` — A step-by-step recovery guide that covers:
   - How to diagnose what went wrong
   - Where to look for failure evidence and artifacts produced by the tool
   - How to recover and restore Reclaim to a correct state
   - How to verify the recovery was successful

2. `failure-checklist.md` — A short checklist format (5–10 items) that an operator can follow immediately after a sync failure to triage and resolve the issue
