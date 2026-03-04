import ical from 'node-ical';
import { find as findTz } from 'geo-tz';

// TZ abbreviation → IANA timezone mapping
// When an abbreviation is ambiguous, we pick the most common traveler destination
const TZ_ABBR_TO_IANA = {
  // North America
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  AKST: 'America/Anchorage',
  AKDT: 'America/Anchorage',
  HST: 'Pacific/Honolulu',
  AST: 'America/Puerto_Rico',

  // Europe
  GMT: 'Europe/London',
  BST: 'Europe/London',
  WET: 'Europe/Lisbon',
  WEST: 'Europe/Lisbon',
  CET: 'Europe/Berlin',
  CEST: 'Europe/Berlin',
  EET: 'Europe/Bucharest',
  EEST: 'Europe/Bucharest',
  IST: 'Europe/Dublin',  // Irish Standard Time (ambiguous with India)
  MSK: 'Europe/Moscow',
  TRT: 'Europe/Istanbul',

  // Asia
  JST: 'Asia/Tokyo',
  KST: 'Asia/Seoul',
  CST_ASIA: 'Asia/Shanghai',  // Chinese Standard Time — handled specially
  HKT: 'Asia/Hong_Kong',
  SGT: 'Asia/Singapore',
  ICT: 'Asia/Bangkok',
  WIB: 'Asia/Jakarta',
  IST_INDIA: 'Asia/Kolkata',  // handled specially
  PKT: 'Asia/Karachi',
  GST: 'Asia/Dubai',
  IRST: 'Asia/Tehran',

  // Oceania
  AEST: 'Australia/Sydney',
  AEDT: 'Australia/Sydney',
  ACST: 'Australia/Adelaide',
  ACDT: 'Australia/Adelaide',
  AWST: 'Australia/Perth',
  NZST: 'Pacific/Auckland',
  NZDT: 'Pacific/Auckland',

  // South America
  BRT: 'America/Sao_Paulo',
  BRST: 'America/Sao_Paulo',
  ART: 'America/Argentina/Buenos_Aires',
  CLT: 'America/Santiago',
  CLST: 'America/Santiago',
  COT: 'America/Bogota',
  PET: 'America/Lima',

  // Africa
  WAT: 'Africa/Lagos',
  CAT: 'Africa/Harare',
  EAT: 'Africa/Nairobi',
  SAST: 'Africa/Johannesburg',
};

/**
 * Fetch and parse the TripIt iCal feed.
 * Returns all VEVENT entries.
 */
export async function fetchIcalEvents(icalUrl) {
  console.log('Fetching TripIt iCal feed...');
  const data = await ical.async.fromURL(icalUrl);
  const events = Object.values(data).filter(e => e.type === 'VEVENT');
  console.log(`  Found ${events.length} VEVENT(s)`);
  return events;
}

/**
 * Identify trip-level events (all-day events with DTSTART as DATE, not DATETIME).
 * These have LOCATION and GEO properties.
 */
export function extractTrips(events) {
  const trips = [];

  for (const ev of events) {
    // All-day trip events have DTSTART as a date string (no time component)
    // node-ical sets dateOnly=true or the value is a bare Date at midnight
    const start = ev.start;
    const end = ev.end;
    if (!start || !end) continue;

    // Check if this is an all-day event (trip-level)
    // node-ical: all-day events have start.dateOnly === true or the ical param VALUE=DATE
    const isAllDay = start.dateOnly === true
      || (ev.datetype === 'date')
      || (typeof start === 'string' && /^\d{4}-?\d{2}-?\d{2}$/.test(start));

    if (!isAllDay) continue;

    const startDate = normalizeDate(start);
    const endDate = normalizeDate(end);

    trips.push({
      summary: ev.summary || '',
      location: ev.location || '',
      geo: ev.geo || null,
      startDate,
      endDate,
      uid: ev.uid || '',
    });
  }

  console.log(`  Identified ${trips.length} trip-level event(s)`);
  return trips;
}

/**
 * Extract flight events (non-all-day events with arrival info in DESCRIPTION).
 * Returns them sorted by start time.
 */
export function extractFlights(events) {
  const flights = [];

  for (const ev of events) {
    const start = ev.start;
    if (!start) continue;

    // Skip all-day events
    if (start.dateOnly === true || ev.datetype === 'date') continue;

    const desc = ev.description || '';
    // Look for arrival pattern: "HH:MM AM/PM TZ\nArrive City (CODE)"
    const arrivalMatch = desc.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s+([A-Z]{2,5})\s*\n\s*Arrive\s+(.+)/i);
    if (!arrivalMatch) continue;

    const [, arrivalTime, tzAbbr, arrivalCity] = arrivalMatch;
    const arrivalDate = new Date(start);

    flights.push({
      summary: ev.summary || '',
      arrivalDate,
      arrivalTime,
      tzAbbr: tzAbbr.toUpperCase(),
      arrivalCity: arrivalCity.replace(/\s*\(.*\)/, '').trim(),
      arrivalCityCode: (arrivalCity.match(/\(([A-Z]{3})\)/) || [])[1] || '',
      description: desc,
      uid: ev.uid || '',
    });
  }

  flights.sort((a, b) => a.arrivalDate - b.arrivalDate);
  console.log(`  Found ${flights.length} flight arrival(s)`);
  return flights;
}

