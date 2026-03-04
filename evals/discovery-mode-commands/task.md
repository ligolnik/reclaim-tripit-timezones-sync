# Build a Debugging Toolkit for the TripIt-Reclaim Integration

## Problem Description

The engineering team at jbaruch's company is occasionally asked to troubleshoot the TripIt-to-Reclaim timezone sync when it breaks or produces unexpected results. The sync tool lives at `/Users/jbaruch/Projects/reclaim-tripit-timezones-sync` and is driven by npm scripts. When something goes wrong, the team needs to inspect the page structures of both TripIt and Reclaim to understand what the scraper sees and why it might be failing or mapping destinations incorrectly.

The team has asked for a pair of diagnostic shell scripts — one for each service — along with a runbook that explains when and how to use each. These scripts should capture the raw page/DOM structure that the automation tool observes, so developers can compare it against what the scraper expects.

## Output Specification

Produce the following files:

1. `debug-tripit.sh` — A bash script that runs the TripIt page structure dump for the sync tool
2. `debug-reclaim.sh` — A bash script that runs the Reclaim page structure dump for the sync tool
3. `debug-runbook.md` — A short runbook (150–300 words) explaining:
   - What each script does (what output it produces)
   - When to use each one (e.g., TripIt sync side failing vs Reclaim update side failing)
   - Any important notes about running these diagnostics
