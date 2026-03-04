import { dumpPage } from './discovery.mjs';

const RECLAIM_SETTINGS_URL = 'https://app.reclaim.ai/settings/hours';
const LOGIN_WAIT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Map IANA timezone to Reclaim display name (used for picking from the dropdown)
// Reclaim uses names like "Central European Time (Berlin)", "Eastern Time (New York)"
const IANA_TO_RECLAIM_SEARCH = {
  'America/New_York': 'Eastern',
  'America/Chicago': 'Central Time',
  'America/Denver': 'Mountain',
  'America/Los_Angeles': 'Pacific',
  'America/Mexico_City': 'Mexico City',
  'Europe/London': 'London',
  'Europe/Berlin': 'Berlin',
  'Europe/Amsterdam': 'Amsterdam',
  'Europe/Warsaw': 'Warsaw',
  'Europe/Paris': 'Paris',
  'Asia/Tokyo': 'Tokyo',
  'Asia/Shanghai': 'Shanghai',
};

/**
 * Check if a Reclaim page has finished loading its SPA UI (not just a spinner).
 */
async function isReclaimLoaded(p) {
  try {
    const hasMuiContent = await p.$('[class*="MuiDrawer"], nav.MuiList-root');
    return !!hasMuiContent;
  } catch {
    return false;
  }
}

export async function ensureReclaimLogin(context, page) {
  console.log('Navigating to Reclaim settings...');
  await page.goto(RECLAIM_SETTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

  console.log('  Waiting for Reclaim app to load...');
  await page.waitForTimeout(5000);

  const url = page.url();
  const loaded = await isReclaimLoaded(page);

  if (!url.includes('reclaim.ai') || url.includes('login') || url.includes('auth') || !loaded) {
    console.log('');
    console.log('==> Reclaim login required. Please log in in the browser window.');
    console.log('    If the page is just spinning, navigate to https://app.reclaim.ai manually.');
    console.log('    Waiting up to 5 minutes...');
    console.log('');

    const deadline = Date.now() + LOGIN_WAIT_TIMEOUT;
    let lastLog = 0;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const pages = context.pages();
        if (Date.now() - lastLog > 15000) {
          const urls = pages.map(p => { try { return p.url().slice(0, 80); } catch { return '<closed>'; } });
          console.log(`  [debug] ${pages.length} page(s): ${urls.join(' | ')}`);
          lastLog = Date.now();
        }

        for (const p of pages) {
          let pUrl;
          try { pUrl = p.url(); } catch { continue; }
          if (pUrl.includes('reclaim.ai') && await isReclaimLoaded(p)) {
            if (!pUrl.includes('/settings')) {
              await p.goto(RECLAIM_SETTINGS_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
              await p.waitForTimeout(3000);
            }
            console.log('Reclaim login successful!');
            return p;
          }
        }
      } catch {
        // Context/pages transitioning — ignore
      }
    }
    throw new Error('Reclaim login timed out after 5 minutes');
  }

  return page;
}

/**
 * Wait for the Travel timezones section to be visible.
 */
async function waitForTravelSection(page) {
  try {
    await page.waitForSelector('[class*="TimeZoneOverrideSection"]', { timeout: 10000 });
  } catch {
    // Try scrolling down to find it
    await page.evaluate(() => window.scrollTo(0, 500));
    await page.waitForTimeout(1000);
  }
}

/**
 * Delete all existing travel timezone entries from Reclaim.
 */
export async function clearTravelTimezones(page) {
  console.log('Clearing existing travel timezones...');
  await waitForTravelSection(page);

  let deleted = 0;
  const deleteSelector = '[class*="TimeZoneOverrideRow_deleteButton"]';

  while (true) {
    const deleteBtn = await page.$(deleteSelector);
    if (!deleteBtn) break;

    await deleteBtn.click();
    deleted++;
    await page.waitForTimeout(1000);
  }

  console.log(`  Deleted ${deleted} existing travel timezone(s)`);
}

/**
 * Add a travel timezone entry to Reclaim.
 *
 * The "add new" row has:
 *  - A "Select timezone" button that opens a timezone picker popover
 *  - Two date inputs (Start, End) with placeholder "MM/DD/YYYY"
 *  - A "Save" button (disabled until all fields are filled)
 */
