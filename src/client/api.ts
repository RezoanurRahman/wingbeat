import type {
  Activity,
  AddSightingInput,
  Confidence,
  CreateOutingInput,
  Dashboard,
  DashboardStats,
  Outing,
  OutingStatus,
  Sighting,
  SpeciesTally,
  UpdateOutingInput,
} from './types';

const STATUS_VALUES: readonly OutingStatus[] = ['planned', 'in-progress', 'completed'];
const CONFIDENCE_VALUES: readonly Confidence[] = ['certain', 'probable', 'possible'];
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** Error thrown for every failed API interaction, including offline failures (status 0). */
export class ApiError extends Error {
  readonly status: number;

  readonly detail: string | null;

  constructor(message: string, status = 0, detail: string | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.trim() !== '') return error.message;
  return 'Something went wrong. Try again in a moment.';
}

interface JsonRecord {
  [key: string]: unknown;
}

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asNumber(value: unknown): number {
  return asOptionalNumber(value) ?? 0;
}

function asStatus(value: unknown): OutingStatus {
  return typeof value === 'string' && (STATUS_VALUES as readonly string[]).includes(value)
    ? (value as OutingStatus)
    : 'planned';
}

function asConfidence(value: unknown): Confidence {
  return typeof value === 'string' && (CONFIDENCE_VALUES as readonly string[]).includes(value)
    ? (value as Confidence)
    : 'probable';
}

function parseList<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  const parsed: T[] = [];
  for (const item of value) {
    const result = parse(item);
    if (result !== null) parsed.push(result);
  }
  return parsed;
}

function parseSighting(value: unknown): Sighting | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (id === '') return null;
  return {
    id,
    outingId: asString(record.outingId),
    species: asString(record.species, 'Unidentified bird'),
    count: Math.max(0, Math.round(asNumber(record.count))),
    confidence: asConfidence(record.confidence),
    note: asOptionalString(record.note),
    createdAt: asString(record.createdAt),
  };
}

function parseOuting(value: unknown): Outing | null {
  const record = asRecord(value);
  const id = asString(record.id);
  if (id === '') return null;
  return {
    id,
    title: asString(record.title, 'Untitled outing'),
    location: asString(record.location, 'Location not recorded'),
    date: asString(record.date),
    habitat: asString(record.habitat, 'Habitat not recorded'),
    status: asStatus(record.status),
    notes: asOptionalString(record.notes),
    sightings: parseList(record.sightings, parseSighting),
    createdAt: asString(record.createdAt),
    updatedAt: asString(record.updatedAt, asString(record.createdAt)),
  };
}

function parseSpecies(value: unknown): SpeciesTally | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return { name: value, count: 0 };
  }
  const record = asRecord(value);
  const name = asString(record.name);
  if (name === '') return null;
  const tally: SpeciesTally = { name, count: Math.max(0, Math.round(asNumber(record.count))) };
  const lastSeen = asOptionalString(record.lastSeen) ?? asOptionalString(record.lastSeenAt);
  if (lastSeen !== null) tally.lastSeen = lastSeen;
  return tally;
}

function parseActivity(value: unknown): Activity | null {
  const record = asRecord(value);
  const text = asString(record.text);
  if (text === '') return null;
  const activity: Activity = {
    text,
    timestamp: asString(record.timestamp, asString(record.createdAt)),
  };
  const id = asOptionalString(record.id);
  if (id !== null) activity.id = id;
  const tone = asOptionalString(record.tone);
  if (tone !== null) activity.tone = tone;
  return activity;
}

function parseDashboard(value: unknown): Dashboard {
  const record = asRecord(value);
  const species = parseList(record.species, parseSpecies);
  const activitySource = Array.isArray(record.recentActivity)
    ? record.recentActivity
    : record.activity;
  const recentActivity = parseList(activitySource, parseActivity);
  const statsRecord = asRecord(record.stats);
  const speciesCount =
    asOptionalNumber(statsRecord.speciesCount) ??
    asOptionalNumber(statsRecord.totalSpecies) ??
    species.length;
  const stats: DashboardStats = {
    totalSightings: asNumber(statsRecord.totalSightings),
    speciesCount,
    completedOutings: asNumber(statsRecord.completedOutings),
    upcomingOutings: asNumber(statsRecord.upcomingOutings),
  };
  return { stats, species, recentActivity };
}

