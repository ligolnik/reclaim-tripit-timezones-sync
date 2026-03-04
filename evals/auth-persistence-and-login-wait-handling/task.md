# Document the Authentication Workflow for the TripIt-Reclaim Sync Tool

## Problem Description

A new team member has joined jbaruch's engineering team and needs to onboard onto the TripIt-to-Reclaim timezone sync workflow. They are technically capable but unfamiliar with how the sync tool handles authentication for TripIt and Reclaim.ai. The tool lives at `/Users/jbaruch/Projects/reclaim-tripit-timezones-sync` and uses browser automation to interact with both services.

The new team member has several concerns: How will they know when to log in? What happens if they're not already logged in? Will they need to log in every time? How long can they expect to wait? What should they do if the automation seems to hang?

They need a clear authentication guide that walks them through the first-run and subsequent-run login experience, and a wrapper script that correctly handles execution timing constraints so the automation isn't killed before it can complete.

## Output Specification

Produce the following files:

1. `auth-guide.md` — A guide (200–350 words) for new team members covering:
   - How the tool handles authentication for both services
   - Where login state is stored and how this affects subsequent runs
   - What to expect and do when a login prompt appears
   - How long the tool waits for a user to complete login
   - Expected total runtime for the sync operation

2. `run-with-timeout.sh` — A bash script that runs the full sync with appropriate timeout handling. The script should:
   - Navigate to the correct project directory
   - Run the sync command
   - Be configured (or include a comment) with the recommended minimum timeout for use with a bash tool or orchestration framework that supports timeout settings