export async function addTravelTimezone(page, { timezone, startDate, endDate, label }) {
  console.log(`  Adding: ${label} (${timezone})`);
  const startStr = formatMMDDYYYY(startDate);
  const endStr = formatMMDDYYYY(endDate);
  console.log(`    ${startStr} → ${endStr}`);

  try {
    await waitForTravelSection(page);

    // Step 1: Click the "Select timezone" button in the add-new row
    // The add-new row is the last TimeZoneOverrideRow that contains "Select timezone"
    const selectTzBtn = await page.$('[class*="TimeZoneOverrideRow_tzPicker__label"]:has-text("Select timezone")');
    if (!selectTzBtn) {
      // Maybe "Select timezone" text is in a parent button
      const fallback = await page.$('button:has-text("Select timezone")');
      if (fallback) {
        await fallback.click();
      } else {
        console.log('    WARNING: Could not find "Select timezone" button. Dumping page...');
        await dumpPage(page, 'reclaim-no-tz-btn');
        return false;
      }
    } else {
      await selectTzBtn.click();
    }
    await page.waitForTimeout(500);

    // Step 2: A popover/dropdown should appear. Search for the timezone.
    // Look for a search input in the popover
    const searchInput = await page.$('[class*="TZPickerPopper"] input, [role="listbox"] input, .MuiPopover-root input, input[placeholder*="earch"]');
    const searchTerm = IANA_TO_RECLAIM_SEARCH[timezone] || timezone.split('/').pop().replace(/_/g, ' ');

    if (searchInput) {
      await searchInput.fill(searchTerm);
      await page.waitForTimeout(500);
    }

    // Click the matching option in the dropdown
    // Try various selectors for the option list
    const optionSelectors = [
      `[role="option"]:has-text("${searchTerm}")`,
      `li:has-text("${searchTerm}")`,
      `.MuiMenuItem-root:has-text("${searchTerm}")`,
      `.MuiListItemButton-root:has-text("${searchTerm}")`,
    ];

    let clicked = false;
    for (const sel of optionSelectors) {
      const option = await page.$(sel);
      if (option) {
        await option.click();
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log(`    WARNING: Could not find timezone option for "${searchTerm}". Dumping page...`);
      await dumpPage(page, 'reclaim-no-tz-option');
      return false;
    }
    await page.waitForTimeout(500);

    // Step 3: Fill in the date range
    // The add-new row's date inputs are NOT readonly (existing entries' inputs ARE readonly)
    const dateInputs = await page.$$('[class*="TimeZoneOverrideRow_root"] input[placeholder="MM/DD/YYYY"]:not([readonly])');
    if (dateInputs.length >= 2) {
      // Start date
      await dateInputs[dateInputs.length - 2].click();
      await dateInputs[dateInputs.length - 2].fill(startStr);
      await page.waitForTimeout(300);

      // End date
      await dateInputs[dateInputs.length - 1].click();
      await dateInputs[dateInputs.length - 1].fill(endStr);
      await page.waitForTimeout(300);
    } else {
      console.log(`    WARNING: Found ${dateInputs.length} non-readonly date inputs (expected 2). Dumping page...`);
      await dumpPage(page, 'reclaim-no-date-inputs');
      return false;
    }

    // Step 4: Click Save
    // Tab out of the date field first to trigger validation
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500);

    const saveBtn = await page.$('button:has-text("Save"):not([disabled])');
    if (saveBtn) {
      await saveBtn.click();
      await page.waitForTimeout(1500);
      console.log('    Saved!');
    } else {
      console.log('    WARNING: Save button not found or disabled. Dumping page...');
      await dumpPage(page, 'reclaim-save-disabled');
      return false;
    }

    return true;
  } catch (err) {
    console.log(`    ERROR adding timezone: ${err.message}`);
    await dumpPage(page, 'reclaim-add-error');
    return false;
  }
}

function formatMMDDYYYY(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const y = date.getFullYear();
  return `${m}/${d}/${y}`;
}
