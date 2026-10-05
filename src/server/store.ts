import type {
  Activity,
  ActivityKind,
  ActivityTone,
  Confidence,
  Dashboard,
  DashboardStats,
  Outing,
  OutingStatus,
  Sighting,
  SpeciesSummary,
} from './types.js';

export interface OutingFilter {
  status?: OutingStatus | 'all';
  q?: string;
}

export interface NewOutingInput {
  title: string;
  location: string;
  date: string;
  habitat: string;
  notes?: string;
}

export interface OutingChanges {
  status?: OutingStatus;
  notes?: string;
}

export interface NewSightingInput {
  species: string;
  count: number;
  confidence: Confidence;
  note?: string;
}

export interface Store {
  listOutings(filter?: OutingFilter): Outing[];
  getOuting(id: string): Outing | undefined;
  createOuting(input: NewOutingInput): Outing;
  updateOuting(id: string, changes: OutingChanges): Outing | undefined;
  addSighting(outingId: string, input: NewSightingInput): Sighting | undefined;
  deleteSighting(id: string): boolean;
  getDashboard(): Dashboard;
  listActivity(): Activity[];
}

export interface StoreOptions {
  now?: () => Date;
}

const RECENT_ACTIVITY_LIMIT = 8;

const STATUS_LABEL: Record<OutingStatus, string> = {
  planned: 'planned',
  'in-progress': 'in progress',
  completed: 'completed',
};

const STATUS_TONE: Record<OutingStatus, ActivityTone> = {
  planned: 'amber',
  'in-progress': 'blue',
  completed: 'green',
};

const SEED_OUTINGS: Outing[] = [
  {
    id: 'outing-1',
    title: 'Creek bend survey',
    location: 'Willow Creek Bend',
    date: '2026-10-03',
    habitat: 'Creek corridor',
    status: 'completed',
    notes: 'Slow water and flat light; sparrows skulked in the blackberry tangle.',
    sightings: [
      {
        id: 'sighting-1',
        outingId: 'outing-1',
        species: 'Belted Kingfisher',
        count: 1,
        confidence: 'certain',
        note: 'Perched on the wire above the second pool, then rattled downstream.',
        createdAt: '2026-10-03T08:05:00.000Z',
      },
      {
        id: 'sighting-2',
        outingId: 'outing-1',
        species: 'Song Sparrow',
        count: 4,
        confidence: 'probable',
        note: 'Four birds working the hedgerow edge; two gave the full song.',
        createdAt: '2026-10-03T09:20:00.000Z',
      },
    ],
    createdAt: '2026-10-03T07:30:00.000Z',
    updatedAt: '2026-10-03T10:05:00.000Z',
  },
  {
    id: 'outing-2',
    title: 'Hedgerow walk at Cedar Bend',
    location: 'Cedar Bend Trail',
    date: '2026-10-04',
    habitat: 'Riparian hedgerow',
    status: 'completed',
    notes: 'Warm and still; the waxwing flock stripped a serviceberry row in minutes.',
    sightings: [
      {
        id: 'sighting-3',
        outingId: 'outing-2',
        species: 'Cedar Waxwing',
        count: 12,
        confidence: 'certain',
        note: 'Flock of twelve feeding low, trilling the whole time.',
        createdAt: '2026-10-04T13:35:00.000Z',
      },
      {
        id: 'sighting-4',
        outingId: 'outing-2',
        species: 'Northern Cardinal',
        count: 2,
        confidence: 'certain',
        note: 'A pair moving through the hawthorn, male singing.',
        createdAt: '2026-10-04T14:10:00.000Z',
      },
    ],
    createdAt: '2026-10-03T18:45:00.000Z',
    updatedAt: '2026-10-04T15:40:00.000Z',
  },
  {
    id: 'outing-3',
    title: 'Spillway kingfisher watch',
    location: 'Mill Creek Spillway',
    date: '2026-10-06',
    habitat: 'Riverbank rapids',
    status: 'planned',
    notes: 'Meet at the lower parking lot before sunrise; scope for the far bank.',
    sightings: [],
    createdAt: '2026-10-03T19:10:00.000Z',
    updatedAt: '2026-10-03T19:10:00.000Z',
  },
  {
    id: 'outing-4',
    title: 'Dawn chorus at Alder Marsh',
    location: 'Alder Marsh Boardwalk',
    date: '2026-10-05',
    habitat: 'Wetland marsh',
    status: 'in-progress',
    notes: 'Cold front overnight left mist over the reeds; listening for rails.',
    sightings: [
      {
        id: 'sighting-5',
        outingId: 'outing-4',
        species: 'Great Blue Heron',
        count: 1,
        confidence: 'certain',
        note: 'Stood motionless at the north pool for ten minutes, then flushed.',
        createdAt: '2026-10-05T11:12:00.000Z',
      },
      {
        id: 'sighting-6',
        outingId: 'outing-4',
        species: 'Song Sparrow',
        count: 3,
        confidence: 'probable',
        note: 'Singing from the low willows past the second boardwalk.',
        createdAt: '2026-10-05T11:20:00.000Z',
      },
    ],
    createdAt: '2026-10-05T06:20:00.000Z',
    updatedAt: '2026-10-05T11:20:00.000Z',
  },
  {
    id: 'outing-5',
    title: 'Lakeshore hawk watch',
    location: 'Dune Overlook',
    date: '2026-10-07',
    habitat: 'Coastal dune',
    status: 'planned',
    notes: 'North winds in the forecast; bring the scope and a thermos.',
    sightings: [],
    createdAt: '2026-10-05T08:00:00.000Z',
    updatedAt: '2026-10-05T08:00:00.000Z',
  },
];

