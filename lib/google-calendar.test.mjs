import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGCalClient, listOooEvents, createOooEvent, OOO_PREFIX } from './google-calendar.mjs';

// ── Mock helpers ──

function mockGcal(items = []) {
  const calls = { list: [], insert: [], delete: [] };
  return {
    calls,
    events: {
      list: async (params) => {
        calls.list.push(params);
        return { data: { items } };
      },
      insert: async (params) => {
        calls.insert.push(params);
        return { data: { id: 'new-event-id' } };
      },
      delete: async (params) => {
        calls.delete.push(params);
      },
    },
  };
}

// ── createGCalClient ──

describe('createGCalClient', () => {
  it('returns null when any credential is missing', () => {
    assert.equal(createGCalClient({ clientId: 'c', clientSecret: 's' }), null);
    assert.equal(createGCalClient({ clientId: 'c', refreshToken: 'r' }), null);
    assert.equal(createGCalClient({ clientSecret: 's', refreshToken: 'r' }), null);
    assert.equal(createGCalClient({ clientId: '', clientSecret: '', refreshToken: '' }), null);
  });

  it('returns a calendar client when all credentials present', () => {
    const result = createGCalClient({ clientId: 'c', clientSecret: 's', refreshToken: 'r' });
    assert.ok(result);
    assert.equal(typeof result.events, 'object');
  });
});

// ── createOooEvent ──
// These tests would have caught: "OOO event must not be all-day" and "must not have description"

describe('createOooEvent', () => {
  it('uses dateTime not date (GCal API rejects all-day OOO events)', async () => {
    const gcal = mockGcal();
    await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Trip',
      startDate: '2026-03-07',
      endDate: '2026-03-17',
    });

    const body = gcal.calls.insert[0].requestBody;
    assert.ok(body.start.dateTime, 'start must use dateTime');
    assert.ok(body.end.dateTime, 'end must use dateTime');
    assert.equal(body.start.date, undefined, 'start must NOT use date');
    assert.equal(body.end.date, undefined, 'end must NOT use date');
  });

  it('does not include description (GCal API rejects description on OOO events)', async () => {
    const gcal = mockGcal();
    await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Trip',
      startDate: '2026-03-07',
      endDate: '2026-03-17',
    });

    const body = gcal.calls.insert[0].requestBody;
    assert.equal(body.description, undefined, 'description must not be set on OOO events');
  });

  it('sets eventType to outOfOffice with declineNone', async () => {
    const gcal = mockGcal();
    await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Trip',
      startDate: '2026-03-07',
      endDate: '2026-03-17',
    });

    const body = gcal.calls.insert[0].requestBody;
    assert.equal(body.eventType, 'outOfOffice');
    assert.equal(body.outOfOfficeProperties.autoDeclineMode, 'declineNone');
  });

  it('prefixes summary with OOO_PREFIX', async () => {
    const gcal = mockGcal();
    await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Spring Break',
      startDate: '2026-03-07',
      endDate: '2026-03-17',
    });

    const body = gcal.calls.insert[0].requestBody;
    assert.equal(body.summary, '[TripIt OOO] Spring Break');
  });

  it('formats dates as midnight UTC dateTime', async () => {
    const gcal = mockGcal();
    await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Trip',
      startDate: '2026-05-04',
      endDate: '2026-05-09',
    });

    const body = gcal.calls.insert[0].requestBody;
    assert.equal(body.start.dateTime, '2026-05-04T00:00:00Z');
    assert.equal(body.end.dateTime, '2026-05-09T00:00:00Z');
  });

  it('returns the created event ID', async () => {
    const gcal = mockGcal();
    const id = await createOooEvent(gcal, 'cal@test.com', {
      summary: 'Trip',
      startDate: '2026-03-07',
      endDate: '2026-03-17',
    });
    assert.equal(id, 'new-event-id');
  });
});

// ── listOooEvents ──
// These tests would have caught: q search missing OOO events, and timezone date parsing

