import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import type {
  Activity,
  AddSightingInput,
  Confidence,
  CreateOutingInput,
  Dashboard,
  Outing,
  OutingStatus,
  Sighting,
  SpeciesTally,
} from './types';
import {
  ApiError,
  addSighting,
  createOuting,
  deleteSighting,
  errorMessage,
  getActivity,
  getDashboard,
  getOuting,
  getOutings,
  isAbortError,
  updateOuting,
} from './api';
import './styles.css';

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

type StatusFilter = OutingStatus | 'all';

const FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'planned', label: 'Planned' },
  { value: 'in-progress', label: 'In flight' },
  { value: 'completed', label: 'Completed' },
];

const STATUS_VALUES: readonly OutingStatus[] = ['planned', 'in-progress', 'completed'];
const CONFIDENCE_VALUES: readonly Confidence[] = ['certain', 'probable', 'possible'];

const STATUS_LABEL: Record<OutingStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In flight',
  completed: 'Completed',
};

const STATUS_HINT: Record<OutingStatus, string> = {
  planned: 'A watch still to come.',
  'in-progress': 'Out in the field right now.',
  completed: 'Wrapped up and counted.',
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  certain: 'Certain',
  probable: 'Probable',
  possible: 'Possible',
};

const HABITAT_SUGGESTIONS: readonly string[] = [
  'Woodland',
  'Wetland',
  'Grassland',
  'Coastal',
  'Heathland',
  'Farmland',
  'Urban park',
  'Garden',
];

const SPECIES_SUGGESTIONS: readonly string[] = [
  'Barn Swallow',
  'Common Buzzard',
  'Common Chaffinch',
  'Common Kingfisher',
  'Eurasian Blackbird',
  'Eurasian Wren',
  'European Robin',
  'Goldfinch',
  'Great Tit',
  'Grey Heron',
  'House Sparrow',
  'Mallard',
  'Song Thrush',
  'Blue Tit',
];

const OUTING_FIELDS = ['title', 'location', 'date', 'habitat'] as const;
type OutingField = (typeof OUTING_FIELDS)[number];

interface Notice {
  tone: 'success' | 'error';
  text: string;
}

