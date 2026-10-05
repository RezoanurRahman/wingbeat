import { describe, expect, it } from 'vitest';
import { createApp } from './server/app.js';
import { createStore } from './server/store.js';
import type { Activity, Dashboard, Outing, Sighting } from './server/types.js';

const FIXED_NOW = new Date('2026-10-05T12:00:00.000Z');

type App = ReturnType<typeof createApp>;

function makeApp(): App {
  return createApp(createStore({ now: () => FIXED_NOW }));
}

function request(app: App, path: string, init?: RequestInit): Promise<Response> {
  return app.handle(new Request(`http://localhost${path}`, init));
}

function jsonRequest(method: 'POST' | 'PATCH', body: unknown): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('GET /api/health', () => {
  it('reports the service as healthy', async () => {
    const response = await request(makeApp(), '/api/health');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await readJson<{ status: string; service: string }>(response)).toEqual({
      status: 'ok',
      service: 'wingbeat',
    });
  });
});

describe('GET /api/dashboard', () => {
  it('summarizes the seeded outings', async () => {
    const response = await request(makeApp(), '/api/dashboard');

    expect(response.status).toBe(200);
    const dashboard = await readJson<Dashboard>(response);
    expect(dashboard.stats).toEqual({
      totalSightings: 6,
      speciesCount: 5,
      completedOutings: 2,
      upcomingOutings: 3,
    });
  });

  it('aggregates species with totals and last seen dates', async () => {
    const dashboard = await readJson<Dashboard>(await request(makeApp(), '/api/dashboard'));

    expect(dashboard.species[0]).toEqual({
      name: 'Cedar Waxwing',
      count: 12,
      lastSeen: '2026-10-04',
    });
    expect(dashboard.species.map((species) => species.name)).toEqual(
      expect.arrayContaining([
        'Great Blue Heron',
        'Northern Cardinal',
        'Belted Kingfisher',
        'Song Sparrow',
      ]),
    );
    const songSparrow = dashboard.species.find((species) => species.name === 'Song Sparrow');
    expect(songSparrow).toEqual({ name: 'Song Sparrow', count: 7, lastSeen: '2026-10-05' });
  });

  it('returns recent activity newest first', async () => {
    const dashboard = await readJson<Dashboard>(await request(makeApp(), '/api/dashboard'));
    const timestamps = dashboard.recentActivity.map((entry) => entry.timestamp);

    expect(timestamps.length).toBeGreaterThan(0);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
  });
});

describe('GET /api/outings', () => {
  it('lists every seeded outing with its sightings', async () => {
    const response = await request(makeApp(), '/api/outings');

    expect(response.status).toBe(200);
    const { outings } = await readJson<{ outings: Outing[] }>(response);
    expect(outings).toHaveLength(5);
    expect(outings[0]?.sightings.length).toBe(0);
    expect(outings.map((outing) => outing.id)).toEqual([
      'outing-5',
      'outing-3',
      'outing-4',
      'outing-2',
      'outing-1',
    ]);
  });

  it('filters by status', async () => {
    const app = makeApp();

    const completed = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?status=completed'),
    );
    expect(completed.outings).toHaveLength(2);
    expect(completed.outings.every((outing) => outing.status === 'completed')).toBe(true);

    const planned = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?status=planned'),
    );
    expect(planned.outings).toHaveLength(2);

    const inProgress = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?status=in-progress'),
    );
    expect(inProgress.outings.map((outing) => outing.id)).toEqual(['outing-4']);
  });

  it('searches title, location, habitat, and species case-insensitively', async () => {
    const app = makeApp();

    const byLocation = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?q=CEDAR'),
    );
    expect(byLocation.outings.map((outing) => outing.id)).toEqual(['outing-2']);

    const bySpecies = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?q=kingfisher'),
    );
    expect(bySpecies.outings.map((outing) => outing.id)).toEqual(['outing-3', 'outing-1']);

    const byHabitat = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?q=wetland'),
    );
    expect(byHabitat.outings.map((outing) => outing.id)).toEqual(['outing-4']);

    const combined = await readJson<{ outings: Outing[] }>(
      await request(app, '/api/outings?status=completed&q=sparrow'),
    );
    expect(combined.outings.map((outing) => outing.id)).toEqual(['outing-1']);
  });

  it('rejects an unknown status filter', async () => {
    const response = await request(makeApp(), '/api/outings?status=paused');

    expect(response.status).toBe(400);
    expect((await readJson<{ error: string }>(response)).error).toContain('Status filter');
  });
});