describe('listOooEvents', () => {
  it('uses eventTypes filter, not q search (q misses OOO events)', async () => {
    const gcal = mockGcal([]);
    await listOooEvents(gcal, 'cal@test.com');

    const params = gcal.calls.list[0];
    assert.deepEqual(params.eventTypes, ['outOfOffice'], 'must filter by eventTypes');
    assert.equal(params.q, undefined, 'must NOT use q search — it misses OOO events');
  });

  it('normalizes local-timezone dateTime to correct UTC date', async () => {
    // Google returns UTC midnight as local time: 2026-03-06T18:00:00-06:00 (CST)
    // Naive .slice(0,10) gives 2026-03-06 (wrong). Must parse to get 2026-03-07.
    const gcal = mockGcal([{
      id: 'ev1',
      summary: '[TripIt OOO] Spring Break',
      start: { dateTime: '2026-03-06T18:00:00-06:00' },
      end: { dateTime: '2026-03-16T18:00:00-06:00' },
    }]);

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events.length, 1);
    assert.equal(events[0].startDate, '2026-03-07', 'must parse dateTime, not just slice');
    assert.equal(events[0].endDate, '2026-03-17');
  });

  it('handles positive UTC offsets the same way', async () => {
    // IST (UTC+5:30): 2026-03-07T05:30:00+05:30 → UTC 2026-03-07T00:00:00Z → 2026-03-07
    const gcal = mockGcal([{
      id: 'ev1',
      summary: '[TripIt OOO] India Trip',
      start: { dateTime: '2026-03-07T05:30:00+05:30' },
      end: { dateTime: '2026-03-10T05:30:00+05:30' },
    }]);

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events[0].startDate, '2026-03-07');
    assert.equal(events[0].endDate, '2026-03-10');
  });

  it('handles UTC dateTime directly', async () => {
    const gcal = mockGcal([{
      id: 'ev1',
      summary: '[TripIt OOO] Trip',
      start: { dateTime: '2026-05-04T00:00:00Z' },
      end: { dateTime: '2026-05-09T00:00:00Z' },
    }]);

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events[0].startDate, '2026-05-04');
    assert.equal(events[0].endDate, '2026-05-09');
  });

  it('filters out non-TripIt OOO events', async () => {
    const gcal = mockGcal([
      { id: 'ev1', summary: 'Out of office', start: { dateTime: '2026-03-16T00:00:00Z' }, end: { dateTime: '2026-03-20T00:00:00Z' } },
      { id: 'ev2', summary: '[TripIt OOO] Real Trip', start: { dateTime: '2026-04-01T00:00:00Z' }, end: { dateTime: '2026-04-05T00:00:00Z' } },
    ]);

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events.length, 1);
    assert.equal(events[0].summary, '[TripIt OOO] Real Trip');
  });

  it('skips events with missing start or end', async () => {
    const gcal = mockGcal([
      { id: 'ev1', summary: '[TripIt OOO] Bad', start: { dateTime: '2026-03-07T00:00:00Z' }, end: {} },
      { id: 'ev2', summary: '[TripIt OOO] Also Bad', start: {}, end: { dateTime: '2026-03-10T00:00:00Z' } },
    ]);

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events.length, 0);
  });

  it('follows pagination', async () => {
    let page = 0;
    const gcal = {
      events: {
        list: async (params) => {
          if (page === 0) {
            page++;
            return {
              data: {
                items: [{ id: 'ev1', summary: '[TripIt OOO] A', start: { dateTime: '2026-03-07T00:00:00Z' }, end: { dateTime: '2026-03-10T00:00:00Z' } }],
                nextPageToken: 'page2',
              },
            };
          }
          return {
            data: {
              items: [{ id: 'ev2', summary: '[TripIt OOO] B', start: { dateTime: '2026-04-01T00:00:00Z' }, end: { dateTime: '2026-04-05T00:00:00Z' } }],
            },
          };
        },
      },
    };

    const events = await listOooEvents(gcal, 'cal@test.com');
    assert.equal(events.length, 2);
  });
});
