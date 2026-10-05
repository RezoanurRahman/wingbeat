export type OutingStatus = 'planned' | 'in-progress' | 'completed';

export type Confidence = 'certain' | 'probable' | 'possible';

export type ActivityKind = 'outing-created' | 'outing-updated' | 'sighting-added';

export type ActivityTone = 'blue' | 'green' | 'amber';

export interface Sighting {
  id: string;
  outingId: string;
  species: string;
  count: number;
  confidence: Confidence;
  note: string;
  createdAt: string;
}

export interface Outing {
  id: string;
  title: string;
  location: string;
  date: string;
  habitat: string;
  status: OutingStatus;
  notes: string;
  sightings: Sighting[];
  createdAt: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  kind: ActivityKind;
  text: string;
  timestamp: string;
  tone: ActivityTone;
}

export interface DashboardStats {
  totalSightings: number;
  speciesCount: number;
  completedOutings: number;
  upcomingOutings: number;
}

export interface SpeciesSummary {
  name: string;
  count: number;
  lastSeen: string;
}

export interface Dashboard {
  stats: DashboardStats;
  species: SpeciesSummary[];
  recentActivity: Activity[];
}

export const OUTING_STATUSES = [
  'planned',
  'in-progress',
  'completed',
] as const satisfies readonly OutingStatus[];

export const CONFIDENCE_LEVELS = [
  'certain',
  'probable',
  'possible',
] as const satisfies readonly Confidence[];