describe('POST /api/outings', () => {
  it('creates a planned outing and records activity', async () => {
    const app = makeApp();
    const response = await request(
      app,
      '/api/outings',
      jsonRequest('POST', {
        title: '  Dusk rail listen  ',
        location: 'Alder Marsh',
        date: '2026-10-08',
        habitat: 'Wetland marsh',
        notes: 'Arrive thirty minutes before sunset.',
      }),
    );

    expect(response.status).toBe(201);
    const outing = await readJson<Outing>(response);
    expect(outing).toMatchObject({
      id: 'outing-6',
      title: 'Dusk rail listen',
      location: 'Alder Marsh',
      date: '2026-10-08',
      habitat: 'Wetland marsh',
      status: 'planned',
      notes: 'Arrive thirty minutes before sunset.',
      sightings: [],
    });
    expect(outing.createdAt).toBe('2026-10-05T12:00:00.000Z');
    expect(outing.updatedAt).toBe(outing.createdAt);

    const fetched = await request(app, `/api/outings/${outing.id}`);
    expect(fetched.status).toBe(200);
    expect(await readJson<Outing>(fetched)).toEqual(outing);

    const { activity } = await readJson<{ activity: Activity[] }>(
      await request(app, '/api/activity'),
    );
    expect(activity[0]).toMatchObject({ kind: 'outing-created', tone: 'amber' });
    expect(activity[0]?.text).toContain('Dusk rail listen');

    const dashboard = await readJson<Dashboard>(await request(app, '/api/dashboard'));
    expect(dashboard.stats.upcomingOutings).toBe(4);
  });

  it('rejects invalid payloads without storing anything', async () => {
    const app = makeApp();
    const invalidBodies: unknown[] = [
      { location: 'Alder Marsh', date: '2026-10-08', habitat: 'Wetland marsh' },
      { title: '   ', location: 'Alder Marsh', date: '2026-10-08', habitat: 'Wetland marsh' },
      { title: 'Dusk rail listen', date: '2026-10-08', habitat: 'Wetland marsh' },
      { title: 'Dusk rail listen', location: 'Alder Marsh', habitat: 'Wetland marsh' },
      { title: 'Dusk rail listen', location: 'Alder Marsh', date: '2026-10-08', habitat: ' ' },
      {
        title: 'Dusk rail listen',
        location: 'Alder Marsh',
        date: '10/08/2026',
        habitat: 'Wetland marsh',
      },
      {
        title: 'Dusk rail listen',
        location: 'Alder Marsh',
        date: '2026-02-30',
        habitat: 'Wetland marsh',
      },
      {
        title: 'Dusk rail listen',
        location: 'Alder Marsh',
        date: '2026-10-08',
        habitat: 'Wetland marsh',
        notes: 7,
      },
    ];

    for (const body of invalidBodies) {
      const response = await request(app, '/api/outings', jsonRequest('POST', body));
      expect(response.status).toBe(400);
      expect((await readJson<{ error: string }>(response)).error.length).toBeGreaterThan(0);
    }

    const { outings } = await readJson<{ outings: Outing[] }>(await request(app, '/api/outings'));
    expect(outings).toHaveLength(5);
  });
});

describe('PATCH /api/outings/:id', () => {
  it('updates the status, adds activity, and keeps updatedAt fresh', async () => {
    const app = makeApp();
    const response = await request(
      app,
      '/api/outings/outing-3',
      jsonRequest('PATCH', { status: 'in-progress' }),
    );

    expect(response.status).toBe(200);
    const outing = await readJson<Outing>(response);
    expect(outing.status).toBe('in-progress');
    expect(outing.updatedAt).toBe('2026-10-05T12:00:00.000Z');

    const { activity } = await readJson<{ activity: Activity[] }>(
      await request(app, '/api/activity'),
    );
    expect(activity[0]).toMatchObject({ kind: 'outing-updated', tone: 'blue' });
    expect(activity[0]?.text).toContain('in progress');

    const dashboard = await readJson<Dashboard>(await request(app, '/api/dashboard'));
    expect(dashboard.stats.completedOutings).toBe(2);
    expect(dashboard.stats.upcomingOutings).toBe(3);
  });

  it('updates notes without touching the status', async () => {
    const response = await request(
      makeApp(),
      '/api/outings/outing-5',
      jsonRequest('PATCH', { notes: 'North wind shifted east; check the ridge instead.' }),
    );

    expect(response.status).toBe(200);
    const outing = await readJson<Outing>(response);
    expect(outing.notes).toBe('North wind shifted east; check the ridge instead.');
    expect(outing.status).toBe('planned');
  });

  it('rejects invalid statuses and unknown outings', async () => {
    const app = makeApp();

    const invalid = await request(
      app,
      '/api/outings/outing-3',
      jsonRequest('PATCH', { status: 'paused' }),
    );
    expect(invalid.status).toBe(400);
    expect((await readJson<{ error: string }>(invalid)).error).toContain('Status must be one of');

    const empty = await request(app, '/api/outings/outing-3', jsonRequest('PATCH', {}));
    expect(empty.status).toBe(400);

    const missing = await request(
      app,
      '/api/outings/outing-99',
      jsonRequest('PATCH', { status: 'completed' }),
    );
    expect(missing.status).toBe(404);
    expect((await readJson<{ error: string }>(missing)).error).toContain('outing-99');
  });
});