/* ------------------------------------------------------------------ */
/* Date helpers (never throw on missing or odd data)                   */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDateish(value: unknown): Date | null {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  if (typeof value !== 'string' || value.trim() === '') return null;
  const text = value.trim();
  const parsed = new Date(ISO_DATE.test(text) ? `${text}T12:00:00` : text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function safeFormat(date: Date, options: Intl.DateTimeFormatOptions, fallback: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
    return fallback;
  }
}

function formatDate(value: unknown, options: Intl.DateTimeFormatOptions): string {
  const date = parseDateish(value);
  if (date === null) return 'Date not recorded';
  return safeFormat(date, options, date.toDateString());
}

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

function formatRelative(value: unknown): string {
  const date = parseDateish(value);
  if (date === null) return 'Time not recorded';
  const diffMs = Date.now() - date.getTime();
  if (diffMs < -60_000) return formatDate(value, SHORT_DATE);
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(value, SHORT_DATE);
}

function dateParts(value: unknown): { day: string; month: string } {
  const date = parseDateish(value);
  if (date === null) return { day: '—', month: 'no date' };
  return {
    day: String(date.getDate()),
    month: safeFormat(date, { month: 'short' }, ''),
  };
}

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isoFromNow(days: number, hours = 0): string {
  return new Date(Date.now() - (days * 24 + hours) * 3_600_000).toISOString();
}

function isoDateFromNow(days: number): string {
  const date = new Date(Date.now() - days * 24 * 3_600_000);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/* ------------------------------------------------------------------ */
/* Preview data: only shown when the local API cannot be reached.      */
/* ------------------------------------------------------------------ */

const DEMO_OUTINGS: Outing[] = [
  {
    id: 'preview-riverside',
    title: 'Riverside meander',
    location: 'Mill Creek bend, Riverside Park',
    date: isoDateFromNow(0),
    habitat: 'Wetland',
    status: 'in-progress',
    notes: 'Damp morning, almost no wind. The kingfisher stayed low along the far bank.',
    sightings: [
      {
        id: 'preview-riverside-1',
        outingId: 'preview-riverside',
        species: 'Common Kingfisher',
        count: 1,
        confidence: 'certain',
        note: 'A flash of blue, low over the water.',
        createdAt: isoFromNow(0, 2),
      },
      {
        id: 'preview-riverside-2',
        outingId: 'preview-riverside',
        species: 'Grey Heron',
        count: 2,
        confidence: 'certain',
        note: null,
        createdAt: isoFromNow(0, 3),
      },
      {
        id: 'preview-riverside-3',
        outingId: 'preview-riverside',
        species: 'Barn Swallow',
        count: 6,
        confidence: 'probable',
        note: 'Hawking insects over the reed bed.',
        createdAt: isoFromNow(0, 4),
      },
    ],
    createdAt: isoFromNow(3),
    updatedAt: isoFromNow(0, 2),
  },
  {
    id: 'preview-beacon',
    title: 'Dawn chorus at Beacon Hill',
    location: 'Beacon Hill north slope',
    date: isoDateFromNow(2),
    habitat: 'Woodland',
    status: 'completed',
    notes: 'Cold start, warming by eight. Chiffchaff singing from the first clearing.',
    sightings: [
      {
        id: 'preview-beacon-1',
        outingId: 'preview-beacon',
        species: 'European Robin',
        count: 3,
        confidence: 'certain',
        note: 'Two singing against each other.',
        createdAt: isoFromNow(2, 1),
      },
      {
        id: 'preview-beacon-2',
        outingId: 'preview-beacon',
        species: 'Great Tit',
        count: 4,
        confidence: 'certain',
        note: null,
        createdAt: isoFromNow(2, 2),
      },
      {
        id: 'preview-beacon-3',
        outingId: 'preview-beacon',
        species: 'Common Chaffinch',
        count: 5,
        confidence: 'probable',
        note: 'Loose flock near the car park.',
        createdAt: isoFromNow(2, 2),
      },
      {
        id: 'preview-beacon-4',
        outingId: 'preview-beacon',
        species: 'Eurasian Wren',
        count: 1,
        confidence: 'possible',
        note: 'Brief scolding from the brambles.',
        createdAt: isoFromNow(2, 3),
      },
    ],
    createdAt: isoFromNow(6),
    updatedAt: isoFromNow(2, 1),
  },
  {
    id: 'preview-kestrel',
    title: 'Kestrel watch on the west ridge',
    location: 'West ridge, Crooksbury Common',
    date: isoDateFromNow(-3),
    habitat: 'Heathland',
    status: 'planned',
    notes: 'Take the scope. Last visit the birds were hunting into the wind at the gully.',
    sightings: [],
    createdAt: isoFromNow(1),
    updatedAt: isoFromNow(1),
  },
  {
    id: 'preview-reedbed',
    title: 'Reedbed transect',
    location: 'Longmoor reedbeds',
    date: isoDateFromNow(9),
    habitat: 'Wetland',
    status: 'completed',
    notes: 'Water levels high; the eastern path is still flooded.',
    sightings: [
      {
        id: 'preview-reedbed-1',
        outingId: 'preview-reedbed',
        species: 'Mallard',
        count: 12,
        confidence: 'certain',
        note: null,
        createdAt: isoFromNow(9, 1),
      },
      {
        id: 'preview-reedbed-2',
        outingId: 'preview-reedbed',
        species: 'Grey Heron',
        count: 1,
        confidence: 'certain',
        note: 'Standing in the shallows for twenty minutes.',
        createdAt: isoFromNow(9, 2),
      },
      {
        id: 'preview-reedbed-3',
        outingId: 'preview-reedbed',
        species: 'Common Buzzard',
        count: 2,
        confidence: 'probable',
        note: 'Circling low over the far treeline.',
        createdAt: isoFromNow(9, 2),
      },
      {
        id: 'preview-reedbed-4',
        outingId: 'preview-reedbed',
        species: 'Song Thrush',
        count: 1,
        confidence: 'possible',
        note: 'Repeated phrases from the hedgerow.',
        createdAt: isoFromNow(9, 3),
      },
      {
        id: 'preview-reedbed-5',
        outingId: 'preview-reedbed',
        species: 'Eurasian Blackbird',
        count: 2,
        confidence: 'certain',
        note: null,
        createdAt: isoFromNow(9, 3),
      },
    ],
    createdAt: isoFromNow(12),
    updatedAt: isoFromNow(9, 1),
  },
  {
    id: 'preview-garden',
    title: 'Garden hour with coffee',
    location: 'Home patch, kitchen window',
    date: isoDateFromNow(16),
    habitat: 'Garden',
    status: 'completed',
    notes: 'Good day for the feeder: two new visitors within an hour.',
    sightings: [
      {
        id: 'preview-garden-1',
        outingId: 'preview-garden',
        species: 'Goldfinch',
        count: 4,
        confidence: 'certain',
        note: 'On the nyjer seed.',
        createdAt: isoFromNow(16, 1),
      },
      {
        id: 'preview-garden-2',
        outingId: 'preview-garden',
        species: 'House Sparrow',
        count: 7,
        confidence: 'certain',
        note: null,
        createdAt: isoFromNow(16, 1),
      },
    ],
    createdAt: isoFromNow(20),
    updatedAt: isoFromNow(16, 1),
  },
];

const DEMO_DASHBOARD: Dashboard = {
  stats: {
    totalSightings: 38,
    speciesCount: 17,
    completedOutings: 4,
    upcomingOutings: 2,
  },
  species: [
    { name: 'Barn Swallow', count: 9, lastSeen: isoFromNow(0, 4) },
    { name: 'Common Chaffinch', count: 6, lastSeen: isoFromNow(2, 2) },
    { name: 'European Robin', count: 5, lastSeen: isoFromNow(2, 1) },
    { name: 'Great Tit', count: 4, lastSeen: isoFromNow(2, 2) },
    { name: 'Grey Heron', count: 3, lastSeen: isoFromNow(0, 3) },
    { name: 'Common Kingfisher', count: 2, lastSeen: isoFromNow(0, 2) },
    { name: 'Common Buzzard', count: 2, lastSeen: isoFromNow(9, 2) },
    { name: 'Eurasian Wren', count: 1, lastSeen: isoFromNow(2, 3) },
  ],
  recentActivity: [
    {
      text: 'Logged 6 × Barn Swallow at Riverside meander',
      timestamp: isoFromNow(0, 4),
      tone: 'moss',
    },
    {
      text: 'Added 2 × Grey Heron to Riverside meander',
      timestamp: isoFromNow(0, 3),
      tone: 'moss',
    },
    { text: 'Recorded 1 × Common Kingfisher', timestamp: isoFromNow(0, 2), tone: 'moss' },
    {
      text: 'Planned “Kestrel watch on the west ridge”',
      timestamp: isoFromNow(1, 2),
      tone: 'amber',
    },
    {
      text: 'Marked “Dawn chorus at Beacon Hill” completed',
      timestamp: isoFromNow(2, 1),
      tone: 'ink',
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

function WingMark({ className = 'wing-mark' }: { className?: string }) {
  return (
    <svg class={className} viewBox="0 0 32 32" role="img" aria-hidden="true" focusable="false">
      <path
        d="M28.4 3.6c-7.1.5-13.3 3.3-17.3 8.3-2.2 2.8-3.5 6.1-3.7 9.6 3.6-.2 7.1-1.6 9.8-3.9 4.4-3.8 7.3-8.4 11.2-14Z"
        fill="currentColor"
        opacity=".92"
      />
      <path
        d="M23.4 8.1C18.6 12.4 14.3 18 11 24.5c-1 2.1-1.8 4.3-2.4 6.6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
      />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="9" cy="9" r="5.4" />
      <path d="m13.1 13.1 3.7 3.7" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 4.2v11.6M4.2 10h11.6" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M16.4 8.2A6.6 6.6 0 1 0 16 13" />
      <path d="M16.9 4.6v3.9h-3.9" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="3.2" y="4.6" width="13.6" height="12" rx="2.2" />
      <path d="M3.2 8.4h13.6M7.2 3.4v2.4M12.8 3.4v2.4" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 17.2s5.4-4.8 5.4-8.6a5.4 5.4 0 1 0-10.8 0c0 3.8 5.4 8.6 5.4 8.6Z" />
      <circle cx="10" cy="8.6" r="1.9" />
    </svg>
  );
}

function IconLeaf() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M16.6 3.6c-6.2.2-10 3-10 7.2 0 2.4 1.6 4.4 4.2 4.4 4 0 5.6-4.6 5.8-11.6Z" />
      <path d="M4 17c1.4-4.6 4-8 7.6-10.4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.2" />
      <path d="m6.8 10.2 2.2 2.2 4.3-4.6" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 6.2v4.1l2.9 1.8" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m8 5.4 4.6 4.6L8 14.6" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.4 6.4h11.2M8.2 6.4V4.6h3.6v1.8M6.2 6.4l.7 9.2h6.2l.7-9.2" />
      <path d="M8.8 9v4M11.2 9v4" />
    </svg>
  );
}

function IconClose() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m5.6 5.6 8.8 8.8M14.4 5.6l-8.8 8.8" />
    </svg>
  );
}

function IconInfo() {
  return (
    <svg class="icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.2" />
      <path d="M10 9.2v4.4M10 6.6h.01" />
    </svg>
  );
}

function StatusBadge({ status }: { status: OutingStatus }) {
  return (
    <span class={`badge badge-status badge-${status}`}>
      <span class="badge-dot" aria-hidden="true" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  return (
    <span class={`badge badge-confidence badge-${confidence}`}>{CONFIDENCE_LABEL[confidence]}</span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  accent: 'moss' | 'ink' | 'amber' | 'mist';
  icon: ComponentChildren;
}) {
  return (
    <article class={`metric metric-${accent}`}>
      <span class="metric-icon" aria-hidden="true">
        {icon}
      </span>
      <p class="metric-label">{label}</p>
      <p class="metric-value">{value}</p>
      <p class="metric-hint">{hint}</p>
    </article>
  );
}

function MetricSkeleton({ accent }: { accent: 'moss' | 'ink' | 'amber' | 'mist' }) {
  return (
    <article class={`metric metric-${accent}`} aria-hidden="true">
      <span class="skeleton skeleton-icon" />
      <span class="skeleton skeleton-line" />
      <span class="skeleton skeleton-value" />
      <span class="skeleton skeleton-line" />
    </article>
  );
}

function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div class="state state-error" role="alert">
      <span class="state-mark" aria-hidden="true">
        <IconInfo />
      </span>
      <h3>{title}</h3>
      <p class="state-text">{message}</p>
      <button type="button" class="btn btn-secondary btn-sm" onClick={onRetry}>
        <IconRefresh />
        Try again
      </button>
    </div>
  );
}

