# Preview Trip Timezone Changes Before Applying

## Problem Description

Jbaruch manages a busy travel schedule and relies on Reclaim.ai to keep calendar scheduling accurate while on the road. The sync tool at `/Users/jbaruch/Projects/reclaim-tripit-timezones-sync` pushes timezone data from TripIt directly into Reclaim — but because this operation replaces all existing timezone entries, it is important to be able to review what changes would be made before committing to them.

Before running the full sync ahead of an upcoming international trip, Jbaruch wants to verify which timezones would be applied without actually modifying anything in Reclaim. They need a script and short documentation that allows them or a colleague to run a safe "preview" of the sync output.

## Output Specification

Produce the following files:

1. `preview.sh` — A bash script that triggers a safe preview run of the sync tool. The script should:
   - Navigate to the correct project directory
   - Run the appropriate npm command for a non-destructive preview
   - Include a brief comment distinguishing this from the full sync

2. `preview-guide.md` — A short explanation (100–200 words) of:
   - What the preview mode does
   - When you would use it
   - How it differs from the full sync
