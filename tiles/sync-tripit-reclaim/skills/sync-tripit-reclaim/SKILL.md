---
name: sync-tripit-reclaim
description: "Sync travel timezone data from TripIt trip itineraries to Reclaim.ai travel timezone settings, ensuring accurate scheduling across time zones. Use when the user says: sync travel timezones, update Reclaim from TripIt, sync my trips, TripIt to Reclaim, travel calendar sync, update time zones from itinerary, sync trip schedule, or push travel timezones."
---

Sync upcoming trip timezones from TripIt into Reclaim.ai's travel timezone settings.

## Instructions

**IMPORTANT**: All commands MUST use a bash timeout of at least 360000ms (6 minutes) because the browser may need to wait for manual login.

Run the sync script from the project directory:

```bash
cd /Users/jbaruch/Projects/reclaim-tripit-timezones-sync && npm run sync
```

This will:
1. Open a browser, navigate to TripIt, and scrape upcoming trips
2. Map destinations to IANA timezones
3. Navigate to Reclaim Settings > Hours
4. Delete all existing travel timezone entries
5. Add each upcoming trip as a travel timezone entry

If login is needed for either service, the script will print a message and wait up to 5 minutes for you to log in manually in the browser window.

### Other modes

Every mode below also requires a bash timeout of at least 360000ms — they all open a browser and may wait for login.

- **Dry run** (preview without changes, does NOT modify Reclaim):
  ```bash
  cd /Users/jbaruch/Projects/reclaim-tripit-timezones-sync && npm run dry-run
  ```
- **Discover TripIt** (dump page structure): `cd /Users/jbaruch/Projects/reclaim-tripit-timezones-sync && npm run discover-tripit`
- **Discover Reclaim** (dump page structure): `cd /Users/jbaruch/Projects/reclaim-tripit-timezones-sync && npm run discover-reclaim`

### Error recovery

This sync is destructive — it deletes all existing Reclaim travel timezones before adding new ones. If the sync fails partway through:
1. Check the terminal output for which timezone failed and why
2. Check `screenshots/` directory for error screenshots captured automatically
3. Re-run `npm run sync` — it will start fresh (delete remaining entries and re-add all)
4. Verify success by checking Reclaim Settings > Hours to confirm all entries were added

### After running any command

Always summarize the output for the user:
- For **sync**: report how many timezones were synced, list them, and confirm success or failure
- For **dry-run**: list the trips found, their mapped timezones, and what would be synced
- For **discover**: point the user to the `screenshots/` directory for artifacts

### Important notes

- The browser opens visibly (not headless) so the user can see what's happening
- Login sessions persist in `.auth/` directory across runs
- The command may take 1-2 minutes to complete