function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ComponentChildren;
}) {
  return (
    <div class="state state-empty">
      <span class="state-mark" aria-hidden="true">
        <WingMark className="wing-mark state-wing" />
      </span>
      <h3>{title}</h3>
      <p class="state-text">{message}</p>
      {action ?? null}
    </div>
  );
}

function NoticeBar({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const error = notice.tone === 'error';
  return (
    <div
      class={`toast ${error ? 'toast-error' : 'toast-success'}`}
      role={error ? 'alert' : 'status'}
    >
      <span class="toast-mark" aria-hidden="true">
        {error ? <IconInfo /> : <IconCheck />}
      </span>
      <p class="toast-text">{notice.text}</p>
      <button
        type="button"
        class="icon-btn icon-btn-sm"
        aria-label="Dismiss message"
        onClick={onDismiss}
      >
        <IconClose />
      </button>
    </div>
  );
}

function OutingSkeleton() {
  return (
    <ul class="outing-list" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <li key={index} class="outing-row is-skeleton">
          <span class="skeleton skeleton-date" />
          <span class="row-body">
            <span class="skeleton skeleton-line skeleton-line-lg" />
            <span class="skeleton skeleton-line" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function DetailSkeleton() {
  return (
    <div class="detail-skeleton" aria-hidden="true">
      <span class="skeleton skeleton-line skeleton-line-lg" />
      <span class="skeleton skeleton-line" />
      <span class="skeleton skeleton-block" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Feature components                                                  */
/* ------------------------------------------------------------------ */

function OutingRow({
  outing,
  selected,
  onSelect,
}: {
  outing: Outing;
  selected: boolean;
  onSelect: () => void;
}) {
  const parts = dateParts(outing.date);
  const records = outing.sightings.length;
  const birds = outing.sightings.reduce((total, sighting) => total + sighting.count, 0);
  const tally =
    records === 0
      ? 'No sightings yet'
      : `${records} sighting${records === 1 ? '' : 's'} · ${birds} bird${birds === 1 ? '' : 's'}`;

  return (
    <li>
      <button
        type="button"
        class={selected ? 'outing-row is-selected' : 'outing-row'}
        aria-current={selected ? 'true' : undefined}
        onClick={onSelect}
      >
        <span class="row-date" aria-hidden="true">
          <strong>{parts.day}</strong>
          <span>{parts.month}</span>
        </span>
        <span class="row-body">
          <span class="row-title">{outing.title}</span>
          <span class="row-meta">
            <span class="row-meta-item">
              <IconPin />
              {outing.location}
            </span>
            <span class="row-meta-item">
              <IconLeaf />
              {outing.habitat}
            </span>
          </span>
          <span class="row-foot">
            <StatusBadge status={outing.status} />
            <span class="row-count">{tally}</span>
          </span>
        </span>
        <span class="row-chevron" aria-hidden="true">
          <IconChevron />
        </span>
      </button>
    </li>
  );
}

function StatusControl({
  status,
  busy,
  onChange,
}: {
  status: OutingStatus;
  busy: OutingStatus | null;
  onChange: (next: OutingStatus) => void;
}) {
  return (
    <fieldset class="status-control">
      <legend class="field-label">Status</legend>
      <div class="segmented">
        {STATUS_VALUES.map((option) => (
          <button
            key={option}
            type="button"
            class={option === status ? 'segment is-active' : 'segment'}
            aria-pressed={option === status}
            disabled={busy !== null}
            onClick={() => onChange(option)}
          >
            {busy === option ? 'Saving…' : STATUS_LABEL[option]}
          </button>
        ))}
      </div>
      <p class="field-hint">{STATUS_HINT[status]}</p>
    </fieldset>
  );
}

function NotesEditor({
  value,
  dirty,
  saving,
  onChange,
  onSave,
}: {
  value: string;
  dirty: boolean;
  saving: boolean;
  onChange: (next: string) => void;
  onSave: () => void;
}) {
  return (
    <div class="notes-editor">
      <label class="field">
        <span class="field-label">Field notes</span>
        <textarea
          class="input textarea"
          rows={4}
          value={value}
          placeholder="Weather, light, what you noticed, what to check next time…"
          onInput={(event) => onChange(event.currentTarget.value)}
        />
      </label>
      <div class="notes-actions">
        <p class="field-hint">
          {dirty ? 'Unsaved changes.' : 'Notes stay with this outing on this machine.'}
        </p>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}

function SightingItem({
  sighting,
  confirming,
  deleting,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  sighting: Sighting;
  confirming: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <li class="sighting">
      <div class="sighting-main">
        <div class="sighting-head">
          <h4 class="sighting-species">{sighting.species}</h4>
          <span class="count-pill">×{sighting.count}</span>
          <ConfidenceBadge confidence={sighting.confidence} />
        </div>
        {sighting.note !== null && sighting.note !== undefined && sighting.note !== '' ? (
          <p class="sighting-note">{sighting.note}</p>
        ) : null}
        <p class="sighting-meta">Logged {formatRelative(sighting.createdAt)}</p>
      </div>
      {confirming ? (
        <div
          class="sighting-confirm"
          role="group"
          aria-label={`Confirm deleting ${sighting.species}`}
        >
          <span class="sighting-confirm-text">Delete?</span>
          <button
            type="button"
            class="btn btn-danger btn-sm"
            disabled={deleting}
            onClick={onConfirmDelete}
          >
            {deleting ? 'Removing…' : 'Delete'}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            disabled={deleting}
            onClick={onCancelDelete}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          class="icon-btn"
          aria-label={`Delete sighting of ${sighting.species}`}
          onClick={onAskDelete}
        >
          <IconTrash />
        </button>
      )}
    </li>
  );
}

function isConfidence(value: string): value is Confidence {
  return (CONFIDENCE_VALUES as readonly string[]).includes(value);
}

function AddSightingForm({
  outingId,
  speciesOptions,
  onSaved,
}: {
  outingId: string;
  speciesOptions: string[];
  onSaved: () => Promise<void>;
}) {
  const [species, setSpecies] = useState('');
  const [count, setCount] = useState('1');
  const [confidence, setConfidence] = useState<Confidence>('probable');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (pending) return;
    const trimmedSpecies = species.trim();
    const parsedCount = Number.parseInt(count, 10);
    if (trimmedSpecies === '') {
      setError('Add a species name to record a sighting.');
      return;
    }
    if (!Number.isFinite(parsedCount) || parsedCount < 1) {
      setError('Count must be a whole number of 1 or more.');
      return;
    }

    const input: AddSightingInput = { species: trimmedSpecies, count: parsedCount, confidence };
    const trimmedNote = note.trim();
    if (trimmedNote !== '') input.note = trimmedNote;

    setError(null);
    setPending(true);
    try {
      await addSighting(outingId, input);
      setSpecies('');
      setCount('1');
      setConfidence('probable');
      setNote('');
      await onSaved();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <form class="sighting-form" onSubmit={handleSubmit} noValidate>
      <h3 class="sighting-form-title">Add a sighting</h3>
      <div class="form-grid">
        <label class="field field-grow">
          <span class="field-label">
            Species <em>required</em>
          </span>
          <input
            id="new-sighting-species"
            class="input"
            type="text"
            list="species-options"
            value={species}
            placeholder="European Robin"
            onInput={(event) => setSpecies(event.currentTarget.value)}
            required
          />
          <datalist id="species-options">
            {speciesOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label class="field field-count">
          <span class="field-label">Count</span>
          <input
            id="new-sighting-count"
            class="input"
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={count}
            onInput={(event) => setCount(event.currentTarget.value)}
          />
        </label>
        <label class="field field-confidence">
          <span class="field-label">Confidence</span>
          <select
            id="new-sighting-confidence"
            class="input"
            value={confidence}
            onChange={(event) => {
              const next = event.currentTarget.value;
              setConfidence(isConfidence(next) ? next : 'probable');
            }}
          >
            {CONFIDENCE_VALUES.map((value) => (
              <option key={value} value={value}>
                {CONFIDENCE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label class="field field-wide">
          <span class="field-label">
            Note <em>optional</em>
          </span>
          <input
            id="new-sighting-note"
            class="input"
            type="text"
            value={note}
            placeholder="Behaviour, plumage, weather…"
            onInput={(event) => setNote(event.currentTarget.value)}
          />
        </label>
      </div>
      {error !== null ? (
        <p class="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div class="form-actions">
        <p class="field-hint">Counts and confidence travel with the record.</p>
        <button type="submit" class="btn btn-primary" disabled={pending}>
          <IconPlus />
          {pending ? 'Adding…' : 'Add sighting'}
        </button>
      </div>
    </form>
  );
}

function toneClass(tone?: string): 'moss' | 'amber' | 'ink' | 'mist' {
  switch (tone) {
    case 'moss':
    case 'green':
    case 'success':
      return 'moss';
    case 'amber':
    case 'warning':
    case 'warn':
      return 'amber';
    case 'ink':
    case 'navy':
    case 'info':
    case 'blue':
    case 'sky':
      return 'ink';
    default:
      return 'mist';
  }
}

function FieldNotesPanel({
  items,
  loading,
  error,
  onRetry,
}: {
  items: Activity[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section class="panel context-panel" aria-labelledby="field-notes-heading">
      <header class="panel-head">
        <div>
          <p class="eyebrow">Field notes</p>
          <h2 id="field-notes-heading">Latest activity</h2>
        </div>
      </header>
      {error !== null ? (
        <ErrorState title="Field notes unavailable" message={error} onRetry={onRetry} />
      ) : loading ? (
        <ol class="note-list" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li key={index} class="note-item">
              <span class="note-dot tone-mist" />
              <div class="note-body">
                <span class="skeleton skeleton-line skeleton-line-lg" />
                <span class="skeleton skeleton-line" />
              </div>
            </li>
          ))}
        </ol>
      ) : items.length === 0 ? (
        <EmptyState
          title="No activity yet"
          message="Outings, sightings, and status changes will appear here as you use the log."
        />
      ) : (
        <ol class="note-list">
          {items.map((item, index) => (
            <li key={item.id ?? `${item.timestamp}-${index}`} class="note-item">
              <span class={`note-dot tone-${toneClass(item.tone)}`} aria-hidden="true" />
              <div class="note-body">
                <p class="note-text">{item.text}</p>
                <p class="note-time">{formatRelative(item.timestamp)}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SpeciesPanel({
  species,
  loading,
  error,
  onRetry,
}: {
  species: SpeciesTally[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const rows = useMemo(
    () => [...species].sort((left, right) => right.count - left.count).slice(0, 6),
    [species],
  );
  const max = rows.reduce((highest, item) => Math.max(highest, item.count), 0);

  return (
    <section class="panel context-panel" aria-labelledby="visitors-heading">
      <header class="panel-head">
        <div>
          <p class="eyebrow">Frequent visitors</p>
          <h2 id="visitors-heading">Species so far</h2>
        </div>
      </header>
      {error !== null ? (
        <ErrorState title="Species list unavailable" message={error} onRetry={onRetry} />
      ) : loading ? (
        <ul class="species-list" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <li key={index} class="species-row">
              <span class="skeleton skeleton-rank" />
              <span class="skeleton skeleton-line skeleton-line-lg" />
            </li>
          ))}
        </ul>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No species logged yet"
          message="Record a sighting and the birds you see most will gather here."
        />
      ) : (
        <ul class="species-list">
          {rows.map((item, index) => {
            const pips = max > 0 ? Math.max(1, Math.round((item.count / max) * 5)) : 0;
            return (
              <li key={item.name} class="species-row">
                <span class="species-rank" aria-hidden="true">
                  {index + 1}
                </span>
                <span class="species-body">
                  <span class="species-name">{item.name}</span>
                  <span class="species-meta">
                    {item.lastSeen !== null && item.lastSeen !== undefined
                      ? `Last seen ${formatRelative(item.lastSeen)}`
                      : 'Last seen not recorded'}
                  </span>
                </span>
                <span class="species-pips" aria-hidden="true">
                  {[1, 2, 3, 4, 5].map((pip) => (
                    <span key={pip} class={pip <= pips ? 'pip is-on' : 'pip'} />
                  ))}
                </span>
                <span class="species-count">
                  {item.count}
                  <span class="sr-only"> sightings</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function trapFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (container === null) return;
  const focusable = container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) return;
  const active = document.activeElement;
  if (event.shiftKey) {
    if (active === first || !container.contains(active)) {
      event.preventDefault();
      last.focus();
    }
  } else if (active === last || !container.contains(active)) {
    event.preventDefault();
    first.focus();
  }
}

function LogOutingDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: CreateOutingInput) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState<string>(() => todayInputValue());
  const [habitat, setHabitat] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Partial<Record<OutingField, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const locationRef = useRef<HTMLInputElement | null>(null);
  const dateRef = useRef<HTMLInputElement | null>(null);
  const habitatRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    titleRef.current?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') trapFocus(event, dialogRef.current);
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (pending) return;

    const nextErrors: Partial<Record<OutingField, string>> = {};
    if (title.trim() === '') nextErrors.title = 'Give the outing a name.';
    if (location.trim() === '') nextErrors.location = 'Where will you be watching?';
    if (date.trim() === '') nextErrors.date = 'Pick a date.';
    else if (parseDateish(date) === null) nextErrors.date = 'Use a valid date.';
    if (habitat.trim() === '') nextErrors.habitat = 'Choose or type a habitat.';
    setErrors(nextErrors);

    const firstInvalid = OUTING_FIELDS.find((field) => nextErrors[field] !== undefined);
    if (firstInvalid !== undefined) {
      const refs: Record<OutingField, { current: HTMLInputElement | null }> = {
        title: titleRef,
        location: locationRef,
        date: dateRef,
        habitat: habitatRef,
      };
      refs[firstInvalid].current?.focus();
      return;
    }

    const input: CreateOutingInput = {
      title: title.trim(),
      location: location.trim(),
      date,
      habitat: habitat.trim(),
    };
    const trimmedNotes = notes.trim();
    if (trimmedNotes !== '') input.notes = trimmedNotes;

    setFormError(null);
    setPending(true);
    try {
      await onSubmit(input);
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      class="dialog-backdrop"
      onClick={(event) => {
        if (!pending && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-outing-heading"
        ref={dialogRef}
      >
        <header class="dialog-head">
          <div>
            <p class="eyebrow">New entry</p>
            <h2 id="log-outing-heading">Log an outing</h2>
          </div>
          <button
            type="button"
            class="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={pending}
          >
            <IconClose />
          </button>
        </header>
        <p class="dialog-lede">
          Plan a watch or record one you have just finished. Everything stays on this device.
        </p>
        <form class="stack" onSubmit={handleSubmit} noValidate>
          <label class="field">
            <span class="field-label">
              Title <em>required</em>
            </span>
            <input
              ref={titleRef}
              id="outing-title"
              class="input"
              type="text"
              value={title}
              placeholder="Dawn chorus at the meadow"
              onInput={(event) => setTitle(event.currentTarget.value)}
              aria-invalid={errors.title !== undefined ? 'true' : undefined}
              aria-describedby={errors.title !== undefined ? 'outing-title-error' : undefined}
              required
            />
            {errors.title !== undefined ? (
              <span class="field-error" id="outing-title-error">
                {errors.title}
              </span>
            ) : null}
          </label>

          <label class="field">
            <span class="field-label">
              Location <em>required</em>
            </span>
            <input
              ref={locationRef}
              id="outing-location"
              class="input"
              type="text"
              value={location}
              placeholder="Beacon Hill north slope"
              onInput={(event) => setLocation(event.currentTarget.value)}
              aria-invalid={errors.location !== undefined ? 'true' : undefined}
              aria-describedby={errors.location !== undefined ? 'outing-location-error' : undefined}
              required
            />
            {errors.location !== undefined ? (
              <span class="field-error" id="outing-location-error">
                {errors.location}
              </span>
            ) : null}
          </label>

          <div class="form-grid">
            <label class="field">
              <span class="field-label">
                Date <em>required</em>
              </span>
              <input
                ref={dateRef}
                id="outing-date"
                class="input"
                type="date"
                value={date}
                onChange={(event) => setDate(event.currentTarget.value)}
                aria-invalid={errors.date !== undefined ? 'true' : undefined}
                aria-describedby={errors.date !== undefined ? 'outing-date-error' : undefined}
                required
              />
              {errors.date !== undefined ? (
                <span class="field-error" id="outing-date-error">
                  {errors.date}
                </span>
              ) : null}
            </label>

            <label class="field">
              <span class="field-label">
                Habitat <em>required</em>
              </span>
              <input
                ref={habitatRef}
                id="outing-habitat"
                class="input"
                type="text"
                list="habitat-options"
                value={habitat}
                placeholder="Wetland"
                onInput={(event) => setHabitat(event.currentTarget.value)}
                aria-invalid={errors.habitat !== undefined ? 'true' : undefined}
                aria-describedby={errors.habitat !== undefined ? 'outing-habitat-error' : undefined}
                required
              />
              <datalist id="habitat-options">
                {HABITAT_SUGGESTIONS.map((option) => (
                  <option key={option} value={option} />
                ))}
              </datalist>
              {errors.habitat !== undefined ? (
                <span class="field-error" id="outing-habitat-error">
                  {errors.habitat}
                </span>
              ) : null}
            </label>
          </div>

          <label class="field">
            <span class="field-label">
              Notes <em>optional</em>
            </span>
            <textarea
              id="outing-notes"
              class="input textarea"
              rows={3}
              value={notes}
              placeholder="What are you hoping to catch? Anything to remember?"
              onInput={(event) => setNotes(event.currentTarget.value)}
            />
          </label>

          {formError !== null ? (
            <p class="form-error" role="alert">
              {formError}
            </p>
          ) : null}

          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary" disabled={pending}>
              {pending ? 'Logging…' : 'Log outing'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function boardEmptyCopy(filter: StatusFilter, query: string): { title: string; message: string } {
  if (query !== '') {
    return {
      title: `No outings match “${query}”`,
      message: 'Try another place, species, or title — or clear the search to see the whole log.',
    };
  }
  if (filter === 'completed') {
    return {
      title: 'No completed outings yet',
      message: 'Finish a watch and mark it completed to build the history of your patch.',
    };
  }
  if (filter === 'in-progress') {
    return {
      title: 'Nothing in flight right now',
      message: 'Open a planned outing and mark it in flight when you head out.',
    };
  }
  if (filter === 'planned') {
    return {
      title: 'Nothing planned yet',
      message: 'Plan the next watch and Wingbeat will keep it at the top of the log.',
    };
  }
  return {
    title: 'Your log is ready for its first outing',
    message:
      'Log a watch to start recording species, counts, and the small changes in your local patch.',
  };
}

function isOffline(error: unknown): boolean {
  return error instanceof ApiError && error.status === 0;
}

export function App() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dashboardPreview, setDashboardPreview] = useState(false);

  const [activity, setActivity] = useState<Activity[] | null>(null);

  const [outings, setOutings] = useState<Outing[]>([]);
  const [outingsLoading, setOutingsLoading] = useState(true);
  const [outingsError, setOutingsError] = useState<string | null>(null);
  const [outingsPreview, setOutingsPreview] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Outing | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [statusBusy, setStatusBusy] = useState<OutingStatus | null>(null);
  const [deletingSightingId, setDeletingSightingId] = useState<string | null>(null);
  const [confirmingSightingId, setConfirmingSightingId] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const detailRef = useRef<HTMLElement | null>(null);
  const listRequestId = useRef(0);
  const detailRequestId = useRef(0);
  const hasLoadedList = useRef(false);

  const loadDashboard = useCallback(
    async (options: { signal?: AbortSignal; silent?: boolean } = {}) => {
      if (options.silent !== true) setDashboardLoading(true);
      try {
        const data = await getDashboard(options.signal);
        setDashboard(data);
        setDashboardError(null);
        setDashboardPreview(false);
      } catch (error) {
        if (isAbortError(error)) return;
        setDashboardError(errorMessage(error));
        if (isOffline(error)) {
          setDashboard((current) => current ?? DEMO_DASHBOARD);
          setDashboardPreview(true);
        }
      } finally {
        setDashboardLoading(false);
      }
    },
    [],
  );

  const loadActivity = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await getActivity(signal);
      if (items.length > 0) setActivity(items);
    } catch (error) {
      if (isAbortError(error)) return;
      setActivity(null);
    }
  }, []);

  const loadOutings = useCallback(
    async (
      filter: StatusFilter,
      term: string,
      options: { signal?: AbortSignal; silent?: boolean; pruneSelection?: boolean } = {},
    ) => {
      listRequestId.current += 1;
      const requestId = listRequestId.current;
      if (options.silent !== true) setOutingsLoading(true);
      try {
        const data = await getOutings(filter, term, options.signal);
        if (requestId !== listRequestId.current) return;
        setOutings(data);
        setOutingsError(null);
        setOutingsPreview(false);
        setSelectedId((current) => {
          if (current === null) return data[0]?.id ?? null;
          if (options.pruneSelection !== true) return current;
          return data.some((outing) => outing.id === current) ? current : (data[0]?.id ?? current);
        });
      } catch (error) {
        if (isAbortError(error)) return;
        if (requestId !== listRequestId.current) return;
        setOutingsError(errorMessage(error));
        if (isOffline(error)) {
          setOutings((current) => (current.length > 0 ? current : DEMO_OUTINGS));
          setOutingsPreview(true);
        }
      } finally {
        if (requestId === listRequestId.current) setOutingsLoading(false);
      }
    },
    [],
  );

  const loadDetail = useCallback(async (id: string, options: { silent?: boolean } = {}) => {
    detailRequestId.current += 1;
    const requestId = detailRequestId.current;
    if (options.silent !== true) setDetailLoading(true);
    try {
      const outing = await getOuting(id);
      if (requestId !== detailRequestId.current) return;
      setSelected(outing);
      setDetailError(null);
    } catch (error) {
      if (isAbortError(error)) return;
      if (requestId !== detailRequestId.current) return;
      setDetailError(errorMessage(error));
    } finally {
      if (requestId === detailRequestId.current) setDetailLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      loadDashboard({ silent: true }),
      loadOutings(statusFilter, query, { silent: true }),
      loadActivity(),
    ]);
    if (selectedId !== null) await loadDetail(selectedId, { silent: true });
    setRefreshing(false);
  }, [loadDashboard, loadOutings, loadActivity, loadDetail, statusFilter, query, selectedId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard({ signal: controller.signal });
    void loadActivity(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadDashboard, loadActivity]);

  useEffect(() => {
    const controller = new AbortController();
    void loadOutings(statusFilter, query, {
      signal: controller.signal,
      silent: hasLoadedList.current,
      pruneSelection: true,
    });
    hasLoadedList.current = true;
    return () => {
      controller.abort();
    };
  }, [statusFilter, query, loadOutings]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 250);
    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    if (selectedId === null) return;
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  const notesFromServer = selected?.notes ?? '';
  useEffect(() => {
    setNotesDraft(notesFromServer);
  }, [notesFromServer]);

  useEffect(() => {
    if (notice === null || notice.tone === 'error') return;
    const timer = window.setTimeout(() => setNotice(null), 5200);
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);

  const revealDetailOnNarrowScreens = useCallback(() => {
    const node = detailRef.current;
    if (node === null || typeof node.scrollIntoView !== 'function') return;
    const narrow =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(max-width: 959px)').matches
        : window.innerWidth < 960;
    if (narrow) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleSelectOuting = useCallback(
    (outing: Outing) => {
      setSelectedId(outing.id);
      setSelected(outing);
      setDetailError(null);
      setConfirmingSightingId(null);
      revealDetailOnNarrowScreens();
    },
    [revealDetailOnNarrowScreens],
  );

  const handleCreateOuting = useCallback(
    async (input: CreateOutingInput) => {
      const outing = await createOuting(input);
      setDialogOpen(false);
      setStatusFilter('all');
      setSearch('');
      setQuery('');
      setSelectedId(outing.id);
      setSelected(outing);
      setNotice({ tone: 'success', text: `Logged “${outing.title}”.` });
      window.setTimeout(revealDetailOnNarrowScreens, 260);
      await Promise.all([
        loadDashboard({ silent: true }),
        loadOutings('all', '', { silent: true }),
        loadActivity(),
      ]);
    },
    [loadDashboard, loadOutings, loadActivity, revealDetailOnNarrowScreens],
  );

  const handleStatusChange = useCallback(
    async (next: OutingStatus) => {
      if (selected === null || selected.status === next) return;
      setStatusBusy(next);
      try {
        const updated = await updateOuting(selected.id, { status: next });
        setSelected((current) =>
          current === null
            ? updated
            : {
                ...updated,
                sightings: updated.sightings.length > 0 ? updated.sightings : current.sightings,
              },
        );
        setNotice({
          tone: 'success',
          text: `“${updated.title}” marked ${STATUS_LABEL[next].toLowerCase()}.`,
        });
        await Promise.all([
          loadOutings(statusFilter, query, { silent: true }),
          loadDashboard({ silent: true }),
          loadDetail(selected.id, { silent: true }),
          loadActivity(),
        ]);
      } catch (error) {
        setNotice({ tone: 'error', text: `Could not update the status — ${errorMessage(error)}` });
      } finally {
        setStatusBusy(null);
      }
    },
    [selected, statusFilter, query, loadOutings, loadDashboard, loadDetail, loadActivity],
  );

  const handleSaveNotes = useCallback(async () => {
    if (selected === null) return;
    if (notesDraft === (selected.notes ?? '')) return;
    setNotesSaving(true);
    try {
      const updated = await updateOuting(selected.id, {
        status: selected.status,
        notes: notesDraft,
      });
      setSelected((current) =>
        current === null
          ? updated
          : {
              ...updated,
              sightings: updated.sightings.length > 0 ? updated.sightings : current.sightings,
            },
      );
      setNotice({ tone: 'success', text: 'Field notes saved.' });
      await Promise.all([
        loadOutings(statusFilter, query, { silent: true }),
        loadDetail(selected.id, { silent: true }),
      ]);
    } catch (error) {
      setNotice({ tone: 'error', text: `Could not save the notes — ${errorMessage(error)}` });
    } finally {
      setNotesSaving(false);
    }
  }, [selected, notesDraft, statusFilter, query, loadOutings, loadDetail]);

  const handleSightingSaved = useCallback(async () => {
    if (selected === null) return;
    const outingId = selected.id;
    await Promise.all([
      loadDetail(outingId, { silent: true }),
      loadOutings(statusFilter, query, { silent: true }),
      loadDashboard({ silent: true }),
      loadActivity(),
    ]);
    setNotice({ tone: 'success', text: 'Sighting recorded.' });
  }, [selected, statusFilter, query, loadDetail, loadOutings, loadDashboard, loadActivity]);

  const handleDeleteSighting = useCallback(
    async (sighting: Sighting) => {
      if (selected === null) return;
      setDeletingSightingId(sighting.id);
      try {
        await deleteSighting(sighting.id);
        setConfirmingSightingId(null);
        setNotice({ tone: 'success', text: `Removed ${sighting.species} from this outing.` });
        await Promise.all([
          loadDetail(selected.id, { silent: true }),
          loadOutings(statusFilter, query, { silent: true }),
          loadDashboard({ silent: true }),
          loadActivity(),
        ]);
      } catch (error) {
        setNotice({
          tone: 'error',
          text: `Could not delete the sighting — ${errorMessage(error)}`,
        });
      } finally {
        setDeletingSightingId(null);
      }
    },
    [selected, statusFilter, query, loadDetail, loadOutings, loadDashboard, loadActivity],
  );

  const clearFilters = useCallback(() => {
    setSearch('');
    setQuery('');
    setStatusFilter('all');
  }, []);

  const handleFilterKeyDown = useCallback((event: KeyboardEvent, index: number) => {
    const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    const next = FILTERS[(index + direction + FILTERS.length) % FILTERS.length];
    if (next === undefined) return;
    setStatusFilter(next.value);
    const node = document.getElementById(`filter-tab-${next.value}`);
    node?.focus();
  }, []);

  const stats = dashboard?.stats ?? null;
  const speciesLogged = dashboard
    ? (dashboard.stats.speciesCount ?? dashboard.stats.totalSpecies ?? dashboard.species.length)
    : 0;
  const activityItems = activity ?? dashboard?.recentActivity ?? [];
  const preview = dashboardPreview || outingsPreview;

  const speciesOptions = useMemo(() => {
    const names = new Set<string>(SPECIES_SUGGESTIONS);
    for (const item of dashboard?.species ?? []) names.add(item.name);
    return [...names].sort((left, right) => left.localeCompare(right));
  }, [dashboard]);

  const emptyCopy = boardEmptyCopy(statusFilter, query);
  const filtered = statusFilter !== 'all' || query !== '';

  return (
    <div class="app-shell">
      <a class="skip-link" href="#main">
        Skip to the field log
      </a>

      <header class="hero">
        <div class="hero-top">
          <p class="brand">
            <span class="brand-mark" aria-hidden="true">
              <WingMark />
            </span>
            <span class="brand-name">Wingbeat</span>
          </p>
          <p class="trust-note">
            <span class="trust-dot" aria-hidden="true" />
            Local only · synced nowhere
          </p>
        </div>
        <div class="hero-body">
          <p class="eyebrow">FIELD LOG / LOCAL FIRST</p>
          <h1>
            See more in the <em>everyday</em>.
          </h1>
          <p class="hero-lede">
            Plan a watch, note what turns up, and let the small patterns surface. Wingbeat keeps a
            quiet record of your local patch — nothing leaves this machine.
          </p>
          <div class="hero-actions">
            <button
              type="button"
              class="btn btn-primary btn-lg"
              onClick={() => setDialogOpen(true)}
            >
              <IconPlus />
              Log an outing
            </button>
            <p class="hero-date">
              <IconCalendar />
              {formatDate(new Date(), LONG_DATE)}
            </p>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <WingMark className="wing-mark hero-wing" />
        </div>
      </header>

      {preview ? (
        <div class="banner" role="status">
          <span class="banner-mark" aria-hidden="true">
            <IconInfo />
          </span>
          <p>
            <strong>Preview data.</strong> The Wingbeat API is not reachable right now, so this
            screen shows a sample log. Start the local server, then retry.
          </p>
          <button type="button" class="btn btn-secondary btn-sm" onClick={() => void refreshAll()}>
            <IconRefresh />
            Retry connection
          </button>
        </div>
      ) : null}

      <section class="metrics" aria-label="Field log at a glance">
        {dashboard !== null && stats !== null ? (
          <>
            <MetricCard
              accent="moss"
              label="Species logged"
              value={speciesLogged}
              hint="Distinct birds in your log"
              icon={<IconLeaf />}
            />
            <MetricCard
              accent="ink"
              label="Sightings"
              value={stats.totalSightings}
              hint="Individual records kept"
              icon={<WingMark className="wing-mark icon-mark" />}
            />
            <MetricCard
              accent="amber"
              label="Completed outings"
              value={stats.completedOutings}
              hint="Watches wrapped up"
              icon={<IconCheck />}
            />
            <MetricCard
              accent="mist"
              label="Upcoming watch"
              value={stats.upcomingOutings}
              hint="Planned outings ahead"
              icon={<IconClock />}
            />
          </>
        ) : dashboardLoading ? (
          <>
            <MetricSkeleton accent="moss" />
            <MetricSkeleton accent="ink" />
            <MetricSkeleton accent="amber" />
            <MetricSkeleton accent="mist" />
          </>
        ) : (
          <div class="metrics-error">
            <ErrorState
              title="Summary unavailable"
              message={dashboardError ?? 'The dashboard could not be loaded.'}
              onRetry={() => void refreshAll()}
            />
          </div>
        )}
      </section>

      <main id="main" class="layout">
        <section class="panel board" aria-labelledby="outings-heading">
          <header class="panel-head">
            <div>
              <p class="eyebrow">Workspace</p>
              <h2 id="outings-heading">Watch outings</h2>
            </div>
            <div class="panel-actions">
              <span class="count-pill">{outings.length} shown</span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                disabled={refreshing}
                onClick={() => void refreshAll()}
              >
                <IconRefresh />
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </header>

          <div class="toolbar">
            <div class="tabs" role="tablist" aria-label="Filter outings by status">
              {FILTERS.map((filter, index) => {
                const active = filter.value === statusFilter;
                return (
                  <button
                    key={filter.value}
                    id={`filter-tab-${filter.value}`}
                    type="button"
                    role="tab"
                    class={active ? 'tab is-active' : 'tab'}
                    aria-selected={active}
                    aria-controls="outings-tabpanel"
                    tabIndex={active ? 0 : -1}
                    onClick={() => setStatusFilter(filter.value)}
                    onKeyDown={(event) => handleFilterKeyDown(event, index)}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <label class="search">
              <span class="sr-only">Search outings</span>
              <IconSearch />
              <input
                type="search"
                value={search}
                placeholder="Search title, place, species…"
                onInput={(event) => setSearch(event.currentTarget.value)}
              />
              {search !== '' ? (
                <button
                  type="button"
                  class="search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <IconClose />
                </button>
              ) : null}
            </label>
          </div>

          <div
            id="outings-tabpanel"
            class="board-body"
            role="tabpanel"
            aria-labelledby={`filter-tab-${statusFilter}`}
            tabIndex={0}
            aria-busy={outingsLoading}
          >
            {outingsError !== null && outings.length === 0 ? (
              <ErrorState
                title="Outings unavailable"
                message={outingsError}
                onRetry={() => void refreshAll()}
              />
            ) : outingsLoading && outings.length === 0 ? (
              <OutingSkeleton />
            ) : outings.length === 0 ? (
              <EmptyState
                title={emptyCopy.title}
                message={emptyCopy.message}
                action={
                  filtered ? (
                    <button type="button" class="btn btn-secondary" onClick={clearFilters}>
                      Show all outings
                    </button>
                  ) : (
                    <button
                      type="button"
                      class="btn btn-primary"
                      onClick={() => setDialogOpen(true)}
                    >
                      <IconPlus />
                      Log an outing
                    </button>
                  )
                }
              />
            ) : (
              <ul class="outing-list">
                {outings.map((outing) => (
                  <OutingRow
                    key={outing.id}
                    outing={outing}
                    selected={outing.id === selectedId}
                    onSelect={() => handleSelectOuting(outing)}
                  />
                ))}
              </ul>
            )}
            {outingsError !== null && outings.length > 0 ? (
              <p class="inline-error" role="alert">
                {outingsError}
              </p>
            ) : null}
          </div>
        </section>

        <section class="panel detail" ref={detailRef} aria-labelledby="detail-heading">
          <header class="panel-head">
            <div>
              <p class="eyebrow">Selected outing</p>
              <h2 id="detail-heading">{selected !== null ? selected.title : 'Outing detail'}</h2>
            </div>
            <div class="panel-actions">
              {detailLoading && selected !== null ? (
                <span class="pill-quiet">Refreshing…</span>
              ) : null}
              {selected !== null ? <StatusBadge status={selected.status} /> : null}
            </div>
          </header>

          {detailError !== null ? (
            <div class="inline-error" role="alert">
              <p>{detailError}</p>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => {
                  if (selectedId !== null) void loadDetail(selectedId);
                }}
              >
                <IconRefresh />
                Retry
              </button>
            </div>
          ) : null}

          {selected === null ? (
            detailLoading ? (
              <DetailSkeleton />
            ) : (
              <EmptyState
                title="Pick an outing to open its log"
                message="Choose a row to see the date, notes, status, and every sighting recorded that day."
                action={
                  <button type="button" class="btn btn-primary" onClick={() => setDialogOpen(true)}>
                    <IconPlus />
                    Log an outing
                  </button>
                }
              />
            )
          ) : (
            <div class="detail-body" aria-busy={detailLoading}>
              <p class="detail-meta">
                <span class="detail-meta-item">
                  <IconCalendar />
                  {formatDate(selected.date, LONG_DATE)}
                </span>
                <span class="detail-meta-item">
                  <IconPin />
                  {selected.location}
                </span>
                <span class="detail-meta-item">
                  <IconLeaf />
                  {selected.habitat}
                </span>
              </p>

              <StatusControl
                status={selected.status}
                busy={statusBusy}
                onChange={(next) => void handleStatusChange(next)}
              />

              <NotesEditor
                value={notesDraft}
                dirty={notesDraft !== (selected.notes ?? '')}
                saving={notesSaving}
                onChange={setNotesDraft}
                onSave={() => void handleSaveNotes()}
              />

              <section class="sightings" aria-labelledby="sightings-heading">
                <div class="section-head">
                  <h3 id="sightings-heading">
                    Sightings <span class="count-pill">{selected.sightings.length}</span>
                  </h3>
                  <p class="section-hint">Updated {formatRelative(selected.updatedAt)}</p>
                </div>
                {selected.sightings.length === 0 ? (
                  <p class="muted-note">
                    Nothing recorded yet — the first sighting is the good part. Add one below.
                  </p>
                ) : (
                  <ul class="sighting-list">
                    {selected.sightings.map((sighting) => (
                      <SightingItem
                        key={sighting.id}
                        sighting={sighting}
                        confirming={confirmingSightingId === sighting.id}
                        deleting={deletingSightingId === sighting.id}
                        onAskDelete={() => setConfirmingSightingId(sighting.id)}
                        onCancelDelete={() => setConfirmingSightingId(null)}
                        onConfirmDelete={() => void handleDeleteSighting(sighting)}
                      />
                    ))}
                  </ul>
                )}
              </section>

              <AddSightingForm
                key={selected.id}
                outingId={selected.id}
                speciesOptions={speciesOptions}
                onSaved={handleSightingSaved}
              />
            </div>
          )}
        </section>

        <aside class="context" aria-label="Field context">
          <FieldNotesPanel
            items={activityItems}
            loading={dashboardLoading && dashboard === null}
            error={dashboard === null && !dashboardPreview ? dashboardError : null}
            onRetry={() => void refreshAll()}
          />
          <SpeciesPanel
            species={dashboard?.species ?? []}
            loading={dashboardLoading && dashboard === null}
            error={dashboard === null && !dashboardPreview ? dashboardError : null}
            onRetry={() => void refreshAll()}
          />
        </aside>
      </main>

      <footer class="site-footer">
        <p>Wingbeat · a local-first birding field log</p>
        <p>Outings live in memory on this machine. Nothing is synced, shared, or sent anywhere.</p>
      </footer>

      {notice !== null ? <NoticeBar notice={notice} onDismiss={() => setNotice(null)} /> : null}

      {dialogOpen ? (
        <LogOutingDialog onClose={() => setDialogOpen(false)} onSubmit={handleCreateOuting} />
      ) : null}
    </div>
  );
}

render(<App />, document.getElementById('app')!);