/**
 * Build timezone segments for each trip.
 *
 * For each trip:
 * - Find flights whose arrival falls within (or near) the trip date range
 * - Each flight arrival starts a new timezone segment
 * - Segments last until the next flight arrival or trip end
 * - Fall back to GEO-based lookup if no flights found
 *
 * Returns flat array of { startDate, endDate, timezone, label }.
 */
export function buildTimezoneSegments(trips, flights) {
  const segments = [];

  for (const trip of trips) {
    // Find flights for this trip (arrival within trip date range, with 1-day buffer)
    const tripStart = trip.startDate;
    const tripEnd = trip.endDate;
    const buffer = 24 * 60 * 60 * 1000; // 1 day

    const tripFlights = flights.filter(f => {
      const t = f.arrivalDate.getTime();
      return t >= tripStart.getTime() - buffer && t <= tripEnd.getTime() + buffer;
    });

    if (tripFlights.length > 0) {
      // Build segments from flight arrivals
      for (let i = 0; i < tripFlights.length; i++) {
        const flight = tripFlights[i];
        const tz = resolveAbbreviation(flight.tzAbbr);
        if (!tz) {
          console.log(`  WARNING: Unknown TZ abbreviation "${flight.tzAbbr}" for ${flight.arrivalCity}`);
          continue;
        }

        const segStart = i === 0
          ? new Date(Math.max(tripStart.getTime(), flight.arrivalDate.getTime()))
          : flight.arrivalDate;

        const segEnd = i < tripFlights.length - 1
          ? tripFlights[i + 1].arrivalDate
          : tripEnd;

        // Use trip start if the first flight is on or before trip start
        const effectiveStart = i === 0 && flight.arrivalDate <= tripStart
          ? tripStart
          : segStart;

        segments.push({
          startDate: formatDate(effectiveStart),
          endDate: formatDate(segEnd),
          timezone: tz,
          label: `${trip.summary} - ${flight.arrivalCity}`,
        });
      }
    } else {
      // Fallback: use GEO coordinates
      const tz = resolveFromGeo(trip.geo);
      if (tz) {
        segments.push({
          startDate: formatDate(tripStart),
          endDate: formatDate(tripEnd),
          timezone: tz,
          label: `${trip.summary} - ${trip.location}`,
        });
      } else {
        console.log(`  WARNING: No flights and no GEO for trip "${trip.summary}" (${trip.location})`);
      }
    }
  }

  return segments;
}

/**
 * Map a TZ abbreviation to an IANA timezone string.
 */
function resolveAbbreviation(abbr) {
  return TZ_ABBR_TO_IANA[abbr] || null;
}

/**
 * Resolve timezone from GEO coordinates using geo-tz.
 */
function resolveFromGeo(geo) {
  if (!geo || geo.lat == null || geo.lon == null) return null;
  const results = findTz(parseFloat(geo.lat), parseFloat(geo.lon));
  return results && results.length > 0 ? results[0] : null;
}

/**
 * Normalize a date value from node-ical into a JS Date.
 */
function normalizeDate(val) {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  return new Date(val);
}

/**
 * Format a Date as YYYY-MM-DD string for the Reclaim API.
 */
function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

/**
 * Filter segments to future only, lasting > 1 day.
 */
export function filterFutureSegments(segments) {
  const today = new Date().toISOString().slice(0, 10);

  return segments.filter(s => {
    if (s.endDate < today) return false;
    const start = new Date(s.startDate);
    const end = new Date(s.endDate);
    const days = (end - start) / (24 * 60 * 60 * 1000);
    return days >= 1;
  });
}

/**
 * Deduplicate consecutive segments with the same timezone.
 * Merges date ranges when adjacent segments share a timezone.
 */
export function deduplicateSegments(segments) {
  if (segments.length === 0) return [];

  const sorted = [...segments].sort((a, b) => a.startDate.localeCompare(b.startDate));
  const result = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const curr = sorted[i];

    if (prev.timezone === curr.timezone) {
      prev.endDate = curr.endDate > prev.endDate ? curr.endDate : prev.endDate;
      prev.label += ` + ${curr.label}`;
    } else {
      result.push({ ...curr });
    }
  }

  return result;
}
