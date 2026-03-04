import cityTimezones from 'city-timezones';

// Normalize common city name variants that city-timezones doesn't handle
const CITY_ALIASES = {
  'Washington, DC': 'Washington, D.C.',
  'Washington DC': 'Washington, D.C.',
  'Krakow': 'Kraków',
  'Cracow': 'Kraków',
  'Prague': 'Praha',
  'Nuremberg': 'Nürnberg',
  'Zurich': 'Zürich',
  'Cologne': 'Köln',
};

/**
 * Map a destination string to an IANA timezone.
 * Tries aliases first, then 3-tier lookup: full → city before comma → individual words.
 * When multiple cities match, pick the one with largest population.
 */
export function resolveTimezone(destination) {
  if (!destination) return null;

  const cleaned = destination.trim();

  // Tier 0: check aliases for the full string and city-before-comma
  for (const variant of [cleaned, cleaned.split(',')[0].trim()]) {
    const alias = CITY_ALIASES[variant];
    if (alias) {
      const tz = lookupCity(alias);
      if (tz) return tz;
    }
  }

  // Tier 1: try the full destination string
  let tz = lookupCity(cleaned);
  if (tz) return tz;

  // Tier 2: try city before comma (e.g. "San Francisco, CA" → "San Francisco")
  if (cleaned.includes(',')) {
    tz = lookupCity(cleaned.split(',')[0].trim());
    if (tz) return tz;
  }

  // Tier 3: try individual words (2+ chars), longest first
  const words = cleaned.split(/[\s,]+/).filter(w => w.length > 2);
  const sorted = [...words].sort((a, b) => b.length - a.length);
  for (const word of sorted) {
    const aliased = CITY_ALIASES[word];
    tz = lookupCity(aliased || word);
    if (tz) return tz;
  }

  return null;
}

function lookupCity(name) {
  const results = cityTimezones.lookupViaCity(name);
  if (!results || results.length === 0) return null;

  // Pick the result with the largest population
  const best = results.reduce((a, b) => (b.pop > a.pop ? b : a), results[0]);
  return {
    timezone: best.timezone,
    city: best.city,
    country: best.country,
    pop: best.pop,
  };
}