describe('POST /api/outings/:id/sightings', () => {
  it('creates a sighting, records activity, and updates the dashboard', async () => {
    const app = makeApp();
    const response = await request(
      app,
      '/api/outings/outing-3/sightings',
      jsonRequest('POST', {
        species: '  Sandhill Crane ',
        count: 2,
        confidence: 'probable',
        note: 'Circling low over the spillway.',
      }),
    );

    expect(response.status).toBe(201);
    const sighting = await readJson<Sighting>(response);
    expect(sighting).toMatchObject({
      id: 'sighting-7',
      outingId: 'outing-3',
      species: 'Sandhill Crane',
      count: 2,
      confidence: 'probable',
      note: 'Circling low over the spillway.',
    });
    expect(sighting.createdAt).toBe('2026-10-05T12:00:00.000Z');

    const outing = await readJson<Outing>(await request(app, '/api/outings/outing-3'));
    expect(outing.sightings.map((entry) => entry.id)).toEqual(['sighting-7']);

    const { activity } = await readJson<{ activity: Activity[] }>(
      await request(app, '/api/activity'),
    );
    expect(activity[0]).toMatchObject({ kind: 'sighting-added', tone: 'green' });

    const dashboard = await readJson<Dashboard>(await request(app, '/api/dashboard'));
    expect(dashboard.stats.totalSightings).toBe(7);
    expect(dashboard.stats.speciesCount).toBe(6);
  });

  it('validates species, count, confidence, and the outing id', async () => {
    const app = makeApp();
    const invalidBodies: unknown[] = [
      { species: '   ', count: 1, confidence: 'certain' },
      { count: 1, confidence: 'certain' },
      { species: 'Sandhill Crane', count: 0, confidence: 'certain' },
      { species: 'Sandhill Crane', count: 1.5, confidence: 'certain' },
      { species: 'Sandhill Crane', count: '2', confidence: 'certain' },
      { species: 'Sandhill Crane', count: 2, confidence: 'unsure' },
      { species: 'Sandhill Crane', count: 2, confidence: 'probable', note: 3 },
    ];

    for (const body of invalidBodies) {
      const response = await request(
        app,
        '/api/outings/outing-3/sightings',
        jsonRequest('POST', body),
      );
      expect(response.status).toBe(400);
      expect((await readJson<{ error: string }>(response)).error.length).toBeGreaterThan(0);
    }

    const missing = await request(
      app,
      '/api/outings/outing-99/sightings',
      jsonRequest('POST', { species: 'Sandhill Crane', count: 2, confidence: 'probable' }),
    );
    expect(missing.status).toBe(404);

    const dashboard = await readJson<Dashboard>(await request(app, '/api/dashboard'));
    expect(dashboard.stats.totalSightings).toBe(6);
  });
});

describe('DELETE /api/sightings/:id', () => {
  it('removes a sighting from its outing', async () => {
    const app = makeApp();
    const response = await request(app, '/api/sightings/sighting-1', { method: 'DELETE' });

    expect(response.status).toBe(200);
    expect(await readJson<{ ok: boolean }>(response)).toEqual({ ok: true });

    const outing = await readJson<Outing>(await request(app, '/api/outings/outing-1'));
    expect(outing.sightings.map((entry) => entry.id)).toEqual(['sighting-2']);
  });

  it('returns a JSON 404 for unknown sightings', async () => {
    const response = await request(makeApp(), '/api/sightings/sighting-99', { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect((await readJson<{ error: string }>(response)).error).toContain('sighting-99');
  });
});

describe('error handling', () => {
  it('returns JSON 404 for unknown API routes and resources', async () => {
    const app = makeApp();
    const responses = [
      await request(app, '/api/outings/outing-99'),
      await request(app, '/api/does-not-exist'),
    ];

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect((await readJson<{ error: string }>(response)).error.length).toBeGreaterThan(0);
    }
  });

  it('returns JSON 400 for malformed bodies', async () => {
    const response = await request(makeApp(), '/api/outings', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title": ',
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect((await readJson<{ error: string }>(response)).error.length).toBeGreaterThan(0);
  });
});

describe('GET /api/activity', () => {
  it('lists seeded activity newest first', async () => {
    const { activity } = await readJson<{ activity: Activity[] }>(
      await request(makeApp(), '/api/activity'),
    );

    expect(activity.length).toBeGreaterThanOrEqual(9);
    const timestamps = activity.map((entry) => entry.timestamp);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);
    expect(activity[0]).toMatchObject({ kind: 'sighting-added', tone: 'green' });
  });
});
