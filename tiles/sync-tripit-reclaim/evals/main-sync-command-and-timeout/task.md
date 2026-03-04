# Automate TripIt-to-Reclaim Timezone Sync

## Problem Description

Jbaruch is a frequent traveler who uses TripIt to manage trip itineraries and Reclaim.ai to schedule their work calendar. Every time a new trip is booked, they need to ensure Reclaim.ai reflects the correct local timezone for each destination — otherwise meetings get scheduled at the wrong times during travel.

They have a local automation project set up at `/Users/jbaruch/Projects/reclaim-tripit-timezones-sync` that handles this synchronization, but they need a helper script and documentation that any team member can use to trigger the sync correctly. The project uses `npm` commands to drive the process. The sync replaces existing timezone settings in Reclaim with fresh data from TripIt — this is an all-or-nothing operation.

The sync process involves a browser session, so it may need to pause for manual login and can take several minutes to complete. The automation tool needs to be invoked with a bash command that does not time out prematurely given these constraints.

## Output Specification

Produce the following files:

1. `sync.sh` — A bash script that runs the timezone sync. The script should:
   - Navigate to the correct project directory before running
   - Execute the appropriate npm command to perform the full sync
   - Include a comment explaining the destructive nature of the operation (existing entries are replaced)
   - Include a note about the expected runtime

2. `README.md` — A short guide (200–400 words) for team members explaining:
   - What the sync does and why it is needed
   - How to run it
   - What to expect during execution (browser behavior, timing)
   - Where login sessions are stored between runs

3. `run-notes.txt` — A one-paragraph note capturing any important behavioral characteristics an operator should know before triggering the sync.

If you are writing a script that calls this command via a bash tool or agent framework that supports configurable timeouts, document the recommended timeout setting as a comment in `sync.sh`.
