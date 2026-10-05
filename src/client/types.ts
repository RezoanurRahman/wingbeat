export type OutingStatus = 'planned' | 'in-progress' | 'completed';

export type Confidence = 'certain' | 'probable' | 'possible';

/** Filter value accepted by `GET /api/outings`. */
export type OutingFilter = OutingStatus | 'all';

export interface Sighting {
  id: string;
  outingId: string;
  species: string;
  count: number;
  confidence: Confidence;
  note?: string | null;
  createdAt: string;
}

export interface Outing {
  id: string;
  title: string;
  location: string;
  date: string;
  habitat: string;
  status: OutingStatus;
  notes?: string | null;
  sightings: Sighting[];
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalSightings: number;
  /** Preferred name on the current API. */
  speciesCount?: number;
  /** Older alias the dashboard sometimes reports instead. */
  totalSpecies?: number;
  completedOutings: number;
  upcomingOutings: number;
}

export interface SpeciesTally {
  name: string;
  count: number;
  lastSeen?: string | null;
}

export interface Activity {
  id?: string;
  text: string;
  timestamp: string;
  tone?: string;
}

export interface Dashboard {
  stats: DashboardStats;
  species: SpeciesTally[];
  recentActivity: Activity[];
}

export interface CreateOutingInput {
  title: string;
  location: string;
  date: string;
  habitat: string;
  notes?: string;
}

export interface UpdateOutingInput {
  status: OutingStatus;
  notes?: string;
}

export interface AddSightingInput {
  species: string;
  count: number;
  confidence: Confidence;
  note?: string;
}

export interface OutingListResponse {
  outings: Outing[];
}

export interface ActivityResponse {
  activity: Activity[];
}

export interface DeleteSightingResponse {
  ok: boolean;
}
