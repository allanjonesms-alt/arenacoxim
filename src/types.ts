export type Position = 'goleiro' | 'defensor' | 'atacante';

export interface PlayerStats {
  wins: number;
  goals: number;
  assists: number;
  matches: number;
  points: number; // Custom points calculation
}

export interface OverallStats {
  speed: number;
  stamina: number;
  strength: number;
  shooting: number;
  dribbling: number;
  passing: number;
}

export interface Player {
  id: string;
  name: string;
  nickname: string;
  position: Position;
  locationId: string; // Associated location
  photoUrl?: string;
  stats: PlayerStats;
  overallStats?: OverallStats;
}

export interface Match {
  id: string;
  date: string;
  time: string;
  locationId: string; // Associated location
  teamAId?: string; // Optional associated team entity
  teamBId?: string; // Optional associated team entity
  teamA: string[]; // Player IDs
  teamB: string[]; // Player IDs
  goalkeeperAId?: string;
  goalkeeperBId?: string;
  scoreA: number;
  scoreB: number;
  status: 'scheduled' | 'finished';
  mvpId?: string;
  events?: { playerId: string; type: 'goal' | 'assist' }[];
  createdAt: number;
}

export interface Admin {
  id: string;
  name: string;
  email: string;
  locationId: string; // Associated location
  role: string;
  createdAt: number;
}

export interface Team {
  id: string;
  name: string;
  locationId: string; // Associated location
  color: string;
  playerCount?: number; // Number of players for this team in a match
}

export interface Location {
  id: string;
  name: string;
  address?: string;
  playerCount?: number; // Players per team in a match (e.g., 5 for 5x5)
  gameDuration?: number; // Duration in minutes
}

export interface AdminData {
  role: 'master' | 'admin';
  locationId: string | null;
}

export interface ScoringRules {
  id: string;
  win: number;
  draw: number;
  goal: number;
  assist: number;
  cleanSheet: number;
  mvp: number;
  updatedAt: number;
}