const SEED_ACTIVITY: Activity[] = [
  {
    id: 'activity-1',
    kind: 'outing-created',
    text: 'Created outing "Creek bend survey" at Willow Creek Bend',
    timestamp: '2026-10-03T07:30:00.000Z',
    tone: 'amber',
  },
  {
    id: 'activity-2',
    kind: 'sighting-added',
    text: 'Logged Belted Kingfisher (1) at Willow Creek Bend',
    timestamp: '2026-10-03T08:05:00.000Z',
    tone: 'green',
  },
  {
    id: 'activity-3',
    kind: 'outing-updated',
    text: '"Creek bend survey" marked completed',
    timestamp: '2026-10-03T10:05:00.000Z',
    tone: 'blue',
  },
  {
    id: 'activity-4',
    kind: 'outing-created',
    text: 'Created outing "Hedgerow walk at Cedar Bend" at Cedar Bend Trail',
    timestamp: '2026-10-03T18:45:00.000Z',
    tone: 'amber',
  },
  {
    id: 'activity-5',
    kind: 'sighting-added',
    text: 'Logged Cedar Waxwing (12) at Cedar Bend Trail',
    timestamp: '2026-10-04T13:35:00.000Z',
    tone: 'green',
  },
  {
    id: 'activity-6',
    kind: 'outing-updated',
    text: '"Hedgerow walk at Cedar Bend" marked completed',
    timestamp: '2026-10-04T15:40:00.000Z',
    tone: 'blue',
  },
  {
    id: 'activity-7',
    kind: 'outing-created',
    text: 'Created outing "Dawn chorus at Alder Marsh" at Alder Marsh Boardwalk',
    timestamp: '2026-10-05T06:20:00.000Z',
    tone: 'amber',
  },
  {
    id: 'activity-8',
    kind: 'outing-updated',
    text: '"Dawn chorus at Alder Marsh" marked in progress',
    timestamp: '2026-10-05T11:05:00.000Z',
    tone: 'blue',
  },
  {
    id: 'activity-9',
    kind: 'sighting-added',
    text: 'Logged Great Blue Heron (1) at Alder Marsh Boardwalk',
    timestamp: '2026-10-05T11:12:00.000Z',
    tone: 'green',
  },
];

function cloneSighting(sighting: Sighting): Sighting {
  return { ...sighting };
}

function cloneOuting(outing: Outing): Outing {
  return { ...outing, sightings: outing.sightings.map(cloneSighting) };
}

function cloneActivity(activity: Activity): Activity {
  return { ...activity };
}

function sequenceOf(id: string): number {
  const suffix = id.slice(id.lastIndexOf('-') + 1);
  const value = Number.parseInt(suffix, 10);
  return Number.isNaN(value) ? 0 : value;
}