function parseOutingList(value: unknown): Outing[] {
  if (Array.isArray(value)) return parseList(value, parseOuting);
  return parseList(asRecord(value).outings, parseOuting);
}

function parseActivityList(value: unknown): Activity[] {
  if (Array.isArray(value)) return parseList(value, parseActivity);
  return parseList(asRecord(value).activity, parseActivity);
}

function describeFailure(raw: string, status: number): string {
  const body = asRecord(safeJson(raw));
  const message =
    asOptionalString(body.error) ?? asOptionalString(body.message) ?? asOptionalString(body.detail);
  if (message !== null) return message;
  if (status === 404) return 'The Wingbeat API could not find that record.';
  if (status >= 500) return 'The Wingbeat API hit an error. Try again in a moment.';
  return `The Wingbeat API rejected the request (status ${status}).`;
}

function safeJson(raw: string): unknown {
  if (raw.trim() === '') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Fetch a JSON endpoint and turn every failure into an `ApiError` with a readable message,
 * so the UI never has to deal with a rejected fetch or an unparsable body.
 */
export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('accept')) headers.set('accept', 'application/json');
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError('Cannot reach the Wingbeat API. Check that the local server is running.', 0);
  }

  const raw = await response.text().catch(() => '');
  if (!response.ok) {
    throw new ApiError(describeFailure(raw, response.status), response.status, raw || null);
  }
  if (raw.trim() === '') return undefined as unknown as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new ApiError(
      'The Wingbeat API sent a response that could not be read.',
      response.status,
      raw,
    );
  }
}

export async function getDashboard(signal?: AbortSignal): Promise<Dashboard> {
  const raw = await requestJson<unknown>('/api/dashboard', { signal: signal ?? null });
  return parseDashboard(raw);
}

export async function getOutings(
  status: OutingStatus | 'all' = 'all',
  search = '',
  signal?: AbortSignal,
): Promise<Outing[]> {
  const params = new URLSearchParams({ status });
  const trimmed = search.trim();
  if (trimmed !== '') params.set('q', trimmed);
  const raw = await requestJson<unknown>(`/api/outings?${params.toString()}`, {
    signal: signal ?? null,
  });
  return parseOutingList(raw);
}

export async function getOuting(id: string): Promise<Outing> {
  const raw = await requestJson<unknown>(`/api/outings/${encodeURIComponent(id)}`);
  const outing = parseOuting(raw);
  if (outing === null) throw new ApiError('The outing could not be read from the API.', 500);
  return outing;
}

export async function createOuting(input: CreateOutingInput): Promise<Outing> {
  const raw = await requestJson<unknown>('/api/outings', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  const outing = parseOuting(raw);
  if (outing === null) throw new ApiError('The outing was saved but could not be read back.', 500);
  return outing;
}

export async function updateOuting(id: string, input: UpdateOutingInput): Promise<Outing> {
  const raw = await requestJson<unknown>(`/api/outings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  const outing = parseOuting(raw);
  if (outing === null)
    throw new ApiError('The outing was updated but could not be read back.', 500);
  return outing;
}

export async function addSighting(outingId: string, input: AddSightingInput): Promise<Sighting> {
  const raw = await requestJson<unknown>(`/api/outings/${encodeURIComponent(outingId)}/sightings`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  const sighting = parseSighting(raw);
  if (sighting === null)
    throw new ApiError('The sighting was saved but could not be read back.', 500);
  return sighting;
}

export async function deleteSighting(id: string): Promise<void> {
  await requestJson<unknown>(`/api/sightings/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getActivity(signal?: AbortSignal): Promise<Activity[]> {
  const raw = await requestJson<unknown>('/api/activity', { signal: signal ?? null });
  return parseActivityList(raw);
}
