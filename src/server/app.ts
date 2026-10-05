import { Elysia, type AnyElysia } from 'elysia';
import type { Confidence, OutingStatus } from './types.js';
import { CONFIDENCE_LEVELS, OUTING_STATUSES } from './types.js';
import type { Store } from './store.js';
import { createStore } from './store.js';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE_PATTERN.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isOutingStatus(value: unknown): value is OutingStatus {
  return typeof value === 'string' && (OUTING_STATUSES as readonly string[]).includes(value);
}

function isConfidence(value: unknown): value is Confidence {
  return typeof value === 'string' && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

function pathnameOf(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return request.url;
  }
}

export function apiNotFoundError(request: Request): { error: string } {
  return { error: `No API route matches ${pathnameOf(request)}` };
}

export function createApp(store: Store = createStore()): AnyElysia {
  return new Elysia()
    .onError(({ code, error, request, set }) => {
      if (code === 'NOT_FOUND') {
        const pathname = pathnameOf(request);
        if (!pathname.startsWith('/api')) {
          return;
        }
        set.status = 404;
        return { error: `No API route matches ${pathname}` };
      }

      if (code === 'PARSE') {
        set.status = 400;
        return { error: 'Request body is not valid JSON' };
      }

      if (code === 'VALIDATION') {
        set.status = 400;
        return { error: error.message === '' ? 'Request failed validation' : error.message };
      }

      set.status = 500;
      return { error: 'Internal server error' };
    })
    .get('/api/health', () => ({ status: 'ok' as const, service: 'wingbeat' as const }))
    .get('/api/dashboard', () => store.getDashboard())
    .get('/api/outings', ({ query, set }) => {
      const rawStatus = query['status'];
      const status = typeof rawStatus === 'string' && rawStatus !== '' ? rawStatus : 'all';
      if (status !== 'all' && !isOutingStatus(status)) {
        set.status = 400;
        return { error: `Status filter must be one of all, ${OUTING_STATUSES.join(', ')}` };
      }
      const q = typeof query['q'] === 'string' ? query['q'] : '';
      return { outings: store.listOutings({ status, q }) };
    })
    .get('/api/outings/:id', ({ params, set }) => {
      const outing = store.getOuting(params.id);
      if (outing === undefined) {
        set.status = 404;
        return { error: `Outing ${params.id} not found` };
      }
      return outing;
    })
    .post('/api/outings', ({ body, set }) => {
      const payload = asObject(body);
      if (payload === null) {
        set.status = 400;
        return { error: 'Request body must be a JSON object' };
      }

      const title = payload['title'];
      const location = payload['location'];
      const date = payload['date'];
      const habitat = payload['habitat'];
      const notes = payload['notes'];

      if (!isNonBlankString(title)) {
        set.status = 400;
        return { error: 'Title is required' };
      }
      if (!isNonBlankString(location)) {
        set.status = 400;
        return { error: 'Location is required' };
      }
      if (!isValidDate(date)) {
        set.status = 400;
        return { error: 'Date must be a valid YYYY-MM-DD date' };
      }
      if (!isNonBlankString(habitat)) {
        set.status = 400;
        return { error: 'Habitat is required' };
      }
      if (notes !== undefined && typeof notes !== 'string') {
        set.status = 400;
        return { error: 'Notes must be a string' };
      }

      const outing = store.createOuting({
        title,
        location,
        date,
        habitat,
        ...(notes === undefined ? {} : { notes }),
      });
      set.status = 201;
      return outing;
    })
    .patch('/api/outings/:id', ({ params, body, set }) => {
      const outing = store.getOuting(params.id);
      if (outing === undefined) {
        set.status = 404;
        return { error: `Outing ${params.id} not found` };
      }

      const payload = asObject(body);
      if (payload === null) {
        set.status = 400;
        return { error: 'Request body must be a JSON object' };
      }

      const status = payload['status'];
      const notes = payload['notes'];
      const hasStatus = status !== undefined;
      const hasNotes = notes !== undefined;

      if (!hasStatus && !hasNotes) {
        set.status = 400;
        return { error: 'Provide a status or notes to update' };
      }
      if (hasStatus && !isOutingStatus(status)) {
        set.status = 400;
        return { error: `Status must be one of ${OUTING_STATUSES.join(', ')}` };
      }
      if (hasNotes && typeof notes !== 'string') {
        set.status = 400;
        return { error: 'Notes must be a string' };
      }

      const updated = store.updateOuting(params.id, {
        ...(isOutingStatus(status) ? { status } : {}),
        ...(typeof notes === 'string' ? { notes } : {}),
      });
      return updated ?? outing;
    })
    .post('/api/outings/:id/sightings', ({ params, body, set }) => {
      if (store.getOuting(params.id) === undefined) {
        set.status = 404;
        return { error: `Outing ${params.id} not found` };
      }

      const payload = asObject(body);
      if (payload === null) {
        set.status = 400;
        return { error: 'Request body must be a JSON object' };
      }

      const species = payload['species'];
      const count = payload['count'];
      const confidence = payload['confidence'];
      const note = payload['note'];

      if (!isNonBlankString(species)) {
        set.status = 400;
        return { error: 'Species is required' };
      }
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
        set.status = 400;
        return { error: 'Count must be an integer of at least 1' };
      }
      if (!isConfidence(confidence)) {
        set.status = 400;
        return { error: `Confidence must be one of ${CONFIDENCE_LEVELS.join(', ')}` };
      }
      if (note !== undefined && typeof note !== 'string') {
        set.status = 400;
        return { error: 'Note must be a string' };
      }

      const sighting = store.addSighting(params.id, {
        species,
        count,
        confidence,
        ...(note === undefined ? {} : { note }),
      });
      if (sighting === undefined) {
        set.status = 404;
        return { error: `Outing ${params.id} not found` };
      }
      set.status = 201;
      return sighting;
    })
    .delete('/api/sightings/:id', ({ params, set }) => {
      if (!store.deleteSighting(params.id)) {
        set.status = 404;
        return { error: `Sighting ${params.id} not found` };
      }
      return { ok: true as const };
    })
    .get('/api/activity', () => ({ activity: store.listActivity() }))
    .all('/api/*', ({ request, set }) => {
      set.status = 404;
      return apiNotFoundError(request);
    });
}