export function createStore(options: StoreOptions = {}): Store {
  const now = options.now ?? (() => new Date());
  const timestamp = (): string => now().toISOString();

  const outings: Outing[] = SEED_OUTINGS.map(cloneOuting);
  const activity: Activity[] = SEED_ACTIVITY.map(cloneActivity);

  let outingSequence = SEED_OUTINGS.length;
  let sightingSequence = SEED_OUTINGS.reduce((total, outing) => total + outing.sightings.length, 0);
  let activitySequence = SEED_ACTIVITY.length;

  const nextId = (prefix: string, sequence: number): string => `${prefix}-${sequence}`;

  const findOuting = (id: string): Outing | undefined => outings.find((outing) => outing.id === id);

  function recordActivity(kind: ActivityKind, text: string, tone: ActivityTone, at: string): void {
    activitySequence += 1;
    activity.push({ id: nextId('activity', activitySequence), kind, text, timestamp: at, tone });
  }

  function listActivity(): Activity[] {
    return activity
      .slice()
      .sort((left, right) => {
        if (left.timestamp !== right.timestamp) {
          return right.timestamp.localeCompare(left.timestamp);
        }
        return sequenceOf(right.id) - sequenceOf(left.id);
      })
      .map(cloneActivity);
  }

  function listOutings(filter: OutingFilter = {}): Outing[] {
    const status = filter.status ?? 'all';
    const query = (filter.q ?? '').trim().toLowerCase();

    return outings
      .filter((outing) => status === 'all' || outing.status === status)
      .filter((outing) => {
        if (query === '') {
          return true;
        }
        const haystack = [
          outing.title,
          outing.location,
          outing.habitat,
          ...outing.sightings.map((sighting) => sighting.species),
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((left, right) => {
        if (left.date !== right.date) {
          return right.date.localeCompare(left.date);
        }
        return right.createdAt.localeCompare(left.createdAt);
      })
      .map(cloneOuting);
  }

  function getOuting(id: string): Outing | undefined {
    const outing = findOuting(id);
    return outing === undefined ? undefined : cloneOuting(outing);
  }

  function createOuting(input: NewOutingInput): Outing {
    const at = timestamp();
    outingSequence += 1;
    const outing: Outing = {
      id: nextId('outing', outingSequence),
      title: input.title.trim(),
      location: input.location.trim(),
      date: input.date,
      habitat: input.habitat.trim(),
      status: 'planned',
      notes: input.notes ?? '',
      sightings: [],
      createdAt: at,
      updatedAt: at,
    };

    outings.push(outing);
    recordActivity(
      'outing-created',
      `Created outing "${outing.title}" at ${outing.location}`,
      'amber',
      at,
    );
    return cloneOuting(outing);
  }

  function updateOuting(id: string, changes: OutingChanges): Outing | undefined {
    const outing = findOuting(id);
    if (outing === undefined) {
      return undefined;
    }

    const statusChanged = changes.status !== undefined && changes.status !== outing.status;
    const notesChanged = changes.notes !== undefined && changes.notes !== outing.notes;

    if (!statusChanged && !notesChanged) {
      return cloneOuting(outing);
    }

    if (changes.status !== undefined) {
      outing.status = changes.status;
    }
    if (changes.notes !== undefined) {
      outing.notes = changes.notes;
    }
    outing.updatedAt = timestamp();

    if (statusChanged && changes.status !== undefined) {
      recordActivity(
        'outing-updated',
        `"${outing.title}" marked ${STATUS_LABEL[changes.status]}`,
        STATUS_TONE[changes.status],
        outing.updatedAt,
      );
    }

    return cloneOuting(outing);
  }

  function addSighting(outingId: string, input: NewSightingInput): Sighting | undefined {
    const outing = findOuting(outingId);
    if (outing === undefined) {
      return undefined;
    }

    const at = timestamp();
    sightingSequence += 1;
    const sighting: Sighting = {
      id: nextId('sighting', sightingSequence),
      outingId,
      species: input.species.trim(),
      count: input.count,
      confidence: input.confidence,
      note: input.note ?? '',
      createdAt: at,
    };

    outing.sightings.push(sighting);
    outing.updatedAt = at;
    recordActivity(
      'sighting-added',
      `Logged ${sighting.species} (${sighting.count}) at ${outing.location}`,
      'green',
      at,
    );
    return cloneSighting(sighting);
  }

  function deleteSighting(id: string): boolean {
    for (const outing of outings) {
      const index = outing.sightings.findIndex((sighting) => sighting.id === id);
      if (index !== -1) {
        outing.sightings.splice(index, 1);
        outing.updatedAt = timestamp();
        return true;
      }
    }
    return false;
  }

  function buildSpecies(): SpeciesSummary[] {
    const bySpecies = new Map<string, SpeciesSummary>();

    for (const outing of outings) {
      for (const sighting of outing.sightings) {
        const key = sighting.species.toLowerCase();
        const lastSeen = sighting.createdAt.slice(0, 10);
        const existing = bySpecies.get(key);
        if (existing === undefined) {
          bySpecies.set(key, { name: sighting.species, count: sighting.count, lastSeen });
          continue;
        }
        existing.count += sighting.count;
        if (lastSeen > existing.lastSeen) {
          existing.lastSeen = lastSeen;
          existing.name = sighting.species;
        }
      }
    }

    return [...bySpecies.values()].sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }
      return left.name.localeCompare(right.name);
    });
  }

  function getDashboard(): Dashboard {
    const species = buildSpecies();
    const stats: DashboardStats = {
      totalSightings: outings.reduce((total, outing) => total + outing.sightings.length, 0),
      speciesCount: species.length,
      completedOutings: outings.filter((outing) => outing.status === 'completed').length,
      upcomingOutings: outings.filter((outing) => outing.status !== 'completed').length,
    };

    return {
      stats,
      species,
      recentActivity: listActivity().slice(0, RECENT_ACTIVITY_LIMIT),
    };
  }

  return {
    listOutings,
    getOuting,
    createOuting,
    updateOuting,
    addSighting,
    deleteSighting,
    getDashboard,
    listActivity,
  };
}
