import { google } from 'googleapis';

const OOO_PREFIX = '[TripIt OOO] ';

/**
 * Create a Google Calendar API client using OAuth2 refresh token.
 * Returns null if credentials are missing.
 */
export function createGCalClient(credentials) {
  const { clientId, clientSecret, refreshToken } = credentials;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });

  return google.calendar({ version: 'v3', auth });
}

/**
 * List existing [TripIt OOO] events in Google Calendar.
 * Returns array of { id, summary, startDate, endDate }.
 */
export async function listOooEvents(gcal, calendarId) {
  const events = [];
  let pageToken;

  do {
    const res = await gcal.events.list({
      calendarId,
      eventTypes: ['outOfOffice'],
      singleEvents: true,
      timeMin: new Date().toISOString(),
      maxResults: 250,
      pageToken,
    });

    for (const ev of res.data.items || []) {
      if (!ev.summary?.startsWith(OOO_PREFIX)) continue;

      const startRaw = ev.start?.date || ev.start?.dateTime;
      const endRaw = ev.end?.date || ev.end?.dateTime;
      if (!startRaw || !endRaw) continue;

      // OOO events use dateTime, which Google returns in local timezone.
      // Parse to Date and format as UTC YYYY-MM-DD for consistent comparison.
      events.push({
        id: ev.id,
        summary: ev.summary,
        startDate: new Date(startRaw).toISOString().slice(0, 10),
        endDate: new Date(endRaw).toISOString().slice(0, 10),
      });
    }

    pageToken = res.data.nextPageToken;
  } while (pageToken);

  return events;
}

/**
 * Create an OOO event in Google Calendar.
 * Google Calendar API requires OOO events to use dateTime (not date),
 * so we span midnight-to-midnight UTC.
 * @param {Object} opts - { summary, startDate, endDate } where dates are YYYY-MM-DD
 * @returns {string} The created event's ID
 */
export async function createOooEvent(gcal, calendarId, { summary, startDate, endDate }) {
  const res = await gcal.events.insert({
    calendarId,
    requestBody: {
      summary: `${OOO_PREFIX}${summary}`,
      start: { dateTime: `${startDate}T00:00:00Z` },
      end: { dateTime: `${endDate}T00:00:00Z` },
      eventType: 'outOfOffice',
      outOfOfficeProperties: {
        autoDeclineMode: 'declineNone',
      },
      transparency: 'opaque',
      visibility: 'public',
    },
  });

  return res.data.id;
}

/**
 * Delete an OOO event from Google Calendar.
 */
export async function deleteOooEvent(gcal, calendarId, eventId) {
  await gcal.events.delete({ calendarId, eventId });
}

export { OOO_PREFIX };
