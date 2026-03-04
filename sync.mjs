import { launchBrowser } from './lib/browser.mjs';
import { ensureTripItLogin, scrapeTrips, parseTrips, filterUpcomingTrips } from './lib/tripit.mjs';
import { ensureReclaimLogin, clearTravelTimezones, addTravelTimezone } from './lib/reclaim.mjs';
import { resolveTimezone } from './lib/timezone.mjs';
import { dumpPage } from './lib/discovery.mjs';

const mode = process.argv[2] || 'dry-run';
const VALID_MODES = ['discover-tripit', 'discover-reclaim', 'dry-run', 'sync'];

if (!VALID_MODES.includes(mode)) {
  console.error(`Unknown mode: ${mode}`);
  console.error(`Usage: node sync.mjs [${VALID_MODES.join('|')}]`);
  process.exit(1);
}

console.log(`\n=== TripIt → Reclaim Travel Timezone Sync ===`);
console.log(`Mode: ${mode}\n`);

const context = await launchBrowser();
let page = context.pages()[0] || await context.newPage();

try {
  if (mode === 'discover-tripit') {
    await discoverTripIt();
  } else if (mode === 'discover-reclaim') {
    await discoverReclaim();
  } else if (mode === 'dry-run') {
    await dryRun();
  } else if (mode === 'sync') {
    await fullSync();
  }
} catch (err) {
  console.error(`\nFATAL ERROR: ${err.message}`);
  console.error(err.stack);
  try { await dumpPage(page, 'fatal-error'); } catch {}
  process.exit(1);
} finally {
  await context.close();
}

// ── Mode implementations ──────────────────────────────────────────

async function discoverTripIt() {
  page = await ensureTripItLogin(context, page);
  // Wait for trip data to finish loading (skeleton placeholders to resolve)
  console.log('Waiting for trip data to load...');
  try {
    await page.waitForFunction(
      () => !document.querySelector('#trips-list-group-your-upcoming .placeholder-glow'),
      { timeout: 15000 }
    );
  } catch {
    console.log('  (placeholders still visible after 15s — dumping anyway)');
  }
  console.log('\nDumping TripIt page for discovery...');
  await dumpPage(page, 'tripit-trips');
  console.log('\nDone! Inspect the screenshots/ directory to refine selectors in lib/tripit.mjs');
}

async function discoverReclaim() {
  page = await ensureReclaimLogin(context, page);
  // Wait for the Reclaim SPA to render actual content
  console.log('Waiting for Reclaim UI to load...');
  try {
    await page.waitForSelector('[class*="MuiTypography"], [class*="settings"], h1, h2', { timeout: 20000 });
    await page.waitForTimeout(3000); // extra time for dynamic content
  } catch {
    console.log('  (UI elements not found after 20s — dumping anyway)');
  }
  console.log('\nDumping Reclaim settings page for discovery...');
  await dumpPage(page, 'reclaim-settings');
  console.log('\nDone! Inspect the screenshots/ directory to refine selectors in lib/reclaim.mjs');
}

async function dryRun() {
  // Step 1: Scrape TripIt
  page = await ensureTripItLogin(context, page);
  const rawTrips = await scrapeTrips(page);
  const allTrips = parseTrips(rawTrips);
  const upcoming = filterUpcomingTrips(allTrips);

  console.log(`\n── All scraped trips (${allTrips.length}) ──`);
  for (const t of allTrips) {
    console.log(`  ${t.destination}`);
    console.log(`    Dates: ${t.startDate?.toISOString().slice(0, 10) || '?'} → ${t.endDate?.toISOString().slice(0, 10) || '?'}`);
  }

  console.log(`\n── Upcoming trips > 1 day (${upcoming.length}) ──`);
  for (const t of upcoming) {
    console.log(`  ${t.destination}`);
    console.log(`    Dates: ${t.startDate.toISOString().slice(0, 10)} → ${t.endDate.toISOString().slice(0, 10)}`);
  }

  // Step 2: Map timezones
  console.log(`\n── Timezone mapping ──`);
  const mapped = mapTimezones(upcoming);
  for (const t of mapped) {
    if (t.tz) {
      console.log(`  ${t.destination} → ${t.tz.timezone} (${t.tz.city}, ${t.tz.country})`);
    } else {
      console.log(`  ${t.destination} → UNKNOWN (no timezone match)`);
    }
  }

  // Step 3: Deduplicate
  const deduped = deduplicateConsecutive(mapped);
  console.log(`\n── After deduplication (${deduped.length}) ──`);
  for (const t of deduped) {
    console.log(`  ${t.destination}: ${t.tz?.timezone || 'UNKNOWN'}`);
    console.log(`    ${t.startDate.toISOString().slice(0, 10)} → ${t.endDate.toISOString().slice(0, 10)}`);
  }

  console.log('\nDry run complete. No changes made to Reclaim.');
}

async function fullSync() {
  // Step 1: Scrape TripIt
  page = await ensureTripItLogin(context, page);
  const rawTrips = await scrapeTrips(page);
  const allTrips = parseTrips(rawTrips);
  const upcoming = filterUpcomingTrips(allTrips);

  console.log(`Found ${upcoming.length} upcoming trip(s)`);

  // Step 2: Map and deduplicate
  const mapped = mapTimezones(upcoming);
  const deduped = deduplicateConsecutive(mapped);
  const withTz = deduped.filter(t => t.tz);

  if (withTz.length === 0) {
    console.log('No trips with resolved timezones to sync.');
    return;
  }

  console.log(`\nWill sync ${withTz.length} travel timezone(s):`);
  for (const t of withTz) {
    console.log(`  ${t.destination}: ${t.tz.timezone} (${t.startDate.toISOString().slice(0, 10)} → ${t.endDate.toISOString().slice(0, 10)})`);
  }

  // Step 3: Push to Reclaim
  page = await ensureReclaimLogin(context, page);
  await clearTravelTimezones(page);

  for (const t of withTz) {
    await addTravelTimezone(page, {
      timezone: t.tz.timezone,
      startDate: t.startDate,
      endDate: t.endDate,
      label: `${t.destination} (${t.tz.city})`,
    });
  }

  console.log('\nSync complete!');
}

// ── Helpers ────────────────────────────────────────────────────────

function mapTimezones(trips) {
  return trips.map(t => ({
    ...t,
    tz: resolveTimezone(t.destination),
  }));
}

/**
 * Deduplicate consecutive trips in the same timezone.
 * Merges date ranges when adjacent trips share a timezone.
 */
function deduplicateConsecutive(trips) {
  if (trips.length === 0) return [];

  // Sort by start date
  const sorted = [...trips].sort((a, b) => a.startDate - b.startDate);
  const result = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (prev.tz && curr.tz && prev.tz.timezone === curr.tz.timezone) {
      // Merge: extend the end date
      prev.endDate = curr.endDate > prev.endDate ? curr.endDate : prev.endDate;
    } else {
      result.push(curr);
    }
  }

  return result;
}
