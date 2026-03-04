import { dumpPage } from './discovery.mjs';

const TRIPIT_TRIPS_URL = 'https://www.tripit.com/trips';
const LOGIN_WAIT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a page is a logged-in TripIt page (not login form, not Google OAuth).
 */
async function isLoggedInTripIt(p) {
  try {
    const url = p.url();
    if (!url.includes('tripit.com')) return false;
    if (url.includes('accounts.google.com')) return false;
    if (url.includes('account/login') || url.includes('account/create')) return false;
    const loginForm = await p.$('form#authenticate, #signup-container-create-login');
    return !loginForm;
  } catch {
    return false;
  }
}

export async function ensureTripItLogin(context, page) {
  console.log('Navigating to TripIt...');
  await page.goto(TRIPIT_TRIPS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  if (await isLoggedInTripIt(page)) return page;

  console.log('');
  console.log('==> TripIt login required. Please log in in the browser window.');
  console.log('    Waiting up to 5 minutes...');
  console.log('');

  const deadline = Date.now() + LOGIN_WAIT_TIMEOUT;
  let lastLog = 0;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const pages = context.pages();
      // Log page URLs periodically for debugging
      if (Date.now() - lastLog > 10000) {
        const urls = pages.map(p => { try { return p.url().slice(0, 80); } catch { return '<closed>'; } });
        console.log(`  [debug] ${pages.length} page(s): ${urls.join(' | ')}`);
        lastLog = Date.now();
      }

      for (const p of pages) {
        if (await isLoggedInTripIt(p)) {
          // Re-verify after a brief wait to avoid catching mid-redirect
          await new Promise(r => setTimeout(r, 3000));
          if (await isLoggedInTripIt(p)) {
            // Navigate to trips page if not already there
            if (!p.url().includes('/trips')) {
              await p.goto(TRIPIT_TRIPS_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
            }
            console.log('TripIt login successful!');
            return p;
          }
        }
      }
    } catch {
      // Context/pages transitioning — ignore
    }
  }
  throw new Error('TripIt login timed out after 5 minutes');
}

/**
 * Scrape upcoming trips from TripIt.
 * Returns array of { name, destination, dateText }.
 */
export async function scrapeTrips(page) {
  console.log('Scraping trips from TripIt...');

  // Wait for skeleton placeholders to resolve into actual trip data
  try {
    await page.waitForFunction(
      () => !document.querySelector('#trips-list-group-your-upcoming .placeholder-glow'),
      { timeout: 15000 }
    );
  } catch {
    console.log('  Warning: trip data may still be loading');
  }

  try {
    await page.waitForSelector('[data-cy="trip-list-item-name"]', { timeout: 10000 });
  } catch {
    console.log('  No trip elements found. Running discovery dump...');
    await dumpPage(page, 'tripit-no-trips');
    return [];
  }

  // Handle pagination: TripIt shows 10 per page
  let allTrips = [];
  let pageNum = 1;

  while (true) {
    const trips = await page.evaluate(() => {
      const cards = document.querySelectorAll('#trips-list-group-your-upcoming .list-group-item');
      return Array.from(cards).map(card => {
        const nameEl = card.querySelector('[data-cy="trip-list-item-name"]');
        const addrEl = card.querySelector('[data-cy="trip-list-item-display-address"]');
        const dateEl = card.querySelector('[data-cy="trip-date-span"] span');
        return {
          name: nameEl?.textContent?.trim() || '',
          destination: addrEl?.textContent?.trim() || '',
          dateText: dateEl?.textContent?.trim() || '',
        };
      });
    });

    allTrips.push(...trips);
    console.log(`  Page ${pageNum}: found ${trips.length} trip(s)`);

    // Check for next page button
    const nextBtn = await page.$('a[aria-label="Go to next page"]:not(.disabled)');
    if (!nextBtn) break;
    await nextBtn.click();
    await page.waitForTimeout(2000);
    try {
      await page.waitForFunction(
        () => !document.querySelector('#trips-list-group-your-upcoming .placeholder-glow'),
        { timeout: 10000 }
      );
    } catch { /* continue with what we have */ }
    pageNum++;
  }

  console.log(`  Total: ${allTrips.length} trip(s)`);
  return allTrips;
}

/**
 * Parse scraped trip data into structured objects with Date instances.
 *
 * TripIt date formats observed:
 *   "Mar 7 - 15, 2026 (9 days, in 4 days)"    — same month
 *   "Mar 30 - Apr 2, 2026 (4 days, in 27 days)" — cross month
 *   "Feb 28 - Mar 6, 2026 (7 days)"            — cross month, no "in X days"
 */
export function parseTrips(rawTrips) {
  const parsed = [];

  for (const trip of rawTrips) {
    const { startDate, endDate } = parseDateRange(trip.dateText);
    parsed.push({
      name: trip.name,
      destination: trip.destination,
      startDate,
      endDate,
      dateText: trip.dateText,
    });
  }

  return parsed;
}

function parseDateRange(text) {
  if (!text) return { startDate: null, endDate: null };

  // Strip the "(X days...)" suffix
  const clean = text.replace(/\s*\(.*$/, '').trim();

  // Pattern 1: "Mar 30 - Apr 2, 2026" (cross-month)
  const crossMonth = clean.match(
    /^(\w{3,9})\s+(\d{1,2})\s*-\s*(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})$/
  );
  if (crossMonth) {
    const [, startMon, startDay, endMon, endDay, year] = crossMonth;
    return {
      startDate: new Date(`${startMon} ${startDay}, ${year}`),
      endDate: new Date(`${endMon} ${endDay}, ${year}`),
    };
  }

  // Pattern 2: "Mar 7 - 15, 2026" (same month)
  const sameMonth = clean.match(
    /^(\w{3,9})\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s+(\d{4})$/
  );
  if (sameMonth) {
    const [, mon, startDay, endDay, year] = sameMonth;
    return {
      startDate: new Date(`${mon} ${startDay}, ${year}`),
      endDate: new Date(`${mon} ${endDay}, ${year}`),
    };
  }

  return { startDate: null, endDate: null };
}

/**
 * Filter to upcoming trips lasting more than 1 day.
 */
export function filterUpcomingTrips(trips) {
  const now = new Date();
  const oneDay = 24 * 60 * 60 * 1000;

  return trips.filter(t => {
    if (!t.endDate || isNaN(t.endDate.getTime())) return false;
    if (t.endDate < now) return false;
    if (t.startDate && t.endDate) {
      const duration = t.endDate - t.startDate;
      if (duration < oneDay) return false;
    }
    return true;
  });
}
